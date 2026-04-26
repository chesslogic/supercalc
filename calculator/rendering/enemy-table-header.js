function createHeaderCell(column, {
  sortState = null,
  onSort = null,
  onClick = null,
  rowSpan = 1,
  colSpan = 1,
  className = ''
} = {}) {
  const th = document.createElement('th');
  th.textContent = column.label;
  th.title = column.title || '';

  if (className) {
    th.classList.add(...className.split(/\s+/).filter(Boolean));
  }

  if (column.align) {
    th.style.textAlign = column.align;
  }
  if (column.width) {
    th.style.width = column.width;
  }

  if (rowSpan > 1) {
    th.rowSpan = rowSpan;
  }
  if (colSpan > 1) {
    th.colSpan = colSpan;
  }

  if (column.sortable !== false && column.key && typeof onSort === 'function') {
    th.classList.add('sortable');
    if (sortState?.key === column.key) {
      th.classList.add(`sort-${sortState.dir}`);
    }
    th.addEventListener('click', () => onSort(column.key));
  } else if (typeof onClick === 'function') {
    th.addEventListener('click', onClick);
  }

  return th;
}

function getCompareHeaderToggleTitle(compareHeaderLayout = 'metric') {
  return compareHeaderLayout === 'slot'
    ? 'Click to regroup compare columns by metric (Shots / Range / Margin / TTK)'
    : 'Click to regroup compare columns by slot (A / B / Diff)';
}

function getSharedGroupTitle(groupColumns = []) {
  const titles = [...new Set(
    groupColumns
      .map((column) => String(column.title || '').trim())
      .filter(Boolean)
  )];

  return titles.length === 1 ? titles[0] : '';
}

function buildGroupHeaderTitle(groupColumns, compareHeaderLayout) {
  return [
    getSharedGroupTitle(groupColumns),
    getCompareHeaderToggleTitle(compareHeaderLayout)
  ]
    .filter(Boolean)
    .join('\n');
}

export function renderEnemyTableHeader(thead, {
  leadingColumns = [],
  columns = [],
  sortState = null,
  onSort = null,
  compareHeaderLayout = 'metric',
  onToggleCompareHeaderLayout = null
} = {}) {
  const topRow = document.createElement('tr');
  const combinedColumns = [...leadingColumns, ...columns];
  const usesCompareGroups = combinedColumns.some((column) => column.compareHeaderGroupKey);

  if (!usesCompareGroups) {
    combinedColumns.forEach((column) => {
      topRow.appendChild(createHeaderCell(column, {
        sortState,
        onSort
      }));
    });
    thead.appendChild(topRow);
    return;
  }

  topRow.classList.add('calc-compare-header-group-row');
  const detailRow = document.createElement('tr');
  detailRow.classList.add('calc-compare-header-detail-row');

  let activeGroupKey = null;
  let activeGroupColumns = [];

  const flushActiveGroup = () => {
    if (activeGroupColumns.length === 0) {
      return;
    }

    const groupLabel = activeGroupColumns[0].compareHeaderGroupLabel;
    topRow.appendChild(createHeaderCell({
      label: groupLabel,
      title: buildGroupHeaderTitle(activeGroupColumns, compareHeaderLayout),
      sortable: false
    }, {
      colSpan: activeGroupColumns.length,
      className: typeof onToggleCompareHeaderLayout === 'function'
        ? 'calc-compare-header-group is-toggle'
        : 'calc-compare-header-group',
      onClick: onToggleCompareHeaderLayout
    }));

    activeGroupColumns.forEach((column) => {
      detailRow.appendChild(createHeaderCell(column, {
        sortState,
        onSort,
        className: 'calc-compare-header-detail'
      }));
    });

    activeGroupKey = null;
    activeGroupColumns = [];
  };

  combinedColumns.forEach((column) => {
    if (!column.compareHeaderGroupKey) {
      flushActiveGroup();
      topRow.appendChild(createHeaderCell(column, {
        sortState,
        onSort,
        rowSpan: 2,
        className: 'calc-compare-header-spanning'
      }));
      return;
    }

    if (activeGroupKey !== null && activeGroupKey !== column.compareHeaderGroupKey) {
      flushActiveGroup();
    }

    activeGroupKey = column.compareHeaderGroupKey;
    activeGroupColumns.push(column);
  });

  flushActiveGroup();

  thead.appendChild(topRow);
  thead.appendChild(detailRow);
}
