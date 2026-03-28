// calculator/data.js — calculator state management
import { state as weaponsState } from '../weapons/data.js';
import { enemyState } from '../enemies/data.js';
import { getAttackRowKey, getDefaultSelectedAttackKeys, getPreferredZoneIndex } from './compare-utils.js';
import {
  getOverviewScopeOptionGroups,
  getOverviewScopeOptions as getAvailableOverviewScopeOptions,
  normalizeEnemyScopeId
} from './enemy-scope.js';
import {
  DEFAULT_WEAPON_SORT_MODE,
  getWeaponDropdownApInfo,
  getWeaponSortModeOptions,
  normalizeWeaponSortMode,
  sortWeaponOptions
} from './weapon-dropdown.js';

const DEFAULT_ENEMY_SORT = {
  key: 'zone_name',
  dir: 'asc',
  groupMode: 'none'
};
export const DEFAULT_CALCULATOR_MODE = 'compare';
export const DEFAULT_COMPARE_VIEW = 'focused';
export const DEFAULT_OVERVIEW_SCOPE = 'all';
export { DEFAULT_WEAPON_SORT_MODE };

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

export const calculatorState = {
  mode: DEFAULT_CALCULATOR_MODE,
  compareView: DEFAULT_COMPARE_VIEW,
  weaponSortMode: DEFAULT_WEAPON_SORT_MODE,
  enemyTableMode: 'analysis',
  overviewScope: DEFAULT_OVERVIEW_SCOPE,
  diffDisplayMode: 'absolute',
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
}

export function setWeaponSortMode(sortMode) {
  calculatorState.weaponSortMode = normalizeWeaponSortMode(sortMode, {
    mode: calculatorState.mode
  });
}

export function setCompareView(view) {
  calculatorState.compareView = view === 'overview' ? 'overview' : 'focused';
}

export function setEnemyTableMode(mode) {
  calculatorState.enemyTableMode = mode === 'stats' ? 'stats' : 'analysis';
}

export function setOverviewScope(scope) {
  calculatorState.overviewScope = normalizeEnemyScopeId(scope || DEFAULT_OVERVIEW_SCOPE);
}

export function setDiffDisplayMode(mode) {
  calculatorState.diffDisplayMode = mode === 'percent' ? 'percent' : 'absolute';
}

export function setSelectedWeapon(slot, weapon) {
  const normalizedSlot = normalizeSlot(slot);
  calculatorState[getWeaponStateKey(normalizedSlot)] = weapon || null;
  calculatorState.selectedAttackKeys[normalizedSlot] = getDefaultSelectedAttackKeys(weapon);
  calculatorState.attackHitCounts[normalizedSlot] = buildInitialHitCounts(
    calculatorState.selectedAttackKeys[normalizedSlot]
  );
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
    return;
  }

  if (existingIndex !== -1) {
    selectedKeys.splice(existingIndex, 1);
  }

  delete calculatorState.attackHitCounts[normalizedSlot][attackKey];
}

export function toggleSelectedAttack(slot, attackKey) {
  const normalizedSlot = normalizeSlot(slot);
  const isSelected = calculatorState.selectedAttackKeys[normalizedSlot].includes(attackKey);
  setSelectedAttack(normalizedSlot, attackKey, !isSelected);
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
}

export function setSelectedZoneIndex(zoneIndex) {
  if (!Number.isInteger(zoneIndex) || zoneIndex < 0) {
    calculatorState.selectedZoneIndex = null;
    return;
  }

  calculatorState.selectedZoneIndex = zoneIndex;
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
    return;
  }

  if (existingIndex !== -1) {
    calculatorState.selectedExplosiveZoneIndices.splice(existingIndex, 1);
  }
}

export function toggleSelectedExplosiveZone(zoneIndex) {
  const isSelected = calculatorState.selectedExplosiveZoneIndices.includes(zoneIndex);
  setSelectedExplosiveZone(zoneIndex, !isSelected);
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
    return;
  }

  calculatorState.enemySort.key = sortKey;
  calculatorState.enemySort.dir = 'asc';
}

export function setEnemyGroupMode(groupMode) {
  calculatorState.enemySort.groupMode = groupMode === 'outcome' ? 'outcome' : 'none';
}

export function resetEnemySort() {
  calculatorState.enemySort = { ...DEFAULT_ENEMY_SORT };
}
