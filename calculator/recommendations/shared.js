export const DEFAULT_RECOMMENDATION_RANGE_METERS = 30;
export const RECOMMENDATION_MARGIN_RATIO_THRESHOLD = 0.25;
export const RECOMMENDATION_SHOTGUN_HIT_SHARE = 0.4;
export const RECOMMENDATION_MAX_SHOTGUN_HITS = 6;
export const RECOMMENDATION_FRAGMENT_HIT_CAP = 3;
export const RECOMMENDATION_IMPLICIT_REPEAT_HITS = 2;
export const RECOMMENDATION_NEAR_MISS_MAX_SHOTS = 3;
export const RECOMMENDATION_PERIPHERAL_MAIN_TOMAIN_THRESHOLD = 0.5;

export const RANGE_STATUS_ORDER = {
  qualified: 0,
  unknown: 1,
  failed: 2
};

const OUTCOME_PRIORITY = {
  fatal: 0,
  doomed: 1,
  main: 2,
  critical: 3,
  limb: 4,
  utility: 5,
  none: 6
};

export function toFiniteNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

export function normalizeText(value) {
  return String(value ?? '').trim().toLowerCase();
}

export function compareBooleanDescending(left, right) {
  return Number(Boolean(right)) - Number(Boolean(left));
}

export function compareNullableNumber(left, right, direction = 'asc') {
  const leftMissing = left === null || left === undefined;
  const rightMissing = right === null || right === undefined;
  if (leftMissing && rightMissing) {
    return 0;
  }

  if (leftMissing) {
    return 1;
  }

  if (rightMissing) {
    return -1;
  }

  if (left === right) {
    return 0;
  }

  return direction === 'desc'
    ? (right - left)
    : (left - right);
}

export function compareRecommendationMargins(left, right) {
  let comparison = compareBooleanDescending(left?.qualifiesForMargin, right?.qualifiesForMargin);
  if (comparison !== 0) {
    return comparison;
  }

  comparison = compareNullableNumber(left?.marginRatio, right?.marginRatio, 'asc');
  if (comparison !== 0) {
    return comparison;
  }

  return compareNullableNumber(left?.displayMarginRatio, right?.displayMarginRatio, 'desc');
}

// Within the same shotsToKill bucket, use the existing one-shot Margin semantics first,
// then fall back to generalized per-shot headroom for multi-shot rows.
export function compareRecommendationHeadroom(left, right) {
  const leftShots = left?.shotsToKill ?? null;
  const rightShots = right?.shotsToKill ?? null;
  if (leftShots !== rightShots) {
    return 0;
  }

  return compareRecommendationMargins(left, right);
}

export function getOutcomePriority(outcomeKind) {
  return OUTCOME_PRIORITY[outcomeKind] ?? OUTCOME_PRIORITY.none;
}

export function getRangeMeters(distanceInfo) {
  return distanceInfo?.isAvailable ? toFiniteNumber(distanceInfo.meters) : null;
}

export function cloneDistanceInfo(distanceInfo) {
  return distanceInfo ? { ...distanceInfo } : null;
}

export function normalizeRecommendationRangeMeters(value) {
  const numeric = toFiniteNumber(value);
  if (numeric === null) {
    return DEFAULT_RECOMMENDATION_RANGE_METERS;
  }

  return Math.max(0, Math.min(500, Math.round(numeric)));
}

export function getRecommendationRangeStatus(distanceInfo, rangeFloorMeters = DEFAULT_RECOMMENDATION_RANGE_METERS) {
  const normalizedRangeFloor = normalizeRecommendationRangeMeters(rangeFloorMeters);
  if (normalizedRangeFloor <= 0) {
    return 'qualified';
  }

  if (!distanceInfo?.isAvailable) {
    return 'unknown';
  }

  return distanceInfo.meters >= normalizedRangeFloor
    ? 'qualified'
    : 'failed';
}
