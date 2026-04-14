import { adjustAttackHitCount } from '../data.js';
import { formatDamageValue } from '../damage-rounding.js';
import { buildDamageFormulaText } from './damage-explanations.js';

function appendAttackApplication(leftContent, application) {
  const applicationLine = document.createElement('div');
  applicationLine.className = 'calc-damage-line';

  const damageValue = document.createElement('span');
  const hasZoneDamage = application.zoneDamage > 0;
  damageValue.className = hasZoneDamage ? 'calc-damage-value' : 'calc-damage-value muted';
  damageValue.textContent = `${application.zoneName}: ${formatDamageValue(application.zoneDamage)} zone`;
  applicationLine.appendChild(damageValue);

  if (application.attackResult) {
    const damageCalc = document.createElement('span');
    damageCalc.className = 'calc-formula';
    damageCalc.textContent = buildDamageFormulaText(application.attackResult);
    applicationLine.appendChild(damageCalc);
  } else if (application.exTarget === 'Main' && application.directMainDamage > 0) {
    const damageCalc = document.createElement('span');
    damageCalc.className = 'calc-formula';
    damageCalc.textContent = '= no part damage (ExTarget Main routes to main)';
    applicationLine.appendChild(damageCalc);
  }

  leftContent.appendChild(applicationLine);

  if (application.totalMainDamage > 0) {
    const mainDamageResult = document.createElement('div');
    mainDamageResult.className = 'calc-main-damage-line';

    const mainDamageValue = document.createElement('span');
    mainDamageValue.className = 'calc-main-damage-value';
    mainDamageValue.textContent = `Main: ${formatDamageValue(application.totalMainDamage)} (${formatDamageValue(application.directMainDamage)} direct + ${formatDamageValue(application.passthroughMainDamage)} passthrough)`;
    mainDamageResult.appendChild(mainDamageValue);
    leftContent.appendChild(mainDamageResult);
  }
}

export function appendAttackCard(container, slot, attack, attackKey, index, {
  onRefresh = null
} = {}) {
  const attackCard = document.createElement('div');
  attackCard.className = 'calc-attack-card';
  attackCard.dataset.attackIndex = index;

  const leftContent = document.createElement('div');
  leftContent.className = 'calc-attack-content';

  const attackName = document.createElement('div');
  attackName.className = 'calc-attack-name';
  attackName.textContent = attack.name;
  leftContent.appendChild(attackName);

  const targetSummary = document.createElement('div');
  targetSummary.className = 'calc-result-text muted';
  targetSummary.textContent = attack.mode === 'explosion'
    ? `AoE targets: ${attack.explosiveTargetZoneNames.length > 0 ? attack.explosiveTargetZoneNames.join(', ') : 'none'}`
    : `Projectile target: ${attack.projectileTargetZoneName || 'none'}`;
  leftContent.appendChild(targetSummary);

  attack.zoneApplications.forEach((application) => appendAttackApplication(leftContent, application));

  const attackTotals = document.createElement('div');
  attackTotals.className = 'calc-main-damage-line';
  attackTotals.textContent = `Cycle total: ${formatDamageValue(attack.totalZoneDamagePerCycle)} zone • ${formatDamageValue(attack.totalDamageToMainPerCycle)} main`;
  attackTotals.classList.add('calc-damage-value', 'muted');
  leftContent.appendChild(attackTotals);
  attackCard.appendChild(leftContent);

  const inputContainer = document.createElement('div');
  inputContainer.className = 'calc-hits-control';

  const hitsLabel = document.createElement('div');
  hitsLabel.className = 'calc-hits-label';
  hitsLabel.textContent = 'Hits';
  inputContainer.appendChild(hitsLabel);

  const hitsContainer = document.createElement('div');
  hitsContainer.className = 'calc-hits-container';

  const hitsDisplay = document.createElement('div');
  hitsDisplay.className = 'calc-hits-display';
  hitsDisplay.textContent = attack.hits;

  const refreshViews = typeof onRefresh === 'function'
    ? onRefresh
    : () => {};

  const downButton = document.createElement('button');
  downButton.className = 'calc-hits-btn';
  downButton.textContent = '◀';
  downButton.addEventListener('click', () => {
    adjustAttackHitCount(slot, attackKey, -1);
    refreshViews();
  });
  hitsContainer.appendChild(downButton);

  hitsContainer.appendChild(hitsDisplay);

  const upButton = document.createElement('button');
  upButton.className = 'calc-hits-btn';
  upButton.textContent = '▶';
  upButton.addEventListener('click', () => {
    adjustAttackHitCount(slot, attackKey, 1);
    refreshViews();
  });
  hitsContainer.appendChild(upButton);

  inputContainer.appendChild(hitsContainer);
  attackCard.appendChild(inputContainer);

  if (attack.hits !== 1) {
    const totalDamageForAttack = document.createElement('div');
    totalDamageForAttack.className = 'calc-main-damage-line';
    totalDamageForAttack.textContent = `Hits configured: ${attack.hits}`;
    totalDamageForAttack.classList.add('calc-damage-value', 'muted');
    leftContent.appendChild(totalDamageForAttack);
  }

  container.appendChild(attackCard);
}
