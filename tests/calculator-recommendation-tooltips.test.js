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
const { state: weaponsState } = await import('../weapons/data.js');

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
}

function collectElements(root, predicate, results = []) {
  if (predicate(root)) {
    results.push(root);
  }

  (root.children || []).forEach((child) => collectElements(child, predicate, results));
  return results;
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

function makeWeapon(name, {
  code = '',
  index = 0,
  rpm = 60,
  sub = 'AR',
  type = 'Primary',
  rows = []
} = {}) {
  return {
    name,
    code,
    index,
    rpm,
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
      headers.find((element) => element.textContent === 'Low')?.title,
      'Low-overkill kill or critical highlight with 25% or less extra damage.'
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
    assert.equal(flags[0].title, 'Meets the low-overkill one-shot highlight with 25% or less extra damage.');
    assert.match(summary.title, /Rows without those highlights are hidden from this table/i);
  } finally {
    calculatorState.recommendationRangeMeters = previousRangeFloor;
    weaponsState.groups = previousGroups;
  }
});

test('renderRecommendationPanel explains fallback rows and unknown range rows when nothing is highlighted', () => {
  const previousRangeFloor = calculatorState.recommendationRangeMeters;
  const previousGroups = weaponsState.groups;

  try {
    calculatorState.recommendationRangeMeters = 30;
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
    assert.equal(flags[0].title, 'Does not currently meet the low-overkill one-shot highlight.');
    assert.match(cells[10].title, /fallback because nothing met the current highlight checks/i);
  } finally {
    calculatorState.recommendationRangeMeters = previousRangeFloor;
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

    assert.equal(sectionTitles[0]?.textContent, 'shoulderplate_left targeted recommendations');
    assert.equal(sectionTitles[1]?.textContent, 'shoulderplate_left related routes');
    assert.equal(sectionTitles[2]?.textContent, 'Overall recommendations');
    assert.match(summaries[1]?.textContent || '', /Linked priority targets/i);
    assert.match(summaries[1]?.textContent || '', /left_arm/i);
    assert.match(relatedTargetCells[2].title, /Best-ranked target: left_arm/i);
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
