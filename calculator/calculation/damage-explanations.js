import { formatDamageValue } from '../damage-rounding.js';

export function buildDamageFormulaText(attackResult) {
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
