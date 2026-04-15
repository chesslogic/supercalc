import { getEngagementRangeMeters, getWeaponForSlot } from '../data.js';
import {
  buildRelatedTargetRecommendationRows,
  buildSelectedTargetRecommendationRows,
  buildWeaponRecommendationRows
} from '../recommendations.js';

function getEngagementRangeMetersForRecommendationWeapon(weapon, highlightRangeFloorMeters) {
  const weaponA = getWeaponForSlot('A');
  const weaponB = getWeaponForSlot('B');
  if (weaponA && weaponA.name === weapon?.name) {
    return getEngagementRangeMeters('A');
  }
  if (weaponB && weaponB.name === weapon?.name) {
    return getEngagementRangeMeters('B');
  }
  return highlightRangeFloorMeters;
}

export function buildRecommendationRowSets({
  enemy,
  weapons,
  overallRecommendationWeapons,
  highlightRangeFloorMeters,
  selectedZoneIndex,
  relatedTargetZoneIndices,
  hidePeripheralMainRoutes = false
}) {
  const getRangeForWeapon = (weapon) => getEngagementRangeMetersForRecommendationWeapon(
    weapon,
    highlightRangeFloorMeters
  );

  return {
    recommendationRows: buildWeaponRecommendationRows({
      enemy,
      weapons: overallRecommendationWeapons,
      rangeFloorMeters: highlightRangeFloorMeters,
      getEngagementRangeMetersForWeapon: getRangeForWeapon,
      hidePeripheralMainRoutes
    }),
    selectedTargetRows: buildSelectedTargetRecommendationRows({
      enemy,
      weapons,
      rangeFloorMeters: highlightRangeFloorMeters,
      selectedZoneIndex,
      getEngagementRangeMetersForWeapon: getRangeForWeapon,
      hidePeripheralMainRoutes
    }),
    relatedTargetRows: buildRelatedTargetRecommendationRows({
      enemy,
      weapons,
      rangeFloorMeters: highlightRangeFloorMeters,
      relatedZoneIndices: relatedTargetZoneIndices,
      getEngagementRangeMetersForWeapon: getRangeForWeapon,
      hidePeripheralMainRoutes
    })
  };
}
