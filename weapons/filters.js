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

  // Append only the chip children (not the outer chiprow div) since el is the container
  while (chipRow.children.length > 0) {
    el.appendChild(chipRow.children[0]);
  }
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
  const subs = new Set();
  for (const g of state.groups) { const s = (g.sub || '').toString().trim(); if (s) subs.add(s.toLowerCase()); }
  const ordered = Array.from(subs).sort((a, b) => a.localeCompare(b));
  el.innerHTML = '';
  ordered.forEach(s => {
    const chip = createFilterChip({
      label: s.toUpperCase(),
      active: state.activeSubs.includes(s),
      dataset: { val: s },
      onClick: (button) => {
        toggleActiveWeaponSub(button.dataset.val);
        syncSubChipState();
        applyFilters();
      }
    });
    el.appendChild(chip);
  });
  applyFilters();
}
