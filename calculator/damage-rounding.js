const DAMAGE_FLOOR_EPSILON = 1e-9;

function toFiniteNumber(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

export function roundDamagePacket(value) {
  const numeric = toFiniteNumber(value);
  if (numeric === null) {
    return null;
  }

  if (numeric <= 0) {
    return 0;
  }

  return Math.floor(numeric + DAMAGE_FLOOR_EPSILON);
}

export function formatDamageValue(value) {
  const numeric = toFiniteNumber(value);
  if (numeric === null) {
    return '';
  }

  if (Math.abs(numeric) < DAMAGE_FLOOR_EPSILON) {
    return '0';
  }

  if (Number.isInteger(numeric)) {
    return String(numeric);
  }

  return numeric.toFixed(2).replace(/\.?0+$/, '');
}
