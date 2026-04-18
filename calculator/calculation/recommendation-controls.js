import {
  calculatorState,
  clearRecommendationWeaponFilters,
  DEFAULT_RECOMMENDATION_MIN_SHOTS,
  DEFAULT_RECOMMENDATION_MAX_SHOTS,
  MAX_RECOMMENDATION_SHOTS,
  setRecommendationMinShots,
  setRecommendationMaxShots,
  setRecommendationWeaponFilterMode,
  setSelectedZoneIndex,
  toggleRecommendationNoMainViaLimbs,
  toggleRecommendationWeaponFilterGroup,
  toggleRecommendationWeaponFilterSub,
  toggleRecommendationWeaponFilterType
} from '../data.js';
import { getWeaponRecommendationFeatureGroupId } from '../../weapons/weapon-taxonomy.js';
import { RECOMMENDATION_FEATURE_GROUPS } from './recommendation-constants.js';
import {
  getAvailableRecommendationWeaponTypes,
  getRecommendationFilterChipLabel,
  hasActiveRecommendationWeaponFilters,
  normalizeRecommendationWeaponSub
} from './recommendation-filter-state.js';
import { createFilterChip, createFilterChipRow } from '../../filter-utils.js';

const RELATED_TARGET_CHIP_MAX = 8;

function createRecommendationFilterChip({
  onClick,
  onRefresh = null,
  ...options
}) {
  return createFilterChip({
    ...options,
    onClick: () => {
      onClick?.();
      onRefresh?.();
    }
  });
}

function createRecommendationShotSlider({
  label,
  value,
  min = DEFAULT_RECOMMENDATION_MIN_SHOTS,
  max = MAX_RECOMMENDATION_SHOTS,
  title = '',
  onInput,
  onRefresh = null
}) {
  const slider = document.createElement('label');
  slider.className = 'calc-recommend-shot-slider';

  const sliderLabel = document.createElement('span');
  sliderLabel.className = 'calc-recommend-shot-slider-label';
  sliderLabel.textContent = `${label}: ${value}`;
  slider.appendChild(sliderLabel);

  const input = document.createElement('input');
  input.type = 'range';
  input.className = 'calc-recommend-shot-slider-input';
  input.min = String(min);
  input.max = String(max);
  input.step = '1';
  input.value = String(value);
  input.title = title;
  input.addEventListener('input', () => {
    onInput?.(Number(input.value));
    onRefresh?.();
  });
  slider.appendChild(input);

  return slider;
}

function createRecommendationShotRangeRow({
  onRefresh = null
} = {}) {
  const row = createFilterChipRow({
    label: 'Shots',
    children: [
      createRecommendationShotSlider({
        label: 'Min',
        value: calculatorState.recommendationMinShots,
        title: 'Filter displayed recommendation rows by minimum shots to kill.',
        onInput: (nextValue) => {
          if (nextValue > calculatorState.recommendationMaxShots) {
            setRecommendationMaxShots(nextValue);
          }
          setRecommendationMinShots(nextValue);
        },
        onRefresh
      }),
      createRecommendationShotSlider({
        label: 'Max',
        value: calculatorState.recommendationMaxShots,
        title: 'Filter displayed recommendation rows by maximum shots to kill.',
        onInput: (nextValue) => {
          if (nextValue < calculatorState.recommendationMinShots) {
            setRecommendationMinShots(nextValue);
          }
          setRecommendationMaxShots(nextValue);
        },
        onRefresh
      })
    ]
  });
  row.classList.add('calc-recommend-shot-range');
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
    const chip = createFilterChip({
      label: zone.zone_name,
      active: isActive,
      title: isActive ? `Currently targeting: ${zone.zone_name}` : `Switch to ${zone.zone_name}`,
      onClick: isActive
        ? null
        : () => {
            setSelectedZoneIndex(zoneIndex);
            onRefresh?.();
          }
    });
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

  const modeRow = createFilterChipRow({
    label: 'Weapon filters',
    children: [
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

  wrapper.appendChild(createFilterChipRow({
    label: 'Preference',
    children: [
      createRecommendationFilterChip({
        label: 'No main via limbs',
        active: calculatorState.recommendationNoMainViaLimbs,
        title: 'Hide recommendations that only kill Main through a peripheral non-vital part, for example massive ordnance to a non-vital component.',
        onClick: () => toggleRecommendationNoMainViaLimbs(),
        onRefresh
      })
    ]
  }));
  wrapper.appendChild(createRecommendationShotRangeRow({ onRefresh }));

  const typeChips = getAvailableRecommendationWeaponTypes(weapons).map((type) => createRecommendationFilterChip({
    label: getRecommendationFilterChipLabel(type, 'type'),
    active: calculatorState.recommendationWeaponFilterTypes.includes(type),
    onClick: () => toggleRecommendationWeaponFilterType(type),
    onRefresh
  }));
  if (typeChips.length > 0) {
    wrapper.appendChild(createFilterChipRow({
      label: 'Type',
      children: typeChips
    }));
  }

  const normalizedWeapons = Array.isArray(weapons) ? weapons : [];
  const availableGroups = RECOMMENDATION_FEATURE_GROUPS.filter((group) =>
    normalizedWeapons.some((weapon) => getWeaponRecommendationFeatureGroupId(weapon) === group.id)
  );
  const ungroupedSubs = [...new Set(
    normalizedWeapons
      .filter((weapon) => !getWeaponRecommendationFeatureGroupId(weapon))
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
    const divider = groupChips.length > 0 && ungroupedChips.length > 0
      ? Object.assign(document.createElement('span'), { className: 'chip-divider' })
      : null;
    const subtypeRow = createFilterChipRow({
      label: 'Feature',
      children: [...groupChips, divider, ...ungroupedChips]
    });
    wrapper.appendChild(subtypeRow);
  }

  return wrapper;
}
