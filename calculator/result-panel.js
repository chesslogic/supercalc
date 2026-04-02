function appendEmptyCalculationState(container, text) {
  const emptyState = document.createElement('div');
  emptyState.textContent = text;
  emptyState.style.color = 'var(--muted)';
  emptyState.style.padding = '16px';
  container.appendChild(emptyState);
}

function buildResultPanelHeading(slot, titleText) {
  const heading = document.createElement('div');
  heading.className = 'calc-compare-heading';

  const badge = document.createElement('span');
  badge.className = `calc-compare-slot-badge calc-compare-slot-badge-${slot.toLowerCase()}`;
  badge.textContent = slot;
  heading.appendChild(badge);

  const title = document.createElement('div');
  title.className = 'calc-compare-title';
  title.textContent = titleText;
  heading.appendChild(title);

  return heading;
}

export function renderResultPanel(container, {
  slot = 'A',
  title = '',
  emptyText = '',
  renderContent,
  renderEmpty,
  showCompareShell = false
} = {}) {
  if (!showCompareShell) {
    if (typeof renderContent === 'function') {
      renderContent(container);
    } else if (typeof renderEmpty === 'function') {
      renderEmpty(container);
    } else if (emptyText) {
      appendEmptyCalculationState(container, emptyText);
    }
    return;
  }

  const panel = document.createElement('section');
  panel.className = 'calc-compare-panel';
  panel.appendChild(buildResultPanelHeading(slot, title));

  const body = document.createElement('div');
  body.className = 'calc-compare-body';
  panel.appendChild(body);

  if (typeof renderContent === 'function') {
    renderContent(body);
  } else if (typeof renderEmpty === 'function') {
    renderEmpty(body);
  } else if (emptyText) {
    appendEmptyCalculationState(body, emptyText);
  }

  container.appendChild(panel);
}
