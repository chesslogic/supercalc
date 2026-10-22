import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import './env-stubs.js';
import { loadFromText, state } from '../weapons/data.js';
import { getWeaponRowMultiplicity } from '../calculator/weapon-dropdown.js';
import { getDefaultSelectedAttackKeys } from '../calculator/compare-utils.js';
import { buildRecommendationAttackPackages } from '../calculator/recommendations/packages.js';
import {
  ingestBallisticFalloffCsvText,
  resolveBallisticFalloffProfileForWeapon
} from '../weapons/falloff.js';
import {
  getZoneOutcomeKind,
  summarizeEnemyTargetScenario,
  summarizeZoneDamage
} from '../calculator/zone-damage.js';

loadFromText(readFileSync(new URL('../weapons/weapondata.csv', import.meta.url), 'utf8'));

function getWeapon(code, name) {
  const weapon = state.groups.find((group) => (
    group.code === code && (!name || group.name === name)
  ));
  assert.ok(weapon, `expected ${code} ${name || ''} in weapondata.csv`);
  return weapon;
}

test('7.2.0 shotgun rows keep verified per-pellet damage and full-shot totals', () => {
  const fixtures = [
    ['M90A', 11, '66', '24', 726, 264],
    ['SG-8', 9, '54', '15', 486, 135],
    ['SG-225', 11, '36', '8', 396, 88],
    ['SG-225SP', 16, '18', '5', 288, 80],
    ['SG-22', 9, '54', '15', 486, 135]
  ];

  for (const [code, pellets, damage, durable, totalDamage, totalDurable] of fixtures) {
    const weapon = getWeapon(code);
    assert.equal(weapon.rows.length, 1, code);
    const [attack] = weapon.rows;
    assert.equal(getWeaponRowMultiplicity(attack), pellets, code);
    assert.equal(attack.DMG, damage, `${code} per-pellet DMG`);
    assert.equal(attack.DUR, durable, `${code} per-pellet DUR`);
    assert.equal(Number(attack.DMG) * pellets, totalDamage, `${code} full-shot DMG`);
    assert.equal(Number(attack.DUR) * pellets, totalDurable, `${code} full-shot DUR`);
  }
});

test('7.2.0 balance changes affect only the reviewed weapon fields and attack rows', () => {
  const fixtures = [
    ['MA5C', undefined, 0, { DMG: '90', DUR: '20', RPM: '640' }],
    ['StA-11', undefined, 0, { DMG: '100', DUR: '20', RPM: '1050' }],
    ['StA-52', undefined, 0, { DMG: '90', DUR: '22', RPM: '790' }],
    ['PLAS-39', undefined, 0, { DMG: '250', DUR: '125', ST: '15' }],
    ['PLAS-39', undefined, 1, { DMG: '100', DUR: '100', ST: '10' }],
    ['M-1000', undefined, 0, { DMG: '80', DUR: '18', ST: '20', PF: '24' }],
    ['EXO-51', 'Lumberer Exosuit (Flamethrower)', 0, { DMG: '8', DUR: '8', AP: '4' }],
    ['A/FLAM-40', undefined, 0, { DMG: '8', DUR: '8', AP: '4' }]
  ];

  for (const [code, name, rowIndex, fields] of fixtures) {
    const attack = getWeapon(code, name).rows[rowIndex];
    assert.ok(attack, `${code} attack ${rowIndex}`);
    for (const [field, value] of Object.entries(fields)) {
      assert.equal(attack[field], value, `${code} attack ${rowIndex} ${field}`);
    }
  }
});

test('Scope of Authority equipment ingests with exact attack values and existing taxonomy', () => {
  const fields = [
    'Type', 'Sub', 'Role', 'Code', 'Name', 'RPM', 'Atk Type', 'Atk Name',
    'DMG', 'DUR', 'AP', 'DF', 'ST', 'PF', 'Status'
  ];
  const fixtures = [
    ['Primary', 'DMR', 'precision', 'R-40', 'Sightliner', '40', 'projectile', 'R-40_P',
      '350', '205', '4', '10', '20', '25', ''],
    ['Secondary', 'PDW', 'automatic', 'P-44', 'Mist', '400', 'projectile', 'P-44_P',
      '110', '18', '2', '10', '10', '4', ''],
    ['Support', 'CAN', 'precision', 'AMW-20', 'Apex', '50', 'projectile', 'AMW-20_P',
      '1550', '930', '5', '15', '40', '25', ''],
    ['Support', 'CAN', 'precision', 'LAS-44', 'Nova', '30', 'projectile', 'LAS-44_P',
      '880', '880', '5', '17', '20', '20', ''],
    ['Grenade', 'SPC', 'special', 'G-11', 'Caltrops', '', 'explosion', 'G-11 CALTROPS_E',
      '50', '10', '3', '10', '30', '0', 'Stun Small']
  ];

  for (const fixture of fixtures) {
    const weapon = getWeapon(fixture[3]);
    assert.equal(weapon.rows.length, 1, weapon.name);
    assert.deepEqual(fields.map((field) => weapon.rows[0][field]), fixture);
    assert.equal(weapon.rpm, fixture[5] ? Number(fixture[5]) : null);
    assert.equal(state.typeIndex.get(fixture[0].toLowerCase())?.has(weapon), true);
    assert.equal(state.roleIndex.get(fixture[2])?.has(weapon), true);
  }
});

test('new ballistic weapons resolve their verified physical profiles, including zero-drag Nova', () => {
  ingestBallisticFalloffCsvText(readFileSync(new URL('../weapons/falloff.csv', import.meta.url), 'utf8'));
  const fixtures = [
    ['R-40', { caliber: '8', mass: '11', velocity: '950', drag: '0.2' }],
    ['P-44', { caliber: '9', mass: '7', velocity: '375', drag: '1.2' }],
    ['AMW-20', { caliber: '60', mass: '70', velocity: '1500', drag: '0.1' }],
    ['LAS-44', { caliber: '10', mass: '8', velocity: '1500', drag: '0' }]
  ];
  for (const [code, attributes] of fixtures) {
    const profile = resolveBallisticFalloffProfileForWeapon(getWeapon(code));
    assert.equal(profile.status, 'available', code);
    assert.deepEqual(profile.profile.attributes, attributes, code);
  }

  const nova = getWeapon('LAS-44');
  const summary = summarizeZoneDamage({
    zone: makeMainZone(880, 1),
    enemyMainHealth: 880,
    weapon: nova,
    selectedAttacks: nova.rows,
    rpm: nova.rpm,
    distanceMeters: 300
  });
  assert.equal(summary.totalDamagePerCycle, 880);
  assert.equal(summary.killSummary.zoneShotsToKill, 1);
});

function makeMainZone(health, durablePercent = 0) {
  return {
    zone_name: 'Main',
    health,
    AV: 0,
    'Dur%': durablePercent,
    'ToMain%': 1,
    ExTarget: 'Main',
    IsFatal: true
  };
}

test('Crescent Overseer backpack is a source-backed fatal zone with Main-routed explosion damage', () => {
  const runtime = JSON.parse(readFileSync(new URL('../enemies/enemydata.json', import.meta.url), 'utf8'));
  const sidecar = JSON.parse(readFileSync(
    new URL('../enemies/wikigg-enemy-anatomy-sidecar.json', import.meta.url), 'utf8'
  ));
  const unit = runtime.Illuminate['Crescent Overseer'];
  const enemy = { name: 'Crescent Overseer', health: unit.health, zones: unit.damageable_zones };
  const zoneIndex = enemy.zones.findIndex((zone) => zone.zone_name === 'backpack');
  const zone = enemy.zones[zoneIndex];
  assert.ok(zone, 'expected the new backpack weak point');
  const expected = {
    zone_name: 'backpack', health: 300, AV: 2, 'Dur%': 0, 'ToMain%': 0.5,
    MainCap: true, IsFatal: true, ExTarget: 'Main'
  };
  assert.deepEqual(zone, expected);

  const source = sidecar.Illuminate['Crescent Overseer'];
  for (const zones of [
    source.damageable_zones,
    source.source_provenance.anatomy_states.default.damageable_zones
  ]) {
    const backpack = zones.find((entry) => entry.zone_name === 'backpack');
    assert.deepEqual(backpack, { ...expected, source_zone_name: 'Backpack' });
  }
  assert.equal(source.source_provenance.reviewed_zone_overrides.backpack.source_revision_id, 139398);

  for (const [damage, shots] of [[300, 1], [299, 2]]) {
    const scenario = summarizeEnemyTargetScenario({
      enemy,
      selectedAttacks: [{ 'Atk Type': 'projectile', DMG: damage, DUR: 0, AP: 3 }],
      hitCounts: [1],
      rpm: 60,
      projectileZoneIndex: zoneIndex,
      explosiveZoneIndices: []
    });
    const summary = scenario.zoneSummaries[zoneIndex];
    assert.equal(summary.totalDamagePerCycle, damage);
    assert.equal(summary.killSummary.zoneShotsToKill, shots);
    assert.equal(getZoneOutcomeKind({ enemy, zone, ...summary }), 'fatal');
    assert.ok(summary.killSummary.mainShotsToKill > shots);
  }

  const explosion = summarizeEnemyTargetScenario({
    enemy,
    selectedAttacks: [{ 'Atk Type': 'explosion', DMG: 300, DUR: 300, AP: 3 }],
    hitCounts: [1],
    rpm: 60,
    projectileZoneIndex: zoneIndex,
    explosiveZoneIndices: [zoneIndex]
  });
  assert.equal(explosion.totalDirectMainDamagePerCycle, 300);
  assert.equal(explosion.zoneSummaries[zoneIndex].totalDamagePerCycle, 0);
  assert.equal(explosion.zoneSummaries[zoneIndex].killSummary.zoneShotsToKill, null);
  assert.equal(explosion.zoneSummaries[zoneIndex].killSummary.mainShotsToKill, 2);
});

test('buffed weapon damage reaches the specified shot-count breakpoints through the calculator', () => {
  const fixtures = [
    ['M90A', 700, 0, 11, 726, 1, { DMG: '55', DUR: '20' }, 2],
    ['M90A', 250, 1, 11, 264, 1, { DMG: '55', DUR: '20' }, 2],
    ['MA5C', 100, 1, 1, 20, 5, { DUR: '16' }, 7],
    ['StA-11', 100, 0, 1, 100, 1, { DMG: '90', DUR: '18' }, 2],
    ['StA-11', 100, 1, 1, 20, 5, { DMG: '90', DUR: '18' }, 6]
  ];

  for (const [code, health, durablePercent, hits, damage, shots, oldFields, oldShots] of fixtures) {
    const weapon = getWeapon(code);
    const [attack] = weapon.rows;
    const options = {
      zone: makeMainZone(health, durablePercent),
      enemyMainHealth: health,
      weapon,
      hitCounts: [hits],
      rpm: weapon.rpm,
      distanceMeters: 0
    };
    const current = summarizeZoneDamage({ ...options, selectedAttacks: [attack] });
    const previous = summarizeZoneDamage({ ...options, selectedAttacks: [{ ...attack, ...oldFields }] });
    assert.equal(current.totalDamagePerCycle, damage, code);
    assert.equal(current.killSummary.zoneShotsToKill, shots, code);
    assert.equal(previous.killSummary.zoneShotsToKill, oldShots, code);
  }
});

test('Caltrops packages one explosion and keeps its status without inventing a mine-field multiplier', () => {
  const weapon = getWeapon('G-11');
  const packages = buildRecommendationAttackPackages(weapon, { includeCombinedPackages: true });
  assert.equal(getDefaultSelectedAttackKeys(weapon).length, 1);
  assert.equal(packages.length, 1);
  assert.equal(packages[0].hitCount, 1);
  assert.equal(packages[0].packageComponents.length, 1);
  assert.equal(packages[0].packageComponents[0].attackRow.Status, 'Stun Small');
});
