export function getEnemyDropdownQueryState(query, {
  mode = 'single',
  compareView = 'focused',
  selectedEnemyName = ''
} = {}) {
  const normalizedQuery = String(query ?? '').trim().toLowerCase();
  const normalizedSelectedEnemyName = String(selectedEnemyName ?? '').trim().toLowerCase();
  const overviewActive = mode === 'compare' && compareView === 'overview';
  const queryMatchesSelectedEnemy = normalizedSelectedEnemyName !== '' && normalizedQuery === normalizedSelectedEnemyName;

  return {
    normalizedQuery,
    effectiveQuery: (overviewActive && normalizedQuery === 'overview') || queryMatchesSelectedEnemy
      ? ''
      : normalizedQuery,
    showOverviewOption: mode === 'compare' && 'overview'.includes(normalizedQuery)
  };
}

export function filterEnemiesByScope(options = [], scope = 'All') {
  const normalizedScope = String(scope ?? 'All').trim().toLowerCase();
  if (normalizedScope === '' || normalizedScope === 'all') {
    return [...options];
  }

  return options.filter((enemy) => String(enemy?.faction ?? '').trim().toLowerCase() === normalizedScope);
}
