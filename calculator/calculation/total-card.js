import { getCalculationExplanationLines } from './damage-explanations.js';
import { createFocusZoneDamageSection, createMainDamageSection } from './damage-section-display.js';

export function appendTotalCard(container, results) {
  const {
    totalDamagePerCycle,
    totalDamageToMainPerCycle,
    zoneHealth,
    zoneCon,
    enemyMainHealth,
    killSummary,
    projectileTargetZone,
    explosiveTargetZones,
    hasProjectileAttacks,
    hasExplosiveAttacks
  } = results;

  const totalCard = document.createElement('div');
  totalCard.className = 'calc-total-card';

  const totalDamage = document.createElement('div');
  totalDamage.className = 'calc-total-damage';
  totalDamage.textContent = 'Total Combined Damage per Cycle';
  totalCard.appendChild(totalDamage);

  if (hasProjectileAttacks || hasExplosiveAttacks) {
    const targetSummary = document.createElement('div');
    targetSummary.className = 'calc-result-text muted';

    const targetParts = [];
    if (hasProjectileAttacks) {
      targetParts.push(`Proj: ${projectileTargetZone?.zone_name || 'none'}`);
    }
    if (hasExplosiveAttacks) {
      targetParts.push(`AoE: ${explosiveTargetZones.length > 0 ? explosiveTargetZones.map((zone) => zone.zone_name).join(', ') : 'none'}`);
    }

    targetSummary.textContent = targetParts.join(' • ');
    totalCard.appendChild(targetSummary);
  }

  const combinedDamage = document.createElement('div');
  combinedDamage.className = 'calc-combined-display';
  combinedDamage.appendChild(createFocusZoneDamageSection(results));
  combinedDamage.appendChild(createMainDamageSection(results));
  totalCard.appendChild(combinedDamage);

  const explanationLines = getCalculationExplanationLines(results);
  if (explanationLines.length > 0) {
    const explanationBox = document.createElement('div');
    explanationBox.className = 'calc-explanation-box';

    const explanationTitle = document.createElement('div');
    explanationTitle.className = 'calc-explanation-title';
    explanationTitle.textContent = 'Why 0 damage?';
    explanationBox.appendChild(explanationTitle);

    explanationLines.forEach((line) => {
      const explanationLine = document.createElement('div');
      explanationLine.className = 'calc-explanation-line';
      explanationLine.textContent = line;
      explanationBox.appendChild(explanationLine);
    });

    totalCard.appendChild(explanationBox);
  }

  container.appendChild(totalCard);
}
