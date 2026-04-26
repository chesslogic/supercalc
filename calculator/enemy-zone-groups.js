// calculator/enemy-zone-groups.js
// Builds grouped zone families for the focused enemy table.
//
// Grouping strategy (conservative, metadata-first):
//   1. Use explicit enemy.zoneRelationGroups when present.
//   2. Fall back to purely statistical clustering for remaining zones using
//      exact raw combat signature equivalence classes.
//   3. For multi-member auto-groups, derive a shared non-directional label
//      from member zone names when a clear common term exists.
//   4. Keep stable output order by representative zone index.
import { normalizeText } from './domain-utils.js';

// Zone fields that determine raw combat behaviour (weapon penetration, damage,
// overflow, and lethality).  Two zones with the same signature interact
// identically with every weapon.
const COMBAT_SIGNATURE_FIELDS = Object.freeze([
  'AV', 'Dur%', 'health', 'Con', 'ExMult', 'ExTarget', 'ToMain%', 'MainCap', 'IsFatal'
]);

/**
 * Returns a pipe-delimited string that uniquely captures the raw combat
 * behaviour of a zone.  Two zones whose signatures are equal interact
 * identically with every weapon.
 *
 * @param {object} zone
 * @returns {string}
 */
export function getZoneCombatSignature(zone) {
  return COMBAT_SIGNATURE_FIELDS
    .map((field) => `${field}:${zone?.[field] ?? ''}`)
    .join('|');
}

function getZoneDisplayName(zone, idx) {
  return zone?.zone_name || `[zone ${idx}]`;
}

function formatZoneDisplayName(zone, idx) {
  return getZoneDisplayName(zone, idx).replace(/_/g, ' ');
}

const AUTO_MULTI_MEMBER_FAMILY_LABEL = 'Exact-stat group';
const AUTO_LABEL_DIRECTIONAL_TOKENS = new Set([
  'left', 'right', 'l', 'r',
  'front', 'rear', 'back',
  'upper', 'lower',
  'top', 'bottom',
  'mid', 'middle',
  'inner', 'outer'
]);
const AUTO_LABEL_NONSPECIFIC_TOKENS = new Set([
  'armor', 'armour',
  'flesh',
  'hitzone', 'zone',
  'part',
  'main',
  'weak', 'weakpoint', 'weakspot'
]);

function tokenizeZoneName(zoneName) {
  return normalizeText(zoneName).match(/[a-z0-9]+/g) ?? [];
}

function buildSharedAutoFamilyLabel(members) {
  if (members.length <= 1) {
    return null;
  }

  const sharedTokens = new Set();
  let representativeTokens = [];

  members.forEach((member, memberIndex) => {
    const memberTokens = tokenizeZoneName(member?.zone?.zone_name)
      .filter((token) => !AUTO_LABEL_DIRECTIONAL_TOKENS.has(token));
    const uniqueTokens = [...new Set(memberTokens)];

    if (memberIndex === 0) {
      representativeTokens = uniqueTokens;
      uniqueTokens.forEach((token) => sharedTokens.add(token));
      return;
    }

    const memberTokenSet = new Set(uniqueTokens);
    for (const token of [...sharedTokens]) {
      if (!memberTokenSet.has(token)) {
        sharedTokens.delete(token);
      }
    }
  });

  if (sharedTokens.size === 0) {
    return null;
  }

  const orderedSharedTokens = representativeTokens.filter((token) => sharedTokens.has(token));
  const firstMeaningfulIndex = orderedSharedTokens.findIndex(
    (token) => !AUTO_LABEL_NONSPECIFIC_TOKENS.has(token)
  );

  if (firstMeaningfulIndex === -1) {
    return null;
  }

  return orderedSharedTokens.slice(firstMeaningfulIndex).join(' ');
}

function buildAutoFamilyLabel(members) {
  if (members.length <= 1) {
    const representative = members[0];
    return formatZoneDisplayName(representative?.zone, representative?.idx);
  }

  return buildSharedAutoFamilyLabel(members) || AUTO_MULTI_MEMBER_FAMILY_LABEL;
}

function isHomogeneousZoneFamily(memberZones = []) {
  return new Set(memberZones.map((zone) => getZoneCombatSignature(zone))).size <= 1;
}

function pickExplicitRepresentativeMember(group, memberEntriesInGroupOrder) {
  if (memberEntriesInGroupOrder.length === 0) {
    return null;
  }

  const memberEntryByZoneNameKey = new Map();
  memberEntriesInGroupOrder.forEach((entry) => {
    const zoneKey = normalizeText(entry?.zone?.zone_name);
    if (zoneKey && !memberEntryByZoneNameKey.has(zoneKey)) {
      memberEntryByZoneNameKey.set(zoneKey, entry);
    }
  });

  const priorityTargetZoneNames = Array.isArray(group?.priorityTargetZoneNames)
    ? group.priorityTargetZoneNames
    : [];

  for (const zoneName of priorityTargetZoneNames) {
    const matchingEntry = memberEntryByZoneNameKey.get(normalizeText(zoneName));
    if (matchingEntry) {
      return matchingEntry;
    }
  }

  return memberEntriesInGroupOrder[0];
}

/**
 * Clusters an array of indexed zones by identical combat signature.
 *
 * @param {Array<{idx: number, zone: object}>} indexedZones
 *   Unassigned zones to cluster.  Each entry must carry `.idx` (canonical
 *   zone index) and `.zone` (zone object).
 * @returns {Array<{
 *   signature: string,
 *   members: Array<{idx: number, zone: object}>
 * }>}
 *   Clusters sorted by the smallest member idx within each cluster.
 */
export function autoClusterZones(indexedZones) {
  const clusterMap = new Map();
  for (const { idx, zone } of indexedZones) {
    const signature = getZoneCombatSignature(zone);
    if (!clusterMap.has(signature)) {
      clusterMap.set(signature, {
        signature,
        members: []
      });
    }
    clusterMap.get(signature).members.push({ idx, zone });
  }

  const clusters = [...clusterMap.values()];
  for (const cluster of clusters) {
    cluster.members.sort((a, b) => a.idx - b.idx);
  }

  // Sort clusters by their representative (smallest) member index for stable,
  // predictable output.
  clusters.sort((a, b) => a.members[0].idx - b.members[0].idx);

  return clusters;
}

/**
 * Builds all grouped zone families for `enemy`.
 *
 * @param {object} enemy - Enemy object with `.zones` and optional
 *   `.zoneRelationGroups` (already normalised by enemies/data.js).
 * @param {Array|null} [zoneRows] - Optional pre-computed zone rows each
 *   shaped as `{ zone, zoneIndex }`.  When provided the `.zoneIndex` values
 *   are used as the canonical indices (allowing a caller to pass a filtered
 *   or reordered subset).  When `null` the function falls back to
 *   `enemy.zones` and treats the array position as the zone index.
 *
 * @returns {{
 *   families: Array<{
 *     familyId: string,
 *     memberIndices: number[],
 *     memberZones: object[],
 *     representativeIndex: number,
 *     representativeZone: object,
 *     label: string,
 *     summaryLabel: string,
 *     isExplicit: boolean,
 *     isSingleton: boolean,
 *     isHomogeneous: boolean,
 *     groupId: string|null
 *   }>,
 *   zoneIndexToFamilyId: Map<number, string>
 * }}
 */
export function buildEnemyZoneGroups(enemy, zoneRows = null) {
  // Build a flat list of { idx, zone } entries that mirrors either the
  // provided zoneRows or the enemy's own zone array.
  const indexedZones = Array.isArray(zoneRows)
    ? zoneRows.map((row) => ({ idx: row.zoneIndex, zone: row.zone }))
    : (Array.isArray(enemy?.zones) ? enemy.zones : []).map((zone, i) => ({ idx: i, zone }));

  const families = [];
  const assignedZoneIndices = new Set();
  const zoneIndexToFamilyId = new Map();

  // ─── Phase 1: explicit groups from enemy.zoneRelationGroups ──────────────
  const explicitGroups = Array.isArray(enemy?.zoneRelationGroups)
    ? enemy.zoneRelationGroups
    : [];

  if (explicitGroups.length > 0) {
    // Build a normalised-name → index lookup (first occurrence wins for
    // duplicates, matching the behaviour of enemies/data.js).
    const zoneIndexByNameKey = new Map();
    indexedZones.forEach(({ idx, zone }) => {
      const key = normalizeText(zone?.zone_name);
      if (key && !zoneIndexByNameKey.has(key)) {
        zoneIndexByNameKey.set(key, idx);
      }
    });

    // Index the zones for O(1) lookup when building memberZones.
    const zoneByIndex = new Map(indexedZones.map(({ idx, zone }) => [idx, zone]));

    explicitGroups.forEach((group) => {
      const seen = new Set();
      const memberIndices = [];
      const memberEntriesInGroupOrder = [];

      group.zoneNames.forEach((zoneName) => {
        const key = normalizeText(zoneName);
        const idx = zoneIndexByNameKey.get(key);
        if (idx !== undefined && !assignedZoneIndices.has(idx) && !seen.has(idx)) {
          seen.add(idx);
          memberEntriesInGroupOrder.push({
            idx,
            zone: zoneByIndex.get(idx) ?? null
          });
          memberIndices.push(idx);
        }
      });

      if (memberIndices.length === 0) {
        return;
      }

      memberIndices.sort((a, b) => a - b);
      const familyId = `explicit:${group.id}`;
      memberIndices.forEach((idx) => {
        assignedZoneIndices.add(idx);
        zoneIndexToFamilyId.set(idx, familyId);
      });

      const isSingleton = memberIndices.length === 1;
      const memberZoneByIndex = new Map(memberEntriesInGroupOrder.map((entry) => [entry.idx, entry.zone]));
      const memberZones = memberIndices.map((idx) => memberZoneByIndex.get(idx) ?? null);
      const isHomogeneous = isHomogeneousZoneFamily(memberZones);
      const representativeEntry = (!isSingleton && !isHomogeneous)
        ? pickExplicitRepresentativeMember(group, memberEntriesInGroupOrder)
        : (memberEntriesInGroupOrder.find((entry) => entry.idx === memberIndices[0]) || memberEntriesInGroupOrder[0] || null);
      const representativeIndex = representativeEntry?.idx ?? memberIndices[0];
      const representativeZone = representativeEntry?.zone ?? memberZones[0];

      families.push({
        familyId,
        memberIndices,
        memberZones,
        representativeIndex,
        representativeZone,
        label: group.label,
        summaryLabel: isSingleton
          ? group.label
          : `${group.label} (×${memberIndices.length})`,
        isExplicit: true,
        isSingleton,
        isHomogeneous,
        groupId: group.id
      });
    });
  }

  // ─── Phase 2: auto-fallback for ungrouped zones ───────────────────────────
  // Delegate to autoClusterZones, which buckets every remaining zone solely by
  // exact combat signature.
  const ungroupedZones = indexedZones.filter(({ idx }) => !assignedZoneIndices.has(idx));
  const clusters = autoClusterZones(ungroupedZones);

  for (const { members } of clusters) {
    const memberIndices = members.map((m) => m.idx);
    const representativeIndex = memberIndices[0];
    const representativeZone = members[0].zone;
    const isSingleton = memberIndices.length === 1;
    const familyId = `auto:${representativeIndex}`;

    const label = buildAutoFamilyLabel(members);

    const summaryLabel = isSingleton
      ? label
      : `${label} (×${memberIndices.length})`;

    memberIndices.forEach((idx) => {
      assignedZoneIndices.add(idx);
      zoneIndexToFamilyId.set(idx, familyId);
    });

    families.push({
      familyId,
      memberIndices,
      memberZones: members.map((m) => m.zone),
      representativeIndex,
      representativeZone,
      label,
      summaryLabel,
      isExplicit: false,
      isSingleton,
      isHomogeneous: true,
      groupId: null
    });
  }

  // Sort by the earliest member index so families stay anchored to the first
  // displayed zone even when a later member is chosen as the representative.
  families.sort((a, b) => a.memberIndices[0] - b.memberIndices[0]);

  return { families, zoneIndexToFamilyId };
}
