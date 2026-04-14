export function createPlaceholder(container, text) {
  const noData = document.createElement('div');
  noData.textContent = text;
  noData.style.color = 'var(--muted)';
  container.appendChild(noData);
}
