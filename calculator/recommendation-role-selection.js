import { normalizeFilterValues } from '../filter-utils.js';
import { WEAPON_ROLE_ORDER, normalizeWeaponRoleId } from '../weapons/weapon-taxonomy.js';

export const RECOMMENDATION_ORDNANCE_ROLE_ID = 'ordnance';
export const DEFAULT_RECOMMENDATION_ROLE_SELECTION = Object.freeze(
  WEAPON_ROLE_ORDER.filter((roleId) => roleId !== RECOMMENDATION_ORDNANCE_ROLE_ID)
);

const KNOWN_ROLE_INDEX_LOOKUP = new Map(
  WEAPON_ROLE_ORDER.map((roleId, index) => [roleId, index])
);
const DEFAULT_RECOMMENDATION_ROLE_SELECTION_SET = new Set(DEFAULT_RECOMMENDATION_ROLE_SELECTION);

function compareRecommendationRoleIds(left, right) {
  const leftKnownIndex = KNOWN_ROLE_INDEX_LOOKUP.get(left);
  const rightKnownIndex = KNOWN_ROLE_INDEX_LOOKUP.get(right);
  const leftIsKnown = Number.isInteger(leftKnownIndex);
  const rightIsKnown = Number.isInteger(rightKnownIndex);

  if (leftIsKnown && rightIsKnown) {
    return leftKnownIndex - rightKnownIndex;
  }
  if (leftIsKnown) {
    return -1;
  }
  if (rightIsKnown) {
    return 1;
  }
  return left.localeCompare(right);
}

function normalizeRecommendationRoleOverrideValue(value) {
  if (value === true || value === 1) {
    return true;
  }
  if (value === false || value === 0) {
    return false;
  }

  const normalizedValue = String(value ?? '').trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(normalizedValue)) {
    return true;
  }
  if (['false', '0', 'no', 'off'].includes(normalizedValue)) {
    return false;
  }

  return null;
}

export function normalizeRecommendationRoleSelection(roles = []) {
  return normalizeFilterValues(
    (Array.isArray(roles) ? roles : [])
      .map((roleId) => normalizeWeaponRoleId(roleId))
      .filter(Boolean)
  ).sort(compareRecommendationRoleIds);
}

export function getDefaultRecommendationRoleSelection() {
  return [...DEFAULT_RECOMMENDATION_ROLE_SELECTION];
}

export function getRecommendationRoleSelectionOverrides(roles = []) {
  const normalizedRoles = normalizeRecommendationRoleSelection(roles);
  const normalizedRoleSet = new Set(normalizedRoles);
  const candidateRoleIds = normalizeRecommendationRoleSelection([
    ...WEAPON_ROLE_ORDER,
    ...normalizedRoles
  ]);

  return candidateRoleIds.reduce((overrides, roleId) => {
    const defaultActive = DEFAULT_RECOMMENDATION_ROLE_SELECTION_SET.has(roleId);
    const currentActive = normalizedRoleSet.has(roleId);
    if (currentActive !== defaultActive) {
      overrides[roleId] = currentActive ? 1 : 0;
    }
    return overrides;
  }, {});
}

export function hasCustomRecommendationRoleSelection(roles = []) {
  return Object.keys(getRecommendationRoleSelectionOverrides(roles)).length > 0;
}

export function isDefaultRecommendationRoleSelection(roles = []) {
  return !hasCustomRecommendationRoleSelection(roles);
}

export function getRecommendationRoleSelectionFromOverrides(overrides) {
  if (!overrides || Array.isArray(overrides) || typeof overrides !== 'object') {
    return getDefaultRecommendationRoleSelection();
  }

  const selection = new Set(DEFAULT_RECOMMENDATION_ROLE_SELECTION);
  Object.entries(overrides).forEach(([rawRoleId, rawValue]) => {
    const roleId = normalizeWeaponRoleId(rawRoleId);
    const enabled = normalizeRecommendationRoleOverrideValue(rawValue);
    if (!roleId || enabled === null) {
      return;
    }

    if (enabled) {
      selection.add(roleId);
    } else {
      selection.delete(roleId);
    }
  });

  return normalizeRecommendationRoleSelection([...selection]);
}
