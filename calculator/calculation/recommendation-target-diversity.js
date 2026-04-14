import { normalizeZoneNameKey } from './damage-results.js';
import { RECOMMENDATION_CORE_TYPE_MINIMUM } from './recommendation-constants.js';
import { getRecommendationCoreType } from './recommendation-filter-state.js';

function getRecommendationDisplayTargetKey(row) {
  const zoneName = row?.bestZone?.zone_name || row?.bestZoneName || '';
  const normalizedZoneName = normalizeZoneNameKey(zoneName);
  return normalizedZoneName || null;
}

function incrementRecommendationSelectionCount(counts, key) {
  if (!key) {
    return;
  }

  counts.set(key, (counts.get(key) || 0) + 1);
}

function decrementRecommendationSelectionCount(counts, key) {
  if (!key) {
    return;
  }

  const nextCount = (counts.get(key) || 0) - 1;
  if (nextCount > 0) {
    counts.set(key, nextCount);
    return;
  }

  counts.delete(key);
}

export function buildRecommendationCoreTypeMinimums(sourceRows, availableCoreTypes) {
  const minimumCoreCounts = new Map();
  availableCoreTypes.forEach((type) => {
    minimumCoreCounts.set(
      type,
      Math.min(
        RECOMMENDATION_CORE_TYPE_MINIMUM,
        sourceRows.filter((row) => getRecommendationCoreType(row) === type).length
      )
    );
  });
  return minimumCoreCounts;
}

export function applyOverallRecommendationTargetDiversity({
  sourceRows,
  selectedRows,
  selectedRowSet,
  minimumCoreCounts
}) {
  if (selectedRows.length === 0) {
    return;
  }

  const sourceRowIndices = new Map(sourceRows.map((row, index) => [row, index]));
  const selectedTargetCounts = new Map();
  const selectedCoreTypeCounts = new Map();

  selectedRows.forEach((row) => {
    incrementRecommendationSelectionCount(selectedTargetCounts, getRecommendationDisplayTargetKey(row));
    incrementRecommendationSelectionCount(selectedCoreTypeCounts, getRecommendationCoreType(row));
  });

  sourceRows.forEach((candidateRow) => {
    if (selectedRowSet.has(candidateRow)) {
      return;
    }

    const candidateTargetKey = getRecommendationDisplayTargetKey(candidateRow);
    if (!candidateTargetKey || selectedTargetCounts.has(candidateTargetKey)) {
      return;
    }

    const candidateType = getRecommendationCoreType(candidateRow);
    let replacement = null;

    selectedRows.forEach((selectedRow, selectedIndex) => {
      const selectedTargetKey = getRecommendationDisplayTargetKey(selectedRow);
      if (!selectedTargetKey || (selectedTargetCounts.get(selectedTargetKey) || 0) < 2) {
        return;
      }

      const selectedType = getRecommendationCoreType(selectedRow);
      if (selectedType !== candidateType) {
        const selectedTypeCount = selectedType ? (selectedCoreTypeCounts.get(selectedType) || 0) : 0;
        const minimumTypeCount = selectedType ? (minimumCoreCounts.get(selectedType) || 0) : 0;
        if (selectedTypeCount <= minimumTypeCount) {
          return;
        }
      }

      const sourceIndex = sourceRowIndices.get(selectedRow) ?? -1;
      if (
        !replacement
        || sourceIndex > replacement.sourceIndex
        || (sourceIndex === replacement.sourceIndex && selectedIndex > replacement.selectedIndex)
      ) {
        replacement = {
          row: selectedRow,
          selectedIndex,
          sourceIndex,
          targetKey: selectedTargetKey,
          type: selectedType
        };
      }
    });

    if (!replacement) {
      return;
    }

    selectedRows[replacement.selectedIndex] = candidateRow;
    selectedRowSet.delete(replacement.row);
    selectedRowSet.add(candidateRow);
    decrementRecommendationSelectionCount(selectedTargetCounts, replacement.targetKey);
    incrementRecommendationSelectionCount(selectedTargetCounts, candidateTargetKey);

    if (replacement.type !== candidateType) {
      decrementRecommendationSelectionCount(selectedCoreTypeCounts, replacement.type);
      incrementRecommendationSelectionCount(selectedCoreTypeCounts, candidateType);
    }
  });
}
