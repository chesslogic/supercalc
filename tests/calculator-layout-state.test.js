// Tests for the layout-state helpers that drive the calculator-wide CSS class.
import test from 'node:test';
import assert from 'node:assert/strict';
import './env-stubs.js';

import { getCalculatorLayoutClass } from '../calculator/rendering/layout-state.js';

// ---------------------------------------------------------------------------
// getCalculatorLayoutClass — pure function, no DOM needed
// ---------------------------------------------------------------------------

test('returns calculator-wide in overview mode', () => {
  assert.equal(
    getCalculatorLayoutClass({ mode: 'compare', compareView: 'overview', selectedEnemy: null }),
    'calculator-wide'
  );
});

test('returns calculator-wide in overview mode regardless of selectedEnemy', () => {
  assert.equal(
    getCalculatorLayoutClass({ mode: 'compare', compareView: 'overview', selectedEnemy: { zones: [] } }),
    'calculator-wide'
  );
});

test('returns null in focused compare mode with no enemy selected', () => {
  assert.equal(
    getCalculatorLayoutClass({ mode: 'compare', compareView: 'focused', selectedEnemy: null }),
    null
  );
});

test('returns null in focused compare mode with enemy but no zones', () => {
  assert.equal(
    getCalculatorLayoutClass({ mode: 'compare', compareView: 'focused', selectedEnemy: { zones: [] } }),
    null
  );
});

test('returns calculator-wide in focused compare mode when enemy has zones', () => {
  const enemy = { zones: [{ name: 'Head' }] };
  assert.equal(
    getCalculatorLayoutClass({ mode: 'compare', compareView: 'focused', selectedEnemy: enemy }),
    'calculator-wide'
  );
});

test('returns calculator-wide in single mode when enemy has zones', () => {
  const enemy = { zones: [{ name: 'Body' }, { name: 'Leg' }] };
  assert.equal(
    getCalculatorLayoutClass({ mode: 'single', compareView: 'focused', selectedEnemy: enemy }),
    'calculator-wide'
  );
});

test('returns null in single mode with no enemy', () => {
  assert.equal(
    getCalculatorLayoutClass({ mode: 'single', compareView: 'focused', selectedEnemy: null }),
    null
  );
});

test('returns null for empty/null state', () => {
  assert.equal(getCalculatorLayoutClass(null), null);
  assert.equal(getCalculatorLayoutClass({}), null);
  assert.equal(getCalculatorLayoutClass({ mode: undefined, compareView: undefined, selectedEnemy: undefined }), null);
});
