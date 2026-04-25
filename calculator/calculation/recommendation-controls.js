import {
  calculatorState,
  clearRecommendationWeaponFilters,
  DEFAULT_RECOMMENDATION_MIN_SHOTS,
  DEFAULT_RECOMMENDATION_MAX_SHOTS,
  MAX_RECOMMENDATION_SHOTS,
  RECOMMENDATION_MAX_SHOTS_ANY,
  isRecommendationMaxShotsAny,
  setRecommendationMinShots,
  setRecommendationMaxShots,
  setRecommendationWeaponFilterMode,
  setSelectedZoneIndex,
  toggleRecommendationNoMainViaLimbs,
  toggleRecommendationWeaponFilterGroup,
  toggleRecommendationWeaponFilterRole,
  toggleRecommendationWeaponFilterSub,
  toggleRecommendationWeaponFilterType
} from '../data.js';
import { createRoleFilterChipRow } from '../../weapons/role-filter-row.js';
import { createSubtypeFilterChipRow } from '../../weapons/sub-filter-row.js';
import {
  getAvailableRecommendationWeaponFeatureGroups,
  getAvailableRecommendationWeaponTypes,
  getRecommendationFilterChipLabel,
  hasActiveRecommendationWeaponFilters
} from './recommendation-filter-state.js';
import { createFilterChip, createFilterChipRow } from '../../filter-utils.js';

const RELATED_TARGET_CHIP_MAX = 8;
const ANY_RECOMMENDATION_MAX_SHOT_SLIDER_VALUE = MAX_RECOMMENDATION_SHOTS + 1;

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
  formatValue = (currentValue) => currentValue,
  toInputValue = (currentValue) => currentValue,
  fromInputValue = (rawValue) => Number(rawValue),
  onInput,
  onRefresh = null
}) {
  const slider = document.createElement('label');
  slider.className = 'calc-recommend-shot-slider';

  const sliderLabel = document.createElement('span');
  sliderLabel.className = 'calc-recommend-shot-slider-label';
  sliderLabel.textContent = `${label}: ${formatValue(value)}`;
  slider.appendChild(sliderLabel);

  const input = document.createElement('input');
  input.type = 'range';
  input.className = 'calc-recommend-shot-slider-input';
  input.min = String(min);
  input.max = String(max);
  input.step = '1';
  input.value = String(toInputValue(value));
  input.title = title;
  input.addEventListener('input', () => {
    onInput?.(fromInputValue(input.value));
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
          if (!isRecommendationMaxShotsAny(calculatorState.recommendationMaxShots)
            && nextValue > calculatorState.recommendationMaxShots) {
            setRecommendationMaxShots(nextValue);
          }
          setRecommendationMinShots(nextValue);
        },
        onRefresh
      }),
      createRecommendationShotSlider({
        label: 'Max',
        value: calculatorState.recommendationMaxShots,
        max: ANY_RECOMMENDATION_MAX_SHOT_SLIDER_VALUE,
        title: 'Filter displayed recommendation rows by maximum shots to kill. Slide one step past 10 to keep any shot count.',
        formatValue: (currentValue) => (
          isRecommendationMaxShotsAny(currentValue)
            ? 'Any'
            : currentValue
        ),
        toInputValue: (currentValue) => (
          isRecommendationMaxShotsAny(currentValue)
            ? ANY_RECOMMENDATION_MAX_SHOT_SLIDER_VALUE
            : currentValue
        ),
        fromInputValue: (rawValue) => {
          const nextValue = Number(rawValue);
          return nextValue > MAX_RECOMMENDATION_SHOTS
            ? RECOMMENDATION_MAX_SHOTS_ANY
            : nextValue;
        },
        onInput: (nextValue) => {
          if (!isRecommendationMaxShotsAny(nextValue)
            && nextValue < calculatorState.recommendationMinShots) {
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
        label: 'Include',
        active: calculatorState.recommendationWeaponFilterMode === 'include',
        onClick: () => setRecommendationWeaponFilterMode('include'),
        onRefresh
      }),
      createRecommendationFilterChip({
        label: 'Exclude',
        active: calculatorState.recommendationWeaponFilterMode === 'exclude',
        onClick: () => setRecommendationWeaponFilterMode('exclude'),
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

  const subRow = createSubtypeFilterChipRow({
    weapons,
    activeSubs: calculatorState.recommendationWeaponFilterSubs,
    onToggleSub: (subId) => toggleRecommendationWeaponFilterSub(subId),
    onRefresh,
    visibility: 'shared'
  });
  const subChipCount = Array.from(subRow.children || [])
    .filter((child) => child.tagName === 'BUTTON')
    .length;
  if (subChipCount > 0) {
    wrapper.appendChild(subRow);
  }

  const featureChips = getAvailableRecommendationWeaponFeatureGroups(weapons)
    .map((group) => createRecommendationFilterChip({
      label: group.label,
      active: calculatorState.recommendationWeaponFilterGroups.includes(group.id),
      onClick: () => toggleRecommendationWeaponFilterGroup(group.id),
      onRefresh
    }));
  if (featureChips.length > 0) {
    wrapper.appendChild(createFilterChipRow({
      label: 'Feature',
      children: featureChips
    }));
  }

  const roleRow = createRoleFilterChipRow({
    weapons,
    activeRoles: calculatorState.recommendationWeaponFilterRoles,
    onToggleRole: (roleId) => toggleRecommendationWeaponFilterRole(roleId),
    onRefresh
  });
  const roleChipCount = Array.from(roleRow.children || [])
    .filter((child) => child.tagName === 'BUTTON')
    .length;
  if (roleChipCount > 0) {
    wrapper.appendChild(roleRow);
  }

  return wrapper;
}
