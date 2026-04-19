// Pinning tests for weapons/table.js — locks current sorting, filtering,
// durable-ratio, grouping and DOM-rendering behaviour so a later
// query-pipeline / row-renderer split is safer.

import test from 'node:test';
import assert from 'node:assert/strict';
import './env-stubs.js';
import { TestDocument, collectElements as collect } from './dom-stubs.js';

/* ---------- minimal environment stubs ---------- */

const { ingestHeadersAndRows, state } = await import('../weapons/data.js');
const {
  DURABLE_RATIO_HEADER,
  isNumber,
  guessNumericColumn,
  groupSortValue,
  renderTable,
  sortAndRenderBody,
  applyFilters
} = await import('../weapons/table.js');

/* ---------- DOM helpers ---------- */

function snapshotState() {
  return {
    headers: state.headers, rows: state.rows, groups: state.groups,
    filteredGroups: state.filteredGroups, filterActive: state.filterActive,
    searchQuery: state.searchQuery, activeTypes: [...state.activeTypes],
    activeSubs: [...state.activeSubs], activeRoles: [...state.activeRoles],
    sortKey: state.sortKey,
    sortDir: state.sortDir, typeIndex: state.typeIndex, subIndex: state.subIndex,
    roleIndex: state.roleIndex, searchIndex: state.searchIndex,
    pinnedWeapons: new Set(state.pinnedWeapons),
    patchVersion: state.patchVersion, keys: { ...state.keys }
  };
}

function restoreState(s) {
  state.headers = s.headers; state.rows = s.rows; state.groups = s.groups;
  state.filteredGroups = s.filteredGroups; state.filterActive = s.filterActive;
  state.searchQuery = s.searchQuery; state.activeTypes = [...s.activeTypes];
  state.activeSubs = [...s.activeSubs]; state.activeRoles = [...s.activeRoles];
  state.sortKey = s.sortKey;
  state.sortDir = s.sortDir; state.typeIndex = s.typeIndex;
  state.subIndex = s.subIndex; state.roleIndex = s.roleIndex;
  state.searchIndex = s.searchIndex;
  state.pinnedWeapons = new Set(s.pinnedWeapons);
  state.patchVersion = s.patchVersion; state.keys = { ...s.keys };
}

function withFixture(cb) {
  const prevDoc = globalThis.document;
  const snap = snapshotState();
  globalThis.document = new TestDocument();
  document.registerElement('thead', 'thead');
  document.registerElement('tbody', 'tbody');
  document.registerElement('typeFilters', 'div');
  document.registerElement('subFilters', 'div');
  try { return cb({ thead: document.getElementById('thead'), tbody: document.getElementById('tbody') }); }
  finally { globalThis.document = prevDoc; restoreState(snap); }
}

/* ---------- shared fixture data ---------- */
const STD_HEADERS = ['Type', 'Sub', 'Code', 'Name', 'RPM', 'Atk Type', 'Atk Name', 'DMG', 'DUR', 'AP', 'DF', 'ST', 'PF'];

function mkRow(overrides) {
  return {
    Type: 'Primary', Sub: 'AR', Code: 'AR-01', Name: 'TestGun',
    RPM: 600, 'Atk Type': 'Projectile', 'Atk Name': 'Bullet',
    DMG: 100, DUR: 25, AP: 2, DF: 10, ST: 15, PF: 10,
    ...overrides
  };
}

function bodyRows(tbody) {
  return collect(tbody, el => el.tagName === 'TR');
}

function headerTexts(thead) {
  return collect(thead, el => el.tagName === 'TH').map(el => el.textContent);
}

function nameColumn(tbody, thead) {
  const hdrs = headerTexts(thead);
  const nameIdx = hdrs.indexOf('Name');
  return bodyRows(tbody).map(tr => tr.children[nameIdx]?.textContent || '');
}

/* ============================================================
   1. isNumber — pure-function edge cases
   ============================================================ */

test('isNumber recognises integers, floats, zero, negative', () => {
  assert.ok(isNumber(42));
  assert.ok(isNumber('42'));
  assert.ok(isNumber(0));
  assert.ok(isNumber('0'));
  assert.ok(isNumber(-3.14));
  assert.ok(isNumber('1e5'));
});

test('isNumber rejects null, empty, NaN, plain strings', () => {
  assert.ok(!isNumber(null));
  assert.ok(!isNumber(''));
  assert.ok(!isNumber('abc'));
  assert.ok(!isNumber(NaN));
  assert.ok(!isNumber(undefined));
});

/* ============================================================
   2. guessNumericColumn
   ============================================================ */

test('guessNumericColumn always returns true for DURABLE_RATIO_HEADER', () => withFixture(() => {
  ingestHeadersAndRows(STD_HEADERS, [mkRow()]);
  assert.ok(guessNumericColumn(DURABLE_RATIO_HEADER));
}));

test('guessNumericColumn recognises DMG as numeric', () => withFixture(() => {
  ingestHeadersAndRows(STD_HEADERS, [
    mkRow({ Name: 'A', DMG: 100 }),
    mkRow({ Name: 'B', DMG: 80 }),
    mkRow({ Name: 'C', DMG: 60 })
  ]);
  assert.ok(guessNumericColumn('DMG'));
}));

test('guessNumericColumn recognises Name as non-numeric', () => withFixture(() => {
  ingestHeadersAndRows(STD_HEADERS, [
    mkRow({ Name: 'Alpha' }),
    mkRow({ Name: 'Beta' }),
    mkRow({ Name: 'Gamma' })
  ]);
  assert.ok(!guessNumericColumn('Name'));
}));

/* ============================================================
   3. groupSortValue
   ============================================================ */

test('groupSortValue returns group name for nameKey', () => withFixture(() => {
  ingestHeadersAndRows(STD_HEADERS, [mkRow({ Name: 'Liberator' })]);
  const group = state.groups[0];
  assert.equal(groupSortValue(group, 'Name', false), 'Liberator');
}));

test('groupSortValue returns max numeric value for numeric columns', () => withFixture(() => {
  ingestHeadersAndRows(STD_HEADERS, [
    mkRow({ Name: 'Multi', DMG: 100 }),
    mkRow({ Name: 'Multi', DMG: 200 })
  ]);
  const group = state.groups[0];
  assert.equal(groupSortValue(group, 'DMG', true), 200);
}));

test('groupSortValue returns NEGATIVE_INFINITY for group with no valid numbers', () => withFixture(() => {
  ingestHeadersAndRows(STD_HEADERS, [mkRow({ Name: 'X', DMG: 'n/a' })]);
  const group = state.groups[0];
  assert.equal(groupSortValue(group, 'DMG', true), Number.NEGATIVE_INFINITY);
}));

test('groupSortValue returns first non-empty string for text columns', () => withFixture(() => {
  ingestHeadersAndRows(STD_HEADERS, [
    mkRow({ Name: 'Multi', Sub: '' }),
    mkRow({ Name: 'Multi', Sub: 'SMG' })
  ]);
  const group = state.groups[0];
  assert.equal(groupSortValue(group, 'Sub', false), 'SMG');
}));

test('groupSortValue returns max durable ratio from projectile rows for DURABLE_RATIO_HEADER', () => withFixture(() => {
  ingestHeadersAndRows(STD_HEADERS, [
    mkRow({ Name: 'Hybrid', 'Atk Type': 'Projectile', DMG: 100, DUR: 50 }),
    mkRow({ Name: 'Hybrid', 'Atk Type': 'Explosion', DMG: 100, DUR: 100 })
  ]);
  const group = state.groups[0];
  const val = groupSortValue(group, DURABLE_RATIO_HEADER, true);
  assert.equal(val, 0.5);
}));

test('groupSortValue falls back to all rows when no projectile rows have durable ratio', () => withFixture(() => {
  ingestHeadersAndRows(STD_HEADERS, [
    mkRow({ Name: 'PureExplosive', 'Atk Type': 'Explosion', DMG: 120, DUR: 120 })
  ]);
  const group = state.groups[0];
  const val = groupSortValue(group, DURABLE_RATIO_HEADER, true);
  assert.equal(val, 1);
}));

/* ============================================================
   4. sortAndRenderBody — ordering behaviour
   ============================================================ */

test('no sort key preserves original insertion order', () => withFixture(({ thead, tbody }) => {
  ingestHeadersAndRows(STD_HEADERS, [
    mkRow({ Name: 'Zephyr' }),
    mkRow({ Name: 'Alpha' }),
    mkRow({ Name: 'Mango' })
  ]);
  state.sortKey = null;
  renderTable();
  const names = nameColumn(tbody, thead);
  assert.deepEqual(names, ['Zephyr', 'Alpha', 'Mango']);
}));

test('sort by Name ascending', () => withFixture(({ thead, tbody }) => {
  ingestHeadersAndRows(STD_HEADERS, [
    mkRow({ Name: 'Zephyr' }),
    mkRow({ Name: 'Alpha' }),
    mkRow({ Name: 'Mango' })
  ]);
  state.sortKey = 'Name';
  state.sortDir = 'asc';
  renderTable();
  const names = nameColumn(tbody, thead);
  assert.deepEqual(names, ['Alpha', 'Mango', 'Zephyr']);
}));

test('sort by Name descending', () => withFixture(({ thead, tbody }) => {
  ingestHeadersAndRows(STD_HEADERS, [
    mkRow({ Name: 'Zephyr' }),
    mkRow({ Name: 'Alpha' }),
    mkRow({ Name: 'Mango' })
  ]);
  state.sortKey = 'Name';
  state.sortDir = 'desc';
  renderTable();
  const names = nameColumn(tbody, thead);
  assert.deepEqual(names, ['Zephyr', 'Mango', 'Alpha']);
}));

test('sort by numeric column DMG ascending', () => withFixture(({ thead, tbody }) => {
  ingestHeadersAndRows(STD_HEADERS, [
    mkRow({ Name: 'High', DMG: 200 }),
    mkRow({ Name: 'Low', DMG: 50 }),
    mkRow({ Name: 'Mid', DMG: 100 })
  ]);
  state.sortKey = 'DMG';
  state.sortDir = 'asc';
  renderTable();
  const names = nameColumn(tbody, thead);
  assert.deepEqual(names, ['Low', 'Mid', 'High']);
}));

test('sort by numeric column DMG descending', () => withFixture(({ thead, tbody }) => {
  ingestHeadersAndRows(STD_HEADERS, [
    mkRow({ Name: 'High', DMG: 200 }),
    mkRow({ Name: 'Low', DMG: 50 }),
    mkRow({ Name: 'Mid', DMG: 100 })
  ]);
  state.sortKey = 'DMG';
  state.sortDir = 'desc';
  renderTable();
  const names = nameColumn(tbody, thead);
  assert.deepEqual(names, ['High', 'Mid', 'Low']);
}));

/* ============================================================
   5. Pinned rows — always first, independently sorted
   ============================================================ */

test('pinned weapons appear before unpinned regardless of sort', () => withFixture(({ thead, tbody }) => {
  ingestHeadersAndRows(STD_HEADERS, [
    mkRow({ Name: 'Alpha', DMG: 10 }),
    mkRow({ Name: 'Beta', DMG: 200 }),
    mkRow({ Name: 'Gamma', DMG: 50 })
  ]);
  state.pinnedWeapons = new Set(['Gamma']);
  state.sortKey = 'DMG';
  state.sortDir = 'desc';
  renderTable();
  const names = nameColumn(tbody, thead);
  assert.equal(names[0], 'Gamma');
  assert.deepEqual(names.slice(1), ['Beta', 'Alpha']);
}));

test('multiple pinned weapons are sorted among themselves', () => withFixture(({ thead, tbody }) => {
  ingestHeadersAndRows(STD_HEADERS, [
    mkRow({ Name: 'Alpha', DMG: 10 }),
    mkRow({ Name: 'Beta', DMG: 200 }),
    mkRow({ Name: 'Gamma', DMG: 50 }),
    mkRow({ Name: 'Delta', DMG: 150 })
  ]);
  state.pinnedWeapons = new Set(['Alpha', 'Gamma']);
  state.sortKey = 'DMG';
  state.sortDir = 'desc';
  renderTable();
  const names = nameColumn(tbody, thead);
  assert.deepEqual(names.slice(0, 2), ['Gamma', 'Alpha']);
  assert.deepEqual(names.slice(2), ['Beta', 'Delta']);
}));

test('pinned weapons with no sort key keep insertion order within pinned/unpinned', () => withFixture(({ thead, tbody }) => {
  ingestHeadersAndRows(STD_HEADERS, [
    mkRow({ Name: 'A' }),
    mkRow({ Name: 'B' }),
    mkRow({ Name: 'C' }),
    mkRow({ Name: 'D' })
  ]);
  state.pinnedWeapons = new Set(['C', 'A']);
  state.sortKey = null;
  renderTable();
  const names = nameColumn(tbody, thead);
  assert.deepEqual(names.slice(0, 2), ['A', 'C']);
  assert.deepEqual(names.slice(2), ['B', 'D']);
}));

/* ============================================================
   6. Multi-row groups — DOM structure
   ============================================================ */

test('multi-row group renders all rows with group-start on first only', () => withFixture(({ tbody }) => {
  ingestHeadersAndRows(STD_HEADERS, [
    mkRow({ Name: 'MultiGun', 'Atk Type': 'Projectile', DMG: 100 }),
    mkRow({ Name: 'MultiGun', 'Atk Type': 'Explosion', DMG: 50 })
  ]);
  state.sortKey = null;
  renderTable();
  const rows = bodyRows(tbody);
  assert.equal(rows.length, 2);
  assert.ok(rows[0].classList.contains('group-start'));
  assert.ok(!rows[1].classList.contains('group-start'));
}));

test('subsequent rows in a group blank the Name, Type and Code cells', () => withFixture(({ thead, tbody }) => {
  ingestHeadersAndRows(STD_HEADERS, [
    mkRow({ Name: 'Duo', Type: 'Primary', Code: 'DU-1', 'Atk Type': 'Projectile', DMG: 100 }),
    mkRow({ Name: 'Duo', Type: 'Primary', Code: 'DU-1', 'Atk Type': 'Explosion', DMG: 50 })
  ]);
  renderTable();
  const hdrs = headerTexts(thead);
  const rows = bodyRows(tbody);
  const nameIdx = hdrs.indexOf('Name');
  const typeIdx = hdrs.indexOf('Type');
  const codeIdx = hdrs.indexOf('Code');
  // First row has values
  assert.ok(rows[0].children[nameIdx].textContent.length > 0);
  // Second row blanks name/type/code
  assert.equal(rows[1].children[nameIdx].textContent, '');
  assert.equal(rows[1].children[typeIdx].textContent, '');
  assert.equal(rows[1].children[codeIdx].textContent, '');
}));

/* ============================================================
   7. Pin button placement
   ============================================================ */

test('pin button only on first row of each group', () => withFixture(({ tbody }) => {
  ingestHeadersAndRows(STD_HEADERS, [
    mkRow({ Name: 'Duo', 'Atk Type': 'Projectile' }),
    mkRow({ Name: 'Duo', 'Atk Type': 'Explosion' })
  ]);
  renderTable();
  const rows = bodyRows(tbody);
  const firstPinTd = rows[0].children[0];
  const secondPinTd = rows[1].children[0];
  const firstBtns = collect(firstPinTd, el => el.tagName === 'BUTTON');
  const secondBtns = collect(secondPinTd, el => el.tagName === 'BUTTON');
  assert.equal(firstBtns.length, 1);
  assert.equal(secondBtns.length, 0);
}));

test('pin button has pinned class when weapon is pinned', () => withFixture(({ tbody }) => {
  ingestHeadersAndRows(STD_HEADERS, [mkRow({ Name: 'Pinnable' })]);
  state.pinnedWeapons = new Set(['Pinnable']);
  renderTable();
  const rows = bodyRows(tbody);
  const btn = collect(rows[0].children[0], el => el.tagName === 'BUTTON')[0];
  assert.ok(btn.classList.contains('pinned'));
  assert.ok(btn.classList.contains('pin-btn'));
}));

test('pin button does not have pinned class when weapon is not pinned', () => withFixture(({ tbody }) => {
  ingestHeadersAndRows(STD_HEADERS, [mkRow({ Name: 'Unpinned' })]);
  state.pinnedWeapons = new Set();
  renderTable();
  const rows = bodyRows(tbody);
  const btn = collect(rows[0].children[0], el => el.tagName === 'BUTTON')[0];
  assert.ok(!btn.classList.contains('pinned'));
  assert.ok(btn.classList.contains('pin-btn'));
}));

/* ============================================================
   8. Name link rendering
   ============================================================ */

test('first row Name cell renders a wiki link', () => withFixture(({ thead, tbody }) => {
  ingestHeadersAndRows(STD_HEADERS, [mkRow({ Name: 'Liberator' })]);
  renderTable();
  const hdrs = headerTexts(thead);
  const nameIdx = hdrs.indexOf('Name');
  const nameTd = bodyRows(tbody)[0].children[nameIdx];
  const links = collect(nameTd, el => el.tagName === 'A');
  assert.equal(links.length, 1);
  assert.ok(links[0].href.includes('Liberator'));
  assert.equal(links[0].target, '_blank');
}));

test('wiki link strips parenthesised qualifiers from name', () => withFixture(({ thead, tbody }) => {
  ingestHeadersAndRows(STD_HEADERS, [mkRow({ Name: 'Breaker (Incendiary)' })]);
  renderTable();
  const hdrs = headerTexts(thead);
  const nameIdx = hdrs.indexOf('Name');
  const link = collect(bodyRows(tbody)[0].children[nameIdx], el => el.tagName === 'A')[0];
  assert.ok(link.href.includes('Breaker'));
  assert.ok(!link.href.includes('Incendiary'));
}));

/* ============================================================
   9. Number formatting in cells
   ============================================================ */

test('integer numbers render without trailing decimals', () => withFixture(({ thead, tbody }) => {
  ingestHeadersAndRows(STD_HEADERS, [mkRow({ Name: 'Fmt', DMG: 100 })]);
  renderTable();
  const hdrs = headerTexts(thead);
  const dmgIdx = hdrs.indexOf('DMG');
  assert.equal(bodyRows(tbody)[0].children[dmgIdx].textContent, '100');
}));

test('decimal numbers render with up to 3 decimal places', () => withFixture(({ thead, tbody }) => {
  ingestHeadersAndRows(STD_HEADERS, [mkRow({ Name: 'Dec', DMG: 3.14159 })]);
  renderTable();
  const hdrs = headerTexts(thead);
  const dmgIdx = hdrs.indexOf('DMG');
  assert.equal(bodyRows(tbody)[0].children[dmgIdx].textContent, '3.142');
}));

/* ============================================================
   10. CSS classes — AP / DF / attack-type colouring
   ============================================================ */

test('AP cell gets correct colour class for AP=3', () => withFixture(({ thead, tbody }) => {
  ingestHeadersAndRows(STD_HEADERS, [mkRow({ Name: 'ApTest', AP: 3 })]);
  renderTable();
  const hdrs = headerTexts(thead);
  const apIdx = hdrs.indexOf('AP');
  const apTd = bodyRows(tbody)[0].children[apIdx];
  assert.ok(apTd.classList.contains('ap-green'));
}));

test('AP cell gets ap-red for AP=6', () => withFixture(({ thead, tbody }) => {
  ingestHeadersAndRows(STD_HEADERS, [mkRow({ Name: 'Heavy', AP: 6 })]);
  renderTable();
  const hdrs = headerTexts(thead);
  const apIdx = hdrs.indexOf('AP');
  assert.ok(bodyRows(tbody)[0].children[apIdx].classList.contains('ap-red'));
}));

test('DF cell gets num-orange for DF=40', () => withFixture(({ thead, tbody }) => {
  ingestHeadersAndRows(STD_HEADERS, [mkRow({ Name: 'DfTest', DF: 40 })]);
  renderTable();
  const hdrs = headerTexts(thead);
  const dfIdx = hdrs.indexOf('DF');
  assert.ok(bodyRows(tbody)[0].children[dfIdx].classList.contains('num-orange'));
}));

test('DF cell gets num-red for DF=50', () => withFixture(({ thead, tbody }) => {
  ingestHeadersAndRows(STD_HEADERS, [mkRow({ Name: 'DfHigh', DF: 50 })]);
  renderTable();
  const hdrs = headerTexts(thead);
  const dfIdx = hdrs.indexOf('DF');
  assert.ok(bodyRows(tbody)[0].children[dfIdx].classList.contains('num-red'));
}));

test('Explosion attack type colours DMG cell num-orange', () => withFixture(({ thead, tbody }) => {
  ingestHeadersAndRows(STD_HEADERS, [mkRow({ Name: 'Boom', 'Atk Type': 'Explosion' })]);
  renderTable();
  const hdrs = headerTexts(thead);
  const dmgIdx = hdrs.indexOf('DMG');
  assert.ok(bodyRows(tbody)[0].children[dmgIdx].classList.contains('num-orange'));
}));

/* ============================================================
   11. Header sort indicators
   ============================================================ */

test('sorted column header gets sort-asc class', () => withFixture(({ thead }) => {
  ingestHeadersAndRows(STD_HEADERS, [mkRow()]);
  state.sortKey = 'DMG';
  state.sortDir = 'asc';
  renderTable();
  const ths = collect(thead, el => el.tagName === 'TH');
  const dmgTh = ths.find(th => th.textContent === 'DMG');
  assert.ok(dmgTh.classList.contains('sort-asc'));
}));

test('sorted column header gets sort-desc class', () => withFixture(({ thead }) => {
  ingestHeadersAndRows(STD_HEADERS, [mkRow()]);
  state.sortKey = 'DMG';
  state.sortDir = 'desc';
  renderTable();
  const ths = collect(thead, el => el.tagName === 'TH');
  const dmgTh = ths.find(th => th.textContent === 'DMG');
  assert.ok(dmgTh.classList.contains('sort-desc'));
}));

test('non-sorted columns have no sort indicator class', () => withFixture(({ thead }) => {
  ingestHeadersAndRows(STD_HEADERS, [mkRow()]);
  state.sortKey = 'DMG';
  state.sortDir = 'asc';
  renderTable();
  const ths = collect(thead, el => el.tagName === 'TH');
  const nameTh = ths.find(th => th.textContent === 'Name');
  assert.ok(!nameTh.classList.contains('sort-asc'));
  assert.ok(!nameTh.classList.contains('sort-desc'));
}));

/* ============================================================
   12. getDisplayHeaders / durable ratio column placement
   ============================================================ */

test('DUR/DMG header inserted immediately after DUR column', () => withFixture(({ thead }) => {
  ingestHeadersAndRows(STD_HEADERS, [mkRow()]);
  renderTable();
  const hdrs = headerTexts(thead);
  const durIdx = hdrs.indexOf('DUR');
  assert.ok(durIdx >= 0);
  assert.equal(hdrs[durIdx + 1], DURABLE_RATIO_HEADER);
}));

test('DUR/DMG header not duplicated on re-render', () => withFixture(({ thead }) => {
  ingestHeadersAndRows(STD_HEADERS, [mkRow()]);
  renderTable();
  renderTable();
  const hdrs = headerTexts(thead);
  const count = hdrs.filter(h => h === DURABLE_RATIO_HEADER).length;
  assert.equal(count, 1);
}));

test('no DUR/DMG column when dmgKey is missing', () => withFixture(({ thead }) => {
  const noDmgHeaders = ['Type', 'Sub', 'Code', 'Name', 'RPM'];
  ingestHeadersAndRows(noDmgHeaders, [{ Type: 'Primary', Sub: 'AR', Code: 'X', Name: 'NoDmg', RPM: 100 }]);
  renderTable();
  const hdrs = headerTexts(thead);
  assert.ok(!hdrs.includes(DURABLE_RATIO_HEADER));
}));

/* ============================================================
   13. Durable ratio display model edge cases
   ============================================================ */

test('durable ratio cell shows percent and fraction for 1/4 ratio', () => withFixture(({ thead, tbody }) => {
  ingestHeadersAndRows(STD_HEADERS, [mkRow({ Name: 'Quarter', DMG: 100, DUR: 25 })]);
  renderTable();
  const hdrs = headerTexts(thead);
  const ratioIdx = hdrs.indexOf(DURABLE_RATIO_HEADER);
  const cell = bodyRows(tbody)[0].children[ratioIdx];
  assert.equal(cell.textContent, '25% (1/4)');
}));

test('durable ratio cell shows percent and fraction for 1/2 ratio', () => withFixture(({ thead, tbody }) => {
  ingestHeadersAndRows(STD_HEADERS, [mkRow({ Name: 'Half', DMG: 100, DUR: 50 })]);
  renderTable();
  const hdrs = headerTexts(thead);
  const ratioIdx = hdrs.indexOf(DURABLE_RATIO_HEADER);
  const cell = bodyRows(tbody)[0].children[ratioIdx];
  assert.equal(cell.textContent, '50% (1/2)');
}));

test('durable ratio cell shows percent and fraction for 3/4 ratio', () => withFixture(({ thead, tbody }) => {
  ingestHeadersAndRows(STD_HEADERS, [mkRow({ Name: 'ThreeQ', DMG: 100, DUR: 75 })]);
  renderTable();
  const hdrs = headerTexts(thead);
  const ratioIdx = hdrs.indexOf(DURABLE_RATIO_HEADER);
  const cell = bodyRows(tbody)[0].children[ratioIdx];
  assert.equal(cell.textContent, '75% (3/4)');
}));

test('durable ratio cell shows only percent when no close fraction', () => withFixture(({ thead, tbody }) => {
  // 31/100 = 0.31 — far from all n/d with d≤8 (nearest: 2/7≈0.286, 1/3≈0.333)
  ingestHeadersAndRows(STD_HEADERS, [mkRow({ Name: 'Odd', DMG: 100, DUR: 31 })]);
  renderTable();
  const hdrs = headerTexts(thead);
  const ratioIdx = hdrs.indexOf(DURABLE_RATIO_HEADER);
  const cell = bodyRows(tbody)[0].children[ratioIdx];
  assert.equal(cell.textContent, '31%');
}));

test('durable ratio cell is empty when DMG is zero', () => withFixture(({ thead, tbody }) => {
  ingestHeadersAndRows(STD_HEADERS, [mkRow({ Name: 'NoDmg', DMG: 0, DUR: 50 })]);
  renderTable();
  const hdrs = headerTexts(thead);
  const ratioIdx = hdrs.indexOf(DURABLE_RATIO_HEADER);
  const cell = bodyRows(tbody)[0].children[ratioIdx];
  assert.equal(cell.textContent, '');
}));

test('durable ratio cell shows 0% when DUR is null (null coerces to 0)', () => withFixture(({ thead, tbody }) => {
  ingestHeadersAndRows(STD_HEADERS, [mkRow({ Name: 'NoDur', DMG: 100, DUR: null })]);
  renderTable();
  const hdrs = headerTexts(thead);
  const ratioIdx = hdrs.indexOf(DURABLE_RATIO_HEADER);
  const cell = bodyRows(tbody)[0].children[ratioIdx];
  // null → Number(null) = 0, so ratio = 0/100 = 0 → "0%"
  assert.equal(cell.textContent, '0%');
}));

test('durable ratio is clamped to 100%', () => withFixture(({ thead, tbody }) => {
  ingestHeadersAndRows(STD_HEADERS, [mkRow({ Name: 'Over', DMG: 50, DUR: 100 })]);
  renderTable();
  const hdrs = headerTexts(thead);
  const ratioIdx = hdrs.indexOf(DURABLE_RATIO_HEADER);
  const cell = bodyRows(tbody)[0].children[ratioIdx];
  assert.equal(cell.textContent, '100%');
}));

test('durable ratio cell has calc-derived-cell class', () => withFixture(({ thead, tbody }) => {
  ingestHeadersAndRows(STD_HEADERS, [mkRow({ Name: 'Cls', DMG: 100, DUR: 25 })]);
  renderTable();
  const hdrs = headerTexts(thead);
  const ratioIdx = hdrs.indexOf(DURABLE_RATIO_HEADER);
  const cell = bodyRows(tbody)[0].children[ratioIdx];
  assert.ok(cell.classList.contains('calc-derived-cell'));
}));

test('durable ratio cell has muted class when empty', () => withFixture(({ thead, tbody }) => {
  ingestHeadersAndRows(STD_HEADERS, [mkRow({ Name: 'Muted', DMG: 0, DUR: 0 })]);
  renderTable();
  const hdrs = headerTexts(thead);
  const ratioIdx = hdrs.indexOf(DURABLE_RATIO_HEADER);
  const cell = bodyRows(tbody)[0].children[ratioIdx];
  assert.ok(cell.classList.contains('muted'));
}));

/* ============================================================
   14. Filter / search behaviour via applyFilters
   ============================================================ */

test('applyFilters with no active filters sets filterActive false', () => withFixture(({ tbody }) => {
  ingestHeadersAndRows(STD_HEADERS, [
    mkRow({ Name: 'A', Type: 'Primary' }),
    mkRow({ Name: 'B', Type: 'Support' })
  ]);
  state.activeTypes = [];
  state.activeSubs = [];
  state.searchQuery = '';
  applyFilters();
  assert.equal(state.filterActive, false);
}));

test('type filter keeps only matching groups', () => withFixture(({ thead, tbody }) => {
  ingestHeadersAndRows(STD_HEADERS, [
    mkRow({ Name: 'Rifle', Type: 'Primary' }),
    mkRow({ Name: 'MG', Type: 'Support' })
  ]);
  state.activeTypes = ['primary'];
  state.activeSubs = [];
  state.searchQuery = '';
  renderTable();
  applyFilters();
  assert.ok(state.filterActive);
  assert.equal(state.filteredGroups.length, 1);
  assert.equal(state.filteredGroups[0].name, 'Rifle');
}));

test('sub filter keeps only matching groups', () => withFixture(({ thead, tbody }) => {
  ingestHeadersAndRows(STD_HEADERS, [
    mkRow({ Name: 'Rifle', Type: 'Primary', Sub: 'AR' }),
    mkRow({ Name: 'Sniper', Type: 'Primary', Sub: 'SR' })
  ]);
  state.activeTypes = [];
  state.activeSubs = ['sr'];
  state.searchQuery = '';
  applyFilters();
  assert.ok(state.filterActive);
  assert.equal(state.filteredGroups.length, 1);
  assert.equal(state.filteredGroups[0].name, 'Sniper');
}));

test('combined type + sub filter intersects', () => withFixture(() => {
  ingestHeadersAndRows(STD_HEADERS, [
    mkRow({ Name: 'PriAR', Type: 'Primary', Sub: 'AR' }),
    mkRow({ Name: 'PriSR', Type: 'Primary', Sub: 'SR' }),
    mkRow({ Name: 'SupMG', Type: 'Support', Sub: 'MG' })
  ]);
  state.activeTypes = ['primary'];
  state.activeSubs = ['ar'];
  state.searchQuery = '';
  applyFilters();
  assert.equal(state.filteredGroups.length, 1);
  assert.equal(state.filteredGroups[0].name, 'PriAR');
}));

test('search query matches substring in group data', () => withFixture(() => {
  ingestHeadersAndRows(STD_HEADERS, [
    mkRow({ Name: 'Liberator', 'Atk Name': 'FMJ Burst' }),
    mkRow({ Name: 'Punisher', 'Atk Name': 'Shotgun Blast' })
  ]);
  state.activeTypes = [];
  state.activeSubs = [];
  state.searchQuery = 'liberator';
  applyFilters();
  assert.equal(state.filteredGroups.length, 1);
  assert.equal(state.filteredGroups[0].name, 'Liberator');
}));

test('space-separated search is AND', () => withFixture(() => {
  ingestHeadersAndRows(STD_HEADERS, [
    mkRow({ Name: 'Liberator', Sub: 'AR' }),
    mkRow({ Name: 'Liberator Penetrator', Sub: 'AR' }),
    mkRow({ Name: 'Punisher', Sub: 'SG' })
  ]);
  state.activeTypes = [];
  state.activeSubs = [];
  state.searchQuery = 'liberator penetrator';
  applyFilters();
  assert.equal(state.filteredGroups.length, 1);
  assert.equal(state.filteredGroups[0].name, 'Liberator Penetrator');
}));

test('pipe search is OR', () => withFixture(() => {
  ingestHeadersAndRows(STD_HEADERS, [
    mkRow({ Name: 'Liberator' }),
    mkRow({ Name: 'Punisher' }),
    mkRow({ Name: 'Dominator' })
  ]);
  state.activeTypes = [];
  state.activeSubs = [];
  state.searchQuery = 'liberator | punisher';
  applyFilters();
  const names = state.filteredGroups.map(g => g.name).sort();
  assert.deepEqual(names, ['Liberator', 'Punisher']);
}));

test('ampersand search is AND', () => withFixture(() => {
  ingestHeadersAndRows(STD_HEADERS, [
    mkRow({ Name: 'Liberator', Sub: 'AR' }),
    mkRow({ Name: 'Punisher', Sub: 'SG' })
  ]);
  state.activeTypes = [];
  state.activeSubs = [];
  state.searchQuery = 'liberator & ar';
  applyFilters();
  assert.equal(state.filteredGroups.length, 1);
  assert.equal(state.filteredGroups[0].name, 'Liberator');
}));

test('search with no results yields empty filteredGroups', () => withFixture(() => {
  ingestHeadersAndRows(STD_HEADERS, [mkRow({ Name: 'Alpha' })]);
  state.activeTypes = [];
  state.activeSubs = [];
  state.searchQuery = 'zzzznotfound';
  applyFilters();
  assert.equal(state.filteredGroups.length, 0);
  assert.ok(state.filterActive);
}));

test('pinned weapons always appear in filtered results despite type filter', () => withFixture(() => {
  ingestHeadersAndRows(STD_HEADERS, [
    mkRow({ Name: 'Rifle', Type: 'Primary' }),
    mkRow({ Name: 'MG', Type: 'Support' })
  ]);
  state.pinnedWeapons = new Set(['MG']);
  state.activeTypes = ['primary'];
  state.activeSubs = [];
  state.searchQuery = '';
  applyFilters();
  assert.ok(state.filterActive);
  const names = state.filteredGroups.map(g => g.name).sort();
  assert.deepEqual(names, ['MG', 'Rifle']);
}));

test('pinned weapons always appear despite search filter', () => withFixture(() => {
  ingestHeadersAndRows(STD_HEADERS, [
    mkRow({ Name: 'Liberator' }),
    mkRow({ Name: 'Punisher' })
  ]);
  state.pinnedWeapons = new Set(['Punisher']);
  state.activeTypes = [];
  state.activeSubs = [];
  state.searchQuery = 'liberator';
  applyFilters();
  const names = state.filteredGroups.map(g => g.name).sort();
  assert.deepEqual(names, ['Liberator', 'Punisher']);
}));

/* ============================================================
   15. sortAndRenderBody uses filteredGroups when filterActive
   ============================================================ */

test('sortAndRenderBody renders only filteredGroups when filterActive', () => withFixture(({ thead, tbody }) => {
  ingestHeadersAndRows(STD_HEADERS, [
    mkRow({ Name: 'Visible', Type: 'Primary' }),
    mkRow({ Name: 'Hidden', Type: 'Support' })
  ]);
  // renderTable populates thead so nameColumn helper can find indexes
  renderTable();
  state.activeTypes = ['primary'];
  state.activeSubs = [];
  state.searchQuery = '';
  applyFilters();
  const names = nameColumn(tbody, thead);
  assert.deepEqual(names, ['Visible']);
}));

/* ============================================================
   16. Pin column header
   ============================================================ */

test('first th in header row is the pin column with correct title', () => withFixture(({ thead }) => {
  ingestHeadersAndRows(STD_HEADERS, [mkRow()]);
  renderTable();
  const ths = collect(thead, el => el.tagName === 'TH');
  assert.equal(ths[0].title, 'Pin weapon');
  assert.equal(ths[0].textContent, '');
}));

/* ============================================================
   17. Durable ratio colour: explosion gets num-orange on ratio cell
   ============================================================ */

test('explosion row durable ratio cell gets num-orange class', () => withFixture(({ thead, tbody }) => {
  ingestHeadersAndRows(STD_HEADERS, [
    mkRow({ Name: 'Boom', 'Atk Type': 'Explosion', DMG: 100, DUR: 50 })
  ]);
  renderTable();
  const hdrs = headerTexts(thead);
  const ratioIdx = hdrs.indexOf(DURABLE_RATIO_HEADER);
  const cell = bodyRows(tbody)[0].children[ratioIdx];
  assert.ok(cell.classList.contains('num-orange'));
}));

test('projectile row durable ratio cell has no attack-type colour class', () => withFixture(({ thead, tbody }) => {
  ingestHeadersAndRows(STD_HEADERS, [
    mkRow({ Name: 'Bullet', 'Atk Type': 'Projectile', DMG: 100, DUR: 50 })
  ]);
  renderTable();
  const hdrs = headerTexts(thead);
  const ratioIdx = hdrs.indexOf(DURABLE_RATIO_HEADER);
  const cell = bodyRows(tbody)[0].children[ratioIdx];
  assert.ok(!cell.classList.contains('num-orange'));
  assert.ok(!cell.classList.contains('num-yellow'));
  assert.ok(!cell.classList.contains('num-cyan'));
  assert.ok(!cell.classList.contains('num-red'));
}));

/* ============================================================
   18. Atk Name truncation class and tooltip
   ============================================================ */

test('Atk Name cell gets trunc class and title tooltip', () => withFixture(({ thead, tbody }) => {
  ingestHeadersAndRows(STD_HEADERS, [mkRow({ Name: 'X', 'Atk Name': 'Super Long Attack Name' })]);
  renderTable();
  const hdrs = headerTexts(thead);
  const atkIdx = hdrs.indexOf('Atk Name');
  const cell = bodyRows(tbody)[0].children[atkIdx];
  assert.ok(cell.classList.contains('trunc'));
  assert.equal(cell.title, 'Super Long Attack Name');
}));

/* ============================================================
   19. Durable ratio title tooltip content
   ============================================================ */

test('durable ratio tooltip includes percentage, raw values, and fraction', () => withFixture(({ thead, tbody }) => {
  ingestHeadersAndRows(STD_HEADERS, [mkRow({ Name: 'TT', DMG: 200, DUR: 50 })]);
  renderTable();
  const hdrs = headerTexts(thead);
  const ratioIdx = hdrs.indexOf(DURABLE_RATIO_HEADER);
  const cell = bodyRows(tbody)[0].children[ratioIdx];
  assert.match(cell.title, /25%/);
  assert.match(cell.title, /50 \/ 200/);
  assert.match(cell.title, /1\/4 durable/);
}));

/* ============================================================
   20. DURABLE_RATIO_HEADER constant value
   ============================================================ */

test('DURABLE_RATIO_HEADER constant is DUR/DMG', () => {
  assert.equal(DURABLE_RATIO_HEADER, 'DUR/DMG');
});

/* ============================================================
   21. Role filter behaviour via applyFilters
   ============================================================ */

const ROLE_HEADERS = ['Type', 'Sub', 'Role', 'Code', 'Name', 'RPM', 'Atk Type', 'Atk Name', 'DMG', 'DUR', 'AP', 'DF', 'ST', 'PF'];

function mkRoleRow(overrides) {
  return {
    Type: 'Primary', Sub: 'AR', Role: 'automatic', Code: 'AR-01', Name: 'TestGun',
    RPM: 600, 'Atk Type': 'Projectile', 'Atk Name': 'Bullet',
    DMG: 100, DUR: 25, AP: 2, DF: 10, ST: 15, PF: 10,
    ...overrides
  };
}

test('role filter keeps only matching groups', () => withFixture(() => {
  ingestHeadersAndRows(ROLE_HEADERS, [
    mkRoleRow({ Name: 'Liberator', Role: 'automatic' }),
    mkRoleRow({ Name: 'Diligence', Role: 'precision' }),
    mkRoleRow({ Name: 'Breaker', Role: 'shotgun' })
  ]);
  state.activeTypes = [];
  state.activeSubs = [];
  state.activeRoles = ['precision'];
  state.searchQuery = '';
  applyFilters();
  assert.ok(state.filterActive);
  assert.equal(state.filteredGroups.length, 1);
  assert.equal(state.filteredGroups[0].name, 'Diligence');
}));

test('multiple active roles act as OR (union)', () => withFixture(() => {
  ingestHeadersAndRows(ROLE_HEADERS, [
    mkRoleRow({ Name: 'Liberator', Role: 'automatic' }),
    mkRoleRow({ Name: 'Diligence', Role: 'precision' }),
    mkRoleRow({ Name: 'Breaker', Role: 'shotgun' })
  ]);
  state.activeTypes = [];
  state.activeSubs = [];
  state.activeRoles = ['automatic', 'shotgun'];
  state.searchQuery = '';
  applyFilters();
  assert.equal(state.filteredGroups.length, 2);
  const names = state.filteredGroups.map(g => g.name).sort();
  assert.deepEqual(names, ['Breaker', 'Liberator']);
}));

test('role filter intersects with type filter', () => withFixture(() => {
  ingestHeadersAndRows(ROLE_HEADERS, [
    mkRoleRow({ Name: 'Liberator', Type: 'Primary', Role: 'automatic' }),
    mkRoleRow({ Name: 'MG', Type: 'Support', Role: 'automatic' }),
    mkRoleRow({ Name: 'Diligence', Type: 'Primary', Role: 'precision' })
  ]);
  state.activeTypes = ['primary'];
  state.activeSubs = [];
  state.activeRoles = ['automatic'];
  state.searchQuery = '';
  applyFilters();
  assert.equal(state.filteredGroups.length, 1);
  assert.equal(state.filteredGroups[0].name, 'Liberator');
}));

test('role filter intersects with sub filter', () => withFixture(() => {
  ingestHeadersAndRows(ROLE_HEADERS, [
    mkRoleRow({ Name: 'Liberator', Sub: 'AR', Role: 'automatic' }),
    mkRoleRow({ Name: 'Diligence', Sub: 'DMR', Role: 'precision' }),
    mkRoleRow({ Name: 'Sickle', Sub: 'AR', Role: 'automatic' })
  ]);
  state.activeTypes = [];
  state.activeSubs = ['ar'];
  state.activeRoles = ['automatic'];
  state.searchQuery = '';
  applyFilters();
  assert.equal(state.filteredGroups.length, 2);
  const names = state.filteredGroups.map(g => g.name).sort();
  assert.deepEqual(names, ['Liberator', 'Sickle']);
}));

test('role filter intersects with search', () => withFixture(() => {
  ingestHeadersAndRows(ROLE_HEADERS, [
    mkRoleRow({ Name: 'Liberator', Role: 'automatic' }),
    mkRoleRow({ Name: 'Liberator Penetrator', Role: 'precision' }),
    mkRoleRow({ Name: 'Diligence', Role: 'precision' })
  ]);
  state.activeTypes = [];
  state.activeSubs = [];
  state.activeRoles = ['precision'];
  state.searchQuery = 'liberator';
  applyFilters();
  assert.equal(state.filteredGroups.length, 1);
  assert.equal(state.filteredGroups[0].name, 'Liberator Penetrator');
}));

test('empty activeRoles does not filter by role', () => withFixture(() => {
  ingestHeadersAndRows(ROLE_HEADERS, [
    mkRoleRow({ Name: 'A', Role: 'automatic' }),
    mkRoleRow({ Name: 'B', Role: 'precision' })
  ]);
  state.activeTypes = ['primary'];
  state.activeSubs = [];
  state.activeRoles = [];
  state.searchQuery = '';
  applyFilters();
  assert.equal(state.filteredGroups.length, 2);
}));

test('no active filters including roles sets filterActive false', () => withFixture(() => {
  ingestHeadersAndRows(ROLE_HEADERS, [
    mkRoleRow({ Name: 'A', Role: 'automatic' }),
    mkRoleRow({ Name: 'B', Role: 'precision' })
  ]);
  state.activeTypes = [];
  state.activeSubs = [];
  state.activeRoles = [];
  state.searchQuery = '';
  applyFilters();
  assert.equal(state.filterActive, false);
}));

test('role filter alone activates filtering', () => withFixture(() => {
  ingestHeadersAndRows(ROLE_HEADERS, [
    mkRoleRow({ Name: 'A', Role: 'automatic' }),
    mkRoleRow({ Name: 'B', Role: 'explosive' })
  ]);
  state.activeTypes = [];
  state.activeSubs = [];
  state.activeRoles = ['explosive'];
  state.searchQuery = '';
  applyFilters();
  assert.ok(state.filterActive);
  assert.equal(state.filteredGroups.length, 1);
  assert.equal(state.filteredGroups[0].name, 'B');
}));

test('pinned weapons always appear despite role filter', () => withFixture(() => {
  ingestHeadersAndRows(ROLE_HEADERS, [
    mkRoleRow({ Name: 'Auto', Role: 'automatic' }),
    mkRoleRow({ Name: 'Prec', Role: 'precision' })
  ]);
  state.pinnedWeapons = new Set(['Auto']);
  state.activeTypes = [];
  state.activeSubs = [];
  state.activeRoles = ['precision'];
  state.searchQuery = '';
  applyFilters();
  assert.ok(state.filterActive);
  const names = state.filteredGroups.map(g => g.name).sort();
  assert.deepEqual(names, ['Auto', 'Prec']);
}));

test('precision role explicitly supported in role filter', () => withFixture(() => {
  ingestHeadersAndRows(ROLE_HEADERS, [
    mkRoleRow({ Name: 'Diligence', Role: 'precision' }),
    mkRoleRow({ Name: 'Senator', Role: 'precision' }),
    mkRoleRow({ Name: 'Liberator', Role: 'automatic' })
  ]);
  state.activeTypes = [];
  state.activeSubs = [];
  state.activeRoles = ['precision'];
  state.searchQuery = '';
  applyFilters();
  assert.equal(state.filteredGroups.length, 2);
  const names = state.filteredGroups.map(g => g.name).sort();
  assert.deepEqual(names, ['Diligence', 'Senator']);
}));

test('role filter combined with type + sub + search intersects all', () => withFixture(() => {
  ingestHeadersAndRows(ROLE_HEADERS, [
    mkRoleRow({ Name: 'Liberator', Type: 'Primary', Sub: 'AR', Role: 'automatic' }),
    mkRoleRow({ Name: 'MG', Type: 'Support', Sub: 'MG', Role: 'automatic' }),
    mkRoleRow({ Name: 'Diligence', Type: 'Primary', Sub: 'DMR', Role: 'precision' }),
    mkRoleRow({ Name: 'Sickle', Type: 'Primary', Sub: 'AR', Role: 'automatic' })
  ]);
  state.activeTypes = ['primary'];
  state.activeSubs = ['ar'];
  state.activeRoles = ['automatic'];
  state.searchQuery = 'liberator';
  applyFilters();
  assert.equal(state.filteredGroups.length, 1);
  assert.equal(state.filteredGroups[0].name, 'Liberator');
}));
