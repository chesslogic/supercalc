import { formatDamageValue } from '../damage-rounding.js';
import { formatTtkSeconds } from '../summary.js';
import { getCalculationExplanationLines } from './damage-explanations.js';

function appendTtkLine(resultWrapper, ttkSeconds, hasRpm) {
  const ttkLine = document.createElement('div');
  ttkLine.className = 'calc-ttk-line';

  if (ttkSeconds === null) {
    ttkLine.textContent = hasRpm ? 'TTK unavailable' : 'TTK unavailable (no RPM)';
    ttkLine.classList.add('muted');
  } else {
    ttkLine.textContent = `TTK: ${formatTtkSeconds(ttkSeconds)}`;
  }

  resultWrapper.appendChild(ttkLine);
}

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

  const zoneDamageContainer = document.createElement('div');
  zoneDamageContainer.className = 'calc-damage-section';

  const zoneLabel = document.createElement('div');
  zoneLabel.className = 'calc-section-label';
  zoneLabel.textContent = 'Focus zone:';
  zoneDamageContainer.appendChild(zoneLabel);

  const zoneDamageDisplay = document.createElement('div');
  zoneDamageDisplay.className = 'calc-damage-fraction-wrapper';

  if (totalDamagePerCycle > 0 && killSummary.zoneShotsToKill !== null) {
    const fraction = document.createElement('div');
    fraction.className = 'calc-fraction';

    const numerator = document.createElement('div');
    numerator.className = 'calc-fraction-numerator';
    numerator.textContent = `${zoneHealth}`;

    const denominator = document.createElement('div');
    denominator.className = 'calc-fraction-denominator';
    denominator.textContent = `${formatDamageValue(totalDamagePerCycle)}`;

    fraction.appendChild(numerator);
    fraction.appendChild(denominator);

    const result = document.createElement('div');
    result.className = 'calc-result-wrapper';

    const resultLine = document.createElement('div');
    resultLine.className = 'calc-result-line';
    resultLine.textContent = `= ${(zoneHealth / totalDamagePerCycle).toFixed(2)} (${killSummary.zoneShotsToKill}) shots`;

    const shotsText = document.createElement('div');
    shotsText.className = 'calc-result-text';
    shotsText.textContent = 'shots to destroy';

    result.appendChild(resultLine);
    result.appendChild(shotsText);
    appendTtkLine(result, killSummary.zoneTtkSeconds, killSummary.hasRpm);

    zoneDamageDisplay.appendChild(fraction);
    zoneDamageDisplay.appendChild(result);

    if (zoneCon > 0 && killSummary.zoneShotsToKillWithCon !== null) {
      const conFraction = document.createElement('div');
      conFraction.className = 'calc-fraction';

      const conNumerator = document.createElement('div');
      conNumerator.className = 'calc-fraction-numerator';
      conNumerator.textContent = `${zoneHealth + zoneCon}`;

      const conDenominator = document.createElement('div');
      conDenominator.className = 'calc-fraction-denominator';
      conDenominator.textContent = `${formatDamageValue(totalDamagePerCycle)}`;

      conFraction.appendChild(conNumerator);
      conFraction.appendChild(conDenominator);

      const conResult = document.createElement('div');
      conResult.className = 'calc-result-wrapper';

      const conResultLine = document.createElement('div');
      conResultLine.className = 'calc-result-line';
      conResultLine.textContent = `= ${((zoneHealth + zoneCon) / totalDamagePerCycle).toFixed(2)} (${killSummary.zoneShotsToKillWithCon}) shots`;

      const conShotsText = document.createElement('div');
      conShotsText.className = 'calc-result-text';
      conShotsText.textContent = 'shots to deplete constitution';

      conResult.appendChild(conResultLine);
      conResult.appendChild(conShotsText);
      appendTtkLine(conResult, killSummary.zoneTtkSecondsWithCon, killSummary.hasRpm);

      zoneDamageDisplay.appendChild(conFraction);
      zoneDamageDisplay.appendChild(conResult);
    }

    zoneDamageDisplay.classList.add('calc-damage-value');
  } else {
    zoneDamageDisplay.textContent = `${formatDamageValue(totalDamagePerCycle)}`;
    zoneDamageDisplay.classList.add('calc-damage-value', 'muted');
  }
  zoneDamageContainer.appendChild(zoneDamageDisplay);
  combinedDamage.appendChild(zoneDamageContainer);

  const mainDamageContainer = document.createElement('div');
  mainDamageContainer.className = 'calc-damage-section';

  const mainLabel = document.createElement('div');
  mainLabel.className = 'calc-section-label';
  mainLabel.textContent = 'Main:';
  mainDamageContainer.appendChild(mainLabel);

  const mainDamageDisplay = document.createElement('div');
  mainDamageDisplay.className = 'calc-damage-fraction-wrapper';

  if (totalDamageToMainPerCycle > 0 && enemyMainHealth > 0 && killSummary.mainShotsToKill !== null) {
    const fraction = document.createElement('div');
    fraction.className = 'calc-fraction';

    const numerator = document.createElement('div');
    numerator.className = 'calc-fraction-numerator';
    numerator.textContent = `${enemyMainHealth}`;

    const denominator = document.createElement('div');
    denominator.className = 'calc-fraction-denominator';
    denominator.textContent = `${formatDamageValue(totalDamageToMainPerCycle)}`;

    fraction.appendChild(numerator);
    fraction.appendChild(denominator);

    const result = document.createElement('div');
    result.className = 'calc-result-wrapper';

    const resultLine = document.createElement('div');
    resultLine.className = 'calc-result-line';
    resultLine.textContent = `= ${(enemyMainHealth / totalDamageToMainPerCycle).toFixed(2)} (${killSummary.mainShotsToKill}) shots`;

    const shotsText = document.createElement('div');
    shotsText.className = 'calc-result-text';
    shotsText.textContent = 'shots to destroy';

    result.appendChild(resultLine);
    result.appendChild(shotsText);
    appendTtkLine(result, killSummary.mainTtkSeconds, killSummary.hasRpm);

    mainDamageDisplay.appendChild(fraction);
    mainDamageDisplay.appendChild(result);
    mainDamageDisplay.classList.add('calc-main-damage-value');
  } else {
    mainDamageDisplay.textContent = `${formatDamageValue(totalDamageToMainPerCycle)}`;
    mainDamageDisplay.classList.add('calc-main-damage-value', 'muted');
  }
  mainDamageContainer.appendChild(mainDamageDisplay);

  combinedDamage.appendChild(mainDamageContainer);
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
