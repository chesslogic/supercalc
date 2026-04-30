import {
  calculatorState,
  getEngagementRangeMeters,
  isRecommendationMaxShotsAny,
  STRICT_MARGIN_RECOMMENDATION_SORT_MODE,
  toggleRecommendationSortMode
} from '../data.js';
import {
  getRecommendationHighlightRangeFloorMeters,
  getRecommendationRangeContextText,
  getRecommendationRangeSummaryText,
  RECOMMENDATION_RANGE_FLOOR_TITLE
} from '../engagement-range.js';
import { state as weaponsState } from '../../weapons/data.js';
import {
  NEAR_MISS_RECOMMENDATION_DISPLAY_LIMIT,
  RECOMMENDATION_HEADER_DEFINITIONS,
  RELATED_ROUTE_RECOMMENDATION_DISPLAY_LIMIT,
  RECOMMENDATION_DISPLAY_LIMIT,
  TARGETED_RECOMMENDATION_DISPLAY_LIMIT
} from './recommendation-constants.js';
import { RECOMMENDATION_NEAR_MISS_MAX_SHOTS } from '../recommendations.js';
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

const NEAR_MISS_HEADER_DEFINITIONS = RECOMMENDATION_HEADER_DEFINITIONS.map((definition) => (
  definition.label === 'Margin'
    ? {
        label: 'Near miss',
        title: 'Last-shot near miss share. 99% means the final shot would overkill by 99% of one displayed shot, so this row nearly needed one fewer shot. Beam rows omit this because continuous-contact tick headroom is suppressed.'
      }
    : definition
));

function compareNearMissDisplayRows(left, right) {
  const leftPercent = Number.isFinite(left?.nearMissPercent) ? left.nearMissPercent : -1;
  const rightPercent = Number.isFinite(right?.nearMissPercent) ? right.nearMissPercent : -1;
  if (leftPercent !== rightPercent) {
    return rightPercent - leftPercent;
  }

  const leftShots = Number.isFinite(left?.shotsToKill) ? left.shotsToKill : Number.POSITIVE_INFINITY;
  const rightShots = Number.isFinite(right?.shotsToKill) ? right.shotsToKill : Number.POSITIVE_INFINITY;
  if (leftShots !== rightShots) {
    return leftShots - rightShots;
  }

  const leftTtk = Number.isFinite(left?.ttkSeconds) ? left.ttkSeconds : Number.POSITIVE_INFINITY;
  const rightTtk = Number.isFinite(right?.ttkSeconds) ? right.ttkSeconds : Number.POSITIVE_INFINITY;
  if (leftTtk !== rightTtk) {
    return leftTtk - rightTtk;
  }

  return String(left?.weapon?.name || '').localeCompare(String(right?.weapon?.name || ''));
}

function buildNearMissDisplayRows(rows = []) {
  return (Array.isArray(rows) ? rows : [])
    .filter((row) => !row?.suppressesMargin && row?.qualifiesForNearMiss && Number.isFinite(row?.nearMissPercent))
    .map((row) => ({
      ...row,
      nearMissDisplayPercent: row.nearMissPercent,
      showNearMissHighlight: true
    }))
    .sort(compareNearMissDisplayRows);
}

function filterRowsByShotRange(rows = [], minShots, maxShots) {
  if (!Array.isArray(rows)) {
    return [];
  }
  const hasUnlimitedMaxShots = isRecommendationMaxShotsAny(maxShots);
  return rows.filter((row) => {
    const shots = row?.shotsToKill;
    if (!Number.isFinite(shots)) {
      return true;
    }
    return shots >= minShots && (hasUnlimitedMaxShots || shots <= maxShots);
  });
}

function createRecommendationControlStack(controls = []) {
  const visibleControls = (Array.isArray(controls) ? controls : [controls]).filter(Boolean);
  if (visibleControls.length === 0) {
    return null;
  }
  if (visibleControls.length === 1) {
    return visibleControls[0];
  }

  const stack = document.createElement('div');
  stack.className = 'calc-recommend-control-stack';
  visibleControls.forEach((control) => stack.appendChild(control));
  return stack;
}

function getTargetedRecommendationSummaryText({
  selectedZone,
  selectedTargetRows,
  recommendationRangeSummary,
  sharedRecommendationFilterSummaryText,
  hasActiveWeaponFilters
}) {
  if (selectedTargetRows.length > 0) {
    return `Best attack rows for removing or reaching the selected target using the current engagement settings (${recommendationRangeSummary}).${sharedRecommendationFilterSummaryText}`;
  }

  if (hasActiveWeaponFilters) {
    return `No dedicated target rows match the current weapon filters for ${selectedZone.zone_name} using the current engagement settings (${recommendationRangeSummary}).${sharedRecommendationFilterSummaryText}`;
  }

  return `No dedicated target rows are available for ${selectedZone.zone_name} using the current engagement settings (${recommendationRangeSummary}).`;
}

function getTargetedRecommendationEmptyStateText(hasActiveWeaponFilters) {
  return hasActiveWeaponFilters
    ? 'No targeted recommendation rows match the current weapon filters.'
    : 'No recommendation rows are available for this target.';
}

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
  const recommendationSortMode = calculatorState.recommendationSortMode;
  const toggleMarginSort = () => {
    toggleRecommendationSortMode(STRICT_MARGIN_RECOMMENDATION_SORT_MODE);
    onRefresh?.();
  };
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

  const filteredRecommendationWeapons = getFilteredRecommendationWeapons(weaponsState.groups);
  const {
    recommendationRows: rawRecommendationRows,
    selectedTargetRows: rawSelectedTargetRows,
    relatedTargetRows: rawRelatedTargetRows
  } = buildRecommendationRowSets({
    enemy,
    weapons: filteredRecommendationWeapons,
    overallRecommendationWeapons: filteredRecommendationWeapons,
    highlightRangeFloorMeters,
    sortMode: recommendationSortMode,
    selectedZoneIndex: calculatorState.selectedZoneIndex,
    relatedTargetZoneIndices,
    hidePeripheralMainRoutes: calculatorState.recommendationNoMainViaLimbs
  });
  const minShots = calculatorState.recommendationMinShots;
  const maxShots = calculatorState.recommendationMaxShots;
  const recommendationRows = filterRowsByShotRange(rawRecommendationRows, minShots, maxShots);
  const selectedTargetRows = filterRowsByShotRange(rawSelectedTargetRows, minShots, maxShots);
  const relatedTargetRows = filterRowsByShotRange(rawRelatedTargetRows, minShots, maxShots);
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
  const hasActiveWeaponFilters = hasActiveRecommendationWeaponFilters();
  const sharedRecommendationFilterSummaryText = getRecommendationWeaponFilterSummaryText(weaponsState.groups);
  const sharedRecommendationFilterControls = renderRecommendationWeaponFilterControls(weaponsState.groups, {
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
    overallRecommendationFilterSummaryText: sharedRecommendationFilterSummaryText,
    hasActiveFilters: hasActiveWeaponFilters
  });
  const nearMissRows = buildNearMissDisplayRows(recommendationRows);

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
    const targetedRecommendationControls = createRecommendationControlStack([
      relatedTargetChips,
      sharedRecommendationFilterControls
    ]);
    renderRecommendationSubsection({
      body,
      titleText: `${selectedZone.zone_name} targeted recommendations`,
      summaryText: getTargetedRecommendationSummaryText({
        selectedZone,
        selectedTargetRows,
        recommendationRangeSummary,
        sharedRecommendationFilterSummaryText,
        hasActiveWeaponFilters
      }),
      controls: targetedRecommendationControls,
      rows: selectedTargetRows,
      displayStep: TARGETED_RECOMMENDATION_DISPLAY_LIMIT,
      sortMode: recommendationSortMode,
      onToggleMarginSort: toggleMarginSort,
      emptyStateText: getTargetedRecommendationEmptyStateText(hasActiveWeaponFilters)
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
      sortMode: recommendationSortMode,
      onToggleMarginSort: toggleMarginSort,
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
    controls: selectedZone ? null : sharedRecommendationFilterControls,
    rows: displayRows,
    displayStep: RECOMMENDATION_DISPLAY_LIMIT,
    sortMode: recommendationSortMode,
    onToggleMarginSort: toggleMarginSort,
    usingFallbackRows,
    emptyStateText: overallRecommendationEmptyStateText
  });
  if (nearMissRows.length > 0) {
    renderRecommendationSubsection({
      body,
      titleText: 'Near misses',
      summaryText: `Close misses where the final shot would overkill by more than the remaining health before that shot (${recommendationRangeSummary}). Limited to ${RECOMMENDATION_NEAR_MISS_MAX_SHOTS}-shot rows so long automatic strings stay out.`,
      rows: nearMissRows,
      displayStep: NEAR_MISS_RECOMMENDATION_DISPLAY_LIMIT,
      headerDefinitions: NEAR_MISS_HEADER_DEFINITIONS,
      showMarginBands: false
    });
  }
  panel.appendChild(body);
  container.appendChild(panel);
}
