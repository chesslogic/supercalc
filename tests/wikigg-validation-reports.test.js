import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const PYTHON = process.platform === 'win32' ? 'python' : 'python3';
const SCRIPT_PATH = fileURLToPath(new URL('../tools/build_wikigg_validation_reports.py', import.meta.url));
const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
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

test('build_wikigg_validation_reports classifies enemy and attack discrepancies into machine-readable buckets', () => {
  const tempDir = createScratchDir('wikigg-validation-reports');
  const enemyCurrentPath = join(tempDir, 'enemydata.json');
  const enemySidecarPath = join(tempDir, 'wikigg-enemy-sidecar.json');
  const attackCsvPath = join(tempDir, 'weapondata.csv');
  const attackIngestPath = join(tempDir, 'wikigg-attacks.json');
  const outputDir = join(tempDir, 'reports');

  try {
    const currentEnemyFixture = {
      Automaton: {
        'Scout Walker': {
          health: 1000,
          damageable_zones: [
            buildZone('Main', { AV: 4, ExTarget: 'Main', MainCap: true, 'ToMain%': 1, health: 1000 }),
            buildZone('head', { AV: 2, ExTarget: 'Main', MainCap: true, 'ToMain%': 1, health: 120, IsFatal: true }),
            buildZone('battery_pack', { health: 150 }),
            buildZone('leg', { health: 200 }),
            buildZone('rear_armor', { AV: 3, health: 250, MainCap: true, 'ToMain%': 1 })
          ],
          scope_tags: ['walker']
        },
        'Missing In Wiki': {
          health: 300,
          damageable_zones: [buildZone('Main', { ExTarget: 'Main', MainCap: true, 'ToMain%': 1, health: 300 })]
        }
      }
    };

    const wikiEnemyFixture = {
      __schema_version: 1,
      __generated_at: '2026-01-02T03:04:05Z',
      __source_provenance: 'fixture',
      Automaton: {
        'Scout Walker': {
          health: 1100,
          source_profile_name: 'Scout Walker',
          source_provenance: {
            source_page_url: 'https://example.invalid/wiki/Scout_Walker'
          },
          damageable_zones: [
            buildZone('Main', { source_zone_name: 'Main', AV: 4, ExTarget: 'Main', MainCap: true, 'ToMain%': 1, health: 1000 }),
            buildZone('head', { source_zone_name: 'Head', AV: 2, ExTarget: 'Part', MainCap: false, 'ToMain%': 0.8, health: 150, IsFatal: true }),
            buildZone('power_core', { source_zone_name: 'Power Core', health: 150 }),
            buildZone('leg', { source_zone_name: 'Leg', health: 200, source_zone_count: 2 }),
            buildZone('cannon', { source_zone_name: 'Cannon', AV: 3, health: 300, MainCap: true, 'ToMain%': 1 })
          ]
        },
        'New In Wiki': {
          health: 400,
          source_profile_name: 'New In Wiki',
          source_provenance: {
            source_page_url: 'https://example.invalid/wiki/New_In_Wiki'
          },
          damageable_zones: [buildZone('Main', { source_zone_name: 'Main', ExTarget: 'Main', MainCap: true, 'ToMain%': 1, health: 400 })]
        }
      }
    };

    const attackCsvFixture = [
      'Type,Sub,Role,Code,Name,RPM,Atk Type,Atk Name,DMG,DUR,AP,DF,ST,PF,Status',
      'Stratagem,EMP,ordnance,MD-6,MINEFIELD,,explosion,MINE_E,700,700,3,30,30,30,',
      'Stratagem,EMP,energy,A/FLAM-40,FLAME SENTRY,,spray,FLAME_S,2,2,4,10,5,5,Fire',
      'Stratagem,BCK,energy,AX/TX-13,DOG BREATH,,spray,DOG SPRAY,1,1,5,5,10,5,Gas_Var2',
      'Stratagem,EMP,automatic,UN-1,UNRESOLVED EMP,,projectile,OLD_EMP_P,200,40,4,20,25,15,'
    ].join('\n');

    const attackIngestFixture = {
      metadata: {
        tool: 'tools\\ingest_wikigg_attacks.py',
        generated_at: '2026-01-02T03:04:05Z',
        comparison_scope: {
          csv_path: attackCsvPath
        }
      },
      records: [
        {
          record_id: 'MD-6::explosion::MINE_E',
          entity: {
            name: 'MINEFIELD',
            id: 'MD-6',
            resolved_ids: ['MD-6']
          },
          attack: {
            type: 'explosion',
            name: 'MINE_E'
          },
          csv_projection: {
            Type: 'Stratagem',
            Code: 'MD-6',
            Name: 'MINEFIELD',
            RPM: null,
            'Atk Type': 'explosion',
            'Atk Name': 'MINE_E',
            DMG: 700,
            DUR: 700,
            AP: 3,
            DF: 30,
            ST: 30,
            PF: 30,
            Status: ''
          }
        },
        {
          record_id: 'A/FLAM-40::spray::FLAME_S',
          entity: {
            name: 'FLAME SENTRY',
            id: 'A/FLAM-40',
            resolved_ids: ['A/FLAM-40']
          },
          attack: {
            type: 'spray',
            name: 'FLAME_S'
          },
          csv_projection: {
            Type: 'Stratagem',
            Code: 'A/FLAM-40',
            Name: 'FLAME SENTRY',
            RPM: null,
            'Atk Type': 'spray',
            'Atk Name': 'FLAME_S',
            DMG: 3,
            DUR: 3,
            AP: 4,
            DF: 10,
            ST: 5,
            PF: 5,
            Status: 'Fire'
          }
        },
        {
          record_id: 'AX/TX-13::spray::DOG_S',
          entity: {
            name: 'DOG BREATH',
            id: 'AX/TX-13',
            resolved_ids: ['AX/TX-13']
          },
          attack: {
            type: 'spray',
            name: 'DOG_S'
          },
          csv_projection: {
            Type: 'Stratagem',
            Code: 'AX/TX-13',
            Name: 'DOG BREATH',
            RPM: null,
            'Atk Type': 'spray',
            'Atk Name': 'DOG_S',
            DMG: 1,
            DUR: 1,
            AP: 5,
            DF: 5,
            ST: 10,
            PF: 5,
            Status: 'Gas_Var2'
          }
        },
        {
          record_id: 'ZZ-1::beam::NEW_S',
          entity: {
            name: 'NEW THING',
            id: 'ZZ-1',
            resolved_ids: ['ZZ-1']
          },
          attack: {
            type: 'beam',
            name: 'NEW_S'
          },
          csv_projection: {
            Type: 'Stratagem',
            Code: 'ZZ-1',
            Name: 'NEW THING',
            RPM: null,
            'Atk Type': 'beam',
            'Atk Name': 'NEW_S',
            DMG: 5,
            DUR: 5,
            AP: 2,
            DF: 0,
            ST: 0,
            PF: 0,
            Status: ''
          }
        }
      ],
      coverage: {
        by_stratagem: [
          {
            name: 'MINEFIELD',
            id: 'MD-6',
            resolved_ids: ['MD-6'],
            loadout_wep: null
          },
          {
            name: 'FLAME SENTRY',
            id: 'A/FLAM-40',
            resolved_ids: ['A/FLAM-40'],
            loadout_wep: null
          },
          {
            name: 'DOG BREATH',
            id: 'AX/TX-13',
            resolved_ids: ['AX/TX-13'],
            loadout_wep: null
          },
          {
            name: 'NEW THING',
            id: 'ZZ-1',
            resolved_ids: ['ZZ-1'],
            loadout_wep: null
          },
          {
            name: 'UNRESOLVED EMP',
            id: 'UN-1',
            resolved_ids: ['UN-1'],
            loadout_wep: null
          }
        ]
      },
      unresolved_references: [
        {
          entity_name: 'UNRESOLVED EMP',
          entity_id: 'UN-1',
          loadout_wep: null,
          reason: 'no-attacks-or-loadout',
          ref_type: null,
          ref_name: null,
          parent: null,
          path: []
        }
      ],
      unresolved_entities: [
        {
          name: 'UNRESOLVED EMP',
          id: 'UN-1',
          reason: 'no-attacks-or-loadout',
          csv_row_count: 1,
          csv_row_numbers: [5]
        }
      ]
    };

    writeFileSync(enemyCurrentPath, JSON.stringify(currentEnemyFixture, null, 2));
    writeFileSync(enemySidecarPath, JSON.stringify(wikiEnemyFixture, null, 2));
    writeFileSync(attackCsvPath, `${attackCsvFixture}\n`);
    writeFileSync(attackIngestPath, JSON.stringify(attackIngestFixture, null, 2));

    const result = runTool([
      '--enemy-current',
      enemyCurrentPath,
      '--enemy-sidecar',
      enemySidecarPath,
      '--attack-csv',
      attackCsvPath,
      '--attack-ingest',
      attackIngestPath,
      '--output-dir',
      outputDir
    ]);

    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /Enemy summary: current=2 wiki=2 missing_wiki=1 missing_enemydata=1 changed=1/);
    assert.match(result.stdout, /Attack summary: records=4 matched=2 projection_mismatches=1 naming_only=1 csv_only_rows=2 unresolved_refs=1/);
    assert.match(result.stdout, /Wrote enemy report to /);
    assert.match(result.stdout, /Wrote attack report to /);
    assert.match(result.stdout, /Wrote report index to /);

    const enemyReport = JSON.parse(readFileSync(join(outputDir, 'enemy-anatomy-validation.json'), 'utf8'));
    assert.equal(enemyReport.summary.current_unit_count, 2);
    assert.equal(enemyReport.summary.wiki_unit_count, 2);
    assert.equal(enemyReport.summary.missing_from_wiki_count, 1);
    assert.equal(enemyReport.summary.missing_from_enemydata_count, 1);
    assert.equal(enemyReport.summary.units_with_any_difference_count, 1);
    assert.equal(enemyReport.summary.unit_health_mismatch_count, 1);
    assert.equal(enemyReport.summary.missing_zone_group_count, 1);
    assert.equal(enemyReport.summary.extra_zone_group_count, 1);
    assert.equal(enemyReport.summary.zone_name_difference_count, 2);
    assert.equal(enemyReport.summary.zone_field_mismatch_count, 1);
    assert.equal(enemyReport.summary.zone_passthrough_mismatch_count, 1);
    assert.equal(enemyReport.summary.zone_group_count_difference_count, 1);
    assert.deepEqual(enemyReport.categories.missing_from_wiki, [
      { faction: 'Automaton', unit_name: 'Missing In Wiki' }
    ]);
    assert.deepEqual(enemyReport.categories.missing_from_enemydata, [
      { faction: 'Automaton', unit_name: 'New In Wiki' }
    ]);

    const scoutWalker = enemyReport.factions.Automaton.units['Scout Walker'];
    assert.deepEqual(scoutWalker.categories, [
      'unit-health-mismatch',
      'missing-zone-groups',
      'extra-zone-groups',
      'zone-name-differences',
      'zone-field-mismatches',
      'zone-passthrough-mismatches',
      'zone-group-count-differences'
    ]);
    assert.equal(scoutWalker.unit_health_mismatch.current, 1000);
    assert.equal(scoutWalker.unit_health_mismatch.wiki, 1100);
    assert.deepEqual(scoutWalker.missing_zone_groups[0].zone_names, ['rear_armor']);
    assert.deepEqual(scoutWalker.extra_zone_groups[0].zone_names, ['Cannon']);
    assert.equal(scoutWalker.zone_field_mismatches[0].zone_name_key, 'head');
    assert.deepEqual(scoutWalker.zone_field_mismatches[0].changed_fields, ['ExTarget', 'MainCap', 'ToMain%', 'health']);
    assert.deepEqual(scoutWalker.zone_passthrough_mismatches[0].passthrough_fields, ['ExTarget', 'MainCap', 'ToMain%']);
    assert.equal(scoutWalker.zone_group_count_differences[0].current_weighted_count, 1);
    assert.equal(scoutWalker.zone_group_count_differences[0].wiki_weighted_count, 2);
    assert.equal(scoutWalker.zone_name_differences.length, 2);

    const attackReport = JSON.parse(readFileSync(join(outputDir, 'stratagem-attack-validation.json'), 'utf8'));
    assert.equal(attackReport.summary.wiki_record_count, 4);
    assert.equal(attackReport.summary.matched_record_count, 2);
    assert.equal(attackReport.summary.unmatched_record_count, 2);
    assert.equal(attackReport.summary.projection_mismatch_record_count, 1);
    assert.equal(attackReport.summary.possible_naming_only_mismatch_count, 1);
    assert.equal(attackReport.summary.csv_rows_missing_from_wiki_count, 2);
    assert.equal(attackReport.summary.entity_count, 5);
    assert.equal(attackReport.summary.entity_status_counts.covered, 2);
    assert.equal(attackReport.summary.entity_status_counts.partial, 1);
    assert.equal(attackReport.summary.entity_status_counts['wiki-only'], 1);
    assert.equal(attackReport.summary.entity_status_counts.unresolved, 1);
    assert.equal(attackReport.summary.unresolved_reference_count, 1);
    assert.equal(attackReport.summary.unresolved_entity_count, 1);

    const projectionMismatch = attackReport.categories.records_with_projection_differences[0];
    assert.equal(projectionMismatch.record_id, 'A/FLAM-40::spray::FLAME_S');
    assert.deepEqual(projectionMismatch.field_difference_fields, ['DMG', 'DUR']);
    assert.equal(projectionMismatch.matched_rows[0].field_mismatches.DMG.wiki, 3);
    assert.equal(projectionMismatch.matched_rows[0].field_mismatches.DMG.csv, 2);

    const namingOnly = attackReport.categories.possible_naming_only_mismatches[0];
    assert.equal(namingOnly.record_id, 'AX/TX-13::spray::DOG_S');
    assert.deepEqual(namingOnly.naming_only_candidates[0].identifier_difference_fields, ['Atk Name']);
    assert.equal(namingOnly.naming_only_candidates[0].confidence, 'high');

    const unmatchedWikiRecord = attackReport.categories.wiki_records_missing_from_csv.find((entry) => entry.record_id === 'ZZ-1::beam::NEW_S');
    assert.ok(unmatchedWikiRecord);
    assert.equal(unmatchedWikiRecord.probable_reason, 'no-candidate-rows');

    const csvNamingOnlyRow = attackReport.categories.csv_rows_missing_from_wiki.find((entry) => entry.line_number === 4);
    assert.ok(csvNamingOnlyRow);
    assert.deepEqual(csvNamingOnlyRow.candidate_record_ids, ['AX/TX-13::spray::DOG_S']);
    assert.equal(csvNamingOnlyRow.probable_reason, 'possible-naming-only-mismatch');

    const unresolvedEntity = attackReport.categories.unresolved_entities[0];
    assert.equal(unresolvedEntity.name, 'UNRESOLVED EMP');
    assert.equal(unresolvedEntity.status, 'unresolved');
    assert.deepEqual(unresolvedEntity.csv_row_numbers, [5]);

    const indexReport = JSON.parse(readFileSync(join(outputDir, 'index.json'), 'utf8'));
    assert.ok(indexReport.reports.enemy_anatomy);
    assert.ok(indexReport.reports.stratagem_attacks);
    assert.equal(indexReport.reports.enemy_anatomy.summary.units_with_any_difference_count, 1);
    assert.equal(indexReport.reports.stratagem_attacks.summary.possible_naming_only_mismatch_count, 1);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
