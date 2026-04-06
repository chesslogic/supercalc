// enemies/data.js — enemy data loading and state
import {
  getNextSortState,
  normalizeSortDirection
} from '../sort-utils.js';

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
  enemyState.sortDir = normalizeSortDirection(sortDir);
  notifyEnemyStateChange();
}

export function toggleEnemyTableSort(sortKey) {
  const nextSort = getNextSortState({
    currentKey: enemyState.sortKey,
    currentDir: enemyState.sortDir,
    nextKey: sortKey
  });
  enemyState.sortKey = nextSort.key;
  enemyState.sortDir = nextSort.dir;
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
    ...(unit.zoneRelationGroups || []).map((group) => group.label || ''),
    ...(unit.zoneRelationGroups || []).flatMap((group) => group.priorityTargetZoneNames || []),
    ...(unit.recommendationSequences || []).map((sequence) => sequence.label || ''),
    ...unit.zones.map((zone) => zone.zone_name || ''),
    ...unit.zones.map((zone) => Object.values(zone).map((value) => String(value || '')))
  ].flat().map((value) => String(value || '').toLowerCase()).join(' ');
}

function normalizeRecommendationSequenceStep(step) {
  if (typeof step === 'string') {
    const zoneName = String(step).trim();
    return zoneName ? { zoneName } : null;
  }

  const zoneName = String(
    step?.zoneName
    || step?.zone
    || step?.zone_name
    || step?.target_zone
    || ''
  ).trim();
  return zoneName ? { zoneName } : null;
}

function normalizeRecommendationSequences(rawSequences = []) {
  return (Array.isArray(rawSequences) ? rawSequences : [])
    .map((sequence) => {
      const targetZoneName = String(
        sequence?.targetZoneName
        || sequence?.targetZone
        || sequence?.target_zone
        || ''
      ).trim();
      const steps = (Array.isArray(sequence?.steps) ? sequence.steps : [])
        .map(normalizeRecommendationSequenceStep)
        .filter(Boolean);
      if (!targetZoneName || steps.length === 0) {
        return null;
      }

      const label = String(sequence?.label || '').trim() || (
        steps.length > 1
          ? `${targetZoneName} (via ${steps.slice(0, -1).map((step) => step.zoneName).join(' + ')})`
          : targetZoneName
      );

      return {
        targetZoneName,
        label,
        steps,
        suppressDirectTarget: sequence?.suppressDirectTarget === true || sequence?.suppress_direct_target === true
      };
    })
    .filter(Boolean);
}

function normalizeZoneRelationZoneName(value) {
  return String(value ?? '').trim();
}

function normalizeZoneRelationZoneKey(value) {
  return normalizeZoneRelationZoneName(value).toLowerCase();
}

function normalizeZoneRelationGroupIds(value) {
  const rawValues = Array.isArray(value) ? value : [value];
  return [...new Set(
    rawValues
      .map((entry) => String(entry ?? '').trim())
      .filter(Boolean)
  )];
}

function normalizeZoneRelationGroups(rawGroups = [], zones = []) {
  const canonicalZoneNamesByKey = new Map(
    (Array.isArray(zones) ? zones : [])
      .map((zone) => normalizeZoneRelationZoneName(zone?.zone_name))
      .filter(Boolean)
      .map((zoneName) => [normalizeZoneRelationZoneKey(zoneName), zoneName])
  );

  return (Array.isArray(rawGroups) ? rawGroups : [])
    .map((group) => {
      const id = String(group?.id || group?.label || '').trim();
      if (!id) {
        return null;
      }

      const zoneNames = [...new Set(
        (Array.isArray(group?.zones) ? group.zones : [])
          .map((zoneName) => canonicalZoneNamesByKey.get(normalizeZoneRelationZoneKey(zoneName)) || null)
          .filter(Boolean)
      )];
      if (zoneNames.length === 0) {
        return null;
      }

      const priorityTargetZoneNames = [...new Set(
        (
          group?.priorityTargetZones
          || group?.priority_target_zones
          || group?.relatedTargetZones
          || group?.related_target_zones
          || group?.relatedLethalZones
          || group?.related_lethal_zones
          || []
        )
          .map((zoneName) => canonicalZoneNamesByKey.get(normalizeZoneRelationZoneKey(zoneName)) || null)
          .filter(Boolean)
      )];

      return {
        id,
        label: String(group?.label || id).trim() || id,
        zoneNames,
        mirrorGroupIds: normalizeZoneRelationGroupIds(
          group?.mirrorGroupIds
          || group?.mirror_group_ids
          || group?.mirrorGroups
          || group?.mirror_groups
          || group?.mirrorGroupId
          || group?.mirror_group
        ),
        priorityTargetZoneNames
      };
    })
    .filter(Boolean);
}

function buildZoneRelationLookup(zoneRelationGroups = []) {
  const groupsById = new Map();
  const groupIdsByZoneName = new Map();

  zoneRelationGroups.forEach((group) => {
    groupsById.set(group.id, group);
    group.zoneNames.forEach((zoneName) => {
      const zoneKey = normalizeZoneRelationZoneKey(zoneName);
      if (!groupIdsByZoneName.has(zoneKey)) {
        groupIdsByZoneName.set(zoneKey, new Set());
      }
      groupIdsByZoneName.get(zoneKey).add(group.id);
    });
  });

  return {
    groupsById,
    groupIdsByZoneName
  };
}

function getZoneRelationLookup(enemy) {
  if (enemy?.zoneRelationLookup?.groupsById instanceof Map && enemy?.zoneRelationLookup?.groupIdsByZoneName instanceof Map) {
    return enemy.zoneRelationLookup;
  }

  if (Array.isArray(enemy?.zoneRelationGroups) && enemy.zoneRelationGroups.length > 0) {
    return buildZoneRelationLookup(enemy.zoneRelationGroups);
  }

  return null;
}

export function getZoneRelationContext(enemy, zoneReference) {
  const zoneName = typeof zoneReference === 'number'
    ? enemy?.zones?.[zoneReference]?.zone_name
    : normalizeZoneRelationZoneName(zoneReference?.zone_name ?? zoneReference);
  const zoneKey = normalizeZoneRelationZoneKey(zoneName);
  if (!zoneKey) {
    return null;
  }

  const relationLookup = getZoneRelationLookup(enemy);
  const groupIds = relationLookup?.groupIdsByZoneName?.get(zoneKey);
  if (!groupIds || groupIds.size === 0) {
    return null;
  }

  const groupLabels = new Set();
  const sameZoneNames = new Set();
  const mirrorZoneNames = new Set();
  const priorityTargetZoneNames = new Set();

  [...groupIds].forEach((groupId) => {
    const group = relationLookup.groupsById.get(groupId);
    if (!group) {
      return;
    }

    groupLabels.add(group.label);
    group.zoneNames.forEach((entry) => sameZoneNames.add(entry));
    group.priorityTargetZoneNames.forEach((entry) => priorityTargetZoneNames.add(entry));

    group.mirrorGroupIds.forEach((mirrorGroupId) => {
      const mirrorGroup = relationLookup.groupsById.get(mirrorGroupId);
      if (!mirrorGroup) {
        return;
      }
      mirrorGroup.zoneNames.forEach((entry) => mirrorZoneNames.add(entry));
    });
  });

  return {
    zoneName: zoneName || '',
    groupIds: [...groupIds],
    groupLabels: [...groupLabels],
    sameZoneNames: [...sameZoneNames],
    mirrorZoneNames: [...mirrorZoneNames],
    priorityTargetZoneNames: [...priorityTargetZoneNames]
  };
}

function buildEnemyUnit({
  factionName,
  unitName,
  unitData,
  parentUnit = null
}) {
  const zones = buildUnitZones(unitData.damageable_zones);
  const zoneRelationGroups = normalizeZoneRelationGroups(
    unitData.zone_relation_groups || unitData.zone_relationship_groups,
    zones
  );
  return {
    faction: factionName,
    name: unitName,
    health: unitData.health,
    scopeTags: normalizeScopeTags(unitData.scope_tags, parentUnit?.scopeTags || []),
    zones,
    zoneRelationGroups,
    zoneRelationLookup: buildZoneRelationLookup(zoneRelationGroups),
    zoneCount: zones.length,
    isInline: Boolean(parentUnit),
    parentEnemyName: parentUnit?.name || String(unitData.parent_enemy || '').trim() || null,
    showInSelector: unitData.show_in_selector !== false,
    recommendationSequences: normalizeRecommendationSequences(unitData.recommendation_sequences),
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
