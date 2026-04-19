// table.js — sort pipeline, filter orchestration, and DOM rendering
import {
  savePinnedWeapons,
  state,
  toggleWeaponSort
} from './data.js';
import { atkColorClass, apColorClass, dfColorClass, classifyAtkType } from '../colors.js';
import { evaluateSearchQuery } from '../filter-utils.js';
import { compareNullableValues } from '../sort-utils.js';
import {
  DURABLE_RATIO_HEADER,
  canShowDurableRatioColumn,
  getDisplayHeaders,
  getDurableRatioDisplayModel,
  getDurableRatioSortRows
} from './durable-ratio.js';

export { DURABLE_RATIO_HEADER };

export function isNumber(v){ return v !== null && v !== '' && !isNaN(Number(v)); }

export function guessNumericColumn(key){
  if (key === DURABLE_RATIO_HEADER) {
    return true;
  }

  let cnt = 0, ok = 0;
  for (const g of state.groups) {
    for (const r of g.rows) { cnt++; if (isNumber(r[key])) ok++; if (cnt >= 40) break; }
    if (cnt >= 40) break;
  }
  return ok >= Math.max(3, Math.floor(cnt * 0.6));
}

export function groupSortValue(group, key, numeric){
  if (key === state.keys.nameKey) return (group.name || '').toString();
  if (key === DURABLE_RATIO_HEADER) {
    const ratios = getDurableRatioSortRows(group)
      .map((row) => getDurableRatioDisplayModel(row).ratio)
      .filter((ratio) => ratio !== null);
    return ratios.length ? Math.max(...ratios) : Number.NEGATIVE_INFINITY;
  }
  if (numeric) {
    const vals = group.rows.map(r => Number(r[key])).filter(n => !isNaN(n));
    return vals.length ? Math.max(...vals) : Number.NEGATIVE_INFINITY;
  } else {
    for (const r of group.rows) { const v = r[key]; if (v !== null && v !== undefined && v !== '') return String(v); }
    return '';
  }
}

/**
 * Pure computation: returns the ordered array of groups (pinned first, then
 * unpinned), each sub-group sorted by the current sort state.
 * Has no DOM side-effects.
 */
export function computeOrderedGroups(source) {
  const ordered = [...source];
  const pinned = ordered.filter(g => state.pinnedWeapons.has(g.name));
  const unpinned = ordered.filter(g => !state.pinnedWeapons.has(g.name));

  const sortGroups = (groups) => {
    if (!state.sortKey) return groups;
    const numeric = guessNumericColumn(state.sortKey);
    return groups.sort((a, b) => {
      const va = groupSortValue(a, state.sortKey, numeric);
      const vb = groupSortValue(b, state.sortKey, numeric);
      return compareNullableValues(va, vb, {
        direction: state.sortDir,
        numeric,
        emptyStringIsNull: false
      });
    });
  };

  return [...sortGroups(pinned), ...sortGroups(unpinned)];
}

export function renderTable(){
  const thead = document.getElementById('thead');
  if (!thead) return;
  thead.innerHTML = '';
  const trh = document.createElement('tr');
  const displayHeaders = getDisplayHeaders();

  // Add pin column header
  const pinTh = document.createElement('th');
  pinTh.style.width = '30px';
  pinTh.style.textAlign = 'center';
  pinTh.style.padding = '4px';
  pinTh.title = 'Pin weapon';
  trh.appendChild(pinTh);

  displayHeaders.forEach(h => {
    const th = document.createElement('th');
    th.textContent = h;
    th.title = `Sort by ${h}`;

    if (state.sortKey === h) {
      th.classList.add(state.sortDir === 'asc' ? 'sort-asc' : 'sort-desc');
    }

    th.addEventListener('click', () => {
      toggleWeaponSort(h);
      renderTable();
    });
    trh.appendChild(th);
  });
  thead.appendChild(trh);
  sortAndRenderBody();
}

export function sortAndRenderBody(){
  const tbody = document.getElementById('tbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  const source = state.filterActive ? state.filteredGroups : state.groups;
  const ordered = computeOrderedGroups(source);

  const wikiUrlForName = (name) => {
    if (!name) return null;
    const clean = String(name).replace(/\s*\(.*?\)\s*/g, ' ').trim().replace(/\s+/g,' ');
    return `https://helldivers.wiki.gg/wiki/Special:Search/${encodeURIComponent(clean)}`;
  };

  const displayHeaders = getDisplayHeaders();

  ordered.forEach((g) => {
    g.rows.forEach((r, idx) => {
      const tr = document.createElement('tr');
      if (idx === 0) tr.classList.add('group-start');

      // Add pin button column (only for first row of each group)
      const pinTd = document.createElement('td');
      pinTd.style.textAlign = 'center';
      pinTd.style.padding = '4px';
      pinTd.style.width = '30px';

      if (idx === 0) {
        const pinBtn = document.createElement('button');
        pinBtn.type = 'button';
        const isPinned = state.pinnedWeapons.has(g.name);
        pinBtn.className = 'pin-btn' + (isPinned ? ' pinned' : '');
        pinBtn.title = isPinned ? 'Unpin weapon' : 'Pin weapon';

        pinBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (state.pinnedWeapons.has(g.name)) {
            state.pinnedWeapons.delete(g.name);
          } else {
            state.pinnedWeapons.add(g.name);
          }
          savePinnedWeapons();
          applyFilters();
          renderTable();
        });

        pinTd.appendChild(pinBtn);
      }
      tr.appendChild(pinTd);

      const atkClass = classifyAtkType(r, state.keys.atkTypeKey);
      displayHeaders.forEach(h => {
        const td = document.createElement('td');
        if (h === DURABLE_RATIO_HEADER) {
          const durableRatio = getDurableRatioDisplayModel(r);
          if (atkClass) {
            const cls = atkColorClass(atkClass);
            if (cls) td.classList.add(cls);
          }
          td.classList.add('calc-derived-cell');
          td.textContent = durableRatio.text;
          if (!durableRatio.text) {
            td.classList.add('muted');
          }
          if (durableRatio.title) {
            td.title = durableRatio.title;
          }
          tr.appendChild(td);
          return;
        }

        let v = r[h];
        if (idx > 0 && (h === state.keys.nameKey || h === state.keys.typeKey || h === state.keys.codeKey)) v = '';

        const hl = h.toLowerCase();
        const isDamage = /^(damage|dmg)$/.test(hl);
        const isDuration = /^(dur|duration)$/.test(hl);
        if ((isDamage || isDuration) && atkClass) {
          const cls = atkColorClass(atkClass);
          if (cls) td.classList.add(cls);
        }

        if (state.keys.apKey && h === state.keys.apKey) td.classList.add(apColorClass(v));
        else if (!state.keys.apKey && (hl === 'ap' || (hl.includes('armor') && hl.includes('pen')))) td.classList.add(apColorClass(v));

        if (state.keys.atkTypeKey && h === state.keys.atkTypeKey) {
          const cls = atkColorClass(atkClass);
          if (cls) td.classList.add(cls);
        }

        if (hl === 'df') {
          const dfCls = dfColorClass(v);
          if (dfCls) td.classList.add(dfCls);
        }

        // Atk Name coloring + truncate (same color scheme as Atk Type/DMG/DUR)
        if (state.keys.atkNameKey && h === state.keys.atkNameKey) {
          const cls = atkColorClass(atkClass);
          if (cls) td.classList.add(cls);
          td.classList.add('trunc');
          if (v != null) td.title = String(v);
        }

        // Name is a link but not colored
        if (h === state.keys.nameKey && idx === 0 && v) {
          const a = document.createElement('a'); a.href = wikiUrlForName(v); a.target = '_blank'; a.rel = 'noreferrer noopener'; a.className = 'name-link'; a.textContent = String(v); td.appendChild(a);
        } else {
          if (isNumber(v)) { const n = Number(v); v = Number.isInteger(n) ? n.toString() : n.toFixed(3).replace(/\.0+$/, ''); }
          td.textContent = (v === null || v === undefined) ? '' : v;
        }

        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
  });
}

export function applyFilters(){
  const activeTypes = [...state.activeTypes];
  const activeSubs = [...state.activeSubs];
  const activeRoles = [...state.activeRoles];
  const typeFilterActive = activeTypes.length > 0;
  const subFilterActive = activeSubs.length > 0;
  const roleFilterActive = activeRoles.length > 0;
  const hasSearch = state.searchQuery.length > 0;

  // Get pinned weapons (always included regardless of filters)
  const pinnedGroups = state.groups.filter(g => state.pinnedWeapons.has(g.name));

  if (!typeFilterActive && !subFilterActive && !roleFilterActive && !hasSearch) {
    state.filterActive = false;
    state.filteredGroups = [];
    sortAndRenderBody();
    return;
  }

  const q = state.searchQuery;

  let filteredGroups = state.groups;

  if (typeFilterActive) {
    const typeGroups = new Set();
    for (const type of activeTypes) {
      const groups = state.typeIndex.get(type);
      if (groups) {
        for (const group of groups) {
          typeGroups.add(group);
        }
      }
    }
    filteredGroups = filteredGroups.filter(g => typeGroups.has(g));
  }

  if (subFilterActive) {
    const subGroups = new Set();
    for (const sub of activeSubs) {
      const groups = state.subIndex.get(sub);
      if (groups) {
        for (const group of groups) {
          subGroups.add(group);
        }
      }
    }
    filteredGroups = filteredGroups.filter(g => subGroups.has(g));
  }

  if (roleFilterActive) {
    const roleGroups = new Set();
    for (const role of activeRoles) {
      const groups = state.roleIndex.get(role);
      if (groups) {
        for (const group of groups) {
          roleGroups.add(group);
        }
      }
    }
    filteredGroups = filteredGroups.filter(g => roleGroups.has(g));
  }

  if (hasSearch) {
    filteredGroups = filteredGroups.filter(g => {
      const searchText = state.searchIndex.get(g);
      if (!searchText) return false;
      return evaluateSearchQuery(q, searchText);
    });
  }

  // Merge filtered groups with pinned groups (pinned weapons always visible)
  const filteredSet = new Set(filteredGroups);
  pinnedGroups.forEach(pinned => filteredSet.add(pinned));

  state.filteredGroups = Array.from(filteredSet);
  state.filterActive = true;
  sortAndRenderBody();
}

