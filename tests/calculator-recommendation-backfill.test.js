// Backfill tests: verifies the panel's rank-diversity backfill (weakspot
// coverage, weapon-type coverage) and the near-miss subsection rendering.

import test from 'node:test';
import assert from 'node:assert/strict';
import './env-stubs.js';
import {
  makeAttackRow,
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
const { buildWeaponRecommendationRows } = await import('../calculator/recommendations.js');
const { state: weaponsState } = await import('../weapons/data.js');

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

test('renderRecommendationPanel backfills distinct overall weakspots after ranking', () => {
  const previousRangeFloor = calculatorState.recommendationRangeMeters;
  const previousGroups = weaponsState.groups;
  const previousSelectedZoneIndex = calculatorState.selectedZoneIndex;

  try {
    calculatorState.recommendationRangeMeters = 0;
    calculatorState.selectedZoneIndex = null;
    weaponsState.groups = [
      ...Array.from({ length: 24 }, (_, index) => makeWeapon(`Pilot Hunter ${index + 1}`, {
        index,
        type: 'Primary',
        rpm: 60,
        rows: [makeAttackRow(`Pilot Hunter ${index + 1}`, 105, 3)]
      })),
      makeWeapon('Engine Hunter', {
        index: 24,
        type: 'Primary',
        rpm: 60,
        rows: [makeAttackRow('Engine Hunter', 150, 2)]
      })
    ];

    const enemy = {
      name: 'Diversity Dummy',
      health: 500,
      zones: [
        makeZone('pilot', { health: 100, isFatal: true, av: 2, toMainPercent: 1 }),
        makeZone('engine', { health: 130, isFatal: true, av: 1, toMainPercent: 1 })
      ]
    };
    const rankedRows = buildWeaponRecommendationRows({
      enemy,
      weapons: weaponsState.groups,
      rangeFloorMeters: 0
    });

    assert.equal(rankedRows.length, 25);
    assert.ok(rankedRows.slice(0, 24).every((row) => row.bestZoneName === 'pilot'));
    assert.equal(rankedRows[24].weapon.name, 'Engine Hunter');
    assert.equal(rankedRows[24].bestZoneName, 'engine');

    const container = renderPanelForTest(enemy);
    const tables = collectElements(container, (element) => element.tagName === 'TABLE');
    const overallRows = collectElements(tables[0], (element) => element.tagName === 'TR').slice(1);
    const weaponNames = overallRows.map((row) => row.children[0]?.textContent || '');
    const targetCells = collectElements(tables[0], (element) => (
      element.tagName === 'TD'
      && /Best-ranked target:/i.test(element.title)
    ));
    const targetTitles = targetCells.map((cell) => cell.title);

    assert.equal(weaponNames.length, 24);
    assert.ok(weaponNames.includes('Engine Hunter'));
    assert.equal(targetTitles.length, 24);
    assert.ok(targetTitles.some((title) => /Best-ranked target: engine/i.test(title)));
    assert.ok(targetTitles.some((title) => /Best-ranked target: pilot/i.test(title)));
  } finally {
    calculatorState.recommendationRangeMeters = previousRangeFloor;
    calculatorState.selectedZoneIndex = previousSelectedZoneIndex;
    weaponsState.groups = previousGroups;
  }
});

test('renderRecommendationPanel backfills core weapon-type coverage in overall recommendations', () => {
  const previousRangeFloor = calculatorState.recommendationRangeMeters;
  const previousGroups = weaponsState.groups;
  const previousSelectedZoneIndex = calculatorState.selectedZoneIndex;

  try {
    calculatorState.recommendationRangeMeters = 0;
    calculatorState.selectedZoneIndex = null;
    weaponsState.groups = [
      ...Array.from({ length: 24 }, (_, index) => makeWeapon(`Primary ${index + 1}`, {
        index,
        type: 'Primary',
        rpm: 60,
        rows: [makeAttackRow(`Primary ${index + 1}`, 101, 2)]
      })),
      makeWeapon('Secondary A', {
        index: 30,
        type: 'Secondary',
        rpm: 60,
        rows: [makeAttackRow('Secondary A', 110, 2)]
      }),
      makeWeapon('Secondary B', {
        index: 31,
        type: 'Secondary',
        rpm: 60,
        rows: [makeAttackRow('Secondary B', 111, 2)]
      }),
      makeWeapon('Grenade A', {
        index: 32,
        type: 'Grenade',
        rpm: 60,
        rows: [makeAttackRow('Grenade A', 115, 2)]
      }),
      makeWeapon('Grenade B', {
        index: 33,
        type: 'Grenade',
        rpm: 60,
        rows: [makeAttackRow('Grenade B', 116, 2)]
      }),
      makeWeapon('Support A', {
        index: 34,
        type: 'Support',
        rpm: 60,
        rows: [makeAttackRow('Support A', 120, 2)]
      }),
      makeWeapon('Support B', {
        index: 35,
        type: 'Support',
        rpm: 60,
        rows: [makeAttackRow('Support B', 121, 2)]
      })
    ];

    const container = renderPanelForTest({
      name: 'Coverage Dummy',
      health: 500,
      zones: [
        makeZone('head', { health: 100, isFatal: true, av: 1, toMainPercent: 1 })
      ]
    });

    const summary = collectElements(container, (element) => element.classList.contains('calc-recommend-summary'))[0];
    const tables = collectElements(container, (element) => element.tagName === 'TABLE');
    const overallRows = collectElements(tables[0], (element) => element.tagName === 'TR').slice(1);
    const weaponNames = overallRows.map((row) => row.children[0]?.textContent || '');

    assert.equal(weaponNames.length, 24);
    assert.match(summary?.textContent || '', /core weapon-type coverage is backfilled where available/i);
    assert.ok(weaponNames.includes('Secondary A'));
    assert.ok(weaponNames.includes('Secondary B'));
    assert.ok(weaponNames.includes('Grenade A'));
    assert.ok(weaponNames.includes('Grenade B'));
    assert.ok(weaponNames.includes('Support A'));
    assert.ok(weaponNames.includes('Support B'));
    assert.ok(weaponNames.some((name) => /^Primary /.test(name)));
  } finally {
    calculatorState.recommendationRangeMeters = previousRangeFloor;
    calculatorState.selectedZoneIndex = previousSelectedZoneIndex;
    weaponsState.groups = previousGroups;
  }
});

test('renderRecommendationPanel renders a near-miss subsection with a near-miss header', () => {
  const previousRangeFloor = calculatorState.recommendationRangeMeters;
  const previousGroups = weaponsState.groups;
  const previousSelectedZoneIndex = calculatorState.selectedZoneIndex;
  const previousNoMainViaLimbs = calculatorState.recommendationNoMainViaLimbs;

  try {
    calculatorState.recommendationRangeMeters = 0;
    calculatorState.selectedZoneIndex = null;
    calculatorState.recommendationNoMainViaLimbs = true;
    weaponsState.groups = [
      makeWeapon('Heavy Pistol', {
        index: 0,
        type: 'Secondary',
        sub: 'P',
        rpm: 60,
        rows: [makeAttackRow('Heavy Pistol', 100, 3)]
      })
    ];

    const container = renderPanelForTest({
      name: 'Near Miss Dummy',
      health: 240,
      zones: [
        makeZone('Main', { health: 240, av: 1, toMainPercent: 1 })
      ]
    });

    const sectionTitles = collectElements(container, (element) => element.classList.contains('calc-recommend-section-title'));
    const headerCells = collectElements(container, (element) => element.tagName === 'TH');
    const nearMissFlags = collectElements(
      container,
      (element) => element.classList.contains('calc-recommend-flag') && element.textContent === '60%'
    );

    assert.ok(sectionTitles.some((element) => element.textContent === 'Near misses'));
    assert.ok(headerCells.some((element) => element.textContent === 'Near miss'));
    assert.ok(nearMissFlags.length > 0);
  } finally {
    calculatorState.recommendationRangeMeters = previousRangeFloor;
    calculatorState.selectedZoneIndex = previousSelectedZoneIndex;
    calculatorState.recommendationNoMainViaLimbs = previousNoMainViaLimbs;
    weaponsState.groups = previousGroups;
  }
});
