// calculator/calculation.js — damage calculation logic
import {
  adjustAttackHitCount,
  calculatorState,
  getAttackHitCounts,
  getEnemyOptions,
  getSelectedAttacks,
  getSelectedExplosiveZoneIndices,
  getSelectedZone,
  getWeaponForSlot
} from './data.js';
import { buildHallOfFameEntries, buildOverviewRows, getAttackRowKey } from './compare-utils.js';
import { splitAttacksByApplication } from './attack-types.js';
import { formatTtkSeconds } from './summary.js';
import { summarizeEnemyTargetScenario } from './zone-damage.js';
import { renderEnemyDetails } from './rendering.js';

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
  const apMultiText = attackResult.ap < attackResult.av ? '0 (AP < AV)' :
    attackResult.ap === attackResult.av ? '0.65 (AP = AV)' :
      '1.0 (AP > AV)';
  const dmgMultiplied = attackResult.dmg * (1 - attackResult.durPercent);
  const durMultiplied = attackResult.dur * attackResult.durPercent;
  const exMultValue = attackResult.isExplosion ? attackResult.explosionModifier : 1.0;
  const exMultTextExpanded = attackResult.isExplosion
    ? (
      attackResult.explosionModifier === 0
        ? '0 (ExMult: immune)'
        : `${attackResult.explosionModifier} (${attackResult.hasExplicitExplosionMultiplier ? 'ExMult' : 'implicit ExMult'})`
    )
    : '1.0';

  return `= (${dmgMultiplied.toFixed(2)} + ${durMultiplied.toFixed(2)}) × ${exMultValue} × ${attackResult.damageMultiplier} = ((${attackResult.dmg} × (1 - ${attackResult.durPercent})) + (${attackResult.dur} × ${attackResult.durPercent})) × ${exMultTextExpanded} × ${apMultiText}`;
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
  damageValue.textContent = `${application.zoneName}: ${application.zoneDamage.toFixed(2)} zone`;
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
    mainDamageValue.textContent = `Main: ${application.totalMainDamage.toFixed(2)} (${application.directMainDamage.toFixed(2)} direct + ${application.passthroughMainDamage.toFixed(2)} passthrough)`;
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
  attackTotals.textContent = `Cycle total: ${attack.totalZoneDamagePerCycle.toFixed(2)} zone • ${attack.totalDamageToMainPerCycle.toFixed(2)} main`;
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
    denominator.textContent = `${totalDamagePerCycle.toFixed(2)}`;

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
      conDenominator.textContent = `${totalDamagePerCycle.toFixed(2)}`;

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
    zoneDamageDisplay.textContent = `${totalDamagePerCycle.toFixed(2)}`;
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
    denominator.textContent = `${totalDamageToMainPerCycle.toFixed(2)}`;

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
    mainDamageDisplay.textContent = `${totalDamageToMainPerCycle.toFixed(2)}`;
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
    return;
  }

  const results = calculateDamage('A');
  if (!results) {
    appendEmptyCalculationState(container, 'A');
    return;
  }

  renderCalculationContent(container, 'A', results);
}
