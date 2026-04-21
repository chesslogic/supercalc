import {
  DEFAULT_RECOMMENDATION_SORT_MODE,
  STRICT_MARGIN_RECOMMENDATION_SORT_MODE
} from '../data.js';
import { RECOMMENDATION_HEADER_DEFINITIONS } from './recommendation-constants.js';
import { appendRecommendationTableRow } from './recommendation-row.js';

function getRecommendationMarginSortTitle(sortMode = DEFAULT_RECOMMENDATION_SORT_MODE) {
  return sortMode === STRICT_MARGIN_RECOMMENDATION_SORT_MODE
    ? 'Strict Margin sorting is active. Click again to return to the default recommendation ranking.'
    : 'Click to sort recommendations by the strictest Margin first. Click again to return to the default recommendation ranking.';
}

function renderRecommendationTable({
  body,
  rows,
  usingFallbackRows = false,
  visibleCount = null,
  headerDefinitions = RECOMMENDATION_HEADER_DEFINITIONS,
  sortMode = DEFAULT_RECOMMENDATION_SORT_MODE,
  onToggleMarginSort = null
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
  headerDefinitions.forEach(({ label, title }) => {
    const th = document.createElement('th');
    if (title) {
      th.title = title;
    }
    const isInteractiveMarginHeader = label === 'Margin' && typeof onToggleMarginSort === 'function';
    if (!isInteractiveMarginHeader) {
      th.textContent = label;
      headerRow.appendChild(th);
      return;
    }

    const sortActive = sortMode === STRICT_MARGIN_RECOMMENDATION_SORT_MODE;
    th.classList.add('calc-recommend-sort-header');
    if (sortActive) {
      th.classList.add('is-active');
    }
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `calc-recommend-sort-button${sortActive ? ' is-active' : ''}`;
    button.textContent = label;
    button.title = getRecommendationMarginSortTitle(sortMode);
    if (typeof button.setAttribute === 'function') {
      button.setAttribute('aria-pressed', sortActive ? 'true' : 'false');
    }
    button.addEventListener('click', () => onToggleMarginSort());
    th.appendChild(button);
    if (th.textContent !== label) {
      th.textContent = label;
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
  displayStep = null,
  headerDefinitions = RECOMMENDATION_HEADER_DEFINITIONS,
  sortMode = DEFAULT_RECOMMENDATION_SORT_MODE,
  onToggleMarginSort = null
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
      visibleCount: initialVisibleCount,
      headerDefinitions,
      sortMode,
      onToggleMarginSort
    });
    tbody = tableRender.tbody;
    updatePaginationControls();
  }

  body.appendChild(section);
}
