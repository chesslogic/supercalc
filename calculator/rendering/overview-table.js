import {
  calculatorState,
  getAttackHitCounts,
  getEnemyOptions,
  getEngagementRangeMeters,
  getSelectedAttacks,
  getSelectedEnemyTargetTypes,
  getSelectedOverviewOutcomeKinds,
  getWeaponForSlot,
  toggleCompareHeaderLayout,
  toggleEnemySort
} from '../data.js';
import { buildOverviewRows, sortEnemyZoneRows } from '../compare-utils.js';
import { buildMetricColumnCell } from './metric-cells.js';
import { renderEnemyTableHeader } from './enemy-table-header.js';
import { createPlaceholder } from './shared.js';
import { formatOverviewBaseCell } from './enemy-base-cells.js';
import { ensureEnemySortKeyVisible, getOverviewColumns } from './enemy-columns.js';

export function renderOverviewDetails(container, {
  onRenderEnemyDetails = null
} = {}) {
  const table = document.createElement('table');
  table.style.width = '100%';
  table.style.borderCollapse = 'collapse';
  table.className = 'calculator-table';

  const columns = getOverviewColumns();
  ensureEnemySortKeyVisible(columns);
  const thead = document.createElement('thead');
  renderEnemyTableHeader(thead, {
    columns,
    sortState: calculatorState.enemySort,
    compareHeaderLayout: calculatorState.compareHeaderLayout,
    onSort: (sortKey) => {
      toggleEnemySort(sortKey);
      onRenderEnemyDetails?.();
    },
    onToggleCompareHeaderLayout: () => {
      toggleCompareHeaderLayout();
      onRenderEnemyDetails?.();
    }
  });
  table.appendChild(thead);

  const weaponA = getWeaponForSlot('A');
  const weaponB = getWeaponForSlot('B');
  const selectedAttacksA = getSelectedAttacks('A');
  const selectedAttacksB = getSelectedAttacks('B');
  const hitCountsA = getAttackHitCounts('A', selectedAttacksA);
  const hitCountsB = getAttackHitCounts('B', selectedAttacksB);

  const overviewRows = buildOverviewRows({
    units: getEnemyOptions(),
    scope: calculatorState.overviewScope,
    targetTypes: getSelectedEnemyTargetTypes(),
    outcomeKinds: getSelectedOverviewOutcomeKinds(),
    weaponA,
    weaponB,
    selectedAttacksA,
    selectedAttacksB,
    hitCountsA,
    hitCountsB,
    distanceMetersA: getEngagementRangeMeters('A'),
    distanceMetersB: getEngagementRangeMeters('B')
  });

  if (overviewRows.length === 0) {
    createPlaceholder(container, 'No overview rows match the current scope, target, and outcome filters');
    return;
  }

  const sortedRows = sortEnemyZoneRows(overviewRows, {
    mode: 'compare',
    sortKey: calculatorState.enemySort.key,
    sortDir: calculatorState.enemySort.dir,
    groupMode: calculatorState.enemySort.groupMode,
    diffDisplayMode: calculatorState.diffDisplayMode,
    pinMain: false
  });

  const tbody = document.createElement('tbody');
  sortedRows.forEach((row) => {
    const tr = document.createElement('tr');
    if (row.groupStart) {
      tr.classList.add('group-start');
    }

    columns.forEach((column) => {
      const metricCell = buildMetricColumnCell(column.key, row.metrics, {
        diffDisplayMode: calculatorState.diffDisplayMode
      });
      if (metricCell) {
        tr.appendChild(metricCell);
        return;
      }

      const td = document.createElement('td');
      formatOverviewBaseCell(td, row, column.key);
      tr.appendChild(td);
    });

    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  container.appendChild(table);
}
