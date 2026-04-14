import {
  RECOMMENDATION_CORE_TYPE_MINIMUM,
  RECOMMENDATION_CORE_TYPE_ORDER,
  RECOMMENDATION_DISPLAY_LIMIT
} from './recommendation-constants.js';
import { getRecommendationCoreType } from './recommendation-filter-state.js';
import {
  applyOverallRecommendationTargetDiversity,
  buildRecommendationCoreTypeMinimums
} from './recommendation-target-diversity.js';

function buildOverallRecommendationDisplayRows(rows, limit = RECOMMENDATION_DISPLAY_LIMIT) {
  const sourceRows = Array.isArray(rows) ? rows.filter(Boolean) : [];
  const normalizedLimit = Math.max(0, Number.isFinite(limit) ? Math.trunc(limit) : RECOMMENDATION_DISPLAY_LIMIT);
  if (sourceRows.length <= normalizedLimit) {
    return {
      rows: sourceRows.slice(0, normalizedLimit),
      supplementedCoreTypes: []
    };
  }

  const availableCoreTypes = RECOMMENDATION_CORE_TYPE_ORDER.filter((type) => (
    sourceRows.some((row) => getRecommendationCoreType(row) === type)
  ));
  const minimumCoreCounts = buildRecommendationCoreTypeMinimums(sourceRows, availableCoreTypes);
  const reservedCoreSlots = Math.min(
    normalizedLimit,
    availableCoreTypes.length * RECOMMENDATION_CORE_TYPE_MINIMUM
  );
  const topSeedCount = Math.max(0, normalizedLimit - reservedCoreSlots);
  const selectedRows = sourceRows.slice(0, topSeedCount);
  const selectedRowSet = new Set(selectedRows);
  const supplementedCoreTypes = [];

  availableCoreTypes.forEach((type) => {
    const targetCount = minimumCoreCounts.get(type) || 0;
    let currentCount = selectedRows.filter((row) => getRecommendationCoreType(row) === type).length;
    let supplemented = false;

    for (const row of sourceRows) {
      if (currentCount >= targetCount || selectedRows.length >= normalizedLimit) {
        break;
      }
      if (selectedRowSet.has(row) || getRecommendationCoreType(row) !== type) {
        continue;
      }

      selectedRows.push(row);
      selectedRowSet.add(row);
      currentCount += 1;
      supplemented = true;
    }

    if (supplemented) {
      supplementedCoreTypes.push(type);
    }
  });

  for (const row of sourceRows) {
    if (selectedRows.length >= normalizedLimit) {
      break;
    }
    if (selectedRowSet.has(row)) {
      continue;
    }

    selectedRows.push(row);
    selectedRowSet.add(row);
  }
  const preservedCoreCounts = new Map(
    availableCoreTypes.map((type) => [
      type,
      Math.min(
        minimumCoreCounts.get(type) || 0,
        selectedRows.filter((row) => getRecommendationCoreType(row) === type).length
      )
    ])
  );

  applyOverallRecommendationTargetDiversity({
    sourceRows,
    selectedRows,
    selectedRowSet,
    minimumCoreCounts: preservedCoreCounts
  });

  return {
    rows: selectedRows,
    supplementedCoreTypes
  };
}

export function buildOverallRecommendationDisplaySequence(rows, limit = RECOMMENDATION_DISPLAY_LIMIT) {
  const sourceRows = Array.isArray(rows) ? rows.filter(Boolean) : [];
  const {
    rows: initialRows,
    supplementedCoreTypes
  } = buildOverallRecommendationDisplayRows(sourceRows, limit);
  const selectedRowSet = new Set(initialRows);

  return {
    rows: [
      ...initialRows,
      ...sourceRows.filter((row) => !selectedRowSet.has(row))
    ],
    supplementedCoreTypes
  };
}
