import {
  atkColorClass,
  apColorClass,
  classifyAtkType,
  dfColorClass
} from '../../colors.js';
import {
  calculatorState,
  getEngagementRangeMeters,
  getWeaponForSlot
} from '../data.js';
import { buildAttackUnionRows, getAttackRowKey } from '../compare-utils.js';
import { appendWeaponSelectionControls } from '../weapon-selection.js';
import { getWeaponRangeAdjustedCellDisplay } from './weapon-range-display.js';
import { createPlaceholder } from './shared.js';

const DEFAULT_WEAPON_HEADERS = ['Name', 'DMG', 'DUR', 'AP', 'DF', 'ST', 'PF'];

function getWeaponDisplayRows() {
  const weaponA = getWeaponForSlot('A');
  const weaponB = getWeaponForSlot('B');

  if (calculatorState.mode === 'compare') {
    return buildAttackUnionRows(weaponA, weaponB);
  }

  return (weaponA?.rows || []).map((row) => ({
    key: getAttackRowKey(row),
    displayRow: row,
    rowA: row,
    rowB: null
  }));
}

function formatWeaponCellValue(header, row, td, atkClass, displayContext = {}) {
  const weaponsState = window._weaponsState;
  const headerValue = row?.[header];
  let value = headerValue ?? '';
  const lowerHeader = header.toLowerCase();
  const isDamage = /^(damage|dmg)$/.test(lowerHeader);
  const isDuration = /^(dur|duration)$/.test(lowerHeader);

  if ((isDamage || isDuration) && atkClass) {
    const className = atkColorClass(atkClass);
    if (className) {
      td.classList.add(className);
    }
  }

  if (weaponsState?.keys?.apKey && header === weaponsState.keys.apKey) {
    td.classList.add(apColorClass(value));
  } else if (!weaponsState?.keys?.apKey && (lowerHeader === 'ap' || (lowerHeader.includes('armor') && lowerHeader.includes('pen')))) {
    td.classList.add(apColorClass(value));
  }

  if (weaponsState?.keys?.atkTypeKey && header === weaponsState.keys.atkTypeKey) {
    const className = atkColorClass(atkClass);
    if (className) {
      td.classList.add(className);
    }
  }

  if (lowerHeader === 'df') {
    const dfClassName = dfColorClass(value);
    if (dfClassName) {
      td.classList.add(dfClassName);
    }
  }

  if (weaponsState?.keys?.atkNameKey && header === weaponsState.keys.atkNameKey) {
    const className = atkColorClass(atkClass);
    if (className) {
      td.classList.add(className);
    }
    td.classList.add('trunc');
    if (value != null) {
      td.title = String(value);
    }
  }

  const rangedDisplay = getWeaponRangeAdjustedCellDisplay(header, displayContext.entry, displayContext);
  if (rangedDisplay) {
    td.textContent = rangedDisplay.text;
    td.title = rangedDisplay.title;
    td.classList.add('calc-range-adjusted-cell');
    if (rangedDisplay.isSplit) {
      td.classList.add('calc-range-adjusted-cell-split');
    }
    if (rangedDisplay.isAdjusted) {
      td.classList.add('calc-range-adjusted-cell-active');
    }
    return;
  }

  if (typeof value === 'number') {
    const numeric = Number(value);
    value = Number.isInteger(numeric) ? numeric.toString() : numeric.toFixed(3).replace(/\.0+$/, '');
  }

  td.textContent = value === null || value === undefined ? '' : value;
}

export function renderWeaponDetails() {
  const container = document.getElementById('calculator-weapon-details');
  if (!container) {
    return;
  }

  container.innerHTML = '';

  const compareMode = calculatorState.mode === 'compare';
  const weaponA = getWeaponForSlot('A');
  const weaponB = getWeaponForSlot('B');
  if ((!compareMode && !weaponA) || (compareMode && !weaponA && !weaponB)) {
    createPlaceholder(
      container,
      compareMode
        ? 'Select weapon A and/or weapon B to view details'
        : 'Select a weapon to view details'
    );
    return;
  }

  const rows = getWeaponDisplayRows();
  if (rows.length === 0) {
    createPlaceholder(container, 'No attack rows available for the selected weapon(s)');
    return;
  }

  const table = document.createElement('table');
  table.style.width = '100%';
  table.style.borderCollapse = 'collapse';
  table.className = 'calculator-table';

  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');

  const selectionHeaders = compareMode ? ['A', 'B'] : [''];
  selectionHeaders.forEach((label) => {
    const th = document.createElement('th');
    th.textContent = label;
    th.style.padding = '4px 10px';
    th.style.textAlign = 'center';
    th.style.borderBottom = '2px solid var(--border)';
    th.style.color = 'var(--muted)';
    th.style.width = '30px';
    headerRow.appendChild(th);
  });

  const weaponsState = window._weaponsState;
  const headers = weaponsState?.headers || DEFAULT_WEAPON_HEADERS;
  headers.forEach((header) => {
    const th = document.createElement('th');
    th.textContent = header;
    th.style.padding = '4px 10px';
    th.style.textAlign = 'left';
    th.style.borderBottom = '2px solid var(--border)';
    th.style.color = 'var(--muted)';
    headerRow.appendChild(th);
  });

  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  const atkTypeKey = weaponsState?.keys?.atkTypeKey;
  const rangeDisplayContext = {
    compareMode,
    weaponA,
    weaponB,
    rangeA: getEngagementRangeMeters('A'),
    rangeB: getEngagementRangeMeters('B')
  };

  rows.forEach((entry) => {
    const tr = document.createElement('tr');
    const displayRow = entry.displayRow;
    const atkClass = atkTypeKey ? classifyAtkType(displayRow, atkTypeKey) : null;
    appendWeaponSelectionControls(tr, entry, { compareMode });

    headers.forEach((header) => {
      const td = document.createElement('td');
      formatWeaponCellValue(header, displayRow, td, atkClass, {
        ...rangeDisplayContext,
        entry
      });
      tr.appendChild(td);
    });

    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  container.appendChild(table);
}
