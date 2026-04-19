// Tests for weapon dropdown AP info, display models, sorting algorithms,
// compare-mode reference sorting, and getWeaponOptions integration.
// Extracted from calculator-ui.test.js during test-suite split.
//
// Coverage note: calculator-ui-selectors.test.js pins the base sort order,
// grouped/ap-desc sort output, and AP info edge cases.  Tests here add exact
// output assertions for reference-based sorting and integration-level
// getWeaponOptions/getWeaponSortModeOptionsForState scenarios that selectors
// does not cover.
import test from 'node:test';
import assert from 'node:assert/strict';
import './env-stubs.js';

import { state as weaponsState } from '../weapons/data.js';
import {
  calculatorState,
  getWeaponOptions,
  getWeaponSortModeOptionsForState,
  setCalculatorMode,
  setSelectedWeapon,
  setWeaponSortMode
} from '../calculator/data.js';
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

// ——— Fixtures ———

// AP-first signature used throughout these tests; differs from weapon-fixtures.js.
function makeAttackRow(ap, dmg, dur = dmg) {
  return { AP: ap, DMG: dmg, DUR: dur };
}

function makeWeapon(name, {
  type = 'Primary',
  sub = 'AR',
  role = null,
  code = '',
  index = 0,
  rows = []
} = {}) {
  return { name, type, sub, role, code, index, rows };
}

// ========================================================================
// Sort mode options and normalization aliases
// ========================================================================

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

// ========================================================================
// AP info extraction
// ========================================================================

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

// ========================================================================
// Weapon display model (labelText is unique; badge structure is in selectors)
// ========================================================================

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

// ========================================================================
// AP-descending sort
// ========================================================================

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

// ========================================================================
// Reference-based sorting (compare mode)
// ========================================================================

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
    makeWeapon('Double-Edge Sickle', { type: 'Primary', sub: 'NRG', role: 'automatic', code: 'LAS-17', rows: [makeAttackRow(3, 70, 7)] }),
    makeWeapon('Sickle', { type: 'Primary', sub: 'NRG', role: 'automatic', code: 'LAS-16', rows: [makeAttackRow(3, 60, 6)] }),
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
    makeWeapon('HMG Emplacement', { type: 'Stratagem', sub: 'EMP', role: 'automatic', code: 'E/MG-101', rows: [makeAttackRow(4, 200, 40)] }),
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

// ========================================================================
// getWeaponOptions integration (uses weaponsState + calculatorState together)
// ========================================================================

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
