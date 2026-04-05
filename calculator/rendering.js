// calculator/rendering.js — render selected weapon and enemy details
import {
  armorValueColor,
  atkColorClass,
  apColorClass,
  classifyAtkType,
  dfColorClass,
  durPercentageColor
} from '../colors.js';
import {
  calculatorState,
  getEnemyTargetTypeOptionsForState,
  getEnemyOptions,
  getEngagementRangeMeters,
  getOverviewScopeOptionGroupsForState,
  getSelectedEnemyTargetTypes,
  getSelectedExplosiveZoneIndices,
  getAttackHitCounts,
  getSelectedAttackKeys,
  getSelectedAttacks,
  getWeaponForSlot,
  setDiffDisplayMode,
  setEnemyGroupMode,
  setEnemyTableMode,
  setOverviewScope,
  setSelectedAttack,
  setSelectedExplosiveZone,
  setSelectedZoneIndex,
  toggleSelectedEnemyTargetType,
  toggleEnemySort
} from './data.js';
import {
  buildFocusedZoneComparisonRows,
  buildOverviewRows,
  buildAttackUnionRows,
  getDiffDisplayMetric,
  getAttackRowKey,
  getOutcomeGroupingSlot,
  sortEnemyZoneRows
} from './compare-utils.js';
import { isExplosiveAttack, splitAttacksByApplication } from './attack-types.js';
import { renderCalculation } from './calculation.js';
import { formatDamageValue, roundDamagePacket } from './damage-rounding.js';
import { formatEngagementRangeMeters } from './engagement-range.js';
import { formatTtkSeconds } from './summary.js';
import { tokenizeFormattedTtk } from './ttk-formatting.js';
import { appendWeaponSelectionControls } from './weapon-selection.js';
import {
  getZoneOutcomeDescription,
  getZoneOutcomeLabel
} from './zone-damage.js';
import {
  applyExplosiveDisplayToCell,
  EXPLOSIVE_DISPLAY_COLUMN_LABEL
} from './explosive-display.js';
import { buildCompareTtkTooltip } from './compare-tooltips.js';
import {
  applyEnemyZoneConDisplayToCell,
  applyEnemyZoneHealthDisplayToCell
} from './enemy-zone-display.js';
import { EFFECTIVE_DISTANCE_TOOLTIP } from './effective-distance.js';
import { getEnemyScopeSummaryLabel, isAllEnemyScope } from './enemy-scope.js';
import {
  calculateBallisticDamageAtDistance,
  calculateBallisticDamageReductionPercent,
  resolveBallisticFalloffProfileForWeapon
} from '../weapons/falloff.js';
import { getZoneRelationContext } from '../enemies/data.js';

const DEFAULT_WEAPON_HEADERS = ['Name', 'DMG', 'DUR', 'AP', 'DF', 'ST', 'PF'];
const ENEMY_STATS_COLUMNS = [
  { key: 'zone_name', label: 'Zone' },
  { key: 'health', label: 'Health' },
  { key: 'Con', label: 'Con' },
  { key: 'Dur%', label: 'Dur%' },
  { key: 'AV', label: 'AV' },
  { key: 'IsFatal', label: 'IsLethal' },
  { key: 'ExTarget', label: 'ExTarget' },
  { key: 'ExMult', label: EXPLOSIVE_DISPLAY_COLUMN_LABEL },
  { key: 'ToMain%', label: 'ToMain%' },
  { key: 'MainCap', label: 'MainCap' }
];
const ENEMY_ANALYSIS_COLUMNS = [
  { key: 'zone_name', label: 'Zone' },
  { key: 'AV', label: 'AV' },
  { key: 'Dur%', label: 'Dur%' },
  { key: 'ToMain%', label: 'ToMain%' },
  { key: 'ExMult', label: EXPLOSIVE_DISPLAY_COLUMN_LABEL }
];
const ENEMY_SINGLE_ANALYSIS_METRIC_COLUMNS = [
  { key: 'shots', label: 'Shots' },
  { key: 'range', label: 'Range', title: EFFECTIVE_DISTANCE_TOOLTIP },
  { key: 'ttk', label: 'TTK' }
];
const ENEMY_COMPARE_ANALYSIS_METRIC_COLUMNS = [
  { key: 'shotsA', label: 'A Shots' },
  { key: 'rangeA', label: 'A Range', title: EFFECTIVE_DISTANCE_TOOLTIP },
  { key: 'shotsB', label: 'B Shots' },
  { key: 'rangeB', label: 'B Range', title: EFFECTIVE_DISTANCE_TOOLTIP },
  { key: 'shotsDiff', label: 'Diff Shots' },
  { key: 'ttkA', label: 'A TTK' },
  { key: 'ttkB', label: 'B TTK' },
  { key: 'ttkDiff', label: 'Diff TTK' }
];
const METRIC_COLUMN_CONFIG = {
  shots: { kind: 'slot', slot: 'A', valueType: 'shots' },
  range: { kind: 'slot', slot: 'A', valueType: 'range' },
  ttk: { kind: 'slot', slot: 'A', valueType: 'ttk' },
  shotsA: { kind: 'slot', slot: 'A', valueType: 'shots' },
  rangeA: { kind: 'slot', slot: 'A', valueType: 'range' },
  ttkA: { kind: 'slot', slot: 'A', valueType: 'ttk' },
  shotsB: { kind: 'slot', slot: 'B', valueType: 'shots' },
  rangeB: { kind: 'slot', slot: 'B', valueType: 'range' },
  ttkB: { kind: 'slot', slot: 'B', valueType: 'ttk' },
  shotsDiff: { kind: 'diff', metricKey: 'diffShots', valueType: 'shots' },
  ttkDiff: { kind: 'diff', metricKey: 'diffTtkSeconds', valueType: 'ttk' }
};

function createPlaceholder(container, text) {
  const noData = document.createElement('div');
  noData.textContent = text;
  noData.style.color = 'var(--muted)';
  container.appendChild(noData);
}

export function refreshEnemyCalculationViews() {
  renderEnemyDetails();
  renderCalculation();
}

export function refreshCalculatorViews() {
  renderWeaponDetails();
  refreshEnemyCalculationViews();
}

function appendOutcomeBadge(cell, outcomeKind) {
  const outcomeLabel = getZoneOutcomeLabel(outcomeKind);
  const outcomeDescription = getZoneOutcomeDescription(outcomeKind);
  if (!outcomeLabel) {
    return;
  }

  const badge = document.createElement('span');
  badge.className = `calc-zone-context calc-zone-context-${outcomeKind}`;
  badge.title = outcomeDescription || outcomeLabel;
  badge.textContent = outcomeLabel;
  cell.appendChild(badge);
}

function createTtkValueNode(ttkSeconds) {
  const ttkValue = document.createElement('span');
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
    const token = document.createElement('span');
    token.className = `calc-ttk-token calc-ttk-token-${kind}`;
    token.textContent = text;
    ttkValue.appendChild(token);
  });

  return ttkValue;
}

function createRangeValueNode(distanceInfo) {
  const rangeValue = document.createElement('span');
  rangeValue.className = 'calc-derived-value';

  if (!distanceInfo?.isAvailable) {
    rangeValue.textContent = '-';
    rangeValue.classList.add('muted');
    return rangeValue;
  }

  rangeValue.textContent = distanceInfo.text;
  return rangeValue;
}

function formatPercentDiff(value) {
  const prefix = value > 0 ? '+' : '';
  return `${prefix}${value.toFixed(1).replace(/\.0$/, '')}%`;
}

function toFiniteNumber(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizeZoneRelationKey(value) {
  return String(value ?? '').trim().toLowerCase();
}

export function getZoneRelationHighlightKind(enemy, anchorZoneReference, candidateZoneReference) {
  const relationContext = getZoneRelationContext(enemy, anchorZoneReference);
  if (!relationContext) {
    return null;
  }

  const anchorZoneName = typeof anchorZoneReference === 'object'
    ? anchorZoneReference?.zone_name
    : anchorZoneReference;
  const candidateZoneName = typeof candidateZoneReference === 'object'
    ? candidateZoneReference?.zone_name
    : candidateZoneReference;
  const normalizedAnchorZoneName = normalizeZoneRelationKey(anchorZoneName);
  const normalizedCandidateZoneName = normalizeZoneRelationKey(candidateZoneName);
  if (!normalizedCandidateZoneName) {
    return null;
  }

  if (normalizedCandidateZoneName === normalizedAnchorZoneName) {
    return 'anchor';
  }

  if (relationContext.sameZoneNames.some((zoneName) => normalizeZoneRelationKey(zoneName) === normalizedCandidateZoneName)) {
    return 'group';
  }

  if (relationContext.mirrorZoneNames.some((zoneName) => normalizeZoneRelationKey(zoneName) === normalizedCandidateZoneName)) {
    return 'mirror';
  }

  return null;
}

function clearZoneRelationClasses(rowEntries, classPrefix) {
  rowEntries.forEach(({ tr }) => {
    tr.classList.remove(
      `${classPrefix}-anchor`,
      `${classPrefix}-group`,
      `${classPrefix}-mirror`
    );
  });
}

function applyZoneRelationClasses(rowEntries, enemy, anchorZoneReference, classPrefix) {
  clearZoneRelationClasses(rowEntries, classPrefix);
  if (!anchorZoneReference) {
    return;
  }

  rowEntries.forEach(({ tr, zone }) => {
    const highlightKind = getZoneRelationHighlightKind(enemy, anchorZoneReference, zone);
    if (!highlightKind) {
      return;
    }

    tr.classList.add(`${classPrefix}-${highlightKind}`);
  });
}

function wireZoneRelationHighlights(rowEntries, enemy, selectedZoneReference = null) {
  if (!Array.isArray(rowEntries) || rowEntries.length === 0) {
    return;
  }

  applyZoneRelationClasses(rowEntries, enemy, selectedZoneReference, 'calc-zone-link-selected');

  rowEntries.forEach(({ tr, zone }) => {
    if (!getZoneRelationContext(enemy, zone)) {
      return;
    }

    tr.addEventListener('mouseenter', () => {
      applyZoneRelationClasses(rowEntries, enemy, zone, 'calc-zone-link-hover');
    });
    tr.addEventListener('mouseleave', () => {
      clearZoneRelationClasses(rowEntries, 'calc-zone-link-hover');
    });
  });
}

function formatPercentValue(value) {
  const numeric = toFiniteNumber(value);
  if (numeric === null) {
    return '';
  }

  return numeric.toFixed(1).replace(/\.0$/, '');
}

function isWeaponDamageHeader(header) {
  const normalizedHeader = String(header || '').trim().toLowerCase();
  return normalizedHeader === 'dmg' || normalizedHeader === 'damage' || normalizedHeader === 'dur' || normalizedHeader === 'duration';
}

function getBallisticFalloffUnavailableReason(status) {
  if (status === 'unloaded') {
    return 'ballistic falloff data is not loaded yet';
  }

  if (status === 'excluded') {
    return 'this weapon uses a special-case ballistic curve that is not modeled yet';
  }

  if (status === 'ambiguous') {
    return 'multiple possible falloff profiles are available';
  }

  return 'no ballistic falloff profile is loaded for this weapon';
}

function buildWeaponRangeSlotDisplay({
  slot,
  header,
  row,
  weapon,
  rangeMeters
}) {
  if (!row || !weapon) {
    return null;
  }

  const baseValue = toFiniteNumber(row?.[header]);
  if (baseValue === null) {
    return null;
  }

  const baseText = formatDamageValue(baseValue);
  const headerLabel = String(header || '').trim().toUpperCase() || 'VALUE';
  const normalizedRangeMeters = Math.max(0, Math.round(Number(rangeMeters) || 0));
  const rangeText = formatEngagementRangeMeters(normalizedRangeMeters);

  if (normalizedRangeMeters <= 0) {
    return {
      slot,
      displayText: baseText,
      title: `Weapon ${slot} ${headerLabel} at ${rangeText}: ${baseText} (base value)`,
      isAdjusted: false
    };
  }

  if (isExplosiveAttack(row)) {
    return {
      slot,
      displayText: baseText,
      title: `Weapon ${slot} ${headerLabel} at ${rangeText}: ${baseText} (explosive row, no ballistic falloff)`,
      isAdjusted: false
    };
  }

  const falloffResolution = resolveBallisticFalloffProfileForWeapon(weapon);
  if (falloffResolution?.status !== 'available') {
    return {
      slot,
      displayText: baseText,
      title: `Weapon ${slot} ${headerLabel} at ${rangeText}: ${baseText} (${getBallisticFalloffUnavailableReason(falloffResolution?.status)})`,
      isAdjusted: false
    };
  }

  const profileAttributes = falloffResolution.profile?.attributes || null;
  const adjustedValue = calculateBallisticDamageAtDistance(baseValue, profileAttributes, normalizedRangeMeters);
  const reductionPercent = calculateBallisticDamageReductionPercent(profileAttributes, normalizedRangeMeters);

  if (adjustedValue === null || reductionPercent === null) {
    return {
      slot,
      displayText: baseText,
      title: `Weapon ${slot} ${headerLabel} at ${rangeText}: ${baseText} (${getBallisticFalloffUnavailableReason('missing')})`,
      isAdjusted: false
    };
  }

  const adjustedText = formatDamageValue(roundDamagePacket(adjustedValue));
  const reductionText = formatPercentValue(reductionPercent);

  return {
    slot,
    displayText: adjustedText,
    title: `Weapon ${slot} ${headerLabel} at ${rangeText}: ${adjustedText} (base ${baseText}, ${reductionText}% reduction)`,
    isAdjusted: true
  };
}

export function getWeaponRangeAdjustedCellDisplay(header, entry, {
  compareMode = false,
  weaponA = null,
  weaponB = null,
  rangeA = 0,
  rangeB = 0
} = {}) {
  if (!isWeaponDamageHeader(header)) {
    return null;
  }

  const slotEntries = compareMode
    ? [
      { slot: 'A', row: entry?.rowA, weapon: weaponA, rangeMeters: rangeA },
      { slot: 'B', row: entry?.rowB, weapon: weaponB, rangeMeters: rangeB }
    ]
    : [
      {
        slot: 'A',
        row: entry?.rowA || entry?.displayRow,
        weapon: weaponA,
        rangeMeters: rangeA
      }
    ];
  const hasNonZeroRange = slotEntries.some(({ row, rangeMeters }) =>
    Boolean(row) && Math.max(0, Math.round(Number(rangeMeters) || 0)) > 0
  );

  if (!hasNonZeroRange) {
    return null;
  }

  const slotDisplays = slotEntries
    .map((slotEntry) => buildWeaponRangeSlotDisplay({
      slot: slotEntry.slot,
      header,
      row: slotEntry.row,
      weapon: slotEntry.weapon,
      rangeMeters: slotEntry.rangeMeters
    }))
    .filter(Boolean);
  if (slotDisplays.length === 0) {
    return null;
  }

  const uniqueDisplayValues = new Set(slotDisplays.map((slotDisplay) => slotDisplay.displayText));
  const isSplit = compareMode && slotDisplays.length > 1 && uniqueDisplayValues.size > 1;

  return {
    text: isSplit
      ? slotDisplays.map((slotDisplay) => `${slotDisplay.slot} ${slotDisplay.displayText}`).join(' • ')
      : slotDisplays[0].displayText,
    title: slotDisplays.map((slotDisplay) => slotDisplay.title).join('\n'),
    isAdjusted: slotDisplays.some((slotDisplay) => slotDisplay.isAdjusted),
    isSplit
  };
}

function createDiffValueNode(diffMetric, valueType, diffDisplayMode = 'absolute') {
  const diffValue = document.createElement('span');
  diffValue.className = 'calc-derived-value calc-diff-value';
  const displayMetric = getDiffDisplayMetric(diffMetric, diffDisplayMode);

  if (displayMetric.kind === 'unavailable') {
    diffValue.textContent = '-';
    diffValue.classList.add('muted');
    return diffValue;
  }

  if (displayMetric.kind === 'one-sided') {
    diffValue.classList.add('calc-diff-special');
    diffValue.classList.add(displayMetric.winner === 'B' ? 'calc-diff-better' : 'calc-diff-worse');
    diffValue.textContent = `${displayMetric.winner} Only`;
    return diffValue;
  }

  const value = displayMetric.value;
  if (value < 0) {
    diffValue.classList.add('calc-diff-better');
  } else if (value > 0) {
    diffValue.classList.add('calc-diff-worse');
  } else {
    diffValue.classList.add('calc-diff-neutral');
  }

  if (diffDisplayMode === 'percent') {
    diffValue.textContent = formatPercentDiff(value);
    return diffValue;
  }

  if (valueType === 'ttk') {
    const prefix = value > 0 ? '+' : value < 0 ? '-' : '';
    if (prefix) {
      const sign = document.createElement('span');
      sign.className = 'calc-diff-sign';
      sign.textContent = prefix;
      diffValue.appendChild(sign);
    }

    const tokens = tokenizeFormattedTtk(formatTtkSeconds(Math.abs(value)));
    tokens.forEach(({ text, kind }) => {
      const token = document.createElement('span');
      token.className = `calc-ttk-token calc-ttk-token-${kind}`;
      token.textContent = text;
      diffValue.appendChild(token);
    });

    return diffValue;
  }

  diffValue.textContent = value > 0 ? `+${value}` : String(value);
  return diffValue;
}

function getDiffMetricTitle(diffMetric, valueType, diffDisplayMode = 'absolute', metrics = null) {
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

function getMetricTitle(slot, slotMetrics, valueType, metrics = null) {
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

function formatWeaponCellValue(header, row, td, atkClass, displayContext = {}) {
  const weaponsState = window._weaponsState;
  const headerValue = row?.[header];
  let value = headerValue ?? '';
  const lowerHeader = header.toLowerCase();
  const isDamage = /^(damage|dmg)$/.test(lowerHeader);
  const isDuration = /^(dur|duration)$/.test(lowerHeader);

  if ((isDamage || isDuration) && atkClass) {
    const className = atkColorClass(atkClass);
    if (className) {
      td.classList.add(className);
    }
  }

  if (weaponsState?.keys?.apKey && header === weaponsState.keys.apKey) {
    td.classList.add(apColorClass(value));
  } else if (!weaponsState?.keys?.apKey && (lowerHeader === 'ap' || (lowerHeader.includes('armor') && lowerHeader.includes('pen')))) {
    td.classList.add(apColorClass(value));
  }

  if (weaponsState?.keys?.atkTypeKey && header === weaponsState.keys.atkTypeKey) {
    const className = atkColorClass(atkClass);
    if (className) {
      td.classList.add(className);
    }
  }

  if (lowerHeader === 'df') {
    const dfClassName = dfColorClass(value);
    if (dfClassName) {
      td.classList.add(dfClassName);
    }
  }

  if (weaponsState?.keys?.atkNameKey && header === weaponsState.keys.atkNameKey) {
    const className = atkColorClass(atkClass);
    if (className) {
      td.classList.add(className);
    }
    td.classList.add('trunc');
    if (value != null) {
      td.title = String(value);
    }
  }

  const rangedDisplay = getWeaponRangeAdjustedCellDisplay(header, displayContext.entry, displayContext);
  if (rangedDisplay) {
    td.textContent = rangedDisplay.text;
    td.title = rangedDisplay.title;
    td.classList.add('calc-range-adjusted-cell');
    if (rangedDisplay.isSplit) {
      td.classList.add('calc-range-adjusted-cell-split');
    }
    return;
  }

  if (typeof value === 'number') {
    const numeric = Number(value);
    value = Number.isInteger(numeric) ? numeric.toString() : numeric.toFixed(3).replace(/\.0+$/, '');
  }

  td.textContent = value === null || value === undefined ? '' : value;
}

function getWeaponDisplayRows() {
  const weaponA = getWeaponForSlot('A');
  const weaponB = getWeaponForSlot('B');

  if (calculatorState.mode === 'compare') {
    return buildAttackUnionRows(weaponA, weaponB);
  }

  return (weaponA?.rows || []).map((row) => ({
    key: getAttackRowKey(row),
    displayRow: row,
    rowA: row,
    rowB: null
  }));
}

export function renderWeaponDetails() {
  const container = document.getElementById('calculator-weapon-details');
  if (!container) {
    return;
  }

  container.innerHTML = '';

  const compareMode = calculatorState.mode === 'compare';
  const weaponA = getWeaponForSlot('A');
  const weaponB = getWeaponForSlot('B');
  if ((!compareMode && !weaponA) || (compareMode && !weaponA && !weaponB)) {
    createPlaceholder(
      container,
      compareMode
        ? 'Select weapon A and/or weapon B to view details'
        : 'Select a weapon to view details'
    );
    return;
  }

  const rows = getWeaponDisplayRows();
  if (rows.length === 0) {
    createPlaceholder(container, 'No attack rows available for the selected weapon(s)');
    return;
  }

  const table = document.createElement('table');
  table.style.width = '100%';
  table.style.borderCollapse = 'collapse';
  table.className = 'calculator-table';

  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');

  const selectionHeaders = compareMode ? ['A', 'B'] : [''];
  selectionHeaders.forEach((label) => {
    const th = document.createElement('th');
    th.textContent = label;
    th.style.padding = '4px 10px';
    th.style.textAlign = 'center';
    th.style.borderBottom = '2px solid var(--border)';
    th.style.color = 'var(--muted)';
    th.style.width = '30px';
    headerRow.appendChild(th);
  });

  const weaponsState = window._weaponsState;
  const headers = weaponsState?.headers || DEFAULT_WEAPON_HEADERS;

  headers.forEach((header) => {
    const th = document.createElement('th');
    th.textContent = header;
    th.style.padding = '4px 10px';
    th.style.textAlign = 'left';
    th.style.borderBottom = '2px solid var(--border)';
    th.style.color = 'var(--muted)';
    headerRow.appendChild(th);
  });

  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  const atkTypeKey = weaponsState?.keys?.atkTypeKey;
  const rangeDisplayContext = {
    compareMode,
    weaponA,
    weaponB,
    rangeA: getEngagementRangeMeters('A'),
    rangeB: getEngagementRangeMeters('B')
  };

  rows.forEach((entry) => {
    const tr = document.createElement('tr');
    const displayRow = entry.displayRow;
    const atkClass = atkTypeKey ? classifyAtkType(displayRow, atkTypeKey) : null;
    appendWeaponSelectionControls(tr, entry, { compareMode });

    headers.forEach((header) => {
      const td = document.createElement('td');
      formatWeaponCellValue(header, displayRow, td, atkClass, {
        ...rangeDisplayContext,
        entry
      });
      tr.appendChild(td);
    });

    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  container.appendChild(table);
}

export function getEnemyBaseColumnsForState({
  mode = 'single',
  enemyTableMode = 'analysis'
} = {}) {
  if (mode !== 'compare') {
    return ENEMY_STATS_COLUMNS;
  }

  return enemyTableMode === 'stats'
    ? ENEMY_STATS_COLUMNS
    : ENEMY_ANALYSIS_COLUMNS;
}

export function getEnemyColumnsForState({
  mode = 'single',
  enemyTableMode = 'analysis'
} = {}) {
  const baseColumns = getEnemyBaseColumnsForState({ mode, enemyTableMode });

  if (mode !== 'compare') {
    return [
      ...baseColumns,
      ...ENEMY_SINGLE_ANALYSIS_METRIC_COLUMNS
    ];
  }

  if (enemyTableMode === 'stats') {
    return baseColumns;
  }

  return [
    ...baseColumns,
    ...ENEMY_COMPARE_ANALYSIS_METRIC_COLUMNS
  ];
}

export function getOverviewColumnsForState({
  enemyTableMode = 'analysis',
  overviewScope = 'all'
} = {}) {
  const baseColumns = [
    ...(isAllEnemyScope(overviewScope)
      ? [{ key: 'faction', label: 'Faction' }]
      : []),
    { key: 'enemy', label: 'Enemy' },
    ...getEnemyBaseColumnsForState({
      mode: 'compare',
      enemyTableMode
    })
  ];

  if (enemyTableMode === 'stats') {
    return baseColumns;
  }

  return [
    ...baseColumns,
    ...ENEMY_COMPARE_ANALYSIS_METRIC_COLUMNS
  ];
}

export function shouldShowEnemyControls({
  mode = 'single',
  compareView = 'focused',
  hasFocusedEnemy = false
} = {}) {
  const overviewActive = mode === 'compare' && compareView === 'overview';
  return overviewActive || hasFocusedEnemy || shouldShowEnemyScopeControls({ mode });
}

export function shouldShowEnemyScopeControls({
  mode = 'single'
} = {}) {
  return mode === 'compare' || mode === 'single';
}

export function getEnemyControlSections({
  mode = 'single',
  compareView = 'focused',
  hasFocusedEnemy = false,
  enemyTableMode = 'analysis'
} = {}) {
  if (!shouldShowEnemyControls({ mode, compareView, hasFocusedEnemy })) {
    return {
      beforeEnemySelector: [],
      afterEnemySelector: []
    };
  }

  const overviewActive = mode === 'compare' && compareView === 'overview';
  const beforeEnemySelector = [];
  const afterEnemySelector = [];

  if (shouldShowEnemyScopeControls({ mode })) {
    beforeEnemySelector.push('scope');
  }
  beforeEnemySelector.push('targets');

  if (mode === 'compare' && (overviewActive || hasFocusedEnemy)) {
    afterEnemySelector.push('view');
  }
  if (overviewActive || hasFocusedEnemy) {
    afterEnemySelector.push('grouping');
  }
  if (overviewActive && enemyTableMode === 'analysis') {
    afterEnemySelector.push('diff');
  }

  return {
    beforeEnemySelector,
    afterEnemySelector
  };
}

function getEnemyBaseColumns() {
  return getEnemyBaseColumnsForState({
    mode: calculatorState.mode,
    enemyTableMode: calculatorState.enemyTableMode
  });
}

function getEnemyColumns() {
  return getEnemyColumnsForState({
    mode: calculatorState.mode,
    enemyTableMode: calculatorState.enemyTableMode
  });
}

function getOverviewColumns() {
  return getOverviewColumnsForState({
    enemyTableMode: calculatorState.enemyTableMode,
    overviewScope: calculatorState.overviewScope
  });
}

function ensureEnemySortKeyVisible(columns) {
  const visibleKeys = new Set(columns.map((column) => column.key));
  if (visibleKeys.has(calculatorState.enemySort.key)) {
    return;
  }

  calculatorState.enemySort.key = 'zone_name';
  calculatorState.enemySort.dir = 'asc';
}

function appendToolbarButtonGroup(toolbar, labelText, items, isActive, onClick) {
  const label = document.createElement('span');
  label.className = 'label';
  label.textContent = labelText;
  toolbar.appendChild(label);

  const group = document.createElement('div');
  group.className = 'calculator-toolbar-group';

  items.forEach(({ value, label: itemLabel }) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'button calculator-toolbar-button';
    button.textContent = itemLabel;
    button.classList.toggle('is-active', isActive(value));
    button.addEventListener('click', () => onClick(value));
    group.appendChild(button);
  });

  toolbar.appendChild(group);
}

function appendToolbarSelectGroup(toolbar, labelText, groups, selectedValue, onChange) {
  const label = document.createElement('span');
  label.className = 'label';
  label.textContent = labelText;
  toolbar.appendChild(label);

  const group = document.createElement('div');
  group.className = 'calculator-toolbar-group calculator-toolbar-select-group';

  const select = document.createElement('select');
  select.className = 'calculator-toolbar-select';

  (groups || []).forEach((entry) => {
    if (!entry) {
      return;
    }

    if (entry.label && Array.isArray(entry.options)) {
      const optgroup = document.createElement('optgroup');
      optgroup.label = entry.label;
      entry.options.forEach(({ id, label: optionLabel }) => {
        const option = document.createElement('option');
        option.value = id;
        option.textContent = optionLabel;
        optgroup.appendChild(option);
      });
      select.appendChild(optgroup);
      return;
    }

    (entry.options || []).forEach(({ id, label: optionLabel }) => {
      const option = document.createElement('option');
      option.value = id;
      option.textContent = optionLabel;
      select.appendChild(option);
    });
  });

  select.value = selectedValue;
  select.addEventListener('change', (event) => onChange(event.target.value));
  group.appendChild(select);
  toolbar.appendChild(group);
}

export function getFocusedTargetingModes(selectedAttacksA, selectedAttacksB) {
  const activeAttacks = calculatorState.mode === 'compare'
    ? [...selectedAttacksA, ...selectedAttacksB]
    : [...selectedAttacksA];
  const { directAttacks, explosiveAttacks } = splitAttacksByApplication(activeAttacks);
  const hasAnySelectedAttacks = activeAttacks.length > 0;
  const explosiveOnlySelection = hasAnySelectedAttacks && directAttacks.length === 0 && explosiveAttacks.length > 0;

  return {
    hasProjectileTargets: !explosiveOnlySelection,
    hasExplosiveTargets: explosiveAttacks.length > 0
  };
}

function appendEnemyToolbarControl(toolbar, controlId, { overviewActive = false } = {}) {
  switch (controlId) {
    case 'view':
      appendToolbarButtonGroup(
        toolbar,
        'View:',
        [
          { value: 'analysis', label: 'Analysis' },
          { value: 'stats', label: 'Stats' }
        ],
        (value) => calculatorState.enemyTableMode === value,
        (value) => {
          setEnemyTableMode(value);
          ensureEnemySortKeyVisible(overviewActive ? getOverviewColumns() : getEnemyColumns());
          renderEnemyDetails();
        }
      );
      break;
    case 'grouping':
      appendToolbarButtonGroup(
        toolbar,
        'Grouping:',
        [
          { value: 'none', label: 'No grouping' },
          { value: 'outcome', label: 'Group by outcome' }
        ],
        (value) => calculatorState.enemySort.groupMode === value,
        (value) => {
          setEnemyGroupMode(value);
          renderEnemyDetails();
        }
      );
      break;
    case 'scope':
      appendToolbarSelectGroup(
        toolbar,
        'Scope:',
        getOverviewScopeOptionGroupsForState(),
        calculatorState.overviewScope,
        (value) => {
          if (overviewActive) {
            ensureEnemySortKeyVisible(getOverviewColumnsForState({
              enemyTableMode: calculatorState.enemyTableMode,
              overviewScope: value
            }));
          }
          setOverviewScope(value);
          refreshEnemyCalculationViews();
        }
      );
      break;
    case 'targets':
      appendToolbarButtonGroup(
        toolbar,
        'Targets:',
        getEnemyTargetTypeOptionsForState().map((option) => ({ value: option.id, label: option.label })),
        (value) => getSelectedEnemyTargetTypes().includes(value),
        (value) => {
          toggleSelectedEnemyTargetType(value);
          refreshEnemyCalculationViews();
        }
      );
      break;
    case 'diff':
      appendToolbarButtonGroup(
        toolbar,
        'Diff:',
        [
          { value: 'absolute', label: 'Absolute' },
          { value: 'percent', label: '%' }
        ],
        (value) => calculatorState.diffDisplayMode === value,
        (value) => {
          setDiffDisplayMode(value);
          refreshEnemyCalculationViews();
        }
      );
      break;
    default:
      break;
  }
}

function renderEnemyControls(enemy) {
  const prefilterContainer = document.getElementById('calculator-enemy-prefilters');
  const controlsContainer = document.getElementById('calculator-enemy-controls');
  if (!prefilterContainer || !controlsContainer) {
    return;
  }

  prefilterContainer.innerHTML = '';
  controlsContainer.innerHTML = '';

  const overviewActive = calculatorState.mode === 'compare' && calculatorState.compareView === 'overview';
  const hasFocusedEnemy = Boolean(enemy && enemy.zones && enemy.zones.length > 0);
  if (!shouldShowEnemyControls({
    mode: calculatorState.mode,
    compareView: calculatorState.compareView,
    hasFocusedEnemy
  })) {
    prefilterContainer.classList.add('hidden');
    controlsContainer.classList.add('hidden');
    return;
  }

  const controlSections = getEnemyControlSections({
    mode: calculatorState.mode,
    compareView: calculatorState.compareView,
    hasFocusedEnemy,
    enemyTableMode: calculatorState.enemyTableMode
  });

  const prefilterToolbar = document.createElement('div');
  prefilterToolbar.className = 'calculator-toolbar';
  controlSections.beforeEnemySelector.forEach((controlId) => {
    appendEnemyToolbarControl(prefilterToolbar, controlId, { overviewActive });
  });
  if (prefilterToolbar.children.length > 0) {
    prefilterContainer.classList.remove('hidden');
    prefilterContainer.appendChild(prefilterToolbar);
  } else {
    prefilterContainer.classList.add('hidden');
  }

  controlsContainer.classList.remove('hidden');

  const toolbar = document.createElement('div');
  toolbar.className = 'calculator-toolbar';
  controlSections.afterEnemySelector.forEach((controlId) => {
    appendEnemyToolbarControl(toolbar, controlId, { overviewActive });
  });

  const note = document.createElement('span');
  note.className = 'status calculator-toolbar-note';
  note.classList.toggle('is-standalone', controlSections.afterEnemySelector.length === 0);
  if (calculatorState.mode !== 'compare') {
    note.textContent = hasFocusedEnemy
      ? 'Single mode shows the full enemy table, including raw stats plus Shots, Range, and TTK. Scope and target filters also affect the enemy dropdown.'
      : 'Scope and target filters affect the enemy dropdown in single mode. Select an enemy to see the full enemy table, including raw stats plus Shots, Range, and TTK.';
  } else if (!overviewActive && !hasFocusedEnemy) {
    note.textContent = `Scope and target filters affect the enemy dropdown and carry into Overview. Current scope: ${getEnemyScopeSummaryLabel(calculatorState.overviewScope)}. Select an enemy or Overview to see details.`;
  } else if (calculatorState.enemyTableMode === 'stats') {
    note.textContent = 'Stats view restores the fuller enemy columns. Switch back to Analysis for shots, range, and TTK.';
  } else if (overviewActive) {
    note.textContent = 'Overview is selected in the enemy dropdown. Pick a specific enemy there to return to the focused view.';
  } else if (calculatorState.mode === 'compare') {
    const groupingSlot = getOutcomeGroupingSlot(calculatorState.mode, calculatorState.enemySort.key);
    note.textContent = groupingSlot === 'B'
      ? 'Diff columns are computed as B - A. One-sided damage wins sort beyond finite deltas, and outcome grouping currently follows B because you are sorting a B column.'
      : 'Diff columns are computed as B - A. One-sided damage wins sort beyond finite deltas, and outcome grouping follows A by default.';
  } else {
    note.textContent = 'Outcome grouping follows the Kill, Main, Critical, Limb, Part badge order.';
  }
  toolbar.appendChild(note);

  controlsContainer.appendChild(toolbar);
}

function formatEnemyBaseCell(td, zone, header) {
  const value = zone?.[header];

  if (header === 'zone_name') {
    td.textContent = value || '';
    return;
  }

  if (header === 'health') {
    applyEnemyZoneHealthDisplayToCell(td, zone);
    return;
  }

  if (header === 'Con') {
    applyEnemyZoneConDisplayToCell(td, zone);
    return;
  }

  if (header === 'Dur%') {
    const durability = value || 0;
    td.textContent = `${(durability * 100).toFixed(0)}%`;
    td.style.color = durPercentageColor(durability);
    return;
  }

  if (header === 'AV') {
    td.textContent = value || 0;
    td.style.color = armorValueColor(value);
    return;
  }

  if (header === 'IsFatal') {
    td.textContent = value ? 'Yes' : 'No';
    if (value) {
      td.style.color = 'var(--red)';
    }
    return;
  }

  if (header === 'ExMult') {
    applyExplosiveDisplayToCell(td, zone);
    return;
  }

  if (header === 'ToMain%') {
    td.textContent = `${((value || 0) * 100).toFixed(0)}%`;
    return;
  }

  if (header === 'MainCap') {
    td.textContent = value ? 'Yes' : 'No';
    return;
  }

  td.textContent = value || '';
}

function formatOverviewBaseCell(td, row, header) {
  if (header === 'faction') {
    td.textContent = row.faction || '';
    return;
  }

  if (header === 'enemy') {
    td.textContent = row.enemyName || '';
    return;
  }

  formatEnemyBaseCell(td, row.zone, header);
}

function renderOverviewDetails(container) {
  const table = document.createElement('table');
  table.style.width = '100%';
  table.style.borderCollapse = 'collapse';
  table.className = 'calculator-table';

  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  const columns = getOverviewColumns();
  ensureEnemySortKeyVisible(columns);

  columns.forEach((column) => {
    const th = document.createElement('th');
    th.textContent = column.label;
    th.title = column.title || '';
    th.classList.add('sortable');
    if (calculatorState.enemySort.key === column.key) {
      th.classList.add(`sort-${calculatorState.enemySort.dir}`);
    }
    th.addEventListener('click', () => {
      toggleEnemySort(column.key);
      renderEnemyDetails();
    });
    headerRow.appendChild(th);
  });

  thead.appendChild(headerRow);
  table.appendChild(thead);

  const weaponA = getWeaponForSlot('A');
  const weaponB = getWeaponForSlot('B');
  const selectedAttacksA = getSelectedAttacks('A');
  const selectedAttacksB = getSelectedAttacks('B');
  const hitCountsA = getAttackHitCounts('A', selectedAttacksA);
  const hitCountsB = getAttackHitCounts('B', selectedAttacksB);

  const overviewRows = buildOverviewRows({
    units: getEnemyOptions(),
    scope: calculatorState.overviewScope,
    targetTypes: getSelectedEnemyTargetTypes(),
    weaponA,
    weaponB,
    selectedAttacksA,
    selectedAttacksB,
    hitCountsA,
    hitCountsB,
    distanceMetersA: getEngagementRangeMeters('A'),
    distanceMetersB: getEngagementRangeMeters('B')
  });

  if (overviewRows.length === 0) {
    createPlaceholder(container, 'No overview rows are available for the current scope and target filters');
    return;
  }

  const sortedRows = sortEnemyZoneRows(overviewRows, {
    mode: 'compare',
    sortKey: calculatorState.enemySort.key,
    sortDir: calculatorState.enemySort.dir,
    groupMode: calculatorState.enemySort.groupMode,
    diffDisplayMode: calculatorState.diffDisplayMode,
    pinMain: false
  });

  const tbody = document.createElement('tbody');

  sortedRows.forEach((row) => {
    const tr = document.createElement('tr');
    if (row.groupStart) {
      tr.classList.add('group-start');
    }

    columns.forEach((column) => {
      const metricCell = buildMetricColumnCell(column.key, row.metrics, {
        diffDisplayMode: calculatorState.diffDisplayMode
      });
      if (metricCell) {
        tr.appendChild(metricCell);
        return;
      }

      const td = document.createElement('td');
      formatOverviewBaseCell(td, row, column.key);
      tr.appendChild(td);
    });

    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  container.appendChild(table);
}

function buildSingleMetricCell(slot, slotMetrics, type, metrics = null) {
  const td = document.createElement('td');
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

  const ttkContent = document.createElement('div');
  ttkContent.className = 'calc-derived-inline';
  ttkContent.appendChild(createTtkValueNode(slotMetrics.ttkSeconds));
  appendOutcomeBadge(ttkContent, slotMetrics.outcomeKind);
  td.appendChild(ttkContent);
  td.title = getMetricTitle(slot, slotMetrics, 'ttk', metrics) || '';
  return td;
}

function buildDiffMetricCell(value, valueType, diffDisplayMode = 'absolute', metrics = null) {
  const td = document.createElement('td');
  td.classList.add('calc-derived-cell', 'calc-diff-cell');
  td.appendChild(createDiffValueNode(value, valueType, diffDisplayMode));
  td.title = getDiffMetricTitle(value, valueType, diffDisplayMode, metrics);
  return td;
}

function buildMetricColumnCell(columnKey, metrics, {
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

function appendEnemyProjectileCell(tr, enemyName, zoneIndex, enableRowClick = false) {
  const radioTd = document.createElement('td');
  radioTd.style.padding = '4px 10px';
  radioTd.style.borderBottom = '1px solid var(--border)';
  radioTd.style.width = '30px';
  radioTd.style.textAlign = 'center';

  const radio = document.createElement('input');
  radio.type = 'radio';
  radio.name = `enemy-zone-${enemyName}`;
  radio.value = zoneIndex;
  radio.id = `zone-${enemyName}-${zoneIndex}`;
  radio.checked = calculatorState.selectedZoneIndex === zoneIndex;
  radio.addEventListener('change', () => {
    setSelectedZoneIndex(zoneIndex);
    refreshEnemyCalculationViews();
  });

  if (enableRowClick) {
    tr.style.cursor = 'pointer';
    tr.addEventListener('click', (event) => {
      if (event.target !== radio) {
        radio.checked = true;
        setSelectedZoneIndex(zoneIndex);
        refreshEnemyCalculationViews();
      }
    });
  }

  radioTd.appendChild(radio);
  tr.appendChild(radioTd);
}

function appendEnemyExplosionCell(tr, zoneIndex, enableRowClick = false) {
  const checkboxTd = document.createElement('td');
  checkboxTd.style.padding = '4px 10px';
  checkboxTd.style.borderBottom = '1px solid var(--border)';
  checkboxTd.style.width = '30px';
  checkboxTd.style.textAlign = 'center';

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.value = zoneIndex;
  checkbox.checked = getSelectedExplosiveZoneIndices().includes(zoneIndex);
  checkbox.addEventListener('change', () => {
    setSelectedExplosiveZone(zoneIndex, checkbox.checked);
    refreshEnemyCalculationViews();
  });

  if (enableRowClick) {
    tr.style.cursor = 'pointer';
    tr.addEventListener('click', (event) => {
      if (event.target !== checkbox) {
        checkbox.checked = !checkbox.checked;
        setSelectedExplosiveZone(zoneIndex, checkbox.checked);
        refreshEnemyCalculationViews();
      }
    });
  }

  checkboxTd.appendChild(checkbox);
  tr.appendChild(checkboxTd);
}

export function renderEnemyDetails(enemy = calculatorState.selectedEnemy) {
  const container = document.getElementById('calculator-enemy-details');
  if (!container) {
    return;
  }

  container.innerHTML = '';
  if (calculatorState.mode === 'compare' && calculatorState.compareView === 'overview') {
    renderEnemyControls(null);
    renderOverviewDetails(container);
    return;
  }

  renderEnemyControls(enemy);

  if (!enemy || !enemy.zones || enemy.zones.length === 0) {
    createPlaceholder(container, 'Select an enemy to view details');
    return;
  }

  const table = document.createElement('table');
  table.style.width = '100%';
  table.style.borderCollapse = 'collapse';
  table.className = 'calculator-table';

  const weaponA = getWeaponForSlot('A');
  const weaponB = getWeaponForSlot('B');
  const selectedAttacksA = getSelectedAttacks('A');
  const selectedAttacksB = getSelectedAttacks('B');
  const hitCountsA = getAttackHitCounts('A', selectedAttacksA);
  const hitCountsB = getAttackHitCounts('B', selectedAttacksB);
  const {
    hasProjectileTargets,
    hasExplosiveTargets
  } = getFocusedTargetingModes(selectedAttacksA, selectedAttacksB);
  const targetColumnCount = Number(hasProjectileTargets) + Number(hasExplosiveTargets);

  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');

  if (hasProjectileTargets) {
    const projectileTh = document.createElement('th');
    projectileTh.textContent = 'Proj';
    projectileTh.style.padding = '4px 10px';
    projectileTh.style.textAlign = 'center';
    projectileTh.style.borderBottom = '2px solid var(--border)';
    projectileTh.style.color = 'var(--muted)';
    projectileTh.style.width = '30px';
    headerRow.appendChild(projectileTh);
  }

  if (hasExplosiveTargets) {
    const explosiveTh = document.createElement('th');
    explosiveTh.textContent = 'AoE';
    explosiveTh.style.padding = '4px 10px';
    explosiveTh.style.textAlign = 'center';
    explosiveTh.style.borderBottom = '2px solid var(--border)';
    explosiveTh.style.color = 'var(--muted)';
    explosiveTh.style.width = '30px';
    headerRow.appendChild(explosiveTh);
  }

  const columns = getEnemyColumns();
  ensureEnemySortKeyVisible(columns);
  columns.forEach((column) => {
    const th = document.createElement('th');
    th.textContent = column.label;
    th.title = column.title || '';
    th.classList.add('sortable');
    if (calculatorState.enemySort.key === column.key) {
      th.classList.add(`sort-${calculatorState.enemySort.dir}`);
    }
    th.addEventListener('click', () => {
      toggleEnemySort(column.key);
      renderEnemyDetails(enemy);
    });
    headerRow.appendChild(th);
  });

  thead.appendChild(headerRow);
  table.appendChild(thead);

  const zoneRows = buildFocusedZoneComparisonRows({
    enemy,
    weaponA,
    weaponB,
    selectedAttacksA,
    selectedAttacksB,
    hitCountsA,
    hitCountsB,
    distanceMetersA: getEngagementRangeMeters('A'),
    distanceMetersB: getEngagementRangeMeters('B')
  });

  const sortedRows = sortEnemyZoneRows(zoneRows, {
    mode: calculatorState.mode,
    sortKey: calculatorState.enemySort.key,
    sortDir: calculatorState.enemySort.dir,
    groupMode: calculatorState.enemySort.groupMode,
    diffDisplayMode: 'absolute',
    pinMain: true
  });

  const tbody = document.createElement('tbody');
  const rowEntries = [];

  sortedRows.forEach(({ zone, zoneIndex, metrics, groupStart }) => {
    const tr = document.createElement('tr');
    if (groupStart) {
      tr.classList.add('group-start');
    }

    if (hasProjectileTargets) {
      appendEnemyProjectileCell(tr, enemy.name, zoneIndex, targetColumnCount === 1 && !hasExplosiveTargets);
    }

    if (hasExplosiveTargets) {
      appendEnemyExplosionCell(tr, zoneIndex, targetColumnCount === 1 && !hasProjectileTargets);
    }

    columns.forEach((column) => {
      const metricCell = buildMetricColumnCell(column.key, metrics);
      if (metricCell) {
        tr.appendChild(metricCell);
        return;
      }

      const td = document.createElement('td');
      formatEnemyBaseCell(td, zone, column.key);
      tr.appendChild(td);
    });

    tbody.appendChild(tr);
    rowEntries.push({ tr, zone, zoneIndex });
  });

  const selectedZone = Number.isInteger(calculatorState.selectedZoneIndex)
    ? enemy?.zones?.[calculatorState.selectedZoneIndex] || null
    : null;
  wireZoneRelationHighlights(rowEntries, enemy, selectedZone);

  table.appendChild(tbody);
  container.appendChild(table);
}
