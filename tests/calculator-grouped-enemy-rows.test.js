// Tests for the grouped enemy rows renderer (calculator/rendering/grouped-enemy-rows.js).
// Covers: collapsed summary rows, expansion to member rows, representative member
// stability, zone-relation highlight compatibility, and edge-case singletons.
import test from 'node:test';
import assert from 'node:assert/strict';
import './env-stubs.js';
import { TestDocument, collectElements } from './dom-stubs.js';

import {
  renderGroupedEnemyRows,
  isGroupExpanded,
  setGroupExpanded,
  clearAllGroupExpansions,
  buildFamilyMainPathMetrics,
  isFamilyMainPathViableForSlot
} from '../calculator/rendering/grouped-enemy-rows.js';
import { calculatorState } from '../calculator/data.js';

// ─── Setup ────────────────────────────────────────────────────────────────────

// Install a minimal DOM stub before any test runs.
globalThis.document = new TestDocument();

// Reset expansion state between tests to keep them independent.
function resetState() {
  clearAllGroupExpansions();
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeZone(overrides = {}) {
  return {
    zone_name: 'Main',
    AV: 0,
    'Dur%': 0,
    health: 200,
    Con: 0,
    ExMult: null,
    ExTarget: 'Main',
    'ToMain%': 1,
    MainCap: 0,
    IsFatal: false,
    ...overrides
  };
}

function makeEnemy({ zones = [], zoneRelationGroups = [], name = 'TestEnemy' } = {}) {
  return { name, zones, zoneRelationGroups };
}

function makeDevastatorLikeArmGroupSetup() {
  const enemy = {
    name: 'Devastator',
    zones: [
      makeZone({
        zone_name: 'shoulderplate_left',
        AV: 2,
        health: 150,
        'ToMain%': 0.25,
        MainCap: true
      }),
      makeZone({
        zone_name: 'left_arm',
        AV: 1,
        health: 260,
        'ToMain%': 0.5,
        MainCap: false
      }),
      makeZone({
        zone_name: 'head',
        AV: 1,
        health: 110,
        IsFatal: true
      })
    ],
    zoneRelationGroups: [
      {
        id: 'left-arm',
        label: 'Left arm',
        zoneNames: ['shoulderplate_left', 'left_arm'],
        mirrorGroupIds: [],
        priorityTargetZoneNames: ['left_arm']
      }
    ]
  };

  return {
    enemy,
    sortedRows: enemy.zones.map((zone, zoneIndex) => makeRow(zone, zoneIndex))
  };
}

/** Minimal sortedRow shape that renderGroupedEnemyRows expects. */
function makeRow(zone, zoneIndex, overrides = {}) {
  return { zone, zoneIndex, metrics: null, groupStart: false, ...overrides };
}

/** Columns used in tests — just zone_name to keep assertions simple. */
const MINIMAL_COLUMNS = [{ key: 'zone_name', label: 'Zone' }];

/** Full columns list (includes a metric column to check those cells too). */
const FULL_COLUMNS = [
  { key: 'zone_name', label: 'Zone' },
  { key: 'AV', label: 'AV' },
  { key: 'IsFatal', label: 'IsLethal' }
];

const COMPARE_METRIC_COLUMNS = [
  { key: 'zone_name', label: 'Zone' },
  { key: 'shotsA', label: 'A Shots' },
  { key: 'shotsB', label: 'B Shots' },
  { key: 'shotsDiff', label: 'Diff Shots' }
];

function renderIntoTbody(sortedRows, enemy, opts = {}) {
  const tbody = globalThis.document.createElement('tbody');
  const rowEntries = renderGroupedEnemyRows(tbody, sortedRows, enemy, {
    columns: MINIMAL_COLUMNS,
    hasProjectileTargets: false,
    hasExplosiveTargets: false,
    ...opts
  });
  return { tbody, rowEntries };
}

function getDirectChildren(element) {
  return element.children || [];
}

// ─── Expand/collapse state helpers ───────────────────────────────────────────

test('isGroupExpanded returns false by default', () => {
  resetState();
  assert.equal(isGroupExpanded('any-id'), false);
});

test('setGroupExpanded toggles expansion', () => {
  resetState();
  setGroupExpanded('fam-1', true);
  assert.equal(isGroupExpanded('fam-1'), true);
  setGroupExpanded('fam-1', false);
  assert.equal(isGroupExpanded('fam-1'), false);
});

test('clearAllGroupExpansions clears all tracked expansions', () => {
  setGroupExpanded('fam-1', true);
  setGroupExpanded('fam-2', true);
  clearAllGroupExpansions();
  assert.equal(isGroupExpanded('fam-1'), false);
  assert.equal(isGroupExpanded('fam-2'), false);
});

// ─── Singleton / plain rows ───────────────────────────────────────────────────

test('singleton zones render as plain rows (no zone-group-summary class)', () => {
  resetState();
  const zoneA = makeZone({ zone_name: 'Head', health: 150, IsFatal: true });
  const zoneB = makeZone({ zone_name: 'Torso', health: 600, AV: 2 });
  const enemy = makeEnemy({ zones: [zoneA, zoneB] });
  const sortedRows = [makeRow(zoneA, 0), makeRow(zoneB, 1)];

  const { tbody, rowEntries } = renderIntoTbody(sortedRows, enemy);

  assert.equal(getDirectChildren(tbody).length, 2);
  for (const { tr } of rowEntries) {
    assert.equal(tr.classList.contains('zone-group-summary'), false);
    assert.equal(tr.classList.contains('zone-group-member'), false);
  }
});

test('singleton rows produce one rowEntry per zone', () => {
  resetState();
  const zones = [
    makeZone({ zone_name: 'Head', health: 150 }),
    makeZone({ zone_name: 'Torso', health: 600, AV: 2 })
  ];
  const enemy = makeEnemy({ zones });
  const sortedRows = zones.map((z, i) => makeRow(z, i));

  const { rowEntries } = renderIntoTbody(sortedRows, enemy);

  assert.equal(rowEntries.length, 2);
  assert.equal(rowEntries[0].zoneIndex, 0);
  assert.equal(rowEntries[1].zoneIndex, 1);
});

// ─── Grouped summary rows (collapsed by default) ──────────────────────────────

test('grouped zones render summary + member rows (total = 1 + N)', () => {
  resetState();
  const zoneL = makeZone({ zone_name: 'left_pauldron', AV: 2, health: 200 });
  const zoneR = makeZone({ zone_name: 'right_pauldron', AV: 2, health: 200 });
  const enemy = makeEnemy({ zones: [zoneL, zoneR] });
  const sortedRows = [makeRow(zoneL, 0), makeRow(zoneR, 1)];

  const { tbody } = renderIntoTbody(sortedRows, enemy);

  // 1 summary + 2 member rows = 3 total
  assert.equal(getDirectChildren(tbody).length, 3);
});

test('summary row has zone-group-summary class', () => {
  resetState();
  const zoneL = makeZone({ zone_name: 'left_pauldron', AV: 2, health: 200 });
  const zoneR = makeZone({ zone_name: 'right_pauldron', AV: 2, health: 200 });
  const enemy = makeEnemy({ zones: [zoneL, zoneR] });
  const sortedRows = [makeRow(zoneL, 0), makeRow(zoneR, 1)];

  const { tbody } = renderIntoTbody(sortedRows, enemy);

  const firstRow = getDirectChildren(tbody)[0];
  assert.ok(firstRow.classList.contains('zone-group-summary'));
});

test('summary row has data-family-id attribute', () => {
  resetState();
  const zoneL = makeZone({ zone_name: 'left_pauldron', AV: 2, health: 200 });
  const zoneR = makeZone({ zone_name: 'right_pauldron', AV: 2, health: 200 });
  const enemy = makeEnemy({ zones: [zoneL, zoneR] });
  const sortedRows = [makeRow(zoneL, 0), makeRow(zoneR, 1)];

  const { tbody } = renderIntoTbody(sortedRows, enemy);

  const summaryRow = getDirectChildren(tbody)[0];
  assert.ok(summaryRow.dataset.familyId, 'summary row must have data-family-id');
});

test('exact-stat summary row is collapsed by default (data-group-collapsed="true")', () => {
  resetState();
  const zoneL = makeZone({ zone_name: 'left_arm', AV: 1, health: 300 });
  const zoneR = makeZone({ zone_name: 'right_arm', AV: 1, health: 300 });
  const enemy = makeEnemy({ zones: [zoneL, zoneR] });
  const sortedRows = [makeRow(zoneL, 0), makeRow(zoneR, 1)];

  const { tbody } = renderIntoTbody(sortedRows, enemy);

  const summaryRow = getDirectChildren(tbody)[0];
  assert.equal(summaryRow.dataset.groupCollapsed, 'true');
});

test('summary row zone_name cell shows summaryLabel', () => {
  resetState();
  const zoneL = makeZone({ zone_name: 'left_pauldron', AV: 2, health: 200 });
  const zoneR = makeZone({ zone_name: 'right_pauldron', AV: 2, health: 200 });
  const enemy = makeEnemy({ zones: [zoneL, zoneR] });
  const sortedRows = [makeRow(zoneL, 0), makeRow(zoneR, 1)];

  const { tbody } = renderIntoTbody(sortedRows, enemy);

  const summaryRow = getDirectChildren(tbody)[0];
  // The zone_name td is the first cell (no target columns in this test).
  const nameCell = getDirectChildren(summaryRow)[0];
  assert.ok(
    nameCell.textContent.includes('pauldron'),
    `Expected summaryLabel to include "pauldron", got: "${nameCell.textContent}"`
  );
  assert.ok(
    nameCell.textContent.includes('×2'),
    `Expected summaryLabel to include "×2", got: "${nameCell.textContent}"`
  );
});

test('summary row zone_name cell contains a toggle button', () => {
  resetState();
  const zoneL = makeZone({ zone_name: 'left_arm', AV: 1, health: 300 });
  const zoneR = makeZone({ zone_name: 'right_arm', AV: 1, health: 300 });
  const enemy = makeEnemy({ zones: [zoneL, zoneR] });
  const sortedRows = [makeRow(zoneL, 0), makeRow(zoneR, 1)];

  const { tbody } = renderIntoTbody(sortedRows, enemy);

  const summaryRow = getDirectChildren(tbody)[0];
  const nameCell = getDirectChildren(summaryRow)[0];
  // Look for a BUTTON element among children of the name cell.
  const buttons = collectElements(nameCell, (el) => el.tagName === 'BUTTON');
  assert.equal(buttons.length, 1, 'Expected exactly one toggle button in the name cell');
});

// ─── Member rows (collapsed by default) ───────────────────────────────────────

test('member rows have zone-group-member class', () => {
  resetState();
  const zoneL = makeZone({ zone_name: 'left_arm', AV: 1, health: 300 });
  const zoneR = makeZone({ zone_name: 'right_arm', AV: 1, health: 300 });
  const enemy = makeEnemy({ zones: [zoneL, zoneR] });
  const sortedRows = [makeRow(zoneL, 0), makeRow(zoneR, 1)];

  const { tbody } = renderIntoTbody(sortedRows, enemy);

  const rows = getDirectChildren(tbody);
  const memberRows = [...rows].filter((tr) => tr.classList.contains('zone-group-member'));
  assert.equal(memberRows.length, 2);
});

test('exact-stat member rows are hidden by default (display:none)', () => {
  resetState();
  const zoneL = makeZone({ zone_name: 'left_arm', AV: 1, health: 300 });
  const zoneR = makeZone({ zone_name: 'right_arm', AV: 1, health: 300 });
  const enemy = makeEnemy({ zones: [zoneL, zoneR] });
  const sortedRows = [makeRow(zoneL, 0), makeRow(zoneR, 1)];

  const { tbody } = renderIntoTbody(sortedRows, enemy);

  const rows = getDirectChildren(tbody);
  const memberRows = [...rows].filter((tr) => tr.classList.contains('zone-group-member'));
  memberRows.forEach((tr) => {
    assert.equal(tr.style.display, 'none', 'member row should be hidden by default');
  });
});

test('member rows share the same data-family-id as their summary row', () => {
  resetState();
  const zoneL = makeZone({ zone_name: 'left_arm', AV: 1, health: 300 });
  const zoneR = makeZone({ zone_name: 'right_arm', AV: 1, health: 300 });
  const enemy = makeEnemy({ zones: [zoneL, zoneR] });
  const sortedRows = [makeRow(zoneL, 0), makeRow(zoneR, 1)];

  const { tbody } = renderIntoTbody(sortedRows, enemy);

  const rows = [...getDirectChildren(tbody)];
  const summaryRow = rows.find((tr) => tr.classList.contains('zone-group-summary'));
  const memberRows = rows.filter((tr) => tr.classList.contains('zone-group-member'));

  assert.ok(summaryRow.dataset.familyId, 'summary must have familyId');
  memberRows.forEach((tr) => {
    assert.equal(tr.dataset.familyId, summaryRow.dataset.familyId);
  });
});

test('member rows show exact member zone names', () => {
  resetState();
  const zoneL = makeZone({ zone_name: 'left_arm', AV: 1, health: 300 });
  const zoneR = makeZone({ zone_name: 'right_arm', AV: 1, health: 300 });
  const enemy = makeEnemy({ zones: [zoneL, zoneR] });
  const sortedRows = [makeRow(zoneL, 0), makeRow(zoneR, 1)];

  const { tbody } = renderIntoTbody(sortedRows, enemy);

  const rows = [...getDirectChildren(tbody)];
  const memberRows = rows.filter((tr) => tr.classList.contains('zone-group-member'));
  const memberNames = memberRows.map((tr) => getDirectChildren(tr)[0].textContent.trim());

  assert.ok(memberNames.includes('left_arm'), 'should include left_arm member');
  assert.ok(memberNames.includes('right_arm'), 'should include right_arm member');
});

// ─── Expand / collapse toggle behavior ─────────────────────────────────────────

test('clicking toggle button expands member rows (display becomes empty)', () => {
  resetState();
  const zoneL = makeZone({ zone_name: 'left_arm', AV: 1, health: 300 });
  const zoneR = makeZone({ zone_name: 'right_arm', AV: 1, health: 300 });
  const enemy = makeEnemy({ zones: [zoneL, zoneR] });
  const sortedRows = [makeRow(zoneL, 0), makeRow(zoneR, 1)];

  const { tbody } = renderIntoTbody(sortedRows, enemy);

  const summaryRow = [...getDirectChildren(tbody)].find((tr) => tr.classList.contains('zone-group-summary'));
  const nameCell = getDirectChildren(summaryRow)[0];
  const toggleBtn = collectElements(nameCell, (el) => el.tagName === 'BUTTON')[0];

  // Simulate click.
  toggleBtn.dispatch('click');

  const rows = [...getDirectChildren(tbody)];
  const memberRows = rows.filter((tr) => tr.classList.contains('zone-group-member'));
  memberRows.forEach((tr) => {
    assert.notEqual(tr.style.display, 'none', 'member row should be visible after expand');
  });
});

test('clicking toggle button sets data-group-collapsed to false', () => {
  resetState();
  const zoneL = makeZone({ zone_name: 'left_arm', AV: 1, health: 300 });
  const zoneR = makeZone({ zone_name: 'right_arm', AV: 1, health: 300 });
  const enemy = makeEnemy({ zones: [zoneL, zoneR] });
  const sortedRows = [makeRow(zoneL, 0), makeRow(zoneR, 1)];

  const { tbody } = renderIntoTbody(sortedRows, enemy);

  const summaryRow = [...getDirectChildren(tbody)].find((tr) => tr.classList.contains('zone-group-summary'));
  const nameCell = getDirectChildren(summaryRow)[0];
  const toggleBtn = collectElements(nameCell, (el) => el.tagName === 'BUTTON')[0];

  toggleBtn.dispatch('click');

  assert.equal(summaryRow.dataset.groupCollapsed, 'false');
});

test('clicking toggle twice collapses the group again', () => {
  resetState();
  const zoneL = makeZone({ zone_name: 'left_arm', AV: 1, health: 300 });
  const zoneR = makeZone({ zone_name: 'right_arm', AV: 1, health: 300 });
  const enemy = makeEnemy({ zones: [zoneL, zoneR] });
  const sortedRows = [makeRow(zoneL, 0), makeRow(zoneR, 1)];

  const { tbody } = renderIntoTbody(sortedRows, enemy);

  const summaryRow = [...getDirectChildren(tbody)].find((tr) => tr.classList.contains('zone-group-summary'));
  const nameCell = getDirectChildren(summaryRow)[0];
  const toggleBtn = collectElements(nameCell, (el) => el.tagName === 'BUTTON')[0];

  toggleBtn.dispatch('click'); // expand
  toggleBtn.dispatch('click'); // collapse

  const rows = [...getDirectChildren(tbody)];
  const memberRows = rows.filter((tr) => tr.classList.contains('zone-group-member'));
  memberRows.forEach((tr) => {
    assert.equal(tr.style.display, 'none', 'member row should be hidden after re-collapse');
  });
  assert.equal(summaryRow.dataset.groupCollapsed, 'true');
});

// ─── Pre-expanded group renders members visible ───────────────────────────────

test('member rows are visible when group was already expanded before render', () => {
  resetState();
  const zoneL = makeZone({ zone_name: 'left_arm', AV: 1, health: 300 });
  const zoneR = makeZone({ zone_name: 'right_arm', AV: 1, health: 300 });
  const enemy = makeEnemy({ zones: [zoneL, zoneR] });
  const sortedRows = [makeRow(zoneL, 0), makeRow(zoneR, 1)];

  // First render to discover the familyId.
  const tbodyA = globalThis.document.createElement('tbody');
  renderGroupedEnemyRows(tbodyA, sortedRows, enemy, { columns: MINIMAL_COLUMNS });
  const summaryA = [...getDirectChildren(tbodyA)].find((tr) => tr.classList.contains('zone-group-summary'));
  const fid = summaryA.dataset.familyId;

  // Mark expanded, then re-render.
  setGroupExpanded(fid, true);

  const tbodyB = globalThis.document.createElement('tbody');
  renderGroupedEnemyRows(tbodyB, sortedRows, enemy, { columns: MINIMAL_COLUMNS });

  const memberRows = [...getDirectChildren(tbodyB)].filter((tr) => tr.classList.contains('zone-group-member'));
  memberRows.forEach((tr) => {
    assert.notEqual(tr.style.display, 'none', 'member row should be visible when group is pre-expanded');
  });
});

// ─── Representative member behavior ──────────────────────────────────────────

test('rowEntries for summary row uses representative zone and index', () => {
  resetState();
  const zoneL = makeZone({ zone_name: 'left_arm', AV: 1, health: 300 });
  const zoneR = makeZone({ zone_name: 'right_arm', AV: 1, health: 300 });
  const enemy = makeEnemy({ zones: [zoneL, zoneR] });
  const sortedRows = [makeRow(zoneL, 0), makeRow(zoneR, 1)];

  const { rowEntries } = renderIntoTbody(sortedRows, enemy);

  const summaryEntry = rowEntries.find(({ tr }) => tr.classList.contains('zone-group-summary'));
  assert.ok(summaryEntry, 'must have a summary entry in rowEntries');
  // Representative is first member by index (index 0 = left_arm).
  assert.equal(summaryEntry.zoneIndex, 0);
  assert.equal(summaryEntry.zone.zone_name, 'left_arm');
});

test('rowEntries for each member row uses exact member zone and index', () => {
  resetState();
  const zoneL = makeZone({ zone_name: 'left_arm', AV: 1, health: 300 });
  const zoneR = makeZone({ zone_name: 'right_arm', AV: 1, health: 300 });
  const enemy = makeEnemy({ zones: [zoneL, zoneR] });
  const sortedRows = [makeRow(zoneL, 0), makeRow(zoneR, 1)];

  const { rowEntries } = renderIntoTbody(sortedRows, enemy);

  const memberEntries = rowEntries.filter(({ tr }) => tr.classList.contains('zone-group-member'));
  assert.equal(memberEntries.length, 2);
  const memberIndices = memberEntries.map((e) => e.zoneIndex).sort((a, b) => a - b);
  assert.deepEqual(memberIndices, [0, 1]);
});

// ─── Stable row ordering ──────────────────────────────────────────────────────

test('preserves sortedRows ordering: summary row appears where the family first appears', () => {
  resetState();
  // Two separate families interleaved – but since grouping collects all members together
  // when first encountered, the summary appears at the first occurrence position.
  const baseZoneA = { AV: 1, 'Dur%': 0, health: 200, Con: 0, ExMult: null, ExTarget: 'Main', 'ToMain%': 1, MainCap: 0, IsFatal: false };
  const baseZoneB = { AV: 2, 'Dur%': 0.2, health: 300, Con: 0, ExMult: null, ExTarget: 'Main', 'ToMain%': 1, MainCap: 0, IsFatal: false };
  const zoneAL = makeZone({ zone_name: 'left_pauldron', ...baseZoneA });
  const zoneAR = makeZone({ zone_name: 'right_pauldron', ...baseZoneA });
  const zoneBL = makeZone({ zone_name: 'left_leg', ...baseZoneB });
  const zoneBR = makeZone({ zone_name: 'right_leg', ...baseZoneB });
  const enemy = makeEnemy({ zones: [zoneAL, zoneAR, zoneBL, zoneBR] });
  const sortedRows = [makeRow(zoneAL, 0), makeRow(zoneAR, 1), makeRow(zoneBL, 2), makeRow(zoneBR, 3)];

  const { tbody } = renderIntoTbody(sortedRows, enemy);

  const rows = [...getDirectChildren(tbody)];
  // Expect 2 summary rows + 4 member rows = 6 total
  assert.equal(rows.length, 6);
  assert.ok(rows[0].classList.contains('zone-group-summary'), 'first row is pauldron summary');
  assert.ok(rows[3].classList.contains('zone-group-summary'), 'fourth row is leg summary');
});

// ─── group-start propagation ──────────────────────────────────────────────────

test('group-start class on sortedRow propagates to summary row', () => {
  resetState();
  const zoneL = makeZone({ zone_name: 'left_arm', AV: 1, health: 300 });
  const zoneR = makeZone({ zone_name: 'right_arm', AV: 1, health: 300 });
  const enemy = makeEnemy({ zones: [zoneL, zoneR] });
  const sortedRows = [makeRow(zoneL, 0, { groupStart: true }), makeRow(zoneR, 1)];

  const { tbody } = renderIntoTbody(sortedRows, enemy);

  const summaryRow = [...getDirectChildren(tbody)].find((tr) => tr.classList.contains('zone-group-summary'));
  assert.ok(summaryRow.classList.contains('group-start'));
});

// ─── Multi-column rendering (non-zone_name columns) ───────────────────────────

test('summary row renders representative member data for non-zone_name columns', () => {
  resetState();
  const zoneL = makeZone({ zone_name: 'left_arm', AV: 5, health: 300, IsFatal: false });
  const zoneR = makeZone({ zone_name: 'right_arm', AV: 5, health: 300, IsFatal: false });
  const enemy = makeEnemy({ zones: [zoneL, zoneR] });
  const sortedRows = [makeRow(zoneL, 0), makeRow(zoneR, 1)];

  const tbody = globalThis.document.createElement('tbody');
  renderGroupedEnemyRows(tbody, sortedRows, enemy, {
    columns: FULL_COLUMNS,
    hasProjectileTargets: false,
    hasExplosiveTargets: false
  });

  const summaryRow = [...getDirectChildren(tbody)].find((tr) => tr.classList.contains('zone-group-summary'));
  // cells: zone_name, AV, IsFatal
  const cells = getDirectChildren(summaryRow);
  // AV cell (index 1) should show "5"
  assert.equal(cells[1].textContent.trim(), '5');
});

// ─── Mixed grouped/singleton rows ────────────────────────────────────────────

test('mixed enemy renders singleton rows normally and groups multi-member families', () => {
  resetState();
  const base = { AV: 2, 'Dur%': 0, health: 200, Con: 0, ExMult: null, ExTarget: 'Main', 'ToMain%': 1, MainCap: 0, IsFatal: false };
  const zoneHead = makeZone({ zone_name: 'Head', health: 150, IsFatal: true });
  const zoneAL = makeZone({ zone_name: 'left_arm', ...base });
  const zoneAR = makeZone({ zone_name: 'right_arm', ...base });
  const enemy = makeEnemy({ zones: [zoneHead, zoneAL, zoneAR] });
  const sortedRows = [makeRow(zoneHead, 0), makeRow(zoneAL, 1), makeRow(zoneAR, 2)];

  const { tbody, rowEntries } = renderIntoTbody(sortedRows, enemy);

  const rows = [...getDirectChildren(tbody)];
  // head (singleton) + summary + member + member = 4 rows
  assert.equal(rows.length, 4);
  assert.equal(rows[0].classList.contains('zone-group-summary'), false);
  assert.equal(rows[0].classList.contains('zone-group-member'), false);
  assert.ok(rows[1].classList.contains('zone-group-summary'));
  assert.ok(rows[2].classList.contains('zone-group-member'));
  assert.ok(rows[3].classList.contains('zone-group-member'));

  // rowEntries: head, summary(rep=arm), member(left), member(right) = 4
  assert.equal(rowEntries.length, 4);
});

// ─── Explicit zoneRelationGroups ──────────────────────────────────────────────

test('explicit groups produce summary rows with the group label', () => {
  resetState();
  const enemy = {
    name: 'Bot',
    zones: [
      makeZone({ zone_name: 'left_hip', AV: 3, health: 400 }),
      makeZone({ zone_name: 'left_upper_leg', AV: 2, health: 500 }),
      makeZone({ zone_name: 'right_hip', AV: 3, health: 400 })
    ],
    zoneRelationGroups: [
      { id: 'left-leg', label: 'Left leg', zoneNames: ['left_hip', 'left_upper_leg'], mirrorGroupIds: [], priorityTargetZoneNames: [] },
      { id: 'right-leg', label: 'Right leg', zoneNames: ['right_hip'], mirrorGroupIds: [], priorityTargetZoneNames: [] }
    ]
  };
  const sortedRows = enemy.zones.map((z, i) => makeRow(z, i));

  const { tbody } = renderIntoTbody(sortedRows, enemy);

  const rows = [...getDirectChildren(tbody)];
  // Left leg: summary + 2 members; Right leg: singleton row = 4 total
  assert.equal(rows.length, 4);

  const leftLegSummary = rows[0];
  assert.ok(leftLegSummary.classList.contains('zone-group-summary'));
  const nameCell = getDirectChildren(leftLegSummary)[0];
  assert.ok(nameCell.textContent.includes('Left leg'), `Expected "Left leg" in "${nameCell.textContent}"`);
});

test('mixed explicit groups start expanded by default', () => {
  resetState();
  const { enemy, sortedRows } = makeDevastatorLikeArmGroupSetup();

  const { tbody } = renderIntoTbody(sortedRows, enemy);

  const rows = [...getDirectChildren(tbody)];
  const summaryRow = rows.find((tr) => tr.classList.contains('zone-group-summary'));
  const memberRows = rows.filter((tr) => tr.classList.contains('zone-group-member'));

  assert.ok(summaryRow, 'expected a summary row');
  assert.equal(summaryRow.dataset.groupCollapsed, 'false');
  memberRows.forEach((tr) => {
    assert.notEqual(tr.style.display, 'none', 'mixed explicit member rows should be visible by default');
  });
});

test('mixed explicit summary rows use the priority target member for displayed stats', () => {
  resetState();
  const { enemy, sortedRows } = makeDevastatorLikeArmGroupSetup();

  const tbody = globalThis.document.createElement('tbody');
  const rowEntries = renderGroupedEnemyRows(tbody, sortedRows, enemy, {
    columns: FULL_COLUMNS,
    hasProjectileTargets: false,
    hasExplosiveTargets: false
  });

  const summaryRow = [...getDirectChildren(tbody)].find((tr) => tr.classList.contains('zone-group-summary'));
  const summaryEntry = rowEntries.find(({ tr }) => tr === summaryRow);
  const cells = getDirectChildren(summaryRow);

  assert.equal(cells[1].textContent.trim(), '1');
  assert.equal(summaryEntry.zoneIndex, 1);
  assert.equal(summaryEntry.zone.zone_name, 'left_arm');
});

test('manual collapse of a mixed explicit group persists across re-render', () => {
  resetState();
  const { enemy, sortedRows } = makeDevastatorLikeArmGroupSetup();

  const tbodyA = globalThis.document.createElement('tbody');
  renderGroupedEnemyRows(tbodyA, sortedRows, enemy, { columns: MINIMAL_COLUMNS });
  const summaryRowA = [...getDirectChildren(tbodyA)].find((tr) => tr.classList.contains('zone-group-summary'));
  const toggleBtn = collectElements(getDirectChildren(summaryRowA)[0], (el) => el.tagName === 'BUTTON')[0];

  toggleBtn.dispatch('click');

  const tbodyB = globalThis.document.createElement('tbody');
  renderGroupedEnemyRows(tbodyB, sortedRows, enemy, { columns: MINIMAL_COLUMNS });

  const summaryRowB = [...getDirectChildren(tbodyB)].find((tr) => tr.classList.contains('zone-group-summary'));
  const memberRowsB = [...getDirectChildren(tbodyB)].filter((tr) => tr.classList.contains('zone-group-member'));

  assert.equal(summaryRowB.dataset.groupCollapsed, 'true');
  memberRowsB.forEach((tr) => {
    assert.equal(tr.style.display, 'none', 'manually collapsed mixed groups should stay collapsed');
  });
});

test('explicit singleton groups render as plain rows', () => {
  resetState();
  const enemy = {
    name: 'Bot',
    zones: [
      makeZone({ zone_name: 'head', health: 150 }),
      makeZone({ zone_name: 'torso', health: 600 })
    ],
    zoneRelationGroups: [
      { id: 'head', label: 'Head', zoneNames: ['head'], mirrorGroupIds: [], priorityTargetZoneNames: [] },
      { id: 'torso', label: 'Torso', zoneNames: ['torso'], mirrorGroupIds: [], priorityTargetZoneNames: [] }
    ]
  };
  const sortedRows = enemy.zones.map((z, i) => makeRow(z, i));

  const { tbody, rowEntries } = renderIntoTbody(sortedRows, enemy);

  const rows = [...getDirectChildren(tbody)];
  assert.equal(rows.length, 2);
  rows.forEach((tr) => {
    assert.equal(tr.classList.contains('zone-group-summary'), false);
    assert.equal(tr.classList.contains('zone-group-member'), false);
  });
  assert.equal(rowEntries.length, 2);
});

// ─── rowEntries compatibility with wireZoneRelationHighlights ─────────────────

test('rowEntries has an entry for every rendered row (summary + all members)', () => {
  resetState();
  const zoneL = makeZone({ zone_name: 'left_arm', AV: 1, health: 300 });
  const zoneR = makeZone({ zone_name: 'right_arm', AV: 1, health: 300 });
  const enemy = makeEnemy({ zones: [zoneL, zoneR] });
  const sortedRows = [makeRow(zoneL, 0), makeRow(zoneR, 1)];

  const { tbody, rowEntries } = renderIntoTbody(sortedRows, enemy);

  const totalDomRows = getDirectChildren(tbody).length;
  assert.equal(rowEntries.length, totalDomRows, 'rowEntries count should match DOM row count');
});

test('every rowEntry has tr, zone, and zoneIndex properties', () => {
  resetState();
  const zoneL = makeZone({ zone_name: 'left_arm', AV: 1, health: 300 });
  const zoneR = makeZone({ zone_name: 'right_arm', AV: 1, health: 300 });
  const enemy = makeEnemy({ zones: [zoneL, zoneR] });
  const sortedRows = [makeRow(zoneL, 0), makeRow(zoneR, 1)];

  const { rowEntries } = renderIntoTbody(sortedRows, enemy);

  for (const entry of rowEntries) {
    assert.ok(entry.tr, 'rowEntry must have tr');
    assert.ok(entry.zone !== undefined, 'rowEntry must have zone');
    assert.ok(typeof entry.zoneIndex === 'number', 'rowEntry zoneIndex must be a number');
  }
});

// ─── Empty / edge cases ───────────────────────────────────────────────────────

test('returns empty rowEntries for empty sortedRows', () => {
  resetState();
  const enemy = makeEnemy({ zones: [] });
  const { tbody, rowEntries } = renderIntoTbody([], enemy);

  assert.equal(getDirectChildren(tbody).length, 0);
  assert.deepEqual(rowEntries, []);
});

test('handles null enemy gracefully (returns empty)', () => {
  resetState();
  const tbody = globalThis.document.createElement('tbody');
  const rowEntries = renderGroupedEnemyRows(tbody, [], null, { columns: MINIMAL_COLUMNS });
  assert.deepEqual(rowEntries, []);
});

// ─── Family main-path metrics helpers ────────────────────────────────────────

/**
 * Minimal kill-summary-like structure as returned by buildKillSummary.
 * `zoneShotsToKill` and `mainShotsToKill` are the two values the condition
 * checks.
 */
function makeKillSummary({ zoneShotsToKill, mainShotsToKill, rpm = null, cadenceModel = null } = {}) {
  const usesBeamCadence = String(cadenceModel?.type || '').trim().toLowerCase() === 'beam';
  return {
    hasRpm: rpm !== null || usesBeamCadence,
    rpm,
    cadenceModel,
    usesBeamCadence,
    beamTicksPerSecond: cadenceModel?.beamTicksPerSecond ?? null,
    zoneShotsToKill: zoneShotsToKill ?? null,
    zoneTtkSeconds: null,
    zoneShotsToKillWithCon: null,
    zoneTtkSecondsWithCon: null,
    zoneEffectiveShotsToKill: zoneShotsToKill ?? null,
    zoneEffectiveTtkSeconds: null,
    mainShotsToKill: mainShotsToKill ?? null,
    mainTtkSeconds: null
  };
}

/**
 * Minimal slot-metrics object (subset of what summarizeZoneForSlot returns).
 */
function makeSlotMetrics({
  outcomeKind = 'limb',
  shotsToKill = 2,
  ttkSeconds = null,
  damagesZone = true,
  zoneShotsToKill = 2,
  mainShotsToKill = 5,
  rpm = null,
  cadenceModel = null
} = {}) {
  const usesBeamCadence = String(cadenceModel?.type || '').trim().toLowerCase() === 'beam';
  return {
    outcomeKind,
    shotsToKill,
    ttkSeconds,
    damagesZone,
    usesBeamCadence,
    beamTicksPerSecond: cadenceModel?.beamTicksPerSecond ?? null,
    zoneSummary: {
      killSummary: makeKillSummary({ zoneShotsToKill, mainShotsToKill, rpm, cadenceModel })
    },
    marginRatio: null,
    marginPercent: null,
    displayMarginRatio: null,
    displayMarginPercent: null,
    marginSortRatio: null,
    marginDisplayPercent: null
  };
}

/**
 * Minimal metrics object as returned by buildZoneComparisonMetrics
 * (single-slot mode: only slot A is populated).
 */
function makeRepMetrics(slotAOverrides = {}, slotBOverrides = null) {
  const slotA = makeSlotMetrics(slotAOverrides);
  const slotB = slotBOverrides ? makeSlotMetrics(slotBOverrides) : null;
  return {
    bySlot: { A: slotA, B: slotB },
    diffShots: null,
    diffTtkSeconds: null
  };
}

// ─── isFamilyMainPathViableForSlot ───────────────────────────────────────────

test('isFamilyMainPathViableForSlot returns false for null slotMetrics', () => {
  assert.equal(isFamilyMainPathViableForSlot(null, 3), false);
});

test('isFamilyMainPathViableForSlot returns false for memberCount < 2', () => {
  const slot = makeSlotMetrics();
  assert.equal(isFamilyMainPathViableForSlot(slot, 1), false);
});

test('isFamilyMainPathViableForSlot returns false when slot does not damage zone', () => {
  const slot = makeSlotMetrics({ damagesZone: false });
  assert.equal(isFamilyMainPathViableForSlot(slot, 3), false);
});

test('isFamilyMainPathViableForSlot returns false when outcomeKind is already main', () => {
  // Direct path already shows main kill — family path adds no new info.
  const slot = makeSlotMetrics({ outcomeKind: 'main', zoneShotsToKill: 5, mainShotsToKill: 3 });
  assert.equal(isFamilyMainPathViableForSlot(slot, 3), false);
});

test('isFamilyMainPathViableForSlot returns false when mainShotsToKill is null', () => {
  const slot = makeSlotMetrics({ mainShotsToKill: null });
  assert.equal(isFamilyMainPathViableForSlot(slot, 3), false);
});

test('isFamilyMainPathViableForSlot returns false when mainShotsToKill > N * zoneShotsToKill', () => {
  // 5 > 2 * 2 = 4 → not viable
  const slot = makeSlotMetrics({ outcomeKind: 'limb', zoneShotsToKill: 2, mainShotsToKill: 5 });
  assert.equal(isFamilyMainPathViableForSlot(slot, 2), false);
});

test('isFamilyMainPathViableForSlot returns true when mainShotsToKill <= N * zoneShotsToKill', () => {
  // 5 <= 3 * 2 = 6 → viable
  const slot = makeSlotMetrics({ outcomeKind: 'limb', zoneShotsToKill: 2, mainShotsToKill: 5 });
  assert.equal(isFamilyMainPathViableForSlot(slot, 3), true);
});

test('isFamilyMainPathViableForSlot returns true at exact boundary (equal)', () => {
  // 6 <= 3 * 2 = 6 → viable (boundary case)
  const slot = makeSlotMetrics({ outcomeKind: 'limb', zoneShotsToKill: 2, mainShotsToKill: 6 });
  assert.equal(isFamilyMainPathViableForSlot(slot, 3), true);
});

// ─── buildFamilyMainPathMetrics ──────────────────────────────────────────────

test('buildFamilyMainPathMetrics returns null for singleton family', () => {
  const family = { isSingleton: true, memberIndices: [0] };
  const repMetrics = makeRepMetrics();
  assert.equal(buildFamilyMainPathMetrics(repMetrics, family), null);
});

test('buildFamilyMainPathMetrics returns null when no slot is viable', () => {
  // outcomeKind = 'main' → already showing main kill, no new info
  const family = { isSingleton: false, memberIndices: [0, 1] };
  const repMetrics = makeRepMetrics({ outcomeKind: 'main', zoneShotsToKill: 5, mainShotsToKill: 3 });
  assert.equal(buildFamilyMainPathMetrics(repMetrics, family), null);
});

test('buildFamilyMainPathMetrics returns null when direct path is limb but N too small', () => {
  // 5 > 2 * 2 → not viable for N=2 members
  const family = { isSingleton: false, memberIndices: [0, 1] };
  const repMetrics = makeRepMetrics({ outcomeKind: 'limb', zoneShotsToKill: 2, mainShotsToKill: 5 });
  assert.equal(buildFamilyMainPathMetrics(repMetrics, family), null);
});

test('buildFamilyMainPathMetrics returns metrics when family path is viable', () => {
  // 5 <= 3 * 2 = 6 → viable
  const family = { isSingleton: false, memberIndices: [0, 1, 2] };
  const repMetrics = makeRepMetrics({ outcomeKind: 'limb', zoneShotsToKill: 2, mainShotsToKill: 5 });
  const result = buildFamilyMainPathMetrics(repMetrics, family);
  assert.ok(result !== null, 'expected non-null result for viable family');
});

test('buildFamilyMainPathMetrics slot A shows mainShotsToKill and main outcomeKind', () => {
  const family = { isSingleton: false, memberIndices: [0, 1, 2] };
  const repMetrics = makeRepMetrics({ outcomeKind: 'limb', zoneShotsToKill: 2, mainShotsToKill: 5 });
  const result = buildFamilyMainPathMetrics(repMetrics, family);
  assert.equal(result.bySlot.A.shotsToKill, 5);
  assert.equal(result.bySlot.A.outcomeKind, 'main');
});

test('buildFamilyMainPathMetrics clears margin info on viable slot', () => {
  const family = { isSingleton: false, memberIndices: [0, 1, 2] };
  const repMetrics = makeRepMetrics({ outcomeKind: 'limb', zoneShotsToKill: 2, mainShotsToKill: 5 });
  const result = buildFamilyMainPathMetrics(repMetrics, family);
  assert.equal(result.bySlot.A.marginPercent, null);
  assert.equal(result.bySlot.A.marginRatio, null);
});

test('buildFamilyMainPathMetrics keeps beam cadence timing for viable family paths', () => {
  const family = { isSingleton: false, memberIndices: [0, 1, 2] };
  const repMetrics = makeRepMetrics({
    outcomeKind: 'limb',
    zoneShotsToKill: 2,
    mainShotsToKill: 5,
    cadenceModel: {
      type: 'beam',
      beamTicksPerSecond: 67
    }
  });
  const result = buildFamilyMainPathMetrics(repMetrics, family);

  assert.equal(result.bySlot.A.usesBeamCadence, true);
  assert.equal(result.bySlot.A.ttkSeconds, 5 / 67);
});

test('buildFamilyMainPathMetrics returns null repMetrics', () => {
  const family = { isSingleton: false, memberIndices: [0, 1] };
  assert.equal(buildFamilyMainPathMetrics(null, family), null);
});

test('buildFamilyMainPathMetrics blanks non-viable compare slots instead of reusing direct-path values', () => {
  const family = { isSingleton: false, memberIndices: [0, 1, 2] };
  const repMetrics = makeRepMetrics(
    { outcomeKind: 'limb', zoneShotsToKill: 2, mainShotsToKill: 5, shotsToKill: 2 },
    { outcomeKind: 'limb', zoneShotsToKill: 2, mainShotsToKill: 7, shotsToKill: 2 }
  );

  const result = buildFamilyMainPathMetrics(repMetrics, family);

  assert.equal(result.bySlot.A.shotsToKill, 5);
  assert.equal(result.bySlot.B.shotsToKill, null);
  assert.equal(result.bySlot.B.outcomeKind, null);
  assert.equal(result.diffShots.kind, 'unavailable');
});

// ─── Family path row rendering ───────────────────────────────────────────────

/**
 * Helper: two-zone auto-grouped family (left/right) with metrics that make
 * the family path viable: zoneShotsToKill=2, mainShotsToKill=4 → 4 <= 2*2=4.
 */
function makeTwoZoneFamilySetup() {
  const base = {
    AV: 0, 'Dur%': 0, health: 100, Con: 0,
    ExMult: null, ExTarget: 'Main', 'ToMain%': 0.8, MainCap: 0, IsFatal: false
  };
  const zones = [
    { zone_name: 'left_arm', ...base },
    { zone_name: 'right_arm', ...base }
  ];
  const enemy = makeEnemy({ zones });
  const slotA = makeSlotMetrics({ outcomeKind: 'limb', zoneShotsToKill: 2, mainShotsToKill: 4, shotsToKill: 2 });
  const repMetrics = { bySlot: { A: slotA, B: null }, diffShots: null, diffTtkSeconds: null };
  const sortedRows = zones.map((z, i) => makeRow(z, i, { metrics: repMetrics }));
  return { enemy, sortedRows };
}

/**
 * Helper: explicit 3-member group via zoneRelationGroups.
 * mainShotsToKill=5, zoneShotsToKill=2, N=3 → 5 <= 6 ✓
 */
function makeThreeZoneExplicitFamilySetup() {
  const base = {
    AV: 0, 'Dur%': 0, health: 100, Con: 0,
    ExMult: null, ExTarget: 'Main', 'ToMain%': 0.8, MainCap: 0, IsFatal: false
  };
  const zones = [
    { zone_name: 'pauldron_a', ...base },
    { zone_name: 'pauldron_b', ...base },
    { zone_name: 'pauldron_c', ...base }
  ];
  const enemy = {
    name: 'TestEnemy',
    zones,
    zoneRelationGroups: [
      {
        id: 'pauldrons',
        label: 'Pauldrons',
        zoneNames: ['pauldron_a', 'pauldron_b', 'pauldron_c'],
        mirrorGroupIds: [],
        priorityTargetZoneNames: []
      }
    ]
  };
  const slotA = makeSlotMetrics({ outcomeKind: 'limb', zoneShotsToKill: 2, mainShotsToKill: 5, shotsToKill: 2 });
  const repMetrics = { bySlot: { A: slotA, B: null }, diffShots: null, diffTtkSeconds: null };
  const sortedRows = zones.map((z, i) => makeRow(z, i, { metrics: repMetrics }));
  return { enemy, sortedRows };
}

test('family path row is emitted after summary row for viable N=3 explicit family', () => {
  resetState();
  const { enemy, sortedRows } = makeThreeZoneExplicitFamilySetup();

  const tbody = globalThis.document.createElement('tbody');
  renderGroupedEnemyRows(tbody, sortedRows, enemy, {
    columns: MINIMAL_COLUMNS,
    hasProjectileTargets: false,
    hasExplosiveTargets: false
  });

  const rows = [...getDirectChildren(tbody)];
  const familyPathRows = rows.filter((tr) => tr.classList.contains('zone-group-family-path'));
  assert.equal(familyPathRows.length, 1, 'expected exactly one family path row');
});

test('family path row is emitted for N=2 auto-grouped family when math is viable', () => {
  resetState();
  // 4 <= 2*2=4 → viable at boundary
  const { enemy, sortedRows } = makeTwoZoneFamilySetup();

  const tbody = globalThis.document.createElement('tbody');
  renderGroupedEnemyRows(tbody, sortedRows, enemy, { columns: MINIMAL_COLUMNS });

  const rows = [...getDirectChildren(tbody)];
  const familyPathRows = rows.filter((tr) => tr.classList.contains('zone-group-family-path'));
  assert.equal(familyPathRows.length, 1, 'expected one family path row for viable N=2 family');
});

test('family path row is NOT emitted for N=2 when mainShotsToKill > N * zoneShotsToKill', () => {
  resetState();
  // 5 > 2*2=4 → not viable for N=2
  const base = {
    AV: 0, 'Dur%': 0, health: 100, Con: 0,
    ExMult: null, ExTarget: 'Main', 'ToMain%': 0.8, MainCap: 0, IsFatal: false
  };
  const zones = [
    { zone_name: 'left_arm', ...base },
    { zone_name: 'right_arm', ...base }
  ];
  const enemy = makeEnemy({ zones });
  const slotA = makeSlotMetrics({ outcomeKind: 'limb', zoneShotsToKill: 2, mainShotsToKill: 5 });
  const repMetrics = { bySlot: { A: slotA, B: null }, diffShots: null, diffTtkSeconds: null };
  const sortedRows = zones.map((z, i) => makeRow(z, i, { metrics: repMetrics }));

  const tbody = globalThis.document.createElement('tbody');
  renderGroupedEnemyRows(tbody, sortedRows, enemy, { columns: MINIMAL_COLUMNS });

  const rows = [...getDirectChildren(tbody)];
  const familyPathRows = rows.filter((tr) => tr.classList.contains('zone-group-family-path'));
  assert.equal(familyPathRows.length, 0, 'no family path row expected when mainShots > N*zoneShots');
});

test('family path row is NOT emitted for singleton zones (null metrics)', () => {
  resetState();
  const zone = makeZone({ zone_name: 'Head', IsFatal: true });
  const enemy = makeEnemy({ zones: [zone] });
  const sortedRows = [makeRow(zone, 0)]; // metrics: null

  const { tbody } = renderIntoTbody(sortedRows, enemy);

  const rows = [...getDirectChildren(tbody)];
  const familyPathRows = rows.filter((tr) => tr.classList.contains('zone-group-family-path'));
  assert.equal(familyPathRows.length, 0);
});

test('family path row has zone-group-family-path class and correct data-family-id', () => {
  resetState();
  const { enemy, sortedRows } = makeTwoZoneFamilySetup();

  const tbody = globalThis.document.createElement('tbody');
  renderGroupedEnemyRows(tbody, sortedRows, enemy, { columns: MINIMAL_COLUMNS });

  const rows = [...getDirectChildren(tbody)];
  const summaryRow = rows.find((tr) => tr.classList.contains('zone-group-summary'));
  const familyPathRow = rows.find((tr) => tr.classList.contains('zone-group-family-path'));

  assert.ok(familyPathRow, 'family path row must exist');
  assert.equal(familyPathRow.dataset.familyId, summaryRow.dataset.familyId,
    'family path row should share familyId with summary row');
});

test('family path row appears between summary row and member rows', () => {
  resetState();
  const { enemy, sortedRows } = makeTwoZoneFamilySetup();

  const tbody = globalThis.document.createElement('tbody');
  renderGroupedEnemyRows(tbody, sortedRows, enemy, { columns: MINIMAL_COLUMNS });

  const rows = [...getDirectChildren(tbody)];
  const summaryIdx = rows.findIndex((tr) => tr.classList.contains('zone-group-summary'));
  const familyPathIdx = rows.findIndex((tr) => tr.classList.contains('zone-group-family-path'));
  const firstMemberIdx = rows.findIndex((tr) => tr.classList.contains('zone-group-member'));

  assert.ok(summaryIdx < familyPathIdx, 'family path row must follow summary row');
  assert.ok(familyPathIdx < firstMemberIdx, 'family path row must precede member rows');
});

test('family path row name cell contains "Main via family" and member count', () => {
  resetState();
  const { enemy, sortedRows } = makeThreeZoneExplicitFamilySetup();

  const tbody = globalThis.document.createElement('tbody');
  renderGroupedEnemyRows(tbody, sortedRows, enemy, { columns: MINIMAL_COLUMNS });

  const rows = [...getDirectChildren(tbody)];
  const familyPathRow = rows.find((tr) => tr.classList.contains('zone-group-family-path'));
  const nameCell = getDirectChildren(familyPathRow)[0];

  assert.ok(nameCell.textContent.includes('Main via family'),
    `Expected "Main via family" in name cell, got: "${nameCell.textContent}"`);
  assert.ok(nameCell.textContent.includes('×3'),
    `Expected "×3" in name cell, got: "${nameCell.textContent}"`);
});

test('family path row name cell has a tooltip', () => {
  resetState();
  const { enemy, sortedRows } = makeTwoZoneFamilySetup();

  const tbody = globalThis.document.createElement('tbody');
  renderGroupedEnemyRows(tbody, sortedRows, enemy, { columns: MINIMAL_COLUMNS });

  const rows = [...getDirectChildren(tbody)];
  const familyPathRow = rows.find((tr) => tr.classList.contains('zone-group-family-path'));
  const nameCell = getDirectChildren(familyPathRow)[0];

  assert.ok(nameCell.title && nameCell.title.length > 0,
    'family path name cell should have a non-empty tooltip');
});

test('family path row is included in rowEntries', () => {
  resetState();
  const { enemy, sortedRows } = makeTwoZoneFamilySetup();

  const tbody = globalThis.document.createElement('tbody');
  const rowEntries = renderGroupedEnemyRows(tbody, sortedRows, enemy, {
    columns: MINIMAL_COLUMNS
  });

  const totalDomRows = getDirectChildren(tbody).length;
  assert.equal(rowEntries.length, totalDomRows,
    'rowEntries count must match total DOM row count (including family path row)');
});

test('family path row rowEntry uses representative zone and index', () => {
  resetState();
  const { enemy, sortedRows } = makeTwoZoneFamilySetup();

  const tbody = globalThis.document.createElement('tbody');
  const rowEntries = renderGroupedEnemyRows(tbody, sortedRows, enemy, {
    columns: MINIMAL_COLUMNS
  });

  const familyPathEntry = rowEntries.find(({ tr }) =>
    tr.classList.contains('zone-group-family-path'));

  assert.ok(familyPathEntry, 'must have a family path entry in rowEntries');
  // Representative is first member (index 0).
  assert.equal(familyPathEntry.zoneIndex, 0);
});

test('family path row is NOT emitted when direct path already kills Main (outcomeKind=main)', () => {
  resetState();
  const base = {
    AV: 0, 'Dur%': 0, health: 100, Con: 0,
    ExMult: null, ExTarget: 'Main', 'ToMain%': 0.8, MainCap: 0, IsFatal: false
  };
  const zones = [
    { zone_name: 'left_arm', ...base },
    { zone_name: 'right_arm', ...base }
  ];
  const enemy = makeEnemy({ zones });
  // When outcomeKind is 'main', direct path already kills Main.
  const mainSlotA = makeSlotMetrics({ outcomeKind: 'main', zoneShotsToKill: 5, mainShotsToKill: 3 });
  const mainMetrics = { bySlot: { A: mainSlotA, B: null }, diffShots: null, diffTtkSeconds: null };
  const sortedRows = zones.map((z, i) => makeRow(z, i, { metrics: mainMetrics }));

  const tbody = globalThis.document.createElement('tbody');
  renderGroupedEnemyRows(tbody, sortedRows, enemy, { columns: MINIMAL_COLUMNS });

  const rows = [...getDirectChildren(tbody)];
  const familyPathRows = rows.filter((tr) => tr.classList.contains('zone-group-family-path'));
  assert.equal(familyPathRows.length, 0, 'no family path row when direct path already kills main');
});

test('family path row placeholder cells added for target columns', () => {
  resetState();
  const { enemy, sortedRows } = makeTwoZoneFamilySetup();

  const tbody = globalThis.document.createElement('tbody');
  renderGroupedEnemyRows(tbody, sortedRows, enemy, {
    columns: MINIMAL_COLUMNS,
    hasProjectileTargets: true,
    hasExplosiveTargets: true
  });

  const rows = [...getDirectChildren(tbody)];
  const familyPathRow = rows.find((tr) => tr.classList.contains('zone-group-family-path'));
  assert.ok(familyPathRow, 'family path row must exist');

  const summaryRow = rows.find((tr) => tr.classList.contains('zone-group-summary'));
  // Both rows should have the same total cell count.
  assert.equal(
    getDirectChildren(familyPathRow).length,
    getDirectChildren(summaryRow).length,
    'family path row and summary row must have the same number of cells'
  );
});

test('summary projectile cell shows checked state when a non-representative family member is selected', () => {
  resetState();
  const originalSelectedZoneIndex = calculatorState.selectedZoneIndex;

  try {
    calculatorState.selectedZoneIndex = 1;

    const zoneL = makeZone({ zone_name: 'left_arm', AV: 1, health: 200 });
    const zoneR = makeZone({ zone_name: 'right_arm', AV: 1, health: 200 });
    const enemy = makeEnemy({ zones: [zoneL, zoneR] });
    const sortedRows = [makeRow(zoneL, 0), makeRow(zoneR, 1)];

    const { tbody } = renderIntoTbody(sortedRows, enemy, { hasProjectileTargets: true });
    const rows = [...getDirectChildren(tbody)];
    const summaryRow = rows.find((tr) => tr.classList.contains('zone-group-summary'));
    const memberRows = rows.filter((tr) => tr.classList.contains('zone-group-member'));

    const summaryRadio = collectElements(summaryRow, (el) => el.tagName === 'INPUT' && el.type === 'radio')[0];
    const memberRadio = collectElements(memberRows[1], (el) => el.tagName === 'INPUT' && el.type === 'radio')[0];

    assert.ok(summaryRadio, 'summary row must render a projectile control');
    assert.equal(summaryRadio.checked, true, 'summary row must show family projectile state as selected');
    assert.notEqual(
      summaryRadio.name,
      memberRadio.name,
      'summary row uses a proxy radio group so it can stay checked alongside the selected member radio'
    );
    assert.match(summaryRadio.title, /right_arm/i);
  } finally {
    calculatorState.selectedZoneIndex = originalSelectedZoneIndex;
  }
});

test('summary projectile cell selects the representative member when the family is inactive', () => {
  resetState();
  const originalSelectedZoneIndex = calculatorState.selectedZoneIndex;

  try {
    calculatorState.selectedZoneIndex = null;

    const zoneL = makeZone({ zone_name: 'left_arm', AV: 1, health: 200 });
    const zoneR = makeZone({ zone_name: 'right_arm', AV: 1, health: 200 });
    const enemy = makeEnemy({ zones: [zoneL, zoneR] });
    const sortedRows = [makeRow(zoneL, 0), makeRow(zoneR, 1)];

    let refreshCalls = 0;
    const { tbody } = renderIntoTbody(sortedRows, enemy, {
      hasProjectileTargets: true,
      onRefreshEnemyCalculationViews: () => { refreshCalls += 1; }
    });
    const rows = [...getDirectChildren(tbody)];
    const summaryRow = rows.find((tr) => tr.classList.contains('zone-group-summary'));
    const summaryRadio = collectElements(summaryRow, (el) => el.tagName === 'INPUT' && el.type === 'radio')[0];

    summaryRadio.dispatch('change');

    assert.equal(calculatorState.selectedZoneIndex, 0);
    assert.equal(refreshCalls, 1);
  } finally {
    calculatorState.selectedZoneIndex = originalSelectedZoneIndex;
  }
});

test('summary explosive cell shows selected family-member count for homogeneous groups', () => {
  resetState();
  const originalSelectedExplosiveZoneIndices = [...calculatorState.selectedExplosiveZoneIndices];

  try {
    calculatorState.selectedExplosiveZoneIndices = [1, 3];

    const base = {
      AV: 1, 'Dur%': 0.5, health: 200, Con: 0,
      ExMult: null, ExTarget: 'Main', 'ToMain%': 0.6, MainCap: 0, IsFatal: false
    };
    const zones = [
      { zone_name: 'hitzone_l_rear_leg', ...base },
      { zone_name: 'hitzone_r_rear_leg', ...base },
      { zone_name: 'hitzone_l_front_leg', ...base },
      { zone_name: 'hitzone_r_front_leg', ...base }
    ];
    const enemy = makeEnemy({ zones });
    const sortedRows = zones.map((zone, zoneIndex) => makeRow(zone, zoneIndex));

    const { tbody } = renderIntoTbody(sortedRows, enemy, { hasExplosiveTargets: true });
    const rows = [...getDirectChildren(tbody)];
    const summaryRow = rows.find((tr) => tr.classList.contains('zone-group-summary'));
    const countButton = collectElements(
      summaryRow,
      (el) => el.tagName === 'BUTTON' && el.classList.contains('zone-group-explosion-count')
    )[0];

    assert.ok(countButton, 'homogeneous summary row must render the explosion count button');
    assert.equal(countButton.textContent, '2');
    assert.match(countButton.title, /2\/4/);
  } finally {
    calculatorState.selectedExplosiveZoneIndices = originalSelectedExplosiveZoneIndices;
  }
});

test('summary explosive count button cycles 0 to 1 to all to 0 while preserving unrelated selections', () => {
  resetState();
  const originalSelectedExplosiveZoneIndices = [...calculatorState.selectedExplosiveZoneIndices];

  try {
    calculatorState.selectedExplosiveZoneIndices = [4];

    const base = {
      AV: 1, 'Dur%': 0.5, health: 200, Con: 0,
      ExMult: null, ExTarget: 'Main', 'ToMain%': 0.6, MainCap: 0, IsFatal: false
    };
    const zones = [
      { zone_name: 'hitzone_l_rear_leg', ...base },
      { zone_name: 'hitzone_r_rear_leg', ...base },
      { zone_name: 'hitzone_l_front_leg', ...base },
      { zone_name: 'hitzone_r_front_leg', ...base },
      makeZone({ zone_name: 'head', health: 150, IsFatal: true })
    ];
    const enemy = makeEnemy({ zones });
    const sortedRows = zones.map((zone, zoneIndex) => makeRow(zone, zoneIndex));

    let refreshCalls = 0;
    const { tbody } = renderIntoTbody(sortedRows, enemy, {
      hasExplosiveTargets: true,
      onRefreshEnemyCalculationViews: () => { refreshCalls += 1; }
    });
    const rows = [...getDirectChildren(tbody)];
    const summaryRow = rows.find((tr) => tr.classList.contains('zone-group-summary'));
    const countButton = collectElements(
      summaryRow,
      (el) => el.tagName === 'BUTTON' && el.classList.contains('zone-group-explosion-count')
    )[0];

    countButton.dispatch('click');
    assert.deepEqual(calculatorState.selectedExplosiveZoneIndices, [4, 0]);

    countButton.dispatch('click');
    assert.deepEqual(calculatorState.selectedExplosiveZoneIndices, [4, 0, 1, 2, 3]);

    countButton.dispatch('click');
    assert.deepEqual(calculatorState.selectedExplosiveZoneIndices, [4]);
    assert.equal(refreshCalls, 3);
  } finally {
    calculatorState.selectedExplosiveZoneIndices = originalSelectedExplosiveZoneIndices;
  }
});

test('mixed explicit groups keep per-zone explosive checkbox instead of count overlay', () => {
  resetState();
  const originalSelectedExplosiveZoneIndices = [...calculatorState.selectedExplosiveZoneIndices];

  try {
    calculatorState.selectedExplosiveZoneIndices = [1];

    const shoulderplate = makeZone({
      zone_name: 'shoulderplate_right',
      AV: 2,
      health: 150,
      'ToMain%': 0.25,
      MainCap: 1
    });
    const arm = makeZone({
      zone_name: 'right_arm',
      AV: 1,
      health: 300,
      'ToMain%': 0.6,
      MainCap: 0
    });
    const enemy = makeEnemy({
      zones: [shoulderplate, arm],
      zoneRelationGroups: [
        {
          id: 'right-arm',
          label: 'Right arm',
          zoneNames: ['shoulderplate_right', 'right_arm'],
          mirrorGroupIds: [],
          priorityTargetZoneNames: ['right_arm']
        }
      ]
    });
    const sortedRows = [makeRow(shoulderplate, 0), makeRow(arm, 1)];

    const { tbody } = renderIntoTbody(sortedRows, enemy, { hasExplosiveTargets: true });
    const rows = [...getDirectChildren(tbody)];
    const summaryRow = rows.find((tr) => tr.classList.contains('zone-group-summary'));
    const countButtons = collectElements(
      summaryRow,
      (el) => el.tagName === 'BUTTON' && el.classList.contains('zone-group-explosion-count')
    );
    const checkboxes = collectElements(
      summaryRow,
      (el) => el.tagName === 'INPUT' && el.type === 'checkbox'
    );

    assert.equal(countButtons.length, 0, 'mixed explicit group should not render count overlay');
    assert.equal(checkboxes.length, 1, 'mixed explicit group should keep the standard checkbox');
  } finally {
    calculatorState.selectedExplosiveZoneIndices = originalSelectedExplosiveZoneIndices;
  }
});

test('family path row blanks non-viable compare-slot cells instead of showing direct-path values', () => {
  resetState();
  const base = {
    AV: 0, 'Dur%': 0, health: 100, Con: 0,
    ExMult: null, ExTarget: 'Main', 'ToMain%': 0.8, MainCap: 0, IsFatal: false
  };
  const zones = [
    { zone_name: 'pauldron_a', ...base },
    { zone_name: 'pauldron_b', ...base },
    { zone_name: 'pauldron_c', ...base }
  ];
  const enemy = {
    name: 'TestEnemy',
    zones,
    zoneRelationGroups: [
      {
        id: 'pauldrons',
        label: 'Pauldrons',
        zoneNames: ['pauldron_a', 'pauldron_b', 'pauldron_c'],
        mirrorGroupIds: [],
        priorityTargetZoneNames: []
      }
    ]
  };
  const repMetrics = makeRepMetrics(
    { outcomeKind: 'limb', zoneShotsToKill: 2, mainShotsToKill: 5, shotsToKill: 2 },
    { outcomeKind: 'limb', zoneShotsToKill: 2, mainShotsToKill: 7, shotsToKill: 2 }
  );
  const sortedRows = zones.map((z, i) => makeRow(z, i, { metrics: repMetrics }));

  const tbody = globalThis.document.createElement('tbody');
  renderGroupedEnemyRows(tbody, sortedRows, enemy, { columns: COMPARE_METRIC_COLUMNS });

  const rows = [...getDirectChildren(tbody)];
  const familyPathRow = rows.find((tr) => tr.classList.contains('zone-group-family-path'));
  const cells = getDirectChildren(familyPathRow);

  assert.equal(cells[1].textContent.trim(), '5');
  assert.equal(cells[2].textContent.trim(), '-');
  assert.equal(cells[3].textContent.trim(), '-');
});

// ─── Focused-table integration: exact-signature auto-families ─────────────────
// Verifies that renderer integration still surfaces grouped summary rows for
// same-signature zones, even when names differ.

test('same-signature zones (arm_l / arm_r) produce a grouped summary row', () => {
  resetState();
  const base = {
    AV: 1, 'Dur%': 0, health: 200, Con: 0,
    ExMult: null, ExTarget: 'Main', 'ToMain%': 0.5, MainCap: 0, IsFatal: false
  };
  const zoneL = { zone_name: 'arm_l', ...base };
  const zoneR = { zone_name: 'arm_r', ...base };
  const enemy = makeEnemy({ zones: [zoneL, zoneR] });
  const sortedRows = [makeRow(zoneL, 0), makeRow(zoneR, 1)];

  const { tbody } = renderIntoTbody(sortedRows, enemy);

  const rows = [...getDirectChildren(tbody)];
  const summaryRows = rows.filter((tr) => tr.classList.contains('zone-group-summary'));
  assert.equal(summaryRows.length, 1, 'same-signature zones must produce exactly one summary row');
  assert.equal(
    rows.filter((tr) => tr.classList.contains('zone-group-member')).length,
    2,
    'same-signature zones must produce two member rows'
  );
  // Plain rows (no class) must be absent — both zones are grouped.
  const plainRows = rows.filter(
    (tr) => !tr.classList.contains('zone-group-summary') && !tr.classList.contains('zone-group-member')
  );
  assert.equal(plainRows.length, 0, 'no plain rows expected when both zones belong to a group');
});

test('grouped summary row label derives a shared term for auto families', () => {
  resetState();
  const base = {
    AV: 1, 'Dur%': 0, health: 200, Con: 0,
    ExMult: null, ExTarget: 'Main', 'ToMain%': 0.5, MainCap: 0, IsFatal: false
  };
  const zoneL = { zone_name: 'arm_l', ...base };
  const zoneR = { zone_name: 'arm_r', ...base };
  const enemy = makeEnemy({ zones: [zoneL, zoneR] });
  const sortedRows = [makeRow(zoneL, 0), makeRow(zoneR, 1)];

  const { tbody } = renderIntoTbody(sortedRows, enemy);

  const summaryRow = [...getDirectChildren(tbody)].find((tr) => tr.classList.contains('zone-group-summary'));
  const nameCell = getDirectChildren(summaryRow)[0];
  assert.ok(
    nameCell.textContent.includes('arm'),
    `Expected name cell to include "arm", got: "${nameCell.textContent}"`
  );
  assert.ok(
    !nameCell.textContent.includes('arm l'),
    `Expected name cell to omit representative name "arm l", got: "${nameCell.textContent}"`
  );
  assert.ok(
    !nameCell.textContent.includes('Exact-stat group'),
    `Expected name cell to avoid the generic fallback label, got: "${nameCell.textContent}"`
  );
  assert.ok(
    nameCell.textContent.includes('×2'),
    `Expected summaryLabel to include "×2", got: "${nameCell.textContent}"`
  );
});

test('grouped summary row falls back to the generic exact-stat label for unrelated names', () => {
  resetState();
  const base = {
    AV: 1, 'Dur%': 0, health: 200, Con: 0,
    ExMult: null, ExTarget: 'Main', 'ToMain%': 0.5, MainCap: 0, IsFatal: false
  };
  const zoneA = { zone_name: 'left_arm', ...base };
  const zoneB = { zone_name: 'rear_exhaust', ...base };
  const enemy = makeEnemy({ zones: [zoneA, zoneB] });
  const sortedRows = [makeRow(zoneA, 0), makeRow(zoneB, 1)];

  const { tbody } = renderIntoTbody(sortedRows, enemy);

  const summaryRow = [...getDirectChildren(tbody)].find((tr) => tr.classList.contains('zone-group-summary'));
  const nameCell = getDirectChildren(summaryRow)[0];
  assert.ok(
    nameCell.textContent.includes('Exact-stat group'),
    `Expected name cell to include "Exact-stat group", got: "${nameCell.textContent}"`
  );
  assert.ok(
    nameCell.textContent.includes('×2'),
    `Expected summaryLabel to include "×2", got: "${nameCell.textContent}"`
  );
});

test('same-signature compound names (armor_lower_l_arm / armor_lower_r_arm) group correctly', () => {
  resetState();
  const base = {
    AV: 2, 'Dur%': 0, health: 300, Con: 0,
    ExMult: null, ExTarget: 'Main', 'ToMain%': 0.5, MainCap: 0, IsFatal: false
  };
  const zoneL = { zone_name: 'armor_lower_l_arm', ...base };
  const zoneR = { zone_name: 'armor_lower_r_arm', ...base };
  const enemy = makeEnemy({ zones: [zoneL, zoneR] });
  const sortedRows = [makeRow(zoneL, 0), makeRow(zoneR, 1)];

  const { tbody } = renderIntoTbody(sortedRows, enemy);

  const rows = [...getDirectChildren(tbody)];
  const summaryRows = rows.filter((tr) => tr.classList.contains('zone-group-summary'));
  assert.equal(summaryRows.length, 1, 'compound compact l/r zones must collapse to one summary row');
});

// ─── Focused-table integration: sorted row ordering ───────────────────────────
// Verifies that the renderer's pre-collection phase handles any row ordering
// from sortEnemyZoneRows — including when family members arrive in reverse
// order or are interleaved with other zones.

test('family members in reverse sort order still produce a grouped summary row', () => {
  resetState();
  const base = {
    AV: 1, 'Dur%': 0, health: 200, Con: 0,
    ExMult: null, ExTarget: 'Main', 'ToMain%': 0.5, MainCap: 0, IsFatal: false
  };
  const zoneL = makeZone({ zone_name: 'left_arm', ...base });
  const zoneR = makeZone({ zone_name: 'right_arm', ...base });
  const enemy = makeEnemy({ zones: [zoneL, zoneR] });
  // Deliberately reversed: right (idx 1) before left (idx 0).
  const sortedRows = [makeRow(zoneR, 1), makeRow(zoneL, 0)];

  const { tbody } = renderIntoTbody(sortedRows, enemy);

  const rows = [...getDirectChildren(tbody)];
  assert.equal(
    rows.filter((tr) => tr.classList.contains('zone-group-summary')).length,
    1,
    'reversed family members must still produce one summary row'
  );
  assert.equal(
    rows.filter((tr) => tr.classList.contains('zone-group-member')).length,
    2,
    'reversed family must still produce two member rows'
  );
});

test('when family members are reversed the representative is still the lower-index zone', () => {
  resetState();
  const base = {
    AV: 1, 'Dur%': 0, health: 200, Con: 0,
    ExMult: null, ExTarget: 'Main', 'ToMain%': 0.5, MainCap: 0, IsFatal: false
  };
  const zoneL = makeZone({ zone_name: 'left_arm', ...base });
  const zoneR = makeZone({ zone_name: 'right_arm', ...base });
  const enemy = makeEnemy({ zones: [zoneL, zoneR] });
  // right_arm has zoneIndex=1 but left_arm has zoneIndex=0; representative should be idx 0.
  const sortedRows = [makeRow(zoneR, 1), makeRow(zoneL, 0)];

  const { rowEntries } = renderIntoTbody(sortedRows, enemy);

  const summaryEntry = rowEntries.find(({ tr }) => tr.classList.contains('zone-group-summary'));
  assert.ok(summaryEntry, 'must have a summary entry');
  assert.equal(summaryEntry.zoneIndex, 0, 'representative should be the lower-index zone (left_arm)');
  assert.equal(summaryEntry.zone.zone_name, 'left_arm');
});

test('family interleaved with singletons renders correctly regardless of member positions', () => {
  resetState();
  const base = { AV: 1, 'Dur%': 0, health: 200, Con: 0, ExMult: null, ExTarget: 'Main', 'ToMain%': 0.5, MainCap: 0, IsFatal: false };
  const zoneHead = makeZone({ zone_name: 'Head', AV: 0, health: 150, IsFatal: true });
  const zoneL = makeZone({ zone_name: 'left_arm', ...base });
  const zoneR = makeZone({ zone_name: 'right_arm', ...base });
  const zoneChest = makeZone({ zone_name: 'chest', AV: 3, health: 500 });
  const enemy = makeEnemy({ zones: [zoneHead, zoneL, zoneR, zoneChest] });

  // Simulate outcome-sorted order: Head and Chest are singletons interleaved with family members.
  // Sorted by shots (hypothetical): right_arm, left_arm, head, chest
  const sortedRows = [
    makeRow(zoneR, 2),
    makeRow(zoneL, 1),
    makeRow(zoneHead, 0),
    makeRow(zoneChest, 3)
  ];

  const { tbody } = renderIntoTbody(sortedRows, enemy);

  const rows = [...getDirectChildren(tbody)];
  const summaryRows = rows.filter((tr) => tr.classList.contains('zone-group-summary'));
  const memberRows = rows.filter((tr) => tr.classList.contains('zone-group-member'));
  const plainRows = rows.filter(
    (tr) => !tr.classList.contains('zone-group-summary') && !tr.classList.contains('zone-group-member')
  );

  assert.equal(summaryRows.length, 1, 'one summary row for the arm group');
  assert.equal(memberRows.length, 2, 'two member rows for left/right arm');
  assert.equal(plainRows.length, 2, 'two plain rows for Head and chest singletons');
  // Total: 1 summary + 2 members + 2 plain = 5
  assert.equal(rows.length, 5);
});

// ─── Focused-table integration: sortEnemyZoneRows pipeline ───────────────────
// Verifies the full renderer pipeline that enemy-focused-table.js uses:
//   sortEnemyZoneRows output → renderGroupedEnemyRows → grouped summary rows.
// This pins that a detected family survives the sort step intact.

import { sortEnemyZoneRows } from '../calculator/compare-utils.js';

test('sortEnemyZoneRows + renderGroupedEnemyRows: family survives default sort', () => {
  resetState();
  const base = {
    AV: 1, 'Dur%': 0, health: 200, Con: 0,
    ExMult: null, ExTarget: 'Main', 'ToMain%': 0.5, MainCap: 0, IsFatal: false
  };
  const zoneL = makeZone({ zone_name: 'left_arm', ...base });
  const zoneR = makeZone({ zone_name: 'right_arm', ...base });
  const enemy = makeEnemy({ zones: [zoneL, zoneR] });
  const rawRows = [makeRow(zoneL, 0), makeRow(zoneR, 1)];

  const sortedRows = sortEnemyZoneRows(rawRows, { mode: 'single', sortKey: 'zone_name', sortDir: 'asc', pinMain: false });

  const { tbody } = renderIntoTbody(sortedRows, enemy);

  const rows = [...getDirectChildren(tbody)];
  assert.equal(
    rows.filter((tr) => tr.classList.contains('zone-group-summary')).length,
    1,
    'family must still produce summary row after sortEnemyZoneRows'
  );
});

test('sortEnemyZoneRows + renderGroupedEnemyRows: compact l/r family survives sort', () => {
  resetState();
  const base = {
    AV: 1, 'Dur%': 0, health: 200, Con: 0,
    ExMult: null, ExTarget: 'Main', 'ToMain%': 0.5, MainCap: 0, IsFatal: false
  };
  const zoneL = { zone_name: 'leg_l', ...base };
  const zoneR = { zone_name: 'leg_r', ...base };
  const enemy = makeEnemy({ zones: [zoneL, zoneR] });
  const rawRows = [makeRow(zoneL, 0), makeRow(zoneR, 1)];

  const sortedRows = sortEnemyZoneRows(rawRows, { mode: 'single', sortKey: 'zone_name', sortDir: 'asc', pinMain: false });

  const tbody = globalThis.document.createElement('tbody');
  renderGroupedEnemyRows(tbody, sortedRows, enemy, { columns: MINIMAL_COLUMNS });

  const rows = [...getDirectChildren(tbody)];
  assert.equal(
    rows.filter((tr) => tr.classList.contains('zone-group-summary')).length,
    1,
    'compact l/r family must produce summary row after sort step'
  );
  assert.equal(
    rows.filter((tr) => tr.classList.contains('zone-group-member')).length,
    2
  );
});

test('sortEnemyZoneRows + renderGroupedEnemyRows: exact-signature leg variants collapse into one summary row', () => {
  resetState();
  const base = {
    AV: 1, 'Dur%': 0.5, health: 200, Con: 0,
    ExMult: null, ExTarget: 'Main', 'ToMain%': 0.6, MainCap: 0, IsFatal: false
  };
  const zones = [
    { zone_name: 'hitzone_l_rear_leg', ...base },
    { zone_name: 'hitzone_r_rear_leg', ...base },
    { zone_name: 'hitzone_l_front_leg', ...base },
    { zone_name: 'hitzone_r_front_leg', ...base }
  ];
  const enemy = makeEnemy({ zones });
  const rawRows = zones.map((zone, zoneIndex) => makeRow(zone, zoneIndex));

  const sortedRows = sortEnemyZoneRows(rawRows, { mode: 'single', sortKey: 'zone_name', sortDir: 'asc', pinMain: false });

  const tbody = globalThis.document.createElement('tbody');
  renderGroupedEnemyRows(tbody, sortedRows, enemy, { columns: MINIMAL_COLUMNS });

  const rows = [...getDirectChildren(tbody)];
  const summaryRows = rows.filter((tr) => tr.classList.contains('zone-group-summary'));
  const memberRows = rows.filter((tr) => tr.classList.contains('zone-group-member'));
  assert.equal(summaryRows.length, 1, 'exact-signature leg variants must collapse into one summary row');
  assert.equal(memberRows.length, 4, 'all four exact-match legs should remain inspectable as members');
  const summaryText = getDirectChildren(summaryRows[0])[0].textContent;
  assert.ok(summaryText.includes('leg'));
  assert.ok(summaryText.includes('×4'));
});

test('sortEnemyZoneRows + renderGroupedEnemyRows: outcome-grouped sort keeps family together', () => {
  resetState();
  const base = {
    AV: 0, 'Dur%': 0, health: 200, Con: 0,
    ExMult: null, ExTarget: 'Main', 'ToMain%': 0.5, MainCap: 0, IsFatal: false
  };
  const zoneMain = makeZone({ zone_name: 'Main', health: 800, 'ToMain%': 1 });
  const zoneL = makeZone({ zone_name: 'left_arm', ...base });
  const zoneR = makeZone({ zone_name: 'right_arm', ...base });
  const slotA = makeSlotMetrics({ outcomeKind: 'limb', zoneShotsToKill: 3, mainShotsToKill: 6 });
  const armMetrics = { bySlot: { A: slotA, B: null }, diffShots: null, diffTtkSeconds: null };
  const enemy = makeEnemy({ zones: [zoneMain, zoneL, zoneR] });
  const rawRows = [
    makeRow(zoneMain, 0, { metrics: null }),
    makeRow(zoneL, 1, { metrics: armMetrics }),
    makeRow(zoneR, 2, { metrics: armMetrics })
  ];

  const sortedRows = sortEnemyZoneRows(rawRows, {
    mode: 'single',
    sortKey: 'shotsA',
    sortDir: 'asc',
    groupMode: 'outcome',
    pinMain: true
  });

  const tbody = globalThis.document.createElement('tbody');
  renderGroupedEnemyRows(tbody, sortedRows, enemy, { columns: MINIMAL_COLUMNS });

  const rows = [...getDirectChildren(tbody)];
  const summaryRows = rows.filter((tr) => tr.classList.contains('zone-group-summary'));
  assert.equal(summaryRows.length, 1, 'arm family must still produce one summary row after outcome sort');
});
