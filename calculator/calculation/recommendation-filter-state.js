import { calculatorState } from '../data.js';
import {
  RECOMMENDATION_CORE_TYPE_ORDER,
  RECOMMENDATION_FEATURE_GROUPS,
  RECOMMENDATION_FILTER_TYPE_ORDER,
  RECOMMENDATION_HIGHLIGHT_SUMMARY_TITLE
} from './recommendation-constants.js';
import { getWeaponRecommendationFeatureGroupId, getWeaponRoleId, getWeaponRoleLabel } from '../../weapons/weapon-taxonomy.js';

export function getRecommendationSummaryTitle(hasHighlightedRows) {
  return hasHighlightedRows
    ? `${RECOMMENDATION_HIGHLIGHT_SUMMARY_TITLE}\nRows without those highlights are hidden from this table.`
    : `${RECOMMENDATION_HIGHLIGHT_SUMMARY_TITLE}\nNothing matches right now, so the table falls back to the best-ranked row for each weapon.`;
}

export function normalizeRecommendationWeaponType(type) {
  return String(type ?? '').trim().toLowerCase();
}

export function getRecommendationCoreType(row) {
  const normalizedType = normalizeRecommendationWeaponType(row?.weapon?.type);
  return RECOMMENDATION_CORE_TYPE_ORDER.includes(normalizedType)
    ? normalizedType
    : null;
}

export function normalizeRecommendationWeaponSub(sub) {
  return String(sub ?? '').trim().toLowerCase();
}

export function getRecommendationFilterChipLabel(value, kind = 'type') {
  const normalizedValue = String(value ?? '').trim();
  if (!normalizedValue) {
    return '';
  }

  return kind === 'sub'
    ? normalizedValue.toUpperCase()
    : normalizedValue.charAt(0).toUpperCase() + normalizedValue.slice(1);
}

export function getAvailableRecommendationWeaponTypes(weapons = []) {
  const presentTypes = new Set(
    (Array.isArray(weapons) ? weapons : [])
      .map((weapon) => normalizeRecommendationWeaponType(weapon?.type))
      .filter(Boolean)
  );

  return RECOMMENDATION_FILTER_TYPE_ORDER.filter((type) => presentTypes.has(type));
}

export function hasActiveRecommendationWeaponFilters() {
  return calculatorState.recommendationWeaponFilterTypes.length > 0
    || calculatorState.recommendationWeaponFilterSubs.length > 0
    || calculatorState.recommendationWeaponFilterGroups.length > 0
    || calculatorState.recommendationWeaponFilterRoles.length > 0;
}

function doesWeaponMatchRecommendationFilters(weapon) {
  const hasTypeFilters = calculatorState.recommendationWeaponFilterTypes.length > 0;
  const hasSubFilters = calculatorState.recommendationWeaponFilterSubs.length > 0;
  const hasGroupFilters = calculatorState.recommendationWeaponFilterGroups.length > 0;
  const hasRoleFilters = calculatorState.recommendationWeaponFilterRoles.length > 0;
  if (!hasTypeFilters && !hasSubFilters && !hasGroupFilters && !hasRoleFilters) {
    return true;
  }

  const normalizedType = normalizeRecommendationWeaponType(weapon?.type);
  const normalizedSub = normalizeRecommendationWeaponSub(weapon?.sub);
  const matchesType = hasTypeFilters && calculatorState.recommendationWeaponFilterTypes.includes(normalizedType);
  const matchesSub = hasSubFilters && calculatorState.recommendationWeaponFilterSubs.includes(normalizedSub);
  const matchesGroup = hasGroupFilters && calculatorState.recommendationWeaponFilterGroups.includes(
    getWeaponRecommendationFeatureGroupId(weapon)
  );
  const matchesRole = hasRoleFilters && calculatorState.recommendationWeaponFilterRoles.includes(
    getWeaponRoleId(weapon)
  );
  const matchesAnyFilter = matchesType || matchesSub || matchesGroup || matchesRole;

  return calculatorState.recommendationWeaponFilterMode === 'include'
    ? matchesAnyFilter
    : !matchesAnyFilter;
}

export function getFilteredRecommendationWeapons(weapons = []) {
  return (Array.isArray(weapons) ? weapons : []).filter((weapon) => doesWeaponMatchRecommendationFilters(weapon));
}

export function getRecommendationWeaponFilterSummaryText() {
  if (!hasActiveRecommendationWeaponFilters()) {
    return '';
  }

  const groupLabels = calculatorState.recommendationWeaponFilterGroups
    .map((groupId) => RECOMMENDATION_FEATURE_GROUPS.find((group) => group.id === groupId)?.label)
    .filter(Boolean);
  const roleLabels = calculatorState.recommendationWeaponFilterRoles
    .map((roleId) => getWeaponRoleLabel(roleId))
    .filter(Boolean);
  const labels = [
    ...calculatorState.recommendationWeaponFilterTypes.map((type) => getRecommendationFilterChipLabel(type, 'type')),
    ...groupLabels,
    ...roleLabels,
    ...calculatorState.recommendationWeaponFilterSubs.map((sub) => getRecommendationFilterChipLabel(sub, 'sub'))
  ];
  if (labels.length === 0) {
    return '';
  }

  return calculatorState.recommendationWeaponFilterMode === 'include'
    ? ` Weapon filters: showing only ${labels.join(', ')}.`
    : ` Weapon filters: hiding ${labels.join(', ')}.`;
}
