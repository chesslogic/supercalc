import { formatTtkSeconds } from '../summary.js';
import { getZoneOutcomeDescription, getZoneOutcomeLabel } from '../zone-damage.js';
import { RECOMMENDATION_HEADER_DEFINITIONS } from './recommendation-constants.js';
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

export function renderRecommendationSubsection({
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
