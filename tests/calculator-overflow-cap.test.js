import test from 'node:test';
import assert from 'node:assert/strict';

import { buildZoneComparisonMetrics } from '../calculator/compare-utils.js';
import { buildFamilyMainPathMetrics } from '../calculator/rendering/grouped-enemy-rows.js';
import { calculateMainKillShotsViaEquivalentZones } from '../calculator/zone-damage.js';
import { makeAttackRow } from './fixtures/weapon-fixtures.js';

function makeOverflowCapZone(overrides = {}) {
  return {
    zone_name: 'Arm',
    health: 100,
    Con: 0,
    AV: 1,
    'Dur%': 0,
    'ToMain%': 0.5,
    MainCap: 1,
    ExTarget: 'Part',
    ExMult: 1,
    IsFatal: false,
    ...overrides
  };
}

function buildOverflowCapMetrics(enemyMainHealth, zone = makeOverflowCapZone()) {
  return buildZoneComparisonMetrics({
    zone,
    enemyMainHealth,
    weaponA: { rpm: 60, name: 'Test Weapon' },
    selectedAttacksA: [makeAttackRow('Shot', 60)]
  });
}

test('overflow-capped limb does not report a direct Main kill when the breaking shot loses passthrough', () => {
  const zone = makeOverflowCapZone();
  const metrics = buildOverflowCapMetrics(60, zone);
  const slot = metrics.bySlot.A;

  assert.equal(slot.outcomeKind, 'limb');
  assert.equal(slot.shotsToKill, 2);
  assert.equal(slot.zoneSummary.killSummary.mainShotsToKill, null);
});

test('overflow-capped limb still reports a direct Main kill when capped passthrough exactly reaches Main', () => {
  const zone = makeOverflowCapZone();
  const metrics = buildOverflowCapMetrics(50, zone);
  const slot = metrics.bySlot.A;

  assert.equal(slot.outcomeKind, 'main');
  assert.equal(slot.shotsToKill, 2);
  assert.equal(slot.zoneSummary.killSummary.mainShotsToKill, 2);
});

test('calculateMainKillShotsViaEquivalentZones can kill Main by splitting across capped limbs before any limb breaks', () => {
  const zone = makeOverflowCapZone();
  const metrics = buildOverflowCapMetrics(60, zone);
  const slot = metrics.bySlot.A;

  assert.equal(
    calculateMainKillShotsViaEquivalentZones({
      zone,
      zoneSummary: slot.zoneSummary,
      memberCount: 2
    }),
    2
  );
});

test('buildFamilyMainPathMetrics surfaces a Main-via-family path for capped limbs when a single limb cannot kill Main', () => {
  const zone = makeOverflowCapZone();
  const repMetrics = buildOverflowCapMetrics(60, zone);
  const familyMetrics = buildFamilyMainPathMetrics(
    repMetrics,
    { isSingleton: false, memberIndices: [0, 1] },
    zone
  );

  assert.ok(familyMetrics);
  assert.equal(familyMetrics.bySlot.A.shotsToKill, 2);
  assert.equal(familyMetrics.bySlot.A.outcomeKind, 'main');
});

test('buildFamilyMainPathMetrics stays null when capped family members cannot collectively kill Main', () => {
  const zone = makeOverflowCapZone();
  const repMetrics = buildOverflowCapMetrics(110, zone);

  assert.equal(
    buildFamilyMainPathMetrics(
      repMetrics,
      { isSingleton: false, memberIndices: [0, 1] },
      zone
    ),
    null
  );
});
