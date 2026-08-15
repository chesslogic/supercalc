import { getRecommendationSummaryTitle } from './recommendation-filter-state.js';

export function buildOverallRecommendationSectionState({
  recommendationRows,
  flaggedRows,
  supplementedCoreTypes,
  initialOverallRows,
  selectedRowCount = 0,
  recommendationRangeSummary,
  overallRecommendationFilterSummaryText,
  hasActiveFilters
}) {
  const hasFilteredOverallRows = recommendationRows.length > 0;
  const usingFallbackRows = hasFilteredOverallRows && flaggedRows.length === 0;
  const initialRowCount = Array.isArray(initialOverallRows) ? initialOverallRows.length : 0;
  const highlightedVisibleCount = Math.min(
    Number.isFinite(selectedRowCount) ? selectedRowCount : 0,
    initialRowCount
  );
  const remainingRowCount = Math.max(0, recommendationRows.length - initialRowCount);
  const coreTypeNote = supplementedCoreTypes.length > 0
    ? ' Core weapon-type coverage is backfilled where available.'
    : '';
  const remainingRowNote = remainingRowCount > 0
    ? ` ${remainingRowCount} more ranked rows stay reachable with show more.`
    : '';

  const summaryText = hasFilteredOverallRows
    ? (
        flaggedRows.length > 0
          ? `Showing ${initialRowCount} recommendations led by ${highlightedVisibleCount} highlighted rows using the current engagement settings (${recommendationRangeSummary}).${coreTypeNote}${remainingRowNote}${overallRecommendationFilterSummaryText}`
          : `No rows hit the current highlight checks using the current engagement settings (${recommendationRangeSummary}). Showing the best fallback rows instead.${coreTypeNote}${remainingRowNote}${overallRecommendationFilterSummaryText}`
      )
    : hasActiveFilters
      ? `No overall recommendation rows match the current weapon filters using the current engagement settings (${recommendationRangeSummary}).${overallRecommendationFilterSummaryText}`
      : `No overall recommendation rows are available using the current engagement settings (${recommendationRangeSummary}).`;

  return {
    hasFilteredOverallRows,
    usingFallbackRows,
    summaryText,
    summaryTitle: hasFilteredOverallRows
      ? getRecommendationSummaryTitle(!usingFallbackRows)
      : '',
    emptyStateText: hasActiveFilters
      ? 'No recommendation rows match the current weapon filters.'
      : 'No recommendation rows are available right now.'
  };
}
