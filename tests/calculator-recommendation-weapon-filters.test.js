// Weapon filter tests: verifies that recommendation panels correctly apply
// include/exclude filters for weapon type, subtype, role, feature group, and
// shot range, including AND semantics across filter categories, targeted-
// section filtering, and related-route filtering.

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
  collectElements,
  getRecommendationSection
} from './fixtures/tooltip-dom-stubs.js';

const {
  calculatorState,
  DEFAULT_RECOMMENDATION_WEAPON_FILTER_ROLES
} = await import('../calculator/data.js');
const { renderRecommendationPanel } = await import('../calculator/calculation.js');
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

test('renderRecommendationPanel excludes filtered weapon families from overall recommendations', () => {
  const previousRangeFloor = calculatorState.recommendationRangeMeters;
  const previousGroups = weaponsState.groups;
  const previousSelectedZoneIndex = calculatorState.selectedZoneIndex;
  const previousFilterMode = calculatorState.recommendationWeaponFilterMode;
  const previousFilterTypes = [...calculatorState.recommendationWeaponFilterTypes];
  const previousFilterSubs = [...calculatorState.recommendationWeaponFilterSubs];
  const previousFilterGroups = [...calculatorState.recommendationWeaponFilterGroups];

  try {
    calculatorState.recommendationRangeMeters = 0;
    calculatorState.selectedZoneIndex = null;
    calculatorState.recommendationWeaponFilterMode = 'exclude';
    calculatorState.recommendationWeaponFilterTypes = ['support', 'stratagem'];
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
      makeWeapon('Recoilless Rifle', {
        index: 1,
        type: 'Support',
        sub: 'RL',
        rpm: 60,
        rows: [makeAttackRow('Recoilless Shell', 300, 5)]
      }),
      makeWeapon('Orbital Precision Strike', {
        index: 2,
        type: 'Stratagem',
        sub: 'ORB',
        rpm: 60,
        rows: [makeAttackRow('Orbital Strike', 500, 6)]
      })
    ];

    const container = renderPanelForTest({
      name: 'Filter Dummy',
      health: 500,
      zones: [
        makeZone('head', { health: 100, isFatal: true, av: 1, toMainPercent: 1 })
      ]
    });

    const summary = collectElements(container, (element) => element.classList.contains('calc-recommend-summary'))[0];
    const tables = collectElements(container, (element) => element.tagName === 'TABLE');
    const overallRows = collectElements(tables[0], (element) => element.tagName === 'TR').slice(1);
    const weaponNames = overallRows.map((row) => row.children[0]?.textContent || '');

    assert.deepEqual(weaponNames, ['Liberator']);
    assert.match(summary?.textContent || '', /weapon filters: hiding matches for type: support or stratagem/i);
  } finally {
    calculatorState.recommendationRangeMeters = previousRangeFloor;
    calculatorState.selectedZoneIndex = previousSelectedZoneIndex;
    calculatorState.recommendationWeaponFilterMode = previousFilterMode;
    calculatorState.recommendationWeaponFilterTypes = previousFilterTypes;
    calculatorState.recommendationWeaponFilterSubs = previousFilterSubs;
    calculatorState.recommendationWeaponFilterGroups = previousFilterGroups;
    weaponsState.groups = previousGroups;
  }
});

test('renderRecommendationPanel uses the blank role defaults to hide ordnance while keeping non-ordnance stratagems', () => {
  const previousRangeFloor = calculatorState.recommendationRangeMeters;
  const previousGroups = weaponsState.groups;
  const previousSelectedZoneIndex = calculatorState.selectedZoneIndex;
  const previousFilterRoles = [...calculatorState.recommendationWeaponFilterRoles];

  try {
    calculatorState.recommendationRangeMeters = 0;
    calculatorState.selectedZoneIndex = null;
    calculatorState.recommendationWeaponFilterRoles = [...DEFAULT_RECOMMENDATION_WEAPON_FILTER_ROLES];
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
        rows: [makeAttackRow('Guard Dog Burst', 125, 2)]
      }),
      makeWeapon('Orbital Precision Strike', {
        index: 2,
        type: 'Stratagem',
        sub: 'ORB',
        rpm: 60,
        rows: [makeAttackRow('Orbital Strike', 500, 6)]
      })
    ];

    const hiddenContainer = renderPanelForTest({
      name: 'Default Ordnance Filter Dummy',
      health: 500,
      zones: [
        makeZone('head', { health: 100, isFatal: true, av: 1, toMainPercent: 1 })
      ]
    });
    const hiddenSummary = collectElements(hiddenContainer, (element) => element.classList.contains('calc-recommend-summary'))[0];
    const hiddenTables = collectElements(hiddenContainer, (element) => element.tagName === 'TABLE');
    const hiddenRows = collectElements(hiddenTables[0], (element) => element.tagName === 'TR').slice(1);
    const hiddenWeaponNames = hiddenRows.map((row) => row.children[0]?.textContent || '');

    assert.deepEqual([...hiddenWeaponNames].sort(), ['Guard Dog', 'Liberator'].sort());
    assert.doesNotMatch(hiddenSummary?.textContent || '', /weapon filters:/i);
  } finally {
    calculatorState.recommendationRangeMeters = previousRangeFloor;
    calculatorState.selectedZoneIndex = previousSelectedZoneIndex;
    calculatorState.recommendationWeaponFilterRoles = previousFilterRoles;
    weaponsState.groups = previousGroups;
  }
});

test('renderRecommendationPanel filters targeted recommendations when overall recommendations whitelist a subtype', () => {
  const previousRangeFloor = calculatorState.recommendationRangeMeters;
  const previousGroups = weaponsState.groups;
  const previousSelectedZoneIndex = calculatorState.selectedZoneIndex;
  const previousFilterMode = calculatorState.recommendationWeaponFilterMode;
  const previousFilterTypes = [...calculatorState.recommendationWeaponFilterTypes];
  const previousFilterSubs = [...calculatorState.recommendationWeaponFilterSubs];
  const previousFilterGroups = [...calculatorState.recommendationWeaponFilterGroups];

  try {
    calculatorState.recommendationRangeMeters = 0;
    calculatorState.selectedZoneIndex = 0;
    calculatorState.recommendationWeaponFilterMode = 'include';
    calculatorState.recommendationWeaponFilterTypes = [];
    calculatorState.recommendationWeaponFilterSubs = ['ar'];
    calculatorState.recommendationWeaponFilterGroups = [];
    weaponsState.groups = [
      makeWeapon('Liberator', {
        index: 0,
        type: 'Primary',
        sub: 'AR',
        rpm: 60,
        rows: [makeAttackRow('Liberator Burst', 105, 2)]
      }),
      makeWeapon('Recoilless Rifle', {
        index: 1,
        type: 'Support',
        sub: 'RL',
        rpm: 60,
        rows: [makeAttackRow('Recoilless Shell', 300, 5)]
      })
    ];

    const container = renderPanelForTest({
      name: 'Scoped Filter Dummy',
      health: 500,
      zones: [
        makeZone('head', { health: 100, isFatal: true, av: 1, toMainPercent: 1 }),
        makeZone('torso', { health: 300, av: 2, toMainPercent: 0.5 })
      ]
    });

    const summaries = collectElements(container, (element) => element.classList.contains('calc-recommend-summary'));
    const tables = collectElements(container, (element) => element.tagName === 'TABLE');
    const targetedRows = collectElements(tables[0], (element) => element.tagName === 'TR').slice(1);
    const overallRows = collectElements(tables[1], (element) => element.tagName === 'TR').slice(1);
    const targetedWeaponNames = targetedRows.map((row) => row.children[0]?.textContent || '');
    const overallWeaponNames = overallRows.map((row) => row.children[0]?.textContent || '');

    assert.deepEqual(targetedWeaponNames, ['Liberator']);
    assert.deepEqual(overallWeaponNames, ['Liberator']);
    assert.match(summaries[0]?.textContent || '', /weapon filters: showing only matches for sub: ar/i);
    assert.match(summaries[1]?.textContent || '', /weapon filters: showing only matches for sub: ar/i);
  } finally {
    calculatorState.recommendationRangeMeters = previousRangeFloor;
    calculatorState.selectedZoneIndex = previousSelectedZoneIndex;
    calculatorState.recommendationWeaponFilterMode = previousFilterMode;
    calculatorState.recommendationWeaponFilterTypes = previousFilterTypes;
    calculatorState.recommendationWeaponFilterSubs = previousFilterSubs;
    calculatorState.recommendationWeaponFilterGroups = previousFilterGroups;
    weaponsState.groups = previousGroups;
  }
});

test('renderRecommendationPanel explains when targeted rows are removed by active weapon filters', () => {
  const previousRangeFloor = calculatorState.recommendationRangeMeters;
  const previousGroups = weaponsState.groups;
  const previousSelectedZoneIndex = calculatorState.selectedZoneIndex;
  const previousFilterMode = calculatorState.recommendationWeaponFilterMode;
  const previousFilterTypes = [...calculatorState.recommendationWeaponFilterTypes];
  const previousFilterSubs = [...calculatorState.recommendationWeaponFilterSubs];
  const previousFilterGroups = [...calculatorState.recommendationWeaponFilterGroups];

  try {
    calculatorState.recommendationRangeMeters = 0;
    calculatorState.selectedZoneIndex = 0;
    calculatorState.recommendationWeaponFilterMode = 'include';
    calculatorState.recommendationWeaponFilterTypes = [];
    calculatorState.recommendationWeaponFilterSubs = ['rl'];
    calculatorState.recommendationWeaponFilterGroups = [];
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
      name: 'Targeted Empty Dummy',
      health: 500,
      zones: [
        makeZone('head', { health: 100, isFatal: true, av: 1, toMainPercent: 1 }),
        makeZone('torso', { health: 300, av: 2, toMainPercent: 0.5 })
      ]
    });

    const targetedSection = getRecommendationSection(container, 'head targeted recommendations');
    const targetedSummary = collectElements(targetedSection, (element) => element.classList.contains('calc-recommend-summary'))[0];
    const targetedMuted = collectElements(targetedSection, (element) => element.classList.contains('muted'));

    assert.ok(targetedSection);
    assert.match(targetedSummary?.textContent || '', /No dedicated target rows match the current weapon filters/i);
    assert.match(targetedSummary?.textContent || '', /showing only matches for sub: rl/i);
    assert.ok(targetedMuted.some((element) => /No targeted recommendation rows match the current weapon filters\./i.test(element.textContent || '')));
  } finally {
    calculatorState.recommendationRangeMeters = previousRangeFloor;
    calculatorState.selectedZoneIndex = previousSelectedZoneIndex;
    calculatorState.recommendationWeaponFilterMode = previousFilterMode;
    calculatorState.recommendationWeaponFilterTypes = previousFilterTypes;
    calculatorState.recommendationWeaponFilterSubs = previousFilterSubs;
    calculatorState.recommendationWeaponFilterGroups = previousFilterGroups;
    weaponsState.groups = previousGroups;
  }
});

test('renderRecommendationPanel filters related routes when overall recommendations whitelist a subtype', () => {
  const previousRangeFloor = calculatorState.recommendationRangeMeters;
  const previousGroups = weaponsState.groups;
  const previousSelectedZoneIndex = calculatorState.selectedZoneIndex;
  const previousFilterMode = calculatorState.recommendationWeaponFilterMode;
  const previousFilterTypes = [...calculatorState.recommendationWeaponFilterTypes];
  const previousFilterSubs = [...calculatorState.recommendationWeaponFilterSubs];
  const previousFilterGroups = [...calculatorState.recommendationWeaponFilterGroups];

  try {
    calculatorState.recommendationRangeMeters = 0;
    calculatorState.selectedZoneIndex = 1;
    calculatorState.recommendationWeaponFilterMode = 'include';
    calculatorState.recommendationWeaponFilterTypes = [];
    calculatorState.recommendationWeaponFilterSubs = ['ar'];
    calculatorState.recommendationWeaponFilterGroups = [];
    weaponsState.groups = [
      makeWeapon('Liberator', {
        index: 0,
        type: 'Primary',
        sub: 'AR',
        rpm: 60,
        rows: [makeAttackRow('Liberator Burst', 120, 2)]
      }),
      makeWeapon('Recoilless Rifle', {
        index: 1,
        type: 'Support',
        sub: 'RL',
        rpm: 60,
        rows: [makeAttackRow('Recoilless Shell', 300, 5)]
      })
    ];

    const container = renderPanelForTest({
      name: 'Scoped Filter Dummy',
      health: 600,
      zoneRelationGroups: [
        {
          id: 'left-arm',
          label: 'Left arm',
          zoneNames: ['shoulderplate_left', 'left_arm'],
          mirrorGroupIds: ['right-arm'],
          priorityTargetZoneNames: ['left_arm']
        },
        {
          id: 'right-arm',
          label: 'Right arm',
          zoneNames: ['shoulderplate_right', 'right_arm'],
          mirrorGroupIds: ['left-arm'],
          priorityTargetZoneNames: ['right_arm']
        }
      ],
      zones: [
        makeZone('head', { health: 220, isFatal: true, av: 1, toMainPercent: 1 }),
        makeZone('shoulderplate_left', { health: 120, av: 1, toMainPercent: 0 }),
        makeZone('left_arm', { health: 100, av: 1, toMainPercent: 0.5 }),
        makeZone('right_arm', { health: 100, av: 1, toMainPercent: 0.5 })
      ]
    });

    const tables = collectElements(container, (element) => element.tagName === 'TABLE');
    const targetedRows = collectElements(tables[0], (element) => element.tagName === 'TR').slice(1);
    const relatedRows = collectElements(tables[1], (element) => element.tagName === 'TR').slice(1);
    const overallRows = collectElements(tables[2], (element) => element.tagName === 'TR').slice(1);
    const targetedWeaponNames = targetedRows.map((row) => row.children[0]?.textContent || '');
    const relatedWeaponNames = relatedRows.map((row) => row.children[0]?.textContent || '');
    const overallWeaponNames = overallRows.map((row) => row.children[0]?.textContent || '');

    assert.deepEqual(targetedWeaponNames, ['Liberator']);
    assert.deepEqual(relatedWeaponNames, ['Liberator']);
    assert.deepEqual(overallWeaponNames, ['Liberator']);
  } finally {
    calculatorState.recommendationRangeMeters = previousRangeFloor;
    calculatorState.selectedZoneIndex = previousSelectedZoneIndex;
    calculatorState.recommendationWeaponFilterMode = previousFilterMode;
    calculatorState.recommendationWeaponFilterTypes = previousFilterTypes;
    calculatorState.recommendationWeaponFilterSubs = previousFilterSubs;
    calculatorState.recommendationWeaponFilterGroups = previousFilterGroups;
    weaponsState.groups = previousGroups;
  }
});

test('renderRecommendationPanel filters overall recommendations by feature group', () => {
  const previousRangeFloor = calculatorState.recommendationRangeMeters;
  const previousGroups = weaponsState.groups;
  const previousSelectedZoneIndex = calculatorState.selectedZoneIndex;
  const previousFilterMode = calculatorState.recommendationWeaponFilterMode;
  const previousFilterTypes = [...calculatorState.recommendationWeaponFilterTypes];
  const previousFilterGroups = [...calculatorState.recommendationWeaponFilterGroups];
  const previousFilterRoles = [...calculatorState.recommendationWeaponFilterRoles];

  try {
    calculatorState.recommendationRangeMeters = 0;
    calculatorState.selectedZoneIndex = null;
    calculatorState.recommendationWeaponFilterMode = 'include';
    calculatorState.recommendationWeaponFilterTypes = [];
    calculatorState.recommendationWeaponFilterGroups = ['ordnance'];
    calculatorState.recommendationWeaponFilterRoles = ['ordnance'];
    weaponsState.groups = [
      makeWeapon('Liberator', {
        index: 0,
        type: 'Primary',
        sub: 'AR',
        rpm: 60,
        rows: [makeAttackRow('Liberator Burst', 105, 2)]
      }),
      makeWeapon('Recoilless Rifle', {
        index: 1,
        type: 'Support',
        sub: 'RL',
        rpm: 60,
        rows: [makeAttackRow('Recoilless Shell', 300, 5)]
      }),
      makeWeapon('Orbital Precision Strike', {
        index: 2,
        type: 'Stratagem',
        sub: 'ORB',
        rpm: 60,
        rows: [makeAttackRow('Orbital Strike', 500, 6)]
      })
    ];

    const container = renderPanelForTest({
      name: 'Feature Filter Dummy',
      health: 500,
      zones: [
        makeZone('head', { health: 100, isFatal: true, av: 1, toMainPercent: 1 })
      ]
    });

    const summary = collectElements(container, (element) => element.classList.contains('calc-recommend-summary'))[0];
    const tables = collectElements(container, (element) => element.tagName === 'TABLE');
    const overallRows = collectElements(tables[0], (element) => element.tagName === 'TR').slice(1);
    const weaponNames = overallRows.map((row) => row.children[0]?.textContent || '');

    assert.deepEqual([...weaponNames].sort(), ['Orbital Precision Strike', 'Recoilless Rifle'].sort());
    assert.equal(weaponNames.includes('Liberator'), false);
    assert.match(summary?.textContent || '', /feature: ordnance/i);
  } finally {
    calculatorState.recommendationRangeMeters = previousRangeFloor;
    calculatorState.selectedZoneIndex = previousSelectedZoneIndex;
    calculatorState.recommendationWeaponFilterMode = previousFilterMode;
    calculatorState.recommendationWeaponFilterTypes = previousFilterTypes;
    calculatorState.recommendationWeaponFilterGroups = previousFilterGroups;
    calculatorState.recommendationWeaponFilterRoles = previousFilterRoles;
    weaponsState.groups = previousGroups;
  }
});

test('renderRecommendationPanel Automatic role filter includes machine gun sentries and Sickles', () => {
  const previousRangeFloor = calculatorState.recommendationRangeMeters;
  const previousGroups = weaponsState.groups;
  const previousSelectedZoneIndex = calculatorState.selectedZoneIndex;
  const previousFilterMode = calculatorState.recommendationWeaponFilterMode;
  const previousFilterTypes = [...calculatorState.recommendationWeaponFilterTypes];
  const previousFilterRoles = [...calculatorState.recommendationWeaponFilterRoles];

  try {
    calculatorState.recommendationRangeMeters = 0;
    calculatorState.selectedZoneIndex = null;
    calculatorState.recommendationWeaponFilterMode = 'include';
    calculatorState.recommendationWeaponFilterTypes = [];
    calculatorState.recommendationWeaponFilterRoles = ['automatic'];
    weaponsState.groups = [
      makeWeapon('Liberator', {
        index: 0,
        type: 'Primary',
        sub: 'AR',
        rpm: 60,
        rows: [makeAttackRow('Liberator Burst', 105, 2)]
      }),
      makeWeapon('Stalwart', {
        index: 1,
        type: 'Support',
        sub: 'MG',
        rpm: 60,
        rows: [makeAttackRow('Stalwart Burst', 80, 2)]
      }),
      makeWeapon('Sickle', {
        index: 2,
        type: 'Primary',
        role: 'automatic',
        sub: 'NRG',
        rpm: 60,
        rows: [makeAttackRow('Sickle Beam', 60, 2)]
      }),
      makeWeapon('Machine Gun Sentry', {
        index: 3,
        type: 'Stratagem',
        role: 'automatic',
        sub: 'EMP',
        rpm: 60,
        rows: [makeAttackRow('Machine Gun Sentry Burst', 120, 2)]
      }),
      makeWeapon('Orbital Precision Strike', {
        index: 4,
        type: 'Stratagem',
        sub: 'ORB',
        rpm: 60,
        rows: [makeAttackRow('Orbital Strike', 500, 6)]
      })
    ];

    const container = renderPanelForTest({
      name: 'Auto Filter Dummy',
      health: 500,
      zones: [
        makeZone('head', { health: 100, isFatal: true, av: 1, toMainPercent: 1 })
      ]
    });

    const summary = collectElements(container, (element) => element.classList.contains('calc-recommend-summary'))[0];
    const tables = collectElements(container, (element) => element.tagName === 'TABLE');
    const overallRows = collectElements(tables[0], (element) => element.tagName === 'TR').slice(1);
    const weaponNames = overallRows.map((row) => row.children[0]?.textContent || '');

    assert.deepEqual([...weaponNames].sort(), ['Liberator', 'Machine Gun Sentry', 'Sickle', 'Stalwart'].sort());
    assert.equal(weaponNames.includes('Orbital Precision Strike'), false);
    assert.match(summary?.textContent || '', /weapon filters: showing only matches for role: automatic/i);
  } finally {
    calculatorState.recommendationRangeMeters = previousRangeFloor;
    calculatorState.selectedZoneIndex = previousSelectedZoneIndex;
    calculatorState.recommendationWeaponFilterMode = previousFilterMode;
    calculatorState.recommendationWeaponFilterTypes = previousFilterTypes;
    calculatorState.recommendationWeaponFilterRoles = previousFilterRoles;
    weaponsState.groups = previousGroups;
  }
});

test('renderRecommendationPanel Precision role filter includes DMR and PDW weapons', () => {
  const previousRangeFloor = calculatorState.recommendationRangeMeters;
  const previousGroups = weaponsState.groups;
  const previousSelectedZoneIndex = calculatorState.selectedZoneIndex;
  const previousFilterMode = calculatorState.recommendationWeaponFilterMode;
  const previousFilterTypes = [...calculatorState.recommendationWeaponFilterTypes];
  const previousFilterRoles = [...calculatorState.recommendationWeaponFilterRoles];

  try {
    calculatorState.recommendationRangeMeters = 0;
    calculatorState.selectedZoneIndex = null;
    calculatorState.recommendationWeaponFilterMode = 'include';
    calculatorState.recommendationWeaponFilterTypes = [];
    calculatorState.recommendationWeaponFilterRoles = ['precision'];
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
        rows: [makeAttackRow('Diligence Shot', 125, 3)]
      }),
      makeWeapon('Senator', {
        index: 2,
        type: 'Secondary',
        sub: 'PDW',
        rpm: 60,
        rows: [makeAttackRow('Senator Shot', 175, 3)]
      }),
      makeWeapon('Recoilless Rifle', {
        index: 3,
        type: 'Support',
        sub: 'RL',
        rpm: 60,
        rows: [makeAttackRow('Recoilless Shell', 300, 5)]
      })
    ];

    const container = renderPanelForTest({
      name: 'Precision Filter Dummy',
      health: 500,
      zones: [
        makeZone('head', { health: 100, isFatal: true, av: 1, toMainPercent: 1 })
      ]
    });

    const summary = collectElements(container, (element) => element.classList.contains('calc-recommend-summary'))[0];
    const tables = collectElements(container, (element) => element.tagName === 'TABLE');
    const overallRows = collectElements(tables[0], (element) => element.tagName === 'TR').slice(1);
    const weaponNames = overallRows.map((row) => row.children[0]?.textContent || '');

    assert.deepEqual([...weaponNames].sort(), ['Diligence', 'Senator'].sort());
    assert.equal(weaponNames.includes('Liberator'), false);
    assert.equal(weaponNames.includes('Recoilless Rifle'), false);
    assert.match(summary?.textContent || '', /weapon filters: showing only matches for role: precision/i);
  } finally {
    calculatorState.recommendationRangeMeters = previousRangeFloor;
    calculatorState.selectedZoneIndex = previousSelectedZoneIndex;
    calculatorState.recommendationWeaponFilterMode = previousFilterMode;
    calculatorState.recommendationWeaponFilterTypes = previousFilterTypes;
    calculatorState.recommendationWeaponFilterRoles = previousFilterRoles;
    weaponsState.groups = previousGroups;
  }
});

test('renderRecommendationPanel role filter exclude mode hides matching role weapons', () => {
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
    calculatorState.recommendationWeaponFilterRoles = ['explosive', 'ordnance'];
    weaponsState.groups = [
      makeWeapon('Liberator', {
        index: 0,
        type: 'Primary',
        sub: 'AR',
        rpm: 60,
        rows: [makeAttackRow('Liberator Burst', 105, 2)]
      }),
      makeWeapon('Punisher Plasma', {
        index: 1,
        type: 'Primary',
        role: 'explosive',
        sub: 'EXP',
        rpm: 60,
        rows: [makeAttackRow('Large Plasma Bolt', 225, 3)]
      }),
      makeWeapon('Recoilless Rifle', {
        index: 2,
        type: 'Support',
        sub: 'RL',
        rpm: 60,
        rows: [makeAttackRow('Recoilless Shell', 300, 5)]
      })
    ];

    const container = renderPanelForTest({
      name: 'Exclude Role Dummy',
      health: 500,
      zones: [
        makeZone('head', { health: 100, isFatal: true, av: 1, toMainPercent: 1 })
      ]
    });

    const summary = collectElements(container, (element) => element.classList.contains('calc-recommend-summary'))[0];
    const tables = collectElements(container, (element) => element.tagName === 'TABLE');
    const overallRows = collectElements(tables[0], (element) => element.tagName === 'TR').slice(1);
    const weaponNames = overallRows.map((row) => row.children[0]?.textContent || '');

    assert.deepEqual(weaponNames, ['Liberator']);
    assert.match(summary?.textContent || '', /weapon filters: hiding matches for role: explosive or ordnance/i);
  } finally {
    calculatorState.recommendationRangeMeters = previousRangeFloor;
    calculatorState.selectedZoneIndex = previousSelectedZoneIndex;
    calculatorState.recommendationWeaponFilterMode = previousFilterMode;
    calculatorState.recommendationWeaponFilterTypes = previousFilterTypes;
    calculatorState.recommendationWeaponFilterRoles = previousFilterRoles;
    weaponsState.groups = previousGroups;
  }
});

test('renderRecommendationPanel combines include filters across categories with AND semantics', () => {
  const previousRangeFloor = calculatorState.recommendationRangeMeters;
  const previousGroups = weaponsState.groups;
  const previousSelectedZoneIndex = calculatorState.selectedZoneIndex;
  const previousFilterMode = calculatorState.recommendationWeaponFilterMode;
  const previousFilterTypes = [...calculatorState.recommendationWeaponFilterTypes];
  const previousFilterRoles = [...calculatorState.recommendationWeaponFilterRoles];

  try {
    calculatorState.recommendationRangeMeters = 0;
    calculatorState.selectedZoneIndex = null;
    calculatorState.recommendationWeaponFilterMode = 'include';
    calculatorState.recommendationWeaponFilterTypes = ['primary'];
    calculatorState.recommendationWeaponFilterRoles = ['automatic'];
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
        rows: [makeAttackRow('Diligence Shot', 125, 3)]
      }),
      makeWeapon('Stalwart', {
        index: 2,
        type: 'Support',
        sub: 'MG',
        rpm: 60,
        rows: [makeAttackRow('Stalwart Burst', 80, 2)]
      })
    ];

    const container = renderPanelForTest({
      name: 'Include And Filter Dummy',
      health: 500,
      zones: [
        makeZone('head', { health: 100, isFatal: true, av: 1, toMainPercent: 1 })
      ]
    });

    const summary = collectElements(container, (element) => element.classList.contains('calc-recommend-summary'))[0];
    const tables = collectElements(container, (element) => element.tagName === 'TABLE');
    const overallRows = collectElements(tables[0], (element) => element.tagName === 'TR').slice(1);
    const weaponNames = overallRows.map((row) => row.children[0]?.textContent || '');

    assert.deepEqual(weaponNames, ['Liberator']);
    assert.match(summary?.textContent || '', /weapon filters: showing only matches for type: primary and role: automatic/i);
  } finally {
    calculatorState.recommendationRangeMeters = previousRangeFloor;
    calculatorState.selectedZoneIndex = previousSelectedZoneIndex;
    calculatorState.recommendationWeaponFilterMode = previousFilterMode;
    calculatorState.recommendationWeaponFilterTypes = previousFilterTypes;
    calculatorState.recommendationWeaponFilterRoles = previousFilterRoles;
    weaponsState.groups = previousGroups;
  }
});

test('renderRecommendationPanel combines exclude filters across categories with AND semantics', () => {
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
    calculatorState.recommendationWeaponFilterTypes = ['primary'];
    calculatorState.recommendationWeaponFilterRoles = ['automatic'];
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
        rows: [makeAttackRow('Diligence Shot', 125, 3)]
      }),
      makeWeapon('Stalwart', {
        index: 2,
        type: 'Support',
        sub: 'MG',
        rpm: 60,
        rows: [makeAttackRow('Stalwart Burst', 80, 2)]
      })
    ];

    const container = renderPanelForTest({
      name: 'Exclude And Filter Dummy',
      health: 500,
      zones: [
        makeZone('head', { health: 100, isFatal: true, av: 1, toMainPercent: 1 })
      ]
    });

    const summary = collectElements(container, (element) => element.classList.contains('calc-recommend-summary'))[0];
    const tables = collectElements(container, (element) => element.tagName === 'TABLE');
    const overallRows = collectElements(tables[0], (element) => element.tagName === 'TR').slice(1);
    const weaponNames = overallRows.map((row) => row.children[0]?.textContent || '');

    assert.deepEqual([...weaponNames].sort(), ['Diligence', 'Stalwart'].sort());
    assert.match(summary?.textContent || '', /weapon filters: hiding matches for type: primary and role: automatic/i);
  } finally {
    calculatorState.recommendationRangeMeters = previousRangeFloor;
    calculatorState.selectedZoneIndex = previousSelectedZoneIndex;
    calculatorState.recommendationWeaponFilterMode = previousFilterMode;
    calculatorState.recommendationWeaponFilterTypes = previousFilterTypes;
    calculatorState.recommendationWeaponFilterRoles = previousFilterRoles;
    weaponsState.groups = previousGroups;
  }
});

test('renderRecommendationPanel filters overall recommendations by the selected shot range', () => {
  const previousRangeFloor = calculatorState.recommendationRangeMeters;
  const previousGroups = weaponsState.groups;
  const previousSelectedZoneIndex = calculatorState.selectedZoneIndex;
  const previousMinShots = calculatorState.recommendationMinShots;
  const previousMaxShots = calculatorState.recommendationMaxShots;

  try {
    calculatorState.recommendationRangeMeters = 0;
    calculatorState.selectedZoneIndex = null;
    calculatorState.recommendationMinShots = 2;
    calculatorState.recommendationMaxShots = 3;
    weaponsState.groups = [
      makeWeapon('One-Shot', {
        index: 0,
        rows: [makeAttackRow('One-Shot', 240, 2)]
      }),
      makeWeapon('Two-Shot', {
        index: 1,
        rows: [makeAttackRow('Two-Shot', 120, 2)]
      }),
      makeWeapon('Three-Shot', {
        index: 2,
        rows: [makeAttackRow('Three-Shot', 90, 2)]
      })
    ];

    const container = renderPanelForTest({
      name: 'Shot Range Dummy',
      health: 240,
      zones: [
        makeZone('Main', { health: 240, av: 1, toMainPercent: 1 })
      ]
    });

    const tables = collectElements(container, (element) => element.tagName === 'TABLE');
    const overallRows = collectElements(tables[0], (element) => element.tagName === 'TR').slice(1);
    const weaponNames = overallRows.map((row) => row.children[0]?.textContent || '');

    assert.deepEqual(weaponNames, ['Two-Shot', 'Three-Shot']);
  } finally {
    calculatorState.recommendationRangeMeters = previousRangeFloor;
    calculatorState.selectedZoneIndex = previousSelectedZoneIndex;
    calculatorState.recommendationMinShots = previousMinShots;
    calculatorState.recommendationMaxShots = previousMaxShots;
    weaponsState.groups = previousGroups;
  }
});
