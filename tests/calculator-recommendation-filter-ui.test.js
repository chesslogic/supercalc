// Filter UI tests: verifies chip ordering, chip toggle state, shot-range
// sliders, pagination controls, the no-main-via-limbs preference chip, the
// browser-like children collection compatibility, and role chip data attributes.

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
  BrowserLikeTestElement,
  BrowserLikeTestDocument,
  collectElements,
  getChipRowByLabel,
  getRecommendationSection
} from './fixtures/tooltip-dom-stubs.js';

const { calculatorState } = await import('../calculator/data.js');
const { renderRecommendationPanel } = await import('../calculator/calculation.js');
const { state: weaponsState } = await import('../weapons/data.js');

function renderPanelForTest(enemy, options = {}) {
  const previousDocument = globalThis.document;
  const previousNode = globalThis.Node;
  const container = new TestElement('div');

  globalThis.document = new TestDocument();
  globalThis.Node = TestElement;

  try {
    renderRecommendationPanel(container, enemy, options);
    return container;
  } finally {
    globalThis.document = previousDocument;
    globalThis.Node = previousNode;
  }
}

function renderPanelForBrowserLikeTest(enemy, options = {}) {
  const previousDocument = globalThis.document;
  const previousNode = globalThis.Node;
  const container = new BrowserLikeTestElement('div');

  globalThis.document = new BrowserLikeTestDocument();
  globalThis.Node = BrowserLikeTestElement;

  try {
    renderRecommendationPanel(container, enemy, options);
    return container;
  } finally {
    globalThis.document = previousDocument;
    globalThis.Node = previousNode;
  }
}

test('renderRecommendationPanel surfaces the shared filter controls with targeted recommendations when a target is selected', () => {
  const previousRangeFloor = calculatorState.recommendationRangeMeters;
  const previousGroups = weaponsState.groups;
  const previousSelectedZoneIndex = calculatorState.selectedZoneIndex;

  try {
    calculatorState.recommendationRangeMeters = 0;
    calculatorState.selectedZoneIndex = 0;
    weaponsState.groups = [
      makeWeapon('Liberator', {
        index: 0,
        type: 'Primary',
        sub: 'AR',
        rpm: 60,
        rows: [makeAttackRow('Liberator Burst', 105, 2)]
      }),
      makeWeapon('Diligence', {
        index: 1,
        type: 'Primary',
        sub: 'DMR',
        rpm: 60,
        rows: [makeAttackRow('Diligence Shot', 150, 2)]
      })
    ];

    const container = renderPanelForTest({
      name: 'Targeted Controls Dummy',
      health: 500,
      zones: [
        makeZone('head', { health: 100, isFatal: true, av: 1, toMainPercent: 1 }),
        makeZone('torso', { health: 300, av: 2, toMainPercent: 0.5 })
      ]
    });

    const targetedSection = getRecommendationSection(container, 'head targeted recommendations');
    const overallSection = getRecommendationSection(container, 'Overall recommendations');

    assert.ok(targetedSection);
    assert.ok(overallSection);
    assert.ok(getChipRowByLabel(targetedSection, 'Weapon filters'));
    assert.ok(getChipRowByLabel(targetedSection, 'Shots'));
    assert.equal(getChipRowByLabel(overallSection, 'Weapon filters'), null);
  } finally {
    calculatorState.recommendationRangeMeters = previousRangeFloor;
    calculatorState.selectedZoneIndex = previousSelectedZoneIndex;
    weaponsState.groups = previousGroups;
  }
});

test('renderRecommendationPanel keeps the shared filter controls with overall recommendations when no target is selected', () => {
  const previousRangeFloor = calculatorState.recommendationRangeMeters;
  const previousGroups = weaponsState.groups;
  const previousSelectedZoneIndex = calculatorState.selectedZoneIndex;

  try {
    calculatorState.recommendationRangeMeters = 0;
    calculatorState.selectedZoneIndex = null;
    weaponsState.groups = [
      makeWeapon('Liberator', {
        index: 0,
        type: 'Primary',
        sub: 'AR',
        rpm: 60,
        rows: [makeAttackRow('Liberator Burst', 105, 2)]
      })
    ];

    const container = renderPanelForTest({
      name: 'Overall Controls Dummy',
      health: 500,
      zones: [
        makeZone('head', { health: 100, isFatal: true, av: 1, toMainPercent: 1 })
      ]
    });

    const overallSection = getRecommendationSection(container, 'Overall recommendations');

    assert.ok(overallSection);
    assert.ok(getChipRowByLabel(overallSection, 'Weapon filters'));
    assert.ok(getChipRowByLabel(overallSection, 'Shots'));
  } finally {
    calculatorState.recommendationRangeMeters = previousRangeFloor;
    calculatorState.selectedZoneIndex = previousSelectedZoneIndex;
    weaponsState.groups = previousGroups;
  }
});

test('renderRecommendationPanel surfaces subtype and feature rows in stable order', () => {
  const previousRangeFloor = calculatorState.recommendationRangeMeters;
  const previousGroups = weaponsState.groups;
  const previousSelectedZoneIndex = calculatorState.selectedZoneIndex;

  try {
    calculatorState.recommendationRangeMeters = 0;
    calculatorState.selectedZoneIndex = null;
    weaponsState.groups = [
      makeWeapon('Guard Dog', {
        index: 0,
        type: 'Stratagem',
        sub: 'BCK',
        rpm: 60,
        rows: [makeAttackRow('Guard Dog Burst', 80, 2)]
      }),
      makeWeapon('Liberator', {
        index: 1,
        type: 'Primary',
        sub: 'AR',
        rpm: 60,
        rows: [makeAttackRow('Liberator Burst', 105, 2)]
      }),
      makeWeapon('Diligence', {
        index: 2,
        type: 'Primary',
        sub: 'DMR',
        rpm: 60,
        rows: [makeAttackRow('Diligence Shot', 125, 3)]
      }),
      makeWeapon('Punisher Plasma', {
        index: 3,
        type: 'Primary',
        role: 'explosive',
        sub: 'EXP',
        rpm: 60,
        rows: [makeAttackRow('Large Plasma Bolt', 225, 3)]
      }),
      makeWeapon('Recoilless Rifle', {
        index: 4,
        type: 'Support',
        sub: 'RL',
        rpm: 60,
        rows: [makeAttackRow('Recoilless Shell', 300, 5)]
      })
    ];

    const container = renderPanelForTest({
      name: 'Surface Parity Dummy',
      health: 500,
      zones: [
        makeZone('head', { health: 100, isFatal: true, av: 1, toMainPercent: 1 })
      ]
    });

    const subRow = getChipRowByLabel(container, 'Sub');
    const subChips = (subRow?.children || [])
      .filter((child) => child.tagName === 'BUTTON')
      .map((child) => child.textContent);
    const featureRow = getChipRowByLabel(container, 'Feature');
    const featureChips = (featureRow?.children || [])
      .filter((child) => child.tagName === 'BUTTON')
      .map((child) => child.textContent);

    assert.deepEqual(subChips, ['AR', 'DMR', 'EXP', 'RL']);
    assert.deepEqual(featureChips, ['Automatic', 'Explosive', 'Special', 'Ordnance']);
  } finally {
    calculatorState.recommendationRangeMeters = previousRangeFloor;
    calculatorState.selectedZoneIndex = previousSelectedZoneIndex;
    weaponsState.groups = previousGroups;
  }
});

test('renderRecommendationPanel subtype and feature chips toggle recommendation filter state', () => {
  const previousRangeFloor = calculatorState.recommendationRangeMeters;
  const previousGroups = weaponsState.groups;
  const previousSelectedZoneIndex = calculatorState.selectedZoneIndex;
  const previousFilterSubs = [...calculatorState.recommendationWeaponFilterSubs];
  const previousFilterGroups = [...calculatorState.recommendationWeaponFilterGroups];

  try {
    calculatorState.recommendationRangeMeters = 0;
    calculatorState.selectedZoneIndex = null;
    calculatorState.recommendationWeaponFilterSubs = [];
    calculatorState.recommendationWeaponFilterGroups = [];
    weaponsState.groups = [
      makeWeapon('Liberator', {
        index: 0,
        type: 'Primary',
        sub: 'AR',
        rpm: 60,
        rows: [makeAttackRow('Liberator Burst', 105, 2)]
      }),
      makeWeapon('Guard Dog', {
        index: 1,
        type: 'Stratagem',
        sub: 'BCK',
        rpm: 60,
        rows: [makeAttackRow('Guard Dog Burst', 80, 2)]
      })
    ];

    const container = renderPanelForTest({
      name: 'Filter Toggle Dummy',
      health: 500,
      zones: [
        makeZone('head', { health: 100, isFatal: true, av: 1, toMainPercent: 1 })
      ]
    });

    const subChip = getChipRowByLabel(container, 'Sub')
      ?.children
      ?.find((child) => child.tagName === 'BUTTON' && child.textContent === 'AR');
    const featureChip = getChipRowByLabel(container, 'Feature')
      ?.children
      ?.find((child) => child.tagName === 'BUTTON' && child.textContent === 'Special');

    assert.equal(typeof subChip?.listeners.get('click'), 'function');
    assert.equal(typeof featureChip?.listeners.get('click'), 'function');

    subChip.listeners.get('click')();
    featureChip.listeners.get('click')();

    assert.deepEqual(calculatorState.recommendationWeaponFilterSubs, ['ar']);
    assert.deepEqual(calculatorState.recommendationWeaponFilterGroups, ['special']);
  } finally {
    calculatorState.recommendationRangeMeters = previousRangeFloor;
    calculatorState.selectedZoneIndex = previousSelectedZoneIndex;
    calculatorState.recommendationWeaponFilterSubs = previousFilterSubs;
    calculatorState.recommendationWeaponFilterGroups = previousFilterGroups;
    weaponsState.groups = previousGroups;
  }
});

test('renderRecommendationPanel shows role chips in taxonomy order', () => {
  const previousRangeFloor = calculatorState.recommendationRangeMeters;
  const previousGroups = weaponsState.groups;
  const previousSelectedZoneIndex = calculatorState.selectedZoneIndex;
  const previousFilterMode = calculatorState.recommendationWeaponFilterMode;
  const previousFilterTypes = [...calculatorState.recommendationWeaponFilterTypes];
  const previousFilterRoles = [...calculatorState.recommendationWeaponFilterRoles];

  try {
    calculatorState.recommendationRangeMeters = 0;
    calculatorState.selectedZoneIndex = null;
    calculatorState.recommendationWeaponFilterMode = 'exclude';
    calculatorState.recommendationWeaponFilterTypes = [];
    calculatorState.recommendationWeaponFilterRoles = [];
    weaponsState.groups = [
      makeWeapon('Liberator', {
        index: 0,
        type: 'Primary',
        sub: 'AR',
        rpm: 60,
        rows: [makeAttackRow('Liberator Burst', 105, 2)]
      }),
      makeWeapon('Sickle', {
        index: 1,
        type: 'Primary',
        role: 'automatic',
        sub: 'NRG',
        rpm: 60,
        rows: [makeAttackRow('Sickle Beam', 60, 2)]
      }),
      makeWeapon('Punisher Plasma', {
        index: 2,
        type: 'Primary',
        role: 'explosive',
        sub: 'EXP',
        rpm: 60,
        rows: [makeAttackRow('Large Plasma Bolt', 225, 3)]
      }),
      makeWeapon('Guard Dog', {
        index: 3,
        type: 'Stratagem',
        sub: 'BCK',
        rpm: 60,
        rows: [makeAttackRow('Guard Dog Burst', 80, 2)]
      }),
      makeWeapon('Recoilless Rifle', {
        index: 4,
        type: 'Support',
        sub: 'RL',
        rpm: 60,
        rows: [makeAttackRow('Recoilless Shell', 300, 5)]
      }),
      makeWeapon('Diligence', {
        index: 5,
        type: 'Primary',
        sub: 'DMR',
        rpm: 60,
        rows: [makeAttackRow('Diligence Shot', 125, 3)]
      }),
      makeWeapon('Senator', {
        index: 6,
        type: 'Secondary',
        sub: 'PDW',
        rpm: 60,
        rows: [makeAttackRow('Senator Shot', 175, 3)]
      }),
      makeWeapon('Breaker', {
        index: 7,
        type: 'Primary',
        sub: 'SG',
        rpm: 60,
        rows: [makeAttackRow('Buckshot', 35, 2)]
      })
    ];

    const container = renderPanelForTest({
      name: 'Role Filter Dummy',
      health: 500,
      zones: [
        makeZone('head', { health: 100, isFatal: true, av: 1, toMainPercent: 1 })
      ]
    });

    const roleRow = getChipRowByLabel(container, 'Role');
    const rowChildren = roleRow?.children?.slice(1) || [];
    const chipTexts = rowChildren
      .filter((child) => child.tagName === 'BUTTON')
      .map((child) => child.textContent);

    assert.deepEqual(chipTexts, ['Automatic', 'Precision', 'Explosive', 'Shotgun', 'Special', 'Ordnance']);
    assert.ok(!chipTexts.includes('AR'));
    assert.ok(!chipTexts.includes('NRG'));
    assert.ok(!chipTexts.includes('EXP'));
    assert.ok(!chipTexts.includes('BCK'));
    assert.ok(!chipTexts.includes('RL'));
  } finally {
    calculatorState.recommendationRangeMeters = previousRangeFloor;
    calculatorState.selectedZoneIndex = previousSelectedZoneIndex;
    calculatorState.recommendationWeaponFilterMode = previousFilterMode;
    calculatorState.recommendationWeaponFilterTypes = previousFilterTypes;
    calculatorState.recommendationWeaponFilterRoles = previousFilterRoles;
    weaponsState.groups = previousGroups;
  }
});

test('renderRecommendationPanel handles browser-like role-row children collections', () => {
  const previousRangeFloor = calculatorState.recommendationRangeMeters;
  const previousGroups = weaponsState.groups;
  const previousSelectedZoneIndex = calculatorState.selectedZoneIndex;
  const previousFilterMode = calculatorState.recommendationWeaponFilterMode;
  const previousFilterTypes = [...calculatorState.recommendationWeaponFilterTypes];
  const previousFilterRoles = [...calculatorState.recommendationWeaponFilterRoles];

  try {
    calculatorState.recommendationRangeMeters = 0;
    calculatorState.selectedZoneIndex = null;
    calculatorState.recommendationWeaponFilterMode = 'exclude';
    calculatorState.recommendationWeaponFilterTypes = [];
    calculatorState.recommendationWeaponFilterRoles = [];
    weaponsState.groups = [
      makeWeapon('Liberator', {
        index: 0,
        type: 'Primary',
        role: 'automatic',
        sub: 'AR',
        rpm: 60,
        rows: [makeAttackRow('Liberator Burst', 105, 2)]
      }),
      makeWeapon('Diligence', {
        index: 1,
        type: 'Primary',
        role: 'precision',
        sub: 'DMR',
        rpm: 60,
        rows: [makeAttackRow('Diligence Shot', 125, 3)]
      })
    ];

    const container = renderPanelForBrowserLikeTest({
      name: 'Browser Collection Dummy',
      health: 500,
      zones: [
        makeZone('head', { health: 100, isFatal: true, av: 1, toMainPercent: 1 })
      ]
    });

    assert.ok(getRecommendationSection(container, 'Overall recommendations'));
    assert.ok(getChipRowByLabel(container, 'Role'));
  } finally {
    calculatorState.recommendationRangeMeters = previousRangeFloor;
    calculatorState.selectedZoneIndex = previousSelectedZoneIndex;
    calculatorState.recommendationWeaponFilterMode = previousFilterMode;
    calculatorState.recommendationWeaponFilterTypes = previousFilterTypes;
    calculatorState.recommendationWeaponFilterRoles = previousFilterRoles;
    weaponsState.groups = previousGroups;
  }
});

test('renderRecommendationPanel exposes a no-main-via-limbs preference chip that toggles calculator state', () => {
  const previousRangeFloor = calculatorState.recommendationRangeMeters;
  const previousGroups = weaponsState.groups;
  const previousSelectedZoneIndex = calculatorState.selectedZoneIndex;
  const previousNoMainViaLimbs = calculatorState.recommendationNoMainViaLimbs;

  try {
    calculatorState.recommendationRangeMeters = 0;
    calculatorState.selectedZoneIndex = null;
    calculatorState.recommendationNoMainViaLimbs = true;
    weaponsState.groups = [
      makeWeapon('Liberator', {
        index: 0,
        type: 'Primary',
        sub: 'AR',
        rpm: 60,
        rows: [makeAttackRow('Liberator Burst', 105, 2)]
      })
    ];

    const container = renderPanelForTest({
      name: 'Preference Dummy',
      health: 500,
      zones: [
        makeZone('head', { health: 100, isFatal: true, av: 1, toMainPercent: 1 })
      ]
    });

    const preferenceRow = getChipRowByLabel(container, 'Preference');
    const preferenceChip = preferenceRow
      ? collectElements(preferenceRow, (element) => element.tagName === 'BUTTON')
        .find((button) => button.textContent === 'No main via limbs')
      : null;

    assert.ok(preferenceChip);
    assert.ok(preferenceChip.classList.contains('active'));
    assert.match(preferenceChip.title, /massive ordnance to a non-vital component/i);
    assert.equal(typeof preferenceChip.listeners.get('click'), 'function');

    preferenceChip.listeners.get('click')();

    assert.equal(calculatorState.recommendationNoMainViaLimbs, false);
  } finally {
    calculatorState.recommendationRangeMeters = previousRangeFloor;
    calculatorState.selectedZoneIndex = previousSelectedZoneIndex;
    calculatorState.recommendationNoMainViaLimbs = previousNoMainViaLimbs;
    weaponsState.groups = previousGroups;
  }
});

test('renderRecommendationPanel Margin header toggles strict-margin sorting and refreshes targeted rows', () => {
  const previousRangeFloor = calculatorState.recommendationRangeMeters;
  const previousGroups = weaponsState.groups;
  const previousSelectedZoneIndex = calculatorState.selectedZoneIndex;
  const previousSortMode = calculatorState.recommendationSortMode;

  const enemy = {
    name: 'Margin Header Dummy',
    health: 300,
    zones: [
      makeZone('Main', { health: 300, isFatal: true, av: 1, toMainPercent: 1 })
    ]
  };
  const getRenderedWeaponNames = (section) => {
    const table = collectElements(section, (element) => element.tagName === 'TABLE')[0];
    const rows = table
      ? collectElements(table, (element) => element.tagName === 'TR').slice(1)
      : [];
    return rows.map((row) => collectElements(row, (element) => element.tagName === 'TD')[0]?.textContent);
  };

  try {
    let refreshCount = 0;
    calculatorState.recommendationRangeMeters = 0;
    calculatorState.selectedZoneIndex = 0;
    calculatorState.recommendationSortMode = 'default';
    weaponsState.groups = [
      makeWeapon('Support One-Shot', {
        index: 0,
        rows: [makeAttackRow('Support One-Shot', 366, 2)]
      }),
      makeWeapon('Primary Three-Shot', {
        index: 1,
        rows: [makeAttackRow('Primary Three-Shot', 103, 2)]
      })
    ];

    const container = renderPanelForTest(enemy, {
      onRefresh: () => {
        refreshCount += 1;
      }
    });
    const targetedSection = getRecommendationSection(container, 'Main targeted recommendations');
    const marginButton = collectElements(targetedSection, (element) => (
      element.tagName === 'BUTTON' && element.classList.contains('calc-recommend-sort-button')
    ))[0];

    assert.ok(marginButton);
    assert.deepEqual(getRenderedWeaponNames(targetedSection), ['Support One-Shot', 'Primary Three-Shot']);
    assert.ok(!marginButton.classList.contains('is-active'));
    assert.match(marginButton.title, /sort recommendations by the strictest Margin first/i);

    marginButton.listeners.get('click')();

    assert.equal(calculatorState.recommendationSortMode, 'strict-margin');
    assert.equal(refreshCount, 1);

    const strictContainer = renderPanelForTest(enemy, {
      onRefresh: () => {
        refreshCount += 1;
      }
    });
    const strictTargetedSection = getRecommendationSection(strictContainer, 'Main targeted recommendations');
    const strictMarginButton = collectElements(strictTargetedSection, (element) => (
      element.tagName === 'BUTTON' && element.classList.contains('calc-recommend-sort-button')
    ))[0];

    assert.deepEqual(getRenderedWeaponNames(strictTargetedSection), ['Primary Three-Shot', 'Support One-Shot']);
    assert.ok(strictMarginButton.classList.contains('is-active'));
    assert.match(strictMarginButton.title, /strict Margin sorting is active/i);

    strictMarginButton.listeners.get('click')();

    assert.equal(calculatorState.recommendationSortMode, 'default');
    assert.equal(refreshCount, 2);
  } finally {
    calculatorState.recommendationRangeMeters = previousRangeFloor;
    calculatorState.selectedZoneIndex = previousSelectedZoneIndex;
    calculatorState.recommendationSortMode = previousSortMode;
    weaponsState.groups = previousGroups;
  }
});

test('renderRecommendationPanel keeps overall strict-margin ordering ascending for multi-shot fit', () => {
  const previousRangeFloor = calculatorState.recommendationRangeMeters;
  const previousGroups = weaponsState.groups;
  const previousSelectedZoneIndex = calculatorState.selectedZoneIndex;
  const previousSortMode = calculatorState.recommendationSortMode;

  const enemy = {
    name: 'Overall Strict Margin Dummy',
    health: 500,
    zones: [
      makeZone('Main', { health: 300, isFatal: true, av: 1, toMainPercent: 1 })
    ]
  };
  const getRenderedWeaponNames = (section) => {
    const table = collectElements(section, (element) => element.tagName === 'TABLE')[0];
    const rows = table
      ? collectElements(table, (element) => element.tagName === 'TR').slice(1)
      : [];
    return rows.map((row) => collectElements(row, (element) => element.tagName === 'TD')[0]?.textContent);
  };

  try {
    calculatorState.recommendationRangeMeters = 0;
    calculatorState.selectedZoneIndex = null;
    calculatorState.recommendationSortMode = 'strict-margin';
    weaponsState.groups = [
      makeWeapon('Two 5%', {
        index: 0,
        type: 'Primary',
        rows: [makeAttackRow('Two 5%', 158, 2)]
      }),
      makeWeapon('Two 60%', {
        index: 1,
        type: 'Primary',
        rows: [makeAttackRow('Two 60%', 240, 2)]
      }),
      makeWeapon('Three 3%', {
        index: 2,
        type: 'Primary',
        rows: [makeAttackRow('Three 3%', 103, 2)]
      }),
      makeWeapon('Three 40%', {
        index: 3,
        type: 'Primary',
        rows: [makeAttackRow('Three 40%', 140, 2)]
      })
    ];

    const container = renderPanelForTest(enemy);
    const overallSection = getRecommendationSection(container, 'Overall recommendations');

    assert.ok(overallSection);
    assert.deepEqual(
      getRenderedWeaponNames(overallSection).slice(0, 4),
      ['Three 3%', 'Two 5%', 'Three 40%', 'Two 60%']
    );
  } finally {
    calculatorState.recommendationRangeMeters = previousRangeFloor;
    calculatorState.selectedZoneIndex = previousSelectedZoneIndex;
    calculatorState.recommendationSortMode = previousSortMode;
    weaponsState.groups = previousGroups;
  }
});

test('renderRecommendationPanel exposes shot-range sliders that update calculator state', () => {
  const previousRangeFloor = calculatorState.recommendationRangeMeters;
  const previousGroups = weaponsState.groups;
  const previousSelectedZoneIndex = calculatorState.selectedZoneIndex;
  const previousMinShots = calculatorState.recommendationMinShots;
  const previousMaxShots = calculatorState.recommendationMaxShots;

  try {
    calculatorState.recommendationRangeMeters = 0;
    calculatorState.selectedZoneIndex = null;
    calculatorState.recommendationMinShots = 1;
    calculatorState.recommendationMaxShots = 3;
    weaponsState.groups = [
      makeWeapon('Liberator', {
        index: 0,
        type: 'Primary',
        sub: 'AR',
        rpm: 60,
        rows: [makeAttackRow('Liberator Burst', 105, 2)]
      })
    ];

    const container = renderPanelForTest({
      name: 'Shot Slider Dummy',
      health: 500,
      zones: [
        makeZone('head', { health: 100, isFatal: true, av: 1, toMainPercent: 1 })
      ]
    });

    const shotsRow = getChipRowByLabel(container, 'Shots');
    const sliders = shotsRow
      ? collectElements(shotsRow, (element) => element.tagName === 'INPUT')
      : [];

    assert.equal(sliders.length, 2);
    assert.equal(sliders[0].type, 'range');
    assert.equal(sliders[0].value, '1');
    assert.equal(sliders[1].type, 'range');
    assert.equal(sliders[1].value, '3');

    sliders[0].value = '2';
    sliders[0].listeners.get('input')?.();

    assert.equal(calculatorState.recommendationMinShots, 2);
    assert.equal(calculatorState.recommendationMaxShots, 3);
  } finally {
    calculatorState.recommendationRangeMeters = previousRangeFloor;
    calculatorState.selectedZoneIndex = previousSelectedZoneIndex;
    calculatorState.recommendationMinShots = previousMinShots;
    calculatorState.recommendationMaxShots = previousMaxShots;
    weaponsState.groups = previousGroups;
  }
});

test('renderRecommendationPanel paginates overflowing targeted recommendations with a show-more control', () => {
  const previousRangeFloor = calculatorState.recommendationRangeMeters;
  const previousGroups = weaponsState.groups;
  const previousSelectedZoneIndex = calculatorState.selectedZoneIndex;
  const previousDocument = globalThis.document;
  const previousNode = globalThis.Node;

  try {
    calculatorState.recommendationRangeMeters = 0;
    calculatorState.selectedZoneIndex = 0;
    weaponsState.groups = Array.from({ length: 13 }, (_, index) => makeWeapon(`Targeted ${index + 1}`, {
      index,
      type: 'Primary',
      rpm: 60,
      rows: [makeAttackRow(`Targeted ${index + 1}`, 110 + index, 2)]
    }));

    globalThis.document = new TestDocument();
    globalThis.Node = TestElement;

    const container = new TestElement('div');
    renderRecommendationPanel(container, {
      name: 'Target Overflow Dummy',
      health: 600,
      zones: [
        makeZone('head', { health: 100, isFatal: true, av: 1, toMainPercent: 1 }),
        makeZone('torso', { health: 300, av: 2, toMainPercent: 0.5 })
      ]
    });

    const tables = collectElements(container, (element) => element.tagName === 'TABLE');
    const buttons = collectElements(container, (element) => element.classList.contains('calc-recommend-more-button'));
    const statuses = collectElements(container, (element) => element.classList.contains('calc-recommend-pagination-status'));

    assert.equal(collectElements(tables[0], (element) => element.tagName === 'TR').slice(1).length, 12);
    assert.equal(buttons[0]?.textContent, '+1 more');
    assert.equal(statuses[0]?.textContent, 'Showing 12 of 13 recommendations.');

    buttons[0]?.listeners.get('click')?.();

    assert.equal(collectElements(tables[0], (element) => element.tagName === 'TR').slice(1).length, 13);
    assert.equal(statuses[0]?.textContent, 'Showing all 13 recommendations.');
    assert.equal(buttons[0]?.classList.contains('hidden'), true);
  } finally {
    globalThis.document = previousDocument;
    globalThis.Node = previousNode;
    calculatorState.recommendationRangeMeters = previousRangeFloor;
    calculatorState.selectedZoneIndex = previousSelectedZoneIndex;
    weaponsState.groups = previousGroups;
  }
});

test('renderRecommendationPanel paginates overflowing overall recommendations with a show-more control', () => {
  const previousRangeFloor = calculatorState.recommendationRangeMeters;
  const previousGroups = weaponsState.groups;
  const previousSelectedZoneIndex = calculatorState.selectedZoneIndex;
  const previousDocument = globalThis.document;
  const previousNode = globalThis.Node;

  try {
    calculatorState.recommendationRangeMeters = 0;
    calculatorState.selectedZoneIndex = null;
    weaponsState.groups = Array.from({ length: 26 }, (_, index) => makeWeapon(`Overflow ${index + 1}`, {
      index,
      type: 'Primary',
      rpm: 60,
      rows: [makeAttackRow(`Overflow ${index + 1}`, 105 + index, 2)]
    }));

    globalThis.document = new TestDocument();
    globalThis.Node = TestElement;

    const container = new TestElement('div');
    renderRecommendationPanel(container, {
      name: 'Overall Overflow Dummy',
      health: 500,
      zones: [
        makeZone('head', { health: 100, isFatal: true, av: 1, toMainPercent: 1 })
      ]
    });

    const tables = collectElements(container, (element) => element.tagName === 'TABLE');
    const buttons = collectElements(container, (element) => element.classList.contains('calc-recommend-more-button'));
    const statuses = collectElements(container, (element) => element.classList.contains('calc-recommend-pagination-status'));

    assert.equal(collectElements(tables[0], (element) => element.tagName === 'TR').slice(1).length, 24);
    assert.equal(buttons[0]?.textContent, '+2 more');
    assert.equal(statuses[0]?.textContent, 'Showing 24 of 26 recommendations.');

    buttons[0]?.listeners.get('click')?.();

    assert.equal(collectElements(tables[0], (element) => element.tagName === 'TR').slice(1).length, 26);
    assert.equal(statuses[0]?.textContent, 'Showing all 26 recommendations.');
    assert.equal(buttons[0]?.classList.contains('hidden'), true);
  } finally {
    globalThis.document = previousDocument;
    globalThis.Node = previousNode;
    calculatorState.recommendationRangeMeters = previousRangeFloor;
    calculatorState.selectedZoneIndex = previousSelectedZoneIndex;
    weaponsState.groups = previousGroups;
  }
});

test('renderRecommendationPanel role chips appear with data-role attributes', () => {
  const previousRangeFloor = calculatorState.recommendationRangeMeters;
  const previousGroups = weaponsState.groups;
  const previousSelectedZoneIndex = calculatorState.selectedZoneIndex;
  const previousFilterRoles = [...calculatorState.recommendationWeaponFilterRoles];

  try {
    calculatorState.recommendationRangeMeters = 0;
    calculatorState.selectedZoneIndex = null;
    calculatorState.recommendationWeaponFilterRoles = ['precision'];
    weaponsState.groups = [
      makeWeapon('Diligence', {
        index: 0,
        type: 'Primary',
        sub: 'DMR',
        rpm: 60,
        rows: [makeAttackRow('Diligence Shot', 125, 3)]
      }),
      makeWeapon('Liberator', {
        index: 1,
        type: 'Primary',
        sub: 'AR',
        rpm: 60,
        rows: [makeAttackRow('Liberator Burst', 105, 2)]
      })
    ];

    const container = renderPanelForTest({
      name: 'Role Chip Attr Dummy',
      health: 500,
      zones: [
        makeZone('head', { health: 100, isFatal: true, av: 1, toMainPercent: 1 })
      ]
    });

    const roleRow = getChipRowByLabel(container, 'Role');
    const chips = (roleRow?.children || []).filter((child) => child.tagName === 'BUTTON');
    const roleDataValues = chips.map((chip) => chip.dataset.role);

    assert.ok(roleDataValues.includes('automatic'));
    assert.ok(roleDataValues.includes('precision'));
    const precisionChip = chips.find((chip) => chip.dataset.role === 'precision');
    assert.ok(precisionChip?.classList.contains('active'), 'Precision chip should be active when selected');
  } finally {
    calculatorState.recommendationRangeMeters = previousRangeFloor;
    calculatorState.selectedZoneIndex = previousSelectedZoneIndex;
    calculatorState.recommendationWeaponFilterRoles = previousFilterRoles;
    weaponsState.groups = previousGroups;
  }
});
