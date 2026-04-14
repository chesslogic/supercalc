import { EFFECTIVE_DISTANCE_TOOLTIP } from '../effective-distance.js';
import { formatTtkSeconds } from '../summary.js';
import { getZoneOutcomeDescription, getZoneOutcomeLabel } from '../zone-damage.js';
import {
  RECOMMENDATION_FLAG_TITLES,
  RECOMMENDATION_MARGIN_THRESHOLD_PERCENT
} from './recommendation-constants.js';

export function getRecommendationHitAssumptionLines(row) {
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

export function getRecommendationTargetTitle(row) {
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

export function getRecommendationAttackTitle(row) {
  const attackName = String(row?.attackName || 'Attack').trim() || 'Attack';
  const attackLabel = row?.isCombinedPackage ? 'Attack package' : 'Attack row';
  return `${attackLabel}: ${attackName}\n${getRecommendationHitAssumptionLines(row).join('\n')}`;
}

export function getRecommendationShotsTitle(row) {
  const shotsToKill = row?.shotsToKill;
  const lines = [
    shotsToKill === null
      ? 'Shots-to-kill is unavailable for this breakpoint.'
      : `${shotsToKill} ${shotsToKill === 1 ? 'shot' : 'shots'} to reach the listed outcome.`
  ];
  lines.push(...getRecommendationHitAssumptionLines(row));
  return lines.join('\n');
}

export function getRecommendationTtkTitle(row) {
  const lines = [
    row?.ttkSeconds === null
      ? 'TTK unavailable without RPM.'
      : `${formatTtkSeconds(row.ttkSeconds)} to reach the listed outcome at the weapon\'s RPM.`
  ];
  lines.push(...getRecommendationHitAssumptionLines(row));
  return lines.join('\n');
}

export function getRecommendationRangeTitle(row) {
  const baseTitle = row?.effectiveDistance?.title || EFFECTIVE_DISTANCE_TOOLTIP;

  if (row?.rangeStatus === 'failed') {
    return `${baseTitle}\nThis breakpoint falls short of the current range floor, so range-sensitive highlights do not count.`;
  }

  if (row?.rangeStatus === 'unknown') {
    return `${baseTitle}\nThis row stays listed, but range-sensitive highlights do not count until the breakpoint range is known.`;
  }

  return `${baseTitle}\nThis breakpoint qualifies for range-sensitive highlights at the current range floor.`;
}

export function getRecommendationMarginLabel(row) {
  if (!Number.isFinite(row?.marginPercent)) {
    return '—';
  }

  return `+${Math.max(0, Math.round(row.marginPercent))}%`;
}

export function getRecommendationMarginTitle(row) {
  const marginLabel = getRecommendationMarginLabel(row);
  if (marginLabel !== '—') {
    return row?.qualifiesForMargin
      ? `One-shot margin: ${marginLabel}. Meets the Margin highlight at the current range floor (+${RECOMMENDATION_MARGIN_THRESHOLD_PERCENT}% or less extra damage).`
      : `One-shot margin: ${marginLabel}. Does not currently meet the Margin highlight (+${RECOMMENDATION_MARGIN_THRESHOLD_PERCENT}% or less extra damage at the current range floor).`;
  }

  return 'Margin is shown for one-shot kill or critical rows when displayed damage per cycle can be compared against the target health.';
}

export function getRecommendationFlagTitle(flagKey, value) {
  const metadata = RECOMMENDATION_FLAG_TITLES[flagKey];
  if (!metadata) {
    return value ? 'Highlighted recommendation.' : 'This highlight is not met.';
  }

  return value ? metadata.active : metadata.inactive;
}

export function getRecommendationTipTitle(row, isFallbackRow = false) {
  const lines = Array.isArray(row?.matchedZoneNames) && row.matchedZoneNames.length > 1
    ? [`Staged path: ${row.matchedZoneNames.join(' -> ')}`]
    : ['No extra breakpoint note for this recommendation.'];

  if (isFallbackRow) {
    lines.push('This row is shown as a fallback because nothing met the current highlight checks.');
  }

  return lines.join('\n');
}
