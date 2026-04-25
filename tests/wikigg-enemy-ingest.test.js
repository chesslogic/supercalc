import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const PYTHON = process.platform === 'win32' ? 'python' : 'python3';
const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

const BUILD_DATASET_SCRIPT = `
import json
import sys

from tools.ingest_wikigg_enemy_anatomy import FactionPageSpec, build_wikigg_enemy_sidecar

fixture = json.load(sys.stdin)
html_by_page = fixture["html_by_page"]
wikitext_by_page = fixture["wikitext_by_page"]
specs = [FactionPageSpec(**spec) for spec in fixture["faction_specs"]]

def fetch_faction_html(page_title):
    return html_by_page[page_title]

def fetch_unit_wikitext(page_title):
    return wikitext_by_page[page_title]

dataset, summary, warnings = build_wikigg_enemy_sidecar(
    fetch_faction_html,
    fetch_unit_wikitext,
    fetched_at=fixture["fetched_at"],
    faction_specs=specs,
)

json.dump(
    {
        "dataset": dataset,
        "summary": summary,
        "warnings": warnings,
    },
    sys.stdout,
)
`;

const EXTRACT_ANATOMY_SCRIPT = `
import json
import sys

from tools.ingest_wikigg_enemy_anatomy import extract_anatomy_payload_from_wikitext

fixture = json.load(sys.stdin)
payload = extract_anatomy_payload_from_wikitext(fixture["wikitext"])
json.dump(payload, sys.stdout)
`;

function runPython(script, fixture) {
  const result = spawnSync(PYTHON, ['-c', script], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    input: JSON.stringify(fixture)
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  return JSON.parse(result.stdout);
}

test('wikigg enemy ingest enumerates faction galleries and ignores structure galleries', () => {
  const fixture = {
    fetched_at: '2026-01-02T03:04:05Z',
    faction_specs: [
      {
        faction: 'Terminid',
        page_title: 'Terminids',
        list_heading: 'List of Terminids',
        default_subsection: 'Standard Terminids'
      }
    ],
    html_by_page: {
      Terminids: `
        <h2><span class="mw-headline" id="Overview">Overview</span></h2>
        <h2><span class="mw-headline" id="List_of_Terminids">List of Terminids</span></h2>
        <ul class="gallery mw-gallery-traditional">
          <li class="gallerybox">
            <div class="gallerytext"><a href="/wiki/Bile_Spitter" title="Bile Spitter">Bile Spitter</a></div>
          </li>
        </ul>
        <h3><span class="mw-headline" id="Predator_Strain">Predator Strain</span></h3>
        <ul class="gallery mw-gallery-traditional">
          <li class="gallerybox">
            <div class="gallerytext"><a href="/wiki/Predator_Hunter" title="Predator Hunter">Predator Hunter</a></div>
          </li>
        </ul>
        <h2><span class="mw-headline" id="List_of_Terminid_Structures">List of Terminid Structures</span></h2>
        <ul class="gallery mw-gallery-traditional">
          <li class="gallerybox">
            <div class="gallerytext"><a href="/wiki/Bug_Hole" title="Bug Hole">Bug Hole</a></div>
          </li>
        </ul>
      `
    },
    wikitext_by_page: {
      'Bile Spitter': `
        == Anatomy ==
        {{Anatomy Table|
          {{Anatomy Row
            | part_name = Main
            | health = 240
            | av = 0
            | durability = 0%
            | percent_to_main = -
            | dmg_cap_main = -
            | bleed = None
            | fatal = Yes
            | exdr = 0%
          }}
          {{Anatomy Row
            | part_name = Sack (2)
            | health = 100
            | av = 0
            | durability = 50%
            | percent_to_main = 100%
            | dmg_cap_main = No
            | bleed = None
            | fatal = No
            | exdr = 25%
          }}
        }}
      `,
      'Predator Hunter': `
        == Anatomy ==
        {{Anatomy Table|
          {{Anatomy Row
            | part_name = Main
            | health = 325
            | av = 0
            | durability = 0%
            | percent_to_main = -
            | dmg_cap_main = -
            | bleed = None
            | fatal = Yes
            | exdr = 0%
          }}
          {{Anatomy Row
            | part_name = Head
            | health = Main
            | av = 0
            | durability = 0%
            | percent_to_main = 100%
            | dmg_cap_main = Yes
            | bleed = None
            | fatal = Yes
            | exdr = 100%
          }}
        }}
      `
    }
  };

  const { dataset, summary, warnings } = runPython(BUILD_DATASET_SCRIPT, fixture);
  assert.equal(summary.enumerated_unit_count, 2);
  assert.equal(summary.scraped_unit_count, 2);
  assert.equal(summary.missing_anatomy_unit_count, 0);
  assert.deepEqual(warnings, []);

  assert.equal(dataset.__enumeration_strategy, 'faction-overview-gallery-sections');
  assert.equal(dataset.__anatomy_extraction, 'parse-api-wikitext-anatomy-templates');
  assert.equal(dataset.__unit_count, 2);

  const bileSpitter = dataset.Terminid['Bile Spitter'];
  const predatorHunter = dataset.Terminid['Predator Hunter'];

  assert.ok(bileSpitter);
  assert.ok(predatorHunter);
  assert.equal(dataset.Terminid['Bug Hole'], undefined);

  assert.equal(bileSpitter.health, 240);
  assert.equal(bileSpitter.source_profile_name, 'Bile Spitter');
  assert.equal(bileSpitter.source_provenance.fetch_timestamp, fixture.fetched_at);
  assert.equal(bileSpitter.source_provenance.source_page_url, 'https://helldivers.wiki.gg/wiki/Bile_Spitter');
  assert.equal(bileSpitter.source_provenance.source_faction_page_title, 'Terminids');
  assert.equal(bileSpitter.source_provenance.source_subfaction, 'Standard Terminids');
  assert.equal(bileSpitter.damageable_zones[1].zone_name, 'sack');
  assert.equal(bileSpitter.damageable_zones[1].source_zone_count, 2);
  assert.equal(bileSpitter.damageable_zones[1].ExTarget, 'Part');
  assert.equal(bileSpitter.damageable_zones[1].ExMult, 0.75);

  assert.equal(predatorHunter.source_provenance.source_subfaction, 'Predator Strain');
  assert.equal(predatorHunter.damageable_zones[1].health, 'Main');
  assert.equal(predatorHunter.damageable_zones[1].ExTarget, 'Main');
  assert.equal(predatorHunter.damageable_zones[1].MainCap, true);
});

test('wikigg enemy ingest parses tabbed anatomy states, grouped parts, constitution, and explosion mapping', () => {
  const fixture = {
    wikitext: `
      == Anatomy ==
      <tabber>
      |-|Intact=
      {{Anatomy Table|
        {{Anatomy Row
          | part_name = Main
          | health = 3,000
          | av = 4
          | durability = 70%
          | percent_to_main = -
          | dmg_cap_main = -
          | bleed = None
          | fatal = Yes
          | exdr = 40%
        }}
        {{Anatomy Row
          | part_name = Shield<br>Generators (3)
          | health = 350
          | av = 3
          | durability = 0%
          | percent_to_main = 10%
          | dmg_cap_main = Yes
          | bleed = 500 [25/s]
          | fatal = No
          | exdr = 25%
        }}
        {{Anatomy Row
          | part_name = Eye
          | health = Main
          | av = 2
          | durability = 0%
          | percent_to_main = 120%
          | dmg_cap_main = No
          | bleed = None
          | fatal = Yes
          | exdr = 100%
        }}
      }}
      |-|Armor Broken =
      {{Anatomy Table|
        {{Anatomy Row
          | part_name = Damaged<br>Chassis
          | health = 2,000
          | av = 4
          | durability = 75%
          | percent_to_main = 100%
          | dmg_cap_main = Yes
          | bleed = None
          | fatal = Yes
          | exdr = 0%
        }}
      }}
      </tabber>
    `
  };

  const payload = runPython(EXTRACT_ANATOMY_SCRIPT, fixture);
  assert.equal(payload.status, 'ok');
  assert.equal(payload.selected_state, 'Intact');
  assert.equal(payload.health, 3000);
  assert.deepEqual(Object.keys(payload.states), ['Intact', 'Armor Broken']);
  assert.equal(payload.states.Intact.health, 3000);
  assert.equal(payload.states['Armor Broken'].health, 2000);
  assert.equal(payload.states.Intact.damageable_zones.length, 3);

  const [main, shieldGenerators, eye] = payload.states.Intact.damageable_zones;
  assert.equal(main.zone_name, 'Main');
  assert.equal(main.ExTarget, 'Main');
  assert.equal(main.ExMult, 0.6);
  assert.equal(main['ToMain%'], 1);
  assert.equal(main.MainCap, true);

  assert.equal(shieldGenerators.zone_name, 'shield_generators');
  assert.equal(shieldGenerators.source_zone_name, 'Shield Generators (3)');
  assert.equal(shieldGenerators.source_zone_count, 3);
  assert.equal(shieldGenerators.Con, 500);
  assert.equal(shieldGenerators.ConRate, 25);
  assert.equal(shieldGenerators.ExTarget, 'Part');
  assert.equal(shieldGenerators.ExMult, 0.75);
  assert.equal(shieldGenerators['ToMain%'], 0.1);
  assert.equal(shieldGenerators.MainCap, true);

  assert.equal(eye.health, 'Main');
  assert.equal(eye.ExTarget, 'Main');
  assert.equal(eye.MainCap, false);
  assert.equal(eye['ToMain%'], 1.2);
  assert.equal(eye.IsFatal, undefined);
});
