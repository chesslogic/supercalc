// enemies/data.js — enemy data loading and state
export const enemyState = {
  factions: [],
  units: [],
  inlineUnits: [],
  filteredUnits: [],
  filterActive: false,
  sortKey: null,
  sortDir: 'asc',
  // Pre-indexed data for faster filtering
  factionIndex: new Map(),
  searchIndex: new Map(),
  unitIndex: new Map(),
};

function normalizeScopeTags(rawScopeTags = [], inheritedScopeTags = []) {
  return [...new Set([
    ...inheritedScopeTags,
    ...(Array.isArray(rawScopeTags) ? rawScopeTags : [])
  ].map((tag) => String(tag ?? '').trim()).filter(Boolean))];
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
  return {
    faction: factionName,
    name: unitName,
    health: unitData.health,
    scopeTags: normalizeScopeTags(unitData.scope_tags, parentUnit?.scopeTags || []),
    zones: unitData.damageable_zones || [],
    zoneCount: (unitData.damageable_zones || []).length,
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
