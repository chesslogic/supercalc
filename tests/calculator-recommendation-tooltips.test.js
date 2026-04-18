import test from 'node:test';
import assert from 'node:assert/strict';

if (!globalThis.localStorage) {
  globalThis.localStorage = {
    getItem() {
      return null;
    },
    setItem() {},
    removeItem() {}
  };
}

const { calculatorState } = await import('../calculator/data.js');
const { renderRecommendationPanel } = await import('../calculator/calculation.js');
const { buildWeaponRecommendationRows } = await import('../calculator/recommendations.js');
const { state: weaponsState } = await import('../weapons/data.js');
const {
  getRecommendationMarginLabel,
  getRecommendationMarginTitle
} = await import('../calculator/calculation/recommendation-titles.js');

class TestClassList {
  constructor(element) {
    this.element = element;
    this.tokens = new Set();
  }

  syncFromString(value) {
    this.tokens = new Set(String(value || '').split(/\s+/).filter(Boolean));
  }

  syncElement() {
    this.element._className = [...this.tokens].join(' ');
  }

  add(...tokens) {
    tokens
      .flatMap((token) => String(token || '').split(/\s+/))
      .filter(Boolean)
      .forEach((token) => this.tokens.add(token));
    this.syncElement();
  }

  remove(...tokens) {
    tokens
      .flatMap((token) => String(token || '').split(/\s+/))
      .filter(Boolean)
      .forEach((token) => this.tokens.delete(token));
    this.syncElement();
  }

  contains(token) {
    return this.tokens.has(token);
  }
}

class TestElement {
  constructor(tagName) {
    this.tagName = String(tagName || '').toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.textContent = '';
    this.title = '';
    this.id = '';
    this.type = '';
    this.min = '';
    this.max = '';
    this.step = '';
    this.value = '';
    this.htmlFor = '';
    this.dataset = {};
    this.listeners = new Map();
    this._className = '';
    this.classList = new TestClassList(this);
  }

  get className() {
    return this._className;
  }

  set className(value) {
    this._className = String(value || '');
    this.classList.syncFromString(this._className);
  }

  appendChild(child) {
    if (!child) {
      return child;
    }

    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  addEventListener(type, handler) {
    this.listeners.set(type, handler);
  }

  get childElementCount() {
    return this.children.length;
  }
}

class TestDocument {
  createElement(tagName) {
    return new TestElement(tagName);
  }

  getElementById() {
    return null;
  }
}

function collectElements(root, predicate, results = []) {
  if (predicate(root)) {
    results.push(root);
  }

  (root.children || []).forEach((child) => collectElements(child, predicate, results));
  return results;
}

function getChipRowByLabel(container, label) {
  return collectElements(container, (element) => (
    element.classList.contains('chiprow')
    && element.children[0]?.textContent === label
  ))[0] || null;
}

function getRecommendationSection(container, titleText) {
  return collectElements(container, (element) => (
    element.classList.contains('calc-recommend-section')
    && element.children[0]?.textContent === titleText
  ))[0] || null;
}

function makeAttackRow(name, damage, ap = 2) {
  return {
    'Atk Type': 'Projectile',
    'Atk Name': name,
    DMG: damage,
    DUR: 0,
    AP: ap,
    DF: 10,
    ST: 10,
    PF: 10
  };
}

function makeExplosionAttackRow(name, damage, ap = 3) {
  return {
    ...makeAttackRow(name, damage, ap),
    'Atk Type': 'Explosion'
  };
}

function makeWeapon(name, {
  code = '',
  index = 0,
  rpm = 60,
  role = null,
  sub = 'AR',
  type = 'Primary',
  rows = []
} = {}) {
  return {
    name,
    code,
    index,
    rpm,
    role,
    type,
    sub,
    rows
  };
}

function makeZone(zoneName, {
  health = 100,
  isFatal = false,
  av = 1,
  toMainPercent = 0
} = {}) {
  return {
    zone_name: zoneName,
    health,
    Con: 0,
    AV: av,
    'Dur%': 0,
    'ToMain%': toMainPercent,
    ExTarget: 'Part',
    ExMult: 1,
    IsFatal: isFatal
  };
}

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
    calculatorState.recommendationWeaponFilterSubs = ['rl'];
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
    assert.match(summary?.textContent || '', /weapon filters: hiding support, stratagem, rl/i);
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
    assert.match(summaries[0]?.textContent || '', /weapon filters: showing only ar/i);
    assert.match(summaries[1]?.textContent || '', /weapon filters: showing only ar/i);
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

    assert.ok(getChipRowByLabel(targetedSection, 'Weapon filters'));
    assert.match(targetedSummary?.textContent || '', /No dedicated target rows match the current weapon filters/i);
    assert.match(targetedSummary?.textContent || '', /showing only rl/i);
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
    assert.match(summary?.textContent || '', /weapon filters: showing only automatic/i);
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
    assert.match(summary?.textContent || '', /weapon filters: showing only precision/i);
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
    assert.match(summary?.textContent || '', /weapon filters: hiding explosive, ordnance/i);
  } finally {
    calculatorState.recommendationRangeMeters = previousRangeFloor;
    calculatorState.selectedZoneIndex = previousSelectedZoneIndex;
    calculatorState.recommendationWeaponFilterMode = previousFilterMode;
    calculatorState.recommendationWeaponFilterTypes = previousFilterTypes;
    calculatorState.recommendationWeaponFilterRoles = previousFilterRoles;
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
