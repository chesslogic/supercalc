export {
  DEFAULT_RECOMMENDATION_RANGE_METERS,
  RECOMMENDATION_FRAGMENT_HIT_CAP,
  RECOMMENDATION_IMPLICIT_REPEAT_HITS,
  RECOMMENDATION_MARGIN_RATIO_THRESHOLD,
  RECOMMENDATION_MAX_SHOTGUN_HITS,
  RECOMMENDATION_NEAR_MISS_MAX_SHOTS,
  RECOMMENDATION_SHOTGUN_HIT_SHARE,
  getRecommendationRangeStatus,
  normalizeRecommendationRangeMeters
} from './recommendations/shared.js';
export { getRecommendationAttackHitCount } from './recommendations/packages.js';
export {
  buildRelatedTargetRecommendationRows,
  buildSelectedTargetRecommendationRows,
  buildWeaponRecommendationRows
} from './recommendations/engine.js';
