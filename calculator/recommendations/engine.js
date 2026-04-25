import { recordRecommendationWork } from '../recommendation-work-distribution.js';
import {
  buildRecommendationCandidates,
  compareZoneRecommendationCandidates,
  isSelectedTargetBypassCandidate
} from './candidates.js';
import {
  buildRecommendationAttackPackages,
  isStratagemRecommendationWeapon
} from './packages.js';
import {
  applyStratagemPrecisionFilter,
  collapseEquivalentTargetAttackRecommendations,
  compareAttackRowRecommendations,
  compareTargetAttackRowRecommendations,
  compareTargetWeaponRecommendationRows,
  compareWeaponRecommendationRows
} from './ranking.js';
import {
  DEFAULT_RECOMMENDATION_RANGE_METERS,
  normalizeRecommendationRangeMeters,
  normalizeRecommendationSortMode
} from './shared.js';

function buildAttackRecommendation({
  enemy,
  weapon,
  attackPackage,
  rangeFloorMeters,
  engagementRangeMeters = 0,
  highlightRangeFloorMeters = rangeFloorMeters,
  selectedZoneIndex = null,
  hidePeripheralMainRoutes = false,
  sortMode = 'default',
  instrumentation = null,
  analysisStage = null
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
    selectedZoneIndex,
    sortMode,
    instrumentation,
    analysisStage
  });

  const filteredCandidates = hidePeripheralMainRoutes
    ? candidates.filter((candidate) => !candidate.isPeripheralMainRoute)
    : candidates;
  const bestCandidate = filteredCandidates[0];

  const result = filteredCandidates.length === 0
    ? null
    : {
      attackRow: attackPackage?.attackRow || attackPackage?.attackRows?.[0] || null,
      attackRows: Array.isArray(attackPackage?.attackRows) ? attackPackage.attackRows : [attackPackage?.attackRow].filter(Boolean),
      attackName: String(attackPackage?.attackName || 'Attack').trim() || 'Attack',
      hitCount: attackPackage?.hitCount ?? 1,
      hitCounts: Array.isArray(attackPackage?.hitCounts) ? attackPackage.hitCounts : [attackPackage?.hitCount ?? 1],
      packageComponents: Array.isArray(attackPackage?.packageComponents) ? attackPackage.packageComponents : [],
      excludedAttackNames: Array.isArray(attackPackage?.excludedAttackNames) ? attackPackage.excludedAttackNames : [],
      damageTypeFamilies: Array.isArray(attackPackage?.damageTypeFamilies) ? attackPackage.damageTypeFamilies : [],
      damageTypeLabel: String(attackPackage?.damageTypeLabel || '').trim(),
      damageTypeDetail: String(attackPackage?.damageTypeDetail || '').trim(),
      isMixedDamageType: Boolean(attackPackage?.isMixedDamageType),
      isCombinedPackage: Boolean(attackPackage?.isCombinedPackage),
      bestCandidate,
      candidates: filteredCandidates,
      marginRatio: bestCandidate?.marginRatio ?? null,
      marginPercent: bestCandidate?.marginPercent ?? null,
      qualifiesForMargin: filteredCandidates.some((candidate) => candidate.qualifiesForMargin),
      displayMarginRatio: bestCandidate?.displayMarginRatio ?? null,
      displayMarginPercent: bestCandidate?.displayMarginPercent ?? null,
      nearMissRatio: bestCandidate?.nearMissRatio ?? null,
      nearMissPercent: bestCandidate?.nearMissPercent ?? null,
      qualifiesForNearMiss: filteredCandidates.some((candidate) => candidate.qualifiesForNearMiss),
      hasSelectedZoneMatch: filteredCandidates.some((candidate) => candidate.selectedZoneMatch),
      penetratesAll: zoneRows.length > 0 && zoneRows.every((row) => row?.metrics?.bySlot?.A?.damagesZone),
      hasOneShotKill: filteredCandidates.some((candidate) => candidate.isOneShotKill),
      hasOneShotCritical: filteredCandidates.some((candidate) => candidate.isOneShotCritical),
      hasTwoShotCritical: filteredCandidates.some((candidate) => candidate.isTwoShotCritical),
      hasCriticalRecommendation: filteredCandidates.some((candidate) => candidate.hasCriticalRecommendation),
      hasFastTtk: filteredCandidates.some((candidate) => candidate.hasFastTtk),
      hasQualifiedPath: filteredCandidates.some((candidate) => candidate.rangeStatus === 'qualified'),
      cadenceModel: bestCandidate?.cadenceModel ?? null,
      usesBeamCadence: Boolean(bestCandidate?.usesBeamCadence),
      beamTicksPerSecond: bestCandidate?.beamTicksPerSecond ?? null,
      suppressesMargin: Boolean(bestCandidate?.suppressesMargin)
    };
  recordRecommendationWork(instrumentation, {
    stage: analysisStage,
    method: 'buildAttackRecommendation',
    metrics: {
      attackRecommendationsBuilt: 1,
      attackRecommendationsReturned: result ? 1 : 0,
      filteredCandidatesRemoved: Math.max(0, candidates.length - filteredCandidates.length)
    }
  });
  return result;
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
    damageTypeFamilies: bestAttackRecommendation.damageTypeFamilies,
    damageTypeLabel: bestAttackRecommendation.damageTypeLabel,
    damageTypeDetail: bestAttackRecommendation.damageTypeDetail,
    isMixedDamageType: bestAttackRecommendation.isMixedDamageType,
    isCombinedPackage: bestAttackRecommendation.isCombinedPackage,
    bestZone: bestCandidate.zone,
    bestZoneName: bestCandidate.label || bestCandidate.zone?.zone_name || '',
    bestOutcomeKind: bestCandidate.outcomeKind,
    shotsToKill: bestCandidate.shotsToKill,
    ttkSeconds: bestCandidate.ttkSeconds,
    cadenceModel: bestAttackRecommendation.cadenceModel ?? null,
    usesBeamCadence: bestAttackRecommendation.usesBeamCadence,
    beamTicksPerSecond: bestAttackRecommendation.beamTicksPerSecond,
    suppressesMargin: bestAttackRecommendation.suppressesMargin,
    effectiveDistance: bestCandidate.effectiveDistance,
    rangeStatus: bestCandidate.rangeStatus,
    marginRatio: bestAttackRecommendation.marginRatio,
    marginPercent: bestAttackRecommendation.marginPercent,
    qualifiesForMargin: bestAttackRecommendation.qualifiesForMargin,
    displayMarginRatio: bestAttackRecommendation.displayMarginRatio,
    displayMarginPercent: bestAttackRecommendation.displayMarginPercent,
    nearMissRatio: bestAttackRecommendation.nearMissRatio,
    nearMissPercent: bestAttackRecommendation.nearMissPercent,
    qualifiesForNearMiss: bestAttackRecommendation.qualifiesForNearMiss,
    nearMissDisplayPercent: !bestAttackRecommendation.suppressesMargin
      && !Number.isFinite(bestAttackRecommendation.marginPercent)
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
  hidePeripheralMainRoutes = false,
  sortMode = 'default',
  instrumentation = null,
  analysisStage = 'overall'
}) {
  if (!enemy?.zones || enemy.zones.length === 0 || !Array.isArray(weapons)) {
    recordRecommendationWork(instrumentation, {
      stage: analysisStage,
      method: 'buildWeaponRecommendationRows',
      metrics: {
        inputWeapons: Array.isArray(weapons) ? weapons.length : 0,
        resultRowsReturned: 0
      }
    });
    return [];
  }

  const normalizedRangeFloor = normalizeRecommendationRangeMeters(rangeFloorMeters);
  const normalizedSortMode = normalizeRecommendationSortMode(sortMode);
  const rows = weapons
    .map((weapon) => {
      const attackRecommendations = buildRecommendationAttackPackages(weapon, {
        instrumentation,
        analysisStage
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
          selectedZoneIndex,
          hidePeripheralMainRoutes,
          sortMode: normalizedSortMode,
          instrumentation,
          analysisStage
        }))
        .filter(Boolean)
        .sort((left, right) => compareAttackRowRecommendations(left, right, {
          sortMode: normalizedSortMode
        }));

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
    .sort((left, right) => compareWeaponRecommendationRows(left, right, {
      sortMode: normalizedSortMode
    }));
  recordRecommendationWork(instrumentation, {
    stage: analysisStage,
    method: 'buildWeaponRecommendationRows',
    metrics: {
      inputWeapons: weapons.length,
      resultRowsReturned: rows.length
    }
  });
  return rows;
}

function buildTargetRecommendationRows({
  enemy,
  weapons = [],
  rangeFloorMeters = DEFAULT_RECOMMENDATION_RANGE_METERS,
  getEngagementRangeMetersForWeapon = null,
  targetZoneIndices = [],
  selectedZoneIndexForBias = null,
  selectedZoneMatch = false,
  hidePeripheralMainRoutes = false,
  sortMode = 'default',
  instrumentation = null,
  analysisStage = null
}) {
  const normalizedWeapons = Array.isArray(weapons) ? weapons : [];
  const normalizedTargetZoneIndices = [...new Set(
    (Array.isArray(targetZoneIndices) ? targetZoneIndices : [])
      .filter((zoneIndex) => Number.isInteger(zoneIndex) && enemy?.zones?.[zoneIndex])
  )];
  if (normalizedTargetZoneIndices.length === 0) {
    recordRecommendationWork(instrumentation, {
      stage: analysisStage,
      method: 'buildTargetRecommendationRows',
      metrics: {
        inputWeapons: normalizedWeapons.length,
        requestedTargetZones: 0,
        resultRowsReturned: 0
      }
    });
    return [];
  }

  const targetZoneIndexSet = new Set(normalizedTargetZoneIndices);
  const normalizedRangeFloor = normalizeRecommendationRangeMeters(rangeFloorMeters);
  const normalizedSortMode = normalizeRecommendationSortMode(sortMode);
  const rows = normalizedWeapons
    .map((weapon) => {
      const rawAttackRecommendations = collapseEquivalentTargetAttackRecommendations(
        buildRecommendationAttackPackages(weapon, {
          includeCombinedPackages: true,
          instrumentation,
          analysisStage
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
            hidePeripheralMainRoutes,
            sortMode: normalizedSortMode,
            instrumentation,
            analysisStage
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
            const bestCandidate = [...recommendation.candidates].sort((left, right) => compareZoneRecommendationCandidates(
              left,
              right,
              { sortMode: normalizedSortMode }
            ))[0];
            return {
              ...recommendation,
              bestCandidate,
              marginRatio: bestCandidate?.marginRatio ?? null,
              marginPercent: bestCandidate?.marginPercent ?? null,
              qualifiesForMargin: recommendation.candidates.some((candidate) => candidate.qualifiesForMargin),
              displayMarginRatio: bestCandidate?.displayMarginRatio ?? null,
              displayMarginPercent: bestCandidate?.displayMarginPercent ?? null,
              nearMissRatio: bestCandidate?.nearMissRatio ?? null,
              nearMissPercent: bestCandidate?.nearMissPercent ?? null,
              qualifiesForNearMiss: recommendation.candidates.some((candidate) => candidate.qualifiesForNearMiss),
              hasSelectedZoneMatch: selectedZoneMatch,
              hasOneShotKill: recommendation.candidates.some((candidate) => candidate.isOneShotKill),
              hasOneShotCritical: recommendation.candidates.some((candidate) => candidate.isOneShotCritical),
              hasTwoShotCritical: recommendation.candidates.some((candidate) => candidate.isTwoShotCritical),
              hasCriticalRecommendation: recommendation.candidates.some((candidate) => candidate.hasCriticalRecommendation),
              hasFastTtk: recommendation.candidates.some((candidate) => candidate.hasFastTtk),
              hasQualifiedPath: recommendation.candidates.some((candidate) => candidate.rangeStatus === 'qualified'),
              cadenceModel: bestCandidate?.cadenceModel ?? null,
              usesBeamCadence: Boolean(bestCandidate?.usesBeamCadence),
              beamTicksPerSecond: bestCandidate?.beamTicksPerSecond ?? null,
              suppressesMargin: Boolean(bestCandidate?.suppressesMargin)
            };
          })
          .sort((left, right) => compareTargetAttackRowRecommendations(left, right, {
            sortMode: normalizedSortMode
          })),
        {
          instrumentation,
          analysisStage
        }
      );

      const attackRecommendations = selectedZoneMatch && isStratagemRecommendationWeapon(weapon)
        ? applyStratagemPrecisionFilter(rawAttackRecommendations, {
          instrumentation,
          analysisStage
        })
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
    .sort((left, right) => compareTargetWeaponRecommendationRows(left, right, {
      sortMode: normalizedSortMode
    }));
  recordRecommendationWork(instrumentation, {
    stage: analysisStage,
    method: 'buildTargetRecommendationRows',
    metrics: {
      inputWeapons: normalizedWeapons.length,
      requestedTargetZones: normalizedTargetZoneIndices.length,
      resultRowsReturned: rows.length
    }
  });
  return rows;
}

export function buildSelectedTargetRecommendationRows({
  enemy,
  weapons = [],
  rangeFloorMeters = DEFAULT_RECOMMENDATION_RANGE_METERS,
  getEngagementRangeMetersForWeapon = null,
  selectedZoneIndex = null,
  hidePeripheralMainRoutes = false,
  sortMode = 'default',
  instrumentation = null,
  analysisStage = 'selectedTarget'
}) {
  return buildTargetRecommendationRows({
    enemy,
    weapons,
    rangeFloorMeters,
    getEngagementRangeMetersForWeapon,
    targetZoneIndices: [selectedZoneIndex],
    selectedZoneIndexForBias: selectedZoneIndex,
    selectedZoneMatch: true,
    hidePeripheralMainRoutes,
    sortMode,
    instrumentation,
    analysisStage
  });
}

export function buildRelatedTargetRecommendationRows({
  enemy,
  weapons = [],
  rangeFloorMeters = DEFAULT_RECOMMENDATION_RANGE_METERS,
  getEngagementRangeMetersForWeapon = null,
  relatedZoneIndices = [],
  hidePeripheralMainRoutes = false,
  sortMode = 'default',
  instrumentation = null,
  analysisStage = 'relatedTarget'
}) {
  return buildTargetRecommendationRows({
    enemy,
    weapons,
    rangeFloorMeters,
    getEngagementRangeMetersForWeapon,
    targetZoneIndices: relatedZoneIndices,
    selectedZoneMatch: false,
    hidePeripheralMainRoutes,
    sortMode,
    instrumentation,
    analysisStage
  });
}
