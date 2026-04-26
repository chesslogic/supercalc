import { getDiffDisplayMetric } from '../compare-utils.js';
import { formatTtkSeconds } from '../summary.js';
import { tokenizeFormattedTtk } from '../ttk-formatting.js';
import { getZoneOutcomeDescription, getZoneOutcomeLabel } from '../zone-damage.js';
import { METRIC_COLUMN_CONFIG } from './enemy-columns.js';
import { formatPercentDiff, getDiffMetricTitle, getMetricTitle } from './metric-tooltips.js';

function createElement(tagName) {
  return globalThis.document.createElement(tagName);
}

function usesBeamCadence(slotMetrics) {
  return Boolean(slotMetrics?.usesBeamCadence);
}

function appendOutcomeBadge(cell, outcomeKind) {
  const outcomeLabel = getZoneOutcomeLabel(outcomeKind);
  const outcomeDescription = getZoneOutcomeDescription(outcomeKind);
  if (!outcomeLabel) {
    return;
  }

  const badge = createElement('span');
  badge.className = `calc-zone-context calc-zone-context-${outcomeKind}`;
  badge.title = outcomeDescription || outcomeLabel;
  badge.textContent = outcomeLabel;
  cell.appendChild(badge);
}

function createTtkValueNode(ttkSeconds) {
  const ttkValue = createElement('span');
  ttkValue.className = 'calc-derived-value';

  if (ttkSeconds === null) {
    ttkValue.textContent = '-';
    ttkValue.classList.add('muted');
    return ttkValue;
  }

  ttkValue.classList.add('calc-ttk-value');
  const formattedTtk = formatTtkSeconds(ttkSeconds);
  const tokens = tokenizeFormattedTtk(formattedTtk);

  tokens.forEach(({ text, kind }) => {
    const token = createElement('span');
    token.className = `calc-ttk-token calc-ttk-token-${kind}`;
    token.textContent = text;
    ttkValue.appendChild(token);
  });

  return ttkValue;
}

function createRangeValueNode(distanceInfo) {
  const rangeValue = createElement('span');
  rangeValue.className = 'calc-derived-value';

  if (!distanceInfo?.isAvailable) {
    rangeValue.textContent = '-';
    rangeValue.classList.add('muted');
    return rangeValue;
  }

  rangeValue.textContent = distanceInfo.text;
  return rangeValue;
}

function createMarginValueNode(slotMetrics) {
  const marginValue = createElement('span');
  marginValue.className = 'calc-derived-value';

  if (usesBeamCadence(slotMetrics)) {
    marginValue.textContent = '-';
    marginValue.classList.add('muted');
    return marginValue;
  }

  const displayPercent = Number.isFinite(slotMetrics?.marginPercent)
    ? slotMetrics.marginPercent
    : (Number.isFinite(slotMetrics?.displayMarginPercent)
        ? slotMetrics.displayMarginPercent
        : null);
  if (displayPercent === null) {
    marginValue.textContent = '-';
    marginValue.classList.add('muted');
    return marginValue;
  }

  marginValue.textContent = `+${Math.max(0, Math.round(displayPercent))}%`;
  return marginValue;
}

function formatMarginPointDiff(value) {
  const roundedPoints = Math.round(value * 100);
  if (roundedPoints > 0) {
    return `+${roundedPoints} pts`;
  }

  if (roundedPoints < 0) {
    return `${roundedPoints} pts`;
  }

  return '0 pts';
}

function createDiffValueNode(diffMetric, valueType, diffDisplayMode = 'absolute') {
  const diffValue = createElement('span');
  diffValue.className = 'calc-derived-value calc-diff-value';
  const displayMetric = getDiffDisplayMetric(diffMetric, diffDisplayMode);

  if (displayMetric.kind === 'unavailable') {
    diffValue.textContent = '-';
    diffValue.classList.add('muted');
    return diffValue;
  }

  if (displayMetric.kind === 'one-sided') {
    if (valueType === 'margin') {
      diffValue.textContent = '-';
      diffValue.classList.add('muted');
      return diffValue;
    }

    diffValue.classList.add('calc-diff-special');
    diffValue.classList.add(displayMetric.winner === 'B' ? 'calc-diff-better' : 'calc-diff-worse');
    diffValue.textContent = `${displayMetric.winner} Only`;
    return diffValue;
  }

  const value = displayMetric.value;
  const comparisonValue = valueType === 'margin' && diffDisplayMode !== 'percent'
    ? Math.round(value * 100)
    : value;
  if (comparisonValue < 0) {
    diffValue.classList.add('calc-diff-better');
  } else if (comparisonValue > 0) {
    diffValue.classList.add('calc-diff-worse');
  } else {
    diffValue.classList.add('calc-diff-neutral');
  }

  if (diffDisplayMode === 'percent') {
    diffValue.textContent = formatPercentDiff(value);
    return diffValue;
  }

  if (valueType === 'margin') {
    diffValue.textContent = formatMarginPointDiff(value);
    return diffValue;
  }

  if (valueType === 'ttk') {
    const prefix = value > 0 ? '+' : value < 0 ? '-' : '';
    if (prefix) {
      const sign = createElement('span');
      sign.className = 'calc-diff-sign';
      sign.textContent = prefix;
      diffValue.appendChild(sign);
    }

    const tokens = tokenizeFormattedTtk(formatTtkSeconds(Math.abs(value)));
    tokens.forEach(({ text, kind }) => {
      const token = createElement('span');
      token.className = `calc-ttk-token calc-ttk-token-${kind}`;
      token.textContent = text;
      diffValue.appendChild(token);
    });

    return diffValue;
  }

  diffValue.textContent = value > 0 ? `+${value}` : String(value);
  return diffValue;
}

function buildSingleMetricCell(slot, slotMetrics, type, metrics = null) {
  const td = createElement('td');
  td.classList.add('calc-derived-cell');

  if (type === 'shots') {
    td.textContent = slotMetrics.shotsToKill === null ? '-' : String(slotMetrics.shotsToKill);
    if (slotMetrics.shotsToKill === null) {
      td.classList.add('muted');
    }
    td.title = getMetricTitle(slot, slotMetrics, 'shots', metrics) || '';
    return td;
  }

  if (type === 'range') {
    const distanceInfo = slotMetrics?.effectiveDistance;
    td.appendChild(createRangeValueNode(distanceInfo));
    if (!distanceInfo?.isAvailable) {
      td.classList.add('muted');
    }
    td.title = distanceInfo?.title || '';
    if (distanceInfo?.title) {
      td.style.cursor = 'help';
    }
    return td;
  }

  if (type === 'margin') {
    td.appendChild(createMarginValueNode(slotMetrics));
    if (
      usesBeamCadence(slotMetrics)
      || (!Number.isFinite(slotMetrics?.marginPercent) && !Number.isFinite(slotMetrics?.displayMarginPercent))
    ) {
      td.classList.add('muted');
    }
    td.title = getMetricTitle(slot, slotMetrics, 'margin', metrics) || '';
    return td;
  }

  const ttkContent = createElement('div');
  ttkContent.className = 'calc-derived-inline';
  ttkContent.appendChild(createTtkValueNode(slotMetrics.ttkSeconds));
  appendOutcomeBadge(ttkContent, slotMetrics.outcomeKind);
  td.appendChild(ttkContent);
  td.title = getMetricTitle(slot, slotMetrics, 'ttk', metrics) || '';
  return td;
}

function buildDiffMetricCell(value, valueType, diffDisplayMode = 'absolute', metrics = null) {
  const td = createElement('td');
  td.classList.add('calc-derived-cell', 'calc-diff-cell');
  td.appendChild(createDiffValueNode(value, valueType, diffDisplayMode));
  td.title = getDiffMetricTitle(value, valueType, diffDisplayMode, metrics);
  return td;
}

export function buildMetricColumnCell(columnKey, metrics, {
  diffDisplayMode = 'absolute'
} = {}) {
  const config = METRIC_COLUMN_CONFIG[columnKey];
  if (!config) {
    return null;
  }

  if (config.kind === 'slot') {
    return buildSingleMetricCell(
      config.slot,
      metrics?.bySlot?.[config.slot],
      config.valueType,
      metrics
    );
  }

  return buildDiffMetricCell(
    metrics?.[config.metricKey],
    config.valueType,
    diffDisplayMode,
    metrics
  );
}
