// durable-ratio.js — derived-column math for the DUR/DMG display column
import { state } from './data.js';
import { classifyAtkType } from '../colors.js';

export const DURABLE_RATIO_HEADER = 'DUR/DMG';
const DURABLE_RATIO_FRACTION_MAX_DENOMINATOR = 8;
const DURABLE_RATIO_FRACTION_EPSILON = 0.0125;

function toFiniteNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

export function canShowDurableRatioColumn() {
  return Boolean(state.keys.dmgKey && state.keys.durKey);
}

export function getDisplayHeaders() {
  const headers = [...state.headers];
  if (!canShowDurableRatioColumn() || headers.includes(DURABLE_RATIO_HEADER)) {
    return headers;
  }

  const durIndex = headers.indexOf(state.keys.durKey);
  const insertIndex = durIndex >= 0 ? durIndex + 1 : headers.length;
  headers.splice(insertIndex, 0, DURABLE_RATIO_HEADER);
  return headers;
}

export function getDurableDamageRatio(row) {
  if (!canShowDurableRatioColumn()) {
    return null;
  }

  const damage = toFiniteNumber(row?.[state.keys.dmgKey]);
  const durableDamage = toFiniteNumber(row?.[state.keys.durKey]);
  if (damage === null || durableDamage === null || damage <= 0) {
    return null;
  }

  return Math.max(0, Math.min(1, durableDamage / damage));
}

export function formatDurableRatioPercent(ratio) {
  const percent = Math.max(0, Math.min(100, ratio * 100));
  return `${percent.toFixed(1).replace(/\.0$/, '')}%`;
}

export function findApproximateDurableRatioFraction(ratio) {
  if (!Number.isFinite(ratio) || ratio <= 0 || ratio >= 1) {
    return null;
  }

  let bestMatch = null;
  for (let denominator = 2; denominator <= DURABLE_RATIO_FRACTION_MAX_DENOMINATOR; denominator += 1) {
    for (let numerator = 1; numerator < denominator; numerator += 1) {
      const candidateRatio = numerator / denominator;
      const difference = Math.abs(candidateRatio - ratio);
      if (!bestMatch || difference < bestMatch.difference) {
        bestMatch = { numerator, denominator, difference };
      }
    }
  }

  return bestMatch && bestMatch.difference <= DURABLE_RATIO_FRACTION_EPSILON
    ? `${bestMatch.numerator}/${bestMatch.denominator}`
    : null;
}

export function getDurableRatioDisplayModel(row) {
  const ratio = getDurableDamageRatio(row);
  if (ratio === null) {
    return { ratio: null, text: '', title: '' };
  }

  const damage = toFiniteNumber(row?.[state.keys.dmgKey]);
  const durableDamage = toFiniteNumber(row?.[state.keys.durKey]);
  const percentText = formatDurableRatioPercent(ratio);
  const fractionText = findApproximateDurableRatioFraction(ratio);
  const text = fractionText ? `${percentText} (${fractionText})` : percentText;
  const titleLines = [
    `Durable damage is ${percentText} of standard damage.`,
    `${durableDamage} / ${damage}`
  ];

  if (fractionText) {
    titleLines.push(`Approximate fraction: ${fractionText} durable`);
  }

  return { ratio, text, title: titleLines.join('\n') };
}

export function getDurableRatioSortAttackKind(row) {
  const rawAttackType = (state.keys.atkTypeKey && row?.[state.keys.atkTypeKey])
    ? String(row[state.keys.atkTypeKey])
    : (row?.Stage ? String(row.Stage) : '');
  const normalizedAttackType = rawAttackType.trim().toLowerCase();
  if (!normalizedAttackType) {
    return '';
  }

  if (normalizedAttackType.includes('projectile')) {
    return 'projectile';
  }

  return classifyAtkType(row, state.keys.atkTypeKey) || normalizedAttackType;
}

export function getDurableRatioSortRows(group) {
  const rows = Array.isArray(group?.rows) ? group.rows : [];
  const projectileRows = rows.filter((row) => (
    getDurableRatioSortAttackKind(row) === 'projectile'
    && getDurableDamageRatio(row) !== null
  ));
  return projectileRows.length > 0 ? projectileRows : rows;
}
