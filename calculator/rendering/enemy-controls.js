import {
  calculatorState
} from '../data.js';
import { getOutcomeGroupingSlot } from '../compare-utils.js';
import { getEnemyScopeSummaryLabel } from '../enemy-scope.js';
import {
  getEnemyControlSections
} from './enemy-columns.js';
import { appendEnemyToolbarControl } from './enemy-toolbar-controls.js';

export function renderEnemyControls(enemy, {
  onRefreshEnemyCalculationViews = null,
  onRenderEnemyDetails = null
} = {}) {
  const prefilterContainer = document.getElementById('calculator-enemy-prefilters');
  const controlsContainer = document.getElementById('calculator-enemy-controls');
  if (!prefilterContainer || !controlsContainer) {
    return;
  }

  prefilterContainer.innerHTML = '';
  controlsContainer.innerHTML = '';

  const overviewActive = calculatorState.mode === 'compare' && calculatorState.compareView === 'overview';
  const hasFocusedEnemy = Boolean(enemy && enemy.zones && enemy.zones.length > 0);
  const controlSections = getEnemyControlSections({
    mode: calculatorState.mode,
    compareView: calculatorState.compareView,
    hasFocusedEnemy,
    enemyTableMode: calculatorState.enemyTableMode
  });

  if (controlSections.beforeEnemySelector.length === 0 && controlSections.afterEnemySelector.length === 0) {
    prefilterContainer.classList.add('hidden');
    controlsContainer.classList.add('hidden');
    return;
  }

  const prefilterToolbar = document.createElement('div');
  prefilterToolbar.className = 'calculator-toolbar';
  controlSections.beforeEnemySelector.forEach((controlId) => {
    appendEnemyToolbarControl(prefilterToolbar, controlId, {
      overviewActive,
      onRefreshEnemyCalculationViews,
      onRenderEnemyDetails
    });
  });
  if (prefilterToolbar.children.length > 0) {
    prefilterContainer.classList.remove('hidden');
    prefilterContainer.appendChild(prefilterToolbar);
  } else {
    prefilterContainer.classList.add('hidden');
  }

  controlsContainer.classList.remove('hidden');

  const toolbar = document.createElement('div');
  toolbar.className = 'calculator-toolbar';
  controlSections.afterEnemySelector.forEach((controlId) => {
    appendEnemyToolbarControl(toolbar, controlId, {
      overviewActive,
      onRefreshEnemyCalculationViews,
      onRenderEnemyDetails
    });
  });

  const note = document.createElement('span');
  note.className = 'status calculator-toolbar-note';
  note.classList.toggle('is-standalone', controlSections.afterEnemySelector.length === 0);
  if (calculatorState.mode !== 'compare') {
    note.textContent = hasFocusedEnemy
      ? 'Single mode shows the full enemy table, including raw stats plus Shots, Range, and TTK. Scope and target filters also affect the enemy dropdown.'
      : 'Scope and target filters affect the enemy dropdown in single mode. Select an enemy to see the full enemy table, including raw stats plus Shots, Range, and TTK.';
  } else if (!overviewActive && !hasFocusedEnemy) {
    note.textContent = `Scope and target filters affect the enemy dropdown and carry into Overview. Current scope: ${getEnemyScopeSummaryLabel(calculatorState.overviewScope)}. Select an enemy or Overview to see details.`;
  } else if (calculatorState.enemyTableMode === 'stats') {
    note.textContent = 'Stats view restores the fuller enemy columns. Switch back to Analysis for shots, range, and TTK.';
  } else if (overviewActive) {
    note.textContent = 'Overview is selected in the enemy dropdown. Pick a specific enemy there to return to the focused view.';
  } else if (calculatorState.mode === 'compare') {
    const groupingSlot = getOutcomeGroupingSlot(calculatorState.mode, calculatorState.enemySort.key);
    note.textContent = groupingSlot === 'B'
      ? 'Diff columns are computed as B - A. One-sided damage wins sort beyond finite deltas, and outcome grouping currently follows B because you are sorting a B column.'
      : 'Diff columns are computed as B - A. One-sided damage wins sort beyond finite deltas, and outcome grouping follows A by default.';
  } else {
    note.textContent = 'Outcome grouping follows the Kill, Doomed, Main, Critical, Limb, Part badge order.';
  }
  toolbar.appendChild(note);

  controlsContainer.appendChild(toolbar);
}
