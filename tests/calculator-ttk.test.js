import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  buildKillSummary,
  calculateShotsToKill,
  calculateTtkSeconds,
  formatTtkSeconds
} from '../calculator/summary.js';
import { tokenizeFormattedTtk } from '../calculator/ttk-formatting.js';
import {
  getZoneDisplayedKillPath,
  calculateAttackAgainstZone,
  getZoneDisplayedShotsToKill,
  getZoneDisplayedTtkSeconds,
  getZoneOutcomeDescription,
  getZoneOutcomeLabel,
  getZoneOutcomeKind,
  summarizeEnemyTargetScenario,
  summarizeZoneDamage
} from '../calculator/zone-damage.js';
import {
  getEnemyZoneConDisplayInfo,
  getEnemyZoneHealthDisplayInfo,
  MAIN_CON_ANY_DEATH_TOOLTIP
} from '../calculator/enemy-zone-display.js';
import { getCriticalZoneInfo } from '../calculator/tactical-data.js';

const ENEMY_DATA = JSON.parse(
  readFileSync(new URL('../enemies/enemydata.json', import.meta.url), 'utf8')
);

function parseCsvLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];

    if (char === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      values.push(current);
      current = '';
      continue;
    }

    current += char;
  }

  values.push(current);
  return values;
}

function loadCheckedInWeaponRows() {
  const csv = readFileSync(new URL('../weapons/weapondata.csv', import.meta.url), 'utf8').trimEnd();
  const lines = csv.split(/\r?\n/u);
  const headers = parseCsvLine(lines[0]);

  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']));
  });
}

const WEAPON_ROWS = loadCheckedInWeaponRows();

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

function getWeaponProjectileAttackByName(name) {
  const row = WEAPON_ROWS.find((entry) => (
    entry.Name === name
    && String(entry['Atk Type']).toLowerCase() === 'projectile'
  ));

  if (!row) {
    throw new Error(`Weapon not found in weapondata.csv: ${name}`);
  }

  return {
    'Atk Name': row['Atk Name'],
    'Atk Type': row['Atk Type'],
    DMG: Number(row.DMG),
    DUR: Number(row.DUR),
    AP: Number(row.AP)
  };
}

function getWeaponRpmByName(name) {
  const row = WEAPON_ROWS.find((entry) => (
    entry.Name === name
    && Number.isFinite(Number(entry.RPM))
    && Number(entry.RPM) > 0
  ));

  if (!row) {
    throw new Error(`Weapon RPM not found in weapondata.csv: ${name}`);
  }

  return Number(row.RPM);
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

test('calculateShotsToKill rounds up to the next full firing cycle', () => {
  assert.equal(calculateShotsToKill(300, 100), 3);
  assert.equal(calculateShotsToKill(301, 100), 4);
});

test('calculateTtkSeconds treats the first firing cycle as immediate', () => {
  assert.equal(calculateTtkSeconds(3, 60), 2);
  assert.equal(formatTtkSeconds(calculateTtkSeconds(3, 60)), '2.00s');
});

test('buildKillSummary keeps Liberator Carbine sample under one second', () => {
  const summary = buildKillSummary({
    zoneHealth: 15,
    zoneCon: 0,
    enemyMainHealth: 0,
    totalDamagePerCycle: 1,
    totalDamageToMainPerCycle: 0,
    rpm: 920
  });

  assert.equal(summary.zoneShotsToKill, 15);
  assert(summary.zoneTtkSeconds !== null);
  assert(summary.zoneTtkSeconds < 1);
  assert.equal(formatTtkSeconds(summary.zoneTtkSeconds), '0.91s');
});

test('calculateTtkSeconds returns zero for a one-cycle kill', () => {
  assert.equal(calculateTtkSeconds(1, 760), 0);
  assert.equal(formatTtkSeconds(calculateTtkSeconds(1, 760)), '0.00s');
});

test('buildKillSummary uses beam cadence ticks for sustained-contact TTK', () => {
  const summary = buildKillSummary({
    zoneHealth: 5,
    zoneCon: 0,
    enemyMainHealth: 5,
    totalDamagePerCycle: 335,
    totalDamageToMainPerCycle: 335,
    rpm: null,
    cadenceModel: {
      type: 'beam',
      beamTicksPerSecond: 67
    }
  });

  assert.equal(summary.hasRpm, true);
  assert.equal(summary.usesBeamCadence, true);
  assert.equal(summary.beamTicksPerSecond, 67);
  assert.equal(summary.zoneShotsToKill, 1);
  assert.equal(summary.mainShotsToKill, 1);
  assert.equal(summary.zoneTtkSeconds, 1 / 67);
  assert.equal(summary.mainTtkSeconds, 1 / 67);
  assert.equal(formatTtkSeconds(summary.zoneTtkSeconds), '0.01s');
});

test('calculateTtkSeconds returns null when shots-to-kill is unavailable', () => {
  assert.equal(calculateTtkSeconds(null, 760), null);
});

test('tokenizeFormattedTtk de-emphasizes insignificant zeroes while preserving digits', () => {
  assert.deepEqual(
    tokenizeFormattedTtk('10.05s'),
    [
      { text: '1', kind: 'significant' },
      { text: '0', kind: 'default' },
      { text: '.', kind: 'separator' },
      { text: '0', kind: 'muted' },
      { text: '5', kind: 'significant' },
      { text: 's', kind: 'suffix' }
    ]
  );

  assert.deepEqual(
    tokenizeFormattedTtk('0.00s'),
    [
      { text: '0', kind: 'muted' },
      { text: '.', kind: 'separator' },
      { text: '0', kind: 'muted' },
      { text: '0', kind: 'muted' },
      { text: 's', kind: 'suffix' }
    ]
  );
});

test('buildKillSummary omits TTK when RPM is missing', () => {
  const summary = buildKillSummary({
    zoneHealth: 300,
    zoneCon: 0,
    enemyMainHealth: 0,
    totalDamagePerCycle: 100,
    totalDamageToMainPerCycle: 0,
    rpm: null
  });

  assert.equal(summary.hasRpm, false);
  assert.equal(summary.zoneShotsToKill, 3);
  assert.equal(summary.zoneTtkSeconds, null);
});

test('summarizeZoneDamage computes row-level part shots and ttk from selected attacks', () => {
  const summary = summarizeZoneDamage({
    zone: {
      health: 300,
      Con: 0,
      AV: 1,
      'Dur%': 0,
      'ToMain%': 0,
      ExTarget: 'Part',
      ExMult: 1,
      IsFatal: false
    },
    enemyMainHealth: 1000,
    selectedAttacks: [{
      'Atk Name': 'Burst',
      'Atk Type': 'Projectile',
      DMG: 100,
      DUR: 0,
      AP: 2
    }],
    rpm: 60
  });

  assert.equal(summary.totalDamagePerCycle, 100);
  assert.equal(summary.killSummary.zoneShotsToKill, 3);
  assert.equal(summary.killSummary.zoneTtkSeconds, 2);
});

test('summarizeZoneDamage keeps shots but omits ttk without rpm', () => {
  const summary = summarizeZoneDamage({
    zone: {
      health: 300,
      Con: 0,
      AV: 1,
      'Dur%': 0,
      'ToMain%': 0,
      ExTarget: 'Part',
      ExMult: 1,
      IsFatal: false
    },
    enemyMainHealth: 1000,
    selectedAttacks: [{
      'Atk Name': 'Burst',
      'Atk Type': 'Projectile',
      DMG: 100,
      DUR: 0,
      AP: 2
    }],
    rpm: null
  });

  assert.equal(summary.killSummary.zoneShotsToKill, 3);
  assert.equal(summary.killSummary.zoneTtkSeconds, null);
});

test('summarizeZoneDamage auto-detects beam cadence and exposes tick-based kills', () => {
  const summary = summarizeZoneDamage({
    zone: {
      health: 25,
      Con: 0,
      AV: 1,
      'Dur%': 0,
      'ToMain%': 0,
      ExTarget: 'Part',
      ExMult: 1,
      IsFatal: false
    },
    enemyMainHealth: 1000,
    selectedAttacks: [{
      'Atk Name': 'Beam',
      'Atk Type': 'beam',
      DMG: 335,
      DUR: 0,
      AP: 2
    }],
    rpm: null
  });

  assert.equal(summary.totalDamagePerCycle, 335);
  assert.equal(summary.killSummary.usesBeamCadence, true);
  assert.equal(summary.killSummary.beamTicksPerSecond, 67);
  assert.equal(summary.killSummary.zoneShotsToKill, 5);
  assert.equal(summary.killSummary.zoneTtkSeconds, 5 / 67);
  assert.equal(formatTtkSeconds(summary.killSummary.zoneTtkSeconds), '0.07s');
});

test('calculateAttackAgainstZone floors per-packet damage before applying main passthrough', () => {
  const attack = calculateAttackAgainstZone(
    {
      'Atk Name': 'Adjudicator-ish',
      'Atk Type': 'Projectile',
      DMG: 44.6,
      DUR: 0,
      AP: 3
    },
    {
      AV: 3,
      'Dur%': 0,
      'ToMain%': 0.7,
      ExTarget: 'Part',
      ExMult: 1
    }
  );

  assert.equal(attack.damage, 28);
  assert.equal(attack.damageToMain, 19);
});

test('summarizeZoneDamage does not carry fractional leftovers across firing cycles', () => {
  const summary = summarizeZoneDamage({
    zone: {
      health: 125,
      Con: 0,
      AV: 3,
      'Dur%': 0,
      'ToMain%': 0,
      ExTarget: 'Part',
      ExMult: 1,
      IsFatal: false
    },
    enemyMainHealth: 1000,
    selectedAttacks: [{
      'Atk Name': 'Fractional Threshold',
      'Atk Type': 'Projectile',
      DMG: 64.23076923076923,
      DUR: 0,
      AP: 3
    }],
    rpm: 60
  });

  assert.equal(summary.attackDetails[0].damage, 41);
  assert.equal(summary.totalDamagePerCycle, 41);
  assert.equal(summary.killSummary.zoneShotsToKill, 4);
  assert.equal(summary.killSummary.zoneTtkSeconds, 3);
});

test('explosive damage uses ExMult directly, so ExMult 0 means immunity', () => {
  const attack = calculateAttackAgainstZone(
    {
      'Atk Name': 'Explosion',
      'Atk Type': 'Explosion',
      DMG: 100,
      DUR: 0,
      AP: 2
    },
    {
      AV: 1,
      'Dur%': 0,
      'ToMain%': 0,
      ExTarget: 'Part',
      ExMult: 0
    }
  );

  assert.equal(attack.explosionModifier, 0);
  assert.equal(attack.damage, 0);
});

test('explosions apply one direct main hit per explosion using main defenses', () => {
  const summary = summarizeEnemyTargetScenario({
    enemy: {
      health: 500,
      zones: [
        { zone_name: 'Main', health: 500, Con: 0, AV: 1, 'Dur%': 0, 'ToMain%': 0, ExTarget: 'Main', ExMult: 1, IsFatal: false },
        { zone_name: 'Arm', health: 300, Con: 0, AV: 5, 'Dur%': 0, 'ToMain%': 0.5, ExTarget: 'Part', ExMult: 1, IsFatal: false }
      ]
    },
    selectedAttacks: [{
      'Atk Name': 'Explosion',
      'Atk Type': 'Explosion',
      DMG: 100,
      DUR: 0,
      AP: 2
    }],
    hitCounts: [1],
    rpm: 60,
    projectileZoneIndex: 1,
    explosiveZoneIndices: [1]
  });

  assert.equal(summary.totalDirectMainDamagePerCycle, 100);
  assert.equal(summary.totalPassthroughMainDamagePerCycle, 0);
  assert.equal(summary.totalDamageToMainPerCycle, 100);
  assert.equal(summary.zoneSummaries[1].totalDamagePerCycle, 0);
  assert.equal(summary.zoneSummaries[0].totalDamagePerCycle, 100);
});

test('explosive limb damage adds passthrough main damage without rechecking main armor', () => {
  const summary = summarizeEnemyTargetScenario({
    enemy: {
      health: 500,
      zones: [
        { zone_name: 'Main', health: 500, Con: 0, AV: 1, 'Dur%': 0, 'ToMain%': 0, ExTarget: 'Main', ExMult: 1, IsFatal: false },
        { zone_name: 'Leg', health: 300, Con: 0, AV: 1, 'Dur%': 0, 'ToMain%': 0.5, ExTarget: 'Part', ExMult: 1, IsFatal: false }
      ]
    },
    selectedAttacks: [{
      'Atk Name': 'Explosion',
      'Atk Type': 'Explosion',
      DMG: 100,
      DUR: 0,
      AP: 2
    }],
    hitCounts: [1],
    rpm: 60,
    projectileZoneIndex: 1,
    explosiveZoneIndices: [1]
  });

  assert.equal(summary.totalDirectMainDamagePerCycle, 100);
  assert.equal(summary.totalPassthroughMainDamagePerCycle, 50);
  assert.equal(summary.totalDamageToMainPerCycle, 150);
  assert.equal(summary.zoneSummaries[1].totalDamagePerCycle, 100);
  assert.equal(summary.zoneSummaries[0].totalDamagePerCycle, 150);
});

test('fictive shoulder hit applies one direct main hit plus passthrough from the damaged shoulder', () => {
  const summary = summarizeEnemyTargetScenario({
    enemy: {
      health: 500,
      zones: [
        { zone_name: 'Main', health: 500, Con: 0, AV: 1, 'Dur%': 0, 'ToMain%': 1, ExTarget: 'Main', ExMult: 1, IsFatal: false },
        { zone_name: 'Shoulder', health: 200, Con: 0, AV: 1, 'Dur%': 0, 'ToMain%': 0.5, ExTarget: 'Part', ExMult: 0.5, IsFatal: false }
      ]
    },
    selectedAttacks: [{
      'Atk Name': 'Explosion',
      'Atk Type': 'Explosion',
      DMG: 100,
      DUR: 0,
      AP: 2
    }],
    hitCounts: [1],
    rpm: 60,
    projectileZoneIndex: 1,
    explosiveZoneIndices: [1]
  });

  assert.equal(summary.totalDirectMainDamagePerCycle, 100);
  assert.equal(summary.totalPassthroughMainDamagePerCycle, 25);
  assert.equal(summary.totalDamageToMainPerCycle, 125);
  assert.equal(summary.zoneSummaries[1].totalDamagePerCycle, 50);
  assert.equal(summary.zoneSummaries[0].totalDamagePerCycle, 125);
});

test('two fictive shoulder hits still apply only one direct main hit but add passthrough from both shoulders', () => {
  const summary = summarizeEnemyTargetScenario({
    enemy: {
      health: 500,
      zones: [
        { zone_name: 'Main', health: 500, Con: 0, AV: 1, 'Dur%': 0, 'ToMain%': 1, ExTarget: 'Main', ExMult: 1, IsFatal: false },
        { zone_name: 'Left Shoulder', health: 200, Con: 0, AV: 1, 'Dur%': 0, 'ToMain%': 0.5, ExTarget: 'Part', ExMult: 0.5, IsFatal: false },
        { zone_name: 'Right Shoulder', health: 200, Con: 0, AV: 1, 'Dur%': 0, 'ToMain%': 0.5, ExTarget: 'Part', ExMult: 0.5, IsFatal: false }
      ]
    },
    selectedAttacks: [{
      'Atk Name': 'Explosion',
      'Atk Type': 'Explosion',
      DMG: 100,
      DUR: 0,
      AP: 2
    }],
    hitCounts: [1],
    rpm: 60,
    projectileZoneIndex: 1,
    explosiveZoneIndices: [1, 2]
  });

  assert.equal(summary.totalDirectMainDamagePerCycle, 100);
  assert.equal(summary.totalPassthroughMainDamagePerCycle, 50);
  assert.equal(summary.totalDamageToMainPerCycle, 150);
  assert.equal(summary.zoneSummaries[1].totalDamagePerCycle, 50);
  assert.equal(summary.zoneSummaries[2].totalDamagePerCycle, 50);
  assert.equal(summary.zoneSummaries[0].totalDamagePerCycle, 150);
  assert.equal(
    summary.attackDetails[0].zoneApplications.filter((application) => application.directMainDamage > 0).length,
    1
  );
  assert.equal(
    summary.attackDetails[0].zoneApplications.reduce((sum, application) => sum + application.directMainDamage, 0),
    100
  );
});

test('charger-style BFGL head hit applies direct main damage and passthrough from the struck limb', () => {
  const summary = summarizeEnemyTargetScenario({
    enemy: {
      health: 1500,
      zones: [
        { zone_name: 'Main', health: 1500, Con: 0, AV: 4, 'Dur%': 0, 'ToMain%': 1, ExTarget: 'Main', ExMult: 0.75, IsFatal: false },
        { zone_name: 'Head', health: 500, Con: 0, AV: 4, 'Dur%': 0, 'ToMain%': 0.7, ExTarget: 'Part', ExMult: 0.75, IsFatal: false }
      ]
    },
    selectedAttacks: [{
      'Atk Name': 'BFGL',
      'Atk Type': 'Explosion',
      DMG: 150,
      DUR: 150,
      AP: 4
    }],
    hitCounts: [1],
    rpm: 60,
    projectileZoneIndex: 1,
    explosiveZoneIndices: [1]
  });

  const expectedDirectMainDamage = 73;
  const expectedPassthroughDamage = 51;
  const expectedTotalMainDamage = expectedDirectMainDamage + expectedPassthroughDamage;

  assert.equal(summary.totalDirectMainDamagePerCycle, expectedDirectMainDamage);
  assert.equal(summary.totalPassthroughMainDamagePerCycle, expectedPassthroughDamage);
  assert.equal(summary.totalDamageToMainPerCycle, expectedTotalMainDamage);
  assert.equal(summary.zoneSummaries[1].totalDamagePerCycle, expectedDirectMainDamage);
  assert.equal(summary.zoneSummaries[0].totalDamagePerCycle, expectedTotalMainDamage);
});

test('explosive AoE applies one direct main hit and adds passthrough from every struck limb', () => {
  const summary = summarizeEnemyTargetScenario({
    enemy: {
      health: 600,
      zones: [
        { zone_name: 'Main', health: 600, Con: 0, AV: 1, 'Dur%': 0, 'ToMain%': 0, ExTarget: 'Main', ExMult: 1, IsFatal: false },
        { zone_name: 'Left Leg', health: 300, Con: 0, AV: 1, 'Dur%': 0, 'ToMain%': 0.5, ExTarget: 'Part', ExMult: 1, IsFatal: false },
        { zone_name: 'Right Leg', health: 300, Con: 0, AV: 1, 'Dur%': 0, 'ToMain%': 0.25, ExTarget: 'Part', ExMult: 1, IsFatal: false }
      ]
    },
    selectedAttacks: [{
      'Atk Name': 'Explosion',
      'Atk Type': 'Explosion',
      DMG: 100,
      DUR: 0,
      AP: 2
    }],
    hitCounts: [1],
    rpm: 60,
    projectileZoneIndex: 1,
    explosiveZoneIndices: [1, 2]
  });

  assert.equal(summary.totalDirectMainDamagePerCycle, 100);
  assert.equal(summary.totalPassthroughMainDamagePerCycle, 75);
  assert.equal(summary.totalDamageToMainPerCycle, 175);
  assert.equal(summary.zoneSummaries[1].totalDamagePerCycle, 100);
  assert.equal(summary.zoneSummaries[2].totalDamagePerCycle, 100);
  assert.equal(summary.zoneSummaries[0].totalDamagePerCycle, 175);
  assert.equal(
    summary.attackDetails[0].zoneApplications.filter((application) => application.directMainDamage > 0).length,
    1
  );
  assert.equal(
    summary.attackDetails[0].zoneApplications.reduce((sum, application) => sum + application.directMainDamage, 0),
    100
  );
});

test('real Trooper AoE still checks Main once even when the struck part takes no explosive part damage', () => {
  const enemy = getEnemyByName('Trooper');
  const leftArmIndex = enemy.zones.findIndex((zone) => zone.zone_name === 'left_arm');
  assert.notEqual(leftArmIndex, -1);

  const summary = summarizeEnemyTargetScenario({
    enemy,
    selectedAttacks: [makeExplosionAttackRow('Synthetic AP4 Explosive', 100, 4)],
    hitCounts: [1],
    rpm: 60,
    projectileZoneIndex: 0,
    explosiveZoneIndices: [leftArmIndex]
  });

  assert.equal(summary.totalDirectMainDamagePerCycle, 100);
  assert.equal(summary.totalPassthroughMainDamagePerCycle, 0);
  assert.equal(summary.totalDamageToMainPerCycle, 100);
  assert.equal(summary.zoneSummaries[leftArmIndex].totalDamagePerCycle, 0);
  assert.equal(summary.zoneSummaries[summary.mainZoneIndex].totalDamagePerCycle, 100);
  assert.equal(summary.zoneSummaries[summary.mainZoneIndex].killSummary.mainShotsToKill, 2);
});

test('mixed projectile and explosive cycles share one scenario summary', () => {
  const summary = summarizeEnemyTargetScenario({
    enemy: {
      health: 500,
      zones: [
        { zone_name: 'Main', health: 500, Con: 0, AV: 1, 'Dur%': 0, 'ToMain%': 0, ExTarget: 'Main', ExMult: 1, IsFatal: false },
        { zone_name: 'Head', health: 150, Con: 0, AV: 1, 'Dur%': 0, 'ToMain%': 1, ExTarget: 'Part', ExMult: 1, IsFatal: false },
        { zone_name: 'Leg', health: 300, Con: 0, AV: 1, 'Dur%': 0, 'ToMain%': 0.5, ExTarget: 'Part', ExMult: 1, IsFatal: false }
      ]
    },
    selectedAttacks: [
      {
        'Atk Name': 'Burst',
        'Atk Type': 'Projectile',
        DMG: 50,
        DUR: 0,
        AP: 2
      },
      {
        'Atk Name': 'Explosion',
        'Atk Type': 'Explosion',
        DMG: 100,
        DUR: 0,
        AP: 2
      }
    ],
    hitCounts: [1, 1],
    rpm: 60,
    projectileZoneIndex: 1,
    explosiveZoneIndices: [2]
  });

  assert.equal(summary.attackDetails.length, 2);
  assert.equal(summary.attackDetails[0].mode, 'projectile');
  assert.equal(summary.attackDetails[1].mode, 'explosion');
  assert.equal(summary.zoneSummaries[1].totalDamagePerCycle, 50);
  assert.equal(summary.zoneSummaries[2].totalDamagePerCycle, 100);
  assert.equal(summary.totalDamageToMainPerCycle, 200);
  assert.equal(summary.zoneSummaries[0].totalDamagePerCycle, 200);
});

test('summarizeEnemyTargetScenario still changes with lower projectile target selection', () => {
  const enemy = {
    health: 500,
    zones: [
      { zone_name: 'Main', health: 500, Con: 0, AV: 1, 'Dur%': 0, 'ToMain%': 0, ExTarget: 'Main', ExMult: 1, IsFatal: false },
      { zone_name: 'Head', health: 150, Con: 0, AV: 1, 'Dur%': 0, 'ToMain%': 1, ExTarget: 'Part', ExMult: 1, IsFatal: false },
      { zone_name: 'Leg', health: 300, Con: 0, AV: 1, 'Dur%': 0, 'ToMain%': 0.5, ExTarget: 'Part', ExMult: 1, IsFatal: false }
    ]
  };
  const selectedAttacks = [{
    'Atk Name': 'Burst',
    'Atk Type': 'Projectile',
    DMG: 100,
    DUR: 0,
    AP: 2
  }];

  const headSummary = summarizeEnemyTargetScenario({
    enemy,
    selectedAttacks,
    hitCounts: [1],
    rpm: 60,
    projectileZoneIndex: 1,
    explosiveZoneIndices: []
  });
  const legSummary = summarizeEnemyTargetScenario({
    enemy,
    selectedAttacks,
    hitCounts: [1],
    rpm: 60,
    projectileZoneIndex: 2,
    explosiveZoneIndices: []
  });

  assert.equal(headSummary.zoneSummaries[1].totalDamagePerCycle, 100);
  assert.equal(headSummary.zoneSummaries[2].totalDamagePerCycle, 0);
  assert.equal(legSummary.zoneSummaries[1].totalDamagePerCycle, 0);
  assert.equal(legSummary.zoneSummaries[2].totalDamagePerCycle, 100);
});

test('getZoneOutcomeKind marks parts that break before a main kill as limb-relevant', () => {
  const summary = summarizeZoneDamage({
    zone: {
      health: 300,
      Con: 0,
      AV: 1,
      'Dur%': 0,
      'ToMain%': 0.5,
      ExTarget: 'Part',
      ExMult: 1,
      IsFatal: false
    },
    enemyMainHealth: 200,
    selectedAttacks: [{
      'Atk Name': 'Burst',
      'Atk Type': 'Projectile',
      DMG: 100,
      DUR: 0,
      AP: 2
    }],
    rpm: 920
  });

  assert.equal(
    getZoneOutcomeKind({
      zone: { IsFatal: false },
      totalDamagePerCycle: summary.totalDamagePerCycle,
      totalDamageToMainPerCycle: summary.totalDamageToMainPerCycle,
      killSummary: summary.killSummary
    }),
    'limb'
  );
});

test('getZoneDisplayedTtkSeconds uses part-break time for limb-only paths', () => {
  const summary = summarizeZoneDamage({
    zone: {
      health: 100,
      Con: 0,
      AV: 1,
      'Dur%': 0,
      'ToMain%': 0.5,
      ExTarget: 'Part',
      ExMult: 1,
      IsFatal: false
    },
    enemyMainHealth: 200,
    selectedAttacks: [{
      'Atk Name': 'Burst',
      'Atk Type': 'Projectile',
      DMG: 100,
      DUR: 0,
      AP: 2
    }],
    rpm: 60
  });

  assert.equal(summary.killSummary.zoneTtkSeconds, 0);
  assert.equal(
    getZoneDisplayedTtkSeconds(
      getZoneOutcomeKind({
        zone: { IsFatal: false },
        totalDamagePerCycle: summary.totalDamagePerCycle,
        totalDamageToMainPerCycle: summary.totalDamageToMainPerCycle,
        killSummary: summary.killSummary
      }),
      summary.killSummary
    ),
    0
  );
});

test('getZoneOutcomeKind keeps main label when the part can kill main before it breaks', () => {
  const summary = summarizeZoneDamage({
    zone: {
      health: 300,
      Con: 0,
      AV: 1,
      'Dur%': 0,
      'ToMain%': 1,
      ExTarget: 'Part',
      ExMult: 1,
      IsFatal: false
    },
    enemyMainHealth: 200,
    selectedAttacks: [{
      'Atk Name': 'Burst',
      'Atk Type': 'Projectile',
      DMG: 100,
      DUR: 0,
      AP: 2
    }],
    rpm: 920
  });

  assert.equal(
    getZoneOutcomeKind({
      zone: { IsFatal: false },
      totalDamagePerCycle: summary.totalDamagePerCycle,
      totalDamageToMainPerCycle: summary.totalDamageToMainPerCycle,
      killSummary: summary.killSummary
    }),
    'main'
  );
  assert.equal(
    getZoneDisplayedTtkSeconds('main', summary.killSummary),
    summary.killSummary.mainTtkSeconds
  );
});

test('getZoneOutcomeKind marks damageable non-fatal zones without main transfer as non-lethal', () => {
  const summary = summarizeZoneDamage({
    zone: {
      health: 300,
      Con: 0,
      AV: 1,
      'Dur%': 0,
      'ToMain%': 0,
      ExTarget: 'Part',
      ExMult: 1,
      IsFatal: false
    },
    enemyMainHealth: 200,
    selectedAttacks: [{
      'Atk Name': 'Burst',
      'Atk Type': 'Projectile',
      DMG: 100,
      DUR: 0,
      AP: 2
    }],
    rpm: 920
  });

  assert.equal(
    getZoneOutcomeKind({
      zone: { IsFatal: false },
      totalDamagePerCycle: summary.totalDamagePerCycle,
      totalDamageToMainPerCycle: summary.totalDamageToMainPerCycle,
      killSummary: summary.killSummary
    }),
    'utility'
  );
  assert.equal(getZoneDisplayedTtkSeconds('utility', summary.killSummary), summary.killSummary.zoneTtkSeconds);
});

test('summarizeZoneDamage returns no part shots when selected attacks cannot penetrate the zone', () => {
  const summary = summarizeZoneDamage({
    zone: {
      health: 300,
      Con: 0,
      AV: 3,
      'Dur%': 0,
      'ToMain%': 0,
      ExTarget: 'Part',
      ExMult: 1,
      IsFatal: false
    },
    enemyMainHealth: 200,
    selectedAttacks: [{
      'Atk Name': 'Burst',
      'Atk Type': 'Projectile',
      DMG: 100,
      DUR: 0,
      AP: 1
    }],
    rpm: 920
  });

  assert.equal(summary.totalDamagePerCycle, 0);
  assert.equal(summary.killSummary.zoneShotsToKill, null);
  assert.equal(summary.killSummary.zoneTtkSeconds, null);
  assert.equal(
    getZoneOutcomeKind({
      zone: { IsFatal: false },
      totalDamagePerCycle: summary.totalDamagePerCycle,
      totalDamageToMainPerCycle: summary.totalDamageToMainPerCycle,
      killSummary: summary.killSummary
    }),
    null
  );
});

test('fatal zones with zero damage still behave as impossible, not instant kills', () => {
  const summary = summarizeZoneDamage({
    zone: {
      health: 425,
      Con: 0,
      AV: 3,
      'Dur%': 0.3,
      'ToMain%': 1,
      ExTarget: 'Main',
      ExMult: 1,
      IsFatal: true
    },
    enemyMainHealth: 750,
    selectedAttacks: [{
      'Atk Name': '5.5x50mm FULL METAL JACKET_P',
      'Atk Type': 'projectile',
      DMG: 90,
      DUR: 22,
      AP: 2
    }],
    rpm: 920
  });

  const outcomeKind = getZoneOutcomeKind({
    zone: { IsFatal: true },
    totalDamagePerCycle: summary.totalDamagePerCycle,
    totalDamageToMainPerCycle: summary.totalDamageToMainPerCycle,
    killSummary: summary.killSummary
  });

  assert.equal(summary.totalDamagePerCycle, 0);
  assert.equal(summary.killSummary.zoneShotsToKill, null);
  assert.equal(summary.killSummary.zoneTtkSeconds, null);
  assert.equal(outcomeKind, null);
  assert.equal(getZoneDisplayedTtkSeconds(outcomeKind, summary.killSummary), null);
});

test('zone outcome labels expose fixed badge text and row ttk semantics', () => {
  assert.equal(getZoneOutcomeLabel('fatal'), 'Kill');
  assert.equal(getZoneOutcomeLabel('doomed'), 'Doomed');
  assert.equal(getZoneOutcomeLabel('main'), 'Main');
  assert.equal(getZoneOutcomeLabel('critical'), 'Critical');
  assert.equal(getZoneOutcomeLabel('limb'), 'Limb');
  assert.equal(getZoneOutcomeLabel('utility'), 'Part');

  assert.equal(getZoneOutcomeDescription('fatal'), 'Killing this part kills the enemy');
  assert.equal(getZoneOutcomeDescription('doomed'), 'Destroying this fatal part dooms the enemy by forcing Main Constitution and bleedout.');
  assert.equal(getZoneOutcomeDescription('main'), 'This path kills through main health');
  assert.equal(getZoneOutcomeDescription('critical'), 'Destroying this critical part removes an important threat or utility before the body kill.');
  assert.equal(getZoneOutcomeDescription('limb'), 'This part can be removed before main would die');
  assert.equal(getZoneOutcomeDescription('utility'), 'This part can be removed, but destroying it does not kill the enemy');

  assert.equal(getZoneDisplayedTtkSeconds('fatal', { zoneShotsToKill: 1, zoneTtkSeconds: 0, mainTtkSeconds: 2 }), 0);
  assert.equal(getZoneDisplayedTtkSeconds('doomed', { zoneShotsToKill: 1, zoneTtkSeconds: 0, mainTtkSeconds: 2 }), 0);
  assert.equal(getZoneDisplayedTtkSeconds('main', { zoneTtkSeconds: 2, mainTtkSeconds: 1 }), 1);
  assert.equal(getZoneDisplayedTtkSeconds('critical', { zoneTtkSeconds: 0.5, mainTtkSeconds: 1 }), 0.5);
  assert.equal(getZoneDisplayedTtkSeconds('limb', { zoneTtkSeconds: 0, mainTtkSeconds: 1 }), 0);
  assert.equal(getZoneDisplayedTtkSeconds('utility', { zoneTtkSeconds: 0, mainTtkSeconds: null }), 0);
});

test('fatal routes with any-death Main Constitution surface as doomed breakpoints', () => {
  const enemy = getEnemyByName('Voteless');
  const zone = enemy.zones.find((entry) => entry.zone_name === 'Legs_left');
  assert.ok(zone);

  const summary = summarizeZoneDamage({
    zone,
    enemyMainHealth: enemy.health,
    selectedAttacks: [{
      'Atk Name': 'Leg Break',
      'Atk Type': 'projectile',
      DMG: 80,
      DUR: 0,
      AP: 1
    }],
    hitCounts: [1],
    rpm: 60
  });
  const outcomeKind = getZoneOutcomeKind({
    enemy,
    zone,
    totalDamagePerCycle: summary.totalDamagePerCycle,
    totalDamageToMainPerCycle: summary.totalDamageToMainPerCycle,
    killSummary: summary.killSummary
  });

  assert.equal(summary.killSummary.zoneShotsToKill, 1);
  assert.equal(summary.killSummary.mainShotsToKill, 7);
  assert.equal(outcomeKind, 'doomed');
  assert.equal(getZoneDisplayedKillPath(outcomeKind, summary.killSummary), 'zone');
  assert.equal(getZoneDisplayedShotsToKill(outcomeKind, summary.killSummary), 1);
  assert.equal(getZoneDisplayedTtkSeconds(outcomeKind, summary.killSummary), 0);
});

test('critical zone rules identify Heavy Devastator right arm as a tactical disable target', () => {
  const enemy = getEnemyByName('Heavy Devastator');
  const zone = enemy.zones.find((entry) => entry.zone_name === 'right_arm');
  assert.ok(zone);

  const criticalInfo = getCriticalZoneInfo(enemy, zone);
  assert.equal(criticalInfo?.label, 'Gun arm');

  const summary = summarizeZoneDamage({
    zone,
    enemyMainHealth: enemy.health,
    selectedAttacks: [getWeaponProjectileAttackByName('Liberator Carbine')],
    hitCounts: [1],
    rpm: getWeaponRpmByName('Liberator Carbine')
  });
  const outcomeKind = getZoneOutcomeKind({
    enemy,
    zone,
    totalDamagePerCycle: summary.totalDamagePerCycle,
    totalDamageToMainPerCycle: summary.totalDamageToMainPerCycle,
    killSummary: summary.killSummary
  });

  assert.equal(outcomeKind, 'critical');
  assert.equal(getZoneDisplayedKillPath(outcomeKind, summary.killSummary), 'zone');
});

test('fatal zones fall back to main kill metrics when part health is placeholder-only', () => {
  const killSummary = {
    zoneShotsToKill: null,
    zoneTtkSeconds: null,
    zoneEffectiveShotsToKill: null,
    zoneEffectiveTtkSeconds: null,
    mainShotsToKill: 5,
    mainTtkSeconds: 4
  };

  assert.equal(getZoneDisplayedKillPath('fatal', killSummary), 'main');
  assert.equal(getZoneDisplayedShotsToKill('fatal', killSummary), 5);
  assert.equal(getZoneDisplayedTtkSeconds('fatal', killSummary), 4);
});

test('zero-bleed Constitution fatal zones use combined health for displayed shots and ttk', () => {
  const zone = {
    zone_name: 'panel',
    health: 1200,
    Con: 1200,
    ConRate: 0,
    AV: 1,
    'Dur%': 0,
    'ToMain%': 0,
    ExTarget: 'Part',
    IsFatal: true
  };
  const summary = summarizeZoneDamage({
    zone,
    enemyMainHealth: 500,
    selectedAttacks: [{
      'Atk Name': 'Burst',
      'Atk Type': 'projectile',
      DMG: 600,
      DUR: 0,
      AP: 2
    }],
    hitCounts: [1],
    rpm: 60
  });
  const outcomeKind = getZoneOutcomeKind({
    zone,
    totalDamagePerCycle: summary.totalDamagePerCycle,
    totalDamageToMainPerCycle: summary.totalDamageToMainPerCycle,
    killSummary: summary.killSummary
  });

  assert.equal(summary.killSummary.zoneShotsToKill, 2);
  assert.equal(summary.killSummary.zoneShotsToKillWithCon, 4);
  assert.equal(summary.killSummary.zoneEffectiveShotsToKill, 4);
  assert.equal(outcomeKind, 'fatal');
  assert.equal(getZoneDisplayedShotsToKill(outcomeKind, summary.killSummary), 4);
  assert.equal(getZoneDisplayedTtkSeconds(outcomeKind, summary.killSummary), 3);
});

test('main-health passthrough zones use main kill metrics without a separate zone health pool', () => {
  const weapon = getWeaponProjectileAttackByName('Liberator Carbine');
  const rpm = getWeaponRpmByName('Liberator Carbine');
  const zone = {
    zone_name: 'head',
    health: 'Main',
    AV: 0,
    'Dur%': 0,
    ExTarget: 'Main',
    MainCap: 0,
    'ToMain%': 1
  };
  const summary = summarizeZoneDamage({
    zone,
    enemyMainHealth: 125,
    selectedAttacks: [weapon],
    hitCounts: [1],
    rpm
  });
  const mainSummary = summarizeZoneDamage({
    zone: {
      zone_name: 'Main',
      health: 125,
      AV: 0,
      'Dur%': 0,
      ExTarget: 'Main',
      MainCap: 1,
      'ToMain%': 1
    },
    enemyMainHealth: 125,
    selectedAttacks: [weapon],
    hitCounts: [1],
    rpm
  });
  const outcomeKind = getZoneOutcomeKind({
    zone,
    totalDamagePerCycle: summary.totalDamagePerCycle,
    totalDamageToMainPerCycle: summary.totalDamageToMainPerCycle,
    killSummary: summary.killSummary
  });

  assert.equal(summary.zoneHealth, -1);
  assert.equal(summary.killSummary.zoneShotsToKill, null);
  assert.equal(summary.killSummary.mainShotsToKill, mainSummary.killSummary.mainShotsToKill);
  assert.equal(outcomeKind, 'main');
  assert.equal(getZoneDisplayedKillPath(outcomeKind, summary.killSummary), 'main');
  assert.equal(
    getZoneDisplayedShotsToKill(outcomeKind, summary.killSummary),
    mainSummary.killSummary.mainShotsToKill
  );
});

test('real Charger torso_inside uses main kill metrics for finisher weapons', () => {
  const charger = getEnemyByName('Charger');
  const zone = charger.zones.find((entry) => entry.zone_name === 'torso_inside');
  assert.ok(zone);

  for (const { weaponName, expectedShots } of [
    { weaponName: 'Liberator Carbine', expectedShots: 12 },
    { weaponName: 'Tenderizer', expectedShots: 10 }
  ]) {
    const rpm = getWeaponRpmByName(weaponName);
    const summary = summarizeZoneDamage({
      zone,
      enemyMainHealth: charger.health,
      selectedAttacks: [getWeaponProjectileAttackByName(weaponName)],
      hitCounts: [1],
      rpm
    });
    const outcomeKind = getZoneOutcomeKind({
      zone,
      totalDamagePerCycle: summary.totalDamagePerCycle,
      totalDamageToMainPerCycle: summary.totalDamageToMainPerCycle,
      killSummary: summary.killSummary
    });

    assert.equal(summary.zoneHealth, -1);
    assert.equal(summary.killSummary.zoneShotsToKill, null);
    assert.equal(summary.killSummary.mainShotsToKill, expectedShots);
    assert.equal(outcomeKind, 'fatal');
    assert.equal(getZoneDisplayedKillPath(outcomeKind, summary.killSummary), 'main');
    assert.equal(getZoneDisplayedShotsToKill(outcomeKind, summary.killSummary), expectedShots);
    assert.equal(
      getZoneDisplayedTtkSeconds(outcomeKind, summary.killSummary),
      calculateTtkSeconds(expectedShots, rpm)
    );
  }
});

test('AP4 explosive against real Hulk Bruiser Main yields finite main shots and ttk', () => {
  const enemy = getEnemyByName('Hulk Bruiser');
  const summary = summarizeEnemyTargetScenario({
    enemy,
    selectedAttacks: [makeExplosionAttackRow('Synthetic AP4 Explosive', 100, 4)],
    hitCounts: [1],
    rpm: 60,
    projectileZoneIndex: 0,
    explosiveZoneIndices: [0]
  });

  const mainSummary = summary.zoneSummaries[summary.mainZoneIndex];
  assert.equal(mainSummary.totalDamagePerCycle, 26);
  assert.equal(mainSummary.killSummary.mainShotsToKill, 70);
  assert.equal(mainSummary.killSummary.mainTtkSeconds, 69);
});

test('routed Hulk Bruiser arm explosive damage hits Main directly without damaging the arm', () => {
  const enemy = getEnemyByName('Hulk Bruiser');
  const leftArmIndex = enemy.zones.findIndex((zone) => zone.zone_name === 'left_arm');
  assert.notEqual(leftArmIndex, -1);

  const summary = summarizeEnemyTargetScenario({
    enemy,
    selectedAttacks: [makeExplosionAttackRow('Synthetic AP4 Explosive', 100, 4)],
    hitCounts: [1],
    rpm: 60,
    projectileZoneIndex: 0,
    explosiveZoneIndices: [leftArmIndex]
  });

  assert.equal(summary.totalDirectMainDamagePerCycle, 26);
  assert.equal(summary.totalPassthroughMainDamagePerCycle, 0);
  assert.equal(summary.totalDamageToMainPerCycle, 26);
  assert.equal(summary.zoneSummaries[leftArmIndex].totalDamagePerCycle, 0);
  assert.equal(summary.zoneSummaries[summary.mainZoneIndex].totalDamagePerCycle, 26);
});

test('real Factory Strider front body uses zero-bleed Constitution display metadata', () => {
  const enemy = getEnemyByName('Factory Strider');
  const frontBody = enemy.zones.find((zone) => zone.zone_name === 'front_body');
  assert.ok(frontBody);

  assert.equal(frontBody.health, 1200);
  assert.equal(frontBody.Con, 1200);
  assert.equal(frontBody.ConRate, 0);
  assert.equal(frontBody.ConNoBleed, true);

  const healthInfo = getEnemyZoneHealthDisplayInfo(frontBody);
  const conInfo = getEnemyZoneConDisplayInfo(frontBody);
  assert.equal(healthInfo.text, '2400');
  assert.equal(healthInfo.sortValue, 2400);
  assert.equal(conInfo.text, '*');
  assert.equal(conInfo.sortValue, 1200);
});

test('real Berserker keeps the standard canonical stats instead of the Iron Fleet variant', () => {
  const enemy = getEnemyByName('Berserker');
  const head = enemy.zones.find((zone) => zone.zone_name === 'head');
  const chestLeft = enemy.zones.find((zone) => zone.zone_name === 'chest_left');
  const boss = enemy.zones.find((zone) => zone.zone_name === 'boss');
  const pelvis = enemy.zones.find((zone) => zone.zone_name === 'pelvis');
  const rightArm = enemy.zones.find((zone) => zone.zone_name === 'right_arm');

  assert.equal(enemy.health, 750);
  assert.ok(head);
  assert.equal(head.health, 110);
  assert.equal(head.AV, 1);

  assert.ok(chestLeft);
  assert.equal(chestLeft.health, 425);
  assert.equal(chestLeft.AV, 2);

  assert.ok(boss);
  assert.equal(boss.health, 350);
  assert.equal(boss.AV, 1);

  assert.ok(pelvis);
  assert.equal(pelvis.health, 600);
  assert.equal(pelvis['ToMain%'], 0.65);

  assert.ok(rightArm);
  assert.equal(rightArm.health, 260);
  assert.equal(rightArm.AV, 1);
  assert.equal(rightArm.ExTarget, 'Main');
  assert.equal(rightArm['ToMain%'], 0.5);
});

test('real Voteless arm keeps Constitution bleed rate and does not use zero-bleed display', () => {
  const enemy = getEnemyByName('Voteless');
  const rightArm = enemy.zones.find((zone) => zone.zone_name === 'arm_r');
  assert.ok(rightArm);

  assert.equal(rightArm.health, 80);
  assert.equal(rightArm.Con, 1000);
  assert.equal(rightArm.ConRate, 40);
  assert.ok(!rightArm.ConNoBleed);

  const healthInfo = getEnemyZoneHealthDisplayInfo(rightArm);
  const conInfo = getEnemyZoneConDisplayInfo(rightArm);
  assert.equal(healthInfo.text, '80');
  assert.equal(conInfo.text, '1000');
});

test('real Voteless Main keeps parsed body Constitution and bleed rate', () => {
  const enemy = getEnemyByName('Voteless');
  const main = enemy.zones.find((zone) => zone.zone_name === 'Main');
  assert.ok(main);

  assert.equal(main.health, 160);
  assert.equal(main.Con, 100);
  assert.equal(main.ConRate, 5);
  assert.ok(!main.ConNoBleed);
  assert.equal(main.ConAppliesAnyDeath, true);

  const conInfo = getEnemyZoneConDisplayInfo(main);
  assert.equal(conInfo.text, '100*');
  assert.equal(conInfo.title, MAIN_CON_ANY_DEATH_TOOLTIP);
});

test('confirmed unit-level Main Constitution cases show the any-death note', () => {
  for (const enemyName of [
    'Voteless',
    'Charger',
    'Charger Behemoth',
    'Rupture Charger',
    'Spore Charger',
    'Vox Engine'
  ]) {
    const enemy = getEnemyByName(enemyName);
    const main = enemy.zones.find((zone) => zone.zone_name === 'Main');
    assert.ok(main, `${enemyName} should have a Main zone`);
    assert.equal(main.ConAppliesAnyDeath, true, `${enemyName} Main should be flagged`);

    const conInfo = getEnemyZoneConDisplayInfo(main);
    assert.match(conInfo.text, /\*$/u, `${enemyName} Main Con should show a marker`);
    assert.equal(conInfo.title, MAIN_CON_ANY_DEATH_TOOLTIP, `${enemyName} Main tooltip should match`);
  }
});

test('real Factory Strider Gatling Gun keeps 100% ExDR and blocks direct explosive damage', () => {
  const enemy = getEnemyByName('Factory Strider Gatling Gun');
  const mainZone = enemy.zones[0];

  assert.equal(mainZone.AV, 3);
  assert.equal(mainZone.health, 300);
  assert.equal(mainZone.ExTarget, 'Main');
  assert.equal(mainZone.ExMult, 0);

  const summary = summarizeEnemyTargetScenario({
    enemy,
    selectedAttacks: [makeExplosionAttackRow('Synthetic AP4 Explosive', 100, 4)],
    hitCounts: [1],
    rpm: 60,
    projectileZoneIndex: 0,
    explosiveZoneIndices: [0]
  });

  const mainSummary = summary.zoneSummaries[summary.mainZoneIndex];
  assert.equal(summary.totalDirectMainDamagePerCycle, 0);
  assert.equal(summary.totalPassthroughMainDamagePerCycle, 0);
  assert.equal(summary.totalDamageToMainPerCycle, 0);
  assert.equal(mainSummary.totalDamagePerCycle, 0);
  assert.equal(mainSummary.killSummary.mainShotsToKill, null);
  assert.equal(mainSummary.killSummary.mainTtkSeconds, null);
});
