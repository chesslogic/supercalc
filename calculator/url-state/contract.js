import {
  DEFAULT_COMPARE_VIEW,
  DEFAULT_ENEMY_DROPDOWN_SORT_DIR,
  DEFAULT_ENEMY_DROPDOWN_SORT_MODE,
  DEFAULT_OVERVIEW_SCOPE,
  DEFAULT_RECOMMENDATION_NO_MAIN_VIA_LIMBS,
  DEFAULT_RECOMMENDATION_MIN_SHOTS,
  DEFAULT_RECOMMENDATION_MAX_SHOTS,
  DEFAULT_RECOMMENDATION_WEAPON_FILTER_MODE,
  DEFAULT_WEAPON_SORT_MODE,
  getSelectedEnemyTargetTypes
} from '../data.js';
import { DEFAULT_RECOMMENDATION_RANGE_METERS } from '../recommendations.js';
import { DEFAULT_ACTIVE_WEAPON_TYPES } from '../../weapons/data.js';

export const URL_STATE_VERSION = '1';

export const DEFAULT_CALCULATOR_URL_STATE = {
  mode: 'compare',
  compareView: DEFAULT_COMPARE_VIEW,
  weaponSortMode: DEFAULT_WEAPON_SORT_MODE,
  enemyDropdownSortMode: DEFAULT_ENEMY_DROPDOWN_SORT_MODE,
  enemyDropdownSortDir: DEFAULT_ENEMY_DROPDOWN_SORT_DIR,
  enemyTableMode: 'analysis',
  overviewScope: DEFAULT_OVERVIEW_SCOPE,
  enemyTargetTypes: getSelectedEnemyTargetTypes(),
  diffDisplayMode: 'absolute',
  engagementRangeMetersA: DEFAULT_RECOMMENDATION_RANGE_METERS,
  engagementRangeMetersB: DEFAULT_RECOMMENDATION_RANGE_METERS,
  weaponA: null,
  weaponB: null,
  selectedEnemy: null,
  selectedZoneIndex: null,
  selectedExplosiveZoneIndices: [],
  recommendationWeaponFilterMode: DEFAULT_RECOMMENDATION_WEAPON_FILTER_MODE,
  recommendationWeaponFilterTypes: [],
  recommendationWeaponFilterSubs: [],
  recommendationWeaponFilterGroups: [],
  recommendationWeaponFilterRoles: [],
  recommendationNoMainViaLimbs: DEFAULT_RECOMMENDATION_NO_MAIN_VIA_LIMBS,
  recommendationMinShots: DEFAULT_RECOMMENDATION_MIN_SHOTS,
  recommendationMaxShots: DEFAULT_RECOMMENDATION_MAX_SHOTS,
  selectedAttackKeysA: null,
  selectedAttackKeysB: null,
  attackHitCountsA: null,
  attackHitCountsB: null,
  enemySort: {
    key: 'zone_name',
    dir: 'asc',
    groupMode: 'none'
  }
};

export const DEFAULT_WEAPON_TAB_URL_STATE = {
  searchQuery: '',
  activeTypes: [...DEFAULT_ACTIVE_WEAPON_TYPES],
  activeSubs: [],
  activeRoles: [],
  sortKey: null,
  sortDir: 'asc'
};

export const DEFAULT_ENEMY_TAB_URL_STATE = {
  searchQuery: '',
  activeFactions: [],
  sortKey: null,
  sortDir: 'asc'
};

export const URL_PARAM_KEYS = {
  version: 'sv',
  activeTab: 'tab',
  calculatorMode: 'cm',
  compareView: 'cv',
  weaponSortMode: 'cws',
  enemyDropdownSortMode: 'ceds',
  enemyDropdownSortDir: 'cedd',
  enemyTableMode: 'cetm',
  overviewScope: 'cos',
  enemyTargetTypes: 'cett',
  diffDisplayMode: 'cddm',
  engagementRangeMetersA: 'cra',
  engagementRangeMetersB: 'crb',
  weaponA: 'cwa',
  weaponB: 'cwb',
  selectedEnemy: 'cen',
  selectedZoneIndex: 'csz',
  selectedExplosiveZoneIndices: 'cez',
  recommendationWeaponFilterMode: 'crfm',
  recommendationWeaponFilterTypes: 'crft',
  recommendationWeaponFilterRoles: 'crfr',
  recommendationNoMainViaLimbs: 'crnl',
  recommendationMinShots: 'crmin',
  recommendationMaxShots: 'crmax',
  selectedAttackKeysA: 'caa',
  selectedAttackKeysB: 'cab',
  attackHitCountsA: 'cha',
  attackHitCountsB: 'chb',
  calculatorEnemySortKey: 'csk',
  calculatorEnemySortDir: 'csd',
  enemySortGroupMode: 'csg',
  weaponSearchQuery: 'wsq',
  weaponActiveTypes: 'wty',
  weaponActiveSubs: 'wsub',
  weaponActiveRoles: 'wrl',
  weaponSortKey: 'wsk',
  weaponSortDir: 'wsd',
  enemySearchQuery: 'esq',
  enemyActiveFactions: 'efa',
  enemyTabSortKey: 'esk',
  enemyTabSortDir: 'esd'
};

export const URL_STATE_PARAM_NAMES = new Set(Object.values(URL_PARAM_KEYS));

export function normalizeTabId(tabId) {
  return ['weapons', 'enemies', 'calculator', 'references'].includes(tabId) ? tabId : 'calculator';
}
