// weapons/filters.js — search and reset controls
import {
  resetWeaponFilterState,
  savePinnedWeapons,
  setWeaponSearchQuery,
  setWeaponSortState,
  state,
  toggleActiveWeaponSub,
  toggleActiveWeaponType
} from './data.js';
import { applyFilters, renderTable } from './table.js';
import { debounce } from '../utils.js';

function syncSearchInput() {
  const searchEl = globalThis.document?.getElementById('search');
  if (searchEl && searchEl.value !== state.searchQuery) {
    searchEl.value = state.searchQuery;
  }
}

function syncTypeChipState() {
  const chips = globalThis.document?.querySelectorAll('#typeFilters .chip') || [];
  chips.forEach((chip) => {
    chip.classList.toggle('active', state.activeTypes.includes(String(chip.dataset.val || '').toLowerCase()));
  });
}

function syncSubChipState() {
  const chips = globalThis.document?.querySelectorAll('#subFilters .chip') || [];
  chips.forEach((chip) => {
    chip.classList.toggle('active', state.activeSubs.includes(String(chip.dataset.val || '').toLowerCase()));
  });
}

function clearWeaponSortIndicators() {
  const sortableHeaders = globalThis.document?.querySelectorAll('#weaponsTable th') || [];
  sortableHeaders.forEach((header) => {
    header.classList.remove('sort-asc', 'sort-desc');
  });
}

export function syncWeaponFilterUi() {
  syncSearchInput();
  syncTypeChipState();
  syncSubChipState();
}

const searchEl = globalThis.document?.getElementById('search');
if (searchEl) {
  const debouncedApplyFilters = debounce(() => {
    applyFilters();
  }, 50);

  searchEl.addEventListener('input', (event) => {
    setWeaponSearchQuery(event.target.value || '');
    debouncedApplyFilters();
  });
}

const resetEl = globalThis.document?.getElementById('resetSort');
if (resetEl) {
  resetEl.addEventListener('click', () => {
    resetWeaponFilterState();
    syncWeaponFilterUi();
    clearWeaponSortIndicators();
    setWeaponSortState(null, 'asc');
    applyFilters();
    renderTable();
  });
}

// Clear all pins button
const clearPinsEl = globalThis.document?.getElementById('clearPins');
if (clearPinsEl) {
  clearPinsEl.addEventListener('click', () => {
    state.pinnedWeapons.clear();
    savePinnedWeapons();
    applyFilters();
    renderTable();
  });
}

export function applyWeaponFilterState({
  searchQuery = state.searchQuery,
  activeTypes = state.activeTypes,
  activeSubs = state.activeSubs,
  sortKey = state.sortKey,
  sortDir = state.sortDir
} = {}, {
  render = true
} = {}) {
  setWeaponSearchQuery(searchQuery);
  state.activeTypes = [...new Set((Array.isArray(activeTypes) ? activeTypes : []).map((value) => String(value ?? '').trim().toLowerCase()).filter(Boolean))];
  state.activeSubs = [...new Set((Array.isArray(activeSubs) ? activeSubs : []).map((value) => String(value ?? '').trim().toLowerCase()).filter(Boolean))];
  setWeaponSortState(sortKey, sortDir);
  syncWeaponFilterUi();
  if (render) {
    applyFilters();
    renderTable();
  }
}

export function getWeaponFilterStateSnapshot() {
  return {
    searchQuery: state.searchQuery,
    activeTypes: [...state.activeTypes],
    activeSubs: [...state.activeSubs],
    sortKey: state.sortKey,
    sortDir: state.sortDir
  };
}

export function bindTypeChip(chip) {
  chip.addEventListener('click', () => {
    toggleActiveWeaponType(chip.dataset.val);
    syncTypeChipState();
    applyFilters();
  });
}

export function bindSubChip(chip) {
  chip.addEventListener('click', () => {
    toggleActiveWeaponSub(chip.dataset.val);
    syncSubChipState();
    applyFilters();
  });
}
