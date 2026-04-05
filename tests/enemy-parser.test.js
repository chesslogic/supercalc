import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const PYTHON = process.platform === 'win32' ? 'python' : 'python3';
const PARSER_PATH = fileURLToPath(new URL('../tools/parser_faction_units.py', import.meta.url));
const ENEMYDATA_PATH = fileURLToPath(new URL('../enemies/enemydata.json', import.meta.url));
const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const PARSE_ENEMY_UNITS_SCRIPT = `
import json
import sys

from tools.parser_faction_units import parse_enemy_units

src = json.load(sys.stdin)
parsed, _ = parse_enemy_units(src)
json.dump(parsed, sys.stdout)
`;

function parseEnemyUnitsFixture(fixture) {
  const result = spawnSync(PYTHON, ['-c', PARSE_ENEMY_UNITS_SCRIPT], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    input: JSON.stringify(fixture)
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  return JSON.parse(result.stdout);
}

function buildRawZone(zone) {
  const rawZoneName = Object.hasOwn(zone, 'raw_zone_name') ? zone.raw_zone_name : zone.zone_name;
  const raw = {
    zone_name: rawZoneName,
    health: zone.health,
    armor: zone.AV,
    affected_by_explosions: zone.ExTarget === 'Part',
    affects_main_health: zone['ToMain%'],
    main_health_affect_capped_by_zone_health: Boolean(zone.MainCap),
    projectile_durable_resistance: zone['Dur%']
  };

  if ('ExMult' in zone) {
    raw.explosive_damage_percentage = zone.ExMult;
  }
  if (zone.IsFatal) {
    raw.causes_death_on_death = 1;
  }

  return raw;
}

function buildFixtureUnit(locName, zones) {
  const [mainZone, ...rawZones] = zones;
  return {
    loc_name: locName,
    health: mainZone.health,
    constitution: 0,
    constitution_changerate: 0,
    zone_bleedout_changerate: 0,
    default_damageable_zone_info: buildRawZone({
      ...mainZone,
      zone_name: 'main',
      raw_zone_name: Object.hasOwn(mainZone, 'raw_zone_name') ? mainZone.raw_zone_name : 'main'
    }),
    damageable_zones: rawZones.map(buildRawZone)
  };
}

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

test('parser emits scope tags and selector visibility metadata for curated units', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'supercalc-enemy-parser-'));
  const inputPath = join(tempDir, 'input.json');
  const outputPath = join(tempDir, 'output.json');

  const buildFixtureUnit = (locName, health) => ({
    loc_name: locName,
    health,
    constitution: 0,
    constitution_changerate: 0,
    zone_bleedout_changerate: 0,
    default_damageable_zone_info: {
      zone_name: 'main',
      health: -1,
      constitution: 0,
      armor: 0,
      affected_by_explosions: false,
      affects_main_health: 1,
      main_health_affect_capped_by_zone_health: true,
      projectile_durable_resistance: 0
    },
    damageable_zones: [
      {
        zone_name: 'body',
        health: 400,
        constitution: 0,
        armor: 0,
        affected_by_explosions: true,
        affects_main_health: 1,
        main_health_affect_capped_by_zone_health: true,
        projectile_durable_resistance: 0,
        causes_death_on_death: 1
      }
    ]
  });

  try {
    const fixture = {
      'content/fac_bugs/chaff/bile_spitter': buildFixtureUnit('Bile Spitter', 60),
      'content/fac_bugs/medium/warrior': buildFixtureUnit('Warrior', 325),
      'content/fac_bugs/elite/stalker': buildFixtureUnit('Stalker', 800),
      'content/fac_bugs/tanks/charger': buildFixtureUnit('Charger', 2400),
      'content/fac_bugs/giants/dragonroach': buildFixtureUnit('Dragonroach', 6500),
      'content/fac_cyborgs/objectives/ballistic_missile': buildFixtureUnit('Ballistic Missile', 2100),
      'content/fac_illuminate/defense/lightning_spire': buildFixtureUnit('Lightning Spire', 500),
      'content/fac_illuminate/units/obtruder': buildFixtureUnit('Obtruder', 400),
      'content/fac_illuminate/giants/leviathan': buildFixtureUnit('Leviathan', 15000),
      'content/fac_illuminate/units/xenobite_ardent': buildFixtureUnit('Xenobite Ardent', 800)
    };

    writeFileSync(inputPath, JSON.stringify(fixture, null, 2));

    const result = spawnSync(PYTHON, [PARSER_PATH, '--input', inputPath, '--output', outputPath], {
      encoding: 'utf8'
    });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);

    const parsed = JSON.parse(readFileSync(outputPath, 'utf8'));
    assert.deepEqual(parsed.Terminid['Bile Spitter'].scope_tags, ['chaff']);
    assert.deepEqual(parsed.Terminid.Warrior.scope_tags, ['medium']);
    assert.deepEqual(parsed.Terminid.Stalker.scope_tags, ['elite']);
    assert.deepEqual(parsed.Terminid.Charger.scope_tags, ['tank']);
    assert.deepEqual(parsed.Terminid.Dragonroach.scope_tags, ['giant']);
    assert.deepEqual(parsed.Automaton['Ballistic Missile'].scope_tags, ['objective']);
    assert.deepEqual(parsed.Illuminate['Lightning Spire'].scope_tags, ['structure']);
    assert.deepEqual(parsed.Illuminate.Obtruder.scope_tags, ['chaff']);
    assert.deepEqual(parsed.Illuminate.Leviathan.scope_tags, ['giant']);
    assert.deepEqual(parsed.Illuminate['Xenobite Ardent'].scope_tags, ['tank']);
    assert.equal(parsed.Illuminate['Xenobite Ardent'].show_in_selector, false);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('parser prefers the unsuffixed base payload and reports differing same-name variants', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'supercalc-enemy-parser-'));
  const inputPath = join(tempDir, 'input.json');
  const outputPath = join(tempDir, 'output.json');
  const reportPath = join(tempDir, 'variants.json');

  try {
    const fixture = {
      'content/fac_cyborgs/cha_variant/cha_variant': {
        loc_name: 'Synthetic Variant',
        health: 750,
        constitution: 0,
        constitution_changerate: 0,
        zone_bleedout_changerate: 0,
        default_damageable_zone_info: {
          zone_name: 'main',
          health: -1,
          constitution: 0,
          armor: 0,
          affected_by_explosions: false,
          affects_main_health: 1,
          main_health_affect_capped_by_zone_health: true,
          projectile_durable_resistance: 0
        },
        damageable_zones: [
          {
            zone_name: 'head',
            health: 110,
            constitution: 0,
            armor: 1,
            affected_by_explosions: false,
            affects_main_health: 1,
            main_health_affect_capped_by_zone_health: true,
            projectile_durable_resistance: 0,
            causes_death_on_death: 1
          },
          {
            zone_name: 'arm',
            health: 260,
            constitution: 0,
            armor: 1,
            affected_by_explosions: false,
            affects_main_health: 0.5,
            main_health_affect_capped_by_zone_health: true,
            projectile_durable_resistance: 0
          }
        ]
      },
      'content/fac_cyborgs/cha_variant/cha_variant_iron_fleet': {
        loc_name: 'Synthetic Variant',
        health: 1000,
        constitution: 0,
        constitution_changerate: 0,
        zone_bleedout_changerate: 0,
        default_damageable_zone_info: {
          zone_name: 'main',
          health: -1,
          constitution: 0,
          armor: 0,
          affected_by_explosions: false,
          affects_main_health: 1,
          main_health_affect_capped_by_zone_health: true,
          projectile_durable_resistance: 0
        },
        damageable_zones: [
          {
            zone_name: 'head',
            health: 150,
            constitution: 0,
            armor: 1,
            affected_by_explosions: false,
            affects_main_health: 1,
            main_health_affect_capped_by_zone_health: true,
            projectile_durable_resistance: 0,
            causes_death_on_death: 1
          },
          {
            zone_name: 'arm',
            health: 300,
            constitution: 0,
            armor: 0,
            affected_by_explosions: true,
            affects_main_health: 0.3,
            main_health_affect_capped_by_zone_health: true,
            projectile_durable_resistance: 0
          }
        ]
      }
    };

    writeFileSync(inputPath, JSON.stringify(fixture, null, 2));

    const result = spawnSync(
      PYTHON,
      [PARSER_PATH, '--input', inputPath, '--output', outputPath, '--variant-report', reportPath],
      { encoding: 'utf8' }
    );
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);

    const parsed = JSON.parse(readFileSync(outputPath, 'utf8'));
    const report = JSON.parse(readFileSync(reportPath, 'utf8'));
    const unit = parsed.Automaton['Synthetic Variant'];
    assert.ok(unit);

    const head = unit.damageable_zones.find((zone) => zone.zone_name === 'head');
    const arm = unit.damageable_zones.find((zone) => zone.zone_name === 'arm');
    assert.ok(head);
    assert.ok(arm);
    assert.equal(unit.health, 750);
    assert.equal(head.health, 110);
    assert.equal(arm.health, 260);
    assert.equal(arm.AV, 1);
    assert.equal(arm['ToMain%'], 0.5);

    const variantGroup = report.Automaton['Synthetic Variant'];
    assert.ok(variantGroup);
    assert.equal(variantGroup.canonical.source_key, 'content/fac_cyborgs/cha_variant/cha_variant');
    assert.equal(variantGroup.canonical.health, 750);
    assert.equal(variantGroup.canonical.unsuffixed_source_path, true);
    assert.equal(variantGroup.variants.length, 1);
    assert.deepEqual(variantGroup.variants[0].source_keys, [
      'content/fac_cyborgs/cha_variant/cha_variant_iron_fleet'
    ]);
    assert.equal(variantGroup.variants[0].representative.health, 1000);
    assert.equal(variantGroup.variants[0].representative.unsuffixed_source_path, false);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('parser applies curated Agitator, Radical, Veracitor, and Impaler part-name overrides via signature fallback', () => {
  const agitatorZones = [
    { zone_name: 'Main', AV: 1, 'Dur%': 0.2, ExTarget: 'Part', MainCap: 0, 'ToMain%': 1, health: 750 },
    { zone_name: '[unknown]', AV: 2, 'Dur%': 0, ExTarget: 'Main', MainCap: 1, 'ToMain%': 0.75, health: 300 },
    { zone_name: '[unknown]', AV: 1, 'Dur%': 0, ExMult: 0.45, ExTarget: 'Part', MainCap: 1, 'ToMain%': 0.8, health: 300 },
    { zone_name: '[unknown]', AV: 1, 'Dur%': 0, ExMult: 0.45, ExTarget: 'Part', MainCap: 1, 'ToMain%': 0.8, health: 300 },
    { zone_name: '[unknown]', AV: 2, 'Dur%': 0, ExTarget: 'Main', MainCap: 1, 'ToMain%': 0.75, health: 300 },
    { zone_name: '[unknown]', AV: 1, 'Dur%': 0, ExTarget: 'Main', IsFatal: true, MainCap: 1, 'ToMain%': 1, health: 150 },
    { zone_name: '[unknown]', AV: 2, 'Dur%': 0, ExTarget: 'Main', IsFatal: true, MainCap: 0, 'ToMain%': 0.75, health: 1400 },
    { zone_name: '[unknown]', AV: 2, 'Dur%': 0, ExTarget: 'Main', IsFatal: true, MainCap: 0, 'ToMain%': 0.75, health: 1400 },
    { zone_name: 'pelvis', AV: 2, 'Dur%': 0, ExTarget: 'Main', IsFatal: true, MainCap: 0, 'ToMain%': 1, health: 1400 },
    { zone_name: '[unknown]', AV: 2, 'Dur%': 0, ExTarget: 'Main', IsFatal: true, MainCap: 0, 'ToMain%': 1, health: 1200 },
    { zone_name: '[unknown]', AV: 2, 'Dur%': 0, ExMult: 0.35, ExTarget: 'Part', MainCap: 0, 'ToMain%': 0.3, health: 300 },
    { zone_name: '[unknown]', AV: 2, 'Dur%': 0, ExMult: 0.35, ExTarget: 'Part', MainCap: 0, 'ToMain%': 0.3, health: 200 },
    { zone_name: '[unknown]', AV: 2, 'Dur%': 0, ExMult: 0.35, ExTarget: 'Part', MainCap: 0, 'ToMain%': 0.3, health: 200 },
    { zone_name: '[unknown]', AV: 2, 'Dur%': 0, ExMult: 0.35, ExTarget: 'Part', MainCap: 0, 'ToMain%': 0.3, health: 200 }
  ];
  const veracitorZones = [
    { zone_name: 'Main', AV: 3, 'Dur%': 1, ExTarget: 'Main', MainCap: 1, 'ToMain%': 1, health: 3000 },
    { zone_name: 'pilot_seat', AV: 3, 'Dur%': 0.5, ExTarget: 'Main', IsFatal: true, MainCap: 1, 'ToMain%': 1, health: 1600 },
    { zone_name: '0x7c69c9f9', AV: 1, 'Dur%': 0.5, ExTarget: 'Main', IsFatal: true, MainCap: 1, 'ToMain%': 1, health: 800 },
    { zone_name: '0x6c40f976', AV: 3, 'Dur%': 0.5, ExTarget: 'Main', IsFatal: true, MainCap: 0, 'ToMain%': 0.75, health: 1600 },
    { zone_name: '0x73757f26', AV: 3, 'Dur%': 0, ExTarget: 'Main', MainCap: 0, 'ToMain%': 0, health: 300 },
    { zone_name: '0x2119e2ef', AV: 3, 'Dur%': 0.5, ExTarget: 'Main', MainCap: 0, 'ToMain%': 0.5, health: 400 },
    { zone_name: '0x533fbac2', AV: 3, 'Dur%': 0.5, ExTarget: 'Main', MainCap: 0, 'ToMain%': 0.5, health: 400 },
    { zone_name: '0xba20d30a', AV: 1, 'Dur%': 0.5, ExTarget: 'Main', IsFatal: true, MainCap: 0, 'ToMain%': 1, health: 600 },
    { zone_name: '0xe073cc3f', AV: 1, 'Dur%': 0.5, ExTarget: 'Main', IsFatal: true, MainCap: 0, 'ToMain%': 1, health: 600 },
    { zone_name: '0x23128279', AV: 2, 'Dur%': 0, ExTarget: 'Main', IsFatal: true, MainCap: 1, 'ToMain%': 0, health: 700 },
    { zone_name: '0x19c4c9a6', AV: 2, 'Dur%': 0.5, ExTarget: 'Main', MainCap: 0, 'ToMain%': 0.75, health: 800 },
    { zone_name: 'left_arm', AV: 2, 'Dur%': 0.5, ExTarget: 'Main', MainCap: 0, 'ToMain%': 0.75, health: 800 },
    { zone_name: '0x718ce684', AV: 1, 'Dur%': 0, ExTarget: 'Main', MainCap: 1, 'ToMain%': 0, health: 800 },
    { zone_name: '0x15b7e16d', AV: 3, 'Dur%': 0.5, ExTarget: 'Main', MainCap: 1, 'ToMain%': 0, health: 800 },
    { zone_name: '0x6e41f493', AV: 2, 'Dur%': 0.5, ExTarget: 'Main', MainCap: 0, 'ToMain%': 0.75, health: 800 },
    { zone_name: 'right_arm', AV: 2, 'Dur%': 0.5, ExTarget: 'Main', MainCap: 0, 'ToMain%': 0.75, health: 800 },
    { zone_name: '0x61dcc7a6', AV: 1, 'Dur%': 0, ExTarget: 'Main', MainCap: 1, 'ToMain%': 0, health: 800 },
    { zone_name: '0x20c2028d', AV: 3, 'Dur%': 0.5, ExTarget: 'Main', MainCap: 1, 'ToMain%': 0, health: 800 },
    { zone_name: 'left_hip', AV: 2, 'Dur%': 0.5, ExTarget: 'Main', IsFatal: true, MainCap: 0, 'ToMain%': 0.75, health: 1600 },
    { zone_name: '0x93c0058d', AV: 2, 'Dur%': 0.5, ExTarget: 'Main', IsFatal: true, MainCap: 0, 'ToMain%': 0.75, health: 1600 },
    { zone_name: 'left_leg', AV: 3, 'Dur%': 0.5, ExTarget: 'Main', IsFatal: true, MainCap: 0, 'ToMain%': 0.75, health: 1600 },
    { zone_name: 'right_hip', AV: 2, 'Dur%': 0.5, ExTarget: 'Main', IsFatal: true, MainCap: 0, 'ToMain%': 0.75, health: 1600 },
    { zone_name: '0x56eb4767', AV: 2, 'Dur%': 0.5, ExTarget: 'Main', IsFatal: true, MainCap: 0, 'ToMain%': 0.75, health: 1600 },
    { zone_name: 'right_leg', AV: 3, 'Dur%': 0.5, ExTarget: 'Main', IsFatal: true, MainCap: 0, 'ToMain%': 0.75, health: 1600 },
    { zone_name: '0xb709fe1c', AV: 3, 'Dur%': 0.5, ExTarget: 'Main', IsFatal: true, MainCap: 0, 'ToMain%': 0.75, health: 1600 },
    { zone_name: '0xb709fe1c', AV: 3, 'Dur%': 0.5, ExTarget: 'Main', IsFatal: true, MainCap: 0, 'ToMain%': 0.75, health: 1600 },
    { zone_name: 'shield', AV: 2, 'Dur%': 0, ExTarget: 'Main', MainCap: 1, 'ToMain%': 0, health: 1300 }
  ];
  const impalerZones = [
    { zone_name: 'Main', AV: 4, 'Dur%': 1, ExTarget: 'Main', MainCap: 1, 'ToMain%': 1, health: 4000 },
    { zone_name: 'l_tentacle', AV: 1, 'Dur%': 0.7, ExTarget: 'Part', MainCap: 0, 'ToMain%': 0.5, health: 500 },
    { zone_name: 'm_tentacle', AV: 1, 'Dur%': 0.7, ExTarget: 'Part', MainCap: 0, 'ToMain%': 0.5, health: 500 },
    { zone_name: 'r_tentacle', AV: 1, 'Dur%': 0.7, ExTarget: 'Part', MainCap: 0, 'ToMain%': 0.5, health: 500 },
    { zone_name: 'l_front_armor_claw', AV: 4, 'Dur%': 0.75, ExTarget: 'Part', MainCap: 1, 'ToMain%': 1, health: -1 },
    { zone_name: '[unknown]', AV: 4, 'Dur%': 0.75, ExTarget: 'Part', MainCap: 1, 'ToMain%': 1, health: -1 },
    { zone_name: '[unknown]', AV: 4, 'Dur%': 0.75, ExTarget: 'Part', MainCap: 1, 'ToMain%': 1, health: -1 }
  ];

  const fixture = {
    'content/fac_cyborgs/agitator/agitator': buildFixtureUnit('Agitator', agitatorZones),
    'content/fac_cyborgs/radical/radical': buildFixtureUnit('Radical', agitatorZones),
    'content/fac_illuminate/veracitor/veracitor': buildFixtureUnit('Veracitor', veracitorZones),
    'content/fac_bugs/impaler/impaler': buildFixtureUnit('Impaler', impalerZones)
  };

  const parsed = parseEnemyUnitsFixture(fixture);
  const agitatorNames = parsed.Automaton.Agitator.damageable_zones.map((zone) => zone.zone_name);

  assert.deepEqual(
    agitatorNames,
    [
      'Main',
      'left_forearm',
      'left_upper_arm',
      'right_upper_arm',
      'right_forearm',
      'head',
      'left_leg',
      'right_leg',
      'pelvis',
      'torso',
      'torso_armor',
      'helmet',
      'left_pauldron',
      'right_pauldron'
    ]
  );
  assert.deepEqual(parsed.Automaton.Radical.damageable_zones.map((zone) => zone.zone_name), agitatorNames);
  assert.deepEqual(
    parsed.Illuminate.Veracitor.damageable_zones.map((zone) => zone.zone_name),
    [
      'Main',
      'cockpit',
      'cockpit_weakspot',
      'chassis',
      'head',
      'left_carapace',
      'right_carapace',
      'left_internals',
      'right_internals',
      'pilot',
      'left_shoulder',
      'left_upper_arm',
      'left_arm_weakspot',
      'left_forearm',
      'right_shoulder',
      'right_upper_arm',
      'right_arm_weakspot',
      'right_forearm',
      'left_hip',
      'left_upper_leg',
      'left_lower_leg',
      'right_hip',
      'right_upper_leg',
      'right_lower_leg',
      'rear_hip',
      'rear_leg',
      'shield'
    ]
  );
  assert.deepEqual(
    parsed.Terminid.Impaler.damageable_zones.map((zone) => zone.zone_name),
    [
      'Main',
      'l_tentacle',
      'm_tentacle',
      'r_tentacle',
      'l_tentacle_armor',
      'm_tentacle_armor',
      'r_tentacle_armor'
    ]
  );
  assert.ok(parsed.Terminid.Impaler.damageable_zones.every((zone) => !Object.keys(zone).some((key) => key.startsWith('_'))));
});

test('parser prefers raw zone-name anchors when curated stats drift', () => {
  const fixture = {
    'content/fac_bugs/impaler/impaler': buildFixtureUnit('Impaler', [
      { zone_name: 'Main', AV: 4, 'Dur%': 1, ExTarget: 'Main', MainCap: 1, 'ToMain%': 1, health: 4000 },
      { zone_name: 'l_tentacle', raw_zone_name: 'l_tentacle', AV: 1, 'Dur%': 0.7, ExTarget: 'Part', MainCap: 0, 'ToMain%': 0.5, health: 500 },
      { zone_name: 'm_tentacle', raw_zone_name: 'm_tentacle', AV: 1, 'Dur%': 0.7, ExTarget: 'Part', MainCap: 0, 'ToMain%': 0.5, health: 500 },
      { zone_name: 'r_tentacle', raw_zone_name: 'r_tentacle', AV: 1, 'Dur%': 0.7, ExTarget: 'Part', MainCap: 0, 'ToMain%': 0.5, health: 500 },
      { zone_name: '[unknown]', raw_zone_name: '0xf7938517', AV: 4, 'Dur%': 0.8, ExTarget: 'Part', MainCap: 1, 'ToMain%': 0.9, health: -1 },
      { zone_name: '[unknown]', raw_zone_name: '0x3d0088eb', AV: 4, 'Dur%': 0.8, ExTarget: 'Part', MainCap: 1, 'ToMain%': 0.9, health: -1 },
      { zone_name: '[unknown]', raw_zone_name: '0x3d0088eb', AV: 4, 'Dur%': 0.8, ExTarget: 'Part', MainCap: 1, 'ToMain%': 0.9, health: -1 }
    ])
  };

  const parsed = parseEnemyUnitsFixture(fixture);

  assert.deepEqual(
    parsed.Terminid.Impaler.damageable_zones.map((zone) => zone.zone_name),
    [
      'Main',
      'l_tentacle',
      'm_tentacle',
      'r_tentacle',
      'l_tentacle_armor',
      'm_tentacle_armor',
      'r_tentacle_armor'
    ]
  );
  assert.ok(parsed.Terminid.Impaler.damageable_zones.every((zone) => !Object.keys(zone).some((key) => key.startsWith('_'))));
});

test('parser applies additional Gatekeeper, Gazer, Leviathan, Fleshmob, and Spore Charger overrides', () => {
  const fixture = {
    'content/fac_illuminate/gatekeeper/gatekeeper': buildFixtureUnit('Gatekeeper', [
      { zone_name: 'Main', AV: 4, 'Dur%': 1, ExTarget: 'Main', MainCap: 1, 'ToMain%': 1, health: 2500 },
      { zone_name: 'pilot_seat', AV: 4, 'Dur%': 0.8, ExMult: 0.5, ExTarget: 'Main', IsFatal: true, MainCap: 1, 'ToMain%': 0.75, health: 1200 },
      { zone_name: '0x7c69c9f9', AV: 1, 'Dur%': 0.8, ExTarget: 'Main', IsFatal: true, MainCap: 1, 'ToMain%': 1, health: 800 },
      { zone_name: '0x6c40f976', AV: 4, 'Dur%': 0.8, ExTarget: 'Main', IsFatal: true, MainCap: 0, 'ToMain%': 0.75, health: 1600 },
      { zone_name: '0x73757f26', AV: 4, 'Dur%': 0, ExTarget: 'Main', MainCap: 0, 'ToMain%': 0, health: 50 },
      { zone_name: '0x2119e2ef', AV: 4, 'Dur%': 0, ExTarget: 'Main', MainCap: 0, 'ToMain%': 0.2, health: 400 },
      { zone_name: '0x533fbac2', AV: 4, 'Dur%': 0, ExTarget: 'Main', MainCap: 0, 'ToMain%': 0.2, health: 400 },
      { zone_name: '0xba20d30a', AV: 2, 'Dur%': 0.5, ExTarget: 'Main', IsFatal: true, MainCap: 0, 'ToMain%': 1, health: 800 },
      { zone_name: '0x3477f0dc', AV: 2, 'Dur%': 0.5, ExTarget: 'Main', IsFatal: true, MainCap: 0, 'ToMain%': 1, health: 800 },
      { zone_name: '0x082351f2', AV: 1, 'Dur%': 0.8, ExTarget: 'Main', IsFatal: true, MainCap: 0, 'ToMain%': 1, health: 800 },
      { zone_name: '0x23128279', AV: 2, 'Dur%': 0.5, ExTarget: 'Main', IsFatal: true, MainCap: 1, 'ToMain%': 0, health: 700 },
      { zone_name: '0xa2d33d88', AV: 4, 'Dur%': 0, ExTarget: 'Main', MainCap: 0, 'ToMain%': 0.2, health: 200 },
      { zone_name: 'left_arm', AV: 3, 'Dur%': 0.5, ExTarget: 'Main', MainCap: 0, 'ToMain%': 1, health: 1600 },
      { zone_name: '0xf73f6af7', AV: 4, 'Dur%': 0, ExTarget: 'Main', MainCap: 0, 'ToMain%': 0.2, health: 200 },
      { zone_name: '0x0d324590', AV: 2, 'Dur%': 0, ExTarget: 'Main', MainCap: 1, 'ToMain%': 0, health: 800 },
      { zone_name: 'left_gun', AV: 4, 'Dur%': 0, ExTarget: 'Main', MainCap: 1, 'ToMain%': 0, health: 800 },
      { zone_name: '0x9581cfa6', AV: 4, 'Dur%': 0, ExTarget: 'Main', MainCap: 0, 'ToMain%': 0.2, health: 200 },
      { zone_name: 'right_arm', AV: 3, 'Dur%': 0.5, ExTarget: 'Main', MainCap: 0, 'ToMain%': 1, health: 1600 },
      { zone_name: '0x49807680', AV: 4, 'Dur%': 0, ExTarget: 'Main', MainCap: 0, 'ToMain%': 0.2, health: 200 },
      { zone_name: '0xd19627fc', AV: 2, 'Dur%': 0, ExTarget: 'Main', MainCap: 1, 'ToMain%': 0, health: 800 },
      { zone_name: 'right_gun', AV: 4, 'Dur%': 0, ExTarget: 'Main', MainCap: 1, 'ToMain%': 0, health: 800 },
      { zone_name: 'left_hip', AV: 3, 'Dur%': 0.5, ExTarget: 'Main', IsFatal: true, MainCap: 0, 'ToMain%': 1, health: 800 },
      { zone_name: 'left_leg', AV: 3, 'Dur%': 0.5, ExTarget: 'Main', IsFatal: true, MainCap: 0, 'ToMain%': 1, health: 800 },
      { zone_name: '0xdb9c1921', AV: 4, 'Dur%': 0, ExTarget: 'Main', MainCap: 0, 'ToMain%': 0.2, health: 200 },
      { zone_name: '0xba4db2cb', AV: 4, 'Dur%': 0, ExTarget: 'Main', MainCap: 0, 'ToMain%': 0.2, health: 200 },
      { zone_name: 'right_hip', AV: 3, 'Dur%': 0.5, ExTarget: 'Main', IsFatal: true, MainCap: 0, 'ToMain%': 1, health: 800 },
      { zone_name: 'right_leg', AV: 3, 'Dur%': 0.5, ExTarget: 'Main', IsFatal: true, MainCap: 0, 'ToMain%': 1, health: 800 },
      { zone_name: '0xcb1fee34', AV: 4, 'Dur%': 0, ExTarget: 'Main', MainCap: 0, 'ToMain%': 0.2, health: 200 },
      { zone_name: '0xd5d99116', AV: 4, 'Dur%': 0, ExTarget: 'Main', MainCap: 0, 'ToMain%': 0.2, health: 200 },
      { zone_name: 'back_hip', AV: 3, 'Dur%': 0.5, ExTarget: 'Main', IsFatal: true, MainCap: 0, 'ToMain%': 1, health: 800 },
      { zone_name: '0xb709fe1c', AV: 3, 'Dur%': 0.5, ExTarget: 'Main', IsFatal: true, MainCap: 0, 'ToMain%': 1, health: 800 },
      { zone_name: '0xe5fca454', AV: 4, 'Dur%': 0, ExTarget: 'Main', MainCap: 0, 'ToMain%': 0.2, health: 200 },
      { zone_name: '0x972f7b8f', AV: 4, 'Dur%': 0, ExTarget: 'Main', MainCap: 0, 'ToMain%': 0.2, health: 200 },
      { zone_name: 'shield', AV: 2, 'Dur%': 0, ExTarget: 'Main', MainCap: 1, 'ToMain%': 0, health: 1300 }
    ]),
    'content/fac_illuminate/gazer/gazer': buildFixtureUnit('Gazer', [
      { zone_name: 'Main', AV: 5, 'Dur%': 1, ExTarget: 'Main', MainCap: 1, 'ToMain%': 1, health: 900 },
      { zone_name: '0x6d417d28', AV: 1, 'Dur%': 0, ExTarget: 'Part', IsFatal: true, MainCap: 1, 'ToMain%': 1, health: 700 },
      { zone_name: '0xf3e71f7b', AV: 5, 'Dur%': 0, ExTarget: 'Main', IsFatal: true, MainCap: 1, 'ToMain%': 1, health: 900 },
      { zone_name: '0x01970f62', AV: 5, 'Dur%': 0, ExTarget: 'Part', IsFatal: true, MainCap: 1, 'ToMain%': 1, health: 900 }
    ]),
    'content/fac_illuminate/leviathan/leviathan': buildFixtureUnit('Leviathan', [
      { zone_name: 'Main', AV: 4, 'Dur%': 0, ExTarget: 'Main', MainCap: 1, 'ToMain%': 1, health: 15000 },
      { zone_name: '[unknown]', AV: 5, 'Dur%': 0, ExMult: 0.65, ExTarget: 'Part', MainCap: 1, 'ToMain%': 1, health: 7000 },
      { zone_name: '[unknown]', AV: 5, 'Dur%': 0, ExMult: 0.65, ExTarget: 'Part', MainCap: 1, 'ToMain%': 1, health: 5500 },
      { zone_name: '[unknown]', AV: 5, 'Dur%': 0, ExMult: 0.65, ExTarget: 'Part', MainCap: 1, 'ToMain%': 1, health: 5500 },
      { zone_name: 'seg1_center', AV: 5, 'Dur%': 0, ExMult: 0.65, ExTarget: 'Part', MainCap: 1, 'ToMain%': 1, health: 5500 },
      { zone_name: 'seg1_wing_right', AV: 5, 'Dur%': 0, ExMult: 0.65, ExTarget: 'Part', MainCap: 1, 'ToMain%': 1, health: 5000 },
      { zone_name: 'seg1_wing_left', AV: 5, 'Dur%': 0, ExMult: 0.65, ExTarget: 'Part', MainCap: 1, 'ToMain%': 1, health: 5000 },
      { zone_name: 'seg2_center', AV: 5, 'Dur%': 0, ExMult: 0.65, ExTarget: 'Part', MainCap: 1, 'ToMain%': 1, health: 5500 },
      { zone_name: 'seg2_wing_right', AV: 5, 'Dur%': 0, ExMult: 0.65, ExTarget: 'Part', MainCap: 1, 'ToMain%': 1, health: 3900 },
      { zone_name: 'seg2_wing_left', AV: 5, 'Dur%': 0, ExMult: 0.65, ExTarget: 'Part', MainCap: 1, 'ToMain%': 1, health: 3900 },
      { zone_name: 'seg3_center', AV: 5, 'Dur%': 0, ExMult: 0.65, ExTarget: 'Part', MainCap: 1, 'ToMain%': 1, health: 5000 },
      { zone_name: 'seg3_wing_right', AV: 5, 'Dur%': 0, ExMult: 0.65, ExTarget: 'Part', MainCap: 1, 'ToMain%': 1, health: 3000 },
      { zone_name: 'seg3_wing_left', AV: 5, 'Dur%': 0, ExMult: 0.65, ExTarget: 'Part', MainCap: 1, 'ToMain%': 1, health: 3000 },
      { zone_name: 'seg4_center', AV: 5, 'Dur%': 0, ExMult: 0.65, ExTarget: 'Part', MainCap: 1, 'ToMain%': 1, health: 3900 },
      { zone_name: 'rotator', AV: 5, 'Dur%': 0, ExTarget: 'Main', MainCap: 1, 'ToMain%': 1, health: 3000 }
    ]),
    'content/fac_illuminate/fleshmob/fleshmob': buildFixtureUnit('Fleshmob', [
      { zone_name: 'Main', AV: 0, 'Dur%': 0.4, ExTarget: 'Main', MainCap: 1, 'ToMain%': 1, health: 5000 },
      { zone_name: '[unknown]', AV: 0, 'Dur%': 0.4, ExTarget: 'Main', MainCap: 1, 'ToMain%': 0.25, health: 200 },
      { zone_name: '[unknown]', AV: 0, 'Dur%': 0.4, ExTarget: 'Main', MainCap: 1, 'ToMain%': 0.25, health: 200 },
      { zone_name: '[unknown]', AV: 0, 'Dur%': 0.4, ExTarget: 'Main', MainCap: 1, 'ToMain%': 0.25, health: 200 },
      { zone_name: '[unknown]', AV: 0, 'Dur%': 0.4, ExTarget: 'Main', MainCap: 1, 'ToMain%': 0.25, health: 200 }
    ]),
    'content/fac_bugs/charger_spore/charger_spore': buildFixtureUnit('Spore Charger', [
      { zone_name: 'Main', AV: 4, 'Dur%': 1, ExTarget: 'Main', MainCap: 1, 'ToMain%': 1, health: 2400 },
      { zone_name: '[unknown]', AV: 1, 'Dur%': 1, ExTarget: 'Main', MainCap: 1, 'ToMain%': 0.2, health: 500 },
      { zone_name: '[unknown]', AV: 1, 'Dur%': 1, ExTarget: 'Main', MainCap: 1, 'ToMain%': 0.2, health: 500 },
      { zone_name: '[unknown]', AV: 1, 'Dur%': 1, ExTarget: 'Main', MainCap: 1, 'ToMain%': 0.2, health: 500 },
      { zone_name: '[unknown]', AV: 1, 'Dur%': 1, ExTarget: 'Main', MainCap: 1, 'ToMain%': 0.2, health: 500 },
      { zone_name: '[unknown]', AV: 1, 'Dur%': 1, ExTarget: 'Main', MainCap: 1, 'ToMain%': 0.2, health: 500 },
      { zone_name: '[unknown]', AV: 1, 'Dur%': 1, ExTarget: 'Main', MainCap: 1, 'ToMain%': 0.2, health: 500 }
    ])
  };

  const parsed = parseEnemyUnitsFixture(fixture);

  assert.deepEqual(
    parsed.Illuminate.Gatekeeper.damageable_zones.map((zone) => zone.zone_name),
    [
      'Main',
      'cockpit',
      'cockpit_weakspot',
      'chassis',
      'shield_generator',
      'left_carapace',
      'right_carapace',
      'left_internals',
      'right_internals',
      'rear_weakspot',
      'pilot',
      'left_shoulder_armor',
      'left_arm',
      'left_arm_armor',
      'left_gun_weakspot',
      'left_gun',
      'right_shoulder_armor',
      'right_arm',
      'right_arm_armor',
      'right_gun_weakspot',
      'right_gun',
      'left_hip',
      'left_leg',
      'left_leg_armor_1',
      'left_leg_armor_2',
      'right_hip',
      'right_leg',
      'right_leg_armor_1',
      'right_leg_armor_2',
      'back_hip',
      'back_leg',
      'back_leg_armor_1',
      'back_leg_armor_2',
      'shield'
    ]
  );
  assert.deepEqual(
    parsed.Illuminate.Gazer.damageable_zones.map((zone) => zone.zone_name),
    ['Main', 'eye', '0xf3e71f7b', 'body']
  );
  assert.deepEqual(
    parsed.Illuminate.Leviathan.damageable_zones.map((zone) => zone.zone_name),
    [
      'Main',
      'front_vertebra',
      'front_fin_1',
      'front_fin_2',
      'forward_middle_vertebra',
      'forward_middle_fin_right',
      'forward_middle_fin_left',
      'rearward_middle_vertebra',
      'rearward_middle_fin_right',
      'rearward_middle_fin_left',
      'rear_vertebra',
      'rear_fin_right',
      'rear_fin_left',
      'tail',
      'warp_disc'
    ]
  );
  assert.deepEqual(
    parsed.Illuminate.Fleshmob.damageable_zones.map((zone) => zone.zone_name),
    ['Main', 'arm_zone_1', 'arm_zone_2', 'arm_zone_3', 'arm_zone_4']
  );
  assert.deepEqual(
    parsed.Terminid['Spore Charger'].damageable_zones.map((zone) => zone.zone_name),
    ['Main', 'spore_flesh_1', 'spore_flesh_2', 'spore_flesh_3', 'spore_flesh_4', 'spore_flesh_5', 'spore_flesh_6']
  );
});

test('checked-in enemydata keeps curated enemy zone names', () => {
  const enemydata = JSON.parse(readFileSync(ENEMYDATA_PATH, 'utf8'));
  const agitatorNames = enemydata.Automaton.Agitator.damageable_zones.map((zone) => zone.zone_name);
  const radicalNames = enemydata.Automaton.Radical.damageable_zones.map((zone) => zone.zone_name);
  const veracitorNames = enemydata.Illuminate.Veracitor.damageable_zones.map((zone) => zone.zone_name);
  const gatekeeperNames = enemydata.Illuminate.Gatekeeper.damageable_zones.map((zone) => zone.zone_name);
  const gazerNames = enemydata.Illuminate.Gazer.damageable_zones.map((zone) => zone.zone_name);
  const leviathanNames = enemydata.Illuminate.Leviathan.damageable_zones.map((zone) => zone.zone_name);
  const fleshmobNames = enemydata.Illuminate.Fleshmob.damageable_zones.map((zone) => zone.zone_name);
  const impalerNames = enemydata.Terminid.Impaler.damageable_zones.map((zone) => zone.zone_name);
  const sporeChargerNames = enemydata.Terminid['Spore Charger'].damageable_zones.map((zone) => zone.zone_name);

  assert.ok(!agitatorNames.includes('[unknown]'));
  assert.ok(agitatorNames.includes('helmet'));
  assert.ok(agitatorNames.includes('left_pauldron'));
  assert.ok(agitatorNames.includes('right_pauldron'));
  assert.ok(agitatorNames.includes('left_upper_arm'));
  assert.ok(agitatorNames.includes('right_forearm'));
  assert.deepEqual(radicalNames, agitatorNames);

  assert.ok(!veracitorNames.includes('pilot_seat'));
  assert.ok(!veracitorNames.some((name) => /^0x[0-9a-f]+$/i.test(name)));
  assert.ok(veracitorNames.includes('cockpit'));
  assert.ok(veracitorNames.includes('cockpit_weakspot'));
  assert.ok(veracitorNames.includes('left_shoulder'));
  assert.ok(veracitorNames.includes('right_upper_arm'));
  assert.ok(veracitorNames.includes('rear_leg'));

  assert.ok(!gatekeeperNames.includes('pilot_seat'));
  assert.ok(!gatekeeperNames.some((name) => /^0x[0-9a-f]+$/i.test(name)));
  assert.ok(gatekeeperNames.includes('cockpit'));
  assert.ok(gatekeeperNames.includes('shield_generator'));
  assert.ok(gatekeeperNames.includes('rear_weakspot'));
  assert.ok(gatekeeperNames.includes('left_gun_weakspot'));
  assert.ok(gatekeeperNames.includes('back_leg_armor_2'));

  assert.ok(!gazerNames.includes('0x6d417d28'));
  assert.ok(!gazerNames.includes('0x01970f62'));
  assert.ok(gazerNames.includes('eye'));
  assert.ok(gazerNames.includes('body'));

  assert.ok(!leviathanNames.includes('[unknown]'));
  assert.ok(leviathanNames.includes('front_vertebra'));
  assert.ok(leviathanNames.includes('forward_middle_vertebra'));
  assert.ok(leviathanNames.includes('rearward_middle_fin_left'));
  assert.ok(leviathanNames.includes('warp_disc'));

  assert.ok(fleshmobNames.includes('arm_zone_1'));
  assert.ok(fleshmobNames.includes('arm_zone_4'));

  assert.ok(!impalerNames.includes('[unknown]'));
  assert.ok(!impalerNames.includes('l_front_armor_claw'));
  assert.ok(impalerNames.includes('l_tentacle_armor'));
  assert.ok(impalerNames.includes('m_tentacle_armor'));
  assert.ok(impalerNames.includes('r_tentacle_armor'));

  assert.ok(!sporeChargerNames.includes('[unknown]'));
  assert.ok(sporeChargerNames.includes('spore_flesh_1'));
  assert.ok(sporeChargerNames.includes('spore_flesh_6'));

  assert.ok(enemydata.Terminid.Impaler.damageable_zones.every((zone) => !Object.keys(zone).some((key) => key.startsWith('_'))));
});

test('checked-in enemydata keeps curated enemy scope tags', () => {
  const enemydata = JSON.parse(readFileSync(ENEMYDATA_PATH, 'utf8'));

  assert.deepEqual(enemydata.Illuminate.Obtruder.scope_tags, ['chaff']);
  assert.equal(enemydata.Illuminate['Xenobite Ardent'].show_in_selector, false);
});
