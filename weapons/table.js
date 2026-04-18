// table.js — render, grouping, sorting, filters
import {
  savePinnedWeapons,
  state,
  toggleActiveWeaponSub,
  toggleActiveWeaponType,
  toggleWeaponSort
} from './data.js';
import { classifyAtkType, atkColorClass, apColorClass, dfColorClass } from '../colors.js';
import { createFilterChip } from '../filter-utils.js';
import { compareNullableValues } from '../sort-utils.js';

export const DURABLE_RATIO_HEADER = 'DUR/DMG';
const DURABLE_RATIO_FRACTION_MAX_DENOMINATOR = 8;
const DURABLE_RATIO_FRACTION_EPSILON = 0.0125;

export function isNumber(v){ return v !== null && v !== '' && !isNaN(Number(v)); }

function toFiniteNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function canShowDurableRatioColumn() {
  return Boolean(state.keys.dmgKey && state.keys.durKey);
}

function getDisplayHeaders() {
  const headers = [...state.headers];
  if (!canShowDurableRatioColumn() || headers.includes(DURABLE_RATIO_HEADER)) {
    return headers;
  }

  const durIndex = headers.indexOf(state.keys.durKey);
  const insertIndex = durIndex >= 0 ? durIndex + 1 : headers.length;
  headers.splice(insertIndex, 0, DURABLE_RATIO_HEADER);
  return headers;
}

function getDurableDamageRatio(row) {
  if (!canShowDurableRatioColumn()) {
    return null;
  }

  const damage = toFiniteNumber(row?.[state.keys.dmgKey]);
  const durableDamage = toFiniteNumber(row?.[state.keys.durKey]);
  if (damage === null || durableDamage === null || damage <= 0) {
    return null;
  }

  return Math.max(0, Math.min(1, durableDamage / damage));
}

function formatDurableRatioPercent(ratio) {
  const percent = Math.max(0, Math.min(100, ratio * 100));
  return `${percent.toFixed(1).replace(/\.0$/, '')}%`;
}

function findApproximateDurableRatioFraction(ratio) {
  if (!Number.isFinite(ratio) || ratio <= 0 || ratio >= 1) {
    return null;
  }

  let bestMatch = null;
  for (let denominator = 2; denominator <= DURABLE_RATIO_FRACTION_MAX_DENOMINATOR; denominator += 1) {
    for (let numerator = 1; numerator < denominator; numerator += 1) {
      const candidateRatio = numerator / denominator;
      const difference = Math.abs(candidateRatio - ratio);
      if (!bestMatch || difference < bestMatch.difference) {
        bestMatch = {
          numerator,
          denominator,
          difference
        };
      }
    }
  }

  return bestMatch && bestMatch.difference <= DURABLE_RATIO_FRACTION_EPSILON
    ? `${bestMatch.numerator}/${bestMatch.denominator}`
    : null;
}

function getDurableRatioDisplayModel(row) {
  const ratio = getDurableDamageRatio(row);
  if (ratio === null) {
    return {
      ratio: null,
      text: '',
      title: ''
    };
  }

  const damage = toFiniteNumber(row?.[state.keys.dmgKey]);
  const durableDamage = toFiniteNumber(row?.[state.keys.durKey]);
  const percentText = formatDurableRatioPercent(ratio);
  const fractionText = findApproximateDurableRatioFraction(ratio);
  const text = fractionText ? `${percentText} (${fractionText})` : percentText;
  const titleLines = [
    `Durable damage is ${percentText} of standard damage.`,
    `${durableDamage} / ${damage}`
  ];

  if (fractionText) {
    titleLines.push(`Approximate fraction: ${fractionText} durable`);
  }

  return {
    ratio,
    text,
    title: titleLines.join('\n')
  };
}

function getDurableRatioSortAttackKind(row) {
  const rawAttackType = (state.keys.atkTypeKey && row?.[state.keys.atkTypeKey])
    ? String(row[state.keys.atkTypeKey])
    : (row?.Stage ? String(row.Stage) : '');
  const normalizedAttackType = rawAttackType.trim().toLowerCase();
  if (!normalizedAttackType) {
    return '';
  }

  if (normalizedAttackType.includes('projectile')) {
    return 'projectile';
  }

  return classifyAtkType(row, state.keys.atkTypeKey) || normalizedAttackType;
}

function getDurableRatioSortRows(group) {
  const rows = Array.isArray(group?.rows) ? group.rows : [];
  const projectileRows = rows.filter((row) => (
    getDurableRatioSortAttackKind(row) === 'projectile'
    && getDurableDamageRatio(row) !== null
  ));
  return projectileRows.length > 0 ? projectileRows : rows;
}

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
    
    // Add sort indicator if this column is being sorted
    if (state.sortKey === h) {
      th.classList.add(state.sortDir === 'asc' ? 'sort-asc' : 'sort-desc');
    }
    
    th.addEventListener('click', () => { 
      toggleWeaponSort(h);
      renderTable(); // Re-render to update sort indicators
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
  let ordered = [...source];
  const displayHeaders = getDisplayHeaders();

  // Separate pinned and unpinned weapons
  const pinned = ordered.filter(g => state.pinnedWeapons.has(g.name));
  const unpinned = ordered.filter(g => !state.pinnedWeapons.has(g.name));

  // Sort each group separately
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

  ordered = [...sortGroups(pinned), ...sortGroups(unpinned)];

  const wikiUrlForName = (name) => {
    if (!name) return null;
    const clean = String(name).replace(/\s*\(.*?\)\s*/g, ' ').trim().replace(/\s+/g,' ');
    return `https://helldivers.wiki.gg/wiki/Special:Search/${encodeURIComponent(clean)}`;
  };

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
          td.classList.add('trunc');          // <-- enables ellipsis
          if (v != null) td.title = String(v); // tooltip shows full value
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

/**
 * Evaluate a search query with OR (|) and AND (&) operators.
 * Default behavior (space-separated) is AND.
 * AND has higher precedence than OR (binds tighter).
 * 
 * Examples:
 * - "rifle" -> matches if "rifle" is found
 * - "rifle pistol" -> matches if both "rifle" AND "pistol" are found
 * - "rifle | pistol" -> matches if "rifle" OR "pistol" is found
 * - "rifle & pistol" -> matches if both "rifle" AND "pistol" are found
 * - "rifle | pistol & grenade" -> matches if ("rifle" OR "pistol") AND "grenade"
 * 
 * Note: searchText is already lowercase from the index, query is converted to lowercase for matching
 */
function evaluateSearchQuery(query, searchText) {
  if (!query || !searchText) return false;
  
  const qLower = query.toLowerCase().trim();
  if (!qLower) return false;
  
  // Handle AND operators (&) first (higher precedence) - split by &, all parts must match
  if (qLower.includes('&')) {
    const andParts = qLower.split('&').map(part => part.trim()).filter(part => part.length > 0);
    // All AND parts must match
    return andParts.every(part => evaluateSearchQuery(part, searchText));
  }
  
  // Handle OR operators (|) - split by |, each part is evaluated separately
  if (qLower.includes('|')) {
    const orParts = qLower.split('|').map(part => part.trim()).filter(part => part.length > 0);
    // At least one OR part must match
    return orParts.some(part => evaluateSearchQuery(part, searchText));
  }
  
  // Default: space-separated words are AND (all must match)
  const words = qLower.split(/\s+/).filter(word => word.length > 0);
  return words.every(word => searchText.includes(word));
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
  
  // Use pre-indexed data for much faster filtering
  let filteredGroups = state.groups;
  
  // Apply type filter using index
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
  
  // Apply sub filter using index
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

  // Apply role filter using index
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
  
  // Apply search filter using pre-built search index
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

export function buildTypeFilters(){
  const el = document.getElementById('typeFilters'); if (!el) return;
  const present = new Set();
  for (const g of state.groups) { const t = (g.type || '').toString().trim(); if (t) present.add(t.toLowerCase()); }
  const orderedDesired = ['primary','secondary','grenade','support','stratagem'];
  el.innerHTML = '';
  orderedDesired.forEach(t => {
    if (!present.has(t)) return;
    const chip = createFilterChip({
      label: t.charAt(0).toUpperCase() + t.slice(1),
      active: state.activeTypes.includes(t),
      dataset: { val: t },
      onClick: (button) => {
        toggleActiveWeaponType(button.dataset.val);
        button.classList.toggle('active', state.activeTypes.includes(t));
        applyFilters();
      }
    });
    el.appendChild(chip);
  });
  applyFilters();
}

export function buildSubFilters(){
  const el = document.getElementById('subFilters'); if (!el) return;
  const subs = new Set();
  for (const g of state.groups) { const s = (g.sub || '').toString().trim(); if (s) subs.add(s.toLowerCase()); }
  const ordered = Array.from(subs).sort((a,b)=>a.localeCompare(b));
  el.innerHTML = '';
  ordered.forEach(s => {
    const chip = createFilterChip({
      label: s.toUpperCase(),
      active: state.activeSubs.includes(s),
      dataset: { val: s },
      onClick: (button) => {
        toggleActiveWeaponSub(button.dataset.val);
        button.classList.toggle('active', state.activeSubs.includes(s));
        applyFilters();
      }
    });
    el.appendChild(chip);
  });
  applyFilters();
}
