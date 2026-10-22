import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import './env-stubs.js';
import { loadFromText, state } from '../weapons/data.js';

loadFromText(readFileSync(new URL('../weapons/weapondata.csv', import.meta.url), 'utf8'));

test('Eagle Gas Airstrike keeps its impact and gas explosion separate from Orbital Gas Strike', () => {
  const eagle = state.groups.find((weapon) => weapon.name === 'EAGLE GAS AIRSTRIKE');
  const orbital = state.groups.find((weapon) => weapon.name === 'ORBITAL GAS STRIKE');

  assert.ok(eagle);
  assert.ok(orbital);
  assert.equal(eagle.type, 'Stratagem');
  assert.equal(eagle.sub, 'EGL');
  assert.equal(eagle.role, 'ordnance');
  assert.equal(eagle.rpm, null);
  assert.deepEqual(eagle.rows.map((row) => ({
    attackType: row['Atk Type'],
    attackName: row['Atk Name'],
    damage: row.DMG,
    durable: row.DUR,
    ap: row.AP,
    demolition: row.DF,
    stagger: row.ST,
    push: row.PF,
    status: row.Status
  })), [
    {
      attackType: 'projectile',
      attackName: 'S_P6',
      damage: '1500',
      durable: '1500',
      ap: '7',
      demolition: '40',
      stagger: '20',
      push: '15',
      status: ''
    },
    {
      attackType: 'explosion',
      attackName: 'S_P6_IE',
      damage: '0',
      durable: '0',
      ap: '6',
      demolition: '50',
      stagger: '10',
      push: '40',
      status: 'Gas • Gas_Confusion'
    }
  ]);
  assert.deepEqual(orbital.rows.map((row) => row.DF), ['50', '50']);
  assert.equal(orbital.rows[0].DMG, '300');
});
