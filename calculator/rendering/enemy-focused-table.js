import {
  calculatorState,
  getAttackHitCounts,
  getEngagementRangeMeters,
  getSelectedAttacks,
  getWeaponForSlot,
  toggleEnemySort
} from '../data.js';
import { buildFocusedZoneComparisonRows, sortEnemyZoneRows } from '../compare-utils.js';
import { formatEnemyBaseCell } from './enemy-base-cells.js';
import {
  ensureEnemySortKeyVisible,
  getEnemyColumns,
  getFocusedTargetingModes
} from './enemy-columns.js';
import { buildMetricColumnCell } from './metric-cells.js';
import { appendEnemyExplosionCell, appendEnemyProjectileCell } from './enemy-target-controls.js';
import { wireZoneRelationHighlights } from './zone-relation-highlights.js';

export function renderFocusedEnemyTable(container, enemy, {
  onRefreshEnemyCalculationViews = null,
  onRenderEnemyDetails = null
} = {}) {
  const table = document.createElement('table');
  table.style.width = '100%';
  table.style.borderCollapse = 'collapse';
  table.className = 'calculator-table';

  const weaponA = getWeaponForSlot('A');
  const weaponB = getWeaponForSlot('B');
  const selectedAttacksA = getSelectedAttacks('A');
  const selectedAttacksB = getSelectedAttacks('B');
  const hitCountsA = getAttackHitCounts('A', selectedAttacksA);
  const hitCountsB = getAttackHitCounts('B', selectedAttacksB);
  const {
    hasProjectileTargets,
    hasExplosiveTargets
  } = getFocusedTargetingModes(selectedAttacksA, selectedAttacksB);
  const targetColumnCount = Number(hasProjectileTargets) + Number(hasExplosiveTargets);

  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');

  if (hasProjectileTargets) {
    const projectileTh = document.createElement('th');
    projectileTh.textContent = 'Proj';
    projectileTh.style.padding = '4px 10px';
    projectileTh.style.textAlign = 'center';
    projectileTh.style.borderBottom = '2px solid var(--border)';
    projectileTh.style.color = 'var(--muted)';
    projectileTh.style.width = '30px';
    headerRow.appendChild(projectileTh);
  }

  if (hasExplosiveTargets) {
    const explosiveTh = document.createElement('th');
    explosiveTh.textContent = 'AoE';
    explosiveTh.style.padding = '4px 10px';
    explosiveTh.style.textAlign = 'center';
    explosiveTh.style.borderBottom = '2px solid var(--border)';
    explosiveTh.style.color = 'var(--muted)';
    explosiveTh.style.width = '30px';
    headerRow.appendChild(explosiveTh);
  }

  const columns = getEnemyColumns();
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
      onRenderEnemyDetails?.(enemy);
    });
    headerRow.appendChild(th);
  });

  thead.appendChild(headerRow);
  table.appendChild(thead);

  const zoneRows = buildFocusedZoneComparisonRows({
    enemy,
    weaponA,
    weaponB,
    selectedAttacksA,
    selectedAttacksB,
    hitCountsA,
    hitCountsB,
    distanceMetersA: getEngagementRangeMeters('A'),
    distanceMetersB: getEngagementRangeMeters('B')
  });

  const sortedRows = sortEnemyZoneRows(zoneRows, {
    mode: calculatorState.mode,
    sortKey: calculatorState.enemySort.key,
    sortDir: calculatorState.enemySort.dir,
    groupMode: calculatorState.enemySort.groupMode,
    diffDisplayMode: 'absolute',
    pinMain: true
  });

  const tbody = document.createElement('tbody');
  const rowEntries = [];

  sortedRows.forEach(({ zone, zoneIndex, metrics, groupStart }) => {
    const tr = document.createElement('tr');
    if (groupStart) {
      tr.classList.add('group-start');
    }

    if (hasProjectileTargets) {
      appendEnemyProjectileCell(tr, enemy.name, zoneIndex, targetColumnCount === 1 && !hasExplosiveTargets, {
        onRefreshEnemyCalculationViews
      });
    }

    if (hasExplosiveTargets) {
      appendEnemyExplosionCell(tr, zoneIndex, targetColumnCount === 1 && !hasProjectileTargets, {
        onRefreshEnemyCalculationViews
      });
    }

    columns.forEach((column) => {
      const metricCell = buildMetricColumnCell(column.key, metrics);
      if (metricCell) {
        tr.appendChild(metricCell);
        return;
      }

      const td = document.createElement('td');
      formatEnemyBaseCell(td, zone, column.key);
      tr.appendChild(td);
    });

    tbody.appendChild(tr);
    rowEntries.push({ tr, zone, zoneIndex });
  });

  const selectedZone = Number.isInteger(calculatorState.selectedZoneIndex)
    ? enemy?.zones?.[calculatorState.selectedZoneIndex] || null
    : null;
  wireZoneRelationHighlights(rowEntries, enemy, selectedZone);

  table.appendChild(tbody);
  container.appendChild(table);
}
