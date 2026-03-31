import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const PYTHON = process.platform === 'win32' ? 'python' : 'python3';
const AUDIT_PATH = fileURLToPath(new URL('../tools/audit_enemy_opaque_zones.py', import.meta.url));
const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const SCRATCH_ROOT = join(REPO_ROOT, 'tests', '.scratch');

function createScratchDir(prefix) {
  const dir = join(SCRATCH_ROOT, `${prefix}-${randomUUID()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function runAudit(args, options = {}) {
  return spawnSync(PYTHON, [AUDIT_PATH, ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    ...options
  });
}

function buildZone(zone_name, overrides = {}) {
  return {
    zone_name,
    AV: 0,
    'Dur%': 0,
    ExTarget: 'Main',
    MainCap: true,
    'ToMain%': 0,
    health: 50,
    ...overrides
  };
}

test('opaque-zone audit ranks candidates, groups signatures, and tolerates malformed zones in non-strict mode', () => {
  const tempDir = createScratchDir('enemy-opaque-audit');
  const inputPath = join(tempDir, 'input.json');
  const outputPath = join(tempDir, 'report.json');

  try {
    const fixture = {
      Automaton: {
        'Boss Alpha': {
          health: 2500,
          damageable_zones: [
            buildZone('Main', { AV: 3, health: 2500, 'ToMain%': 1 }),
            buildZone('0xdeadbeef', { AV: 4, health: 1600, 'ToMain%': 0.75, MainCap: false, IsFatal: true }),
            buildZone('0xfeedbead', { AV: 4, health: 1600, 'ToMain%': 0.75, MainCap: false, IsFatal: true }),
            buildZone('[unknown]', { ExTarget: 'Part', health: 400, 'ToMain%': 0.8 }),
            buildZone('123', { health: 30, 'ToMain%': 0.3, IsFatal: true })
          ]
        },
        'Minor Beta': {
          health: 1200,
          damageable_zones: [
            buildZone('Main', { health: 1200, 'ToMain%': 1 }),
            buildZone('   ', { health: 1100, 'ToMain%': 1 }),
            buildZone(null)
          ]
        },
        'Clear Gamma': {
          health: 500,
          damageable_zones: [buildZone('Main', { health: 500, 'ToMain%': 1 }), buildZone('head', { health: 120 })]
        },
        'Broken Delta': {
          health: 50,
          damageable_zones: ['not-a-zone-object']
        }
      },
      Terminid: {}
    };

    writeFileSync(inputPath, JSON.stringify(fixture, null, 2));

    const result = runAudit(['--input', inputPath, '--output', outputPath, '--top', '0']);
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /Summary: .*opaque_units=2 .*reported=2 .*warnings=1/);
    assert.match(result.stdout, /1\. Automaton \/ Boss Alpha score=21 opaque=4 fatal=3 important=4/);
    assert.match(result.stdout, /2\. Automaton \/ Minor Beta score=4 opaque=2 fatal=0 important=1/);
    assert.match(result.stdout, /Wrote report to /);
    assert.match(result.stderr, /Warning: Expected zone 0 for 'Automaton\/Broken Delta' to be an object\./);

    const report = JSON.parse(readFileSync(outputPath, 'utf8'));
    assert.equal(report.summary.faction_count, 2);
    assert.equal(report.summary.unit_count, 4);
    assert.equal(report.summary.opaque_unit_count, 2);
    assert.equal(report.summary.candidate_unit_count, 2);
    assert.equal(report.summary.reported_candidate_count, 2);
    assert.equal(report.summary.warning_count, 1);
    assert.equal(report.summary.top_limit, null);

    const [bossAlpha, minorBeta] = report.candidates;
    assert.equal(bossAlpha.unit_name, 'Boss Alpha');
    assert.equal(bossAlpha.priority_score, 21);
    assert.equal(bossAlpha.opaque_ratio, 0.8);
    assert.deepEqual(bossAlpha.opaque_name_kinds, { unknown: 1, hash: 2, numeric: 1 });
    assert.deepEqual(bossAlpha.important_reason_counts, {
      IsFatal: 3,
      'health >= 1000': 2,
      'AV >= 3': 2,
      'ToMain% >= 0.75': 3
    });
    assert.equal(bossAlpha.opaque_signatures[0].count, 2);
    assert.deepEqual(bossAlpha.opaque_signatures[0].zone_name_examples, ['0xdeadbeef', '0xfeedbead']);
    assert.equal(bossAlpha.sample_opaque_zones[0].zone_name, '0xdeadbeef');
    assert.deepEqual(bossAlpha.sample_opaque_zones[0].important_reasons, [
      'IsFatal',
      'health >= 1000',
      'AV >= 3',
      'ToMain% >= 0.75'
    ]);

    assert.equal(minorBeta.unit_name, 'Minor Beta');
    assert.equal(minorBeta.priority_score, 4);
    assert.deepEqual(minorBeta.opaque_name_kinds, { blank: 1, 'non-string': 1 });
    assert.equal(minorBeta.sample_opaque_zones[0].zone_name, '[blank]');
    assert.equal(minorBeta.sample_opaque_zones[1].zone_name, '[non-string]');
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('opaque-zone audit supports summary-only output and top/min-score filtering', () => {
  const tempDir = createScratchDir('enemy-opaque-audit');
  const inputPath = join(tempDir, 'input.json');

  try {
    const fixture = {
      Automaton: {
        'Boss Alpha': {
          health: 2500,
          damageable_zones: [
            buildZone('Main', { health: 2500, 'ToMain%': 1 }),
            buildZone('0xdeadbeef', { AV: 4, health: 1600, 'ToMain%': 0.75, MainCap: false, IsFatal: true }),
            buildZone('[unknown]', { health: 400, 'ToMain%': 0.8 })
          ]
        },
        'Minor Beta': {
          health: 1200,
          damageable_zones: [buildZone('Main', { health: 1200, 'ToMain%': 1 }), buildZone('   ', { health: 1100, 'ToMain%': 1 })]
        }
      }
    };

    writeFileSync(inputPath, JSON.stringify(fixture, null, 2));

    const result = runAudit(['--input', inputPath, '--top', '1', '--min-score', '5', '--summary-only']);
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /^Summary:/m);
    assert.match(result.stdout, /1\. Automaton \/ Boss Alpha score=9 opaque=2 fatal=1 important=2/);
    assert.doesNotMatch(result.stdout, /Minor Beta/);
    assert.doesNotMatch(result.stdout, /"candidates":/);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('opaque-zone audit strict mode fails fast on malformed zone payloads', () => {
  const tempDir = createScratchDir('enemy-opaque-audit');
  const inputPath = join(tempDir, 'input.json');

  try {
    const fixture = {
      Automaton: {
        'Broken Delta': {
          health: 50,
          damageable_zones: ['not-a-zone-object']
        }
      }
    };

    writeFileSync(inputPath, JSON.stringify(fixture, null, 2));

    const result = runAudit(['--input', inputPath, '--strict', '--summary-only']);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Strict mode: Expected zone 0 for 'Automaton\/Broken Delta' to be an object\./);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
