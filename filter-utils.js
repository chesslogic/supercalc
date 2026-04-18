export function normalizeFilterValues(values = []) {
  return [...new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => String(value ?? '').trim().toLowerCase())
      .filter(Boolean)
  )];
}

export function createFilterChip({
  label,
  active = false,
  title = '',
  dataset = null,
  onClick = null
} = {}) {
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = `chip${active ? ' active' : ''}`;
  chip.textContent = String(label ?? '');
  if (title) {
    chip.title = title;
  }

  Object.entries(dataset || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      chip.dataset[key] = String(value);
    }
  });

  if (typeof onClick === 'function') {
    chip.addEventListener('click', () => onClick(chip));
  }

  return chip;
}

export function createFilterChipRow({
  label = '',
  children = []
} = {}) {
  const row = document.createElement('div');
  row.className = 'chiprow';

  if (label) {
    const rowLabel = document.createElement('span');
    rowLabel.className = 'muted';
    rowLabel.textContent = label;
    row.appendChild(rowLabel);
  }

  (Array.isArray(children) ? children : [])
    .filter(Boolean)
    .forEach((child) => row.appendChild(child));

  return row;
}
