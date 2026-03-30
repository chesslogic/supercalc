import {
  calculatorState,
  DEFAULT_COMPARE_VIEW,
  DEFAULT_OVERVIEW_SCOPE,
  DEFAULT_WEAPON_SORT_MODE,
  getSelectedAttackKeys,
  getSelectedAttacks,
  getSelectedEnemyTargetTypes,
  getSelectedExplosiveZoneIndices,
  getWeaponForSlot,
  setAttackHitCounts,
  setCalculatorMode,
  setCompareView,
  setDiffDisplayMode,
  setEnemySortState,
  setEnemyTableMode,
  setOverviewScope,
  setRecommendationRangeMeters,
  setSelectedAttackKeys,
  setSelectedEnemy,
  setSelectedEnemyTargetTypes,
  setSelectedExplosiveZoneIndices,
  setSelectedWeapon,
  setSelectedZoneIndex,
  setWeaponSortMode
} from './data.js';
import { DEFAULT_RECOMMENDATION_RANGE_METERS } from './recommendations.js';
import { isExplosiveAttack } from './attack-types.js';
import { getAttackRowKey, getDefaultSelectedAttackKeys } from './compare-utils.js';
import { state as weaponsState, DEFAULT_ACTIVE_WEAPON_TYPES } from '../weapons/data.js';
import { applyWeaponFilterState, getWeaponFilterStateSnapshot } from '../weapons/filters.js';
import { applyEnemyFilterState, getEnemyFilterStateSnapshot } from '../enemies/filters.js';
import { enemyState } from '../enemies/data.js';

export const URL_STATE_VERSION = '1';

const DEFAULT_CALCULATOR_URL_STATE = {
  mode: 'compare',
  compareView: DEFAULT_COMPARE_VIEW,
  weaponSortMode: DEFAULT_WEAPON_SORT_MODE,
  enemyTableMode: 'analysis',
  overviewScope: DEFAULT_OVERVIEW_SCOPE,
  enemyTargetTypes: getSelectedEnemyTargetTypes(),
  diffDisplayMode: 'absolute',
  recommendationRangeMeters: DEFAULT_RECOMMENDATION_RANGE_METERS,
  weaponA: null,
  weaponB: null,
  selectedEnemy: null,
  selectedZoneIndex: null,
  selectedExplosiveZoneIndices: [],
  selectedAttackKeysA: null,
  selectedAttackKeysB: null,
  attackHitCountsA: null,
  attackHitCountsB: null,
  enemySort: {
    key: 'zone_name',
    dir: 'asc',
    groupMode: 'none'
  }
};

const DEFAULT_WEAPON_TAB_URL_STATE = {
  searchQuery: '',
  activeTypes: [...DEFAULT_ACTIVE_WEAPON_TYPES],
  activeSubs: [],
  sortKey: null,
  sortDir: 'asc'
};

const DEFAULT_ENEMY_TAB_URL_STATE = {
  searchQuery: '',
  activeFactions: [],
  sortKey: null,
  sortDir: 'asc'
};

const URL_PARAM_KEYS = {
  version: 'sv',
  activeTab: 'tab',
  calculatorMode: 'cm',
  compareView: 'cv',
  weaponSortMode: 'cws',
  enemyTableMode: 'cetm',
  overviewScope: 'cos',
  enemyTargetTypes: 'cett',
  diffDisplayMode: 'cddm',
  recommendationRangeMeters: 'crm',
  weaponA: 'cwa',
  weaponB: 'cwb',
  selectedEnemy: 'cen',
  selectedZoneIndex: 'csz',
  selectedExplosiveZoneIndices: 'cez',
  selectedAttackKeysA: 'caa',
  selectedAttackKeysB: 'cab',
  attackHitCountsA: 'cha',
  attackHitCountsB: 'chb',
  enemySortKey: 'csk',
  enemySortDir: 'csd',
  enemySortGroupMode: 'csg',
  weaponSearchQuery: 'wsq',
  weaponActiveTypes: 'wty',
  weaponActiveSubs: 'wsub',
  weaponSortKey: 'wsk',
  weaponSortDir: 'wsd',
  enemySearchQuery: 'esq',
  enemyActiveFactions: 'efa',
  enemySortKey: 'esk',
  enemySortDir: 'esd'
};

const URL_STATE_PARAM_NAMES = new Set(Object.values(URL_PARAM_KEYS));

function normalizeTabId(tabId) {
  return ['weapons', 'enemies', 'calculator'].includes(tabId) ? tabId : 'calculator';
}

function isDeepEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function setParam(params, key, value, defaultValue = undefined) {
  if (value === undefined || value === null) {
    return;
  }

  if (defaultValue !== undefined && isDeepEqual(value, defaultValue)) {
    return;
  }

  params.set(key, String(value));
}

function setJsonParam(params, key, value, defaultValue = undefined) {
  if (value === undefined || value === null) {
    return;
  }

  if (defaultValue !== undefined && isDeepEqual(value, defaultValue)) {
    return;
  }

  params.set(key, JSON.stringify(value));
}

function parseJsonParam(params, key) {
  if (!params.has(key)) {
    return { present: false, value: null };
  }

  const rawValue = params.get(key);
  if (!rawValue) {
    return { present: true, value: null };
  }

  try {
    return {
      present: true,
      value: JSON.parse(rawValue)
    };
  } catch {
    return { present: true, value: null };
  }
}

function normalizeArrayOfStrings(values = [], { lowercase = false } = {}) {
  return [...new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => String(value ?? '').trim())
      .filter(Boolean)
      .map((value) => lowercase ? value.toLowerCase() : value)
  )];
}

function normalizeIntegerArray(values = []) {
  return [...new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value >= 0)
  )];
}

function normalizeHitCountMap(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return Object.entries(value).reduce((hitCounts, [attackKey, hitCount]) => {
    const normalizedAttackKey = String(attackKey || '').trim();
    const numericHitCount = Number(hitCount);
    if (!normalizedAttackKey || !Number.isFinite(numericHitCount) || numericHitCount < 1) {
      return hitCounts;
    }

    hitCounts[normalizedAttackKey] = Math.max(1, Math.round(numericHitCount));
    return hitCounts;
  }, {});
}

function isIntegerLike(value) {
  if (typeof value === 'number') {
    return Number.isInteger(value);
  }

  if (typeof value !== 'string' || value.trim() === '') {
    return false;
  }

  const numericValue = Number(value);
  return Number.isInteger(numericValue);
}

function getWeaponAttackRows(weapon) {
  return Array.isArray(weapon?.rows) ? weapon.rows : [];
}

function getAttackKeysForWeapon(weapon) {
  return getWeaponAttackRows(weapon).map((row) => getAttackRowKey(row));
}

function getSelectedAttackRowIndicesForWeapon(weapon, selectedAttackKeys = []) {
  if (!weapon) {
    return [];
  }

  const selectedKeySet = new Set(selectedAttackKeys);
  return getWeaponAttackRows(weapon).reduce((indices, row, rowIndex) => {
    if (selectedKeySet.has(getAttackRowKey(row))) {
      indices.push(rowIndex);
    }
    return indices;
  }, []);
}

function normalizeAttackSelectionValue(value, weapon) {
  const rows = getWeaponAttackRows(weapon);
  if (rows.length === 0) {
    return [];
  }

  const entries = Array.isArray(value) ? value : [];
  if (entries.every((entry) => isIntegerLike(entry))) {
    return [...new Set(
      entries
        .map((entry) => Number(entry))
        .filter((rowIndex) => Number.isInteger(rowIndex) && rowIndex >= 0 && rowIndex < rows.length)
        .map((rowIndex) => getAttackRowKey(rows[rowIndex]))
    )];
  }

  const validAttackKeys = new Set(getAttackKeysForWeapon(weapon));
  return normalizeArrayOfStrings(entries).filter((attackKey) => validAttackKeys.has(attackKey));
}

function normalizeAttackHitCountValue(value, weapon) {
  const rows = getWeaponAttackRows(weapon);
  if (!value || typeof value !== 'object' || Array.isArray(value) || rows.length === 0) {
    return {};
  }

  const validAttackKeys = new Set(getAttackKeysForWeapon(weapon));
  return Object.entries(value).reduce((hitCounts, [attackRef, hitCount]) => {
    const numericHitCount = Number(hitCount);
    if (!Number.isFinite(numericHitCount) || numericHitCount < 1) {
      return hitCounts;
    }

    let attackKey = '';
    if (isIntegerLike(attackRef)) {
      const rowIndex = Number(attackRef);
      attackKey = rowIndex >= 0 && rowIndex < rows.length
        ? getAttackRowKey(rows[rowIndex])
        : '';
    } else {
      const normalizedAttackKey = String(attackRef || '').trim();
      attackKey = validAttackKeys.has(normalizedAttackKey) ? normalizedAttackKey : '';
    }

    if (!attackKey) {
      return hitCounts;
    }

    hitCounts[attackKey] = Math.max(1, Math.round(numericHitCount));
    return hitCounts;
  }, {});
}

function getEncodedSelectedAttackValue(slot) {
  const weapon = getWeaponForSlot(slot);
  const selectedAttackKeys = getSelectedAttackKeys(slot);
  if (!weapon) {
    return null;
  }

  const defaultAttackKeys = getDefaultSelectedAttackKeys(weapon);
  if (isDeepEqual(selectedAttackKeys, defaultAttackKeys)) {
    return null;
  }

  return getSelectedAttackRowIndicesForWeapon(weapon, selectedAttackKeys);
}

function getEncodedAttackHitCountsValue(slot) {
  const weapon = getWeaponForSlot(slot);
  if (!weapon) {
    return null;
  }

  const selectedAttackKeys = getSelectedAttackKeys(slot);
  if (selectedAttackKeys.length === 0) {
    return null;
  }

  const selectedAttackIndices = getSelectedAttackRowIndicesForWeapon(weapon, selectedAttackKeys);
  const selectedAttackIndexByKey = new Map(
    selectedAttackIndices.map((rowIndex) => [getAttackRowKey(getWeaponAttackRows(weapon)[rowIndex]), rowIndex])
  );

  const hitCountState = calculatorState.attackHitCounts?.[slot] || {};
  const compactHitCounts = selectedAttackKeys.reduce((entries, attackKey) => {
    const hitCount = Number(hitCountState[attackKey]);
    const rowIndex = selectedAttackIndexByKey.get(attackKey);
    if (!Number.isFinite(hitCount) || hitCount <= 1 || !Number.isInteger(rowIndex)) {
      return entries;
    }

    entries[rowIndex] = Math.max(1, Math.round(hitCount));
    return entries;
  }, {});

  return Object.keys(compactHitCounts).length > 0 ? compactHitCounts : null;
}

function hasSelectedExplosiveAttacks() {
  return ['A', 'B'].some((slot) =>
    getSelectedAttacks(slot).some((attack) => isExplosiveAttack(attack))
  );
}

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
      enemyTableMode: calculatorState.enemyTableMode,
      overviewScope: calculatorState.overviewScope,
      enemyTargetTypes: [...getSelectedEnemyTargetTypes()],
      diffDisplayMode: calculatorState.diffDisplayMode,
      recommendationRangeMeters: calculatorState.recommendationRangeMeters,
      weaponA: getWeaponForSlot('A')?.name || null,
      weaponB: getWeaponForSlot('B')?.name || null,
      selectedEnemy: calculatorState.selectedEnemy?.name || null,
      selectedZoneIndex: Number.isInteger(calculatorState.selectedZoneIndex)
        ? calculatorState.selectedZoneIndex
        : null,
      selectedExplosiveZoneIndices: explosiveZoneIndices,
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
  setParam(params, URL_PARAM_KEYS.enemyTableMode, calculator.enemyTableMode, DEFAULT_CALCULATOR_URL_STATE.enemyTableMode);
  setParam(params, URL_PARAM_KEYS.overviewScope, calculator.overviewScope, DEFAULT_CALCULATOR_URL_STATE.overviewScope);
  setJsonParam(params, URL_PARAM_KEYS.enemyTargetTypes, calculator.enemyTargetTypes, DEFAULT_CALCULATOR_URL_STATE.enemyTargetTypes);
  setParam(params, URL_PARAM_KEYS.diffDisplayMode, calculator.diffDisplayMode, DEFAULT_CALCULATOR_URL_STATE.diffDisplayMode);
  setParam(params, URL_PARAM_KEYS.recommendationRangeMeters, calculator.recommendationRangeMeters, DEFAULT_CALCULATOR_URL_STATE.recommendationRangeMeters);
  setParam(params, URL_PARAM_KEYS.weaponA, calculator.weaponA);
  setParam(params, URL_PARAM_KEYS.weaponB, calculator.weaponB);
  setParam(params, URL_PARAM_KEYS.selectedEnemy, calculator.selectedEnemy);
  setParam(params, URL_PARAM_KEYS.selectedZoneIndex, calculator.selectedZoneIndex);
  setJsonParam(params, URL_PARAM_KEYS.selectedExplosiveZoneIndices, calculator.selectedExplosiveZoneIndices, DEFAULT_CALCULATOR_URL_STATE.selectedExplosiveZoneIndices);
  setJsonParam(params, URL_PARAM_KEYS.selectedAttackKeysA, calculator.selectedAttackKeysA);
  setJsonParam(params, URL_PARAM_KEYS.selectedAttackKeysB, calculator.selectedAttackKeysB);
  setJsonParam(params, URL_PARAM_KEYS.attackHitCountsA, calculator.attackHitCountsA);
  setJsonParam(params, URL_PARAM_KEYS.attackHitCountsB, calculator.attackHitCountsB);
  setParam(params, URL_PARAM_KEYS.enemySortKey, calculator.enemySort.key, DEFAULT_CALCULATOR_URL_STATE.enemySort.key);
  setParam(params, URL_PARAM_KEYS.enemySortDir, calculator.enemySort.dir, DEFAULT_CALCULATOR_URL_STATE.enemySort.dir);
  setParam(params, URL_PARAM_KEYS.enemySortGroupMode, calculator.enemySort.groupMode, DEFAULT_CALCULATOR_URL_STATE.enemySort.groupMode);

  setParam(params, URL_PARAM_KEYS.weaponSearchQuery, weapons.searchQuery, DEFAULT_WEAPON_TAB_URL_STATE.searchQuery);
  setJsonParam(params, URL_PARAM_KEYS.weaponActiveTypes, weapons.activeTypes, DEFAULT_WEAPON_TAB_URL_STATE.activeTypes);
  setJsonParam(params, URL_PARAM_KEYS.weaponActiveSubs, weapons.activeSubs, DEFAULT_WEAPON_TAB_URL_STATE.activeSubs);
  setParam(params, URL_PARAM_KEYS.weaponSortKey, weapons.sortKey);
  setParam(params, URL_PARAM_KEYS.weaponSortDir, weapons.sortDir, DEFAULT_WEAPON_TAB_URL_STATE.sortDir);

  setParam(params, URL_PARAM_KEYS.enemySearchQuery, enemies.searchQuery, DEFAULT_ENEMY_TAB_URL_STATE.searchQuery);
  setJsonParam(params, URL_PARAM_KEYS.enemyActiveFactions, enemies.activeFactions, DEFAULT_ENEMY_TAB_URL_STATE.activeFactions);
  setParam(params, URL_PARAM_KEYS.enemySortKey, enemies.sortKey);
  setParam(params, URL_PARAM_KEYS.enemySortDir, enemies.sortDir, DEFAULT_ENEMY_TAB_URL_STATE.sortDir);

  return params;
}

export function buildShareableUrl({
  activeTab = getActiveAppTabId()
} = {}) {
  const location = globalThis.location;
  const params = new URLSearchParams(location?.search || '');
  URL_STATE_PARAM_NAMES.forEach((key) => params.delete(key));
  encodeUrlState({ activeTab }).forEach((value, key) => {
    params.set(key, value);
  });
  const search = params.toString();
  const baseUrl = location
    ? `${location.origin || ''}${location.pathname || ''}`
    : '';
  return search ? `${baseUrl}?${search}` : baseUrl;
}

export async function copyShareableUrl({
  activeTab = getActiveAppTabId()
} = {}) {
  const url = buildShareableUrl({ activeTab });
  if (!url) {
    return { copied: false, url };
  }

  if (!globalThis.navigator?.clipboard?.writeText) {
    return { copied: false, url };
  }

  await globalThis.navigator.clipboard.writeText(url);
  return { copied: true, url };
}

export function syncUrlState({
  activeTab = getActiveAppTabId(),
  historyMode = 'replace'
} = {}) {
  const location = globalThis.location;
  const params = new URLSearchParams(location?.search || '');
  URL_STATE_PARAM_NAMES.forEach((key) => params.delete(key));
  encodeUrlState({ activeTab }).forEach((value, key) => {
    params.set(key, value);
  });
  const search = params.toString();
  const pathname = location?.pathname || '';
  const nextUrl = search ? `${pathname}?${search}` : pathname;

  if (globalThis.history?.replaceState) {
    if (historyMode === 'push' && globalThis.history.pushState) {
      globalThis.history.pushState(null, '', nextUrl);
    } else {
      globalThis.history.replaceState(null, '', nextUrl);
    }
  }

  return nextUrl;
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
    sortKey: params.get(URL_PARAM_KEYS.weaponSortKey) || null,
    sortDir: params.get(URL_PARAM_KEYS.weaponSortDir) || DEFAULT_WEAPON_TAB_URL_STATE.sortDir
  }, { render: false });

  applyEnemyFilterState({
    searchQuery: params.get(URL_PARAM_KEYS.enemySearchQuery) ?? DEFAULT_ENEMY_TAB_URL_STATE.searchQuery,
    activeFactions: params.has(URL_PARAM_KEYS.enemyActiveFactions)
      ? normalizeArrayOfStrings(parseJsonParam(params, URL_PARAM_KEYS.enemyActiveFactions).value)
      : DEFAULT_ENEMY_TAB_URL_STATE.activeFactions,
    sortKey: params.get(URL_PARAM_KEYS.enemySortKey) || null,
    sortDir: params.get(URL_PARAM_KEYS.enemySortDir) || DEFAULT_ENEMY_TAB_URL_STATE.sortDir
  }, { render: false });

  setCalculatorMode(params.get(URL_PARAM_KEYS.calculatorMode) || DEFAULT_CALCULATOR_URL_STATE.mode);
  setWeaponSortMode(params.get(URL_PARAM_KEYS.weaponSortMode) || DEFAULT_CALCULATOR_URL_STATE.weaponSortMode);
  setEnemyTableMode(params.get(URL_PARAM_KEYS.enemyTableMode) || DEFAULT_CALCULATOR_URL_STATE.enemyTableMode);
  setOverviewScope(params.get(URL_PARAM_KEYS.overviewScope) || DEFAULT_CALCULATOR_URL_STATE.overviewScope);
  setSelectedEnemyTargetTypes(
    params.has(URL_PARAM_KEYS.enemyTargetTypes)
      ? parseJsonParam(params, URL_PARAM_KEYS.enemyTargetTypes).value
      : DEFAULT_CALCULATOR_URL_STATE.enemyTargetTypes
  );
  setDiffDisplayMode(params.get(URL_PARAM_KEYS.diffDisplayMode) || DEFAULT_CALCULATOR_URL_STATE.diffDisplayMode);
  setRecommendationRangeMeters(
    params.get(URL_PARAM_KEYS.recommendationRangeMeters) ?? DEFAULT_CALCULATOR_URL_STATE.recommendationRangeMeters
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
  const requestedEnemy = requestedCompareView === 'overview'
    ? null
    : findEnemyByName(params.get(URL_PARAM_KEYS.selectedEnemy));
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

  setEnemySortState({
    key: params.get(URL_PARAM_KEYS.enemySortKey) || DEFAULT_CALCULATOR_URL_STATE.enemySort.key,
    dir: params.get(URL_PARAM_KEYS.enemySortDir) || DEFAULT_CALCULATOR_URL_STATE.enemySort.dir,
    groupMode: params.get(URL_PARAM_KEYS.enemySortGroupMode) || DEFAULT_CALCULATOR_URL_STATE.enemySort.groupMode
  });

  return {
    activeTab: normalizeTabId(params.get(URL_PARAM_KEYS.activeTab)),
    version: params.get(URL_PARAM_KEYS.version) || URL_STATE_VERSION
  };
}
