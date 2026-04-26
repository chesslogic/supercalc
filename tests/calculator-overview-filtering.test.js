import test from 'node:test';
import assert from 'node:assert/strict';
import './env-stubs.js';
import { TestDocument, TestElement, collectElements } from './dom-stubs.js';
import { makeAttackRow, makeWeapon, makeZone } from './fixtures/weapon-fixtures.js';

const {
  calculatorState,
  DEFAULT_ENEMY_TARGET_TYPES,
  DEFAULT_OVERVIEW_OUTCOME_KINDS,
  setSelectedWeapon
} = await import('../calculator/data.js');
const { renderOverviewCalculation } = await import('../calculator/calculation/overview-panels.js');
const { renderOverviewDetails } = await import('../calculator/rendering/overview-table.js');
const { enemyState } = await import('../enemies/data.js');

function snapshotCalculatorState() {
  return {
    overviewScope: calculatorState.overviewScope,
    enemyTargetTypes: [...calculatorState.enemyTargetTypes],
    overviewOutcomeKinds: [...calculatorState.overviewOutcomeKinds],
    diffDisplayMode: calculatorState.diffDisplayMode,
    enemyTableMode: calculatorState.enemyTableMode,
    enemySort: { ...calculatorState.enemySort },
    weaponA: calculatorState.weaponA,
    weaponB: calculatorState.weaponB,
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
  calculatorState.overviewScope = snapshot.overviewScope;
  calculatorState.enemyTargetTypes = [...snapshot.enemyTargetTypes];
  calculatorState.overviewOutcomeKinds = [...snapshot.overviewOutcomeKinds];
  calculatorState.diffDisplayMode = snapshot.diffDisplayMode;
  calculatorState.enemyTableMode = snapshot.enemyTableMode;
  calculatorState.enemySort = { ...snapshot.enemySort };
  calculatorState.weaponA = snapshot.weaponA;
  calculatorState.weaponB = snapshot.weaponB;
  calculatorState.selectedAttackKeys = {
    A: [...snapshot.selectedAttackKeys.A],
    B: [...snapshot.selectedAttackKeys.B]
  };
  calculatorState.attackHitCounts = {
    A: { ...snapshot.attackHitCounts.A },
    B: { ...snapshot.attackHitCounts.B }
  };
}

function withOverviewFixture(callback) {
  const calculatorSnapshot = snapshotCalculatorState();
  const previousUnits = enemyState.units;
  const previousDocument = globalThis.document;
  const previousNode = globalThis.Node;

  globalThis.document = new TestDocument();
  globalThis.Node = TestElement;

  try {
    calculatorState.overviewScope = 'all';
    calculatorState.enemyTargetTypes = [...DEFAULT_ENEMY_TARGET_TYPES];
    calculatorState.overviewOutcomeKinds = [...DEFAULT_OVERVIEW_OUTCOME_KINDS];
    calculatorState.diffDisplayMode = 'absolute';
    calculatorState.enemyTableMode = 'analysis';
    calculatorState.enemySort = {
      key: 'zone_name',
      dir: 'asc',
      groupMode: 'none'
    };

    setSelectedWeapon('A', makeWeapon('Weapon A', {
      rpm: 60,
      rows: [makeAttackRow('Weapon A Shot', 100, 2)]
    }));
    setSelectedWeapon('B', makeWeapon('Weapon B', {
      rpm: 60,
      rows: [makeAttackRow('Weapon B Shot', 50, 2)]
    }));
    enemyState.units = [{
      faction: 'Terminid',
      name: 'Overview Dummy',
      health: 300,
      scopeTags: ['medium'],
      zones: [
        makeZone('Main', { health: 300, toMainPercent: 0 }),
        makeZone('Arm', { health: 100, toMainPercent: 0 })
      ]
    }];

    return callback();
  } finally {
    globalThis.document = previousDocument;
    globalThis.Node = previousNode;
    enemyState.units = previousUnits;
    restoreCalculatorState(calculatorSnapshot);
  }
}

test('overview table and hall of fame use the same filtered overview row set', () => withOverviewFixture(() => {
  calculatorState.overviewOutcomeKinds = ['utility'];

  const detailsContainer = new TestElement('div');
  renderOverviewDetails(detailsContainer);

  const rowTexts = collectElements(detailsContainer, (element) => element.tagName === 'TR')
    .slice(1)
    .map((element) => element.textContent);
  assert.equal(rowTexts.length, 1);
  assert.match(rowTexts[0], /Overview Dummy/);
  assert.match(rowTexts[0], /Arm/);
  assert.doesNotMatch(rowTexts[0], /Main/);

  const calculationContainer = new TestElement('div');
  renderOverviewCalculation(calculationContainer);

  const hallOfFameHeaders = collectElements(
    calculationContainer,
    (element) => element.classList.contains('calc-hof-entry-header')
  ).map((element) => element.textContent);
  assert.deepEqual(hallOfFameHeaders, ['Overview Dummy — Arm']);
  assert.equal(hallOfFameHeaders.some((header) => header.includes('Main')), false);
}));

test('overview empty states mention outcome filters when no outcome buckets are selected', () => withOverviewFixture(() => {
  calculatorState.overviewOutcomeKinds = [];

  const detailsContainer = new TestElement('div');
  renderOverviewDetails(detailsContainer);
  assert.equal(
    detailsContainer.textContent,
    'No overview rows match the current scope, target, and outcome filters'
  );

  const calculationContainer = new TestElement('div');
  renderOverviewCalculation(calculationContainer);

  const emptyStateTexts = collectElements(
    calculationContainer,
    (element) => element.classList.contains('muted')
  ).map((element) => element.textContent);
  assert.deepEqual(emptyStateTexts, [
    'No overall wins are available for the current attacks, scope, target, and outcome filters',
    'No overall wins are available for the current attacks, scope, target, and outcome filters'
  ]);
}));
