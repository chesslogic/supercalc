import {
  calculatorState,
  getAttackHitCounts,
  getEnemyOptions,
  getEngagementRangeMeters,
  getSelectedAttacks,
  getSelectedEnemyTargetTypes,
  getWeaponForSlot,
  toggleEnemySort
} from '../data.js';
import { buildOverviewRows, sortEnemyZoneRows } from '../compare-utils.js';
import { buildMetricColumnCell } from './metric-cells.js';
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

  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  const columns = getOverviewColumns();
  ensureEnemySortKeyVisible(columns);

  columns.forEach((column) => {
    const th = document.createElement('th');
    th.textContent = column.label;
    th.title = column.title || '';
    th.classList.add('sortable');
    if (calculatorState.enemySort.key === column.key) {
      th.classList.add(`sort-${calculatorState.enemySort.dir}`);
    }
    th.addEventListener('click', () => {
      toggleEnemySort(column.key);
      onRenderEnemyDetails?.();
    });
    headerRow.appendChild(th);
  });

  thead.appendChild(headerRow);
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
    createPlaceholder(container, 'No overview rows are available for the current scope and target filters');
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
