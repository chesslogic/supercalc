// calculator/calculation.js — damage calculation logic
import {
  adjustAttackHitCount,
  calculatorState,
  getAttackHitCounts,
  getEnemyOptions,
  getSelectedEnemyTargetTypes,
  getSelectedAttacks,
  getSelectedExplosiveZoneIndices,
  getSelectedZone,
  getWeaponForSlot,
  setRecommendationRangeMeters
} from './data.js';
import { buildHallOfFameEntries, buildOverviewRows, getAttackRowKey } from './compare-utils.js';
import { splitAttacksByApplication } from './attack-types.js';
import { formatDamageValue } from './damage-rounding.js';
import { EFFECTIVE_DISTANCE_TOOLTIP } from './effective-distance.js';
import { formatTtkSeconds } from './summary.js';
import { getZoneOutcomeDescription, getZoneOutcomeLabel, summarizeEnemyTargetScenario } from './zone-damage.js';
import { renderEnemyDetails } from './rendering.js';
import { state as weaponsState } from '../weapons/data.js';
import { buildWeaponRecommendationRows } from './recommendations.js';
import { getEnemyTacticalInfoChips, getEnemyWeakspotBundles } from './tactical-data.js';

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

function getEmptyCalculationMessage(slot) {
  const weapon = getWeaponForSlot(slot);
  const enemy = calculatorState.selectedEnemy;
  const zone = getSelectedZone();
  const selectedAttacks = getSelectedAttacks(slot);
  const { directAttacks } = splitAttacksByApplication(selectedAttacks);

  if (!weapon) {
    return calculatorState.mode === 'compare'
      ? `Select weapon ${slot}`
      : 'Select a weapon to see calculations';
  }

  if (!enemy) {
    return 'Select an enemy to see calculations';
  }

  if (selectedAttacks.length === 0) {
    return calculatorState.mode === 'compare'
      ? `Select one or more attack rows for weapon ${slot}`
      : 'Select weapon attack(s) to see calculations';
  }

  if (directAttacks.length > 0 && !zone) {
    return 'Select an enemy zone to see calculations';
  }

  return 'Select weapon attack(s) to see calculations';
}

function isValidZoneIndex(zones, zoneIndex) {
  return Number.isInteger(zoneIndex) && zoneIndex >= 0 && zoneIndex < zones.length;
}

function resolveFocusZoneIndex({
  enemy,
  selectedAttacks = [],
  projectileZoneIndex,
  explosiveZoneIndices = []
}) {
  const zones = enemy?.zones || [];
  const normalizedProjectileZoneIndex = isValidZoneIndex(zones, projectileZoneIndex)
    ? projectileZoneIndex
    : null;
  const normalizedExplosiveZoneIndices = [...new Set(
    (explosiveZoneIndices || []).filter((zoneIndex) => isValidZoneIndex(zones, zoneIndex))
  )];
  const { directAttacks, explosiveAttacks } = splitAttacksByApplication(selectedAttacks);

  if (directAttacks.length > 0 && normalizedProjectileZoneIndex !== null) {
    return normalizedProjectileZoneIndex;
  }

  if (explosiveAttacks.length > 0 && normalizedExplosiveZoneIndices.length > 0) {
    return normalizedExplosiveZoneIndices[normalizedExplosiveZoneIndices.length - 1];
  }

  return normalizedProjectileZoneIndex;
}

export function calculateDamage(slot = 'A') {
  const weapon = getWeaponForSlot(slot);
  const enemy = calculatorState.selectedEnemy;

  if (!weapon || !enemy || !enemy.zones) {
    return null;
  }

  const selectedAttacks = getSelectedAttacks(slot);
  if (selectedAttacks.length === 0) {
    return null;
  }

  const hitCounts = getAttackHitCounts(slot, selectedAttacks);
  const explosiveZoneIndices = getSelectedExplosiveZoneIndices();
  const focusZoneIndex = resolveFocusZoneIndex({
    enemy,
    selectedAttacks,
    projectileZoneIndex: calculatorState.selectedZoneIndex,
    explosiveZoneIndices
  });
  const zone = Number.isInteger(focusZoneIndex)
    ? enemy.zones[focusZoneIndex] || null
    : getSelectedZone();
  const scenario = summarizeEnemyTargetScenario({
    enemy,
    selectedAttacks,
    hitCounts,
    rpm: weapon?.rpm,
    projectileZoneIndex: calculatorState.selectedZoneIndex,
    explosiveZoneIndices
  });
  const focusZoneSummary = Number.isInteger(focusZoneIndex)
    ? scenario?.zoneSummaries?.[focusZoneIndex] || null
    : null;

  return {
    slot,
    weapon,
    enemy,
    zone,
    focusZoneIndex,
    selectedAttacks,
    attackKeys: selectedAttacks.map((attack) => getAttackRowKey(attack)),
    hitCounts,
    projectileTargetZone: scenario?.projectileTargetZone || null,
    explosiveTargetZones: scenario?.explosiveTargetZones || [],
    hasProjectileAttacks: splitAttacksByApplication(selectedAttacks).directAttacks.length > 0,
    hasExplosiveAttacks: splitAttacksByApplication(selectedAttacks).explosiveAttacks.length > 0,
    focusZoneSummary,
    totalDamagePerCycle: focusZoneSummary?.totalDamagePerCycle || 0,
    totalDamageToMainPerCycle: scenario?.totalDamageToMainPerCycle || 0,
    zoneHealth: focusZoneSummary?.zoneHealth || 0,
    zoneCon: focusZoneSummary?.zoneCon || 0,
    enemyMainHealth: scenario?.enemyMainHealth || 0,
    killSummary: focusZoneSummary?.killSummary || null,
    attackDetails: scenario?.attackDetails || [],
    ...scenario
  };
}

function buildDamageFormulaText(attackResult) {
  const dmgMultiplied = attackResult.dmg * (1 - attackResult.durPercent);
  const durMultiplied = attackResult.dur * attackResult.durPercent;
  const exMultValue = attackResult.isExplosion ? attackResult.explosionModifier : 1.0;

  return `= floor((${formatDamageValue(dmgMultiplied)} + ${formatDamageValue(durMultiplied)}) × ${formatDamageValue(exMultValue)} × ${formatDamageValue(attackResult.damageMultiplier)}) = ${formatDamageValue(attackResult.damage)}`;
}

function normalizeZoneName(value) {
  return String(value || '').trim().toLowerCase();
}

function buildBlockedDamageReason(application) {
  const attackResult = application?.attackResult;
  if (!attackResult) {
    return null;
  }

  if (attackResult.damageMultiplier === 0) {
    return `AP ${attackResult.ap} is below AV ${attackResult.av}`;
  }

  if (attackResult.isExplosion && attackResult.explosionModifier === 0) {
    return 'ExDR is 100%';
  }

  return null;
}

function uniqueLines(lines = []) {
  return [...new Set(lines.filter(Boolean))];
}

function buildFocusZoneExplanationLines(results) {
  if (!Number.isInteger(results?.focusZoneIndex)) {
    return [];
  }

  const focusZoneName = results?.zone?.zone_name || 'the focus zone';
  const lines = [];

  (results?.attackDetails || []).forEach((attackScenario) => {
    const application = attackScenario?.zoneApplications?.find(
      (entry) => entry.zoneIndex === results.focusZoneIndex
    );
    if (!application || application.zoneDamage > 0) {
      return;
    }

    const reason = buildBlockedDamageReason(application);
    if (reason) {
      lines.push(`${attackScenario.name} does 0 damage to ${focusZoneName} because ${reason}.`);
    }
  });

  return uniqueLines(lines);
}

function buildMainExplanationLines(results) {
  const lines = [];

  (results?.attackDetails || []).forEach((attackScenario) => {
    if ((attackScenario?.totalDamageToMainPerCycle || 0) > 0) {
      return;
    }

    const blockedApplication = attackScenario?.zoneApplications?.find((application) => {
      if ((application?.directMainDamage || 0) > 0 || (application?.passthroughMainDamage || 0) > 0) {
        return false;
      }

      return Boolean(buildBlockedDamageReason(application));
    });
    if (blockedApplication) {
      const reason = buildBlockedDamageReason(blockedApplication);
      if (reason) {
        lines.push(`${attackScenario.name} does 0 damage to Main because ${reason} on ${blockedApplication.zoneName}.`);
        return;
      }
    }

    const noTransferApplication = attackScenario?.zoneApplications?.find((application) =>
      (application?.zoneDamage || 0) > 0
      && (application?.directMainDamage || 0) === 0
      && (application?.passthroughMainDamage || 0) === 0
      && (application?.attackResult?.toMainPercent || 0) === 0
    );
    if (noTransferApplication) {
      lines.push(`${attackScenario.name} damages ${noTransferApplication.zoneName} but transfers 0% to Main.`);
    }
  });

  return uniqueLines(lines);
}

export function getCalculationExplanationLines(results) {
  if (!results) {
    return [];
  }

  const lines = [];
  const focusZoneName = normalizeZoneName(results?.zone?.zone_name);
  const focusLines = (results.totalDamagePerCycle || 0) <= 0
    ? buildFocusZoneExplanationLines(results)
    : [];
  lines.push(...focusLines);

  const shouldExplainMainSeparately = (results.totalDamageToMainPerCycle || 0) <= 0
    && focusZoneName !== 'main';
  if (shouldExplainMainSeparately) {
    lines.push(...buildMainExplanationLines(results));
  }

  return uniqueLines(lines);
}

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

function appendAttackCard(container, slot, attack, attackKey, index) {
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

  const rerenderCalculationViews = () => {
    renderEnemyDetails();
    renderCalculation();
  };

  const downButton = document.createElement('button');
  downButton.className = 'calc-hits-btn';
  downButton.textContent = '◀';
  downButton.addEventListener('click', () => {
    adjustAttackHitCount(slot, attackKey, -1);
    rerenderCalculationViews();
  });
  hitsContainer.appendChild(downButton);

  hitsContainer.appendChild(hitsDisplay);

  const upButton = document.createElement('button');
  upButton.className = 'calc-hits-btn';
  upButton.textContent = '▶';
  upButton.addEventListener('click', () => {
    adjustAttackHitCount(slot, attackKey, 1);
    rerenderCalculationViews();
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

function appendTotalCard(container, results) {
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

function renderCalculationContent(container, slot, results) {
  results.attackDetails.forEach((attack, index) => {
    appendAttackCard(container, slot, attack, results.attackKeys[index], index);
  });

  appendTotalCard(container, results);
}

function appendEmptyCalculationState(container, slot) {
  const emptyState = document.createElement('div');
  emptyState.textContent = getEmptyCalculationMessage(slot);
  emptyState.style.color = 'var(--muted)';
  emptyState.style.padding = '16px';
  container.appendChild(emptyState);
}

function renderComparePanel(container, slot, results) {
  const panel = document.createElement('section');
  panel.className = 'calc-compare-panel';

  const heading = document.createElement('div');
  heading.className = 'calc-compare-heading';

  const badge = document.createElement('span');
  badge.className = `calc-compare-slot-badge calc-compare-slot-badge-${slot.toLowerCase()}`;
  badge.textContent = slot;
  heading.appendChild(badge);

  const title = document.createElement('div');
  title.className = 'calc-compare-title';
  title.textContent = results?.weapon?.name || `Weapon ${slot}`;
  heading.appendChild(title);

  panel.appendChild(heading);

  const body = document.createElement('div');
  body.className = 'calc-compare-body';
  panel.appendChild(body);

  if (!results) {
    appendEmptyCalculationState(body, slot);
  } else {
    renderCalculationContent(body, slot, results);
  }

  container.appendChild(panel);
}

function capitalizeWord(value) {
  if (!value) {
    return '';
  }

  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatHallOfFameValue(value, type) {
  if (value === null || value === undefined) {
    return '-';
  }

  return type === 'ttk'
    ? formatTtkSeconds(value)
    : String(value);
}

function getHallOfFameOutcomeLabel(entry) {
  const winnerMetrics = entry.row?.metrics?.bySlot?.[entry.metric.winner];
  const outcomeKind = winnerMetrics?.outcomeKind;
  if (!outcomeKind) {
    return entry.row?.zone?.zone_name === 'Main' ? 'Main' : 'Unavailable';
  }

  return capitalizeWord(outcomeKind === 'fatal' ? 'Kill' : outcomeKind);
}

function buildHallOfFameDiffText(entry) {
  const { metric } = entry;
  if (metric.displayMetric.kind === 'one-sided') {
    return `${metric.winner} Only`;
  }

  const magnitude = Math.abs(metric.displayMetric.value);
  if (metric.displayMode === 'percent') {
    return `${metric.winner} by ${magnitude.toFixed(1).replace(/\.0$/, '')}%`;
  }

  if (metric.metricKey === 'ttk') {
    return `${metric.winner} faster by ${formatTtkSeconds(magnitude)}`;
  }

  return `${metric.winner} by ${magnitude} shot${magnitude === 1 ? '' : 's'}`;
}

function appendHallOfFameEntry(list, entry) {
  const item = document.createElement('div');
  item.className = 'calc-hof-entry';

  const header = document.createElement('div');
  header.className = 'calc-hof-entry-header';
  header.textContent = `${entry.row.enemyName} — ${entry.row.zone?.zone_name || 'Zone'}`;
  item.appendChild(header);

  const meta = document.createElement('div');
  meta.className = 'calc-hof-entry-meta';
  meta.textContent = `${entry.row.faction} • ${getHallOfFameOutcomeLabel(entry)}`;
  item.appendChild(meta);

  const values = document.createElement('div');
  values.className = 'calc-hof-entry-values';

  const aMetrics = entry.row.metrics?.bySlot?.A;
  const bMetrics = entry.row.metrics?.bySlot?.B;
  const type = entry.metric.metricKey;
  const label = type === 'ttk' ? 'TTK' : 'Shots';
  values.textContent = `A ${label}: ${formatHallOfFameValue(type === 'ttk' ? aMetrics?.ttkSeconds : aMetrics?.shotsToKill, type)} • B ${label}: ${formatHallOfFameValue(type === 'ttk' ? bMetrics?.ttkSeconds : bMetrics?.shotsToKill, type)} • ${buildHallOfFameDiffText(entry)}`;
  item.appendChild(values);

  list.appendChild(item);
}

function renderHallOfFamePanel(container, slot, weaponName, entries) {
  const panel = document.createElement('section');
  panel.className = 'calc-compare-panel calc-hof-panel';

  const heading = document.createElement('div');
  heading.className = 'calc-compare-heading';

  const badge = document.createElement('span');
  badge.className = `calc-compare-slot-badge calc-compare-slot-badge-${slot.toLowerCase()}`;
  badge.textContent = slot;
  heading.appendChild(badge);

  const title = document.createElement('div');
  title.className = 'calc-compare-title';
  title.textContent = weaponName ? `${weaponName} hall of fame` : `Weapon ${slot} hall of fame`;
  heading.appendChild(title);

  panel.appendChild(heading);

  const body = document.createElement('div');
  body.className = 'calc-compare-body calc-hof-body';
  panel.appendChild(body);

  if (!weaponName) {
    const emptyState = document.createElement('div');
    emptyState.className = 'muted';
    emptyState.textContent = `Select weapon ${slot} to compare the full roster`;
    body.appendChild(emptyState);
    container.appendChild(panel);
    return;
  }

  if (entries.length === 0) {
    const emptyState = document.createElement('div');
    emptyState.className = 'muted';
    emptyState.textContent = 'No overall wins are available for the current attacks and scope';
    body.appendChild(emptyState);
    container.appendChild(panel);
    return;
  }

  entries.forEach((entry) => appendHallOfFameEntry(body, entry));
  container.appendChild(panel);
}

function renderOverviewCalculation(container) {
  const weaponA = getWeaponForSlot('A');
  const weaponB = getWeaponForSlot('B');
  const selectedAttacksA = getSelectedAttacks('A');
  const selectedAttacksB = getSelectedAttacks('B');

  const rows = buildOverviewRows({
    units: getEnemyOptions(),
    scope: calculatorState.overviewScope,
    targetTypes: getSelectedEnemyTargetTypes(),
    weaponA,
    weaponB,
    selectedAttacksA,
    selectedAttacksB,
    hitCountsA: getAttackHitCounts('A', selectedAttacksA),
    hitCountsB: getAttackHitCounts('B', selectedAttacksB)
  });

  const hallOfFame = buildHallOfFameEntries(rows, {
    diffDisplayMode: calculatorState.diffDisplayMode,
    limit: 5
  });

  const wrapper = document.createElement('div');
  wrapper.className = 'calc-compare-results calc-overview-results';

  renderHallOfFamePanel(wrapper, 'A', weaponA?.name, hallOfFame.A);
  renderHallOfFamePanel(wrapper, 'B', weaponB?.name, hallOfFame.B);

  container.appendChild(wrapper);
}

const RECOMMENDATION_RANGE_FLOOR_TITLE = 'Minimum modeled distance that range-sensitive highlight flags must survive. Unknown-range rows stay listed, but those highlights do not count until the breakpoint range is known.';
const RECOMMENDATION_HIGHLIGHT_SUMMARY_TITLE = 'Highlighted rows are any recommendations that light up OH Kill, OH Crit, 2 Crit, Low OHKO, <0.6s, or Pen All.';
const RECOMMENDATION_HEADER_DEFINITIONS = [
  { label: 'Weapon', title: 'Weapon entry for this recommendation row.' },
  { label: 'Attack', title: 'Best-ranked attack row for this weapon.' },
  { label: 'Target', title: 'Best-ranked target zone for the listed attack, plus the outcome badge.' },
  { label: 'Shots', title: 'Shots or firing cycles needed to reach the listed outcome using the recommendation preview hit-count.' },
  { label: 'TTK', title: 'Modeled time to reach the listed outcome at the weapon\'s RPM.' },
  {
    label: 'Range',
    title: `${EFFECTIVE_DISTANCE_TOOLTIP}\nUnknown-range rows stay listed, but range-sensitive highlights only count when the breakpoint qualifies.`
  },
  { label: 'OH Kill', title: 'One-shot kill highlight at the current range floor.' },
  { label: 'OH Crit', title: 'One-shot critical-disable highlight at the current range floor.' },
  { label: '2 Crit', title: 'Two-shot critical-disable highlight at the current range floor.' },
  { label: 'Low OHKO', title: 'One-shot kill or critical highlight with 25% or less extra damage.' },
  { label: '<0.6s', title: 'Fast-TTK highlight for rows under 0.6 seconds at the current range floor.' },
  { label: 'Pen All', title: 'Highlights attack rows that can damage every zone on the current enemy.' },
  { label: 'Tip', title: 'Short note explaining why this breakpoint stands out or what path it follows.' }
];
const RECOMMENDATION_FLAG_TITLES = {
  oneShotKill: {
    active: 'Meets the one-shot kill highlight at the current range floor.',
    inactive: 'Does not currently meet the one-shot kill highlight.'
  },
  oneShotCritical: {
    active: 'Meets the one-shot critical-disable highlight at the current range floor.',
    inactive: 'Does not currently meet the one-shot critical-disable highlight.'
  },
  twoShotCritical: {
    active: 'Meets the two-shot critical-disable highlight at the current range floor.',
    inactive: 'Does not currently meet the two-shot critical-disable highlight.'
  },
  lowOverkillOhko: {
    active: 'Meets the low-overkill one-shot highlight with 25% or less extra damage.',
    inactive: 'Does not currently meet the low-overkill one-shot highlight.'
  },
  fastTtk: {
    active: 'Meets the sub-0.6s TTK highlight at the current range floor.',
    inactive: 'Does not currently meet the sub-0.6s TTK highlight.'
  },
  penetratesAll: {
    active: 'This attack row can damage every zone on the current enemy.',
    inactive: 'At least one zone on the current enemy takes no damage from this attack row.'
  }
};

function getRecommendationHitAssumptionText(hitCount) {
  const normalizedHitCount = Number.isFinite(hitCount) && hitCount > 0
    ? Math.max(1, hitCount)
    : 1;

  return normalizedHitCount === 1
    ? 'Recommendation preview assumes 1 hit per firing cycle for this row.'
    : `Recommendation preview assumes ${normalizedHitCount} hits per firing cycle for this row, so "Shots" counts firing cycles, not individual projectiles.`;
}

function getRecommendationSummaryTitle(hasHighlightedRows) {
  return hasHighlightedRows
    ? `${RECOMMENDATION_HIGHLIGHT_SUMMARY_TITLE}\nRows without those highlights are hidden from this table.`
    : `${RECOMMENDATION_HIGHLIGHT_SUMMARY_TITLE}\nNothing matches right now, so the table falls back to the best-ranked row for each weapon.`;
}

function getRecommendationTargetTitle(row) {
  const zoneName = row?.bestZoneName || '—';
  const outcomeLabel = getZoneOutcomeLabel(row?.bestOutcomeKind);
  const outcomeDescription = getZoneOutcomeDescription(row?.bestOutcomeKind);
  const lines = [`Best-ranked target: ${zoneName}`];

  if (outcomeLabel && outcomeDescription) {
    lines.push(`${outcomeLabel}: ${outcomeDescription}`);
  } else if (outcomeLabel) {
    lines.push(`Outcome: ${outcomeLabel}`);
  }

  return lines.join('\n');
}

function getRecommendationAttackTitle(row) {
  const attackName = String(row?.attackName || 'Attack').trim() || 'Attack';
  return `Attack row: ${attackName}\n${getRecommendationHitAssumptionText(row?.hitCount)}`;
}

function getRecommendationShotsTitle(row) {
  const shotsToKill = row?.shotsToKill;
  const lines = [
    shotsToKill === null
      ? 'Shots-to-kill is unavailable for this breakpoint.'
      : `${shotsToKill} ${shotsToKill === 1 ? 'shot' : 'shots'} to reach the listed outcome.`
  ];
  lines.push(getRecommendationHitAssumptionText(row?.hitCount));
  return lines.join('\n');
}

function getRecommendationTtkTitle(row) {
  const lines = [
    row?.ttkSeconds === null
      ? 'TTK unavailable without RPM.'
      : `${formatTtkSeconds(row.ttkSeconds)} to reach the listed outcome at the weapon\'s RPM.`
  ];
  lines.push(getRecommendationHitAssumptionText(row?.hitCount));
  return lines.join('\n');
}

function getRecommendationRangeTitle(row) {
  const baseTitle = row?.effectiveDistance?.title || EFFECTIVE_DISTANCE_TOOLTIP;

  if (row?.rangeStatus === 'failed') {
    return `${baseTitle}\nThis breakpoint falls short of the current range floor, so range-sensitive highlights do not count.`;
  }

  if (row?.rangeStatus === 'unknown') {
    return `${baseTitle}\nThis row stays listed, but range-sensitive highlights do not count until the breakpoint range is known.`;
  }

  return `${baseTitle}\nThis breakpoint qualifies for range-sensitive highlights at the current range floor.`;
}

function getRecommendationFlagTitle(flagKey, value) {
  const metadata = RECOMMENDATION_FLAG_TITLES[flagKey];
  if (!metadata) {
    return value ? 'Highlighted recommendation.' : 'This highlight is not met.';
  }

  return value ? metadata.active : metadata.inactive;
}

function getRecommendationTipTitle(row, isFallbackRow = false) {
  const lines = [
    row?.tip
      ? `Breakpoint note: ${row.tip}`
      : 'No extra breakpoint note for this recommendation.'
  ];

  if (isFallbackRow) {
    lines.push('This row is shown as a fallback because nothing met the current highlight checks.');
  }

  return lines.join('\n');
}

function createOutcomeBadge(outcomeKind) {
  const outcomeLabel = getZoneOutcomeLabel(outcomeKind);
  const outcomeDescription = getZoneOutcomeDescription(outcomeKind);
  if (!outcomeLabel) {
    return null;
  }

  const badge = document.createElement('span');
  badge.className = `calc-zone-context calc-zone-context-${outcomeKind}`;
  badge.title = outcomeDescription || outcomeLabel;
  badge.textContent = outcomeLabel;
  return badge;
}

function createRecommendationFlag(value, label = 'Yes', title = '') {
  const flag = document.createElement('span');
  flag.className = `calc-recommend-flag ${value ? 'is-true' : 'is-false'}`;
  if (title) {
    flag.title = title;
  }
  flag.textContent = value ? label : '—';
  return flag;
}

function renderTacticalGuidePanel(container, enemy) {
  const chips = getEnemyTacticalInfoChips(enemy);
  if (chips.length === 0) {
    return;
  }

  const panel = document.createElement('section');
  panel.className = 'calc-compare-panel calc-info-panel';

  const heading = document.createElement('div');
  heading.className = 'calc-compare-heading';

  const title = document.createElement('div');
  title.className = 'calc-compare-title';
  title.textContent = `${enemy.name} tactical notes`;
  heading.appendChild(title);
  panel.appendChild(heading);

  const body = document.createElement('div');
  body.className = 'calc-compare-body';

  const grid = document.createElement('div');
  grid.className = 'calc-info-grid';
  chips.forEach((chip) => {
    const card = document.createElement('div');
    card.className = 'calc-info-card';

    const label = document.createElement('div');
    label.className = 'calc-info-card-label';
    label.textContent = chip.label;
    card.appendChild(label);

    const value = document.createElement('div');
    value.className = 'calc-info-card-value';
    value.textContent = chip.value;
    card.appendChild(value);

    const description = document.createElement('div');
    description.className = 'calc-info-card-description';
    description.textContent = chip.description;
    card.appendChild(description);

    grid.appendChild(card);
  });

  body.appendChild(grid);
  panel.appendChild(body);
  container.appendChild(panel);
}

function renderWeakspotBundlesPanel(container, enemy) {
  const bundles = getEnemyWeakspotBundles(enemy);
  if (bundles.length === 0) {
    return;
  }

  const panel = document.createElement('section');
  panel.className = 'calc-compare-panel calc-bundle-panel';

  const heading = document.createElement('div');
  heading.className = 'calc-compare-heading';

  const title = document.createElement('div');
  title.className = 'calc-compare-title';
  title.textContent = `${enemy.name} curated weakspots`;
  heading.appendChild(title);
  panel.appendChild(heading);

  const body = document.createElement('div');
  body.className = 'calc-compare-body';

  const bundleList = document.createElement('div');
  bundleList.className = 'calc-bundle-list';

  bundles.forEach((bundle) => {
    const bundleCard = document.createElement('section');
    bundleCard.className = 'calc-bundle-card';

    const bundleTitle = document.createElement('div');
    bundleTitle.className = 'calc-bundle-title';
    bundleTitle.textContent = bundle.label;
    bundleCard.appendChild(bundleTitle);

    if (bundle.description) {
      const bundleDescription = document.createElement('div');
      bundleDescription.className = 'calc-bundle-description';
      bundleDescription.textContent = bundle.description;
      bundleCard.appendChild(bundleDescription);
    }

    const entries = document.createElement('div');
    entries.className = 'calc-bundle-entries';

    (bundle.entries || []).forEach((entry) => {
      const entryCard = document.createElement('div');
      entryCard.className = 'calc-bundle-entry';

      const entryTitle = document.createElement('div');
      entryTitle.className = 'calc-bundle-entry-title';
      entryTitle.textContent = entry.label;
      entryCard.appendChild(entryTitle);

      if (entry.sourceLabel) {
        const entrySource = document.createElement('div');
        entrySource.className = 'calc-bundle-entry-source';
        entrySource.textContent = entry.sourceLabel;
        entryCard.appendChild(entrySource);
      }

      if (entry.description) {
        const entryDescription = document.createElement('div');
        entryDescription.className = 'calc-bundle-entry-description';
        entryDescription.textContent = entry.description;
        entryCard.appendChild(entryDescription);
      }

      entries.appendChild(entryCard);
    });

    bundleCard.appendChild(entries);
    bundleList.appendChild(bundleCard);
  });

  body.appendChild(bundleList);
  panel.appendChild(body);
  container.appendChild(panel);
}

function appendRecommendationCell(row, content, className = '', title = '') {
  const cell = document.createElement('td');
  if (className) {
    cell.className = className;
  }
  if (title) {
    cell.title = title;
  }

  if (typeof Node !== 'undefined' && content instanceof Node) {
    cell.appendChild(content);
  } else {
    cell.textContent = content;
  }

  row.appendChild(cell);
}

export function renderRecommendationPanel(container, enemy) {
  const panel = document.createElement('section');
  panel.className = 'calc-compare-panel calc-recommend-panel';

  const heading = document.createElement('div');
  heading.className = 'calc-compare-heading';

  const title = document.createElement('div');
  title.className = 'calc-compare-title';
  title.textContent = `${enemy.name} weapon recommendations`;
  heading.appendChild(title);
  panel.appendChild(heading);

  const body = document.createElement('div');
  body.className = 'calc-compare-body calc-recommend-body';

  const controls = document.createElement('div');
  controls.className = 'calc-recommend-controls';

  const rangeLabel = document.createElement('label');
  rangeLabel.className = 'label';
  rangeLabel.textContent = 'Range floor';
  rangeLabel.htmlFor = 'calculator-recommendation-range';
  rangeLabel.title = RECOMMENDATION_RANGE_FLOOR_TITLE;
  controls.appendChild(rangeLabel);

  const rangeInput = document.createElement('input');
  rangeInput.id = 'calculator-recommendation-range';
  rangeInput.className = 'input calc-recommend-input';
  rangeInput.type = 'number';
  rangeInput.min = '0';
  rangeInput.max = '500';
  rangeInput.step = '5';
  rangeInput.value = String(calculatorState.recommendationRangeMeters);
  rangeInput.title = RECOMMENDATION_RANGE_FLOOR_TITLE;
  rangeInput.addEventListener('change', (event) => {
    setRecommendationRangeMeters(event.target.value);
    renderCalculation();
  });
  controls.appendChild(rangeInput);

  const controlsNote = document.createElement('span');
  controlsNote.className = 'status calc-recommend-note';
  controlsNote.textContent = 'Range-sensitive flags only light up when the modeled breakpoint survives the selected floor. Unknown-range profiles stay listed, but they do not pass those flags.';
  controlsNote.title = RECOMMENDATION_RANGE_FLOOR_TITLE;
  controls.appendChild(controlsNote);

  body.appendChild(controls);

  if (!Array.isArray(weaponsState.groups) || weaponsState.groups.length === 0) {
    const emptyState = document.createElement('div');
    emptyState.className = 'muted';
    emptyState.textContent = 'Weapon data is still loading.';
    body.appendChild(emptyState);
    panel.appendChild(body);
    container.appendChild(panel);
    return;
  }

  const recommendationRows = buildWeaponRecommendationRows({
    enemy,
    weapons: weaponsState.groups,
    rangeFloorMeters: calculatorState.recommendationRangeMeters
  });
  const flaggedRows = recommendationRows.filter((row) => (
    row.hasOneShotKill
    || row.hasOneShotCritical
    || row.hasTwoShotCritical
    || row.hasFastTtk
    || row.hasLowOverkillOhko
    || row.penetratesAll
  ));
  const usingFallbackRows = flaggedRows.length === 0;
  const displayRows = (flaggedRows.length > 0 ? flaggedRows : recommendationRows).slice(0, 24);

  const summary = document.createElement('div');
  summary.className = 'calc-recommend-summary';
  summary.title = getRecommendationSummaryTitle(!usingFallbackRows);
  summary.textContent = flaggedRows.length > 0
    ? `Showing ${displayRows.length} highlighted recommendations at ${calculatorState.recommendationRangeMeters}m+.`
    : `No rows hit the current highlight checks at ${calculatorState.recommendationRangeMeters}m+. Showing the best fallback rows instead.`;
  body.appendChild(summary);

  if (displayRows.length === 0) {
    const emptyState = document.createElement('div');
    emptyState.className = 'muted';
    emptyState.textContent = 'No recommendation rows are available for the current enemy.';
    body.appendChild(emptyState);
    panel.appendChild(body);
    container.appendChild(panel);
    return;
  }

  const tableWrap = document.createElement('div');
  tableWrap.className = 'calc-recommend-table-wrap';

  const table = document.createElement('table');
  table.className = 'calculator-table calc-recommend-table';

  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  RECOMMENDATION_HEADER_DEFINITIONS.forEach(({ label, title }) => {
    const th = document.createElement('th');
    th.textContent = label;
    if (title) {
      th.title = title;
    }
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  displayRows.forEach((row) => {
    const tableRow = document.createElement('tr');

    appendRecommendationCell(tableRow, row.weapon.name, '', row.weapon.name);
    appendRecommendationCell(tableRow, row.attackName, 'trunc', getRecommendationAttackTitle(row));

    const target = document.createElement('div');
    target.className = 'calc-recommend-target';
    const targetName = document.createElement('span');
    targetName.textContent = row.bestZoneName || '—';
    target.appendChild(targetName);
    const outcomeBadge = createOutcomeBadge(row.bestOutcomeKind);
    if (outcomeBadge) {
      target.appendChild(outcomeBadge);
    }
    appendRecommendationCell(tableRow, target, '', getRecommendationTargetTitle(row));

    appendRecommendationCell(
      tableRow,
      row.shotsToKill === null ? '-' : String(row.shotsToKill),
      '',
      getRecommendationShotsTitle(row)
    );
    appendRecommendationCell(
      tableRow,
      row.ttkSeconds === null ? '-' : formatTtkSeconds(row.ttkSeconds),
      '',
      getRecommendationTtkTitle(row)
    );
    appendRecommendationCell(
      tableRow,
      row.effectiveDistance?.isAvailable
        ? row.effectiveDistance.text
        : (row.rangeStatus === 'unknown' ? '?' : '-'),
      '',
      getRecommendationRangeTitle(row)
    );
    appendRecommendationCell(
      tableRow,
      createRecommendationFlag(
        row.hasOneShotKill,
        'Yes',
        getRecommendationFlagTitle('oneShotKill', row.hasOneShotKill)
      )
    );
    appendRecommendationCell(
      tableRow,
      createRecommendationFlag(
        row.hasOneShotCritical,
        'Yes',
        getRecommendationFlagTitle('oneShotCritical', row.hasOneShotCritical)
      )
    );
    appendRecommendationCell(
      tableRow,
      createRecommendationFlag(
        row.hasTwoShotCritical,
        'Yes',
        getRecommendationFlagTitle('twoShotCritical', row.hasTwoShotCritical)
      )
    );
    appendRecommendationCell(
      tableRow,
      createRecommendationFlag(
        row.hasLowOverkillOhko,
        'Yes',
        getRecommendationFlagTitle('lowOverkillOhko', row.hasLowOverkillOhko)
      )
    );
    appendRecommendationCell(
      tableRow,
      createRecommendationFlag(
        row.hasFastTtk,
        'Yes',
        getRecommendationFlagTitle('fastTtk', row.hasFastTtk)
      )
    );
    appendRecommendationCell(
      tableRow,
      createRecommendationFlag(
        row.penetratesAll,
        'Yes',
        getRecommendationFlagTitle('penetratesAll', row.penetratesAll)
      )
    );
    appendRecommendationCell(
      tableRow,
      row.tip || '—',
      row.tip ? '' : 'muted',
      getRecommendationTipTitle(row, usingFallbackRows)
    );

    tbody.appendChild(tableRow);
  });

  table.appendChild(tbody);
  tableWrap.appendChild(table);
  body.appendChild(tableWrap);
  panel.appendChild(body);
  container.appendChild(panel);
}

function renderFocusedSupplementalPanels(container, enemy) {
  if (!enemy?.zones || enemy.zones.length === 0) {
    return;
  }

  const wrapper = document.createElement('div');
  wrapper.className = 'calc-compare-results calc-focused-results';
  renderTacticalGuidePanel(wrapper, enemy);
  renderWeakspotBundlesPanel(wrapper, enemy);
  renderRecommendationPanel(wrapper, enemy);
  if (wrapper.childElementCount > 0) {
    container.appendChild(wrapper);
  }
}

export function renderCalculation() {
  const container = document.getElementById('calculator-result');
  if (!container) {
    return;
  }

  container.innerHTML = '';

  if (calculatorState.mode === 'compare') {
    if (calculatorState.compareView === 'overview') {
      renderOverviewCalculation(container);
      return;
    }

    const compareWrapper = document.createElement('div');
    compareWrapper.className = 'calc-compare-results';

    renderComparePanel(compareWrapper, 'A', calculateDamage('A'));
    renderComparePanel(compareWrapper, 'B', calculateDamage('B'));

    container.appendChild(compareWrapper);
    renderFocusedSupplementalPanels(container, calculatorState.selectedEnemy);
    return;
  }

  const results = calculateDamage('A');
  if (!results) {
    appendEmptyCalculationState(container, 'A');
    return;
  }

  renderCalculationContent(container, 'A', results);
  renderFocusedSupplementalPanels(container, results.enemy);
}
