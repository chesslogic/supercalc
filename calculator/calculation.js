// calculator/calculation.js — damage calculation logic
import {
  adjustAttackHitCount,
  calculatorState,
  getAttackHitCounts,
  getEngagementRangeMeters,
  getEnemyOptions,
  getSelectedEnemyTargetTypes,
  getSelectedAttacks,
  getSelectedExplosiveZoneIndices,
  getSelectedZone,
  getWeaponForSlot,
  setRecommendationWeaponFilterMode,
  setSelectedZoneIndex,
  toggleRecommendationWeaponFilterSub,
  toggleRecommendationWeaponFilterType,
  clearRecommendationWeaponFilters
} from './data.js';
import { buildHallOfFameEntries, buildOverviewRows, getAttackRowKey } from './compare-utils.js';
import { splitAttacksByApplication } from './attack-types.js';
import { formatDamageValue } from './damage-rounding.js';
import {
  formatEngagementRangeMeters,
  getEngagementRangeSummaryText,
  getRecommendationHighlightRangeFloorMeters,
  getRecommendationRangeContextText,
  getRecommendationRangeSummaryText,
  RECOMMENDATION_RANGE_FLOOR_TITLE
} from './engagement-range.js';
import { EFFECTIVE_DISTANCE_TOOLTIP } from './effective-distance.js';
import { getZoneRelationContext } from '../enemies/data.js';
import { renderResultPanel } from './result-panel.js';
import { formatTtkSeconds } from './summary.js';
import { getZoneOutcomeDescription, getZoneOutcomeLabel, summarizeEnemyTargetScenario } from './zone-damage.js';
import { refreshEnemyCalculationViews, renderEnemyDetails } from './rendering.js';
import { state as weaponsState } from '../weapons/data.js';
import {
  buildRelatedTargetRecommendationRows,
  buildSelectedTargetRecommendationRows,
  buildWeaponRecommendationRows,
  RECOMMENDATION_MARGIN_RATIO_THRESHOLD
} from './recommendations.js';
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

function normalizeZoneNameKey(value) {
  return String(value ?? '').trim().toLowerCase();
}

function getZoneIndicesByNames(enemy, zoneNames = []) {
  const normalizedZoneNames = new Set(
    (Array.isArray(zoneNames) ? zoneNames : [])
      .map((zoneName) => normalizeZoneNameKey(zoneName))
      .filter(Boolean)
  );
  if (normalizedZoneNames.size === 0) {
    return [];
  }

  return (enemy?.zones || [])
    .map((zone, zoneIndex) => (
      normalizedZoneNames.has(normalizeZoneNameKey(zone?.zone_name))
        ? zoneIndex
        : null
    ))
    .filter((zoneIndex) => zoneIndex !== null);
}

function getUniqueZoneNameList(zoneNames = [], {
  excludeZoneNames = []
} = {}) {
  const excludedZoneNames = new Set(
    (Array.isArray(excludeZoneNames) ? excludeZoneNames : [])
      .map((zoneName) => normalizeZoneNameKey(zoneName))
      .filter(Boolean)
  );

  return [...new Set(
    (Array.isArray(zoneNames) ? zoneNames : [])
      .map((zoneName) => String(zoneName ?? '').trim())
      .filter((zoneName) => zoneName && !excludedZoneNames.has(normalizeZoneNameKey(zoneName)))
  )];
}

function getRelatedRouteSummaryText({
  selectedZone,
  selectedZoneIsPriorityTarget = false,
  relatedRouteGroupLabelText = 'this anatomy group',
  allPriorityTargetZoneNames = [],
  relatedRouteZoneNames = [],
  hasRelatedTargetRows = false,
  recommendationRangeSummary = ''
}) {
  const priorityTargetText = allPriorityTargetZoneNames.join(', ') || selectedZone?.zone_name || 'this linked target';
  const relatedRoutePartText = selectedZoneIsPriorityTarget && relatedRouteZoneNames.length > 0
    ? ` Other linked route parts: ${relatedRouteZoneNames.join(', ')}.`
    : '';

  if (hasRelatedTargetRows) {
    return `Linked priority targets in ${relatedRouteGroupLabelText}: ${priorityTargetText}.${relatedRoutePartText} Hover the enemy table to see linked and mirrored parts.`;
  }

  if (selectedZoneIsPriorityTarget) {
    return `Linked priority targets in ${relatedRouteGroupLabelText}: ${priorityTargetText}.${relatedRoutePartText} ${selectedZone?.zone_name || 'The selected part'} is itself a linked priority target.`;
  }

  return `Linked priority targets in ${relatedRouteGroupLabelText}: ${priorityTargetText}. No related routes are currently available with the current engagement settings (${recommendationRangeSummary}).`;
}

function getRelatedRouteEmptyStateText({
  selectedZone,
  selectedZoneIsPriorityTarget = false
}) {
  if (selectedZoneIsPriorityTarget) {
    return `${selectedZone?.zone_name || 'The selected part'} is already a linked priority target, so the exact target rows above already cover the route endpoint.`;
  }

  return 'No recommendation rows are available for this target.';
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
  const engagementRangeMeters = getEngagementRangeMeters(slot);

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
    weapon,
    selectedAttacks,
    hitCounts,
    rpm: weapon?.rpm,
    projectileZoneIndex: calculatorState.selectedZoneIndex,
    explosiveZoneIndices,
    distanceMeters: engagementRangeMeters
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
    engagementRangeMeters,
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

const RECOMMENDATION_MARGIN_THRESHOLD_PERCENT = Math.round(RECOMMENDATION_MARGIN_RATIO_THRESHOLD * 100);
const RECOMMENDATION_DISPLAY_LIMIT = 24;
const TARGETED_RECOMMENDATION_DISPLAY_LIMIT = 12;
const RELATED_ROUTE_RECOMMENDATION_DISPLAY_LIMIT = 12;
const RECOMMENDATION_CORE_TYPE_MINIMUM = 2;
const RECOMMENDATION_CORE_TYPE_ORDER = ['primary', 'secondary', 'grenade', 'support'];
const RECOMMENDATION_FILTER_TYPE_ORDER = ['primary', 'secondary', 'grenade', 'support', 'stratagem'];
const RECOMMENDATION_HIGHLIGHT_SUMMARY_TITLE = 'Highlighted rows are recommendations that light up Margin, Crit, <0.6s, or Pen All.';
const RECOMMENDATION_HEADER_DEFINITIONS = [
  { label: 'Weapon', title: 'Weapon entry for this recommendation row.' },
  { label: 'Attack', title: 'Best-ranked attack row or firing package for this weapon.' },
  { label: 'Target', title: 'Best-ranked target zone for the listed attack setup, plus the outcome badge.' },
  { label: 'Shots', title: 'Shots or firing cycles needed to reach the listed outcome using the recommendation preview hit-count.' },
  { label: 'TTK', title: 'Modeled time to reach the listed outcome at the weapon\'s RPM.' },
  {
    label: 'Range',
    title: `${EFFECTIVE_DISTANCE_TOOLTIP}\nUnknown-range rows stay listed, but range-sensitive highlights only count when the breakpoint qualifies.`
  },
  { label: 'Margin', title: `Numeric one-shot kill or critical margin. Highlighted Margin rows stay at +${RECOMMENDATION_MARGIN_THRESHOLD_PERCENT}% or less extra damage at the current range floor.` },
  { label: 'Crit', title: 'Critical-disable highlight at the current range floor, covering one- and two-shot critical breakpoints.' },
  { label: '<0.6s', title: 'Fast-TTK highlight for rows under 0.6 seconds at the current range floor.' },
  { label: 'Pen All', title: 'Highlights attack setups that can damage every zone on the current enemy.' },
  { label: 'Tip', title: 'Short note explaining why this breakpoint stands out or what path it follows.' }
];
const RECOMMENDATION_FLAG_TITLES = {
  criticalRecommendation: {
    active: 'Meets the critical-disable highlight at the current range floor (one or two shots).',
    inactive: 'Does not currently meet the critical-disable highlight.'
  },
  fastTtk: {
    active: 'Meets the sub-0.6s TTK highlight at the current range floor.',
    inactive: 'Does not currently meet the sub-0.6s TTK highlight.'
  },
  penetratesAll: {
    active: 'This attack setup can damage every zone on the current enemy.',
    inactive: 'At least one zone on the current enemy takes no damage from this attack setup.'
  }
};

function getRecommendationHitAssumptionLines(row) {
  const packageComponents = Array.isArray(row?.packageComponents)
    ? row.packageComponents.filter(Boolean)
    : [];
  if (packageComponents.length > 1) {
    const lines = ['Recommendation preview assumes this combined package per firing cycle:'];
    packageComponents.forEach((component, index) => {
      const normalizedHitCount = Number.isFinite(component?.hitCount) && component.hitCount > 0
        ? Math.max(1, component.hitCount)
        : 1;
      lines.push(
        `${index + 1}. ${String(component?.attackName || `Component ${index + 1}`).trim() || `Component ${index + 1}`}: ${normalizedHitCount} ${normalizedHitCount === 1 ? 'hit' : 'hits'}`
      );
    });

    if (Array.isArray(row?.excludedAttackNames) && row.excludedAttackNames.length > 0) {
      lines.push(`Conservative auto-package excludes: ${row.excludedAttackNames.join(', ')}`);
    }

    lines.push('"Shots" counts firing cycles, not individual impacts.');
    return lines;
  }

  const hitCount = packageComponents[0]?.hitCount ?? row?.hitCount;
  const normalizedHitCount = Number.isFinite(hitCount) && hitCount > 0
    ? Math.max(1, hitCount)
    : 1;

  return [
    normalizedHitCount === 1
      ? 'Recommendation preview assumes 1 hit per firing cycle for this row.'
      : `Recommendation preview assumes ${normalizedHitCount} hits per firing cycle for this row, so "Shots" counts firing cycles, not individual projectiles.`
  ];
}

function getRecommendationSummaryTitle(hasHighlightedRows) {
  return hasHighlightedRows
    ? `${RECOMMENDATION_HIGHLIGHT_SUMMARY_TITLE}\nRows without those highlights are hidden from this table.`
    : `${RECOMMENDATION_HIGHLIGHT_SUMMARY_TITLE}\nNothing matches right now, so the table falls back to the best-ranked row for each weapon.`;
}

function normalizeRecommendationWeaponType(type) {
  return String(type ?? '').trim().toLowerCase();
}

function getRecommendationCoreType(row) {
  const normalizedType = normalizeRecommendationWeaponType(row?.weapon?.type);
  return RECOMMENDATION_CORE_TYPE_ORDER.includes(normalizedType)
    ? normalizedType
    : null;
}

function normalizeRecommendationWeaponSub(sub) {
  return String(sub ?? '').trim().toLowerCase();
}

function getRecommendationFilterChipLabel(value, kind = 'type') {
  const normalizedValue = String(value ?? '').trim();
  if (!normalizedValue) {
    return '';
  }

  return kind === 'sub'
    ? normalizedValue.toUpperCase()
    : normalizedValue.charAt(0).toUpperCase() + normalizedValue.slice(1);
}

function getAvailableRecommendationWeaponTypes(weapons = []) {
  const presentTypes = new Set(
    (Array.isArray(weapons) ? weapons : [])
      .map((weapon) => normalizeRecommendationWeaponType(weapon?.type))
      .filter(Boolean)
  );

  return RECOMMENDATION_FILTER_TYPE_ORDER.filter((type) => presentTypes.has(type));
}

function getAvailableRecommendationWeaponSubs(weapons = []) {
  return [...new Set(
    (Array.isArray(weapons) ? weapons : [])
      .map((weapon) => normalizeRecommendationWeaponSub(weapon?.sub))
      .filter(Boolean)
  )].sort((left, right) => left.localeCompare(right));
}

function hasActiveRecommendationWeaponFilters() {
  return calculatorState.recommendationWeaponFilterTypes.length > 0
    || calculatorState.recommendationWeaponFilterSubs.length > 0;
}

function doesWeaponMatchRecommendationFilters(weapon) {
  const hasTypeFilters = calculatorState.recommendationWeaponFilterTypes.length > 0;
  const hasSubFilters = calculatorState.recommendationWeaponFilterSubs.length > 0;
  if (!hasTypeFilters && !hasSubFilters) {
    return true;
  }

  const normalizedType = normalizeRecommendationWeaponType(weapon?.type);
  const normalizedSub = normalizeRecommendationWeaponSub(weapon?.sub);
  const matchesType = hasTypeFilters && calculatorState.recommendationWeaponFilterTypes.includes(normalizedType);
  const matchesSub = hasSubFilters && calculatorState.recommendationWeaponFilterSubs.includes(normalizedSub);
  const matchesAnyFilter = matchesType || matchesSub;

  return calculatorState.recommendationWeaponFilterMode === 'include'
    ? matchesAnyFilter
    : !matchesAnyFilter;
}

function getFilteredRecommendationWeapons(weapons = []) {
  return (Array.isArray(weapons) ? weapons : []).filter((weapon) => doesWeaponMatchRecommendationFilters(weapon));
}

function getRecommendationWeaponFilterSummaryText() {
  if (!hasActiveRecommendationWeaponFilters()) {
    return '';
  }

  const labels = [
    ...calculatorState.recommendationWeaponFilterTypes.map((type) => getRecommendationFilterChipLabel(type, 'type')),
    ...calculatorState.recommendationWeaponFilterSubs.map((sub) => getRecommendationFilterChipLabel(sub, 'sub'))
  ];
  if (labels.length === 0) {
    return '';
  }

  return calculatorState.recommendationWeaponFilterMode === 'include'
    ? ` Weapon filters: showing only ${labels.join(', ')}.`
    : ` Weapon filters: hiding ${labels.join(', ')}.`;
}

function createRecommendationFilterChip({
  label,
  active = false,
  onClick
}) {
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = `chip${active ? ' active' : ''}`;
  chip.textContent = label;
  chip.addEventListener('click', () => {
    onClick?.();
    refreshEnemyCalculationViews();
  });
  return chip;
}

function createRecommendationFilterChipRow({
  label,
  chips = []
}) {
  const row = document.createElement('div');
  row.className = 'chiprow';

  const rowLabel = document.createElement('span');
  rowLabel.className = 'muted';
  rowLabel.textContent = label;
  row.appendChild(rowLabel);

  chips.forEach((chip) => row.appendChild(chip));
  return row;
}

const RELATED_TARGET_CHIP_MAX = 8;

function createRelatedTargetChipRow({ enemy, allPriorityTargetZoneIndices, selectedZoneIndex }) {
  const row = document.createElement('div');
  row.className = 'chiprow calc-related-target-chips';

  const label = document.createElement('span');
  label.className = 'muted';
  label.textContent = 'Switch target:';
  row.appendChild(label);

  const limitedIndices = allPriorityTargetZoneIndices.slice(0, RELATED_TARGET_CHIP_MAX);
  limitedIndices.forEach((zoneIndex) => {
    const zone = enemy?.zones?.[zoneIndex];
    if (!zone) {
      return;
    }

    const isActive = zoneIndex === selectedZoneIndex;
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = `chip${isActive ? ' active' : ''}`;
    chip.textContent = zone.zone_name;
    chip.title = isActive ? `Currently targeting: ${zone.zone_name}` : `Switch to ${zone.zone_name}`;

    if (!isActive) {
      chip.addEventListener('click', () => {
        setSelectedZoneIndex(zoneIndex);
        refreshEnemyCalculationViews();
      });
    }

    row.appendChild(chip);
  });

  if (allPriorityTargetZoneIndices.length > RELATED_TARGET_CHIP_MAX) {
    const overflow = document.createElement('span');
    overflow.className = 'muted';
    overflow.textContent = `+${allPriorityTargetZoneIndices.length - RELATED_TARGET_CHIP_MAX} more`;
    row.appendChild(overflow);
  }

  return row;
}

function renderRecommendationWeaponFilterControls(weapons = []) {
  const wrapper = document.createElement('div');
  wrapper.className = 'calc-recommend-filters';

  const modeRow = createRecommendationFilterChipRow({
    label: 'Weapon filters',
    chips: [
      createRecommendationFilterChip({
        label: 'Exclude',
        active: calculatorState.recommendationWeaponFilterMode === 'exclude',
        onClick: () => setRecommendationWeaponFilterMode('exclude')
      }),
      createRecommendationFilterChip({
        label: 'Include',
        active: calculatorState.recommendationWeaponFilterMode === 'include',
        onClick: () => setRecommendationWeaponFilterMode('include')
      }),
      ...(hasActiveRecommendationWeaponFilters()
        ? [createRecommendationFilterChip({
            label: 'Clear',
            active: false,
            onClick: () => clearRecommendationWeaponFilters()
          })]
        : [])
    ]
  });
  wrapper.appendChild(modeRow);

  const typeChips = getAvailableRecommendationWeaponTypes(weapons).map((type) => createRecommendationFilterChip({
    label: getRecommendationFilterChipLabel(type, 'type'),
    active: calculatorState.recommendationWeaponFilterTypes.includes(type),
    onClick: () => toggleRecommendationWeaponFilterType(type)
  }));
  if (typeChips.length > 0) {
    wrapper.appendChild(createRecommendationFilterChipRow({
      label: 'Type',
      chips: typeChips
    }));
  }

  const subChips = getAvailableRecommendationWeaponSubs(weapons).map((sub) => createRecommendationFilterChip({
    label: getRecommendationFilterChipLabel(sub, 'sub'),
    active: calculatorState.recommendationWeaponFilterSubs.includes(sub),
    onClick: () => toggleRecommendationWeaponFilterSub(sub)
  }));
  if (subChips.length > 0) {
    wrapper.appendChild(createRecommendationFilterChipRow({
      label: 'Subtype',
      chips: subChips
    }));
  }

  return wrapper;
}

function getRecommendationDisplayTargetKey(row) {
  const zoneName = row?.bestZone?.zone_name || row?.bestZoneName || '';
  const normalizedZoneName = normalizeZoneNameKey(zoneName);
  return normalizedZoneName || null;
}

function incrementRecommendationSelectionCount(counts, key) {
  if (!key) {
    return;
  }

  counts.set(key, (counts.get(key) || 0) + 1);
}

function decrementRecommendationSelectionCount(counts, key) {
  if (!key) {
    return;
  }

  const nextCount = (counts.get(key) || 0) - 1;
  if (nextCount > 0) {
    counts.set(key, nextCount);
    return;
  }

  counts.delete(key);
}

function buildRecommendationCoreTypeMinimums(sourceRows, availableCoreTypes) {
  const minimumCoreCounts = new Map();
  availableCoreTypes.forEach((type) => {
    minimumCoreCounts.set(
      type,
      Math.min(
        RECOMMENDATION_CORE_TYPE_MINIMUM,
        sourceRows.filter((row) => getRecommendationCoreType(row) === type).length
      )
    );
  });
  return minimumCoreCounts;
}

function applyOverallRecommendationTargetDiversity({
  sourceRows,
  selectedRows,
  selectedRowSet,
  minimumCoreCounts
}) {
  if (selectedRows.length === 0) {
    return;
  }

  const sourceRowIndices = new Map(sourceRows.map((row, index) => [row, index]));
  const selectedTargetCounts = new Map();
  const selectedCoreTypeCounts = new Map();

  selectedRows.forEach((row) => {
    incrementRecommendationSelectionCount(selectedTargetCounts, getRecommendationDisplayTargetKey(row));
    incrementRecommendationSelectionCount(selectedCoreTypeCounts, getRecommendationCoreType(row));
  });

  sourceRows.forEach((candidateRow) => {
    if (selectedRowSet.has(candidateRow)) {
      return;
    }

    const candidateTargetKey = getRecommendationDisplayTargetKey(candidateRow);
    if (!candidateTargetKey || selectedTargetCounts.has(candidateTargetKey)) {
      return;
    }

    const candidateType = getRecommendationCoreType(candidateRow);
    let replacement = null;

    selectedRows.forEach((selectedRow, selectedIndex) => {
      const selectedTargetKey = getRecommendationDisplayTargetKey(selectedRow);
      if (!selectedTargetKey || (selectedTargetCounts.get(selectedTargetKey) || 0) < 2) {
        return;
      }

      const selectedType = getRecommendationCoreType(selectedRow);
      if (selectedType !== candidateType) {
        const selectedTypeCount = selectedType ? (selectedCoreTypeCounts.get(selectedType) || 0) : 0;
        const minimumTypeCount = selectedType ? (minimumCoreCounts.get(selectedType) || 0) : 0;
        if (selectedTypeCount <= minimumTypeCount) {
          return;
        }
      }

      const sourceIndex = sourceRowIndices.get(selectedRow) ?? -1;
      if (
        !replacement
        || sourceIndex > replacement.sourceIndex
        || (sourceIndex === replacement.sourceIndex && selectedIndex > replacement.selectedIndex)
      ) {
        replacement = {
          row: selectedRow,
          selectedIndex,
          sourceIndex,
          targetKey: selectedTargetKey,
          type: selectedType
        };
      }
    });

    if (!replacement) {
      return;
    }

    selectedRows[replacement.selectedIndex] = candidateRow;
    selectedRowSet.delete(replacement.row);
    selectedRowSet.add(candidateRow);
    decrementRecommendationSelectionCount(selectedTargetCounts, replacement.targetKey);
    incrementRecommendationSelectionCount(selectedTargetCounts, candidateTargetKey);

    if (replacement.type !== candidateType) {
      decrementRecommendationSelectionCount(selectedCoreTypeCounts, replacement.type);
      incrementRecommendationSelectionCount(selectedCoreTypeCounts, candidateType);
    }
  });
}

function buildOverallRecommendationDisplayRows(rows, limit = RECOMMENDATION_DISPLAY_LIMIT) {
  const sourceRows = Array.isArray(rows) ? rows.filter(Boolean) : [];
  const normalizedLimit = Math.max(0, Number.isFinite(limit) ? Math.trunc(limit) : RECOMMENDATION_DISPLAY_LIMIT);
  if (sourceRows.length <= normalizedLimit) {
    return {
      rows: sourceRows.slice(0, normalizedLimit),
      supplementedCoreTypes: []
    };
  }

  const availableCoreTypes = RECOMMENDATION_CORE_TYPE_ORDER.filter((type) => (
    sourceRows.some((row) => getRecommendationCoreType(row) === type)
  ));
  const minimumCoreCounts = buildRecommendationCoreTypeMinimums(sourceRows, availableCoreTypes);
  const reservedCoreSlots = Math.min(
    normalizedLimit,
    availableCoreTypes.length * RECOMMENDATION_CORE_TYPE_MINIMUM
  );
  const topSeedCount = Math.max(0, normalizedLimit - reservedCoreSlots);
  const selectedRows = sourceRows.slice(0, topSeedCount);
  const selectedRowSet = new Set(selectedRows);
  const supplementedCoreTypes = [];

  availableCoreTypes.forEach((type) => {
    const targetCount = minimumCoreCounts.get(type) || 0;
    let currentCount = selectedRows.filter((row) => getRecommendationCoreType(row) === type).length;
    let supplemented = false;

    for (const row of sourceRows) {
      if (currentCount >= targetCount || selectedRows.length >= normalizedLimit) {
        break;
      }
      if (selectedRowSet.has(row) || getRecommendationCoreType(row) !== type) {
        continue;
      }

      selectedRows.push(row);
      selectedRowSet.add(row);
      currentCount += 1;
      supplemented = true;
    }

    if (supplemented) {
      supplementedCoreTypes.push(type);
    }
  });

  for (const row of sourceRows) {
    if (selectedRows.length >= normalizedLimit) {
      break;
    }
    if (selectedRowSet.has(row)) {
      continue;
    }

    selectedRows.push(row);
    selectedRowSet.add(row);
  }
  const preservedCoreCounts = new Map(
    availableCoreTypes.map((type) => [
      type,
      Math.min(
        minimumCoreCounts.get(type) || 0,
        selectedRows.filter((row) => getRecommendationCoreType(row) === type).length
      )
    ])
  );

  applyOverallRecommendationTargetDiversity({
    sourceRows,
    selectedRows,
    selectedRowSet,
    minimumCoreCounts: preservedCoreCounts
  });

  return {
    rows: selectedRows,
    supplementedCoreTypes
  };
}

function buildOverallRecommendationDisplaySequence(rows, limit = RECOMMENDATION_DISPLAY_LIMIT) {
  const sourceRows = Array.isArray(rows) ? rows.filter(Boolean) : [];
  const {
    rows: initialRows,
    supplementedCoreTypes
  } = buildOverallRecommendationDisplayRows(sourceRows, limit);
  const selectedRowSet = new Set(initialRows);

  return {
    rows: [
      ...initialRows,
      ...sourceRows.filter((row) => !selectedRowSet.has(row))
    ],
    supplementedCoreTypes
  };
}

function getRecommendationTargetTitle(row) {
  const zoneName = row?.bestZoneName || '—';
  const outcomeLabel = getZoneOutcomeLabel(row?.bestOutcomeKind);
  const outcomeDescription = getZoneOutcomeDescription(row?.bestOutcomeKind);
  const lines = [`Best-ranked target: ${zoneName}`];

  if (Array.isArray(row?.matchedZoneNames) && row.matchedZoneNames.length > 1) {
    lines.push(`Path: ${row.matchedZoneNames.join(' -> ')}`);
  }

  if (outcomeLabel && outcomeDescription) {
    lines.push(`${outcomeLabel}: ${outcomeDescription}`);
  } else if (outcomeLabel) {
    lines.push(`Outcome: ${outcomeLabel}`);
  }

  return lines.join('\n');
}

function getRecommendationAttackTitle(row) {
  const attackName = String(row?.attackName || 'Attack').trim() || 'Attack';
  const attackLabel = row?.isCombinedPackage ? 'Attack package' : 'Attack row';
  return `${attackLabel}: ${attackName}\n${getRecommendationHitAssumptionLines(row).join('\n')}`;
}

function getRecommendationShotsTitle(row) {
  const shotsToKill = row?.shotsToKill;
  const lines = [
    shotsToKill === null
      ? 'Shots-to-kill is unavailable for this breakpoint.'
      : `${shotsToKill} ${shotsToKill === 1 ? 'shot' : 'shots'} to reach the listed outcome.`
  ];
  lines.push(...getRecommendationHitAssumptionLines(row));
  return lines.join('\n');
}

function getRecommendationTtkTitle(row) {
  const lines = [
    row?.ttkSeconds === null
      ? 'TTK unavailable without RPM.'
      : `${formatTtkSeconds(row.ttkSeconds)} to reach the listed outcome at the weapon\'s RPM.`
  ];
  lines.push(...getRecommendationHitAssumptionLines(row));
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

function getRecommendationMarginLabel(row) {
  if (!Number.isFinite(row?.marginPercent)) {
    return '—';
  }

  return `+${Math.max(0, Math.round(row.marginPercent))}%`;
}

function getRecommendationMarginTitle(row) {
  const marginLabel = getRecommendationMarginLabel(row);
  if (marginLabel !== '—') {
    return row?.qualifiesForMargin
      ? `One-shot margin: ${marginLabel}. Meets the Margin highlight at the current range floor (+${RECOMMENDATION_MARGIN_THRESHOLD_PERCENT}% or less extra damage).`
      : `One-shot margin: ${marginLabel}. Does not currently meet the Margin highlight (+${RECOMMENDATION_MARGIN_THRESHOLD_PERCENT}% or less extra damage at the current range floor).`;
  }

  return 'Margin is shown for one-shot kill or critical rows when displayed damage per cycle can be compared against the target health.';
}

function getRecommendationFlagTitle(flagKey, value) {
  const metadata = RECOMMENDATION_FLAG_TITLES[flagKey];
  if (!metadata) {
    return value ? 'Highlighted recommendation.' : 'This highlight is not met.';
  }

  return value ? metadata.active : metadata.inactive;
}

function getRecommendationTipTitle(row, isFallbackRow = false) {
  const lines = Array.isArray(row?.matchedZoneNames) && row.matchedZoneNames.length > 1
    ? [`Staged path: ${row.matchedZoneNames.join(' -> ')}`]
    : ['No extra breakpoint note for this recommendation.'];

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

function createRecommendationFlag(value, label = 'Yes', title = '', inactiveLabel = '—') {
  const flag = document.createElement('span');
  flag.className = `calc-recommend-flag ${value ? 'is-true' : 'is-false'}`;
  if (title) {
    flag.title = title;
  }
  flag.textContent = value ? label : inactiveLabel;
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

function appendRecommendationTableRow(tbody, row, usingFallbackRows = false) {
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
      row.qualifiesForMargin,
      getRecommendationMarginLabel(row),
      getRecommendationMarginTitle(row),
      getRecommendationMarginLabel(row)
    )
  );
  appendRecommendationCell(
    tableRow,
    createRecommendationFlag(
      row.hasCriticalRecommendation,
      'Yes',
      getRecommendationFlagTitle('criticalRecommendation', row.hasCriticalRecommendation)
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
    '—',
    'muted',
    getRecommendationTipTitle(row, usingFallbackRows)
  );

  tbody.appendChild(tableRow);
}

function renderRecommendationTable({
  body,
  rows,
  usingFallbackRows = false,
  visibleCount = null
}) {
  const sourceRows = Array.isArray(rows) ? rows : [];
  const normalizedVisibleCount = Number.isFinite(visibleCount)
    ? Math.max(0, Math.trunc(visibleCount))
    : sourceRows.length;
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
  sourceRows.slice(0, normalizedVisibleCount).forEach((row) => {
    appendRecommendationTableRow(tbody, row, usingFallbackRows);
  });

  table.appendChild(tbody);
  tableWrap.appendChild(table);
  body.appendChild(tableWrap);

  return {
    tbody,
    renderedCount: Math.min(normalizedVisibleCount, sourceRows.length)
  };
}

function getRecommendationVisibleCountText(visibleCount, totalCount) {
  if (!Number.isFinite(totalCount) || totalCount <= 0) {
    return '';
  }

  return visibleCount >= totalCount
    ? `Showing all ${totalCount} recommendations.`
    : `Showing ${visibleCount} of ${totalCount} recommendations.`;
}

function getRecommendationShowMoreButtonText(step, remainingCount) {
  const increment = Math.max(1, Math.min(
    Number.isFinite(step) ? Math.trunc(step) : 1,
    Number.isFinite(remainingCount) ? Math.trunc(remainingCount) : 0
  ));
  return `+${increment} more`;
}

function renderRecommendationSubsection({
  body,
  titleText,
  summaryText,
  summaryTitle = '',
  controls = null,
  rows,
  usingFallbackRows = false,
  emptyStateText = 'No recommendation rows are available for this target.',
  displayStep = null
}) {
  const section = document.createElement('section');
  section.className = 'calc-recommend-section';

  const heading = document.createElement('div');
  heading.className = 'calc-recommend-section-title';
  heading.textContent = titleText;
  section.appendChild(heading);

  if (summaryText) {
    const summary = document.createElement('div');
    summary.className = 'calc-recommend-summary';
    summary.textContent = summaryText;
    if (summaryTitle) {
      summary.title = summaryTitle;
    }
    section.appendChild(summary);
  }

  if (controls) {
    section.appendChild(controls);
  }

  const sourceRows = Array.isArray(rows) ? rows : [];
  const normalizedDisplayStep = Number.isFinite(displayStep)
    ? Math.max(1, Math.trunc(displayStep))
    : 0;
  const initialVisibleCount = normalizedDisplayStep > 0
    ? Math.min(sourceRows.length, normalizedDisplayStep)
    : sourceRows.length;

  if (sourceRows.length === 0) {
    const emptyState = document.createElement('div');
    emptyState.className = 'muted';
    emptyState.textContent = emptyStateText;
    section.appendChild(emptyState);
  } else {
    let renderedCount = initialVisibleCount;
    let tbody = null;
    let moreButton = null;
    let paginationStatus = null;

    const updatePaginationControls = () => {
      if (!paginationStatus || !moreButton) {
        return;
      }

      paginationStatus.textContent = getRecommendationVisibleCountText(renderedCount, sourceRows.length);
      const remainingCount = sourceRows.length - renderedCount;
      if (remainingCount <= 0) {
        moreButton.classList.add('hidden');
        return;
      }

      moreButton.classList.remove('hidden');
      moreButton.textContent = getRecommendationShowMoreButtonText(normalizedDisplayStep, remainingCount);
    };

    if (normalizedDisplayStep > 0 && sourceRows.length > initialVisibleCount) {
      const pagination = document.createElement('div');
      pagination.className = 'calc-recommend-pagination';

      paginationStatus = document.createElement('span');
      paginationStatus.className = 'calc-recommend-pagination-status';
      pagination.appendChild(paginationStatus);

      moreButton = document.createElement('button');
      moreButton.type = 'button';
      moreButton.className = 'button calc-recommend-more-button';
      moreButton.addEventListener('click', () => {
        const nextCount = Math.min(sourceRows.length, renderedCount + normalizedDisplayStep);
        sourceRows.slice(renderedCount, nextCount).forEach((row) => {
          appendRecommendationTableRow(tbody, row, usingFallbackRows);
        });
        renderedCount = nextCount;
        updatePaginationControls();
      });
      pagination.appendChild(moreButton);
      section.appendChild(pagination);
    }

    const tableRender = renderRecommendationTable({
      body: section,
      rows: sourceRows,
      usingFallbackRows,
      visibleCount: initialVisibleCount
    });
    tbody = tableRender.tbody;
    updatePaginationControls();
  }

  body.appendChild(section);
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
  const rangeA = getEngagementRangeMeters('A');
  const rangeB = getEngagementRangeMeters('B');
  const highlightRangeFloorMeters = getRecommendationHighlightRangeFloorMeters(calculatorState.mode, rangeA, rangeB);
  const recommendationRangeSummary = getRecommendationRangeSummaryText(calculatorState.mode, rangeA, rangeB);
  const selectedZone = Number.isInteger(calculatorState.selectedZoneIndex)
    ? enemy?.zones?.[calculatorState.selectedZoneIndex] || null
    : null;
  const selectedZoneRelationContext = selectedZone
    ? getZoneRelationContext(enemy, selectedZone)
    : null;
  const selectedZoneIsPriorityTarget = Boolean(
    selectedZone
    && selectedZoneRelationContext?.priorityTargetZoneNames
      ?.map((zoneName) => normalizeZoneNameKey(zoneName))
      ?.includes(normalizeZoneNameKey(selectedZone.zone_name))
  );
  const allPriorityTargetZoneIndices = selectedZoneRelationContext
    ? getZoneIndicesByNames(enemy, selectedZoneRelationContext.priorityTargetZoneNames)
    : [];
  const allPriorityTargetZoneNames = allPriorityTargetZoneIndices
    .map((zoneIndex) => enemy?.zones?.[zoneIndex]?.zone_name || '')
    .filter(Boolean);
  const relatedRouteZoneNames = selectedZoneRelationContext
    ? getUniqueZoneNameList(selectedZoneRelationContext.sameZoneNames || [], {
        excludeZoneNames: [selectedZone?.zone_name || '']
      })
    : [];
  const relatedTargetZoneIndices = allPriorityTargetZoneIndices
    .filter((zoneIndex) => zoneIndex !== calculatorState.selectedZoneIndex);
  const relatedTargetZoneNames = relatedTargetZoneIndices
    .map((zoneIndex) => enemy?.zones?.[zoneIndex]?.zone_name || '')
    .filter(Boolean);
  const relatedRouteGroupLabelText = selectedZoneRelationContext?.groupLabels?.join(' / ') || 'this anatomy group';
  const shouldRenderRelatedRoutes = Boolean(
    selectedZone
    && selectedZoneRelationContext
    && allPriorityTargetZoneNames.length > 0
    && (relatedTargetZoneNames.length > 0 || relatedRouteZoneNames.length > 0)
  );

  const controlsNote = document.createElement('div');
  controlsNote.className = 'status calc-recommend-note';
  controlsNote.textContent = getRecommendationRangeContextText(calculatorState.mode, rangeA, rangeB);
  controlsNote.title = RECOMMENDATION_RANGE_FLOOR_TITLE;
  body.appendChild(controlsNote);

  if (!Array.isArray(weaponsState.groups) || weaponsState.groups.length === 0) {
    const emptyState = document.createElement('div');
    emptyState.className = 'muted';
    emptyState.textContent = 'Weapon data is still loading.';
    body.appendChild(emptyState);
    panel.appendChild(body);
    container.appendChild(panel);
    return;
  }

  const getEngagementRangeMetersForRecommendationWeapon = (weapon) => {
    const weaponA = getWeaponForSlot('A');
    const weaponB = getWeaponForSlot('B');
    if (weaponA && weaponA.name === weapon?.name) {
      return getEngagementRangeMeters('A');
    }
    if (weaponB && weaponB.name === weapon?.name) {
      return getEngagementRangeMeters('B');
    }
    return highlightRangeFloorMeters;
  };
  const overallRecommendationWeapons = getFilteredRecommendationWeapons(weaponsState.groups);
  const recommendationRows = buildWeaponRecommendationRows({
    enemy,
    weapons: overallRecommendationWeapons,
    rangeFloorMeters: highlightRangeFloorMeters,
    getEngagementRangeMetersForWeapon: getEngagementRangeMetersForRecommendationWeapon
  });
  const selectedTargetRows = buildSelectedTargetRecommendationRows({
    enemy,
    weapons: weaponsState.groups,
    rangeFloorMeters: highlightRangeFloorMeters,
    selectedZoneIndex: calculatorState.selectedZoneIndex,
    getEngagementRangeMetersForWeapon: getEngagementRangeMetersForRecommendationWeapon
  });
  const relatedTargetRows = buildRelatedTargetRecommendationRows({
    enemy,
    weapons: weaponsState.groups,
    rangeFloorMeters: highlightRangeFloorMeters,
    relatedZoneIndices: relatedTargetZoneIndices,
    getEngagementRangeMetersForWeapon: getEngagementRangeMetersForRecommendationWeapon
  });
  const flaggedRows = recommendationRows.filter((row) => (
    row.qualifiesForMargin
    || row.hasCriticalRecommendation
    || row.hasFastTtk
    || row.penetratesAll
  ));
  const hasFilteredOverallRows = recommendationRows.length > 0;
  const usingFallbackRows = hasFilteredOverallRows && flaggedRows.length === 0;
  const {
    rows: displayRows,
    supplementedCoreTypes
  } = hasFilteredOverallRows
    ? buildOverallRecommendationDisplaySequence(
        flaggedRows.length > 0 ? flaggedRows : recommendationRows,
        RECOMMENDATION_DISPLAY_LIMIT
      )
    : { rows: [], supplementedCoreTypes: [] };
  const initialOverallRows = displayRows.slice(0, RECOMMENDATION_DISPLAY_LIMIT);
  const overallRecommendationFilterSummaryText = getRecommendationWeaponFilterSummaryText();
  const overallRecommendationFilterControls = renderRecommendationWeaponFilterControls(weaponsState.groups);
  const overallRecommendationSummaryText = hasFilteredOverallRows
    ? (
        flaggedRows.length > 0
          ? `Showing ${initialOverallRows.length} highlighted recommendations using the current engagement settings (${recommendationRangeSummary}).${supplementedCoreTypes.length > 0 ? ' Core weapon-type coverage is backfilled where available.' : ''}${overallRecommendationFilterSummaryText}`
          : `No rows hit the current highlight checks using the current engagement settings (${recommendationRangeSummary}). Showing the best fallback rows instead.${supplementedCoreTypes.length > 0 ? ' Core weapon-type coverage is backfilled where available.' : ''}${overallRecommendationFilterSummaryText}`
      )
    : hasActiveRecommendationWeaponFilters()
      ? `No overall recommendation rows match the current weapon filters using the current engagement settings (${recommendationRangeSummary}).${overallRecommendationFilterSummaryText}`
      : `No overall recommendation rows are available using the current engagement settings (${recommendationRangeSummary}).`;
  const overallRecommendationSummaryTitle = hasFilteredOverallRows
    ? getRecommendationSummaryTitle(!usingFallbackRows)
    : '';
  const overallRecommendationEmptyStateText = hasActiveRecommendationWeaponFilters()
    ? 'No recommendation rows match the current weapon filters.'
    : 'No recommendation rows are available right now.';

  if (selectedZone) {
    const hasRelatedTargetChips = relatedTargetZoneIndices.length > 0;
    const relatedTargetChips = hasRelatedTargetChips
      ? createRelatedTargetChipRow({
          enemy,
          allPriorityTargetZoneIndices,
          selectedZoneIndex: calculatorState.selectedZoneIndex
        })
      : null;
    renderRecommendationSubsection({
      body,
      titleText: `${selectedZone.zone_name} targeted recommendations`,
      summaryText: selectedTargetRows.length > 0
        ? `Best attack rows for removing or reaching the selected target using the current engagement settings (${recommendationRangeSummary}).`
        : `No dedicated target rows are available for ${selectedZone.zone_name} using the current engagement settings (${recommendationRangeSummary}).`,
      controls: relatedTargetChips,
      rows: selectedTargetRows,
      displayStep: TARGETED_RECOMMENDATION_DISPLAY_LIMIT
    });
  }

  if (shouldRenderRelatedRoutes) {
    renderRecommendationSubsection({
      body,
      titleText: `${selectedZone.zone_name} related routes`,
      summaryText: getRelatedRouteSummaryText({
        selectedZone,
        selectedZoneIsPriorityTarget,
        relatedRouteGroupLabelText,
        allPriorityTargetZoneNames,
        relatedRouteZoneNames,
        hasRelatedTargetRows: relatedTargetRows.length > 0,
        recommendationRangeSummary
      }),
      rows: relatedTargetRows,
      displayStep: RELATED_ROUTE_RECOMMENDATION_DISPLAY_LIMIT,
      emptyStateText: getRelatedRouteEmptyStateText({
        selectedZone,
        selectedZoneIsPriorityTarget
      })
    });
  }

  renderRecommendationSubsection({
    body,
    titleText: 'Overall recommendations',
    summaryText: overallRecommendationSummaryText,
    summaryTitle: overallRecommendationSummaryTitle,
    controls: overallRecommendationFilterControls,
    rows: displayRows,
    displayStep: RECOMMENDATION_DISPLAY_LIMIT,
    usingFallbackRows,
    emptyStateText: overallRecommendationEmptyStateText
  });
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

    ['A', 'B'].forEach((slot) => {
      const results = calculateDamage(slot);
      renderResultPanel(compareWrapper, {
        slot,
        title: results?.weapon?.name || `Weapon ${slot}`,
        showCompareShell: true,
        renderContent: results ? (panelBody) => renderCalculationContent(panelBody, slot, results) : null,
        renderEmpty: results ? null : (panelBody) => appendEmptyCalculationState(panelBody, slot)
      });
    });

    container.appendChild(compareWrapper);
    renderFocusedSupplementalPanels(container, calculatorState.selectedEnemy);
    return;
  }

  const results = calculateDamage('A');
  renderResultPanel(container, {
    slot: 'A',
    emptyText: getEmptyCalculationMessage('A'),
    renderContent: results ? (panelBody) => renderCalculationContent(panelBody, 'A', results) : null,
    renderEmpty: results ? null : (panelBody) => appendEmptyCalculationState(panelBody, 'A')
  });
  if (!results) {
    return;
  }

  renderFocusedSupplementalPanels(container, results.enemy);
}
