import {
  calculatorState,
  getEngagementRangeMeters,
  getSelectedEnemyTargetTypes,
  getSelectedOverviewOutcomeKinds,
  getSelectedExplosiveZoneIndices,
  getWeaponForSlot
} from '../data.js';
import { getEnemyFilterStateSnapshot } from '../../enemies/filters.js';
import { getWeaponFilterStateSnapshot } from '../../weapons/filters.js';
import {
  DEFAULT_CALCULATOR_URL_STATE,
  DEFAULT_ENEMY_TAB_URL_STATE,
  DEFAULT_WEAPON_TAB_URL_STATE,
  URL_PARAM_KEYS,
  URL_STATE_VERSION,
  normalizeTabId
} from './contract.js';
import {
  getEncodedAttackHitCountsValue,
  getEncodedSelectedAttackValue,
  hasSelectedExplosiveAttacks
} from './attack-selection-codec.js';
import { setJsonParam, setParam } from './param-codecs.js';

export function getActiveAppTabId() {
  const activeTabButton = globalThis.document?.querySelector('.tabs .tab.active');
  return normalizeTabId(activeTabButton?.dataset?.tab || 'calculator');
}

export function buildUrlStateSnapshot({
  activeTab = getActiveAppTabId()
} = {}) {
  const encodedAttackKeysA = getEncodedSelectedAttackValue('A');
  const encodedAttackKeysB = getEncodedSelectedAttackValue('B');
  const encodedAttackHitCountsA = getEncodedAttackHitCountsValue('A');
  const encodedAttackHitCountsB = getEncodedAttackHitCountsValue('B');
  const explosiveZoneIndices = hasSelectedExplosiveAttacks()
    ? [...getSelectedExplosiveZoneIndices()]
    : [];

  return {
    version: URL_STATE_VERSION,
    activeTab: normalizeTabId(activeTab),
    calculator: {
      mode: calculatorState.mode,
      compareView: calculatorState.compareView,
      weaponSortMode: calculatorState.weaponSortMode,
      enemyDropdownSortMode: calculatorState.enemyDropdownSortMode,
      enemyDropdownSortDir: calculatorState.enemyDropdownSortDir,
      enemyTableMode: calculatorState.enemyTableMode,
      overviewScope: calculatorState.overviewScope,
      enemyTargetTypes: [...getSelectedEnemyTargetTypes()],
      diffDisplayMode: calculatorState.diffDisplayMode,
      overviewOutcomeKinds: [...getSelectedOverviewOutcomeKinds()],
      engagementRangeMetersA: getEngagementRangeMeters('A'),
      engagementRangeMetersB: getEngagementRangeMeters('B'),
      weaponA: getWeaponForSlot('A')?.name || null,
      weaponB: getWeaponForSlot('B')?.name || null,
      selectedEnemy: calculatorState.selectedEnemy?.name || null,
      selectedZoneIndex: Number.isInteger(calculatorState.selectedZoneIndex)
        ? calculatorState.selectedZoneIndex
        : null,
      selectedExplosiveZoneIndices: explosiveZoneIndices,
      recommendationWeaponFilterMode: calculatorState.recommendationWeaponFilterMode,
      recommendationWeaponFilterTypes: [...calculatorState.recommendationWeaponFilterTypes],
      recommendationWeaponFilterSubs: [...calculatorState.recommendationWeaponFilterSubs],
      recommendationWeaponFilterGroups: [...calculatorState.recommendationWeaponFilterGroups],
      recommendationWeaponFilterRoles: [...calculatorState.recommendationWeaponFilterRoles],
      recommendationNoMainViaLimbs: calculatorState.recommendationNoMainViaLimbs,
      recommendationMinShots: calculatorState.recommendationMinShots,
      recommendationMaxShots: calculatorState.recommendationMaxShots,
      selectedAttackKeysA: encodedAttackKeysA,
      selectedAttackKeysB: encodedAttackKeysB,
      attackHitCountsA: encodedAttackHitCountsA,
      attackHitCountsB: encodedAttackHitCountsB,
      enemySort: { ...calculatorState.enemySort }
    },
    weapons: getWeaponFilterStateSnapshot(),
    enemies: getEnemyFilterStateSnapshot()
  };
}

export function encodeUrlState({
  activeTab = getActiveAppTabId()
} = {}) {
  const snapshot = buildUrlStateSnapshot({ activeTab });
  const params = new URLSearchParams();
  const { calculator, weapons, enemies } = snapshot;

  setParam(params, URL_PARAM_KEYS.version, snapshot.version, URL_STATE_VERSION);
  setParam(params, URL_PARAM_KEYS.activeTab, snapshot.activeTab, 'calculator');

  setParam(params, URL_PARAM_KEYS.calculatorMode, calculator.mode, DEFAULT_CALCULATOR_URL_STATE.mode);
  setParam(params, URL_PARAM_KEYS.compareView, calculator.compareView, DEFAULT_CALCULATOR_URL_STATE.compareView);
  setParam(params, URL_PARAM_KEYS.weaponSortMode, calculator.weaponSortMode, DEFAULT_CALCULATOR_URL_STATE.weaponSortMode);
  setParam(params, URL_PARAM_KEYS.enemyDropdownSortMode, calculator.enemyDropdownSortMode, DEFAULT_CALCULATOR_URL_STATE.enemyDropdownSortMode);
  setParam(params, URL_PARAM_KEYS.enemyDropdownSortDir, calculator.enemyDropdownSortDir, DEFAULT_CALCULATOR_URL_STATE.enemyDropdownSortDir);
  setParam(params, URL_PARAM_KEYS.enemyTableMode, calculator.enemyTableMode, DEFAULT_CALCULATOR_URL_STATE.enemyTableMode);
  setParam(params, URL_PARAM_KEYS.overviewScope, calculator.overviewScope, DEFAULT_CALCULATOR_URL_STATE.overviewScope);
  setJsonParam(params, URL_PARAM_KEYS.enemyTargetTypes, calculator.enemyTargetTypes, DEFAULT_CALCULATOR_URL_STATE.enemyTargetTypes);
  setParam(params, URL_PARAM_KEYS.diffDisplayMode, calculator.diffDisplayMode, DEFAULT_CALCULATOR_URL_STATE.diffDisplayMode);
  setJsonParam(params, URL_PARAM_KEYS.overviewOutcomeKinds, calculator.overviewOutcomeKinds, DEFAULT_CALCULATOR_URL_STATE.overviewOutcomeKinds);
  setParam(params, URL_PARAM_KEYS.engagementRangeMetersA, calculator.engagementRangeMetersA, DEFAULT_CALCULATOR_URL_STATE.engagementRangeMetersA);
  setParam(params, URL_PARAM_KEYS.engagementRangeMetersB, calculator.engagementRangeMetersB, DEFAULT_CALCULATOR_URL_STATE.engagementRangeMetersB);
  setParam(params, URL_PARAM_KEYS.weaponA, calculator.weaponA);
  setParam(params, URL_PARAM_KEYS.weaponB, calculator.weaponB);
  setParam(params, URL_PARAM_KEYS.selectedEnemy, calculator.selectedEnemy);
  setParam(params, URL_PARAM_KEYS.selectedZoneIndex, calculator.selectedZoneIndex);
  setJsonParam(params, URL_PARAM_KEYS.selectedExplosiveZoneIndices, calculator.selectedExplosiveZoneIndices, DEFAULT_CALCULATOR_URL_STATE.selectedExplosiveZoneIndices);
  setParam(params, URL_PARAM_KEYS.recommendationWeaponFilterMode, calculator.recommendationWeaponFilterMode, DEFAULT_CALCULATOR_URL_STATE.recommendationWeaponFilterMode);
  setJsonParam(params, URL_PARAM_KEYS.recommendationWeaponFilterTypes, calculator.recommendationWeaponFilterTypes, DEFAULT_CALCULATOR_URL_STATE.recommendationWeaponFilterTypes);
  setJsonParam(params, URL_PARAM_KEYS.recommendationWeaponFilterSubs, calculator.recommendationWeaponFilterSubs, DEFAULT_CALCULATOR_URL_STATE.recommendationWeaponFilterSubs);
  setJsonParam(params, URL_PARAM_KEYS.recommendationWeaponFilterGroups, calculator.recommendationWeaponFilterGroups, DEFAULT_CALCULATOR_URL_STATE.recommendationWeaponFilterGroups);
  setJsonParam(params, URL_PARAM_KEYS.recommendationWeaponFilterRoles, calculator.recommendationWeaponFilterRoles, DEFAULT_CALCULATOR_URL_STATE.recommendationWeaponFilterRoles);
  setParam(params, URL_PARAM_KEYS.recommendationNoMainViaLimbs, calculator.recommendationNoMainViaLimbs, DEFAULT_CALCULATOR_URL_STATE.recommendationNoMainViaLimbs);
  setParam(params, URL_PARAM_KEYS.recommendationMinShots, calculator.recommendationMinShots, DEFAULT_CALCULATOR_URL_STATE.recommendationMinShots);
  setParam(params, URL_PARAM_KEYS.recommendationMaxShots, calculator.recommendationMaxShots, DEFAULT_CALCULATOR_URL_STATE.recommendationMaxShots);
  setJsonParam(params, URL_PARAM_KEYS.selectedAttackKeysA, calculator.selectedAttackKeysA);
  setJsonParam(params, URL_PARAM_KEYS.selectedAttackKeysB, calculator.selectedAttackKeysB);
  setJsonParam(params, URL_PARAM_KEYS.attackHitCountsA, calculator.attackHitCountsA);
  setJsonParam(params, URL_PARAM_KEYS.attackHitCountsB, calculator.attackHitCountsB);
  setParam(params, URL_PARAM_KEYS.calculatorEnemySortKey, calculator.enemySort.key, DEFAULT_CALCULATOR_URL_STATE.enemySort.key);
  setParam(params, URL_PARAM_KEYS.calculatorEnemySortDir, calculator.enemySort.dir, DEFAULT_CALCULATOR_URL_STATE.enemySort.dir);
  setParam(params, URL_PARAM_KEYS.enemySortGroupMode, calculator.enemySort.groupMode, DEFAULT_CALCULATOR_URL_STATE.enemySort.groupMode);

  setParam(params, URL_PARAM_KEYS.weaponSearchQuery, weapons.searchQuery, DEFAULT_WEAPON_TAB_URL_STATE.searchQuery);
  setJsonParam(params, URL_PARAM_KEYS.weaponActiveTypes, weapons.activeTypes, DEFAULT_WEAPON_TAB_URL_STATE.activeTypes);
  setJsonParam(params, URL_PARAM_KEYS.weaponActiveSubs, weapons.activeSubs, DEFAULT_WEAPON_TAB_URL_STATE.activeSubs);
  setJsonParam(params, URL_PARAM_KEYS.weaponActiveRoles, weapons.activeRoles, DEFAULT_WEAPON_TAB_URL_STATE.activeRoles);
  setParam(params, URL_PARAM_KEYS.weaponSortKey, weapons.sortKey);
  setParam(params, URL_PARAM_KEYS.weaponSortDir, weapons.sortDir, DEFAULT_WEAPON_TAB_URL_STATE.sortDir);

  setParam(params, URL_PARAM_KEYS.enemySearchQuery, enemies.searchQuery, DEFAULT_ENEMY_TAB_URL_STATE.searchQuery);
  setJsonParam(params, URL_PARAM_KEYS.enemyActiveFactions, enemies.activeFactions, DEFAULT_ENEMY_TAB_URL_STATE.activeFactions);
  setParam(params, URL_PARAM_KEYS.enemyTabSortKey, enemies.sortKey);
  setParam(params, URL_PARAM_KEYS.enemyTabSortDir, enemies.sortDir, DEFAULT_ENEMY_TAB_URL_STATE.sortDir);

  return params;
}
