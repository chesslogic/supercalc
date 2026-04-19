import test from 'node:test';
import assert from 'node:assert/strict';

import { buildWeaponRecommendationRows } from '../calculator/recommendations.js';
import { calculateAttackAgainstZone } from '../calculator/zone-damage.js';
import {
  FAST_TTK_THRESHOLD_SECONDS,
  AP_EQUALS_AV_DAMAGE_MULTIPLIER
} from '../calculator/combat-constants.js';
import {
  RECOMMENDATION_FLAG_TITLES,
  RECOMMENDATION_HEADER_DEFINITIONS,
  RECOMMENDATION_HIGHLIGHT_SUMMARY_TITLE
} from '../calculator/calculation/recommendation-constants.js';
import { resetBallisticFalloffProfiles } from '../weapons/falloff.js';
import {
  makeAttackRow,
  makeWeapon,
  makeZone
} from './fixtures/weapon-fixtures.js';

test('calculateAttackAgainstZone applies blocked, equal-armor, and penetrating damage multipliers', () => {
  const zone = {
    AV: 3,
    'Dur%': 0,
    'ToMain%': 0,
    ExTarget: 'Part',
    ExMult: 1
  };

  const blockedResult = calculateAttackAgainstZone(
    makeAttackRow('Blocked', 100, 2),
    zone
  );
  const equalArmorResult = calculateAttackAgainstZone(
    makeAttackRow('Equal Armor', 100, 3),
    zone
  );
  const penetratingResult = calculateAttackAgainstZone(
    makeAttackRow('Penetrating', 100, 4),
    zone
  );

  assert.equal(blockedResult.damageMultiplier, 0);
  assert.equal(blockedResult.damage, 0);

  assert.equal(equalArmorResult.damageMultiplier, AP_EQUALS_AV_DAMAGE_MULTIPLIER);
  assert.equal(equalArmorResult.damage, 65);

  assert.equal(penetratingResult.damageMultiplier, 1);
  assert.equal(penetratingResult.damage, 100);
});

test('buildWeaponRecommendationRows only marks decisive outcomes below the fast-TTK threshold', () => {
  const enemy = {
    name: 'Fast TTK Boundary Dummy',
    health: 100,
    zones: [
      makeZone('head', { health: 100, isFatal: true, av: 1, toMainPercent: 1 })
    ]
  };
  const weapons = [
    makeWeapon('Below Threshold', {
      index: 0,
      rpm: 120,
      rows: [makeAttackRow('Below Threshold', 50, 2)]
    }),
    makeWeapon('At Threshold', {
      index: 1,
      rpm: 100,
      rows: [makeAttackRow('At Threshold', 50, 2)]
    })
  ];

  const rows = buildWeaponRecommendationRows({
    enemy,
    weapons,
    rangeFloorMeters: 0
  });

  const belowThresholdRow = rows.find((row) => row.weapon.name === 'Below Threshold');
  const atThresholdRow = rows.find((row) => row.weapon.name === 'At Threshold');

  assert.equal(belowThresholdRow.bestOutcomeKind, 'fatal');
  assert.equal(belowThresholdRow.ttkSeconds, 0.5);
  assert.equal(belowThresholdRow.hasFastTtk, true);

  assert.equal(atThresholdRow.bestOutcomeKind, 'fatal');
  assert.equal(atThresholdRow.ttkSeconds, FAST_TTK_THRESHOLD_SECONDS);
  assert.equal(atThresholdRow.hasFastTtk, false);
});

test('buildWeaponRecommendationRows does not mark utility outcomes as fast TTK even below the threshold', () => {
  const enemy = {
    name: 'Utility Boundary Dummy',
    health: 500,
    zones: [
      makeZone('main', { health: 500, av: 10, toMainPercent: 1 }),
      makeZone('sensor', { health: 100, av: 1, toMainPercent: 0 })
    ]
  };
  const weapons = [
    makeWeapon('Sensor Breaker', {
      rpm: 120,
      rows: [makeAttackRow('Sensor Breaker', 50, 2)]
    })
  ];

  const rows = buildWeaponRecommendationRows({
    enemy,
    weapons,
    rangeFloorMeters: 0
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].bestOutcomeKind, 'utility');
  assert.equal(rows[0].ttkSeconds, 0.5);
  assert.equal(rows[0].hasFastTtk, false);
});

test('buildWeaponRecommendationRows requires range qualification for fast-TTK highlights', () => {
  resetBallisticFalloffProfiles();

  const enemy = {
    name: 'Unknown Range Dummy',
    health: 100,
    zones: [
      makeZone('head', { health: 100, isFatal: true, av: 1, toMainPercent: 1 })
    ]
  };
  const weapons = [
    makeWeapon('Unknown Range Breakpoint', {
      code: 'AR-23',
      rpm: 120,
      rows: [makeAttackRow('Unknown Range Breakpoint', 50, 2)]
    })
  ];

  const rows = buildWeaponRecommendationRows({
    enemy,
    weapons,
    rangeFloorMeters: 30
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].ttkSeconds, 0.5);
  assert.equal(rows[0].rangeStatus, 'unknown');
  assert.equal(rows[0].hasFastTtk, false);
});

test('recommendation fast-TTK copy stays aligned with the shared threshold constant', () => {
  const fastTtkHeader = RECOMMENDATION_HEADER_DEFINITIONS.find((definition) => definition.label === `<${FAST_TTK_THRESHOLD_SECONDS}s`);

  assert.ok(fastTtkHeader);
  assert.match(RECOMMENDATION_HIGHLIGHT_SUMMARY_TITLE, new RegExp(`<${FAST_TTK_THRESHOLD_SECONDS}s`));
  assert.match(RECOMMENDATION_FLAG_TITLES.fastTtk.active, new RegExp(`sub-${FAST_TTK_THRESHOLD_SECONDS}s`));
  assert.match(RECOMMENDATION_FLAG_TITLES.fastTtk.inactive, new RegExp(`sub-${FAST_TTK_THRESHOLD_SECONDS}s`));
});
