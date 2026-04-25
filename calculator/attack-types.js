function getAttackTypeText(row) {
  return String(row?.['Atk Type'] ?? row?.Stage ?? '').trim().toLowerCase();
}

export const DEFAULT_BEAM_TICKS_PER_SECOND = 67;

export function isExplosiveAttack(row) {
  const attackType = getAttackTypeText(row);
  return attackType.includes('explosion') || attackType === 'explosion';
}

export function isBeamAttack(row) {
  return getAttackTypeText(row).includes('beam');
}

export function resolveAttackCadenceModel(selectedAttacks = []) {
  const normalizedAttacks = Array.isArray(selectedAttacks)
    ? selectedAttacks.filter(Boolean)
    : [];

  if (normalizedAttacks.length > 0 && normalizedAttacks.every(isBeamAttack)) {
    return {
      type: 'beam',
      beamTicksPerSecond: DEFAULT_BEAM_TICKS_PER_SECOND
    };
  }

  return {
    type: 'discrete',
    beamTicksPerSecond: null
  };
}

export function splitAttacksByApplication(selectedAttacks = [], hitCounts = []) {
  const directAttacks = [];
  const explosiveAttacks = [];

  selectedAttacks.forEach((attack, index) => {
    const entry = {
      attack,
      hitCount: hitCounts[index]
    };

    if (isExplosiveAttack(attack)) {
      explosiveAttacks.push(entry);
      return;
    }

    directAttacks.push(entry);
  });

  return {
    directAttacks,
    explosiveAttacks
  };
}
