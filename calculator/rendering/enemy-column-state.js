import { calculatorState } from '../data.js';
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
const ENEMY_COMPARE_ANALYSIS_METRIC_COLUMNS = [
  { key: 'shotsA', label: 'A Shots' },
  { key: 'rangeA', label: 'A Range', title: EFFECTIVE_DISTANCE_TOOLTIP },
  { key: 'shotsB', label: 'B Shots' },
  { key: 'rangeB', label: 'B Range', title: EFFECTIVE_DISTANCE_TOOLTIP },
  { key: 'shotsDiff', label: 'Diff Shots' },
  { key: 'ttkA', label: 'A TTK' },
  { key: 'ttkB', label: 'B TTK' },
  { key: 'ttkDiff', label: 'Diff TTK' }
];

export const METRIC_COLUMN_CONFIG = {
  shots: { kind: 'slot', slot: 'A', valueType: 'shots' },
  range: { kind: 'slot', slot: 'A', valueType: 'range' },
  ttk: { kind: 'slot', slot: 'A', valueType: 'ttk' },
  shotsA: { kind: 'slot', slot: 'A', valueType: 'shots' },
  rangeA: { kind: 'slot', slot: 'A', valueType: 'range' },
  ttkA: { kind: 'slot', slot: 'A', valueType: 'ttk' },
  shotsB: { kind: 'slot', slot: 'B', valueType: 'shots' },
  rangeB: { kind: 'slot', slot: 'B', valueType: 'range' },
  ttkB: { kind: 'slot', slot: 'B', valueType: 'ttk' },
  shotsDiff: { kind: 'diff', metricKey: 'diffShots', valueType: 'shots' },
  ttkDiff: { kind: 'diff', metricKey: 'diffTtkSeconds', valueType: 'ttk' }
};

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
  enemyTableMode = 'analysis'
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
    ...ENEMY_COMPARE_ANALYSIS_METRIC_COLUMNS
  ];
}

export function getOverviewColumnsForState({
  enemyTableMode = 'analysis',
  overviewScope = 'all'
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
    ...ENEMY_COMPARE_ANALYSIS_METRIC_COLUMNS
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
