import {
  setAttackHitCounts,
  setCalculatorMode,
  setCompareHeaderLayout,
  setCompareView,
  setDiffDisplayMode,
  setEnemyDropdownSortDir,
  setEnemyDropdownSortMode,
  setEnemySortState,
  setEnemyTableMode,
  setEngagementRangeMeters,
  setOverviewScope,
  setRecommendationHideOrdnance,
  setRecommendationNoMainViaLimbs,
  setRecommendationShotRange,
  setRecommendationWeaponFilterGroups,
  setRecommendationWeaponFilterMode,
  setRecommendationWeaponFilterRoles,
  setRecommendationWeaponFilterSubs,
  setRecommendationWeaponFilterTypes,
  setSelectedAttackKeys,
  setSelectedEnemy,
  setSelectedEnemyTargetTypes,
  setSelectedOverviewOutcomeKinds,
  setSelectedExplosiveZoneIndices,
  setSelectedWeapon,
  setSelectedZoneIndex,
  setWeaponSortMode,
  getWeaponForSlot
} from '../data.js';
import { applyWeaponFilterState } from '../../weapons/filters.js';
import { applyEnemyFilterState } from '../../enemies/filters.js';
import { state as weaponsState } from '../../weapons/data.js';
import { enemyState } from '../../enemies/data.js';
import {
  DEFAULT_CALCULATOR_URL_STATE,
  DEFAULT_ENEMY_TAB_URL_STATE,
  DEFAULT_WEAPON_TAB_URL_STATE,
  URL_PARAM_KEYS,
  URL_STATE_VERSION,
  normalizeTabId
} from './contract.js';
import {
  normalizeAttackHitCountValue,
  normalizeAttackSelectionValue
} from './attack-selection-codec.js';
import {
  normalizeArrayOfStrings,
  normalizeBooleanParam,
  normalizeIntegerArray,
  parseJsonParam
} from './param-codecs.js';

function findWeaponByName(name) {
  const normalizedName = String(name ?? '').trim();
  if (!normalizedName) {
    return null;
  }

  return weaponsState.groups.find((weapon) => weapon.name === normalizedName) || null;
}

function findEnemyByName(name) {
  const normalizedName = String(name ?? '').trim();
  if (!normalizedName) {
    return null;
  }

  return enemyState.units.find((enemy) => enemy.name === normalizedName) || null;
}

export function hydrateUrlState(search = globalThis.location?.search || '') {
  const params = search instanceof URLSearchParams ? search : new URLSearchParams(search);

  applyWeaponFilterState({
    searchQuery: params.get(URL_PARAM_KEYS.weaponSearchQuery) ?? DEFAULT_WEAPON_TAB_URL_STATE.searchQuery,
    activeTypes: params.has(URL_PARAM_KEYS.weaponActiveTypes)
      ? normalizeArrayOfStrings(parseJsonParam(params, URL_PARAM_KEYS.weaponActiveTypes).value, { lowercase: true })
      : DEFAULT_WEAPON_TAB_URL_STATE.activeTypes,
    activeSubs: params.has(URL_PARAM_KEYS.weaponActiveSubs)
      ? normalizeArrayOfStrings(parseJsonParam(params, URL_PARAM_KEYS.weaponActiveSubs).value, { lowercase: true })
      : DEFAULT_WEAPON_TAB_URL_STATE.activeSubs,
    activeRoles: params.has(URL_PARAM_KEYS.weaponActiveRoles)
      ? normalizeArrayOfStrings(parseJsonParam(params, URL_PARAM_KEYS.weaponActiveRoles).value, { lowercase: true })
      : DEFAULT_WEAPON_TAB_URL_STATE.activeRoles,
    sortKey: params.get(URL_PARAM_KEYS.weaponSortKey) || null,
    sortDir: params.get(URL_PARAM_KEYS.weaponSortDir) || DEFAULT_WEAPON_TAB_URL_STATE.sortDir
  }, { render: false });

  applyEnemyFilterState({
    searchQuery: params.get(URL_PARAM_KEYS.enemySearchQuery) ?? DEFAULT_ENEMY_TAB_URL_STATE.searchQuery,
    activeFactions: params.has(URL_PARAM_KEYS.enemyActiveFactions)
      ? normalizeArrayOfStrings(parseJsonParam(params, URL_PARAM_KEYS.enemyActiveFactions).value)
      : DEFAULT_ENEMY_TAB_URL_STATE.activeFactions,
    sortKey: params.get(URL_PARAM_KEYS.enemyTabSortKey) || null,
    sortDir: params.get(URL_PARAM_KEYS.enemyTabSortDir) || DEFAULT_ENEMY_TAB_URL_STATE.sortDir
  }, { render: false });

  setCalculatorMode(params.get(URL_PARAM_KEYS.calculatorMode) || DEFAULT_CALCULATOR_URL_STATE.mode);
  setCompareHeaderLayout(
    params.get(URL_PARAM_KEYS.compareHeaderLayout) || DEFAULT_CALCULATOR_URL_STATE.compareHeaderLayout
  );
  setWeaponSortMode(params.get(URL_PARAM_KEYS.weaponSortMode) || DEFAULT_CALCULATOR_URL_STATE.weaponSortMode);
  setEnemyDropdownSortMode(params.get(URL_PARAM_KEYS.enemyDropdownSortMode) || DEFAULT_CALCULATOR_URL_STATE.enemyDropdownSortMode);
  setEnemyDropdownSortDir(params.get(URL_PARAM_KEYS.enemyDropdownSortDir) || DEFAULT_CALCULATOR_URL_STATE.enemyDropdownSortDir);
  setEnemyTableMode(params.get(URL_PARAM_KEYS.enemyTableMode) || DEFAULT_CALCULATOR_URL_STATE.enemyTableMode);
  setOverviewScope(params.get(URL_PARAM_KEYS.overviewScope) || DEFAULT_CALCULATOR_URL_STATE.overviewScope);
  setSelectedEnemyTargetTypes(
    params.has(URL_PARAM_KEYS.enemyTargetTypes)
      ? parseJsonParam(params, URL_PARAM_KEYS.enemyTargetTypes).value
      : DEFAULT_CALCULATOR_URL_STATE.enemyTargetTypes
  );
  setDiffDisplayMode(params.get(URL_PARAM_KEYS.diffDisplayMode) || DEFAULT_CALCULATOR_URL_STATE.diffDisplayMode);
  setSelectedOverviewOutcomeKinds(
    params.has(URL_PARAM_KEYS.overviewOutcomeKinds)
      ? parseJsonParam(params, URL_PARAM_KEYS.overviewOutcomeKinds).value
      : DEFAULT_CALCULATOR_URL_STATE.overviewOutcomeKinds
  );
  setEngagementRangeMeters(
    'A',
    params.get(URL_PARAM_KEYS.engagementRangeMetersA) ?? DEFAULT_CALCULATOR_URL_STATE.engagementRangeMetersA
  );
  setEngagementRangeMeters(
    'B',
    params.get(URL_PARAM_KEYS.engagementRangeMetersB) ?? DEFAULT_CALCULATOR_URL_STATE.engagementRangeMetersB
  );

  setSelectedWeapon('A', findWeaponByName(params.get(URL_PARAM_KEYS.weaponA)));
  setSelectedWeapon('B', findWeaponByName(params.get(URL_PARAM_KEYS.weaponB)));

  const selectedAttackKeysA = parseJsonParam(params, URL_PARAM_KEYS.selectedAttackKeysA);
  if (selectedAttackKeysA.present) {
    setSelectedAttackKeys('A', normalizeAttackSelectionValue(selectedAttackKeysA.value, getWeaponForSlot('A')));
  }

  const selectedAttackKeysB = parseJsonParam(params, URL_PARAM_KEYS.selectedAttackKeysB);
  if (selectedAttackKeysB.present) {
    setSelectedAttackKeys('B', normalizeAttackSelectionValue(selectedAttackKeysB.value, getWeaponForSlot('B')));
  }

  const attackHitCountsA = parseJsonParam(params, URL_PARAM_KEYS.attackHitCountsA);
  if (attackHitCountsA.present) {
    setAttackHitCounts('A', normalizeAttackHitCountValue(attackHitCountsA.value, getWeaponForSlot('A')));
  }

  const attackHitCountsB = parseJsonParam(params, URL_PARAM_KEYS.attackHitCountsB);
  if (attackHitCountsB.present) {
    setAttackHitCounts('B', normalizeAttackHitCountValue(attackHitCountsB.value, getWeaponForSlot('B')));
  }

  const requestedCompareView = params.get(URL_PARAM_KEYS.compareView) || DEFAULT_CALCULATOR_URL_STATE.compareView;
  const requestedEnemy = findEnemyByName(params.get(URL_PARAM_KEYS.selectedEnemy));
  setSelectedEnemy(requestedEnemy);
  setCompareView(requestedCompareView);

  const zoneIndex = Number(params.get(URL_PARAM_KEYS.selectedZoneIndex));
  if (Number.isInteger(zoneIndex) && zoneIndex >= 0) {
    setSelectedZoneIndex(zoneIndex);
  }

  const selectedExplosiveZoneIndices = parseJsonParam(params, URL_PARAM_KEYS.selectedExplosiveZoneIndices);
  if (selectedExplosiveZoneIndices.present) {
    setSelectedExplosiveZoneIndices(normalizeIntegerArray(selectedExplosiveZoneIndices.value));
  }

  setRecommendationWeaponFilterMode(
    params.get(URL_PARAM_KEYS.recommendationWeaponFilterMode) || DEFAULT_CALCULATOR_URL_STATE.recommendationWeaponFilterMode
  );
  setRecommendationWeaponFilterTypes(
    params.has(URL_PARAM_KEYS.recommendationWeaponFilterTypes)
      ? normalizeArrayOfStrings(parseJsonParam(params, URL_PARAM_KEYS.recommendationWeaponFilterTypes).value, { lowercase: true })
      : DEFAULT_CALCULATOR_URL_STATE.recommendationWeaponFilterTypes
  );
  setRecommendationWeaponFilterSubs(
    params.has(URL_PARAM_KEYS.recommendationWeaponFilterSubs)
      ? normalizeArrayOfStrings(parseJsonParam(params, URL_PARAM_KEYS.recommendationWeaponFilterSubs).value, { lowercase: true })
      : DEFAULT_CALCULATOR_URL_STATE.recommendationWeaponFilterSubs
  );
  setRecommendationWeaponFilterGroups(
    params.has(URL_PARAM_KEYS.recommendationWeaponFilterGroups)
      ? normalizeArrayOfStrings(parseJsonParam(params, URL_PARAM_KEYS.recommendationWeaponFilterGroups).value, { lowercase: true })
      : DEFAULT_CALCULATOR_URL_STATE.recommendationWeaponFilterGroups
  );
  setRecommendationWeaponFilterRoles(
    params.has(URL_PARAM_KEYS.recommendationWeaponFilterRoles)
      ? normalizeArrayOfStrings(parseJsonParam(params, URL_PARAM_KEYS.recommendationWeaponFilterRoles).value, { lowercase: true })
      : DEFAULT_CALCULATOR_URL_STATE.recommendationWeaponFilterRoles
  );
  setRecommendationHideOrdnance(
    normalizeBooleanParam(
      params.get(URL_PARAM_KEYS.recommendationHideOrdnance),
      DEFAULT_CALCULATOR_URL_STATE.recommendationHideOrdnance
    )
  );
  setRecommendationNoMainViaLimbs(
    normalizeBooleanParam(
      params.get(URL_PARAM_KEYS.recommendationNoMainViaLimbs),
      DEFAULT_CALCULATOR_URL_STATE.recommendationNoMainViaLimbs
    )
  );
  setRecommendationShotRange(
    params.has(URL_PARAM_KEYS.recommendationMinShots)
      ? Number(params.get(URL_PARAM_KEYS.recommendationMinShots))
      : DEFAULT_CALCULATOR_URL_STATE.recommendationMinShots,
    params.has(URL_PARAM_KEYS.recommendationMaxShots)
      ? params.get(URL_PARAM_KEYS.recommendationMaxShots)
      : DEFAULT_CALCULATOR_URL_STATE.recommendationMaxShots
  );

  setEnemySortState({
    key: params.get(URL_PARAM_KEYS.calculatorEnemySortKey) || DEFAULT_CALCULATOR_URL_STATE.enemySort.key,
    dir: params.get(URL_PARAM_KEYS.calculatorEnemySortDir) || DEFAULT_CALCULATOR_URL_STATE.enemySort.dir,
    groupMode: params.get(URL_PARAM_KEYS.enemySortGroupMode) || DEFAULT_CALCULATOR_URL_STATE.enemySort.groupMode
  });

  return {
    activeTab: normalizeTabId(params.get(URL_PARAM_KEYS.activeTab)),
    version: params.get(URL_PARAM_KEYS.version) || URL_STATE_VERSION
  };
}
