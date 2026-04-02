export const RECOMMENDATION_RANGE_FLOOR_TITLE = 'Minimum modeled distance that range-sensitive highlight flags must survive. In compare mode, the recommendation panel uses the higher of Weapon A and Weapon B engagement ranges as a shared floor. Unknown-range rows stay listed, but those highlights do not count until the breakpoint range is known.';

export function formatEngagementRangeMeters(rangeMeters) {
  const normalizedRange = Math.max(0, Math.round(Number(rangeMeters) || 0));
  return normalizedRange === 0 ? 'Any / 0m' : `${normalizedRange}m`;
}

export function getRecommendationHighlightRangeFloorMeters(mode, rangeA, rangeB) {
  return mode === 'compare'
    ? Math.max(rangeA, rangeB)
    : rangeA;
}

export function getEngagementRangeSummaryText(mode, rangeA, rangeB) {
  return mode === 'compare'
    ? `A ${formatEngagementRangeMeters(rangeA)} • B ${formatEngagementRangeMeters(rangeB)}`
    : formatEngagementRangeMeters(rangeA);
}

export function getRecommendationRangeSummaryText(mode, rangeA, rangeB) {
  const summaryText = getEngagementRangeSummaryText(mode, rangeA, rangeB);
  const sharedFloor = getRecommendationHighlightRangeFloorMeters(mode, rangeA, rangeB);

  return mode === 'compare'
    ? `${summaryText} (shared floor ${formatEngagementRangeMeters(sharedFloor)})`
    : summaryText;
}

export function getRecommendationRangeContextText(mode, rangeA, rangeB) {
  const summaryText = getEngagementRangeSummaryText(mode, rangeA, rangeB);
  const sharedFloor = getRecommendationHighlightRangeFloorMeters(mode, rangeA, rangeB);

  return mode === 'compare'
    ? `Engagement ranges: ${summaryText}. Recommendation highlights use ${formatEngagementRangeMeters(sharedFloor)} as the shared compare floor. Unknown-range profiles stay listed, but they do not pass those flags.`
    : `Engagement range: ${summaryText}. Recommendation highlights use the current range as the floor. Unknown-range profiles stay listed, but they do not pass those flags.`;
}
