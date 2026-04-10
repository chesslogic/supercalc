import { apColorClass } from '../colors.js';
import {
  buildSortModeLookup,
  compareByComparators,
  compareText,
  getSortModeOptions,
  normalizeSortModeId
} from '../sort-utils.js';

export const DROPDOWN_AP_SIGNIFICANCE_SHARE = 0.1;
export const WEAPON_TYPE_ORDER = ['primary', 'secondary', 'grenade', 'support', 'stratagem'];
export const DEFAULT_WEAPON_SORT_MODE = 'grouped';
export const WEAPON_SORT_MODE_DEFINITIONS = [
  {
    id: 'grouped',
    label: 'Grouped'
  },
  {
    id: 'ap-desc',
    label: 'AP high -> low'
  },
  {
    id: 'match-reference-subtype',
    label: 'Same AP, then subtype',
    compareOnly: true
  },
  {
    id: 'match-reference-slot',
    label: 'Same AP, then slot',
    compareOnly: true
  }
];

const WEAPON_SORT_MODE_LOOKUP = buildSortModeLookup(WEAPON_SORT_MODE_DEFINITIONS, [
  ['match-reference', 'match-reference-subtype']
]);
const WEAPON_SUBTYPE_SORT_FAMILY_DEFINITIONS = [
  {
    id: 'full-auto',
    subtypes: ['ar', 'mg', 'smg']
  },
  {
    id: 'precision-long-gun',
    subtypes: ['dmr', 'can']
  }
];
const WEAPON_SUBTYPE_SORT_FAMILY_LOOKUP = WEAPON_SUBTYPE_SORT_FAMILY_DEFINITIONS.reduce((lookup, definition) => {
  definition.subtypes.forEach((subtype) => {
    lookup.set(subtype, definition.id);
  });
  return lookup;
}, new Map());
export const WEAPON_DROPDOWN_MULTIPROJECTILE_PREVIEW_RULES = [
  {
    id: 'all-directional-fragments',
    pattern: /(shrapnel|cluster bomb)/i,
    estimateHitCount(multiplicity) {
      return Math.min(multiplicity, 3);
    }
  },
  {
    id: 'default-multi-projectile',
    pattern: /(?:^|[\s(])x\d+(?=[)\s]|$)/i,
    estimateHitCount(multiplicity) {
      return Math.min(multiplicity, 3);
    }
  }
];

function toFiniteNumber(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function parseApValue(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    return numeric;
  }

  const matches = String(value).match(/\d+/g);
  if (!matches || matches.length === 0) {
    return null;
  }

  return Math.max(...matches.map((match) => Number.parseInt(match, 10)));
}

function normalizeWeaponTaxonomyValue(value) {
  return String(value || '').trim().toLowerCase();
}

function toSortableApValue(value) {
  return value === null ? Number.NEGATIVE_INFINITY : value;
}

function getWeaponSubtypeSortFamilyId(weapon) {
  const subtype = normalizeWeaponTaxonomyValue(weapon?.sub);
  return subtype
    ? (WEAPON_SUBTYPE_SORT_FAMILY_LOOKUP.get(subtype) || null)
    : null;
}

export function getWeaponRowMultiplicity(row) {
  const attackName = String(row?.['Atk Name'] || '').trim();
  const matches = [...attackName.matchAll(/(?:^|[\s(])x(\d+)(?=[)\s]|$)/gi)];
  if (matches.length === 0) {
    return 1;
  }

  return Math.max(
    1,
    ...matches.map((match) => Number.parseInt(match[1], 10)).filter((value) => Number.isFinite(value) && value > 0)
  );
}

function toApInfo(weaponOrInfo) {
  if (!weaponOrInfo) {
    return {
      displayAp: null,
      significantAps: [],
      significantSecondaryAps: [],
      hasCaveat: false,
      meaningfulApContributions: [],
      totalMeaningfulDamage: 0
    };
  }

  if (
    Object.prototype.hasOwnProperty.call(weaponOrInfo, 'displayAp')
    && Object.prototype.hasOwnProperty.call(weaponOrInfo, 'significantAps')
  ) {
    return weaponOrInfo;
  }

  if (weaponOrInfo.apInfo) {
    return weaponOrInfo.apInfo;
  }

  return getWeaponDropdownApInfo(weaponOrInfo);
}

export function getWeaponOptionLabelText(weapon) {
  const type = weapon?.type || '';
  const sub = weapon?.sub || '';
  const code = weapon?.code || '';
  const name = weapon?.name || '';

  return `[${type}]${sub ? `[${sub}]` : ''}${code} ${name}`.trim();
}

export function getWeaponTypeSortIndex(type) {
  const index = WEAPON_TYPE_ORDER.indexOf(String(type || '').toLowerCase());
  return index === -1 ? WEAPON_TYPE_ORDER.length : index;
}

export function compareWeaponOptionBaseOrder(a, b) {
  const typeDiff = getWeaponTypeSortIndex(a?.type) - getWeaponTypeSortIndex(b?.type);
  if (typeDiff !== 0) {
    return typeDiff;
  }

  const codeDiff = compareText(a?.code, b?.code);
  if (codeDiff !== 0) {
    return codeDiff;
  }

  const nameDiff = compareText(a?.name, b?.name);
  if (nameDiff !== 0) {
    return nameDiff;
  }

  return (toFiniteNumber(a?.index) ?? Number.MAX_SAFE_INTEGER) - (toFiniteNumber(b?.index) ?? Number.MAX_SAFE_INTEGER);
}

export function normalizeWeaponSortMode(sortMode, {
  mode = 'single'
} = {}) {
  const normalizedMode = String(mode || 'single').trim().toLowerCase() === 'compare'
    ? 'compare'
    : 'single';
  return normalizeSortModeId(sortMode, {
    defaultMode: DEFAULT_WEAPON_SORT_MODE,
    lookup: WEAPON_SORT_MODE_LOOKUP,
    definitions: WEAPON_SORT_MODE_DEFINITIONS,
    isAvailable: (definition) => normalizedMode === 'compare' || !definition.compareOnly
  });
}

export function getWeaponSortModeOptions({
  mode = 'single'
} = {}) {
  const normalizedMode = String(mode || 'single').trim().toLowerCase() === 'compare'
    ? 'compare'
    : 'single';

  return getSortModeOptions(WEAPON_SORT_MODE_DEFINITIONS, {
    isAvailable: (definition) => normalizedMode === 'compare' || !definition.compareOnly
  });
}

export function getWeaponRowMeaningfulDamage(row) {
  const damage = toFiniteNumber(row?.DMG) ?? 0;
  const durableDamage = toFiniteNumber(row?.DUR) ?? 0;
  return Math.max(0, damage, durableDamage) * getWeaponRowPreviewHitCount(row);
}

export function getWeaponRowPreviewHitCount(row) {
  const multiplicity = getWeaponRowMultiplicity(row);
  if (multiplicity <= 1) {
    return 1;
  }

  const attackName = String(row?.['Atk Name'] || '').trim();
  for (const rule of WEAPON_DROPDOWN_MULTIPROJECTILE_PREVIEW_RULES) {
    if (!rule.pattern || rule.pattern.test(attackName)) {
      return Math.max(1, rule.estimateHitCount(multiplicity, row));
    }
  }

  return 1;
}

export function getWeaponDropdownApInfo(weapon) {
  const rows = Array.isArray(weapon?.rows) ? weapon.rows : [];
  const contributionByAp = new Map();

  rows.forEach((row) => {
    const apValue = parseApValue(row?.AP);
    const contribution = getWeaponRowMeaningfulDamage(row);
    if (apValue === null || contribution <= 0) {
      return;
    }

    contributionByAp.set(apValue, (contributionByAp.get(apValue) || 0) + contribution);
  });

  const meaningfulApContributions = Array.from(contributionByAp.entries())
    .map(([ap, contribution]) => ({ ap, contribution }))
    .sort((a, b) => a.ap - b.ap);

  const totalMeaningfulDamage = meaningfulApContributions.reduce((sum, entry) => sum + entry.contribution, 0);
  if (meaningfulApContributions.length === 0 || totalMeaningfulDamage <= 0) {
    return {
      displayAp: null,
      significantAps: [],
      significantSecondaryAps: [],
      hasCaveat: false,
      meaningfulApContributions,
      totalMeaningfulDamage
    };
  }

  const significantThreshold = totalMeaningfulDamage * DROPDOWN_AP_SIGNIFICANCE_SHARE;
  const significantAps = meaningfulApContributions
    .filter((entry) => entry.contribution >= significantThreshold)
    .map((entry) => entry.ap);

  const representativeAps = significantAps.length > 0
    ? significantAps
    : meaningfulApContributions.map((entry) => entry.ap);
  const displayAp = representativeAps.length > 0
    ? Math.max(...representativeAps)
    : null;
  const significantSecondaryAps = significantAps.filter((ap) => ap !== displayAp);

  return {
    displayAp,
    significantAps,
    significantSecondaryAps,
    hasCaveat: significantSecondaryAps.length > 0,
    meaningfulApContributions,
    totalMeaningfulDamage
  };
}

export function getWeaponDropdownApTitle(weaponOrInfo) {
  const apInfo = toApInfo(weaponOrInfo);
  if (apInfo.displayAp === null) {
    return 'No meaningful AP preview is available for this weapon.';
  }

  if (!apInfo.hasCaveat) {
    return `Representative AP ${apInfo.displayAp}.`;
  }

  return `Representative AP ${apInfo.displayAp}. Also has significant AP ${apInfo.significantSecondaryAps.join(', ')} profile(s).`;
}

export function getWeaponOptionDisplayModel(weapon) {
  const apInfo = toApInfo(weapon);
  return {
    labelText: getWeaponOptionLabelText(weapon),
    apText: apInfo.displayAp === null ? '' : String(apInfo.displayAp),
    apMarkerText: apInfo.hasCaveat ? '*' : '',
    apClassName: apInfo.displayAp === null ? 'ap-white' : apColorClass(apInfo.displayAp),
    apTitle: getWeaponDropdownApTitle(apInfo)
  };
}

export function compareWeaponOptionsByApDescending(a, b) {
  const apDiff = toSortableApValue(toApInfo(b).displayAp) - toSortableApValue(toApInfo(a).displayAp);
  if (apDiff !== 0) {
    return apDiff;
  }

  return compareWeaponOptionBaseOrder(a, b);
}

export function getWeaponOptionPriorityBucket(option, referenceWeapon) {
  const referenceInfo = toApInfo(referenceWeapon);
  const optionInfo = toApInfo(option);

  if (referenceInfo.displayAp === null || optionInfo.displayAp === null) {
    return 2;
  }

  if (referenceInfo.displayAp >= 5) {
    return optionInfo.displayAp >= 5 ? 0 : 2;
  }

  if (optionInfo.displayAp === referenceInfo.displayAp) {
    return 0;
  }

  if (optionInfo.significantSecondaryAps.includes(referenceInfo.displayAp)) {
    return 1;
  }

  return 2;
}

function getWeaponOptionReferenceSimilarityRank(option, referenceWeapon, priority = 'subtype') {
  const referenceSub = normalizeWeaponTaxonomyValue(referenceWeapon?.sub);
  const optionSub = normalizeWeaponTaxonomyValue(option?.sub);
  const hasMatchingSubtype = referenceSub && optionSub && optionSub === referenceSub;
  const referenceSubtypeFamily = getWeaponSubtypeSortFamilyId(referenceWeapon);
  const optionSubtypeFamily = getWeaponSubtypeSortFamilyId(option);
  const hasMatchingSubtypeFamily = !hasMatchingSubtype
    && referenceSubtypeFamily
    && optionSubtypeFamily
    && optionSubtypeFamily === referenceSubtypeFamily;
  const referenceType = normalizeWeaponTaxonomyValue(referenceWeapon?.type);
  const optionType = normalizeWeaponTaxonomyValue(option?.type);
  const hasMatchingType = referenceType && optionType && optionType === referenceType;

  if (priority === 'slot') {
    if (hasMatchingType && hasMatchingSubtype) {
      return 0;
    }
    if (hasMatchingType) {
      return 1;
    }
    if (hasMatchingSubtype) {
      return 2;
    }
    return 3;
  }

  if (hasMatchingType && hasMatchingSubtype) {
    return 0;
  }

  if (hasMatchingSubtype) {
    return 1;
  }
  if (hasMatchingSubtypeFamily && hasMatchingType) {
    return 2;
  }
  if (hasMatchingSubtypeFamily) {
    return 3;
  }
  if (hasMatchingType) {
    return 4;
  }

  return 5;
}

function getReferenceSortPriority(sortMode = 'match-reference-subtype') {
  return sortMode === 'match-reference-slot' ? 'slot' : 'subtype';
}

export function sortWeaponOptionsForReference(options = [], referenceWeapon = null, {
  sortMode = 'match-reference-subtype'
} = {}) {
  const referencePriority = getReferenceSortPriority(sortMode);
  return [...options].sort((a, b) => compareByComparators(a, b, [
    (left, right) => getWeaponOptionPriorityBucket(left, referenceWeapon)
      - getWeaponOptionPriorityBucket(right, referenceWeapon),
    (left, right) => getWeaponOptionReferenceSimilarityRank(left, referenceWeapon, referencePriority)
      - getWeaponOptionReferenceSimilarityRank(right, referenceWeapon, referencePriority),
    compareWeaponOptionBaseOrder
  ]));
}

export function sortWeaponOptions(options = [], {
  sortMode = DEFAULT_WEAPON_SORT_MODE,
  mode = 'single',
  referenceWeapon = null
} = {}) {
  const normalizedSortMode = normalizeWeaponSortMode(sortMode, { mode });
  switch (normalizedSortMode) {
    case 'ap-desc':
      return [...options].sort(compareWeaponOptionsByApDescending);
    case 'match-reference-subtype':
    case 'match-reference-slot':
      return referenceWeapon
        ? sortWeaponOptionsForReference(options, referenceWeapon, {
          sortMode: normalizedSortMode
        })
        : [...options].sort(compareWeaponOptionBaseOrder);
    case 'grouped':
    default:
      return [...options].sort(compareWeaponOptionBaseOrder);
  }
}
