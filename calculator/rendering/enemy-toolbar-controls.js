import {
  calculatorState,
  getEnemyDropdownSortModeOptionsForState,
  getEnemyTargetTypeOptionsForState,
  getOverviewScopeOptionGroupsForState,
  getSelectedEnemyTargetTypes,
  setDiffDisplayMode,
  setEnemyDropdownSortDir,
  setEnemyDropdownSortMode,
  setEnemyGroupMode,
  setEnemyTableMode,
  setOverviewScope,
  toggleSelectedEnemyTargetType
} from '../data.js';
import {
  ensureEnemySortKeyVisible,
  getEnemyColumns,
  getOverviewColumns
} from './enemy-columns.js';

function appendToolbarButtonGroup(toolbar, labelText, items, isActive, onClick) {
  const label = document.createElement('span');
  label.className = 'label';
  label.textContent = labelText;
  toolbar.appendChild(label);

  const group = document.createElement('div');
  group.className = 'calculator-toolbar-group';

  items.forEach(({ value, label: itemLabel }) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'button calculator-toolbar-button';
    button.textContent = itemLabel;
    button.classList.toggle('is-active', isActive(value));
    button.addEventListener('click', () => onClick(value));
    group.appendChild(button);
  });

  toolbar.appendChild(group);
}

function appendToolbarSelectGroup(toolbar, labelText, groups, selectedValue, onChange) {
  const label = document.createElement('span');
  label.className = 'label';
  label.textContent = labelText;
  toolbar.appendChild(label);

  const group = document.createElement('div');
  group.className = 'calculator-toolbar-group calculator-toolbar-select-group';

  const select = document.createElement('select');
  select.className = 'calculator-toolbar-select';

  (groups || []).forEach((entry) => {
    if (!entry) {
      return;
    }

    if (entry.label && Array.isArray(entry.options)) {
      const optgroup = document.createElement('optgroup');
      optgroup.label = entry.label;
      entry.options.forEach(({ id, label: optionLabel }) => {
        const option = document.createElement('option');
        option.value = id;
        option.textContent = optionLabel;
        optgroup.appendChild(option);
      });
      select.appendChild(optgroup);
      return;
    }

    (entry.options || []).forEach(({ id, label: optionLabel }) => {
      const option = document.createElement('option');
      option.value = id;
      option.textContent = optionLabel;
      select.appendChild(option);
    });
  });

  select.value = selectedValue;
  select.addEventListener('change', (event) => onChange(event.target.value));
  group.appendChild(select);
  toolbar.appendChild(group);
}

export function appendEnemyToolbarControl(toolbar, controlId, {
  overviewActive = false,
  onRefreshEnemyCalculationViews = null,
  onRenderEnemyDetails = null
} = {}) {
  switch (controlId) {
    case 'view':
      appendToolbarButtonGroup(
        toolbar,
        'View:',
        [
          { value: 'analysis', label: 'Analysis' },
          { value: 'stats', label: 'Stats' }
        ],
        (value) => calculatorState.enemyTableMode === value,
        (value) => {
          setEnemyTableMode(value);
          ensureEnemySortKeyVisible(overviewActive ? getOverviewColumns() : getEnemyColumns());
          onRenderEnemyDetails?.();
        }
      );
      break;
    case 'grouping':
      appendToolbarButtonGroup(
        toolbar,
        'Grouping:',
        [
          { value: 'none', label: 'No grouping' },
          { value: 'outcome', label: 'Group by outcome' }
        ],
        (value) => calculatorState.enemySort.groupMode === value,
        (value) => {
          setEnemyGroupMode(value);
          onRenderEnemyDetails?.();
        }
      );
      break;
    case 'scope':
      appendToolbarSelectGroup(
        toolbar,
        'Scope:',
        getOverviewScopeOptionGroupsForState(),
        calculatorState.overviewScope,
        (value) => {
          if (overviewActive) {
            ensureEnemySortKeyVisible(getOverviewColumns());
          }
          setOverviewScope(value);
          onRefreshEnemyCalculationViews?.();
        }
      );
      break;
    case 'targets':
      appendToolbarButtonGroup(
        toolbar,
        'Targets:',
        getEnemyTargetTypeOptionsForState().map((option) => ({ value: option.id, label: option.label })),
        (value) => getSelectedEnemyTargetTypes().includes(value),
        (value) => {
          toggleSelectedEnemyTargetType(value);
          onRefreshEnemyCalculationViews?.();
        }
      );
      break;
    case 'sort':
      appendToolbarButtonGroup(
        toolbar,
        'Sort:',
        getEnemyDropdownSortModeOptionsForState().map((option) => ({
          value: option.id,
          label: calculatorState.enemyDropdownSortMode === option.id
            ? `${option.label} ${calculatorState.enemyDropdownSortDir === 'desc' ? '↓' : '↑'}`
            : option.label
        })),
        (value) => calculatorState.enemyDropdownSortMode === value,
        (value) => {
          if (calculatorState.enemyDropdownSortMode === value) {
            setEnemyDropdownSortDir(calculatorState.enemyDropdownSortDir === 'desc' ? 'asc' : 'desc');
          } else {
            setEnemyDropdownSortMode(value);
            setEnemyDropdownSortDir('asc');
          }
          onRefreshEnemyCalculationViews?.();
        }
      );
      break;
    case 'diff':
      appendToolbarButtonGroup(
        toolbar,
        'Diff:',
        [
          { value: 'absolute', label: 'Absolute' },
          { value: 'percent', label: '%' }
        ],
        (value) => calculatorState.diffDisplayMode === value,
        (value) => {
          setDiffDisplayMode(value);
          onRefreshEnemyCalculationViews?.();
        }
      );
      break;
    default:
      break;
  }
}
