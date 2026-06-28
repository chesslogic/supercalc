import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const PYTHON = process.platform === 'win32' ? 'python' : 'python3';
const COMPARE_PATH = fileURLToPath(new URL('../tools/compare_enemydata.py', import.meta.url));
const RULES_PATH = fileURLToPath(new URL('../enemies/enemy-refresh-rules.json', import.meta.url));
const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const SCRATCH_ROOT = join(REPO_ROOT, 'tests', '.scratch');

function createScratchDir(prefix) {
  const dir = join(SCRATCH_ROOT, `${prefix}-${randomUUID()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function runCompare(currentFixture, generatedFixture) {
  const tempDir = createScratchDir('enemy-refresh-rules');
  const currentPath = join(tempDir, 'current.json');
  const generatedPath = join(tempDir, 'generated.json');
  const reportPath = join(tempDir, 'report.json');

  try {
    writeFileSync(currentPath, JSON.stringify(currentFixture, null, 2));
    writeFileSync(generatedPath, JSON.stringify(generatedFixture, null, 2));

    const result = spawnSync(PYTHON, [
      COMPARE_PATH,
      '--current',
      currentPath,
      '--generated',
      generatedPath,
      '--report',
      reportPath
    ], {
      cwd: REPO_ROOT,
      encoding: 'utf8'
    });

    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /Summary:/);
    return JSON.parse(readFileSync(reportPath, 'utf8'));
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

test('enemy refresh rules file captures Hive Guard and Vox Engine constraints', () => {
  const rules = JSON.parse(readFileSync(RULES_PATH, 'utf8'));
  const hiveGuard = rules.rules.Terminid['Hive Guard'];
  const voxEngine = rules.rules.Automaton['Vox Engine'];

  assert.ok(hiveGuard);
  assert.ok(voxEngine);
  assert.ok(hiveGuard.locked_fields.includes('damageable_zones'));
  assert.ok(voxEngine.safe_sync_fields.includes('health'));
  assert.ok(voxEngine.safe_sync_fields.includes('damageable_zones[zone_name=Main].health'));
  assert.ok(hiveGuard.known_source_lag.some((entry) => entry.field === 'damageable_zones[zone_name=claws].AV'));
  assert.ok(voxEngine.manual_review_notes.some((note) => note.includes('cannon')));
});

test('compare_enemydata classifies safe-sync, locked, and known-lag refresh changes', () => {
  const currentFixture = {
    Automaton: {
      'Vox Engine': {
        health: 11000,
        damageable_zones: [
          {
            zone_name: 'Main',
            health: 11000,
            AV: 5,
            'Dur%': 1,
            'ToMain%': 1,
            MainCap: 1,
            ExTarget: 'Main'
          }
        ]
      }
    },
    Terminid: {
      'Hive Guard': {
        health: 500,
        damageable_zones: [
          {
            zone_name: 'Main',
            health: 500,
            AV: 2,
            'Dur%': 0.3,
            'ToMain%': 1,
            MainCap: 1,
            ExTarget: 'Part'
          },
          {
            zone_name: 'r_claw',
            health: 100,
            AV: 1,
            'Dur%': 0,
            'ToMain%': 0.25,
            MainCap: 0,
            ExTarget: 'Main'
          },
          {
            zone_name: 'hitzone_r_front_leg',
            health: 125,
            AV: 3,
            'Dur%': 0,
            'ToMain%': 0.45,
            MainCap: 0,
            ExTarget: 'Main'
          }
        ]
      }
    }
  };

  const generatedFixture = {
    Automaton: {
      'Vox Engine': {
        health: 9000,
        damageable_zones: [
          {
            zone_name: 'Main',
            health: 9000,
            AV: 5,
            'Dur%': 1,
            'ToMain%': 1,
            MainCap: true,
            ExTarget: 'Main'
          },
          {
            zone_name: 'cannons',
            health: 8000,
            AV: 5,
            'Dur%': 1,
            ExTarget: 'Part',
            ExMult: 0.4
          }
        ]
      }
    },
    Terminid: {
      'Hive Guard': {
        health: 500,
        damageable_zones: [
          {
            zone_name: 'Main',
            health: 500,
            AV: 2,
            'Dur%': 0.3,
            'ToMain%': 1,
            MainCap: true,
            ExTarget: 'Part'
          },
          {
            zone_name: 'claws',
            health: 125,
            AV: 3,
            'Dur%': 0,
            'ToMain%': 0.45,
            MainCap: false,
            ExTarget: 'Main'
          },
          {
            zone_name: 'front_legs',
            health: 125,
            AV: 1,
            'Dur%': 0,
            'ToMain%': 0.45,
            MainCap: false,
            ExTarget: 'Main'
          }
        ]
      }
    }
  };

  const report = runCompare(currentFixture, generatedFixture);
  const voxClassification =
    report.factions.Automaton.stat_changed_units['Vox Engine'].refresh_rule_classification;
  const hiveClassification =
    report.factions.Terminid.stat_changed_units['Hive Guard'].refresh_rule_classification;

  assert.ok(voxClassification);
  assert.ok(hiveClassification);
  assert.equal(voxClassification.summary.safe_sync, 2);
  assert.ok(voxClassification.summary.locked >= 1);
  assert.equal(
    voxClassification.field_changes.find((change) => change.field === 'health').classification,
    'safe_sync'
  );
  assert.equal(
    voxClassification.field_changes.find((change) => change.field === 'damageable_zones[zone_name=cannons].health').classification,
    'locked'
  );
  assert.equal(
    hiveClassification.field_changes.find((change) => change.field === 'damageable_zones[zone_name=claws].AV').classification,
    'known_source_lag'
  );
  assert.ok(report.summary.refresh_rule_matched_unit_count >= 2);
});
