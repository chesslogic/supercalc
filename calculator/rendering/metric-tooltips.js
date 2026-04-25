import { calculatorState } from '../data.js';
import { getDiffDisplayMetric } from '../compare-utils.js';
import { buildCompareTtkTooltip } from '../compare-tooltips.js';
import { formatTtkSeconds } from '../summary.js';
import { getZoneOutcomeDescription } from '../zone-damage.js';

export function formatPercentDiff(value) {
  const prefix = value > 0 ? '+' : '';
  return `${prefix}${value.toFixed(1).replace(/\.0$/, '')}%`;
}

function usesBeamCadence(slotMetrics) {
  return Boolean(slotMetrics?.usesBeamCadence);
}

function metricsUseBeamCadence(metrics) {
  return usesBeamCadence(metrics?.bySlot?.A) || usesBeamCadence(metrics?.bySlot?.B);
}

function getBeamTicksPerSecond(slotMetrics) {
  const beamTicksPerSecond = Number(slotMetrics?.beamTicksPerSecond);
  return Number.isFinite(beamTicksPerSecond) && beamTicksPerSecond > 0
    ? beamTicksPerSecond
    : null;
}

function joinTooltipLines(...lines) {
  return lines.filter(Boolean).join('\n') || null;
}

function buildBeamShotsTitle(slotMetrics) {
  const beamTicksPerSecond = getBeamTicksPerSecond(slotMetrics);
  const cadenceText = beamTicksPerSecond === null
    ? 'beam cadence'
    : `${beamTicksPerSecond} beam ticks/sec`;
  return `Continuous beam row: displayed count is sustained-contact beam ticks to kill (${cadenceText}), not trigger pulls.`;
}

function buildBeamTtkTitle(slotMetrics) {
  const beamTicksPerSecond = getBeamTicksPerSecond(slotMetrics);
  const cadenceText = beamTicksPerSecond === null
    ? 'beam cadence'
    : `${beamTicksPerSecond} beam ticks/sec`;
  return `Continuous beam row: displayed TTK assumes sustained contact at ${cadenceText}.`;
}

function buildBeamMarginUnavailableTitle() {
  return 'Margin unavailable for continuous beam rows. Tiny tick-boundary overfill is not a useful signal; use beam ticks and sustained-contact TTK instead.';
}

function getOutcomeDescription(slotMetrics, valueType) {
  if (valueType === 'ttk' && slotMetrics.outcomeKind === 'limb') {
    return 'This part can be removed, but it breaks before it can kill main';
  }

  if (valueType === 'ttk' && slotMetrics.outcomeKind === 'critical') {
    return slotMetrics.criticalInfo?.tip
      || 'This part is a critical disable target and breaks before the body kill path.';
  }

  if (valueType === 'ttk' && slotMetrics.outcomeKind === 'utility') {
    return 'This part can be removed, but destroying it does not kill the enemy';
  }

  return getZoneOutcomeDescription(slotMetrics.outcomeKind);
}

export function getDiffMetricTitle(diffMetric, valueType, diffDisplayMode = 'absolute', metrics = null) {
  if (calculatorState.mode === 'compare' && valueType === 'ttk') {
    const compareTitle = buildCompareTtkTooltip(metrics?.bySlot?.A, metrics?.bySlot?.B);
    if (compareTitle) {
      return compareTitle;
    }
  }

  const displayMetric = getDiffDisplayMetric(diffMetric, diffDisplayMode);
  if (displayMetric.kind === 'unavailable') {
    if (diffDisplayMode === 'percent') {
      return 'Percent diff unavailable when either side is unavailable or A has no positive baseline';
    }
    return 'Diff unavailable when either side is unavailable';
  }

  if (displayMetric.kind === 'one-sided') {
    const metricLabel = valueType === 'ttk'
      ? 'TTK'
      : (metricsUseBeamCadence(metrics) ? 'displayed count' : 'shots');
    const displayValue = valueType === 'ttk'
      ? formatTtkSeconds(displayMetric.displayValue)
      : String(displayMetric.displayValue);
    return `Only weapon ${displayMetric.winner} can damage this part with the current selection (${displayMetric.winner} ${metricLabel}: ${displayValue})`;
  }

  if (valueType === 'shots' && metricsUseBeamCadence(metrics)) {
    return diffDisplayMode === 'percent'
      ? 'Percent diff = ((B - A) / A) × 100. Continuous beam rows use beam ticks, not trigger pulls.'
      : 'Diff = B - A. Continuous beam rows use beam ticks, not trigger pulls.';
  }

  return diffDisplayMode === 'percent'
    ? 'Percent diff = ((B - A) / A) × 100'
    : 'Diff = B - A';
}

export function getMetricTitle(slot, slotMetrics, valueType, metrics = null) {
  if (!slotMetrics?.weapon) {
    return calculatorState.mode === 'compare'
      ? `Select weapon ${slot}`
      : 'Select a weapon';
  }

  if (slotMetrics.selectedAttackCount === 0) {
    return calculatorState.mode === 'compare'
      ? `Select one or more attack rows for weapon ${slot}`
      : 'Select one or more attack rows';
  }

  if (!slotMetrics.damagesZone) {
    return calculatorState.mode === 'compare'
      ? `Weapon ${slot}'s selected attacks do not damage this part`
      : 'Selected attacks do not damage this part';
  }

  if (valueType === 'margin') {
    if (usesBeamCadence(slotMetrics)) {
      return buildBeamMarginUnavailableTitle();
    }

    const displayPercent = Number.isFinite(slotMetrics?.marginPercent)
      ? slotMetrics.marginPercent
      : (Number.isFinite(slotMetrics?.displayMarginPercent)
          ? slotMetrics.displayMarginPercent
          : null);
    if (displayPercent === null || slotMetrics.shotsToKill === null) {
      return 'Margin unavailable when the displayed kill path has no damage/health breakpoint to compare.';
    }

    const roundedPercent = Math.max(0, Math.round(displayPercent));
    if (Number.isFinite(slotMetrics?.marginPercent)) {
      return `One-shot margin: +${roundedPercent}%. Displayed damage per cycle exceeds the displayed target health for this breakpoint.`;
    }

    return `${slotMetrics.shotsToKill}-shot margin: +${roundedPercent}%. Displayed damage per cycle exceeds the per-shot breakpoint required for this displayed kill path.`;
  }

  if (valueType === 'ttk' && !slotMetrics.hasRpm) {
    return calculatorState.mode === 'compare'
      ? `Weapon ${slot} TTK is unavailable without RPM`
      : 'TTK unavailable without RPM';
  }

  const outcomeDescription = getOutcomeDescription(slotMetrics, valueType);

  if (valueType === 'shots' && usesBeamCadence(slotMetrics)) {
    return joinTooltipLines(buildBeamShotsTitle(slotMetrics), outcomeDescription);
  }

  if (calculatorState.mode === 'compare' && valueType === 'ttk') {
    const compareTitle = buildCompareTtkTooltip(metrics?.bySlot?.A, metrics?.bySlot?.B);
    return joinTooltipLines(compareTitle, outcomeDescription);
  }

  if (valueType === 'ttk' && usesBeamCadence(slotMetrics)) {
    return joinTooltipLines(buildBeamTtkTitle(slotMetrics), outcomeDescription);
  }

  return outcomeDescription || null;
}
