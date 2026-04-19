import { buildRecommendationRowSets } from './calculation/recommendation-row-sets.js';
import {
  createRecommendationWorkDistribution,
  formatRecommendationWorkDistribution,
  summarizeRecommendationWorkDistribution
} from './recommendation-work-distribution.js';

export function analyzeRecommendationRowSetWorkDistribution(options = {}) {
  const workDistribution = createRecommendationWorkDistribution();
  const rowSets = buildRecommendationRowSets({
    ...options,
    instrumentation: workDistribution
  });

  return {
    rowSets,
    workDistribution,
    summary: summarizeRecommendationWorkDistribution(workDistribution),
    formattedSummary: formatRecommendationWorkDistribution(workDistribution)
  };
}

export {
  createRecommendationWorkDistribution,
  formatRecommendationWorkDistribution,
  summarizeRecommendationWorkDistribution
} from './recommendation-work-distribution.js';
