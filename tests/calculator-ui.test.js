import test from 'node:test';
import assert from 'node:assert/strict';

import { state as weaponsState } from '../weapons/data.js';
import { enemyState } from '../enemies/data.js';
import {
  calculatorState,
  DEFAULT_CALCULATOR_MODE,
  DEFAULT_COMPARE_VIEW,
  DEFAULT_ENEMY_TARGET_TYPES,
  DEFAULT_OVERVIEW_SCOPE,
  DEFAULT_WEAPON_SORT_MODE,
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
  getOverviewColumnsForState,
  shouldShowEnemyControls,
  shouldShowEnemyScopeControls
} from '../calculator/rendering.js';
import { filterEnemiesByScope, getEnemyDropdownQueryState } from '../calculator/selector-utils.js';
import { filterEnemiesByTargetTypes, getEnemyTargetTypeOptions } from '../calculator/enemy-scope.js';
import {
  ENEMY_OVERVIEW_DROPDOWN_CLASS,
  getCalculatorModeButtonTitle,
  getEnemyOverviewOptionHtml
} from '../calculator/ui.js';
import {
  compareWeaponOptionsByApDescending,
  getWeaponDropdownApInfo,
  getWeaponOptionDisplayModel,
  getWeaponRowPreviewHitCount,
  getWeaponSortModeOptions,
  sortWeaponOptions,
  sortWeaponOptionsForReference
} from '../calculator/weapon-dropdown.js';
import {
  applyExplosiveDisplayToCell,
  EXPLOSIVE_DISPLAY_COLUMN_LABEL,
  getExplosiveDisplayInfo
} from '../calculator/explosive-display.js';
import { buildCompareTtkTooltip } from '../calculator/compare-tooltips.js';
import {
  getEnemyZoneConDisplayInfo,
  getEnemyZoneHealthDisplayInfo,
  MAIN_CON_ANY_DEATH_TOOLTIP,
  ZERO_BLEED_CON_TOOLTIP
} from '../calculator/enemy-zone-display.js';

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
  assert.deepEqual(DEFAULT_ENEMY_TARGET_TYPES, ['unit', 'giant']);
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

test('enemy dropdown scope filtering works from the underlying enemy dataset', () => {
  const enemies = [
    { name: 'Stalker', faction: 'Terminid' },
    { name: 'Predator Hunter', faction: 'Terminid' },
    { name: 'Berserker', faction: 'Automaton' },
    { name: 'Agitator', faction: 'Automaton' },
    { name: 'Observer', faction: 'Illuminate' },
    { name: 'Fleshmob', faction: 'Illuminate' },
    { name: 'Gatekeeper', faction: 'Illuminate' }
  ];

  assert.deepEqual(
    filterEnemiesByScope(enemies, 'all').map((enemy) => enemy.name),
    ['Stalker', 'Predator Hunter', 'Berserker', 'Agitator', 'Observer', 'Fleshmob', 'Gatekeeper']
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
    ['Observer', 'Fleshmob']
  );
  assert.deepEqual(
    filterEnemiesByScope(enemies, 'Appropriators').map((enemy) => enemy.name),
    ['Observer', 'Gatekeeper']
  );
});

test('enemy target type filtering distinguishes units, giants, structures, and objectives', () => {
  const enemies = [
    { name: 'Stalker', faction: 'Terminid' },
    { name: 'Bile Titan', faction: 'Terminid', scopeTags: ['giant'] },
    { name: 'AA Emplacement', faction: 'Automaton', scopeTags: ['structure'] },
    { name: 'Shrieker Nest', faction: 'Terminid', scopeTags: ['objective'] }
  ];

  assert.deepEqual(
    filterEnemiesByTargetTypes(enemies, ['unit']).map((enemy) => enemy.name),
    ['Stalker']
  );
  assert.deepEqual(
    filterEnemiesByTargetTypes(enemies, ['giant', 'objective']).map((enemy) => enemy.name),
    ['Bile Titan', 'Shrieker Nest']
  );
  assert.deepEqual(
    getEnemyTargetTypeOptions(enemies).map(({ id }) => id),
    ['unit', 'giant', 'structure', 'objective']
  );
});

test('enemy target type options only include categories present in the dataset', () => {
  const enemies = [
    { name: 'Stalker', faction: 'Terminid' },
    { name: 'Bile Titan', faction: 'Terminid', scopeTags: ['giant'] }
  ];

  assert.deepEqual(
    getEnemyTargetTypeOptions(enemies).map(({ id }) => id),
    ['unit', 'giant']
  );
});

test('enemy target type selection normalizes ids and toggles independently', () => {
  const previousTargetTypes = [...calculatorState.enemyTargetTypes];

  try {
    setSelectedEnemyTargetTypes(['Objectives', 'unit', 'unit']);
    assert.deepEqual(getSelectedEnemyTargetTypes(), ['objective', 'unit']);

    toggleSelectedEnemyTargetType('structure');
    assert.deepEqual(getSelectedEnemyTargetTypes(), ['objective', 'unit', 'structure']);

    toggleSelectedEnemyTargetType('Objectives');
    assert.deepEqual(getSelectedEnemyTargetTypes(), ['unit', 'structure']);
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

test('scope options keep the three base fronts in gameplay order before extras', () => {
  const previousUnits = enemyState.units;

  try {
    enemyState.units = [
      { name: 'Predator Hunter', faction: 'Terminid' },
      { name: 'Rupture Charger', faction: 'Terminid' },
      { name: 'Spore Burst Scavenger', faction: 'Terminid' },
      { name: 'Agitator', faction: 'Automaton' },
      { name: 'Hulk Firebomber', faction: 'Automaton' },
      { name: 'Observer', faction: 'Illuminate' },
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
      ['mindless-masses', 'Mindless Masses'],
      ['appropriators', 'Appropriators']
    ]);
  } finally {
    enemyState.units = previousUnits;
  }
});

test('overview dropdown option uses a dedicated highlighted presentation', () => {
  assert.equal(ENEMY_OVERVIEW_DROPDOWN_CLASS, 'dropdown-item dropdown-item-overview');
  assert.match(getEnemyOverviewOptionHtml('all'), /compare all matching enemies/i);
  assert.match(getEnemyOverviewOptionHtml('Appropriators'), /compare matching appropriators enemies/i);
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

test('enemy table mode defaults to analysis and normalizes to supported values', () => {
  setEnemyTableMode('analysis');
  assert.equal(calculatorState.enemyTableMode, 'analysis');

  setEnemyTableMode('stats');
  assert.equal(calculatorState.enemyTableMode, 'stats');

  setEnemyTableMode('unknown');
  assert.equal(calculatorState.enemyTableMode, 'analysis');
});

test('recommendation range meters normalize into a bounded integer', () => {
  const previousRange = calculatorState.recommendationRangeMeters;

  try {
    assert.equal(setRecommendationRangeMeters('30.7'), 31);
    assert.equal(calculatorState.recommendationRangeMeters, 31);
    assert.equal(setRecommendationRangeMeters(-5), 0);
    assert.equal(setRecommendationRangeMeters(999), 500);
  } finally {
    calculatorState.recommendationRangeMeters = previousRange;
  }
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

test('weapon sort mode options expose the compare-only reference mode only in compare mode', () => {
  assert.deepEqual(
    getWeaponSortModeOptions({ mode: 'single' }).map((option) => option.id),
    ['grouped', 'ap-desc']
  );
  assert.deepEqual(
    getWeaponSortModeOptions({ mode: 'compare' }).map((option) => option.id),
    ['grouped', 'ap-desc', 'match-reference']
  );
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
      sortMode: 'match-reference',
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

test('compare-mode AP sorting groups anti-tank weapons together for AP5+ references', () => {
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
    'Quasar Cannon',
    'Commando',
    'Coyote',
    'HMG Emplacement'
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
    setWeaponSortMode('match-reference');
    assert.deepEqual(
      getWeaponSortModeOptionsForState().map((option) => option.id),
      ['grouped', 'ap-desc', 'match-reference']
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
