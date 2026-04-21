// calculator/rendering.js — render selected weapon and enemy details
import { calculatorState } from './data.js';
import { syncAllEngagementRangeWarnings } from './engagement-range-warning.js';
import { renderCalculation } from './calculation.js';
import { createPlaceholder } from './rendering/shared.js';
import { renderWeaponDetails } from './rendering/weapon-details.js';
import { renderEnemyControls } from './rendering/enemy-controls.js';
import { renderOverviewDetails } from './rendering/overview-table.js';
import { renderFocusedEnemyTable } from './rendering/enemy-focused-table.js';
import { syncCalculatorLayoutClass } from './rendering/layout-state.js';

export {
  getZoneRelationHighlightKind
} from './rendering/zone-relation-highlights.js';
export {
  getWeaponRangeAdjustedCellDisplay
} from './rendering/weapon-range-display.js';
export {
  getEnemyBaseColumnsForState,
  getEnemyColumnsForState,
  getOverviewColumnsForState,
  shouldShowEnemyControls,
  shouldShowEnemyScopeControls,
  getEnemyControlSections,
  getFocusedTargetingModes
} from './rendering/enemy-columns.js';
export { renderWeaponDetails } from './rendering/weapon-details.js';
export { getCalculatorLayoutClass } from './rendering/layout-state.js';

export function refreshEnemyCalculationViews() {
  syncAllEngagementRangeWarnings();
  renderEnemyDetails();
  renderCalculation();
}

export function refreshCalculatorViews() {
  renderWeaponDetails();
  refreshEnemyCalculationViews();
}

export function renderEnemyDetails(enemy = calculatorState.selectedEnemy) {
  const container = document.getElementById('calculator-enemy-details');
  if (!container) {
    return;
  }

  syncCalculatorLayoutClass(calculatorState);
  container.innerHTML = '';
  const renderCurrentEnemyDetails = (nextEnemy = enemy) => renderEnemyDetails(nextEnemy);

  if (calculatorState.mode === 'compare' && calculatorState.compareView === 'overview') {
    renderEnemyControls(null, {
      onRefreshEnemyCalculationViews: refreshEnemyCalculationViews,
      onRenderEnemyDetails: renderCurrentEnemyDetails
    });
    renderOverviewDetails(container, {
      onRenderEnemyDetails: renderCurrentEnemyDetails
    });
    return;
  }

  renderEnemyControls(enemy, {
    onRefreshEnemyCalculationViews: refreshEnemyCalculationViews,
    onRenderEnemyDetails: renderCurrentEnemyDetails
  });

  if (!enemy || !enemy.zones || enemy.zones.length === 0) {
    createPlaceholder(container, 'Select an enemy to view details');
    return;
  }

  renderFocusedEnemyTable(container, enemy, {
    onRefreshEnemyCalculationViews: refreshEnemyCalculationViews,
    onRenderEnemyDetails: renderCurrentEnemyDetails
  });
}
