import { isExplosiveAttack } from './attack-types.js';
import { buildKillSummary } from './summary.js';

function toNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function toPositiveInteger(value, fallback = 1) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? Math.floor(numeric) : fallback;
}

function normalizeZoneName(zone) {
  return String(zone?.zone_name || '').trim().toLowerCase();
}

function isValidZoneIndex(zones, zoneIndex) {
  return Number.isInteger(zoneIndex) && zoneIndex >= 0 && zoneIndex < zones.length;
}

// ExMult is a direct explosive damage multiplier. Missing/sentinel values mean full damage.
export function normalizeExplosionDamageMultiplier(value) {
  if (value === '-' || value === null || value === undefined || value === '') {
    return 1;
  }

  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 1;
  }

  return Math.max(0, numeric);
}

export function getExplosionDamageMultiplier(zone) {
  return normalizeExplosionDamageMultiplier(zone?.ExMult);
}

export function findMainZoneIndex(enemy) {
  if (!enemy?.zones || enemy.zones.length === 0) {
    return null;
  }

  const explicitMainIndex = enemy.zones.findIndex((zone) => normalizeZoneName(zone) === 'main');
  if (explicitMainIndex >= 0) {
    return explicitMainIndex;
  }

  return 0;
}

function buildZoneSummary({
  zone,
  zoneAttackDetails = [],
  totalDamagePerCycle = 0,
  totalDamageToMainPerCycle = 0,
  totalDirectMainDamagePerCycle = 0,
  totalPassthroughMainDamagePerCycle = 0,
  enemyMainHealth = 0,
  rpm,
  hasSelectedAttacks = false
}) {
  const zoneHealth = toNumber(zone?.health, -1);
  const zoneCon = toNumber(zone?.Con);
  const normalizedEnemyMainHealth = toNumber(enemyMainHealth);

  return {
    attackDetails: zoneAttackDetails,
    totalDamagePerCycle,
    totalDamageToMainPerCycle,
    totalDirectMainDamagePerCycle,
    totalPassthroughMainDamagePerCycle,
    zoneHealth,
    zoneCon,
    enemyMainHealth: normalizedEnemyMainHealth,
    hasSelectedAttacks,
    killSummary: buildKillSummary({
      zoneHealth,
      zoneCon,
      enemyMainHealth: normalizedEnemyMainHealth,
      totalDamagePerCycle,
      totalDamageToMainPerCycle,
      rpm
    })
  };
}

function createZoneApplication({
  attack,
  zone,
  zoneIndex,
  mode,
  hits,
  zoneDamage = 0,
  directMainDamage = 0,
  passthroughMainDamage = 0,
  appliesToZone = false,
  attackResult = null
}) {
  return {
    attackName: attack?.['Atk Name'] || attack?.Name || 'Unknown',
    zoneName: zone?.zone_name || 'Unknown',
    zoneIndex,
    mode,
    hits,
    isExplosion: isExplosiveAttack(attack),
    appliesToZone,
    zoneDamage,
    directMainDamage,
    passthroughMainDamage,
    totalMainDamage: directMainDamage + passthroughMainDamage,
    exTarget: zone?.ExTarget || '',
    attackResult
  };
}

function buildEmptyAttackScenario(attack, hits, mode) {
  return {
    attack,
    name: attack?.['Atk Name'] || attack?.Name || 'Unknown',
    hits,
    mode,
    isExplosion: isExplosiveAttack(attack),
    projectileTargetZoneName: null,
    explosiveTargetZoneNames: [],
    zoneApplications: [],
    totalZoneDamagePerCycle: 0,
    totalDirectMainDamagePerCycle: 0,
    totalPassthroughMainDamagePerCycle: 0,
    totalDamageToMainPerCycle: 0
  };
}

export function calculateAttackAgainstZone(attack, zone, hits = 1) {
  const ap = toNumber(attack?.AP);
  const av = toNumber(zone?.AV);

  let damageMultiplier = 0;
  if (ap < av) {
    damageMultiplier = 0;
  } else if (ap === av) {
    damageMultiplier = 0.65;
  } else {
    damageMultiplier = 1.0;
  }

  const isExplosion = isExplosiveAttack(attack);
  const explosionModifier = isExplosion ? getExplosionDamageMultiplier(zone) : 1.0;
  const hasExplicitExplosionMultiplier = !(['-', null, undefined, ''].includes(zone?.ExMult));

  const dmg = toNumber(attack?.DMG);
  const dur = toNumber(attack?.DUR);
  const durPercent = toNumber(zone?.['Dur%']);
  const rawBaseDamage = (dmg * (1 - durPercent)) + (dur * durPercent);
  const damagePerAttack = rawBaseDamage * damageMultiplier * explosionModifier;

  const toMainPercent = toNumber(zone?.['ToMain%']);
  const damageToMain = damagePerAttack * toMainPercent;

  return {
    name: attack?.['Atk Name'] || attack?.Name || 'Unknown',
    damage: damagePerAttack,
    damageToMain,
    dmg,
    dur,
    durPercent,
    ap,
    av,
    damageMultiplier,
    explosionModifier,
    hasExplicitExplosionMultiplier,
    isExplosion,
    rawBaseDamage,
    toMainPercent,
    exTarget: zone?.ExTarget || '',
    hits: toPositiveInteger(hits)
  };
}

export function buildZoneAttackDetails(zone, selectedAttacks = [], hitCounts = []) {
  if (!zone || !Array.isArray(selectedAttacks) || selectedAttacks.length === 0) {
    return [];
  }

  return selectedAttacks.map((attack, index) =>
    calculateAttackAgainstZone(attack, zone, hitCounts[index])
  );
}

export function summarizeZoneDamage({
  zone,
  enemyMainHealth,
  selectedAttacks = [],
  hitCounts = [],
  rpm
}) {
  if (!zone) {
    return null;
  }

  const attackDetails = buildZoneAttackDetails(zone, selectedAttacks, hitCounts);
  let totalDamagePerCycle = 0;
  let totalDamageToMainPerCycle = 0;

  attackDetails.forEach((attack) => {
    totalDamagePerCycle += attack.damage * attack.hits;
    totalDamageToMainPerCycle += attack.damageToMain * attack.hits;
  });

  return buildZoneSummary({
    zone,
    zoneAttackDetails: attackDetails,
    totalDamagePerCycle,
    totalDamageToMainPerCycle,
    enemyMainHealth,
    rpm,
    hasSelectedAttacks: selectedAttacks.length > 0
  });
}

function buildProjectileAttackScenario({
  attack,
  hits,
  enemy,
  projectileZoneIndex,
  mainZoneIndex
}) {
  const scenario = buildEmptyAttackScenario(attack, hits, 'projectile');
  const zones = enemy?.zones || [];
  if (!isValidZoneIndex(zones, projectileZoneIndex)) {
    return scenario;
  }

  const targetZone = zones[projectileZoneIndex];
  const attackResult = calculateAttackAgainstZone(attack, targetZone, hits);
  const zoneDamage = attackResult.damage * attackResult.hits;
  const directMainDamage = projectileZoneIndex === mainZoneIndex ? zoneDamage : 0;
  const passthroughMainDamage = projectileZoneIndex === mainZoneIndex
    ? 0
    : attackResult.damageToMain * attackResult.hits;

  scenario.projectileTargetZoneName = targetZone?.zone_name || null;
  scenario.zoneApplications.push(createZoneApplication({
    attack,
    zone: targetZone,
    zoneIndex: projectileZoneIndex,
    mode: 'projectile',
    hits: attackResult.hits,
    zoneDamage,
    directMainDamage,
    passthroughMainDamage,
    appliesToZone: true,
    attackResult
  }));
  scenario.totalZoneDamagePerCycle = zoneDamage;
  scenario.totalDirectMainDamagePerCycle = directMainDamage;
  scenario.totalPassthroughMainDamagePerCycle = passthroughMainDamage;
  scenario.totalDamageToMainPerCycle = directMainDamage + passthroughMainDamage;
  return scenario;
}

// Explosion model:
// - if any AoE ray hits the enemy, resolve one direct Main explosive hit using Main AV / ExDR
// - each struck zone also resolves its own part damage using that zone's AV / ExDR
// - only actual part damage contributes % To Main passthrough
// - current special-case non-main ExTarget: Main zones suppress direct explosive part damage/passthrough,
//   but they do not suppress the one direct Main explosive check for the explosion
function buildExplosionAttackScenario({
  attack,
  hits,
  enemy,
  explosiveZoneIndices,
  mainZoneIndex
}) {
  const scenario = buildEmptyAttackScenario(attack, hits, 'explosion');
  const zones = enemy?.zones || [];
  if (zones.length === 0 || explosiveZoneIndices.length === 0) {
    return scenario;
  }

  const mainZone = isValidZoneIndex(zones, mainZoneIndex)
    ? zones[mainZoneIndex]
    : null;
  const mainAttackResult = mainZone
    ? calculateAttackAgainstZone(attack, mainZone, hits)
    : null;
  const directMainDamagePerExplosion = mainAttackResult
    ? mainAttackResult.damage * mainAttackResult.hits
    : 0;
  const directMainApplicationZoneIndex = explosiveZoneIndices.includes(mainZoneIndex)
    ? mainZoneIndex
    : explosiveZoneIndices[0];

  scenario.totalDirectMainDamagePerCycle = directMainDamagePerExplosion;

  explosiveZoneIndices.forEach((zoneIndex) => {
    if (!isValidZoneIndex(zones, zoneIndex)) {
      return;
    }

    const zone = zones[zoneIndex];
    const targetsMainOnly = zoneIndex !== mainZoneIndex
      && normalizeZoneName({ zone_name: zone?.ExTarget }) === 'main';

    let attackResult = null;
    let zoneDamage = 0;
    let passthroughMainDamage = 0;
    let appliesToZone = false;
    const directMainDamage = zoneIndex === directMainApplicationZoneIndex
      ? directMainDamagePerExplosion
      : 0;

    if (zoneIndex === mainZoneIndex) {
      attackResult = mainAttackResult;
      zoneDamage = directMainDamagePerExplosion;
      appliesToZone = zoneDamage > 0;
    } else if (!targetsMainOnly) {
      attackResult = calculateAttackAgainstZone(attack, zone, hits);
      zoneDamage = attackResult.damage * attackResult.hits;
      passthroughMainDamage = attackResult.damageToMain * attackResult.hits;
      appliesToZone = zoneDamage > 0;
    }

    scenario.zoneApplications.push(createZoneApplication({
      attack,
      zone,
      zoneIndex,
      mode: 'explosion',
      hits,
      zoneDamage,
      directMainDamage,
      passthroughMainDamage,
      appliesToZone,
      attackResult
    }));
    scenario.totalZoneDamagePerCycle += zoneDamage;
    scenario.totalPassthroughMainDamagePerCycle += passthroughMainDamage;
  });

  scenario.explosiveTargetZoneNames = scenario.zoneApplications.map((application) => application.zoneName);
  scenario.totalDamageToMainPerCycle = scenario.totalDirectMainDamagePerCycle + scenario.totalPassthroughMainDamagePerCycle;
  return scenario;
}

export function summarizeEnemyTargetScenario({
  enemy,
  selectedAttacks = [],
  hitCounts = [],
  rpm,
  projectileZoneIndex,
  explosiveZoneIndices = []
}) {
  if (!enemy?.zones || enemy.zones.length === 0) {
    return null;
  }

  const mainZoneIndex = findMainZoneIndex(enemy);
  const normalizedProjectileZoneIndex = isValidZoneIndex(enemy.zones, projectileZoneIndex)
    ? projectileZoneIndex
    : null;
  const normalizedExplosiveZoneIndices = [...new Set(
    (explosiveZoneIndices || []).filter((zoneIndex) => isValidZoneIndex(enemy.zones, zoneIndex))
  )];

  const zoneAccumulators = enemy.zones.map((zone, zoneIndex) => ({
    zone,
    zoneIndex,
    totalZoneDamagePerCycle: 0,
    attackDetails: []
  }));

  const attackDetails = [];
  let totalDirectMainDamagePerCycle = 0;
  let totalPassthroughMainDamagePerCycle = 0;

  selectedAttacks.forEach((attack, index) => {
    const hits = toPositiveInteger(hitCounts[index], 1);
    const attackScenario = isExplosiveAttack(attack)
      ? buildExplosionAttackScenario({
        attack,
        hits,
        enemy,
        explosiveZoneIndices: normalizedExplosiveZoneIndices,
        mainZoneIndex
      })
      : buildProjectileAttackScenario({
        attack,
        hits,
        enemy,
        projectileZoneIndex: normalizedProjectileZoneIndex,
        mainZoneIndex
      });

    totalDirectMainDamagePerCycle += attackScenario.totalDirectMainDamagePerCycle;
    totalPassthroughMainDamagePerCycle += attackScenario.totalPassthroughMainDamagePerCycle;

    attackScenario.zoneApplications.forEach((application) => {
      const zoneAccumulator = zoneAccumulators[application.zoneIndex];
      if (!zoneAccumulator) {
        return;
      }

      zoneAccumulator.totalZoneDamagePerCycle += application.zoneDamage;
      zoneAccumulator.attackDetails.push(application);
    });

    attackDetails.push(attackScenario);
  });

  const totalDamageToMainPerCycle = totalDirectMainDamagePerCycle + totalPassthroughMainDamagePerCycle;
  const zoneSummaries = enemy.zones.map((zone, zoneIndex) => {
    const totalDamagePerCycle = zoneIndex === mainZoneIndex
      ? totalDamageToMainPerCycle
      : zoneAccumulators[zoneIndex].totalZoneDamagePerCycle;

    return buildZoneSummary({
      zone,
      zoneAttackDetails: zoneAccumulators[zoneIndex].attackDetails,
      totalDamagePerCycle,
      totalDamageToMainPerCycle,
      totalDirectMainDamagePerCycle,
      totalPassthroughMainDamagePerCycle,
      enemyMainHealth: enemy.health,
      rpm,
      hasSelectedAttacks: selectedAttacks.length > 0
    });
  });

  return {
    enemy,
    mainZoneIndex,
    projectileZoneIndex: normalizedProjectileZoneIndex,
    explosiveZoneIndices: normalizedExplosiveZoneIndices,
    projectileTargetZone: normalizedProjectileZoneIndex === null
      ? null
      : enemy.zones[normalizedProjectileZoneIndex],
    explosiveTargetZones: normalizedExplosiveZoneIndices.map((zoneIndex) => enemy.zones[zoneIndex]),
    attackDetails,
    zoneSummaries,
    totalDamageToMainPerCycle,
    totalDirectMainDamagePerCycle,
    totalPassthroughMainDamagePerCycle,
    enemyMainHealth: toNumber(enemy.health),
    hasSelectedAttacks: selectedAttacks.length > 0
  };
}

export function getZoneOutcomeKind({ zone, totalDamagePerCycle, totalDamageToMainPerCycle, killSummary }) {
  const hasZoneDamage = totalDamagePerCycle > 0;
  const hasMainDamage = totalDamageToMainPerCycle > 0 && killSummary?.mainShotsToKill !== null;

  if (!hasZoneDamage && !hasMainDamage) {
    return null;
  }

  if (zone?.IsFatal && hasZoneDamage) {
    return 'fatal';
  }

  if (hasMainDamage) {
    if (
      hasZoneDamage &&
      killSummary?.zoneShotsToKill !== null &&
      killSummary.zoneShotsToKill < killSummary.mainShotsToKill
    ) {
      return 'limb';
    }

    return 'main';
  }

  return 'utility';
}

export function getZoneOutcomeLabel(kind) {
  if (kind === 'fatal') {
    return 'Kill';
  }

  if (kind === 'main') {
    return 'Main';
  }

  if (kind === 'limb') {
    return 'Limb';
  }

  if (kind === 'utility') {
    return 'Part';
  }

  return null;
}

export function getZoneOutcomeDescription(kind) {
  if (kind === 'fatal') {
    return 'Killing this part kills the enemy';
  }

  if (kind === 'main') {
    return 'This path kills through main health';
  }

  if (kind === 'limb') {
    return 'This part can be removed before main would die';
  }

  if (kind === 'utility') {
    return 'This part can be removed, but destroying it does not kill the enemy';
  }

  return null;
}

export function getZoneDisplayedShotsToKill(kind, killSummary) {
  if (!killSummary) {
    return null;
  }

  if (kind === 'fatal') {
    return killSummary.zoneShotsToKill;
  }

  if (kind === 'main') {
    return killSummary.mainShotsToKill;
  }

  if (kind === 'limb' || kind === 'utility') {
    return killSummary.zoneShotsToKill;
  }

  return null;
}

export function getZoneDisplayedTtkSeconds(kind, killSummary) {
  if (!killSummary) {
    return null;
  }

  if (kind === 'fatal') {
    return killSummary.zoneTtkSeconds;
  }

  if (kind === 'main') {
    return killSummary.mainTtkSeconds;
  }

  if (kind === 'limb' || kind === 'utility') {
    return killSummary.zoneTtkSeconds;
  }

  return null;
}
