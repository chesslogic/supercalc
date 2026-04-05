function normalizeText(value) {
  return String(value ?? '').trim().toLowerCase();
}

const FRONT_DEFINITIONS = [
  {
    id: 'terminids',
    label: 'Terminids',
    aliases: ['Terminid', 'Terminids']
  },
  {
    id: 'automatons',
    label: 'Automatons',
    aliases: ['Automaton', 'Automatons']
  },
  {
    id: 'illuminate',
    label: 'Illuminate',
    aliases: ['Illuminate']
  }
];

const FRONT_LOOKUP = new Map();
FRONT_DEFINITIONS.forEach((front) => {
  [front.id, front.label, ...(front.aliases || [])].forEach((alias) => {
    FRONT_LOOKUP.set(normalizeText(alias), front);
  });
});

const UNIT_TARGET_TYPE_IDS = ['chaff', 'medium', 'elite', 'tank'];
const ILLUMINATE_COMMON_SCOPE_ID = 'illuminate-common';
const ILLUMINATE_COMMON_UNIT_NAMES = [
  'Crescent Overseer',
  'Elevated Overseer',
  'Fleshmob',
  'Harvester',
  'Leviathan',
  'Overseer',
  'Stingray',
  'Voteless',
  'Warp Ship',
  'Watcher'
];
const ILLUMINATE_APPROPRIATORS_EXCLUSIVE_UNIT_NAMES = [
  'Gatekeeper',
  'Obtruder',
  'Veracitor'
];
const ILLUMINATE_ARMY_ROLE_DEFINITIONS = [
  {
    id: 'common',
    frontId: 'illuminate',
    text: 'C',
    label: 'Common Army',
    includeNames: ILLUMINATE_COMMON_UNIT_NAMES
  },
  {
    id: 'exclusive',
    frontId: 'illuminate',
    text: 'E',
    label: 'Appropriators Exclusive',
    includeNames: ILLUMINATE_APPROPRIATORS_EXCLUSIVE_UNIT_NAMES
  }
];

export const ENEMY_TARGET_TYPE_DEFINITIONS = [
  {
    id: 'chaff',
    label: 'Chaff',
    summaryLabel: 'Chaff',
    requiredTag: 'chaff',
    defaultSelected: true
  },
  {
    id: 'medium',
    label: 'Medium',
    summaryLabel: 'Medium',
    requiredTag: 'medium',
    defaultSelected: true
  },
  {
    id: 'elite',
    label: 'Elite',
    summaryLabel: 'Elite',
    requiredTag: 'elite',
    defaultSelected: true
  },
  {
    id: 'tank',
    label: 'Tank',
    summaryLabel: 'Tank',
    requiredTag: 'tank',
    defaultSelected: true
  },
  {
    id: 'giant',
    label: 'Giants',
    summaryLabel: 'Giants',
    requiredTag: 'giant',
    defaultSelected: true
  },
  {
    id: 'structure',
    label: 'Structures',
    summaryLabel: 'Structures',
    requiredTag: 'structure',
    defaultSelected: false
  },
  {
    id: 'objective',
    label: 'Objectives',
    summaryLabel: 'Objectives',
    requiredTag: 'objective',
    defaultSelected: false
  }
];

const ENEMY_TARGET_TYPE_LOOKUP = new Map();
ENEMY_TARGET_TYPE_DEFINITIONS.forEach((definition) => {
  ENEMY_TARGET_TYPE_LOOKUP.set(normalizeText(definition.id), definition.id);
  ENEMY_TARGET_TYPE_LOOKUP.set(normalizeText(definition.label), definition.id);
  ENEMY_TARGET_TYPE_LOOKUP.set(normalizeText(definition.summaryLabel), definition.id);
});

const ENEMY_TARGET_TYPE_ALIAS_LOOKUP = new Map([
  [normalizeText('unit'), UNIT_TARGET_TYPE_IDS],
  [normalizeText('units'), UNIT_TARGET_TYPE_IDS]
]);

function expandEnemyTargetTypeIds(targetTypeId) {
  const normalizedTargetTypeId = normalizeText(targetTypeId);
  if (!normalizedTargetTypeId) {
    return [];
  }

  const aliasedTargetTypeIds = ENEMY_TARGET_TYPE_ALIAS_LOOKUP.get(normalizedTargetTypeId);
  if (aliasedTargetTypeIds) {
    return [...aliasedTargetTypeIds];
  }

  const normalizedId = ENEMY_TARGET_TYPE_LOOKUP.get(normalizedTargetTypeId);
  return normalizedId ? [normalizedId] : [];
}

export const DEFAULT_ENEMY_TARGET_TYPE_IDS = ENEMY_TARGET_TYPE_DEFINITIONS
  .filter((definition) => definition.defaultSelected)
  .map((definition) => definition.id);

const ENEMY_SCOPE_DEFINITIONS = [
  {
    id: 'all',
    label: 'All enemies',
    summaryLabel: 'All',
    kind: 'all'
  },
  {
    id: 'terminids',
    frontId: 'terminids',
    label: 'All Terminids',
    summaryLabel: 'Terminids'
  },
  {
    id: 'rupture-strain',
    frontId: 'terminids',
    label: 'Rupture Strain',
    summaryLabel: 'Rupture Strain',
    includeNames: ['Rupture Charger', 'Rupture Spewer', 'Rupture Warrior']
  },
  {
    id: 'spore-burst-strain',
    frontId: 'terminids',
    label: 'Spore Burst Strain',
    summaryLabel: 'Spore Burst Strain',
    includeNames: ['Spore Burst Hunter', 'Spore Burst Scavenger', 'Spore Burst Warrior']
  },
  {
    id: 'predator-strain',
    frontId: 'terminids',
    label: 'Predator Strain',
    summaryLabel: 'Predator Strain',
    includeNames: ['Predator Hunter', 'Predator Stalker']
  },
  {
    id: 'automatons',
    frontId: 'automatons',
    label: 'All Automatons',
    summaryLabel: 'Automatons'
  },
  {
    id: 'cyborg-legion',
    frontId: 'automatons',
    label: 'Cyborg Legion',
    summaryLabel: 'Cyborg Legion',
    includeNames: ['Agitator', 'Radical', 'Vox Engine']
  },
  {
    id: 'jet-brigade',
    frontId: 'automatons',
    label: 'Jet Brigade',
    summaryLabel: 'Jet Brigade',
    includePatterns: ['^Jet Brigade ']
  },
  {
    id: 'incineration-corps',
    frontId: 'automatons',
    label: 'Incineration Corps',
    summaryLabel: 'Incineration Corps',
    includeNames: [
      'Conflagration Devastator',
      'Hulk Firebomber',
      'Incendiary MG Devastator',
      'Incendiary Rocket Raider',
      'Pyro Trooper'
    ]
  },
  {
    id: 'illuminate',
    frontId: 'illuminate',
    label: 'All Illuminate',
    summaryLabel: 'Illuminate'
  },
  {
    id: ILLUMINATE_COMMON_SCOPE_ID,
    frontId: 'illuminate',
    label: 'Illuminate Common',
    summaryLabel: 'Illuminate Common',
    includeNames: ILLUMINATE_COMMON_UNIT_NAMES,
    showSubgroupBadge: false
  },
  {
    id: 'mindless-masses',
    frontId: 'illuminate',
    label: 'Mindless Masses',
    summaryLabel: 'Mindless Masses',
    excludeNames: [
      'Crescent Overseer',
      'Elevated Overseer',
      'Gatekeeper',
      'Obtruder',
      'Stingray',
      'Veracitor'
    ]
  },
  {
    id: 'appropriators',
    frontId: 'illuminate',
    label: 'Appropriators',
    summaryLabel: 'Appropriators',
    excludeNames: ['Crescent Overseer', 'Fleshmob', 'Stingray', 'Voteless']
  }
];

const SCOPE_LOOKUP = new Map();

function addScopeAlias(alias, id) {
  SCOPE_LOOKUP.set(normalizeText(alias), id);
}

ENEMY_SCOPE_DEFINITIONS.forEach((definition) => {
  addScopeAlias(definition.id, definition.id);
  addScopeAlias(definition.label, definition.id);
  addScopeAlias(definition.summaryLabel, definition.id);
});

[
  ['All', 'all'],
  ['Automaton', 'automatons'],
  ['Automatons', 'automatons'],
  ['Terminid', 'terminids'],
  ['Terminids', 'terminids'],
  ['Illuminate', 'illuminate'],
  ['Cyborgs', 'cyborg-legion'],
  ['Cyborg Legion', 'cyborg-legion'],
  ['Jet Brigade', 'jet-brigade'],
  ['Incineration Corps', 'incineration-corps'],
  ['Rupture', 'rupture-strain'],
  ['Rupture Strain', 'rupture-strain'],
  ['Spore Burst', 'spore-burst-strain'],
  ['Spore Burst Strain', 'spore-burst-strain'],
  ['Predator', 'predator-strain'],
  ['Predator Strain', 'predator-strain'],
  ['Mindless Masses', 'mindless-masses'],
  ['Appropriators', 'appropriators']
].forEach(([alias, id]) => addScopeAlias(alias, id));

function matchesNameList(name, names = []) {
  if (!Array.isArray(names) || names.length === 0) {
    return false;
  }

  const normalizedName = normalizeText(name);
  return names.some((candidate) => normalizeText(candidate) === normalizedName);
}

function matchesPatternList(name, patterns = []) {
  if (!Array.isArray(patterns) || patterns.length === 0) {
    return false;
  }

  return patterns.some((pattern) => new RegExp(pattern, 'i').test(String(name ?? '')));
}

export function normalizeEnemyScopeId(scope = 'all') {
  const normalizedScope = normalizeText(scope);
  return SCOPE_LOOKUP.get(normalizedScope) || 'all';
}

export function getEnemyFrontDefinition(front) {
  return FRONT_LOOKUP.get(normalizeText(front)) || null;
}

export function getEnemyUnitFront(unit) {
  return getEnemyFrontDefinition(unit?.frontId)
    || getEnemyFrontDefinition(unit?.frontLabel)
    || getEnemyFrontDefinition(unit?.faction)
    || getEnemyFrontDefinition(unit?.sourceFaction);
}

export function getEnemyUnitFrontLabel(unit) {
  return getEnemyUnitFront(unit)?.label || String(unit?.faction ?? '').trim();
}

export function getEnemyUnitScopeTags(unit) {
  const rawTags = Array.isArray(unit?.scopeTags)
    ? unit.scopeTags
    : (Array.isArray(unit?.scope_tags) ? unit.scope_tags : []);

  return rawTags
    .map((tag) => normalizeText(tag))
    .filter(Boolean);
}

export function getEnemyScopeDefinition(scope = 'all') {
  const scopeId = normalizeEnemyScopeId(scope);
  return ENEMY_SCOPE_DEFINITIONS.find((definition) => definition.id === scopeId)
    || ENEMY_SCOPE_DEFINITIONS[0];
}

export function isAllEnemyScope(scope = 'all') {
  return getEnemyScopeDefinition(scope).id === 'all';
}

export function getEnemyScopeSummaryLabel(scope = 'all') {
  return getEnemyScopeDefinition(scope).summaryLabel;
}

export function getEnemySubscopeDefinitionsForUnit(unit) {
  const front = getEnemyUnitFront(unit);
  if (!front) {
    return [];
  }

  return ENEMY_SCOPE_DEFINITIONS.filter((definition) => (
    definition.frontId === front.id
    && definition.id !== front.id
    && definition.kind !== 'all'
    && definition.showSubgroupBadge !== false
    && matchesEnemyScope(unit, definition)
  ));
}

export function getEnemyArmyRoleDefinitionForUnit(unit) {
  const front = getEnemyUnitFront(unit);
  if (!front || front.id !== 'illuminate') {
    return null;
  }

  const unitName = unit?.name ?? '';
  return ILLUMINATE_ARMY_ROLE_DEFINITIONS.find((definition) => (
    matchesNameList(unitName, definition.includeNames)
  )) || null;
}

export function getEnemyPrimaryTargetTypeDefinition(unit) {
  const scopeTags = getEnemyUnitScopeTags(unit);
  return ENEMY_TARGET_TYPE_DEFINITIONS.find((definition) => (
    scopeTags.includes(definition.requiredTag)
  )) || null;
}

export function matchesEnemyScope(unit, scope = 'all') {
  const definition = typeof scope === 'string' ? getEnemyScopeDefinition(scope) : scope;
  if (!definition || definition.kind === 'all') {
    return true;
  }

  const front = getEnemyUnitFront(unit);
  if (!front || front.id !== definition.frontId) {
    return false;
  }

  const unitName = unit?.name ?? '';
  if (definition.includeNames || definition.includePatterns) {
    return matchesNameList(unitName, definition.includeNames)
      || matchesPatternList(unitName, definition.includePatterns);
  }

  return !matchesNameList(unitName, definition.excludeNames)
    && !matchesPatternList(unitName, definition.excludePatterns);
}

export function filterEnemiesByScope(units = [], scope = 'all') {
  return (Array.isArray(units) ? units : []).filter((unit) => matchesEnemyScope(unit, scope));
}

export function normalizeEnemyTargetTypeId(targetTypeId = 'unit') {
  return expandEnemyTargetTypeIds(targetTypeId)[0] || null;
}

export function normalizeEnemyTargetTypeIds(targetTypeIds = DEFAULT_ENEMY_TARGET_TYPE_IDS) {
  if (!Array.isArray(targetTypeIds)) {
    return [...DEFAULT_ENEMY_TARGET_TYPE_IDS];
  }

  const seen = new Set();
  const normalizedIds = [];
  targetTypeIds.forEach((targetTypeId) => {
    expandEnemyTargetTypeIds(targetTypeId).forEach((normalizedId) => {
      if (!normalizedId || seen.has(normalizedId)) {
        return;
      }

      seen.add(normalizedId);
      normalizedIds.push(normalizedId);
    });
  });

  return normalizedIds;
}

export function getEnemyTargetTypeDefinition(targetTypeId = UNIT_TARGET_TYPE_IDS[0]) {
  const normalizedIds = expandEnemyTargetTypeIds(targetTypeId);
  if (normalizedIds.length !== 1) {
    return null;
  }

  return ENEMY_TARGET_TYPE_DEFINITIONS.find((definition) => definition.id === normalizedIds[0]) || null;
}

export function matchesEnemyTargetType(unit, targetTypeId = 'unit') {
  if (typeof targetTypeId === 'string') {
    const normalizedIds = normalizeEnemyTargetTypeIds([targetTypeId]);
    if (normalizedIds.length > 1) {
      return normalizedIds.some((normalizedId) => matchesEnemyTargetType(unit, normalizedId));
    }
  }

  const definition = typeof targetTypeId === 'string'
    ? getEnemyTargetTypeDefinition(targetTypeId)
    : targetTypeId;
  if (!definition) {
    return false;
  }

  const scopeTags = getEnemyUnitScopeTags(unit);
  return scopeTags.includes(definition.requiredTag);
}

export function filterEnemiesByTargetTypes(units = [], targetTypeIds = DEFAULT_ENEMY_TARGET_TYPE_IDS) {
  const normalizedTargetTypeIds = normalizeEnemyTargetTypeIds(targetTypeIds);
  if (normalizedTargetTypeIds.length === 0) {
    return [];
  }

  const activeDefinitions = normalizedTargetTypeIds
    .map((targetTypeId) => getEnemyTargetTypeDefinition(targetTypeId))
    .filter(Boolean);

  return (Array.isArray(units) ? units : []).filter((unit) =>
    activeDefinitions.some((definition) => matchesEnemyTargetType(unit, definition))
  );
}

export function getEnemyTargetTypeOptions(units = []) {
  const availableUnits = Array.isArray(units) ? units : [];
  const filterByAvailability = availableUnits.length > 0;

  return ENEMY_TARGET_TYPE_DEFINITIONS.filter((definition) => (
    !filterByAvailability
    || filterEnemiesByTargetTypes(availableUnits, [definition.id]).length > 0
  ));
}

export function getOverviewScopeOptions(units = []) {
  const availableUnits = Array.isArray(units) ? units : [];
  const filterByAvailability = availableUnits.length > 0;

  return ENEMY_SCOPE_DEFINITIONS.filter((definition) => (
    !filterByAvailability
    || definition.kind === 'all'
    || filterEnemiesByScope(availableUnits, definition.id).length > 0
  ));
}

export function getOverviewScopeOptionGroups(units = []) {
  const availableOptions = getOverviewScopeOptions(units);
  const optionLookup = new Set(availableOptions.map((definition) => definition.id));

  const groups = [{
    label: null,
    options: availableOptions.filter((definition) => definition.id === 'all')
  }];

  FRONT_DEFINITIONS.forEach((front) => {
    const options = ENEMY_SCOPE_DEFINITIONS.filter((definition) => (
      definition.frontId === front.id && optionLookup.has(definition.id)
    ));

    if (options.length > 0) {
      groups.push({
        label: front.label,
        options
      });
    }
  });

  return groups;
}
