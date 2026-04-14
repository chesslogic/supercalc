import { getZoneRelationContext } from '../../enemies/data.js';
import { getZoneIndicesByNames, getUniqueZoneNameList, normalizeZoneNameKey } from './damage-results.js';

export function buildRecommendationRelationContext(enemy, selectedZoneIndex) {
  const selectedZone = Number.isInteger(selectedZoneIndex)
    ? enemy?.zones?.[selectedZoneIndex] || null
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
    .filter((zoneIndex) => zoneIndex !== selectedZoneIndex);
  const relatedTargetZoneNames = relatedTargetZoneIndices
    .map((zoneIndex) => enemy?.zones?.[zoneIndex]?.zone_name || '')
    .filter(Boolean);

  return {
    selectedZone,
    selectedZoneIsPriorityTarget,
    allPriorityTargetZoneIndices,
    allPriorityTargetZoneNames,
    relatedRouteZoneNames,
    relatedTargetZoneIndices,
    relatedTargetZoneNames,
    relatedRouteGroupLabelText: selectedZoneRelationContext?.groupLabels?.join(' / ') || 'this anatomy group',
    shouldRenderRelatedRoutes: Boolean(
      selectedZone
      && selectedZoneRelationContext
      && allPriorityTargetZoneNames.length > 0
      && (relatedTargetZoneNames.length > 0 || relatedRouteZoneNames.length > 0)
    )
  };
}

export function getRelatedRouteSummaryText({
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

export function getRelatedRouteEmptyStateText({
  selectedZone,
  selectedZoneIsPriorityTarget = false
}) {
  if (selectedZoneIsPriorityTarget) {
    return `${selectedZone?.zone_name || 'The selected part'} is already a linked priority target, so the exact target rows above already cover the route endpoint.`;
  }

  return 'No recommendation rows are available for this target.';
}
