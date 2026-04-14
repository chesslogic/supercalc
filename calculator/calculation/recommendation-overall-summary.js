import { getRecommendationSummaryTitle } from './recommendation-filter-state.js';

export function buildOverallRecommendationSectionState({
  recommendationRows,
  flaggedRows,
  supplementedCoreTypes,
  initialOverallRows,
  recommendationRangeSummary,
  overallRecommendationFilterSummaryText,
  hasActiveFilters
}) {
  const hasFilteredOverallRows = recommendationRows.length > 0;
  const usingFallbackRows = hasFilteredOverallRows && flaggedRows.length === 0;

  const summaryText = hasFilteredOverallRows
    ? (
        flaggedRows.length > 0
          ? `Showing ${initialOverallRows.length} highlighted recommendations using the current engagement settings (${recommendationRangeSummary}).${supplementedCoreTypes.length > 0 ? ' Core weapon-type coverage is backfilled where available.' : ''}${overallRecommendationFilterSummaryText}`
          : `No rows hit the current highlight checks using the current engagement settings (${recommendationRangeSummary}). Showing the best fallback rows instead.${supplementedCoreTypes.length > 0 ? ' Core weapon-type coverage is backfilled where available.' : ''}${overallRecommendationFilterSummaryText}`
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
