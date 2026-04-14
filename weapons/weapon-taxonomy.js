const WEAPON_ROLE_LABELS = new Map([
  ['automatic', 'Automatic'],
  ['precision', 'Precision'],
  ['explosive', 'Explosive'],
  ['shotgun', 'Shotgun'],
  ['special', 'Special'],
  ['ordnance', 'Ordnance'],
  ['energy', 'Energy']
]);

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

export function getWeaponLegacyRoleId(weapon) {
  const normalizedSub = normalizeWeaponTaxonomyValue(weapon?.sub);
  return normalizedSub
    ? (LEGACY_WEAPON_ROLE_SUB_LOOKUP.get(normalizedSub) || null)
    : null;
}

export function getWeaponRoleId(weapon) {
  return getWeaponExplicitRoleId(weapon) || getWeaponLegacyRoleId(weapon);
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
