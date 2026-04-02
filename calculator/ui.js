// calculator/ui.js — calculator UI components
import {
  calculatorState,
  getEnemyOptions,
  getEngagementRangeMeters,
  getSelectedEnemyTargetTypes,
  getWeaponOptions,
  getWeaponSortModeOptionsForState,
  setCalculatorMode,
  setCompareView,
  setEngagementRangeMeters,
  setSelectedEnemy,
  setWeaponSortMode,
  setSelectedWeapon
} from './data.js';
import {
  filterEnemiesByTargetTypes,
  getEnemyScopeSummaryLabel,
  getEnemyUnitFrontLabel
} from './enemy-scope.js';
import { filterEnemiesByScope, getEnemyDropdownQueryState } from './selector-utils.js';
import { getWeaponOptionDisplayModel } from './weapon-dropdown.js';
import { copyShareableUrl } from './url-state.js';
import { state as weaponsState } from '../weapons/data.js';
import { enemyState } from '../enemies/data.js';
import { renderWeaponDetails, renderEnemyDetails } from './rendering.js';
import { renderCalculation } from './calculation.js';

let enemySelectorSetup = false;
let shareButtonSetup = false;
const ENGAGEMENT_RANGE_CONTROL_TITLE = 'Engagement distance used for displayed damage, shots, TTK, and recommendation breakpoint checks for this weapon slot.';

export function getCalculatorModeButtonTitle(mode) {
  if (mode === 'compare') {
    return 'Two weapons side-by-side for each enemy component. Try the Overview enemy!';
  }

  return 'One weapon at a time with the full enemy component table.';
}

export const ENEMY_OVERVIEW_DROPDOWN_CLASS = 'dropdown-item dropdown-item-overview';

export function getEnemyOverviewOptionHtml(scope = 'all') {
  const summaryLabel = getEnemyScopeSummaryLabel(scope);
  const summary = summaryLabel === 'All'
    ? 'compare all matching enemies'
    : `compare matching ${summaryLabel} enemies`;

  return `Overview <span class="overview-dropdown-meta">${summary}</span>`;
}

export function formatEngagementRangeDisplayValue(rangeMeters) {
  const normalizedRange = Math.max(0, Math.round(Number(rangeMeters) || 0));
  return normalizedRange === 0 ? 'Any / 0m' : `${normalizedRange}m`;
}

export function setupCalculator() {
  if (enemyState.units && enemyState.units.length > 0) {
    window.enemyDataLoaded = true;
  }

  setupModeToggle();
  setupWeaponSelector('A');
  setupWeaponSelector('B');
  setupEngagementRangeControl('A');
  setupEngagementRangeControl('B');

  if (!enemySelectorSetup) {
    setupEnemySelector();
    enemySelectorSetup = true;
  }

  if (!shareButtonSetup) {
    setupShareButton();
    shareButtonSetup = true;
  }

  syncCalculatorModeUi();
  renderWeaponDetails();
  renderEnemyDetails();
  renderCalculation();
}

function setupShareButton() {
  const shareButton = document.getElementById('calculator-share-link');
  const shareStatus = document.getElementById('calculator-share-status');
  if (!shareButton || !shareStatus) {
    return;
  }

  shareButton.title = 'Copy a link that restores the current calculator setup and tab filters.';
  shareButton.addEventListener('click', async () => {
    shareStatus.textContent = '';

    try {
      const { copied, url } = await copyShareableUrl();
      shareStatus.textContent = copied ? 'Link copied.' : 'Clipboard unavailable.';
      shareStatus.title = url || '';
    } catch (error) {
      console.error('Failed to copy shareable URL:', error);
      shareStatus.textContent = 'Copy failed.';
      shareStatus.title = '';
    }
  });
}

function syncCalculatorModeUi() {
  const calculatorContainer = document.querySelector('#tab-calculator .calculator-container');
  const modeSingleButton = document.getElementById('calculator-mode-single');
  const modeCompareButton = document.getElementById('calculator-mode-compare');
  const weaponSortSelect = document.getElementById('calculator-weapon-sort');
  const weaponRowB = document.getElementById('calculator-weapon-row-b');
  const weaponLabelA = document.getElementById('calculator-weapon-label-a');
  const rangeRowB = document.getElementById('calculator-range-row-b');
  const rangeLabelA = document.getElementById('calculator-range-label-a');

  const compareMode = calculatorState.mode === 'compare';

  calculatorContainer?.classList.toggle('calculator-mode-compare', compareMode);
  modeSingleButton?.classList.toggle('is-active', !compareMode);
  modeCompareButton?.classList.toggle('is-active', compareMode);
  if (modeSingleButton) {
    modeSingleButton.title = getCalculatorModeButtonTitle('single');
  }
  if (modeCompareButton) {
    modeCompareButton.title = getCalculatorModeButtonTitle('compare');
  }
  weaponRowB?.classList.toggle('hidden', !compareMode);
  rangeRowB?.classList.toggle('hidden', !compareMode);

  if (weaponLabelA) {
    weaponLabelA.textContent = compareMode ? 'Weapon A:' : 'Weapon:';
  }
  if (rangeLabelA) {
    rangeLabelA.textContent = compareMode ? 'Range A:' : 'Range:';
  }

  if (weaponSortSelect) {
    const availableSortModes = getWeaponSortModeOptionsForState();
    weaponSortSelect.innerHTML = '';
    availableSortModes.forEach(({ id, label }) => {
      const option = document.createElement('option');
      option.value = id;
      option.textContent = label;
      weaponSortSelect.appendChild(option);
    });
    weaponSortSelect.value = calculatorState.weaponSortMode;
  }

  syncWeaponInputValue('A');
  syncWeaponInputValue('B');
  syncEngagementRangeControl('A');
  syncEngagementRangeControl('B');
  syncEnemyInputValue();
}

function getEnemyInputDisplayValue() {
  if (calculatorState.mode === 'compare' && calculatorState.compareView === 'overview') {
    return 'Overview';
  }

  return calculatorState.selectedEnemy?.name || '';
}

export function getWeaponInputDisplayValue(slot) {
  const weapon = calculatorState[slot === 'B' ? 'weaponB' : 'weaponA'];
  if (!weapon) {
    return '';
  }

  const displayModel = getWeaponOptionDisplayModel(weapon);
  return displayModel.labelText || weapon.name || '';
}

function syncWeaponInputValue(slot) {
  const suffix = slot.toLowerCase();
  const weaponInput = document.getElementById(`calculator-weapon-input-${suffix}`)
    || (slot === 'A' ? document.getElementById('calculator-weapon-input') : null);
  if (weaponInput) {
    weaponInput.value = getWeaponInputDisplayValue(slot);
  }
}

function syncEngagementRangeControl(slot) {
  const suffix = slot.toLowerCase();
  const rangeInput = document.getElementById(`calculator-range-input-${suffix}`);
  const rangeValue = document.getElementById(`calculator-range-value-${suffix}`);
  const currentRange = getEngagementRangeMeters(slot);
  const displayValue = formatEngagementRangeDisplayValue(currentRange);

  if (rangeInput) {
    rangeInput.value = String(currentRange);
    rangeInput.title = ENGAGEMENT_RANGE_CONTROL_TITLE;
  }
  if (rangeValue) {
    rangeValue.textContent = displayValue;
    rangeValue.title = ENGAGEMENT_RANGE_CONTROL_TITLE;
  }
}

function syncEnemyInputValue() {
  const enemyInput = document.getElementById('calculator-enemy-input');
  if (enemyInput) {
    enemyInput.value = getEnemyInputDisplayValue();
  }
}

function setupModeToggle() {
  const modeSingleButton = document.getElementById('calculator-mode-single');
  const modeCompareButton = document.getElementById('calculator-mode-compare');
  const weaponSortSelect = document.getElementById('calculator-weapon-sort');

  if (!modeSingleButton || !modeCompareButton) {
    return;
  }

  modeSingleButton.addEventListener('click', () => {
    if (calculatorState.mode === 'single') {
      return;
    }

    setCalculatorMode('single');
    syncCalculatorModeUi();
    renderWeaponDetails();
    renderEnemyDetails();
    renderCalculation();
  });

  modeCompareButton.addEventListener('click', () => {
    if (calculatorState.mode === 'compare') {
      return;
    }

    setCalculatorMode('compare');
    syncCalculatorModeUi();
    renderWeaponDetails();
    renderEnemyDetails();
    renderCalculation();
  });

  weaponSortSelect?.addEventListener('change', (event) => {
    setWeaponSortMode(event.target.value);
    syncCalculatorModeUi();
    renderWeaponDetails();
    renderEnemyDetails();
    renderCalculation();
  });
}

function setupEngagementRangeControl(slot) {
  const suffix = slot.toLowerCase();
  const rangeInput = document.getElementById(`calculator-range-input-${suffix}`);
  const rangeValue = document.getElementById(`calculator-range-value-${suffix}`);

  if (!rangeInput || !rangeValue) {
    console.warn(`[calculator] Range control DOM missing for slot ${slot}`);
    return;
  }

  rangeInput.title = ENGAGEMENT_RANGE_CONTROL_TITLE;
  rangeValue.title = ENGAGEMENT_RANGE_CONTROL_TITLE;

  rangeInput.addEventListener('input', (event) => {
    rangeValue.textContent = formatEngagementRangeDisplayValue(event.target.value);
  });

  rangeInput.addEventListener('change', (event) => {
    setEngagementRangeMeters(slot, event.target.value);
    syncEngagementRangeControl(slot);
    renderEnemyDetails();
    renderCalculation();
  });

  syncEngagementRangeControl(slot);
}

function setupWeaponSelector(slot) {
  const suffix = slot.toLowerCase();
  const weaponInput = document.getElementById(`calculator-weapon-input-${suffix}`)
    || (slot === 'A' ? document.getElementById('calculator-weapon-input') : null);
  const weaponDropdown = document.getElementById(`calculator-weapon-dropdown-${suffix}`)
    || (slot === 'A' ? document.getElementById('calculator-weapon-dropdown') : null);
  const weaponSelector = weaponInput?.parentElement;

  if (!weaponInput || !weaponDropdown || !weaponSelector) {
    console.warn(`[calculator] Weapon selector DOM missing for slot ${slot}`);
    return;
  }

  const clearButton = document.createElement('button');
  clearButton.className = 'calculator-clear-btn';
  clearButton.textContent = '×';
  clearButton.type = 'button';
  clearButton.addEventListener('click', (event) => {
    event.stopPropagation();
    setSelectedWeapon(slot, null);
    syncWeaponInputValue(slot);
    renderWeaponDetails();
    renderEnemyDetails();
    renderCalculation();
    populateDropdown('');
  });
  weaponSelector.appendChild(clearButton);

  let isOpen = false;

  function populateDropdown(query = '') {
    const options = getWeaponOptions(slot);

    if (!options || options.length === 0) {
      weaponDropdown.innerHTML = '';
      const noResults = document.createElement('div');
      noResults.className = 'dropdown-item';
      noResults.textContent = 'Loading weapon data...';
      weaponDropdown.appendChild(noResults);
      return;
    }

    const filteredOptions = options.filter((weapon) => {
      const type = (weapon.type || '').toLowerCase();
      const sub = (weapon.sub || '').toLowerCase();
      const code = (weapon.code || '').toLowerCase();
      const name = (weapon.name || '').toLowerCase();
      const searchable = `${type} ${sub} ${code} ${name}`;
      return searchable.includes(query.toLowerCase());
    });

    weaponDropdown.innerHTML = '';

    if (filteredOptions.length === 0) {
      const noResults = document.createElement('div');
      noResults.className = 'dropdown-item';
      noResults.textContent = 'No weapons found';
      weaponDropdown.appendChild(noResults);
      return;
    }

    filteredOptions.forEach((weapon) => {
      const item = document.createElement('div');
      item.className = 'dropdown-item weapon-dropdown-item';

      const displayModel = getWeaponOptionDisplayModel(weapon);
      item.title = displayModel.apTitle;

      const label = document.createElement('span');
      label.className = 'weapon-dropdown-label';
      label.textContent = displayModel.labelText;
      item.appendChild(label);

      const apValue = document.createElement('span');
      apValue.className = `weapon-dropdown-ap ${displayModel.apClassName}`.trim();
      apValue.title = displayModel.apTitle;
      apValue.textContent = displayModel.apText;

      if (displayModel.apMarkerText) {
        const marker = document.createElement('span');
        marker.className = 'weapon-dropdown-ap-marker';
        marker.textContent = displayModel.apMarkerText;
        apValue.appendChild(marker);
      }

      item.appendChild(apValue);
      item.addEventListener('click', () => {
        setSelectedWeapon(slot, weapon);
        syncWeaponInputValue(slot);
        closeDropdown();
        renderWeaponDetails();
        renderEnemyDetails();
        renderCalculation();
      });
      weaponDropdown.appendChild(item);
    });
  }

  function openDropdown() {
    isOpen = true;
    weaponDropdown.classList.remove('hidden');
    populateDropdown(weaponInput.value);
  }

  function closeDropdown() {
    isOpen = false;
    weaponDropdown.classList.add('hidden');
  }

  weaponInput.addEventListener('focus', () => {
    if (!isOpen) {
      openDropdown();
    }
  });

  weaponInput.addEventListener('input', (event) => {
    if (!isOpen) {
      openDropdown();
    }

    populateDropdown(event.target.value);
  });

  document.addEventListener('click', (event) => {
    if (!weaponInput.contains(event.target) && !weaponDropdown.contains(event.target)) {
      closeDropdown();
    }
  });

  populateDropdown();
  syncWeaponInputValue(slot);

  const checkDataAvailability = setInterval(() => {
    if (weaponsState.groups && weaponsState.groups.length > 0) {
      syncWeaponInputValue(slot);
      if (isOpen) {
        populateDropdown(weaponInput.value);
      }
      clearInterval(checkDataAvailability);
    }
  }, 200);

  setTimeout(() => clearInterval(checkDataAvailability), 5000);
}

function setupEnemySelector() {
  const enemyInput = document.getElementById('calculator-enemy-input');
  const enemyDropdown = document.getElementById('calculator-enemy-dropdown');
  const enemySelector = enemyInput?.parentElement;

  if (!enemyInput || !enemyDropdown || !enemySelector) {
    console.warn('[calculator] Enemy selector DOM missing');
    return;
  }

  const clearButton = document.createElement('button');
  clearButton.className = 'calculator-clear-btn';
  clearButton.textContent = '×';
  clearButton.type = 'button';
  clearButton.addEventListener('click', (event) => {
    event.stopPropagation();
    setCompareView('focused');
    setSelectedEnemy(null);
    syncEnemyInputValue();
    renderEnemyDetails();
    renderCalculation();
    populateDropdown('');
  });
  enemySelector.appendChild(clearButton);

  let isOpen = false;

  function populateDropdown(query = '') {
    const options = getEnemyOptions();
    const {
      effectiveQuery,
      showOverviewOption
    } = getEnemyDropdownQueryState(query, {
      mode: calculatorState.mode,
      compareView: calculatorState.compareView,
      selectedEnemyName: calculatorState.selectedEnemy?.name || ''
    });

    if (!options || options.length === 0) {
      enemyDropdown.innerHTML = '';
      const noResults = document.createElement('div');
      noResults.className = 'dropdown-item';
      noResults.textContent = 'Loading enemy data...';
      enemyDropdown.appendChild(noResults);
      return;
    }

    const scopedOptions = filterEnemiesByScope(options, calculatorState.overviewScope);
    const targetFilteredOptions = filterEnemiesByTargetTypes(scopedOptions, getSelectedEnemyTargetTypes());
    const filteredOptions = targetFilteredOptions.filter((enemy) =>
      enemy.name.toLowerCase().includes(effectiveQuery) ||
      getEnemyUnitFrontLabel(enemy).toLowerCase().includes(effectiveQuery) ||
      String(enemy.faction || '').toLowerCase().includes(effectiveQuery)
    );

    enemyDropdown.innerHTML = '';

    if (showOverviewOption) {
      const overviewItem = document.createElement('div');
      overviewItem.className = ENEMY_OVERVIEW_DROPDOWN_CLASS;
      overviewItem.innerHTML = getEnemyOverviewOptionHtml(calculatorState.overviewScope);
      overviewItem.title = 'Compare both weapons across every enemy currently matching the scope and search filter.';
      overviewItem.classList.toggle('is-active', calculatorState.compareView === 'overview');
      overviewItem.addEventListener('click', () => {
        setCompareView('overview');
        syncEnemyInputValue();
        closeDropdown();
        renderEnemyDetails();
        renderCalculation();
      });
      enemyDropdown.appendChild(overviewItem);
    }

    if (filteredOptions.length === 0 && enemyDropdown.children.length === 0) {
      const noResults = document.createElement('div');
      noResults.className = 'dropdown-item';
      noResults.textContent = 'No enemies found';
      enemyDropdown.appendChild(noResults);
      return;
    }

    filteredOptions.forEach((enemy) => {
      const item = document.createElement('div');
      item.className = 'dropdown-item';
      item.innerHTML = `${enemy.name} <span style="color:var(--muted); font-size:11px;">(${getEnemyUnitFrontLabel(enemy)})</span>`;
      item.addEventListener('click', () => {
        setSelectedEnemy(enemy);
        syncEnemyInputValue();
        closeDropdown();
        renderEnemyDetails();
        renderCalculation();
      });
      enemyDropdown.appendChild(item);
    });
  }

  function openDropdown() {
    isOpen = true;
    enemyDropdown.classList.remove('hidden');
    populateDropdown(enemyInput.value);
  }

  function closeDropdown() {
    isOpen = false;
    enemyDropdown.classList.add('hidden');
  }

  enemyInput.addEventListener('focus', () => {
    if (!isOpen) {
      openDropdown();
    }
  });

  enemyInput.addEventListener('input', (event) => {
    if (!isOpen) {
      openDropdown();
    }

    populateDropdown(event.target.value);
  });

  document.addEventListener('click', (event) => {
    if (!enemyInput.contains(event.target) && !enemyDropdown.contains(event.target)) {
      closeDropdown();
    }
  });

  populateDropdown();

  const checkDataAvailability = setInterval(() => {
    if (enemyState.units && enemyState.units.length > 0) {
      if (isOpen) {
        populateDropdown(enemyInput.value);
      }
      clearInterval(checkDataAvailability);
    }
  }, 200);

  setTimeout(() => clearInterval(checkDataAvailability), 5000);
}
