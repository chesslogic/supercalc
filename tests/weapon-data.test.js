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

test('checked-in TM-1 data reflects the lure mine explosion and shrapnel rows', () => {
  const rows = loadCheckedInWeaponRows();
  const explosion = findWeaponRow(rows, {
    code: 'TM-1',
    attackType: 'explosion',
    attackName: 'TM-1 LURE MINE E'
  });
  const shrapnel = findWeaponRow(rows, {
    code: 'TM-1',
    attackType: 'projectile',
    attackName: 'SHRAPNEL_P x35'
  });

  assert.ok(explosion);
  assert.ok(shrapnel);

  assert.equal(explosion.DMG, '1000');
  assert.equal(explosion.DUR, '1000');
  assert.equal(explosion.AP, '5');
  assert.equal(explosion.DF, '30');
  assert.equal(explosion.ST, '30');
  assert.equal(explosion.PF, '40');

  assert.equal(shrapnel.DMG, '110');
  assert.equal(shrapnel.DUR, '35');
  assert.equal(shrapnel.AP, '3');
  assert.equal(shrapnel.DF, '10');
  assert.equal(shrapnel.ST, '10');
  assert.equal(shrapnel.PF, '20');
});

test('checked-in SG-97 data reflects the sweeper flechette row', () => {
  const rows = loadCheckedInWeaponRows();
  const projectile = findWeaponRow(rows, {
    code: 'SG-97',
    attackType: 'projectile',
    attackName: 'SG-97 P x12'
  });

  assert.ok(projectile);
  assert.equal(projectile.Name, 'Sweeper');
  assert.equal(projectile.RPM, '150');
  assert.equal(projectile.DMG, '42');
  assert.equal(projectile.DUR, '11');
  assert.equal(projectile.AP, '3');
  assert.equal(projectile.DF, '10');
  assert.equal(projectile.ST, '20');
  assert.equal(projectile.PF, '20');
});

test('checked-in SG-22 data groups Bushwhacker under SG', () => {
  const rows = loadCheckedInWeaponRows();
  const projectile = findWeaponRow(rows, {
    code: 'SG-22',
    attackType: 'projectile',
    attackName: 'BUCKSHOT_P1 x9'
  });

  assert.ok(projectile);
  assert.equal(projectile.Name, 'Bushwhacker');
  assert.equal(projectile.Sub, 'SG');
});

test('checked-in K-2 data reflects the current throwing knife row', () => {
  const rows = loadCheckedInWeaponRows();
  const projectile = findWeaponRow(rows, {
    code: 'K-2',
    attackType: 'projectile',
    attackName: 'K-2 THROWING KNIFE_dm'
  });

  assert.ok(projectile);
  assert.equal(projectile.Name, 'Throwing Knife');
  assert.equal(projectile.DMG, '300');
  assert.equal(projectile.DUR, '150');
  assert.equal(projectile.AP, '3');
  assert.equal(projectile.DF, '10');
  assert.equal(projectile.ST, '35');
  assert.equal(projectile.PF, '5');
});

test('checked-in MS-11 data exposes impact, blast, and shrapnel rows', () => {
  const rows = loadCheckedInWeaponRows();
  const impact = findWeaponRow(rows, {
    code: 'MS-11',
    attackType: 'explosion',
    attackName: 'SWP SOLO SILO EImpact'
  });
  const blast = findWeaponRow(rows, {
    code: 'MS-11',
    attackType: 'explosion',
    attackName: 'SWP SOLO SILO E'
  });
  const secondaryBlast = findWeaponRow(rows, {
    code: 'MS-11',
    attackType: 'explosion',
    attackName: '15x100mm HIGH EXPLOSIVE P IE'
  });
  const shrapnel = findWeaponRow(rows, {
    code: 'MS-11',
    attackType: 'projectile',
    attackName: 'SHRAPNEL_P x30'
  });

  assert.ok(impact);
  assert.ok(blast);
  assert.ok(secondaryBlast);
  assert.ok(shrapnel);

  assert.equal(impact.DMG, '1500');
  assert.equal(impact.AP, '9');
  assert.equal(blast.DMG, '2500');
  assert.equal(blast.AP, '7');
  assert.equal(secondaryBlast.DMG, '225');
  assert.equal(secondaryBlast.AP, '3');
  assert.equal(shrapnel.DMG, '110');
  assert.equal(shrapnel.DUR, '35');
  assert.equal(shrapnel.AP, '3');
});

test('checked-in weapon codes reflect current wiki designations for corrected rows', () => {
  const rows = loadCheckedInWeaponRows();

  assert.ok(findWeaponRow(rows, {
    code: 'LAS-13',
    attackType: 'beam',
    attackName: 'LAS-13 TRIDENT B x6'
  }));
  assert.ok(findWeaponRow(rows, {
    code: 'LAS-7',
    attackType: 'beam',
    attackName: 'LAS-7 DAGGER_B'
  }));
  assert.ok(findWeaponRow(rows, {
    code: 'FLAM-66',
    attackType: 'spray',
    attackName: 'FLAM-66 TORCHER_S'
  }));
  assert.ok(findWeaponRow(rows, {
    code: 'G-23',
    attackType: 'explosion',
    attackName: 'G-23 STUN_E'
  }));
});

test('checked-in VG-70 data exposes selectable auto, volley, and total attack rows', () => {
  const csv = readFileSync(new URL('../weapons/weapondata.csv', import.meta.url), 'utf8');
  loadFromText(csv);

  const variable = state.groups.find((group) => group.code === 'VG-70' && group.name === 'Variable');
  assert.ok(variable);
  assert.equal(variable.rpm, 750);
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

test('checked-in selectable RPM weapons use their highest RPM setting', () => {
  const rows = loadCheckedInWeaponRows();

  assert.equal(
    rows.find((row) => row.Code === 'AR-61' && row.Name === 'Tenderizer')?.RPM,
    '850'
  );
  assert.equal(
    rows.find((row) => row.Code === 'VG-70' && row.Name === 'Variable')?.RPM,
    '750'
  );
  assert.equal(
    rows.find((row) => row.Code === 'MG-43' && row.Name === 'Machine Gun')?.RPM,
    '900'
  );
  assert.equal(
    rows.find((row) => row.Code === 'M-105' && row.Name === 'Stalwart')?.RPM,
    '1150'
  );
  assert.equal(
    rows.find((row) => row.Code === 'MG-206' && row.Name === 'Heavy Machine Gun')?.RPM,
    '750'
  );
});
