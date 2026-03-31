const MAX_DAMAGE_REDUCTION = 0.75;
const DISTANCE_SCALE_FACTOR = 1250;
const CALIBER_EXPONENT = 2;
const VELOCITY_EXPONENT = 0.025;
const LOCAL_FALLOFF_CSV_URL = './weapons/falloff.csv';
export const PRACTICAL_ZERO_DAMAGE_REDUCTION = 0.7423;

export const MIN_BALLISTIC_DAMAGE_MULTIPLIER = 1 - MAX_DAMAGE_REDUCTION;
export const PRACTICAL_ZERO_DAMAGE_MULTIPLIER = 1 - PRACTICAL_ZERO_DAMAGE_REDUCTION;

export const BALLISTIC_FALLOFF_EXCLUDED_WEAPONS = new Set([
  'GP-20 Ultimatum (read the note)',
  'EAT-411 Leveller'
]);

export const ballisticFalloffState = {
  loaded: false,
  profiles: []
};

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

function normalizeLookupToken(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function lookupTokensMatch(left, right) {
  if (!left || !right) {
    return false;
  }

  return left === right || left.startsWith(right) || right.startsWith(left);
}

function parseCsvLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];

    if (char === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      values.push(current);
      current = '';
      continue;
    }

    current += char;
  }

  values.push(current);
  return values;
}

function extractWeaponCodeAndName(weaponLabel) {
  const trimmed = String(weaponLabel || '').trim();
  if (!trimmed) {
    return {
      code: '',
      name: ''
    };
  }

  const [code, ...nameParts] = trimmed.split(/\s+/u);
  return {
    code: code || '',
    name: nameParts.join(' ').trim()
  };
}

function getIncludedProfiles() {
  return ballisticFalloffState.profiles.filter((profile) => !profile.excluded);
}

export function resetBallisticFalloffProfiles() {
  ballisticFalloffState.loaded = false;
  ballisticFalloffState.profiles = [];
}

export function isBallisticFalloffModeledWeapon(weaponName) {
  return !BALLISTIC_FALLOFF_EXCLUDED_WEAPONS.has(String(weaponName || '').trim());
}

export function ingestBallisticFalloffCsvText(text = '') {
  resetBallisticFalloffProfiles();

  const lines = String(text || '').trim().split(/\r?\n/u).filter(Boolean);
  if (lines.length === 0) {
    ballisticFalloffState.loaded = true;
    return [];
  }

  const headers = parseCsvLine(lines[0]);
  ballisticFalloffState.profiles = lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    const row = Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']));
    const weaponLabel = String(row.Weapon || '').trim();
    const { code, name } = extractWeaponCodeAndName(weaponLabel);

    return {
      weaponLabel,
      code,
      name,
      codeKey: normalizeLookupToken(code),
      nameKey: normalizeLookupToken(name),
      excluded: BALLISTIC_FALLOFF_EXCLUDED_WEAPONS.has(weaponLabel),
      attributes: {
        caliber: row.Caliber,
        mass: row.Mass,
        velocity: row.Velocity,
        drag: row.Drag
      }
    };
  }).filter((profile) => profile.weaponLabel);

  ballisticFalloffState.loaded = true;
  return ballisticFalloffState.profiles;
}

export async function loadBallisticFalloffCsv(sourceUrl = LOCAL_FALLOFF_CSV_URL) {
  const response = await fetch(sourceUrl, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const text = await response.text();
  return ingestBallisticFalloffCsvText(text);
}

export function resolveBallisticFalloffProfileForWeapon(weapon = {}) {
  if (!ballisticFalloffState.loaded) {
    return {
      status: 'unloaded',
      profile: null,
      matches: []
    };
  }

  const codeKey = normalizeLookupToken(weapon?.code);
  const nameKey = normalizeLookupToken(weapon?.name);
  const profiles = ballisticFalloffState.profiles;
  const includedProfiles = getIncludedProfiles();

  if (!codeKey && !nameKey) {
    return {
      status: 'missing',
      profile: null,
      matches: []
    };
  }

  const excludedMatches = profiles.filter((profile) => {
    const matchesCode = codeKey && profile.codeKey === codeKey;
    const matchesName = nameKey && lookupTokensMatch(profile.nameKey, nameKey);
    return profile.excluded && (matchesCode || matchesName);
  });

  if (excludedMatches.length > 0) {
    return {
      status: 'excluded',
      profile: null,
      matches: excludedMatches
    };
  }

  const exactMatches = includedProfiles.filter((profile) =>
    codeKey
    && nameKey
    && profile.codeKey === codeKey
    && lookupTokensMatch(profile.nameKey, nameKey)
  );

  if (exactMatches.length === 1) {
    return {
      status: 'available',
      profile: exactMatches[0],
      matches: exactMatches
    };
  }

  if (exactMatches.length > 1) {
    return {
      status: 'ambiguous',
      profile: null,
      matches: exactMatches
    };
  }

  const codeMatches = codeKey
    ? includedProfiles.filter((profile) => profile.codeKey === codeKey)
    : [];

  if (codeMatches.length === 1) {
    return {
      status: 'available',
      profile: codeMatches[0],
      matches: codeMatches
    };
  }

  const nameMatches = nameKey
    ? includedProfiles.filter((profile) => lookupTokensMatch(profile.nameKey, nameKey))
    : [];

  if (nameMatches.length === 1) {
    return {
      status: 'available',
      profile: nameMatches[0],
      matches: nameMatches
    };
  }

  const combinedMatches = includedProfiles.filter((profile) => {
    const matchesCode = codeKey && profile.codeKey === codeKey;
    const matchesName = nameKey && lookupTokensMatch(profile.nameKey, nameKey);
    return matchesCode || matchesName;
  });

  if (combinedMatches.length > 1) {
    return {
      status: 'ambiguous',
      profile: null,
      matches: combinedMatches
    };
  }

  return {
    status: 'missing',
    profile: null,
    matches: combinedMatches
  };
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

  if (normalizedTargetMultiplier <= MIN_BALLISTIC_DAMAGE_MULTIPLIER) {
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

export function calculatePracticalMaxProjectileDistance(attributes = {}) {
  return calculateMaxDistanceForDamageMultiplier(
    attributes,
    PRACTICAL_ZERO_DAMAGE_MULTIPLIER
  );
}
