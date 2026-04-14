import { calculatorState } from '../data.js';
import { splitAttacksByApplication } from '../attack-types.js';

export function getFocusedTargetingModes(selectedAttacksA, selectedAttacksB) {
  const activeAttacks = calculatorState.mode === 'compare'
    ? [...selectedAttacksA, ...selectedAttacksB]
    : [...selectedAttacksA];
  const { directAttacks, explosiveAttacks } = splitAttacksByApplication(activeAttacks);
  const hasAnySelectedAttacks = activeAttacks.length > 0;
  const explosiveOnlySelection = hasAnySelectedAttacks && directAttacks.length === 0 && explosiveAttacks.length > 0;

  return {
    hasProjectileTargets: !explosiveOnlySelection,
    hasExplosiveTargets: explosiveAttacks.length > 0
  };
}
