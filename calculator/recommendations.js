import { buildFocusedZoneComparisonRows, getAttackRowKey } from './compare-utils.js';
import { isExplosiveAttack } from './attack-types.js';
import { getZoneDisplayedKillPath } from './zone-damage.js';
import { getZoneRelationContext } from '../enemies/data.js';
import {
  compareWeaponOptionBaseOrder,
  getWeaponRowMeaningfulDamage,
  getWeaponRowMultiplicity
} from './weapon-dropdown.js';
import { calculateTtkSeconds } from './summary.js';

export const DEFAULT_RECOMMENDATION_RANGE_METERS = 30;
export const RECOMMENDATION_MARGIN_RATIO_THRESHOLD = 0.25;
export const RECOMMENDATION_SHOTGUN_HIT_SHARE = 0.4;
export const RECOMMENDATION_MAX_SHOTGUN_HITS = 6;
export const RECOMMENDATION_FRAGMENT_HIT_CAP = 3;
export const RECOMMENDATION_IMPLICIT_REPEAT_HITS = 2;
export const RECOMMENDATION_NEAR_MISS_MAX_SHOTS = 3;
const RECOMMENDATION_PERIPHERAL_MAIN_TOMAIN_THRESHOLD = 0.5;

const RANGE_STATUS_ORDER = {
  qualified: 0,
  unknown: 1,
  failed: 2
};

const OUTCOME_PRIORITY = {
  fatal: 0,
  doomed: 1,
  main: 2,
  critical: 3,
  limb: 4,
  utility: 5,
  none: 6
};

const RECOMMENDATION_IMPLICIT_REPEAT_RULES = [
  {
    id: 'eagle-bombing-run',
    weaponPattern: /^eagle (?:airstrike|napalm airstrike)$/i,
    attackPattern: /bomb/i,
    hitCount: RECOMMENDATION_IMPLICIT_REPEAT_HITS
  }
];

const RECOMMENDATION_PACKAGE_FAMILY_LABELS = {
  projectile: 'Proj',
  explosion: 'Blast',
  spray: 'Spray',
  beam: 'Beam',
  arc: 'Arc',
  flame: 'Flame',
  gas: 'Gas',
  melee: 'Melee'
};

const RECOMMENDATION_PACKAGE_SUFFIX_PATTERNS = [
  /(?:[_\s]+)P(?:[_\s]+)IE$/i,
  /(?:[_\s]+)IE$/i,
  /(?:[_\s]+)?EImpact$/i,
  /(?:[_\s]+)Impact$/i,
  /(?:[_\s]+)SPRAY$/i,
  /(?:[_\s]+)BEAM$/i,
  /(?:[_\s]+)ARC$/i,
  /(?:[_\s]+)P$/i,
  /(?:[_\s]+)E$/i,
  /(?:[_\s]+)S$/i,
  /(?:[_\s]+)B$/i
];

function toFiniteNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizeText(value) {
  return String(value ?? '').trim().toLowerCase();
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

function compareRecommendationMargins(left, right) {
  let comparison = compareBooleanDescending(left?.qualifiesForMargin, right?.qualifiesForMargin);
  if (comparison !== 0) {
    return comparison;
  }

  return compareNullableNumber(left?.marginRatio, right?.marginRatio, 'asc');
}

function getOutcomePriority(outcomeKind) {
  return OUTCOME_PRIORITY[outcomeKind] ?? OUTCOME_PRIORITY.none;
}

function getRangeMeters(distanceInfo) {
  return distanceInfo?.isAvailable ? toFiniteNumber(distanceInfo.meters) : null;
}

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

function cloneDistanceInfo(distanceInfo) {
  return distanceInfo ? { ...distanceInfo } : null;
}

function getRecommendationAttackName(attackRow) {
  return String(attackRow?.['Atk Name'] || attackRow?.Name || '').trim();
}

function getRecommendationAttackTypeText(attackRow) {
  return String(attackRow?.['Atk Type'] ?? attackRow?.Stage ?? '').trim().toLowerCase();
}

function stripRecommendationPackageSuffix(attackName) {
  let strippedName = String(attackName || '').trim()
    .replace(/\s*\((?:volley|total)\s+x\d+\)\s*$/i, '')
    .replace(/\s+x\d+\s*$/i, '')
    .trim();

  for (const pattern of RECOMMENDATION_PACKAGE_SUFFIX_PATTERNS) {
    const nextName = strippedName.replace(pattern, '').replace(/[_\s]+$/, '').trim();
    if (nextName && nextName !== strippedName) {
      strippedName = nextName;
      break;
    }
  }

  return strippedName;
}

function getRecommendationAttackEventLabel(attackRow) {
  const attackName = getRecommendationAttackName(attackRow);
  if (!attackName) {
    return '';
  }

  return stripRecommendationPackageSuffix(attackName) || attackName;
}

function getRecommendationAttackEventKey(attackRow) {
  const eventLabel = getRecommendationAttackEventLabel(attackRow);
  return eventLabel
    ? normalizeText(eventLabel).replace(/[_\s]+/g, ' ')
    : '';
}

function getRecommendationAttackFamily(attackRow) {
  const attackType = getRecommendationAttackTypeText(attackRow);
  if (isExplosiveAttack(attackRow)) {
    return 'explosion';
  }

  if (attackType.includes('spray')) {
    return 'spray';
  }

  if (attackType.includes('beam')) {
    return 'beam';
  }

  if (attackType.includes('arc')) {
    return 'arc';
  }

  if (attackType.includes('flame') || attackType.includes('fire')) {
    return 'flame';
  }

  if (attackType.includes('gas')) {
    return 'gas';
  }

  if (attackType.includes('melee')) {
    return 'melee';
  }

  return 'projectile';
}

function isBundledRecommendationAttack(attackName) {
  return /\((?:volley|total)\s+x\d+\)/i.test(attackName);
}

function isShotgunRecommendationAttack({
  weapon,
  attackName,
  multiplicity
}) {
  if (multiplicity <= 1) {
    return false;
  }

  const weaponSub = normalizeText(weapon?.sub);
  const weaponCode = normalizeText(weapon?.code);
  const weaponName = normalizeText(weapon?.name);
  return weaponSub === 'sg'
    || weaponCode.startsWith('sg-')
    || weaponName.includes('shotgun')
    || /\b(?:buckshot|birdshot|flechettes?|stun rounds|trident|liberty fire)\b/i.test(attackName);
}

function isFragmentRecommendationAttack({
  attackRow,
  attackName,
  multiplicity
}) {
  if (multiplicity <= 1) {
    return false;
  }

  return isExplosiveAttack(attackRow)
    || /\b(?:shrapnel|cluster bomb|flak rounds)\b/i.test(attackName);
}

function isConservativeRecommendationPackageExcludedAttack({
  attackRow,
  attackName,
  multiplicity
}) {
  return isFragmentRecommendationAttack({
    attackRow,
    attackName,
    multiplicity
  }) || /\bfragments?\b/i.test(attackName);
}

function getImplicitRecommendationRepeatHits({
  weapon,
  attackName
}) {
  return RECOMMENDATION_IMPLICIT_REPEAT_RULES.find((rule) => (
    rule.weaponPattern.test(weapon?.name || '')
    && (!rule.attackPattern || rule.attackPattern.test(attackName))
  ))?.hitCount || 1;
}

// Recommendation rows intentionally model a plausible subset of simultaneous impacts rather than
// assuming every pellet or bomblet lands. Explicit "(Volley xN)" / "(Total xN)" rows are already
// pre-bundled in the sheet and stay at one firing cycle.
export function getRecommendationAttackHitCount({
  weapon,
  attackRow
}) {
  const attackName = getRecommendationAttackName(attackRow);
  if (!attackName) {
    return 1;
  }

  if (isBundledRecommendationAttack(attackName)) {
    return 1;
  }

  const multiplicity = getWeaponRowMultiplicity(attackRow);
  let hitCount = 1;

  if (isShotgunRecommendationAttack({
    weapon,
    attackName,
    multiplicity
  })) {
    hitCount = Math.min(
      RECOMMENDATION_MAX_SHOTGUN_HITS,
      Math.max(2, Math.ceil(multiplicity * RECOMMENDATION_SHOTGUN_HIT_SHARE))
    );
  } else if (isFragmentRecommendationAttack({
    attackRow,
    attackName,
    multiplicity
  })) {
    hitCount = Math.min(RECOMMENDATION_FRAGMENT_HIT_CAP, multiplicity);
  }

  return Math.max(
    hitCount,
    getImplicitRecommendationRepeatHits({
      weapon,
      attackName
    })
  );
}

function buildRecommendationAttackDescriptor({
  weapon,
  attackRow,
  rowIndex
}) {
  const attackName = getRecommendationAttackName(attackRow);
  if (!attackName) {
    return null;
  }

  const multiplicity = getWeaponRowMultiplicity(attackRow);
  const family = getRecommendationAttackFamily(attackRow);
  const isBundled = isBundledRecommendationAttack(attackName);
  const conservativeExcluded = isConservativeRecommendationPackageExcludedAttack({
    attackRow,
    attackName,
    multiplicity
  });

  return {
    attackRow,
    attackKey: getAttackRowKey(attackRow),
    attackName,
    hitCount: getRecommendationAttackHitCount({
      weapon,
      attackRow
    }),
    family,
    familyLabel: RECOMMENDATION_PACKAGE_FAMILY_LABELS[family] || family,
    eventLabel: getRecommendationAttackEventLabel(attackRow),
    eventKey: getRecommendationAttackEventKey(attackRow),
    meaningfulDamage: getWeaponRowMeaningfulDamage(attackRow),
    apValue: toFiniteNumber(attackRow?.AP) ?? Number.NEGATIVE_INFINITY,
    rowIndex,
    conservativeExcluded,
    autoCombineEligible: !isBundled && !conservativeExcluded
  };
}

function compareRecommendationPackageComponentPreference(left, right) {
  let comparison = compareNullableNumber(right?.meaningfulDamage ?? null, left?.meaningfulDamage ?? null, 'asc');
  if (comparison !== 0) {
    return comparison;
  }

  comparison = compareNullableNumber(right?.apValue ?? null, left?.apValue ?? null, 'asc');
  if (comparison !== 0) {
    return comparison;
  }

  comparison = compareNullableNumber(right?.hitCount ?? null, left?.hitCount ?? null, 'asc');
  if (comparison !== 0) {
    return comparison;
  }

  return String(left?.attackName || '').localeCompare(String(right?.attackName || ''));
}

function getRecommendationPackageDedupKey(descriptors = []) {
  return descriptors
    .map((descriptor) => String(descriptor?.attackKey || ''))
    .filter(Boolean)
    .sort()
    .join('||');
}

function buildRecommendationPackageLabel(descriptors = []) {
  const components = descriptors.filter(Boolean);
  if (components.length === 0) {
    return 'Attack';
  }

  if (components.length === 1) {
    return components[0].attackName;
  }

  const eventLabels = [...new Set(components.map((descriptor) => descriptor.eventLabel).filter(Boolean))];
  if (eventLabels.length === 1) {
    const familyLabels = [...new Set(components.map((descriptor) => descriptor.familyLabel || descriptor.family).filter(Boolean))];
    return `${eventLabels[0]} [${familyLabels.join(' + ')}]`;
  }

  return components.map((descriptor) => descriptor.attackName).join(' + ');
}

function buildRecommendationAttackPackage(descriptors = [], {
  excludedAttackNames = []
} = {}) {
  const orderedDescriptors = descriptors
    .filter(Boolean)
    .slice()
    .sort((left, right) => (left?.rowIndex ?? 0) - (right?.rowIndex ?? 0));
  const packageComponents = orderedDescriptors.map((descriptor) => ({
    attackRow: descriptor.attackRow,
    attackKey: descriptor.attackKey,
    attackName: descriptor.attackName,
    hitCount: descriptor.hitCount,
    family: descriptor.family
  }));

  return {
    attackRow: orderedDescriptors[0]?.attackRow || null,
    attackRows: orderedDescriptors.map((descriptor) => descriptor.attackRow),
    attackName: buildRecommendationPackageLabel(orderedDescriptors),
    hitCount: orderedDescriptors[0]?.hitCount ?? 1,
    hitCounts: orderedDescriptors.map((descriptor) => descriptor.hitCount),
    packageComponents,
    excludedAttackNames: [...new Set((Array.isArray(excludedAttackNames) ? excludedAttackNames : []).filter(Boolean))],
    isCombinedPackage: orderedDescriptors.length > 1
  };
}

function isStratagemRecommendationWeapon(weapon) {
  return normalizeText(weapon?.type) === 'stratagem';
}

function buildRecommendationAttackPackages(weapon, {
  includeCombinedPackages = false
} = {}) {
  const descriptors = (Array.isArray(weapon?.rows) ? weapon.rows : [])
    .map((attackRow, rowIndex) => buildRecommendationAttackDescriptor({
      weapon,
      attackRow,
      rowIndex
    }))
    .filter(Boolean);
  const packages = descriptors.map((descriptor) => buildRecommendationAttackPackage([descriptor]));

  if (!includeCombinedPackages) {
    return packages;
  }

  const seenPackageKeys = new Set(
    packages.map((attackPackage) => getRecommendationPackageDedupKey(attackPackage.packageComponents))
  );
  const groupedDescriptors = descriptors.reduce((groups, descriptor) => {
    if (!descriptor.eventKey) {
      return groups;
    }

    if (!groups.has(descriptor.eventKey)) {
      groups.set(descriptor.eventKey, []);
    }

    groups.get(descriptor.eventKey).push(descriptor);
    return groups;
  }, new Map());

  groupedDescriptors.forEach((groupDescriptors) => {
    const eligibleDescriptors = groupDescriptors.filter((descriptor) => descriptor.autoCombineEligible);
    if (eligibleDescriptors.length < 2) {
      return;
    }

    const familyGroups = eligibleDescriptors.reduce((groups, descriptor) => {
      if (!groups.has(descriptor.family)) {
        groups.set(descriptor.family, []);
      }

      groups.get(descriptor.family).push(descriptor);
      return groups;
    }, new Map());
    if (familyGroups.size < 2) {
      return;
    }

    const excludedAttackNames = groupDescriptors
      .filter((descriptor) => descriptor.conservativeExcluded)
      .map((descriptor) => descriptor.attackName);

    eligibleDescriptors.forEach((seedDescriptor) => {
      const packageDescriptors = [seedDescriptor];

      familyGroups.forEach((familyDescriptors, family) => {
        if (family === seedDescriptor.family) {
          return;
        }

        const chosenDescriptor = familyDescriptors
          .slice()
          .sort(compareRecommendationPackageComponentPreference)[0];
        if (!chosenDescriptor || packageDescriptors.some((descriptor) => descriptor.attackKey === chosenDescriptor.attackKey)) {
          return;
        }

        packageDescriptors.push(chosenDescriptor);
      });

      if (packageDescriptors.length < 2) {
        return;
      }

      const packageKey = getRecommendationPackageDedupKey(packageDescriptors);
      if (seenPackageKeys.has(packageKey)) {
        return;
      }

      seenPackageKeys.add(packageKey);
      packages.push(buildRecommendationAttackPackage(packageDescriptors, {
        excludedAttackNames
      }));
    });
  });

  if (isStratagemRecommendationWeapon(weapon)) {
    const eventFamiliesByAttackKey = new Map();
    groupedDescriptors.forEach((groupDescriptors) => {
      const familySet = new Set(groupDescriptors.map((descriptor) => descriptor.family).filter(Boolean));
      groupDescriptors.forEach((descriptor) => {
        if (descriptor?.attackKey) {
          eventFamiliesByAttackKey.set(descriptor.attackKey, familySet);
        }
      });
    });

    return packages.filter((attackPackage) => {
      if (attackPackage?.isCombinedPackage) {
        return true;
      }

      if (!Array.isArray(attackPackage?.packageComponents) || attackPackage.packageComponents.length !== 1) {
        return true;
      }

      const onlyComponent = attackPackage.packageComponents[0];
      if (onlyComponent?.family !== 'projectile') {
        return true;
      }

      return !eventFamiliesByAttackKey.get(onlyComponent.attackKey)?.has('explosion');
    });
  }

  return packages;
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

function getRecommendationMarginInfo({
  zoneSummary,
  outcomeKind,
  shotsToKill
}) {
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

function getRecommendationNearMissInfo({
  zoneSummary,
  outcomeKind,
  shotsToKill
}) {
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
    nearMissRatio: nearMissInfo?.ratio ?? null,
    nearMissPercent: nearMissInfo?.percent ?? null,
    qualifiesForNearMiss: Boolean(rangeQualified && nearMissInfo),
    isOneShotKill: rangeQualified && lethalOutcome && slotMetrics.shotsToKill === 1,
    isOneShotCritical: rangeQualified && criticalOutcome && slotMetrics.shotsToKill === 1,
    isTwoShotCritical: rangeQualified && criticalOutcome && slotMetrics.shotsToKill <= 2,
    hasCriticalRecommendation: criticalRecommendation,
    hasFastTtk: qualifiesForFastTtk && rangeQualified && slotMetrics.ttkSeconds !== null && slotMetrics.ttkSeconds < 0.6
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
  const ttkSeconds = calculateTtkSeconds(shotsToKill, toFiniteNumber(weapon?.rpm));
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
    effectiveDistance: buildSequenceDistanceInfo(stepCandidates),
    rangeStatus,
    rangeQualified,
    marginRatio: null,
    marginPercent: null,
    qualifiesForMargin: false,
    nearMissRatio: null,
    nearMissPercent: null,
    qualifiesForNearMiss: false,
    isOneShotKill: rangeQualified && lethalOutcome && shotsToKill === 1,
    isOneShotCritical: rangeQualified && criticalOutcome && shotsToKill === 1,
    isTwoShotCritical: rangeQualified && criticalOutcome && shotsToKill <= 2,
    hasCriticalRecommendation: criticalRecommendation,
    hasFastTtk: qualifiesForFastTtk && rangeQualified && ttkSeconds !== null && ttkSeconds < 0.6
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

// Selected-target filter: for multi-source delivery events (stratagems) that already
// have a combined or explosive-bearing recommendation, suppress the redundant
// pure-projectile recommendation for the same event. Run after collapse+sort so that
// the projectile-only package is preserved when it is genuinely the best path (i.e. the
// collapse already removed any equivalent combined package above it).
function applyStratagemPrecisionFilter(sortedAttackRecommendations) {
  const dominantEventKeys = new Set();
  sortedAttackRecommendations.forEach((recommendation) => {
    const eventKey = getRecommendationAttackEventKey(recommendation.attackRow);
    if (!eventKey) {
      return;
    }

    const hasExplosiveComponent = recommendation.isCombinedPackage
      || (Array.isArray(recommendation.attackRows) && recommendation.attackRows.some((row) => isExplosiveAttack(row)));
    if (hasExplosiveComponent) {
      dominantEventKeys.add(eventKey);
    }
  });

  if (dominantEventKeys.size === 0) {
    return sortedAttackRecommendations;
  }

  return sortedAttackRecommendations.filter((recommendation) => {
    const eventKey = getRecommendationAttackEventKey(recommendation.attackRow);
    if (!eventKey || !dominantEventKeys.has(eventKey)) {
      return true;
    }

    if (recommendation.isCombinedPackage) {
      return true;
    }

    const attackRows = Array.isArray(recommendation.attackRows) ? recommendation.attackRows : [];
    if (attackRows.some((row) => isExplosiveAttack(row))) {
      return true;
    }

    // Suppress if every attack row is pure projectile and a combined/explosive path exists.
    return !attackRows.every((row) => getRecommendationAttackFamily(row) === 'projectile');
  });
}

function buildRecommendationCandidates({
  enemy,
  weapon,
  attackRows = [],
  hitCounts = [],
  attackRow,
  hitCount,
  engagementRangeMeters = 0,
  highlightRangeFloorMeters,
  selectedZoneIndex = null
}) {
  const selectedAttacksA = Array.isArray(attackRows) && attackRows.length > 0
    ? attackRows.filter(Boolean)
    : [attackRow].filter(Boolean);
  if (selectedAttacksA.length === 0) {
    return {
      zoneRows: [],
      candidates: []
    };
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

  return {
    zoneRows,
    candidates: [...directCandidates, ...sequenceCandidates].sort(compareZoneRecommendationCandidates)
  };
}

function isSelectedTargetBypassCandidate(candidate) {
  const zoneDamage = toFiniteNumber(candidate?.zoneSummary?.totalDamagePerCycle) ?? 0;
  const mainDamage = toFiniteNumber(candidate?.zoneSummary?.totalDamageToMainPerCycle) ?? 0;
  return candidate?.outcomeKind === 'main'
    && zoneDamage <= 0
    && mainDamage > 0;
}

function getRecommendationPackageComponentCount(recommendation) {
  const componentCount = Array.isArray(recommendation?.packageComponents) && recommendation.packageComponents.length > 0
    ? recommendation.packageComponents.length
    : (Array.isArray(recommendation?.attackRows) ? recommendation.attackRows.length : 0);
  return Math.max(1, componentCount || 0);
}

function getTargetRecommendationDisplaySignature(recommendation) {
  const bestCandidate = recommendation?.bestCandidate;
  return JSON.stringify({
    zoneIndex: Number.isInteger(bestCandidate?.zoneIndex) ? bestCandidate.zoneIndex : null,
    label: String(bestCandidate?.label || bestCandidate?.zone?.zone_name || ''),
    matchedZoneNames: Array.isArray(bestCandidate?.matchedZoneNames) ? bestCandidate.matchedZoneNames : [],
    isSequenceCandidate: Boolean(bestCandidate?.isSequenceCandidate),
    outcomeKind: bestCandidate?.outcomeKind || 'none',
    shotsToKill: bestCandidate?.shotsToKill ?? null,
    ttkSeconds: bestCandidate?.ttkSeconds ?? null,
    rangeStatus: bestCandidate?.rangeStatus || 'unknown',
    rangeText: String(bestCandidate?.effectiveDistance?.text || ''),
    marginPercent: recommendation?.marginPercent ?? null,
    qualifiesForMargin: Boolean(recommendation?.qualifiesForMargin),
    hasOneShotKill: Boolean(recommendation?.hasOneShotKill),
    hasOneShotCritical: Boolean(recommendation?.hasOneShotCritical),
    hasTwoShotCritical: Boolean(recommendation?.hasTwoShotCritical),
    hasCriticalRecommendation: Boolean(recommendation?.hasCriticalRecommendation),
    hasFastTtk: Boolean(recommendation?.hasFastTtk)
  });
}

function isEquivalentSingleAttackTargetRecommendation(packageRecommendation, singleRecommendation) {
  if (!packageRecommendation?.isCombinedPackage || singleRecommendation?.isCombinedPackage) {
    return false;
  }

  const componentAttackKeys = new Set(
    (Array.isArray(packageRecommendation?.packageComponents) ? packageRecommendation.packageComponents : [])
      .map((component) => String(component?.attackKey || ''))
      .filter(Boolean)
  );
  const singleAttackKey = getAttackRowKey(singleRecommendation?.attackRow);
  if (!singleAttackKey || !componentAttackKeys.has(singleAttackKey)) {
    return false;
  }

  return getTargetRecommendationDisplaySignature(packageRecommendation)
    === getTargetRecommendationDisplaySignature(singleRecommendation);
}

function collapseEquivalentTargetAttackRecommendations(attackRecommendations = []) {
  const sourceRecommendations = Array.isArray(attackRecommendations)
    ? attackRecommendations.filter(Boolean)
    : [];
  return sourceRecommendations.filter((recommendation) => !sourceRecommendations.some((candidate) => (
    candidate !== recommendation
    && isEquivalentSingleAttackTargetRecommendation(recommendation, candidate)
  )));
}

function compareZoneRecommendationCandidates(left, right) {
  let comparison = compareBooleanDescending(left.selectedZoneMatch, right.selectedZoneMatch);
  if (comparison !== 0) {
    return comparison;
  }

  comparison = compareRecommendationMargins(left, right);
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

  comparison = compareNullableNumber(getRangeMeters(left.effectiveDistance), getRangeMeters(right.effectiveDistance), 'asc');
  if (comparison !== 0) {
    return comparison;
  }

  return String(left.zone?.zone_name || '').localeCompare(String(right.zone?.zone_name || ''));
}

function buildAttackRecommendation({
  enemy,
  weapon,
  attackPackage,
  rangeFloorMeters,
  engagementRangeMeters = 0,
  highlightRangeFloorMeters = rangeFloorMeters,
  selectedZoneIndex = null,
  hidePeripheralMainRoutes = false
}) {
  const { zoneRows, candidates } = buildRecommendationCandidates({
    enemy,
    weapon,
    attackRows: attackPackage?.attackRows,
    hitCounts: attackPackage?.hitCounts,
    attackRow: attackPackage?.attackRow,
    hitCount: attackPackage?.hitCount,
    engagementRangeMeters,
    highlightRangeFloorMeters,
    selectedZoneIndex
  });

  const filteredCandidates = hidePeripheralMainRoutes
    ? candidates.filter((candidate) => !candidate.isPeripheralMainRoute)
    : candidates;

  if (filteredCandidates.length === 0) {
    return null;
  }

  return {
    attackRow: attackPackage?.attackRow || attackPackage?.attackRows?.[0] || null,
    attackRows: Array.isArray(attackPackage?.attackRows) ? attackPackage.attackRows : [attackPackage?.attackRow].filter(Boolean),
    attackName: String(attackPackage?.attackName || 'Attack').trim() || 'Attack',
    hitCount: attackPackage?.hitCount ?? 1,
    hitCounts: Array.isArray(attackPackage?.hitCounts) ? attackPackage.hitCounts : [attackPackage?.hitCount ?? 1],
    packageComponents: Array.isArray(attackPackage?.packageComponents) ? attackPackage.packageComponents : [],
    excludedAttackNames: Array.isArray(attackPackage?.excludedAttackNames) ? attackPackage.excludedAttackNames : [],
    isCombinedPackage: Boolean(attackPackage?.isCombinedPackage),
    bestCandidate: filteredCandidates[0],
    candidates: filteredCandidates,
    marginRatio: filteredCandidates[0]?.marginRatio ?? null,
    marginPercent: filteredCandidates[0]?.marginPercent ?? null,
    qualifiesForMargin: filteredCandidates.some((candidate) => candidate.qualifiesForMargin),
    nearMissRatio: filteredCandidates[0]?.nearMissRatio ?? null,
    nearMissPercent: filteredCandidates[0]?.nearMissPercent ?? null,
    qualifiesForNearMiss: filteredCandidates.some((candidate) => candidate.qualifiesForNearMiss),
    hasSelectedZoneMatch: filteredCandidates.some((candidate) => candidate.selectedZoneMatch),
    penetratesAll: zoneRows.length > 0 && zoneRows.every((row) => row?.metrics?.bySlot?.A?.damagesZone),
    hasOneShotKill: filteredCandidates.some((candidate) => candidate.isOneShotKill),
    hasOneShotCritical: filteredCandidates.some((candidate) => candidate.isOneShotCritical),
    hasTwoShotCritical: filteredCandidates.some((candidate) => candidate.isTwoShotCritical),
    hasCriticalRecommendation: filteredCandidates.some((candidate) => candidate.hasCriticalRecommendation),
    hasFastTtk: filteredCandidates.some((candidate) => candidate.hasFastTtk),
    hasQualifiedPath: filteredCandidates.some((candidate) => candidate.rangeStatus === 'qualified')
  };
}

function compareAttackRowRecommendations(left, right) {
  let comparison = compareBooleanDescending(left.hasSelectedZoneMatch, right.hasSelectedZoneMatch);
  if (comparison !== 0) {
    return comparison;
  }

  comparison = compareRecommendationMargins(left, right);
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

  comparison = compareBooleanDescending(left.hasQualifiedPath, right.hasQualifiedPath);
  if (comparison !== 0) {
    return comparison;
  }

  comparison = compareZoneRecommendationCandidates(left.bestCandidate, right.bestCandidate);
  if (comparison !== 0) {
    return comparison;
  }

  comparison = compareBooleanDescending(left.penetratesAll, right.penetratesAll);
  if (comparison !== 0) {
    return comparison;
  }

  comparison = getRecommendationPackageComponentCount(left) - getRecommendationPackageComponentCount(right);
  if (comparison !== 0) {
    return comparison;
  }

  return String(left?.attackName || '').localeCompare(String(right?.attackName || ''));
}

function compareWeaponRecommendationRows(left, right) {
  let comparison = compareBooleanDescending(left.selectedZoneMatch, right.selectedZoneMatch);
  if (comparison !== 0) {
    return comparison;
  }

  comparison = compareRecommendationMargins(left, right);
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

  comparison = compareAttackRowRecommendations(left.bestAttackRecommendation, right.bestAttackRecommendation);
  if (comparison !== 0) {
    return comparison;
  }

  comparison = compareBooleanDescending(left.penetratesAll, right.penetratesAll);
  if (comparison !== 0) {
    return comparison;
  }

  return compareWeaponOptionBaseOrder(left.weapon, right.weapon);
}

function compareTargetAttackRowRecommendations(left, right) {
  let comparison = compareRecommendationMargins(left, right);
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

  comparison = compareBooleanDescending(left.hasQualifiedPath, right.hasQualifiedPath);
  if (comparison !== 0) {
    return comparison;
  }

  comparison = compareZoneRecommendationCandidates(left.bestCandidate, right.bestCandidate);
  if (comparison !== 0) {
    return comparison;
  }

  comparison = getRecommendationPackageComponentCount(left) - getRecommendationPackageComponentCount(right);
  if (comparison !== 0) {
    return comparison;
  }

  return String(left?.attackName || '').localeCompare(String(right?.attackName || ''));
}

function compareTargetWeaponRecommendationRows(left, right) {
  let comparison = compareRecommendationMargins(left, right);
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

  comparison = compareTargetAttackRowRecommendations(left.bestAttackRecommendation, right.bestAttackRecommendation);
  if (comparison !== 0) {
    return comparison;
  }

  return compareWeaponOptionBaseOrder(left.weapon, right.weapon);
}

function buildWeaponRecommendationDisplayRow({
  weapon,
  bestAttackRecommendation,
  selectedZoneMatch
}) {
  const bestCandidate = bestAttackRecommendation.bestCandidate;
  return {
    weapon,
    attackRow: bestAttackRecommendation.attackRow,
    attackRows: bestAttackRecommendation.attackRows,
    attackName: bestAttackRecommendation.attackName,
    hitCount: bestAttackRecommendation.hitCount,
    hitCounts: bestAttackRecommendation.hitCounts,
    packageComponents: bestAttackRecommendation.packageComponents,
    excludedAttackNames: bestAttackRecommendation.excludedAttackNames,
    isCombinedPackage: bestAttackRecommendation.isCombinedPackage,
    bestZone: bestCandidate.zone,
    bestZoneName: bestCandidate.label || bestCandidate.zone?.zone_name || '',
    bestOutcomeKind: bestCandidate.outcomeKind,
    shotsToKill: bestCandidate.shotsToKill,
    ttkSeconds: bestCandidate.ttkSeconds,
    effectiveDistance: bestCandidate.effectiveDistance,
    rangeStatus: bestCandidate.rangeStatus,
    marginRatio: bestAttackRecommendation.marginRatio,
    marginPercent: bestAttackRecommendation.marginPercent,
    qualifiesForMargin: bestAttackRecommendation.qualifiesForMargin,
    nearMissRatio: bestAttackRecommendation.nearMissRatio,
    nearMissPercent: bestAttackRecommendation.nearMissPercent,
    qualifiesForNearMiss: bestAttackRecommendation.qualifiesForNearMiss,
    nearMissDisplayPercent: !Number.isFinite(bestAttackRecommendation.marginPercent)
      && Number.isFinite(bestAttackRecommendation.nearMissPercent)
      ? bestAttackRecommendation.nearMissPercent
      : null,
    hasOneShotKill: bestAttackRecommendation.hasOneShotKill,
    hasOneShotCritical: bestAttackRecommendation.hasOneShotCritical,
    hasTwoShotCritical: bestAttackRecommendation.hasTwoShotCritical,
    hasCriticalRecommendation: bestAttackRecommendation.hasCriticalRecommendation,
    hasFastTtk: bestAttackRecommendation.hasFastTtk,
    penetratesAll: bestAttackRecommendation.penetratesAll,
    matchedZoneNames: bestCandidate.matchedZoneNames || [],
    selectedZoneMatch,
    isSequenceCandidate: Boolean(bestCandidate.isSequenceCandidate),
    bestAttackRecommendation
  };
}

export function buildWeaponRecommendationRows({
  enemy,
  weapons = [],
  rangeFloorMeters = DEFAULT_RECOMMENDATION_RANGE_METERS,
  getEngagementRangeMetersForWeapon = null,
  selectedZoneIndex = null,
  hidePeripheralMainRoutes = false
}) {
  if (!enemy?.zones || enemy.zones.length === 0 || !Array.isArray(weapons)) {
    return [];
  }

  const normalizedRangeFloor = normalizeRecommendationRangeMeters(rangeFloorMeters);
  return weapons
    .map((weapon) => {
      const attackRecommendations = buildRecommendationAttackPackages(weapon)
        .map((attackPackage) => buildAttackRecommendation({
          enemy,
          weapon,
          attackPackage,
          rangeFloorMeters: normalizedRangeFloor,
          engagementRangeMeters: typeof getEngagementRangeMetersForWeapon === 'function'
            ? getEngagementRangeMetersForWeapon(weapon)
            : 0,
          highlightRangeFloorMeters: normalizedRangeFloor,
          selectedZoneIndex,
          hidePeripheralMainRoutes
        }))
        .filter(Boolean)
        .sort(compareAttackRowRecommendations);

      if (attackRecommendations.length === 0) {
        return null;
      }

      const bestAttackRecommendation = attackRecommendations[0];
      return {
        ...buildWeaponRecommendationDisplayRow({
          weapon,
          bestAttackRecommendation,
          selectedZoneMatch: Boolean(bestAttackRecommendation.hasSelectedZoneMatch)
        }),
        attackRecommendations
      };
    })
    .filter(Boolean)
    .sort(compareWeaponRecommendationRows);
}

function buildTargetRecommendationRows({
  enemy,
  weapons = [],
  rangeFloorMeters = DEFAULT_RECOMMENDATION_RANGE_METERS,
  getEngagementRangeMetersForWeapon = null,
  targetZoneIndices = [],
  selectedZoneIndexForBias = null,
  selectedZoneMatch = false,
  hidePeripheralMainRoutes = false
}) {
  const normalizedTargetZoneIndices = [...new Set(
    (Array.isArray(targetZoneIndices) ? targetZoneIndices : [])
      .filter((zoneIndex) => Number.isInteger(zoneIndex) && enemy?.zones?.[zoneIndex])
  )];
  if (normalizedTargetZoneIndices.length === 0) {
    return [];
  }

  const targetZoneIndexSet = new Set(normalizedTargetZoneIndices);
  const normalizedRangeFloor = normalizeRecommendationRangeMeters(rangeFloorMeters);
  return weapons
    .map((weapon) => {
      const rawAttackRecommendations = collapseEquivalentTargetAttackRecommendations(buildRecommendationAttackPackages(weapon, {
        includeCombinedPackages: true
      })
        .map((attackPackage) => buildAttackRecommendation({
          enemy,
          weapon,
          attackPackage,
          rangeFloorMeters: normalizedRangeFloor,
          engagementRangeMeters: typeof getEngagementRangeMetersForWeapon === 'function'
            ? getEngagementRangeMetersForWeapon(weapon)
            : 0,
          highlightRangeFloorMeters: normalizedRangeFloor,
          selectedZoneIndex: selectedZoneIndexForBias,
          hidePeripheralMainRoutes
        }))
        .filter(Boolean)
        .map((recommendation) => ({
          ...recommendation,
          candidates: recommendation.candidates.filter((candidate) => targetZoneIndexSet.has(candidate.zoneIndex))
        }))
        .map((recommendation) => ({
          ...recommendation,
          candidates: selectedZoneMatch
            ? recommendation.candidates.filter((candidate) => !isSelectedTargetBypassCandidate(candidate))
            : recommendation.candidates
        }))
        .filter((recommendation) => recommendation.candidates.length > 0)
        .map((recommendation) => {
          const bestCandidate = [...recommendation.candidates].sort(compareZoneRecommendationCandidates)[0];
          return {
            ...recommendation,
            bestCandidate,
            marginRatio: bestCandidate?.marginRatio ?? null,
            marginPercent: bestCandidate?.marginPercent ?? null,
            qualifiesForMargin: recommendation.candidates.some((candidate) => candidate.qualifiesForMargin),
            hasSelectedZoneMatch: selectedZoneMatch,
            hasOneShotKill: recommendation.candidates.some((candidate) => candidate.isOneShotKill),
            hasOneShotCritical: recommendation.candidates.some((candidate) => candidate.isOneShotCritical),
            hasTwoShotCritical: recommendation.candidates.some((candidate) => candidate.isTwoShotCritical),
            hasCriticalRecommendation: recommendation.candidates.some((candidate) => candidate.hasCriticalRecommendation),
            hasFastTtk: recommendation.candidates.some((candidate) => candidate.hasFastTtk),
            hasQualifiedPath: recommendation.candidates.some((candidate) => candidate.rangeStatus === 'qualified')
          };
        }))
        .sort(compareTargetAttackRowRecommendations);

      const attackRecommendations = selectedZoneMatch && isStratagemRecommendationWeapon(weapon)
        ? applyStratagemPrecisionFilter(rawAttackRecommendations)
        : rawAttackRecommendations;

      if (attackRecommendations.length === 0) {
        return null;
      }

      const bestAttackRecommendation = attackRecommendations[0];
      return {
        ...buildWeaponRecommendationDisplayRow({
          weapon,
          bestAttackRecommendation,
          selectedZoneMatch
        }),
        attackRecommendations
      };
    })
    .filter(Boolean)
    .sort(compareTargetWeaponRecommendationRows);
}

export function buildSelectedTargetRecommendationRows({
  enemy,
  weapons = [],
  rangeFloorMeters = DEFAULT_RECOMMENDATION_RANGE_METERS,
  getEngagementRangeMetersForWeapon = null,
  selectedZoneIndex = null,
  hidePeripheralMainRoutes = false
}) {
  return buildTargetRecommendationRows({
    enemy,
    weapons,
    rangeFloorMeters,
    getEngagementRangeMetersForWeapon,
    targetZoneIndices: [selectedZoneIndex],
    selectedZoneIndexForBias: selectedZoneIndex,
    selectedZoneMatch: true,
    hidePeripheralMainRoutes
  });
}

export function buildRelatedTargetRecommendationRows({
  enemy,
  weapons = [],
  rangeFloorMeters = DEFAULT_RECOMMENDATION_RANGE_METERS,
  getEngagementRangeMetersForWeapon = null,
  relatedZoneIndices = [],
  hidePeripheralMainRoutes = false
}) {
  return buildTargetRecommendationRows({
    enemy,
    weapons,
    rangeFloorMeters,
    getEngagementRangeMetersForWeapon,
    targetZoneIndices: relatedZoneIndices,
    selectedZoneMatch: false,
    hidePeripheralMainRoutes
  });
}
