import {
  getAvailableWeaponSubIds,
  getWeaponSubLabel,
  normalizeWeaponSubId
} from './weapon-taxonomy.js';
import { createFilterChip, createFilterChipRow } from '../filter-utils.js';

export function getAvailableWeaponSubs(weapons, {
  visibility = 'shared'
} = {}) {
  return getAvailableWeaponSubIds(weapons, { visibility });
}

export function createSubtypeFilterChipRow({
  weapons = [],
  activeSubs = [],
  onToggleSub = null,
  onRefresh = null,
  label = 'Sub',
  visibility = 'shared'
} = {}) {
  const availableSubs = getAvailableWeaponSubs(weapons, { visibility });
  const normalizedActiveSubs = (Array.isArray(activeSubs) ? activeSubs : [])
    .map((sub) => normalizeWeaponSubId(sub))
    .filter(Boolean);

  const chips = availableSubs.map((subId) => {
    const isActive = normalizedActiveSubs.includes(subId);
    return createFilterChip({
      label: getWeaponSubLabel(subId),
      active: isActive,
      dataset: { val: subId },
      onClick: () => {
        onToggleSub?.(subId);
        onRefresh?.();
      }
    });
  });

  return createFilterChipRow({
    label,
    children: chips
  });
}
