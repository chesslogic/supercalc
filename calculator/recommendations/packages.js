import { isExplosiveAttack } from '../attack-types.js';
import { getAttackRowKey } from '../compare-utils.js';
import { recordRecommendationWork } from '../recommendation-work-distribution.js';
import {
  getWeaponRowMeaningfulDamage,
  getWeaponRowMultiplicity
} from '../weapon-dropdown.js';
import {
  compareNullableNumber,
  normalizeText,
  toFiniteNumber,
  RECOMMENDATION_FRAGMENT_HIT_CAP,
  RECOMMENDATION_IMPLICIT_REPEAT_HITS,
  RECOMMENDATION_MAX_SHOTGUN_HITS,
  RECOMMENDATION_SHOTGUN_HIT_SHARE
} from './shared.js';

const RECOMMENDATION_IMPLICIT_REPEAT_RULES = [
  {
    id: 'eagle-bombing-run',
    weaponPattern: /^eagle (?:airstrike|napalm airstrike)$/i,
    attackPattern: /bomb/i,
    hitCount: RECOMMENDATION_IMPLICIT_REPEAT_HITS
  }
];

const RECOMMENDATION_PACKAGE_FAMILY_LABELS = {
  projectile: 'Proj',
  explosion: 'Blast',
  spray: 'Spray',
  beam: 'Beam',
  arc: 'Arc',
  flame: 'Flame',
  gas: 'Gas',
  melee: 'Melee'
};

const RECOMMENDATION_PACKAGE_SUFFIX_PATTERNS = [
  /(?:[_\s]+)P(?:[_\s]+)IE$/i,
  /(?:[_\s]+)IE$/i,
  /(?:[_\s]+)?EImpact$/i,
  /(?:[_\s]+)Impact$/i,
  /(?:[_\s]+)SPRAY$/i,
  /(?:[_\s]+)BEAM$/i,
  /(?:[_\s]+)ARC$/i,
  /(?:[_\s]+)P$/i,
  /(?:[_\s]+)E$/i,
  /(?:[_\s]+)S$/i,
  /(?:[_\s]+)B$/i
];

function getRecommendationAttackName(attackRow) {
  return String(attackRow?.['Atk Name'] || attackRow?.Name || '').trim();
}

function getRecommendationAttackTypeText(attackRow) {
  return String(attackRow?.['Atk Type'] ?? attackRow?.Stage ?? '').trim().toLowerCase();
}

function stripRecommendationPackageSuffix(attackName) {
  let strippedName = String(attackName || '').trim()
    .replace(/\s*\((?:volley|total)\s+x\d+\)\s*$/i, '')
    .replace(/\s+x\d+\s*$/i, '')
    .trim();

  for (const pattern of RECOMMENDATION_PACKAGE_SUFFIX_PATTERNS) {
    const nextName = strippedName.replace(pattern, '').replace(/[_\s]+$/, '').trim();
    if (nextName && nextName !== strippedName) {
      strippedName = nextName;
      break;
    }
  }

  return strippedName;
}

function getRecommendationAttackEventLabel(attackRow) {
  const attackName = getRecommendationAttackName(attackRow);
  if (!attackName) {
    return '';
  }

  return stripRecommendationPackageSuffix(attackName) || attackName;
}

export function getRecommendationAttackEventKey(attackRow) {
  const eventLabel = getRecommendationAttackEventLabel(attackRow);
  return eventLabel
    ? normalizeText(eventLabel).replace(/[_\s]+/g, ' ')
    : '';
}

export function getRecommendationAttackFamily(attackRow) {
  const attackType = getRecommendationAttackTypeText(attackRow);
  if (isExplosiveAttack(attackRow)) {
    return 'explosion';
  }

  if (attackType.includes('spray')) {
    return 'spray';
  }

  if (attackType.includes('beam')) {
    return 'beam';
  }

  if (attackType.includes('arc')) {
    return 'arc';
  }

  if (attackType.includes('flame') || attackType.includes('fire')) {
    return 'flame';
  }

  if (attackType.includes('gas')) {
    return 'gas';
  }

  if (attackType.includes('melee')) {
    return 'melee';
  }

  return 'projectile';
}

function isBundledRecommendationAttack(attackName) {
  return /\((?:volley|total)\s+x\d+\)/i.test(attackName);
}

function isShotgunRecommendationAttack({
  weapon,
  attackName,
  multiplicity
}) {
  if (multiplicity <= 1) {
    return false;
  }

  const weaponSub = normalizeText(weapon?.sub);
  const weaponCode = normalizeText(weapon?.code);
  const weaponName = normalizeText(weapon?.name);
  return weaponSub === 'sg'
    || weaponCode.startsWith('sg-')
    || weaponName.includes('shotgun')
    || /\b(?:buckshot|birdshot|flechettes?|stun rounds|trident|liberty fire)\b/i.test(attackName);
}

function isFragmentRecommendationAttack({
  attackRow,
  attackName,
  multiplicity
}) {
  if (multiplicity <= 1) {
    return false;
  }

  return isExplosiveAttack(attackRow)
    || /\b(?:shrapnel|cluster bomb|flak rounds)\b/i.test(attackName);
}

function isConservativeRecommendationPackageExcludedAttack({
  attackRow,
  attackName,
  multiplicity
}) {
  return isFragmentRecommendationAttack({
    attackRow,
    attackName,
    multiplicity
  }) || /\bfragments?\b/i.test(attackName);
}

function getImplicitRecommendationRepeatHits({
  weapon,
  attackName
}) {
  return RECOMMENDATION_IMPLICIT_REPEAT_RULES.find((rule) => (
    rule.weaponPattern.test(weapon?.name || '')
    && (!rule.attackPattern || rule.attackPattern.test(attackName))
  ))?.hitCount || 1;
}

// Recommendation rows intentionally model a plausible subset of simultaneous impacts rather than
// assuming every pellet or bomblet lands. Explicit "(Volley xN)" / "(Total xN)" rows are already
// pre-bundled in the sheet and stay at one firing cycle.
export function getRecommendationAttackHitCount({
  weapon,
  attackRow
}) {
  const attackName = getRecommendationAttackName(attackRow);
  if (!attackName) {
    return 1;
  }

  if (isBundledRecommendationAttack(attackName)) {
    return 1;
  }

  const multiplicity = getWeaponRowMultiplicity(attackRow);
  let hitCount = 1;

  if (isShotgunRecommendationAttack({
    weapon,
    attackName,
    multiplicity
  })) {
    hitCount = Math.min(
      RECOMMENDATION_MAX_SHOTGUN_HITS,
      Math.max(2, Math.ceil(multiplicity * RECOMMENDATION_SHOTGUN_HIT_SHARE))
    );
  } else if (isFragmentRecommendationAttack({
    attackRow,
    attackName,
    multiplicity
  })) {
    hitCount = Math.min(RECOMMENDATION_FRAGMENT_HIT_CAP, multiplicity);
  }

  return Math.max(
    hitCount,
    getImplicitRecommendationRepeatHits({
      weapon,
      attackName
    })
  );
}

function buildRecommendationAttackDescriptor({
  weapon,
  attackRow,
  rowIndex
}) {
  const attackName = getRecommendationAttackName(attackRow);
  if (!attackName) {
    return null;
  }

  const multiplicity = getWeaponRowMultiplicity(attackRow);
  const family = getRecommendationAttackFamily(attackRow);
  const isBundled = isBundledRecommendationAttack(attackName);
  const conservativeExcluded = isConservativeRecommendationPackageExcludedAttack({
    attackRow,
    attackName,
    multiplicity
  });

  return {
    attackRow,
    attackKey: getAttackRowKey(attackRow),
    attackName,
    hitCount: getRecommendationAttackHitCount({
      weapon,
      attackRow
    }),
    family,
    familyLabel: RECOMMENDATION_PACKAGE_FAMILY_LABELS[family] || family,
    eventLabel: getRecommendationAttackEventLabel(attackRow),
    eventKey: getRecommendationAttackEventKey(attackRow),
    meaningfulDamage: getWeaponRowMeaningfulDamage(attackRow),
    apValue: toFiniteNumber(attackRow?.AP) ?? Number.NEGATIVE_INFINITY,
    rowIndex,
    conservativeExcluded,
    autoCombineEligible: !isBundled && !conservativeExcluded
  };
}

function compareRecommendationPackageComponentPreference(left, right) {
  let comparison = compareNullableNumber(right?.meaningfulDamage ?? null, left?.meaningfulDamage ?? null, 'asc');
  if (comparison !== 0) {
    return comparison;
  }

  comparison = compareNullableNumber(right?.apValue ?? null, left?.apValue ?? null, 'asc');
  if (comparison !== 0) {
    return comparison;
  }

  comparison = compareNullableNumber(right?.hitCount ?? null, left?.hitCount ?? null, 'asc');
  if (comparison !== 0) {
    return comparison;
  }

  return String(left?.attackName || '').localeCompare(String(right?.attackName || ''));
}

function getRecommendationPackageDedupKey(descriptors = []) {
  return descriptors
    .map((descriptor) => String(descriptor?.attackKey || ''))
    .filter(Boolean)
    .sort()
    .join('||');
}

function buildRecommendationPackageLabel(descriptors = []) {
  const components = descriptors.filter(Boolean);
  if (components.length === 0) {
    return 'Attack';
  }

  if (components.length === 1) {
    return components[0].attackName;
  }

  const eventLabels = [...new Set(components.map((descriptor) => descriptor.eventLabel).filter(Boolean))];
  if (eventLabels.length === 1) {
    const familyLabels = [...new Set(components.map((descriptor) => descriptor.familyLabel || descriptor.family).filter(Boolean))];
    return `${eventLabels[0]} [${familyLabels.join(' + ')}]`;
  }

  return components.map((descriptor) => descriptor.attackName).join(' + ');
}

function buildRecommendationAttackPackage(descriptors = [], {
  excludedAttackNames = []
} = {}) {
  const orderedDescriptors = descriptors
    .filter(Boolean)
    .slice()
    .sort((left, right) => (left?.rowIndex ?? 0) - (right?.rowIndex ?? 0));
  const packageComponents = orderedDescriptors.map((descriptor) => ({
    attackRow: descriptor.attackRow,
    attackKey: descriptor.attackKey,
    attackName: descriptor.attackName,
    hitCount: descriptor.hitCount,
    family: descriptor.family
  }));

  return {
    attackRow: orderedDescriptors[0]?.attackRow || null,
    attackRows: orderedDescriptors.map((descriptor) => descriptor.attackRow),
    attackName: buildRecommendationPackageLabel(orderedDescriptors),
    hitCount: orderedDescriptors[0]?.hitCount ?? 1,
    hitCounts: orderedDescriptors.map((descriptor) => descriptor.hitCount),
    packageComponents,
    excludedAttackNames: [...new Set((Array.isArray(excludedAttackNames) ? excludedAttackNames : []).filter(Boolean))],
    isCombinedPackage: orderedDescriptors.length > 1
  };
}

export function isStratagemRecommendationWeapon(weapon) {
  return normalizeText(weapon?.type) === 'stratagem';
}

export function buildRecommendationAttackPackages(weapon, {
  includeCombinedPackages = false,
  instrumentation = null,
  analysisStage = null
} = {}) {
  const descriptors = (Array.isArray(weapon?.rows) ? weapon.rows : [])
    .map((attackRow, rowIndex) => buildRecommendationAttackDescriptor({
      weapon,
      attackRow,
      rowIndex
    }))
    .filter(Boolean);
  const packages = descriptors.map((descriptor) => buildRecommendationAttackPackage([descriptor]));

  if (!includeCombinedPackages) {
    recordRecommendationWork(instrumentation, {
      stage: analysisStage,
      method: 'buildRecommendationAttackPackages',
      metrics: {
        inputAttackRows: Array.isArray(weapon?.rows) ? weapon.rows.length : 0,
        outputAttackPackages: packages.length,
        combinedAttackPackages: packages.filter((attackPackage) => attackPackage?.isCombinedPackage).length
      }
    });
    return packages;
  }

  const groupedDescriptors = descriptors.reduce((groups, descriptor) => {
    if (!descriptor.eventKey) {
      return groups;
    }

    if (!groups.has(descriptor.eventKey)) {
      groups.set(descriptor.eventKey, []);
    }

    groups.get(descriptor.eventKey).push(descriptor);
    return groups;
  }, new Map());

  if (includeCombinedPackages) {
    const seenPackageKeys = new Set(
      packages.map((attackPackage) => getRecommendationPackageDedupKey(attackPackage.packageComponents))
    );

    groupedDescriptors.forEach((groupDescriptors) => {
      const eligibleDescriptors = groupDescriptors.filter((descriptor) => descriptor.autoCombineEligible);
      if (eligibleDescriptors.length < 2) {
        return;
      }

      const familyGroups = eligibleDescriptors.reduce((groups, descriptor) => {
        if (!groups.has(descriptor.family)) {
          groups.set(descriptor.family, []);
        }

        groups.get(descriptor.family).push(descriptor);
        return groups;
      }, new Map());
      if (familyGroups.size < 2) {
        return;
      }

      const excludedAttackNames = groupDescriptors
        .filter((descriptor) => descriptor.conservativeExcluded)
        .map((descriptor) => descriptor.attackName);

      eligibleDescriptors.forEach((seedDescriptor) => {
        const packageDescriptors = [seedDescriptor];

        familyGroups.forEach((familyDescriptors, family) => {
          if (family === seedDescriptor.family) {
            return;
          }

          const chosenDescriptor = familyDescriptors
            .slice()
            .sort(compareRecommendationPackageComponentPreference)[0];
          if (!chosenDescriptor || packageDescriptors.some((descriptor) => descriptor.attackKey === chosenDescriptor.attackKey)) {
            return;
          }

          packageDescriptors.push(chosenDescriptor);
        });

        if (packageDescriptors.length < 2) {
          return;
        }

        const packageKey = getRecommendationPackageDedupKey(packageDescriptors);
        if (seenPackageKeys.has(packageKey)) {
          return;
        }

        seenPackageKeys.add(packageKey);
        packages.push(buildRecommendationAttackPackage(packageDescriptors, {
          excludedAttackNames
        }));
      });
    });
  }

  let result = packages;
  if (isStratagemRecommendationWeapon(weapon)) {
    const eventFamiliesByAttackKey = new Map();
    groupedDescriptors.forEach((groupDescriptors) => {
      const familySet = new Set(groupDescriptors.map((descriptor) => descriptor.family).filter(Boolean));
      groupDescriptors.forEach((descriptor) => {
        if (descriptor?.attackKey) {
          eventFamiliesByAttackKey.set(descriptor.attackKey, familySet);
        }
      });
    });

    result = packages.filter((attackPackage) => {
      if (attackPackage?.isCombinedPackage) {
        return true;
      }

      if (!Array.isArray(attackPackage?.packageComponents) || attackPackage.packageComponents.length !== 1) {
        return true;
      }

      const onlyComponent = attackPackage.packageComponents[0];
      if (onlyComponent?.family !== 'projectile') {
        return true;
      }

      return !eventFamiliesByAttackKey.get(onlyComponent.attackKey)?.has('explosion');
    });
  }

  recordRecommendationWork(instrumentation, {
    stage: analysisStage,
    method: 'buildRecommendationAttackPackages',
    metrics: {
      inputAttackRows: Array.isArray(weapon?.rows) ? weapon.rows.length : 0,
      outputAttackPackages: result.length,
      combinedAttackPackages: result.filter((attackPackage) => attackPackage?.isCombinedPackage).length
    }
  });

  return result;
}
