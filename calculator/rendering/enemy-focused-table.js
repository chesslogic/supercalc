import {
  calculatorState,
  getAttackHitCounts,
  getEngagementRangeMeters,
  getSelectedAttacks,
  getWeaponForSlot,
  toggleCompareHeaderLayout,
  toggleEnemySort
} from '../data.js';
import { buildFocusedZoneComparisonRows, sortEnemyZoneRows } from '../compare-utils.js';
import {
  ensureEnemySortKeyVisible,
  getEnemyColumns,
  getFocusedTargetingModes
} from './enemy-columns.js';
import { renderEnemyTableHeader } from './enemy-table-header.js';
import { renderGroupedEnemyRows } from './grouped-enemy-rows.js';
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

  const columns = getEnemyColumns();
  ensureEnemySortKeyVisible(columns);
  const thead = document.createElement('thead');
  const leadingColumns = [];

  if (hasProjectileTargets) {
    leadingColumns.push({
      label: 'Proj',
      align: 'center',
      width: '30px'
    });
  }

  if (hasExplosiveTargets) {
    leadingColumns.push({
      label: 'AoE',
      align: 'center',
      width: '30px'
    });
  }

  renderEnemyTableHeader(thead, {
    leadingColumns,
    columns,
    sortState: calculatorState.enemySort,
    compareHeaderLayout: calculatorState.compareHeaderLayout,
    onSort: (sortKey) => {
      toggleEnemySort(sortKey);
      onRenderEnemyDetails?.(enemy);
    },
    onToggleCompareHeaderLayout: () => {
      toggleCompareHeaderLayout();
      onRenderEnemyDetails?.(enemy);
    }
  });
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

  const rowEntries = renderGroupedEnemyRows(tbody, sortedRows, enemy, {
    columns,
    hasProjectileTargets,
    hasExplosiveTargets,
    onRefreshEnemyCalculationViews
  });

  const selectedZone = Number.isInteger(calculatorState.selectedZoneIndex)
    ? enemy?.zones?.[calculatorState.selectedZoneIndex] || null
    : null;
  wireZoneRelationHighlights(rowEntries, enemy, selectedZone);

  table.appendChild(tbody);
  container.appendChild(table);
}
