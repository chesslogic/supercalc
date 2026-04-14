import { calculatorState } from '../data.js';
import { getDiffDisplayMetric } from '../compare-utils.js';
import { buildCompareTtkTooltip } from '../compare-tooltips.js';
import { formatTtkSeconds } from '../summary.js';
import { getZoneOutcomeDescription } from '../zone-damage.js';

export function formatPercentDiff(value) {
  const prefix = value > 0 ? '+' : '';
  return `${prefix}${value.toFixed(1).replace(/\.0$/, '')}%`;
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
    const metricLabel = valueType === 'ttk' ? 'TTK' : 'shots';
    const displayValue = valueType === 'ttk'
      ? formatTtkSeconds(displayMetric.displayValue)
      : String(displayMetric.displayValue);
    return `Only weapon ${displayMetric.winner} can damage this part with the current selection (${displayMetric.winner} ${metricLabel}: ${displayValue})`;
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

  if (valueType === 'ttk' && !slotMetrics.hasRpm) {
    return calculatorState.mode === 'compare'
      ? `Weapon ${slot} TTK is unavailable without RPM`
      : 'TTK unavailable without RPM';
  }

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

  const outcomeDescription = getZoneOutcomeDescription(slotMetrics.outcomeKind);
  if (calculatorState.mode === 'compare' && valueType === 'ttk') {
    const compareTitle = buildCompareTtkTooltip(metrics?.bySlot?.A, metrics?.bySlot?.B);
    if (compareTitle && outcomeDescription) {
      return `${compareTitle}\n${outcomeDescription}`;
    }
    if (compareTitle) {
      return compareTitle;
    }
  }

  return outcomeDescription || null;
}
