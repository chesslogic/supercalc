import { formatDamageValue } from '../damage-rounding.js';
import { formatTtkSeconds } from '../summary.js';

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

function appendFractionResult(display, {
  numeratorValue,
  denominatorValue,
  ratioValue,
  shotsToKill,
  shotsText,
  ttkSeconds,
  hasRpm
}) {
  const fraction = document.createElement('div');
  fraction.className = 'calc-fraction';

  const numerator = document.createElement('div');
  numerator.className = 'calc-fraction-numerator';
  numerator.textContent = `${numeratorValue}`;

  const denominator = document.createElement('div');
  denominator.className = 'calc-fraction-denominator';
  denominator.textContent = `${formatDamageValue(denominatorValue)}`;

  fraction.appendChild(numerator);
  fraction.appendChild(denominator);

  const result = document.createElement('div');
  result.className = 'calc-result-wrapper';

  const resultLine = document.createElement('div');
  resultLine.className = 'calc-result-line';
  resultLine.textContent = `= ${ratioValue.toFixed(2)} (${shotsToKill}) shots`;

  const shotsLabel = document.createElement('div');
  shotsLabel.className = 'calc-result-text';
  shotsLabel.textContent = shotsText;

  result.appendChild(resultLine);
  result.appendChild(shotsLabel);
  appendTtkLine(result, ttkSeconds, hasRpm);

  display.appendChild(fraction);
  display.appendChild(result);
}

export function createFocusZoneDamageSection(results) {
  const {
    totalDamagePerCycle,
    zoneHealth,
    zoneCon,
    killSummary
  } = results;

  const zoneDamageContainer = document.createElement('div');
  zoneDamageContainer.className = 'calc-damage-section';

  const zoneLabel = document.createElement('div');
  zoneLabel.className = 'calc-section-label';
  zoneLabel.textContent = 'Focus zone:';
  zoneDamageContainer.appendChild(zoneLabel);

  const zoneDamageDisplay = document.createElement('div');
  zoneDamageDisplay.className = 'calc-damage-fraction-wrapper';

  if (totalDamagePerCycle > 0 && killSummary.zoneShotsToKill !== null) {
    appendFractionResult(zoneDamageDisplay, {
      numeratorValue: zoneHealth,
      denominatorValue: totalDamagePerCycle,
      ratioValue: zoneHealth / totalDamagePerCycle,
      shotsToKill: killSummary.zoneShotsToKill,
      shotsText: 'shots to destroy',
      ttkSeconds: killSummary.zoneTtkSeconds,
      hasRpm: killSummary.hasRpm
    });

    if (zoneCon > 0 && killSummary.zoneShotsToKillWithCon !== null) {
      appendFractionResult(zoneDamageDisplay, {
        numeratorValue: zoneHealth + zoneCon,
        denominatorValue: totalDamagePerCycle,
        ratioValue: (zoneHealth + zoneCon) / totalDamagePerCycle,
        shotsToKill: killSummary.zoneShotsToKillWithCon,
        shotsText: 'shots to deplete constitution',
        ttkSeconds: killSummary.zoneTtkSecondsWithCon,
        hasRpm: killSummary.hasRpm
      });
    }

    zoneDamageDisplay.classList.add('calc-damage-value');
  } else {
    zoneDamageDisplay.textContent = `${formatDamageValue(totalDamagePerCycle)}`;
    zoneDamageDisplay.classList.add('calc-damage-value', 'muted');
  }

  zoneDamageContainer.appendChild(zoneDamageDisplay);
  return zoneDamageContainer;
}

export function createMainDamageSection(results) {
  const {
    totalDamageToMainPerCycle,
    enemyMainHealth,
    killSummary
  } = results;

  const mainDamageContainer = document.createElement('div');
  mainDamageContainer.className = 'calc-damage-section';

  const mainLabel = document.createElement('div');
  mainLabel.className = 'calc-section-label';
  mainLabel.textContent = 'Main:';
  mainDamageContainer.appendChild(mainLabel);

  const mainDamageDisplay = document.createElement('div');
  mainDamageDisplay.className = 'calc-damage-fraction-wrapper';

  if (totalDamageToMainPerCycle > 0 && enemyMainHealth > 0 && killSummary.mainShotsToKill !== null) {
    appendFractionResult(mainDamageDisplay, {
      numeratorValue: enemyMainHealth,
      denominatorValue: totalDamageToMainPerCycle,
      ratioValue: enemyMainHealth / totalDamageToMainPerCycle,
      shotsToKill: killSummary.mainShotsToKill,
      shotsText: 'shots to destroy',
      ttkSeconds: killSummary.mainTtkSeconds,
      hasRpm: killSummary.hasRpm
    });
    mainDamageDisplay.classList.add('calc-main-damage-value');
  } else {
    mainDamageDisplay.textContent = `${formatDamageValue(totalDamageToMainPerCycle)}`;
    mainDamageDisplay.classList.add('calc-main-damage-value', 'muted');
  }

  mainDamageContainer.appendChild(mainDamageDisplay);
  return mainDamageContainer;
}
