import {
  calculatorState,
  getEngagementRangeMeters
} from '../data.js';
import {
  getRecommendationHighlightRangeFloorMeters,
  getRecommendationRangeContextText,
  getRecommendationRangeSummaryText,
  RECOMMENDATION_RANGE_FLOOR_TITLE
} from '../engagement-range.js';
import { state as weaponsState } from '../../weapons/data.js';
import {
  RELATED_ROUTE_RECOMMENDATION_DISPLAY_LIMIT,
  RECOMMENDATION_DISPLAY_LIMIT,
  TARGETED_RECOMMENDATION_DISPLAY_LIMIT
} from './recommendation-constants.js';
import {
  getFilteredRecommendationWeapons,
  getRecommendationWeaponFilterSummaryText,
  hasActiveRecommendationWeaponFilters
} from './recommendation-filter-state.js';
import { createRelatedTargetChipRow, renderRecommendationWeaponFilterControls } from './recommendation-controls.js';
import { buildOverallRecommendationDisplaySequence } from './recommendation-display.js';
import { buildOverallRecommendationSectionState } from './recommendation-overall-summary.js';
import { buildRecommendationRowSets } from './recommendation-row-sets.js';
import {
  buildRecommendationRelationContext,
  getRelatedRouteEmptyStateText,
  getRelatedRouteSummaryText
} from './recommendation-route-context.js';
import { renderRecommendationSubsection } from './recommendation-table.js';

export function renderRecommendationPanel(container, enemy, {
  onRefresh = null
} = {}) {
  const panel = document.createElement('section');
  panel.className = 'calc-compare-panel calc-recommend-panel';

  const heading = document.createElement('div');
  heading.className = 'calc-compare-heading';

  const title = document.createElement('div');
  title.className = 'calc-compare-title';
  title.textContent = `${enemy.name} weapon recommendations`;
  heading.appendChild(title);
  panel.appendChild(heading);

  const body = document.createElement('div');
  body.className = 'calc-compare-body calc-recommend-body';
  const rangeA = getEngagementRangeMeters('A');
  const rangeB = getEngagementRangeMeters('B');
  const highlightRangeFloorMeters = getRecommendationHighlightRangeFloorMeters(calculatorState.mode, rangeA, rangeB);
  const recommendationRangeSummary = getRecommendationRangeSummaryText(calculatorState.mode, rangeA, rangeB);
  const {
    selectedZone,
    selectedZoneIsPriorityTarget,
    allPriorityTargetZoneIndices,
    allPriorityTargetZoneNames,
    relatedRouteZoneNames,
    relatedTargetZoneIndices,
    relatedRouteGroupLabelText,
    shouldRenderRelatedRoutes
  } = buildRecommendationRelationContext(enemy, calculatorState.selectedZoneIndex);

  const controlsNote = document.createElement('div');
  controlsNote.className = 'status calc-recommend-note';
  controlsNote.textContent = getRecommendationRangeContextText(calculatorState.mode, rangeA, rangeB);
  controlsNote.title = RECOMMENDATION_RANGE_FLOOR_TITLE;
  body.appendChild(controlsNote);

  if (!Array.isArray(weaponsState.groups) || weaponsState.groups.length === 0) {
    const emptyState = document.createElement('div');
    emptyState.className = 'muted';
    emptyState.textContent = 'Weapon data is still loading.';
    body.appendChild(emptyState);
    panel.appendChild(body);
    container.appendChild(panel);
    return;
  }

  const overallRecommendationWeapons = getFilteredRecommendationWeapons(weaponsState.groups);
  const {
    recommendationRows,
    selectedTargetRows,
    relatedTargetRows
  } = buildRecommendationRowSets({
    enemy,
    weapons: weaponsState.groups,
    overallRecommendationWeapons,
    highlightRangeFloorMeters,
    selectedZoneIndex: calculatorState.selectedZoneIndex,
    relatedTargetZoneIndices
  });
  const flaggedRows = recommendationRows.filter((row) => (
    row.qualifiesForMargin
    || row.hasCriticalRecommendation
    || row.hasFastTtk
    || row.penetratesAll
  ));
  const {
    rows: displayRows,
    supplementedCoreTypes
  } = recommendationRows.length > 0
    ? buildOverallRecommendationDisplaySequence(
        flaggedRows.length > 0 ? flaggedRows : recommendationRows,
        RECOMMENDATION_DISPLAY_LIMIT
      )
    : { rows: [], supplementedCoreTypes: [] };
  const initialOverallRows = displayRows.slice(0, RECOMMENDATION_DISPLAY_LIMIT);
  const overallRecommendationFilterSummaryText = getRecommendationWeaponFilterSummaryText();
  const overallRecommendationFilterControls = renderRecommendationWeaponFilterControls(weaponsState.groups, {
    onRefresh
  });
  const {
    usingFallbackRows,
    summaryText: overallRecommendationSummaryText,
    summaryTitle: overallRecommendationSummaryTitle,
    emptyStateText: overallRecommendationEmptyStateText
  } = buildOverallRecommendationSectionState({
    recommendationRows,
    flaggedRows,
    supplementedCoreTypes,
    initialOverallRows,
    recommendationRangeSummary,
    overallRecommendationFilterSummaryText,
    hasActiveFilters: hasActiveRecommendationWeaponFilters()
  });

  if (selectedZone) {
    const hasRelatedTargetChips = relatedTargetZoneIndices.length > 0;
    const relatedTargetChips = hasRelatedTargetChips
      ? createRelatedTargetChipRow({
          enemy,
          allPriorityTargetZoneIndices,
          selectedZoneIndex: calculatorState.selectedZoneIndex,
          onRefresh
        })
      : null;
    renderRecommendationSubsection({
      body,
      titleText: `${selectedZone.zone_name} targeted recommendations`,
      summaryText: selectedTargetRows.length > 0
        ? `Best attack rows for removing or reaching the selected target using the current engagement settings (${recommendationRangeSummary}).`
        : `No dedicated target rows are available for ${selectedZone.zone_name} using the current engagement settings (${recommendationRangeSummary}).`,
      controls: relatedTargetChips,
      rows: selectedTargetRows,
      displayStep: TARGETED_RECOMMENDATION_DISPLAY_LIMIT
    });
  }

  if (shouldRenderRelatedRoutes) {
    renderRecommendationSubsection({
      body,
      titleText: `${selectedZone.zone_name} related routes`,
      summaryText: getRelatedRouteSummaryText({
        selectedZone,
        selectedZoneIsPriorityTarget,
        relatedRouteGroupLabelText,
        allPriorityTargetZoneNames,
        relatedRouteZoneNames,
        hasRelatedTargetRows: relatedTargetRows.length > 0,
        recommendationRangeSummary
      }),
      rows: relatedTargetRows,
      displayStep: RELATED_ROUTE_RECOMMENDATION_DISPLAY_LIMIT,
      emptyStateText: getRelatedRouteEmptyStateText({
        selectedZone,
        selectedZoneIsPriorityTarget
      })
    });
  }

  renderRecommendationSubsection({
    body,
    titleText: 'Overall recommendations',
    summaryText: overallRecommendationSummaryText,
    summaryTitle: overallRecommendationSummaryTitle,
    controls: overallRecommendationFilterControls,
    rows: displayRows,
    displayStep: RECOMMENDATION_DISPLAY_LIMIT,
    usingFallbackRows,
    emptyStateText: overallRecommendationEmptyStateText
  });
  panel.appendChild(body);
  container.appendChild(panel);
}
