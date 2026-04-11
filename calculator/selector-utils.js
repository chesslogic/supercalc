import {
  ENEMY_TARGET_TYPE_DEFINITIONS,
  filterEnemiesByScope as filterEnemiesByResolvedScope,
  getEnemyPrimaryTargetTypeDefinition,
  getEnemyUnitFront
} from './enemy-scope.js';
import {
  buildSortModeLookup,
  compareByComparators,
  compareNullableValues,
  compareText,
  getSortModeOptions,
  normalizeSortDirection,
  normalizeSortModeId
} from '../sort-utils.js';

export const DEFAULT_ENEMY_DROPDOWN_SORT_MODE = 'targets';
export const DEFAULT_ENEMY_DROPDOWN_SORT_DIR = 'asc';

const ENEMY_DROPDOWN_SORT_MODE_DEFINITIONS = [
  {
    id: 'targets',
    label: 'Targets'
  },
  {
    id: 'alphabetical',
    label: 'Alphabetical'
  }
];

const ENEMY_DROPDOWN_SORT_MODE_LOOKUP = buildSortModeLookup(
  ENEMY_DROPDOWN_SORT_MODE_DEFINITIONS,
  [
    ['target', 'targets'],
    ['type', 'targets'],
    ['types', 'targets'],
    ['alpha', 'alphabetical'],
    ['alphabetic', 'alphabetical']
  ]
);

const ENEMY_TARGET_TYPE_ORDER = new Map(
  ENEMY_TARGET_TYPE_DEFINITIONS.map((definition, index) => [definition.id, index])
);
const ENEMY_FRONT_SORT_ORDER = new Map([
  ['terminids', 0],
  ['automatons', 1],
  ['illuminate', 2]
]);

function getEnemyFrontSortRank(enemy) {
  return ENEMY_FRONT_SORT_ORDER.get(getEnemyUnitFront(enemy)?.id) ?? Number.MAX_SAFE_INTEGER;
}

function compareEnemyNames(left, right, {
  direction = 'asc'
} = {}) {
  return compareText(left?.name, right?.name, {
    direction,
    sensitivity: 'base'
  });
}

function getEnemyTargetTypeRank(enemy) {
  return ENEMY_TARGET_TYPE_ORDER.get(getEnemyPrimaryTargetTypeDefinition(enemy)?.id) ?? Number.MAX_SAFE_INTEGER;
}

export function normalizeEnemyDropdownSortMode(sortMode = DEFAULT_ENEMY_DROPDOWN_SORT_MODE) {
  return normalizeSortModeId(sortMode, {
    defaultMode: DEFAULT_ENEMY_DROPDOWN_SORT_MODE,
    lookup: ENEMY_DROPDOWN_SORT_MODE_LOOKUP,
    definitions: ENEMY_DROPDOWN_SORT_MODE_DEFINITIONS
  });
}

export function normalizeEnemyDropdownSortDir(sortDir = DEFAULT_ENEMY_DROPDOWN_SORT_DIR) {
  return normalizeSortDirection(sortDir);
}

export function getEnemyDropdownSortModeOptions() {
  return getSortModeOptions(ENEMY_DROPDOWN_SORT_MODE_DEFINITIONS);
}

export function getEnemyDropdownQueryState(query, {
  mode = 'single',
  compareView = 'focused',
  selectedEnemyName = ''
} = {}) {
  const normalizedQuery = String(query ?? '').trim().toLowerCase();
  const normalizedSelectedEnemyName = String(selectedEnemyName ?? '').trim().toLowerCase();
  const overviewActive = mode === 'compare' && compareView === 'overview';
  const queryMatchesSelectedEnemy = normalizedSelectedEnemyName !== '' && normalizedQuery === normalizedSelectedEnemyName;

  return {
    normalizedQuery,
    effectiveQuery: (overviewActive && normalizedQuery === 'overview') || queryMatchesSelectedEnemy
      ? ''
      : normalizedQuery,
    showOverviewOption: mode === 'compare' && 'overview'.includes(normalizedQuery)
  };
}

export function filterEnemiesByScope(options = [], scope = 'All') {
  return filterEnemiesByResolvedScope(options, scope);
}

export function sortEnemyDropdownOptions(options = [], {
  sortMode = DEFAULT_ENEMY_DROPDOWN_SORT_MODE,
  sortDir = DEFAULT_ENEMY_DROPDOWN_SORT_DIR
} = {}) {
  const normalizedSortMode = normalizeEnemyDropdownSortMode(sortMode);
  const normalizedSortDir = normalizeEnemyDropdownSortDir(sortDir);
  const visibleOptions = Array.isArray(options) ? options : [];
  const originalIndexByEnemy = new Map(visibleOptions.map((enemy, index) => [enemy, index]));

  return [...visibleOptions].sort((left, right) => compareByComparators(left, right, [
    (currentLeft, currentRight) => compareNullableValues(
      getEnemyFrontSortRank(currentLeft),
      getEnemyFrontSortRank(currentRight),
      { numeric: true }
    ),
    ...(normalizedSortMode === 'targets'
      ? [
        (currentLeft, currentRight) => compareNullableValues(
          getEnemyTargetTypeRank(currentLeft),
          getEnemyTargetTypeRank(currentRight),
          {
            numeric: true,
            direction: normalizedSortDir
          }
        )
      ]
      : []),
    (currentLeft, currentRight) => compareEnemyNames(currentLeft, currentRight, {
      direction: normalizedSortDir
    }),
    ...(normalizedSortMode !== 'targets'
      ? [
        (currentLeft, currentRight) => compareNullableValues(
          getEnemyTargetTypeRank(currentLeft),
          getEnemyTargetTypeRank(currentRight),
          {
            numeric: true,
            direction: normalizedSortDir
          }
        )
      ]
      : []),
    (currentLeft, currentRight) => compareNullableValues(
      originalIndexByEnemy.get(currentLeft),
      originalIndexByEnemy.get(currentRight),
      { numeric: true }
    )
  ]));
}
