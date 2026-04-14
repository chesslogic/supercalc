import test from 'node:test';
import assert from 'node:assert/strict';

if (!globalThis.localStorage) {
  globalThis.localStorage = {
    getItem() {
      return null;
    },
    setItem() {},
    removeItem() {}
  };
}

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
  setAttackHitCounts,
  setCalculatorMode,
  setCalculatorStateChangeListener,
  setCompareView,
  setDiffDisplayMode,
  setEnemyDropdownSortDir,
  setEnemyDropdownSortMode,
  setEnemySortState,
  setEnemyTableMode,
  setEngagementRangeMeters,
  setOverviewScope,
  setRecommendationWeaponFilterGroups,
  setRecommendationWeaponFilterMode,
  setRecommendationWeaponFilterSubs,
  setRecommendationWeaponFilterTypes,
  setRecommendationRangeMeters,
  setSelectedAttackKeys,
  setSelectedEnemy,
  setSelectedEnemyTargetTypes,
  setSelectedExplosiveZoneIndices,
  setSelectedWeapon,
  setSelectedZoneIndex,
  setWeaponSortMode
} = calculatorDataModule;
const {
  buildUrlStateSnapshot,
  encodeUrlState,
  hydrateUrlState,
  URL_STATE_VERSION
} = urlStateModule;
const { getAttackRowKey } = compareUtilsModule;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAttackRow(name, damage, ap = 2) {
  return {
    'Atk Type': 'Projectile',
    'Atk Name': name,
    DMG: damage,
    DUR: 0,
    AP: ap,
    DF: 10,
    ST: 10,
    PF: 10
  };
}

function makeExplosiveAttackRow(name, damage, ap = 3) {
  return {
    'Atk Type': 'Explosion',
    'Atk Name': name,
    DMG: damage,
    DUR: 0,
    AP: ap,
    DF: 10,
    ST: 10,
    PF: 10
  };
}

function makeWeapon(name, {
  code = '',
  sub = 'AR',
  type = 'Primary',
  rpm = 60,
  rows = [],
  index = 0
} = {}) {
  return { name, code, sub, type, rpm, rows, index };
}

function makeZone(zoneName, {
  health = 100,
  isFatal = false,
  av = 1,
  toMainPercent = 0
} = {}) {
  return {
    zone_name: zoneName,
    health,
    Con: 0,
    AV: av,
    'Dur%': 0,
    'ToMain%': toMainPercent,
    ExTarget: 'Part',
    ExMult: 1,
    IsFatal: isFatal
  };
}

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
    weaponSortMode: calculatorState.weaponSortMode,
    enemyDropdownSortMode: calculatorState.enemyDropdownSortMode,
    enemyDropdownSortDir: calculatorState.enemyDropdownSortDir,
    enemyTableMode: calculatorState.enemyTableMode,
    overviewScope: calculatorState.overviewScope,
    enemyTargetTypes: [...calculatorState.enemyTargetTypes],
    diffDisplayMode: calculatorState.diffDisplayMode,
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
  calculatorState.weaponSortMode = snapshot.weaponSortMode;
  calculatorState.enemyDropdownSortMode = snapshot.enemyDropdownSortMode;
  calculatorState.enemyDropdownSortDir = snapshot.enemyDropdownSortDir;
  calculatorState.enemyTableMode = snapshot.enemyTableMode;
  calculatorState.overviewScope = snapshot.overviewScope;
  calculatorState.enemyTargetTypes = [...snapshot.enemyTargetTypes];
  calculatorState.diffDisplayMode = snapshot.diffDisplayMode;
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
  setDiffDisplayMode('percent');
  setOverviewScope('automatons');

  hydrateUrlState('');

  assert.equal(calculatorState.mode, 'compare');
  assert.equal(calculatorState.diffDisplayMode, 'absolute');
  assert.equal(calculatorState.overviewScope, 'all');
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
// Overview mode clears enemy
// ===========================================================================

test('hydrateUrlState nullifies enemy when compareView is overview', { concurrency: false }, () => withStateFixture(() => {
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
  assert.equal(calculatorState.selectedEnemy, null);
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
// Legacy 'crm' shared range meters
// ===========================================================================

test('hydrateUrlState supports legacy crm param for both slots', { concurrency: false }, () => withStateFixture(() => {
  hydrateUrlState(new URLSearchParams({ crm: '75' }));

  assert.equal(calculatorState.engagementRangeMeters.A, 75);
  assert.equal(calculatorState.engagementRangeMeters.B, 75);
}));

test('hydrateUrlState prefers per-slot range over legacy crm', { concurrency: false }, () => withStateFixture(() => {
  hydrateUrlState(new URLSearchParams({
    crm: '75',
    cra: '50',
    crb: '100'
  }));

  assert.equal(calculatorState.engagementRangeMeters.A, 50);
  assert.equal(calculatorState.engagementRangeMeters.B, 100);
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
    rows: [makeExplosiveAttackRow('HE Rocket', 500)]
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
  setOverviewScope('automatons');
  setDiffDisplayMode('percent');
  setSelectedWeapon('A', breaker);
  setSelectedWeapon('B', railgun);
  const attackKey = getAttackRowKey(breaker.rows[1]);
  setSelectedAttackKeys('A', [attackKey]);
  setAttackHitCounts('A', { [attackKey]: 3 });
  setSelectedEnemy(enemy);
  setSelectedZoneIndex(1);
  setRecommendationWeaponFilterMode('include');
  setRecommendationWeaponFilterTypes(['support']);
  setRecommendationWeaponFilterSubs(['spc']);
  setEnemySortState({ key: 'health', dir: 'desc', groupMode: 'outcome' });
  setEngagementRangeMeters('A', 50);
  setEngagementRangeMeters('B', 80);
  applyWeaponFilterState({
    searchQuery: 'rail',
    activeTypes: ['support'],
    activeSubs: ['spc'],
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

  assert.equal(firstParams.get('csk'), 'health');
  assert.equal(firstParams.get('csd'), 'desc');
  assert.equal(firstParams.get('csg'), 'outcome');
  assert.equal(firstParams.get('esk'), 'AV');
  assert.equal(firstParams.get('esd'), 'desc');

  // Reset everything to defaults then hydrate from the first encoding
  setCalculatorMode('compare');
  setWeaponSortMode('grouped');
  setEnemyDropdownSortMode('targets');
  setEnemyDropdownSortDir('asc');
  setEnemyTableMode('analysis');
  setOverviewScope('all');
  setDiffDisplayMode('absolute');
  setSelectedWeapon('A', null);
  setSelectedWeapon('B', null);
  setSelectedEnemy(null);
  setSelectedZoneIndex(null);
  setSelectedExplosiveZoneIndices([]);
  setRecommendationWeaponFilterMode('exclude');
  setRecommendationWeaponFilterTypes([]);
  setRecommendationWeaponFilterSubs([]);
  setEnemySortState({ key: 'zone_name', dir: 'asc', groupMode: 'none' });
  setEngagementRangeMeters('A', 30);
  setEngagementRangeMeters('B', 30);
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
  assert.equal(calculatorState.enemyTableMode, 'analysis');
}));

// ===========================================================================
// Recommendation weapon filter round-trip
// ===========================================================================

test('encodeUrlState omits default recommendation filter mode (exclude)', { concurrency: false }, () => withStateFixture(() => {
  const params = encodeUrlState({ activeTab: 'calculator' });
  assert.equal(params.has('crfm'), false);
}));

test('encodeUrlState encodes non-default recommendation filter mode', { concurrency: false }, () => withStateFixture(() => {
  setRecommendationWeaponFilterMode('include');
  const params = encodeUrlState({ activeTab: 'calculator' });
  assert.equal(params.get('crfm'), 'include');
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
    'diffDisplayMode', 'engagementRangeMetersA', 'engagementRangeMetersB',
    'weaponA', 'weaponB', 'selectedEnemy', 'selectedZoneIndex',
    'selectedExplosiveZoneIndices', 'recommendationWeaponFilterMode',
    'recommendationWeaponFilterTypes', 'recommendationWeaponFilterSubs',
    'recommendationWeaponFilterGroups', 'selectedAttackKeysA', 'selectedAttackKeysB',
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

test('encodeUrlState includes non-default compare view', { concurrency: false }, () => withStateFixture(() => {
  setCompareView('overview');
  const params = encodeUrlState({ activeTab: 'calculator' });
  assert.equal(params.get('cv'), 'overview');
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
