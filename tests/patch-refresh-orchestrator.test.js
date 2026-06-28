import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const PYTHON = process.platform === 'win32' ? 'python' : 'python3';
const SCRIPT_PATH = fileURLToPath(new URL('../tools/run_patch_refresh.py', import.meta.url));
const REPO_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const SCRATCH_ROOT = join(REPO_ROOT, 'tests', '.scratch');

function createScratchDir(prefix) {
  const dir = join(SCRATCH_ROOT, `${prefix}-${randomUUID()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function runTool(args) {
  return spawnSync(PYTHON, [SCRIPT_PATH, ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8'
  });
}

function runPythonSnippet(source) {
  return spawnSync(PYTHON, ['-c', source], {
    cwd: REPO_ROOT,
    encoding: 'utf8'
  });
}

function buildZone(zone_name, overrides = {}) {
  return {
    zone_name,
    AV: 1,
    'Dur%': 0,
    ExTarget: 'Part',
    MainCap: false,
    'ToMain%': 0.5,
    health: 100,
    ...overrides
  };
}

test('run_patch_refresh can write a manifest-only report in report-only mode', () => {
  const tempDir = createScratchDir('patch-refresh-skip-validation');
  const enemyCurrentPath = join(tempDir, 'enemydata.json');
  const weaponCsvPath = join(tempDir, 'weapondata.csv');
  const outputDir = join(tempDir, 'artifacts');

  try {
    writeFileSync(enemyCurrentPath, JSON.stringify({ Automaton: {} }, null, 2));
    writeFileSync(weaponCsvPath, 'Type,Sub,Role,Code,Name,RPM,Atk Type,Atk Name,DMG,DUR,AP,DF,ST,PF,Status\n');
    const originalEnemyData = readFileSync(enemyCurrentPath, 'utf8');
    const originalWeaponData = readFileSync(weaponCsvPath, 'utf8');

    const result = runTool([
      '--run-id',
      'manifest-only',
      '--generated-at',
      '2026-01-02T03:04:05Z',
      '--output-dir',
      outputDir,
      '--enemy-current',
      enemyCurrentPath,
      '--weapon-csv',
      weaponCsvPath,
      '--skip-validation'
    ]);

    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /Validation status: skipped/);
    assert.match(result.stdout, /Mode: report_only=true auto_apply=false/);
    assert.equal(readFileSync(enemyCurrentPath, 'utf8'), originalEnemyData);
    assert.equal(readFileSync(weaponCsvPath, 'utf8'), originalWeaponData);

    const manifest = JSON.parse(readFileSync(join(outputDir, 'manifest-only', 'index.json'), 'utf8'));
    assert.deepEqual(manifest.mode, { auto_apply: false, report_only: true });
    assert.equal(manifest.validation_reports.status, 'skipped');
    assert.equal(manifest.validation_reports.reason, 'disabled by --skip-validation');
    assert.deepEqual(manifest.validation_reports.reports, {});
    assert.equal(manifest.protected_runtime_datasets.enemy_data.modified_by_tool, false);
    assert.equal(manifest.protected_runtime_datasets.weapon_csv.modified_by_tool, false);
    assert.equal(existsSync(join(outputDir, 'manifest-only', 'wiki_validation', 'index.json')), false);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('run_patch_refresh writes a report-first manifest without touching runtime inputs', () => {
  const tempDir = createScratchDir('patch-refresh');
  const enemyCurrentPath = join(tempDir, 'enemydata.json');
  const enemySidecarPath = join(tempDir, 'wikigg-enemy-sidecar.json');
  const weaponCsvPath = join(tempDir, 'weapondata.csv');
  const missingAttackIngestPath = join(tempDir, 'missing-wikigg-attacks.json');
  const outputDir = join(tempDir, 'artifacts');

  const currentEnemyFixture = {
    Automaton: {
      Scout: {
        health: 100,
        damageable_zones: [
          buildZone('Main', { ExTarget: 'Main', MainCap: true, 'ToMain%': 1, health: 100 })
        ]
      }
    }
  };
  const wikiEnemyFixture = {
    __schema_version: 1,
    __generated_at: '2026-01-02T03:04:05Z',
    __source_provenance: 'fixture',
    Automaton: {
      Scout: {
        health: 125,
        source_profile_name: 'Scout',
        source_provenance: {
          source_page_url: 'https://example.invalid/wiki/Scout'
        },
        damageable_zones: [
          buildZone('Main', {
            source_zone_name: 'Main',
            ExTarget: 'Main',
            MainCap: true,
            'ToMain%': 1,
            health: 125
          })
        ]
      }
    }
  };
  const weaponCsvFixture = [
    'Type,Sub,Role,Code,Name,RPM,Atk Type,Atk Name,DMG,DUR,AP,DF,ST,PF,Status',
    'Primary,AR,rifle,AR-1,TEST RIFLE,600,projectile,TEST,10,10,1,0,0,0,'
  ].join('\n');

  try {
    writeFileSync(enemyCurrentPath, JSON.stringify(currentEnemyFixture, null, 2));
    writeFileSync(enemySidecarPath, JSON.stringify(wikiEnemyFixture, null, 2));
    writeFileSync(weaponCsvPath, `${weaponCsvFixture}\n`);
    const originalEnemyData = readFileSync(enemyCurrentPath, 'utf8');
    const originalWeaponData = readFileSync(weaponCsvPath, 'utf8');

    const result = runTool([
      '--run-id',
      'fixture-run',
      '--generated-at',
      '2026-01-02T03:04:05Z',
      '--output-dir',
      outputDir,
      '--enemy-current',
      enemyCurrentPath,
      '--enemy-sidecar',
      enemySidecarPath,
      '--weapon-csv',
      weaponCsvPath,
      '--attack-ingest',
      missingAttackIngestPath
    ]);

    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /Patch refresh manifest:/);
    assert.match(result.stdout, /Validation status: partial/);
    assert.match(result.stdout, /report_only=true auto_apply=false/);

    assert.equal(readFileSync(enemyCurrentPath, 'utf8'), originalEnemyData);
    assert.equal(readFileSync(weaponCsvPath, 'utf8'), originalWeaponData);

    const manifestPath = join(outputDir, 'fixture-run', 'index.json');
    const validationIndexPath = join(outputDir, 'fixture-run', 'wiki_validation', 'index.json');
    const enemyReportPath = join(outputDir, 'fixture-run', 'wiki_validation', 'enemy-anatomy-validation.json');
    assert.ok(existsSync(manifestPath));
    assert.ok(existsSync(validationIndexPath));
    assert.ok(existsSync(enemyReportPath));

    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    assert.equal(manifest.run_id, 'fixture-run');
    assert.equal(manifest.generated_at, '2026-01-02T03:04:05Z');
    assert.equal(manifest.repo_root, REPO_ROOT);
    assert.deepEqual(manifest.mode, { auto_apply: false, report_only: true });
    assert.equal(manifest.protected_runtime_datasets.enemy_data.modified_by_tool, false);
    assert.equal(manifest.protected_runtime_datasets.weapon_csv.modified_by_tool, false);
    assert.equal(manifest.inputs.runtime_datasets.enemy_data.exists, true);
    assert.equal(manifest.inputs.runtime_datasets.weapon_csv.exists, true);
    assert.equal(manifest.inputs.wiki_ingest_artifacts.stratagem_attack_ingest.exists, false);
    assert.equal(manifest.steps[0].status, 'not_run');
    assert.equal(manifest.validation_reports.status, 'partial');
    assert.equal(manifest.validation_reports.reports.enemy_anatomy.status, 'completed');
    assert.equal(manifest.validation_reports.reports.enemy_anatomy.summary.current_unit_count, 1);
    assert.equal(manifest.validation_reports.reports.enemy_anatomy.summary.unit_health_mismatch_count, 1);
    assert.equal(manifest.validation_reports.reports.stratagem_attacks.status, 'skipped');
    assert.equal(manifest.validation_reports.reports.stratagem_attacks.reason, 'missing input');

    const validationIndex = JSON.parse(readFileSync(validationIndexPath, 'utf8'));
    assert.equal(validationIndex.status, 'partial');
    assert.ok(validationIndex.reports.enemy_anatomy);
    assert.equal(validationIndex.reports_status.stratagem_attacks.status, 'skipped');
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('run_patch_refresh treats any failed validation report as a failed refresh state', () => {
  const result = runPythonSnippet([
    'from tools.run_patch_refresh import summarize_validation_state',
    'reports = {"enemy": {"status": "completed"}, "attacks": {"status": "failed"}}',
    'print(summarize_validation_state(reports))'
  ].join('; '));

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.equal(result.stdout.trim(), 'failed');
});

test('run_patch_refresh validation helper works when imported package-style', () => {
  const tempDir = createScratchDir('patch-refresh-package-import');
  const outputDir = join(tempDir, 'validation');

  try {
    const result = runPythonSnippet([
      'from pathlib import Path',
      'from tools.run_patch_refresh import build_validation_reports',
      `result = build_validation_reports(enemy_current_path=Path(${JSON.stringify(join(tempDir, 'enemydata.json'))}), weapon_csv_path=Path(${JSON.stringify(join(tempDir, 'weapondata.csv'))}), enemy_sidecar_path=Path(${JSON.stringify(join(tempDir, 'sidecar.json'))}), attack_ingest_path=Path(${JSON.stringify(join(tempDir, 'attacks.json'))}), validation_output_dir=Path(${JSON.stringify(outputDir)}), skip_enemy=True, skip_attacks=True)`,
      'print(result["status"])'
    ].join('; '));

    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.equal(result.stdout.trim(), 'skipped');
    assert.ok(existsSync(join(outputDir, 'index.json')));
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
