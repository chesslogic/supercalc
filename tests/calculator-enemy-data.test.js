// Tests for enemy data processing: inline enemies, unknown zones, and zone relations.
// Extracted from calculator-ui.test.js during test-suite split.
import test from 'node:test';
import assert from 'node:assert/strict';
import './env-stubs.js';

import { enemyState, getEnemyUnitByName, getZoneRelationContext, processEnemyData } from '../enemies/data.js';
import { getEnemyOptions } from '../calculator/data.js';
import { getZoneRelationHighlightKind } from '../calculator/rendering.js';

function saveEnemyState() {
  return {
    factions: enemyState.factions,
    units: enemyState.units,
    inlineUnits: enemyState.inlineUnits,
    filteredUnits: enemyState.filteredUnits,
    filterActive: enemyState.filterActive,
    sortKey: enemyState.sortKey,
    sortDir: enemyState.sortDir,
    factionIndex: enemyState.factionIndex,
    searchIndex: enemyState.searchIndex,
    unitIndex: enemyState.unitIndex
  };
}

function restoreEnemyState(saved) {
  enemyState.factions = saved.factions;
  enemyState.units = saved.units;
  enemyState.inlineUnits = saved.inlineUnits;
  enemyState.filteredUnits = saved.filteredUnits;
  enemyState.filterActive = saved.filterActive;
  enemyState.sortKey = saved.sortKey;
  enemyState.sortDir = saved.sortDir;
  enemyState.factionIndex = saved.factionIndex;
  enemyState.searchIndex = saved.searchIndex;
  enemyState.unitIndex = saved.unitIndex;
}

test('processEnemyData keeps inline enemies hidden from the selector but available by name', () => {
  const saved = saveEnemyState();

  try {
    processEnemyData({
      Automaton: {
        'Factory Strider': {
          health: 10000,
          scope_tags: ['giant'],
          damageable_zones: [
            { zone_name: 'Main', health: 10000 }
          ],
          inline_enemies: {
            'Factory Strider Belly Panels': {
              health: 1200,
              show_in_selector: false,
              source_provenance: 'wiki-measured',
              source_note: 'Curated inline overlay target',
              damageable_zones: [
                { zone_name: 'belly_panels', health: 1200, Con: 1200 }
              ]
            }
          }
        }
      }
    });

    assert.deepEqual(getEnemyOptions().map((enemy) => enemy.name), ['Factory Strider']);
    assert.equal(enemyState.inlineUnits.length, 1);

    const inlineEnemy = getEnemyUnitByName('Factory Strider Belly Panels');
    assert.equal(inlineEnemy?.isInline, true);
    assert.equal(inlineEnemy?.parentEnemyName, 'Factory Strider');
    assert.equal(inlineEnemy?.showInSelector, false);
    assert.equal(inlineEnemy?.sourceProvenance, 'wiki-measured');
    assert.deepEqual(inlineEnemy?.scopeTags, ['giant']);
  } finally {
    restoreEnemyState(saved);
  }
});

test('processEnemyData assigns stable numbered labels to unknown zones within an enemy', () => {
  const saved = saveEnemyState();

  try {
    processEnemyData({
      Automaton: {
        'Unknown Walker': {
          health: 800,
          damageable_zones: [
            { zone_name: '[unknown]', health: 200 },
            { zone_name: 'head', health: 150 },
            { zone_name: '[unknown]', health: 250 }
          ]
        }
      }
    });

    const unit = getEnemyUnitByName('Unknown Walker');
    assert.deepEqual(
      unit?.zones.map((zone) => [zone.zone_name, zone.raw_zone_name || null]),
      [
        ['[unknown 1]', '[unknown]'],
        ['head', null],
        ['[unknown 2]', '[unknown]']
      ]
    );
  } finally {
    restoreEnemyState(saved);
  }
});

test('processEnemyData normalizes zone relations for same-limb, mirror, and priority targets', () => {
  const saved = saveEnemyState();

  try {
    processEnemyData({
      Illuminate: {
        'Relation Walker': {
          health: 3000,
          damageable_zones: [
            { zone_name: 'left_hip', health: 400, IsFatal: true },
            { zone_name: 'left_upper_leg', health: 500 },
            { zone_name: 'right_hip', health: 400, IsFatal: true }
          ],
          zone_relation_groups: [
            {
              id: 'left-leg',
              label: 'Left leg',
              zones: ['left_hip', 'left_upper_leg'],
              mirror_group: 'right-leg',
              priority_target_zones: ['left_hip']
            },
            {
              id: 'right-leg',
              label: 'Right leg',
              zones: ['right_hip'],
              mirror_group: 'left-leg',
              priority_target_zones: ['right_hip']
            }
          ]
        }
      }
    });

    const unit = getEnemyUnitByName('Relation Walker');
    const relationContext = getZoneRelationContext(unit, 'left_upper_leg');

    assert.deepEqual(relationContext?.groupLabels, ['Left leg']);
    assert.deepEqual(new Set(relationContext?.sameZoneNames || []), new Set(['left_hip', 'left_upper_leg']));
    assert.deepEqual(new Set(relationContext?.mirrorZoneNames || []), new Set(['right_hip']));
    assert.deepEqual(relationContext?.priorityTargetZoneNames, ['left_hip']);
    assert.equal(getZoneRelationHighlightKind(unit, 'left_upper_leg', 'left_upper_leg'), 'anchor');
    assert.equal(getZoneRelationHighlightKind(unit, 'left_upper_leg', 'left_hip'), 'group');
    assert.equal(getZoneRelationHighlightKind(unit, 'left_upper_leg', 'right_hip'), 'mirror');
    assert.equal(getZoneRelationHighlightKind(unit, 'left_upper_leg', 'torso'), null);
  } finally {
    restoreEnemyState(saved);
  }
});
