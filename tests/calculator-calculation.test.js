import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

if (!globalThis.localStorage) {
  globalThis.localStorage = {
    getItem() {
      return null;
    },
    setItem() {},
    removeItem() {}
  };
}

const ENEMY_DATA = JSON.parse(
  readFileSync(new URL('../enemies/enemydata.json', import.meta.url), 'utf8')
);

function getEnemyByName(name) {
  for (const factionUnits of Object.values(ENEMY_DATA)) {
    const unit = factionUnits?.[name];
    if (unit) {
      return {
        name,
        health: unit.health,
        zones: (unit.damageable_zones || []).map((zone) => ({ ...zone }))
      };
    }
  }

  throw new Error(`Enemy not found in enemydata.json: ${name}`);
}

function makeExplosionAttackRow(name, damage, ap = 2, dur = 0) {
  return {
    'Atk Name': name,
    'Atk Type': 'Explosion',
    DMG: damage,
    DUR: dur,
    AP: ap
  };
}

function resetCalculatorState(calculatorState) {
  calculatorState.mode = 'single';
  calculatorState.compareView = 'focused';
  calculatorState.overviewScope = 'All';
  calculatorState.enemyTargetTypes = ['chaff', 'medium', 'elite', 'tank', 'giant'];
  calculatorState.diffDisplayMode = 'absolute';
  calculatorState.weaponA = null;
  calculatorState.weaponB = null;
  calculatorState.selectedEnemy = null;
  calculatorState.selectedZoneIndex = null;
  calculatorState.selectedExplosiveZoneIndices = [];
  calculatorState.selectedAttackKeys = {
    A: [],
    B: []
  };
  calculatorState.attackHitCounts = {
    A: {},
    B: {}
  };
  calculatorState.enemySort = {
    key: 'zone_name',
    dir: 'asc',
    groupMode: 'none'
  };
}

test('calculateDamage uses the selected explosive target as the focus zone when no projectile attacks are selected', async () => {
  const dataModule = await import('../calculator/data.js');
  const calculationModule = await import('../calculator/calculation.js');
  const { calculatorState, setSelectedEnemy, setSelectedWeapon, setSelectedExplosiveZone } = dataModule;
  const { calculateDamage } = calculationModule;

  resetCalculatorState(calculatorState);

  try {
    const enemy = getEnemyByName('Hulk Bruiser');
    const mainZoneIndex = enemy.zones.findIndex((zone) => zone.zone_name === 'Main');
    assert.notEqual(mainZoneIndex, -1);

    setSelectedWeapon('A', {
      name: 'Synthetic Explosive Only',
      rpm: 60,
      rows: [makeExplosionAttackRow('Synthetic AP4 Explosive', 100, 4)]
    });
    setSelectedEnemy(enemy);
    calculatorState.selectedExplosiveZoneIndices = [];
    setSelectedExplosiveZone(mainZoneIndex, true);

    const result = calculateDamage('A');

    assert.equal(result.focusZoneIndex, mainZoneIndex);
    assert.equal(result.zone?.zone_name, 'Main');
    assert.equal(result.totalDamagePerCycle, 26);
    assert.equal(result.totalDamageToMainPerCycle, 26);
    assert.equal(result.killSummary?.mainShotsToKill, 70);
  } finally {
    resetCalculatorState(calculatorState);
  }
});

test('getCalculationExplanationLines explains AP below AV for a blocked explosive main hit', async () => {
  const dataModule = await import('../calculator/data.js');
  const calculationModule = await import('../calculator/calculation.js');
  const { calculatorState, setSelectedEnemy, setSelectedWeapon, setSelectedExplosiveZone } = dataModule;
  const { calculateDamage, getCalculationExplanationLines } = calculationModule;

  resetCalculatorState(calculatorState);

  try {
    const enemy = getEnemyByName('Hulk Bruiser');
    const mainZoneIndex = enemy.zones.findIndex((zone) => zone.zone_name === 'Main');
    assert.notEqual(mainZoneIndex, -1);

    setSelectedWeapon('A', {
      name: 'Eruptor Explosion Sample',
      rpm: 32,
      rows: [makeExplosionAttackRow('15x100mm HIGH EXPLOSIVE_P_IE', 225, 3, 225)]
    });
    setSelectedEnemy(enemy);
    calculatorState.selectedExplosiveZoneIndices = [];
    setSelectedExplosiveZone(mainZoneIndex, true);

    const result = calculateDamage('A');
    const lines = getCalculationExplanationLines(result);

    assert.equal(result.totalDamagePerCycle, 0);
    assert.deepEqual(lines, [
      '15x100mm HIGH EXPLOSIVE_P_IE does 0 damage to Main because AP 3 is below AV 4.'
    ]);
  } finally {
    resetCalculatorState(calculatorState);
  }
});

test('getCalculationExplanationLines explains when damage does not transfer to main', async () => {
  const { getCalculationExplanationLines } = await import('../calculator/calculation.js');

  const lines = getCalculationExplanationLines({
    zone: { zone_name: 'side_plate' },
    focusZoneIndex: 1,
    totalDamagePerCycle: 60,
    totalDamageToMainPerCycle: 0,
    attackDetails: [
      {
        name: 'Burst',
        totalDamageToMainPerCycle: 0,
        zoneApplications: [
          {
            attackName: 'Burst',
            zoneName: 'side_plate',
            zoneIndex: 1,
            zoneDamage: 60,
            directMainDamage: 0,
            passthroughMainDamage: 0,
            attackResult: {
              toMainPercent: 0
            }
          }
        ]
      }
    ]
  });

  assert.deepEqual(lines, [
    'Burst damages side_plate but transfers 0% to Main.'
  ]);
});
