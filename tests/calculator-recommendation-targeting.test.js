// Targeting tests: verifies selected-zone subsections, staged recommendation
// paths, zone-relation groups, related routes, and chip-based zone switching.

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

test('renderRecommendationPanel shows staged recommendation paths in target and tip titles', () => {
  const previousRangeFloor = calculatorState.recommendationRangeMeters;
  const previousGroups = weaponsState.groups;
  const previousSelectedZoneIndex = calculatorState.selectedZoneIndex;

  try {
    calculatorState.recommendationRangeMeters = 0;
    calculatorState.selectedZoneIndex = 1;
    weaponsState.groups = [
      makeWeapon('Sequencer', {
        rpm: 60,
        rows: [makeAttackRow('Sequencer', 350, 2)]
      })
    ];

    const container = renderPanelForTest({
      name: 'Veracitor',
      health: 3000,
      recommendationSequences: [
        {
          targetZoneName: 'pilot',
          label: 'pilot (via head)',
          suppressDirectTarget: true,
          steps: [{ zoneName: 'head' }, { zoneName: 'pilot' }]
        }
      ],
      zones: [
        makeZone('head', { health: 300, av: 1, toMainPercent: 0 }),
        makeZone('pilot', { health: 700, isFatal: true, av: 1, toMainPercent: 0 })
      ]
    });

    const cells = collectElements(container, (element) => element.tagName === 'TD');

    assert.match(cells[2].title, /Best-ranked target: pilot \(via head\)/i);
    assert.match(cells[2].title, /Path: head -> pilot/i);
    assert.match(cells[10].title, /Staged path: head -> pilot/i);
  } finally {
    calculatorState.recommendationRangeMeters = previousRangeFloor;
    calculatorState.selectedZoneIndex = previousSelectedZoneIndex;
    weaponsState.groups = previousGroups;
  }
});

test('renderRecommendationPanel renders a selected-target subsection for direct part removal', () => {
  const previousRangeFloor = calculatorState.recommendationRangeMeters;
  const previousGroups = weaponsState.groups;
  const previousSelectedZoneIndex = calculatorState.selectedZoneIndex;

  try {
    calculatorState.recommendationRangeMeters = 0;
    calculatorState.selectedZoneIndex = 1;
    weaponsState.groups = [
      makeWeapon('Cleaner', {
        rpm: 60,
        rows: [makeAttackRow('Cleaner', 100, 2)]
      })
    ];

    const container = renderPanelForTest({
      name: 'Heavy Devastator',
      health: 600,
      zones: [
        makeZone('head', { health: 220, isFatal: true, av: 1, toMainPercent: 1 }),
        makeZone('right_arm', { health: 100, av: 1, toMainPercent: 0.5 })
      ]
    });

    const sectionTitles = collectElements(container, (element) => element.classList.contains('calc-recommend-section-title'));
    const summaries = collectElements(container, (element) => element.classList.contains('calc-recommend-summary'));
    const cells = collectElements(container, (element) => element.tagName === 'TD');

    assert.equal(sectionTitles[0]?.textContent, 'right_arm targeted recommendations');
    assert.equal(sectionTitles[1]?.textContent, 'Overall recommendations');
    assert.match(summaries[0]?.textContent || '', /selected target/i);
    assert.match(cells[2].title, /Best-ranked target: right_arm/i);
  } finally {
    calculatorState.recommendationRangeMeters = previousRangeFloor;
    calculatorState.selectedZoneIndex = previousSelectedZoneIndex;
    weaponsState.groups = previousGroups;
  }
});

test('renderRecommendationPanel adds related routes for linked priority targets behind a selected outer part', () => {
  const previousRangeFloor = calculatorState.recommendationRangeMeters;
  const previousGroups = weaponsState.groups;
  const previousSelectedZoneIndex = calculatorState.selectedZoneIndex;

  try {
    calculatorState.recommendationRangeMeters = 0;
    calculatorState.selectedZoneIndex = 1;
    weaponsState.groups = [
      makeWeapon('Cleaner', {
        rpm: 60,
        rows: [makeAttackRow('Cleaner', 100, 4)]
      })
    ];

    const container = renderPanelForTest({
      name: 'Heavy Devastator',
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
        makeZone('shoulderplate_left', { health: 150, av: 4, toMainPercent: 0 }),
        makeZone('left_arm', { health: 100, av: 1, toMainPercent: 0.5 }),
        makeZone('right_arm', { health: 100, av: 1, toMainPercent: 0.5 })
      ]
    });

    const sectionTitles = collectElements(container, (element) => element.classList.contains('calc-recommend-section-title'));
    const summaries = collectElements(container, (element) => element.classList.contains('calc-recommend-summary'));
    const tables = collectElements(container, (element) => element.tagName === 'TABLE');
    const relatedTargetCells = collectElements(tables[1], (element) => element.tagName === 'TD');
    const chipRows = collectElements(container, (element) => element.classList.contains('calc-related-target-chips'));
    const chipButtons = chipRows[0]
      ? collectElements(chipRows[0], (element) => element.tagName === 'BUTTON')
      : [];

    assert.equal(sectionTitles[0]?.textContent, 'shoulderplate_left targeted recommendations');
    assert.equal(sectionTitles[1]?.textContent, 'shoulderplate_left related routes');
    assert.equal(sectionTitles[2]?.textContent, 'Overall recommendations');
    assert.match(summaries[1]?.textContent || '', /Linked priority targets/i);
    assert.match(summaries[1]?.textContent || '', /left_arm/i);
    assert.match(relatedTargetCells[2].title, /Best-ranked target: left_arm/i);
    assert.equal(chipRows.length, 1);
    assert.equal(chipButtons.map((button) => button.textContent).join(','), 'left_arm');
  } finally {
    calculatorState.recommendationRangeMeters = previousRangeFloor;
    calculatorState.selectedZoneIndex = previousSelectedZoneIndex;
    weaponsState.groups = previousGroups;
  }
});

test('renderRecommendationPanel related target chips can switch the selected zone', () => {
  const previousRangeFloor = calculatorState.recommendationRangeMeters;
  const previousGroups = weaponsState.groups;
  const previousSelectedZoneIndex = calculatorState.selectedZoneIndex;

  try {
    calculatorState.recommendationRangeMeters = 0;
    calculatorState.selectedZoneIndex = 1;
    weaponsState.groups = [
      makeWeapon('Cleaner', {
        rpm: 60,
        rows: [makeAttackRow('Cleaner', 100, 4)]
      })
    ];

    const container = renderPanelForTest({
      name: 'Heavy Devastator',
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
        makeZone('shoulderplate_left', { health: 150, av: 4, toMainPercent: 0 }),
        makeZone('left_arm', { health: 100, av: 1, toMainPercent: 0.5 }),
        makeZone('right_arm', { health: 100, av: 1, toMainPercent: 0.5 })
      ]
    });

    const chipRows = collectElements(container, (element) => element.classList.contains('calc-related-target-chips'));
    const chipButtons = chipRows[0]
      ? collectElements(chipRows[0], (element) => element.tagName === 'BUTTON')
      : [];
    const leftArmChip = chipButtons.find((button) => button.textContent === 'left_arm');
    assert.ok(leftArmChip);
    assert.equal(typeof leftArmChip.listeners.get('click'), 'function');
    const previousDocument = globalThis.document;
    globalThis.document = {
      getElementById() {
        return null;
      }
    };
    try {
      leftArmChip.listeners.get('click')();
    } finally {
      globalThis.document = previousDocument;
    }

    assert.equal(calculatorState.selectedZoneIndex, 2);
  } finally {
    calculatorState.recommendationRangeMeters = previousRangeFloor;
    calculatorState.selectedZoneIndex = previousSelectedZoneIndex;
    weaponsState.groups = previousGroups;
  }
});

test('renderRecommendationPanel keeps related routes visible when the selected part is itself the linked priority target', () => {
  const previousRangeFloor = calculatorState.recommendationRangeMeters;
  const previousGroups = weaponsState.groups;
  const previousSelectedZoneIndex = calculatorState.selectedZoneIndex;

  try {
    calculatorState.recommendationRangeMeters = 0;
    calculatorState.selectedZoneIndex = 2;
    weaponsState.groups = [
      makeWeapon('Cleaner', {
        rpm: 60,
        rows: [makeAttackRow('Cleaner', 100, 4)]
      })
    ];

    const container = renderPanelForTest({
      name: 'Heavy Devastator',
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
        makeZone('shoulderplate_left', { health: 150, av: 4, toMainPercent: 0 }),
        makeZone('left_arm', { health: 100, av: 1, toMainPercent: 0.5 }),
        makeZone('right_arm', { health: 100, av: 1, toMainPercent: 0.5 })
      ]
    });

    const sectionTitles = collectElements(container, (element) => element.classList.contains('calc-recommend-section-title'));
    const summaries = collectElements(container, (element) => element.classList.contains('calc-recommend-summary'));
    const mutedMessages = collectElements(container, (element) => element.classList.contains('muted'));
    const tables = collectElements(container, (element) => element.tagName === 'TABLE');
    const chipRows = collectElements(container, (element) => element.classList.contains('calc-related-target-chips'));

    assert.equal(sectionTitles[0]?.textContent, 'left_arm targeted recommendations');
    assert.equal(sectionTitles[1]?.textContent, 'left_arm related routes');
    assert.equal(sectionTitles[2]?.textContent, 'Overall recommendations');
    assert.match(summaries[1]?.textContent || '', /left_arm is itself a linked priority target/i);
    assert.match(summaries[1]?.textContent || '', /shoulderplate_left/i);
    assert.match(mutedMessages.find((element) => /already a linked priority target/i.test(element.textContent))?.textContent || '', /exact target rows above/i);
    assert.equal(tables.length, 2);
    assert.equal(chipRows.length, 0);
  } finally {
    calculatorState.recommendationRangeMeters = previousRangeFloor;
    calculatorState.selectedZoneIndex = previousSelectedZoneIndex;
    weaponsState.groups = previousGroups;
  }
});

test('renderRecommendationPanel keeps overall recommendations enemy-wide when a target is selected', () => {
  const previousRangeFloor = calculatorState.recommendationRangeMeters;
  const previousGroups = weaponsState.groups;
  const previousSelectedZoneIndex = calculatorState.selectedZoneIndex;

  try {
    calculatorState.recommendationRangeMeters = 0;
    calculatorState.selectedZoneIndex = 1;
    weaponsState.groups = [
      makeWeapon('Generalist', {
        rpm: 60,
        rows: [makeAttackRow('Generalist', 220, 2)]
      })
    ];

    const container = renderPanelForTest({
      name: 'Heavy Devastator',
      health: 600,
      zones: [
        makeZone('head', { health: 220, isFatal: true, av: 1, toMainPercent: 1 }),
        makeZone('right_arm', { health: 100, av: 1, toMainPercent: 0.5 })
      ]
    });

    const sectionTitles = collectElements(container, (element) => element.classList.contains('calc-recommend-section-title'));
    const tables = collectElements(container, (element) => element.tagName === 'TABLE');
    const firstTargetCells = collectElements(tables[0], (element) => element.tagName === 'TD');
    const secondTargetCells = collectElements(tables[1], (element) => element.tagName === 'TD');

    assert.equal(sectionTitles[0]?.textContent, 'right_arm targeted recommendations');
    assert.equal(sectionTitles[1]?.textContent, 'Overall recommendations');
    assert.match(firstTargetCells[2].title, /Best-ranked target: right_arm/i);
    assert.match(secondTargetCells[2].title, /Best-ranked target: head/i);
  } finally {
    calculatorState.recommendationRangeMeters = previousRangeFloor;
    calculatorState.selectedZoneIndex = previousSelectedZoneIndex;
    weaponsState.groups = previousGroups;
  }
});
