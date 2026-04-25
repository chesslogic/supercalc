// Tests for enemy zone grouping model (calculator/enemy-zone-groups.js).
// Covers explicit zoneRelationGroups grouping, auto-fallback clustering,
// signature derivation, and edge cases.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildEnemyZoneGroups,
  autoClusterZones,
  getZoneCombatSignature
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

// Focused regression fixture mirroring the current Bile Titan leg exact-stat classes.
const BILE_TITAN_LEG_ARMOR_ZONE_NAMES = Object.freeze([
  'left_front_leg_armor',
  'left_front_leg_end_top_armor',
  'left_front_leg_end_bottom_armor',
  'right_front_leg_armor',
  'right_front_leg_end_top_armor',
  'right_front_leg_end_bottom_armor',
  'left_back_leg_armor',
  'left_back_leg_end_top_armor',
  'left_back_leg_end_bottom_armor',
  'right_back_leg_armor',
  'right_back_leg_end_top_armor',
  'right_back_leg_end_bottom_armor'
]);

const BILE_TITAN_SHARED_LEG_FLESH_ZONE_NAMES = Object.freeze([
  'right_front_leg_flesh',
  'left_back_leg_flesh',
  'right_back_leg_flesh'
]);

const BILE_TITAN_LEG_ARMOR_STATS = Object.freeze({
  AV: 4,
  'Dur%': 1,
  ExMult: 0.5,
  ExTarget: 'Part',
  MainCap: 0,
  'ToMain%': 1,
  health: 1000
});

const BILE_TITAN_SHARED_LEG_FLESH_STATS = Object.freeze({
  AV: 4,
  Con: 2000,
  'Dur%': 1,
  ExMult: 0.5,
  ExTarget: 'Part',
  IsFatal: true,
  MainCap: 0,
  'ToMain%': 1,
  health: 2000
});

const BILE_TITAN_LEG_ZONES = Object.freeze([
  ...BILE_TITAN_LEG_ARMOR_ZONE_NAMES.map((zone_name) => makeZone({ zone_name, ...BILE_TITAN_LEG_ARMOR_STATS })),
  makeZone({ zone_name: 'left_front_leg_flesh', ...BILE_TITAN_SHARED_LEG_FLESH_STATS, Con: 1500 }),
  ...BILE_TITAN_SHARED_LEG_FLESH_ZONE_NAMES.map((zone_name) => makeZone({ zone_name, ...BILE_TITAN_SHARED_LEG_FLESH_STATS }))
]);

function groupZoneNamesByCombatSignature(zones) {
  const zoneNamesBySignature = new Map();

  zones.forEach((zone) => {
    const signature = getZoneCombatSignature(zone);
    if (!zoneNamesBySignature.has(signature)) {
      zoneNamesBySignature.set(signature, []);
    }
    zoneNamesBySignature.get(signature).push(zone.zone_name);
  });

  return [...zoneNamesBySignature.values()]
    .map((zoneNames) => [...zoneNames].sort())
    .sort((a, b) => b.length - a.length || a[0].localeCompare(b[0]));
}

function groupFamilyZoneNames(families) {
  return families
    .map((family) => family.memberZones.map((zone) => zone.zone_name).sort())
    .sort((a, b) => b.length - a.length || a[0].localeCompare(b[0]));
}

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

test('Bile Titan leg zones keep the expected exact combat-signature classes', () => {
  assert.deepEqual(groupZoneNamesByCombatSignature(BILE_TITAN_LEG_ZONES), [
    [...BILE_TITAN_LEG_ARMOR_ZONE_NAMES].sort(),
    [...BILE_TITAN_SHARED_LEG_FLESH_ZONE_NAMES].sort(),
    ['left_front_leg_flesh']
  ]);
});

test('Bile Titan left_front_leg_flesh only leaves the shared flesh class because Con differs', () => {
  const leftFrontLegFlesh = BILE_TITAN_LEG_ZONES.find((zone) => zone.zone_name === 'left_front_leg_flesh');
  const rightFrontLegFlesh = BILE_TITAN_LEG_ZONES.find((zone) => zone.zone_name === 'right_front_leg_flesh');

  assert.ok(leftFrontLegFlesh);
  assert.ok(rightFrontLegFlesh);
  assert.equal(leftFrontLegFlesh.Con, 1500);
  assert.equal(rightFrontLegFlesh.Con, 2000);
  assert.notEqual(getZoneCombatSignature(leftFrontLegFlesh), getZoneCombatSignature(rightFrontLegFlesh));
  assert.equal(
    getZoneCombatSignature({ ...leftFrontLegFlesh, Con: rightFrontLegFlesh.Con }),
    getZoneCombatSignature(rightFrontLegFlesh)
  );
});

test('buildEnemyZoneGroups collapses Bile Titan leg zones into exact combat-signature families', () => {
  const { families } = buildEnemyZoneGroups(makeEnemy({ zones: BILE_TITAN_LEG_ZONES }));

  assert.deepEqual(
    groupFamilyZoneNames(families),
    groupZoneNamesByCombatSignature(BILE_TITAN_LEG_ZONES)
  );
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

test('auto-groups two zones with identical stats even when names differ', () => {
  const base = { AV: 2, 'Dur%': 0.35, health: 200, Con: 0, ExMult: null, ExTarget: 'Part', 'ToMain%': 0.3, MainCap: 0, IsFatal: false };
  const enemy = makeEnemy({
    zones: [
      { zone_name: 'left_arm', ...base },
      { zone_name: 'rear_exhaust', ...base }
    ]
  });
  const { families } = buildEnemyZoneGroups(enemy);

  assert.equal(families.length, 1);
  const [family] = families;
  assert.equal(family.isSingleton, false);
  assert.equal(family.isExplicit, false);
  assert.deepEqual(family.memberIndices, [0, 1]);
  assert.equal(family.representativeIndex, 0);
  assert.equal(family.label, 'Exact-stat group');
  assert.equal(family.summaryLabel, 'Exact-stat group (×2)');
});

test('auto-groups all zones in the same exact combat-signature class even across unrelated names', () => {
  const sharedStats = { AV: 1, 'Dur%': 0.5, health: 200, Con: 0, ExMult: null, ExTarget: 'Main', 'ToMain%': 0.6, MainCap: 0, IsFatal: false };
  const enemy = makeEnemy({
    zones: [
      { zone_name: 'hitzone_l_rear_leg', ...sharedStats },
      { zone_name: 'right_claw', ...sharedStats },
      { zone_name: 'front_torso', ...sharedStats },
      { zone_name: 'head', ...sharedStats, health: 150 }
    ]
  });
  const { families } = buildEnemyZoneGroups(enemy);

  assert.equal(families.length, 2);
  const grouped = families.find((family) => !family.isSingleton);
  assert.ok(grouped, 'expected a multi-member family');
  assert.deepEqual(grouped.memberIndices, [0, 1, 2]);
  assert.equal(grouped.label, 'Exact-stat group');
  assert.equal(grouped.summaryLabel, 'Exact-stat group (×3)');
});

test('does NOT auto-group zones with different stats even when names are similar', () => {
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

  // Remaining zones (1, 3) still differ by health, so exact-signature fallback
  // leaves them as singletons.
  const autoFamilies = families.filter((f) => !f.isExplicit);
  assert.equal(autoFamilies.length, 2);
  assert.ok(autoFamilies.every((f) => f.isSingleton));

  // All 4 indices are assigned.
  assert.equal(zoneIndexToFamilyId.size, 4);
});

test('auto-groups remaining ungrouped zones after explicit groups by signature only', () => {
  const base = { AV: 2, 'Dur%': 0.35, health: 200, Con: 0, ExMult: null, ExTarget: 'Part', 'ToMain%': 0.3, MainCap: 0, IsFatal: false };
  const enemy = {
    zones: [
      { zone_name: 'left_arm', AV: 2, health: 300, 'Dur%': 0, Con: 0, ExMult: null, ExTarget: 'Main', 'ToMain%': 0.5, MainCap: 1, IsFatal: true },
      { zone_name: 'left_pauldron', ...base },
      { zone_name: 'rear_exhaust', ...base }
    ],
    zoneRelationGroups: [
      { id: 'left-arm', label: 'Left arm', zoneNames: ['left_arm'], mirrorGroupIds: [], priorityTargetZoneNames: [] }
    ]
  };

  const { families } = buildEnemyZoneGroups(enemy);
  // Explicit: [0]; auto-grouped signature class: [1, 2].
  assert.equal(families.length, 2);

  const autoFam = families.find((f) => !f.isExplicit);
  assert.ok(autoFam);
  assert.equal(autoFam.isSingleton, false);
  assert.deepEqual(autoFam.memberIndices, [1, 2]);
  assert.equal(autoFam.label, 'Exact-stat group');
  assert.equal(autoFam.summaryLabel, 'Exact-stat group (×2)');
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

test('autoClusterZones buckets zones by identical combat signatures even when names differ', () => {
  const base = { AV: 2, 'Dur%': 0, health: 300, Con: 0, ExMult: null, ExTarget: 'Main', 'ToMain%': 1, MainCap: 1, IsFatal: false };
  const zones = [
    { idx: 0, zone: { zone_name: 'left_arm', ...base } },
    { idx: 1, zone: { zone_name: 'rear_exhaust', ...base } }
  ];
  const clusters = autoClusterZones(zones);

  assert.equal(clusters.length, 1);
  assert.equal(clusters[0].signature, getZoneCombatSignature(zones[0].zone));
  assert.deepEqual(clusters[0].members.map((member) => member.idx), [0, 1]);
});

test('autoClusterZones keeps different combat signatures separate', () => {
  const zones = [
    { idx: 0, zone: { zone_name: 'left_arm', AV: 2, 'Dur%': 0, health: 300, Con: 0, ExMult: null, ExTarget: 'Main', 'ToMain%': 1, MainCap: 1, IsFatal: false } },
    { idx: 1, zone: { zone_name: 'right_arm', AV: 3, 'Dur%': 0, health: 300, Con: 0, ExMult: null, ExTarget: 'Main', 'ToMain%': 1, MainCap: 1, IsFatal: false } }
  ];
  const clusters = autoClusterZones(zones);

  assert.equal(clusters.length, 2);
  assert.ok(clusters.every((cluster) => cluster.members.length === 1));
});

test('autoClusterZones groups empty-name zones by signature instead of isolating them', () => {
  const base = { AV: 0, 'Dur%': 0, health: 100, Con: 0, ExMult: null, ExTarget: 'Main', 'ToMain%': 1, MainCap: 1, IsFatal: false };
  const zones = [
    { idx: 0, zone: { zone_name: '', ...base } },
    { idx: 1, zone: { zone_name: 'head', ...base } }
  ];
  const clusters = autoClusterZones(zones);

  assert.equal(clusters.length, 1);
  assert.deepEqual(clusters[0].members.map((member) => member.idx), [0, 1]);
});

test('autoClusterZones clusters are sorted by smallest member idx', () => {
  const base = { AV: 1, 'Dur%': 0, health: 200, Con: 0, ExMult: null, ExTarget: 'Main', 'ToMain%': 1, MainCap: 1, IsFatal: false };
  const base2 = { AV: 2, 'Dur%': 0, health: 400, Con: 0, ExMult: null, ExTarget: 'Main', 'ToMain%': 1, MainCap: 1, IsFatal: false };
  const zones = [
    { idx: 0, zone: { zone_name: 'left_pauldron', ...base } },
    { idx: 1, zone: { zone_name: 'left_arm', ...base2 } },
    { idx: 2, zone: { zone_name: 'right_leg', ...base } },
    { idx: 3, zone: { zone_name: 'rear_exhaust', ...base2 } }
  ];
  const clusters = autoClusterZones(zones);

  assert.equal(clusters.length, 2);
  assert.equal(clusters[0].members[0].idx, 0);
  assert.equal(clusters[1].members[0].idx, 1);
});
