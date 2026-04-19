import {
  getEngagementRangeMeters,
  getSelectedAttacks,
  getWeaponForSlot
} from './data.js';
import { isExplosiveAttack } from './attack-types.js';
import { formatEngagementRangeMeters } from './engagement-range.js';
import {
  PRACTICAL_MAX_RANGE_TOOLTIP_SUFFIX,
  formatEffectiveDistanceText
} from './effective-distance.js';
import { getWeaponRowMeaningfulDamage } from './weapon-dropdown.js';
import {
  calculatePracticalMaxProjectileDistance,
  resolveBallisticFalloffProfileForWeapon
} from '../weapons/falloff.js';

function normalizeSlot(slot) {
  return slot === 'B' ? 'B' : 'A';
}

function getCandidateProjectileRows(slot, weapon) {
  const selectedAttacks = getSelectedAttacks(slot);
  const candidateRows = selectedAttacks.length > 0
    ? selectedAttacks
    : (Array.isArray(weapon?.rows) ? weapon.rows : []);

  return candidateRows.filter((row) => (
    !isExplosiveAttack(row)
    && getWeaponRowMeaningfulDamage(row) > 0
  ));
}

export function getEngagementRangeWarningInfo(slot = 'A') {
  const normalizedSlot = normalizeSlot(slot);
  const weapon = getWeaponForSlot(normalizedSlot);
  if (!weapon) {
    return null;
  }

  if (getCandidateProjectileRows(normalizedSlot, weapon).length === 0) {
    return null;
  }

  const falloffResolution = resolveBallisticFalloffProfileForWeapon(weapon);
  if (falloffResolution?.status !== 'available' || !falloffResolution.profile) {
    return null;
  }

  const practicalMaxMeters = calculatePracticalMaxProjectileDistance(falloffResolution.profile.attributes);
  if (!Number.isFinite(practicalMaxMeters) || practicalMaxMeters <= 0) {
    return null;
  }

  const currentRangeMeters = getEngagementRangeMeters(normalizedSlot);
  if (currentRangeMeters < practicalMaxMeters) {
    return null;
  }

  const practicalMaxText = formatEffectiveDistanceText(practicalMaxMeters);
  return {
    text: `Warning: practical max ${practicalMaxText}`,
    title: `Current range ${formatEngagementRangeMeters(currentRangeMeters)} is at or beyond this weapon's modeled practical max projectile distance (${practicalMaxText}).\n${PRACTICAL_MAX_RANGE_TOOLTIP_SUFFIX}`,
    currentRangeMeters,
    practicalMaxMeters
  };
}

export function syncEngagementRangeWarning(slot = 'A') {
  const suffix = normalizeSlot(slot).toLowerCase();
  const warningElement = document.getElementById(`calculator-range-warning-${suffix}`);
  if (!warningElement) {
    return;
  }

  const warningInfo = getEngagementRangeWarningInfo(slot);
  warningElement.textContent = warningInfo?.text || '';
  warningElement.title = warningInfo?.title || '';
  warningElement.classList.toggle('hidden', !warningInfo);
}

export function syncAllEngagementRangeWarnings() {
  syncEngagementRangeWarning('A');
  syncEngagementRangeWarning('B');
}
