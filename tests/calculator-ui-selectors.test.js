// Pinning tests for calculator/ui.js selector behaviors
// Locks weapon + enemy selector setup/lifecycle contracts before shared dropdown extraction.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  calculatorState,
  getEnemyOptions,
  getWeaponOptions,
  setCalculatorMode,
  setCompareView,
  setSelectedEnemy,
  setSelectedWeapon,
  setSelectedEnemyTargetTypes,
  setWeaponSortMode,
  getSelectedEnemyTargetTypes
} from '../calculator/data.js';
import {
  getEnemyDropdownItemModel,
  getEnemyDropdownOptionsForQuery,
  getEnemyOverviewOptionHtml,
  getCalculatorModeButtonTitle,
  getWeaponInputDisplayValue,
  ENEMY_OVERVIEW_DROPDOWN_CLASS
} from '../calculator/ui.js';
import {
  getEnemyDropdownQueryState,
  filterEnemiesByScope,
  sortEnemyDropdownOptions,
  normalizeEnemyDropdownSortMode,
  normalizeEnemyDropdownSortDir
} from '../calculator/selector-utils.js';
import {
  getWeaponOptionDisplayModel,
  getWeaponDropdownApInfo,
  normalizeWeaponSortMode,
  sortWeaponOptions,
  getWeaponOptionLabelText,
  getWeaponTypeSortIndex,
  compareWeaponOptionBaseOrder,
  WEAPON_TYPE_ORDER
} from '../calculator/weapon-dropdown.js';
import { filterEnemiesByTargetTypes } from '../calculator/enemy-scope.js';

// ——— Test fixtures ———

function makeEnemy(name, faction, scopeTags = []) {
  return { name, faction, scopeTags };
}

const REAL_ENEMY_DATA = JSON.parse(
  readFileSync(new URL('../enemies/enemydata.json', import.meta.url), 'utf8')
);

function makeRealEnemy(name, faction) {
  const unitData = REAL_ENEMY_DATA?.[faction]?.[name];
  if (!unitData) {
    throw new Error(`Enemy not found in enemydata.json: ${faction} ${name}`);
  }

  return makeEnemy(name, faction, unitData.scope_tags || []);
}

function makeWeapon(overrides = {}) {
  return {
    name: overrides.name || 'Test Weapon',
    type: overrides.type || 'primary',
    sub: overrides.sub || '',
    code: overrides.code || '',
    rows: overrides.rows || [],
    index: overrides.index ?? 0,
    ...overrides
  };
}

function makeAttackRow(ap, dmg, atkName = '') {
  return { AP: ap, DMG: dmg, 'Atk Name': atkName };
}

const ENEMIES_MIXED = [
  makeEnemy('Scavenger', 'Terminid', ['chaff']),
  makeEnemy('Warrior', 'Terminid', ['medium']),
  makeEnemy('Stalker', 'Terminid', ['elite']),
  makeEnemy('Charger', 'Terminid', ['tank']),
  makeEnemy('Bile Titan', 'Terminid', ['giant']),
  makeEnemy('Trooper', 'Automaton', ['chaff']),
  makeEnemy('Hulk', 'Automaton', ['tank']),
  makeEnemy('Overseer', 'Illuminate', ['medium']),
  makeEnemy('Fleshmob', 'Illuminate', ['tank']),
  makeEnemy('Gatekeeper', 'Illuminate', ['tank'])
];

const WEAPONS_MIXED = [
  makeWeapon({ name: 'AR-23 Liberator', type: 'primary', sub: 'Automatic', code: 'AR-23', index: 0, rows: [makeAttackRow(3, 60)] }),
  makeWeapon({ name: 'R-63 Diligence', type: 'primary', sub: 'Marksman', code: 'R-63', index: 1, rows: [makeAttackRow(3, 125)] }),
  makeWeapon({ name: 'SG-225 Breaker', type: 'primary', sub: 'Shotgun', code: 'SG-225', index: 2, rows: [makeAttackRow(2, 45)] }),
  makeWeapon({ name: 'P-2 Peacemaker', type: 'secondary', sub: 'Pistol', code: 'P-2', index: 3, rows: [makeAttackRow(1, 40)] }),
  makeWeapon({ name: 'G-12 High Explosive', type: 'grenade', sub: '', code: 'G-12', index: 4, rows: [makeAttackRow(4, 200)] }),
  makeWeapon({ name: 'EAT-17 Expendable', type: 'support', sub: 'Launcher', code: 'EAT-17', index: 5, rows: [makeAttackRow(6, 800)] }),
  makeWeapon({ name: 'Orbital Railcannon', type: 'stratagem', sub: '', code: 'RAIL', index: 6, rows: [makeAttackRow(7, 2000)] })
];

// ========================================================================
// Section 1: Enemy selector — query state normalization
// ========================================================================

test('[pin] enemy query state clears effective query when overview is actively selected', () => {
  const result = getEnemyDropdownQueryState('Overview', {
    mode: 'compare',
    compareView: 'overview',
    selectedEnemyName: ''
  });
  assert.equal(result.effectiveQuery, '');
  assert.equal(result.showOverviewOption, true);
});

test('[pin] enemy query state preserves partial overview query in focused compare mode', () => {
  const result = getEnemyDropdownQueryState('over', {
    mode: 'compare',
    compareView: 'focused',
    selectedEnemyName: ''
  });
  assert.equal(result.effectiveQuery, 'over');
  assert.equal(result.showOverviewOption, true);
});

test('[pin] enemy query state hides overview option in single mode regardless of query', () => {
  for (const query of ['', 'overview', 'Over']) {
    const result = getEnemyDropdownQueryState(query, {
      mode: 'single',
      compareView: 'focused',
      selectedEnemyName: ''
    });
    assert.equal(result.showOverviewOption, false, `query="${query}" should hide overview in single mode`);
  }
});

test('[pin] enemy query state suppresses effective query when it matches selected enemy name', () => {
  const result = getEnemyDropdownQueryState('Stalker', {
    mode: 'single',
    compareView: 'focused',
    selectedEnemyName: 'Stalker'
  });
  assert.equal(result.effectiveQuery, '');
});

test('[pin] enemy query state keeps overview visible when selected-enemy display text fills the compare input', () => {
  const result = getEnemyDropdownQueryState('Stalker', {
    mode: 'compare',
    compareView: 'focused',
    selectedEnemyName: 'Stalker'
  });
  assert.equal(result.effectiveQuery, '');
  assert.equal(result.showOverviewOption, true);
});

test('[pin] enemy query state is case-insensitive for selected enemy name match', () => {
  const result = getEnemyDropdownQueryState('STALKER', {
    mode: 'single',
    compareView: 'focused',
    selectedEnemyName: 'Stalker'
  });
  assert.equal(result.effectiveQuery, '');
});

test('[pin] enemy query state treats null/undefined query as empty string', () => {
  for (const query of [null, undefined]) {
    const result = getEnemyDropdownQueryState(query, {
      mode: 'compare',
      compareView: 'focused'
    });
    assert.equal(result.normalizedQuery, '');
    assert.equal(result.effectiveQuery, '');
    assert.equal(result.showOverviewOption, true);
  }
});

test('[pin] enemy query state keeps remembered focused-enemy text as a live query while overview is active', () => {
  const result = getEnemyDropdownQueryState('Stalker', {
    mode: 'compare',
    compareView: 'overview',
    selectedEnemyName: 'Stalker'
  });
  assert.equal(result.effectiveQuery, 'stalker');
  assert.equal(result.showOverviewOption, true);
});

// ========================================================================
// Section 2: Enemy selector — filtering pipeline
// ========================================================================

test('[pin] enemy dropdown pipeline filters by scope then target type then text query', () => {
  const result = getEnemyDropdownOptionsForQuery('war', {
    options: ENEMIES_MIXED,
    mode: 'single',
    compareView: 'focused',
    selectedEnemyName: '',
    overviewScope: 'all',
    targetTypeIds: ['medium'],
    sortMode: 'targets',
    sortDir: 'asc'
  });
  assert.deepEqual(result.filteredOptions.map((e) => e.name), ['Warrior']);
  assert.equal(result.showOverviewOption, false);
});

test('[pin] enemy dropdown pipeline returns empty when no enemies match scope+target+query', () => {
  const result = getEnemyDropdownOptionsForQuery('xyznotfound', {
    options: ENEMIES_MIXED,
    mode: 'single',
    compareView: 'focused',
    selectedEnemyName: '',
    overviewScope: 'all',
    targetTypeIds: ['chaff', 'medium', 'elite', 'tank', 'giant'],
    sortMode: 'targets',
    sortDir: 'asc'
  });
  assert.equal(result.filteredOptions.length, 0);
});

test('[pin] enemy dropdown pipeline shows all enemies when query is empty and scope is all', () => {
  const result = getEnemyDropdownOptionsForQuery('', {
    options: ENEMIES_MIXED,
    mode: 'single',
    compareView: 'focused',
    selectedEnemyName: '',
    overviewScope: 'all',
    targetTypeIds: ['chaff', 'medium', 'elite', 'tank', 'giant'],
    sortMode: 'targets',
    sortDir: 'asc'
  });
  assert.equal(result.filteredOptions.length, ENEMIES_MIXED.length);
});

test('[pin] enemy dropdown pipeline respects scope narrowing to a single faction', () => {
  const result = getEnemyDropdownOptionsForQuery('', {
    options: ENEMIES_MIXED,
    mode: 'single',
    compareView: 'focused',
    selectedEnemyName: '',
    overviewScope: 'Automatons',
    targetTypeIds: ['chaff', 'medium', 'elite', 'tank', 'giant'],
    sortMode: 'targets',
    sortDir: 'asc'
  });
  const names = result.filteredOptions.map((e) => e.name);
  assert.ok(names.includes('Trooper'));
  assert.ok(names.includes('Hulk'));
  assert.ok(!names.includes('Warrior'));
  assert.ok(!names.includes('Overseer'));
});

test('[pin] enemy dropdown pipeline in compare mode offers overview and filters enemies', () => {
  const result = getEnemyDropdownOptionsForQuery('', {
    options: ENEMIES_MIXED,
    mode: 'compare',
    compareView: 'focused',
    selectedEnemyName: '',
    overviewScope: 'all',
    targetTypeIds: ['chaff', 'medium', 'elite', 'tank', 'giant'],
    sortMode: 'targets',
    sortDir: 'asc'
  });
  assert.equal(result.showOverviewOption, true);
  assert.equal(result.filteredOptions.length, ENEMIES_MIXED.length);
});

test('[pin] enemy dropdown pipeline keeps overview visible alongside compare-mode text filtering', () => {
  const result = getEnemyDropdownOptionsForQuery('war', {
    options: ENEMIES_MIXED,
    mode: 'compare',
    compareView: 'focused',
    selectedEnemyName: '',
    overviewScope: 'all',
    targetTypeIds: ['chaff', 'medium', 'elite', 'tank', 'giant'],
    sortMode: 'targets',
    sortDir: 'asc'
  });
  assert.equal(result.showOverviewOption, true);
  assert.deepEqual(result.filteredOptions.map((enemy) => enemy.name), ['Warrior']);
});

test('[pin] enemy dropdown pipeline applies target type filter before returning results', () => {
  const result = getEnemyDropdownOptionsForQuery('', {
    options: ENEMIES_MIXED,
    mode: 'single',
    compareView: 'focused',
    selectedEnemyName: '',
    overviewScope: 'all',
    targetTypeIds: ['tank'],
    sortMode: 'targets',
    sortDir: 'asc'
  });
  const names = result.filteredOptions.map((e) => e.name);
  assert.ok(names.includes('Charger'));
  assert.ok(names.includes('Hulk'));
  assert.ok(names.includes('Fleshmob'));
  assert.ok(names.includes('Gatekeeper'));
  assert.ok(!names.includes('Scavenger'));
  assert.ok(!names.includes('Overseer'));
});

// ========================================================================
// Section 3: Enemy selector — item model (badge/search structure)
// ========================================================================

test('[pin] enemy item model exposes front badge with faction text', () => {
  const model = getEnemyDropdownItemModel(makeEnemy('Warrior', 'Terminid', ['medium']));
  assert.equal(model.frontId, 'terminids');
  assert.equal(model.frontLabel, 'Terminids');
  assert.equal(model.frontBadge.text, 'BUG');
  assert.equal(model.frontBadge.id, 'terminids');
});

test('[pin] enemy item model exposes Automaton front badge', () => {
  const model = getEnemyDropdownItemModel(makeEnemy('Hulk', 'Automaton', ['tank']));
  assert.equal(model.frontBadge.text, 'BOT');
  assert.equal(model.frontId, 'automatons');
});

test('[pin] enemy item model exposes Illuminate front badge', () => {
  const model = getEnemyDropdownItemModel(makeEnemy('Overseer', 'Illuminate', ['medium']));
  assert.equal(model.frontBadge.text, 'SQUID');
  assert.equal(model.frontId, 'illuminate');
});

test('[pin] enemy item model exposes target badge for known target types', () => {
  const chaffModel = getEnemyDropdownItemModel(makeEnemy('Scavenger', 'Terminid', ['chaff']));
  assert.equal(chaffModel.targetBadge.text, 'C');
  assert.equal(chaffModel.targetBadge.id, 'chaff');

  const medModel = getEnemyDropdownItemModel(makeEnemy('Warrior', 'Terminid', ['medium']));
  assert.equal(medModel.targetBadge.text, 'M');

  const eliteModel = getEnemyDropdownItemModel(makeEnemy('Stalker', 'Terminid', ['elite']));
  assert.equal(eliteModel.targetBadge.text, 'E');

  const tankModel = getEnemyDropdownItemModel(makeEnemy('Charger', 'Terminid', ['tank']));
  assert.equal(tankModel.targetBadge.text, 'T');

  const giantModel = getEnemyDropdownItemModel(makeEnemy('Bile Titan', 'Terminid', ['giant']));
  assert.equal(giantModel.targetBadge.text, 'G');
});

test('[pin] enemy item model exposes weak/base/strong target tier badges', () => {
  const weakModel = getEnemyDropdownItemModel(makeEnemy('Scavenger', 'Terminid', ['chaff-']));
  assert.deepEqual(weakModel.targetBadge, {
    id: 'chaff-',
    text: 'C-',
    label: 'Chaff-'
  });

  const strongModel = getEnemyDropdownItemModel(makeEnemy('Warrior', 'Terminid', ['medium+']));
  assert.deepEqual(strongModel.targetBadge, {
    id: 'medium+',
    text: 'M+',
    label: 'Medium+'
  });
  assert.ok(strongModel.metaTitle.includes('Medium+'));
  assert.ok(strongModel.searchText.includes('medium+'));
});

test('[pin] enemy item model includes searchText with name, faction, front, and target info', () => {
  const model = getEnemyDropdownItemModel(makeEnemy('Warrior', 'Terminid', ['medium']));
  assert.ok(model.searchText.includes('warrior'));
  assert.ok(model.searchText.includes('terminid'));
  assert.ok(model.searchText.includes('terminids'));
  assert.ok(model.searchText.includes('medium'));
});

test('[pin] enemy item model handles null enemy gracefully', () => {
  const model = getEnemyDropdownItemModel(null);
  assert.equal(model.frontId, '');
  assert.equal(model.targetBadge, null);
  assert.equal(model.armyRoleBadge, null);
  assert.deepEqual(model.subgroupBadges, []);
});

test('[pin] enemy item model includes Illuminate subgroup badges for Appropriators-exclusive units', () => {
  const model = getEnemyDropdownItemModel(makeEnemy('Gatekeeper', 'Illuminate', ['tank']));
  const subgroupIds = model.subgroupBadges.map((b) => b.id);
  assert.ok(subgroupIds.includes('appropriators'));
});

test('[pin] enemy item model assigns army role badge for Illuminate common units', () => {
  const model = getEnemyDropdownItemModel(makeEnemy('Overseer', 'Illuminate', ['medium']));
  assert.ok(model.armyRoleBadge !== null);
  assert.equal(model.armyRoleBadge.id, 'common');
  assert.equal(model.armyRoleBadge.text, 'C');
});

test('[pin] enemy item model assigns exclusive army role badge for Illuminate exclusive units', () => {
  const model = getEnemyDropdownItemModel(makeEnemy('Gatekeeper', 'Illuminate', ['tank']));
  assert.ok(model.armyRoleBadge !== null);
  assert.equal(model.armyRoleBadge.id, 'exclusive');
  assert.equal(model.armyRoleBadge.text, 'E');
});

test('[pin] enemy item model metaTitle joins front, subgroup, role, and target badges', () => {
  const model = getEnemyDropdownItemModel(makeEnemy('Overseer', 'Illuminate', ['medium']));
  assert.ok(model.metaTitle.includes('Illuminate'));
  assert.ok(model.metaTitle.includes('Medium'));
});

// ========================================================================
// Section 4: Enemy selector — sort behavior
// ========================================================================

test('[pin] enemy dropdown sort mode defaults and normalizes correctly', () => {
  assert.equal(normalizeEnemyDropdownSortMode(), 'targets');
  assert.equal(normalizeEnemyDropdownSortMode('targets'), 'targets');
  assert.equal(normalizeEnemyDropdownSortMode('alphabetical'), 'alphabetical');
  assert.equal(normalizeEnemyDropdownSortMode('nonsense'), 'targets');
  assert.equal(normalizeEnemyDropdownSortMode('alpha'), 'alphabetical');
  assert.equal(normalizeEnemyDropdownSortMode('type'), 'targets');
});

test('[pin] enemy dropdown sort direction defaults and normalizes correctly', () => {
  assert.equal(normalizeEnemyDropdownSortDir(), 'asc');
  assert.equal(normalizeEnemyDropdownSortDir('asc'), 'asc');
  assert.equal(normalizeEnemyDropdownSortDir('desc'), 'desc');
  assert.equal(normalizeEnemyDropdownSortDir('invalid'), 'asc');
});

test('[pin] enemy dropdown sorting puts terminids before automatons before illuminate', () => {
  const sorted = sortEnemyDropdownOptions(ENEMIES_MIXED);
  const firstTerminid = sorted.findIndex((e) => e.faction === 'Terminid');
  const firstAutomaton = sorted.findIndex((e) => e.faction === 'Automaton');
  const firstIlluminate = sorted.findIndex((e) => e.faction === 'Illuminate');
  assert.ok(firstTerminid < firstAutomaton);
  assert.ok(firstAutomaton < firstIlluminate);
});

test('[pin] enemy dropdown target sort orders chaff < medium < elite < tank < giant within faction', () => {
  const terminids = ENEMIES_MIXED.filter((e) => e.faction === 'Terminid');
  const sorted = sortEnemyDropdownOptions(terminids, { sortMode: 'targets', sortDir: 'asc' });
  const names = sorted.map((e) => e.name);
  assert.ok(names.indexOf('Scavenger') < names.indexOf('Warrior'));
  assert.ok(names.indexOf('Warrior') < names.indexOf('Stalker'));
  assert.ok(names.indexOf('Stalker') < names.indexOf('Charger'));
  assert.ok(names.indexOf('Charger') < names.indexOf('Bile Titan'));
});

test('[pin] enemy dropdown target sort orders minus < base < plus within a target band', () => {
  const targetVariants = [
    makeEnemy('Chaff+', 'Terminid', ['chaff+']),
    makeEnemy('Medium', 'Terminid', ['medium']),
    makeEnemy('Medium-', 'Terminid', ['medium-']),
    makeEnemy('Chaff', 'Terminid', ['chaff']),
    makeEnemy('Giant-', 'Terminid', ['giant-']),
    makeEnemy('Chaff-', 'Terminid', ['chaff-']),
    makeEnemy('Medium+', 'Terminid', ['medium+']),
    makeEnemy('Giant+', 'Terminid', ['giant+']),
    makeEnemy('Giant', 'Terminid', ['giant'])
  ];

  assert.deepEqual(
    sortEnemyDropdownOptions(targetVariants, { sortMode: 'targets', sortDir: 'asc' }).map((enemy) => enemy.name),
    ['Chaff-', 'Chaff', 'Chaff+', 'Medium-', 'Medium', 'Medium+', 'Giant-', 'Giant', 'Giant+']
  );
  assert.deepEqual(
    sortEnemyDropdownOptions(targetVariants, { sortMode: 'targets', sortDir: 'desc' }).map((enemy) => enemy.name),
    ['Giant+', 'Giant', 'Giant-', 'Medium+', 'Medium', 'Medium-', 'Chaff+', 'Chaff', 'Chaff-']
  );
});

test('[pin] real enemydata reclassifies selected targets into conservative variant tiers', () => {
  assert.deepEqual(makeRealEnemy('Scavenger', 'Terminid').scopeTags, ['chaff-']);

  const automatons = [
    makeRealEnemy('Heavy Devastator', 'Automaton'),
    makeRealEnemy('Devastator', 'Automaton'),
    makeRealEnemy('Trooper', 'Automaton'),
    makeRealEnemy('Conflagration Devastator', 'Automaton'),
    makeRealEnemy('Marauder', 'Automaton'),
    makeRealEnemy('Rocket Devastator', 'Automaton')
  ];

  assert.deepEqual(
    automatons.map((enemy) => [enemy.name, enemy.scopeTags[0]]),
    [
      ['Heavy Devastator', 'medium+'],
      ['Devastator', 'medium'],
      ['Trooper', 'chaff'],
      ['Conflagration Devastator', 'medium+'],
      ['Marauder', 'chaff+'],
      ['Rocket Devastator', 'medium-']
    ]
  );

  assert.deepEqual(
    sortEnemyDropdownOptions(automatons, { sortMode: 'targets', sortDir: 'asc' }).map((enemy) => enemy.name),
    [
      'Trooper',
      'Marauder',
      'Rocket Devastator',
      'Devastator',
      'Conflagration Devastator',
      'Heavy Devastator'
    ]
  );
});

test('[pin] enemy dropdown alphabetical sort orders by name within faction', () => {
  const sorted = sortEnemyDropdownOptions(ENEMIES_MIXED, { sortMode: 'alphabetical', sortDir: 'asc' });
  // Within terminids, alphabetical order
  const terminids = sorted.filter((e) => e.faction === 'Terminid');
  const terminidNames = terminids.map((e) => e.name);
  const expectedAlpha = [...terminidNames].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  assert.deepEqual(terminidNames, expectedAlpha);
});

test('[pin] enemy dropdown sort preserves original order as tiebreaker', () => {
  const sameTier = [
    makeEnemy('Alpha Tank', 'Terminid', ['tank']),
    makeEnemy('Beta Tank', 'Terminid', ['tank'])
  ];
  const sorted = sortEnemyDropdownOptions(sameTier, { sortMode: 'targets', sortDir: 'asc' });
  assert.equal(sorted[0].name, 'Alpha Tank');
  assert.equal(sorted[1].name, 'Beta Tank');
});

// ========================================================================
// Section 5: Enemy selector — overview option
// ========================================================================

test('[pin] overview option HTML includes "compare all matching enemies" for all scope', () => {
  const html = getEnemyOverviewOptionHtml('all');
  assert.ok(html.includes('Overview'));
  assert.ok(html.includes('compare all matching enemies'));
});

test('[pin] overview option HTML includes scope-specific summary for non-all scope', () => {
  const html = getEnemyOverviewOptionHtml('terminids');
  assert.ok(html.includes('Overview'));
  assert.ok(html.includes('Terminids'));
});

test('[pin] overview dropdown class combines dropdown-item and dropdown-item-overview', () => {
  assert.equal(ENEMY_OVERVIEW_DROPDOWN_CLASS, 'dropdown-item dropdown-item-overview');
});

// ========================================================================
// Section 6: Weapon selector — display model and label
// ========================================================================

test('[pin] weapon label text formats as [type][sub]code name', () => {
  const weapon = makeWeapon({ name: 'AR-23 Liberator', type: 'primary', sub: 'Automatic', code: 'AR-23' });
  const label = getWeaponOptionLabelText(weapon);
  assert.ok(label.includes('[primary]'));
  assert.ok(label.includes('[Automatic]'));
  assert.ok(label.includes('AR-23'));
  assert.ok(label.includes('AR-23 Liberator'));
});

test('[pin] weapon label text omits sub bracket when sub is empty', () => {
  const weapon = makeWeapon({ name: 'G-12 HE', type: 'grenade', sub: '', code: 'G-12' });
  const label = getWeaponOptionLabelText(weapon);
  assert.ok(label.includes('[grenade]'));
  assert.ok(!label.includes('[]'));
  assert.ok(label.includes('G-12'));
});

test('[pin] weapon display model exposes AP text and color class', () => {
  const weapon = makeWeapon({ rows: [makeAttackRow(4, 200)] });
  const model = getWeaponOptionDisplayModel(weapon);
  assert.equal(model.apText, '4');
  assert.ok(model.apClassName.length > 0);
  assert.ok(model.apTitle.includes('4'));
});

test('[pin] weapon display model shows empty AP text when weapon has no meaningful AP', () => {
  const weapon = makeWeapon({ rows: [makeAttackRow(null, 0)] });
  const model = getWeaponOptionDisplayModel(weapon);
  assert.equal(model.apText, '');
  assert.equal(model.apClassName, 'ap-white');
});

test('[pin] weapon display model marks caveat for mixed-AP weapons', () => {
  const weapon = makeWeapon({
    rows: [
      makeAttackRow(3, 100),
      makeAttackRow(6, 80)
    ]
  });
  const model = getWeaponOptionDisplayModel(weapon);
  assert.equal(model.apMarkerText, '*');
  assert.ok(model.apTitle.includes('significant'));
});

test('[pin] weapon display model has no caveat for single-AP weapons', () => {
  const weapon = makeWeapon({ rows: [makeAttackRow(4, 200)] });
  const model = getWeaponOptionDisplayModel(weapon);
  assert.equal(model.apMarkerText, '');
  assert.ok(!model.apTitle.includes('significant'));
});

// ========================================================================
// Section 7: Weapon selector — type sort order
// ========================================================================

test('[pin] weapon type sort order is primary < secondary < grenade < support < stratagem', () => {
  assert.deepEqual(WEAPON_TYPE_ORDER, ['primary', 'secondary', 'grenade', 'support', 'stratagem']);
  assert.ok(getWeaponTypeSortIndex('primary') < getWeaponTypeSortIndex('secondary'));
  assert.ok(getWeaponTypeSortIndex('secondary') < getWeaponTypeSortIndex('grenade'));
  assert.ok(getWeaponTypeSortIndex('grenade') < getWeaponTypeSortIndex('support'));
  assert.ok(getWeaponTypeSortIndex('support') < getWeaponTypeSortIndex('stratagem'));
});

test('[pin] unknown weapon type sorts after all known types', () => {
  assert.ok(getWeaponTypeSortIndex('unknown') > getWeaponTypeSortIndex('stratagem'));
  assert.ok(getWeaponTypeSortIndex('') > getWeaponTypeSortIndex('stratagem'));
});

// ========================================================================
// Section 8: Weapon selector — base sort order
// ========================================================================

test('[pin] weapon base sort orders by type, then code, then name, then index', () => {
  const a = makeWeapon({ type: 'primary', code: 'AR-23', name: 'Liberator', index: 0 });
  const b = makeWeapon({ type: 'secondary', code: 'P-2', name: 'Peacemaker', index: 1 });
  assert.ok(compareWeaponOptionBaseOrder(a, b) < 0);
});

test('[pin] weapon base sort breaks type ties with code alphabetically', () => {
  const a = makeWeapon({ type: 'primary', code: 'AR-23', name: 'Liberator', index: 0 });
  const b = makeWeapon({ type: 'primary', code: 'SG-225', name: 'Breaker', index: 1 });
  assert.ok(compareWeaponOptionBaseOrder(a, b) < 0);
});

test('[pin] weapon base sort breaks code ties with name', () => {
  const a = makeWeapon({ type: 'primary', code: 'AR-23', name: 'Alpha', index: 0 });
  const b = makeWeapon({ type: 'primary', code: 'AR-23', name: 'Beta', index: 1 });
  assert.ok(compareWeaponOptionBaseOrder(a, b) < 0);
});

// ========================================================================
// Section 9: Weapon selector — sort mode normalization
// ========================================================================

test('[pin] weapon sort mode defaults to grouped', () => {
  assert.equal(normalizeWeaponSortMode(undefined), 'grouped');
  assert.equal(normalizeWeaponSortMode('grouped'), 'grouped');
  assert.equal(normalizeWeaponSortMode('ap-desc'), 'ap-desc');
  assert.equal(normalizeWeaponSortMode('invalid'), 'grouped');
});

test('[pin] weapon sort mode allows compare-only modes only in compare mode', () => {
  assert.equal(normalizeWeaponSortMode('match-reference-subtype', { mode: 'compare' }), 'match-reference-subtype');
  assert.equal(normalizeWeaponSortMode('match-reference-subtype', { mode: 'single' }), 'grouped');
  assert.equal(normalizeWeaponSortMode('match-reference-slot', { mode: 'compare' }), 'match-reference-slot');
  assert.equal(normalizeWeaponSortMode('match-reference-slot', { mode: 'single' }), 'grouped');
});

// ========================================================================
// Section 10: Weapon selector — grouped sort output
// ========================================================================

test('[pin] sortWeaponOptions in grouped mode sorts by type then code then name', () => {
  const sorted = sortWeaponOptions(WEAPONS_MIXED, { sortMode: 'grouped', mode: 'single' });
  const types = sorted.map((w) => w.type);
  const firstPrimary = types.indexOf('primary');
  const firstSecondary = types.indexOf('secondary');
  const firstGrenade = types.indexOf('grenade');
  const firstSupport = types.indexOf('support');
  const firstStratagem = types.indexOf('stratagem');
  assert.ok(firstPrimary < firstSecondary);
  assert.ok(firstSecondary < firstGrenade);
  assert.ok(firstGrenade < firstSupport);
  assert.ok(firstSupport < firstStratagem);
});

test('[pin] sortWeaponOptions in ap-desc mode puts highest AP first', () => {
  const sorted = sortWeaponOptions(WEAPONS_MIXED, { sortMode: 'ap-desc', mode: 'single' });
  const apValues = sorted.map((w) => getWeaponDropdownApInfo(w).displayAp);
  for (let i = 1; i < apValues.length; i++) {
    assert.ok(
      apValues[i - 1] >= apValues[i],
      `AP ${apValues[i - 1]} should be >= ${apValues[i]} at index ${i}`
    );
  }
});

// ========================================================================
// Section 11: Weapon selector — display value lifecycle
// ========================================================================

test('[pin] weapon input display value is empty when no weapon selected', () => {
  const prevA = calculatorState.weaponA;
  try {
    calculatorState.weaponA = null;
    assert.equal(getWeaponInputDisplayValue('A'), '');
  } finally {
    calculatorState.weaponA = prevA;
  }
});

test('[pin] weapon input display value reflects selected weapon label', () => {
  const weapon = makeWeapon({ name: 'AR-23 Liberator', type: 'primary', sub: 'Automatic', code: 'AR-23', rows: [makeAttackRow(3, 60)] });
  const prevA = calculatorState.weaponA;
  try {
    calculatorState.weaponA = weapon;
    const displayValue = getWeaponInputDisplayValue('A');
    assert.ok(displayValue.includes('AR-23'));
    assert.ok(displayValue.includes('Liberator'));
  } finally {
    calculatorState.weaponA = prevA;
  }
});

test('[pin] weapon input display value for slot B reads weaponB state', () => {
  const weapon = makeWeapon({ name: 'P-2 Peacemaker', type: 'secondary', sub: 'Pistol', code: 'P-2', rows: [makeAttackRow(1, 40)] });
  const prevB = calculatorState.weaponB;
  try {
    calculatorState.weaponB = weapon;
    const displayValue = getWeaponInputDisplayValue('B');
    assert.ok(displayValue.includes('P-2'));
    assert.ok(displayValue.includes('Peacemaker'));
  } finally {
    calculatorState.weaponB = prevB;
  }
});

// ========================================================================
// Section 12: Shared selector patterns — clear/reset behavior
// ========================================================================

test('[pin] setSelectedWeapon(slot, null) clears weapon and resets attack keys', () => {
  const weapon = makeWeapon({ name: 'Test', rows: [makeAttackRow(3, 100)] });
  setSelectedWeapon('A', weapon);
  assert.ok(calculatorState.weaponA !== null);
  setSelectedWeapon('A', null);
  assert.equal(calculatorState.weaponA, null);
  assert.deepEqual(calculatorState.selectedAttackKeys.A, []);
});

test('[pin] setSelectedEnemy(null) clears enemy and resets zone state', () => {
  const enemy = makeEnemy('Charger', 'Terminid', ['tank']);
  setSelectedEnemy(enemy);
  assert.equal(calculatorState.selectedEnemy.name, 'Charger');
  setSelectedEnemy(null);
  assert.equal(calculatorState.selectedEnemy, null);
});

test('[pin] setSelectedEnemy forces compareView back to focused', () => {
  setCompareView('overview');
  assert.equal(calculatorState.compareView, 'overview');
  const enemy = makeEnemy('Warrior', 'Terminid', ['medium']);
  setSelectedEnemy(enemy);
  assert.equal(calculatorState.compareView, 'focused');
});

// ========================================================================
// Section 13: Mode-sensitive UI syncing
// ========================================================================

test('[pin] calculator mode button titles differ between single and compare', () => {
  const singleTitle = getCalculatorModeButtonTitle('single');
  const compareTitle = getCalculatorModeButtonTitle('compare');
  assert.notEqual(singleTitle, compareTitle);
  assert.ok(singleTitle.length > 0);
  assert.ok(compareTitle.length > 0);
  assert.ok(compareTitle.includes('side-by-side'));
});

test('[pin] setCalculatorMode normalizes mode and resets compare-view in single mode', () => {
  setCalculatorMode('compare');
  setCompareView('overview');
  assert.equal(calculatorState.mode, 'compare');
  assert.equal(calculatorState.compareView, 'overview');
  setCalculatorMode('single');
  assert.equal(calculatorState.mode, 'single');
  assert.equal(calculatorState.compareView, 'focused');
});

test('[pin] setCalculatorMode re-normalizes weapon sort mode when switching modes', () => {
  setCalculatorMode('compare');
  setWeaponSortMode('match-reference-subtype');
  assert.equal(calculatorState.weaponSortMode, 'match-reference-subtype');
  setCalculatorMode('single');
  assert.notEqual(calculatorState.weaponSortMode, 'match-reference-subtype');
  assert.equal(calculatorState.weaponSortMode, 'grouped');
});

test('[pin] setCalculatorMode normalizes unknown mode to single', () => {
  setCalculatorMode('invalid');
  assert.equal(calculatorState.mode, 'single');
  setCalculatorMode('compare');
  assert.equal(calculatorState.mode, 'compare');
});

// ========================================================================
// Section 14: Enemy scope + target type interaction (selector pre-filter)
// ========================================================================

test('[pin] filterEnemiesByScope with all scope returns every enemy', () => {
  const result = filterEnemiesByScope(ENEMIES_MIXED, 'all');
  assert.equal(result.length, ENEMIES_MIXED.length);
});

test('[pin] filterEnemiesByScope narrows to a single faction', () => {
  const result = filterEnemiesByScope(ENEMIES_MIXED, 'Terminids');
  assert.ok(result.every((e) => e.faction === 'Terminid'));
  assert.equal(result.length, ENEMIES_MIXED.filter((e) => e.faction === 'Terminid').length);
});

test('[pin] filterEnemiesByTargetTypes with unit alias returns chaff+medium+elite+tank', () => {
  const result = filterEnemiesByTargetTypes(ENEMIES_MIXED, ['unit']);
  const tags = result.map((e) => e.scopeTags[0]);
  assert.ok(tags.includes('chaff'));
  assert.ok(tags.includes('medium'));
  assert.ok(tags.includes('elite'));
  assert.ok(tags.includes('tank'));
  assert.ok(!tags.includes('giant'));
});

test('[pin] filterEnemiesByTargetTypes with empty array returns nothing', () => {
  const result = filterEnemiesByTargetTypes(ENEMIES_MIXED, []);
  assert.equal(result.length, 0);
});

test('[pin] combined scope+target type filtering chains correctly', () => {
  const scoped = filterEnemiesByScope(ENEMIES_MIXED, 'Illuminate');
  const filtered = filterEnemiesByTargetTypes(scoped, ['tank']);
  const names = filtered.map((e) => e.name);
  assert.ok(names.includes('Fleshmob'));
  assert.ok(names.includes('Gatekeeper'));
  assert.ok(!names.includes('Overseer'));
  assert.ok(!names.includes('Charger'));
});

// ========================================================================
// Section 15: Weapon AP info extraction (drives selector badges)
// ========================================================================

test('[pin] weapon AP info returns null displayAp for empty rows', () => {
  const info = getWeaponDropdownApInfo(makeWeapon({ rows: [] }));
  assert.equal(info.displayAp, null);
  assert.deepEqual(info.significantAps, []);
  assert.equal(info.hasCaveat, false);
});

test('[pin] weapon AP info returns single AP for uniform rows', () => {
  const info = getWeaponDropdownApInfo(makeWeapon({
    rows: [makeAttackRow(4, 200), makeAttackRow(4, 100)]
  }));
  assert.equal(info.displayAp, 4);
  assert.deepEqual(info.significantAps, [4]);
  assert.equal(info.hasCaveat, false);
});

test('[pin] weapon AP info returns max significant AP with caveat for mixed profiles', () => {
  const info = getWeaponDropdownApInfo(makeWeapon({
    rows: [makeAttackRow(3, 100), makeAttackRow(6, 80)]
  }));
  assert.equal(info.displayAp, 6);
  assert.ok(info.significantAps.includes(3));
  assert.ok(info.significantAps.includes(6));
  assert.equal(info.hasCaveat, true);
  assert.deepEqual(info.significantSecondaryAps, [3]);
});

test('[pin] weapon AP info ignores zero-damage rows', () => {
  const info = getWeaponDropdownApInfo(makeWeapon({
    rows: [makeAttackRow(4, 200), makeAttackRow(7, 0)]
  }));
  assert.equal(info.displayAp, 4);
  assert.equal(info.hasCaveat, false);
});

// ========================================================================
// Section 16: Shared dropdown contract — searching behavior
// ========================================================================

test('[pin] weapon dropdown text search matches across type, sub, code, and name fields', () => {
  // This pins the inline filter logic used in setupWeaponSelector's populateDropdown
  const weapons = WEAPONS_MIXED;
  const searchTerms = [
    { query: 'primary', expected: ['AR-23 Liberator', 'R-63 Diligence', 'SG-225 Breaker'] },
    { query: 'launcher', expected: ['EAT-17 Expendable'] },
    { query: 'ar-23', expected: ['AR-23 Liberator'] },
    { query: 'liberator', expected: ['AR-23 Liberator'] }
  ];

  for (const { query, expected } of searchTerms) {
    const filtered = weapons.filter((weapon) => {
      const type = (weapon.type || '').toLowerCase();
      const sub = (weapon.sub || '').toLowerCase();
      const code = (weapon.code || '').toLowerCase();
      const name = (weapon.name || '').toLowerCase();
      const searchable = `${type} ${sub} ${code} ${name}`;
      return searchable.includes(query.toLowerCase());
    });
    assert.deepEqual(
      filtered.map((w) => w.name).sort(),
      expected.sort(),
      `query="${query}" should match ${expected.join(', ')}`
    );
  }
});

test('[pin] enemy dropdown text search uses itemModel.searchText for broad matching', () => {
  // Pins: enemy filtering uses searchText from getEnemyDropdownItemModel
  const enemy = makeEnemy('Overseer', 'Illuminate', ['medium']);
  const model = getEnemyDropdownItemModel(enemy);

  // searchText includes name, faction, front label, and target type label
  assert.ok(model.searchText.includes('overseer'));
  assert.ok(model.searchText.includes('illuminate'));
  assert.ok(model.searchText.includes('medium'));
});

// ========================================================================
// Section 17: Parallel selector patterns (both selectors share these)
// ========================================================================

test('[pin] both selectors use the same dropdown-item class convention', () => {
  // Weapon items use 'dropdown-item weapon-dropdown-item'
  // Enemy items use 'dropdown-item enemy-dropdown-item'
  // Overview uses ENEMY_OVERVIEW_DROPDOWN_CLASS
  assert.ok(ENEMY_OVERVIEW_DROPDOWN_CLASS.startsWith('dropdown-item'));
});

test('[pin] enemy dropdown sort returns a new array and does not mutate input', () => {
  const input = [...ENEMIES_MIXED];
  const original = [...input];
  sortEnemyDropdownOptions(input, { sortMode: 'targets', sortDir: 'asc' });
  assert.deepEqual(input.map((e) => e.name), original.map((e) => e.name));
});

test('[pin] weapon sort returns a new array and does not mutate input', () => {
  const input = [...WEAPONS_MIXED];
  const original = [...input];
  sortWeaponOptions(input, { sortMode: 'grouped', mode: 'single' });
  assert.deepEqual(input.map((w) => w.name), original.map((w) => w.name));
});

test('[pin] enemy target type selection roundtrips through set and get', () => {
  const prev = getSelectedEnemyTargetTypes();
  try {
    setSelectedEnemyTargetTypes(['medium', 'tank']);
    assert.deepEqual(getSelectedEnemyTargetTypes(), ['medium', 'tank']);
    setSelectedEnemyTargetTypes(['chaff']);
    assert.deepEqual(getSelectedEnemyTargetTypes(), ['chaff']);
  } finally {
    setSelectedEnemyTargetTypes(prev);
  }
});

test('[pin] weapon slot A and B operate independently for selection and display', () => {
  const weaponA = makeWeapon({ name: 'WeaponA', type: 'primary', code: 'WA', rows: [makeAttackRow(3, 60)] });
  const weaponB = makeWeapon({ name: 'WeaponB', type: 'secondary', code: 'WB', rows: [makeAttackRow(2, 40)] });
  const prevA = calculatorState.weaponA;
  const prevB = calculatorState.weaponB;
  try {
    setSelectedWeapon('A', weaponA);
    setSelectedWeapon('B', weaponB);
    assert.equal(calculatorState.weaponA.name, 'WeaponA');
    assert.equal(calculatorState.weaponB.name, 'WeaponB');
    const displayA = getWeaponInputDisplayValue('A');
    const displayB = getWeaponInputDisplayValue('B');
    assert.ok(displayA.includes('WeaponA'));
    assert.ok(displayB.includes('WeaponB'));
    // Clearing A does not affect B
    setSelectedWeapon('A', null);
    assert.equal(calculatorState.weaponA, null);
    assert.equal(calculatorState.weaponB.name, 'WeaponB');
  } finally {
    calculatorState.weaponA = prevA;
    calculatorState.weaponB = prevB;
  }
});
