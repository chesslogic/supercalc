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
