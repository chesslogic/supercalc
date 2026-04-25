export function toFiniteNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

export function isMainHealthReference(value) {
  return typeof value === 'string' && value.trim().toLowerCase() === 'main';
}

export function normalizeText(value) {
  return String(value ?? '').trim().toLowerCase();
}
