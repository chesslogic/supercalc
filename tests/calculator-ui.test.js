import test from 'node:test';
import assert from 'node:assert/strict';

import { state as weaponsState } from '../weapons/data.js';
import { calculatorState, getWeaponOptions, setCalculatorMode, setEnemyTableMode, setSelectedWeapon } from '../calculator/data.js';
import { getEnemyColumnsForState, getOverviewColumnsForState } from '../calculator/rendering.js';
import { getEnemyDropdownQueryState } from '../calculator/selector-utils.js';
import { getCalculatorModeButtonTitle } from '../calculator/ui.js';
import {
  getWeaponDropdownApInfo,
  getWeaponOptionDisplayModel,
  getWeaponRowPreviewHitCount,
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
    ['zone_name', 'AV', 'Dur%', 'IsFatal', 'ExMult', 'shotsA', 'rangeA', 'shotsB', 'rangeB', 'shotsDiff', 'ttkA', 'ttkB', 'ttkDiff']
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
    overviewScope: 'All'
  });
  assert.deepEqual(
    overviewAnalysisColumns.map((column) => column.key),
    ['faction', 'enemy', 'zone_name', 'AV', 'Dur%', 'IsFatal', 'ExMult', 'shotsA', 'rangeA', 'shotsB', 'rangeB', 'shotsDiff', 'ttkA', 'ttkB', 'ttkDiff']
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

test('getWeaponOptions uses the opposite compare slot as the AP sorting reference', () => {
  const previousGroups = weaponsState.groups;
  const previousMode = calculatorState.mode;
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
      ['Liberator Carbine', 'Tenderizer', 'Diligence', 'Coyote']
    );
  } finally {
    weaponsState.groups = previousGroups;
    calculatorState.mode = previousMode;
    calculatorState.weaponA = previousWeaponA;
    calculatorState.weaponB = previousWeaponB;
    calculatorState.selectedAttackKeys = previousSelectedAttackKeys;
    calculatorState.attackHitCounts = previousAttackHitCounts;
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
