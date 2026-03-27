import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  BALLISTIC_FALLOFF_EXCLUDED_WEAPONS,
  ingestBallisticFalloffCsvText,
  calculateBallisticDamageAtDistance,
  calculateBallisticDamageMultiplier,
  calculateBallisticDamageReduction,
  calculateBallisticDamageReductionPercent,
  calculateBallisticFalloffScale,
  calculateMaxDistanceForDamageFloor,
  calculateMaxDistanceForDamageMultiplier,
  isBallisticFalloffModeledWeapon,
  resetBallisticFalloffProfiles,
  resolveBallisticFalloffProfileForWeapon
} from '../weapons/falloff.js';

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

function loadObservedFalloffRows() {
  const csv = readFileSync(new URL('../weapons/falloff.csv', import.meta.url), 'utf8').trimEnd();
  const lines = csv.split(/\r?\n/u);
  const headers = parseCsvLine(lines[0]);

  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']));
  });
}

function loadObservedFalloffCsvText() {
  return readFileSync(new URL('../weapons/falloff.csv', import.meta.url), 'utf8');
}

function toPercentFraction(value) {
  const normalized = String(value || '').trim();
  if (!normalized) {
    return null;
  }

  return Number.parseFloat(normalized.replace(/%$/u, '')) / 100;
}

const DISTANCE_COLUMNS = [2, 5, 15, 25, 50, 75, 100, 150, 200];

function getObservedPoint(row, distanceMeters) {
  return toPercentFraction(row[`${distanceMeters}m`]);
}

test('ballistic falloff model excludes the known special-case launcher rows', () => {
  assert.equal(isBallisticFalloffModeledWeapon('GP-20 Ultimatum (read the note)'), false);
  assert.equal(isBallisticFalloffModeledWeapon('EAT-411 Leveller'), false);
  assert.equal(BALLISTIC_FALLOFF_EXCLUDED_WEAPONS.has('GP-20 Ultimatum (read the note)'), true);
  assert.equal(BALLISTIC_FALLOFF_EXCLUDED_WEAPONS.has('EAT-411 Leveller'), true);
  assert.equal(isBallisticFalloffModeledWeapon('AR-23 Liberator'), true);
});

test('calculateBallisticFalloffScale returns infinity for zero-drag weapons', () => {
  assert.equal(
    calculateBallisticFalloffScale({ caliber: 8, mass: 11, velocity: 820, drag: 0 }),
    Number.POSITIVE_INFINITY
  );
  assert.equal(
    calculateBallisticDamageReduction({ caliber: 8, mass: 11, velocity: 820, drag: 0 }, 100),
    0
  );
  assert.equal(
    calculateBallisticDamageMultiplier({ caliber: 8, mass: 11, velocity: 820, drag: 0 }, 100),
    1
  );
});

test('calculateBallisticDamageReductionPercent stays close to representative observed rows', () => {
  const liberator = { caliber: 5.5, mass: 4.5, velocity: 900, drag: 0.3 };
  const tenderizer = { caliber: 8, mass: 11, velocity: 820, drag: 0.3 };
  const scorcher = { caliber: 20, mass: 25, velocity: 550, drag: 1.5 };
  const breaker = { caliber: 8, mass: 4, velocity: 360, drag: 0.5 };
  const railgun = { caliber: 10, mass: 50, velocity: 2000, drag: 0.3 };

  assert.ok(Math.abs(calculateBallisticDamageReductionPercent(liberator, 100) - 13.34) < 1.0);
  assert.ok(Math.abs(calculateBallisticDamageReductionPercent(tenderizer, 150) - 16.67) < 1.0);
  assert.ok(Math.abs(calculateBallisticDamageReductionPercent(scorcher, 50) - 51.37) < 2.0);
  assert.ok(Math.abs(calculateBallisticDamageReductionPercent(breaker, 200) - 58.58) < 2.0);
  assert.ok(Math.abs(calculateBallisticDamageReductionPercent(railgun, 200) - 8.11) < 1.0);
});

test('calculateBallisticDamageAtDistance and inverse helpers round-trip practical thresholds', () => {
  const liberator = { caliber: 5.5, mass: 4.5, velocity: 900, drag: 0.3 };
  const multiplierAt100m = calculateBallisticDamageMultiplier(liberator, 100);
  assert.ok(multiplierAt100m !== null);

  const roundTripDistance = calculateMaxDistanceForDamageMultiplier(liberator, multiplierAt100m);
  assert.ok(roundTripDistance !== null);
  assert.ok(Math.abs(roundTripDistance - 100) < 0.01);

  const baseDamage = 90;
  const damageAt100m = calculateBallisticDamageAtDistance(baseDamage, liberator, 100);
  assert.ok(damageAt100m !== null);
  const floorDistance = calculateMaxDistanceForDamageFloor(baseDamage, liberator, damageAt100m);
  assert.ok(floorDistance !== null);
  assert.ok(Math.abs(floorDistance - 100) < 0.01);

  assert.equal(calculateMaxDistanceForDamageMultiplier(liberator, 0.25), Number.POSITIVE_INFINITY);
});

test('resolveBallisticFalloffProfileForWeapon matches common weapon selections and rejects ambiguous ones', () => {
  resetBallisticFalloffProfiles();
  ingestBallisticFalloffCsvText(loadObservedFalloffCsvText());

  const liberator = resolveBallisticFalloffProfileForWeapon({
    code: 'AR-23',
    name: 'Liberator'
  });
  assert.equal(liberator.status, 'available');
  assert.equal(liberator.profile?.weaponLabel, 'AR-23 Liberator');

  const oneTwo = resolveBallisticFalloffProfileForWeapon({
    code: 'AR/GL-21',
    name: 'One-Two (AR)'
  });
  assert.equal(oneTwo.status, 'available');
  assert.equal(oneTwo.profile?.weaponLabel, 'AR|GL-21 One-Two');

  const purifier = resolveBallisticFalloffProfileForWeapon({
    code: 'PLAS-101',
    name: 'Purifier'
  });
  assert.equal(purifier.status, 'ambiguous');
});

test('resolveBallisticFalloffProfileForWeapon keeps excluded launchers out of the general model', () => {
  resetBallisticFalloffProfiles();
  ingestBallisticFalloffCsvText(loadObservedFalloffCsvText());

  const ultimatum = resolveBallisticFalloffProfileForWeapon({
    code: 'GP-20',
    name: 'Ultimatum'
  });
  assert.equal(ultimatum.status, 'excluded');
});

test('ballistic falloff model tracks observed CSV rows for normal projectile families', () => {
  const rows = loadObservedFalloffRows();
  const errors = [];

  for (const row of rows) {
    if (!isBallisticFalloffModeledWeapon(row.Weapon)) {
      continue;
    }

    for (const distanceMeters of DISTANCE_COLUMNS) {
      if (row.Weapon === 'MG-43 Machine Gun' && distanceMeters === 2) {
        continue;
      }

      const observed = getObservedPoint(row, distanceMeters);
      if (observed === null) {
        continue;
      }

      const predicted = calculateBallisticDamageReduction(
        {
          caliber: row.Caliber,
          mass: row.Mass,
          velocity: row.Velocity,
          drag: row.Drag
        },
        distanceMeters
      );

      assert.ok(predicted !== null, `${row.Weapon} should produce a prediction at ${distanceMeters}m`);
      errors.push({
        weapon: row.Weapon,
        distanceMeters,
        observed,
        predicted,
        absoluteError: Math.abs(predicted - observed)
      });
    }
  }

  assert.ok(errors.length > 0);

  const meanAbsoluteError = errors.reduce((sum, point) => sum + point.absoluteError, 0) / errors.length;
  const maxAbsoluteError = errors.reduce((max, point) => Math.max(max, point.absoluteError), 0);

  assert.ok(
    meanAbsoluteError < 0.004,
    `Expected mean absolute error below 0.4 percentage points, got ${(meanAbsoluteError * 100).toFixed(3)}`
  );
  assert.ok(
    maxAbsoluteError < 0.021,
    `Expected max absolute error below 2.1 percentage points, got ${(maxAbsoluteError * 100).toFixed(3)}`
  );
});
