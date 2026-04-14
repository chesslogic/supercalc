import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const PYTHON = process.platform === 'win32' ? 'python' : 'python3';
const FLATTEN_PATH = fileURLToPath(new URL('../tools/flatten_entity_component_settings.py', import.meta.url));
const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const SCRATCH_ROOT = join(REPO_ROOT, 'tests', '.scratch');

function createScratchDir(prefix) {
  const dir = join(SCRATCH_ROOT, `${prefix}-${randomUUID()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

test('flatten_entity_component_settings can emit a status-audit sidecar for status-like raw fields', () => {
  const tempDir = createScratchDir('flatten-entity-component-settings');
  const inputPath = join(tempDir, 'input.json');
  const outputPath = join(tempDir, 'flattened.json');
  const auditPath = join(tempDir, 'status-audit.json');

  try {
    const fixture = {
      'content/fac_bugs/test/incendiary_bug': {
        components: {
          EncyclopediaEntryComponentData: {
            loc_name: 'Incendiary Bug'
          },
          HealthComponentData: {
            health: 150,
            constitution: 25,
            constitution_changerate: -1,
            constitution_disables_interactions: false,
            decay: 0.1,
            default_damageable_zone_info: {
              zone_name: 'main',
              health: 150
            },
            damageable_zones: [],
            zone_bleedout_changerate: 0
          },
          StatusReceiverComponentData: {
            fire_threshold: 12,
            status_effects: {
              fire_damage_multiplier: 1.7,
              max_stacks: 3
            },
            gas_threshold: null
          },
          StatusEffectReceiverComponentData: 'Not implemented yet',
          CrowdControlComponentData: {
            control_profile: {
              stun_threshold: 2,
              decay_rate: 0.1
            }
          }
        }
      },
      'content/fac_bugs/test/plain_bug': {
        components: {
          EncyclopediaEntryComponentData: {
            loc_name: 'Plain Bug'
          },
          HealthComponentData: {
            health: 80,
            constitution: 0,
            constitution_changerate: 0,
            constitution_disables_interactions: false,
            decay: null,
            default_damageable_zone_info: {
              zone_name: 'main',
              health: 80
            },
            damageable_zones: [],
            zone_bleedout_changerate: 0
          },
          MovementComponentData: {
            move_speed: 3
          }
        }
      }
    };

    writeFileSync(inputPath, JSON.stringify(fixture, null, 2));

    const result = spawnSync(PYTHON, [
      FLATTEN_PATH,
      '--input',
      inputPath,
      '--output',
      outputPath,
      '--status-audit-output',
      auditPath
    ], {
      cwd: REPO_ROOT,
      encoding: 'utf8'
    });

    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /Wrote .*flattened\.json with 2 flattened entries\./);
    assert.match(result.stdout, /Wrote .*status-audit\.json with 1 status-audit entries\./);

    const flattened = JSON.parse(readFileSync(outputPath, 'utf8'));
    assert.equal(flattened['content/fac_bugs/test/incendiary_bug'].loc_name, 'Incendiary Bug');
    assert.equal(flattened['content/fac_bugs/test/incendiary_bug'].decay, 0.1);

    const audit = JSON.parse(readFileSync(auditPath, 'utf8'));
    const incendiaryBug = audit['content/fac_bugs/test/incendiary_bug'];
    assert.ok(incendiaryBug);
    assert.equal(incendiaryBug.loc_name, 'Incendiary Bug');
    assert.equal(incendiaryBug.raw_entity_key, 'content/fac_bugs/test/incendiary_bug');
    assert.equal(audit['content/fac_bugs/test/plain_bug'], undefined);

    const paths = incendiaryBug.matches.map((entry) => entry.path).sort();
    assert.deepEqual(paths, [
      'CrowdControlComponentData.control_profile.decay_rate',
      'CrowdControlComponentData.control_profile.stun_threshold',
      'HealthComponentData.decay',
      'StatusEffectReceiverComponentData',
      'StatusReceiverComponentData.fire_threshold',
      'StatusReceiverComponentData.status_effects'
    ]);

    const statusEffects = incendiaryBug.matches.find((entry) =>
      entry.path === 'StatusReceiverComponentData.status_effects'
    );
    assert.deepEqual(statusEffects?.value, {
      fire_damage_multiplier: 1.7,
      max_stacks: 3
    });
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
