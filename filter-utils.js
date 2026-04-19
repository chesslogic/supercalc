/**
 * Evaluate a search query with OR (|) and AND (&) operators.
 * Default behavior (space-separated) is AND.
 * AND has higher precedence than OR (binds tighter).
 *
 * Examples:
 * - "rifle" -> matches if "rifle" is found
 * - "rifle pistol" -> matches if both "rifle" AND "pistol" are found
 * - "rifle | pistol" -> matches if "rifle" OR "pistol" is found
 * - "rifle & pistol" -> matches if both "rifle" AND "pistol" are found
 * - "rifle | pistol & grenade" -> matches if ("rifle" OR "pistol") AND "grenade"
 *
 * Note: searchText is already lowercase from the index, query is converted to lowercase for matching
 */
export function evaluateSearchQuery(query, searchText) {
  if (!query || !searchText) return false;

  const qLower = query.toLowerCase().trim();
  if (!qLower) return false;

  // Handle AND operators (&) first (higher precedence) — split by &, all parts must match
  if (qLower.includes('&')) {
    const andParts = qLower.split('&').map(part => part.trim()).filter(part => part.length > 0);
    return andParts.every(part => evaluateSearchQuery(part, searchText));
  }

  // Handle OR operators (|) — split by |, each part is evaluated separately
  if (qLower.includes('|')) {
    const orParts = qLower.split('|').map(part => part.trim()).filter(part => part.length > 0);
    return orParts.some(part => evaluateSearchQuery(part, searchText));
  }

  // Default: space-separated words are AND (all must match)
  const words = qLower.split(/\s+/).filter(word => word.length > 0);
  return words.every(word => searchText.includes(word));
}

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
