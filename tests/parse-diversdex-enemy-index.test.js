import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const PYTHON = process.platform === 'win32' ? 'python' : 'python3';
const PARSER_PATH = fileURLToPath(new URL('../tools/parse_diversdex_enemy_index.py', import.meta.url));
const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const SCRATCH_ROOT = join(REPO_ROOT, 'tests', '.scratch');

function createScratchDir(prefix) {
  const dir = join(SCRATCH_ROOT, `${prefix}-${randomUUID()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function escapeCsvCell(value) {
  const text = String(value ?? '');
  return /[",\n]/.test(text)
    ? `"${text.replaceAll('"', '""')}"`
    : text;
}

function buildCsvRow(width, cells) {
  const row = Array.from({ length: width }, () => '');
  for (const [index, value] of Object.entries(cells)) {
    row[Number(index)] = value;
  }
  return row.map(escapeCsvCell).join(',');
}

function runParser(inputPaths, outputPath) {
  const result = spawnSync(PYTHON, [
    PARSER_PATH,
    '--input',
    ...inputPaths,
    '--output',
    outputPath
  ], {
    cwd: REPO_ROOT,
    encoding: 'utf8'
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  return JSON.parse(readFileSync(outputPath, 'utf8'));
}

test('parse_diversdex_enemy_index keeps base and prefixed grouped automaton variants separate', () => {
  const tempDir = createScratchDir('parse-diversdex-automaton');
  const inputPath = join(tempDir, 'ONGOING UPDATE - Helldivers II Enemies Index [UNOFFICIAL] - Automatons.csv');
  const outputPath = join(tempDir, 'output.json');

  try {
    const rows = [
      buildCsvRow(17, { 1: 'CORE' }),
      buildCsvRow(17, { 1: 'TROOPER / COMMISSAR / ROCKET RAIDER' }),
      buildCsvRow(17, { 3: 'Zone', 5: 'Health', 6: 'Constitution', 8: 'Durable', 9: 'Armor', 10: 'OnDeath', 11: '%toMain', 12: 'MainCap', 13: 'ExTarget', 14: 'ExMult', 15: 'ExVerif' }),
      buildCsvRow(17, { 3: 'main', 5: '125', 6: '0', 8: '0%', 9: '0', 10: 'Fatal', 13: 'Main', 14: '100%', 15: 'Outer' }),
      buildCsvRow(17, { 3: 'head', 5: '40', 6: '0', 8: '0%', 9: '0', 10: 'Fatal', 11: '100%', 12: 'Yes', 13: 'Main', 14: '100%', 15: 'Outer' }),
      buildCsvRow(17, { 3: 'Status', 4: 'Min', 5: 'Max', 6: 'Damage', 8: 'ReactEvent', 9: 'Threshold', 10: 'Interrupt?', 11: 'Stagger?', 12: 'Duration' }),
      buildCsvRow(17, { 3: 'fire', 4: '2', 5: '3', 6: '50%', 8: 'medium' }),
      buildCsvRow(17, { 1: 'JET BRIGADE ASSAULT RAIDER / COMMISSAR / MG RAIDER / TROOPER' }),
      buildCsvRow(17, { 3: 'Zone', 5: 'Health', 6: 'Constitution', 8: 'Durable', 9: 'Armor', 10: 'OnDeath', 11: '%toMain', 12: 'MainCap', 13: 'ExTarget', 14: 'ExMult', 15: 'ExVerif' }),
      buildCsvRow(17, { 3: 'main', 5: '150', 6: '0', 8: '0%', 9: '1', 10: 'Fatal', 13: 'Main', 14: '100%', 15: 'Outer' }),
      buildCsvRow(17, { 3: 'Status', 4: 'Min', 5: 'Max', 6: 'Damage', 8: 'ReactEvent', 9: 'Threshold', 10: 'Interrupt?', 11: 'Stagger?', 12: 'Duration' }),
      buildCsvRow(17, { 3: 'thermite', 4: '0.5', 5: '1', 6: '100%', 8: 'massive', 9: '10', 10: 'Yes', 11: 'Yes', 12: '0.85' }),
      buildCsvRow(17, { 3: 'JUMP PACK' }),
      buildCsvRow(17, { 3: 'Zone', 5: 'Health', 6: 'Constitution', 8: 'Durable', 9: 'Armor', 10: 'OnDeath', 11: '%toMain', 12: 'MainCap', 13: 'ExTarget', 14: 'ExMult', 15: 'ExVerif' }),
      buildCsvRow(17, { 3: 'main', 5: '50', 6: '0', 8: '0%', 9: '2', 10: 'Fatal', 13: 'Main', 14: '100%', 15: 'Outer' }),
      buildCsvRow(17, { 3: 'jump pack', 5: '50', 6: '100 [50/s]', 8: '0%', 9: '2', 11: '100%', 12: 'Yes', 13: 'Main', 14: '100%', 15: 'Outer' }),
      buildCsvRow(17, { 3: 'Status', 4: 'Min', 5: 'Max', 6: 'Damage', 8: 'ReactEvent', 9: 'Threshold', 10: 'Interrupt?', 11: 'Stagger?', 12: 'Duration' }),
      buildCsvRow(17, { 3: 'electricity', 4: '-', 5: '-', 6: '100%', 8: 'Mounted items inherit attributes from the parent entity' })
    ];

    writeFileSync(inputPath, `${rows.join('\n')}\n`);

    const parsed = runParser([inputPath], outputPath);
    const trooper = parsed.Automaton.Trooper;
    const jetBrigadeTrooper = parsed.Automaton['Jet Brigade Trooper'];

    assert.ok(trooper);
    assert.equal(trooper.health, 125);
    assert.equal(trooper.source_profile_name, 'TROOPER / COMMISSAR / ROCKET RAIDER');
    assert.equal(trooper.child_profiles, undefined);
    assert.deepEqual(trooper.shared_profile_names, ['Trooper', 'Commissar', 'Rocket Raider']);

    assert.ok(jetBrigadeTrooper);
    assert.equal(jetBrigadeTrooper.health, 150);
    assert.equal(jetBrigadeTrooper.source_profile_name, 'JET BRIGADE ASSAULT RAIDER / COMMISSAR / MG RAIDER / TROOPER');
    assert.deepEqual(jetBrigadeTrooper.shared_profile_names, [
      'Jet Brigade Assault Raider',
      'Jet Brigade Commissar',
      'Jet Brigade MG Raider',
      'Jet Brigade Trooper'
    ]);
    assert.equal(jetBrigadeTrooper.status_effects.thermite.threshold, 10);
    assert.equal(jetBrigadeTrooper.status_effects.thermite.interrupts, true);

    const jumpPack = jetBrigadeTrooper.child_profiles['Jump Pack'];
    assert.ok(jumpPack);
    assert.equal(jumpPack.health, 50);
    assert.equal(jumpPack.damageable_zones[1].zone_name, 'jump_pack');
    assert.equal(jumpPack.damageable_zones[1].Con, 100);
    assert.equal(jumpPack.damageable_zones[1].ConRate, 50);
    assert.equal(
      jumpPack.status_effects.electricity.react_event,
      'Mounted items inherit attributes from the parent entity'
    );
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('parse_diversdex_enemy_index parses illuminate descriptions, default stats, ids, and notes', () => {
  const tempDir = createScratchDir('parse-diversdex-illuminate');
  const inputPath = join(tempDir, 'ONGOING UPDATE - Helldivers II Enemies Index [UNOFFICIAL] - Illuminate (old).csv');
  const outputPath = join(tempDir, 'output.json');

  try {
    const rows = [
      buildCsvRow(15, { 1: 'Watcher', 6: 'Flying drone equipped with arc weaponry.' }),
      buildCsvRow(15, { 6: 'Default stats', 8: 'Value', 10: 'ReactEvent', 11: 'Threshold', 12: 'Interrupt?', 13: 'Stagger?', 14: 'Duration' }),
      buildCsvRow(15, { 6: 'Unit mass', 8: '150', 10: 'Light', 11: '1', 12: 'No', 13: 'No', 14: '0.5' }),
      buildCsvRow(15, { 6: 'Unit size', 8: 'medium', 10: 'Medium' }),
      buildCsvRow(15, { 1: 'ID', 2: 'Hitbox', 3: 'Health', 4: 'Constitution', 6: 'Durable', 7: 'Armor', 8: 'OnDeath', 10: '%toMain', 11: 'MainCap', 12: 'ExTarget', 13: 'ExMult', 14: 'ExVerif' }),
      buildCsvRow(15, { 1: '0', 2: 'Main', 3: '600', 4: '0', 6: '0%', 7: '0', 8: 'Fatal', 13: '100%', 14: 'Outer' }),
      buildCsvRow(15, { 1: '2948928094', 2: 'Eye', 3: '300', 4: '0', 6: '0%', 7: '0', 10: '100%', 11: 'Yes', 12: 'Main', 14: 'Outer' }),
      buildCsvRow(15, { 1: 'Status', 2: 'Minimum', 3: 'Maximum', 4: 'Damage%', 6: 'Ability', 7: 'Damage', 8: 'AP', 10: 'Stagger', 11: 'Push', 12: 'Special' }),
      buildCsvRow(15, { 1: 'Electricity', 2: 'x', 3: 'x', 4: '100%', 6: 'Zap', 7: '⚡30 [15]', 8: '3|2|1|0', 10: '10', 11: '5', 12: '⛔Stun Small' }),
      buildCsvRow(15, { 1: 'Gas', 2: '0,5', 3: '1', 4: '100%' }),
      buildCsvRow(15, { 1: '* The shield is immune to all statuses.' })
    ];

    writeFileSync(inputPath, `${rows.join('\n')}\n`);

    const parsed = runParser([inputPath], outputPath);
    const watcher = parsed.Illuminate.Watcher;

    assert.ok(watcher);
    assert.equal(watcher.health, 600);
    assert.equal(watcher.description, 'Flying drone equipped with arc weaponry.');
    assert.deepEqual(watcher.notes, ['* The shield is immune to all statuses.']);
    assert.equal(watcher.default_stats.unit_mass.value, 150);
    assert.equal(watcher.default_stats.unit_mass.react_event, 'Light');
    assert.equal(watcher.default_stats.unit_mass.interrupts, false);
    assert.equal(watcher.damageable_zones[0].zone_id, 0);
    assert.equal(watcher.damageable_zones[1].zone_name, 'eye');
    assert.equal(watcher.damageable_zones[1].zone_id, 2948928094);
    assert.equal(watcher.damageable_zones[1]['ToMain%'], 1);
    assert.equal(watcher.damageable_zones[1].MainCap, true);
    assert.equal(watcher.status_effects.electricity.minimum, 'x');
    assert.equal(watcher.status_effects.electricity.special, '⛔Stun Small');
    assert.equal(watcher.status_effects.gas.minimum, 0.5);
    assert.equal(watcher.status_effects.gas.damage_multiplier, 1);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
