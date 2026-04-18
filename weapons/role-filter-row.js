import { getWeaponRoleId, getWeaponRoleLabel, WEAPON_ROLE_ORDER } from './weapon-taxonomy.js';
import { createFilterChip, createFilterChipRow } from '../filter-utils.js';

/**
 * Return the ordered list of role IDs present in the given weapons,
 * preserving the canonical display order from the taxonomy.
 */
export function getAvailableWeaponRoles(weapons) {
  const presentRoles = new Set(
    (Array.isArray(weapons) ? weapons : [])
      .map((weapon) => getWeaponRoleId(weapon))
      .filter(Boolean)
  );
  return WEAPON_ROLE_ORDER.filter((roleId) => presentRoles.has(roleId));
}

/**
 * Build a reusable role-filter chip row.
 *
 * Both the weapon-data table page and the recommendation controls can call
 * this with their own state and callbacks to get a consistent row of
 * role-based filter chips.
 */
export function createRoleFilterChipRow({
  weapons = [],
  activeRoles = [],
  onToggleRole = null,
  onRefresh = null,
  label = 'Role'
} = {}) {
  const availableRoles = getAvailableWeaponRoles(weapons);
  const normalizedActiveRoles = (Array.isArray(activeRoles) ? activeRoles : [])
    .map((r) => String(r ?? '').trim().toLowerCase())
    .filter(Boolean);

  const chips = availableRoles.map((roleId) => {
    const isActive = normalizedActiveRoles.includes(roleId);
    return createFilterChip({
      label: getWeaponRoleLabel(roleId),
      active: isActive,
      dataset: { role: roleId },
      onClick: () => {
        onToggleRole?.(roleId);
        onRefresh?.();
      }
    });
  });

  return createFilterChipRow({
    label,
    children: chips
  });
}
