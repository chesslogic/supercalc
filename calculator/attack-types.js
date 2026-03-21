function getAttackTypeText(row) {
  return String(row?.['Atk Type'] ?? row?.Stage ?? '').trim().toLowerCase();
}

export function isExplosiveAttack(row) {
  const attackType = getAttackTypeText(row);
  return attackType.includes('explosion') || attackType === 'explosion';
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
