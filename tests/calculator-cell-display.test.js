// Tests for enemy table mode, enemy/overview column configuration,
// explosive cell display, zone health/constitution display, and
// compare TTK tooltip logic.
// Extracted from calculator-ui.test.js during test-suite split.
import test from 'node:test';
import assert from 'node:assert/strict';
import './env-stubs.js';
import { TestDocument } from './dom-stubs.js';

import {
  calculatorState,
  setCompareHeaderLayout,
  setEnemyTableMode
} from '../calculator/data.js';
import {
  getEnemyColumnsForState,
  getOverviewColumnsForState
} from '../calculator/rendering.js';
import { buildMetricColumnCell } from '../calculator/rendering/metric-cells.js';
import {
  applyExplosiveDisplayToCell,
  EXPLOSIVE_DISPLAY_COLUMN_LABEL,
  getExplosiveDisplayInfo
} from '../calculator/explosive-display.js';
import { buildCompareTtkTooltip } from '../calculator/compare-tooltips.js';
import {
  getEnemyZoneConDisplayInfo,
  getEnemyZoneHealthDisplayInfo,
  MAIN_CON_ANY_DEATH_TOOLTIP,
  ZERO_BLEED_CON_TOOLTIP
} from '../calculator/enemy-zone-display.js';

// ========================================================================
// Enemy table mode state management
// ========================================================================

test('enemy table mode defaults to analysis and normalizes to supported values', () => {
  setEnemyTableMode('analysis');
  assert.equal(calculatorState.enemyTableMode, 'analysis');

  setEnemyTableMode('stats');
  assert.equal(calculatorState.enemyTableMode, 'stats');

  setEnemyTableMode('unknown');
  assert.equal(calculatorState.enemyTableMode, 'analysis');
});

test('compare header layout defaults to metric and normalizes to supported values', () => {
  setCompareHeaderLayout('slot');
  assert.equal(calculatorState.compareHeaderLayout, 'slot');

  setCompareHeaderLayout('unknown');
  assert.equal(calculatorState.compareHeaderLayout, 'metric');
});

// ========================================================================
// Enemy and overview column configuration
// ========================================================================

test('single mode always shows the full enemy columns plus derived metrics', () => {
  const columns = getEnemyColumnsForState({
    mode: 'single',
    enemyTableMode: 'analysis'
  });

  assert.deepEqual(
    columns.map((column) => column.key),
    ['zone_name', 'health', 'Con', 'Dur%', 'AV', 'IsFatal', 'ExTarget', 'ExMult', 'ToMain%', 'MainCap', 'shots', 'range', 'ttk']
  );
});

test('compare mode still uses compact analysis columns and optional stats columns', () => {
  const analysisColumns = getEnemyColumnsForState({
    mode: 'compare',
    enemyTableMode: 'analysis'
  });
  assert.deepEqual(
    analysisColumns.map((column) => column.key),
    ['zone_name', 'AV', 'Dur%', 'ToMain%', 'ExMult', 'shotsA', 'shotsB', 'shotsDiff', 'rangeA', 'rangeB', 'marginA', 'marginB', 'marginDiff', 'ttkA', 'ttkB', 'ttkDiff']
  );

  const slotGroupedAnalysisColumns = getEnemyColumnsForState({
    mode: 'compare',
    enemyTableMode: 'analysis',
    compareHeaderLayout: 'slot'
  });
  assert.deepEqual(
    slotGroupedAnalysisColumns.map((column) => column.key),
    ['zone_name', 'AV', 'Dur%', 'ToMain%', 'ExMult', 'shotsA', 'rangeA', 'marginA', 'ttkA', 'shotsB', 'rangeB', 'marginB', 'ttkB', 'shotsDiff', 'marginDiff', 'ttkDiff']
  );

  const statsColumns = getEnemyColumnsForState({
    mode: 'compare',
    enemyTableMode: 'stats'
  });
  assert.deepEqual(
    statsColumns.map((column) => column.key),
    ['zone_name', 'health', 'Con', 'Dur%', 'AV', 'IsFatal', 'ExTarget', 'ExMult', 'ToMain%', 'MainCap']
  );

  const overviewAnalysisColumns = getOverviewColumnsForState({
    enemyTableMode: 'analysis',
    overviewScope: 'all'
  });
  assert.deepEqual(
    overviewAnalysisColumns.map((column) => column.key),
    ['faction', 'enemy', 'zone_name', 'AV', 'Dur%', 'ToMain%', 'ExMult', 'shotsA', 'shotsB', 'shotsDiff', 'rangeA', 'rangeB', 'marginA', 'marginB', 'marginDiff', 'ttkA', 'ttkB', 'ttkDiff']
  );

  const scopedOverviewColumns = getOverviewColumnsForState({
    enemyTableMode: 'analysis',
    overviewScope: 'appropriators'
  });
  assert.deepEqual(
    scopedOverviewColumns.map((column) => column.key),
    ['enemy', 'zone_name', 'AV', 'Dur%', 'ToMain%', 'ExMult', 'shotsA', 'shotsB', 'shotsDiff', 'rangeA', 'rangeB', 'marginA', 'marginB', 'marginDiff', 'ttkA', 'ttkB', 'ttkDiff']
  );

  const slotGroupedOverviewColumns = getOverviewColumnsForState({
    enemyTableMode: 'analysis',
    overviewScope: 'appropriators',
    compareHeaderLayout: 'slot'
  });
  assert.deepEqual(
    slotGroupedOverviewColumns.map((column) => column.key),
    ['enemy', 'zone_name', 'AV', 'Dur%', 'ToMain%', 'ExMult', 'shotsA', 'rangeA', 'marginA', 'ttkA', 'shotsB', 'rangeB', 'marginB', 'ttkB', 'shotsDiff', 'marginDiff', 'ttkDiff']
  );
});

test('margin metric cells render one-shot and multi-shot headroom titles', () => {
  const originalDocument = globalThis.document;

  try {
    globalThis.document = new TestDocument();

    const oneShotCell = buildMetricColumnCell('marginA', {
      bySlot: {
        A: {
          weapon: { name: 'A' },
          selectedAttackCount: 1,
          damagesZone: true,
          shotsToKill: 1,
          marginPercent: 5,
          displayMarginPercent: 5
        }
      }
    });
    assert.equal(oneShotCell.textContent, '+5%');
    assert.match(oneShotCell.title, /one-shot margin/i);

    const multiShotCell = buildMetricColumnCell('marginA', {
      bySlot: {
        A: {
          weapon: { name: 'A' },
          selectedAttackCount: 1,
          damagesZone: true,
          shotsToKill: 2,
          marginPercent: null,
          displayMarginPercent: 33
        }
      }
    });
    assert.equal(multiShotCell.textContent, '+33%');
    assert.match(multiShotCell.title, /2-shot margin/i);

    const unavailableCell = buildMetricColumnCell('marginA', {
      bySlot: {
        A: {
          weapon: { name: 'A' },
          selectedAttackCount: 1,
          damagesZone: true,
          shotsToKill: null,
          marginPercent: null,
          displayMarginPercent: null
        }
      }
    });
    assert.equal(unavailableCell.textContent, '-');
    assert.match(unavailableCell.title, /margin unavailable/i);
  } finally {
    globalThis.document = originalDocument;
  }
});

test('margin diff metric cells show point deltas in absolute mode and fit-ratio changes in percent mode', () => {
  const originalDocument = globalThis.document;

  try {
    globalThis.document = new TestDocument();

    const metrics = {
      diffMargin: {
        kind: 'numeric',
        winner: 'A',
        valueA: 1,
        valueB: 1.3,
        displayValue: null,
        sortValue: 0.3,
        absoluteValue: 0.3,
        absoluteSortValue: 0.3,
        percentValue: 15,
        percentSortValue: 15
      }
    };

    const absoluteCell = buildMetricColumnCell('marginDiff', metrics);
    assert.equal(absoluteCell.textContent, '+30 pts');
    assert.match(absoluteCell.title, /percentage-point delta/i);

    const percentCell = buildMetricColumnCell('marginDiff', metrics, {
      diffDisplayMode: 'percent'
    });
    assert.equal(percentCell.textContent, '+15%');
    assert.match(percentCell.title, /fit ratios/i);
    assert.match(percentCell.title, /A Margin = 0% still works/i);
  } finally {
    globalThis.document = originalDocument;
  }
});

test('beam metric cells use beam timing copy and hide margin headroom', () => {
  const originalDocument = globalThis.document;

  try {
    globalThis.document = new TestDocument();

    const beamSlotMetrics = {
      weapon: { name: 'Scythe' },
      selectedAttackCount: 1,
      damagesZone: true,
      shotsToKill: 5,
      ttkSeconds: 5 / 67,
      hasRpm: true,
      usesBeamCadence: true,
      beamTicksPerSecond: 67,
      outcomeKind: 'utility',
      marginPercent: 1,
      displayMarginPercent: 6600
    };

    const shotsCell = buildMetricColumnCell('shots', {
      bySlot: { A: beamSlotMetrics }
    });
    assert.equal(shotsCell.textContent, '5');
    assert.match(shotsCell.title, /beam ticks to kill/i);
    assert.match(shotsCell.title, /67 beam ticks\/sec/i);

    const ttkCell = buildMetricColumnCell('ttk', {
      bySlot: { A: beamSlotMetrics }
    });
    assert.match(ttkCell.textContent, /^0\.07s/);
    assert.match(ttkCell.title, /sustained contact/i);
    assert.match(ttkCell.title, /67 beam ticks\/sec/i);

    const marginCell = buildMetricColumnCell('marginA', {
      bySlot: { A: beamSlotMetrics }
    });
    assert.equal(marginCell.textContent, '-');
    assert.match(marginCell.title, /margin unavailable for continuous beam rows/i);
    assert.equal(marginCell.classList.contains('muted'), true);
  } finally {
    globalThis.document = originalDocument;
  }
});

// ========================================================================
// Explosive display
// ========================================================================

test('explosive display shows missing multipliers as zero reduction', () => {
  const info = getExplosiveDisplayInfo({
    zone_name: 'Main',
    ExTarget: 'Main'
  });

  assert.equal(EXPLOSIVE_DISPLAY_COLUMN_LABEL, 'ExDR');
  assert.equal(info.text, '0%');
  assert.equal(info.sortValue, 0);
  assert.equal(info.isImplicit, true);
  assert.equal(info.isRouted, false);
  assert.match(info.title, /implicit ExMult 1/i);
});

test('explosive display converts direct multipliers into user-facing reduction percentages', () => {
  const info = getExplosiveDisplayInfo({
    zone_name: 'armor',
    ExTarget: 'Part',
    ExMult: 0.45
  });

  assert.equal(info.text, '55%');
  assert.equal(info.sortValue, 0.55);
  assert.equal(info.isImplicit, false);
  assert.equal(info.isRouted, false);
  assert.match(info.title, /ExMult 0\.45/i);
});

test('explosive display flags special non-main zones that suppress part explosive damage', () => {
  const info = getExplosiveDisplayInfo({
    zone_name: 'left_arm',
    ExTarget: 'Main'
  });

  assert.equal(info.text, '100%*');
  assert.equal(info.sortValue, 1);
  assert.equal(info.isRouted, true);
  assert.match(info.title, /direct explosive part damage and explosive passthrough from this part are suppressed/i);
  assert.match(info.title, /one direct Main explosive check uses Main defenses/i);
  assert.match(info.title, /Automaton Trooper/i);
});

test('explosive display applies routed markers without line-through styling', () => {
  const td = {
    textContent: '',
    title: '',
    style: {}
  };

  applyExplosiveDisplayToCell(td, {
    zone_name: 'left_arm',
    ExTarget: 'Main'
  });

  assert.equal(td.textContent, '100%*');
  assert.match(td.title, /Automaton Trooper/i);
  assert.notEqual(td.style.textDecoration, 'line-through');
  assert.equal(td.style.color, 'var(--muted)');
});

// ========================================================================
// Enemy zone health / constitution display
// ========================================================================

test('enemy zone health display folds zero-bleed Constitution into effective health', () => {
  const info = getEnemyZoneHealthDisplayInfo({
    health: 1200,
    Con: 1200,
    ConRate: 0
  });

  assert.equal(info.text, '2400');
  assert.equal(info.sortValue, 2400);
  assert.equal(info.usesConAsHealth, true);
});

test('enemy zone health display preserves main-health passthrough markers', () => {
  const info = getEnemyZoneHealthDisplayInfo({
    health: 'Main'
  });

  assert.equal(info.text, 'Main');
  assert.equal(info.sortValue, null);
  assert.equal(info.title, '');
  assert.equal(info.usesConAsHealth, false);
  assert.equal(info.effectiveHealth, null);
});

test('enemy zone Constitution display shows a starred tooltip for zero-bleed Constitution', () => {
  const info = getEnemyZoneConDisplayInfo({
    health: 1200,
    Con: 1200,
    ConRate: 0
  });

  assert.equal(info.text, '*');
  assert.equal(info.sortValue, 1200);
  assert.equal(info.usesConAsHealth, true);
  assert.equal(info.title, ZERO_BLEED_CON_TOOLTIP);
});

test('enemy zone Constitution display keeps ordinary bleeding Constitution numeric', () => {
  const info = getEnemyZoneConDisplayInfo({
    health: 80,
    Con: 1000,
    ConRate: 40
  });

  assert.equal(info.text, '1000');
  assert.equal(info.sortValue, 1000);
  assert.equal(info.usesConAsHealth, false);
  assert.equal(info.title, '');
});

test('enemy zone Constitution display can mark main Constitution that applies on any death', () => {
  const info = getEnemyZoneConDisplayInfo({
    health: 160,
    Con: 100,
    ConRate: 5,
    ConAppliesAnyDeath: true
  });

  assert.equal(info.text, '100*');
  assert.equal(info.sortValue, 100);
  assert.equal(info.usesConAsHealth, false);
  assert.equal(info.title, MAIN_CON_ANY_DEATH_TOOLTIP);
});

// ========================================================================
// Compare TTK tooltip
// ========================================================================

test('compare TTK tooltip identifies the faster weapon when shots are equal but RPM differs', () => {
  const tooltip = buildCompareTtkTooltip(
    {
      weapon: { name: 'Tenderizer', rpm: 600 },
      shotsToKill: 5,
      ttkSeconds: 0.4
    },
    {
      weapon: { name: 'Liberator Carbine', rpm: 920 },
      shotsToKill: 5,
      ttkSeconds: 0.2608695652173913
    }
  );

  assert.match(tooltip, /Weapon B \(Liberator Carbine\) has a shorter TTK/i);
  assert.match(tooltip, /Equal shots to kill, but Weapon B has higher RPM \(920 vs 600\)\./i);
});

test('compare TTK tooltip explains when lower shots beat higher RPM', () => {
  const tooltip = buildCompareTtkTooltip(
    {
      weapon: { name: 'Weapon A', rpm: 900 },
      shotsToKill: 5,
      ttkSeconds: 0.26666666666666666
    },
    {
      weapon: { name: 'Weapon B', rpm: 600 },
      shotsToKill: 4,
      ttkSeconds: 0.3
    }
  );

  assert.match(tooltip, /Weapon A \(Weapon A\) has a shorter TTK/i);
  assert.match(tooltip, /Weapon A has higher RPM \(900 vs 600\), which outweighs Weapon B's lower shot count \(4 vs 5\)\./i);
});

test('compare TTK tooltip explains sustained-contact beam timing without RPM language', () => {
  const tooltip = buildCompareTtkTooltip(
    {
      weapon: { name: 'Scythe', rpm: 600 },
      shotsToKill: 5,
      ttkSeconds: 5 / 67,
      usesBeamCadence: true,
      beamTicksPerSecond: 67
    },
    {
      weapon: { name: 'Dagger', rpm: 900 },
      shotsToKill: 7,
      ttkSeconds: 7 / 67,
      usesBeamCadence: true,
      beamTicksPerSecond: 67
    }
  );

  assert.match(tooltip, /Weapon A \(Scythe\) has a shorter TTK/i);
  assert.match(tooltip, /fewer sustained-contact beam ticks/i);
  assert.match(tooltip, /67 beam ticks\/sec/i);
  assert.doesNotMatch(tooltip, /higher RPM/i);
});
