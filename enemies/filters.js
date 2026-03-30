// enemies/filters.js — enemy search and filter controls
import {
  enemyState,
  resetEnemyFilterState,
  setEnemySearchQuery,
  setEnemySortState,
  toggleActiveEnemyFaction
} from './data.js';
import { renderEnemyTable } from './table.js';
import { debounce } from '../utils.js';

function syncEnemySearchInput() {
  const enemySearchEl = globalThis.document?.getElementById('enemySearch');
  if (enemySearchEl && enemySearchEl.value !== enemyState.searchQuery) {
    enemySearchEl.value = enemyState.searchQuery;
  }
}

function syncEnemyFactionChipState() {
  const factionChips = globalThis.document?.querySelectorAll('#enemyFactionFilters .chip') || [];
  factionChips.forEach((chip) => {
    chip.classList.toggle('active', enemyState.activeFactions.includes(String(chip.dataset.val || '').trim()));
  });
}

function clearEnemySortIndicators() {
  const sortableHeaders = globalThis.document?.querySelectorAll('#enemyTable th.sortable') || [];
  sortableHeaders.forEach((header) => {
    header.classList.remove('sort-asc', 'sort-desc');
  });
}

export function syncEnemyFilterUi() {
  syncEnemySearchInput();
  syncEnemyFactionChipState();
}

export function applyEnemyFilters() {
  const activeFactions = [...enemyState.activeFactions];
  const factionFilterActive = activeFactions.length > 0;
  const query = enemyState.searchQuery.trim().toLowerCase();
  const hasSearch = query.length > 0;

  if (!factionFilterActive && !hasSearch) {
    enemyState.filterActive = false;
    enemyState.filteredUnits = [];
    renderEnemyTable();
    return;
  }

  let filteredUnits = enemyState.units;

  if (factionFilterActive) {
    const factionUnits = new Set();
    for (const faction of activeFactions) {
      const units = enemyState.factionIndex.get(faction);
      if (units) {
        for (const unit of units) {
          factionUnits.add(unit);
        }
      }
    }
    filteredUnits = filteredUnits.filter((unit) => factionUnits.has(unit));
  }

  if (hasSearch) {
    filteredUnits = filteredUnits.filter((unit) => {
      const searchText = enemyState.searchIndex.get(unit);
      if (!searchText) {
        return false;
      }

      const queryWords = query.split(/\s+/).filter((word) => word.length > 0);
      return queryWords.every((word) => searchText.includes(word));
    });
  }

  enemyState.filteredUnits = filteredUnits;
  enemyState.filterActive = true;
  renderEnemyTable();
}

export function buildEnemyFactionFilters() {
  const el = document.getElementById('enemyFactionFilters');
  if (!el) return;

  el.innerHTML = '';

  for (const faction of enemyState.factions) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip' + (enemyState.activeFactions.includes(faction) ? ' active' : '');
    chip.textContent = faction;
    chip.dataset.val = faction;
    chip.addEventListener('click', () => {
      toggleActiveEnemyFaction(chip.dataset.val);
      chip.classList.toggle('active', enemyState.activeFactions.includes(faction));
      applyEnemyFilters();
    });
    el.appendChild(chip);
  }

  syncEnemyFilterUi();
  applyEnemyFilters();
}

const enemySearchEl = globalThis.document?.getElementById('enemySearch');
if (enemySearchEl) {
  const debouncedApplyEnemyFilters = debounce(() => {
    applyEnemyFilters();
  }, 50);

  enemySearchEl.addEventListener('input', (event) => {
    setEnemySearchQuery(event.target.value || '');
    debouncedApplyEnemyFilters();
  });
}

const enemyResetEl = globalThis.document?.getElementById('enemyResetSort');
if (enemyResetEl) {
  enemyResetEl.addEventListener('click', () => {
    resetEnemyFilterState();
    syncEnemyFilterUi();
    clearEnemySortIndicators();
    setEnemySortState(null, 'asc');
    applyEnemyFilters();
  });
}

export function applyEnemyFilterState({
  searchQuery = enemyState.searchQuery,
  activeFactions = enemyState.activeFactions,
  sortKey = enemyState.sortKey,
  sortDir = enemyState.sortDir
} = {}, {
  render = true
} = {}) {
  setEnemySearchQuery(searchQuery);
  enemyState.activeFactions = [...new Set((Array.isArray(activeFactions) ? activeFactions : []).map((value) => String(value ?? '').trim()).filter(Boolean))];
  setEnemySortState(sortKey, sortDir);
  syncEnemyFilterUi();
  if (render) {
    applyEnemyFilters();
  }
}

export function getEnemyFilterStateSnapshot() {
  return {
    searchQuery: enemyState.searchQuery,
    activeFactions: [...enemyState.activeFactions],
    sortKey: enemyState.sortKey,
    sortDir: enemyState.sortDir
  };
}
