// calculator/data.js — calculator state management
import { state as weaponsState } from '../weapons/data.js';
import { enemyState } from '../enemies/data.js';
import { getAttackRowKey, getDefaultSelectedAttackKeys, getPreferredZoneIndex } from './compare-utils.js';
import {
  DEFAULT_ENEMY_TARGET_TYPE_IDS,
  getEnemyTargetTypeOptions,
  getOverviewScopeOptionGroups,
  getOverviewScopeOptions as getAvailableOverviewScopeOptions,
  normalizeEnemyScopeId,
  normalizeEnemyTargetTypeIds
} from './enemy-scope.js';
import {
  DEFAULT_WEAPON_SORT_MODE,
  getWeaponDropdownApInfo,
  getWeaponSortModeOptions,
  normalizeWeaponSortMode,
  sortWeaponOptions
} from './weapon-dropdown.js';
import {
  DEFAULT_ENEMY_DROPDOWN_SORT_MODE,
  getEnemyDropdownSortModeOptions,
  normalizeEnemyDropdownSortMode
} from './selector-utils.js';
import {
  DEFAULT_RECOMMENDATION_RANGE_METERS,
  normalizeRecommendationRangeMeters
} from './recommendations.js';

const DEFAULT_ENEMY_SORT = {
  key: 'zone_name',
  dir: 'asc',
  groupMode: 'none'
};
export const DEFAULT_CALCULATOR_MODE = 'compare';
export const DEFAULT_COMPARE_VIEW = 'focused';
export const DEFAULT_OVERVIEW_SCOPE = 'all';
export const DEFAULT_ENEMY_TARGET_TYPES = [...DEFAULT_ENEMY_TARGET_TYPE_IDS];
export { DEFAULT_WEAPON_SORT_MODE };
export { DEFAULT_ENEMY_DROPDOWN_SORT_MODE };

function normalizeSlot(slot) {
  return slot === 'B' ? 'B' : 'A';
}

function getWeaponStateKey(slot) {
  return normalizeSlot(slot) === 'B' ? 'weaponB' : 'weaponA';
}

function buildInitialHitCounts(attackKeys = []) {
  const hitCounts = {};
  attackKeys.forEach((attackKey) => {
    hitCounts[attackKey] = 1;
  });
  return hitCounts;
}

function normalizeHitCount(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 1) {
    return 1;
  }

  return Math.max(1, Math.round(numeric));
}

let calculatorStateChangeListener = null;

export function setCalculatorStateChangeListener(listener) {
  calculatorStateChangeListener = typeof listener === 'function' ? listener : null;
}

function notifyCalculatorStateChange() {
  calculatorStateChangeListener?.(calculatorState);
}

export const calculatorState = {
  mode: DEFAULT_CALCULATOR_MODE,
  compareView: DEFAULT_COMPARE_VIEW,
  weaponSortMode: DEFAULT_WEAPON_SORT_MODE,
  enemyDropdownSortMode: DEFAULT_ENEMY_DROPDOWN_SORT_MODE,
  enemyTableMode: 'analysis',
  overviewScope: DEFAULT_OVERVIEW_SCOPE,
  enemyTargetTypes: [...DEFAULT_ENEMY_TARGET_TYPES],
  diffDisplayMode: 'absolute',
  engagementRangeMeters: {
    A: DEFAULT_RECOMMENDATION_RANGE_METERS,
    B: DEFAULT_RECOMMENDATION_RANGE_METERS
  },
  weaponA: null,
  weaponB: null,
  selectedEnemy: null,
  selectedZoneIndex: null,
  selectedExplosiveZoneIndices: [],
  selectedAttackKeys: {
    A: [],
    B: []
  },
  attackHitCounts: {
    A: {},
    B: {}
  },
  enemySort: { ...DEFAULT_ENEMY_SORT }
};

Object.defineProperty(calculatorState, 'recommendationRangeMeters', {
  configurable: true,
  enumerable: true,
  get() {
    return Math.max(
      calculatorState.engagementRangeMeters.A ?? DEFAULT_RECOMMENDATION_RANGE_METERS,
      calculatorState.engagementRangeMeters.B ?? DEFAULT_RECOMMENDATION_RANGE_METERS
    );
  },
  set(value) {
    const normalizedRange = normalizeRecommendationRangeMeters(value);
    calculatorState.engagementRangeMeters.A = normalizedRange;
    calculatorState.engagementRangeMeters.B = normalizedRange;
  }
});

export function getWeaponOptions(slot = 'A') {
  if (!weaponsState.groups) {
    return [];
  }

  const options = weaponsState.groups
    .map((group) => ({
      id: group.name,
      name: group.name,
      type: group.type,
      sub: group.sub,
      code: group.code,
      rpm: group.rpm,
      rows: group.rows,
      index: group.index,
      apInfo: getWeaponDropdownApInfo(group)
    }));

  const otherSlot = normalizeSlot(slot) === 'B' ? 'A' : 'B';
  const referenceWeapon = calculatorState.mode === 'compare'
    ? calculatorState[getWeaponStateKey(otherSlot)] || null
    : null;

  return sortWeaponOptions(options, {
    sortMode: calculatorState.weaponSortMode,
    mode: calculatorState.mode,
    referenceWeapon
  });
}

export function getEnemyOptions() {
  return enemyState.units || [];
}

export function getOverviewScopeOptions() {
  return getAvailableOverviewScopeOptions(getEnemyOptions());
}

export function getOverviewScopeOptionGroupsForState() {
  return getOverviewScopeOptionGroups(getEnemyOptions());
}

export function getEnemyTargetTypeOptionsForState() {
  return getEnemyTargetTypeOptions(getEnemyOptions());
}

export function getEnemyDropdownSortModeOptionsForState() {
  return getEnemyDropdownSortModeOptions();
}

export function getWeaponSortModeOptionsForState() {
  return getWeaponSortModeOptions({ mode: calculatorState.mode });
}

export function getWeaponForSlot(slot = 'A') {
  return calculatorState[getWeaponStateKey(slot)] || null;
}

export function getActiveWeaponSlots() {
  return calculatorState.mode === 'compare' ? ['A', 'B'] : ['A'];
}

export function setCalculatorMode(mode) {
  calculatorState.mode = mode === 'compare' ? 'compare' : 'single';
  calculatorState.weaponSortMode = normalizeWeaponSortMode(calculatorState.weaponSortMode, {
    mode: calculatorState.mode
  });
  if (calculatorState.mode !== 'compare') {
    calculatorState.compareView = 'focused';
  }
  notifyCalculatorStateChange();
}

export function setWeaponSortMode(sortMode) {
  calculatorState.weaponSortMode = normalizeWeaponSortMode(sortMode, {
    mode: calculatorState.mode
  });
  notifyCalculatorStateChange();
}

export function setEnemyDropdownSortMode(sortMode) {
  calculatorState.enemyDropdownSortMode = normalizeEnemyDropdownSortMode(sortMode);
  notifyCalculatorStateChange();
}

export function setCompareView(view) {
  calculatorState.compareView = view === 'overview' ? 'overview' : 'focused';
  notifyCalculatorStateChange();
}

export function setEnemyTableMode(mode) {
  calculatorState.enemyTableMode = mode === 'stats' ? 'stats' : 'analysis';
  notifyCalculatorStateChange();
}

export function setOverviewScope(scope) {
  calculatorState.overviewScope = normalizeEnemyScopeId(scope || DEFAULT_OVERVIEW_SCOPE);
  notifyCalculatorStateChange();
}

export function getSelectedEnemyTargetTypes() {
  return [...calculatorState.enemyTargetTypes];
}

export function setSelectedEnemyTargetTypes(targetTypeIds) {
  calculatorState.enemyTargetTypes = normalizeEnemyTargetTypeIds(targetTypeIds);
  notifyCalculatorStateChange();
}

export function toggleSelectedEnemyTargetType(targetTypeId) {
  const normalizedTargetTypeIds = normalizeEnemyTargetTypeIds([targetTypeId]);
  if (normalizedTargetTypeIds.length === 0) {
    return [...calculatorState.enemyTargetTypes];
  }

  const selectedTargetTypeIds = new Set(calculatorState.enemyTargetTypes);
  const allSelected = normalizedTargetTypeIds.every((normalizedTargetTypeId) => (
    selectedTargetTypeIds.has(normalizedTargetTypeId)
  ));
  const nextTargetTypes = allSelected
    ? calculatorState.enemyTargetTypes.filter((value) => !normalizedTargetTypeIds.includes(value))
    : [...calculatorState.enemyTargetTypes, ...normalizedTargetTypeIds];

  calculatorState.enemyTargetTypes = normalizeEnemyTargetTypeIds(nextTargetTypes);
  notifyCalculatorStateChange();
  return [...calculatorState.enemyTargetTypes];
}

export function setDiffDisplayMode(mode) {
  calculatorState.diffDisplayMode = mode === 'percent' ? 'percent' : 'absolute';
  notifyCalculatorStateChange();
}

export function setRecommendationRangeMeters(value) {
  const normalizedRange = normalizeRecommendationRangeMeters(value);
  calculatorState.engagementRangeMeters.A = normalizedRange;
  calculatorState.engagementRangeMeters.B = normalizedRange;
  notifyCalculatorStateChange();
  return normalizedRange;
}

export function getEngagementRangeMeters(slot = 'A') {
  return calculatorState.engagementRangeMeters[normalizeSlot(slot)] ?? DEFAULT_RECOMMENDATION_RANGE_METERS;
}

export function setEngagementRangeMeters(slot, value) {
  const normalizedSlot = normalizeSlot(slot);
  const normalizedRange = normalizeRecommendationRangeMeters(value);
  calculatorState.engagementRangeMeters[normalizedSlot] = normalizedRange;
  notifyCalculatorStateChange();
  return normalizedRange;
}

export function setSelectedWeapon(slot, weapon) {
  const normalizedSlot = normalizeSlot(slot);
  calculatorState[getWeaponStateKey(normalizedSlot)] = weapon || null;
  calculatorState.selectedAttackKeys[normalizedSlot] = getDefaultSelectedAttackKeys(weapon);
  calculatorState.attackHitCounts[normalizedSlot] = buildInitialHitCounts(
    calculatorState.selectedAttackKeys[normalizedSlot]
  );
  notifyCalculatorStateChange();
}

export function getSelectedAttackKeys(slot = 'A') {
  return [...calculatorState.selectedAttackKeys[normalizeSlot(slot)]];
}

export function setSelectedAttack(slot, attackKey, checked) {
  const normalizedSlot = normalizeSlot(slot);
  const selectedKeys = calculatorState.selectedAttackKeys[normalizedSlot];
  const existingIndex = selectedKeys.indexOf(attackKey);

  if (checked) {
    if (existingIndex === -1) {
      selectedKeys.push(attackKey);
    }

    if (!calculatorState.attackHitCounts[normalizedSlot][attackKey]) {
      calculatorState.attackHitCounts[normalizedSlot][attackKey] = 1;
    }
    notifyCalculatorStateChange();
    return;
  }

  if (existingIndex !== -1) {
    selectedKeys.splice(existingIndex, 1);
  }

  delete calculatorState.attackHitCounts[normalizedSlot][attackKey];
  notifyCalculatorStateChange();
}

export function toggleSelectedAttack(slot, attackKey) {
  const normalizedSlot = normalizeSlot(slot);
  const isSelected = calculatorState.selectedAttackKeys[normalizedSlot].includes(attackKey);
  setSelectedAttack(normalizedSlot, attackKey, !isSelected);
}

export function setSelectedAttackKeys(slot, attackKeys = []) {
  const normalizedSlot = normalizeSlot(slot);
  const weapon = getWeaponForSlot(normalizedSlot);
  const validAttackKeys = new Set((weapon?.rows || []).map((row) => getAttackRowKey(row)));
  const normalizedAttackKeys = [...new Set(
    (Array.isArray(attackKeys) ? attackKeys : [])
      .map((attackKey) => String(attackKey || ''))
      .filter((attackKey) => attackKey && validAttackKeys.has(attackKey))
  )];

  calculatorState.selectedAttackKeys[normalizedSlot] = normalizedAttackKeys;
  calculatorState.attackHitCounts[normalizedSlot] = normalizedAttackKeys.reduce((hitCounts, attackKey) => {
    const existingValue = calculatorState.attackHitCounts[normalizedSlot][attackKey];
    hitCounts[attackKey] = normalizeHitCount(existingValue);
    return hitCounts;
  }, {});
  notifyCalculatorStateChange();
}

export function setAttackHitCount(slot, attackKey, value) {
  const normalizedSlot = normalizeSlot(slot);
  const normalizedAttackKey = String(attackKey || '');
  if (!normalizedAttackKey || !calculatorState.selectedAttackKeys[normalizedSlot].includes(normalizedAttackKey)) {
    return 1;
  }

  const nextValue = normalizeHitCount(value);
  calculatorState.attackHitCounts[normalizedSlot][normalizedAttackKey] = nextValue;
  notifyCalculatorStateChange();
  return nextValue;
}

export function setAttackHitCounts(slot, hitCountMap = {}) {
  const normalizedSlot = normalizeSlot(slot);
  const nextHitCounts = {};
  calculatorState.selectedAttackKeys[normalizedSlot].forEach((attackKey) => {
    nextHitCounts[attackKey] = normalizeHitCount(hitCountMap?.[attackKey]);
  });
  calculatorState.attackHitCounts[normalizedSlot] = nextHitCounts;
  notifyCalculatorStateChange();
}

export function getSelectedAttacks(slot = 'A') {
  const weapon = getWeaponForSlot(slot);
  if (!weapon?.rows) {
    return [];
  }

  const selectedKeySet = new Set(getSelectedAttackKeys(slot));
  return weapon.rows.filter((row) => selectedKeySet.has(getAttackRowKey(row)));
}

export function getAttackHitCounts(slot = 'A', selectedAttacks = getSelectedAttacks(slot)) {
  const normalizedSlot = normalizeSlot(slot);
  return selectedAttacks.map((attack) => {
    const attackKey = getAttackRowKey(attack);
    return calculatorState.attackHitCounts[normalizedSlot][attackKey] || 1;
  });
}

export function adjustAttackHitCount(slot, attackKey, delta) {
  const normalizedSlot = normalizeSlot(slot);
  const currentValue = calculatorState.attackHitCounts[normalizedSlot][attackKey] || 1;
  const nextValue = Math.max(1, currentValue + delta);
  calculatorState.attackHitCounts[normalizedSlot][attackKey] = nextValue;
  notifyCalculatorStateChange();
  return nextValue;
}

export function setSelectedEnemy(enemy) {
  calculatorState.selectedEnemy = enemy || null;
  const preferredZoneIndex = getPreferredZoneIndex(enemy);
  calculatorState.selectedZoneIndex = preferredZoneIndex;
  calculatorState.selectedExplosiveZoneIndices = Number.isInteger(preferredZoneIndex)
    ? [preferredZoneIndex]
    : [];
  if (enemy) {
    calculatorState.compareView = 'focused';
  }
  notifyCalculatorStateChange();
}

export function setSelectedZoneIndex(zoneIndex) {
  if (!Number.isInteger(zoneIndex) || zoneIndex < 0) {
    calculatorState.selectedZoneIndex = null;
    notifyCalculatorStateChange();
    return;
  }

  calculatorState.selectedZoneIndex = zoneIndex;
  notifyCalculatorStateChange();
}

export function getSelectedZone() {
  if (!calculatorState.selectedEnemy?.zones) {
    return null;
  }

  return calculatorState.selectedEnemy.zones[calculatorState.selectedZoneIndex] || null;
}

export function getSelectedExplosiveZoneIndices() {
  return [...calculatorState.selectedExplosiveZoneIndices];
}

export function setSelectedExplosiveZone(zoneIndex, selected) {
  if (!Number.isInteger(zoneIndex) || zoneIndex < 0) {
    return;
  }

  const existingIndex = calculatorState.selectedExplosiveZoneIndices.indexOf(zoneIndex);
  if (selected) {
    if (existingIndex === -1) {
      calculatorState.selectedExplosiveZoneIndices.push(zoneIndex);
    }
    notifyCalculatorStateChange();
    return;
  }

  if (existingIndex !== -1) {
    calculatorState.selectedExplosiveZoneIndices.splice(existingIndex, 1);
  }
  notifyCalculatorStateChange();
}

export function toggleSelectedExplosiveZone(zoneIndex) {
  const isSelected = calculatorState.selectedExplosiveZoneIndices.includes(zoneIndex);
  setSelectedExplosiveZone(zoneIndex, !isSelected);
}

export function setSelectedExplosiveZoneIndices(zoneIndices = []) {
  calculatorState.selectedExplosiveZoneIndices = [...new Set(
    (Array.isArray(zoneIndices) ? zoneIndices : [])
      .map((zoneIndex) => Number(zoneIndex))
      .filter((zoneIndex) => Number.isInteger(zoneIndex) && zoneIndex >= 0)
  )];
  notifyCalculatorStateChange();
}

export function getSelectedExplosiveZones() {
  if (!calculatorState.selectedEnemy?.zones) {
    return [];
  }

  return getSelectedExplosiveZoneIndices()
    .map((zoneIndex) => calculatorState.selectedEnemy.zones[zoneIndex] || null)
    .filter(Boolean);
}

export function toggleEnemySort(sortKey) {
  if (calculatorState.enemySort.key === sortKey) {
    calculatorState.enemySort.dir = calculatorState.enemySort.dir === 'asc' ? 'desc' : 'asc';
    notifyCalculatorStateChange();
    return;
  }

  calculatorState.enemySort.key = sortKey;
  calculatorState.enemySort.dir = 'asc';
  notifyCalculatorStateChange();
}

export function setEnemyGroupMode(groupMode) {
  calculatorState.enemySort.groupMode = groupMode === 'outcome' ? 'outcome' : 'none';
  notifyCalculatorStateChange();
}

export function setEnemySortState({
  key = DEFAULT_ENEMY_SORT.key,
  dir = DEFAULT_ENEMY_SORT.dir,
  groupMode = DEFAULT_ENEMY_SORT.groupMode
} = {}) {
  calculatorState.enemySort = {
    key: String(key || DEFAULT_ENEMY_SORT.key),
    dir: dir === 'desc' ? 'desc' : 'asc',
    groupMode: groupMode === 'outcome' ? 'outcome' : 'none'
  };
  notifyCalculatorStateChange();
}

export function resetEnemySort() {
  calculatorState.enemySort = { ...DEFAULT_ENEMY_SORT };
}
