import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const PYTHON = process.platform === 'win32' ? 'python' : 'python3';
const DIFF_PATH = fileURLToPath(new URL('../tools/diff_enemydata_options.py', import.meta.url));
const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const SCRATCH_ROOT = join(REPO_ROOT, 'tests', '.scratch');

function createScratchDir(prefix) {
  const dir = join(SCRATCH_ROOT, `${prefix}-${randomUUID()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function runDiff(leftFixture, rightFixture) {
  const tempDir = createScratchDir('diff-enemydata-options');
  const leftPath = join(tempDir, 'left.json');
  const rightPath = join(tempDir, 'right.json');
  const reportPath = join(tempDir, 'report.json');

  try {
    writeFileSync(leftPath, JSON.stringify(leftFixture, null, 2));
    writeFileSync(rightPath, JSON.stringify(rightFixture, null, 2));

    const result = spawnSync(PYTHON, [
      DIFF_PATH,
      '--left',
      leftPath,
      '--right',
      rightPath,
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

test('diff_enemydata_options normalizes grouped zones and compares child sidecars recursively', () => {
  const pilotProfile = {
    health: 125,
    damageable_zones: [
      {
        zone_name: 'Main',
        health: 125,
        AV: 0,
        'Dur%': 0,
        ExTarget: 'Main'
      }
    ]
  };

  const leftFixture = {
    Automaton: {
      Trooper: {
        health: 125,
        damageable_zones: [
          {
            zone_name: 'Main',
            health: 125,
            AV: 0,
            'Dur%': 0,
            ExTarget: 'Main',
            'ToMain%': 1,
            MainCap: 1
          },
          {
            zone_name: 'left_arm',
            health: 65,
            AV: 0,
            'Dur%': 0,
            ExTarget: 'Main',
            'ToMain%': 0.5,
            MainCap: 0
          },
          {
            zone_name: 'right_arm',
            health: 65,
            AV: 0,
            'Dur%': 0,
            ExTarget: 'Main',
            'ToMain%': 0.5,
            MainCap: 0
          }
        ]
      },
      'Scout Strider': {
        health: 500,
        damageable_zones: [
          {
            zone_name: 'Main',
            health: 500,
            AV: 4,
            'Dur%': 0,
            ExTarget: 'Main'
          }
        ],
        inline_enemies: {
          Pilot: pilotProfile
        }
      }
    }
  };

  const rightFixture = {
    Automaton: {
      Trooper: {
        health: 125,
        damageable_zones: [
          {
            zone_name: 'Main',
            source_zone_name: 'main',
            health: 125,
            Con: 0,
            AV: 0,
            'Dur%': 0,
            on_death: 'Fatal',
            IsFatal: true,
            ExTarget: 'Main',
            ExMult: 1
          },
          {
            zone_name: 'arms',
            source_zone_name: 'arms (2)',
            source_zone_count: 2,
            health: 65,
            Con: 0,
            AV: 0,
            'Dur%': 0,
            'ToMain%': 0.5,
            MainCap: false,
            ExTarget: 'Main',
            ExMult: 1
          }
        ],
        status_effects: {
          fire: {
            label: 'fire',
            minimum: 2,
            maximum: 3,
            damage_multiplier: 0.5
          }
        },
        default_stats: {
          unit_mass: {
            label: 'Unit mass',
            value: 70
          }
        },
        child_profiles: {
          'Jump Pack': {
            health: 50,
            damageable_zones: [
              {
                zone_name: 'Main',
                health: 50,
                AV: 2,
                'Dur%': 0,
                ExTarget: 'Main'
              }
            ]
          }
        }
      },
      'Scout Strider': {
        health: 500,
        damageable_zones: [
          {
            zone_name: 'Main',
            source_zone_name: 'main',
            health: 500,
            AV: 4,
            'Dur%': 0,
            ExTarget: 'Main',
            ExMult: 1
          }
        ],
        child_profiles: {
          Pilot: {
            health: 125,
            damageable_zones: [
              {
                zone_name: 'Main',
                source_zone_name: 'main',
                health: 125,
                Con: 0,
                AV: 0,
                'Dur%': 0,
                ExTarget: 'Main',
                ExMult: 1
              }
            ]
          }
        }
      },
      'Jet Brigade Trooper': {
        health: 150,
        damageable_zones: [
          {
            zone_name: 'Main',
            health: 150,
            AV: 1,
            'Dur%': 0,
            ExTarget: 'Main'
          }
        ]
      }
    }
  };

  const report = runDiff(leftFixture, rightFixture);

  assert.equal(report.summary.left_top_level_unit_count, 2);
  assert.equal(report.summary.right_top_level_unit_count, 3);
  assert.equal(report.summary.overlapping_top_level_unit_count, 2);
  assert.equal(report.summary.left_only_top_level_unit_count, 0);
  assert.equal(report.summary.right_only_top_level_unit_count, 1);
  assert.equal(report.summary.changed_top_level_unit_count, 1);

  const automaton = report.factions.Automaton;
  assert.deepEqual(automaton.right_only_units, ['Jet Brigade Trooper']);
  assert.equal(automaton.changed_units['Scout Strider'], undefined);

  const trooperDiff = automaton.changed_units.Trooper;
  assert.ok(trooperDiff);
  assert.deepEqual(
    trooperDiff.zone_changes.renamed_zone_groups[0].left_zone_names,
    ['left_arm', 'right_arm']
  );
  assert.deepEqual(
    trooperDiff.zone_changes.renamed_zone_groups[0].right_zone_names,
    ['arms (2)']
  );
  assert.deepEqual(trooperDiff.status_effect_changes.right_only, ['fire']);
  assert.deepEqual(trooperDiff.default_stat_changes.right_only, ['unit_mass']);
  assert.deepEqual(trooperDiff.child_profile_changes.right_only_profiles, ['Jump Pack']);
}
);

test('diff_enemydata_options reports field-level metadata, status, default-stat, and nested profile changes', () => {
  const leftFixture = {
    Illuminate: {
      Watcher: {
        health: 600,
        description: 'Older note',
        default_stats: {
          unit_mass: {
            label: 'Unit mass',
            value: 100,
            react_event: 'Light'
          }
        },
        damageable_zones: [
          {
            zone_name: 'Main',
            health: 600,
            AV: 0,
            'Dur%': 0,
            ExTarget: 'Main'
          }
        ],
        status_effects: {
          fire: {
            label: 'Fire',
            minimum: 1,
            maximum: 2
          },
          gas: {
            label: 'Gas',
            minimum: 0.5
          }
        },
        child_profiles: {
          Shield: {
            health: 200,
            damageable_zones: [
              {
                zone_name: 'Main',
                health: 200,
                AV: 5,
                'Dur%': 0,
                ExTarget: 'Main'
              }
            ]
          }
        }
      }
    }
  };

  const rightFixture = {
    Illuminate: {
      Watcher: {
        health: 600,
        description: 'Curated note',
        default_stats: {
          unit_mass: {
            label: 'Unit mass',
            value: 150,
            react_event: 'Light'
          }
        },
        damageable_zones: [
          {
            zone_name: 'Main',
            source_zone_name: 'main',
            health: 600,
            AV: 0,
            'Dur%': 0,
            ExTarget: 'Main',
            ExMult: 1
          }
        ],
        status_effects: {
          fire: {
            label: 'Fire',
            minimum: 1,
            maximum: 3
          },
          gas: {
            label: 'Gas',
            minimum: 0.5
          },
          thermite: {
            label: 'Thermite',
            minimum: 0.5,
            maximum: 1
          }
        },
        child_profiles: {
          Shield: {
            health: 250,
            damageable_zones: [
              {
                zone_name: 'Main',
                source_zone_name: 'main',
                health: 250,
                AV: 5,
                'Dur%': 0,
                ExTarget: 'Main',
                ExMult: 1
              }
            ]
          }
        }
      }
    }
  };

  const report = runDiff(leftFixture, rightFixture);
  const watcherDiff = report.factions.Illuminate.changed_units.Watcher;

  assert.ok(watcherDiff);
  assert.deepEqual(watcherDiff.metadata_field_changes.description, {
    left: 'Older note',
    right: 'Curated note'
  });
  assert.deepEqual(watcherDiff.default_stat_changes.changed.unit_mass.value, {
    left: 100,
    right: 150
  });
  assert.deepEqual(watcherDiff.status_effect_changes.changed.fire.maximum, {
    left: 2,
    right: 3
  });
  assert.deepEqual(watcherDiff.status_effect_changes.right_only, ['thermite']);

  const shieldDiff = watcherDiff.child_profile_changes.changed_profiles.Shield;
  assert.ok(shieldDiff);
  assert.deepEqual(shieldDiff.metadata_field_changes.health, {
    left: 200,
    right: 250
  });
}
);
