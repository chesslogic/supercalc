export const OUTCOME_PRIORITY = {
  fatal: 0,
  doomed: 1,
  main: 2,
  critical: 3,
  limb: 4,
  utility: 5,
  none: 6
};

export const SINGLE_OUTCOME_GROUP_ORDER = {
  fatal: 0,
  doomed: 1,
  main: 2,
  critical: 3,
  limb: 4,
  utility: 5,
  none: 6
};

export const COMPARE_OUTCOME_GROUP_ORDER = {
  main: 0,
  oneSided: 1,
  fatal: 2,
  doomed: 3,
  critical: 4,
  limb: 5,
  utility: 6,
  none: 7
};

export const ONE_SIDED_OUTCOME_GROUP_ORDER = {
  main: 0,
  fatal: 1,
  doomed: 2,
  critical: 3,
  limb: 4,
  utility: 5,
  none: 6
};

export function getOutcomePriority(outcomeKind) {
  return OUTCOME_PRIORITY[outcomeKind] ?? OUTCOME_PRIORITY.none;
}

export function getZoneOutcomeLabel(kind) {
  if (kind === 'fatal') {
    return 'Kill';
  }

  if (kind === 'doomed') {
    return 'Doomed';
  }

  if (kind === 'main') {
    return 'Main';
  }

  if (kind === 'critical') {
    return 'Critical';
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

  if (kind === 'doomed') {
    return 'Destroying this fatal part dooms the enemy by forcing Main Constitution and bleedout.';
  }

  if (kind === 'main') {
    return 'This path kills through main health';
  }

  if (kind === 'critical') {
    return 'Destroying this critical part removes an important threat or utility before the body kill.';
  }

  if (kind === 'limb') {
    return 'This part can be removed before main would die';
  }

  if (kind === 'utility') {
    return 'This part can be removed, but destroying it does not kill the enemy';
  }

  return null;
}
