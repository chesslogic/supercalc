import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const PYTHON = process.platform === 'win32' ? 'python' : 'python3';
const SCRIPT_PATH = fileURLToPath(new URL('../tools/ingest_wikigg_attacks.py', import.meta.url));
const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const SCRATCH_ROOT = join(REPO_ROOT, 'tests', '.scratch');

function createScratchDir(prefix) {
  const dir = join(SCRATCH_ROOT, `${prefix}-${randomUUID()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function runTool(args) {
  const result = spawnSync(PYTHON, [SCRIPT_PATH, ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8'
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  return result;
}

test('ingest_wikigg_attacks resolves local stratagem, companion, and status fixtures into comparable records', () => {
  const tempDir = createScratchDir('wikigg-attack-ingest');
  const stratagemsPath = join(tempDir, 'stratagems.json');
  const weaponsPath = join(tempDir, 'weapons.json');
  const statusPath = join(tempDir, 'status.json');
  const csvPath = join(tempDir, 'weapondata.csv');
  const outputPath = join(tempDir, 'output.json');

  const stratagemsFixture = {
    damage: {
      'ANTI-PERSONNEL MINEFIELD_E_dm': {
        dmg: 700,
        dmg2: 700,
        hits_per_second: 0,
        ap1: 3,
        ap2: 0,
        ap3: 0,
        ap4: 0,
        demo: 30,
        stun: 30,
        push: 30,
        element_name: 'none',
        statuses: []
      },
      'SWP_FLAME SENTRY_S_dm': {
        dmg: 2,
        dmg2: 2,
        hits_per_second: 0,
        ap1: 4,
        ap2: 4,
        ap3: 4,
        ap4: 4,
        demo: 10,
        stun: 5,
        push: 5,
        element_name: 'fire',
        Status_Name_1: 'Fire',
        Status_Value_1: 2,
        statuses: ['Fire']
      }
    },
    explosion: {
      'ANTI-PERSONNEL MINEFIELD_E': {
        damage_id: 'ANTI-PERSONNEL MINEFIELD_E_dm',
        r1: 4,
        r2: 8,
        r3: 12,
        name: 'ANTI-PERSONNEL MINEFIELD E'
      }
    },
    spray: {
      'SWP_FLAME SENTRY_S': {
        damage_id: 'SWP_FLAME SENTRY_S_dm',
        name: 'SWP FLAME SENTRY S'
      }
    },
    weapons: {
      'SWP_FLAME SENTRY': {
        id: 'A/FLAM-40',
        name: 'SWP FLAME SENTRY',
        attacks: [
          {
            type: 'spray',
            name: 'SWP_FLAME SENTRY_S',
            parent: 'SWP_FLAME SENTRY',
            level: 1
          },
          {
            type: 'status',
            name: 'Fire',
            parent: 'SWP_FLAME SENTRY_S',
            level: 2
          }
        ]
      }
    },
    stratagems: {
      'ANTI-PERSONNEL MINEFIELD': {
        name: 'ANTI-PERSONNEL MINEFIELD',
        id: 'MD-6',
        attacks: [
          {
            type: 'explosion',
            name: 'ANTI-PERSONNEL MINEFIELD_E',
            parent: 'ANTI-PERSONNEL MINEFIELD',
            level: 1
          }
        ]
      },
      'FLAME SENTRY': {
        name: 'FLAME SENTRY',
        id: 'A/FLAM-40',
        attacks: [
          {
            type: 'weapons',
            name: 'SWP_FLAME SENTRY',
            parent: 'FLAME SENTRY',
            level: 1
          }
        ]
      },
      'DOG BREATH': {
        name: 'DOG BREATH',
        loadout_wep: 'AX/TX-13 DOG BREATH',
        attacks: []
      },
      'HMG EMPLACEMENT': {
        name: 'HMG EMPLACEMENT',
        id: 'E/MG-101',
        attacks: []
      }
    }
  };

  const weaponsFixture = {
    damage: {
      'AX/TX-13 DOG BREATH_S_dm': {
        dmg: 1,
        dmg2: 1,
        hits_per_second: 0,
        ap1: 5,
        ap2: 5,
        ap3: 5,
        ap4: 0,
        demo: 5,
        stun: 10,
        push: 5,
        element_name: 'gas',
        Status_Name_1: 'Gas_Var2',
        Status_Value_1: 0.5,
        Status_Name_2: 'Gas_Confusion_Var2',
        Status_Value_2: 0.5,
        statuses: ['Gas_Var2', 'Gas_Confusion_Var2']
      }
    },
    spray: {
      'AX/TX-13 DOG BREATH_S': {
        damage_id: 'AX/TX-13 DOG BREATH_S_dm',
        name: 'AX/TX-13 DOG BREATH S'
      }
    },
    weapons: {
      'AX/TX-13 DOG BREATH': {
        id: 'AX/TX-13',
        name: 'AX/TX-13 DOG BREATH',
        attacks: [
          {
            type: 'spray',
            name: 'AX/TX-13 DOG BREATH_S',
            parent: 'AX/TX-13 DOG BREATH',
            level: 1
          },
          {
            type: 'status',
            name: 'Gas_Var2',
            parent: 'AX/TX-13 DOG BREATH_S',
            level: 2
          },
          {
            type: 'status',
            name: 'Gas_Confusion_Var2',
            parent: 'AX/TX-13 DOG BREATH_S',
            level: 2
          }
        ]
      }
    }
  };

  const statusFixture = {
    damage: {
      Fire_dmg: {
        dmg: 100,
        dmg2: 100,
        hits_per_second: 0,
        ap1: 4,
        ap2: 4,
        ap3: 4,
        ap4: 0,
        demo: 0,
        stun: 0,
        push: 0,
        element_name: 'fire'
      },
      Gas_Var2_dmg: {
        dmg: 25,
        dmg2: 25,
        hits_per_second: 0,
        ap1: 6,
        ap2: 6,
        ap3: 6,
        ap4: 0,
        demo: 0,
        stun: 0,
        push: 0,
        element_name: 'gas'
      }
    },
    status: {
      Fire: {
        strength: 5,
        duration: 3,
        name: 'Fire',
        damage_id: 'Fire_dmg'
      },
      Gas_Var2: {
        strength: 0.5,
        duration: 6,
        name: 'Gas',
        damage_id: 'Gas_Var2_dmg'
      },
      Gas_Confusion_Var2: {
        strength: 0.5,
        duration: 5,
        name: 'Gas Confusion'
      }
    }
  };

  const csvFixture = [
    'Type,Sub,Role,Code,Name,RPM,Atk Type,Atk Name,DMG,DUR,AP,DF,ST,PF,Status',
    'Stratagem,EMP,ordnance,-,ANTI-PERSONNEL MINEFIELD,,explosion,ANTI-PERSONNEL MINEFIELD_E,700,700,3,30,30,30,',
    'Stratagem,EMP,energy,A/FLAM-40,FLAME SENTRY,,spray,SWP_FLAME SENTRY_S,2,2,4,10,5,5,Fire',
    'Stratagem,BCK,energy,AX/TX-13,"""GUARD DOG"" DOG BREATH",,spray,AX/TX-13 DOG BREATH_S,1,1,5,5,10,5,Gas_Var2 • Gas_Confusion_Var2',
    'Stratagem,EMP,automatic,E/MG-101,HMG EMPLACEMENT,600,projectile,Rifle 12.5x100mm Full Metal Jacket,200,40,4,20,25,15,'
  ].join('\n');

  try {
    writeFileSync(stratagemsPath, JSON.stringify(stratagemsFixture, null, 2));
    writeFileSync(weaponsPath, JSON.stringify(weaponsFixture, null, 2));
    writeFileSync(statusPath, JSON.stringify(statusFixture, null, 2));
    writeFileSync(csvPath, `${csvFixture}\n`);

    const result = runTool([
      '--offline',
      '--stratagems-json',
      stratagemsPath,
      '--weapons-json',
      weaponsPath,
      '--status-json',
      statusPath,
      '--csv',
      csvPath,
      '--output',
      outputPath
    ]);

    assert.match(result.stdout, /Wrote .*output\.json with 3 normalized attack records across 4 stratagem entries\./);
    assert.match(result.stdout, /Matched 3 of 4 existing stratagem CSV rows\./);

    const report = JSON.parse(readFileSync(outputPath, 'utf8'));
    assert.equal(report.metadata.sources.stratagems.origin, 'file');
    assert.equal(report.metadata.sources.weapons.origin, 'file');
    assert.equal(report.metadata.sources.status.origin, 'file');

    assert.equal(report.coverage.summary.wiki_records_total, 3);
    assert.equal(report.coverage.summary.wiki_records_matched, 3);
    assert.equal(report.coverage.summary.csv_rows_total, 4);
    assert.equal(report.coverage.summary.csv_rows_unmatched, 1);
    assert.equal(report.coverage.summary.unresolved_entities, 1);

    const flameSentry = report.records.find((record) => record.entity.name === 'FLAME SENTRY');
    assert.ok(flameSentry);
    assert.equal(flameSentry.attack.type, 'spray');
    assert.equal(flameSentry.csv_projection.Status, 'Fire');
    assert.equal(flameSentry.comparison.match_kind, 'code+attack');
    assert.deepEqual(flameSentry.weapon_context.resolved_weapon_names, ['SWP_FLAME SENTRY']);

    const dogBreath = report.records.find((record) => record.entity.name === 'DOG BREATH');
    assert.ok(dogBreath);
    assert.equal(dogBreath.entity.loadout_wep, 'AX/TX-13 DOG BREATH');
    assert.equal(dogBreath.csv_projection.Code, 'AX/TX-13');
    assert.deepEqual(dogBreath.statuses.names, ['Gas_Var2', 'Gas_Confusion_Var2']);
    assert.equal(dogBreath.statuses.details[0].damage.damage, 25);
    assert.equal(dogBreath.comparison.match_kind, 'code+attack');

    const unresolvedEntity = report.unresolved_entities.find((entry) => entry.name === 'HMG EMPLACEMENT');
    assert.ok(unresolvedEntity);
    assert.equal(unresolvedEntity.reason, 'no-attacks-or-loadout');
    assert.deepEqual(unresolvedEntity.csv_row_numbers, [5]);

    const hmgSummary = report.coverage.by_stratagem.find((entry) => entry.name === 'HMG EMPLACEMENT');
    assert.ok(hmgSummary);
    assert.equal(hmgSummary.status, 'unresolved');
    assert.equal(hmgSummary.csv_row_count, 1);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
