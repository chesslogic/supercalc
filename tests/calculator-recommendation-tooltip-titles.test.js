// Tooltip title text tests: verifies the explanatory titles and tooltip
// strings on recommendation panel headers, cells, flags, and summaries, plus
// unit tests for the getRecommendationMarginLabel / getRecommendationMarginTitle
// pure helper functions.

import test from 'node:test';
import assert from 'node:assert/strict';
import './env-stubs.js';
import {
  makeAttackRow,
  makeExplosionAttackRow,
  makeWeapon,
  makeZone
} from './fixtures/weapon-fixtures.js';
import {
  TestElement,
  TestDocument,
  collectElements
} from './fixtures/tooltip-dom-stubs.js';

const { calculatorState } = await import('../calculator/data.js');
const { renderRecommendationPanel } = await import('../calculator/calculation.js');
const { state: weaponsState } = await import('../weapons/data.js');
const {
  getRecommendationMarginLabel,
  getRecommendationMarginTitle
} = await import('../calculator/calculation/recommendation-titles.js');

function renderPanelForTest(enemy) {
  const previousDocument = globalThis.document;
  const previousNode = globalThis.Node;
  const container = new TestElement('div');

  globalThis.document = new TestDocument();
  globalThis.Node = TestElement;

  try {
    renderRecommendationPanel(container, enemy);
    return container;
  } finally {
    globalThis.document = previousDocument;
    globalThis.Node = previousNode;
  }
}

test('renderRecommendationPanel adds explanatory titles to highlighted recommendation headers and cells', () => {
  const previousRangeFloor = calculatorState.recommendationRangeMeters;
  const previousGroups = weaponsState.groups;

  try {
    calculatorState.recommendationRangeMeters = 0;
    weaponsState.groups = [
      makeWeapon('Breaker', {
        code: 'SG-225',
        rpm: 120,
        sub: 'SG',
        rows: [makeAttackRow('12g BUCKSHOT_P x11', 30, 2)]
      })
    ];

    const container = renderPanelForTest({
      name: 'Target Dummy',
      health: 500,
      zones: [
        makeZone('head', { health: 145, isFatal: true, av: 1, toMainPercent: 1 }),
        makeZone('torso', { health: 200, av: 1, toMainPercent: 0.5 })
      ]
    });

    const headers = collectElements(container, (element) => element.tagName === 'TH');
    const cells = collectElements(container, (element) => element.tagName === 'TD');
    const flags = collectElements(container, (element) => element.classList.contains('calc-recommend-flag'));
    const summary = collectElements(container, (element) => element.classList.contains('calc-recommend-summary'))[0];
    const outcomeBadge = collectElements(container, (element) => element.classList.contains('calc-zone-context'))[0];

    assert.equal(
      headers.find((element) => element.textContent === 'Margin')?.title,
      'One-shot margin is highlighted at +25% or less extra damage. Multi-shot rows show extra per-shot headroom for the listed shot count without changing the one-shot highlight.'
    );
    assert.equal(
      headers.find((element) => element.textContent === 'Crit')?.title,
      'Critical-disable highlight at the current range floor, covering one- and two-shot critical breakpoints.'
    );
    assert.match(headers.find((element) => element.textContent === 'Target')?.title || '', /target zone/i);
    assert.match(cells[1].title, /5 hits per firing cycle/i);
    assert.match(cells[2].title, /Best-ranked target: head/i);
    assert.match(cells[2].title, /Killing this part kills the enemy/i);
    assert.match(cells[3].title, /counts firing cycles, not individual projectiles/i);
    assert.match(cells[4].title, /weapon's RPM/i);
    assert.match(cells[5].title, /qualifies for range-sensitive highlights/i);
    assert.equal(outcomeBadge.title, 'Killing this part kills the enemy');
    assert.equal(flags[0].textContent, '+3%');
    assert.equal(flags[0].title, 'One-shot margin: +3%. Meets the Margin highlight at the current range floor (+25% or less extra damage).');
    assert.match(summary.title, /Rows without those highlights are hidden from this table/i);
  } finally {
    calculatorState.recommendationRangeMeters = previousRangeFloor;
    weaponsState.groups = previousGroups;
  }
});

test('renderRecommendationPanel explains fallback rows and unknown range rows when nothing is highlighted', () => {
  const previousRangeFloor = calculatorState.recommendationRangeMeters;
  const previousGroups = weaponsState.groups;
  const previousMinShots = calculatorState.recommendationMinShots;
  const previousMaxShots = calculatorState.recommendationMaxShots;

  try {
    calculatorState.recommendationRangeMeters = 30;
    calculatorState.recommendationMinShots = 1;
    calculatorState.recommendationMaxShots = 10;
    weaponsState.groups = [
      makeWeapon('Body Tapper', {
        rpm: 60,
        rows: [makeAttackRow('Body Tap', 50, 1)]
      })
    ];

    const container = renderPanelForTest({
      name: 'Armor Dummy',
      health: 500,
      zones: [
        makeZone('head', { health: 100, isFatal: true, av: 3, toMainPercent: 1 }),
        makeZone('body', { health: 250, av: 1, toMainPercent: 0 })
      ]
    });

    const cells = collectElements(container, (element) => element.tagName === 'TD');
    const flags = collectElements(container, (element) => element.classList.contains('calc-recommend-flag'));
    const summary = collectElements(container, (element) => element.classList.contains('calc-recommend-summary'))[0];

    assert.match(summary.textContent, /fallback rows/i);
    assert.match(summary.title, /falls back to the best-ranked row for each weapon/i);
    assert.match(cells[5].title, /row stays listed, but range-sensitive highlights do not count/i);
    assert.equal(flags[0].title, 'Margin shows one-shot highlight margins or extra per-shot headroom for displayed multi-shot rows when the breakpoint damage can be compared against the target health.');
    assert.match(cells[10].title, /fallback because nothing met the current highlight checks/i);
  } finally {
    calculatorState.recommendationRangeMeters = previousRangeFloor;
    calculatorState.recommendationMinShots = previousMinShots;
    calculatorState.recommendationMaxShots = previousMaxShots;
    weaponsState.groups = previousGroups;
  }
});

test('renderRecommendationPanel explains combined firing packages in targeted recommendation titles', () => {
  const previousRangeFloor = calculatorState.recommendationRangeMeters;
  const previousGroups = weaponsState.groups;
  const previousSelectedZoneIndex = calculatorState.selectedZoneIndex;

  try {
    calculatorState.recommendationRangeMeters = 0;
    calculatorState.selectedZoneIndex = 0;
    weaponsState.groups = [
      makeWeapon('Packager', {
        rows: [
          makeAttackRow('15x100mm HIGH EXPLOSIVE_P', 230, 4),
          makeExplosionAttackRow('15x100mm HIGH EXPLOSIVE_P_IE', 225, 3),
          makeAttackRow('SHRAPNEL_P x30', 110, 3)
        ]
      })
    ];

    const container = renderPanelForTest({
      name: 'Package Dummy',
      health: 1000,
      zones: [
        makeZone('core', { health: 430, isFatal: true, av: 1, toMainPercent: 1 })
      ]
    });

    const cells = collectElements(container, (element) => element.tagName === 'TD');
    const attackCell = cells.find((cell) => cell.textContent === '15x100mm HIGH EXPLOSIVE [Proj + Blast]');
    assert.ok(attackCell);
    assert.match(attackCell.title, /Attack package:/i);
    assert.match(attackCell.title, /1\. 15x100mm HIGH EXPLOSIVE_P: 1 hit/i);
    assert.match(attackCell.title, /2\. 15x100mm HIGH EXPLOSIVE_P_IE: 1 hit/i);
  } finally {
    calculatorState.recommendationRangeMeters = previousRangeFloor;
    calculatorState.selectedZoneIndex = previousSelectedZoneIndex;
    weaponsState.groups = previousGroups;
  }
});

test('renderRecommendationPanel keeps the original attack-row wording when a package adds nothing to the selected part', () => {
  const previousRangeFloor = calculatorState.recommendationRangeMeters;
  const previousGroups = weaponsState.groups;
  const previousSelectedZoneIndex = calculatorState.selectedZoneIndex;

  try {
    calculatorState.recommendationRangeMeters = 0;
    calculatorState.selectedZoneIndex = 0;
    weaponsState.groups = [
      makeWeapon('Heavy Round', {
        rows: [
          makeAttackRow('90mm SABOT_P', 500, 6),
          makeExplosionAttackRow('90mm SABOT_P_IE', 50, 3)
        ]
      })
    ];

    const container = renderPanelForTest({
      name: 'Armor Dummy',
      health: 1000,
      zones: [
        makeZone('core', { health: 500, isFatal: true, av: 5, toMainPercent: 1 })
      ]
    });

    const cells = collectElements(container, (element) => element.tagName === 'TD');
    const attackCell = cells.find((cell) => cell.textContent === '90mm SABOT_P');
    assert.ok(attackCell);
    assert.match(attackCell.title, /^Attack row:/i);
    assert.doesNotMatch(attackCell.title, /Attack package:/i);
  } finally {
    calculatorState.recommendationRangeMeters = previousRangeFloor;
    calculatorState.selectedZoneIndex = previousSelectedZoneIndex;
    weaponsState.groups = previousGroups;
  }
});

// ---------------------------------------------------------------------------
// getRecommendationMarginLabel — pure unit tests
// ---------------------------------------------------------------------------

test('getRecommendationMarginLabel returns +X% for one-shot margin rows', () => {
  const row = { marginPercent: 10 };
  assert.equal(getRecommendationMarginLabel(row), '+10%');
});

test('getRecommendationMarginLabel returns +X% for multi-shot displayMarginPercent rows', () => {
  const row = { marginPercent: null, displayMarginPercent: 25 };
  assert.equal(getRecommendationMarginLabel(row), '+25%');
});

test('getRecommendationMarginLabel returns X% (no plus) for near-miss section rows', () => {
  const row = { nearMissDisplayPercent: 60, showNearMissHighlight: true };
  assert.equal(getRecommendationMarginLabel(row), '60%');
});

test('getRecommendationMarginLabel returns em-dash when neither marginPercent nor displayMarginPercent is available', () => {
  const row = { marginPercent: null, displayMarginPercent: null };
  assert.equal(getRecommendationMarginLabel(row), '—');
});

// ---------------------------------------------------------------------------
// getRecommendationMarginTitle — pure unit tests
// ---------------------------------------------------------------------------

test('getRecommendationMarginTitle contains shot-count margin copy for main-row multi-shot kills', () => {
  const row = { shotsToKill: 3, marginPercent: null, displayMarginPercent: 25, showNearMissHighlight: false };
  const title = getRecommendationMarginTitle(row);
  assert.match(title, /3-shot margin/i, 'should mention shot-count margin for main-row multi-shot kills');
  assert.match(title, /\+25%/, 'should include the display margin label');
  assert.match(title, /3-shot/i, 'should include shot count');
  assert.match(title, /one-shot Margin highlight/i, 'should distinguish display headroom from the one-shot highlight');
  assert.doesNotMatch(title, /^Near miss:/i, 'should not use the Near miss section prefix');
});

test('getRecommendationMarginTitle uses near-miss section copy when showNearMissHighlight is set', () => {
  const row = { shotsToKill: 3, marginPercent: null, nearMissDisplayPercent: 60, showNearMissHighlight: true };
  const title = getRecommendationMarginTitle(row);
  assert.match(title, /^Near miss:/i, 'should use the Near miss: prefix for near-miss section rows');
  assert.doesNotMatch(title, /3-shot margin/i, 'should not use main-row shot-count margin copy for near-miss section rows');
});

test('getRecommendationMarginTitle uses one-shot copy when marginPercent is available', () => {
  const row = { shotsToKill: 1, marginPercent: 10, nearMissDisplayPercent: null, qualifiesForMargin: true };
  const title = getRecommendationMarginTitle(row);
  assert.match(title, /one-shot margin/i, 'should use one-shot margin copy');
  assert.match(title, /\+10%/, 'should include the margin label');
  assert.doesNotMatch(title, /display-only headroom/i, 'should not use multi-shot headroom copy when one-shot margin is set');
});

// ---------------------------------------------------------------------------
// Rendered Margin cell shows displayMarginPercent
// ---------------------------------------------------------------------------

test('buildWeaponRecommendationRows main row shows displayMarginPercent label in rendered Margin cell', () => {
  const previousRangeFloor = calculatorState.recommendationRangeMeters;
  const previousGroups = weaponsState.groups;
  const previousSelectedZoneIndex = calculatorState.selectedZoneIndex;
  const previousNoMainViaLimbs = calculatorState.recommendationNoMainViaLimbs;
  const previousMinShots = calculatorState.recommendationMinShots;
  const previousMaxShots = calculatorState.recommendationMaxShots;

  try {
    calculatorState.recommendationRangeMeters = 0;
    calculatorState.selectedZoneIndex = null;
    calculatorState.recommendationNoMainViaLimbs = true;
    calculatorState.recommendationMinShots = 1;
    calculatorState.recommendationMaxShots = 3;
    weaponsState.groups = [
      makeWeapon('Senator', {
        index: 0,
        type: 'Secondary',
        sub: 'P',
        rpm: 60,
        rows: [makeAttackRow('Senator', 100, 3)]
      })
    ];

    const container = renderPanelForTest({
      name: 'Headroom Dummy',
      health: 240,
      zones: [
        makeZone('Main', { health: 240, av: 1, toMainPercent: 1 })
      ]
    });

    // The main recommendation row should display +25% in the Margin cell (not '—').
    const marginFlags = collectElements(
      container,
      (element) => element.classList.contains('calc-recommend-flag') && element.textContent === '+25%'
    );

    // The flag should appear in the overall/main section (not just the near-miss section)
    const sectionTitles = collectElements(container, (element) => element.classList.contains('calc-recommend-section-title'));
    const mainSectionTitles = sectionTitles.filter(
      (el) => el.textContent !== 'Near misses'
    );

    assert.ok(marginFlags.length > 0, 'a +25% Margin flag should appear for the 3-shot Senator-like weapon');
    assert.ok(mainSectionTitles.length > 0, 'at least one non-near-miss section should exist');
  } finally {
    calculatorState.recommendationRangeMeters = previousRangeFloor;
    calculatorState.selectedZoneIndex = previousSelectedZoneIndex;
    calculatorState.recommendationNoMainViaLimbs = previousNoMainViaLimbs;
    calculatorState.recommendationMinShots = previousMinShots;
    calculatorState.recommendationMaxShots = previousMaxShots;
    weaponsState.groups = previousGroups;
  }
});
