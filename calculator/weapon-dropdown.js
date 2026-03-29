import { apColorClass } from '../colors.js';

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
    id: 'match-reference',
    label: 'Match other weapon AP',
    compareOnly: true
  }
];
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

function compareText(a, b) {
  return String(a || '').localeCompare(String(b || ''));
}

function toSortableApValue(value) {
  return value === null ? Number.NEGATIVE_INFINITY : value;
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
  const normalizedSortMode = String(sortMode || DEFAULT_WEAPON_SORT_MODE).trim().toLowerCase();
  const availableModes = getWeaponSortModeOptions({ mode: normalizedMode });

  return availableModes.find((entry) => entry.id === normalizedSortMode)?.id || DEFAULT_WEAPON_SORT_MODE;
}

export function getWeaponSortModeOptions({
  mode = 'single'
} = {}) {
  const normalizedMode = String(mode || 'single').trim().toLowerCase() === 'compare'
    ? 'compare'
    : 'single';

  return WEAPON_SORT_MODE_DEFINITIONS.filter((definition) => (
    normalizedMode === 'compare' || !definition.compareOnly
  ));
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

export function sortWeaponOptionsForReference(options = [], referenceWeapon = null) {
  return [...options].sort((a, b) => {
    const bucketDiff = getWeaponOptionPriorityBucket(a, referenceWeapon)
      - getWeaponOptionPriorityBucket(b, referenceWeapon);
    if (bucketDiff !== 0) {
      return bucketDiff;
    }

    return compareWeaponOptionBaseOrder(a, b);
  });
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
    case 'match-reference':
      return referenceWeapon
        ? sortWeaponOptionsForReference(options, referenceWeapon)
        : [...options].sort(compareWeaponOptionBaseOrder);
    case 'grouped':
    default:
      return [...options].sort(compareWeaponOptionBaseOrder);
  }
}
