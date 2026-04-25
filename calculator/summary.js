import { DEFAULT_BEAM_TICKS_PER_SECOND } from './attack-types.js';

const DISCRETE_CADENCE_TYPE = 'discrete';
const BEAM_CADENCE_TYPE = 'beam';

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

export function calculateShotsToKill(totalHealth, damagePerCycle) {
  const health = toFiniteNumber(totalHealth);
  const damage = toPositiveNumber(damagePerCycle);

  if (health === null || health < 0 || damage === null) {
    return null;
  }

  return Math.ceil(health / damage);
}

export function calculateTtkSeconds(shotsToKill, rpm) {
  const shots = toFiniteNumber(shotsToKill);
  const fireRate = toPositiveNumber(rpm);

  if (shots === null || shots < 0 || fireRate === null) {
    return null;
  }

  return Math.max(0, shots - 1) * 60 / fireRate;
}

function normalizeCadenceModel({ cadenceModel = null, rpm = null } = {}) {
  const normalizedRpm = toPositiveNumber(rpm ?? cadenceModel?.rpm);
  if (String(cadenceModel?.type || '').trim().toLowerCase() === BEAM_CADENCE_TYPE) {
    return {
      type: BEAM_CADENCE_TYPE,
      rpm: normalizedRpm,
      beamTicksPerSecond: toPositiveNumber(cadenceModel?.beamTicksPerSecond)
        ?? DEFAULT_BEAM_TICKS_PER_SECOND
    };
  }

  return {
    type: DISCRETE_CADENCE_TYPE,
    rpm: normalizedRpm,
    beamTicksPerSecond: null
  };
}

function calculateBeamTicksToKill(totalHealth, damagePerSecond, ticksPerSecond) {
  const health = toFiniteNumber(totalHealth);
  const damage = toPositiveNumber(damagePerSecond);
  const cadence = toPositiveNumber(ticksPerSecond);

  if (health === null || health < 0 || damage === null || cadence === null) {
    return null;
  }

  return Math.ceil(((health * cadence) / damage) - 1e-12);
}

function calculateBeamTtkSeconds(ticksToKill, ticksPerSecond) {
  const ticks = toFiniteNumber(ticksToKill);
  const cadence = toPositiveNumber(ticksPerSecond);

  if (ticks === null || ticks < 0 || cadence === null) {
    return null;
  }

  return ticks / cadence;
}

export function calculateCadencedShotsToKill(totalHealth, damagePerCycle, cadenceModel = null) {
  const normalizedCadence = normalizeCadenceModel({ cadenceModel });
  if (normalizedCadence.type === BEAM_CADENCE_TYPE) {
    return calculateBeamTicksToKill(
      totalHealth,
      damagePerCycle,
      normalizedCadence.beamTicksPerSecond
    );
  }

  return calculateShotsToKill(totalHealth, damagePerCycle);
}

export function calculateCadencedTtkSeconds(shotsToKill, cadenceModel = null) {
  const normalizedCadence = normalizeCadenceModel({ cadenceModel });
  if (normalizedCadence.type === BEAM_CADENCE_TYPE) {
    return calculateBeamTtkSeconds(shotsToKill, normalizedCadence.beamTicksPerSecond);
  }

  return calculateTtkSeconds(shotsToKill, normalizedCadence.rpm);
}

export function formatTtkSeconds(ttkSeconds) {
  const seconds = toFiniteNumber(ttkSeconds);
  if (seconds === null || seconds < 0) {
    return null;
  }
  return `${seconds.toFixed(2)}s`;
}

export function buildKillSummary({
  zoneHealth,
  zoneCon,
  enemyMainHealth,
  totalDamagePerCycle,
  totalDamageToMainPerCycle,
  rpm,
  zoneUsesConAsHealth = false,
  cadenceModel = null
}) {
  const normalizedZoneHealth = toFiniteNumber(zoneHealth);
  const normalizedZoneCon = toFiniteNumber(zoneCon) ?? 0;
  const normalizedEnemyMainHealth = toFiniteNumber(enemyMainHealth);
  const normalizedCadence = normalizeCadenceModel({ cadenceModel, rpm });

  const zoneShotsToKill = calculateCadencedShotsToKill(
    normalizedZoneHealth,
    totalDamagePerCycle,
    normalizedCadence
  );
  const zoneShotsToKillWithCon = normalizedZoneCon > 0
    ? calculateCadencedShotsToKill(
        (normalizedZoneHealth ?? 0) + normalizedZoneCon,
        totalDamagePerCycle,
        normalizedCadence
      )
    : null;
  const mainShotsToKill = calculateCadencedShotsToKill(
    normalizedEnemyMainHealth,
    totalDamageToMainPerCycle,
    normalizedCadence
  );
  const zoneEffectiveShotsToKill = zoneUsesConAsHealth && zoneShotsToKillWithCon !== null
    ? zoneShotsToKillWithCon
    : zoneShotsToKill;

  return {
    hasRpm: normalizedCadence.rpm !== null || normalizedCadence.type === BEAM_CADENCE_TYPE,
    rpm: normalizedCadence.rpm,
    cadenceModel: normalizedCadence,
    usesBeamCadence: normalizedCadence.type === BEAM_CADENCE_TYPE,
    beamTicksPerSecond: normalizedCadence.beamTicksPerSecond,
    zoneShotsToKill,
    zoneTtkSeconds: calculateCadencedTtkSeconds(zoneShotsToKill, normalizedCadence),
    zoneShotsToKillWithCon,
    zoneTtkSecondsWithCon: calculateCadencedTtkSeconds(zoneShotsToKillWithCon, normalizedCadence),
    zoneEffectiveShotsToKill,
    zoneEffectiveTtkSeconds: calculateCadencedTtkSeconds(zoneEffectiveShotsToKill, normalizedCadence),
    mainShotsToKill,
    mainTtkSeconds: calculateCadencedTtkSeconds(mainShotsToKill, normalizedCadence),
  };
}
