import { buildFocusedZoneComparisonRows } from './compare-utils.js';
import { getZoneDisplayedKillPath } from './zone-damage.js';
import { compareWeaponOptionBaseOrder, getWeaponRowPreviewHitCount } from './weapon-dropdown.js';

export const DEFAULT_RECOMMENDATION_RANGE_METERS = 30;
export const LOW_OVERKILL_RATIO_THRESHOLD = 0.25;

const RANGE_STATUS_ORDER = {
  qualified: 0,
  unknown: 1,
  failed: 2
};

const OUTCOME_PRIORITY = {
  fatal: 0,
  main: 1,
  critical: 2,
  limb: 3,
  utility: 4,
  none: 5
};

function toFiniteNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function compareBooleanDescending(left, right) {
  return Number(Boolean(right)) - Number(Boolean(left));
}

function compareNullableNumber(left, right, direction = 'asc') {
  const leftMissing = left === null || left === undefined;
  const rightMissing = right === null || right === undefined;
  if (leftMissing && rightMissing) {
    return 0;
  }

  if (leftMissing) {
    return 1;
  }

  if (rightMissing) {
    return -1;
  }

  if (left === right) {
    return 0;
  }

  return direction === 'desc'
    ? (right - left)
    : (left - right);
}

function getOutcomePriority(outcomeKind) {
  return OUTCOME_PRIORITY[outcomeKind] ?? OUTCOME_PRIORITY.none;
}

function getRangeMeters(distanceInfo) {
  return distanceInfo?.isAvailable ? toFiniteNumber(distanceInfo.meters) : null;
}

export function normalizeRecommendationRangeMeters(value) {
  const numeric = toFiniteNumber(value);
  if (numeric === null) {
    return DEFAULT_RECOMMENDATION_RANGE_METERS;
  }

  return Math.max(0, Math.min(500, Math.round(numeric)));
}

export function getRecommendationRangeStatus(distanceInfo, rangeFloorMeters = DEFAULT_RECOMMENDATION_RANGE_METERS) {
  const normalizedRangeFloor = normalizeRecommendationRangeMeters(rangeFloorMeters);
  if (normalizedRangeFloor <= 0) {
    return 'qualified';
  }

  if (!distanceInfo?.isAvailable) {
    return 'unknown';
  }

  return distanceInfo.meters >= normalizedRangeFloor
    ? 'qualified'
    : 'failed';
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

export function isLowOverkillOhko({
  zoneSummary,
  outcomeKind,
  shotsToKill
}) {
  if (shotsToKill !== 1) {
    return false;
  }

  const targetHealth = getDisplayedTargetHealth(zoneSummary, outcomeKind);
  const damagePerCycle = getDisplayedDamagePerCycle(zoneSummary, outcomeKind);
  if (
    targetHealth === null
    || damagePerCycle === null
    || targetHealth <= 0
    || damagePerCycle < targetHealth
  ) {
    return false;
  }

  return ((damagePerCycle - targetHealth) / targetHealth) <= LOW_OVERKILL_RATIO_THRESHOLD;
}

function buildRecommendationTip(candidate) {
  if (candidate?.criticalInfo?.tip) {
    return candidate.criticalInfo.tip;
  }

  if (candidate?.outcomeKind === 'fatal' && /(?:head|face)/i.test(candidate.zone?.zone_name || '')) {
    return 'Head breakpoint.';
  }

  if (candidate?.outcomeKind === 'main') {
    return 'Main-routing breakpoint.';
  }

  if (candidate?.outcomeKind === 'utility') {
    return 'Part break only.';
  }

  return '';
}

function buildZoneRecommendationCandidate({
  zone,
  zoneIndex,
  slotMetrics,
  rangeFloorMeters
}) {
  if (!slotMetrics?.damagesZone || slotMetrics.shotsToKill === null) {
    return null;
  }

  const rangeStatus = getRecommendationRangeStatus(slotMetrics.effectiveDistance, rangeFloorMeters);
  const rangeQualified = rangeStatus === 'qualified';
  const lethalOutcome = slotMetrics.outcomeKind === 'fatal' || slotMetrics.outcomeKind === 'main';
  const criticalOutcome = slotMetrics.outcomeKind === 'critical';

  const candidate = {
    zone,
    zoneIndex,
    outcomeKind: slotMetrics.outcomeKind,
    shotsToKill: slotMetrics.shotsToKill,
    ttkSeconds: slotMetrics.ttkSeconds,
    effectiveDistance: slotMetrics.effectiveDistance,
    rangeStatus,
    rangeQualified,
    criticalInfo: slotMetrics.criticalInfo || null,
    zoneSummary: slotMetrics.zoneSummary,
    isOneShotKill: rangeQualified && lethalOutcome && slotMetrics.shotsToKill === 1,
    isOneShotCritical: rangeQualified && criticalOutcome && slotMetrics.shotsToKill === 1,
    isTwoShotCritical: rangeQualified && criticalOutcome && slotMetrics.shotsToKill <= 2,
    hasFastTtk: rangeQualified && slotMetrics.ttkSeconds !== null && slotMetrics.ttkSeconds < 0.6,
    hasLowOverkillOhko: rangeQualified && ['fatal', 'main', 'critical'].includes(slotMetrics.outcomeKind) && isLowOverkillOhko({
      zoneSummary: slotMetrics.zoneSummary,
      outcomeKind: slotMetrics.outcomeKind,
      shotsToKill: slotMetrics.shotsToKill
    })
  };

  candidate.tip = buildRecommendationTip(candidate);
  return candidate;
}

function compareZoneRecommendationCandidates(left, right) {
  let comparison = compareBooleanDescending(left.isOneShotKill, right.isOneShotKill);
  if (comparison !== 0) {
    return comparison;
  }

  comparison = compareBooleanDescending(left.hasLowOverkillOhko, right.hasLowOverkillOhko);
  if (comparison !== 0) {
    return comparison;
  }

  comparison = compareBooleanDescending(left.isOneShotCritical, right.isOneShotCritical);
  if (comparison !== 0) {
    return comparison;
  }

  comparison = compareBooleanDescending(left.isTwoShotCritical, right.isTwoShotCritical);
  if (comparison !== 0) {
    return comparison;
  }

  comparison = compareBooleanDescending(left.hasFastTtk, right.hasFastTtk);
  if (comparison !== 0) {
    return comparison;
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

  comparison = compareNullableNumber(left.shotsToKill, right.shotsToKill, 'asc');
  if (comparison !== 0) {
    return comparison;
  }

  comparison = compareNullableNumber(left.ttkSeconds, right.ttkSeconds, 'asc');
  if (comparison !== 0) {
    return comparison;
  }

  comparison = compareNullableNumber(getRangeMeters(left.effectiveDistance), getRangeMeters(right.effectiveDistance), 'desc');
  if (comparison !== 0) {
    return comparison;
  }

  return String(left.zone?.zone_name || '').localeCompare(String(right.zone?.zone_name || ''));
}

function buildAttackRowRecommendation({
  enemy,
  weapon,
  attackRow,
  hitCount,
  rangeFloorMeters
}) {
  const zoneRows = buildFocusedZoneComparisonRows({
    enemy,
    weaponA: weapon,
    selectedAttacksA: [attackRow],
    hitCountsA: [hitCount]
  });
  const candidates = zoneRows
    .map(({ zone, zoneIndex, metrics }) => buildZoneRecommendationCandidate({
      zone,
      zoneIndex,
      slotMetrics: metrics?.bySlot?.A,
      rangeFloorMeters
    }))
    .filter(Boolean)
    .sort(compareZoneRecommendationCandidates);

  if (candidates.length === 0) {
    return null;
  }

  return {
    attackRow,
    hitCount,
    bestCandidate: candidates[0],
    candidates,
    penetratesAll: zoneRows.length > 0 && zoneRows.every((row) => row?.metrics?.bySlot?.A?.damagesZone),
    hasOneShotKill: candidates.some((candidate) => candidate.isOneShotKill),
    hasOneShotCritical: candidates.some((candidate) => candidate.isOneShotCritical),
    hasTwoShotCritical: candidates.some((candidate) => candidate.isTwoShotCritical),
    hasFastTtk: candidates.some((candidate) => candidate.hasFastTtk),
    hasLowOverkillOhko: candidates.some((candidate) => candidate.hasLowOverkillOhko),
    hasQualifiedPath: candidates.some((candidate) => candidate.rangeStatus === 'qualified')
  };
}

function compareAttackRowRecommendations(left, right) {
  let comparison = compareBooleanDescending(left.hasOneShotKill, right.hasOneShotKill);
  if (comparison !== 0) {
    return comparison;
  }

  comparison = compareBooleanDescending(left.hasLowOverkillOhko, right.hasLowOverkillOhko);
  if (comparison !== 0) {
    return comparison;
  }

  comparison = compareBooleanDescending(left.hasOneShotCritical, right.hasOneShotCritical);
  if (comparison !== 0) {
    return comparison;
  }

  comparison = compareBooleanDescending(left.hasTwoShotCritical, right.hasTwoShotCritical);
  if (comparison !== 0) {
    return comparison;
  }

  comparison = compareBooleanDescending(left.hasFastTtk, right.hasFastTtk);
  if (comparison !== 0) {
    return comparison;
  }

  comparison = compareBooleanDescending(left.hasQualifiedPath, right.hasQualifiedPath);
  if (comparison !== 0) {
    return comparison;
  }

  comparison = compareBooleanDescending(left.penetratesAll, right.penetratesAll);
  if (comparison !== 0) {
    return comparison;
  }

  return compareZoneRecommendationCandidates(left.bestCandidate, right.bestCandidate);
}

function compareWeaponRecommendationRows(left, right) {
  let comparison = compareBooleanDescending(left.hasOneShotKill, right.hasOneShotKill);
  if (comparison !== 0) {
    return comparison;
  }

  comparison = compareBooleanDescending(left.hasLowOverkillOhko, right.hasLowOverkillOhko);
  if (comparison !== 0) {
    return comparison;
  }

  comparison = compareBooleanDescending(left.hasOneShotCritical, right.hasOneShotCritical);
  if (comparison !== 0) {
    return comparison;
  }

  comparison = compareBooleanDescending(left.hasTwoShotCritical, right.hasTwoShotCritical);
  if (comparison !== 0) {
    return comparison;
  }

  comparison = compareBooleanDescending(left.hasFastTtk, right.hasFastTtk);
  if (comparison !== 0) {
    return comparison;
  }

  comparison = compareBooleanDescending(left.penetratesAll, right.penetratesAll);
  if (comparison !== 0) {
    return comparison;
  }

  comparison = compareAttackRowRecommendations(left.bestAttackRecommendation, right.bestAttackRecommendation);
  if (comparison !== 0) {
    return comparison;
  }

  return compareWeaponOptionBaseOrder(left.weapon, right.weapon);
}

export function buildWeaponRecommendationRows({
  enemy,
  weapons = [],
  rangeFloorMeters = DEFAULT_RECOMMENDATION_RANGE_METERS
}) {
  if (!enemy?.zones || enemy.zones.length === 0 || !Array.isArray(weapons)) {
    return [];
  }

  const normalizedRangeFloor = normalizeRecommendationRangeMeters(rangeFloorMeters);
  return weapons
    .map((weapon) => {
      const attackRecommendations = (weapon?.rows || [])
        .map((attackRow) => buildAttackRowRecommendation({
          enemy,
          weapon,
          attackRow,
          hitCount: getWeaponRowPreviewHitCount(attackRow),
          rangeFloorMeters: normalizedRangeFloor
        }))
        .filter(Boolean)
        .sort(compareAttackRowRecommendations);

      if (attackRecommendations.length === 0) {
        return null;
      }

      const bestAttackRecommendation = attackRecommendations[0];
      const bestCandidate = bestAttackRecommendation.bestCandidate;
      return {
        weapon,
        attackRow: bestAttackRecommendation.attackRow,
        attackName: bestAttackRecommendation.attackRow?.['Atk Name'] || bestAttackRecommendation.attackRow?.Name || 'Attack',
        hitCount: bestAttackRecommendation.hitCount,
        bestZone: bestCandidate.zone,
        bestZoneName: bestCandidate.zone?.zone_name || '',
        bestOutcomeKind: bestCandidate.outcomeKind,
        shotsToKill: bestCandidate.shotsToKill,
        ttkSeconds: bestCandidate.ttkSeconds,
        effectiveDistance: bestCandidate.effectiveDistance,
        rangeStatus: bestCandidate.rangeStatus,
        hasOneShotKill: bestAttackRecommendation.hasOneShotKill,
        hasOneShotCritical: bestAttackRecommendation.hasOneShotCritical,
        hasTwoShotCritical: bestAttackRecommendation.hasTwoShotCritical,
        hasFastTtk: bestAttackRecommendation.hasFastTtk,
        hasLowOverkillOhko: bestAttackRecommendation.hasLowOverkillOhko,
        penetratesAll: bestAttackRecommendation.penetratesAll,
        tip: bestCandidate.tip,
        bestAttackRecommendation,
        attackRecommendations
      };
    })
    .filter(Boolean)
    .sort(compareWeaponRecommendationRows);
}
