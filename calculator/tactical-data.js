import { getEnemyUnitFrontLabel, getEnemyUnitScopeTags } from './enemy-scope.js';

function normalizeText(value) {
  return String(value ?? '').trim().toLowerCase();
}

const CRITICAL_ZONE_RULES = [
  {
    enemyName: 'Heavy Devastator',
    zoneName: 'right_arm',
    label: 'Gun arm',
    tip: 'Removing the right arm shuts down the Heavy Devastator ranged attack.'
  }
];

const FACTION_INFO_CHIPS = {
  automatons: [
    {
      label: 'Faction',
      value: 'Automatons',
      description: 'Disable-heavy play matters more here because guns, arms, and turrets can be worth removing before the body kill.'
    }
  ],
  terminids: [
    {
      label: 'Faction',
      value: 'Terminids',
      description: 'Body and head breakpoints usually matter more than precision part disables, so clean lethal checks are the first thing to verify.'
    }
  ],
  illuminate: [
    {
      label: 'Faction',
      value: 'Illuminate',
      description: 'Armor strips and head checks matter more than raw body damage on many targets, especially when range starts to matter.'
    }
  ]
};

const TARGET_TYPE_INFO_CHIPS = {
  unit: [
    {
      label: 'Class',
      value: 'Unit',
      description: 'Prioritize the fastest lethal or critical disable breakpoint rather than pure sustained damage.'
    }
  ],
  giant: [
    {
      label: 'Class',
      value: 'Giant',
      description: 'Weakspots and component removals can be as important as body TTK, especially when front armor blocks broad weapon pools.'
    }
  ],
  structure: [
    {
      label: 'Class',
      value: 'Structure',
      description: 'Look for universal armor coverage and main-health transfer instead of limb-style disable logic.'
    }
  ],
  objective: [
    {
      label: 'Class',
      value: 'Objective',
      description: 'Use the shortest direct objective breakpoints first; many utility disables do not matter here.'
    }
  ]
};

const ENEMY_INFO_CHIPS = {
  'Heavy Devastator': [
    {
      label: 'Critical',
      value: 'Right arm',
      description: 'Right-arm removal shuts down the ranged threat and should surface as a Critical chip when that part can be stripped first.'
    }
  ],
  'Factory Strider': [
    {
      label: 'Dispatch',
      value: 'Belly / front body',
      description: 'The main dispatch path is usually through belly-style body damage after you create an opening.'
    },
    {
      label: 'Turrets',
      value: 'Separate target',
      description: 'Use the separate Factory Strider Gatling Gun enemy entry to evaluate chin-gatling removals; those turrets are not zones on the main Factory Strider table.'
    }
  ],
  'Alpha Commander': [
    {
      label: 'Priority',
      value: 'Face',
      description: 'Face breakpoints are the cleanest high-value opener and should be easy to spot in the recommendation list.'
    }
  ],
  'Overseer': [
    {
      label: 'Priority',
      value: 'Head',
      description: 'Head breakpoints are the first thing to check before settling for slower torso or armor chip damage.'
    }
  ],
  'Elevated Overseer': [
    {
      label: 'Priority',
      value: 'Head',
      description: 'Head breakpoints stay important here too, while the jetpack changes how safely you can take the fight.'
    }
  ],
  'Fleshmob': [
    {
      label: 'Main',
      value: 'Face / head transfer',
      description: 'Front-face and head paths transfer heavily to Main, so sustained main-routing damage matters more than ordinary part breaks.'
    }
  ],
  'Factory Strider Gatling Gun': [
    {
      label: 'Component',
      value: 'Standalone target',
      description: 'This entry exists to model chin-gatling removals directly, separate from the main Factory Strider body table.'
    }
  ]
};

function getEnemyTargetTypeId(enemy) {
  const scopeTags = getEnemyUnitScopeTags(enemy);
  if (scopeTags.includes('giant')) {
    return 'giant';
  }

  if (scopeTags.includes('structure')) {
    return 'structure';
  }

  if (scopeTags.includes('objective')) {
    return 'objective';
  }

  return 'unit';
}

function dedupeChips(chips = []) {
  const seen = new Set();
  return chips.filter((chip) => {
    const key = [
      normalizeText(chip?.label),
      normalizeText(chip?.value),
      normalizeText(chip?.description)
    ].join('::');
    if (!key || seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

export function getCriticalZoneInfo(enemy, zone) {
  const enemyName = normalizeText(enemy?.name || enemy);
  const zoneName = normalizeText(zone?.zone_name || zone);
  if (!enemyName || !zoneName) {
    return null;
  }

  return CRITICAL_ZONE_RULES.find((rule) => (
    normalizeText(rule.enemyName) === enemyName
    && normalizeText(rule.zoneName) === zoneName
  )) || null;
}

export function getEnemyTacticalInfoChips(enemy) {
  if (!enemy) {
    return [];
  }

  const factionLabel = getEnemyUnitFrontLabel(enemy);
  const factionKey = normalizeText(factionLabel);
  const targetTypeId = getEnemyTargetTypeId(enemy);

  return dedupeChips([
    ...(FACTION_INFO_CHIPS[factionKey] || []),
    ...(TARGET_TYPE_INFO_CHIPS[targetTypeId] || []),
    ...(ENEMY_INFO_CHIPS[String(enemy?.name || '').trim()] || [])
  ]);
}
