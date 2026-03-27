const MAX_DAMAGE_REDUCTION = 0.75;
const DISTANCE_SCALE_FACTOR = 1250;
const CALIBER_EXPONENT = 2;
const VELOCITY_EXPONENT = 0.025;

export const BALLISTIC_FALLOFF_EXCLUDED_WEAPONS = new Set([
  'GP-20 Ultimatum (read the note)',
  'EAT-411 Leveller'
]);

function toFiniteNumber(value) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'string' && value.trim() === '') {
    return null;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function toPositiveNumber(value) {
  const numeric = toFiniteNumber(value);
  return numeric !== null && numeric > 0 ? numeric : null;
}

export function isBallisticFalloffModeledWeapon(weaponName) {
  return !BALLISTIC_FALLOFF_EXCLUDED_WEAPONS.has(String(weaponName || '').trim());
}

export function calculateBallisticFalloffScale({
  caliber,
  mass,
  velocity,
  drag
} = {}) {
  const normalizedCaliber = toPositiveNumber(caliber);
  const normalizedMass = toPositiveNumber(mass);
  const normalizedVelocity = toPositiveNumber(velocity);
  const normalizedDrag = toFiniteNumber(drag);

  if (
    normalizedCaliber === null
    || normalizedMass === null
    || normalizedVelocity === null
    || normalizedDrag === null
  ) {
    return null;
  }

  if (normalizedDrag <= 0) {
    return Number.POSITIVE_INFINITY;
  }

  return (
    DISTANCE_SCALE_FACTOR
    * normalizedMass
    / (
      normalizedDrag
      * Math.pow(normalizedCaliber, CALIBER_EXPONENT)
      * Math.pow(normalizedVelocity, VELOCITY_EXPONENT)
    )
  );
}

export function calculateBallisticDamageReduction(attributes = {}, distanceMeters = 0) {
  const normalizedDistance = toFiniteNumber(distanceMeters);
  if (normalizedDistance === null) {
    return null;
  }

  if (normalizedDistance <= 0) {
    return 0;
  }

  const scale = calculateBallisticFalloffScale(attributes);
  if (scale === null) {
    return null;
  }

  if (!Number.isFinite(scale)) {
    return 0;
  }

  return MAX_DAMAGE_REDUCTION * (1 - Math.exp(-normalizedDistance / scale));
}

export function calculateBallisticDamageReductionPercent(attributes = {}, distanceMeters = 0) {
  const reduction = calculateBallisticDamageReduction(attributes, distanceMeters);
  return reduction === null ? null : reduction * 100;
}

export function calculateBallisticDamageMultiplier(attributes = {}, distanceMeters = 0) {
  const reduction = calculateBallisticDamageReduction(attributes, distanceMeters);
  return reduction === null ? null : 1 - reduction;
}

export function calculateBallisticDamageAtDistance(baseDamage, attributes = {}, distanceMeters = 0) {
  const normalizedBaseDamage = toFiniteNumber(baseDamage);
  const multiplier = calculateBallisticDamageMultiplier(attributes, distanceMeters);

  if (normalizedBaseDamage === null || multiplier === null) {
    return null;
  }

  return normalizedBaseDamage * multiplier;
}

export function calculateMaxDistanceForDamageMultiplier(attributes = {}, targetMultiplier = 1) {
  const normalizedTargetMultiplier = toFiniteNumber(targetMultiplier);
  if (normalizedTargetMultiplier === null || normalizedTargetMultiplier < 0 || normalizedTargetMultiplier > 1) {
    return null;
  }

  if (normalizedTargetMultiplier === 1) {
    return 0;
  }

  const scale = calculateBallisticFalloffScale(attributes);
  if (scale === null) {
    return null;
  }

  if (!Number.isFinite(scale)) {
    return Number.POSITIVE_INFINITY;
  }

  const minimumMultiplier = 1 - MAX_DAMAGE_REDUCTION;
  if (normalizedTargetMultiplier <= minimumMultiplier) {
    return Number.POSITIVE_INFINITY;
  }

  const normalizedReduction = 1 - normalizedTargetMultiplier;
  return -scale * Math.log(1 - normalizedReduction / MAX_DAMAGE_REDUCTION);
}

export function calculateMaxDistanceForDamageFloor(baseDamage, attributes = {}, damageFloor = 0) {
  const normalizedBaseDamage = toPositiveNumber(baseDamage);
  const normalizedDamageFloor = toFiniteNumber(damageFloor);

  if (normalizedBaseDamage === null || normalizedDamageFloor === null || normalizedDamageFloor < 0) {
    return null;
  }

  return calculateMaxDistanceForDamageMultiplier(
    attributes,
    normalizedDamageFloor / normalizedBaseDamage
  );
}
