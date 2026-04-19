import { isExplosiveAttack } from '../attack-types.js';
import { getAttackRowKey } from '../compare-utils.js';
import { recordRecommendationWork } from '../recommendation-work-distribution.js';
import { compareWeaponOptionBaseOrder } from '../weapon-dropdown.js';
import { compareZoneRecommendationCandidates } from './candidates.js';
import {
  getRecommendationAttackEventKey,
  getRecommendationAttackFamily
} from './packages.js';
import {
  compareBooleanDescending,
  compareNullableNumber,
  compareRecommendationHeadroom,
  compareRecommendationMargins
} from './shared.js';

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

export function collapseEquivalentTargetAttackRecommendations(attackRecommendations = [], {
  instrumentation = null,
  analysisStage = null
} = {}) {
  const sourceRecommendations = Array.isArray(attackRecommendations)
    ? attackRecommendations.filter(Boolean)
    : [];
  const result = sourceRecommendations.filter((recommendation) => !sourceRecommendations.some((candidate) => (
    candidate !== recommendation
    && isEquivalentSingleAttackTargetRecommendation(recommendation, candidate)
  )));
  recordRecommendationWork(instrumentation, {
    stage: analysisStage,
    method: 'collapseEquivalentTargetAttackRecommendations',
    metrics: {
      collapseInputs: sourceRecommendations.length,
      collapseOutputs: result.length
    }
  });
  return result;
}

export function compareAttackRowRecommendations(left, right) {
  let comparison = compareBooleanDescending(left.hasSelectedZoneMatch, right.hasSelectedZoneMatch);
  if (comparison !== 0) {
    return comparison;
  }

  comparison = compareNullableNumber(
    left.bestCandidate?.shotsToKill ?? null,
    right.bestCandidate?.shotsToKill ?? null,
    'asc'
  );
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

export function compareWeaponRecommendationRows(left, right) {
  let comparison = compareBooleanDescending(left.selectedZoneMatch, right.selectedZoneMatch);
  if (comparison !== 0) {
    return comparison;
  }

  comparison = compareNullableNumber(left.shotsToKill, right.shotsToKill, 'asc');
  if (comparison !== 0) {
    return comparison;
  }

  comparison = compareRecommendationHeadroom(left, right);
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

export function compareTargetAttackRowRecommendations(left, right) {
  let comparison = compareNullableNumber(
    left.bestCandidate?.shotsToKill ?? null,
    right.bestCandidate?.shotsToKill ?? null,
    'asc'
  );
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

  comparison = getRecommendationPackageComponentCount(left) - getRecommendationPackageComponentCount(right);
  if (comparison !== 0) {
    return comparison;
  }

  return String(left?.attackName || '').localeCompare(String(right?.attackName || ''));
}

export function compareTargetWeaponRecommendationRows(left, right) {
  let comparison = compareNullableNumber(left.shotsToKill, right.shotsToKill, 'asc');
  if (comparison !== 0) {
    return comparison;
  }

  comparison = compareRecommendationHeadroom(left, right);
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

// Selected-target filter: for multi-source delivery events (stratagems) that already
// have a combined or explosive-bearing recommendation, suppress the redundant
// pure-projectile recommendation for the same event. Run after collapse+sort so that
// the projectile-only package is preserved when it is genuinely the best path (i.e. the
// collapse already removed any equivalent combined package above it).
export function applyStratagemPrecisionFilter(sortedAttackRecommendations, {
  instrumentation = null,
  analysisStage = null
} = {}) {
  const inputCount = Array.isArray(sortedAttackRecommendations)
    ? sortedAttackRecommendations.length
    : 0;
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

  const result = dominantEventKeys.size === 0
    ? sortedAttackRecommendations
    : sortedAttackRecommendations.filter((recommendation) => {
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

  recordRecommendationWork(instrumentation, {
    stage: analysisStage,
    method: 'applyStratagemPrecisionFilter',
    metrics: {
      precisionFilterInputs: inputCount,
      precisionFilterOutputs: Array.isArray(result) ? result.length : 0
    }
  });

  return result;
}
