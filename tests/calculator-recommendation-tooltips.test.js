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
      headers.find((element) => element.textContent === 'Margin')?.title,
      'Numeric one-shot kill or critical margin. Highlighted Margin rows stay at +25% or less extra damage at the current range floor.'
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
    assert.equal(flags[0].title, 'Margin is shown for one-shot kill or critical rows when displayed damage per cycle can be compared against the target health.');
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

    assert.equal(sectionTitles[0]?.textContent, 'left_arm targeted recommendations');
    assert.equal(sectionTitles[1]?.textContent, 'left_arm related routes');
    assert.equal(sectionTitles[2]?.textContent, 'Overall recommendations');
    assert.match(summaries[1]?.textContent || '', /left_arm is itself a linked priority target/i);
    assert.match(summaries[1]?.textContent || '', /shoulderplate_left/i);
    assert.match(mutedMessages.find((element) => /already a linked priority target/i.test(element.textContent))?.textContent || '', /exact target rows above/i);
    assert.equal(tables.length, 2);
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
