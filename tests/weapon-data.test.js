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

test('ingestMatrix keeps grouped weapon code, role, and rpm metadata', () => {
  ingestMatrix([
    ['Type', 'Sub', 'Role', 'Code', 'Name', 'RPM', 'Atk Type', 'DMG', 'DUR', 'AP'],
    ['Primary', 'AR', 'automatic', 'AR-23A', 'Liberator Carbine', '920', 'projectile', '90', '22', '2']
  ]);

  assert.equal(state.groups.length, 1);
  assert.equal(state.keys.roleKey, 'Role');
  assert.equal(state.groups[0].role, 'automatic');
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

test('checked-in role values cover the current automatic and explosive outliers', () => {
  const rows = loadCheckedInWeaponRows();
  const sickle = findWeaponRow(rows, {
    code: 'LAS-16',
    attackType: 'projectile',
    attackName: 'LASER_P'
  });
  const machineGunSentry = findWeaponRow(rows, {
    code: 'A/MG-43',
    attackType: 'projectile',
    attackName: '8x60mm FULL METAL JACKET_P1'
  });
  const punisherPlasma = findWeaponRow(rows, {
    code: 'SG-8P',
    attackType: 'projectile',
    attackName: 'LARGE PLASMA BOLT_P3'
  });

  assert.ok(sickle);
  assert.ok(machineGunSentry);
  assert.ok(punisherPlasma);
  assert.equal(sickle.Role, 'automatic');
  assert.equal(machineGunSentry.Role, 'automatic');
  assert.equal(punisherPlasma.Role, 'explosive');
});

test('checked-in weapon data now carries an explicit Role for every row', () => {
  const rows = loadCheckedInWeaponRows();
  const blankRoleRows = rows.filter((row) => !String(row.Role || '').trim());

  assert.equal(blankRoleRows.length, 0);
});

test('checked-in role values classify the remaining mixed blank-role subtypes explicitly', () => {
  const rows = loadCheckedInWeaponRows();
  const pineapple = findWeaponRow(rows, {
    code: 'G-7',
    attackType: 'explosion',
    attackName: 'G-7 PINEAPPLE_E'
  });
  const blitzer = findWeaponRow(rows, {
    code: 'ARC-12',
    attackType: 'arc',
    attackName: 'ARC-12 BLITZER_A'
  });
  const scorcher = findWeaponRow(rows, {
    code: 'PLAS-1',
    attackType: 'explosion',
    attackName: 'MEDIUM PLASMA BOLT_P_IE'
  });
  const scythe = findWeaponRow(rows, {
    code: 'LAS-5',
    attackType: 'beam',
    attackName: 'LAS-5 SCYTHE_B'
  });
  const senator = findWeaponRow(rows, {
    code: 'P-4',
    attackType: 'projectile',
    attackName: '13x40mm FULL METAL JACKET_P'
  });

  assert.ok(pineapple);
  assert.ok(blitzer);
  assert.ok(scorcher);
  assert.ok(scythe);
  assert.ok(senator);
  assert.equal(pineapple.Role, 'explosive');
  assert.equal(blitzer.Role, 'shotgun');
  assert.equal(scorcher.Role, 'automatic');
  assert.equal(scythe.Role, 'energy');
  assert.equal(senator.Role, 'precision');
});

test('checked-in SG-8P data groups Punisher Plasma under EXP', () => {
  const rows = loadCheckedInWeaponRows();
  const projectile = findWeaponRow(rows, {
    code: 'SG-8P',
    attackType: 'projectile',
    attackName: 'LARGE PLASMA BOLT_P3'
  });
  const explosion = findWeaponRow(rows, {
    code: 'SG-8P',
    attackType: 'explosion',
    attackName: 'LARGE PLASMA BOLT_P3_IE'
  });

  assert.ok(projectile);
  assert.ok(explosion);
  assert.equal(projectile.Name, 'Punisher Plasma');
  assert.equal(projectile.Sub, 'EXP');
  assert.equal(explosion.Sub, 'EXP');
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

test('checked-in stratagem wiki pass backfills adopted codes, statuses, stats, and RPMs', () => {
  const rows = loadCheckedInWeaponRows();
  const dogBreath = rows.find((row) => (
    row.Code === 'AX/TX-13'
    && row['Atk Type'] === 'spray'
    && row['Atk Name'] === 'AX/TX-13 "GUARD DOG" DOG BREATH_S'
  ));
  const eagleClusterBomblet = rows.find((row) => (
    row.Code === '-'
    && row.Name === 'EAGLE CLUSTER BOMB'
    && row['Atk Type'] === 'projectile'
    && row['Atk Name'] === 'CLUSTER BOMB_P4 x8'
  ));
  const orbitalEms = rows.find((row) => (
    row.Code === '-'
    && row.Name === 'ORBITAL EMS STRIKE'
    && row['Atk Type'] === 'explosion'
    && row['Atk Name'] === '110mm E.M.S. CANNON ROUND_P_IE'
  ));

  assert.ok(findWeaponRow(rows, {
    code: 'MD-6',
    attackType: 'explosion',
    attackName: 'ANTI-PERSONNEL MINEFIELD_E'
  }));
  assert.ok(findWeaponRow(rows, {
    code: 'MD-17',
    attackType: 'explosion',
    attackName: 'ANTI-TANK MINES_E'
  }));
  assert.ok(findWeaponRow(rows, {
    code: 'MD-8',
    attackType: 'explosion',
    attackName: 'GAS MINES_E'
  }));
  assert.ok(findWeaponRow(rows, {
    code: 'MD-I4',
    attackType: 'explosion',
    attackName: 'INCENDIARY MINES_E'
  }));

  assert.ok(dogBreath);
  assert.equal(dogBreath.Status, 'Gas_Var2 • Gas_Confusion_Var2');

  assert.ok(eagleClusterBomblet);
  assert.equal(eagleClusterBomblet.ST, '30');

  assert.ok(orbitalEms);
  assert.equal(orbitalEms.AP, '6');

  assert.equal(findWeaponRow(rows, {
    code: 'EXO-49',
    attackType: 'projectile',
    attackName: '30mm APHE CANNON P'
  })?.RPM, '175');
  assert.equal(findWeaponRow(rows, {
    code: 'EXO-49',
    attackType: 'explosion',
    attackName: '30mm APHE CANNON P IE '
  })?.RPM, '175');
  assert.equal(findWeaponRow(rows, {
    code: 'EXO-45',
    attackType: 'projectile',
    attackName: '8x60mm FULL METAL JACKET_P1'
  })?.RPM, '1200');
  assert.equal(findWeaponRow(rows, {
    code: 'EXO-45',
    attackType: 'explosion',
    attackName: 'Missile Exosuit '
  })?.RPM, '90');
  assert.equal(findWeaponRow(rows, {
    code: 'EXO-45',
    attackType: 'projectile',
    attackName: 'Missile Exosuit '
  })?.RPM, '90');
});

test('checked-in stratagem wiki pass includes adopted sentry and deployable rows', () => {
  const rows = loadCheckedInWeaponRows();
  const expectedRows = [
    {
      code: '-',
      attackType: 'projectile',
      attackName: '23mm HE CANNON_P',
      fields: {
        Type: 'Stratagem',
        Sub: 'EGL',
        Role: 'ordnance',
        Name: 'EAGLE STRAFING RUN',
        RPM: '',
        DMG: '350',
        DUR: '200',
        AP: '5',
        DF: '30',
        ST: '35',
        PF: '3',
        Status: ''
      }
    },
    {
      code: '-',
      attackType: 'explosion',
      attackName: '23mm HE CANNON_P_IE',
      fields: {
        Type: 'Stratagem',
        Sub: 'EGL',
        Role: 'ordnance',
        Name: 'EAGLE STRAFING RUN',
        RPM: '',
        DMG: '350',
        DUR: '350',
        AP: '3',
        DF: '30',
        ST: '35',
        PF: '5',
        Status: ''
      }
    },
    {
      code: 'A/AC-8',
      attackType: 'projectile',
      attackName: '40mm APHE CANNON_P',
      fields: {
        Type: 'Stratagem',
        Sub: 'EMP',
        Role: 'explosive',
        Name: 'AUTOCANNON SENTRY',
        RPM: '160',
        DMG: '450',
        DUR: '450',
        AP: '5',
        DF: '30',
        ST: '40',
        PF: '10',
        Status: ''
      }
    },
    {
      code: 'A/AC-8',
      attackType: 'explosion',
      attackName: '40mm APHE CANNON_P_IE',
      fields: {
        Type: 'Stratagem',
        Sub: 'EMP',
        Role: 'explosive',
        Name: 'AUTOCANNON SENTRY',
        RPM: '160',
        DMG: '150',
        DUR: '150',
        AP: '3',
        DF: '30',
        ST: '30',
        PF: '30',
        Status: ''
      }
    },
    {
      code: 'A/M-23',
      attackType: 'projectile',
      attackName: 'EMS MORTAR SHELL_P',
      fields: {
        Type: 'Stratagem',
        Sub: 'EMP',
        Role: 'explosive',
        Name: 'EMS MORTAR SENTRY',
        RPM: '60',
        DMG: '0',
        DUR: '0',
        AP: '4',
        DF: '10',
        ST: '30',
        PF: '10',
        Status: ''
      }
    },
    {
      code: 'A/M-23',
      attackType: 'explosion',
      attackName: 'EMS MORTAR SHELL_P_E',
      fields: {
        Type: 'Stratagem',
        Sub: 'EMP',
        Role: 'explosive',
        Name: 'EMS MORTAR SENTRY',
        RPM: '60',
        DMG: '0',
        DUR: '0',
        AP: '6',
        DF: '30',
        ST: '50',
        PF: '0',
        Status: 'Stun Medium'
      }
    },
    {
      code: 'A/M-23',
      attackType: 'explosion',
      attackName: 'EMS MORTAR SHELL_P_IE',
      fields: {
        Type: 'Stratagem',
        Sub: 'EMP',
        Role: 'explosive',
        Name: 'EMS MORTAR SENTRY',
        RPM: '60',
        DMG: '150',
        DUR: '150',
        AP: '3',
        DF: '30',
        ST: '30',
        PF: '20',
        Status: ''
      }
    },
    {
      code: 'A/FLAM-40',
      attackType: 'spray',
      attackName: 'SWP_FLAME SENTRY_S',
      fields: {
        Type: 'Stratagem',
        Sub: 'EMP',
        Role: 'energy',
        Name: 'FLAME SENTRY',
        RPM: '',
        DMG: '3',
        DUR: '3',
        AP: '4',
        DF: '10',
        ST: '5',
        PF: '5',
        Status: 'Fire'
      }
    },
    {
      code: 'A/GM-17',
      attackType: 'projectile',
      attackName: 'GAS MORTAR SHELL_P',
      fields: {
        Type: 'Stratagem',
        Sub: 'EMP',
        Role: 'explosive',
        Name: 'GAS MORTAR SENTRY',
        RPM: '80',
        DMG: '20',
        DUR: '2',
        AP: '0',
        DF: '10',
        ST: '30',
        PF: '10',
        Status: ''
      }
    },
    {
      code: 'A/GM-17',
      attackType: 'explosion',
      attackName: 'GAS MORTAR SHELL_P_IE',
      fields: {
        Type: 'Stratagem',
        Sub: 'EMP',
        Role: 'explosive',
        Name: 'GAS MORTAR SENTRY',
        RPM: '80',
        DMG: '0',
        DUR: '0',
        AP: '6',
        DF: '30',
        ST: '10',
        PF: '20',
        Status: 'Gas • Gas_Confusion'
      }
    },
    {
      code: 'E/GL-21',
      attackType: 'projectile',
      attackName: '40mm HE GRENADE_P',
      fields: {
        Type: 'Stratagem',
        Sub: 'EMP',
        Role: 'explosive',
        Name: 'GRENADIER BATTLEMENT',
        RPM: '160',
        DMG: '0',
        DUR: '0',
        AP: '4',
        DF: '10',
        ST: '30',
        PF: '10',
        Status: ''
      }
    },
    {
      code: 'E/GL-21',
      attackType: 'explosion',
      attackName: '40mm HE GRENADE_P_IE',
      fields: {
        Type: 'Stratagem',
        Sub: 'EMP',
        Role: 'explosive',
        Name: 'GRENADIER BATTLEMENT',
        RPM: '160',
        DMG: '400',
        DUR: '400',
        AP: '3',
        DF: '30',
        ST: '25',
        PF: '30',
        Status: ''
      }
    },
    {
      code: 'A/LAS-98',
      attackType: 'beam',
      attackName: 'SWP_LASER SENTRY_B',
      fields: {
        Type: 'Stratagem',
        Sub: 'EMP',
        Role: 'energy',
        Name: 'LASER SENTRY',
        RPM: '',
        DMG: '350',
        DUR: '200',
        AP: '4',
        DF: '20',
        ST: '0',
        PF: '0',
        Status: 'Fire'
      }
    },
    {
      code: 'A/M-12',
      attackType: 'projectile',
      attackName: '40mm HE MORTAR_P',
      fields: {
        Type: 'Stratagem',
        Sub: 'EMP',
        Role: 'explosive',
        Name: 'MORTAR SENTRY',
        RPM: '60',
        DMG: '0',
        DUR: '0',
        AP: '4',
        DF: '10',
        ST: '30',
        PF: '10',
        Status: ''
      }
    },
    {
      code: 'A/M-12',
      attackType: 'explosion',
      attackName: '40mm HE MORTAR_P_IE',
      fields: {
        Type: 'Stratagem',
        Sub: 'EMP',
        Role: 'explosive',
        Name: 'MORTAR SENTRY',
        RPM: '60',
        DMG: '400',
        DUR: '400',
        AP: '3',
        DF: '30',
        ST: '35',
        PF: '40',
        Status: ''
      }
    },
    {
      code: 'A/M-12',
      attackType: 'projectile',
      attackName: 'SHRAPNEL_P',
      fields: {
        Type: 'Stratagem',
        Sub: 'EMP',
        Role: 'explosive',
        Name: 'MORTAR SENTRY',
        RPM: '60',
        DMG: '110',
        DUR: '35',
        AP: '3',
        DF: '10',
        ST: '10',
        PF: '20',
        Status: ''
      }
    },
    {
      code: 'A/MLS-4X',
      attackType: 'projectile',
      attackName: '70mm STANDARD ROCKET_P',
      fields: {
        Type: 'Stratagem',
        Sub: 'EMP',
        Role: 'explosive',
        Name: 'ROCKET SENTRY',
        RPM: '90',
        DMG: '525',
        DUR: '525',
        AP: '5',
        DF: '30',
        ST: '35',
        PF: '10',
        Status: ''
      }
    },
    {
      code: 'A/MLS-4X',
      attackType: 'explosion',
      attackName: '70mm STANDARD ROCKET_P_IE',
      fields: {
        Type: 'Stratagem',
        Sub: 'EMP',
        Role: 'explosive',
        Name: 'ROCKET SENTRY',
        RPM: '90',
        DMG: '150',
        DUR: '150',
        AP: '3',
        DF: '30',
        ST: '30',
        PF: '10',
        Status: ''
      }
    },
    {
      code: 'TD-220',
      attackType: 'projectile',
      attackName: '120mm HE CANNON ROUND_P',
      fields: {
        Type: 'Stratagem',
        Sub: 'EMP',
        Role: 'explosive',
        Name: 'BASTION MK XVI',
        RPM: '12',
        DMG: '3500',
        DUR: '3500',
        AP: '8',
        DF: '40',
        ST: '50',
        PF: '20',
        Status: ''
      }
    },
    {
      code: 'TD-220',
      attackType: 'explosion',
      attackName: '120mm HE CANNON ROUND_P_IE',
      fields: {
        Type: 'Stratagem',
        Sub: 'EMP',
        Role: 'explosive',
        Name: 'BASTION MK XVI',
        RPM: '12',
        DMG: '750',
        DUR: '750',
        AP: '5',
        DF: '40',
        ST: '70',
        PF: '40',
        Status: ''
      }
    },
    {
      code: 'TD-220',
      attackType: 'projectile',
      attackName: '12.5mm BCHP RIFLE ROUNDS_P',
      fields: {
        Type: 'Stratagem',
        Sub: 'EMP',
        Role: 'automatic',
        Name: 'BASTION MK XVI',
        RPM: '600',
        DMG: '150',
        DUR: '35',
        AP: '4',
        DF: '15',
        ST: '25',
        PF: '20',
        Status: ''
      }
    },
    {
      code: 'M-102',
      attackType: 'projectile',
      attackName: '12.5mm BCHP RIFLE ROUNDS_P',
      fields: {
        Type: 'Stratagem',
        Sub: 'VHL',
        Role: 'automatic',
        Name: 'FAST RECON VEHICLE',
        RPM: '600',
        DMG: '150',
        DUR: '35',
        AP: '4',
        DF: '15',
        ST: '25',
        PF: '20',
        Status: ''
      }
    }
  ];

  for (const expected of expectedRows) {
    const row = findWeaponRow(rows, {
      code: expected.code,
      attackType: expected.attackType,
      attackName: expected.attackName
    });

    assert.ok(row, `Missing adopted row: ${expected.code} ${expected.attackType} ${expected.attackName}`);
    assert.deepEqual({
      Type: row.Type,
      Sub: row.Sub,
      Role: row.Role,
      Name: row.Name,
      RPM: row.RPM,
      DMG: row.DMG,
      DUR: row.DUR,
      AP: row.AP,
      DF: row.DF,
      ST: row.ST,
      PF: row.PF,
      Status: row.Status
    }, expected.fields);
  }
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

test('patch 1.006.202 – CQC-30 Stun Baton and Flame Sentry regression', () => {
  const rows = loadCheckedInWeaponRows();

  const stunBaton = rows.find((row) => row['Atk Name'] === 'CQC-30_M');
  assert.ok(stunBaton, 'Stun Baton row should exist');
  assert.equal(stunBaton.DMG, '120', 'CQC-30 Stun Baton DMG buffed to 120 in patch 1.006.202');
  assert.equal(stunBaton.DUR, '60', 'CQC-30 Stun Baton DUR buffed to 60 in patch 1.006.202');

  const flameSentry = rows.find((row) => row['Atk Name'] === 'SWP_FLAME SENTRY_S');
  assert.ok(flameSentry, 'Flame Sentry spray row should exist');
  assert.equal(flameSentry.DMG, '3', 'Flame Sentry DMG buffed to 3 in patch 1.006.202');
  assert.equal(flameSentry.DUR, '3', 'Flame Sentry DUR buffed to 3 in patch 1.006.202');
});
