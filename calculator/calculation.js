// calculator/calculation.js — damage calculation logic
import { calculatorState } from './data.js';
import { renderResultPanel } from './result-panel.js';
import { renderEnemyDetails } from './rendering.js';
import { appendAttackCard } from './calculation/attack-cards.js';
import { calculateDamage, getEmptyCalculationMessage } from './calculation/damage-results.js';
import { renderTacticalGuidePanel, renderWeakspotBundlesPanel } from './calculation/info-panels.js';
import { renderOverviewCalculation } from './calculation/overview-panels.js';
import { renderRecommendationPanel } from './calculation/recommendation-panel.js';
import { appendTotalCard } from './calculation/total-card.js';

export { calculateDamage } from './calculation/damage-results.js';
export { getCalculationExplanationLines } from './calculation/damage-explanations.js';
export { renderRecommendationPanel } from './calculation/recommendation-panel.js';

function refreshCalculationViews() {
  renderEnemyDetails();
  renderCalculation();
}

function renderCalculationContent(container, slot, results) {
  results.attackDetails.forEach((attack, index) => {
    appendAttackCard(container, slot, attack, results.attackKeys[index], index, {
      onRefresh: refreshCalculationViews
    });
  });

  appendTotalCard(container, results);
}

function renderFocusedSupplementalPanels(container, enemy) {
  if (!enemy?.zones || enemy.zones.length === 0) {
    return;
  }

  const wrapper = document.createElement('div');
  wrapper.className = 'calc-compare-results calc-focused-results';
  renderTacticalGuidePanel(wrapper, enemy);
  renderWeakspotBundlesPanel(wrapper, enemy);
  renderRecommendationPanel(wrapper, enemy, { onRefresh: refreshCalculationViews });
  if (wrapper.childElementCount > 0) {
    container.appendChild(wrapper);
  }
}

export function renderCalculation() {
  const container = document.getElementById('calculator-result');
  if (!container) {
    return;
  }

  container.innerHTML = '';

  if (calculatorState.mode === 'compare') {
    if (calculatorState.compareView === 'overview') {
      renderOverviewCalculation(container);
      return;
    }

    const compareWrapper = document.createElement('div');
    compareWrapper.className = 'calc-compare-results';

    ['A', 'B'].forEach((slot) => {
      const results = calculateDamage(slot);
      renderResultPanel(compareWrapper, {
        slot,
        title: results?.weapon?.name || `Weapon ${slot}`,
        emptyText: getEmptyCalculationMessage(slot),
        showCompareShell: true,
        renderContent: results ? (panelBody) => renderCalculationContent(panelBody, slot, results) : null
      });
    });

    container.appendChild(compareWrapper);
    renderFocusedSupplementalPanels(container, calculatorState.selectedEnemy);
    return;
  }

  const results = calculateDamage('A');
  renderResultPanel(container, {
    slot: 'A',
    emptyText: getEmptyCalculationMessage('A'),
    renderContent: results ? (panelBody) => renderCalculationContent(panelBody, 'A', results) : null
  });
  if (!results) {
    return;
  }

  renderFocusedSupplementalPanels(container, results.enemy);
}
