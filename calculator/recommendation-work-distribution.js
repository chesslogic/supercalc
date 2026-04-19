const DEFAULT_STAGE_ORDER = ['overall', 'selectedTarget', 'relatedTarget'];
const DEFAULT_METHOD_ORDER = [
  'buildWeaponRecommendationRows',
  'buildTargetRecommendationRows',
  'buildRecommendationAttackPackages',
  'buildAttackRecommendation',
  'buildRecommendationCandidates',
  'collapseEquivalentTargetAttackRecommendations',
  'applyStratagemPrecisionFilter'
];
const DEFAULT_METRIC_ORDER = [
  'inputWeapons',
  'requestedTargetZones',
  'inputAttackRows',
  'outputAttackPackages',
  'combinedAttackPackages',
  'attackRecommendationsBuilt',
  'attackRecommendationsReturned',
  'zoneComparisonCalls',
  'zoneRowsProduced',
  'directCandidatesProduced',
  'sequenceCandidatesProduced',
  'filteredCandidatesRemoved',
  'collapseInputs',
  'collapseOutputs',
  'precisionFilterInputs',
  'precisionFilterOutputs',
  'resultRowsReturned'
];

function createWorkBucket() {
  return {
    totals: {},
    methods: {}
  };
}

function ensureRoot(workDistribution) {
  if (!workDistribution || typeof workDistribution !== 'object') {
    return null;
  }

  if (!workDistribution.totals || typeof workDistribution.totals !== 'object') {
    workDistribution.totals = {};
  }
  if (!workDistribution.methods || typeof workDistribution.methods !== 'object') {
    workDistribution.methods = {};
  }
  if (!workDistribution.stages || typeof workDistribution.stages !== 'object') {
    workDistribution.stages = {};
  }

  return workDistribution;
}

function ensureMethodContainer(methods, methodName) {
  if (!methods[methodName] || typeof methods[methodName] !== 'object') {
    methods[methodName] = { calls: 0 };
  } else if (!Number.isFinite(methods[methodName].calls)) {
    methods[methodName].calls = 0;
  }

  return methods[methodName];
}

function ensureStageContainer(root, stageName) {
  if (!root.stages[stageName] || typeof root.stages[stageName] !== 'object') {
    root.stages[stageName] = createWorkBucket();
  } else {
    if (!root.stages[stageName].totals || typeof root.stages[stageName].totals !== 'object') {
      root.stages[stageName].totals = {};
    }
    if (!root.stages[stageName].methods || typeof root.stages[stageName].methods !== 'object') {
      root.stages[stageName].methods = {};
    }
  }

  return root.stages[stageName];
}

function incrementMetrics(target, metrics = {}) {
  Object.entries(metrics).forEach(([key, value]) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return;
    }

    if (!Object.prototype.hasOwnProperty.call(target, key)) {
      target[key] = 0;
    }
    target[key] += numeric;
  });
}

function getOrderedKeys(map = {}, preferredKeys = []) {
  const keys = Object.keys(map);
  const orderedKeys = preferredKeys.filter((key) => keys.includes(key));
  const extraKeys = keys
    .filter((key) => !preferredKeys.includes(key))
    .sort();
  return [...orderedKeys, ...extraKeys];
}

function cloneMetrics(metrics = {}) {
  const cloned = {};
  getOrderedKeys(metrics, DEFAULT_METRIC_ORDER).forEach((key) => {
    cloned[key] = metrics[key];
  });
  return cloned;
}

function cloneMethodSummary(methods = {}) {
  const summary = {};
  getOrderedKeys(methods, DEFAULT_METHOD_ORDER).forEach((methodName) => {
    const methodRecord = methods[methodName] || {};
    const { calls = 0, ...metricRecord } = methodRecord;
    summary[methodName] = {
      calls,
      ...cloneMetrics(metricRecord)
    };
  });
  return summary;
}

function formatStageBits(totals = {}, methods = {}) {
  const bits = [
    `packages ${totals.outputAttackPackages || 0}${(totals.combinedAttackPackages || 0) > 0 ? ` (${totals.combinedAttackPackages} combined)` : ''}`,
    `attack recs ${totals.attackRecommendationsBuilt || 0}/${totals.attackRecommendationsReturned || 0}`,
    `zone compares ${totals.zoneComparisonCalls || 0}`,
    `zone rows ${totals.zoneRowsProduced || 0}`,
    `direct ${totals.directCandidatesProduced || 0}`
  ];

  if ((totals.sequenceCandidatesProduced || 0) > 0) {
    bits.push(`sequences ${totals.sequenceCandidatesProduced}`);
  }
  bits.push(`rows ${totals.resultRowsReturned || 0}`);

  const collapseSummary = methods.collapseEquivalentTargetAttackRecommendations;
  if ((collapseSummary?.calls || 0) > 0) {
    bits.push(`collapse ${collapseSummary.collapseInputs || 0}->${collapseSummary.collapseOutputs || 0}`);
  }

  const precisionSummary = methods.applyStratagemPrecisionFilter;
  if ((precisionSummary?.calls || 0) > 0) {
    bits.push(`precision ${precisionSummary.precisionFilterInputs || 0}->${precisionSummary.precisionFilterOutputs || 0}`);
  }

  return bits.join(', ');
}

export function createRecommendationWorkDistribution() {
  return createWorkBucket();
}

export function recordRecommendationWork(workDistribution, {
  stage = null,
  method = '',
  metrics = {}
} = {}) {
  const root = ensureRoot(workDistribution);
  const methodName = String(method || '').trim();
  if (!root || !methodName) {
    return;
  }

  const rootMethod = ensureMethodContainer(root.methods, methodName);
  rootMethod.calls += 1;
  incrementMetrics(rootMethod, metrics);
  incrementMetrics(root.totals, metrics);

  const stageName = String(stage || '').trim();
  if (!stageName) {
    return;
  }

  const stageContainer = ensureStageContainer(root, stageName);
  const stageMethod = ensureMethodContainer(stageContainer.methods, methodName);
  stageMethod.calls += 1;
  incrementMetrics(stageMethod, metrics);
  incrementMetrics(stageContainer.totals, metrics);
}

export function summarizeRecommendationWorkDistribution(workDistribution = null) {
  const root = ensureRoot(workDistribution || createRecommendationWorkDistribution())
    || createRecommendationWorkDistribution();

  return {
    totals: cloneMetrics(root.totals),
    methods: cloneMethodSummary(root.methods),
    stages: Object.fromEntries(
      getOrderedKeys(root.stages, DEFAULT_STAGE_ORDER).map((stageName) => [
        stageName,
        {
          totals: cloneMetrics(root.stages[stageName]?.totals || {}),
          methods: cloneMethodSummary(root.stages[stageName]?.methods || {})
        }
      ])
    )
  };
}

export function formatRecommendationWorkDistribution(workDistribution = null) {
  const summary = summarizeRecommendationWorkDistribution(workDistribution);
  const lines = [
    `total: ${formatStageBits(summary.totals, summary.methods)}`
  ];

  Object.entries(summary.stages).forEach(([stageName, stageSummary]) => {
    lines.push(`${stageName}: ${formatStageBits(stageSummary.totals, stageSummary.methods)}`);
  });

  return lines.join('\n');
}
