export function isDeepEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function setParam(params, key, value, defaultValue = undefined) {
  if (value === undefined || value === null) {
    return;
  }

  if (defaultValue !== undefined && isDeepEqual(value, defaultValue)) {
    return;
  }

  params.set(key, String(value));
}

export function setJsonParam(params, key, value, defaultValue = undefined) {
  if (value === undefined || value === null) {
    return;
  }

  if (defaultValue !== undefined && isDeepEqual(value, defaultValue)) {
    return;
  }

  params.set(key, JSON.stringify(value));
}

export function parseJsonParam(params, key) {
  if (!params.has(key)) {
    return { present: false, value: null };
  }

  const rawValue = params.get(key);
  if (!rawValue) {
    return { present: true, value: null };
  }

  try {
    return {
      present: true,
      value: JSON.parse(rawValue)
    };
  } catch {
    return { present: true, value: null };
  }
}

export function normalizeBooleanParam(value, defaultValue = false) {
  if (value === null || value === undefined || value === '') {
    return defaultValue;
  }

  const normalizedValue = String(value).trim().toLowerCase();
  if (['false', '0', 'no', 'off'].includes(normalizedValue)) {
    return false;
  }
  if (['true', '1', 'yes', 'on'].includes(normalizedValue)) {
    return true;
  }

  return defaultValue;
}

export function normalizeArrayOfStrings(values = [], { lowercase = false } = {}) {
  return [...new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => String(value ?? '').trim())
      .filter(Boolean)
      .map((value) => lowercase ? value.toLowerCase() : value)
  )];
}

export function normalizeIntegerArray(values = []) {
  return [...new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value >= 0)
  )];
}
