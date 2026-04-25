// weapons/filters.js — search, reset controls, and chip-builder UI
import {
  resetWeaponFilterState,
  savePinnedWeapons,
  setWeaponSearchQuery,
  setWeaponSortState,
  state,
  toggleActiveWeaponRole,
  toggleActiveWeaponSub,
  toggleActiveWeaponType
} from './data.js';
import { applyFilters, renderTable } from './table.js';
import { createFilterChip, normalizeFilterValues } from '../filter-utils.js';
import { createRoleFilterChipRow } from './role-filter-row.js';
import { createSubtypeFilterChipRow } from './sub-filter-row.js';
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

function syncRoleChipState() {
  const chips = globalThis.document?.querySelectorAll('#roleFilters .chip') || [];
  chips.forEach((chip) => {
    chip.classList.toggle('active', state.activeRoles.includes(String(chip.dataset.role || '').toLowerCase()));
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
  syncRoleChipState();
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
  activeRoles = state.activeRoles,
  sortKey = state.sortKey,
  sortDir = state.sortDir
} = {}, {
  render = true
} = {}) {
  setWeaponSearchQuery(searchQuery);
  state.activeTypes = normalizeFilterValues(activeTypes);
  state.activeSubs = normalizeFilterValues(activeSubs);
  state.activeRoles = normalizeFilterValues(activeRoles);
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
    activeRoles: [...state.activeRoles],
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

function appendChipChildren(targetEl, chipRow) {
  Array.from(chipRow?.children || [])
    .filter((child) => child?.classList?.contains('chip'))
    .forEach((child) => targetEl.appendChild(child));
}

export function buildRoleFilters() {
  const el = globalThis.document?.getElementById('roleFilters');
  if (!el) return;
  el.innerHTML = '';

  const chipRow = createRoleFilterChipRow({
    weapons: state.groups,
    activeRoles: state.activeRoles,
    onToggleRole: (roleId) => {
      toggleActiveWeaponRole(roleId);
    },
    onRefresh: () => {
      syncRoleChipState();
      applyFilters();
    },
    label: 'Role'
  });

  appendChipChildren(el, chipRow);
  applyFilters();
}

export function buildTypeFilters() {
  const el = globalThis.document?.getElementById('typeFilters');
  if (!el) return;
  const present = new Set();
  for (const g of state.groups) { const t = (g.type || '').toString().trim(); if (t) present.add(t.toLowerCase()); }
  const orderedDesired = ['primary', 'secondary', 'grenade', 'support', 'stratagem'];
  el.innerHTML = '';
  orderedDesired.forEach(t => {
    if (!present.has(t)) return;
    const chip = createFilterChip({
      label: t.charAt(0).toUpperCase() + t.slice(1),
      active: state.activeTypes.includes(t),
      dataset: { val: t },
      onClick: (button) => {
        toggleActiveWeaponType(button.dataset.val);
        syncTypeChipState();
        applyFilters();
      }
    });
    el.appendChild(chip);
  });
  applyFilters();
}

export function buildSubFilters() {
  const el = globalThis.document?.getElementById('subFilters');
  if (!el) return;
  el.innerHTML = '';

  const chipRow = createSubtypeFilterChipRow({
    weapons: state.groups,
    activeSubs: state.activeSubs,
    onToggleSub: (subId) => {
      toggleActiveWeaponSub(subId);
    },
    onRefresh: () => {
      syncSubChipState();
      applyFilters();
    },
    label: 'Sub',
    visibility: 'shared'
  });

  appendChipChildren(el, chipRow);
  applyFilters();
}
