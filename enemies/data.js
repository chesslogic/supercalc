// enemies/data.js — enemy data loading and state
export const enemyState = {
  factions: [],
  units: [],
  inlineUnits: [],
  filteredUnits: [],
  filterActive: false,
  searchQuery: '',
  activeFactions: [],
  sortKey: null,
  sortDir: 'asc',
  // Pre-indexed data for faster filtering
  factionIndex: new Map(),
  searchIndex: new Map(),
  unitIndex: new Map(),
};

let enemyStateChangeListener = null;

function normalizeFilterValues(values = []) {
  return [...new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => String(value ?? '').trim())
      .filter(Boolean)
  )];
}

export function setEnemyStateChangeListener(listener) {
  enemyStateChangeListener = typeof listener === 'function' ? listener : null;
}

export function notifyEnemyStateChange() {
  enemyStateChangeListener?.(enemyState);
}

export function setEnemySearchQuery(query) {
  enemyState.searchQuery = String(query ?? '').trim();
  notifyEnemyStateChange();
}

export function setActiveEnemyFactions(factions = []) {
  enemyState.activeFactions = normalizeFilterValues(factions);
  notifyEnemyStateChange();
  return [...enemyState.activeFactions];
}

export function toggleActiveEnemyFaction(faction) {
  const normalizedFaction = normalizeFilterValues([faction])[0];
  if (!normalizedFaction) {
    return [...enemyState.activeFactions];
  }

  enemyState.activeFactions = enemyState.activeFactions.includes(normalizedFaction)
    ? enemyState.activeFactions.filter((value) => value !== normalizedFaction)
    : [...enemyState.activeFactions, normalizedFaction];
  notifyEnemyStateChange();
  return [...enemyState.activeFactions];
}

export function setEnemySortState(sortKey = null, sortDir = 'asc') {
  enemyState.sortKey = sortKey || null;
  enemyState.sortDir = sortDir === 'desc' ? 'desc' : 'asc';
  notifyEnemyStateChange();
}

export function toggleEnemyTableSort(sortKey) {
  if (enemyState.sortKey === sortKey) {
    enemyState.sortDir = enemyState.sortDir === 'asc' ? 'desc' : 'asc';
  } else {
    enemyState.sortKey = sortKey || null;
    enemyState.sortDir = 'asc';
  }
  notifyEnemyStateChange();
}

export function resetEnemyFilterState() {
  enemyState.searchQuery = '';
  enemyState.activeFactions = [];
  enemyState.sortKey = null;
  enemyState.sortDir = 'asc';
  notifyEnemyStateChange();
}

function normalizeScopeTags(rawScopeTags = [], inheritedScopeTags = []) {
  return [...new Set([
    ...inheritedScopeTags,
    ...(Array.isArray(rawScopeTags) ? rawScopeTags : [])
  ].map((tag) => String(tag ?? '').trim()).filter(Boolean))];
}

function isUnknownZoneName(zoneName) {
  const normalizedZoneName = String(zoneName ?? '').trim().toLowerCase();
  return normalizedZoneName === '[unknown]' || normalizedZoneName === 'unknown';
}

function buildUnitZones(rawZones = []) {
  let unknownZoneCount = 0;
  return (Array.isArray(rawZones) ? rawZones : []).map((zone) => {
    const normalizedZoneName = String(zone?.zone_name ?? '').trim();
    if (!isUnknownZoneName(normalizedZoneName)) {
      return { ...zone };
    }

    unknownZoneCount += 1;
    return {
      ...zone,
      raw_zone_name: normalizedZoneName || '[unknown]',
      zone_name: `[unknown ${unknownZoneCount}]`
    };
  });
}

function buildSearchText(unit) {
  return [
    unit.faction,
    unit.name,
    unit.parentEnemyName,
    unit.sourceProvenance,
    unit.sourceNote,
    ...unit.scopeTags,
    ...unit.zones.map((zone) => zone.zone_name || ''),
    ...unit.zones.map((zone) => Object.values(zone).map((value) => String(value || '')))
  ].flat().map((value) => String(value || '').toLowerCase()).join(' ');
}

function buildEnemyUnit({
  factionName,
  unitName,
  unitData,
  parentUnit = null
}) {
  const zones = buildUnitZones(unitData.damageable_zones);
  return {
    faction: factionName,
    name: unitName,
    health: unitData.health,
    scopeTags: normalizeScopeTags(unitData.scope_tags, parentUnit?.scopeTags || []),
    zones,
    zoneCount: zones.length,
    isInline: Boolean(parentUnit),
    parentEnemyName: parentUnit?.name || String(unitData.parent_enemy || '').trim() || null,
    showInSelector: unitData.show_in_selector !== false,
    sourceProvenance: String(unitData.source_provenance || '').trim(),
    sourceNote: String(unitData.source_note || '').trim()
  };
}

function registerEnemyUnit(unit) {
  enemyState.unitIndex.set(unit.name, unit);
  enemyState.searchIndex.set(unit, buildSearchText(unit));

  if (unit.showInSelector === false) {
    enemyState.inlineUnits.push(unit);
    return;
  }

  enemyState.units.push(unit);

  if (!enemyState.factionIndex.has(unit.faction)) {
    enemyState.factionIndex.set(unit.faction, []);
  }
  enemyState.factionIndex.get(unit.faction).push(unit);
}

export async function loadEnemyData() {
  try {
    // Add cache-busting timestamp to ensure fresh data
    const response = await fetch(`./enemies/enemydata.json?t=${Date.now()}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    processEnemyData(data);
  } catch (error) {
    console.error('Failed to load enemy data:', error);
    throw error;
  }
}

export function processEnemyData(data) {
  enemyState.factions = [];
  enemyState.units = [];
  enemyState.inlineUnits = [];
  enemyState.factionIndex.clear();
  enemyState.searchIndex.clear();
  enemyState.unitIndex.clear();

  // Process each faction
  for (const [factionName, factionUnits] of Object.entries(data)) {
    enemyState.factions.push(factionName);
    
    // Process each unit in the faction
    for (const [unitName, unitData] of Object.entries(factionUnits)) {
      const unit = buildEnemyUnit({
        factionName,
        unitName,
        unitData
      });
      registerEnemyUnit(unit);

      const inlineEnemies = unitData.inline_enemies;
      if (!inlineEnemies || typeof inlineEnemies !== 'object' || Array.isArray(inlineEnemies)) {
        continue;
      }

      for (const [inlineEnemyName, inlineEnemyData] of Object.entries(inlineEnemies)) {
        if (!inlineEnemyData || typeof inlineEnemyData !== 'object') {
          continue;
        }

        const inlineUnit = buildEnemyUnit({
          factionName,
          unitName: inlineEnemyName,
          unitData: inlineEnemyData,
          parentUnit: unit
        });
        registerEnemyUnit(inlineUnit);
      }
    }
  }
  
  enemyState.filteredUnits = [];
  enemyState.filterActive = false;
}

export function getEnemyUnitByName(name, { includeHidden = true } = {}) {
  const normalizedName = String(name ?? '').trim().toLowerCase();
  if (!normalizedName) {
    return null;
  }

  const exactMatch = enemyState.unitIndex.get(name);
  if (exactMatch && (includeHidden || exactMatch.showInSelector !== false)) {
    return exactMatch;
  }

  const searchUnits = includeHidden
    ? [...enemyState.units, ...enemyState.inlineUnits]
    : enemyState.units;

  return searchUnits.find((unit) => String(unit?.name || '').trim().toLowerCase() === normalizedName) || null;
}
