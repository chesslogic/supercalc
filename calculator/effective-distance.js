import { hasZeroBleedConstitution } from './enemy-zone-display.js';
import { roundDamagePacket } from './damage-rounding.js';
import { getZoneDisplayedKillPath, getZoneDisplayedShotsToKill } from './zone-damage.js';
import {
  MIN_BALLISTIC_DAMAGE_MULTIPLIER,
  calculateBallisticDamageMultiplier,
  resolveBallisticFalloffProfileForWeapon
} from '../weapons/falloff.js';

export const EFFECTIVE_DISTANCE_TOOLTIP = 'Approximate maximum distance before this breakpoint can fail. Ballistic falloff modeling can be off by as much as 3%.';

function toFiniteNumber(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function createUnavailableDistanceInfo(title) {
  return {
    meters: null,
    sortValue: null,
    text: '-',
    title,
    isAvailable: false
  };
}

export function formatEffectiveDistanceText(meters) {
  if (meters === null || meters === undefined) {
    return '-';
  }

  if (!Number.isFinite(meters)) {
    return '∞m';
  }

  if (meters > 0 && meters < 1) {
    return '<1m';
  }

  return `${Math.max(0, Math.floor(meters))}m`;
}

function getDisplayedDamageFloor(zone, zoneSummary, displayedKillPath, displayedShots) {
  if (!Number.isFinite(displayedShots) || displayedShots <= 0) {
    return null;
  }

  if (displayedKillPath === 'main') {
    return Math.ceil((toFiniteNumber(zoneSummary?.enemyMainHealth) ?? 0) / displayedShots);
  }

  const zoneHealth = toFiniteNumber(zoneSummary?.zoneHealth);
  if (zoneHealth === null || zoneHealth < 0) {
    return null;
  }

  const zoneCon = toFiniteNumber(zoneSummary?.zoneCon) ?? 0;
  const effectiveZoneHealth = hasZeroBleedConstitution(zone)
    ? zoneHealth + zoneCon
    : zoneHealth;

  return Math.ceil(effectiveZoneHealth / displayedShots);
}

function getDisplayedApplicationDamage(application, displayedKillPath) {
  const hits = toFiniteNumber(application?.hits) ?? 1;

  if (displayedKillPath === 'main') {
    const totalMainDamage = toFiniteNumber(application?.totalMainDamage);
    if (totalMainDamage !== null) {
      return totalMainDamage;
    }

    const damageToMainPerHit = toFiniteNumber(application?.damageToMain);
    return damageToMainPerHit === null ? 0 : damageToMainPerHit * hits;
  }

  const zoneDamage = toFiniteNumber(application?.zoneDamage);
  if (zoneDamage !== null) {
    return zoneDamage;
  }

  const damagePerHit = toFiniteNumber(application?.damage);
  return damagePerHit === null ? 0 : damagePerHit * hits;
}

function getApplicationAttackResult(application) {
  return application?.attackResult || application || null;
}

function getApplicationHits(application) {
  const hits = toFiniteNumber(application?.hits) ?? toFiniteNumber(application?.attackResult?.hits);
  return hits === null || hits <= 0 ? 1 : hits;
}

function isDirectMainApplication(application, zone) {
  const directMainDamage = toFiniteNumber(application?.directMainDamage) ?? 0;
  if (directMainDamage > 0) {
    return true;
  }

  const zoneName = String(application?.zoneName ?? zone?.zone_name ?? '').trim().toLowerCase();
  return zoneName === 'main';
}

function calculateRoundedImpactDamageAtMultiplier(attackResult, damageMultiplier) {
  const rawBaseDamage = toFiniteNumber(attackResult?.rawBaseDamage);
  if (rawBaseDamage === null || rawBaseDamage <= 0) {
    return 0;
  }

  const armorMultiplier = toFiniteNumber(attackResult?.damageMultiplier) ?? 0;
  const explosionMultiplier = toFiniteNumber(attackResult?.explosionModifier) ?? 1;
  return roundDamagePacket(rawBaseDamage * damageMultiplier * armorMultiplier * explosionMultiplier) ?? 0;
}

function calculateModeledApplicationDamageAtMultiplier(application, displayedKillPath, zone, damageMultiplier) {
  const attackResult = getApplicationAttackResult(application);
  if (!attackResult) {
    return 0;
  }

  const roundedImpactDamage = calculateRoundedImpactDamageAtMultiplier(attackResult, damageMultiplier);
  if (roundedImpactDamage <= 0) {
    return 0;
  }

  if (displayedKillPath === 'main') {
    const mainDamagePerHit = isDirectMainApplication(application, zone)
      ? roundedImpactDamage
      : (roundDamagePacket(roundedImpactDamage * (toFiniteNumber(attackResult?.toMainPercent) ?? 0)) ?? 0);

    return mainDamagePerHit * getApplicationHits(application);
  }

  return roundedImpactDamage * getApplicationHits(application);
}

function calculateCompositeDamageAtDistance(modeledApplications, constantDamage, zone, displayedKillPath, distanceMeters) {
  return modeledApplications.reduce((sum, application) => {
    const multiplier = calculateBallisticDamageMultiplier(application.attributes, distanceMeters);
    if (multiplier === null) {
      return sum;
    }

    return sum + calculateModeledApplicationDamageAtMultiplier(application.source, displayedKillPath, zone, multiplier);
  }, constantDamage);
}

function calculateCompositeMinimumDamage(modeledApplications, constantDamage, zone, displayedKillPath) {
  return modeledApplications.reduce((sum, application) => {
    return sum + calculateModeledApplicationDamageAtMultiplier(
      application.source,
      displayedKillPath,
      zone,
      MIN_BALLISTIC_DAMAGE_MULTIPLIER
    );
  }, constantDamage);
}

function solveMaxDistanceForDamageFloor(modeledApplications, constantDamage, zone, displayedKillPath, damageFloor) {
  if (!Number.isFinite(damageFloor) || damageFloor <= 0) {
    return null;
  }

  const pointBlankDamage = calculateCompositeDamageAtDistance(modeledApplications, constantDamage, zone, displayedKillPath, 0);
  if (pointBlankDamage < damageFloor) {
    return null;
  }

  const minimumDamage = calculateCompositeMinimumDamage(modeledApplications, constantDamage, zone, displayedKillPath);
  if (minimumDamage >= damageFloor) {
    return Number.POSITIVE_INFINITY;
  }

  let low = 0;
  let high = 25;
  while (
    calculateCompositeDamageAtDistance(modeledApplications, constantDamage, zone, displayedKillPath, high) >= damageFloor
    && high < 100000
  ) {
    high *= 2;
  }

  for (let iteration = 0; iteration < 40; iteration += 1) {
    const middle = (low + high) / 2;
    const damageAtMiddle = calculateCompositeDamageAtDistance(
      modeledApplications,
      constantDamage,
      zone,
      displayedKillPath,
      middle
    );

    if (damageAtMiddle >= damageFloor) {
      low = middle;
    } else {
      high = middle;
    }
  }

  return low;
}

function getResolutionUnavailableTitle(status) {
  if (status === 'unloaded') {
    return `${EFFECTIVE_DISTANCE_TOOLTIP}\nBallistic falloff data is not loaded yet.`;
  }

  if (status === 'excluded') {
    return `${EFFECTIVE_DISTANCE_TOOLTIP}\nThis weapon uses a special-case ballistic curve that is not modeled yet.`;
  }

  if (status === 'ambiguous') {
    return `${EFFECTIVE_DISTANCE_TOOLTIP}\nThis weapon has multiple possible falloff profiles, so this range estimate is currently unavailable.`;
  }

  return `${EFFECTIVE_DISTANCE_TOOLTIP}\nNo ballistic falloff profile is loaded for this weapon.`;
}

export function calculateEffectiveDistanceInfo({
  weapon,
  zone,
  zoneSummary,
  outcomeKind,
  selectedAttackCount = 0,
  damagesZone = false
} = {}) {
  if (!weapon) {
    return createUnavailableDistanceInfo('Select a weapon');
  }

  if (selectedAttackCount === 0) {
    return createUnavailableDistanceInfo('Select one or more attack rows');
  }

  if (!damagesZone || !outcomeKind || !zoneSummary?.killSummary) {
    return createUnavailableDistanceInfo('Selected attacks do not damage this part');
  }

  const displayedKillPath = getZoneDisplayedKillPath(outcomeKind, zoneSummary.killSummary);
  const displayedShots = getZoneDisplayedShotsToKill(outcomeKind, zoneSummary.killSummary);

  if (!displayedKillPath || !Number.isFinite(displayedShots) || displayedShots <= 0) {
    return createUnavailableDistanceInfo('Approximate range unavailable for this breakpoint');
  }

  const damageFloor = getDisplayedDamageFloor(zone, zoneSummary, displayedKillPath, displayedShots);
  if (!Number.isFinite(damageFloor) || damageFloor <= 0) {
    return createUnavailableDistanceInfo('Approximate range unavailable for this breakpoint');
  }

  const attackDetails = Array.isArray(zoneSummary.attackDetails) ? zoneSummary.attackDetails : [];
  const projectileApplications = attackDetails.filter((application) =>
    !application?.isExplosion && getDisplayedApplicationDamage(application, displayedKillPath) > 0
  );

  if (projectileApplications.length === 0) {
    return createUnavailableDistanceInfo('Approximate range is shown only for projectile-driven breakpoints');
  }

  const falloffResolution = resolveBallisticFalloffProfileForWeapon(weapon);
  if (falloffResolution.status !== 'available' || !falloffResolution.profile) {
    return createUnavailableDistanceInfo(getResolutionUnavailableTitle(falloffResolution.status));
  }

  const constantDamage = attackDetails.reduce((sum, application) => {
    const contribution = getDisplayedApplicationDamage(application, displayedKillPath);
    if (contribution <= 0) {
      return sum;
    }

    if (application?.isExplosion) {
      return sum + contribution;
    }

    return sum;
  }, 0);

  const modeledApplications = [];
  let adjustedConstantDamage = constantDamage;

  for (const application of projectileApplications) {
    const contribution = getDisplayedApplicationDamage(application, displayedKillPath);
    const drag = toFiniteNumber(falloffResolution.profile.attributes.drag) ?? 0;
    const attackResult = getApplicationAttackResult(application);
    const rawBaseDamage = toFiniteNumber(attackResult?.rawBaseDamage);

    if (drag <= 0 || rawBaseDamage === null) {
      adjustedConstantDamage += contribution;
      continue;
    }

    modeledApplications.push({
      source: application,
      attributes: falloffResolution.profile.attributes
    });
  }

  const meters = solveMaxDistanceForDamageFloor(
    modeledApplications,
    adjustedConstantDamage,
    zone,
    displayedKillPath,
    damageFloor
  );
  if (meters === null) {
    return createUnavailableDistanceInfo(`${EFFECTIVE_DISTANCE_TOOLTIP}\nThis breakpoint is already below the required damage floor at point blank range.`);
  }

  const detailLine = Number.isFinite(meters)
    ? `This breakpoint needs at least ${damageFloor} rounded damage per selected firing cycle.`
    : 'This breakpoint still holds at the model\'s minimum projectile damage multiplier.';

  return {
    meters,
    sortValue: meters,
    text: formatEffectiveDistanceText(meters),
    title: `${EFFECTIVE_DISTANCE_TOOLTIP}\n${detailLine}`,
    isAvailable: true
  };
}
