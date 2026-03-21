import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const PYTHON = process.platform === 'win32' ? 'python' : 'python3';
const PARSER_PATH = fileURLToPath(new URL('../tools/parser_faction_units.py', import.meta.url));

test('parser derives Constitution bleed rates and only marks zero-bleed zones when rate is zero', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'supercalc-enemy-parser-'));
  const inputPath = join(tempDir, 'input.json');
  const outputPath = join(tempDir, 'output.json');

  try {
    const fixture = {
      'content/fac_cyborgs/synthetic/synthetic_walker': {
        loc_name: 'Synthetic Walker',
        health: 5000,
        constitution: 150,
        constitution_changerate: -5,
        zone_bleedout_changerate: 40,
        default_damageable_zone_info: {
          zone_name: 'core',
          health: -1,
          constitution: 150,
          armor: 4,
          affected_by_explosions: false,
          affects_main_health: 1,
          main_health_affect_capped_by_zone_health: true,
          projectile_durable_resistance: 1
        },
        damageable_zones: [
          {
            zone_name: 'panel',
            health: 1200,
            constitution: 1200,
            armor: 3,
            affected_by_explosions: true,
            affects_main_health: 1,
            main_health_affect_capped_by_zone_health: false,
            projectile_durable_resistance: 1,
            bleedout_enabled: false,
            causes_death_on_death: 1
          },
          {
            zone_name: 'head',
            health: 300,
            constitution: 300,
            armor: 2,
            affected_by_explosions: true,
            affects_main_health: 1,
            main_health_affect_capped_by_zone_health: false,
            projectile_durable_resistance: 0.5,
            bleedout_enabled: true,
            causes_death_on_death: 1
          }
        ]
      },
      'content/fac_cyborgs/synthetic/synthetic_panel': {
        loc_name: 'Synthetic Panel',
        health: 2400,
        constitution: 0,
        constitution_changerate: 0,
        zone_bleedout_changerate: 0,
        default_damageable_zone_info: {
          zone_name: 'core',
          health: -1,
          constitution: 0,
          armor: 3,
          affected_by_explosions: false,
          affects_main_health: 1,
          main_health_affect_capped_by_zone_health: true,
          projectile_durable_resistance: 1
        },
        damageable_zones: [
          {
            zone_name: 'panel',
            health: 1200,
            constitution: 1200,
            armor: 3,
            affected_by_explosions: true,
            affects_main_health: 1,
            main_health_affect_capped_by_zone_health: false,
            projectile_durable_resistance: 1,
            bleedout_enabled: false,
            causes_death_on_death: 1
          }
        ]
      }
    };

    writeFileSync(inputPath, JSON.stringify(fixture, null, 2));

    const result = spawnSync(PYTHON, [PARSER_PATH, '--input', inputPath, '--output', outputPath], {
      encoding: 'utf8'
    });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);

    const parsed = JSON.parse(readFileSync(outputPath, 'utf8'));
    const walker = parsed.Automaton['Synthetic Walker'];
    const panelUnit = parsed.Automaton['Synthetic Panel'];
    assert.ok(walker);
    assert.ok(panelUnit);

    const head = walker.damageable_zones.find((zone) => zone.zone_name === 'head');
    const main = walker.damageable_zones.find((zone) => zone.zone_name === 'Main');
    const panel = panelUnit.damageable_zones.find((zone) => zone.zone_name === 'panel');
    assert.ok(panel);
    assert.ok(head);
    assert.ok(main);

    assert.equal(head.Con, 300);
    assert.equal(head.ConRate, 40);
    assert.ok(!('ConNoBleed' in head));
    assert.equal(main.Con, 150);
    assert.equal(main.ConRate, 5);
    assert.ok(!('ConNoBleed' in main));
    assert.equal(panel.Con, 1200);
    assert.equal(panel.ConRate, 0);
    assert.equal(panel.ConNoBleed, true);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
