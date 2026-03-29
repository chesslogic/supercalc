import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildWeaponRecommendationRows,
  normalizeRecommendationRangeMeters
} from '../calculator/recommendations.js';
import { getEnemyTacticalInfoChips, getEnemyWeakspotBundles } from '../calculator/tactical-data.js';
import {
  calculateMaxDistanceForDamageFloor,
  ingestBallisticFalloffCsvText,
  resetBallisticFalloffProfiles
} from '../weapons/falloff.js';

function makeAttackRow(name, damage, ap = 2) {
  return {
    'Atk Type': 'Projectile',
    'Atk Name': name,
    DMG: damage,
    DUR: 0,
    AP: ap,
    DF: 10,
    ST: 10,
    PF: 10
  };
}

function makeWeapon(name, {
  code = '',
  index = 0,
  rpm = 60,
  rows = []
} = {}) {
  return {
    name,
    code,
    index,
    rpm,
    type: 'Primary',
    sub: 'AR',
    rows
  };
}

function makeZone(zoneName, {
  health = 100,
  isFatal = false,
  av = 1,
  toMainPercent = 0
} = {}) {
  return {
    zone_name: zoneName,
    health,
    Con: 0,
    AV: av,
    'Dur%': 0,
    'ToMain%': toMainPercent,
    ExTarget: 'Part',
    ExMult: 1,
    IsFatal: isFatal
  };
}

const TEST_FALLOFF_CSV = `Category,Weapon,Caliber,Mass,Velocity,Drag,,2m,5m,15m,25m,50m,75m,100m,150m,200m
Primary / Assault Rifle,AR-23 Liberator,5.5,4.5,900,0.3,,0.70%,0.75%,2.15%,3.76%,6.82%,10.20%,13.34%,18.98%,23.96%`;

test('buildWeaponRecommendationRows separates one-shot kills from one-shot critical disables', () => {
  const enemy = {
    name: 'Heavy Devastator',
    health: 600,
    zones: [
      makeZone('head', { health: 220, isFatal: true, av: 1, toMainPercent: 1 }),
      makeZone('right_arm', { health: 100, av: 1, toMainPercent: 0.5 })
    ]
  };
  const weapons = [
    makeWeapon('Killshot', {
      index: 0,
      rows: [makeAttackRow('Killshot', 220, 2)]
    }),
    makeWeapon('Disarmer', {
      index: 1,
      rows: [makeAttackRow('Disarmer', 100, 2)]
    })
  ];

  const rows = buildWeaponRecommendationRows({
    enemy,
    weapons,
    rangeFloorMeters: 0
  });

  assert.equal(rows[0].weapon.name, 'Killshot');
  assert.equal(rows[0].hasOneShotKill, true);
  assert.equal(rows[0].bestOutcomeKind, 'fatal');

  assert.equal(rows[1].weapon.name, 'Disarmer');
  assert.equal(rows[1].hasOneShotCritical, true);
  assert.equal(rows[1].bestOutcomeKind, 'critical');
});

test('buildWeaponRecommendationRows drops one-shot range-qualified flags when the floor is too high', () => {
  resetBallisticFalloffProfiles();
  ingestBallisticFalloffCsvText(TEST_FALLOFF_CSV);

  const enemy = {
    name: 'Range Dummy',
    health: 500,
    zones: [
      makeZone('head', { health: 100, isFatal: true, av: 1, toMainPercent: 1 })
    ]
  };
  const weapons = [
    makeWeapon('Liberator', {
      code: 'AR-23',
      rows: [makeAttackRow('5.5x50mm FULL METAL JACKET_P', 105, 2)]
    })
  ];
  const expectedDistance = calculateMaxDistanceForDamageFloor(
    105,
    { caliber: 5.5, mass: 4.5, velocity: 900, drag: 0.3 },
    100
  );

  const pointBlankRows = buildWeaponRecommendationRows({
    enemy,
    weapons,
    rangeFloorMeters: 0
  });
  const beyondRangeRows = buildWeaponRecommendationRows({
    enemy,
    weapons,
    rangeFloorMeters: Math.ceil(expectedDistance) + 1
  });

  assert.equal(pointBlankRows[0].hasOneShotKill, true);
  assert.equal(beyondRangeRows[0].hasOneShotKill, false);
  assert.equal(beyondRangeRows[0].rangeStatus, 'failed');
});

test('getEnemyTacticalInfoChips merges faction, class, and enemy-specific guidance', () => {
  const chips = getEnemyTacticalInfoChips({
    name: 'Factory Strider',
    faction: 'Automaton',
    scopeTags: ['giant']
  });

  assert.ok(chips.some((chip) => chip.value === 'Automatons'));
  assert.ok(chips.some((chip) => chip.value === 'Giant'));
  assert.ok(chips.some((chip) => /Factory Strider Gatling Gun/.test(chip.description)));
});

test('getEnemyWeakspotBundles exposes curated Factory Strider standalone and body targets together', () => {
  const bundles = getEnemyWeakspotBundles({
    name: 'Factory Strider',
    faction: 'Automaton',
    scopeTags: ['giant']
  });

  assert.equal(bundles.length, 1);
  assert.equal(bundles[0].label, 'Factory Strider weakspots');
  assert.deepEqual(
    bundles[0].entries.map((entry) => [
      entry.label,
      entry.sourceEnemyName,
      entry.sourceType,
      entry.sourceZoneNames || (entry.sourceZoneName ? [entry.sourceZoneName] : null)
    ]),
    [
      ['Belly panels', 'Factory Strider Belly Panels', 'enemy', null],
      ['Head / eye weakspot', 'Factory Strider', 'zone', ['head_body']],
      ['Engine weakspot', 'Factory Strider', 'zone', ['weakspot_engine']],
      ['Chin Gatling Gun', 'Factory Strider Gatling Gun', 'enemy', null],
      ['Cannon Turret', 'Cannon Turret', 'enemy', null]
    ]
  );
  assert.match(bundles[0].entries[0].description, /curated overlay target for the exposed underside belly panels/i);
  assert.match(bundles[0].entries[1].description, /same gameplay target as the exposed eye opening/i);
});

test('normalizeRecommendationRangeMeters keeps range input in a sane integer band', () => {
  assert.equal(normalizeRecommendationRangeMeters('30.7'), 31);
  assert.equal(normalizeRecommendationRangeMeters(-10), 0);
  assert.equal(normalizeRecommendationRangeMeters(999), 500);
});
