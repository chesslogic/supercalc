import test from 'node:test';
import assert from 'node:assert/strict';

import { toFiniteNumber, normalizeText } from '../calculator/domain-utils.js';
import {
  OUTCOME_PRIORITY,
  SINGLE_OUTCOME_GROUP_ORDER,
  COMPARE_OUTCOME_GROUP_ORDER,
  ONE_SIDED_OUTCOME_GROUP_ORDER,
  getOutcomePriority,
  getZoneOutcomeLabel,
  getZoneOutcomeDescription
} from '../calculator/outcome-kinds.js';
import {
  AP_EQUALS_AV_DAMAGE_MULTIPLIER,
  FAST_TTK_THRESHOLD_SECONDS
} from '../calculator/combat-constants.js';

test('domain-utils: toFiniteNumber', (t) => {
  assert.strictEqual(toFiniteNumber(42), 42);
  assert.strictEqual(toFiniteNumber('3.14'), 3.14);
  assert.strictEqual(toFiniteNumber(0), 0);
  assert.strictEqual(toFiniteNumber(null), 0); // Number(null) === 0
  assert.strictEqual(toFiniteNumber(undefined), null);
  assert.strictEqual(toFiniteNumber(''), 0); // Number('') === 0
  assert.strictEqual(toFiniteNumber('abc'), null);
  assert.strictEqual(toFiniteNumber(Infinity), null);
  assert.strictEqual(toFiniteNumber(-Infinity), null);
  assert.strictEqual(toFiniteNumber(NaN), null);
});

test('domain-utils: normalizeText', (t) => {
  assert.strictEqual(normalizeText('  Hello World  '), 'hello world');
  assert.strictEqual(normalizeText('MAIN'), 'main');
  assert.strictEqual(normalizeText(null), '');
  assert.strictEqual(normalizeText(undefined), '');
  assert.strictEqual(normalizeText(''), '');
  assert.strictEqual(normalizeText(0), '0');
});

test('outcome-kinds: getOutcomePriority ordering', (t) => {
  const orderedKinds = ['fatal', 'doomed', 'main', 'critical', 'limb', 'utility', 'none'];
  for (let i = 0; i < orderedKinds.length - 1; i += 1) {
    assert.ok(
      getOutcomePriority(orderedKinds[i]) < getOutcomePriority(orderedKinds[i + 1]),
      `expected ${orderedKinds[i]} < ${orderedKinds[i + 1]}`
    );
  }
  assert.strictEqual(getOutcomePriority('unknown'), OUTCOME_PRIORITY.none);
  assert.strictEqual(getOutcomePriority(undefined), OUTCOME_PRIORITY.none);
});

test('outcome-kinds: getZoneOutcomeLabel', (t) => {
  assert.strictEqual(getZoneOutcomeLabel('fatal'), 'Kill');
  assert.strictEqual(getZoneOutcomeLabel('doomed'), 'Doomed');
  assert.strictEqual(getZoneOutcomeLabel('main'), 'Main');
  assert.strictEqual(getZoneOutcomeLabel('critical'), 'Critical');
  assert.strictEqual(getZoneOutcomeLabel('limb'), 'Limb');
  assert.strictEqual(getZoneOutcomeLabel('utility'), 'Part');
  assert.strictEqual(getZoneOutcomeLabel('none'), null);
  assert.strictEqual(getZoneOutcomeLabel(null), null);
  assert.strictEqual(getZoneOutcomeLabel(undefined), null);
});

test('outcome-kinds: getZoneOutcomeDescription returns string for known kinds', (t) => {
  const kinds = ['fatal', 'doomed', 'main', 'critical', 'limb', 'utility'];
  for (const kind of kinds) {
    const desc = getZoneOutcomeDescription(kind);
    assert.ok(typeof desc === 'string' && desc.length > 0, `expected string for kind "${kind}"`);
  }
  assert.strictEqual(getZoneOutcomeDescription('none'), null);
  assert.strictEqual(getZoneOutcomeDescription(null), null);
});

test('outcome-kinds: SINGLE_OUTCOME_GROUP_ORDER covers all outcome keys', (t) => {
  const expected = ['fatal', 'doomed', 'main', 'critical', 'limb', 'utility', 'none'];
  for (const key of expected) {
    assert.ok(key in SINGLE_OUTCOME_GROUP_ORDER, `missing key: ${key}`);
  }
});

test('outcome-kinds: COMPARE_OUTCOME_GROUP_ORDER includes oneSided', (t) => {
  assert.ok('oneSided' in COMPARE_OUTCOME_GROUP_ORDER);
  assert.ok(!('oneSided' in SINGLE_OUTCOME_GROUP_ORDER));
  assert.ok(!('oneSided' in ONE_SIDED_OUTCOME_GROUP_ORDER));
});

test('combat-constants: AP_EQUALS_AV_DAMAGE_MULTIPLIER is 0.65', (t) => {
  assert.strictEqual(AP_EQUALS_AV_DAMAGE_MULTIPLIER, 0.65);
});

test('combat-constants: FAST_TTK_THRESHOLD_SECONDS is 0.6', (t) => {
  assert.strictEqual(FAST_TTK_THRESHOLD_SECONDS, 0.6);
});

test('zone-damage re-exports getZoneOutcomeLabel and getZoneOutcomeDescription', async (t) => {
  const { getZoneOutcomeLabel: labelFn, getZoneOutcomeDescription: descFn } = await import('../calculator/zone-damage.js');
  assert.strictEqual(labelFn('fatal'), 'Kill');
  assert.strictEqual(descFn('fatal'), 'Killing this part kills the enemy');
});

test('recommendations/shared re-exports toFiniteNumber and normalizeText', async (t) => {
  const { toFiniteNumber: tfn, normalizeText: nt } = await import('../calculator/recommendations/shared.js');
  assert.strictEqual(tfn(5), 5);
  assert.strictEqual(tfn('x'), null);
  assert.strictEqual(nt('  UPPER  '), 'upper');
});
