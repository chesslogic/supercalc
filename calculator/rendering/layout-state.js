// calculator/rendering/layout-state.js — state-driven layout class helpers

/**
 * Returns the CSS layout class that should be applied to the main shell
 * based on calculator state.  Returns 'calculator-wide' when the active
 * view is likely to need more horizontal space (overview table or focused
 * enemy analysis with zones loaded); returns null otherwise.
 *
 * This is a pure function so it can be unit-tested without a DOM.
 *
 * @param {{ mode: string, compareView: string, selectedEnemy: object|null }} state
 * @returns {'calculator-wide'|null}
 */
export function getCalculatorLayoutClass(state) {
  const { mode, compareView, selectedEnemy } = state ?? {};

  // Overview mode: always shows a wide multi-column comparison table.
  if (mode === 'compare' && compareView === 'overview') {
    return 'calculator-wide';
  }

  // Focused enemy analysis: widen when an enemy with at least one zone is loaded.
  if (selectedEnemy?.zones?.length > 0) {
    return 'calculator-wide';
  }

  return null;
}

/**
 * Reads the desired layout class from state and applies or removes
 * 'calculator-wide' on the <main> element.
 *
 * No-ops when the <main> element is absent (e.g. during server-side or
 * test-mode rendering without a full DOM).
 *
 * @param {{ mode: string, compareView: string, selectedEnemy: object|null }} state
 */
export function syncCalculatorLayoutClass(state) {
  const mainEl = document.querySelector('main');
  if (!mainEl) return;
  mainEl.classList.toggle('calculator-wide', getCalculatorLayoutClass(state) === 'calculator-wide');
}
