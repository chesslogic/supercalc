import {
  calculatorState,
  DEFAULT_COMPARE_HEADER_LAYOUT,
  normalizeCompareHeaderLayout
} from '../data.js';
import { EFFECTIVE_DISTANCE_TOOLTIP } from '../effective-distance.js';
import { isAllEnemyScope } from '../enemy-scope.js';
import { EXPLOSIVE_DISPLAY_COLUMN_LABEL } from '../explosive-display.js';

const ENEMY_STATS_COLUMNS = [
  { key: 'zone_name', label: 'Zone' },
  { key: 'health', label: 'Health' },
  { key: 'Con', label: 'Con' },
  { key: 'Dur%', label: 'Dur%' },
  { key: 'AV', label: 'AV' },
  { key: 'IsFatal', label: 'IsLethal' },
  { key: 'ExTarget', label: 'ExTarget' },
  { key: 'ExMult', label: EXPLOSIVE_DISPLAY_COLUMN_LABEL },
  { key: 'ToMain%', label: 'ToMain%' },
  { key: 'MainCap', label: 'MainCap' }
];
const ENEMY_ANALYSIS_COLUMNS = [
  { key: 'zone_name', label: 'Zone' },
  { key: 'AV', label: 'AV' },
  { key: 'Dur%', label: 'Dur%' },
  { key: 'ToMain%', label: 'ToMain%' },
  { key: 'ExMult', label: EXPLOSIVE_DISPLAY_COLUMN_LABEL }
];
const ENEMY_SINGLE_ANALYSIS_METRIC_COLUMNS = [
  { key: 'shots', label: 'Shots' },
  { key: 'range', label: 'Range', title: EFFECTIVE_DISTANCE_TOOLTIP },
  { key: 'ttk', label: 'TTK' }
];
const ENEMY_MARGIN_COLUMN_TITLE = 'Extra displayed damage above the per-shot breakpoint for the current kill path. One-shot rows show direct overkill; multi-shot rows show per-shot headroom for the displayed shot count.';
const ENEMY_MARGIN_DIFF_COLUMN_TITLE = 'B minus A Margin. Absolute mode shows percentage-point delta; Overview percent mode shows fit-ratio change.';
const COMPARE_HEADER_SLOT_LABELS = {
  A: 'A',
  B: 'B',
  Diff: 'Diff'
};
const ENEMY_COMPARE_ANALYSIS_METRIC_GROUPS = [
  {
    key: 'shots',
    label: 'Shots',
    columns: [
      { key: 'shotsA', slotKey: 'A' },
      { key: 'shotsB', slotKey: 'B' },
      { key: 'shotsDiff', slotKey: 'Diff' }
    ]
  },
  {
    key: 'range',
    label: 'Range',
    columns: [
      { key: 'rangeA', slotKey: 'A', title: EFFECTIVE_DISTANCE_TOOLTIP },
      { key: 'rangeB', slotKey: 'B', title: EFFECTIVE_DISTANCE_TOOLTIP }
    ]
  },
  {
    key: 'margin',
    label: 'Margin',
    columns: [
      { key: 'marginA', slotKey: 'A', title: ENEMY_MARGIN_COLUMN_TITLE },
      { key: 'marginB', slotKey: 'B', title: ENEMY_MARGIN_COLUMN_TITLE },
      { key: 'marginDiff', slotKey: 'Diff', title: ENEMY_MARGIN_DIFF_COLUMN_TITLE }
    ]
  },
  {
    key: 'ttk',
    label: 'TTK',
    columns: [
      { key: 'ttkA', slotKey: 'A' },
      { key: 'ttkB', slotKey: 'B' },
      { key: 'ttkDiff', slotKey: 'Diff' }
    ]
  }
];

export const METRIC_COLUMN_CONFIG = {
  shots: { kind: 'slot', slot: 'A', valueType: 'shots' },
  range: { kind: 'slot', slot: 'A', valueType: 'range' },
  ttk: { kind: 'slot', slot: 'A', valueType: 'ttk' },
  shotsA: { kind: 'slot', slot: 'A', valueType: 'shots' },
  rangeA: { kind: 'slot', slot: 'A', valueType: 'range' },
  marginA: { kind: 'slot', slot: 'A', valueType: 'margin' },
  ttkA: { kind: 'slot', slot: 'A', valueType: 'ttk' },
  shotsB: { kind: 'slot', slot: 'B', valueType: 'shots' },
  rangeB: { kind: 'slot', slot: 'B', valueType: 'range' },
  marginB: { kind: 'slot', slot: 'B', valueType: 'margin' },
  ttkB: { kind: 'slot', slot: 'B', valueType: 'ttk' },
  marginDiff: { kind: 'diff', metricKey: 'diffMargin', valueType: 'margin' },
  shotsDiff: { kind: 'diff', metricKey: 'diffShots', valueType: 'shots' },
  ttkDiff: { kind: 'diff', metricKey: 'diffTtkSeconds', valueType: 'ttk' }
};

function createCompareMetricColumn(column, {
  groupKey,
  groupLabel,
  detailLabel
}) {
  return {
    key: column.key,
    label: detailLabel,
    title: column.title,
    compareHeaderGroupKey: groupKey,
    compareHeaderGroupLabel: groupLabel
  };
}

function buildCompareAnalysisMetricColumns(compareHeaderLayout = DEFAULT_COMPARE_HEADER_LAYOUT) {
  const normalizedLayout = normalizeCompareHeaderLayout(compareHeaderLayout);

  if (normalizedLayout === 'slot') {
    return Object.keys(COMPARE_HEADER_SLOT_LABELS).flatMap((slotKey) => (
      ENEMY_COMPARE_ANALYSIS_METRIC_GROUPS.flatMap((group) => {
        const column = group.columns.find((candidate) => candidate.slotKey === slotKey);
        if (!column) {
          return [];
        }
        return [createCompareMetricColumn(column, {
          groupKey: slotKey,
          groupLabel: COMPARE_HEADER_SLOT_LABELS[slotKey],
          detailLabel: group.label
        })];
      })
    ));
  }

  return ENEMY_COMPARE_ANALYSIS_METRIC_GROUPS.flatMap((group) => (
    group.columns.map((column) => createCompareMetricColumn(column, {
      groupKey: group.key,
      groupLabel: group.label,
      detailLabel: COMPARE_HEADER_SLOT_LABELS[column.slotKey]
    }))
  ));
}

export function getEnemyBaseColumnsForState({
  mode = 'single',
  enemyTableMode = 'analysis'
} = {}) {
  if (mode !== 'compare') {
    return ENEMY_STATS_COLUMNS;
  }

  return enemyTableMode === 'stats'
    ? ENEMY_STATS_COLUMNS
    : ENEMY_ANALYSIS_COLUMNS;
}

export function getEnemyColumnsForState({
  mode = 'single',
  enemyTableMode = 'analysis',
  compareHeaderLayout = calculatorState.compareHeaderLayout
} = {}) {
  const baseColumns = getEnemyBaseColumnsForState({ mode, enemyTableMode });

  if (mode !== 'compare') {
    return [
      ...baseColumns,
      ...ENEMY_SINGLE_ANALYSIS_METRIC_COLUMNS
    ];
  }

  if (enemyTableMode === 'stats') {
    return baseColumns;
  }

  return [
    ...baseColumns,
    ...buildCompareAnalysisMetricColumns(compareHeaderLayout)
  ];
}

export function getOverviewColumnsForState({
  enemyTableMode = 'analysis',
  overviewScope = 'all',
  compareHeaderLayout = calculatorState.compareHeaderLayout
} = {}) {
  const baseColumns = [
    ...(isAllEnemyScope(overviewScope)
      ? [{ key: 'faction', label: 'Faction' }]
      : []),
    { key: 'enemy', label: 'Enemy' },
    ...getEnemyBaseColumnsForState({
      mode: 'compare',
      enemyTableMode
    })
  ];

  if (enemyTableMode === 'stats') {
    return baseColumns;
  }

  return [
    ...baseColumns,
    ...buildCompareAnalysisMetricColumns(compareHeaderLayout)
  ];
}

export function getEnemyBaseColumns() {
  return getEnemyBaseColumnsForState({
    mode: calculatorState.mode,
    enemyTableMode: calculatorState.enemyTableMode
  });
}

export function getEnemyColumns() {
  return getEnemyColumnsForState({
    mode: calculatorState.mode,
    enemyTableMode: calculatorState.enemyTableMode
  });
}

export function getOverviewColumns() {
  return getOverviewColumnsForState({
    enemyTableMode: calculatorState.enemyTableMode,
    overviewScope: calculatorState.overviewScope
  });
}

export function ensureEnemySortKeyVisible(columns) {
  const visibleKeys = new Set(columns.map((column) => column.key));
  if (visibleKeys.has(calculatorState.enemySort.key)) {
    return;
  }

  calculatorState.enemySort.key = 'zone_name';
  calculatorState.enemySort.dir = 'asc';
}
