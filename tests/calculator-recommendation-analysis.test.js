import test from 'node:test';
import assert from 'node:assert/strict';

if (!globalThis.localStorage) {
  globalThis.localStorage = {
    getItem() {
      return null;
    },
    setItem() {},
    removeItem() {}
  };
}

const { analyzeRecommendationRowSetWorkDistribution } = await import('../calculator/recommendation-analysis.js');

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

function makeExplosionAttackRow(name, damage, ap = 3) {
  return {
    ...makeAttackRow(name, damage, ap),
    'Atk Type': 'Explosion'
  };
}

function makeWeapon(name, {
  index = 0,
  rpm = 60,
  type = 'Primary',
  sub = 'AR',
  rows = []
} = {}) {
  return {
    name,
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

function pickMetrics(summary, keys) {
  return Object.fromEntries(keys.map((key) => [key, summary[key] ?? 0]));
}

test('analyzeRecommendationRowSetWorkDistribution reports repeated direct-target work across overall, selected, and related stages', () => {
  const enemy = {
    name: 'Workload Dummy',
    health: 600,
    zones: [
      makeZone('head', { health: 200, isFatal: true, av: 1, toMainPercent: 1 }),
      makeZone('body', { health: 150, isFatal: true, av: 1, toMainPercent: 1 }),
      makeZone('arm', { health: 100, av: 1, toMainPercent: 0.5 })
    ]
  };
  const weapons = [
    makeWeapon('Head Breaker', {
      index: 0,
      rows: [makeAttackRow('Head Breaker', 200, 2)]
    }),
    makeWeapon('Arm Cutter', {
      index: 1,
      rows: [makeAttackRow('Arm Cutter', 100, 2)]
    })
  ];

  const { rowSets, summary, formattedSummary } = analyzeRecommendationRowSetWorkDistribution({
    enemy,
    weapons,
    overallRecommendationWeapons: weapons,
    highlightRangeFloorMeters: 0,
    selectedZoneIndex: 1,
    relatedTargetZoneIndices: [2]
  });

  assert.equal(rowSets.recommendationRows.length, 2);
  assert.equal(rowSets.selectedTargetRows.length, 2);
  assert.equal(rowSets.relatedTargetRows.length, 2);
  assert.deepEqual(
    pickMetrics(summary.stages.overall.totals, [
      'inputWeapons',
      'inputAttackRows',
      'outputAttackPackages',
      'attackRecommendationsBuilt',
      'attackRecommendationsReturned',
      'zoneComparisonCalls',
      'zoneRowsProduced',
      'directCandidatesProduced',
      'resultRowsReturned'
    ]),
    {
      inputWeapons: 2,
      inputAttackRows: 2,
      outputAttackPackages: 2,
      attackRecommendationsBuilt: 2,
      attackRecommendationsReturned: 2,
      zoneComparisonCalls: 2,
      zoneRowsProduced: 6,
      directCandidatesProduced: 6,
      resultRowsReturned: 2
    }
  );
  assert.deepEqual(
    pickMetrics(summary.stages.selectedTarget.totals, [
      'inputWeapons',
      'requestedTargetZones',
      'inputAttackRows',
      'outputAttackPackages',
      'attackRecommendationsBuilt',
      'attackRecommendationsReturned',
      'zoneComparisonCalls',
      'zoneRowsProduced',
      'directCandidatesProduced',
      'collapseInputs',
      'collapseOutputs',
      'resultRowsReturned'
    ]),
    {
      inputWeapons: 2,
      requestedTargetZones: 1,
      inputAttackRows: 2,
      outputAttackPackages: 2,
      attackRecommendationsBuilt: 2,
      attackRecommendationsReturned: 2,
      zoneComparisonCalls: 2,
      zoneRowsProduced: 6,
      directCandidatesProduced: 6,
      collapseInputs: 2,
      collapseOutputs: 2,
      resultRowsReturned: 2
    }
  );
  assert.deepEqual(
    pickMetrics(summary.stages.relatedTarget.totals, [
      'inputWeapons',
      'requestedTargetZones',
      'inputAttackRows',
      'outputAttackPackages',
      'attackRecommendationsBuilt',
      'attackRecommendationsReturned',
      'zoneComparisonCalls',
      'zoneRowsProduced',
      'directCandidatesProduced',
      'collapseInputs',
      'collapseOutputs',
      'resultRowsReturned'
    ]),
    {
      inputWeapons: 2,
      requestedTargetZones: 1,
      inputAttackRows: 2,
      outputAttackPackages: 2,
      attackRecommendationsBuilt: 2,
      attackRecommendationsReturned: 2,
      zoneComparisonCalls: 2,
      zoneRowsProduced: 6,
      directCandidatesProduced: 6,
      collapseInputs: 2,
      collapseOutputs: 2,
      resultRowsReturned: 2
    }
  );
  assert.equal(
    formattedSummary,
    [
      'total: packages 6, attack recs 6/6, zone compares 6, zone rows 18, direct 18, rows 6, collapse 4->4',
      'overall: packages 2, attack recs 2/2, zone compares 2, zone rows 6, direct 6, rows 2',
      'selectedTarget: packages 2, attack recs 2/2, zone compares 2, zone rows 6, direct 6, rows 2, collapse 2->2',
      'relatedTarget: packages 2, attack recs 2/2, zone compares 2, zone rows 6, direct 6, rows 2, collapse 2->2'
    ].join('\n')
  );
});

test('analyzeRecommendationRowSetWorkDistribution shows selected-target package expansion before equivalent-package collapse', () => {
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

  const { rowSets, summary, formattedSummary } = analyzeRecommendationRowSetWorkDistribution({
    enemy,
    weapons,
    overallRecommendationWeapons: weapons,
    highlightRangeFloorMeters: 0,
    selectedZoneIndex: 0,
    relatedTargetZoneIndices: []
  });

  assert.equal(rowSets.recommendationRows.length, 1);
  assert.equal(rowSets.selectedTargetRows.length, 1);
  assert.equal(rowSets.selectedTargetRows[0].attackName, '90mm SABOT_P');
  assert.deepEqual(
    pickMetrics(summary.stages.overall.totals, [
      'outputAttackPackages',
      'attackRecommendationsBuilt',
      'zoneComparisonCalls',
      'zoneRowsProduced',
      'directCandidatesProduced',
      'resultRowsReturned'
    ]),
    {
      outputAttackPackages: 2,
      attackRecommendationsBuilt: 2,
      zoneComparisonCalls: 2,
      zoneRowsProduced: 2,
      directCandidatesProduced: 1,
      resultRowsReturned: 1
    }
  );
  assert.deepEqual(
    pickMetrics(summary.stages.selectedTarget.totals, [
      'requestedTargetZones',
      'outputAttackPackages',
      'combinedAttackPackages',
      'attackRecommendationsBuilt',
      'attackRecommendationsReturned',
      'zoneComparisonCalls',
      'zoneRowsProduced',
      'directCandidatesProduced',
      'collapseInputs',
      'collapseOutputs',
      'resultRowsReturned'
    ]),
    {
      requestedTargetZones: 1,
      outputAttackPackages: 3,
      combinedAttackPackages: 1,
      attackRecommendationsBuilt: 3,
      attackRecommendationsReturned: 2,
      zoneComparisonCalls: 3,
      zoneRowsProduced: 3,
      directCandidatesProduced: 2,
      collapseInputs: 2,
      collapseOutputs: 1,
      resultRowsReturned: 1
    }
  );
  assert.equal(
    formattedSummary,
    [
      'total: packages 5 (1 combined), attack recs 5/3, zone compares 5, zone rows 5, direct 3, rows 2, collapse 2->1',
      'overall: packages 2, attack recs 2/1, zone compares 2, zone rows 2, direct 1, rows 1',
      'selectedTarget: packages 3 (1 combined), attack recs 3/2, zone compares 3, zone rows 3, direct 2, rows 1, collapse 2->1',
      'relatedTarget: packages 0, attack recs 0/0, zone compares 0, zone rows 0, direct 0, rows 0'
    ].join('\n')
  );
});

test('analyzeRecommendationRowSetWorkDistribution counts staged-path candidates separately from direct candidates', () => {
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
      rows: [
        makeAttackRow('15x100mm HIGH EXPLOSIVE_P', 230, 4),
        makeExplosionAttackRow('15x100mm HIGH EXPLOSIVE_P_IE', 225, 3)
      ]
    })
  ];

  const { rowSets, summary, formattedSummary } = analyzeRecommendationRowSetWorkDistribution({
    enemy,
    weapons,
    overallRecommendationWeapons: weapons,
    highlightRangeFloorMeters: 0,
    selectedZoneIndex: 1,
    relatedTargetZoneIndices: []
  });

  assert.equal(rowSets.selectedTargetRows.length, 1);
  assert.equal(rowSets.selectedTargetRows[0].bestZoneName, 'pilot (via head)');
  assert.equal(rowSets.selectedTargetRows[0].isSequenceCandidate, true);
  assert.deepEqual(
    pickMetrics(summary.stages.overall.totals, [
      'outputAttackPackages',
      'attackRecommendationsBuilt',
      'zoneRowsProduced',
      'directCandidatesProduced',
      'sequenceCandidatesProduced',
      'resultRowsReturned'
    ]),
    {
      outputAttackPackages: 2,
      attackRecommendationsBuilt: 2,
      zoneRowsProduced: 4,
      directCandidatesProduced: 2,
      sequenceCandidatesProduced: 2,
      resultRowsReturned: 1
    }
  );
  assert.deepEqual(
    pickMetrics(summary.stages.selectedTarget.totals, [
      'outputAttackPackages',
      'combinedAttackPackages',
      'attackRecommendationsBuilt',
      'attackRecommendationsReturned',
      'zoneRowsProduced',
      'directCandidatesProduced',
      'sequenceCandidatesProduced',
      'collapseInputs',
      'collapseOutputs',
      'resultRowsReturned'
    ]),
    {
      outputAttackPackages: 3,
      combinedAttackPackages: 1,
      attackRecommendationsBuilt: 3,
      attackRecommendationsReturned: 3,
      zoneRowsProduced: 6,
      directCandidatesProduced: 3,
      sequenceCandidatesProduced: 3,
      collapseInputs: 3,
      collapseOutputs: 3,
      resultRowsReturned: 1
    }
  );
  assert.equal(
    formattedSummary,
    [
      'total: packages 5 (1 combined), attack recs 5/5, zone compares 5, zone rows 10, direct 5, sequences 5, rows 2, collapse 3->3',
      'overall: packages 2, attack recs 2/2, zone compares 2, zone rows 4, direct 2, sequences 2, rows 1',
      'selectedTarget: packages 3 (1 combined), attack recs 3/3, zone compares 3, zone rows 6, direct 3, sequences 3, rows 1, collapse 3->3',
      'relatedTarget: packages 0, attack recs 0/0, zone compares 0, zone rows 0, direct 0, rows 0'
    ].join('\n')
  );
});
