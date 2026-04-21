// calculator/enemy-zone-groups.js
// Builds grouped zone families for the focused enemy table.
//
// Grouping strategy (conservative, metadata-first):
//   1. Use explicit enemy.zoneRelationGroups when present.
//   2. Fall back to auto-clustering only when ungrouped zones share an
//      identical raw combat signature and a compatible normalized name stem.
//      This happens in two passes:
//        a. laterality-neutral grouping ("left"/"right"/"l"/"r")
//        b. positional-neutral merge ("front"/"rear"/"upper"/"lower")
//           when the remaining semantic core is still identical
//   3. Keep semantically dissimilar names separate even if stats match.
import { normalizeText } from './domain-utils.js';

// Zone fields that determine raw combat behaviour (weapon penetration, damage,
// overflow, and lethality).  Two zones with the same signature interact
// identically with every weapon.
const COMBAT_SIGNATURE_FIELDS = Object.freeze([
  'AV', 'Dur%', 'health', 'Con', 'ExMult', 'ExTarget', 'ToMain%', 'MainCap', 'IsFatal'
]);

// Tokens stripped from zone names to derive a laterality-neutral stem.
// This intentionally covers both the verbose forms ("left"/"right") and the
// compact dataset forms ("l"/"r").
const LATERALITY_TOKENS = new Set(['left', 'right', 'l', 'r']);

// Positional tokens that can vary between otherwise equivalent parts. These are
// only used in the secondary semantic merge pass after exact combat signature
// equality has already been established.
const POSITIONAL_VARIANT_TOKENS = new Set([
  ...LATERALITY_TOKENS,
  'front', 'rear', 'upper', 'lower'
]);

function buildZoneNameStem(zoneName, strippedTokens) {
  const normalized = normalizeText(zoneName);
  const parts = normalized
    .split('_')
    .filter((part) => part && !strippedTokens.has(part));
  return parts.length > 0 ? parts.join('_') : normalized;
}

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

/**
 * Returns the laterality-stripped name stem for a zone name.
 *
 * Algorithm: split on '_', drop tokens in LATERALITY_TOKENS, rejoin.
 * Falls back to the original normalised name when stripping would produce
 * an empty string (e.g. a zone literally named "left").
 *
 * Examples:
 *   "left_pauldron"       → "pauldron"
 *   "right_upper_arm"     → "upper_arm"
 *   "armor_lower_l_arm"   → "armor_lower_arm"
 *   "hitzone_r_rear_leg"  → "hitzone_rear_leg"
 *   "front_torso"         → "front_torso"   (front preserved)
 *   "rear_left_exhaust"   → "rear_exhaust"  (left stripped, rear kept)
 *   "left"                → "left"          (fallback – nothing remains)
 *
 * @param {string} zoneName
 * @returns {string}
 */
export function getZoneNameStem(zoneName) {
  return buildZoneNameStem(zoneName, LATERALITY_TOKENS);
}

/**
 * Returns a broader semantic stem for a zone name by stripping both laterality
 * and positional-variant tokens. This allows exact-stat matches like
 * front/rear or upper/lower leg pairs to collapse into one family while still
 * keeping different component nouns (e.g. leg vs claw) separate.
 *
 * Examples:
 *   "hitzone_l_rear_leg"  → "hitzone_leg"
 *   "hitzone_r_front_leg" → "hitzone_leg"
 *   "armor_lower_l_arm"   → "armor_arm"
 *   "front_torso"         → "torso"
 *   "left"                → "left"         (fallback – nothing remains)
 *
 * @param {string} zoneName
 * @returns {string}
 */
export function getZoneSemanticStem(zoneName) {
  return buildZoneNameStem(zoneName, POSITIONAL_VARIANT_TOKENS);
}

/**
 * Builds the human-readable display label for an auto-derived group whose
 * stem is non-empty.  Converts underscores to spaces.
 *
 * @param {string} stem
 * @returns {string}
 */
function buildAutoStemLabel(stem) {
  return stem.replace(/_/g, ' ');
}

/**
 * Clusters an array of indexed zones by identical combat signature and
 * compatible normalized name stem.
 *
 * Rules (conservative-but-statistical):
 *  - Exact combat signature match is required (all COMBAT_SIGNATURE_FIELDS).
 *  - left/right and compact l/r tokens normalize to the same stem, so mirrored
 *    pairs like "left_arm"/"right_arm" or "l_claw"/"r_claw" can cluster.
 *  - If multiple exact-stat strict stems differ only by positional tokens
 *    (front/rear/upper/lower), they are merged into one broader semantic
 *    family using the positional-neutral stem for the summary label.
 *  - A zone whose name reduces to an empty stem (e.g. a zone literally named
 *    "left") is returned as a degenerate singleton so it is never collapsed
 *    with other zones.
 *  - Zones with different semantic cores never merge, even if stats match.
 *
 * @param {Array<{idx: number, zone: object}>} indexedZones
 *   Unassigned zones to cluster.  Each entry must carry `.idx` (canonical
 *   zone index) and `.zone` (zone object).
 * @returns {Array<{
 *   members: Array<{idx: number, zone: object, stem: string}>,
 *   labelStem: string,
 *   isDegenerate: boolean
 * }>}
 *   Clusters sorted by the smallest member idx within each cluster.
 *   `isDegenerate` is true for the empty-stem singleton cluster produced when
 *   a zone name reduces to nothing after laterality stripping.
 */
export function autoClusterZones(indexedZones) {
  const clusters = [];
  const strictClusterMap = new Map(); // strictKey → { signature, stem, semanticStem, members }

  for (const { idx, zone } of indexedZones) {
    const sig = getZoneCombatSignature(zone);
    const stem = getZoneNameStem(zone?.zone_name);
    const semanticStem = getZoneSemanticStem(zone?.zone_name);

    if (!stem) {
      // Degenerate: empty zone name – isolate as a singleton cluster.
      clusters.push({
        members: [{ idx, zone, stem, semanticStem }],
        labelStem: stem,
        isDegenerate: true
      });
      continue;
    }

    const strictKey = `${sig}||${stem}`;
    if (!strictClusterMap.has(strictKey)) {
      strictClusterMap.set(strictKey, {
        signature: sig,
        stem,
        semanticStem,
        members: []
      });
    }
    strictClusterMap.get(strictKey).members.push({ idx, zone, stem, semanticStem });
  }

  const semanticClusterMap = new Map(); // semanticKey → strictCluster[]
  for (const strictCluster of strictClusterMap.values()) {
    strictCluster.members.sort((a, b) => a.idx - b.idx);
    const semanticKey = `${strictCluster.signature}||${strictCluster.semanticStem || strictCluster.stem}`;
    if (!semanticClusterMap.has(semanticKey)) {
      semanticClusterMap.set(semanticKey, []);
    }
    semanticClusterMap.get(semanticKey).push(strictCluster);
  }

  for (const strictClusters of semanticClusterMap.values()) {
    if (strictClusters.length === 1) {
      const [strictCluster] = strictClusters;
      clusters.push({
        members: strictCluster.members,
        labelStem: strictCluster.stem,
        isDegenerate: false
      });
      continue;
    }

    const mergedMembers = strictClusters
      .flatMap((strictCluster) => strictCluster.members)
      .sort((a, b) => a.idx - b.idx);
    const labelStem = strictClusters[0].semanticStem || strictClusters[0].stem;
    clusters.push({
      members: mergedMembers,
      labelStem,
      isDegenerate: false
    });
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

      group.zoneNames.forEach((zoneName) => {
        const key = normalizeText(zoneName);
        const idx = zoneIndexByNameKey.get(key);
        if (idx !== undefined && !assignedZoneIndices.has(idx) && !seen.has(idx)) {
          seen.add(idx);
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

      const memberZones = memberIndices.map((idx) => zoneByIndex.get(idx) ?? null);
      const representativeIndex = memberIndices[0];
      const representativeZone = memberZones[0];
      const isSingleton = memberIndices.length === 1;

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
        groupId: group.id
      });
    });
  }

  // ─── Phase 2: auto-fallback for ungrouped zones ───────────────────────────
  // Delegate to autoClusterZones, which first groups by identical combat
  // signature + laterality-neutral stem, then optionally merges positional
  // variants whose semantic core still matches exactly.
  const ungroupedZones = indexedZones.filter(({ idx }) => !assignedZoneIndices.has(idx));
  const clusters = autoClusterZones(ungroupedZones);

  for (const { members, labelStem, isDegenerate } of clusters) {
    const memberIndices = members.map((m) => m.idx);
    const representativeIndex = memberIndices[0];
    const representativeZone = members[0].zone;
    const isSingleton = memberIndices.length === 1;
    const familyId = `auto:${representativeIndex}`;

    // Degenerate (empty-stem) zones always become labelled singletons.
    // For normal clusters: singletons use the zone's own name; multi-member
    // groups derive their label from the shared strict or semantic stem
    // (underscores → spaces).
    const label = isDegenerate || isSingleton
      ? (representativeZone?.zone_name || `[zone ${representativeIndex}]`)
      : buildAutoStemLabel(labelStem);

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
      groupId: null
    });
  }

  // Sort by representative zone index for stable, index-preserving order.
  families.sort((a, b) => a.representativeIndex - b.representativeIndex);

  return { families, zoneIndexToFamilyId };
}
