import { getZoneOutcomeDescription, getZoneOutcomeLabel } from '../zone-damage.js';
import { formatTtkSeconds } from '../summary.js';
import {
  getRecommendationAttackTitle,
  getRecommendationFlagTitle,
  getRecommendationMarginLabel,
  getRecommendationMarginTitle,
  getRecommendationRangeTitle,
  getRecommendationShotsTitle,
  getRecommendationTargetTitle,
  getRecommendationTipTitle,
  getRecommendationTtkTitle
} from './recommendation-titles.js';

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
  return cell;
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

export function appendRecommendationTableRow(tbody, row, usingFallbackRows = false, {
  marginBandKey = '',
  marginBandLabel = '',
  marginBandDescription = ''
} = {}) {
  const tableRow = document.createElement('tr');
  if (marginBandLabel) {
    tableRow.classList.add('calc-recommend-band-start');
    tableRow.classList.add(`is-${marginBandKey || 'overkill'}`);
    tableRow.dataset.marginBandKey = marginBandKey || 'overkill';
    tableRow.dataset.marginBandLabel = marginBandLabel;
    tableRow.dataset.marginBandDescription = marginBandDescription;
  }

  const weaponCell = appendRecommendationCell(tableRow, row.weapon.name, '', row.weapon.name);
  if (marginBandLabel) {
    weaponCell.classList.add('calc-recommend-band-start-cell');
    weaponCell.dataset.marginBandLabel = marginBandLabel;
    weaponCell.dataset.marginBandKey = marginBandKey || 'overkill';
    weaponCell.dataset.marginBandDescription = marginBandDescription;
  }
  const attackCell = appendRecommendationCell(
    tableRow,
    row.attackName,
    'calc-recommend-attack-cell',
    getRecommendationAttackTitle(row)
  );
  if (row?.damageTypeLabel) {
    attackCell.dataset.damageType = row.damageTypeLabel;
    attackCell.dataset.damageTypeDetail = row.damageTypeDetail || row.damageTypeLabel;
    attackCell.dataset.damageTypeKind = row?.isMixedDamageType ? 'mixed' : 'single';
  }

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
      row.qualifiesForMargin || row.showNearMissHighlight,
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
