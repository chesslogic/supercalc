// Tests for enemy scope/filter controls, target type management, dropdown item models,
// and scope-option ordering. Extracted from calculator-ui.test.js during test-suite split.
//
// Coverage note: calculator-ui-selectors.test.js already pins the query-state
// normalisation, scope/target pipeline, and basic badge-structure contracts.
// Tests here focus on aspects NOT already covered: structure/objective target types,
// exact sort-order arrays, normalization/toggle state behaviour, control-section
// layout, scope-option ordering, icon-src presence, and overview-HTML edge cases.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import './env-stubs.js';
import { TestDocument } from './dom-stubs.js';

import { enemyState } from '../enemies/data.js';
import {
  calculatorState,
  DEFAULT_CALCULATOR_MODE,
  DEFAULT_COMPARE_VIEW,
  DEFAULT_ENEMY_DROPDOWN_SORT_DIR,
  DEFAULT_ENEMY_DROPDOWN_SORT_MODE,
  DEFAULT_ENEMY_TARGET_TYPES,
  DEFAULT_OVERVIEW_OUTCOME_KINDS,
  DEFAULT_OVERVIEW_SCOPE,
  DEFAULT_WEAPON_SORT_MODE,
  getOverviewOutcomeOptions,
  getOverviewScopeOptions,
  getSelectedEnemyTargetTypes,
  getSelectedOverviewOutcomeKinds,
  setSelectedEnemyTargetTypes,
  setSelectedOverviewOutcomeKinds,
  toggleSelectedOverviewOutcomeKind,
  toggleSelectedEnemyTargetType
} from '../calculator/data.js';
import {
  getEnemyControlSections,
  getFocusedTargetingModes,
  shouldShowEnemyControls,
  shouldShowEnemyScopeControls
} from '../calculator/rendering.js';
import { appendEnemyToolbarControl } from '../calculator/rendering/enemy-toolbar-controls.js';
import {
  getEnemyDropdownSortModeOptions,
  normalizeEnemyDropdownSortDir,
  normalizeEnemyDropdownSortMode,
  sortEnemyDropdownOptions
} from '../calculator/selector-utils.js';
import { filterEnemiesByTargetTypes, getEnemyTargetTypeOptions } from '../calculator/enemy-scope.js';
import {
  ENEMY_OVERVIEW_DROPDOWN_CLASS,
  getEnemyDropdownItemModel,
  getEnemyOverviewOptionHtml
} from '../calculator/ui.js';

// ——— Fixtures ———

function makeEnemy(name, faction, scopeTags = []) {
  return { name, faction, scopeTags };
}

// ========================================================================
// Calculator defaults
// ========================================================================

test('calculator defaults to focused compare mode with all scopes enabled', () => {
  assert.equal(DEFAULT_CALCULATOR_MODE, 'compare');
  assert.equal(DEFAULT_COMPARE_VIEW, 'focused');
  assert.equal(DEFAULT_OVERVIEW_SCOPE, 'all');
  assert.equal(DEFAULT_ENEMY_DROPDOWN_SORT_DIR, 'asc');
  assert.equal(DEFAULT_ENEMY_DROPDOWN_SORT_MODE, 'targets');
  assert.deepEqual(DEFAULT_ENEMY_TARGET_TYPES, ['chaff', 'medium', 'elite', 'tank', 'giant']);
  assert.equal(DEFAULT_WEAPON_SORT_MODE, 'grouped');
});

// ========================================================================
// Enemy target type filtering
// ========================================================================

test('enemy target type filtering distinguishes unit tiers, giants, structures, and objectives', () => {
  const enemies = [
    { name: 'Scavenger', faction: 'Terminid', scopeTags: ['chaff'] },
    { name: 'Warrior', faction: 'Terminid', scopeTags: ['medium'] },
    { name: 'Stalker', faction: 'Terminid', scopeTags: ['elite'] },
    { name: 'Charger', faction: 'Terminid', scopeTags: ['tank'] },
    { name: 'Bile Titan', faction: 'Terminid', scopeTags: ['giant'] },
    { name: 'AA Emplacement', faction: 'Automaton', scopeTags: ['structure'] },
    { name: 'Shrieker Nest', faction: 'Terminid', scopeTags: ['objective'] }
  ];

  assert.deepEqual(
    filterEnemiesByTargetTypes(enemies, ['unit']).map((enemy) => enemy.name),
    ['Scavenger', 'Warrior', 'Stalker', 'Charger']
  );
  assert.deepEqual(
    filterEnemiesByTargetTypes(enemies, ['medium', 'tank', 'objective']).map((enemy) => enemy.name),
    ['Warrior', 'Charger', 'Shrieker Nest']
  );
  assert.deepEqual(
    getEnemyTargetTypeOptions(enemies).map(({ id }) => id),
    ['chaff', 'medium', 'elite', 'tank', 'giant', 'structure', 'objective']
  );
});

test('enemy target type options only include categories present in the dataset', () => {
  const enemies = [
    { name: 'Warrior', faction: 'Terminid', scopeTags: ['medium'] },
    { name: 'Bile Titan', faction: 'Terminid', scopeTags: ['giant'] }
  ];

  assert.deepEqual(
    getEnemyTargetTypeOptions(enemies).map(({ id }) => id),
    ['medium', 'giant']
  );
});

test('enemy target type variants collapse into their broad filter bands', () => {
  const enemies = [
    { name: 'Scavenger-', faction: 'Terminid', scopeTags: ['chaff-'] },
    { name: 'Scavenger', faction: 'Terminid', scopeTags: ['chaff'] },
    { name: 'Scavenger+', faction: 'Terminid', scopeTags: ['chaff+'] },
    { name: 'Warrior-', faction: 'Terminid', scopeTags: ['medium-'] },
    { name: 'Warrior', faction: 'Terminid', scopeTags: ['medium'] },
    { name: 'Warrior+', faction: 'Terminid', scopeTags: ['medium+'] },
    { name: 'Bile Titan+', faction: 'Terminid', scopeTags: ['giant+'] }
  ];

  assert.deepEqual(
    filterEnemiesByTargetTypes(enemies, ['chaff']).map((enemy) => enemy.name),
    ['Scavenger-', 'Scavenger', 'Scavenger+']
  );
  assert.deepEqual(
    filterEnemiesByTargetTypes(enemies, ['medium']).map((enemy) => enemy.name),
    ['Warrior-', 'Warrior', 'Warrior+']
  );
  assert.deepEqual(
    filterEnemiesByTargetTypes(enemies, ['giant']).map((enemy) => enemy.name),
    ['Bile Titan+']
  );
  assert.deepEqual(
    getEnemyTargetTypeOptions(enemies).map(({ id, label }) => [id, label]),
    [
      ['chaff', 'Chaff'],
      ['medium', 'Medium'],
      ['giant', 'Giants']
    ]
  );
});

// ========================================================================
// Enemy dropdown sort modes (exact output + getEnemyDropdownSortModeOptions)
// ========================================================================

test('enemy dropdown sort modes keep bugs first and order targets within each faction group', () => {
  const enemies = [
    { name: 'Overseer', faction: 'Illuminate', scopeTags: ['medium'] },
    { name: 'Hulk', faction: 'Automaton', scopeTags: ['tank'] },
    { name: 'Trooper', faction: 'Automaton', scopeTags: ['chaff'] },
    { name: 'Warrior', faction: 'Terminid', scopeTags: ['medium'] },
    { name: 'Scavenger', faction: 'Terminid', scopeTags: ['chaff'] },
    { name: 'Bile Titan', faction: 'Terminid', scopeTags: ['giant'] }
  ];

  assert.equal(normalizeEnemyDropdownSortMode(), 'targets');
  assert.equal(normalizeEnemyDropdownSortMode('type'), 'targets');
  assert.equal(normalizeEnemyDropdownSortMode('alphabetic'), 'alphabetical');
  assert.equal(normalizeEnemyDropdownSortDir(), 'asc');
  assert.equal(normalizeEnemyDropdownSortDir('desc'), 'desc');
  assert.deepEqual(
    getEnemyDropdownSortModeOptions(),
    [
      { id: 'targets', label: 'Targets' },
      { id: 'alphabetical', label: 'Alphabetical' }
    ]
  );
  assert.deepEqual(
    sortEnemyDropdownOptions(enemies, { sortMode: 'targets' }).map((enemy) => enemy.name),
    ['Scavenger', 'Warrior', 'Bile Titan', 'Trooper', 'Hulk', 'Overseer']
  );
  assert.deepEqual(
    sortEnemyDropdownOptions(enemies, { sortMode: 'targets', sortDir: 'desc' }).map((enemy) => enemy.name),
    ['Bile Titan', 'Warrior', 'Scavenger', 'Hulk', 'Trooper', 'Overseer']
  );
  assert.deepEqual(
    sortEnemyDropdownOptions(enemies, { sortMode: 'alphabetical' }).map((enemy) => enemy.name),
    ['Bile Titan', 'Scavenger', 'Warrior', 'Hulk', 'Trooper', 'Overseer']
  );
  assert.deepEqual(
    sortEnemyDropdownOptions(enemies, { sortMode: 'alphabetical', sortDir: 'desc' }).map((enemy) => enemy.name),
    ['Warrior', 'Scavenger', 'Bile Titan', 'Trooper', 'Hulk', 'Overseer']
  );
});

// ========================================================================
// Enemy target type selection state management
// ========================================================================

test('enemy target type selection normalizes ids and toggles independently', () => {
  const previousTargetTypes = [...calculatorState.enemyTargetTypes];

  try {
    setSelectedEnemyTargetTypes(['Objectives', 'unit', 'unit']);
    assert.deepEqual(getSelectedEnemyTargetTypes(), ['objective', 'chaff', 'medium', 'elite', 'tank']);

    toggleSelectedEnemyTargetType('structure');
    assert.deepEqual(getSelectedEnemyTargetTypes(), ['objective', 'chaff', 'medium', 'elite', 'tank', 'structure']);

    toggleSelectedEnemyTargetType('Objectives');
    assert.deepEqual(getSelectedEnemyTargetTypes(), ['chaff', 'medium', 'elite', 'tank', 'structure']);

    toggleSelectedEnemyTargetType('unit');
    assert.deepEqual(getSelectedEnemyTargetTypes(), ['structure']);
  } finally {
    calculatorState.enemyTargetTypes = previousTargetTypes;
  }
});

test('enemy target type selection normalizes minus/base/plus ids back to broad filter ids', () => {
  const previousTargetTypes = [...calculatorState.enemyTargetTypes];

  try {
    setSelectedEnemyTargetTypes(['medium+', 'chaff-', 'giant', 'giant+']);
    assert.deepEqual(getSelectedEnemyTargetTypes(), ['medium', 'chaff', 'giant']);
  } finally {
    calculatorState.enemyTargetTypes = previousTargetTypes;
  }
});

test('overview outcome selection uses shared labels and toggles independently', () => {
  const previousOutcomeKinds = [...calculatorState.overviewOutcomeKinds];

  try {
    assert.deepEqual(DEFAULT_OVERVIEW_OUTCOME_KINDS, ['fatal', 'doomed', 'main', 'critical', 'limb', 'utility']);
    assert.deepEqual(
      getOverviewOutcomeOptions().map(({ id, label }) => [id, label]),
      [
        ['fatal', 'Kill'],
        ['doomed', 'Doomed'],
        ['main', 'Main'],
        ['critical', 'Critical'],
        ['limb', 'Limb'],
        ['utility', 'Part']
      ]
    );

    setSelectedOverviewOutcomeKinds(['Main', 'Kill', 'Part', 'Kill']);
    assert.deepEqual(getSelectedOverviewOutcomeKinds(), ['fatal', 'main', 'utility']);

    toggleSelectedOverviewOutcomeKind('Critical');
    assert.deepEqual(getSelectedOverviewOutcomeKinds(), ['fatal', 'main', 'critical', 'utility']);

    toggleSelectedOverviewOutcomeKind('Kill');
    assert.deepEqual(getSelectedOverviewOutcomeKinds(), ['main', 'critical', 'utility']);
  } finally {
    calculatorState.overviewOutcomeKinds = previousOutcomeKinds;
  }
});

// ========================================================================
// Scope control visibility
// ========================================================================

test('scope controls are available before selection in both single and compare mode', () => {
  assert.equal(shouldShowEnemyControls({
    mode: 'compare',
    compareView: 'focused',
    hasFocusedEnemy: false
  }), true);
  assert.equal(shouldShowEnemyScopeControls({ mode: 'compare' }), true);
  assert.equal(shouldShowEnemyControls({
    mode: 'single',
    compareView: 'focused',
    hasFocusedEnemy: false
  }), true);
  assert.equal(shouldShowEnemyScopeControls({ mode: 'single' }), true);
});

test('focused targeting defaults to projectile selection unless attacks are explicitly explosive-only', () => {
  const previousMode = calculatorState.mode;

  try {
    calculatorState.mode = 'single';
    assert.deepEqual(getFocusedTargetingModes([], []), {
      hasProjectileTargets: true,
      hasExplosiveTargets: false
    });

    assert.deepEqual(getFocusedTargetingModes([{
      'Atk Type': 'Explosion',
      'Atk Name': 'Blast'
    }], []), {
      hasProjectileTargets: false,
      hasExplosiveTargets: true
    });

    calculatorState.mode = 'compare';
    assert.deepEqual(getFocusedTargetingModes([{
      'Atk Type': 'Projectile',
      'Atk Name': 'Bullet'
    }], [{
      'Atk Type': 'Explosion',
      'Atk Name': 'Blast'
    }]), {
      hasProjectileTargets: true,
      hasExplosiveTargets: true
    });
  } finally {
    calculatorState.mode = previousMode;
  }
});

test('enemy controls place scope and targets above the enemy selector', () => {
  assert.deepEqual(
    getEnemyControlSections({
      mode: 'single',
      compareView: 'focused',
      hasFocusedEnemy: false,
      enemyTableMode: 'analysis'
    }),
    {
      beforeEnemySelector: ['scope', 'targets', 'sort'],
      afterEnemySelector: []
    }
  );

  assert.deepEqual(
    getEnemyControlSections({
      mode: 'compare',
      compareView: 'focused',
      hasFocusedEnemy: true,
      enemyTableMode: 'stats'
    }),
    {
      beforeEnemySelector: ['scope', 'targets', 'sort'],
      afterEnemySelector: ['view', 'grouping']
    }
  );

  assert.deepEqual(
    getEnemyControlSections({
      mode: 'compare',
      compareView: 'overview',
      hasFocusedEnemy: false,
      enemyTableMode: 'analysis'
    }),
    {
      beforeEnemySelector: ['scope', 'targets', 'sort'],
      afterEnemySelector: ['view', 'grouping', 'diff', 'outcomes']
    }
  );
});

test('overview outcomes toolbar control renders shared labels and toggles selection', () => {
  const previousDocument = globalThis.document;
  const previousOutcomeKinds = [...calculatorState.overviewOutcomeKinds];
  const document = new TestDocument();
  const toolbar = document.createElement('div');
  let refreshCount = 0;

  function renderControl() {
    toolbar.innerHTML = '';
    appendEnemyToolbarControl(toolbar, 'outcomes', {
      onRefreshEnemyCalculationViews: handleRefresh
    });
  }

  function handleRefresh() {
    refreshCount += 1;
    renderControl();
  }

  try {
    globalThis.document = document;
    setSelectedOverviewOutcomeKinds(DEFAULT_OVERVIEW_OUTCOME_KINDS);
    renderControl();

    assert.equal(toolbar.children[0].textContent, 'Outcomes:');
    assert.deepEqual(
      toolbar.children[1].children.map((button) => button.textContent),
      getOverviewOutcomeOptions().map(({ label }) => label)
    );
    assert.equal(toolbar.children[1].children.every((button) => button.classList.contains('is-active')), true);

    toolbar.children[1].children[2].dispatch('click');

    assert.equal(refreshCount, 1);
    assert.deepEqual(getSelectedOverviewOutcomeKinds(), ['fatal', 'doomed', 'critical', 'limb', 'utility']);
    assert.equal(toolbar.children[1].children[2].classList.contains('is-active'), false);
  } finally {
    globalThis.document = previousDocument;
    calculatorState.overviewOutcomeKinds = previousOutcomeKinds;
  }
});

// ========================================================================
// Scope option ordering
// ========================================================================

test('scope options keep the three base fronts in gameplay order before extras', () => {
  const previousUnits = enemyState.units;

  try {
    enemyState.units = [
      { name: 'Predator Hunter', faction: 'Terminid' },
      { name: 'Rupture Charger', faction: 'Terminid' },
      { name: 'Spore Burst Scavenger', faction: 'Terminid' },
      { name: 'Agitator', faction: 'Automaton' },
      { name: 'Hulk Firebomber', faction: 'Automaton' },
      { name: 'Overseer', faction: 'Illuminate' },
      { name: 'Fleshmob', faction: 'Illuminate' },
      { name: 'Gatekeeper', faction: 'Illuminate' }
    ];
    assert.deepEqual(getOverviewScopeOptions().map(({ id, label }) => [id, label]), [
      ['all', 'All enemies'],
      ['terminids', 'All Terminids'],
      ['rupture-strain', 'Rupture Strain'],
      ['spore-burst-strain', 'Spore Burst Strain'],
      ['predator-strain', 'Predator Strain'],
      ['automatons', 'All Automatons'],
      ['cyborg-legion', 'Cyborg Legion'],
      ['incineration-corps', 'Incineration Corps'],
      ['illuminate', 'All Illuminate'],
      ['illuminate-common', 'Illuminate Common'],
      ['mindless-masses', 'Mindless Masses'],
      ['appropriators', 'Appropriators']
    ]);
  } finally {
    enemyState.units = previousUnits;
  }
});

// ========================================================================
// Overview dropdown HTML (aspects not covered by calculator-ui-selectors)
// ========================================================================

test('overview dropdown option uses a dedicated highlighted presentation', () => {
  assert.equal(ENEMY_OVERVIEW_DROPDOWN_CLASS, 'dropdown-item dropdown-item-overview');
  assert.match(getEnemyOverviewOptionHtml('all'), /enemy-dropdown-name/i);
  assert.match(getEnemyOverviewOptionHtml('all'), /enemy-dropdown-meta/i);
  assert.match(getEnemyOverviewOptionHtml('all'), /compare all matching enemies/i);
  assert.match(getEnemyOverviewOptionHtml('Appropriators'), /compare matching appropriators enemies/i);
  assert.match(getEnemyOverviewOptionHtml('Illuminate Common'), /compare matching illuminate common enemies/i);
});

// ========================================================================
// Enemy dropdown item model — icon src and asset existence
// (badge structure is already pinned by calculator-ui-selectors.test.js;
//  these tests add icon path and file-existence assertions)
// ========================================================================

test('enemy dropdown item model exposes faction, subgroup, and target badges', () => {
  const model = getEnemyDropdownItemModel({
    name: 'Predator Hunter',
    faction: 'Terminid',
    scopeTags: ['elite']
  });

  assert.equal(model.frontBadge.text, 'BUG');
  assert.equal(model.frontBadge.label, 'Terminids');
  assert.deepEqual(model.subgroupBadges.map((badge) => badge.text), ['Predator Strain']);
  assert.equal(model.subgroupBadges[0].iconSrc, 'assets/icons/subfactions/predator-strain.svg');
  assert.equal(existsSync(new URL('../assets/icons/subfactions/predator-strain.svg', import.meta.url)), true);
  assert.equal(model.armyRoleBadge, null);
  assert.deepEqual(model.targetBadge, {
    id: 'elite',
    text: 'E',
    label: 'Elite'
  });
  assert.match(model.metaTitle, /Terminids/i);
  assert.match(model.metaTitle, /Predator Strain/i);
  assert.match(model.metaTitle, /Elite/i);
  assert.match(model.searchText, /predator strain/i);
});

test('enemy dropdown item model can expose overlapping Illuminate subgroups and a common-role badge', () => {
  const model = getEnemyDropdownItemModel({
    name: 'Overseer',
    faction: 'Illuminate',
    scopeTags: ['medium']
  });

  assert.equal(model.frontBadge.text, 'SQUID');
  assert.deepEqual(
    model.subgroupBadges.map((badge) => badge.text),
    ['Mindless Masses', 'Appropriators']
  );
  assert.deepEqual(
    model.subgroupBadges.map((badge) => badge.iconSrc),
    [
      'assets/icons/subfactions/mindless-masses.svg',
      'assets/icons/subfactions/appropriators.svg'
    ]
  );
  assert.deepEqual(model.armyRoleBadge, {
    id: 'common',
    text: 'C',
    label: 'Common Army'
  });
  assert.deepEqual(model.targetBadge, {
    id: 'medium',
    text: 'M',
    label: 'Medium'
  });
  assert.match(model.metaTitle, /Common Army/i);
  assert.match(model.searchText, /common army/i);
});

test('enemy dropdown item model can expose an Illuminate exclusive-role badge', () => {
  const model = getEnemyDropdownItemModel({
    name: 'Veracitor',
    faction: 'Illuminate',
    scopeTags: ['tank']
  });

  assert.equal(model.frontBadge.text, 'SQUID');
  assert.deepEqual(model.subgroupBadges.map((badge) => badge.text), ['Appropriators']);
  assert.equal(model.subgroupBadges[0].iconSrc, 'assets/icons/subfactions/appropriators.svg');
  assert.deepEqual(model.armyRoleBadge, {
    id: 'exclusive',
    text: 'E',
    label: 'Appropriators Exclusive'
  });
  assert.deepEqual(model.targetBadge, {
    id: 'tank',
    text: 'T',
    label: 'Tank'
  });
  assert.match(model.metaTitle, /Appropriators Exclusive/i);
});

test('enemy dropdown item model falls back to text when a subgroup icon is unavailable', () => {
  const model = getEnemyDropdownItemModel({
    name: 'Spore Burst Hunter',
    faction: 'Terminid',
    scopeTags: ['elite']
  });

  assert.deepEqual(model.subgroupBadges.map((badge) => badge.text), ['Spore Burst Strain']);
  assert.equal(model.subgroupBadges[0].iconSrc, null);
});
