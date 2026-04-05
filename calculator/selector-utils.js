import {
  ENEMY_TARGET_TYPE_DEFINITIONS,
  filterEnemiesByScope as filterEnemiesByResolvedScope,
  getEnemyPrimaryTargetTypeDefinition
} from './enemy-scope.js';

export const DEFAULT_ENEMY_DROPDOWN_SORT_MODE = 'targets';

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

const ENEMY_DROPDOWN_SORT_MODE_LOOKUP = new Map();
ENEMY_DROPDOWN_SORT_MODE_DEFINITIONS.forEach((definition) => {
  ENEMY_DROPDOWN_SORT_MODE_LOOKUP.set(definition.id, definition.id);
});
ENEMY_DROPDOWN_SORT_MODE_LOOKUP.set('target', 'targets');
ENEMY_DROPDOWN_SORT_MODE_LOOKUP.set('type', 'targets');
ENEMY_DROPDOWN_SORT_MODE_LOOKUP.set('types', 'targets');
ENEMY_DROPDOWN_SORT_MODE_LOOKUP.set('alpha', 'alphabetical');
ENEMY_DROPDOWN_SORT_MODE_LOOKUP.set('alphabetic', 'alphabetical');

const ENEMY_TARGET_TYPE_ORDER = new Map(
  ENEMY_TARGET_TYPE_DEFINITIONS.map((definition, index) => [definition.id, index])
);

function compareNullableNumbers(left, right) {
  return Number(left ?? Number.MAX_SAFE_INTEGER) - Number(right ?? Number.MAX_SAFE_INTEGER);
}

function compareEnemyNames(left, right) {
  return String(left?.name || '').localeCompare(String(right?.name || ''), undefined, {
    sensitivity: 'base'
  });
}

function getEnemyTargetTypeRank(enemy) {
  return ENEMY_TARGET_TYPE_ORDER.get(getEnemyPrimaryTargetTypeDefinition(enemy)?.id) ?? Number.MAX_SAFE_INTEGER;
}

export function normalizeEnemyDropdownSortMode(sortMode = DEFAULT_ENEMY_DROPDOWN_SORT_MODE) {
  return ENEMY_DROPDOWN_SORT_MODE_LOOKUP.get(String(sortMode ?? '').trim().toLowerCase())
    || DEFAULT_ENEMY_DROPDOWN_SORT_MODE;
}

export function getEnemyDropdownSortModeOptions() {
  return ENEMY_DROPDOWN_SORT_MODE_DEFINITIONS.map((definition) => ({ ...definition }));
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
  sortMode = DEFAULT_ENEMY_DROPDOWN_SORT_MODE
} = {}) {
  const normalizedSortMode = normalizeEnemyDropdownSortMode(sortMode);
  const visibleOptions = Array.isArray(options) ? options : [];
  const frontRankByFaction = new Map();

  visibleOptions.forEach((enemy) => {
    const faction = String(enemy?.faction || '').trim();
    if (!frontRankByFaction.has(faction)) {
      frontRankByFaction.set(faction, frontRankByFaction.size);
    }
  });

  const originalIndexByEnemy = new Map(visibleOptions.map((enemy, index) => [enemy, index]));

  return [...visibleOptions].sort((left, right) => {
    let comparison = compareNullableNumbers(
      frontRankByFaction.get(String(left?.faction || '').trim()),
      frontRankByFaction.get(String(right?.faction || '').trim())
    );
    if (comparison !== 0) {
      return comparison;
    }

    if (normalizedSortMode === 'targets') {
      comparison = compareNullableNumbers(getEnemyTargetTypeRank(left), getEnemyTargetTypeRank(right));
      if (comparison !== 0) {
        return comparison;
      }
    }

    comparison = compareEnemyNames(left, right);
    if (comparison !== 0) {
      return comparison;
    }

    if (normalizedSortMode !== 'targets') {
      comparison = compareNullableNumbers(getEnemyTargetTypeRank(left), getEnemyTargetTypeRank(right));
      if (comparison !== 0) {
        return comparison;
      }
    }

    return compareNullableNumbers(originalIndexByEnemy.get(left), originalIndexByEnemy.get(right));
  });
}
