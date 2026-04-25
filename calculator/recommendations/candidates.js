import { buildFocusedZoneComparisonRows } from '../compare-utils.js';
import { recordRecommendationWork } from '../recommendation-work-distribution.js';
import { calculateCadencedTtkSeconds, calculateTtkSeconds } from '../summary.js';
import { getZoneDisplayedKillPath } from '../zone-damage.js';
import { getZoneRelationContext } from '../../enemies/data.js';
import { FAST_TTK_THRESHOLD_SECONDS } from '../combat-constants.js';
import {
  cloneDistanceInfo,
  compareBooleanDescending,
  compareRecommendationFit,
  compareNullableNumber,
  compareRecommendationMargins,
  getOutcomePriority,
  getRangeMeters,
  getRecommendationRangeStatus,
  normalizeText,
  normalizeRecommendationSortMode,
  RANGE_STATUS_ORDER,
  RECOMMENDATION_MARGIN_RATIO_THRESHOLD,
  RECOMMENDATION_NEAR_MISS_MAX_SHOTS,
  RECOMMENDATION_PERIPHERAL_MAIN_TOMAIN_THRESHOLD,
  toFiniteNumber
} from './shared.js';

function isZonePriorityRelationTarget(enemy, zone, zoneIndex = null) {
  if (!enemy || !zone) {
    return null;
  }

  const relationContext = getZoneRelationContext(
    enemy,
    Number.isInteger(zoneIndex) ? zoneIndex : zone
  );
  if (!relationContext?.priorityTargetZoneNames?.length) {
    return null;
  }

  const normalizedZoneName = normalizeText(zone?.zone_name);
  return relationContext.priorityTargetZoneNames.some((zoneName) => normalizeText(zoneName) === normalizedZoneName);
}

function isPeripheralMainRouteZone(enemy, zone, zoneIndex = null) {
  if (!enemy || !zone || zone?.IsFatal) {
    return false;
  }

  const normalizedZoneName = normalizeText(zone?.zone_name);
  if (!normalizedZoneName || normalizedZoneName === 'main') {
    return false;
  }

  const isPriorityRelationTarget = isZonePriorityRelationTarget(enemy, zone, zoneIndex);
  if (isPriorityRelationTarget !== null) {
    return !isPriorityRelationTarget;
  }

  const toMainPercent = toFiniteNumber(zone?.['ToMain%']) ?? 0;
  return toMainPercent > 0 && toMainPercent < RECOMMENDATION_PERIPHERAL_MAIN_TOMAIN_THRESHOLD;
}

function isPeripheralMainRouteCandidate({
  enemy,
  zone,
  zoneIndex,
  outcomeKind,
  zoneSummary
}) {
  const displayedKillPath = getZoneDisplayedKillPath(outcomeKind, zoneSummary?.killSummary);
  return displayedKillPath === 'main' && isPeripheralMainRouteZone(enemy, zone, zoneIndex);
}

function getDisplayedTargetHealth(zoneSummary, outcomeKind) {
  const displayedKillPath = getZoneDisplayedKillPath(outcomeKind, zoneSummary?.killSummary);
  if (!displayedKillPath) {
    return null;
  }

  if (displayedKillPath === 'main') {
    return toFiniteNumber(zoneSummary?.enemyMainHealth);
  }

  const zoneHealth = toFiniteNumber(zoneSummary?.zoneHealth);
  if (zoneHealth === null || zoneHealth < 0) {
    return null;
  }

  const zoneCon = toFiniteNumber(zoneSummary?.zoneCon) ?? 0;
  const usesCombinedHealth = zoneCon > 0
    && zoneSummary?.killSummary?.zoneShotsToKillWithCon !== null
    && zoneSummary?.killSummary?.zoneEffectiveShotsToKill === zoneSummary?.killSummary?.zoneShotsToKillWithCon;

  return usesCombinedHealth
    ? zoneHealth + zoneCon
    : zoneHealth;
}

function getDisplayedDamagePerCycle(zoneSummary, outcomeKind) {
  const displayedKillPath = getZoneDisplayedKillPath(outcomeKind, zoneSummary?.killSummary);
  if (displayedKillPath === 'main') {
    return toFiniteNumber(zoneSummary?.totalDamageToMainPerCycle);
  }

  if (displayedKillPath === 'zone') {
    return toFiniteNumber(zoneSummary?.totalDamagePerCycle);
  }

  return null;
}

function isCriticalRecommendation({
  outcomeKind,
  shotsToKill,
  rangeQualified
}) {
  return rangeQualified
    && outcomeKind === 'critical'
    && shotsToKill !== null
    && shotsToKill <= 2;
}

function getRecommendationCadenceModel(zoneSummary) {
  return zoneSummary?.killSummary?.cadenceModel || null;
}

function usesBeamRecommendationCadence(zoneSummary) {
  return zoneSummary?.killSummary?.usesBeamCadence === true
    || String(getRecommendationCadenceModel(zoneSummary)?.type || '').trim().toLowerCase() === 'beam';
}

function getRecommendationBeamTicksPerSecond(zoneSummary) {
  return toFiniteNumber(
    zoneSummary?.killSummary?.beamTicksPerSecond
      ?? getRecommendationCadenceModel(zoneSummary)?.beamTicksPerSecond
  );
}

function suppressRecommendationMargin(zoneSummary) {
  return usesBeamRecommendationCadence(zoneSummary);
}

function getRecommendationMarginInfo({
  zoneSummary,
  outcomeKind,
  shotsToKill
}) {
  if (suppressRecommendationMargin(zoneSummary)) {
    return null;
  }

  if (shotsToKill !== 1 || !['fatal', 'main', 'critical'].includes(outcomeKind)) {
    return null;
  }

  const targetHealth = getDisplayedTargetHealth(zoneSummary, outcomeKind);
  const damagePerCycle = getDisplayedDamagePerCycle(zoneSummary, outcomeKind);
  if (
    targetHealth === null
    || damagePerCycle === null
    || targetHealth <= 0
    || damagePerCycle < targetHealth
  ) {
    return null;
  }

  const ratio = (damagePerCycle - targetHealth) / targetHealth;
  return {
    ratio,
    percent: Math.max(0, Math.round(ratio * 100)),
    qualifies: ratio <= RECOMMENDATION_MARGIN_RATIO_THRESHOLD
  };
}

function getRecommendationDisplayMarginInfo({
  zoneSummary,
  outcomeKind,
  shotsToKill
}) {
  if (suppressRecommendationMargin(zoneSummary)) {
    return null;
  }

  if (
    shotsToKill === null
    || shotsToKill < 1
    || !['fatal', 'main', 'critical', 'doomed'].includes(outcomeKind)
  ) {
    return null;
  }

  const targetHealth = getDisplayedTargetHealth(zoneSummary, outcomeKind);
  const damagePerCycle = getDisplayedDamagePerCycle(zoneSummary, outcomeKind);
  if (
    targetHealth === null
    || damagePerCycle === null
    || targetHealth <= 0
    || damagePerCycle <= 0
  ) {
    return null;
  }

  const requiredDamagePerCycle = targetHealth / shotsToKill;
  if (requiredDamagePerCycle <= 0 || damagePerCycle < requiredDamagePerCycle) {
    return null;
  }

  const ratio = (damagePerCycle - requiredDamagePerCycle) / requiredDamagePerCycle;
  return {
    ratio,
    percent: Math.max(0, Math.round(ratio * 100))
  };
}

function getRecommendationNearMissInfo({
  zoneSummary,
  outcomeKind,
  shotsToKill
}) {
  if (suppressRecommendationMargin(zoneSummary)) {
    return null;
  }

  if (
    shotsToKill === null
    || shotsToKill < 2
    || shotsToKill > RECOMMENDATION_NEAR_MISS_MAX_SHOTS
    || !['fatal', 'main', 'critical', 'doomed'].includes(outcomeKind)
  ) {
    return null;
  }

  const targetHealth = getDisplayedTargetHealth(zoneSummary, outcomeKind);
  const damagePerCycle = getDisplayedDamagePerCycle(zoneSummary, outcomeKind);
  if (
    targetHealth === null
    || damagePerCycle === null
    || targetHealth <= 0
    || damagePerCycle <= 0
  ) {
    return null;
  }

  const remainingHealthBeforeFinalShot = targetHealth - (damagePerCycle * (shotsToKill - 1));
  if (
    remainingHealthBeforeFinalShot <= 0
    || remainingHealthBeforeFinalShot >= (damagePerCycle * 0.5)
  ) {
    return null;
  }

  const ratio = (damagePerCycle - remainingHealthBeforeFinalShot) / damagePerCycle;
  return {
    ratio,
    percent: Math.max(0, Math.round(ratio * 100))
  };
}

function buildZoneRecommendationCandidate({
  enemy,
  zone,
  zoneIndex,
  slotMetrics,
  rangeFloorMeters,
  selectedZoneIndex = null
}) {
  if (!slotMetrics?.damagesZone || slotMetrics.shotsToKill === null) {
    return null;
  }

  const rangeStatus = getRecommendationRangeStatus(slotMetrics.effectiveDistance, rangeFloorMeters);
  const rangeQualified = rangeStatus === 'qualified';
  const lethalOutcome = slotMetrics.outcomeKind === 'fatal' || slotMetrics.outcomeKind === 'main';
  const decisiveOutcome = lethalOutcome || slotMetrics.outcomeKind === 'doomed';
  const criticalOutcome = slotMetrics.outcomeKind === 'critical';
  const qualifiesForFastTtk = decisiveOutcome || criticalOutcome;
  const cadenceModel = getRecommendationCadenceModel(slotMetrics.zoneSummary);
  const usesBeamCadence = usesBeamRecommendationCadence(slotMetrics.zoneSummary);
  const beamTicksPerSecond = getRecommendationBeamTicksPerSecond(slotMetrics.zoneSummary);
  const suppressesMargin = suppressRecommendationMargin(slotMetrics.zoneSummary);
  const criticalRecommendation = isCriticalRecommendation({
    outcomeKind: slotMetrics.outcomeKind,
    shotsToKill: slotMetrics.shotsToKill,
    rangeQualified
  });
  const marginInfo = getRecommendationMarginInfo({
    zoneSummary: slotMetrics.zoneSummary,
    outcomeKind: slotMetrics.outcomeKind,
    shotsToKill: slotMetrics.shotsToKill
  });
  const displayMarginInfo = getRecommendationDisplayMarginInfo({
    zoneSummary: slotMetrics.zoneSummary,
    outcomeKind: slotMetrics.outcomeKind,
    shotsToKill: slotMetrics.shotsToKill
  });
  const nearMissInfo = getRecommendationNearMissInfo({
    zoneSummary: slotMetrics.zoneSummary,
    outcomeKind: slotMetrics.outcomeKind,
    shotsToKill: slotMetrics.shotsToKill
  });

  const candidate = {
    zone,
    zoneIndex,
    outcomeKind: slotMetrics.outcomeKind,
    shotsToKill: slotMetrics.shotsToKill,
    ttkSeconds: slotMetrics.ttkSeconds,
    cadenceModel,
    usesBeamCadence,
    beamTicksPerSecond,
    suppressesMargin,
    effectiveDistance: slotMetrics.effectiveDistance,
    rangeStatus,
    rangeQualified,
    criticalInfo: slotMetrics.criticalInfo || null,
    zoneSummary: slotMetrics.zoneSummary,
    label: zone?.zone_name || '',
    matchedZoneNames: [zone?.zone_name || ''].filter(Boolean),
    targetsSelectedZone: Number.isInteger(selectedZoneIndex) && zoneIndex === selectedZoneIndex,
    selectedZoneMatch: Number.isInteger(selectedZoneIndex) && zoneIndex === selectedZoneIndex,
    isSequenceCandidate: false,
    isPeripheralMainRoute: isPeripheralMainRouteCandidate({
      enemy,
      zone,
      zoneIndex,
      outcomeKind: slotMetrics.outcomeKind,
      zoneSummary: slotMetrics.zoneSummary
    }),
    marginRatio: marginInfo?.ratio ?? null,
    marginPercent: marginInfo?.percent ?? null,
    qualifiesForMargin: Boolean(rangeQualified && marginInfo?.qualifies),
    displayMarginRatio: displayMarginInfo?.ratio ?? null,
    displayMarginPercent: displayMarginInfo?.percent ?? null,
    nearMissRatio: nearMissInfo?.ratio ?? null,
    nearMissPercent: nearMissInfo?.percent ?? null,
    qualifiesForNearMiss: Boolean(rangeQualified && nearMissInfo),
    isOneShotKill: rangeQualified && lethalOutcome && slotMetrics.shotsToKill === 1,
    isOneShotCritical: rangeQualified && criticalOutcome && slotMetrics.shotsToKill === 1,
    isTwoShotCritical: rangeQualified && criticalOutcome && slotMetrics.shotsToKill <= 2,
    hasCriticalRecommendation: criticalRecommendation,
    hasFastTtk: qualifiesForFastTtk && rangeQualified && slotMetrics.ttkSeconds !== null && slotMetrics.ttkSeconds < FAST_TTK_THRESHOLD_SECONDS
  };
  return candidate;
}

function normalizeRecommendationSequence(sequence) {
  const targetZoneName = String(
    sequence?.targetZoneName
    || sequence?.targetZone
    || sequence?.target_zone
    || ''
  ).trim();
  const steps = (Array.isArray(sequence?.steps) ? sequence.steps : [])
    .map((step) => {
      const zoneName = String(step?.zoneName || step?.zone || step?.zone_name || '').trim();
      return zoneName ? { zoneName } : null;
    })
    .filter(Boolean);
  if (!targetZoneName || steps.length === 0) {
    return null;
  }

  return {
    targetZoneName,
    label: String(sequence?.label || '').trim() || targetZoneName,
    steps,
    suppressDirectTarget: sequence?.suppressDirectTarget === true || sequence?.suppress_direct_target === true
  };
}

function buildSequenceDistanceInfo(stepCandidates = []) {
  const availableSteps = stepCandidates.filter((candidate) => candidate?.effectiveDistance?.isAvailable);
  if (availableSteps.length === 0) {
    return cloneDistanceInfo(stepCandidates[stepCandidates.length - 1]?.effectiveDistance);
  }

  const limitingMeters = Math.min(...availableSteps.map((candidate) => candidate.effectiveDistance.meters));
  const stepLines = stepCandidates.map((candidate, index) => {
    const stepLabel = candidate?.label || candidate?.zone?.zone_name || `Step ${index + 1}`;
    const rangeText = candidate?.effectiveDistance?.text || '?';
    return `${index + 1}. ${stepLabel}: ${rangeText}`;
  });

  return {
    ...availableSteps[0].effectiveDistance,
    meters: limitingMeters,
    sortValue: limitingMeters,
    text: availableSteps.find((candidate) => candidate.effectiveDistance.meters === limitingMeters)?.effectiveDistance?.text
      || availableSteps[0].effectiveDistance.text,
    title: `Staged recommendation path.\n${stepLines.join('\n')}`,
    isAvailable: true
  };
}

function buildSequenceRecommendationCandidate({
  sequence,
  directCandidates,
  weapon,
  selectedZoneIndex = null
}) {
  const normalizedSequence = normalizeRecommendationSequence(sequence);
  if (!normalizedSequence) {
    return null;
  }

  const stepCandidates = normalizedSequence.steps.map((step) => {
    const normalizedZoneName = normalizeText(step.zoneName);
    return directCandidates.find((candidate) => normalizeText(candidate?.zone?.zone_name) === normalizedZoneName) || null;
  });
  if (stepCandidates.some((candidate) => !candidate)) {
    return null;
  }

  const finalCandidate = stepCandidates[stepCandidates.length - 1];
  const shotsToKill = stepCandidates.reduce((sum, candidate) => sum + (candidate?.shotsToKill || 0), 0);
  const cadenceModel = finalCandidate?.cadenceModel ?? getRecommendationCadenceModel(finalCandidate?.zoneSummary);
  const usesBeamCadence = Boolean(finalCandidate?.usesBeamCadence);
  const beamTicksPerSecond = finalCandidate?.beamTicksPerSecond ?? getRecommendationBeamTicksPerSecond(finalCandidate?.zoneSummary);
  const ttkSeconds = usesBeamCadence
    ? calculateCadencedTtkSeconds(shotsToKill, cadenceModel)
    : calculateTtkSeconds(shotsToKill, toFiniteNumber(weapon?.rpm));
  const rangeStatus = stepCandidates.some((candidate) => candidate.rangeStatus === 'failed')
    ? 'failed'
    : (stepCandidates.every((candidate) => candidate.rangeStatus === 'qualified') ? 'qualified' : 'unknown');
  const rangeQualified = rangeStatus === 'qualified';
  const outcomeKind = finalCandidate.outcomeKind;
  const lethalOutcome = outcomeKind === 'fatal' || outcomeKind === 'main';
  const decisiveOutcome = lethalOutcome || outcomeKind === 'doomed';
  const criticalOutcome = outcomeKind === 'critical';
  const qualifiesForFastTtk = decisiveOutcome || criticalOutcome;
  const criticalRecommendation = isCriticalRecommendation({
    outcomeKind,
    shotsToKill,
    rangeQualified
  });

  return {
    ...finalCandidate,
    label: normalizedSequence.label,
    matchedZoneNames: normalizedSequence.steps.map((step) => step.zoneName),
    targetsSelectedZone: Number.isInteger(selectedZoneIndex)
      && finalCandidate.zoneIndex === selectedZoneIndex,
    selectedZoneMatch: Number.isInteger(selectedZoneIndex)
      && stepCandidates.some((candidate) => candidate.zoneIndex === selectedZoneIndex),
    isSequenceCandidate: true,
    isPeripheralMainRoute: false,
    sequence: normalizedSequence,
    sequenceSteps: stepCandidates,
    shotsToKill,
    ttkSeconds,
    cadenceModel,
    usesBeamCadence,
    beamTicksPerSecond,
    suppressesMargin: usesBeamCadence,
    effectiveDistance: buildSequenceDistanceInfo(stepCandidates),
    rangeStatus,
    rangeQualified,
    marginRatio: null,
    marginPercent: null,
    qualifiesForMargin: false,
    displayMarginRatio: null,
    displayMarginPercent: null,
    nearMissRatio: null,
    nearMissPercent: null,
    qualifiesForNearMiss: false,
    isOneShotKill: rangeQualified && lethalOutcome && shotsToKill === 1,
    isOneShotCritical: rangeQualified && criticalOutcome && shotsToKill === 1,
    isTwoShotCritical: rangeQualified && criticalOutcome && shotsToKill <= 2,
    hasCriticalRecommendation: criticalRecommendation,
    hasFastTtk: qualifiesForFastTtk && rangeQualified && ttkSeconds !== null && ttkSeconds < FAST_TTK_THRESHOLD_SECONDS
  };
}

function getSuppressedDirectTargetNames(enemy) {
  return new Set(
    (Array.isArray(enemy?.recommendationSequences) ? enemy.recommendationSequences : [])
      .map(normalizeRecommendationSequence)
      .filter((sequence) => sequence?.suppressDirectTarget)
      .map((sequence) => normalizeText(sequence.targetZoneName))
      .filter(Boolean)
  );
}

export function buildRecommendationCandidates({
  enemy,
  weapon,
  attackRows = [],
  hitCounts = [],
  attackRow,
  hitCount,
  engagementRangeMeters = 0,
  highlightRangeFloorMeters,
  selectedZoneIndex = null,
  sortMode = 'default',
  instrumentation = null,
  analysisStage = null
}) {
  const selectedAttacksA = Array.isArray(attackRows) && attackRows.length > 0
    ? attackRows.filter(Boolean)
    : [attackRow].filter(Boolean);
  if (selectedAttacksA.length === 0) {
    const emptyResult = {
      zoneRows: [],
      candidates: []
    };
    recordRecommendationWork(instrumentation, {
      stage: analysisStage,
      method: 'buildRecommendationCandidates',
      metrics: {
        zoneComparisonCalls: 0,
        zoneRowsProduced: 0,
        directCandidatesProduced: 0,
        sequenceCandidatesProduced: 0
      }
    });
    return emptyResult;
  }

  const normalizedHitCounts = selectedAttacksA.map((_, index) => {
    const value = hitCounts[index];
    if (Number.isFinite(value) && value > 0) {
      return value;
    }

    return index === 0 && Number.isFinite(hitCount) && hitCount > 0
      ? hitCount
      : 1;
  });

  const zoneRows = buildFocusedZoneComparisonRows({
    enemy,
    weaponA: weapon,
    selectedAttacksA,
    hitCountsA: normalizedHitCounts,
    distanceMetersA: engagementRangeMeters
  });
  const suppressedDirectTargetNames = getSuppressedDirectTargetNames(enemy);
  const allDirectCandidates = zoneRows
    .map(({ zone, zoneIndex, metrics }) => buildZoneRecommendationCandidate({
      enemy,
      zone,
      zoneIndex,
      slotMetrics: metrics?.bySlot?.A,
      rangeFloorMeters: highlightRangeFloorMeters,
      selectedZoneIndex
    }))
    .filter(Boolean);
  const directCandidates = allDirectCandidates
    .filter((candidate) => !suppressedDirectTargetNames.has(normalizeText(candidate.zone?.zone_name)));

  const sequenceCandidates = (Array.isArray(enemy?.recommendationSequences) ? enemy.recommendationSequences : [])
    .map((sequence) => buildSequenceRecommendationCandidate({
      sequence,
      directCandidates: allDirectCandidates,
      weapon,
      selectedZoneIndex
    }))
    .filter(Boolean);

  const result = {
    zoneRows,
    candidates: [...directCandidates, ...sequenceCandidates].sort((left, right) => compareZoneRecommendationCandidates(
      left,
      right,
      { sortMode }
    ))
  };
  recordRecommendationWork(instrumentation, {
    stage: analysisStage,
    method: 'buildRecommendationCandidates',
    metrics: {
      zoneComparisonCalls: 1,
      zoneRowsProduced: zoneRows.length,
      directCandidatesProduced: directCandidates.length,
      sequenceCandidatesProduced: sequenceCandidates.length
    }
  });
  return result;
}

export function isSelectedTargetBypassCandidate(candidate) {
  const zoneDamage = toFiniteNumber(candidate?.zoneSummary?.totalDamagePerCycle) ?? 0;
  const mainDamage = toFiniteNumber(candidate?.zoneSummary?.totalDamageToMainPerCycle) ?? 0;
  return candidate?.outcomeKind === 'main'
    && zoneDamage <= 0
    && mainDamage > 0;
}

export function compareZoneRecommendationCandidates(left, right, {
  sortMode = 'default'
} = {}) {
  const normalizedSortMode = normalizeRecommendationSortMode(sortMode);
  let comparison = compareBooleanDescending(left.selectedZoneMatch, right.selectedZoneMatch);
  if (comparison !== 0) {
    return comparison;
  }

  comparison = normalizedSortMode === 'strict-margin'
    ? compareRecommendationFit(left, right)
    : compareRecommendationMargins(left, right);
  if (comparison !== 0) {
    return comparison;
  }

  if (normalizedSortMode === 'strict-margin') {
    comparison = compareNullableNumber(left.shotsToKill, right.shotsToKill, 'asc');
    if (comparison !== 0) {
      return comparison;
    }
  }

  comparison = (RANGE_STATUS_ORDER[left.rangeStatus] ?? RANGE_STATUS_ORDER.failed)
    - (RANGE_STATUS_ORDER[right.rangeStatus] ?? RANGE_STATUS_ORDER.failed);
  if (comparison !== 0) {
    return comparison;
  }

  comparison = getOutcomePriority(left.outcomeKind) - getOutcomePriority(right.outcomeKind);
  if (comparison !== 0) {
    return comparison;
  }

  if (normalizedSortMode !== 'strict-margin') {
    comparison = compareNullableNumber(left.shotsToKill, right.shotsToKill, 'asc');
    if (comparison !== 0) {
      return comparison;
    }
  }

  comparison = compareNullableNumber(getRangeMeters(left.effectiveDistance), getRangeMeters(right.effectiveDistance), 'asc');
  if (comparison !== 0) {
    return comparison;
  }

  comparison = compareNullableNumber(left.ttkSeconds, right.ttkSeconds, 'asc');
  if (comparison !== 0) {
    return comparison;
  }

  comparison = compareBooleanDescending(left.hasCriticalRecommendation, right.hasCriticalRecommendation);
  if (comparison !== 0) {
    return comparison;
  }

  comparison = compareBooleanDescending(left.hasFastTtk, right.hasFastTtk);
  if (comparison !== 0) {
    return comparison;
  }

  return String(left.zone?.zone_name || '').localeCompare(String(right.zone?.zone_name || ''));
}
