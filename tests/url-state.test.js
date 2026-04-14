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
  buildShareableUrl,
  encodeUrlState,
  hydrateUrlState,
  syncUrlState
} = urlStateModule;
const { getAttackRowKey } = compareUtilsModule;

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

function makeWeapon(name, {
  code = '',
  sub = 'AR',
  type = 'Primary',
  rpm = 60,
  rows = [],
  index = 0
} = {}) {
  return {
    name,
    code,
    sub,
    type,
    rpm,
    rows,
    index
  };
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

test('encodeUrlState captures calculator selections and tab filters', { concurrency: false }, () => withStateFixture(() => {
  const breaker = makeWeapon('Breaker', {
    code: 'SG-225',
    sub: 'SG',
    rows: [
      makeAttackRow('12g BUCKSHOT_P x11', 30, 2),
      makeAttackRow('12g SLUG_P', 280, 3)
    ]
  });
  const dominator = makeWeapon('Dominator', {
    code: 'JAR-5',
    sub: 'SPC',
    rows: [
      makeAttackRow('15x100mm STANDARD ROCKET_P', 275, 3),
      makeAttackRow('15x100mm STUN ROCKET_P', 30, 2)
    ]
  });
  const enemy = {
    name: 'Target Dummy',
    faction: 'Automaton',
    zones: [
      makeZone('head', { health: 100, isFatal: true, av: 1, toMainPercent: 1 }),
      makeZone('torso', { health: 300, av: 2, toMainPercent: 0.5 })
    ]
  };
  const attackKeyA = getAttackRowKey(breaker.rows[1]);
  const attackKeyB = getAttackRowKey(dominator.rows[0]);

  weaponsState.groups = [breaker, dominator];
  enemyState.units = [enemy];

  setCalculatorMode('single');
  setWeaponSortMode('ap-desc');
  setEnemyDropdownSortMode('alphabetical');
  setEnemyDropdownSortDir('desc');
  setEnemyTableMode('stats');
  setOverviewScope('automatons');
  setSelectedEnemyTargetTypes(['giant']);
  setDiffDisplayMode('percent');
  setRecommendationRangeMeters(45);
  setSelectedWeapon('A', breaker);
  setSelectedWeapon('B', dominator);
  setSelectedAttackKeys('A', [attackKeyA]);
  setSelectedAttackKeys('B', [attackKeyB]);
  setAttackHitCounts('A', { [attackKeyA]: 3 });
  setSelectedEnemy(enemy);
  setSelectedZoneIndex(1);
  setSelectedExplosiveZoneIndices([0, 1]);
  setRecommendationWeaponFilterMode('include');
  setRecommendationWeaponFilterTypes(['primary', 'support']);
  setRecommendationWeaponFilterSubs(['sg']);
  setRecommendationWeaponFilterGroups(['special']);
  setEnemySortState({ key: 'health', dir: 'desc', groupMode: 'outcome' });

  applyWeaponFilterState({
    searchQuery: 'breaker',
    activeTypes: ['primary', 'support'],
    activeSubs: ['sg'],
    sortKey: 'Name',
    sortDir: 'desc'
  }, { render: false });
  applyEnemyFilterState({
    searchQuery: 'dummy',
    activeFactions: ['Automaton'],
    sortKey: 'health',
    sortDir: 'desc'
  }, { render: false });

  const params = encodeUrlState({ activeTab: 'enemies' });

  assert.equal(params.get('tab'), 'enemies');
  assert.equal(params.get('cm'), 'single');
  assert.equal(params.get('cwa'), 'Breaker');
  assert.equal(params.get('cwb'), 'Dominator');
  assert.equal(params.get('ceds'), 'alphabetical');
  assert.equal(params.get('cedd'), 'desc');
  assert.equal(params.get('cen'), 'Target Dummy');
  assert.equal(params.get('csz'), '1');
  assert.equal(params.has('cez'), false);
  assert.equal(params.get('crfm'), 'include');
  assert.deepEqual(JSON.parse(params.get('crft')), ['primary', 'support']);
  assert.deepEqual(JSON.parse(params.get('crfs')), ['sg']);
  assert.deepEqual(JSON.parse(params.get('crfg')), ['special']);
  assert.deepEqual(JSON.parse(params.get('caa')), [1]);
  assert.deepEqual(JSON.parse(params.get('cab')), [0]);
  assert.deepEqual(JSON.parse(params.get('cha')), { 1: 3 });
  assert.equal(params.has('chb'), false);
  assert.equal(params.get('cra'), '45');
  assert.equal(params.get('crb'), '45');
  assert.deepEqual(JSON.parse(params.get('wty')), ['primary', 'support']);
  assert.deepEqual(JSON.parse(params.get('wsub')), ['sg']);
  assert.equal(params.get('wsq'), 'breaker');
  assert.deepEqual(JSON.parse(params.get('efa')), ['Automaton']);
  assert.equal(params.get('esq'), 'dummy');
}));

test('hydrateUrlState round-trips calculator and tab filter state', { concurrency: false }, () => withStateFixture(() => {
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
      makeZone('body', { health: 500, av: 4, toMainPercent: 0 })
    ]
  };
  const attackKey = getAttackRowKey(breaker.rows[1]);

  weaponsState.groups = [breaker, railgun];
  enemyState.units = [enemy];

  setCalculatorMode('single');
  setWeaponSortMode('ap-desc');
  setEnemyDropdownSortMode('alphabetical');
  setEnemyDropdownSortDir('desc');
  setEnemyTableMode('stats');
  setOverviewScope('automatons');
  setSelectedEnemyTargetTypes(['giant']);
  setDiffDisplayMode('percent');
  setRecommendationRangeMeters(60);
  setSelectedWeapon('A', breaker);
  setSelectedWeapon('B', railgun);
  setSelectedAttackKeys('A', [attackKey]);
  setAttackHitCounts('A', { [attackKey]: 4 });
  setSelectedEnemy(enemy);
  setSelectedZoneIndex(0);
  setSelectedExplosiveZoneIndices([0]);
  setRecommendationWeaponFilterMode('include');
  setRecommendationWeaponFilterTypes(['support']);
  setRecommendationWeaponFilterSubs(['spc']);
  setRecommendationWeaponFilterGroups(['auto']);
  setEnemySortState({ key: 'AV', dir: 'desc', groupMode: 'outcome' });
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

  const params = encodeUrlState({ activeTab: 'weapons' });

  setCalculatorMode('compare');
  setWeaponSortMode('grouped');
  setEnemyDropdownSortMode('targets');
  setEnemyDropdownSortDir('asc');
  setEnemyTableMode('analysis');
  setOverviewScope('all');
  setSelectedEnemyTargetTypes(['unit', 'giant']);
  setDiffDisplayMode('absolute');
  setRecommendationRangeMeters(30);
  setSelectedWeapon('A', null);
  setSelectedWeapon('B', null);
  setSelectedEnemy(null);
  setSelectedZoneIndex(null);
  setSelectedExplosiveZoneIndices([]);
  setRecommendationWeaponFilterMode('exclude');
  setRecommendationWeaponFilterTypes([]);
  setRecommendationWeaponFilterSubs([]);
  setRecommendationWeaponFilterGroups([]);
  setEnemySortState({ key: 'zone_name', dir: 'asc', groupMode: 'none' });
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

  const hydrated = hydrateUrlState(params);

  assert.equal(hydrated.activeTab, 'weapons');
  assert.equal(calculatorState.mode, 'single');
  assert.equal(calculatorState.weaponSortMode, 'ap-desc');
  assert.equal(calculatorState.enemyDropdownSortMode, 'alphabetical');
  assert.equal(calculatorState.enemyDropdownSortDir, 'desc');
  assert.equal(calculatorState.enemyTableMode, 'stats');
  assert.equal(calculatorState.overviewScope, 'automatons');
  assert.deepEqual(calculatorState.enemyTargetTypes, ['giant']);
  assert.equal(calculatorState.diffDisplayMode, 'percent');
  assert.equal(calculatorState.engagementRangeMeters.A, 60);
  assert.equal(calculatorState.engagementRangeMeters.B, 60);
  assert.equal(calculatorState.weaponA?.name, 'Breaker');
  assert.equal(calculatorState.weaponB?.name, 'Railgun');
  assert.equal(calculatorState.selectedEnemy?.name, 'Practice Hulk');
  assert.equal(calculatorState.selectedZoneIndex, 0);
  assert.deepEqual(calculatorState.selectedExplosiveZoneIndices, [0]);
  assert.equal(calculatorState.recommendationWeaponFilterMode, 'include');
  assert.deepEqual(calculatorState.recommendationWeaponFilterTypes, ['support']);
  assert.deepEqual(calculatorState.recommendationWeaponFilterSubs, ['spc']);
  assert.deepEqual(calculatorState.recommendationWeaponFilterGroups, ['auto']);
  assert.deepEqual(calculatorState.selectedAttackKeys.A, [attackKey]);
  assert.equal(calculatorState.attackHitCounts.A[attackKey], 4);
  assert.deepEqual(calculatorState.enemySort, { key: 'AV', dir: 'desc', groupMode: 'outcome' });
  assert.equal(weaponsState.searchQuery, 'rail');
  assert.deepEqual(weaponsState.activeTypes, ['support']);
  assert.deepEqual(weaponsState.activeSubs, ['spc']);
  assert.equal(weaponsState.sortKey, 'AP');
  assert.equal(weaponsState.sortDir, 'desc');
  assert.equal(enemyState.searchQuery, 'hulk');
  assert.deepEqual(enemyState.activeFactions, ['Automaton']);
  assert.equal(enemyState.sortKey, 'AV');
  assert.equal(enemyState.sortDir, 'desc');
}));

test('encodeUrlState and hydrateUrlState preserve the references tab', { concurrency: false }, () => withStateFixture(() => {
  const params = encodeUrlState({ activeTab: 'references' });

  assert.equal(params.get('tab'), 'references');

  const hydrated = hydrateUrlState(params);

  assert.equal(hydrated.activeTab, 'references');
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
  const explicitAllTypesParams = encodeUrlState({ activeTab: 'weapons' });
  assert.equal(explicitAllTypesParams.get('wty'), '[]');
}));

test('syncUrlState and buildShareableUrl preserve unrelated query params such as test mode', { concurrency: false }, () => withStateFixture(() => {
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
