import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

import { state as weaponsState } from '../weapons/data.js';
import { enemyState, getEnemyUnitByName, getZoneRelationContext, processEnemyData } from '../enemies/data.js';
import {
  calculatorState,
  DEFAULT_CALCULATOR_MODE,
  DEFAULT_COMPARE_VIEW,
  DEFAULT_ENEMY_DROPDOWN_SORT_DIR,
  DEFAULT_ENEMY_DROPDOWN_SORT_MODE,
  DEFAULT_ENEMY_TARGET_TYPES,
  DEFAULT_OVERVIEW_SCOPE,
  DEFAULT_WEAPON_SORT_MODE,
  getEnemyOptions,
  getSelectedEnemyTargetTypes,
  getOverviewScopeOptions,
  getWeaponOptions,
  getWeaponSortModeOptionsForState,
  setCalculatorMode,
  setEnemyTableMode,
  setRecommendationRangeMeters,
  setSelectedEnemyTargetTypes,
  setWeaponSortMode,
  setSelectedWeapon,
  toggleSelectedEnemyTargetType
} from '../calculator/data.js';
import {
  getEnemyColumnsForState,
  getEnemyControlSections,
  getFocusedTargetingModes,
  getZoneRelationHighlightKind,
  getWeaponRangeAdjustedCellDisplay,
  getOverviewColumnsForState,
  renderWeaponDetails,
  shouldShowEnemyControls,
  shouldShowEnemyScopeControls
} from '../calculator/rendering.js';
import {
  filterEnemiesByScope,
  getEnemyDropdownQueryState,
  getEnemyDropdownSortModeOptions,
  normalizeEnemyDropdownSortDir,
  normalizeEnemyDropdownSortMode,
  sortEnemyDropdownOptions
} from '../calculator/selector-utils.js';
import { filterEnemiesByTargetTypes, getEnemyTargetTypeOptions } from '../calculator/enemy-scope.js';
import {
  ENEMY_OVERVIEW_DROPDOWN_CLASS,
  formatEngagementRangeDisplayValue,
  getCalculatorModeButtonTitle,
  getEnemyDropdownItemModel,
  getEnemyDropdownOptionsForQuery,
  getEnemyOverviewOptionHtml,
  getWeaponInputDisplayValue,
  setupEngagementRangeControl
} from '../calculator/ui.js';
import {
  ENGAGEMENT_RANGE_STOPS,
  findNearestEngagementRangeStop
} from '../calculator/engagement-range.js';
import {
  compareWeaponOptionsByApDescending,
  getWeaponDropdownApInfo,
  getWeaponOptionDisplayModel,
  getWeaponRowPreviewHitCount,
  getWeaponSortModeOptions,
  normalizeWeaponSortMode,
  sortWeaponOptions,
  sortWeaponOptionsForReference
} from '../calculator/weapon-dropdown.js';
import {
  applyExplosiveDisplayToCell,
  EXPLOSIVE_DISPLAY_COLUMN_LABEL,
  getExplosiveDisplayInfo
} from '../calculator/explosive-display.js';
import { buildCompareTtkTooltip } from '../calculator/compare-tooltips.js';
import { formatDamageValue, roundDamagePacket } from '../calculator/damage-rounding.js';
import {
  getEnemyZoneConDisplayInfo,
  getEnemyZoneHealthDisplayInfo,
  MAIN_CON_ANY_DEATH_TOOLTIP,
  ZERO_BLEED_CON_TOOLTIP
} from '../calculator/enemy-zone-display.js';
import {
  calculateBallisticDamageAtDistance,
  ingestBallisticFalloffCsvText,
  resetBallisticFalloffProfiles
} from '../weapons/falloff.js';

const UI_TEST_FALLOFF_CSV = `Category,Weapon,Caliber,Mass,Velocity,Drag
Primary,AR-23 Liberator,5.5,4.5,900,0.3
Marksman,R-63 Diligence,8,8.5,960,0.2`;

test('enemy dropdown keeps real enemies visible when overview is the current compare selection', () => {
  const state = getEnemyDropdownQueryState('Overview', {
    mode: 'compare',
    compareView: 'overview'
  });

  assert.equal(state.effectiveQuery, '');
  assert.equal(state.showOverviewOption, true);
});

test('enemy dropdown still filters normally for typed overview searches outside the selected overview label', () => {
  const state = getEnemyDropdownQueryState('over', {
    mode: 'compare',
    compareView: 'focused'
  });

  assert.equal(state.effectiveQuery, 'over');
  assert.equal(state.showOverviewOption, true);
});

test('enemy dropdown does not offer overview in single mode', () => {
  const state = getEnemyDropdownQueryState('', {
    mode: 'single',
    compareView: 'focused'
  });

  assert.equal(state.effectiveQuery, '');
  assert.equal(state.showOverviewOption, false);
});

test('calculator defaults to focused compare mode with all scopes enabled', () => {
  assert.equal(DEFAULT_CALCULATOR_MODE, 'compare');
  assert.equal(DEFAULT_COMPARE_VIEW, 'focused');
  assert.equal(DEFAULT_OVERVIEW_SCOPE, 'all');
  assert.equal(DEFAULT_ENEMY_DROPDOWN_SORT_DIR, 'asc');
  assert.equal(DEFAULT_ENEMY_DROPDOWN_SORT_MODE, 'targets');
  assert.deepEqual(DEFAULT_ENEMY_TARGET_TYPES, ['chaff', 'medium', 'elite', 'tank', 'giant']);
  assert.equal(DEFAULT_WEAPON_SORT_MODE, 'grouped');
});

test('enemy dropdown treats the selected enemy label as display text rather than a live filter', () => {
  const state = getEnemyDropdownQueryState('Stalker', {
    mode: 'compare',
    compareView: 'focused',
    selectedEnemyName: 'Stalker'
  });

  assert.equal(state.effectiveQuery, '');
  assert.equal(state.showOverviewOption, false);
});

test('enemy dropdown option pipeline returns renderable enemy objects', () => {
  const enemies = [
    { name: 'Overseer', faction: 'Illuminate', scopeTags: ['medium'] },
    { name: 'Fleshmob', faction: 'Illuminate', scopeTags: ['tank'] },
    { name: 'Gatekeeper', faction: 'Illuminate', scopeTags: ['tank'] }
  ];

  const { filteredOptions, showOverviewOption } = getEnemyDropdownOptionsForQuery('', {
    options: enemies,
    mode: 'compare',
    compareView: 'overview',
    overviewScope: 'Illuminate Common',
    targetTypeIds: ['medium', 'tank'],
    sortMode: 'targets',
    sortDir: 'asc'
  });

  assert.equal(showOverviewOption, true);
  assert.deepEqual(filteredOptions.map((enemy) => enemy.name), ['Overseer', 'Fleshmob']);
  assert.ok(filteredOptions.every((enemy) => enemy?.faction === 'Illuminate'));
});

test('enemy dropdown scope filtering works from the underlying enemy dataset', () => {
  const enemies = [
    { name: 'Stalker', faction: 'Terminid' },
    { name: 'Predator Hunter', faction: 'Terminid' },
    { name: 'Berserker', faction: 'Automaton' },
    { name: 'Agitator', faction: 'Automaton' },
    { name: 'Overseer', faction: 'Illuminate' },
    { name: 'Fleshmob', faction: 'Illuminate' },
    { name: 'Gatekeeper', faction: 'Illuminate' }
  ];

  assert.deepEqual(
    filterEnemiesByScope(enemies, 'all').map((enemy) => enemy.name),
    ['Stalker', 'Predator Hunter', 'Berserker', 'Agitator', 'Overseer', 'Fleshmob', 'Gatekeeper']
  );
  assert.deepEqual(
    filterEnemiesByScope(enemies, 'Automatons').map((enemy) => enemy.name),
    ['Berserker', 'Agitator']
  );
  assert.deepEqual(
    filterEnemiesByScope(enemies, 'Predator Strain').map((enemy) => enemy.name),
    ['Predator Hunter']
  );
  assert.deepEqual(
    filterEnemiesByScope(enemies, 'Mindless Masses').map((enemy) => enemy.name),
    ['Overseer', 'Fleshmob']
  );
  assert.deepEqual(
    filterEnemiesByScope(enemies, 'Appropriators').map((enemy) => enemy.name),
    ['Overseer', 'Gatekeeper']
  );
  assert.deepEqual(
    filterEnemiesByScope(enemies, 'Illuminate Common').map((enemy) => enemy.name),
    ['Overseer', 'Fleshmob']
  );
});

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

test('processEnemyData keeps inline enemies hidden from the selector but available by name', () => {
  const previousState = {
    factions: enemyState.factions,
    units: enemyState.units,
    inlineUnits: enemyState.inlineUnits,
    filteredUnits: enemyState.filteredUnits,
    filterActive: enemyState.filterActive,
    sortKey: enemyState.sortKey,
    sortDir: enemyState.sortDir,
    factionIndex: enemyState.factionIndex,
    searchIndex: enemyState.searchIndex,
    unitIndex: enemyState.unitIndex
  };

  try {
    processEnemyData({
      Automaton: {
        'Factory Strider': {
          health: 10000,
          scope_tags: ['giant'],
          damageable_zones: [
            { zone_name: 'Main', health: 10000 }
          ],
          inline_enemies: {
            'Factory Strider Belly Panels': {
              health: 1200,
              show_in_selector: false,
              source_provenance: 'wiki-measured',
              source_note: 'Curated inline overlay target',
              damageable_zones: [
                { zone_name: 'belly_panels', health: 1200, Con: 1200 }
              ]
            }
          }
        }
      }
    });

    assert.deepEqual(getEnemyOptions().map((enemy) => enemy.name), ['Factory Strider']);
    assert.equal(enemyState.inlineUnits.length, 1);

    const inlineEnemy = getEnemyUnitByName('Factory Strider Belly Panels');
    assert.equal(inlineEnemy?.isInline, true);
    assert.equal(inlineEnemy?.parentEnemyName, 'Factory Strider');
    assert.equal(inlineEnemy?.showInSelector, false);
    assert.equal(inlineEnemy?.sourceProvenance, 'wiki-measured');
    assert.deepEqual(inlineEnemy?.scopeTags, ['giant']);
  } finally {
    enemyState.factions = previousState.factions;
    enemyState.units = previousState.units;
    enemyState.inlineUnits = previousState.inlineUnits;
    enemyState.filteredUnits = previousState.filteredUnits;
    enemyState.filterActive = previousState.filterActive;
    enemyState.sortKey = previousState.sortKey;
    enemyState.sortDir = previousState.sortDir;
    enemyState.factionIndex = previousState.factionIndex;
    enemyState.searchIndex = previousState.searchIndex;
    enemyState.unitIndex = previousState.unitIndex;
  }
});

test('processEnemyData assigns stable numbered labels to unknown zones within an enemy', () => {
  const previousState = {
    factions: enemyState.factions,
    units: enemyState.units,
    inlineUnits: enemyState.inlineUnits,
    filteredUnits: enemyState.filteredUnits,
    filterActive: enemyState.filterActive,
    sortKey: enemyState.sortKey,
    sortDir: enemyState.sortDir,
    factionIndex: enemyState.factionIndex,
    searchIndex: enemyState.searchIndex,
    unitIndex: enemyState.unitIndex
  };

  try {
    processEnemyData({
      Automaton: {
        'Unknown Walker': {
          health: 800,
          damageable_zones: [
            { zone_name: '[unknown]', health: 200 },
            { zone_name: 'head', health: 150 },
            { zone_name: '[unknown]', health: 250 }
          ]
        }
      }
    });

    const unit = getEnemyUnitByName('Unknown Walker');
    assert.deepEqual(
      unit?.zones.map((zone) => [zone.zone_name, zone.raw_zone_name || null]),
      [
        ['[unknown 1]', '[unknown]'],
        ['head', null],
        ['[unknown 2]', '[unknown]']
      ]
    );
  } finally {
    enemyState.factions = previousState.factions;
    enemyState.units = previousState.units;
    enemyState.inlineUnits = previousState.inlineUnits;
    enemyState.filteredUnits = previousState.filteredUnits;
    enemyState.filterActive = previousState.filterActive;
    enemyState.sortKey = previousState.sortKey;
    enemyState.sortDir = previousState.sortDir;
    enemyState.factionIndex = previousState.factionIndex;
    enemyState.searchIndex = previousState.searchIndex;
    enemyState.unitIndex = previousState.unitIndex;
  }
});

test('processEnemyData normalizes zone relations for same-limb, mirror, and priority targets', () => {
  const previousState = {
    factions: enemyState.factions,
    units: enemyState.units,
    inlineUnits: enemyState.inlineUnits,
    filteredUnits: enemyState.filteredUnits,
    filterActive: enemyState.filterActive,
    sortKey: enemyState.sortKey,
    sortDir: enemyState.sortDir,
    factionIndex: enemyState.factionIndex,
    searchIndex: enemyState.searchIndex,
    unitIndex: enemyState.unitIndex
  };

  try {
    processEnemyData({
      Illuminate: {
        'Relation Walker': {
          health: 3000,
          damageable_zones: [
            { zone_name: 'left_hip', health: 400, IsFatal: true },
            { zone_name: 'left_upper_leg', health: 500 },
            { zone_name: 'right_hip', health: 400, IsFatal: true }
          ],
          zone_relation_groups: [
            {
              id: 'left-leg',
              label: 'Left leg',
              zones: ['left_hip', 'left_upper_leg'],
              mirror_group: 'right-leg',
              priority_target_zones: ['left_hip']
            },
            {
              id: 'right-leg',
              label: 'Right leg',
              zones: ['right_hip'],
              mirror_group: 'left-leg',
              priority_target_zones: ['right_hip']
            }
          ]
        }
      }
    });

    const unit = getEnemyUnitByName('Relation Walker');
    const relationContext = getZoneRelationContext(unit, 'left_upper_leg');

    assert.deepEqual(relationContext?.groupLabels, ['Left leg']);
    assert.deepEqual(new Set(relationContext?.sameZoneNames || []), new Set(['left_hip', 'left_upper_leg']));
    assert.deepEqual(new Set(relationContext?.mirrorZoneNames || []), new Set(['right_hip']));
    assert.deepEqual(relationContext?.priorityTargetZoneNames, ['left_hip']);
    assert.equal(getZoneRelationHighlightKind(unit, 'left_upper_leg', 'left_upper_leg'), 'anchor');
    assert.equal(getZoneRelationHighlightKind(unit, 'left_upper_leg', 'left_hip'), 'group');
    assert.equal(getZoneRelationHighlightKind(unit, 'left_upper_leg', 'right_hip'), 'mirror');
    assert.equal(getZoneRelationHighlightKind(unit, 'left_upper_leg', 'torso'), null);
  } finally {
    enemyState.factions = previousState.factions;
    enemyState.units = previousState.units;
    enemyState.inlineUnits = previousState.inlineUnits;
    enemyState.filteredUnits = previousState.filteredUnits;
    enemyState.filterActive = previousState.filterActive;
    enemyState.sortKey = previousState.sortKey;
    enemyState.sortDir = previousState.sortDir;
    enemyState.factionIndex = previousState.factionIndex;
    enemyState.searchIndex = previousState.searchIndex;
    enemyState.unitIndex = previousState.unitIndex;
  }
});

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
      afterEnemySelector: ['view', 'grouping', 'diff']
    }
  );
});

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

test('overview dropdown option uses a dedicated highlighted presentation', () => {
  assert.equal(ENEMY_OVERVIEW_DROPDOWN_CLASS, 'dropdown-item dropdown-item-overview');
  assert.match(getEnemyOverviewOptionHtml('all'), /enemy-dropdown-name/i);
  assert.match(getEnemyOverviewOptionHtml('all'), /enemy-dropdown-meta/i);
  assert.match(getEnemyOverviewOptionHtml('all'), /compare all matching enemies/i);
  assert.match(getEnemyOverviewOptionHtml('Appropriators'), /compare matching appropriators enemies/i);
  assert.match(getEnemyOverviewOptionHtml('Illuminate Common'), /compare matching illuminate common enemies/i);
});

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

function makeWeapon(name, {
  type = 'Primary',
  sub = 'AR',
  code = '',
  index = 0,
  rows = []
} = {}) {
  return {
    name,
    type,
    sub,
    code,
    index,
    rows
  };
}

function makeAttackRow(ap, dmg, dur = dmg) {
  return {
    AP: ap,
    DMG: dmg,
    DUR: dur
  };
}

class TestClassList {
  constructor(owner) {
    this.owner = owner;
    this.tokens = new Set();
  }

  setFromString(value) {
    this.tokens = new Set(String(value || '').split(/\s+/).filter(Boolean));
  }

  syncOwner() {
    this.owner._className = [...this.tokens].join(' ');
  }

  add(...tokens) {
    tokens.flatMap((token) => String(token || '').split(/\s+/)).filter(Boolean).forEach((token) => {
      this.tokens.add(token);
    });
    this.syncOwner();
  }

  remove(...tokens) {
    tokens.flatMap((token) => String(token || '').split(/\s+/)).filter(Boolean).forEach((token) => {
      this.tokens.delete(token);
    });
    this.syncOwner();
  }

  contains(token) {
    return this.tokens.has(token);
  }
}

class TestElement {
  constructor(tagName, ownerDocument) {
    this.tagName = String(tagName || 'div').toUpperCase();
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.parentNode = null;
    this.style = {};
    this.dataset = {};
    this.listeners = new Map();
    this.value = '';
    this.checked = false;
    this.disabled = false;
    this.type = '';
    this.name = '';
    this.title = '';
    this._textContent = '';
    this._className = '';
    this.classList = new TestClassList(this);
  }

  get className() {
    return this._className;
  }

  set className(value) {
    this._className = String(value || '');
    this.classList.setFromString(this._className);
  }

  get textContent() {
    return `${this._textContent}${this.children.map((child) => child.textContent).join('')}`;
  }

  set textContent(value) {
    this._textContent = String(value ?? '');
    this.children = [];
  }

  get innerHTML() {
    return '';
  }

  set innerHTML(_value) {
    this._textContent = '';
    this.children = [];
  }

  get childElementCount() {
    return this.children.length;
  }

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  dispatch(type, event = {}) {
    const listeners = this.listeners.get(type) || [];
    listeners.forEach((listener) => listener({
      target: this,
      currentTarget: this,
      ...event
    }));
  }
}

class TestDocument {
  constructor() {
    this.elementsById = new Map();
  }

  createElement(tagName) {
    return new TestElement(tagName, this);
  }

  getElementById(id) {
    return this.elementsById.get(id) || null;
  }

  registerElement(id, tagName = 'div') {
    const element = this.createElement(tagName);
    element.id = id;
    this.elementsById.set(id, element);
    return element;
  }

  addEventListener() {}
}

function collectElements(root, predicate, matches = []) {
  if (!root) {
    return matches;
  }

  if (predicate(root)) {
    matches.push(root);
  }

  root.children.forEach((child) => collectElements(child, predicate, matches));
  return matches;
}

test('weapon details DMG cells can show range-adjusted projectile damage with a base-value tooltip', () => {
  resetBallisticFalloffProfiles();
  ingestBallisticFalloffCsvText(UI_TEST_FALLOFF_CSV);

  try {
    const weapon = makeWeapon('Liberator', {
      code: 'AR-23',
      rows: [{
        ...makeAttackRow(2, 90, 22),
        'Atk Type': 'Projectile'
      }]
    });
    const attackRow = weapon.rows[0];
    const display = getWeaponRangeAdjustedCellDisplay('DMG', {
      displayRow: attackRow,
      rowA: attackRow,
      rowB: null
    }, {
      compareMode: false,
      weaponA: weapon,
      rangeA: 100
    });

    const expectedDamage = formatDamageValue(roundDamagePacket(calculateBallisticDamageAtDistance(90, {
      caliber: 5.5,
      mass: 4.5,
      velocity: 900,
      drag: 0.3
    }, 100)));
    assert.equal(display?.text, expectedDamage);
    assert.equal(display?.isAdjusted, true);
    assert.match(display?.title || '', /Weapon A DMG at 100m:/i);
    assert.match(display?.title || '', /base 90/i);
    assert.match(display?.title || '', /reduction/i);
  } finally {
    resetBallisticFalloffProfiles();
  }
});

test('weapon details leave explosive DMG cells raw and explain why on hover', () => {
  resetBallisticFalloffProfiles();
  ingestBallisticFalloffCsvText(UI_TEST_FALLOFF_CSV);

  try {
    const weapon = makeWeapon('Grenade Launcher', {
      code: 'GL-21',
      rows: [{
        ...makeAttackRow(3, 400, 400),
        'Atk Type': 'Explosion'
      }]
    });
    const attackRow = weapon.rows[0];
    const display = getWeaponRangeAdjustedCellDisplay('DMG', {
      displayRow: attackRow,
      rowA: attackRow,
      rowB: null
    }, {
      compareMode: false,
      weaponA: weapon,
      rangeA: 100
    });

    assert.equal(display?.text, '400');
    assert.equal(display?.isAdjusted, false);
    assert.match(display?.title || '', /explosive row, no ballistic falloff/i);
  } finally {
    resetBallisticFalloffProfiles();
  }
});

test('weapon details split compare-mode DMG cells when A and B ranges differ', () => {
  resetBallisticFalloffProfiles();
  ingestBallisticFalloffCsvText(UI_TEST_FALLOFF_CSV);

  try {
    const attackRowA = {
      ...makeAttackRow(2, 90, 22),
      'Atk Type': 'Projectile'
    };
    const attackRowB = {
      ...makeAttackRow(2, 90, 22),
      'Atk Type': 'Projectile'
    };
    const weaponA = makeWeapon('Liberator', {
      code: 'AR-23',
      rows: [attackRowA]
    });
    const weaponB = makeWeapon('Diligence', {
      code: 'R-63',
      rows: [attackRowB]
    });
    const display = getWeaponRangeAdjustedCellDisplay('DMG', {
      displayRow: attackRowA,
      rowA: attackRowA,
      rowB: attackRowB
    }, {
      compareMode: true,
      weaponA,
      weaponB,
      rangeA: 100,
      rangeB: 50
    });

    const expectedA = formatDamageValue(roundDamagePacket(calculateBallisticDamageAtDistance(90, {
      caliber: 5.5,
      mass: 4.5,
      velocity: 900,
      drag: 0.3
    }, 100)));
    const expectedB = formatDamageValue(roundDamagePacket(calculateBallisticDamageAtDistance(90, {
      caliber: 8,
      mass: 8.5,
      velocity: 960,
      drag: 0.2
    }, 50)));

    assert.equal(display?.text, `A ${expectedA} • B ${expectedB}`);
    assert.equal(display?.isAdjusted, true);
    assert.equal(display?.isSplit, true);
    assert.match(display?.title || '', /Weapon A DMG at 100m:/i);
    assert.match(display?.title || '', /Weapon B DMG at 50m:/i);
  } finally {
    resetBallisticFalloffProfiles();
  }
});

test('weapon details keep zero-range DMG cells unchanged', () => {
  const weapon = makeWeapon('Liberator', {
    code: 'AR-23',
    rows: [{
      ...makeAttackRow(2, 90, 22),
      'Atk Type': 'Projectile'
    }]
  });
  const attackRow = weapon.rows[0];

  assert.equal(getWeaponRangeAdjustedCellDisplay('DMG', {
    displayRow: attackRow,
    rowA: attackRow,
    rowB: null
  }, {
    compareMode: false,
    weaponA: weapon,
    rangeA: 0
  }), null);
});

test('engagement range change rerenders the upper weapon details table', () => {
  resetBallisticFalloffProfiles();
  ingestBallisticFalloffCsvText(UI_TEST_FALLOFF_CSV);

  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;
  const originalMode = calculatorState.mode;
  const originalWeaponA = calculatorState.weaponA;
  const originalSelectedEnemy = calculatorState.selectedEnemy;
  const originalSelectedZoneIndex = calculatorState.selectedZoneIndex;
  const originalSelectedExplosiveZoneIndices = [...calculatorState.selectedExplosiveZoneIndices];
  const originalSelectedAttackKeysA = [...calculatorState.selectedAttackKeys.A];
  const originalAttackHitCountsA = { ...calculatorState.attackHitCounts.A };
  const originalRangeA = calculatorState.engagementRangeMeters.A;

  try {
    const testDocument = new TestDocument();
    const weaponDetails = testDocument.registerElement('calculator-weapon-details');
    const rangeInput = testDocument.registerElement('calculator-range-input-a', 'input');
    const rangeValue = testDocument.registerElement('calculator-range-value-a', 'span');

    globalThis.document = testDocument;
    globalThis.window = {
      _weaponsState: {
        keys: {
          atkTypeKey: 'Atk Type'
        }
      }
    };

    calculatorState.mode = 'single';
    calculatorState.selectedEnemy = null;
    calculatorState.selectedZoneIndex = null;
    calculatorState.selectedExplosiveZoneIndices = [];
    calculatorState.engagementRangeMeters.A = 0;
    setSelectedWeapon('A', makeWeapon('Liberator', {
      code: 'AR-23',
      rows: [{
        ...makeAttackRow(2, 105, 30),
        'Atk Type': 'Projectile',
        'Atk Name': '5.5x50mm FULL METAL JACKET_P'
      }]
    }));

    setupEngagementRangeControl('A');
    renderWeaponDetails();

    const initialCells = collectElements(weaponDetails, (element) => element.tagName === 'TD');
    assert.ok(initialCells.some((cell) => cell.textContent === '105'));
    assert.equal(rangeValue.textContent, formatEngagementRangeDisplayValue(0));

    const expectedDamage = formatDamageValue(roundDamagePacket(calculateBallisticDamageAtDistance(105, {
      caliber: 5.5,
      mass: 4.5,
      velocity: 900,
      drag: 0.3
    }, 100)));

    rangeInput.value = '100';
    rangeInput.dispatch('change');

    const updatedCells = collectElements(weaponDetails, (element) => element.tagName === 'TD');
    assert.ok(updatedCells.some((cell) => cell.textContent === expectedDamage));
    assert.equal(rangeValue.textContent, formatEngagementRangeDisplayValue(100));
  } finally {
    resetBallisticFalloffProfiles();
    globalThis.document = originalDocument;
    globalThis.window = originalWindow;
    calculatorState.mode = originalMode;
    calculatorState.weaponA = originalWeaponA;
    calculatorState.selectedEnemy = originalSelectedEnemy;
    calculatorState.selectedZoneIndex = originalSelectedZoneIndex;
    calculatorState.selectedExplosiveZoneIndices = originalSelectedExplosiveZoneIndices;
    calculatorState.selectedAttackKeys.A = originalSelectedAttackKeysA;
    calculatorState.attackHitCounts.A = originalAttackHitCountsA;
    calculatorState.engagementRangeMeters.A = originalRangeA;
  }
});

test('enemy table mode defaults to analysis and normalizes to supported values', () => {
  setEnemyTableMode('analysis');
  assert.equal(calculatorState.enemyTableMode, 'analysis');

  setEnemyTableMode('stats');
  assert.equal(calculatorState.enemyTableMode, 'stats');

  setEnemyTableMode('unknown');
  assert.equal(calculatorState.enemyTableMode, 'analysis');
});

test('recommendation range meters normalize into a bounded integer', () => {
  const previousRanges = { ...calculatorState.engagementRangeMeters };

  try {
    assert.equal(setRecommendationRangeMeters('30.7'), 31);
    assert.equal(calculatorState.engagementRangeMeters.A, 31);
    assert.equal(calculatorState.engagementRangeMeters.B, 31);
    assert.equal(setRecommendationRangeMeters(-5), 0);
    assert.equal(setRecommendationRangeMeters(999), 500);
  } finally {
    calculatorState.engagementRangeMeters = previousRanges;
  }
});

test('recommendation range compatibility alias mirrors engagement ranges', () => {
  const previousRanges = { ...calculatorState.engagementRangeMeters };

  try {
    calculatorState.recommendationRangeMeters = 45;
    assert.equal(calculatorState.engagementRangeMeters.A, 45);
    assert.equal(calculatorState.engagementRangeMeters.B, 45);

    calculatorState.engagementRangeMeters = { A: 10, B: 30 };
    assert.equal(calculatorState.recommendationRangeMeters, 30);
  } finally {
    calculatorState.engagementRangeMeters = previousRanges;
  }
});

test('formatEngagementRangeDisplayValue shows Any for zero range', () => {
  assert.equal(formatEngagementRangeDisplayValue(0), 'Any / 0m');
  assert.equal(formatEngagementRangeDisplayValue(37), '37m');
});

test('engagement range slider snapping prefers preset stops', () => {
  assert.deepEqual(
    ENGAGEMENT_RANGE_STOPS,
    [0, 1, 10, 30, 50, 75, 100, 150, 200, 300, 500]
  );
  assert.equal(findNearestEngagementRangeStop(0), 0);
  assert.equal(findNearestEngagementRangeStop(2), 1);
  assert.equal(findNearestEngagementRangeStop(20), 30);
  assert.equal(findNearestEngagementRangeStop(49), 50);
  assert.equal(findNearestEngagementRangeStop(260), 300);
});

test('single mode always shows the full enemy columns plus derived metrics', () => {
  const columns = getEnemyColumnsForState({
    mode: 'single',
    enemyTableMode: 'analysis'
  });

  assert.deepEqual(
    columns.map((column) => column.key),
    ['zone_name', 'health', 'Con', 'Dur%', 'AV', 'IsFatal', 'ExTarget', 'ExMult', 'ToMain%', 'MainCap', 'shots', 'range', 'ttk']
  );
});

test('compare mode still uses compact analysis columns and optional stats columns', () => {
  const analysisColumns = getEnemyColumnsForState({
    mode: 'compare',
    enemyTableMode: 'analysis'
  });
  assert.deepEqual(
    analysisColumns.map((column) => column.key),
    ['zone_name', 'AV', 'Dur%', 'ToMain%', 'ExMult', 'shotsA', 'rangeA', 'shotsB', 'rangeB', 'shotsDiff', 'ttkA', 'ttkB', 'ttkDiff']
  );

  const statsColumns = getEnemyColumnsForState({
    mode: 'compare',
    enemyTableMode: 'stats'
  });
  assert.deepEqual(
    statsColumns.map((column) => column.key),
    ['zone_name', 'health', 'Con', 'Dur%', 'AV', 'IsFatal', 'ExTarget', 'ExMult', 'ToMain%', 'MainCap']
  );

  const overviewAnalysisColumns = getOverviewColumnsForState({
    enemyTableMode: 'analysis',
    overviewScope: 'all'
  });
  assert.deepEqual(
    overviewAnalysisColumns.map((column) => column.key),
    ['faction', 'enemy', 'zone_name', 'AV', 'Dur%', 'ToMain%', 'ExMult', 'shotsA', 'rangeA', 'shotsB', 'rangeB', 'shotsDiff', 'ttkA', 'ttkB', 'ttkDiff']
  );

  const scopedOverviewColumns = getOverviewColumnsForState({
    enemyTableMode: 'analysis',
    overviewScope: 'appropriators'
  });
  assert.deepEqual(
    scopedOverviewColumns.map((column) => column.key),
    ['enemy', 'zone_name', 'AV', 'Dur%', 'ToMain%', 'ExMult', 'shotsA', 'rangeA', 'shotsB', 'rangeB', 'shotsDiff', 'ttkA', 'ttkB', 'ttkDiff']
  );
});

test('calculator mode buttons expose descriptive hover titles', () => {
  assert.equal(
    getCalculatorModeButtonTitle('single'),
    'One weapon at a time with the full enemy component table.'
  );
  assert.equal(
    getCalculatorModeButtonTitle('compare'),
    'Two weapons side-by-side for each enemy component. Try the Overview enemy!'
  );
});

test('weapon input display value reflects restored selected weapon state', () => {
  const previousWeaponA = calculatorState.weaponA;

  try {
    const weapon = makeWeapon('Recoilless Rifle', {
      type: 'Support',
      sub: 'AT',
      code: 'GR-8',
      rows: [makeAttackRow(6, 650, 450)]
    });

    setSelectedWeapon('A', weapon);
    assert.match(getWeaponInputDisplayValue('A'), /Recoilless Rifle/i);
  } finally {
    calculatorState.weaponA = previousWeaponA;
  }
});

test('weapon sort mode options expose the compare-only reference mode only in compare mode', () => {
  assert.deepEqual(
    getWeaponSortModeOptions({ mode: 'single' }).map((option) => option.id),
    ['grouped', 'ap-desc']
  );
  assert.deepEqual(
    getWeaponSortModeOptions({ mode: 'compare' }).map((option) => option.id),
    ['grouped', 'ap-desc', 'match-reference-subtype', 'match-reference-slot']
  );
  assert.equal(normalizeWeaponSortMode('match-reference', { mode: 'compare' }), 'match-reference-subtype');
});

test('weapon dropdown AP preview ignores zero or insignificant high-AP rows', () => {
  const grenadeLauncher = makeWeapon('Grenade Launcher', {
    type: 'Support',
    sub: 'GL',
    code: 'GL-21',
    rows: [
      makeAttackRow(4, 20, 2),
      makeAttackRow(3, 400, 400)
    ]
  });

  const info = getWeaponDropdownApInfo(grenadeLauncher);
  assert.equal(info.displayAp, 3);
  assert.equal(info.hasCaveat, false);
  assert.deepEqual(info.significantAps, [3]);
});

test('weapon dropdown preview caps multi-projectile rows at three estimated hits', () => {
  assert.equal(getWeaponRowPreviewHitCount({ 'Atk Name': 'SHRAPNEL_P x30', DMG: 110, DUR: 35, AP: 3 }), 3);
  assert.equal(getWeaponRowPreviewHitCount({ 'Atk Name': 'LAS-16_Trident_B x6', DMG: 60, DUR: 6, AP: 2 }), 3);
  assert.equal(getWeaponRowPreviewHitCount({ 'Atk Name': '5.5x50mm FULL METAL JACKET_P', DMG: 90, DUR: 22, AP: 2 }), 1);
});

test('weapon dropdown AP preview keeps max AP and marks significant secondary AP tiers', () => {
  const eruptor = makeWeapon('Eruptor', {
    type: 'Primary',
    sub: 'EXP',
    code: 'R-36',
    rows: [
      { ...makeAttackRow(4, 230, 115), 'Atk Name': '15x100mm HIGH EXPLOSIVE_P' },
      { ...makeAttackRow(3, 225, 225), 'Atk Name': '15x100mm HIGH EXPLOSIVE_P_IE' },
      { ...makeAttackRow(3, 110, 35), 'Atk Name': 'SHRAPNEL_P x30' }
    ]
  });

  const info = getWeaponDropdownApInfo(eruptor);
  assert.equal(info.displayAp, 4);
  assert.equal(info.hasCaveat, true);
  assert.deepEqual(info.significantAps, [3, 4]);
  assert.deepEqual(info.significantSecondaryAps, [3]);
});

test('weapon dropdown display model exposes a compact colored AP value and caveat marker', () => {
  const display = getWeaponOptionDisplayModel(makeWeapon('Eruptor', {
    type: 'Primary',
    sub: 'EXP',
    code: 'R-36',
    rows: [
      { ...makeAttackRow(4, 230, 115), 'Atk Name': '15x100mm HIGH EXPLOSIVE_P' },
      { ...makeAttackRow(3, 225, 225), 'Atk Name': '15x100mm HIGH EXPLOSIVE_P_IE' },
      { ...makeAttackRow(3, 110, 35), 'Atk Name': 'SHRAPNEL_P x30' }
    ]
  }));

  assert.equal(display.labelText, '[Primary][EXP]R-36 Eruptor');
  assert.equal(display.apText, '4');
  assert.equal(display.apMarkerText, '*');
  assert.equal(display.apClassName, 'ap-yellow');
  assert.match(display.apTitle, /significant AP 3/i);
});

test('weapon AP-desc sorting puts higher representative AP first and keeps ties in base order', () => {
  const sorted = [
    makeWeapon('Diligence', { type: 'Primary', sub: 'DMR', code: 'R-63', rows: [makeAttackRow(2, 165, 45)] }),
    makeWeapon('Quasar Cannon', { type: 'Support', sub: 'EP', code: 'LAS-99', rows: [makeAttackRow(6, 2000, 2000)] }),
    makeWeapon('Tenderizer', { type: 'Primary', sub: 'AR', code: 'AR-61', rows: [makeAttackRow(2, 105, 30)] }),
    makeWeapon('Grenade Launcher', { type: 'Support', sub: 'GL', code: 'GL-21', rows: [makeAttackRow(3, 400, 400)] })
  ].sort(compareWeaponOptionsByApDescending);

  assert.deepEqual(sorted.map((weapon) => weapon.name), [
    'Quasar Cannon',
    'Grenade Launcher',
    'Tenderizer',
    'Diligence'
  ]);
});

test('sortWeaponOptions falls back to grouped order when reference sorting has no reference weapon', () => {
  const options = [
    makeWeapon('Tenderizer', { type: 'Primary', sub: 'AR', code: 'AR-61', rows: [makeAttackRow(2, 105, 30)] }),
    makeWeapon('Diligence', { type: 'Primary', sub: 'DMR', code: 'R-63', rows: [makeAttackRow(2, 165, 45)] })
  ];

  assert.deepEqual(
    sortWeaponOptions(options, {
      sortMode: 'match-reference-subtype',
      mode: 'compare',
      referenceWeapon: null
    }).map((weapon) => weapon.name),
    ['Tenderizer', 'Diligence']
  );
});

test('compare-mode AP sorting floats same-AP peers before the rest', () => {
  const referenceWeapon = makeWeapon('Liberator Carbine', {
    type: 'Primary',
    sub: 'AR',
    code: 'AR-23A',
    rows: [makeAttackRow(2, 90, 22)]
  });
  const sorted = sortWeaponOptionsForReference([
    makeWeapon('Coyote', { type: 'Primary', sub: 'AR', code: 'AR-2', rows: [makeAttackRow(3, 75, 10)] }),
    makeWeapon('Tenderizer', { type: 'Primary', sub: 'AR', code: 'AR-61', rows: [makeAttackRow(2, 105, 30)] }),
    makeWeapon('Expendable Anti-Tank', { type: 'Support', sub: 'RL', code: 'EAT-17', rows: [makeAttackRow(6, 650, 650)] }),
    makeWeapon('Diligence', { type: 'Primary', sub: 'DMR', code: 'R-63', rows: [makeAttackRow(2, 165, 45)] })
  ], referenceWeapon);

  const names = sorted.map((weapon) => weapon.name);
  assert.deepEqual(names.slice(0, 2), ['Tenderizer', 'Diligence']);
});

test('compare-mode AP sorting keeps same-subtype weapons together inside a matched AP bucket', () => {
  const referenceWeapon = makeWeapon('Pacifier', {
    type: 'Primary',
    sub: 'AR',
    code: 'AR-72',
    rows: [makeAttackRow(3, 95, 23)]
  });
  const sorted = sortWeaponOptionsForReference([
    makeWeapon('One-Two (UBGL)', { type: 'Primary', sub: 'GL', code: 'CB-9', rows: [makeAttackRow(3, 320, 320)] }),
    makeWeapon('Blitzer', { type: 'Primary', sub: 'NRG', code: 'ARC-12', rows: [makeAttackRow(3, 250, 250)] }),
    makeWeapon('Adjudicator', { type: 'Primary', sub: 'AR', code: 'BR-14', rows: [makeAttackRow(3, 95, 23)] }),
    makeWeapon('Coyote', { type: 'Primary', sub: 'AR', code: 'AR-2', rows: [makeAttackRow(3, 75, 10)] }),
    makeWeapon('Grenade Launcher', { type: 'Support', sub: 'GL', code: 'GL-21', rows: [makeAttackRow(3, 400, 400)] })
  ], referenceWeapon);

  assert.deepEqual(sorted.map((weapon) => weapon.name), [
    'Coyote',
    'Adjudicator',
    'Blitzer',
    'One-Two (UBGL)',
    'Grenade Launcher'
  ]);
});

test('compare-mode AP sorting can group full-auto families across subtype boundaries', () => {
  const referenceWeapon = makeWeapon('Adjudicator', {
    type: 'Primary',
    sub: 'AR',
    code: 'BR-14',
    rows: [makeAttackRow(3, 95, 23)]
  });
  const sorted = sortWeaponOptionsForReference([
    makeWeapon('Machine Gun', { type: 'Support', sub: 'MG', code: 'MG-43', rows: [makeAttackRow(3, 90, 23)] }),
    makeWeapon('Diligence Counter Sniper', { type: 'Primary', sub: 'DMR', code: 'R-63CS', rows: [makeAttackRow(3, 200, 50)] }),
    makeWeapon('Coyote', { type: 'Primary', sub: 'AR', code: 'AR-2', rows: [makeAttackRow(3, 75, 10)] }),
    makeWeapon('Grenade Launcher', { type: 'Support', sub: 'GL', code: 'GL-21', rows: [makeAttackRow(3, 400, 400)] })
  ], referenceWeapon);

  assert.deepEqual(sorted.map((weapon) => weapon.name), [
    'Coyote',
    'Machine Gun',
    'Diligence Counter Sniper',
    'Grenade Launcher'
  ]);
});

test('compare-mode AP sorting can group Sickle variants with Automatic families despite NRG subtype', () => {
  const referenceWeapon = makeWeapon('Adjudicator', {
    type: 'Primary',
    sub: 'AR',
    code: 'BR-14',
    rows: [makeAttackRow(3, 95, 23)]
  });
  const sorted = sortWeaponOptionsForReference([
    makeWeapon('Double-Edge Sickle', { type: 'Primary', sub: 'NRG', code: 'LAS-17', rows: [makeAttackRow(3, 70, 7)] }),
    makeWeapon('Sickle', { type: 'Primary', sub: 'NRG', code: 'LAS-16', rows: [makeAttackRow(3, 60, 6)] }),
    makeWeapon('Diligence Counter Sniper', { type: 'Primary', sub: 'DMR', code: 'R-63CS', rows: [makeAttackRow(3, 200, 50)] }),
    makeWeapon('Grenade Launcher', { type: 'Support', sub: 'GL', code: 'GL-21', rows: [makeAttackRow(3, 400, 400)] })
  ], referenceWeapon);

  assert.deepEqual(sorted.map((weapon) => weapon.name), [
    'Sickle',
    'Double-Edge Sickle',
    'Diligence Counter Sniper',
    'Grenade Launcher'
  ]);
});

test('compare-mode AP sorting can group precision families across subtype boundaries', () => {
  const referenceWeapon = makeWeapon('Reference Marksman', {
    type: 'Primary',
    sub: 'DMR',
    code: 'REF-DMR',
    rows: [makeAttackRow(3, 150, 40)]
  });
  const sorted = sortWeaponOptionsForReference([
    makeWeapon('Anti-Materiel-ish', { type: 'Support', sub: 'CAN', code: 'REF-CAN', rows: [makeAttackRow(3, 450, 225)] }),
    makeWeapon('Coyote', { type: 'Primary', sub: 'AR', code: 'AR-2', rows: [makeAttackRow(3, 75, 10)] }),
    makeWeapon('Grenade Launcher', { type: 'Support', sub: 'GL', code: 'GL-21', rows: [makeAttackRow(3, 400, 400)] })
  ], referenceWeapon);

  assert.deepEqual(sorted.map((weapon) => weapon.name), [
    'Anti-Materiel-ish',
    'Coyote',
    'Grenade Launcher'
  ]);
});

test('compare-mode AP sorting keeps caveated mixed-profile weapons between clean matches and the rest', () => {
  const referenceWeapon = makeWeapon('Adjudicator', {
    type: 'Primary',
    sub: 'AR',
    code: 'BR-14',
    rows: [makeAttackRow(3, 95, 23)]
  });
  const sorted = sortWeaponOptionsForReference([
    makeWeapon('Tenderizer', { type: 'Primary', sub: 'AR', code: 'AR-61', rows: [makeAttackRow(2, 105, 30)] }),
    makeWeapon('Eruptor', {
      type: 'Primary',
      sub: 'EXP',
      code: 'R-36',
      rows: [
        { ...makeAttackRow(4, 230, 115), 'Atk Name': '15x100mm HIGH EXPLOSIVE_P' },
        { ...makeAttackRow(3, 225, 225), 'Atk Name': '15x100mm HIGH EXPLOSIVE_P_IE' },
        { ...makeAttackRow(3, 110, 35), 'Atk Name': 'SHRAPNEL_P x30' }
      ]
    }),
    makeWeapon('Diligence Counter Sniper', { type: 'Primary', sub: 'DMR', code: 'R-63CS', rows: [makeAttackRow(3, 200, 50)] })
  ], referenceWeapon);

  assert.deepEqual(sorted.map((weapon) => weapon.name), [
    'Diligence Counter Sniper',
    'Eruptor',
    'Tenderizer'
  ]);
});

test('compare-mode AP sorting keeps same launcher families ahead within AP5+ matches', () => {
  const referenceWeapon = makeWeapon('Recoilless Rifle', {
    type: 'Support',
    sub: 'RL',
    code: 'GR-8',
    rows: [makeAttackRow(6, 3200, 3200)]
  });
  const sorted = sortWeaponOptionsForReference([
    makeWeapon('Coyote', { type: 'Primary', sub: 'AR', code: 'AR-2', rows: [makeAttackRow(3, 75, 10)] }),
    makeWeapon('Commando', { type: 'Support', sub: 'RL', code: 'MLS-4X', rows: [makeAttackRow(5, 1200, 1200)] }),
    makeWeapon('HMG Emplacement', { type: 'Stratagem', sub: 'EMP', code: 'E/MG-101', rows: [makeAttackRow(4, 200, 40)] }),
    makeWeapon('Quasar Cannon', { type: 'Support', sub: 'EP', code: 'LAS-99', rows: [makeAttackRow(6, 2000, 2000)] })
  ], referenceWeapon);

  assert.deepEqual(sorted.map((weapon) => weapon.name), [
    'Commando',
    'Quasar Cannon',
    'Coyote',
    'HMG Emplacement'
  ]);
});

test('compare-mode AP sorting can prioritize slot matches over subtype matches', () => {
  const referenceWeapon = makeWeapon('Pacifier', {
    type: 'Primary',
    sub: 'AR',
    code: 'AR-72',
    rows: [makeAttackRow(3, 95, 23)]
  });
  const sorted = sortWeaponOptionsForReference([
    makeWeapon('One-Two (UBGL)', { type: 'Primary', sub: 'GL', code: 'CB-9', rows: [makeAttackRow(3, 320, 320)] }),
    makeWeapon('Blitzer', { type: 'Primary', sub: 'NRG', code: 'ARC-12', rows: [makeAttackRow(3, 250, 250)] }),
    makeWeapon('Adjudicator', { type: 'Primary', sub: 'AR', code: 'BR-14', rows: [makeAttackRow(3, 95, 23)] }),
    makeWeapon('Grenade Launcher', { type: 'Support', sub: 'GL', code: 'GL-21', rows: [makeAttackRow(3, 400, 400)] })
  ], referenceWeapon, {
    sortMode: 'match-reference-slot'
  });

  assert.deepEqual(sorted.map((weapon) => weapon.name), [
    'Adjudicator',
    'Blitzer',
    'One-Two (UBGL)',
    'Grenade Launcher'
  ]);
});

test('getWeaponOptions keeps grouped ordering by default even in compare mode', () => {
  const previousGroups = weaponsState.groups;
  const previousMode = calculatorState.mode;
  const previousWeaponSortMode = calculatorState.weaponSortMode;
  const previousWeaponA = calculatorState.weaponA;
  const previousWeaponB = calculatorState.weaponB;
  const previousSelectedAttackKeys = {
    A: [...calculatorState.selectedAttackKeys.A],
    B: [...calculatorState.selectedAttackKeys.B]
  };
  const previousAttackHitCounts = {
    A: { ...calculatorState.attackHitCounts.A },
    B: { ...calculatorState.attackHitCounts.B }
  };

  try {
    const referenceWeapon = makeWeapon('Reference AP2', {
      type: 'Primary',
      sub: 'AR',
      code: 'REF-2',
      rows: [makeAttackRow(2, 90, 22)]
    });
    weaponsState.groups = [
      makeWeapon('Liberator Carbine', {
        type: 'Primary',
        sub: 'AR',
        code: 'AR-23A',
        index: 0,
        rows: [makeAttackRow(2, 90, 22)]
      }),
      makeWeapon('Coyote', { type: 'Primary', sub: 'AR', code: 'AR-2', index: 1, rows: [makeAttackRow(3, 75, 10)] }),
      makeWeapon('Tenderizer', { type: 'Primary', sub: 'AR', code: 'AR-61', index: 2, rows: [makeAttackRow(2, 105, 30)] }),
      makeWeapon('Diligence', { type: 'Primary', sub: 'DMR', code: 'R-63', index: 3, rows: [makeAttackRow(2, 165, 45)] })
    ];

    setCalculatorMode('compare');
    setSelectedWeapon('A', referenceWeapon);

    assert.deepEqual(
      getWeaponOptions('B').map((weapon) => weapon.name),
      ['Coyote', 'Liberator Carbine', 'Tenderizer', 'Diligence']
    );
  } finally {
    weaponsState.groups = previousGroups;
    calculatorState.mode = previousMode;
    calculatorState.weaponSortMode = previousWeaponSortMode;
    calculatorState.weaponA = previousWeaponA;
    calculatorState.weaponB = previousWeaponB;
    calculatorState.selectedAttackKeys = previousSelectedAttackKeys;
    calculatorState.attackHitCounts = previousAttackHitCounts;
  }
});

test('getWeaponOptions uses the opposite compare slot as the AP sorting reference when that mode is selected', () => {
  const previousGroups = weaponsState.groups;
  const previousMode = calculatorState.mode;
  const previousWeaponSortMode = calculatorState.weaponSortMode;
  const previousWeaponA = calculatorState.weaponA;
  const previousWeaponB = calculatorState.weaponB;
  const previousSelectedAttackKeys = {
    A: [...calculatorState.selectedAttackKeys.A],
    B: [...calculatorState.selectedAttackKeys.B]
  };
  const previousAttackHitCounts = {
    A: { ...calculatorState.attackHitCounts.A },
    B: { ...calculatorState.attackHitCounts.B }
  };

  try {
    const referenceWeapon = makeWeapon('Reference AP2', {
      type: 'Primary',
      sub: 'AR',
      code: 'REF-2',
      rows: [makeAttackRow(2, 90, 22)]
    });
    weaponsState.groups = [
      makeWeapon('Liberator Carbine', {
        type: 'Primary',
        sub: 'AR',
        code: 'AR-23A',
        index: 0,
        rows: [makeAttackRow(2, 90, 22)]
      }),
      makeWeapon('Coyote', { type: 'Primary', sub: 'AR', code: 'AR-2', index: 1, rows: [makeAttackRow(3, 75, 10)] }),
      makeWeapon('Tenderizer', { type: 'Primary', sub: 'AR', code: 'AR-61', index: 2, rows: [makeAttackRow(2, 105, 30)] }),
      makeWeapon('Diligence', { type: 'Primary', sub: 'DMR', code: 'R-63', index: 3, rows: [makeAttackRow(2, 165, 45)] })
    ];

    setCalculatorMode('compare');
    setWeaponSortMode('match-reference');
    setSelectedWeapon('A', referenceWeapon);

    assert.deepEqual(
      getWeaponOptions('B').map((weapon) => weapon.name),
      ['Liberator Carbine', 'Tenderizer', 'Diligence', 'Coyote']
    );
  } finally {
    weaponsState.groups = previousGroups;
    calculatorState.mode = previousMode;
    calculatorState.weaponSortMode = previousWeaponSortMode;
    calculatorState.weaponA = previousWeaponA;
    calculatorState.weaponB = previousWeaponB;
    calculatorState.selectedAttackKeys = previousSelectedAttackKeys;
    calculatorState.attackHitCounts = previousAttackHitCounts;
  }
});

test('weapon sort mode options for state drop compare-only modes in single mode', () => {
  const previousMode = calculatorState.mode;
  const previousWeaponSortMode = calculatorState.weaponSortMode;

  try {
    setCalculatorMode('compare');
    setWeaponSortMode('match-reference-subtype');
    assert.deepEqual(
      getWeaponSortModeOptionsForState().map((option) => option.id),
      ['grouped', 'ap-desc', 'match-reference-subtype', 'match-reference-slot']
    );

    setCalculatorMode('single');
    assert.equal(calculatorState.weaponSortMode, 'grouped');
    assert.deepEqual(
      getWeaponSortModeOptionsForState().map((option) => option.id),
      ['grouped', 'ap-desc']
    );
  } finally {
    calculatorState.mode = previousMode;
    calculatorState.weaponSortMode = previousWeaponSortMode;
  }
});

test('explosive display shows missing multipliers as zero reduction', () => {
  const info = getExplosiveDisplayInfo({
    zone_name: 'Main',
    ExTarget: 'Main'
  });

  assert.equal(EXPLOSIVE_DISPLAY_COLUMN_LABEL, 'ExDR');
  assert.equal(info.text, '0%');
  assert.equal(info.sortValue, 0);
  assert.equal(info.isImplicit, true);
  assert.equal(info.isRouted, false);
  assert.match(info.title, /implicit ExMult 1/i);
});

test('explosive display converts direct multipliers into user-facing reduction percentages', () => {
  const info = getExplosiveDisplayInfo({
    zone_name: 'armor',
    ExTarget: 'Part',
    ExMult: 0.45
  });

  assert.equal(info.text, '55%');
  assert.equal(info.sortValue, 0.55);
  assert.equal(info.isImplicit, false);
  assert.equal(info.isRouted, false);
  assert.match(info.title, /ExMult 0\.45/i);
});

test('explosive display flags special non-main zones that suppress part explosive damage', () => {
  const info = getExplosiveDisplayInfo({
    zone_name: 'left_arm',
    ExTarget: 'Main'
  });

  assert.equal(info.text, '100%*');
  assert.equal(info.sortValue, 1);
  assert.equal(info.isRouted, true);
  assert.match(info.title, /direct explosive part damage and explosive passthrough from this part are suppressed/i);
  assert.match(info.title, /one direct Main explosive check uses Main defenses/i);
  assert.match(info.title, /Automaton Trooper/i);
});

test('explosive display applies routed markers without line-through styling', () => {
  const td = {
    textContent: '',
    title: '',
    style: {}
  };

  applyExplosiveDisplayToCell(td, {
    zone_name: 'left_arm',
    ExTarget: 'Main'
  });

  assert.equal(td.textContent, '100%*');
  assert.match(td.title, /Automaton Trooper/i);
  assert.notEqual(td.style.textDecoration, 'line-through');
  assert.equal(td.style.color, 'var(--muted)');
});

test('enemy zone health display folds zero-bleed Constitution into effective health', () => {
  const info = getEnemyZoneHealthDisplayInfo({
    health: 1200,
    Con: 1200,
    ConRate: 0
  });

  assert.equal(info.text, '2400');
  assert.equal(info.sortValue, 2400);
  assert.equal(info.usesConAsHealth, true);
});

test('enemy zone Constitution display shows a starred tooltip for zero-bleed Constitution', () => {
  const info = getEnemyZoneConDisplayInfo({
    health: 1200,
    Con: 1200,
    ConRate: 0
  });

  assert.equal(info.text, '*');
  assert.equal(info.sortValue, 1200);
  assert.equal(info.usesConAsHealth, true);
  assert.equal(info.title, ZERO_BLEED_CON_TOOLTIP);
});

test('enemy zone Constitution display keeps ordinary bleeding Constitution numeric', () => {
  const info = getEnemyZoneConDisplayInfo({
    health: 80,
    Con: 1000,
    ConRate: 40
  });

  assert.equal(info.text, '1000');
  assert.equal(info.sortValue, 1000);
  assert.equal(info.usesConAsHealth, false);
  assert.equal(info.title, '');
});

test('enemy zone Constitution display can mark main Constitution that applies on any death', () => {
  const info = getEnemyZoneConDisplayInfo({
    health: 160,
    Con: 100,
    ConRate: 5,
    ConAppliesAnyDeath: true
  });

  assert.equal(info.text, '100*');
  assert.equal(info.sortValue, 100);
  assert.equal(info.usesConAsHealth, false);
  assert.equal(info.title, MAIN_CON_ANY_DEATH_TOOLTIP);
});

test('compare TTK tooltip identifies the faster weapon when shots are equal but RPM differs', () => {
  const tooltip = buildCompareTtkTooltip(
    {
      weapon: { name: 'Tenderizer', rpm: 600 },
      shotsToKill: 5,
      ttkSeconds: 0.4
    },
    {
      weapon: { name: 'Liberator Carbine', rpm: 920 },
      shotsToKill: 5,
      ttkSeconds: 0.2608695652173913
    }
  );

  assert.match(tooltip, /Weapon B \(Liberator Carbine\) has a shorter TTK/i);
  assert.match(tooltip, /Equal shots to kill, but Weapon B has higher RPM \(920 vs 600\)\./i);
});

test('compare TTK tooltip explains when lower shots beat higher RPM', () => {
  const tooltip = buildCompareTtkTooltip(
    {
      weapon: { name: 'Weapon A', rpm: 900 },
      shotsToKill: 5,
      ttkSeconds: 0.26666666666666666
    },
    {
      weapon: { name: 'Weapon B', rpm: 600 },
      shotsToKill: 4,
      ttkSeconds: 0.3
    }
  );

  assert.match(tooltip, /Weapon A \(Weapon A\) has a shorter TTK/i);
  assert.match(tooltip, /Weapon A has higher RPM \(900 vs 600\), which outweighs Weapon B's lower shot count \(4 vs 5\)\./i);
});
