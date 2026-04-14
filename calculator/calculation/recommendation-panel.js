import {
  calculatorState,
  getEngagementRangeMeters,
  getWeaponForSlot
} from '../data.js';
import {
  getRecommendationHighlightRangeFloorMeters,
  getRecommendationRangeContextText,
  getRecommendationRangeSummaryText,
  RECOMMENDATION_RANGE_FLOOR_TITLE
} from '../engagement-range.js';
import {
  buildRelatedTargetRecommendationRows,
  buildSelectedTargetRecommendationRows,
  buildWeaponRecommendationRows
} from '../recommendations.js';
import { getZoneRelationContext } from '../../enemies/data.js';
import { state as weaponsState } from '../../weapons/data.js';
import {
  RELATED_ROUTE_RECOMMENDATION_DISPLAY_LIMIT,
  RECOMMENDATION_DISPLAY_LIMIT,
  TARGETED_RECOMMENDATION_DISPLAY_LIMIT
} from './recommendation-constants.js';
import { getZoneIndicesByNames, getUniqueZoneNameList, normalizeZoneNameKey } from './damage-results.js';
import {
  getFilteredRecommendationWeapons,
  getRecommendationSummaryTitle,
  getRecommendationWeaponFilterSummaryText,
  hasActiveRecommendationWeaponFilters
} from './recommendation-filter-state.js';
import { createRelatedTargetChipRow, renderRecommendationWeaponFilterControls } from './recommendation-controls.js';
import { buildOverallRecommendationDisplaySequence } from './recommendation-display.js';
import { renderRecommendationSubsection } from './recommendation-table.js';

function getRelatedRouteSummaryText({
  selectedZone,
  selectedZoneIsPriorityTarget = false,
  relatedRouteGroupLabelText = 'this anatomy group',
  allPriorityTargetZoneNames = [],
  relatedRouteZoneNames = [],
  hasRelatedTargetRows = false,
  recommendationRangeSummary = ''
}) {
  const priorityTargetText = allPriorityTargetZoneNames.join(', ') || selectedZone?.zone_name || 'this linked target';
  const relatedRoutePartText = selectedZoneIsPriorityTarget && relatedRouteZoneNames.length > 0
    ? ` Other linked route parts: ${relatedRouteZoneNames.join(', ')}.`
    : '';

  if (hasRelatedTargetRows) {
    return `Linked priority targets in ${relatedRouteGroupLabelText}: ${priorityTargetText}.${relatedRoutePartText} Hover the enemy table to see linked and mirrored parts.`;
  }

  if (selectedZoneIsPriorityTarget) {
    return `Linked priority targets in ${relatedRouteGroupLabelText}: ${priorityTargetText}.${relatedRoutePartText} ${selectedZone?.zone_name || 'The selected part'} is itself a linked priority target.`;
  }

  return `Linked priority targets in ${relatedRouteGroupLabelText}: ${priorityTargetText}. No related routes are currently available with the current engagement settings (${recommendationRangeSummary}).`;
}

function getRelatedRouteEmptyStateText({
  selectedZone,
  selectedZoneIsPriorityTarget = false
}) {
  if (selectedZoneIsPriorityTarget) {
    return `${selectedZone?.zone_name || 'The selected part'} is already a linked priority target, so the exact target rows above already cover the route endpoint.`;
  }

  return 'No recommendation rows are available for this target.';
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
  const selectedZone = Number.isInteger(calculatorState.selectedZoneIndex)
    ? enemy?.zones?.[calculatorState.selectedZoneIndex] || null
    : null;
  const selectedZoneRelationContext = selectedZone
    ? getZoneRelationContext(enemy, selectedZone)
    : null;
  const selectedZoneIsPriorityTarget = Boolean(
    selectedZone
    && selectedZoneRelationContext?.priorityTargetZoneNames
      ?.map((zoneName) => normalizeZoneNameKey(zoneName))
      ?.includes(normalizeZoneNameKey(selectedZone.zone_name))
  );
  const allPriorityTargetZoneIndices = selectedZoneRelationContext
    ? getZoneIndicesByNames(enemy, selectedZoneRelationContext.priorityTargetZoneNames)
    : [];
  const allPriorityTargetZoneNames = allPriorityTargetZoneIndices
    .map((zoneIndex) => enemy?.zones?.[zoneIndex]?.zone_name || '')
    .filter(Boolean);
  const relatedRouteZoneNames = selectedZoneRelationContext
    ? getUniqueZoneNameList(selectedZoneRelationContext.sameZoneNames || [], {
        excludeZoneNames: [selectedZone?.zone_name || '']
      })
    : [];
  const relatedTargetZoneIndices = allPriorityTargetZoneIndices
    .filter((zoneIndex) => zoneIndex !== calculatorState.selectedZoneIndex);
  const relatedTargetZoneNames = relatedTargetZoneIndices
    .map((zoneIndex) => enemy?.zones?.[zoneIndex]?.zone_name || '')
    .filter(Boolean);
  const relatedRouteGroupLabelText = selectedZoneRelationContext?.groupLabels?.join(' / ') || 'this anatomy group';
  const shouldRenderRelatedRoutes = Boolean(
    selectedZone
    && selectedZoneRelationContext
    && allPriorityTargetZoneNames.length > 0
    && (relatedTargetZoneNames.length > 0 || relatedRouteZoneNames.length > 0)
  );

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

  const getEngagementRangeMetersForRecommendationWeapon = (weapon) => {
    const weaponA = getWeaponForSlot('A');
    const weaponB = getWeaponForSlot('B');
    if (weaponA && weaponA.name === weapon?.name) {
      return getEngagementRangeMeters('A');
    }
    if (weaponB && weaponB.name === weapon?.name) {
      return getEngagementRangeMeters('B');
    }
    return highlightRangeFloorMeters;
  };

  const overallRecommendationWeapons = getFilteredRecommendationWeapons(weaponsState.groups);
  const recommendationRows = buildWeaponRecommendationRows({
    enemy,
    weapons: overallRecommendationWeapons,
    rangeFloorMeters: highlightRangeFloorMeters,
    getEngagementRangeMetersForWeapon: getEngagementRangeMetersForRecommendationWeapon
  });
  const selectedTargetRows = buildSelectedTargetRecommendationRows({
    enemy,
    weapons: weaponsState.groups,
    rangeFloorMeters: highlightRangeFloorMeters,
    selectedZoneIndex: calculatorState.selectedZoneIndex,
    getEngagementRangeMetersForWeapon: getEngagementRangeMetersForRecommendationWeapon
  });
  const relatedTargetRows = buildRelatedTargetRecommendationRows({
    enemy,
    weapons: weaponsState.groups,
    rangeFloorMeters: highlightRangeFloorMeters,
    relatedZoneIndices: relatedTargetZoneIndices,
    getEngagementRangeMetersForWeapon: getEngagementRangeMetersForRecommendationWeapon
  });
  const flaggedRows = recommendationRows.filter((row) => (
    row.qualifiesForMargin
    || row.hasCriticalRecommendation
    || row.hasFastTtk
    || row.penetratesAll
  ));
  const hasFilteredOverallRows = recommendationRows.length > 0;
  const usingFallbackRows = hasFilteredOverallRows && flaggedRows.length === 0;
  const {
    rows: displayRows,
    supplementedCoreTypes
  } = hasFilteredOverallRows
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
  const overallRecommendationSummaryText = hasFilteredOverallRows
    ? (
        flaggedRows.length > 0
          ? `Showing ${initialOverallRows.length} highlighted recommendations using the current engagement settings (${recommendationRangeSummary}).${supplementedCoreTypes.length > 0 ? ' Core weapon-type coverage is backfilled where available.' : ''}${overallRecommendationFilterSummaryText}`
          : `No rows hit the current highlight checks using the current engagement settings (${recommendationRangeSummary}). Showing the best fallback rows instead.${supplementedCoreTypes.length > 0 ? ' Core weapon-type coverage is backfilled where available.' : ''}${overallRecommendationFilterSummaryText}`
      )
    : hasActiveRecommendationWeaponFilters()
      ? `No overall recommendation rows match the current weapon filters using the current engagement settings (${recommendationRangeSummary}).${overallRecommendationFilterSummaryText}`
      : `No overall recommendation rows are available using the current engagement settings (${recommendationRangeSummary}).`;
  const overallRecommendationSummaryTitle = hasFilteredOverallRows
    ? getRecommendationSummaryTitle(!usingFallbackRows)
    : '';
  const overallRecommendationEmptyStateText = hasActiveRecommendationWeaponFilters()
    ? 'No recommendation rows match the current weapon filters.'
    : 'No recommendation rows are available right now.';

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
