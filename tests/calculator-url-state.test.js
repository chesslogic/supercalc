import test from 'node:test';
import assert from 'node:assert/strict';
import './env-stubs.js';
import {
  makeAttackRow,
  makeExplosionAttackRow,
  makeWeapon,
  makeZone
} from './fixtures/weapon-fixtures.js';

const weaponsDataModule = await import('../weapons/data.js');
const enemiesDataModule = await import('../enemies/data.js');
const weaponFiltersModule = await import('../weapons/filters.js');
const enemyFiltersModule = await import('../enemies/filters.js');
const calculatorDataModule = await import('../calculator/data.js');
const urlStateModule = await import('../calculator/url-state.js');
const compareUtilsModule = await import('../calculator/compare-utils.js');

const {
  DEFAULT_ACTIVE_WEAPON_TYPES,
  setWeaponStateChangeListener,
  state: weaponsState
} = weaponsDataModule;
const {
  enemyState,
  setEnemyStateChangeListener
} = enemiesDataModule;
const {
  applyWeaponFilterState
} = weaponFiltersModule;
const {
  applyEnemyFilterState
} = enemyFiltersModule;
const {
  calculatorState,
  RECOMMENDATION_MAX_SHOTS_ANY,
  DEFAULT_OVERVIEW_OUTCOME_KINDS,
  getSelectedOverviewOutcomeKinds,
  setAttackHitCounts,
  setCalculatorMode,
  setCalculatorStateChangeListener,
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
  setRecommendationMinShots,
  setRecommendationMaxShots,
  setRecommendationWeaponFilterGroups,
  setRecommendationWeaponFilterMode,
  setRecommendationWeaponFilterRoles,
  setRecommendationWeaponFilterSubs,
  setRecommendationWeaponFilterTypes,
  setRecommendationRangeMeters,
  setSelectedAttackKeys,
  setSelectedEnemy,
  setSelectedEnemyTargetTypes,
  setSelectedOverviewOutcomeKinds,
  setSelectedExplosiveZoneIndices,
  setSelectedWeapon,
  setSelectedZoneIndex,
  setWeaponSortMode
} = calculatorDataModule;
const {
  buildShareableUrl,
  buildUrlStateSnapshot,
  encodeUrlState,
  hydrateUrlState,
  syncUrlState,
  URL_STATE_VERSION
} = urlStateModule;
const { getAttackRowKey } = compareUtilsModule;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function snapshotWeaponsState() {
  return {
    headers: weaponsState.headers,
    rows: weaponsState.rows,
    groups: weaponsState.groups,
    filteredGroups: weaponsState.filteredGroups,
    filterActive: weaponsState.filterActive,
    searchQuery: weaponsState.searchQuery,
    activeTypes: [...weaponsState.activeTypes],
    activeSubs: [...weaponsState.activeSubs],
    activeRoles: [...weaponsState.activeRoles],
    sortKey: weaponsState.sortKey,
    sortDir: weaponsState.sortDir,
    typeIndex: weaponsState.typeIndex,
    subIndex: weaponsState.subIndex,
    searchIndex: weaponsState.searchIndex,
    pinnedWeapons: new Set(weaponsState.pinnedWeapons),
    patchVersion: weaponsState.patchVersion,
    keys: { ...weaponsState.keys }
  };
}

function restoreWeaponsState(snapshot) {
  weaponsState.headers = snapshot.headers;
  weaponsState.rows = snapshot.rows;
  weaponsState.groups = snapshot.groups;
  weaponsState.filteredGroups = snapshot.filteredGroups;
  weaponsState.filterActive = snapshot.filterActive;
  weaponsState.searchQuery = snapshot.searchQuery;
  weaponsState.activeTypes = [...snapshot.activeTypes];
  weaponsState.activeSubs = [...snapshot.activeSubs];
  weaponsState.activeRoles = [...snapshot.activeRoles];
  weaponsState.sortKey = snapshot.sortKey;
  weaponsState.sortDir = snapshot.sortDir;
  weaponsState.typeIndex = snapshot.typeIndex;
  weaponsState.subIndex = snapshot.subIndex;
  weaponsState.searchIndex = snapshot.searchIndex;
  weaponsState.pinnedWeapons = new Set(snapshot.pinnedWeapons);
  weaponsState.patchVersion = snapshot.patchVersion;
  weaponsState.keys = { ...snapshot.keys };
}

function snapshotEnemyState() {
  return {
    factions: enemyState.factions,
    units: enemyState.units,
    inlineUnits: enemyState.inlineUnits,
    filteredUnits: enemyState.filteredUnits,
    filterActive: enemyState.filterActive,
    searchQuery: enemyState.searchQuery,
    activeFactions: [...enemyState.activeFactions],
    sortKey: enemyState.sortKey,
    sortDir: enemyState.sortDir,
    factionIndex: enemyState.factionIndex,
    searchIndex: enemyState.searchIndex,
    unitIndex: enemyState.unitIndex
  };
}

function restoreEnemyState(snapshot) {
  enemyState.factions = snapshot.factions;
  enemyState.units = snapshot.units;
  enemyState.inlineUnits = snapshot.inlineUnits;
  enemyState.filteredUnits = snapshot.filteredUnits;
  enemyState.filterActive = snapshot.filterActive;
  enemyState.searchQuery = snapshot.searchQuery;
  enemyState.activeFactions = [...snapshot.activeFactions];
  enemyState.sortKey = snapshot.sortKey;
  enemyState.sortDir = snapshot.sortDir;
  enemyState.factionIndex = snapshot.factionIndex;
  enemyState.searchIndex = snapshot.searchIndex;
  enemyState.unitIndex = snapshot.unitIndex;
}

function snapshotCalculatorState() {
  return {
    mode: calculatorState.mode,
    compareView: calculatorState.compareView,
    compareHeaderLayout: calculatorState.compareHeaderLayout,
    weaponSortMode: calculatorState.weaponSortMode,
    enemyDropdownSortMode: calculatorState.enemyDropdownSortMode,
    enemyDropdownSortDir: calculatorState.enemyDropdownSortDir,
    enemyTableMode: calculatorState.enemyTableMode,
    overviewScope: calculatorState.overviewScope,
    enemyTargetTypes: [...calculatorState.enemyTargetTypes],
    diffDisplayMode: calculatorState.diffDisplayMode,
    overviewOutcomeKinds: [...calculatorState.overviewOutcomeKinds],
    recommendationRangeMeters: calculatorState.recommendationRangeMeters,
    engagementRangeMeters: { ...calculatorState.engagementRangeMeters },
    weaponA: calculatorState.weaponA,
    weaponB: calculatorState.weaponB,
    selectedEnemy: calculatorState.selectedEnemy,
    selectedZoneIndex: calculatorState.selectedZoneIndex,
    selectedExplosiveZoneIndices: [...calculatorState.selectedExplosiveZoneIndices],
    recommendationWeaponFilterMode: calculatorState.recommendationWeaponFilterMode,
    recommendationWeaponFilterTypes: [...calculatorState.recommendationWeaponFilterTypes],
    recommendationWeaponFilterSubs: [...calculatorState.recommendationWeaponFilterSubs],
    recommendationWeaponFilterGroups: [...calculatorState.recommendationWeaponFilterGroups],
    recommendationWeaponFilterRoles: [...calculatorState.recommendationWeaponFilterRoles],
    recommendationHideOrdnance: calculatorState.recommendationHideOrdnance,
    recommendationNoMainViaLimbs: calculatorState.recommendationNoMainViaLimbs,
    recommendationMinShots: calculatorState.recommendationMinShots,
    recommendationMaxShots: calculatorState.recommendationMaxShots,
    selectedAttackKeys: {
      A: [...calculatorState.selectedAttackKeys.A],
      B: [...calculatorState.selectedAttackKeys.B]
    },
    attackHitCounts: {
      A: { ...calculatorState.attackHitCounts.A },
      B: { ...calculatorState.attackHitCounts.B }
    },
    enemySort: { ...calculatorState.enemySort }
  };
}

function restoreCalculatorState(snapshot) {
  calculatorState.mode = snapshot.mode;
  calculatorState.compareView = snapshot.compareView;
  calculatorState.compareHeaderLayout = snapshot.compareHeaderLayout;
  calculatorState.weaponSortMode = snapshot.weaponSortMode;
  calculatorState.enemyDropdownSortMode = snapshot.enemyDropdownSortMode;
  calculatorState.enemyDropdownSortDir = snapshot.enemyDropdownSortDir;
  calculatorState.enemyTableMode = snapshot.enemyTableMode;
  calculatorState.overviewScope = snapshot.overviewScope;
  calculatorState.enemyTargetTypes = [...snapshot.enemyTargetTypes];
  calculatorState.diffDisplayMode = snapshot.diffDisplayMode;
  calculatorState.overviewOutcomeKinds = [...snapshot.overviewOutcomeKinds];
  calculatorState.engagementRangeMeters = { ...snapshot.engagementRangeMeters };
  calculatorState.weaponA = snapshot.weaponA;
  calculatorState.weaponB = snapshot.weaponB;
  calculatorState.selectedEnemy = snapshot.selectedEnemy;
  calculatorState.selectedZoneIndex = snapshot.selectedZoneIndex;
  calculatorState.selectedExplosiveZoneIndices = [...snapshot.selectedExplosiveZoneIndices];
  calculatorState.recommendationWeaponFilterMode = snapshot.recommendationWeaponFilterMode;
  calculatorState.recommendationWeaponFilterTypes = [...snapshot.recommendationWeaponFilterTypes];
  calculatorState.recommendationWeaponFilterSubs = [...snapshot.recommendationWeaponFilterSubs];
  calculatorState.recommendationWeaponFilterGroups = [...snapshot.recommendationWeaponFilterGroups];
  calculatorState.recommendationWeaponFilterRoles = [...snapshot.recommendationWeaponFilterRoles];
  calculatorState.recommendationHideOrdnance = snapshot.recommendationHideOrdnance;
  calculatorState.recommendationNoMainViaLimbs = snapshot.recommendationNoMainViaLimbs;
  calculatorState.recommendationMinShots = snapshot.recommendationMinShots;
  calculatorState.recommendationMaxShots = snapshot.recommendationMaxShots;
  calculatorState.selectedAttackKeys = {
    A: [...snapshot.selectedAttackKeys.A],
    B: [...snapshot.selectedAttackKeys.B]
  };
  calculatorState.attackHitCounts = {
    A: { ...snapshot.attackHitCounts.A },
    B: { ...snapshot.attackHitCounts.B }
  };
  calculatorState.enemySort = { ...snapshot.enemySort };
}

function withStateFixture(callback) {
  const weaponSnapshot = snapshotWeaponsState();
  const enemySnapshot = snapshotEnemyState();
  const calculatorSnapshot = snapshotCalculatorState();

  setCalculatorStateChangeListener(null);
  setWeaponStateChangeListener(null);
  setEnemyStateChangeListener(null);

  try {
    return callback();
  } finally {
    restoreWeaponsState(weaponSnapshot);
    restoreEnemyState(enemySnapshot);
    restoreCalculatorState(calculatorSnapshot);
    setCalculatorStateChangeListener(null);
    setWeaponStateChangeListener(null);
    setEnemyStateChangeListener(null);
  }
}

// ===========================================================================
// Pinning tests: default / minimal state encoding
// ===========================================================================

test('encodeUrlState produces no calculator params when state is all defaults', { concurrency: false }, () => withStateFixture(() => {
  weaponsState.groups = [];
  enemyState.units = [];

  applyWeaponFilterState({
    searchQuery: '',
    activeTypes: DEFAULT_ACTIVE_WEAPON_TYPES,
    activeSubs: [],
    sortKey: null,
    sortDir: 'asc'
  }, { render: false });
  applyEnemyFilterState({
    searchQuery: '',
    activeFactions: [],
    sortKey: null,
    sortDir: 'asc'
  }, { render: false });

  const params = encodeUrlState({ activeTab: 'calculator' });
  const keys = [...params.keys()];

  assert.deepEqual(keys, [], 'default state should produce zero URL params');
}));

test('buildUrlStateSnapshot includes URL_STATE_VERSION', { concurrency: false }, () => withStateFixture(() => {
  const snapshot = buildUrlStateSnapshot({ activeTab: 'calculator' });
  assert.equal(snapshot.version, URL_STATE_VERSION);
  assert.equal(snapshot.activeTab, 'calculator');
}));

// ===========================================================================
// Tab normalization
// ===========================================================================

test('hydrateUrlState normalizes unknown tab ids to calculator', { concurrency: false }, () => withStateFixture(() => {
  const result = hydrateUrlState(new URLSearchParams({ tab: 'bogus-tab' }));
  assert.equal(result.activeTab, 'calculator');
}));

test('hydrateUrlState accepts all valid tab ids', { concurrency: false }, () => withStateFixture(() => {
  for (const tab of ['weapons', 'enemies', 'calculator', 'references']) {
    const result = hydrateUrlState(new URLSearchParams({ tab }));
    assert.equal(result.activeTab, tab, `tab '${tab}' should be preserved`);
  }
}));

// ===========================================================================
// Empty / missing params → defaults
// ===========================================================================

test('hydrateUrlState with empty search string restores defaults', { concurrency: false }, () => withStateFixture(() => {
  setCalculatorMode('single');
  setCompareHeaderLayout('slot');
  setDiffDisplayMode('percent');
  setOverviewScope('automatons');
  setSelectedOverviewOutcomeKinds(['main']);

  hydrateUrlState('');

  assert.equal(calculatorState.mode, 'compare');
  assert.equal(calculatorState.compareHeaderLayout, 'metric');
  assert.equal(calculatorState.diffDisplayMode, 'absolute');
  assert.equal(calculatorState.overviewScope, 'all');
  assert.deepEqual(calculatorState.overviewOutcomeKinds, DEFAULT_OVERVIEW_OUTCOME_KINDS);
}));

test('hydrateUrlState with no params resets enemy sort to defaults', { concurrency: false }, () => withStateFixture(() => {
  setEnemySortState({ key: 'health', dir: 'desc', groupMode: 'outcome' });

  hydrateUrlState('');

  assert.deepEqual(calculatorState.enemySort, {
    key: 'zone_name',
    dir: 'asc',
    groupMode: 'none'
  });
}));

// ===========================================================================
// Invalid / garbage JSON params
// ===========================================================================

test('hydrateUrlState ignores malformed JSON in attack keys param', { concurrency: false }, () => withStateFixture(() => {
  const weapon = makeWeapon('TestGun', {
    rows: [makeAttackRow('Bullet', 100)]
  });
  weaponsState.groups = [weapon];

  hydrateUrlState(new URLSearchParams({
    cwa: 'TestGun',
    caa: '{not valid json'
  }));

  assert.equal(calculatorState.weaponA?.name, 'TestGun');
  assert.deepEqual(calculatorState.selectedAttackKeys.A, []);
}));

test('hydrateUrlState normalizes malformed JSON in hit counts param to empty map', { concurrency: false }, () => withStateFixture(() => {
  const weapon = makeWeapon('TestGun', {
    rows: [makeAttackRow('Bullet', 100)]
  });
  weaponsState.groups = [weapon];

  // Pre-set a meaningful hit count to show hydration resets it
  setSelectedWeapon('A', weapon);
  const attackKey = getAttackRowKey(weapon.rows[0]);
  setSelectedAttackKeys('A', [attackKey]);
  setAttackHitCounts('A', { [attackKey]: 7 });

  hydrateUrlState(new URLSearchParams({
    cwa: 'TestGun',
    caa: JSON.stringify([0]),
    cha: '%%%broken%%%'
  }));

  // Malformed JSON parses to null → normalizeAttackHitCountValue(null, weapon) → {}
  // but setAttackHitCounts merges, so the current behavior is hit count resets to 1
  const hitCount = calculatorState.attackHitCounts.A[attackKey];
  assert.ok(hitCount === undefined || hitCount <= 1,
    'malformed hit count JSON should not preserve pre-existing hit counts > 1');
}));

test('hydrateUrlState treats malformed explosive zone JSON as empty', { concurrency: false }, () => withStateFixture(() => {
  hydrateUrlState(new URLSearchParams({ cez: 'not-an-array' }));

  assert.deepEqual(calculatorState.selectedExplosiveZoneIndices, []);
}));

// ===========================================================================
// Unknown weapon names
// ===========================================================================

test('hydrateUrlState sets weapon to null when name not found', { concurrency: false }, () => withStateFixture(() => {
  const weapon = makeWeapon('RealGun', { rows: [makeAttackRow('Shot', 50)] });
  weaponsState.groups = [weapon];

  hydrateUrlState(new URLSearchParams({
    cwa: 'NonexistentWeapon',
    cwb: 'AlsoFake'
  }));

  assert.equal(calculatorState.weaponA, null);
  assert.equal(calculatorState.weaponB, null);
}));

// ===========================================================================
// Overview mode preserves remembered focused enemy
// ===========================================================================

test('hydrateUrlState preserves enemy when compareView is overview', { concurrency: false }, () => withStateFixture(() => {
  const enemy = {
    name: 'Hulk',
    faction: 'Automaton',
    zones: [makeZone('body', { health: 500 })]
  };
  enemyState.units = [enemy];

  hydrateUrlState(new URLSearchParams({
    cv: 'overview',
    cen: 'Hulk'
  }));

  assert.equal(calculatorState.compareView, 'overview');
  assert.equal(calculatorState.selectedEnemy?.name, 'Hulk');
}));

test('hydrateUrlState preserves enemy when compareView is focused', { concurrency: false }, () => withStateFixture(() => {
  const enemy = {
    name: 'Hulk',
    faction: 'Automaton',
    zones: [makeZone('body', { health: 500 })]
  };
  enemyState.units = [enemy];

  hydrateUrlState(new URLSearchParams({
    cv: 'focused',
    cen: 'Hulk'
  }));

  assert.equal(calculatorState.compareView, 'focused');
  assert.equal(calculatorState.selectedEnemy?.name, 'Hulk');
}));

// ===========================================================================
// Zone index edge cases
// ===========================================================================

test('hydrateUrlState ignores negative zone index', { concurrency: false }, () => withStateFixture(() => {
  setSelectedZoneIndex(2);

  hydrateUrlState(new URLSearchParams({ csz: '-1' }));

  assert.notEqual(calculatorState.selectedZoneIndex, -1);
}));

test('hydrateUrlState ignores non-integer zone index', { concurrency: false }, () => withStateFixture(() => {
  setSelectedZoneIndex(null);

  hydrateUrlState(new URLSearchParams({ csz: 'abc' }));

  assert.equal(calculatorState.selectedZoneIndex, null);
}));

test('hydrateUrlState accepts valid zone index zero', { concurrency: false }, () => withStateFixture(() => {
  hydrateUrlState(new URLSearchParams({ csz: '0' }));

  assert.equal(calculatorState.selectedZoneIndex, 0);
}));

// ===========================================================================
// Attack selection: index-based round-trip
// ===========================================================================

test('hydrateUrlState resolves index-based attack selection to attack keys', { concurrency: false }, () => withStateFixture(() => {
  const weapon = makeWeapon('MultiShot', {
    rows: [
      makeAttackRow('Burst', 50),
      makeAttackRow('Slug', 200),
      makeAttackRow('Frag', 150)
    ]
  });
  weaponsState.groups = [weapon];
  const expectedKey0 = getAttackRowKey(weapon.rows[0]);
  const expectedKey2 = getAttackRowKey(weapon.rows[2]);

  hydrateUrlState(new URLSearchParams({
    cwa: 'MultiShot',
    caa: JSON.stringify([0, 2])
  }));

  assert.deepEqual(calculatorState.selectedAttackKeys.A, [expectedKey0, expectedKey2]);
}));

test('hydrateUrlState ignores out-of-range attack indices', { concurrency: false }, () => withStateFixture(() => {
  const weapon = makeWeapon('SmallGun', {
    rows: [makeAttackRow('Shot', 80)]
  });
  weaponsState.groups = [weapon];
  const validKey = getAttackRowKey(weapon.rows[0]);

  hydrateUrlState(new URLSearchParams({
    cwa: 'SmallGun',
    caa: JSON.stringify([0, 5, -1, 99])
  }));

  assert.deepEqual(calculatorState.selectedAttackKeys.A, [validKey]);
}));

// ===========================================================================
// Hit count normalization via round-trip
// ===========================================================================

test('encodeUrlState omits hit counts of 1 or less', { concurrency: false }, () => withStateFixture(() => {
  const weapon = makeWeapon('HitCounter', {
    rows: [
      makeAttackRow('Alpha', 100),
      makeAttackRow('Beta', 200)
    ]
  });
  weaponsState.groups = [weapon];
  const keyAlpha = getAttackRowKey(weapon.rows[0]);
  const keyBeta = getAttackRowKey(weapon.rows[1]);

  setSelectedWeapon('A', weapon);
  setSelectedAttackKeys('A', [keyAlpha, keyBeta]);
  setAttackHitCounts('A', { [keyAlpha]: 1, [keyBeta]: 0.5 });

  const params = encodeUrlState({ activeTab: 'calculator' });

  assert.equal(params.has('cha'), false, 'hit counts ≤ 1 should not be encoded');
}));

test('encodeUrlState encodes hit count > 1 by attack row index', { concurrency: false }, () => withStateFixture(() => {
  const weapon = makeWeapon('HitCounter', {
    rows: [
      makeAttackRow('Alpha', 100),
      makeAttackRow('Beta', 200)
    ]
  });
  weaponsState.groups = [weapon];
  const keyAlpha = getAttackRowKey(weapon.rows[0]);
  const keyBeta = getAttackRowKey(weapon.rows[1]);

  setSelectedWeapon('A', weapon);
  setSelectedAttackKeys('A', [keyAlpha, keyBeta]);
  setAttackHitCounts('A', { [keyAlpha]: 5, [keyBeta]: 3 });

  const params = encodeUrlState({ activeTab: 'calculator' });
  const hitCounts = JSON.parse(params.get('cha'));

  assert.deepEqual(hitCounts, { 0: 5, 1: 3 });
}));

test('hydrateUrlState rounds fractional hit counts to nearest integer', { concurrency: false }, () => withStateFixture(() => {
  const weapon = makeWeapon('FracGun', {
    rows: [makeAttackRow('Shot', 100)]
  });
  weaponsState.groups = [weapon];
  const key = getAttackRowKey(weapon.rows[0]);

  hydrateUrlState(new URLSearchParams({
    cwa: 'FracGun',
    caa: JSON.stringify([0]),
    cha: JSON.stringify({ 0: 3.7 })
  }));

  assert.equal(calculatorState.attackHitCounts.A[key], 4);
}));

// ===========================================================================
// Explosive zone indices encoding
// ===========================================================================

test('encodeUrlState omits explosive zone indices when no explosive attacks are selected', { concurrency: false }, () => withStateFixture(() => {
  const weapon = makeWeapon('PlainGun', {
    rows: [makeAttackRow('Bullet', 100)]
  });
  weaponsState.groups = [weapon];

  setSelectedWeapon('A', weapon);
  setSelectedAttackKeys('A', [getAttackRowKey(weapon.rows[0])]);
  setSelectedExplosiveZoneIndices([0, 1, 2]);

  const params = encodeUrlState({ activeTab: 'calculator' });
  assert.equal(params.has('cez'), false, 'non-explosive selection should omit explosive zones');
}));

test('encodeUrlState includes explosive zone indices when explosive attacks are selected', { concurrency: false }, () => withStateFixture(() => {
  const weapon = makeWeapon('RocketLauncher', {
    rows: [makeExplosionAttackRow('HE Rocket', 500)]
  });
  weaponsState.groups = [weapon];

  setSelectedWeapon('A', weapon);
  setSelectedAttackKeys('A', [getAttackRowKey(weapon.rows[0])]);
  setSelectedExplosiveZoneIndices([1, 3]);

  const params = encodeUrlState({ activeTab: 'calculator' });
  assert.deepEqual(JSON.parse(params.get('cez')), [1, 3]);
}));

// ===========================================================================
// Encode → hydrate → encode round-trip stability
// ===========================================================================

test('encode-hydrate-encode produces identical URL params', { concurrency: false }, () => withStateFixture(() => {
  const breaker = makeWeapon('Breaker', {
    code: 'SG-225',
    sub: 'SG',
    rows: [
      makeAttackRow('12g BUCKSHOT_P x11', 30, 2),
      makeAttackRow('12g SLUG_P', 280, 3)
    ]
  });
  const railgun = makeWeapon('Railgun', {
    code: 'RS-422',
    sub: 'SPC',
    type: 'Support',
    rows: [makeAttackRow('Railgun Slug', 600, 5)]
  });
  const enemy = {
    name: 'Practice Hulk',
    faction: 'Automaton',
    zones: [
      makeZone('head', { health: 100, isFatal: true, av: 1, toMainPercent: 1 }),
      makeZone('body', { health: 500, av: 4 })
    ]
  };

  weaponsState.groups = [breaker, railgun];
  enemyState.units = [enemy];

  setCalculatorMode('single');
  setWeaponSortMode('ap-desc');
  setEnemyDropdownSortMode('alphabetical');
  setEnemyDropdownSortDir('desc');
  setEnemyTableMode('stats');
  setCompareHeaderLayout('slot');
  setOverviewScope('automatons');
  setDiffDisplayMode('percent');
  setSelectedOverviewOutcomeKinds(['Part', 'Kill', 'Main']);
  setSelectedWeapon('A', breaker);
  setSelectedWeapon('B', railgun);
  const attackKey = getAttackRowKey(breaker.rows[1]);
  setSelectedAttackKeys('A', [attackKey]);
  setAttackHitCounts('A', { [attackKey]: 3 });
  setSelectedEnemy(enemy);
  setSelectedZoneIndex(1);
  setRecommendationWeaponFilterMode('exclude');
  setRecommendationWeaponFilterTypes(['support']);
  setRecommendationWeaponFilterSubs(['spc']);
  setRecommendationWeaponFilterGroups(['special']);
  setRecommendationWeaponFilterRoles(['precision']);
  setEnemySortState({ key: 'health', dir: 'desc', groupMode: 'outcome' });
  setEngagementRangeMeters('A', 50);
  setEngagementRangeMeters('B', 80);
  applyWeaponFilterState({
    searchQuery: 'rail',
    activeTypes: ['support'],
    activeSubs: ['spc'],
    activeRoles: ['precision'],
    sortKey: 'AP',
    sortDir: 'desc'
  }, { render: false });
  applyEnemyFilterState({
    searchQuery: 'hulk',
    activeFactions: ['Automaton'],
    sortKey: 'AV',
    sortDir: 'desc'
  }, { render: false });

  const firstParams = encodeUrlState({ activeTab: 'weapons' });
  const firstParamString = firstParams.toString();

  assert.equal(firstParams.get('chl'), 'slot');
  assert.equal(firstParams.get('csk'), 'health');
  assert.equal(firstParams.get('csd'), 'desc');
  assert.equal(firstParams.get('csg'), 'outcome');
  assert.equal(firstParams.get('coo'), JSON.stringify(['main', 'fatal', 'utility']));
  assert.equal(firstParams.get('esk'), 'AV');
  assert.equal(firstParams.get('esd'), 'desc');

  // Reset everything to defaults then hydrate from the first encoding
  setCalculatorMode('compare');
  setWeaponSortMode('grouped');
  setEnemyDropdownSortMode('targets');
  setEnemyDropdownSortDir('asc');
  setEnemyTableMode('analysis');
  setCompareHeaderLayout('metric');
  setOverviewScope('all');
  setDiffDisplayMode('absolute');
  setSelectedOverviewOutcomeKinds(DEFAULT_OVERVIEW_OUTCOME_KINDS);
  setSelectedWeapon('A', null);
  setSelectedWeapon('B', null);
  setSelectedEnemy(null);
  setSelectedZoneIndex(null);
  setSelectedExplosiveZoneIndices([]);
  setRecommendationWeaponFilterMode('include');
  setRecommendationWeaponFilterTypes([]);
  setRecommendationWeaponFilterSubs([]);
  setRecommendationWeaponFilterGroups([]);
  setRecommendationWeaponFilterRoles([]);
  setEnemySortState({ key: 'zone_name', dir: 'asc', groupMode: 'none' });
  setEngagementRangeMeters('A', 30);
  setEngagementRangeMeters('B', 30);
  applyWeaponFilterState({
    searchQuery: '',
    activeTypes: DEFAULT_ACTIVE_WEAPON_TYPES,
    activeSubs: [],
    activeRoles: [],
    sortKey: null,
    sortDir: 'asc'
  }, { render: false });
  applyEnemyFilterState({
    searchQuery: '',
    activeFactions: [],
    sortKey: null,
    sortDir: 'asc'
  }, { render: false });

  hydrateUrlState(firstParams);

  assert.deepEqual(calculatorState.enemySort, {
    key: 'health',
    dir: 'desc',
    groupMode: 'outcome'
  });
  assert.equal(enemyState.sortKey, 'AV');
  assert.equal(enemyState.sortDir, 'desc');

  const secondParams = encodeUrlState({ activeTab: 'weapons' });
  const secondParamString = secondParams.toString();

  assert.equal(secondParamString, firstParamString,
    'second encode after hydrate should match first encode');
}));

// ===========================================================================
// Partial URL params → only those fields change
// ===========================================================================

test('hydrateUrlState with only mode param leaves other fields at defaults', { concurrency: false }, () => withStateFixture(() => {
  hydrateUrlState(new URLSearchParams({ cm: 'single' }));

  assert.equal(calculatorState.mode, 'single');
  assert.equal(calculatorState.diffDisplayMode, 'absolute');
  assert.equal(calculatorState.overviewScope, 'all');
  assert.deepEqual(calculatorState.overviewOutcomeKinds, DEFAULT_OVERVIEW_OUTCOME_KINDS);
  assert.equal(calculatorState.enemyTableMode, 'analysis');
}));

// ===========================================================================
// Recommendation weapon filter round-trip
// ===========================================================================

test('encodeUrlState omits default recommendation filter mode (include)', { concurrency: false }, () => withStateFixture(() => {
  const params = encodeUrlState({ activeTab: 'calculator' });
  assert.equal(params.has('crfm'), false);
}));

test('encodeUrlState encodes non-default recommendation filter mode', { concurrency: false }, () => withStateFixture(() => {
  setRecommendationWeaponFilterMode('exclude');
  const params = encodeUrlState({ activeTab: 'calculator' });
  assert.equal(params.get('crfm'), 'exclude');
}));

test('encodeUrlState encodes non-default recommendation type filter', { concurrency: false }, () => withStateFixture(() => {
  setRecommendationWeaponFilterTypes(['primary', 'support']);

  const params = encodeUrlState({ activeTab: 'calculator' });

  assert.deepEqual(JSON.parse(params.get('crft')), ['primary', 'support']);
}));

test('hydrateUrlState restores recommendation type filter from crft', { concurrency: false }, () => withStateFixture(() => {
  hydrateUrlState(new URLSearchParams({
    crft: JSON.stringify(['support'])
  }));

  assert.deepEqual(calculatorState.recommendationWeaponFilterTypes, ['support']);
}));

test('encodeUrlState encodes non-default recommendation sub filter', { concurrency: false }, () => withStateFixture(() => {
  setRecommendationWeaponFilterSubs(['ar', 'rl']);

  const params = encodeUrlState({ activeTab: 'calculator' });

  assert.deepEqual(JSON.parse(params.get('crfs')), ['ar', 'rl']);
}));

test('hydrateUrlState restores recommendation sub filter from crfs', { concurrency: false }, () => withStateFixture(() => {
  hydrateUrlState(new URLSearchParams({
    crfs: JSON.stringify(['spc'])
  }));

  assert.deepEqual(calculatorState.recommendationWeaponFilterSubs, ['spc']);
}));

test('encodeUrlState encodes non-default recommendation feature filter', { concurrency: false }, () => withStateFixture(() => {
  setRecommendationWeaponFilterGroups(['auto', 'ordnance']);

  const params = encodeUrlState({ activeTab: 'calculator' });

  assert.deepEqual(JSON.parse(params.get('crfg')), ['auto', 'ordnance']);
}));

test('hydrateUrlState restores recommendation feature filter from crfg', { concurrency: false }, () => withStateFixture(() => {
  hydrateUrlState(new URLSearchParams({
    crfg: JSON.stringify(['special'])
  }));

  assert.deepEqual(calculatorState.recommendationWeaponFilterGroups, ['special']);
}));

test('encodeUrlState and hydrateUrlState round-trip the no-main-via-limbs preference', { concurrency: false }, () => withStateFixture(() => {
  setRecommendationNoMainViaLimbs(false);

  const params = encodeUrlState({ activeTab: 'calculator' });
  assert.equal(params.get('crnl'), 'false');

  setRecommendationNoMainViaLimbs(true);
  hydrateUrlState(params);

  assert.equal(calculatorState.recommendationNoMainViaLimbs, false);
}));

test('encodeUrlState and hydrateUrlState round-trip the hide-ordnance preference', { concurrency: false }, () => withStateFixture(() => {
  setRecommendationHideOrdnance(false);

  const params = encodeUrlState({ activeTab: 'calculator' });
  assert.equal(params.get('crho'), 'false');

  setRecommendationHideOrdnance(true);
  hydrateUrlState(params);

  assert.equal(calculatorState.recommendationHideOrdnance, false);
}));

test('hydrateUrlState resets the hide-ordnance preference to default when param absent', { concurrency: false }, () => withStateFixture(() => {
  setRecommendationHideOrdnance(false);

  hydrateUrlState(new URLSearchParams({}));

  assert.equal(calculatorState.recommendationHideOrdnance, true);
}));

// ===========================================================================
// Enemy target types
// ===========================================================================

test('hydrateUrlState restores non-default enemy target types', { concurrency: false }, () => withStateFixture(() => {
  hydrateUrlState(new URLSearchParams({
    cett: JSON.stringify(['giant'])
  }));

  assert.deepEqual(calculatorState.enemyTargetTypes, ['giant']);
}));

test('hydrateUrlState normalizes minus/base/plus enemy target ids to their broad bands', { concurrency: false }, () => withStateFixture(() => {
  hydrateUrlState(new URLSearchParams({
    cett: JSON.stringify(['medium+', 'chaff-'])
  }));

  assert.deepEqual(calculatorState.enemyTargetTypes, ['medium', 'chaff']);
}));

test('hydrateUrlState with missing enemy target types param uses defaults', { concurrency: false }, () => withStateFixture(() => {
  setSelectedEnemyTargetTypes(['giant']);

  hydrateUrlState(new URLSearchParams({}));

  // Should revert to the default target types
  assert.ok(
    calculatorState.enemyTargetTypes.length > 0,
    'default target types should be non-empty'
  );
}));

// ===========================================================================
// Overview outcome kinds
// ===========================================================================

test('encodeUrlState encodes non-default overview outcome kinds', { concurrency: false }, () => withStateFixture(() => {
  setSelectedOverviewOutcomeKinds(['Part', 'Kill', 'Main']);

  const params = encodeUrlState({ activeTab: 'calculator' });

  assert.equal(params.get('coo'), JSON.stringify(['main', 'fatal', 'utility']));
}));

test('hydrateUrlState restores overview outcome kinds in compare outcome order', { concurrency: false }, () => withStateFixture(() => {
  hydrateUrlState(new URLSearchParams({
    coo: JSON.stringify(['Part', 'fatal', 'Main'])
  }));

  assert.deepEqual(getSelectedOverviewOutcomeKinds(), ['main', 'fatal', 'utility']);
}));

test('hydrateUrlState with missing overview outcome kinds param uses defaults', { concurrency: false }, () => withStateFixture(() => {
  setSelectedOverviewOutcomeKinds(['critical']);

  hydrateUrlState(new URLSearchParams({}));

  assert.deepEqual(getSelectedOverviewOutcomeKinds(), DEFAULT_OVERVIEW_OUTCOME_KINDS);
}));

// ===========================================================================
// buildUrlStateSnapshot structure
// ===========================================================================

test('buildUrlStateSnapshot returns expected top-level keys', { concurrency: false }, () => withStateFixture(() => {
  const snapshot = buildUrlStateSnapshot({ activeTab: 'calculator' });

  assert.ok('version' in snapshot);
  assert.ok('activeTab' in snapshot);
  assert.ok('calculator' in snapshot);
  assert.ok('weapons' in snapshot);
  assert.ok('enemies' in snapshot);
}));

test('buildUrlStateSnapshot calculator section has all expected keys', { concurrency: false }, () => withStateFixture(() => {
  const snapshot = buildUrlStateSnapshot({ activeTab: 'calculator' });
  const calc = snapshot.calculator;

  const expectedKeys = [
    'mode', 'compareView', 'weaponSortMode', 'enemyDropdownSortMode',
    'enemyDropdownSortDir', 'enemyTableMode', 'overviewScope', 'enemyTargetTypes',
    'diffDisplayMode', 'overviewOutcomeKinds', 'engagementRangeMetersA', 'engagementRangeMetersB',
    'weaponA', 'weaponB', 'selectedEnemy', 'selectedZoneIndex',
     'selectedExplosiveZoneIndices', 'recommendationWeaponFilterMode',
     'recommendationWeaponFilterTypes', 'recommendationWeaponFilterSubs',
     'recommendationWeaponFilterGroups', 'recommendationWeaponFilterRoles',
     'recommendationHideOrdnance',
     'recommendationNoMainViaLimbs',
     'recommendationMinShots', 'recommendationMaxShots',
     'selectedAttackKeysA', 'selectedAttackKeysB',
    'attackHitCountsA', 'attackHitCountsB', 'enemySort'
  ];

  for (const key of expectedKeys) {
    assert.ok(key in calc, `calculator section missing key '${key}'`);
  }
}));

// ===========================================================================
// Two-slot independence
// ===========================================================================

test('hydrateUrlState sets slots A and B independently', { concurrency: false }, () => withStateFixture(() => {
  const alpha = makeWeapon('Alpha', {
    rows: [makeAttackRow('Shot A', 100)]
  });
  const beta = makeWeapon('Beta', {
    rows: [makeAttackRow('Shot B', 200)]
  });
  weaponsState.groups = [alpha, beta];

  hydrateUrlState(new URLSearchParams({
    cwa: 'Alpha',
    cwb: 'Beta',
    cra: '40',
    crb: '90'
  }));

  assert.equal(calculatorState.weaponA?.name, 'Alpha');
  assert.equal(calculatorState.weaponB?.name, 'Beta');
  assert.equal(calculatorState.engagementRangeMeters.A, 40);
  assert.equal(calculatorState.engagementRangeMeters.B, 90);
}));

test('hydrateUrlState sets attack keys per slot independently', { concurrency: false }, () => withStateFixture(() => {
  const weapon = makeWeapon('Dual', {
    rows: [
      makeAttackRow('Mode1', 100),
      makeAttackRow('Mode2', 200)
    ]
  });
  weaponsState.groups = [weapon];
  const key0 = getAttackRowKey(weapon.rows[0]);
  const key1 = getAttackRowKey(weapon.rows[1]);

  hydrateUrlState(new URLSearchParams({
    cwa: 'Dual',
    cwb: 'Dual',
    caa: JSON.stringify([0]),
    cab: JSON.stringify([1])
  }));

  assert.deepEqual(calculatorState.selectedAttackKeys.A, [key0]);
  assert.deepEqual(calculatorState.selectedAttackKeys.B, [key1]);
}));

test('hydrateUrlState still supports legacy full attack-key payloads', { concurrency: false }, () => withStateFixture(() => {
  const breaker = makeWeapon('Breaker', {
    code: 'SG-225',
    sub: 'SG',
    rows: [
      makeAttackRow('12g BUCKSHOT_P x11', 30, 2),
      makeAttackRow('12g SLUG_P', 280, 3)
    ]
  });
  const attackKey = getAttackRowKey(breaker.rows[1]);

  weaponsState.groups = [breaker];
  setSelectedWeapon('A', breaker);

  hydrateUrlState(new URLSearchParams({
    cwa: 'Breaker',
    caa: JSON.stringify([attackKey]),
    cha: JSON.stringify({ [attackKey]: 2 })
  }));

  assert.deepEqual(calculatorState.selectedAttackKeys.A, [attackKey]);
  assert.equal(calculatorState.attackHitCounts.A[attackKey], 2);
}));

// ===========================================================================
// hydrateUrlState return value
// ===========================================================================

test('hydrateUrlState returns version and activeTab', { concurrency: false }, () => withStateFixture(() => {
  const result = hydrateUrlState(new URLSearchParams({
    sv: '1',
    tab: 'enemies'
  }));

  assert.equal(result.version, '1');
  assert.equal(result.activeTab, 'enemies');
}));

test('hydrateUrlState uses URL_STATE_VERSION when sv param is missing', { concurrency: false }, () => withStateFixture(() => {
  const result = hydrateUrlState(new URLSearchParams({}));

  assert.equal(result.version, URL_STATE_VERSION);
}));

// ===========================================================================
// Weapon filter state round-trip through URL
// ===========================================================================

test('hydrateUrlState restores weapon tab filter state', { concurrency: false }, () => withStateFixture(() => {
  hydrateUrlState(new URLSearchParams({
    wsq: 'laser',
    wty: JSON.stringify(['support']),
    wsub: JSON.stringify(['lsr']),
    wsk: 'DMG',
    wsd: 'desc'
  }));

  assert.equal(weaponsState.searchQuery, 'laser');
  assert.deepEqual(weaponsState.activeTypes, ['support']);
  assert.deepEqual(weaponsState.activeSubs, ['lsr']);
  assert.equal(weaponsState.sortKey, 'DMG');
  assert.equal(weaponsState.sortDir, 'desc');
}));

// ===========================================================================
// Enemy filter state round-trip through URL
// ===========================================================================

test('hydrateUrlState restores enemy tab filter state', { concurrency: false }, () => withStateFixture(() => {
  hydrateUrlState(new URLSearchParams({
    esq: 'tank',
    efa: JSON.stringify(['Terminid']),
    esk: 'health',
    esd: 'desc'
  }));

  assert.equal(enemyState.searchQuery, 'tank');
  assert.deepEqual(enemyState.activeFactions, ['Terminid']);
  assert.equal(enemyState.sortKey, 'health');
  assert.equal(enemyState.sortDir, 'desc');
}));

test('encodeUrlState omits default primary-only weapon type filters but preserves an explicit empty selection', { concurrency: false }, () => withStateFixture(() => {
  const starterWeapon = makeWeapon('Liberator', {
    code: 'AR-23',
    sub: 'AR',
    rows: [makeAttackRow('5.5x50mm FULL METAL JACKET_P', 90, 2)]
  });
  weaponsState.groups = [starterWeapon];

  applyWeaponFilterState({
    searchQuery: '',
    activeTypes: DEFAULT_ACTIVE_WEAPON_TYPES,
    activeSubs: [],
    sortKey: null,
    sortDir: 'asc'
  }, { render: false });
  const defaultParams = encodeUrlState({ activeTab: 'weapons' });
  assert.equal(defaultParams.has('wty'), false);

  applyWeaponFilterState({
    searchQuery: '',
    activeTypes: [],
    activeSubs: [],
    sortKey: null,
    sortDir: 'asc'
  }, { render: false });
  const explicitEmptyTypesParams = encodeUrlState({ activeTab: 'weapons' });
  assert.equal(explicitEmptyTypesParams.get('wty'), '[]');
}));

test('buildShareableUrl and syncUrlState preserve unrelated query params', { concurrency: false }, () => withStateFixture(() => {
  const previousLocation = globalThis.location;
  const previousHistory = globalThis.history;
  const historyCalls = [];

  Object.defineProperty(globalThis, 'location', {
    configurable: true,
    value: {
      origin: 'https://example.invalid',
      pathname: '/index.html',
      search: '?test=1&foo=bar'
    }
  });
  Object.defineProperty(globalThis, 'history', {
    configurable: true,
    value: {
      replaceState(_state, _title, url) {
        historyCalls.push(url);
      }
    }
  });

  try {
    const url = buildShareableUrl({ activeTab: 'calculator' });
    assert.match(url, /\?(.+&)?test=1/);
    assert.match(url, /\?(.+&)?foo=bar/);

    const nextUrl = syncUrlState({ activeTab: 'calculator' });
    assert.match(nextUrl, /\?(.+&)?test=1/);
    assert.match(nextUrl, /\?(.+&)?foo=bar/);
    assert.equal(historyCalls[0], nextUrl);
  } finally {
    Object.defineProperty(globalThis, 'location', {
      configurable: true,
      value: previousLocation
    });
    Object.defineProperty(globalThis, 'history', {
      configurable: true,
      value: previousHistory
    });
  }
}));

// ===========================================================================
// Encoding skips default values
// ===========================================================================

test('encodeUrlState omits default enemy table mode', { concurrency: false }, () => withStateFixture(() => {
  setEnemyTableMode('analysis');
  const params = encodeUrlState({ activeTab: 'calculator' });
  assert.equal(params.has('cetm'), false);
}));

test('encodeUrlState includes non-default enemy table mode', { concurrency: false }, () => withStateFixture(() => {
  setEnemyTableMode('stats');
  const params = encodeUrlState({ activeTab: 'calculator' });
  assert.equal(params.get('cetm'), 'stats');
}));

test('encodeUrlState omits default compare view', { concurrency: false }, () => withStateFixture(() => {
  setCompareView('focused');
  const params = encodeUrlState({ activeTab: 'calculator' });
  assert.equal(params.has('cv'), false);
}));

test('encodeUrlState omits default compare header layout', { concurrency: false }, () => withStateFixture(() => {
  setCompareHeaderLayout('metric');
  const params = encodeUrlState({ activeTab: 'calculator' });
  assert.equal(params.has('chl'), false);
}));

test('encodeUrlState includes non-default compare header layout', { concurrency: false }, () => withStateFixture(() => {
  setCompareHeaderLayout('slot');
  const params = encodeUrlState({ activeTab: 'calculator' });
  assert.equal(params.get('chl'), 'slot');
}));

test('encodeUrlState includes non-default compare view', { concurrency: false }, () => withStateFixture(() => {
  setCompareView('overview');
  const params = encodeUrlState({ activeTab: 'calculator' });
  assert.equal(params.get('cv'), 'overview');
}));

test('hydrateUrlState restores compare header layout from URL params', { concurrency: false }, () => withStateFixture(() => {
  hydrateUrlState(new URLSearchParams({
    chl: 'slot'
  }));

  assert.equal(calculatorState.compareHeaderLayout, 'slot');
}));

// ===========================================================================
// Enemy sort state
// ===========================================================================

test('hydrateUrlState restores calculator enemy sort state from dedicated URL params', { concurrency: false }, () => withStateFixture(() => {
  hydrateUrlState(new URLSearchParams({
    csk: 'health',
    csd: 'desc',
    csg: 'outcome'
  }));

  assert.deepEqual(calculatorState.enemySort, {
    key: 'health',
    dir: 'desc',
    groupMode: 'outcome'
  });
}));

test('encodeUrlState omits default calculator enemy sort values', { concurrency: false }, () => withStateFixture(() => {
  setEnemySortState({ key: 'zone_name', dir: 'asc', groupMode: 'none' });
  const params = encodeUrlState({ activeTab: 'calculator' });

  assert.equal(params.has('csk'), false);
  assert.equal(params.has('csd'), false);
  assert.equal(params.has('csg'), false);
}));

test('hydrateUrlState restores calculator and enemy-tab sorts independently', { concurrency: false }, () => withStateFixture(() => {
  hydrateUrlState(new URLSearchParams({
    csk: 'health',
    csd: 'desc',
    csg: 'outcome',
    esk: 'AV',
    esd: 'asc'
  }));

  assert.deepEqual(calculatorState.enemySort, {
    key: 'health',
    dir: 'desc',
    groupMode: 'outcome'
  });
  assert.equal(enemyState.sortKey, 'AV');
  assert.equal(enemyState.sortDir, 'asc');
}));

test('encode-hydrate-encode keeps remembered focused enemy while overview is active', { concurrency: false }, () => withStateFixture(() => {
  const enemy = {
    name: 'Hulk',
    faction: 'Automaton',
    zones: [makeZone('head', { health: 100, isFatal: true }), makeZone('body', { health: 500 })]
  };
  enemyState.units = [enemy];

  setSelectedEnemy(enemy);
  setSelectedZoneIndex(1);
  setCompareView('overview');

  const firstParams = encodeUrlState({ activeTab: 'calculator' });
  assert.equal(firstParams.get('cv'), 'overview');
  assert.equal(firstParams.get('cen'), 'Hulk');
  assert.equal(firstParams.get('csz'), '1');

  setSelectedEnemy(null);
  setCompareView('focused');

  hydrateUrlState(firstParams);

  assert.equal(calculatorState.compareView, 'overview');
  assert.equal(calculatorState.selectedEnemy?.name, 'Hulk');
  assert.equal(calculatorState.selectedZoneIndex, 1);

  const secondParams = encodeUrlState({ activeTab: 'calculator' });
  assert.equal(secondParams.toString(), firstParams.toString());
}));

// ===========================================================================
// Single-attack weapon: default selection not encoded
// ===========================================================================

test('encodeUrlState omits attack keys for single-attack weapon with default selection', { concurrency: false }, () => withStateFixture(() => {
  const singleAttackWeapon = makeWeapon('Pistol', {
    rows: [makeAttackRow('9mm', 50)]
  });
  weaponsState.groups = [singleAttackWeapon];

  setSelectedWeapon('A', singleAttackWeapon);
  // Default for a single-attack weapon is [only attack key], so selecting it should not encode
  setSelectedAttackKeys('A', [getAttackRowKey(singleAttackWeapon.rows[0])]);

  const params = encodeUrlState({ activeTab: 'calculator' });
  assert.equal(params.has('caa'), false, 'default single-attack selection should not be encoded');
}));

// ===========================================================================
// hydrateUrlState accepts URLSearchParams directly
// ===========================================================================

test('hydrateUrlState accepts URLSearchParams object', { concurrency: false }, () => withStateFixture(() => {
  const params = new URLSearchParams();
  params.set('cm', 'single');
  params.set('tab', 'references');

  const result = hydrateUrlState(params);

  assert.equal(result.activeTab, 'references');
  assert.equal(calculatorState.mode, 'single');
}));

// ===========================================================================
// Min/max shot range state and URL persistence
// ===========================================================================

test('calculatorState defaults recommendationMinShots to 1', { concurrency: false }, () => withStateFixture(() => {
  assert.equal(calculatorState.recommendationMinShots, 1);
}));

test('calculatorState defaults recommendationMaxShots to 3', { concurrency: false }, () => withStateFixture(() => {
  assert.equal(calculatorState.recommendationMaxShots, 3);
}));

test('setRecommendationMaxShots clamps to allowed range', { concurrency: false }, () => withStateFixture(() => {
  setRecommendationMaxShots(2);
  assert.equal(calculatorState.recommendationMaxShots, 2);

  setRecommendationMaxShots(0);
  assert.equal(calculatorState.recommendationMaxShots, 1, 'max shots cannot be below min shots (1)');

  setRecommendationMaxShots(999);
  assert.equal(calculatorState.recommendationMaxShots, 10, 'max shots is capped at 10');
}));

test('setRecommendationMaxShots accepts the any sentinel', { concurrency: false }, () => withStateFixture(() => {
  setRecommendationMaxShots(RECOMMENDATION_MAX_SHOTS_ANY);
  assert.equal(calculatorState.recommendationMaxShots, RECOMMENDATION_MAX_SHOTS_ANY);

  setRecommendationMinShots(9);
  assert.equal(calculatorState.recommendationMinShots, 9);
  assert.equal(calculatorState.recommendationMaxShots, RECOMMENDATION_MAX_SHOTS_ANY);
}));

test('setRecommendationMinShots clamps to allowed range', { concurrency: false }, () => withStateFixture(() => {
  setRecommendationMaxShots(5);
  setRecommendationMinShots(3);
  assert.equal(calculatorState.recommendationMinShots, 3);

  setRecommendationMinShots(0);
  assert.equal(calculatorState.recommendationMinShots, 1, 'min shots cannot be below 1');

  setRecommendationMinShots(99);
  assert.equal(calculatorState.recommendationMinShots, 5, 'min shots cannot exceed max shots');
}));

test('encodeUrlState omits default min/max shots', { concurrency: false }, () => withStateFixture(() => {
  const params = encodeUrlState({ activeTab: 'calculator' });
  assert.equal(params.has('crmin'), false, 'default min shots should not be encoded');
  assert.equal(params.has('crmax'), false, 'default max shots should not be encoded');
}));

test('encodeUrlState encodes non-default max shots', { concurrency: false }, () => withStateFixture(() => {
  setRecommendationMaxShots(5);
  const params = encodeUrlState({ activeTab: 'calculator' });
  assert.equal(params.get('crmax'), '5');
}));

test('encodeUrlState encodes non-default min shots', { concurrency: false }, () => withStateFixture(() => {
  setRecommendationMaxShots(5);
  setRecommendationMinShots(2);
  const params = encodeUrlState({ activeTab: 'calculator' });
  assert.equal(params.get('crmin'), '2');
}));

test('hydrateUrlState restores min/max shots from URL params', { concurrency: false }, () => withStateFixture(() => {
  hydrateUrlState(new URLSearchParams({ crmin: '2', crmax: '4' }));

  assert.equal(calculatorState.recommendationMinShots, 2);
  assert.equal(calculatorState.recommendationMaxShots, 4);
}));

test('hydrateUrlState resets min/max shots to defaults when params absent', { concurrency: false }, () => withStateFixture(() => {
  setRecommendationMaxShots(5);
  setRecommendationMinShots(2);

  hydrateUrlState(new URLSearchParams({}));

  assert.equal(calculatorState.recommendationMinShots, 1);
  assert.equal(calculatorState.recommendationMaxShots, 3);
}));

test('encodeUrlState and hydrateUrlState round-trip min/max shots', { concurrency: false }, () => withStateFixture(() => {
  setRecommendationMaxShots(4);
  setRecommendationMinShots(2);

  const params = encodeUrlState({ activeTab: 'calculator' });

  setRecommendationMaxShots(3);
  setRecommendationMinShots(1);
  hydrateUrlState(params);

  assert.equal(calculatorState.recommendationMinShots, 2);
  assert.equal(calculatorState.recommendationMaxShots, 4);
}));

test('encodeUrlState and hydrateUrlState round-trip min shots with an Any max', { concurrency: false }, () => withStateFixture(() => {
  setRecommendationMaxShots(RECOMMENDATION_MAX_SHOTS_ANY);
  setRecommendationMinShots(9);

  const params = encodeUrlState({ activeTab: 'calculator' });

  assert.equal(params.get('crmin'), '9');
  assert.equal(params.get('crmax'), RECOMMENDATION_MAX_SHOTS_ANY);

  setRecommendationMaxShots(3);
  setRecommendationMinShots(1);
  hydrateUrlState(params);

  assert.equal(calculatorState.recommendationMinShots, 9);
  assert.equal(calculatorState.recommendationMaxShots, RECOMMENDATION_MAX_SHOTS_ANY);
}));

// ===========================================================================
// Weapon tab role filter round-trip
// ===========================================================================

test('encodeUrlState omits default weapon active roles (empty)', { concurrency: false }, () => withStateFixture(() => {
  applyWeaponFilterState({ activeRoles: [] }, { render: false });
  const params = encodeUrlState({ activeTab: 'weapons' });
  assert.equal(params.has('wrl'), false, 'default empty roles should not be encoded');
}));

test('encodeUrlState encodes non-default weapon active roles', { concurrency: false }, () => withStateFixture(() => {
  applyWeaponFilterState({ activeRoles: ['automatic', 'precision'] }, { render: false });
  const params = encodeUrlState({ activeTab: 'weapons' });
  assert.deepEqual(JSON.parse(params.get('wrl')), ['automatic', 'precision']);
}));

test('hydrateUrlState restores weapon tab active roles', { concurrency: false }, () => withStateFixture(() => {
  hydrateUrlState(new URLSearchParams({
    wrl: JSON.stringify(['explosive', 'shotgun'])
  }));

  assert.deepEqual(weaponsState.activeRoles, ['explosive', 'shotgun']);
}));

test('hydrateUrlState resets weapon active roles to default when param absent', { concurrency: false }, () => withStateFixture(() => {
  applyWeaponFilterState({ activeRoles: ['automatic'] }, { render: false });

  hydrateUrlState(new URLSearchParams({}));

  assert.deepEqual(weaponsState.activeRoles, []);
}));

// ===========================================================================
// Recommendation role filter round-trip
// ===========================================================================

test('encodeUrlState omits default recommendation role filter (empty)', { concurrency: false }, () => withStateFixture(() => {
  setRecommendationWeaponFilterRoles([]);
  const params = encodeUrlState({ activeTab: 'calculator' });
  assert.equal(params.has('crfr'), false, 'default empty roles should not be encoded');
}));

test('encodeUrlState encodes non-default recommendation role filter', { concurrency: false }, () => withStateFixture(() => {
  setRecommendationWeaponFilterRoles(['automatic', 'explosive']);
  const params = encodeUrlState({ activeTab: 'calculator' });
  assert.deepEqual(JSON.parse(params.get('crfr')), ['automatic', 'explosive']);
}));

test('hydrateUrlState restores recommendation role filter', { concurrency: false }, () => withStateFixture(() => {
  hydrateUrlState(new URLSearchParams({
    crfr: JSON.stringify(['precision', 'ordnance'])
  }));

  assert.deepEqual(calculatorState.recommendationWeaponFilterRoles, ['precision', 'ordnance']);
}));

test('hydrateUrlState resets recommendation role filter to default when param absent', { concurrency: false }, () => withStateFixture(() => {
  setRecommendationWeaponFilterRoles(['automatic']);

  hydrateUrlState(new URLSearchParams({}));

  assert.deepEqual(calculatorState.recommendationWeaponFilterRoles, []);
}));
