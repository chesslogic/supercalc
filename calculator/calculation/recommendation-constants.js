import { EFFECTIVE_DISTANCE_TOOLTIP } from '../effective-distance.js';
import { RECOMMENDATION_MARGIN_RATIO_THRESHOLD } from '../recommendations.js';
import { FAST_TTK_THRESHOLD_SECONDS } from '../combat-constants.js';
export { RECOMMENDATION_WEAPON_FEATURE_GROUPS as RECOMMENDATION_FEATURE_GROUPS } from '../../weapons/weapon-taxonomy.js';

export const RECOMMENDATION_MARGIN_THRESHOLD_PERCENT = Math.round(RECOMMENDATION_MARGIN_RATIO_THRESHOLD * 100);
export const RECOMMENDATION_DISPLAY_LIMIT = 24;
export const NEAR_MISS_RECOMMENDATION_DISPLAY_LIMIT = 12;
export const TARGETED_RECOMMENDATION_DISPLAY_LIMIT = 12;
export const RELATED_ROUTE_RECOMMENDATION_DISPLAY_LIMIT = 12;
export const RECOMMENDATION_CORE_TYPE_MINIMUM = 2;
export const RECOMMENDATION_CORE_TYPE_ORDER = ['primary', 'secondary', 'grenade', 'support'];
export const RECOMMENDATION_FILTER_TYPE_ORDER = ['primary', 'secondary', 'grenade', 'support', 'stratagem'];
export const RECOMMENDATION_HIGHLIGHT_SUMMARY_TITLE = `Highlighted rows are recommendations that light up Margin, Crit, <${FAST_TTK_THRESHOLD_SECONDS}s, or Pen All.`;
export const RECOMMENDATION_HEADER_DEFINITIONS = [
  { label: 'Weapon', title: 'Weapon entry for this recommendation row.' },
  { label: 'Attack', title: 'Best-ranked attack row or firing package for this weapon, plus a damage-type tag.' },
  { label: 'Target', title: 'Best-ranked target zone for the listed attack setup, plus the outcome badge.' },
  { label: 'Shots', title: 'Shots or firing cycles needed to reach the listed outcome using the recommendation preview hit-count.' },
  { label: 'TTK', title: 'Modeled time to reach the listed outcome at the weapon\'s RPM.' },
  {
    label: 'Range',
    title: `${EFFECTIVE_DISTANCE_TOOLTIP}\nUnknown-range rows stay listed, but range-sensitive highlights only count when the breakpoint qualifies.`
  },
  { label: 'Margin', title: `One-shot margin is highlighted at +${RECOMMENDATION_MARGIN_THRESHOLD_PERCENT}% or less extra damage. Multi-shot rows show extra per-shot headroom for the listed shot count without changing the one-shot highlight. Beam rows leave Margin hidden because continuous-contact tick headroom is misleading.` },
  { label: 'Crit', title: 'Critical-disable highlight at the current range floor, covering one- and two-shot critical breakpoints.' },
  { label: `<${FAST_TTK_THRESHOLD_SECONDS}s`, title: `Fast-TTK highlight for rows under ${FAST_TTK_THRESHOLD_SECONDS} seconds at the current range floor.` },
  { label: 'Pen All', title: 'Highlights attack setups that can damage every zone on the current enemy.' },
  { label: 'Tip', title: 'Short note explaining why this breakpoint stands out or what path it follows.' }
];
export const RECOMMENDATION_FLAG_TITLES = {
  criticalRecommendation: {
    active: 'Meets the critical-disable highlight at the current range floor (one or two shots).',
    inactive: 'Does not currently meet the critical-disable highlight.'
  },
  fastTtk: {
    active: `Meets the sub-${FAST_TTK_THRESHOLD_SECONDS}s TTK highlight at the current range floor.`,
    inactive: `Does not currently meet the sub-${FAST_TTK_THRESHOLD_SECONDS}s TTK highlight.`
  },
  penetratesAll: {
    active: 'This attack setup can damage every zone on the current enemy.',
    inactive: 'At least one zone on the current enemy takes no damage from this attack setup.'
  }
};
