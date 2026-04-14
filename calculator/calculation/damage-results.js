import {
  calculatorState,
  getAttackHitCounts,
  getEngagementRangeMeters,
  getSelectedAttacks,
  getSelectedExplosiveZoneIndices,
  getSelectedZone,
  getWeaponForSlot
} from '../data.js';
import { getAttackRowKey } from '../compare-utils.js';
import { splitAttacksByApplication } from '../attack-types.js';
import { summarizeEnemyTargetScenario } from '../zone-damage.js';

function isValidZoneIndex(zones, zoneIndex) {
  return Number.isInteger(zoneIndex) && zoneIndex >= 0 && zoneIndex < zones.length;
}

export function normalizeZoneNameKey(value) {
  return String(value ?? '').trim().toLowerCase();
}

export function getEmptyCalculationMessage(slot) {
  const weapon = getWeaponForSlot(slot);
  const enemy = calculatorState.selectedEnemy;
  const zone = getSelectedZone();
  const selectedAttacks = getSelectedAttacks(slot);
  const { directAttacks } = splitAttacksByApplication(selectedAttacks);

  if (!weapon) {
    return calculatorState.mode === 'compare'
      ? `Select weapon ${slot}`
      : 'Select a weapon to see calculations';
  }

  if (!enemy) {
    return 'Select an enemy to see calculations';
  }

  if (selectedAttacks.length === 0) {
    return calculatorState.mode === 'compare'
      ? `Select one or more attack rows for weapon ${slot}`
      : 'Select weapon attack(s) to see calculations';
  }

  if (directAttacks.length > 0 && !zone) {
    return 'Select an enemy zone to see calculations';
  }

  return 'Select weapon attack(s) to see calculations';
}

export function getZoneIndicesByNames(enemy, zoneNames = []) {
  const normalizedZoneNames = new Set(
    (Array.isArray(zoneNames) ? zoneNames : [])
      .map((zoneName) => normalizeZoneNameKey(zoneName))
      .filter(Boolean)
  );
  if (normalizedZoneNames.size === 0) {
    return [];
  }

  return (enemy?.zones || [])
    .map((zone, zoneIndex) => (
      normalizedZoneNames.has(normalizeZoneNameKey(zone?.zone_name))
        ? zoneIndex
        : null
    ))
    .filter((zoneIndex) => zoneIndex !== null);
}

export function getUniqueZoneNameList(zoneNames = [], {
  excludeZoneNames = []
} = {}) {
  const excludedZoneNames = new Set(
    (Array.isArray(excludeZoneNames) ? excludeZoneNames : [])
      .map((zoneName) => normalizeZoneNameKey(zoneName))
      .filter(Boolean)
  );

  return [...new Set(
    (Array.isArray(zoneNames) ? zoneNames : [])
      .map((zoneName) => String(zoneName ?? '').trim())
      .filter((zoneName) => zoneName && !excludedZoneNames.has(normalizeZoneNameKey(zoneName)))
  )];
}

function resolveFocusZoneIndex({
  enemy,
  selectedAttacks = [],
  projectileZoneIndex,
  explosiveZoneIndices = []
}) {
  const zones = enemy?.zones || [];
  const normalizedProjectileZoneIndex = isValidZoneIndex(zones, projectileZoneIndex)
    ? projectileZoneIndex
    : null;
  const normalizedExplosiveZoneIndices = [...new Set(
    (explosiveZoneIndices || []).filter((zoneIndex) => isValidZoneIndex(zones, zoneIndex))
  )];
  const { directAttacks, explosiveAttacks } = splitAttacksByApplication(selectedAttacks);

  if (directAttacks.length > 0 && normalizedProjectileZoneIndex !== null) {
    return normalizedProjectileZoneIndex;
  }

  if (explosiveAttacks.length > 0 && normalizedExplosiveZoneIndices.length > 0) {
    return normalizedExplosiveZoneIndices[normalizedExplosiveZoneIndices.length - 1];
  }

  return normalizedProjectileZoneIndex;
}

export function calculateDamage(slot = 'A') {
  const weapon = getWeaponForSlot(slot);
  const enemy = calculatorState.selectedEnemy;
  const engagementRangeMeters = getEngagementRangeMeters(slot);

  if (!weapon || !enemy || !enemy.zones) {
    return null;
  }

  const selectedAttacks = getSelectedAttacks(slot);
  if (selectedAttacks.length === 0) {
    return null;
  }

  const hitCounts = getAttackHitCounts(slot, selectedAttacks);
  const explosiveZoneIndices = getSelectedExplosiveZoneIndices();
  const focusZoneIndex = resolveFocusZoneIndex({
    enemy,
    selectedAttacks,
    projectileZoneIndex: calculatorState.selectedZoneIndex,
    explosiveZoneIndices
  });
  const zone = Number.isInteger(focusZoneIndex)
    ? enemy.zones[focusZoneIndex] || null
    : getSelectedZone();
  const scenario = summarizeEnemyTargetScenario({
    enemy,
    weapon,
    selectedAttacks,
    hitCounts,
    rpm: weapon?.rpm,
    projectileZoneIndex: calculatorState.selectedZoneIndex,
    explosiveZoneIndices,
    distanceMeters: engagementRangeMeters
  });
  const focusZoneSummary = Number.isInteger(focusZoneIndex)
    ? scenario?.zoneSummaries?.[focusZoneIndex] || null
    : null;
  const { directAttacks, explosiveAttacks } = splitAttacksByApplication(selectedAttacks);

  return {
    slot,
    weapon,
    enemy,
    zone,
    focusZoneIndex,
    selectedAttacks,
    attackKeys: selectedAttacks.map((attack) => getAttackRowKey(attack)),
    hitCounts,
    engagementRangeMeters,
    projectileTargetZone: scenario?.projectileTargetZone || null,
    explosiveTargetZones: scenario?.explosiveTargetZones || [],
    hasProjectileAttacks: directAttacks.length > 0,
    hasExplosiveAttacks: explosiveAttacks.length > 0,
    focusZoneSummary,
    totalDamagePerCycle: focusZoneSummary?.totalDamagePerCycle || 0,
    totalDamageToMainPerCycle: scenario?.totalDamageToMainPerCycle || 0,
    zoneHealth: focusZoneSummary?.zoneHealth || 0,
    zoneCon: focusZoneSummary?.zoneCon || 0,
    enemyMainHealth: scenario?.enemyMainHealth || 0,
    killSummary: focusZoneSummary?.killSummary || null,
    attackDetails: scenario?.attackDetails || [],
    ...scenario
  };
}
