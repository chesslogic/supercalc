import { isExplosiveAttack } from '../attack-types.js';
import { formatDamageValue, roundDamagePacket } from '../damage-rounding.js';
import { formatEngagementRangeMeters } from '../engagement-range.js';
import {
  calculateBallisticDamageAtDistance,
  calculateBallisticDamageReductionPercent,
  resolveBallisticFalloffProfileForWeapon
} from '../../weapons/falloff.js';

function toFiniteNumber(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function formatPercentValue(value) {
  const numeric = toFiniteNumber(value);
  if (numeric === null) {
    return '';
  }

  return numeric.toFixed(1).replace(/\.0$/, '');
}

function isWeaponDamageHeader(header) {
  const normalizedHeader = String(header || '').trim().toLowerCase();
  return normalizedHeader === 'dmg' || normalizedHeader === 'damage' || normalizedHeader === 'dur' || normalizedHeader === 'duration';
}

function getBallisticFalloffUnavailableReason(status) {
  if (status === 'unloaded') {
    return 'ballistic falloff data is not loaded yet';
  }

  if (status === 'excluded') {
    return 'this weapon uses a special-case ballistic curve that is not modeled yet';
  }

  if (status === 'ambiguous') {
    return 'multiple possible falloff profiles are available';
  }

  return 'no ballistic falloff profile is loaded for this weapon';
}

function buildWeaponRangeSlotDisplay({
  slot,
  header,
  row,
  weapon,
  rangeMeters
}) {
  if (!row || !weapon) {
    return null;
  }

  const baseValue = toFiniteNumber(row?.[header]);
  if (baseValue === null) {
    return null;
  }

  const baseText = formatDamageValue(baseValue);
  const headerLabel = String(header || '').trim().toUpperCase() || 'VALUE';
  const normalizedRangeMeters = Math.max(0, Math.round(Number(rangeMeters) || 0));
  const rangeText = formatEngagementRangeMeters(normalizedRangeMeters);

  if (normalizedRangeMeters <= 0) {
    return {
      slot,
      displayText: baseText,
      title: `Weapon ${slot} ${headerLabel} at ${rangeText}: ${baseText} (base value)`,
      isAdjusted: false
    };
  }

  if (isExplosiveAttack(row)) {
    return {
      slot,
      displayText: baseText,
      title: `Weapon ${slot} ${headerLabel} at ${rangeText}: ${baseText} (explosive row, no ballistic falloff)`,
      isAdjusted: false
    };
  }

  const falloffResolution = resolveBallisticFalloffProfileForWeapon(weapon);
  if (falloffResolution?.status !== 'available') {
    return {
      slot,
      displayText: baseText,
      title: `Weapon ${slot} ${headerLabel} at ${rangeText}: ${baseText} (${getBallisticFalloffUnavailableReason(falloffResolution?.status)})`,
      isAdjusted: false
    };
  }

  const profileAttributes = falloffResolution.profile?.attributes || null;
  const adjustedValue = calculateBallisticDamageAtDistance(baseValue, profileAttributes, normalizedRangeMeters);
  const reductionPercent = calculateBallisticDamageReductionPercent(profileAttributes, normalizedRangeMeters);

  if (adjustedValue === null || reductionPercent === null) {
    return {
      slot,
      displayText: baseText,
      title: `Weapon ${slot} ${headerLabel} at ${rangeText}: ${baseText} (${getBallisticFalloffUnavailableReason('missing')})`,
      isAdjusted: false
    };
  }

  const adjustedText = formatDamageValue(roundDamagePacket(adjustedValue));
  const reductionText = formatPercentValue(reductionPercent);

  return {
    slot,
    displayText: adjustedText,
    title: `Weapon ${slot} ${headerLabel} at ${rangeText}: ${adjustedText} (base ${baseText}, ${reductionText}% reduction)`,
    isAdjusted: true
  };
}

export function getWeaponRangeAdjustedCellDisplay(header, entry, {
  compareMode = false,
  weaponA = null,
  weaponB = null,
  rangeA = 0,
  rangeB = 0
} = {}) {
  if (!isWeaponDamageHeader(header)) {
    return null;
  }

  const slotEntries = compareMode
    ? [
      { slot: 'A', row: entry?.rowA, weapon: weaponA, rangeMeters: rangeA },
      { slot: 'B', row: entry?.rowB, weapon: weaponB, rangeMeters: rangeB }
    ]
    : [
      {
        slot: 'A',
        row: entry?.rowA || entry?.displayRow,
        weapon: weaponA,
        rangeMeters: rangeA
      }
    ];
  const hasNonZeroRange = slotEntries.some(({ row, rangeMeters }) =>
    Boolean(row) && Math.max(0, Math.round(Number(rangeMeters) || 0)) > 0
  );

  if (!hasNonZeroRange) {
    return null;
  }

  const slotDisplays = slotEntries
    .map((slotEntry) => buildWeaponRangeSlotDisplay({
      slot: slotEntry.slot,
      header,
      row: slotEntry.row,
      weapon: slotEntry.weapon,
      rangeMeters: slotEntry.rangeMeters
    }))
    .filter(Boolean);
  if (slotDisplays.length === 0) {
    return null;
  }

  const uniqueDisplayValues = new Set(slotDisplays.map((slotDisplay) => slotDisplay.displayText));
  const isSplit = compareMode && slotDisplays.length > 1 && uniqueDisplayValues.size > 1;

  return {
    text: isSplit
      ? slotDisplays.map((slotDisplay) => `${slotDisplay.slot} ${slotDisplay.displayText}`).join(' • ')
      : slotDisplays[0].displayText,
    title: slotDisplays.map((slotDisplay) => slotDisplay.title).join('\n'),
    isAdjusted: slotDisplays.some((slotDisplay) => slotDisplay.isAdjusted),
    isSplit
  };
}
