export const DEFAULT_SORT_DIRECTION = 'asc';

function normalizeLookupKey(value) {
  return String(value ?? '').trim().toLowerCase();
}

function isMissingSortValue(value, emptyStringIsNull = true) {
  return value === null
    || value === undefined
    || (emptyStringIsNull && value === '');
}

export function normalizeSortDirection(sortDir = DEFAULT_SORT_DIRECTION) {
  return normalizeLookupKey(sortDir) === 'desc' ? 'desc' : DEFAULT_SORT_DIRECTION;
}

export function getToggledSortDirection(sortDir = DEFAULT_SORT_DIRECTION) {
  return normalizeSortDirection(sortDir) === 'desc' ? DEFAULT_SORT_DIRECTION : 'desc';
}

export function applySortDirection(comparison, direction = DEFAULT_SORT_DIRECTION) {
  return normalizeSortDirection(direction) === 'desc'
    ? comparison * -1
    : comparison;
}

export function getNextSortState({
  currentKey = null,
  currentDir = DEFAULT_SORT_DIRECTION,
  nextKey = null,
  defaultDir = DEFAULT_SORT_DIRECTION,
  normalizeKey = (value) => value ?? null
} = {}) {
  const normalizedCurrentKey = normalizeKey(currentKey);
  const normalizedNextKey = normalizeKey(nextKey);

  if (normalizedCurrentKey === normalizedNextKey) {
    return {
      key: normalizedNextKey,
      dir: getToggledSortDirection(currentDir)
    };
  }

  return {
    key: normalizedNextKey,
    dir: normalizeSortDirection(defaultDir)
  };
}

export function compareText(left, right, {
  direction = DEFAULT_SORT_DIRECTION,
  numeric = false,
  sensitivity = 'base'
} = {}) {
  const comparison = String(left ?? '').localeCompare(String(right ?? ''), undefined, {
    numeric,
    sensitivity
  });
  return applySortDirection(comparison, direction);
}

export function compareNullableValues(left, right, {
  direction = DEFAULT_SORT_DIRECTION,
  numeric = null,
  sensitivity = 'base',
  emptyStringIsNull = true
} = {}) {
  const leftMissing = isMissingSortValue(left, emptyStringIsNull);
  const rightMissing = isMissingSortValue(right, emptyStringIsNull);

  if (leftMissing && rightMissing) {
    return 0;
  }

  if (leftMissing) {
    return 1;
  }

  if (rightMissing) {
    return -1;
  }

  if (left === right) {
    return 0;
  }

  const compareAsNumber = numeric === true
    || (numeric !== false && typeof left === 'number' && typeof right === 'number');
  if (compareAsNumber) {
    return applySortDirection(left - right, direction);
  }

  return compareText(left, right, {
    direction,
    numeric: numeric === null ? true : Boolean(numeric),
    sensitivity
  });
}

export function compareBooleanDescending(left, right) {
  return Number(Boolean(right)) - Number(Boolean(left));
}

export function compareByComparators(left, right, comparators = []) {
  for (const comparator of comparators) {
    if (typeof comparator !== 'function') {
      continue;
    }

    const comparison = comparator(left, right);
    if (comparison < 0 || comparison > 0) {
      return comparison;
    }
  }

  return 0;
}

function normalizeAliasEntries(aliasEntries = []) {
  if (aliasEntries instanceof Map) {
    return Array.from(aliasEntries.entries());
  }

  if (Array.isArray(aliasEntries)) {
    return aliasEntries;
  }

  if (aliasEntries && typeof aliasEntries === 'object') {
    return Object.entries(aliasEntries);
  }

  return [];
}

export function buildSortModeLookup(definitions = [], aliasEntries = []) {
  const lookup = new Map();

  definitions.forEach((definition) => {
    const id = String(definition?.id || '').trim();
    if (id) {
      lookup.set(normalizeLookupKey(id), id);
    }
  });

  normalizeAliasEntries(aliasEntries).forEach(([alias, id]) => {
    const normalizedAlias = normalizeLookupKey(alias);
    const normalizedId = String(id || '').trim();
    if (normalizedAlias && normalizedId) {
      lookup.set(normalizedAlias, normalizedId);
    }
  });

  return lookup;
}

export function getSortModeOptions(definitions = [], {
  isAvailable = () => true
} = {}) {
  return definitions
    .filter((definition) => isAvailable(definition))
    .map((definition) => ({ ...definition }));
}

export function normalizeSortModeId(sortMode, {
  defaultMode = null,
  lookup = null,
  definitions = [],
  isAvailable = () => true
} = {}) {
  const availableDefinitions = definitions.filter((definition) => isAvailable(definition));
  const availableIds = new Set(availableDefinitions.map((definition) => definition.id));
  const fallbackMode = availableIds.has(defaultMode)
    ? defaultMode
    : availableDefinitions[0]?.id
      || definitions[0]?.id
      || null;
  const lookupTable = lookup instanceof Map ? lookup : buildSortModeLookup(definitions);
  const normalizedMode = lookupTable.get(normalizeLookupKey(sortMode))
    || lookupTable.get(normalizeLookupKey(fallbackMode))
    || fallbackMode;

  return availableIds.has(normalizedMode) ? normalizedMode : fallbackMode;
}

export function markGroupStarts(items = [], getGroupKey, {
  flagName = 'groupStart',
  firstValue = false
} = {}) {
  const groupKeys = items.map((item, index) => (
    typeof getGroupKey === 'function' ? getGroupKey(item, index) : null
  ));

  return items.map((item, index) => ({
    ...item,
    [flagName]: index === 0
      ? firstValue
      : groupKeys[index - 1] !== groupKeys[index]
  }));
}
