// Tests for enemy zone grouping model (calculator/enemy-zone-groups.js).
// Covers explicit zoneRelationGroups grouping, auto-fallback clustering,
// stem extraction, signature derivation, and edge cases.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildEnemyZoneGroups,
  autoClusterZones,
  getZoneCombatSignature,
  getZoneNameStem
} from '../calculator/enemy-zone-groups.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeZone(overrides = {}) {
  return {
    zone_name: 'Main',
    AV: 0,
    'Dur%': 0,
    health: 200,
    Con: 0,
    ExMult: null,
    ExTarget: 'Main',
    'ToMain%': 1,
    MainCap: 1,
    IsFatal: false,
    ...overrides
  };
}

function makeEnemy({ zones = [], zoneRelationGroups = [] } = {}) {
  return { zones, zoneRelationGroups };
}

// ─── getZoneNameStem ─────────────────────────────────────────────────────────

test('getZoneNameStem strips leading left_ prefix', () => {
  assert.equal(getZoneNameStem('left_pauldron'), 'pauldron');
});

test('getZoneNameStem strips trailing _left suffix', () => {
  assert.equal(getZoneNameStem('shoulderplate_left'), 'shoulderplate');
});

test('getZoneNameStem strips leading right_ prefix', () => {
  assert.equal(getZoneNameStem('right_pauldron'), 'pauldron');
});

test('getZoneNameStem strips trailing _right suffix', () => {
  assert.equal(getZoneNameStem('shoulderplate_right'), 'shoulderplate');
});

test('getZoneNameStem strips left in compound names', () => {
  assert.equal(getZoneNameStem('left_upper_arm'), 'upper_arm');
});

test('getZoneNameStem strips right in compound names', () => {
  assert.equal(getZoneNameStem('right_upper_arm'), 'upper_arm');
});

test('getZoneNameStem strips compact l/r tokens in compound names', () => {
  assert.equal(getZoneNameStem('armor_lower_l_arm'), 'armor_lower_arm');
  assert.equal(getZoneNameStem('armor_lower_r_arm'), 'armor_lower_arm');
});

test('getZoneNameStem preserves front token', () => {
  assert.equal(getZoneNameStem('front_torso'), 'front_torso');
});

test('getZoneNameStem preserves rear token', () => {
  assert.equal(getZoneNameStem('rear_exhaust'), 'rear_exhaust');
});

test('getZoneNameStem preserves upper and lower tokens', () => {
  assert.equal(getZoneNameStem('upper_leg'), 'upper_leg');
  assert.equal(getZoneNameStem('lower_leg'), 'lower_leg');
});

test('getZoneNameStem strips left but keeps rear in a compound name', () => {
  assert.equal(getZoneNameStem('rear_left_exhaust'), 'rear_exhaust');
  assert.equal(getZoneNameStem('rear_right_exhaust'), 'rear_exhaust');
});

test('getZoneNameStem strips compact l/r but keeps front and rear tokens', () => {
  assert.equal(getZoneNameStem('hitzone_l_rear_leg'), 'hitzone_rear_leg');
  assert.equal(getZoneNameStem('hitzone_r_front_leg'), 'hitzone_front_leg');
});

test('getZoneNameStem falls back to normalized name when entire name is a laterality token', () => {
  // "left" alone: nothing remains after stripping → fall back
  assert.equal(getZoneNameStem('left'), 'left');
  assert.equal(getZoneNameStem('right'), 'right');
});

test('getZoneNameStem returns normalized name unchanged when no laterality tokens', () => {
  assert.equal(getZoneNameStem('head'), 'head');
  assert.equal(getZoneNameStem('Main'), 'main');
  assert.equal(getZoneNameStem('torso_armor'), 'torso_armor');
});

test('getZoneNameStem handles empty and null gracefully', () => {
  assert.equal(getZoneNameStem(''), '');
  assert.equal(getZoneNameStem(null), '');
  assert.equal(getZoneNameStem(undefined), '');
});

// ─── getZoneCombatSignature ───────────────────────────────────────────────────

test('getZoneCombatSignature produces identical signatures for identical zones', () => {
  const z1 = makeZone({ AV: 3, 'Dur%': 1, health: 500 });
  const z2 = makeZone({ AV: 3, 'Dur%': 1, health: 500 });
  assert.equal(getZoneCombatSignature(z1), getZoneCombatSignature(z2));
});

test('getZoneCombatSignature produces different signatures for different AV', () => {
  const z1 = makeZone({ AV: 2 });
  const z2 = makeZone({ AV: 3 });
  assert.notEqual(getZoneCombatSignature(z1), getZoneCombatSignature(z2));
});

test('getZoneCombatSignature produces different signatures for different health', () => {
  const z1 = makeZone({ health: 300 });
  const z2 = makeZone({ health: 400 });
  assert.notEqual(getZoneCombatSignature(z1), getZoneCombatSignature(z2));
});

test('getZoneCombatSignature is not influenced by zone_name or other non-combat fields', () => {
  const z1 = makeZone({ zone_name: 'left_arm', AV: 2, health: 300 });
  const z2 = makeZone({ zone_name: 'right_arm', AV: 2, health: 300 });
  assert.equal(getZoneCombatSignature(z1), getZoneCombatSignature(z2));
});

test('getZoneCombatSignature handles null/undefined zone gracefully', () => {
  assert.doesNotThrow(() => getZoneCombatSignature(null));
  assert.doesNotThrow(() => getZoneCombatSignature(undefined));
  assert.equal(typeof getZoneCombatSignature(null), 'string');
});

// ─── buildEnemyZoneGroups — basic structure ───────────────────────────────────

test('buildEnemyZoneGroups returns empty families for an enemy with no zones', () => {
  const result = buildEnemyZoneGroups(makeEnemy());
  assert.deepEqual(result.families, []);
  assert.equal(result.zoneIndexToFamilyId.size, 0);
});

test('buildEnemyZoneGroups returns one singleton family per zone when all stats differ', () => {
  const enemy = makeEnemy({
    zones: [
      makeZone({ zone_name: 'Main', health: 1000 }),
      makeZone({ zone_name: 'head', health: 150, IsFatal: true }),
      makeZone({ zone_name: 'torso', health: 600, AV: 2 })
    ]
  });
  const { families, zoneIndexToFamilyId } = buildEnemyZoneGroups(enemy);
  assert.equal(families.length, 3);
  assert.ok(families.every((f) => f.isSingleton));
  assert.equal(zoneIndexToFamilyId.size, 3);
});

test('buildEnemyZoneGroups assigns every zone index to exactly one family', () => {
  const enemy = makeEnemy({
    zones: [
      makeZone({ zone_name: 'left_arm', AV: 2, health: 300 }),
      makeZone({ zone_name: 'right_arm', AV: 2, health: 300 }),
      makeZone({ zone_name: 'head', health: 150 })
    ]
  });
  const { families, zoneIndexToFamilyId } = buildEnemyZoneGroups(enemy);

  // Each zone index (0, 1, 2) must appear exactly once across all families.
  const allMemberIndices = families.flatMap((f) => f.memberIndices);
  assert.deepEqual(allMemberIndices.sort((a, b) => a - b), [0, 1, 2]);
  assert.equal(zoneIndexToFamilyId.size, 3);
});

// ─── buildEnemyZoneGroups — auto-fallback clustering ─────────────────────────

test('auto-groups two zones with identical stats and compatible stem (left/right)', () => {
  const zoneL = makeZone({ zone_name: 'left_pauldron', AV: 2, 'Dur%': 0.35, health: 200 });
  const zoneR = makeZone({ zone_name: 'right_pauldron', AV: 2, 'Dur%': 0.35, health: 200 });
  const enemy = makeEnemy({ zones: [zoneL, zoneR] });
  const { families } = buildEnemyZoneGroups(enemy);

  assert.equal(families.length, 1);
  const [fam] = families;
  assert.equal(fam.isSingleton, false);
  assert.equal(fam.isExplicit, false);
  assert.deepEqual(fam.memberIndices, [0, 1]);
  assert.equal(fam.representativeIndex, 0);
  // Label derived from stem (underscores → spaces)
  assert.equal(fam.label, 'pauldron');
  assert.equal(fam.summaryLabel, 'pauldron (×2)');
});

test('auto-groups compact l/r mirrored zones with identical stats', () => {
  const zoneL = makeZone({ zone_name: 'l_claw', AV: 2, 'Dur%': 0.5, health: 200, 'ToMain%': 0.4, MainCap: 0 });
  const zoneR = makeZone({ zone_name: 'r_claw', AV: 2, 'Dur%': 0.5, health: 200, 'ToMain%': 0.4, MainCap: 0 });
  const enemy = makeEnemy({ zones: [zoneL, zoneR] });
  const { families } = buildEnemyZoneGroups(enemy);

  assert.equal(families.length, 1);
  assert.equal(families[0].label, 'claw');
  assert.deepEqual(families[0].memberIndices, [0, 1]);
});

test('auto-groups compact l/r interior tokens while preserving front/rear distinction', () => {
  const base = { AV: 1, 'Dur%': 0.5, health: 200, Con: 0, ExMult: null, ExTarget: 'Main', 'ToMain%': 0.6, MainCap: 0, IsFatal: false };
  const enemy = makeEnemy({
    zones: [
      { zone_name: 'hitzone_l_rear_leg', ...base },
      { zone_name: 'hitzone_r_rear_leg', ...base },
      { zone_name: 'hitzone_l_front_leg', ...base },
      { zone_name: 'hitzone_r_front_leg', ...base }
    ]
  });
  const { families } = buildEnemyZoneGroups(enemy);

  assert.equal(families.length, 2);
  assert.deepEqual(families.map((family) => family.memberIndices), [[0, 1], [2, 3]]);
  assert.deepEqual(families.map((family) => family.label), ['hitzone rear leg', 'hitzone front leg']);
});

test('auto-groups three zones with identical stats and compatible stem', () => {
  const baseZone = { AV: 1, 'Dur%': 0, health: 300, Con: 0, ExMult: null, ExTarget: 'Main', 'ToMain%': 0.3, MainCap: 0, IsFatal: false };
  const enemy = makeEnemy({
    zones: [
      { zone_name: 'left_pauldron', ...baseZone },
      { zone_name: 'right_pauldron', ...baseZone },
      { zone_name: 'head', ...baseZone, health: 150 }  // different health – stays separate
    ]
  });
  const { families } = buildEnemyZoneGroups(enemy);

  assert.equal(families.length, 2);
  const grouped = families.find((f) => !f.isSingleton);
  assert.ok(grouped, 'expected a multi-member family');
  assert.equal(grouped.memberIndices.length, 2);
  assert.deepEqual(grouped.memberIndices, [0, 1]);
});

test('does NOT auto-group zones with identical stats but different stems', () => {
  const base = { AV: 2, 'Dur%': 0, health: 300, Con: 0, ExMult: null, ExTarget: 'Main', 'ToMain%': 1, MainCap: 1, IsFatal: false };
  const enemy = makeEnemy({
    zones: [
      { zone_name: 'left_arm', ...base },
      { zone_name: 'left_leg', ...base }
    ]
  });
  const { families } = buildEnemyZoneGroups(enemy);

  assert.equal(families.length, 2);
  assert.ok(families.every((f) => f.isSingleton));
});

test('does NOT auto-group zones with different stats even if names are compatible', () => {
  const enemy = makeEnemy({
    zones: [
      makeZone({ zone_name: 'left_arm', AV: 2, health: 300 }),
      makeZone({ zone_name: 'right_arm', AV: 3, health: 300 })  // different AV
    ]
  });
  const { families } = buildEnemyZoneGroups(enemy);

  assert.equal(families.length, 2);
  assert.ok(families.every((f) => f.isSingleton));
});

test('preserves front/rear distinction — does NOT group front_torso with rear_torso', () => {
  const base = { AV: 2, 'Dur%': 0.5, health: 500, Con: 0, ExMult: null, ExTarget: 'Part', 'ToMain%': 1, MainCap: 0, IsFatal: false };
  const enemy = makeEnemy({
    zones: [
      { zone_name: 'front_torso', ...base },
      { zone_name: 'rear_torso', ...base }
    ]
  });
  const { families } = buildEnemyZoneGroups(enemy);

  assert.equal(families.length, 2);
  assert.ok(families.every((f) => f.isSingleton));
});

test('auto-groups rear_left_exhaust and rear_right_exhaust (left/right stripped, rear kept)', () => {
  const base = { AV: 1, 'Dur%': 0, health: 200, Con: 0, ExMult: null, ExTarget: 'Main', 'ToMain%': 1, MainCap: 1, IsFatal: false };
  const enemy = makeEnemy({
    zones: [
      { zone_name: 'rear_left_exhaust', ...base },
      { zone_name: 'rear_right_exhaust', ...base }
    ]
  });
  const { families } = buildEnemyZoneGroups(enemy);

  assert.equal(families.length, 1);
  assert.equal(families[0].isSingleton, false);
  assert.equal(families[0].label, 'rear exhaust');
  assert.equal(families[0].summaryLabel, 'rear exhaust (×2)');
});

// ─── buildEnemyZoneGroups — explicit zoneRelationGroups ────────────────────────

test('uses explicit zoneRelationGroups and creates correct families', () => {
  const enemy = {
    zones: [
      makeZone({ zone_name: 'left_hip', AV: 3, health: 400, IsFatal: true }),
      makeZone({ zone_name: 'left_upper_leg', AV: 2, health: 500 }),
      makeZone({ zone_name: 'right_hip', AV: 3, health: 400, IsFatal: true })
    ],
    zoneRelationGroups: [
      { id: 'left-leg', label: 'Left leg', zoneNames: ['left_hip', 'left_upper_leg'], mirrorGroupIds: ['right-leg'], priorityTargetZoneNames: ['left_hip'] },
      { id: 'right-leg', label: 'Right leg', zoneNames: ['right_hip'], mirrorGroupIds: ['left-leg'], priorityTargetZoneNames: ['right_hip'] }
    ]
  };

  const { families, zoneIndexToFamilyId } = buildEnemyZoneGroups(enemy);

  assert.equal(families.length, 2);

  const leftLeg = families.find((f) => f.groupId === 'left-leg');
  assert.ok(leftLeg, 'expected left-leg family');
  assert.equal(leftLeg.isExplicit, true);
  assert.equal(leftLeg.isSingleton, false);
  assert.deepEqual(leftLeg.memberIndices, [0, 1]);
  assert.equal(leftLeg.label, 'Left leg');
  assert.equal(leftLeg.summaryLabel, 'Left leg (×2)');
  assert.equal(leftLeg.representativeIndex, 0);

  const rightLeg = families.find((f) => f.groupId === 'right-leg');
  assert.ok(rightLeg, 'expected right-leg family');
  assert.equal(rightLeg.isExplicit, true);
  assert.equal(rightLeg.isSingleton, true);
  assert.deepEqual(rightLeg.memberIndices, [2]);
  assert.equal(rightLeg.label, 'Right leg');
  assert.equal(rightLeg.summaryLabel, 'Right leg');

  assert.equal(zoneIndexToFamilyId.get(0), 'explicit:left-leg');
  assert.equal(zoneIndexToFamilyId.get(1), 'explicit:left-leg');
  assert.equal(zoneIndexToFamilyId.get(2), 'explicit:right-leg');
});

test('explicit groups cover some zones; remaining ungrouped zones go through auto-fallback', () => {
  const base = { AV: 1, 'Dur%': 0, health: 200, Con: 0, ExMult: null, ExTarget: 'Main', 'ToMain%': 1, MainCap: 1, IsFatal: false };
  const enemy = {
    zones: [
      { zone_name: 'left_arm', ...base, health: 300 },
      { zone_name: 'right_arm', ...base, health: 300 },
      { zone_name: 'left_pauldron', ...base },
      { zone_name: 'right_pauldron', ...base }
    ],
    zoneRelationGroups: [
      { id: 'left-arm', label: 'Left arm', zoneNames: ['left_arm', 'left_pauldron'], mirrorGroupIds: [], priorityTargetZoneNames: [] }
    ]
  };

  const { families, zoneIndexToFamilyId } = buildEnemyZoneGroups(enemy);

  // Explicit group covers indices 0 and 2.
  const explicitFam = families.find((f) => f.isExplicit);
  assert.ok(explicitFam);
  assert.deepEqual(explicitFam.memberIndices, [0, 2]);

  // Remaining zones (1, 3) have identical stats but different stems after
  // stripping left/right → "arm" vs "pauldron" → each becomes a singleton.
  const autoFamilies = families.filter((f) => !f.isExplicit);
  assert.equal(autoFamilies.length, 2);
  assert.ok(autoFamilies.every((f) => f.isSingleton));

  // All 4 indices are assigned.
  assert.equal(zoneIndexToFamilyId.size, 4);
});

test('auto-groups remaining ungrouped zones after explicit groups when stats and stems match', () => {
  const base = { AV: 2, 'Dur%': 0.35, health: 200, Con: 0, ExMult: null, ExTarget: 'Part', 'ToMain%': 0.3, MainCap: 0, IsFatal: false };
  const enemy = {
    zones: [
      { zone_name: 'left_arm', AV: 2, health: 300, 'Dur%': 0, Con: 0, ExMult: null, ExTarget: 'Main', 'ToMain%': 0.5, MainCap: 1, IsFatal: true },
      { zone_name: 'left_pauldron', ...base },
      { zone_name: 'right_pauldron', ...base }
    ],
    zoneRelationGroups: [
      { id: 'left-arm', label: 'Left arm', zoneNames: ['left_arm'], mirrorGroupIds: [], priorityTargetZoneNames: [] }
    ]
  };

  const { families } = buildEnemyZoneGroups(enemy);
  // Explicit: [0]; Auto-grouped pauldrons: [1, 2].
  assert.equal(families.length, 2);

  const pauldronFam = families.find((f) => !f.isExplicit);
  assert.ok(pauldronFam);
  assert.equal(pauldronFam.isSingleton, false);
  assert.deepEqual(pauldronFam.memberIndices, [1, 2]);
  assert.equal(pauldronFam.label, 'pauldron');
});

// ─── buildEnemyZoneGroups — stable ordering ────────────────────────────────────

test('families are sorted by representative zone index', () => {
  const base = { AV: 0, 'Dur%': 0, health: 200, Con: 0, ExMult: null, ExTarget: 'Main', 'ToMain%': 1, MainCap: 1, IsFatal: false };
  const enemy = makeEnemy({
    zones: [
      { zone_name: 'left_pauldron', ...base },
      { zone_name: 'right_pauldron', ...base },
      { zone_name: 'head', ...base, health: 150 },
      { zone_name: 'Main', ...base, health: 1000 }
    ]
  });

  const { families } = buildEnemyZoneGroups(enemy);

  const repIndices = families.map((f) => f.representativeIndex);
  const sorted = [...repIndices].sort((a, b) => a - b);
  assert.deepEqual(repIndices, sorted);
});

// ─── buildEnemyZoneGroups — zoneRows API ──────────────────────────────────────

test('accepts zoneRows and uses their zoneIndex values as canonical indices', () => {
  const zoneA = makeZone({ zone_name: 'left_arm', AV: 2, health: 300 });
  const zoneB = makeZone({ zone_name: 'right_arm', AV: 2, health: 300 });
  const enemy = makeEnemy({ zones: [makeZone(), zoneA, zoneB] });

  // Simulate passing only zones at indices 1 and 2.
  const zoneRows = [
    { zoneIndex: 1, zone: zoneA },
    { zoneIndex: 2, zone: zoneB }
  ];

  const { families, zoneIndexToFamilyId } = buildEnemyZoneGroups(enemy, zoneRows);

  assert.equal(families.length, 1);
  assert.deepEqual(families[0].memberIndices, [1, 2]);
  assert.equal(zoneIndexToFamilyId.get(1), families[0].familyId);
  assert.equal(zoneIndexToFamilyId.get(2), families[0].familyId);
  // Index 0 was not in zoneRows, so not present.
  assert.equal(zoneIndexToFamilyId.has(0), false);
});

// ─── buildEnemyZoneGroups — metadata completeness ─────────────────────────────

test('every family carries the expected metadata shape', () => {
  const enemy = makeEnemy({
    zones: [makeZone({ zone_name: 'left_leg', health: 500 }), makeZone({ zone_name: 'head', health: 150 })]
  });

  const { families } = buildEnemyZoneGroups(enemy);

  for (const fam of families) {
    assert.ok(typeof fam.familyId === 'string' && fam.familyId.length > 0, 'familyId must be non-empty string');
    assert.ok(Array.isArray(fam.memberIndices) && fam.memberIndices.length > 0, 'memberIndices must be non-empty array');
    assert.ok(Array.isArray(fam.memberZones) && fam.memberZones.length === fam.memberIndices.length, 'memberZones length must match memberIndices');
    assert.ok(typeof fam.representativeIndex === 'number', 'representativeIndex must be a number');
    assert.ok(fam.representativeZone !== undefined, 'representativeZone must be present');
    assert.ok(typeof fam.label === 'string' && fam.label.length > 0, 'label must be non-empty string');
    assert.ok(typeof fam.summaryLabel === 'string' && fam.summaryLabel.length > 0, 'summaryLabel must be non-empty string');
    assert.ok(typeof fam.isExplicit === 'boolean', 'isExplicit must be boolean');
    assert.ok(typeof fam.isSingleton === 'boolean', 'isSingleton must be boolean');
    assert.ok(fam.groupId === null || typeof fam.groupId === 'string', 'groupId must be string or null');
  }
});

test('explicit families have non-null groupId; auto families have null groupId', () => {
  const enemy = {
    zones: [
      makeZone({ zone_name: 'left_arm', health: 300 }),
      makeZone({ zone_name: 'right_arm', health: 300 }),
      makeZone({ zone_name: 'head', health: 150 })
    ],
    zoneRelationGroups: [
      { id: 'arms', label: 'Arms', zoneNames: ['left_arm', 'right_arm'], mirrorGroupIds: [], priorityTargetZoneNames: [] }
    ]
  };

  const { families } = buildEnemyZoneGroups(enemy);

  const explicitFam = families.find((f) => f.isExplicit);
  assert.equal(explicitFam.groupId, 'arms');

  const autoFam = families.find((f) => !f.isExplicit);
  assert.equal(autoFam.groupId, null);
});

// ─── buildEnemyZoneGroups — isSingleton vs multi-member ────────────────────────

test('isSingleton is true for families with exactly one member', () => {
  const enemy = makeEnemy({ zones: [makeZone({ zone_name: 'head', health: 150 })] });
  const { families } = buildEnemyZoneGroups(enemy);
  assert.equal(families[0].isSingleton, true);
});

test('summaryLabel omits the count suffix for singletons', () => {
  const enemy = makeEnemy({ zones: [makeZone({ zone_name: 'head', health: 150 })] });
  const { families } = buildEnemyZoneGroups(enemy);
  assert.equal(families[0].summaryLabel, families[0].label);
  assert.ok(!families[0].summaryLabel.includes('×'));
});

test('summaryLabel includes count suffix for multi-member families', () => {
  const base = { AV: 1, 'Dur%': 0, health: 300, Con: 0, ExMult: null, ExTarget: 'Main', 'ToMain%': 1, MainCap: 1, IsFatal: false };
  const enemy = makeEnemy({
    zones: [
      { zone_name: 'left_arm', ...base },
      { zone_name: 'right_arm', ...base }
    ]
  });
  const { families } = buildEnemyZoneGroups(enemy);
  assert.ok(families[0].summaryLabel.includes('×2'));
});

// ─── autoClusterZones — direct unit tests ─────────────────────────────────────

test('autoClusterZones clusters left/right mirrored zones with identical stats', () => {
  const base = { AV: 2, 'Dur%': 0, health: 300, Con: 0, ExMult: null, ExTarget: 'Main', 'ToMain%': 1, MainCap: 1, IsFatal: false };
  const zones = [
    { idx: 0, zone: { zone_name: 'left_arm', ...base } },
    { idx: 1, zone: { zone_name: 'right_arm', ...base } }
  ];
  const clusters = autoClusterZones(zones);
  assert.equal(clusters.length, 1);
  assert.equal(clusters[0].isDegenerate, false);
  assert.equal(clusters[0].members.length, 2);
  assert.equal(clusters[0].members[0].stem, 'arm');
  assert.equal(clusters[0].members[1].stem, 'arm');
});

test('autoClusterZones clusters compact l/r mirrored zones', () => {
  const base = { AV: 2, 'Dur%': 0.5, health: 200, Con: 0, ExMult: null, ExTarget: 'Main', 'ToMain%': 0.4, MainCap: 0, IsFatal: false };
  const zones = [
    { idx: 0, zone: { zone_name: 'l_claw', ...base } },
    { idx: 1, zone: { zone_name: 'r_claw', ...base } }
  ];
  const clusters = autoClusterZones(zones);
  assert.equal(clusters.length, 1);
  assert.equal(clusters[0].members.length, 2);
  assert.equal(clusters[0].members[0].stem, 'claw');
});

test('autoClusterZones clusters interior compact l/r tokens (armor_lower_l_arm / armor_lower_r_arm)', () => {
  const base = { AV: 1, 'Dur%': 0.3, health: 250, Con: 0, ExMult: null, ExTarget: 'Main', 'ToMain%': 0.5, MainCap: 0, IsFatal: false };
  const zones = [
    { idx: 0, zone: { zone_name: 'armor_lower_l_arm', ...base } },
    { idx: 1, zone: { zone_name: 'armor_lower_r_arm', ...base } }
  ];
  const clusters = autoClusterZones(zones);
  assert.equal(clusters.length, 1);
  assert.equal(clusters[0].members.length, 2);
  assert.equal(clusters[0].members[0].stem, 'armor_lower_arm');
  assert.equal(clusters[0].members[1].stem, 'armor_lower_arm');
});

test('autoClusterZones keeps front/rear stems separate even with identical stats', () => {
  const base = { AV: 2, 'Dur%': 0.5, health: 500, Con: 0, ExMult: null, ExTarget: 'Main', 'ToMain%': 1, MainCap: 0, IsFatal: false };
  const zones = [
    { idx: 0, zone: { zone_name: 'front_torso', ...base } },
    { idx: 1, zone: { zone_name: 'rear_torso', ...base } }
  ];
  const clusters = autoClusterZones(zones);
  assert.equal(clusters.length, 2);
  assert.ok(clusters.every((c) => c.members.length === 1));
  assert.equal(clusters[0].members[0].stem, 'front_torso');
  assert.equal(clusters[1].members[0].stem, 'rear_torso');
});

test('autoClusterZones does not merge zones with different name stems even if stats match', () => {
  const base = { AV: 2, 'Dur%': 0, health: 300, Con: 0, ExMult: null, ExTarget: 'Main', 'ToMain%': 1, MainCap: 1, IsFatal: false };
  const zones = [
    { idx: 0, zone: { zone_name: 'left_arm', ...base } },
    { idx: 1, zone: { zone_name: 'left_leg', ...base } }
  ];
  const clusters = autoClusterZones(zones);
  assert.equal(clusters.length, 2);
  assert.ok(clusters.every((c) => c.members.length === 1));
});

test('autoClusterZones does not merge zones with different stats even if stems match', () => {
  const zones = [
    { idx: 0, zone: { zone_name: 'left_arm', AV: 2, 'Dur%': 0, health: 300, Con: 0, ExMult: null, ExTarget: 'Main', 'ToMain%': 1, MainCap: 1, IsFatal: false } },
    { idx: 1, zone: { zone_name: 'right_arm', AV: 3, 'Dur%': 0, health: 300, Con: 0, ExMult: null, ExTarget: 'Main', 'ToMain%': 1, MainCap: 1, IsFatal: false } }
  ];
  const clusters = autoClusterZones(zones);
  assert.equal(clusters.length, 2);
  assert.ok(clusters.every((c) => c.members.length === 1));
});

test('autoClusterZones returns degenerate cluster for empty-name zone', () => {
  const zones = [
    { idx: 0, zone: { zone_name: '', AV: 0, 'Dur%': 0, health: 100, Con: 0, ExMult: null, ExTarget: 'Main', 'ToMain%': 1, MainCap: 1, IsFatal: false } }
  ];
  const clusters = autoClusterZones(zones);
  assert.equal(clusters.length, 1);
  assert.equal(clusters[0].isDegenerate, true);
  assert.equal(clusters[0].members.length, 1);
});

test('autoClusterZones clusters are sorted by smallest member idx', () => {
  const base = { AV: 1, 'Dur%': 0, health: 200, Con: 0, ExMult: null, ExTarget: 'Main', 'ToMain%': 1, MainCap: 1, IsFatal: false };
  const base2 = { AV: 2, 'Dur%': 0, health: 400, Con: 0, ExMult: null, ExTarget: 'Main', 'ToMain%': 1, MainCap: 1, IsFatal: false };
  const zones = [
    { idx: 0, zone: { zone_name: 'left_pauldron', ...base } },
    { idx: 1, zone: { zone_name: 'left_arm', ...base2 } },
    { idx: 2, zone: { zone_name: 'right_pauldron', ...base } },
    { idx: 3, zone: { zone_name: 'right_arm', ...base2 } }
  ];
  const clusters = autoClusterZones(zones);
  assert.equal(clusters.length, 2);
  assert.equal(clusters[0].members[0].idx, 0); // pauldron cluster first
  assert.equal(clusters[1].members[0].idx, 1); // arm cluster second
});

// ─── buildEnemyZoneGroups — interior compact l/r integration ──────────────────

test('auto-groups interior compact l/r tokens: armor_lower_l_arm / armor_lower_r_arm', () => {
  const base = { AV: 1, 'Dur%': 0.3, health: 250, Con: 0, ExMult: null, ExTarget: 'Main', 'ToMain%': 0.5, MainCap: 0, IsFatal: false };
  const enemy = makeEnemy({
    zones: [
      { zone_name: 'armor_lower_l_arm', ...base },
      { zone_name: 'armor_lower_r_arm', ...base }
    ]
  });
  const { families } = buildEnemyZoneGroups(enemy);

  assert.equal(families.length, 1);
  const [fam] = families;
  assert.equal(fam.isSingleton, false);
  assert.equal(fam.isExplicit, false);
  assert.deepEqual(fam.memberIndices, [0, 1]);
  assert.equal(fam.label, 'armor lower arm');
  assert.equal(fam.summaryLabel, 'armor lower arm (×2)');
});
