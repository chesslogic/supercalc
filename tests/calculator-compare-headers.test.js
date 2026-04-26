import test from 'node:test';
import assert from 'node:assert/strict';
import './env-stubs.js';
import { TestDocument, TestElement, collectElements } from './dom-stubs.js';
import { makeAttackRow, makeWeapon, makeZone } from './fixtures/weapon-fixtures.js';

const {
  calculatorState,
  DEFAULT_ENEMY_TARGET_TYPES,
  DEFAULT_OVERVIEW_OUTCOME_KINDS,
  setCalculatorMode,
  setCompareHeaderLayout,
  setCompareView,
  setSelectedEnemy,
  setSelectedWeapon
} = await import('../calculator/data.js');
const { renderFocusedEnemyTable } = await import('../calculator/rendering/enemy-focused-table.js');
const { renderOverviewDetails } = await import('../calculator/rendering/overview-table.js');
const { enemyState } = await import('../enemies/data.js');

function snapshotCalculatorState() {
  return {
    mode: calculatorState.mode,
    compareView: calculatorState.compareView,
    compareHeaderLayout: calculatorState.compareHeaderLayout,
    overviewScope: calculatorState.overviewScope,
    enemyTargetTypes: [...calculatorState.enemyTargetTypes],
    overviewOutcomeKinds: [...calculatorState.overviewOutcomeKinds],
    diffDisplayMode: calculatorState.diffDisplayMode,
    enemyTableMode: calculatorState.enemyTableMode,
    enemySort: { ...calculatorState.enemySort },
    weaponA: calculatorState.weaponA,
    weaponB: calculatorState.weaponB,
    selectedEnemy: calculatorState.selectedEnemy,
    selectedZoneIndex: calculatorState.selectedZoneIndex,
    selectedExplosiveZoneIndices: [...calculatorState.selectedExplosiveZoneIndices],
    selectedAttackKeys: {
      A: [...calculatorState.selectedAttackKeys.A],
      B: [...calculatorState.selectedAttackKeys.B]
    },
    attackHitCounts: {
      A: { ...calculatorState.attackHitCounts.A },
      B: { ...calculatorState.attackHitCounts.B }
    }
  };
}

function restoreCalculatorState(snapshot) {
  calculatorState.mode = snapshot.mode;
  calculatorState.compareView = snapshot.compareView;
  calculatorState.compareHeaderLayout = snapshot.compareHeaderLayout;
  calculatorState.overviewScope = snapshot.overviewScope;
  calculatorState.enemyTargetTypes = [...snapshot.enemyTargetTypes];
  calculatorState.overviewOutcomeKinds = [...snapshot.overviewOutcomeKinds];
  calculatorState.diffDisplayMode = snapshot.diffDisplayMode;
  calculatorState.enemyTableMode = snapshot.enemyTableMode;
  calculatorState.enemySort = { ...snapshot.enemySort };
  calculatorState.weaponA = snapshot.weaponA;
  calculatorState.weaponB = snapshot.weaponB;
  calculatorState.selectedEnemy = snapshot.selectedEnemy;
  calculatorState.selectedZoneIndex = snapshot.selectedZoneIndex;
  calculatorState.selectedExplosiveZoneIndices = [...snapshot.selectedExplosiveZoneIndices];
  calculatorState.selectedAttackKeys = {
    A: [...snapshot.selectedAttackKeys.A],
    B: [...snapshot.selectedAttackKeys.B]
  };
  calculatorState.attackHitCounts = {
    A: { ...snapshot.attackHitCounts.A },
    B: { ...snapshot.attackHitCounts.B }
  };
}

function withCompareHeaderFixture(callback) {
  const calculatorSnapshot = snapshotCalculatorState();
  const previousUnits = enemyState.units;
  const previousDocument = globalThis.document;
  const previousNode = globalThis.Node;

  globalThis.document = new TestDocument();
  globalThis.Node = TestElement;

  try {
    calculatorState.enemySort = {
      key: 'zone_name',
      dir: 'asc',
      groupMode: 'none'
    };
    calculatorState.enemyTableMode = 'analysis';
    calculatorState.diffDisplayMode = 'absolute';
    calculatorState.overviewScope = 'all';
    calculatorState.enemyTargetTypes = [...DEFAULT_ENEMY_TARGET_TYPES];
    calculatorState.overviewOutcomeKinds = [...DEFAULT_OVERVIEW_OUTCOME_KINDS];

    setCalculatorMode('compare');
    setCompareView('focused');
    setCompareHeaderLayout('metric');

    setSelectedWeapon('A', makeWeapon('Weapon A', {
      rpm: 60,
      rows: [makeAttackRow('Weapon A Shot', 100, 2)]
    }));
    setSelectedWeapon('B', makeWeapon('Weapon B', {
      rpm: 60,
      rows: [makeAttackRow('Weapon B Shot', 50, 2)]
    }));

    const focusedEnemy = {
      name: 'Focused Dummy',
      faction: 'Terminid',
      health: 300,
      scopeTags: ['medium'],
      zones: [makeZone('Main', { health: 300, isFatal: true })]
    };
    enemyState.units = [{
      faction: 'Terminid',
      name: 'Overview Dummy',
      health: 300,
      scopeTags: ['medium'],
      zones: [makeZone('Main', { health: 300, isFatal: true })]
    }];

    setSelectedEnemy(focusedEnemy);

    return callback({
      focusedEnemy
    });
  } finally {
    globalThis.document = previousDocument;
    globalThis.Node = previousNode;
    enemyState.units = previousUnits;
    restoreCalculatorState(calculatorSnapshot);
  }
}

function getHeaderRows(container) {
  const thead = collectElements(container, (element) => element.tagName === 'THEAD')[0];
  assert.ok(thead, 'expected rendered table head');
  return [...thead.children].map((row) => [...row.children]);
}

test('focused compare table renders metric-grouped two-row headers by default', () => withCompareHeaderFixture(({ focusedEnemy }) => {
  const container = new TestElement('div');
  renderFocusedEnemyTable(container, focusedEnemy);

  const [topRow, bottomRow] = getHeaderRows(container);

  assert.deepEqual(
    topRow.map((cell) => cell.textContent),
    ['Proj', 'Zone', 'AV', 'Dur%', 'ToMain%', 'ExDR', 'Shots', 'Range', 'Margin', 'TTK']
  );
  assert.deepEqual(
    bottomRow.map((cell) => cell.textContent),
    ['A', 'B', 'Diff', 'A', 'B', 'A', 'B', 'Diff', 'A', 'B', 'Diff']
  );
  assert.equal(topRow[0].rowSpan, 2);
  assert.equal(topRow[1].rowSpan, 2);
  assert.equal(topRow[6].colSpan, 3);
  assert.equal(topRow[9].colSpan, 3);
}));

test('focused compare group headers toggle to slot-grouped layout and request a rerender', () => withCompareHeaderFixture(({ focusedEnemy }) => {
  const container = new TestElement('div');
  const rerenderRequests = [];

  renderFocusedEnemyTable(container, focusedEnemy, {
    onRenderEnemyDetails: (enemy) => rerenderRequests.push(enemy?.name || null)
  });

  const [topRow] = getHeaderRows(container);
  topRow[6].dispatch('click');

  assert.equal(calculatorState.compareHeaderLayout, 'slot');
  assert.deepEqual(rerenderRequests, ['Focused Dummy']);

  const rerenderedContainer = new TestElement('div');
  renderFocusedEnemyTable(rerenderedContainer, focusedEnemy);
  const [slotTopRow, slotBottomRow] = getHeaderRows(rerenderedContainer);

  assert.deepEqual(
    slotTopRow.map((cell) => cell.textContent),
    ['Proj', 'Zone', 'AV', 'Dur%', 'ToMain%', 'ExDR', 'A', 'B', 'Diff']
  );
  assert.deepEqual(
    slotBottomRow.map((cell) => cell.textContent),
    ['Shots', 'Range', 'Margin', 'TTK', 'Shots', 'Range', 'Margin', 'TTK', 'Shots', 'Margin', 'TTK']
  );
}));

test('overview compare table reuses the same grouped header layouts', () => withCompareHeaderFixture(() => {
  setCompareView('overview');
  setCompareHeaderLayout('slot');

  const container = new TestElement('div');
  renderOverviewDetails(container);

  const [topRow, bottomRow] = getHeaderRows(container);

  assert.deepEqual(
    topRow.map((cell) => cell.textContent),
    ['Faction', 'Enemy', 'Zone', 'AV', 'Dur%', 'ToMain%', 'ExDR', 'A', 'B', 'Diff']
  );
  assert.deepEqual(
    bottomRow.map((cell) => cell.textContent),
    ['Shots', 'Range', 'Margin', 'TTK', 'Shots', 'Range', 'Margin', 'TTK', 'Shots', 'Margin', 'TTK']
  );
  assert.ok(topRow[7].classList.contains('calc-compare-header-group'));
}));
