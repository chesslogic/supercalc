import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import './env-stubs.js';
import { TestDocument, TestElement, collectElements } from './dom-stubs.js';

const { loadFromText, state } = await import('../weapons/data.js');
const {
  getDefaultSelectedAttackKeys
} = await import('../calculator/compare-utils.js');
const {
  getWeaponRoleId
} = await import('../weapons/weapon-taxonomy.js');
const {
  getWeaponDropdownApInfo,
  getWeaponOptionLabelText
} = await import('../calculator/weapon-dropdown.js');
const {
  buildRecommendationAttackPackages,
  getRecommendationAttackHitCount
} = await import('../calculator/recommendations/packages.js');
const {
  buildSelectedTargetRecommendationRows,
  buildWeaponRecommendationRows
} = await import('../calculator/recommendations.js');
const {
  filterRowsByShotRange
} = await import('../calculator/calculation/recommendation-panel.js');
const {
  appendTotalCard
} = await import('../calculator/calculation/total-card.js');
const {
  getWeaponRangeAdjustedCellDisplay
} = await import('../calculator/rendering/weapon-range-display.js');
const {
  calculateAttackAgainstZone,
  summarizeZoneDamage
} = await import('../calculator/zone-damage.js');

loadFromText(readFileSync(new URL('../weapons/weapondata.csv', import.meta.url), 'utf8'));

function getWeapon(name) {
  const weapon = state.groups.find((group) => group.name === name);
  assert.ok(weapon, `expected ${name} in weapondata.csv`);
  return weapon;
}

function makeZone({
  health = 500,
  av = 0,
  durablePercent = 0,
  isFatal = true
} = {}) {
  return {
    zone_name: 'Main',
    health,
    Con: 0,
    AV: av,
    'Dur%': durablePercent,
    'ToMain%': 1,
    ExTarget: 'Main',
    ExMult: 1,
    IsFatal: isFatal
  };
}

function pickRawAttackFields(row) {
  return {
    type: row.Type,
    sub: row.Sub,
    role: row.Role,
    code: row.Code,
    name: row.Name,
    rpm: row.RPM,
    attackType: row['Atk Type'],
    attackName: row['Atk Name'],
    damage: row.DMG,
    durableDamage: row.DUR,
    ap: row.AP,
    demolition: row.DF,
    stun: row.ST,
    push: row.PF,
    status: row.Status
  };
}

test('Castellan weapon rows ingest with exact taxonomy and decoded attack values', () => {
  const hotShot = getWeapon('Hot-Shot Marksman Rifle');
  const boltPistol = getWeapon('Bolt Pistol');
  const meltagun = getWeapon('Meltagun');
  const meltaMine = getWeapon('Melta Mine');

  assert.deepEqual(
    [hotShot, boltPistol, meltagun, meltaMine].map((weapon) => ({
      label: getWeaponOptionLabelText(weapon),
      type: weapon.type,
      sub: weapon.sub,
      role: getWeaponRoleId(weapon),
      code: weapon.code,
      rpm: weapon.rpm
    })),
    [
      {
        label: '[Primary][DMR]R/40-K Hot-Shot Marksman Rifle',
        type: 'Primary',
        sub: 'DMR',
        role: 'precision',
        code: 'R/40-K',
        rpm: 210
      },
      {
        label: '[Secondary][SPC]P/40-K Bolt Pistol',
        type: 'Secondary',
        sub: 'SPC',
        role: 'explosive',
        code: 'P/40-K',
        rpm: 150
      },
      {
        label: '[Support][SPC]40-K Meltagun',
        type: 'Support',
        sub: 'SPC',
        role: 'energy',
        code: '40-K',
        rpm: null
      },
      {
        label: '[Grenade][SPC]G/40-K Melta Mine',
        type: 'Grenade',
        sub: 'SPC',
        role: 'special',
        code: 'G/40-K',
        rpm: null
      }
    ]
  );

  assert.deepEqual(
    [hotShot, boltPistol, meltagun, meltaMine].flatMap((weapon) => weapon.rows.map(pickRawAttackFields)),
    [
      {
        type: 'Primary',
        sub: 'DMR',
        role: 'precision',
        code: 'R/40-K',
        name: 'Hot-Shot Marksman Rifle',
        rpm: '210',
        attackType: 'projectile',
        attackName: 'R/40-K_P',
        damage: '275',
        durableDamage: '40',
        ap: '3',
        demolition: '10',
        stun: '20',
        push: '14',
        status: ''
      },
      {
        type: 'Secondary',
        sub: 'SPC',
        role: 'explosive',
        code: 'P/40-K',
        name: 'Bolt Pistol',
        rpm: '150',
        attackType: 'projectile',
        attackName: 'P/40-K_P',
        damage: '325',
        durableDamage: '115',
        ap: '4',
        demolition: '20',
        stun: '35',
        push: '15',
        status: ''
      },
      {
        type: 'Secondary',
        sub: 'SPC',
        role: 'explosive',
        code: 'P/40-K',
        name: 'Bolt Pistol',
        rpm: '150',
        attackType: 'explosion',
        attackName: 'P/40-K_P_IE',
        damage: '175',
        durableDamage: '175',
        ap: '3',
        demolition: '10',
        stun: '35',
        push: '5',
        status: ''
      },
      {
        type: 'Support',
        sub: 'SPC',
        role: 'energy',
        code: '40-K',
        name: 'Meltagun',
        rpm: '',
        attackType: 'beam',
        attackName: '40-K MELTAGUN_B',
        damage: '2600',
        durableDamage: '2600',
        ap: '7',
        demolition: '30',
        stun: '40',
        push: '40',
        status: 'FlamerSlowed • Fire_Panic'
      },
      {
        type: 'Grenade',
        sub: 'SPC',
        role: 'special',
        code: 'G/40-K',
        name: 'Melta Mine',
        rpm: '',
        attackType: 'explosion',
        attackName: 'G/40-K MELTA MINE_E',
        damage: '2000',
        durableDamage: '2000',
        ap: '7',
        demolition: '40',
        stun: '40',
        push: '40',
        status: ''
      }
    ]
  );

  assert.deepEqual(
    [hotShot.rows.length, boltPistol.rows.length, meltagun.rows.length, meltaMine.rows.length],
    [1, 2, 1, 1]
  );
  assert.equal(state.typeIndex.get('grenade')?.has(meltaMine), true);
  assert.equal(state.roleIndex.get('energy')?.has(meltagun), true);
});

test('Bolt Pistol packages projectile and explosion once while preserving separate AP profiles', () => {
  const boltPistol = getWeapon('Bolt Pistol');
  const packages = buildRecommendationAttackPackages(boltPistol, {
    includeCombinedPackages: true
  });
  const combinedPackages = packages.filter((attackPackage) => attackPackage.isCombinedPackage);

  assert.equal(packages.length, 3);
  assert.equal(combinedPackages.length, 1);
  assert.equal(combinedPackages[0].attackName, 'P/40-K [Proj + Blast]');
  assert.deepEqual(
    combinedPackages[0].packageComponents.map((component) => component.attackName),
    ['P/40-K_P', 'P/40-K_P_IE']
  );
  assert.equal(getDefaultSelectedAttackKeys(boltPistol).length, 2);

  const apInfo = getWeaponDropdownApInfo(boltPistol);
  assert.equal(apInfo.displayAp, 4);
  assert.deepEqual(apInfo.significantSecondaryAps, [3]);
  assert.equal(apInfo.totalMeaningfulDamage, 500);

  const [projectile, explosion] = boltPistol.rows;
  const av4Zone = makeZone({ av: 4 });
  assert.equal(calculateAttackAgainstZone(projectile, av4Zone).damage, 211);
  assert.equal(calculateAttackAgainstZone(explosion, av4Zone).damage, 0);

  const enemy = {
    name: 'Bolt Package Dummy',
    health: 500,
    zones: [makeZone({ health: 500, av: 2 })]
  };
  const [overallRecommendation] = buildWeaponRecommendationRows({
    enemy,
    weapons: [boltPistol],
    rangeFloorMeters: 0
  });
  const [recommendation] = buildSelectedTargetRecommendationRows({
    enemy,
    weapons: [boltPistol],
    rangeFloorMeters: 0,
    selectedZoneIndex: 0
  });
  const combinedRecommendations = recommendation.attackRecommendations.filter((entry) => entry.isCombinedPackage);

  assert.equal(overallRecommendation.isCombinedPackage, true);
  assert.equal(overallRecommendation.shotsToKill, 1);
  assert.equal(overallRecommendation.bestAttackRecommendation.bestCandidate.zoneSummary.totalDamagePerCycle, 500);
  assert.equal(combinedRecommendations.length, 1);
  assert.equal(recommendation.isCombinedPackage, true);
  assert.equal(recommendation.shotsToKill, 1);
  assert.equal(recommendation.bestAttackRecommendation.bestCandidate.zoneSummary.totalDamagePerCycle, 500);

  const durableSummary = summarizeZoneDamage({
    zone: makeZone({ health: 500, av: 3, durablePercent: 0.5 }),
    enemyMainHealth: 500,
    weapon: boltPistol,
    selectedAttacks: boltPistol.rows,
    hitCounts: [1, 1],
    rpm: boltPistol.rpm
  });
  assert.deepEqual(
    durableSummary.attackDetails.map((detail) => ({
      name: detail.name,
      damage: detail.damage,
      ap: detail.ap
    })),
    [
      { name: 'P/40-K_P', damage: 220, ap: 4 },
      { name: 'P/40-K_P_IE', damage: 113, ap: 3 }
    ]
  );
  assert.equal(durableSummary.totalDamagePerCycle, 333);
});

test('Hot-Shot calculations use decoded durable damage instead of assuming standard damage', () => {
  const hotShot = getWeapon('Hot-Shot Marksman Rifle');
  const [attack] = hotShot.rows;

  assert.equal(calculateAttackAgainstZone(
    attack,
    makeZone({ av: 2, durablePercent: 0 })
  ).damage, 275);
  assert.equal(calculateAttackAgainstZone(
    attack,
    makeZone({ av: 2, durablePercent: 1 })
  ).damage, 40);
  assert.equal(calculateAttackAgainstZone(
    attack,
    makeZone({ av: 3, durablePercent: 1 })
  ).damage, 26);
  assert.equal(calculateAttackAgainstZone(
    attack,
    makeZone({ av: 2, durablePercent: 0.5 })
  ).damage, 157);
  assert.equal(getRecommendationAttackHitCount({
    weapon: hotShot,
    attackRow: attack
  }), 1);
});

test('Meltagun keeps DPS beam cadence and enforces its hard 15m range', () => {
  const meltagun = getWeapon('Meltagun');
  const enemy = {
    name: 'Meltagun Dummy',
    health: 2600,
    zones: [makeZone({ health: 2600, av: 6, durablePercent: 1 })]
  };

  const atLimit = summarizeZoneDamage({
    zone: enemy.zones[0],
    enemyMainHealth: enemy.health,
    weapon: meltagun,
    selectedAttacks: meltagun.rows,
    hitCounts: [1],
    rpm: meltagun.rpm,
    distanceMeters: 15
  });
  assert.equal(atLimit.totalDamagePerCycle, 2600);
  assert.equal(atLimit.killSummary.usesBeamCadence, true);
  assert.equal(atLimit.killSummary.beamTicksPerSecond, 67);
  assert.equal(atLimit.killSummary.zoneShotsToKill, 67);
  assert.equal(atLimit.killSummary.zoneTtkSeconds, 1);

  const beyondLimit = summarizeZoneDamage({
    zone: enemy.zones[0],
    enemyMainHealth: enemy.health,
    weapon: meltagun,
    selectedAttacks: meltagun.rows,
    hitCounts: [1],
    rpm: meltagun.rpm,
    distanceMeters: 16
  });
  assert.equal(beyondLimit.totalDamagePerCycle, 0);
  assert.equal(beyondLimit.killSummary.zoneShotsToKill, null);
  assert.equal(beyondLimit.attackDetails[0].isBeyondHardRange, true);

  const slowTwoShotWeapon = {
    name: 'Slow Two-Shot',
    type: 'Support',
    sub: 'SPC',
    role: 'energy',
    code: 'TEST',
    rpm: 6,
    rows: [{
      'Atk Type': 'projectile',
      'Atk Name': 'TEST_P',
      DMG: '1300',
      DUR: '1300',
      AP: '7',
      DF: '0',
      ST: '0',
      PF: '0',
      Status: ''
    }]
  };
  const rankedRecommendations = buildWeaponRecommendationRows({
    enemy,
    weapons: [slowTwoShotWeapon, meltagun],
    rangeFloorMeters: 15,
    getEngagementRangeMetersForWeapon: () => 15
  });
  const withinRangeRecommendation = rankedRecommendations[0];
  assert.deepEqual(
    rankedRecommendations.map((recommendation) => recommendation.weapon.name),
    ['Meltagun', 'Slow Two-Shot']
  );
  assert.equal(withinRangeRecommendation.usesBeamCadence, true);
  assert.equal(withinRangeRecommendation.ttkSeconds, 1);
  assert.equal(withinRangeRecommendation.effectiveDistance.meters, 15);
  assert.equal(withinRangeRecommendation.rangeStatus, 'qualified');

  assert.deepEqual(buildWeaponRecommendationRows({
    enemy,
    weapons: [meltagun],
    rangeFloorMeters: 16,
    getEngagementRangeMetersForWeapon: () => 16
  }), []);

  assert.deepEqual(
    filterRowsByShotRange([
      withinRangeRecommendation,
      { weapon: slowTwoShotWeapon, shotsToKill: 4, usesBeamCadence: false }
    ], 1, 3).map((row) => row.weapon.name),
    ['Meltagun']
  );

  const rangeDisplay = getWeaponRangeAdjustedCellDisplay('DMG', {
    displayRow: meltagun.rows[0],
    rowA: meltagun.rows[0],
    rowB: null
  }, {
    compareMode: false,
    weaponA: meltagun,
    rangeA: 16
  });
  assert.equal(rangeDisplay.text, '0');
  assert.equal(rangeDisplay.isAdjusted, true);
  assert.match(rangeDisplay.title, /hard maximum range 15m/i);

  const previousDocument = globalThis.document;
  globalThis.document = new TestDocument();
  try {
    const container = new TestElement('div', globalThis.document);
    appendTotalCard(container, {
      ...atLimit,
      attackDetails: [],
      projectileTargetZone: null,
      explosiveTargetZones: [],
      hasProjectileAttacks: false,
      hasExplosiveAttacks: false
    });
    const textValues = collectElements(container, () => true).map((element) => element.textContent);
    assert.ok(textValues.includes('Total Combined Damage per Second'));
    assert.ok(textValues.includes('2600/s'));
    assert.ok(textValues.includes('= 1.00s (67) beam ticks'));
  } finally {
    globalThis.document = previousDocument;
  }
});

test('Melta Mine remains one authoritative throwable explosion event', () => {
  const meltaMine = getWeapon('Melta Mine');
  const packages = buildRecommendationAttackPackages(meltaMine, {
    includeCombinedPackages: true
  });
  const summary = summarizeZoneDamage({
    zone: makeZone({ health: 2000, av: 6, durablePercent: 1 }),
    enemyMainHealth: 2000,
    weapon: meltaMine,
    selectedAttacks: meltaMine.rows,
    hitCounts: [1],
    rpm: meltaMine.rpm
  });

  assert.equal(meltaMine.rows.length, 1);
  assert.equal(packages.length, 1);
  assert.equal(packages[0].isCombinedPackage, false);
  assert.equal(summary.attackDetails.length, 1);
  assert.equal(summary.totalDamagePerCycle, 2000);
  assert.equal(summary.killSummary.zoneShotsToKill, 1);
});
