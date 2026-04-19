// Tests for engagement range controls, weapon range-adjusted cell display,
// format helpers, and recommendation range state management.
// Extracted from calculator-ui.test.js during test-suite split.
//
// Shared DOM stubs (TestDocument, TestElement, collectElements) are imported
// from tests/dom-stubs.js instead of being duplicated locally.
import test from 'node:test';
import assert from 'node:assert/strict';
import './env-stubs.js';

import { calculatorState, setRecommendationRangeMeters, setSelectedWeapon } from '../calculator/data.js';
import {
  getWeaponRangeAdjustedCellDisplay,
  renderWeaponDetails
} from '../calculator/rendering.js';
import {
  ENGAGEMENT_RANGE_STOPS,
  findNearestEngagementRangeStop
} from '../calculator/engagement-range.js';
import {
  formatEngagementRangeDisplayValue,
  setupEngagementRangeControl
} from '../calculator/ui.js';
import { formatDamageValue, roundDamagePacket } from '../calculator/damage-rounding.js';
import {
  calculateBallisticDamageAtDistance,
  calculatePracticalMaxProjectileDistance,
  ingestBallisticFalloffCsvText,
  resetBallisticFalloffProfiles
} from '../weapons/falloff.js';
import { TestDocument, collectElements } from './dom-stubs.js';

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

// Registers the four DOM elements that setupEngagementRangeControl expects.
function registerRangeControlElements(testDocument, slot = 'A') {
  const suffix = slot.toLowerCase();
  return {
    rangeInput: testDocument.registerElement(`calculator-range-input-${suffix}`, 'input'),
    rangeValue: testDocument.registerElement(`calculator-range-value-${suffix}`, 'button'),
    rangeEdit: testDocument.registerElement(`calculator-range-edit-${suffix}`, 'input'),
    rangeWarning: testDocument.registerElement(`calculator-range-warning-${suffix}`, 'span')
  };
}

const UI_TEST_FALLOFF_CSV = `Category,Weapon,Caliber,Mass,Velocity,Drag
Primary,AR-23 Liberator,5.5,4.5,900,0.3
Marksman,R-63 Diligence,8,8.5,960,0.2
Primary,PLAS-1 Scorcher,20,25,550,1.5
Primary,PLAS-101 Purifier (charged),20,25,350,1.5`;

const AMBIGUOUS_UI_TEST_FALLOFF_CSV = `Category,Weapon,Caliber,Mass,Velocity,Drag
Primary,PLAS-1 Scorcher,20,25,550,1.5
Primary,PLAS-1 Scorcher,20,25,550,1.5`;

// ========================================================================
// Weapon range-adjusted cell display
// ========================================================================

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

// ========================================================================
// Engagement range control (DOM interaction)
// ========================================================================

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
    const rangeValue = testDocument.registerElement('calculator-range-value-a', 'button');
    const rangeEdit = testDocument.registerElement('calculator-range-edit-a', 'input');

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
    assert.ok(rangeEdit.classList.contains('hidden'));

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

test('engagement range value accepts exact inline meter edits', () => {
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
    testDocument.registerElement('calculator-weapon-details');
    const rangeInput = testDocument.registerElement('calculator-range-input-a', 'input');
    const rangeValue = testDocument.registerElement('calculator-range-value-a', 'button');
    const rangeEdit = testDocument.registerElement('calculator-range-edit-a', 'input');

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

    rangeValue.dispatch('click');
    assert.equal(rangeInput.disabled, true);
    assert.ok(rangeValue.classList.contains('hidden'));
    assert.ok(!rangeEdit.classList.contains('hidden'));

    const expectedDamage = formatDamageValue(roundDamagePacket(calculateBallisticDamageAtDistance(105, {
      caliber: 5.5,
      mass: 4.5,
      velocity: 900,
      drag: 0.3
    }, 37)));

    rangeEdit.value = '37';
    rangeEdit.dispatch('keydown', {
      key: 'Enter',
      preventDefault() {}
    });

    const updatedCells = collectElements(
      testDocument.getElementById('calculator-weapon-details'),
      (element) => element.tagName === 'TD'
    );
    assert.equal(calculatorState.engagementRangeMeters.A, 37);
    assert.equal(rangeInput.value, '37');
    assert.equal(rangeValue.textContent, formatEngagementRangeDisplayValue(37));
    assert.ok(updatedCells.some((cell) => cell.textContent === expectedDamage));
    assert.equal(rangeInput.disabled, false);
    assert.ok(!rangeValue.classList.contains('hidden'));
    assert.ok(rangeEdit.classList.contains('hidden'));
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

test('engagement range inline edit cancels on Escape', () => {
  const originalDocument = globalThis.document;
  const originalRangeA = calculatorState.engagementRangeMeters.A;

  try {
    const testDocument = new TestDocument();
    const rangeInput = testDocument.registerElement('calculator-range-input-a', 'input');
    const rangeValue = testDocument.registerElement('calculator-range-value-a', 'button');
    const rangeEdit = testDocument.registerElement('calculator-range-edit-a', 'input');

    globalThis.document = testDocument;
    calculatorState.engagementRangeMeters.A = 30;

    setupEngagementRangeControl('A');
    rangeValue.dispatch('click');
    rangeEdit.value = '42';
    rangeEdit.dispatch('keydown', {
      key: 'Escape',
      preventDefault() {}
    });

    assert.equal(calculatorState.engagementRangeMeters.A, 30);
    assert.equal(rangeInput.value, '30');
    assert.equal(rangeValue.textContent, formatEngagementRangeDisplayValue(30));
    assert.equal(rangeInput.disabled, false);
    assert.ok(!rangeValue.classList.contains('hidden'));
    assert.ok(rangeEdit.classList.contains('hidden'));
  } finally {
    globalThis.document = originalDocument;
    calculatorState.engagementRangeMeters.A = originalRangeA;
  }
});

test('engagement range control shows a practical max warning when exact range edits reach the cutoff', () => {
  resetBallisticFalloffProfiles();
  ingestBallisticFalloffCsvText(UI_TEST_FALLOFF_CSV);

  const originalDocument = globalThis.document;
  const originalMode = calculatorState.mode;
  const originalWeaponA = calculatorState.weaponA;
  const originalSelectedAttackKeysA = [...calculatorState.selectedAttackKeys.A];
  const originalAttackHitCountsA = { ...calculatorState.attackHitCounts.A };
  const originalRangeA = calculatorState.engagementRangeMeters.A;
  const practicalMaxText = `${Math.floor(calculatePracticalMaxProjectileDistance({
    caliber: 20,
    mass: 25,
    velocity: 550,
    drag: 1.5
  }))}m`;

  try {
    const testDocument = new TestDocument();
    const {
      rangeInput,
      rangeValue,
      rangeEdit,
      rangeWarning
    } = registerRangeControlElements(testDocument, 'A');

    globalThis.document = testDocument;
    calculatorState.mode = 'single';
    calculatorState.engagementRangeMeters.A = 200;
    setSelectedWeapon('A', makeWeapon('Scorcher', {
      code: 'PLAS-1',
      rows: [{
        ...makeAttackRow(2, 100, 100),
        'Atk Type': 'Projectile',
        'Atk Name': 'Plasma bolt'
      }]
    }));

    setupEngagementRangeControl('A');

    assert.equal(rangeValue.textContent, formatEngagementRangeDisplayValue(200));
    assert.ok(rangeWarning.classList.contains('hidden'));
    assert.equal(rangeWarning.textContent, '');

    rangeValue.dispatch('click');
    rangeEdit.value = '204';
    rangeEdit.dispatch('keydown', {
      key: 'Enter',
      preventDefault() {}
    });

    assert.equal(calculatorState.engagementRangeMeters.A, 204);
    assert.equal(rangeInput.value, '204');
    assert.equal(rangeValue.textContent, formatEngagementRangeDisplayValue(204));
    assert.equal(rangeWarning.textContent, `Warning: practical max ${practicalMaxText}`);
    assert.ok(!rangeWarning.classList.contains('hidden'));
    assert.ok(rangeWarning.title.includes(`Current range 204m is at or beyond this weapon's modeled practical max projectile distance (${practicalMaxText}).`));
    assert.match(rangeWarning.title, /Projectile damage is treated as effectively gone/i);
  } finally {
    resetBallisticFalloffProfiles();
    globalThis.document = originalDocument;
    calculatorState.mode = originalMode;
    calculatorState.weaponA = originalWeaponA;
    calculatorState.selectedAttackKeys.A = originalSelectedAttackKeysA;
    calculatorState.attackHitCounts.A = originalAttackHitCountsA;
    calculatorState.engagementRangeMeters.A = originalRangeA;
  }
});

test('engagement range warnings handle slot A and slot B independently in compare mode', () => {
  resetBallisticFalloffProfiles();
  ingestBallisticFalloffCsvText(UI_TEST_FALLOFF_CSV);

  const originalDocument = globalThis.document;
  const originalMode = calculatorState.mode;
  const originalWeaponA = calculatorState.weaponA;
  const originalWeaponB = calculatorState.weaponB;
  const originalSelectedAttackKeysA = [...calculatorState.selectedAttackKeys.A];
  const originalSelectedAttackKeysB = [...calculatorState.selectedAttackKeys.B];
  const originalAttackHitCountsA = { ...calculatorState.attackHitCounts.A };
  const originalAttackHitCountsB = { ...calculatorState.attackHitCounts.B };
  const originalRangeA = calculatorState.engagementRangeMeters.A;
  const originalRangeB = calculatorState.engagementRangeMeters.B;
  const practicalMaxAText = `${Math.floor(calculatePracticalMaxProjectileDistance({
    caliber: 20,
    mass: 25,
    velocity: 550,
    drag: 1.5
  }))}m`;
  const practicalMaxBText = `${Math.floor(calculatePracticalMaxProjectileDistance({
    caliber: 20,
    mass: 25,
    velocity: 350,
    drag: 1.5
  }))}m`;

  try {
    const testDocument = new TestDocument();
    const controlsA = registerRangeControlElements(testDocument, 'A');
    const controlsB = registerRangeControlElements(testDocument, 'B');

    globalThis.document = testDocument;
    calculatorState.mode = 'compare';
    calculatorState.engagementRangeMeters.A = 204;
    calculatorState.engagementRangeMeters.B = 205;
    setSelectedWeapon('A', makeWeapon('Scorcher', {
      code: 'PLAS-1',
      rows: [{
        ...makeAttackRow(2, 100, 100),
        'Atk Type': 'Projectile',
        'Atk Name': 'Plasma bolt'
      }]
    }));
    setSelectedWeapon('B', makeWeapon('Purifier (charged)', {
      code: 'PLAS-101',
      rows: [{
        ...makeAttackRow(2, 120, 120),
        'Atk Type': 'Projectile',
        'Atk Name': 'Charged plasma bolt'
      }]
    }));

    setupEngagementRangeControl('A');
    setupEngagementRangeControl('B');

    assert.equal(controlsA.rangeWarning.textContent, `Warning: practical max ${practicalMaxAText}`);
    assert.ok(!controlsA.rangeWarning.classList.contains('hidden'));
    assert.ok(controlsB.rangeWarning.classList.contains('hidden'));
    assert.equal(controlsB.rangeWarning.textContent, '');

    controlsB.rangeValue.dispatch('click');
    controlsB.rangeEdit.value = '206';
    controlsB.rangeEdit.dispatch('keydown', {
      key: 'Enter',
      preventDefault() {}
    });

    assert.equal(calculatorState.engagementRangeMeters.B, 206);
    assert.equal(controlsB.rangeWarning.textContent, `Warning: practical max ${practicalMaxBText}`);
    assert.ok(!controlsB.rangeWarning.classList.contains('hidden'));
    assert.equal(controlsA.rangeWarning.textContent, `Warning: practical max ${practicalMaxAText}`);
    assert.ok(!controlsA.rangeWarning.classList.contains('hidden'));
  } finally {
    resetBallisticFalloffProfiles();
    globalThis.document = originalDocument;
    calculatorState.mode = originalMode;
    calculatorState.weaponA = originalWeaponA;
    calculatorState.weaponB = originalWeaponB;
    calculatorState.selectedAttackKeys.A = originalSelectedAttackKeysA;
    calculatorState.selectedAttackKeys.B = originalSelectedAttackKeysB;
    calculatorState.attackHitCounts.A = originalAttackHitCountsA;
    calculatorState.attackHitCounts.B = originalAttackHitCountsB;
    calculatorState.engagementRangeMeters.A = originalRangeA;
    calculatorState.engagementRangeMeters.B = originalRangeB;
  }
});

test('engagement range warning stays hidden for explosive-only, missing-profile, and ambiguous-profile cases', () => {
  const originalDocument = globalThis.document;
  const originalMode = calculatorState.mode;
  const originalWeaponA = calculatorState.weaponA;
  const originalSelectedAttackKeysA = [...calculatorState.selectedAttackKeys.A];
  const originalAttackHitCountsA = { ...calculatorState.attackHitCounts.A };
  const originalRangeA = calculatorState.engagementRangeMeters.A;

  try {
    const assertHiddenWarning = ({
      csvText,
      weapon
    }) => {
      resetBallisticFalloffProfiles();
      ingestBallisticFalloffCsvText(csvText);

      const testDocument = new TestDocument();
      const { rangeWarning } = registerRangeControlElements(testDocument, 'A');

      globalThis.document = testDocument;
      calculatorState.mode = 'single';
      calculatorState.engagementRangeMeters.A = 500;
      setSelectedWeapon('A', weapon);
      setupEngagementRangeControl('A');

      assert.ok(rangeWarning.classList.contains('hidden'));
      assert.equal(rangeWarning.textContent, '');
      assert.equal(rangeWarning.title, '');
    };

    assertHiddenWarning({
      csvText: UI_TEST_FALLOFF_CSV,
      weapon: makeWeapon('Scorcher', {
        code: 'PLAS-1',
        rows: [{
          ...makeAttackRow(2, 100, 100),
          'Atk Type': 'Explosion',
          'Atk Name': 'Plasma blast'
        }]
      })
    });

    assertHiddenWarning({
      csvText: UI_TEST_FALLOFF_CSV,
      weapon: makeWeapon('Prototype', {
        code: 'ZZ-1',
        rows: [{
          ...makeAttackRow(2, 100, 100),
          'Atk Type': 'Projectile',
          'Atk Name': 'Prototype round'
        }]
      })
    });

    assertHiddenWarning({
      csvText: AMBIGUOUS_UI_TEST_FALLOFF_CSV,
      weapon: makeWeapon('Scorcher', {
        code: 'PLAS-1',
        rows: [{
          ...makeAttackRow(2, 100, 100),
          'Atk Type': 'Projectile',
          'Atk Name': 'Plasma bolt'
        }]
      })
    });
  } finally {
    resetBallisticFalloffProfiles();
    globalThis.document = originalDocument;
    calculatorState.mode = originalMode;
    calculatorState.weaponA = originalWeaponA;
    calculatorState.selectedAttackKeys.A = originalSelectedAttackKeysA;
    calculatorState.attackHitCounts.A = originalAttackHitCountsA;
    calculatorState.engagementRangeMeters.A = originalRangeA;
  }
});

// ========================================================================
// Recommendation range state
// ========================================================================

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

// ========================================================================
// Format and stop helpers
// ========================================================================

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
