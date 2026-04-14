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
  beforeEnemySelector.push('sort');

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
