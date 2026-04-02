import { calculatorState, getSelectedAttackKeys, setSelectedAttack } from './data.js';
import { refreshEnemyCalculationViews } from './rendering.js';

function appendWeaponSelectionCell(tr, { slot, attackRow, attackKey }) {
  const td = document.createElement('td');
  td.style.padding = '4px 10px';
  td.style.borderBottom = '1px solid var(--border)';
  td.style.width = '30px';
  td.style.textAlign = 'center';

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.disabled = !attackRow;
  checkbox.checked = attackRow ? getSelectedAttackKeys(slot).includes(attackKey) : false;

  if (!attackRow) {
    checkbox.title = `Weapon ${slot} does not have this attack row`;
  }

  checkbox.addEventListener('change', () => {
    setSelectedAttack(slot, attackKey, checkbox.checked);
    refreshEnemyCalculationViews();
  });

  td.appendChild(checkbox);
  tr.appendChild(td);

  return checkbox;
}

function appendSingleModeRowSelection(tr, checkbox, attackKey) {
  tr.style.cursor = 'pointer';
  tr.addEventListener('click', (event) => {
    if (event.target !== checkbox) {
      checkbox.checked = !checkbox.checked;
      setSelectedAttack('A', attackKey, checkbox.checked);
      refreshEnemyCalculationViews();
    }
  });
}

function appendCompareModeRowSelection(tr, checkboxA, checkboxB, entry, attackKey) {
  const availableSlots = [entry.rowA ? 'A' : null, entry.rowB ? 'B' : null].filter(Boolean);
  if (availableSlots.length !== 1) {
    return;
  }

  tr.style.cursor = 'pointer';
  tr.addEventListener('click', (event) => {
    if (event.target === checkboxA || event.target === checkboxB) {
      return;
    }

    const slot = availableSlots[0];
    const targetCheckbox = slot === 'A' ? checkboxA : checkboxB;
    if (!targetCheckbox) {
      return;
    }

    targetCheckbox.checked = !targetCheckbox.checked;
    setSelectedAttack(slot, attackKey, targetCheckbox.checked);
    refreshEnemyCalculationViews();
  });
}

export function appendWeaponSelectionControls(tr, entry, {
  compareMode = calculatorState.mode === 'compare'
} = {}) {
  const attackKey = entry.key;
  const checkboxA = appendWeaponSelectionCell(tr, {
    slot: 'A',
    attackRow: entry.rowA,
    attackKey
  });

  let checkboxB = null;
  if (compareMode) {
    checkboxB = appendWeaponSelectionCell(tr, {
      slot: 'B',
      attackRow: entry.rowB,
      attackKey
    });
  }

  if (!compareMode) {
    appendSingleModeRowSelection(tr, checkboxA, attackKey);
  } else {
    appendCompareModeRowSelection(tr, checkboxA, checkboxB, entry, attackKey);
  }

  return { checkboxA, checkboxB };
}
