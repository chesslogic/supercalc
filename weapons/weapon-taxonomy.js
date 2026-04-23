const WEAPON_ROLE_LABELS = new Map([
  ['automatic', 'Automatic'],
  ['precision', 'Precision'],
  ['explosive', 'Explosive'],
  ['shotgun', 'Shotgun'],
  ['special', 'Special'],
  ['ordnance', 'Ordnance'],
  ['energy', 'Energy']
]);

export const WEAPON_ROLE_ORDER = Object.freeze([...WEAPON_ROLE_LABELS.keys()]);

const WEAPON_SUBTYPE_DEFINITIONS = Object.freeze([
  { id: 'ar', label: 'AR', showInSharedFilters: true },
  { id: 'dmr', label: 'DMR', showInSharedFilters: true },
  { id: 'smg', label: 'SMG', showInSharedFilters: true },
  { id: 'sg', label: 'SG', showInSharedFilters: true },
  { id: 'pdw', label: 'PDW', showInSharedFilters: true },
  { id: 'exp', label: 'EXP', showInSharedFilters: true },
  { id: 'mg', label: 'MG', showInSharedFilters: true },
  { id: 'gl', label: 'GL', showInSharedFilters: true },
  { id: 'rl', label: 'RL', showInSharedFilters: true },
  { id: 'gr', label: 'GR', showInSharedFilters: true },
  { id: 'cqc', label: 'CQC', showInSharedFilters: false },
  { id: 'nrg', label: 'NRG', showInSharedFilters: false },
  { id: 'spc', label: 'SPC', showInSharedFilters: false },
  { id: 'can', label: 'CAN', showInSharedFilters: false },
  { id: 'bck', label: 'BCK', showInSharedFilters: false },
  { id: 'egl', label: 'EGL', showInSharedFilters: false },
  { id: 'emp', label: 'EMP', showInSharedFilters: false },
  { id: 'orb', label: 'ORB', showInSharedFilters: false },
  { id: 'vhl', label: 'VHL', showInSharedFilters: false }
]);

const WEAPON_SUBTYPE_LOOKUP = new Map(
  WEAPON_SUBTYPE_DEFINITIONS.map((definition) => [definition.id, definition])
);

const LEGACY_WEAPON_ROLE_SUB_LOOKUP = new Map([
  ['gr', 'explosive'],
  ['ar', 'automatic'],
  ['mg', 'automatic'],
  ['smg', 'automatic'],
  ['pdw', 'precision'],
  ['dmr', 'precision'],
  ['can', 'precision'],
  ['exp', 'explosive'],
  ['gl', 'explosive'],
  ['sg', 'shotgun'],
  ['cqc', 'special'],
  ['bck', 'special'],
  ['spc', 'special'],
  ['egl', 'ordnance'],
  ['emp', 'ordnance'],
  ['orb', 'ordnance'],
  ['rl', 'ordnance'],
  ['vhl', 'ordnance']
]);

export const RECOMMENDATION_WEAPON_FEATURE_GROUPS = [
  { id: 'auto', roleId: 'automatic', label: 'Automatic' },
  { id: 'explosive', roleId: 'explosive', label: 'Explosive' },
  { id: 'special', roleId: 'special', label: 'Special' },
  { id: 'ordnance', roleId: 'ordnance', label: 'Ordnance' }
];

const RECOMMENDATION_WEAPON_FEATURE_GROUP_LOOKUP = RECOMMENDATION_WEAPON_FEATURE_GROUPS.reduce((lookup, definition) => {
  lookup.set(definition.roleId, definition.id);
  return lookup;
}, new Map());

const COMPARE_SORT_FAMILY_ROLE_IDS = new Set(['automatic', 'precision']);

function toTitleCase(value) {
  return String(value || '')
    .split(/[-_\s]+/u)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function normalizeWeaponTaxonomyValue(value) {
  return String(value ?? '').trim().toLowerCase();
}

export function normalizeWeaponRoleId(role) {
  const normalizedRole = normalizeWeaponTaxonomyValue(role);
  return normalizedRole || null;
}

export function normalizeWeaponSubId(sub) {
  const normalizedSub = normalizeWeaponTaxonomyValue(sub);
  return normalizedSub || null;
}

export function getWeaponRoleLabel(roleId) {
  const normalizedRoleId = normalizeWeaponRoleId(roleId);
  if (!normalizedRoleId) {
    return '';
  }

  return WEAPON_ROLE_LABELS.get(normalizedRoleId) || toTitleCase(normalizedRoleId);
}

export function getWeaponExplicitRoleId(weapon) {
  return normalizeWeaponRoleId(weapon?.role);
}

export function getWeaponSubLabel(subId) {
  const normalizedSubId = normalizeWeaponSubId(subId);
  if (!normalizedSubId) {
    return '';
  }

  return WEAPON_SUBTYPE_LOOKUP.get(normalizedSubId)?.label || normalizedSubId.toUpperCase();
}

export function getWeaponLegacyRoleId(weapon) {
  const normalizedSub = normalizeWeaponTaxonomyValue(weapon?.sub);
  return normalizedSub
    ? (LEGACY_WEAPON_ROLE_SUB_LOOKUP.get(normalizedSub) || null)
    : null;
}

export function getWeaponRoleId(weapon) {
  return getWeaponExplicitRoleId(weapon) || getWeaponLegacyRoleId(weapon);
}

export function getAvailableWeaponSubIds(weapons, {
  visibility = 'all'
} = {}) {
  const presentSubIds = new Set(
    (Array.isArray(weapons) ? weapons : [])
      .map((weapon) => normalizeWeaponSubId(weapon?.sub))
      .filter(Boolean)
  );

  const orderedKnownSubIds = WEAPON_SUBTYPE_DEFINITIONS
    .filter((definition) => presentSubIds.has(definition.id))
    .filter((definition) => visibility !== 'shared' || definition.showInSharedFilters)
    .map((definition) => definition.id);

  if (visibility === 'shared') {
    return orderedKnownSubIds;
  }

  const unknownSubIds = [...presentSubIds]
    .filter((subId) => !WEAPON_SUBTYPE_LOOKUP.has(subId))
    .sort((left, right) => left.localeCompare(right));

  return [...orderedKnownSubIds, ...unknownSubIds];
}

export function getWeaponRecommendationFeatureGroupId(weapon) {
  const roleId = getWeaponRoleId(weapon);
  return roleId
    ? (RECOMMENDATION_WEAPON_FEATURE_GROUP_LOOKUP.get(roleId) || null)
    : null;
}

export function getWeaponCompareSortFamilyId(weapon) {
  const roleId = getWeaponRoleId(weapon);
  return roleId && COMPARE_SORT_FAMILY_ROLE_IDS.has(roleId)
    ? roleId
    : null;
}
