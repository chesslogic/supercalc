import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

globalThis.localStorage = {
  getItem() { return null; },
  setItem() {}
};

const { ingestMatrix, inferPatchVersion, loadFromText, state } = await import('../weapons/data.js');

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

function findWeaponRow(rows, { code, attackType, attackName }) {
  return rows.find((row) => (
    row.Code === code
    && row['Atk Type'] === attackType
    && row['Atk Name'] === attackName
  ));
}

test('ingestMatrix strips a UTF-8 BOM from the first header cell', () => {
  ingestMatrix([
    ['\uFEFFType', 'Name', 'RPM', 'Atk Type', 'DMG', 'DUR', 'AP'],
    ['Primary', 'Liberator', '920', 'projectile', '90', '22', '2']
  ]);

  assert.equal(state.keys.typeKey, 'Type');
  assert.equal(state.keys.nameKey, 'Name');
  assert.equal(state.keys.rpmKey, 'RPM');
});

test('ingestMatrix keeps grouped weapon code and rpm metadata', () => {
  ingestMatrix([
    ['Type', 'Sub', 'Code', 'Name', 'RPM', 'Atk Type', 'DMG', 'DUR', 'AP'],
    ['Primary', 'AR', 'AR-23A', 'Liberator Carbine', '920', 'projectile', '90', '22', '2']
  ]);

  assert.equal(state.groups.length, 1);
  assert.equal(state.groups[0].code, 'AR-23A');
  assert.equal(state.groups[0].rpm, 920);
});

test('inferPatchVersion extracts a version token from a local filename', () => {
  assert.equal(
    inferPatchVersion(null, './weapons/Helldivers 2 Weapon Data - 1.006.003.csv'),
    '1.006.003'
  );
  assert.equal(inferPatchVersion(null, './weapons/weapondata.csv'), null);
});

test('inferPatchVersion still supports content-disposition filenames', () => {
  assert.equal(
    inferPatchVersion(
      'attachment; filename=\"Helldivers 2 Weapon Data - 1.006.003.csv\"',
      './weapons/weapondata.csv'
    ),
    '1.006.003'
  );
});

test('checked-in GL-21 data reflects current zero-impact projectile and medium explosion AP', () => {
  const rows = loadCheckedInWeaponRows();
  const projectile = findWeaponRow(rows, {
    code: 'GL-21',
    attackType: 'projectile',
    attackName: '40mm HE GRENADE_P'
  });
  const explosion = findWeaponRow(rows, {
    code: 'GL-21',
    attackType: 'explosion',
    attackName: '40mm HE GRENADE_P_IE'
  });

  assert.ok(projectile);
  assert.ok(explosion);

  assert.equal(projectile.DMG, '0');
  assert.equal(projectile.DUR, '0');
  assert.equal(projectile.AP, '4');
  assert.equal(projectile.DF, '10');
  assert.equal(projectile.ST, '30');
  assert.equal(projectile.PF, '10');

  assert.equal(explosion.DMG, '400');
  assert.equal(explosion.DUR, '400');
  assert.equal(explosion.AP, '3');
  assert.equal(explosion.DF, '30');
  assert.equal(explosion.ST, '25');
  assert.equal(explosion.PF, '30');
});

test('checked-in CQC-20 explosion data reflects the 2200 damage buff', () => {
  const rows = loadCheckedInWeaponRows();
  const explosion = findWeaponRow(rows, {
    code: 'CQC-20',
    attackType: 'explosion',
    attackName: 'CQC-20_M_IE'
  });

  assert.ok(explosion);
  assert.equal(explosion.DMG, '2200');
  assert.equal(explosion.DUR, '2200');
  assert.equal(explosion.AP, '6');
});

test('checked-in VG-70 data exposes selectable auto, volley, and total attack rows', () => {
  const csv = readFileSync(new URL('../weapons/weapondata.csv', import.meta.url), 'utf8');
  loadFromText(csv);

  const variable = state.groups.find((group) => group.code === 'VG-70' && group.name === 'Variable');
  assert.ok(variable);
  assert.equal(variable.rpm, 550);
  assert.equal(variable.rows.length, 3);

  const auto = variable.rows.find((row) => row['Atk Name'] === 'VG-70_P (Auto)');
  const volley = variable.rows.find((row) => row['Atk Name'] === 'VG-70_P (Volley x7)');
  const total = variable.rows.find((row) => row['Atk Name'] === 'VG-70_P (Total x49)');

  assert.ok(auto);
  assert.ok(volley);
  assert.ok(total);

  assert.equal(auto.DMG, '85');
  assert.equal(auto.DUR, '23');
  assert.equal(auto.AP, '2');
  assert.equal(auto.DF, '10');
  assert.equal(auto.ST, '10');
  assert.equal(auto.PF, '4');

  assert.equal(volley.DMG, '595');
  assert.equal(volley.DUR, '161');
  assert.equal(volley.AP, '2');
  assert.equal(volley.DF, '10');
  assert.equal(volley.ST, '10');
  assert.equal(volley.PF, '4');

  assert.equal(total.DMG, '4165');
  assert.equal(total.DUR, '1127');
  assert.equal(total.AP, '2');
  assert.equal(total.DF, '10');
  assert.equal(total.ST, '10');
  assert.equal(total.PF, '4');
});
