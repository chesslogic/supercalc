import {
  calculatorState,
  clearRecommendationWeaponFilters,
  setRecommendationWeaponFilterMode,
  setSelectedZoneIndex,
  toggleRecommendationWeaponFilterGroup,
  toggleRecommendationWeaponFilterSub,
  toggleRecommendationWeaponFilterType
} from '../data.js';
import { RECOMMENDATION_FEATURE_GROUPS } from './recommendation-constants.js';
import {
  getAvailableRecommendationWeaponTypes,
  getRecommendationFilterChipLabel,
  getRecommendationWeaponFeatureGroupId,
  hasActiveRecommendationWeaponFilters,
  normalizeRecommendationWeaponSub
} from './recommendation-filter-state.js';

const RELATED_TARGET_CHIP_MAX = 8;

function createRecommendationFilterChip({
  label,
  active = false,
  onClick,
  onRefresh = null
}) {
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = `chip${active ? ' active' : ''}`;
  chip.textContent = label;
  chip.addEventListener('click', () => {
    onClick?.();
    onRefresh?.();
  });
  return chip;
}

function createRecommendationFilterChipRow({
  label,
  chips = []
}) {
  const row = document.createElement('div');
  row.className = 'chiprow';

  const rowLabel = document.createElement('span');
  rowLabel.className = 'muted';
  rowLabel.textContent = label;
  row.appendChild(rowLabel);

  chips.forEach((chip) => row.appendChild(chip));
  return row;
}

export function createRelatedTargetChipRow({
  enemy,
  allPriorityTargetZoneIndices,
  selectedZoneIndex,
  onRefresh = null
}) {
  const row = document.createElement('div');
  row.className = 'chiprow calc-related-target-chips';

  const label = document.createElement('span');
  label.className = 'muted';
  label.textContent = 'Switch target:';
  row.appendChild(label);

  const limitedIndices = allPriorityTargetZoneIndices.slice(0, RELATED_TARGET_CHIP_MAX);
  limitedIndices.forEach((zoneIndex) => {
    const zone = enemy?.zones?.[zoneIndex];
    if (!zone) {
      return;
    }

    const isActive = zoneIndex === selectedZoneIndex;
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = `chip${isActive ? ' active' : ''}`;
    chip.textContent = zone.zone_name;
    chip.title = isActive ? `Currently targeting: ${zone.zone_name}` : `Switch to ${zone.zone_name}`;

    if (!isActive) {
      chip.addEventListener('click', () => {
        setSelectedZoneIndex(zoneIndex);
        onRefresh?.();
      });
    }

    row.appendChild(chip);
  });

  if (allPriorityTargetZoneIndices.length > RELATED_TARGET_CHIP_MAX) {
    const overflow = document.createElement('span');
    overflow.className = 'muted';
    overflow.textContent = `+${allPriorityTargetZoneIndices.length - RELATED_TARGET_CHIP_MAX} more`;
    row.appendChild(overflow);
  }

  return row;
}

export function renderRecommendationWeaponFilterControls(weapons = [], {
  onRefresh = null
} = {}) {
  const wrapper = document.createElement('div');
  wrapper.className = 'calc-recommend-filters';

  const modeRow = createRecommendationFilterChipRow({
    label: 'Weapon filters',
    chips: [
      createRecommendationFilterChip({
        label: 'Exclude',
        active: calculatorState.recommendationWeaponFilterMode === 'exclude',
        onClick: () => setRecommendationWeaponFilterMode('exclude'),
        onRefresh
      }),
      createRecommendationFilterChip({
        label: 'Include',
        active: calculatorState.recommendationWeaponFilterMode === 'include',
        onClick: () => setRecommendationWeaponFilterMode('include'),
        onRefresh
      }),
      ...(hasActiveRecommendationWeaponFilters()
        ? [createRecommendationFilterChip({
            label: 'Clear',
            active: false,
            onClick: () => clearRecommendationWeaponFilters(),
            onRefresh
          })]
        : [])
    ]
  });
  wrapper.appendChild(modeRow);

  const typeChips = getAvailableRecommendationWeaponTypes(weapons).map((type) => createRecommendationFilterChip({
    label: getRecommendationFilterChipLabel(type, 'type'),
    active: calculatorState.recommendationWeaponFilterTypes.includes(type),
    onClick: () => toggleRecommendationWeaponFilterType(type),
    onRefresh
  }));
  if (typeChips.length > 0) {
    wrapper.appendChild(createRecommendationFilterChipRow({
      label: 'Type',
      chips: typeChips
    }));
  }

  const normalizedWeapons = Array.isArray(weapons) ? weapons : [];
  const availableGroups = RECOMMENDATION_FEATURE_GROUPS.filter((group) =>
    normalizedWeapons.some((weapon) => getRecommendationWeaponFeatureGroupId(weapon) === group.id)
  );
  const ungroupedSubs = [...new Set(
    normalizedWeapons
      .filter((weapon) => !getRecommendationWeaponFeatureGroupId(weapon))
      .map((weapon) => normalizeRecommendationWeaponSub(weapon?.sub))
      .filter(Boolean)
  )]
    .sort((left, right) => left.localeCompare(right));

  const groupChips = availableGroups.map((group) => createRecommendationFilterChip({
    label: group.label,
    active: calculatorState.recommendationWeaponFilterGroups.includes(group.id),
    onClick: () => toggleRecommendationWeaponFilterGroup(group.id),
    onRefresh
  }));

  const ungroupedChips = ungroupedSubs.map((sub) => createRecommendationFilterChip({
    label: getRecommendationFilterChipLabel(sub, 'sub'),
    active: calculatorState.recommendationWeaponFilterSubs.includes(sub),
    onClick: () => toggleRecommendationWeaponFilterSub(sub),
    onRefresh
  }));

  if (groupChips.length > 0 || ungroupedChips.length > 0) {
    const subtypeRow = document.createElement('div');
    subtypeRow.className = 'chiprow';

    const rowLabel = document.createElement('span');
    rowLabel.className = 'muted';
    rowLabel.textContent = 'Feature';
    subtypeRow.appendChild(rowLabel);

    groupChips.forEach((chip) => subtypeRow.appendChild(chip));

    if (groupChips.length > 0 && ungroupedChips.length > 0) {
      const divider = document.createElement('span');
      divider.className = 'chip-divider';
      subtypeRow.appendChild(divider);
    }

    ungroupedChips.forEach((chip) => subtypeRow.appendChild(chip));
    wrapper.appendChild(subtypeRow);
  }

  return wrapper;
}
