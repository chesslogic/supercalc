import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildRelatedTargetRecommendationRows,
  buildSelectedTargetRecommendationRows,
  buildWeaponRecommendationRows,
  normalizeRecommendationRangeMeters
} from '../calculator/recommendations.js';
import { getEnemyTacticalInfoChips, getEnemyWeakspotBundles } from '../calculator/tactical-data.js';
import {
  calculateMaxDistanceForDamageFloor,
  ingestBallisticFalloffCsvText,
  resetBallisticFalloffProfiles
} from '../weapons/falloff.js';
import { enemyState, getEnemyUnitByName, processEnemyData } from '../enemies/data.js';

function makeAttackRow(name, damage, ap = 2) {
  return {
    'Atk Type': 'Projectile',
    'Atk Name': name,
    DMG: damage,
    DUR: 0,
    AP: ap,
    DF: 10,
    ST: 10,
    PF: 10
  };
}

function makeWeapon(name, {
  code = '',
  index = 0,
  rpm = 60,
  type = 'Primary',
  sub = 'AR',
  rows = []
} = {}) {
  return {
    name,
    code,
    index,
    rpm,
    type,
    sub,
    rows
  };
}

function makeZone(zoneName, {
  health = 100,
  isFatal = false,
  av = 1,
  toMainPercent = 0
} = {}) {
  return {
    zone_name: zoneName,
    health,
    Con: 0,
    AV: av,
    'Dur%': 0,
    'ToMain%': toMainPercent,
    ExTarget: 'Part',
    ExMult: 1,
    IsFatal: isFatal
  };
}

function makeExplosionAttackRow(name, damage, ap = 3) {
  return {
    ...makeAttackRow(name, damage, ap),
    'Atk Type': 'Explosion'
  };
}

const TEST_FALLOFF_CSV = `Category,Weapon,Caliber,Mass,Velocity,Drag,,2m,5m,15m,25m,50m,75m,100m,150m,200m
Primary / Assault Rifle,AR-23 Liberator,5.5,4.5,900,0.3,,0.70%,0.75%,2.15%,3.76%,6.82%,10.20%,13.34%,18.98%,23.96%
Marksman / DMR,R-63 Diligence,8,8.5,960,0.15,,0.30%,0.45%,1.10%,1.90%,3.80%,5.70%,7.50%,11.20%,14.90%`;

test('buildWeaponRecommendationRows separates one-shot kills from one-shot critical disables', () => {
  const enemy = {
    name: 'Heavy Devastator',
    health: 600,
    zones: [
      makeZone('head', { health: 220, isFatal: true, av: 1, toMainPercent: 1 }),
      makeZone('right_arm', { health: 100, av: 1, toMainPercent: 0.5 })
    ]
  };
  const weapons = [
    makeWeapon('Killshot', {
      index: 0,
      rows: [makeAttackRow('Killshot', 220, 2)]
    }),
    makeWeapon('Disarmer', {
      index: 1,
      rows: [makeAttackRow('Disarmer', 100, 2)]
    })
  ];

  const rows = buildWeaponRecommendationRows({
    enemy,
    weapons,
    rangeFloorMeters: 0
  });

  const killshotRow = rows.find((row) => row.weapon.name === 'Killshot');
  const disarmerRow = rows.find((row) => row.weapon.name === 'Disarmer');

  assert.ok(killshotRow);
  assert.ok(disarmerRow);
  assert.equal(killshotRow.hasOneShotKill, true);
  assert.equal(killshotRow.bestOutcomeKind, 'fatal');
  assert.equal(disarmerRow.hasOneShotCritical, true);
  assert.equal(disarmerRow.hasCriticalRecommendation, true);
  assert.equal(disarmerRow.bestOutcomeKind, 'critical');
});

test('buildWeaponRecommendationRows keeps doomed breakpoints distinct from one-shot kills', () => {
  const enemy = {
    name: 'Doomed Dummy',
    health: 500,
    zones: [
      {
        zone_name: 'Main',
        health: 500,
        Con: 100,
        ConRate: 5,
        ConAppliesAnyDeath: true,
        AV: 0,
        'Dur%': 0,
        'ToMain%': 1,
        ExTarget: 'Main'
      },
      makeZone('leg', { health: 100, isFatal: true, av: 1, toMainPercent: 0.1 })
    ]
  };
  const weapons = [
    makeWeapon('Doomer', {
      index: 0,
      rows: [makeAttackRow('Doomer', 100, 2)]
    })
  ];

  const rows = buildWeaponRecommendationRows({
    enemy,
    weapons,
    rangeFloorMeters: 0
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].bestOutcomeKind, 'doomed');
  assert.equal(rows[0].hasOneShotKill, false);
  assert.equal(rows[0].hasFastTtk, true);
});

test('buildWeaponRecommendationRows prioritizes tighter Margin rows before generic one-shot kills', () => {
  const enemy = {
    name: 'Priority Dummy',
    health: 500,
    zones: [
      makeZone('head', { health: 100, isFatal: true, av: 1, toMainPercent: 1 })
    ]
  };
  const weapons = [
    makeWeapon('Overkill', {
      index: 0,
      rows: [makeAttackRow('Overkill', 160, 2)]
    }),
    makeWeapon('Efficient', {
      index: 1,
      rows: [makeAttackRow('Efficient', 105, 2)]
    })
  ];

  const rows = buildWeaponRecommendationRows({
    enemy,
    weapons,
    rangeFloorMeters: 0
  });

  assert.equal(rows[0].weapon.name, 'Efficient');
  assert.equal(rows[0].qualifiesForMargin, true);
  assert.equal(rows[0].marginPercent, 5);
  assert.equal(rows[1].weapon.name, 'Overkill');
  assert.equal(rows[1].qualifiesForMargin, false);
  assert.equal(rows[1].marginPercent, 60);
  assert.equal(rows[1].hasOneShotKill, true);
});

test('buildWeaponRecommendationRows prefers the tighter Margin when multiple rows qualify', () => {
  const enemy = {
    name: 'Margin Dummy',
    health: 500,
    zones: [
      makeZone('head', { health: 100, isFatal: true, av: 1, toMainPercent: 1 })
    ]
  };
  const weapons = [
    makeWeapon('Loose First', {
      index: 0,
      rows: [makeAttackRow('Loose', 110, 2)]
    }),
    makeWeapon('Cleaner Second', {
      index: 1,
      rows: [makeAttackRow('Cleaner', 102, 2)]
    })
  ];

  const rows = buildWeaponRecommendationRows({
    enemy,
    weapons,
    rangeFloorMeters: 0
  });

  assert.equal(rows[0].weapon.name, 'Cleaner Second');
  assert.equal(rows[0].qualifiesForMargin, true);
  assert.equal(rows[0].marginPercent, 2);
  assert.equal(rows[1].weapon.name, 'Loose First');
  assert.equal(rows[1].qualifiesForMargin, true);
  assert.equal(rows[1].marginPercent, 10);
});

test('buildWeaponRecommendationRows drops one-shot range-qualified flags when the floor is too high', () => {
  resetBallisticFalloffProfiles();
  ingestBallisticFalloffCsvText(TEST_FALLOFF_CSV);

  const enemy = {
    name: 'Range Dummy',
    health: 500,
    zones: [
      makeZone('head', { health: 100, isFatal: true, av: 1, toMainPercent: 1 })
    ]
  };
  const weapons = [
    makeWeapon('Liberator', {
      code: 'AR-23',
      rows: [makeAttackRow('5.5x50mm FULL METAL JACKET_P', 105, 2)]
    })
  ];
  const expectedDistance = calculateMaxDistanceForDamageFloor(
    105,
    { caliber: 5.5, mass: 4.5, velocity: 900, drag: 0.3 },
    100
  );

  const pointBlankRows = buildWeaponRecommendationRows({
    enemy,
    weapons,
    rangeFloorMeters: 0
  });
  const beyondRangeRows = buildWeaponRecommendationRows({
    enemy,
    weapons,
    rangeFloorMeters: Math.ceil(expectedDistance) + 1
  });

  assert.equal(pointBlankRows[0].hasOneShotKill, true);
  assert.equal(beyondRangeRows[0].hasOneShotKill, false);
  assert.equal(beyondRangeRows[0].rangeStatus, 'failed');
});

test('buildWeaponRecommendationRows prefers shorter effective range when Margin rows otherwise tie', () => {
  resetBallisticFalloffProfiles();
  ingestBallisticFalloffCsvText(TEST_FALLOFF_CSV);

  const enemy = {
    name: 'Range Tie Dummy',
    health: 500,
    zones: [
      makeZone('head', { health: 100, isFatal: true, av: 1, toMainPercent: 1 })
    ]
  };
  const weapons = [
    makeWeapon('Short Reach', {
      code: 'AR-23',
      rows: [makeAttackRow('5.5x50mm FULL METAL JACKET_P', 105, 2)]
    }),
    makeWeapon('Long Reach', {
      code: 'R-63',
      rows: [makeAttackRow('8x60mm FULL METAL JACKET_P', 105, 2)]
    })
  ];

  const rows = buildWeaponRecommendationRows({
    enemy,
    weapons,
    rangeFloorMeters: 0
  });

  assert.equal(rows[0].weapon.name, 'Short Reach');
  assert.equal(rows[0].qualifiesForMargin, true);
  assert.equal(rows[0].marginPercent, 5);
  assert.equal(rows[1].weapon.name, 'Long Reach');
  assert.equal(rows[1].qualifiesForMargin, true);
  assert.equal(rows[1].marginPercent, 5);
  assert.ok(rows[0].effectiveDistance?.isAvailable);
  assert.ok(rows[1].effectiveDistance?.isAvailable);
  assert.ok(rows[0].effectiveDistance.meters < rows[1].effectiveDistance.meters);
});

test('buildWeaponRecommendationRows leaves Margin empty for automatic multi-shot rows', () => {
  const enemy = {
    name: 'Automatic Dummy',
    health: 500,
    zones: [
      makeZone('head', { health: 200, isFatal: true, av: 1, toMainPercent: 1 })
    ]
  };
  const weapons = [
    makeWeapon('Liberator', {
      index: 0,
      type: 'Primary',
      sub: 'AR',
      rows: [makeAttackRow('Liberator Burst', 30, 2)]
    })
  ];

  const rows = buildWeaponRecommendationRows({
    enemy,
    weapons,
    rangeFloorMeters: 0
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].weapon.name, 'Liberator');
  assert.equal(rows[0].shotsToKill, 7);
  assert.equal(rows[0].marginPercent, null);
  assert.equal(rows[0].qualifiesForMargin, false);
});

test('buildWeaponRecommendationRows can still show Margin for an automatic weapon that one-shots', () => {
  const enemy = {
    name: 'Automatic One-Shot Dummy',
    health: 500,
    zones: [
      makeZone('head', { health: 180, isFatal: true, av: 1, toMainPercent: 1 })
    ]
  };
  const weapons = [
    makeWeapon('Liberator', {
      index: 0,
      type: 'Primary',
      sub: 'AR',
      rows: [makeAttackRow('Liberator Burst', 200, 2)]
    })
  ];

  const rows = buildWeaponRecommendationRows({
    enemy,
    weapons,
    rangeFloorMeters: 0
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].weapon.name, 'Liberator');
  assert.equal(rows[0].shotsToKill, 1);
  assert.equal(rows[0].marginPercent, 11);
  assert.equal(rows[0].qualifiesForMargin, true);
});

test('buildWeaponRecommendationRows marks close two- and three-shot kills as near misses', () => {
  const enemy = {
    name: 'Near Miss Dummy',
    health: 240,
    zones: [
      makeZone('Main', { health: 240, av: 1, toMainPercent: 1 })
    ]
  };
  const weapons = [
    makeWeapon('Heavy Pistol', {
      index: 0,
      type: 'Secondary',
      sub: 'P',
      rows: [makeAttackRow('Heavy Pistol', 100, 3)]
    })
  ];

  const rows = buildWeaponRecommendationRows({
    enemy,
    weapons,
    rangeFloorMeters: 0
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].shotsToKill, 3);
  assert.equal(rows[0].marginPercent, null);
  assert.equal(rows[0].nearMissPercent, 60);
  assert.equal(rows[0].qualifiesForNearMiss, true);
});

test('buildWeaponRecommendationRows leaves long multi-shot rows out of near misses', () => {
  const enemy = {
    name: 'Long Spray Dummy',
    health: 340,
    zones: [
      makeZone('Main', { health: 340, av: 1, toMainPercent: 1 })
    ]
  };
  const weapons = [
    makeWeapon('Automatic Carbine', {
      index: 0,
      type: 'Primary',
      sub: 'AR',
      rows: [makeAttackRow('Automatic Carbine', 100, 2)]
    })
  ];

  const rows = buildWeaponRecommendationRows({
    enemy,
    weapons,
    rangeFloorMeters: 0
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].shotsToKill, 4);
  assert.equal(rows[0].nearMissPercent, null);
  assert.equal(rows[0].qualifiesForNearMiss, false);
});

test('buildWeaponRecommendationRows models realistic landed pellets for shotgun recommendations', () => {
  const enemy = {
    name: 'Shotgun Dummy',
    health: 600,
    zones: [
      makeZone('head', { health: 145, isFatal: true, av: 1, toMainPercent: 1 })
    ]
  };
  const weapons = [
    makeWeapon('Breaker', {
      code: 'SG-225',
      sub: 'SG',
      rows: [makeAttackRow('12g BUCKSHOT_P x11', 30, 2)]
    })
  ];

  const rows = buildWeaponRecommendationRows({
    enemy,
    weapons,
    rangeFloorMeters: 0
  });

  assert.equal(rows[0].hitCount, 5);
  assert.equal(rows[0].shotsToKill, 1);
  assert.equal(rows[0].hasOneShotKill, true);
});

test('buildWeaponRecommendationRows models nearby repeated explosions for Eagle Airstrike rows', () => {
  const enemy = {
    name: 'Airstrike Dummy',
    health: 3000,
    zones: [
      makeZone('head', { health: 1500, isFatal: true, av: 1, toMainPercent: 1 })
    ]
  };
  const weapons = [
    makeWeapon('EAGLE AIRSTRIKE', {
      type: 'Stratagem',
      sub: 'EGL',
      rows: [makeExplosionAttackRow('100KG BOMB_P_IE', 800, 5)]
    })
  ];

  const rows = buildWeaponRecommendationRows({
    enemy,
    weapons,
    rangeFloorMeters: 0
  });

  assert.equal(rows[0].hitCount, 2);
  assert.equal(rows[0].shotsToKill, 1);
  assert.equal(rows[0].hasOneShotKill, true);
});

test('buildWeaponRecommendationRows leaves pre-bundled volley rows at one firing cycle', () => {
  const enemy = {
    name: 'Volley Dummy',
    health: 1500,
    zones: [
      makeZone('head', { health: 1000, isFatal: true, av: 1, toMainPercent: 1 })
    ]
  };
  const weapons = [
    makeWeapon('Variable', {
      code: 'VG-70',
      sub: 'SPC',
      rows: [makeAttackRow('VG-70_P (Volley x7)', 595, 2)]
    })
  ];

  const rows = buildWeaponRecommendationRows({
    enemy,
    weapons,
    rangeFloorMeters: 0
  });

  assert.equal(rows[0].hitCount, 1);
  assert.equal(rows[0].shotsToKill, 2);
  assert.equal(rows[0].hasOneShotKill, false);
});

test('getEnemyTacticalInfoChips merges faction, class, and enemy-specific guidance', () => {
  const chips = getEnemyTacticalInfoChips({
    name: 'Factory Strider',
    faction: 'Automaton',
    scopeTags: ['giant']
  });

  assert.ok(chips.some((chip) => chip.value === 'Automatons'));
  assert.ok(chips.some((chip) => chip.value === 'Giant'));
  assert.ok(chips.some((chip) => /Factory Strider Gatling Gun/.test(chip.description)));
});

test('getEnemyWeakspotBundles exposes curated Factory Strider standalone and body targets together', () => {
  const bundles = getEnemyWeakspotBundles({
    name: 'Factory Strider',
    faction: 'Automaton',
    scopeTags: ['giant']
  });

  assert.equal(bundles.length, 1);
  assert.equal(bundles[0].label, 'Factory Strider weakspots');
  assert.deepEqual(
    bundles[0].entries.map((entry) => [
      entry.label,
      entry.sourceEnemyName,
      entry.sourceType,
      entry.sourceZoneNames || (entry.sourceZoneName ? [entry.sourceZoneName] : null)
    ]),
    [
      ['Belly panels', 'Factory Strider Belly Panels', 'enemy', null],
      ['Head / eye weakspot', 'Factory Strider', 'zone', ['head_body']],
      ['Engine weakspot', 'Factory Strider', 'zone', ['weakspot_engine']],
      ['Chin Gatling Gun', 'Factory Strider Gatling Gun', 'enemy', null],
      ['Cannon Turret', 'Cannon Turret', 'enemy', null]
    ]
  );
  assert.match(bundles[0].entries[0].description, /curated overlay target for the exposed underside belly panels/i);
  assert.match(bundles[0].entries[1].description, /same gameplay target as the exposed eye opening/i);
});

test('normalizeRecommendationRangeMeters keeps range input in a sane integer band', () => {
  assert.equal(normalizeRecommendationRangeMeters('30.7'), 31);
  assert.equal(normalizeRecommendationRangeMeters(-10), 0);
  assert.equal(normalizeRecommendationRangeMeters(999), 500);
});

test('buildWeaponRecommendationRows preserves numbered unknown labels from processed enemies', () => {
  const previousState = {
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

  try {
    processEnemyData({
      Automaton: {
        'Unknown Walker': {
          health: 600,
          damageable_zones: [
            makeZone('[unknown]', { health: 100, av: 1 }),
            makeZone('[unknown]', { health: 300, av: 1 })
          ]
        }
      }
    });

    const enemy = getEnemyUnitByName('Unknown Walker');
    const rows = buildWeaponRecommendationRows({
      enemy,
      weapons: [
        makeWeapon('Spotter', {
          rows: [makeAttackRow('Spotter', 100, 2)]
        })
      ],
      rangeFloorMeters: 0
    });

    assert.equal(rows[0].bestZoneName, '[unknown 1]');
    assert.deepEqual(
      rows[0].attackRecommendations[0].candidates.map((candidate) => candidate.zone.zone_name),
      ['[unknown 1]', '[unknown 2]']
    );
  } finally {
    enemyState.factions = previousState.factions;
    enemyState.units = previousState.units;
    enemyState.inlineUnits = previousState.inlineUnits;
    enemyState.filteredUnits = previousState.filteredUnits;
    enemyState.filterActive = previousState.filterActive;
    enemyState.sortKey = previousState.sortKey;
    enemyState.sortDir = previousState.sortDir;
    enemyState.factionIndex = previousState.factionIndex;
    enemyState.searchIndex = previousState.searchIndex;
    enemyState.unitIndex = previousState.unitIndex;
  }
});

test('buildWeaponRecommendationRows prioritizes the selected zone when multiple direct targets qualify', () => {
  const enemy = {
    name: 'Priority Dummy',
    health: 1000,
    zones: [
      makeZone('head', { health: 200, isFatal: true, av: 1, toMainPercent: 1 }),
      makeZone('body', { health: 120, isFatal: true, av: 1, toMainPercent: 1 })
    ]
  };
  const weapons = [
    makeWeapon('Picker', {
      rows: [makeAttackRow('Picker', 200, 2)]
    })
  ];

  const rows = buildWeaponRecommendationRows({
    enemy,
    weapons,
    rangeFloorMeters: 0,
    selectedZoneIndex: 1
  });

  assert.equal(rows[0].bestZoneName, 'body');
  assert.equal(rows[0].selectedZoneMatch, true);
});

test('buildWeaponRecommendationRows uses staged labels for gated Veracitor-style targets', () => {
  const enemy = {
    name: 'Veracitor',
    health: 3000,
    recommendationSequences: [
      {
        targetZoneName: 'pilot',
        label: 'pilot (via head)',
        suppressDirectTarget: true,
        steps: [{ zoneName: 'head' }, { zoneName: 'pilot' }]
      }
    ],
    zones: [
      makeZone('head', { health: 300, av: 1, toMainPercent: 0 }),
      makeZone('pilot', { health: 700, isFatal: true, av: 1, toMainPercent: 0 })
    ]
  };
  const weapons = [
    makeWeapon('Sequencer', {
      rpm: 60,
      rows: [makeAttackRow('Sequencer', 350, 2)]
    })
  ];

  const rows = buildWeaponRecommendationRows({
    enemy,
    weapons,
    rangeFloorMeters: 0
  });

  assert.equal(rows[0].bestZoneName, 'pilot (via head)');
  assert.equal(rows[0].isSequenceCandidate, true);
  assert.deepEqual(rows[0].matchedZoneNames, ['head', 'pilot']);
  assert.equal(rows[0].shotsToKill, 3);
  assert.equal(rows[0].bestAttackRecommendation.candidates.some((candidate) => candidate.label === 'pilot'), false);
});

test('buildSelectedTargetRecommendationRows ignores enemy-wide penetration when ranking a target', () => {
  const enemy = {
    name: 'Target Sort Dummy',
    health: 2000,
    zones: [
      makeZone('head', { health: 200, isFatal: true, av: 1, toMainPercent: 1 }),
      makeZone('left_hip', { health: 1600, isFatal: true, av: 1, toMainPercent: 1 })
    ]
  };
  const weapons = [
    makeWeapon('Broad Tool', {
      index: 0,
      rows: [makeAttackRow('Broad Tool', 400, 2)]
    }),
    makeWeapon('Target Tool', {
      index: 1,
      rows: [makeAttackRow('Target Tool', 1600, 2)]
    })
  ];

  const rows = buildSelectedTargetRecommendationRows({
    enemy,
    weapons,
    rangeFloorMeters: 0,
    selectedZoneIndex: 1
  });

  assert.equal(rows[0].weapon.name, 'Target Tool');
  assert.equal(rows[0].bestZoneName, 'left_hip');
  assert.equal(rows[0].hasOneShotKill, true);
});

test('buildRelatedTargetRecommendationRows ranks linked targets without pretending they were directly selected', () => {
  const enemy = {
    name: 'Heavy Devastator',
    health: 600,
    zones: [
      makeZone('shoulderplate_left', { health: 150, av: 4, toMainPercent: 0 }),
      makeZone('left_arm', { health: 100, av: 1, toMainPercent: 0.5 }),
      makeZone('head', { health: 220, isFatal: true, av: 1, toMainPercent: 1 })
    ]
  };
  const weapons = [
    makeWeapon('Pad Breaker', {
      index: 0,
      rows: [makeAttackRow('Pad Breaker', 150, 4)]
    }),
    makeWeapon('Arm Cleaner', {
      index: 1,
      rows: [makeAttackRow('Arm Cleaner', 100, 2)]
    })
  ];

  const rows = buildRelatedTargetRecommendationRows({
    enemy,
    weapons,
    rangeFloorMeters: 0,
    relatedZoneIndices: [1]
  });

  assert.equal(rows[0].weapon.name, 'Arm Cleaner');
  assert.equal(rows[0].bestZoneName, 'left_arm');
  assert.equal(rows[0].selectedZoneMatch, false);
  assert.equal(rows[0].shotsToKill, 1);
  assert.equal(rows[0].bestOutcomeKind, 'limb');
});

test('buildSelectedTargetRecommendationRows excludes main-only bypass answers for a routed selected part', () => {
  const enemy = {
    name: 'Routed Dummy',
    health: 240,
    zones: [
      makeZone('Main', { health: 240, av: 1, toMainPercent: 1 }),
      {
        ...makeZone('head', { health: 100, av: 1, toMainPercent: 0.5 }),
        ExTarget: 'Main'
      }
    ]
  };
  const weapons = [
    makeWeapon('Barrage', {
      rows: [makeExplosionAttackRow('120mm HE_E', 120, 3)]
    })
  ];

  const rows = buildSelectedTargetRecommendationRows({
    enemy,
    weapons,
    rangeFloorMeters: 0,
    selectedZoneIndex: 1
  });

  assert.equal(rows.length, 0);
});

test('buildSelectedTargetRecommendationRows keeps main kills when the selected part still takes damage', () => {
  const enemy = {
    name: 'Transfer Dummy',
    health: 200,
    zones: [
      makeZone('Main', { health: 200, av: 1, toMainPercent: 1 }),
      makeZone('head', { health: 400, av: 1, toMainPercent: 1 })
    ]
  };
  const weapons = [
    makeWeapon('Blast Cannon', {
      rows: [makeExplosionAttackRow('Blast Cannon_E', 120, 3)]
    })
  ];

  const rows = buildSelectedTargetRecommendationRows({
    enemy,
    weapons,
    rangeFloorMeters: 0,
    selectedZoneIndex: 1
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].bestZoneName, 'head');
  assert.equal(rows[0].bestOutcomeKind, 'main');
});

test('buildWeaponRecommendationRows hides peripheral main-route recommendations when no-main-via-limbs is enabled', () => {
  const enemy = {
    name: 'Peripheral Route Dummy',
    health: 240,
    zones: [
      makeZone('Main', { health: 240, av: 10, toMainPercent: 1 }),
      makeZone('rear_leg', { health: 800, av: 1, toMainPercent: 0.35 })
    ]
  };
  const weapons = [
    makeWeapon('Heavy Ordnance', {
      type: 'Stratagem',
      rows: [makeExplosionAttackRow('Heavy Ordnance_E', 300, 4)]
    })
  ];

  const visibleRows = buildWeaponRecommendationRows({
    enemy,
    weapons,
    rangeFloorMeters: 0,
    hidePeripheralMainRoutes: false
  });
  const hiddenRows = buildWeaponRecommendationRows({
    enemy,
    weapons,
    rangeFloorMeters: 0,
    hidePeripheralMainRoutes: true
  });

  assert.equal(visibleRows.length, 1);
  assert.equal(visibleRows[0].bestZoneName, 'rear_leg');
  assert.equal(visibleRows[0].bestOutcomeKind, 'main');
  assert.equal(hiddenRows.length, 0);
});

test('buildSelectedTargetRecommendationRows hides peripheral main-route answers when no-main-via-limbs is enabled', () => {
  const enemy = {
    name: 'Peripheral Target Dummy',
    health: 240,
    zones: [
      makeZone('Main', { health: 240, av: 1, toMainPercent: 1 }),
      makeZone('rear_leg', { health: 800, av: 1, toMainPercent: 0.35 })
    ]
  };
  const weapons = [
    makeWeapon('Heavy Ordnance', {
      type: 'Stratagem',
      rows: [makeExplosionAttackRow('Heavy Ordnance_E', 300, 4)]
    })
  ];

  const visibleRows = buildSelectedTargetRecommendationRows({
    enemy,
    weapons,
    rangeFloorMeters: 0,
    selectedZoneIndex: 1,
    hidePeripheralMainRoutes: false
  });
  const hiddenRows = buildSelectedTargetRecommendationRows({
    enemy,
    weapons,
    rangeFloorMeters: 0,
    selectedZoneIndex: 1,
    hidePeripheralMainRoutes: true
  });

  assert.equal(visibleRows.length, 1);
  assert.equal(visibleRows[0].bestZoneName, 'rear_leg');
  assert.equal(visibleRows[0].bestOutcomeKind, 'main');
  assert.equal(hiddenRows.length, 0);
});

test('buildWeaponRecommendationRows keeps relation-group priority targets when no-main-via-limbs is enabled', () => {
  const enemy = {
    name: 'Relation Dummy',
    health: 240,
    zoneRelationGroups: [
      {
        id: 'left-arm',
        label: 'Left arm',
        zoneNames: ['shoulderplate_left', 'left_arm'],
        mirrorGroupIds: [],
        priorityTargetZoneNames: ['left_arm']
      }
    ],
    zones: [
      makeZone('Main', { health: 240, av: 10, toMainPercent: 1 }),
      makeZone('shoulderplate_left', { health: 800, av: 1, toMainPercent: 0.35 }),
      makeZone('left_arm', { health: 800, av: 1, toMainPercent: 0.5 })
    ]
  };
  const weapons = [
    makeWeapon('Heavy Ordnance', {
      type: 'Stratagem',
      rows: [makeExplosionAttackRow('Heavy Ordnance_E', 480, 4)]
    })
  ];

  const rows = buildWeaponRecommendationRows({
    enemy,
    weapons,
    rangeFloorMeters: 0,
    hidePeripheralMainRoutes: true
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].bestZoneName, 'left_arm');
  assert.equal(rows[0].bestOutcomeKind, 'main');
});

test('buildSelectedTargetRecommendationRows keeps the combined stratagem package instead of the pure projectile row', () => {
  const enemy = {
    name: 'Stratagem Dummy',
    health: 500,
    zones: [
      makeZone('Main', { health: 500, av: 1, toMainPercent: 1 }),
      makeZone('head', { health: 100, isFatal: true, av: 1, toMainPercent: 1 })
    ]
  };
  const weapons = [
    makeWeapon('Eagle Smoke Strike', {
      type: 'Stratagem',
      rows: [
        makeAttackRow('100KG BOMB_P', 100, 2),
        makeExplosionAttackRow('100KG BOMB_P_IE', 20, 3)
      ]
    })
  ];

  const targetedRows = buildSelectedTargetRecommendationRows({
    enemy,
    weapons,
    rangeFloorMeters: 0,
    selectedZoneIndex: 1
  });
  const overallRows = buildWeaponRecommendationRows({
    enemy,
    weapons,
    rangeFloorMeters: 0
  });

  assert.equal(targetedRows.length, 1);
  assert.equal(targetedRows[0].attackName, '100KG BOMB [Proj + Blast]');
  assert.equal(targetedRows[0].isCombinedPackage, true);
  assert.equal(overallRows.length, 1);
  assert.equal(overallRows[0].attackName, '100KG BOMB_P');
});

test('buildSelectedTargetRecommendationRows can rank a combined projectile and blast package', () => {
  const enemy = {
    name: 'Package Dummy',
    health: 1000,
    zones: [
      makeZone('core', { health: 430, isFatal: true, av: 1, toMainPercent: 1 })
    ]
  };
  const weapons = [
    makeWeapon('Packager', {
      rows: [
        makeAttackRow('15x100mm HIGH EXPLOSIVE_P', 230, 4),
        makeExplosionAttackRow('15x100mm HIGH EXPLOSIVE_P_IE', 225, 3),
        makeAttackRow('SHRAPNEL_P x30', 110, 3)
      ]
    })
  ];

  const rows = buildSelectedTargetRecommendationRows({
    enemy,
    weapons,
    rangeFloorMeters: 0,
    selectedZoneIndex: 0
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].attackName, '15x100mm HIGH EXPLOSIVE [Proj + Blast]');
  assert.equal(rows[0].isCombinedPackage, true);
  assert.deepEqual(
    rows[0].packageComponents.map((component) => component.attackName),
    ['15x100mm HIGH EXPLOSIVE_P', '15x100mm HIGH EXPLOSIVE_P_IE']
  );
  assert.equal(rows[0].shotsToKill, 1);
  assert.equal(rows[0].bestOutcomeKind, 'fatal');
});

test('buildSelectedTargetRecommendationRows excludes shrapnel from conservative auto-packages', () => {
  const enemy = {
    name: 'Conservative Dummy',
    health: 1000,
    zones: [
      makeZone('core', { health: 560, isFatal: true, av: 1, toMainPercent: 1 })
    ]
  };
  const weapons = [
    makeWeapon('Packager', {
      rows: [
        makeAttackRow('15x100mm HIGH EXPLOSIVE_P', 230, 4),
        makeExplosionAttackRow('15x100mm HIGH EXPLOSIVE_P_IE', 225, 3),
        makeAttackRow('SHRAPNEL_P x30', 110, 3)
      ]
    })
  ];

  const rows = buildSelectedTargetRecommendationRows({
    enemy,
    weapons,
    rangeFloorMeters: 0,
    selectedZoneIndex: 0
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].attackName, '15x100mm HIGH EXPLOSIVE [Proj + Blast]');
  assert.equal(rows[0].shotsToKill, 2);
  assert.equal(rows[0].hasOneShotKill, false);
  assert.deepEqual(
    rows[0].packageComponents.map((component) => component.attackName),
    ['15x100mm HIGH EXPLOSIVE_P', '15x100mm HIGH EXPLOSIVE_P_IE']
  );
});

test('buildSelectedTargetRecommendationRows prefers the original attack row when a package does not change the selected-part result', () => {
  const enemy = {
    name: 'Armor Dummy',
    health: 1000,
    zones: [
      makeZone('core', { health: 500, isFatal: true, av: 5, toMainPercent: 1 })
    ]
  };
  const weapons = [
    makeWeapon('Heavy Round', {
      rows: [
        makeAttackRow('90mm SABOT_P', 500, 6),
        makeExplosionAttackRow('90mm SABOT_P_IE', 50, 3)
      ]
    })
  ];

  const rows = buildSelectedTargetRecommendationRows({
    enemy,
    weapons,
    rangeFloorMeters: 0,
    selectedZoneIndex: 0
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].attackName, '90mm SABOT_P');
  assert.equal(rows[0].isCombinedPackage, false);
  assert.equal(rows[0].shotsToKill, 1);
  assert.equal(rows[0].bestOutcomeKind, 'fatal');
});

test('buildSelectedTargetRecommendationRows keeps staged target paths when a combined package is best', () => {
  const enemy = {
    name: 'Sequenced Package Dummy',
    health: 1000,
    recommendationSequences: [
      {
        targetZoneName: 'pilot',
        label: 'pilot (via head)',
        suppressDirectTarget: true,
        steps: [{ zoneName: 'head' }, { zoneName: 'pilot' }]
      }
    ],
    zones: [
      makeZone('head', { health: 230, av: 1, toMainPercent: 0 }),
      makeZone('pilot', { health: 300, isFatal: true, av: 1, toMainPercent: 0 })
    ]
  };
  const weapons = [
    makeWeapon('Packager', {
      rpm: 60,
      rows: [
        makeAttackRow('15x100mm HIGH EXPLOSIVE_P', 230, 4),
        makeExplosionAttackRow('15x100mm HIGH EXPLOSIVE_P_IE', 225, 3)
      ]
    })
  ];

  const rows = buildSelectedTargetRecommendationRows({
    enemy,
    weapons,
    rangeFloorMeters: 0,
    selectedZoneIndex: 1
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].attackName, '15x100mm HIGH EXPLOSIVE [Proj + Blast]');
  assert.equal(rows[0].bestZoneName, 'pilot (via head)');
  assert.equal(rows[0].isSequenceCandidate, true);
  assert.deepEqual(rows[0].matchedZoneNames, ['head', 'pilot']);
  assert.equal(rows[0].shotsToKill, 2);
});

test('buildSelectedTargetRecommendationRows does not suppress the pure projectile recommendation for a non-stratagem weapon with same-event explosive rows', () => {
  // Regression: applyStratagemPrecisionFilter must only run for stratagem-type weapons.
  // A grenade-style non-stratagem weapon has both a projectile row and an explosive row
  // sharing the same event prefix. The standalone projectile recommendation must remain
  // visible alongside the combined package even though a dominant explosive event key exists.
  const enemy = {
    name: 'Grenade Dummy',
    health: 500,
    zones: [
      makeZone('body', { health: 180, isFatal: true, av: 1, toMainPercent: 1 })
    ]
  };
  const weapons = [
    makeWeapon('G-7 Pineapple', {
      type: 'Grenade',
      rows: [
        makeAttackRow('G-7 PINEAPPLE_P', 100, 3),
        makeExplosionAttackRow('G-7 PINEAPPLE_P_IE', 130, 2)
      ]
    })
  ];

  const rows = buildSelectedTargetRecommendationRows({
    enemy,
    weapons,
    rangeFloorMeters: 0,
    selectedZoneIndex: 0
  });

  assert.equal(rows.length, 1);
  const { attackRecommendations } = rows[0];

  // Combined package (100 + 130 = 230 > 180) kills in one shot and must be present.
  const combinedRec = attackRecommendations.find((r) => r.isCombinedPackage);
  assert.ok(combinedRec, 'combined package recommendation should be present');
  assert.equal(combinedRec.bestCandidate?.shotsToKill, 1);

  // Standalone projectile (100 dmg, 2 shots) must NOT be suppressed for non-stratagem weapons.
  const projectileRec = attackRecommendations.find(
    (r) => !r.isCombinedPackage && r.attackName === 'G-7 PINEAPPLE_P'
  );
  assert.ok(projectileRec, 'standalone projectile recommendation must not be suppressed for non-stratagem weapons');
  assert.equal(projectileRec.bestCandidate?.shotsToKill, 2);
});

test('buildWeaponRecommendationRows exposes nearMissDisplayPercent for comfortable 2-3 shot lethal kills', () => {
  // Senator-like weapon: 3 shots, last shot overkills comfortably → should populate nearMissDisplayPercent
  const enemy = {
    name: 'Senator Dummy',
    health: 240,
    zones: [
      makeZone('Main', { health: 240, av: 1, toMainPercent: 1 })
    ]
  };
  const weapons = [
    makeWeapon('Senator', {
      index: 0,
      type: 'Secondary',
      sub: 'P',
      rows: [makeAttackRow('Senator', 100, 3)]
    })
  ];

  const rows = buildWeaponRecommendationRows({
    enemy,
    weapons,
    rangeFloorMeters: 0
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].shotsToKill, 3);
  assert.equal(rows[0].marginPercent, null, 'one-shot margin must remain null for multi-shot rows');
  assert.equal(rows[0].qualifiesForMargin, false, 'one-shot qualify flag must stay false');
  assert.equal(rows[0].nearMissPercent, 60, 'underlying nearMissPercent should be present');
  assert.equal(rows[0].nearMissDisplayPercent, 60, 'nearMissDisplayPercent should equal nearMissPercent for multi-shot rows');
});

test('buildWeaponRecommendationRows keeps nearMissDisplayPercent null for one-shot kills', () => {
  const enemy = {
    name: 'One-Shot Dummy',
    health: 500,
    zones: [
      makeZone('head', { health: 100, isFatal: true, av: 1, toMainPercent: 1 })
    ]
  };
  const weapons = [
    makeWeapon('Killshot', {
      index: 0,
      rows: [makeAttackRow('Killshot', 110, 2)]
    })
  ];

  const rows = buildWeaponRecommendationRows({
    enemy,
    weapons,
    rangeFloorMeters: 0
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].shotsToKill, 1);
  assert.equal(rows[0].marginPercent, 10, 'one-shot margin should still be set');
  assert.equal(rows[0].nearMissDisplayPercent, null, 'nearMissDisplayPercent must be null when marginPercent is available');
});

test('buildWeaponRecommendationRows keeps nearMissDisplayPercent null for long multi-shot automatic rows', () => {
  const enemy = {
    name: 'Long Spray Target',
    health: 340,
    zones: [
      makeZone('Main', { health: 340, av: 1, toMainPercent: 1 })
    ]
  };
  const weapons = [
    makeWeapon('Automatic Carbine', {
      index: 0,
      type: 'Primary',
      sub: 'AR',
      rows: [makeAttackRow('Automatic Carbine', 100, 2)]
    })
  ];

  const rows = buildWeaponRecommendationRows({
    enemy,
    weapons,
    rangeFloorMeters: 0
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].shotsToKill, 4, 'must be beyond the near-miss 3-shot cap');
  assert.equal(rows[0].nearMissPercent, null, 'no near miss for long spray');
  assert.equal(rows[0].nearMissDisplayPercent, null, 'nearMissDisplayPercent must remain null for long sprays');
});
