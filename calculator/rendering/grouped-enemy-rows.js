// calculator/rendering/grouped-enemy-rows.js
// Renders zone rows for the focused enemy table with grouping/expand-collapse UI.
//
// Multi-member families are rendered as a collapsed summary row by default.
// Clicking the toggle expands the family to show exact member rows.
// Expanded state is persisted in a module-level Set so it survives re-renders.
//
// When a multi-member family's zones transfer damage to Main (ToMain% > 0), a
// secondary "Main via family" path row is inserted immediately after the summary
// row.  It shows the Main kill metrics achievable by cycling shots across all N
// family members (preventing any single zone from breaking before Main dies).
// The row is only emitted when the family path adds information beyond the
// direct representative-member row (i.e. the direct path displays a zone-break
// kill, not a Main kill, and the family cycling makes a Main kill reachable).

import { buildEnemyZoneGroups } from '../enemy-zone-groups.js';
import { calculatorState } from '../data.js';
import { calculateEffectiveDistanceInfo } from '../effective-distance.js';
import { calculateTtkSeconds } from '../summary.js';
import { calculateMainKillShotsViaEquivalentZones } from '../zone-damage.js';
import { formatEnemyBaseCell } from './enemy-base-cells.js';
import { buildMetricColumnCell } from './metric-cells.js';
import { appendEnemyExplosionCell, appendEnemyProjectileCell } from './enemy-target-controls.js';

// ─── Expand/collapse persistence ─────────────────────────────────────────────

const expandedFamilyIds = new Set();

export function isGroupExpanded(familyId) {
  return expandedFamilyIds.has(familyId);
}

export function setGroupExpanded(familyId, expanded) {
  if (expanded) {
    expandedFamilyIds.add(familyId);
  } else {
    expandedFamilyIds.delete(familyId);
  }
}

export function clearAllGroupExpansions() {
  expandedFamilyIds.clear();
}

// ─── Row builders ─────────────────────────────────────────────────────────────

function appendTargetCells(tr, zoneIndex, {
  enemyName,
  hasProjectileTargets,
  hasExplosiveTargets,
  targetColumnCount,
  onRefreshEnemyCalculationViews,
  projectileCellOptions = null
}) {
  if (hasProjectileTargets) {
    appendEnemyProjectileCell(
      tr, enemyName, zoneIndex,
      targetColumnCount === 1 && !hasExplosiveTargets,
      { onRefreshEnemyCalculationViews, ...(projectileCellOptions || {}) }
    );
  }
  if (hasExplosiveTargets) {
    appendEnemyExplosionCell(
      tr, zoneIndex,
      targetColumnCount === 1 && !hasProjectileTargets,
      { onRefreshEnemyCalculationViews }
    );
  }
}

function buildSummaryProjectileCellOptions(family, enemyName, repIndex) {
  const selectedZoneIndex = calculatorState.selectedZoneIndex;
  const selectedIndexWithinFamily = family.memberIndices.includes(selectedZoneIndex)
    ? selectedZoneIndex
    : null;
  const selectedMemberIndex = selectedIndexWithinFamily ?? repIndex;
  const selectedZonePosition = selectedIndexWithinFamily === null
    ? -1
    : family.memberIndices.indexOf(selectedIndexWithinFamily);
  const selectedZone = selectedZonePosition === -1
    ? null
    : family.memberZones[selectedZonePosition] || null;

  return {
    checked: selectedIndexWithinFamily !== null,
    controlName: `enemy-zone-family-${enemyName}-${family.familyId}`,
    controlId: `zone-family-${enemyName}-${family.familyId}`,
    selectZoneIndex: selectedMemberIndex,
    title: selectedZone
      ? `Selected projectile target in this group: ${selectedZone.zone_name}`
      : ''
  };
}

function appendDataCells(tr, zone, metrics, columns) {
  columns.forEach((column) => {
    const metricCell = buildMetricColumnCell(column.key, metrics);
    if (metricCell) {
      tr.appendChild(metricCell);
      return;
    }
    const td = document.createElement('td');
    formatEnemyBaseCell(td, zone, column.key);
    tr.appendChild(td);
  });
}

/**
 * Creates a plain (non-grouped) zone row — used for singletons.
 */
function buildPlainRow(zone, zoneIndex, metrics, { columns, groupStart, targetOptions }) {
  const tr = document.createElement('tr');
  if (groupStart) tr.classList.add('group-start');
  appendTargetCells(tr, zoneIndex, targetOptions);
  appendDataCells(tr, zone, metrics, columns);
  return tr;
}

/**
 * Creates the collapsed/expanded summary row for a multi-member family.
 * Stores `_toggleBtn` on the returned `tr` for later wiring.
 */
function buildSummaryRow(family, repZone, repIndex, repMetrics, {
  columns,
  groupStart,
  isExpanded,
  targetOptions
}) {
  const tr = document.createElement('tr');
  tr.classList.add('zone-group-summary');
  tr.dataset.familyId = family.familyId;
  tr.dataset.groupCollapsed = isExpanded ? 'false' : 'true';
  if (groupStart) tr.classList.add('group-start');

  appendTargetCells(tr, repIndex, {
    ...targetOptions,
    projectileCellOptions: buildSummaryProjectileCellOptions(family, targetOptions.enemyName, repIndex)
  });

  columns.forEach((column) => {
    const metricCell = buildMetricColumnCell(column.key, repMetrics);
    if (metricCell) {
      tr.appendChild(metricCell);
      return;
    }

    const td = document.createElement('td');

    if (column.key === 'zone_name') {
      td.classList.add('zone-group-name-cell');

      const toggleBtn = document.createElement('button');
      toggleBtn.className = 'zone-group-toggle';
      toggleBtn.type = 'button';
      toggleBtn.textContent = isExpanded ? '▼' : '▶';
      toggleBtn.title = isExpanded ? 'Collapse group' : 'Expand group';
      td.appendChild(toggleBtn);

      const labelSpan = document.createElement('span');
      labelSpan.className = 'zone-group-label';
      labelSpan.textContent = family.summaryLabel;
      td.appendChild(labelSpan);

      // Store reference for wiring after member rows are built.
      tr._toggleBtn = toggleBtn;
    } else {
      formatEnemyBaseCell(td, repZone, column.key);
    }

    tr.appendChild(td);
  });

  return tr;
}

/**
 * Creates a member row for a grouped family.
 * Hidden by default unless `visible` is true.
 */
function buildMemberRow(zone, zoneIndex, metrics, {
  columns,
  familyId,
  visible,
  targetOptions
}) {
  const tr = document.createElement('tr');
  tr.classList.add('zone-group-member');
  tr.dataset.familyId = familyId;
  if (!visible) tr.style.display = 'none';

  appendTargetCells(tr, zoneIndex, targetOptions);

  columns.forEach((column) => {
    const metricCell = buildMetricColumnCell(column.key, metrics);
    if (metricCell) {
      tr.appendChild(metricCell);
      return;
    }
    const td = document.createElement('td');
    if (column.key === 'zone_name') {
      td.classList.add('zone-group-member-name-cell');
    }
    formatEnemyBaseCell(td, zone, column.key);
    tr.appendChild(td);
  });

  return tr;
}

// ─── Family main-path metrics ─────────────────────────────────────────────────

/**
 * Builds a minimal numeric diff-metric object suitable for the diff columns.
 * Returns an "unavailable" shape when either value is absent.
 *
 * @private
 */
function computeFamilyDiffMetric(valueA, valueB) {
  const aOk = Number.isFinite(valueA);
  const bOk = Number.isFinite(valueB);

  if (aOk && bOk) {
    const absoluteValue = valueB - valueA;
    const percentValue = valueA > 0 ? (absoluteValue / valueA) * 100 : null;
    return {
      kind: 'numeric',
      winner: absoluteValue < 0 ? 'B' : absoluteValue > 0 ? 'A' : null,
      valueA,
      valueB,
      displayValue: null,
      sortValue: absoluteValue,
      absoluteValue,
      absoluteSortValue: absoluteValue,
      percentValue,
      percentSortValue: percentValue
    };
  }

  return {
    kind: 'unavailable',
    winner: null,
    valueA,
    valueB,
    displayValue: null,
    sortValue: null,
    absoluteValue: null,
    absoluteSortValue: null,
    percentValue: null,
    percentSortValue: null
  };
}

function createUnavailableFamilyPathDistanceInfo() {
  return {
    meters: null,
    sortValue: null,
    text: '-',
    title: 'Main via family is unavailable for this weapon with the current selection.',
    isAvailable: false
  };
}

/**
 * Returns true when cycling shots across all `memberCount` family members
 * makes a Main kill reachable, yet the direct (single-zone) path does not
 * already show a Main kill.
 *
 * Condition: mainShotsToKill ≤ memberCount × zoneShotsToKill
 *   — Main dies before every family zone is exhausted in the cycling sequence.
 *
 * @param {object|null} slotMetrics
 * @param {number} memberCount  Number of family members (must be ≥ 2).
 * @returns {boolean}
 */
export function isFamilyMainPathViableForSlot(slotMetrics, memberCount) {
  if (!slotMetrics || memberCount < 2) return false;
  if (!slotMetrics.damagesZone) return false;

  const killSummary = slotMetrics?.zoneSummary?.killSummary;
  if (!killSummary) return false;

  const mainShotsToKill = killSummary.mainShotsToKill;
  const zoneShotsToKill = killSummary.zoneEffectiveShotsToKill ?? killSummary.zoneShotsToKill;

  if (mainShotsToKill === null || zoneShotsToKill === null) return false;

  // Direct path already delivers a Main kill — family path adds no new info.
  if (slotMetrics.outcomeKind === 'main') return false;

  // Family cycling achieves Main kill before all zone instances are broken.
  return mainShotsToKill <= memberCount * zoneShotsToKill;
}

function getFamilyMainPathShotsToKill(slotMetrics, zone, memberCount) {
  if (!slotMetrics) {
    return null;
  }

  const killSummary = slotMetrics?.zoneSummary?.killSummary;
  if (!killSummary) {
    return null;
  }

  if (!zone) {
    return killSummary.mainShotsToKill;
  }

  if (zone?.MainCap) {
    return calculateMainKillShotsViaEquivalentZones({
      zone,
      zoneSummary: slotMetrics.zoneSummary,
      memberCount
    });
  }

  return killSummary.mainShotsToKill;
}

/**
 * Builds a modified copy of `slotMetrics` that exposes the Main kill path
 * (mainShotsToKill / mainTtkSeconds) instead of the zone-break path.
 *
 * Returns `null` when the kill summary contains no computable Main kill.
 *
 * @param {object} slotMetrics
 * @returns {object|null}
 */
function buildFamilyMainPathSlotMetrics(slotMetrics, zone, memberCount) {
  if (!slotMetrics) return null;

  const killSummary = slotMetrics?.zoneSummary?.killSummary;
  const mainShotsToKill = getFamilyMainPathShotsToKill(slotMetrics, zone, memberCount);
  const mainTtkSeconds = calculateTtkSeconds(
    mainShotsToKill,
    killSummary?.rpm ?? slotMetrics?.weapon?.rpm ?? null
  );

  if (mainShotsToKill === null) return null;

  return {
    ...slotMetrics,
    shotsToKill: mainShotsToKill,
    ttkSeconds: mainTtkSeconds,
    outcomeKind: 'main',
    effectiveDistance: zone
      ? calculateEffectiveDistanceInfo({
          weapon: slotMetrics.weapon,
          zone,
          zoneSummary: slotMetrics.zoneSummary,
          outcomeKind: 'main',
          selectedAttackCount: slotMetrics.selectedAttackCount ?? 0,
          damagesZone: slotMetrics.damagesZone
        })
      : createUnavailableFamilyPathDistanceInfo(),
    // Margin is defined relative to a specific kill path; clear it here.
    marginRatio: null,
    marginPercent: null,
    displayMarginRatio: null,
    displayMarginPercent: null,
    marginSortRatio: null,
    marginDisplayPercent: null
  };
}

function buildUnavailableFamilyPathSlotMetrics(slotMetrics) {
  if (!slotMetrics) {
    return null;
  }

  return {
    ...slotMetrics,
    shotsToKill: null,
    ttkSeconds: null,
    outcomeKind: null,
    effectiveDistance: createUnavailableFamilyPathDistanceInfo(),
    marginRatio: null,
    marginPercent: null,
    displayMarginRatio: null,
    displayMarginPercent: null,
    marginSortRatio: null,
    marginDisplayPercent: null
  };
}

/**
 * Builds a metrics object for the "Main via family" path row.
 *
 * Returns `null` when:
 *   - The family is a singleton.
 *   - Neither weapon slot benefits from the family path.
 *
 * When at least one slot is viable, the returned object has the same shape as
 * a regular zone-comparison metrics object so that `buildMetricColumnCell`
 * renders it correctly.
 *
 * @param {object|null} repMetrics  The representative member's metrics object.
 * @param {object} family           The family descriptor from buildEnemyZoneGroups.
 * @param {object|null} [repZone]   Representative zone for range recomputation.
 * @returns {object|null}
 */
export function buildFamilyMainPathMetrics(repMetrics, family, repZone = null) {
  if (!repMetrics || !family || family.isSingleton) return null;

  const memberCount = family.memberIndices.length;
  const slotA = repMetrics.bySlot?.A ?? null;
  const slotB = repMetrics.bySlot?.B ?? null;

  const directZoneShotsA = slotA?.zoneSummary?.killSummary?.zoneEffectiveShotsToKill
    ?? slotA?.zoneSummary?.killSummary?.zoneShotsToKill
    ?? null;
  const directZoneShotsB = slotB?.zoneSummary?.killSummary?.zoneEffectiveShotsToKill
    ?? slotB?.zoneSummary?.killSummary?.zoneShotsToKill
    ?? null;
  const familyMainShotsA = getFamilyMainPathShotsToKill(slotA, repZone, memberCount);
  const familyMainShotsB = getFamilyMainPathShotsToKill(slotB, repZone, memberCount);
  const viableA = slotA?.outcomeKind !== 'main'
    && familyMainShotsA !== null
    && (repZone?.MainCap || (directZoneShotsA !== null && familyMainShotsA <= memberCount * directZoneShotsA));
  const viableB = slotB?.outcomeKind !== 'main'
    && familyMainShotsB !== null
    && (repZone?.MainCap || (directZoneShotsB !== null && familyMainShotsB <= memberCount * directZoneShotsB));

  if (!viableA && !viableB) return null;

  const familySlotA = viableA
    ? buildFamilyMainPathSlotMetrics(slotA, repZone, memberCount)
    : buildUnavailableFamilyPathSlotMetrics(slotA);
  const familySlotB = viableB
    ? buildFamilyMainPathSlotMetrics(slotB, repZone, memberCount)
    : buildUnavailableFamilyPathSlotMetrics(slotB);

  return {
    bySlot: { A: familySlotA, B: familySlotB },
    diffShots: computeFamilyDiffMetric(
      familySlotA?.shotsToKill ?? null,
      familySlotB?.shotsToKill ?? null
    ),
    diffTtkSeconds: computeFamilyDiffMetric(
      familySlotA?.ttkSeconds ?? null,
      familySlotB?.ttkSeconds ?? null
    )
  };
}

// ─── Family main-path row builder ─────────────────────────────────────────────

/**
 * Creates the "Main via family" path row for a multi-member zone family.
 *
 * This row surfaces the Main kill metric that is achievable by cycling shots
 * across all N family members — a path that the representative-member summary
 * row alone would not display (because the direct per-zone outcome is 'limb').
 *
 * No targeting controls are added (this is a derived path, not a targetable
 * zone); placeholder <td> cells keep the column layout aligned.
 */
function buildFamilyMainPathRow(family, repZone, familyPathMetrics, {
  columns,
  familyId,
  hasProjectileTargets,
  hasExplosiveTargets
}) {
  const tr = document.createElement('tr');
  tr.classList.add('zone-group-family-path');
  tr.dataset.familyId = familyId;

  // Placeholder cells to keep column alignment with rows that have target controls.
  if (hasProjectileTargets) {
    const td = document.createElement('td');
    td.className = 'zone-group-family-path-placeholder';
    tr.appendChild(td);
  }
  if (hasExplosiveTargets) {
    const td = document.createElement('td');
    td.className = 'zone-group-family-path-placeholder';
    tr.appendChild(td);
  }

  const memberCount = family.memberIndices.length;
  const tooltipSuffix = repZone?.MainCap
    ? ' This part has an overflow cap, so breaking one member early would lose passthrough from the overkill portion.'
    : '';
  const tooltipText =
    `Main via family (×${memberCount}): cycling one shot per family member per ` +
    `round deals ${memberCount}× the per-shot passthrough to Main, keeping each ` +
    `individual part alive long enough for Main to be destroyed first.` +
    tooltipSuffix;

  columns.forEach((column) => {
    const metricCell = buildMetricColumnCell(column.key, familyPathMetrics);
    if (metricCell) {
      tr.appendChild(metricCell);
      return;
    }

    const td = document.createElement('td');

    if (column.key === 'zone_name') {
      td.classList.add('zone-group-family-path-name-cell');
      td.textContent = `Main via family (×${memberCount})`;
      td.title = tooltipText;
    } else {
      // Show representative zone data for base columns (AV, Dur%, etc.) so the
      // row gives the same zone-stat context as the summary row.
      formatEnemyBaseCell(td, repZone, column.key);
    }

    tr.appendChild(td);
  });

  return tr;
}

// ─── Toggle wiring ─────────────────────────────────────────────────────────────

function wireGroupToggle(summaryTr, familyId, memberTrs) {
  const btn = summaryTr._toggleBtn;
  if (!btn) return;

  btn.addEventListener('click', (event) => {
    event?.stopPropagation?.();
    const nowExpanded = !isGroupExpanded(familyId);
    setGroupExpanded(familyId, nowExpanded);
    btn.textContent = nowExpanded ? '▼' : '▶';
    btn.title = nowExpanded ? 'Collapse group' : 'Expand group';
    summaryTr.dataset.groupCollapsed = nowExpanded ? 'false' : 'true';
    memberTrs.forEach((memberTr) => {
      memberTr.style.display = nowExpanded ? '' : 'none';
    });
  });
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Renders all zone rows into `tbody` with grouping applied.
 *
 * Multi-member families are collapsed by default; expanded when the toggle
 * is clicked (or when the family was previously expanded in this session).
 *
 * @returns {Array<{ tr: Element, zone: object, zoneIndex: number }>}
 *   Row entries suitable for `wireZoneRelationHighlights`.
 */
export function renderGroupedEnemyRows(tbody, sortedRows, enemy, {
  columns = [],
  hasProjectileTargets = false,
  hasExplosiveTargets = false,
  onRefreshEnemyCalculationViews = null
} = {}) {
  const { families, zoneIndexToFamilyId } = buildEnemyZoneGroups(enemy, sortedRows);
  const familyById = new Map(families.map((f) => [f.familyId, f]));
  const targetColumnCount = Number(hasProjectileTargets) + Number(hasExplosiveTargets);
  const enemyName = enemy?.name || '';

  const targetOptions = {
    enemyName,
    hasProjectileTargets,
    hasExplosiveTargets,
    targetColumnCount,
    onRefreshEnemyCalculationViews
  };

  // Pre-collect member rows per family, in sortedRows order.
  const familyMemberRows = new Map();
  for (const row of sortedRows) {
    const fid = zoneIndexToFamilyId.get(row.zoneIndex);
    const family = fid ? familyById.get(fid) : null;
    if (!family || family.isSingleton) continue;
    if (!familyMemberRows.has(fid)) familyMemberRows.set(fid, []);
    familyMemberRows.get(fid).push(row);
  }

  const renderedFamilies = new Set();
  const rowEntries = [];

  for (const row of sortedRows) {
    const { zone, zoneIndex, metrics, groupStart } = row;
    const fid = zoneIndexToFamilyId.get(zoneIndex);
    const family = fid ? familyById.get(fid) : null;

    // Singleton or no family: plain row.
    if (!family || family.isSingleton) {
      const tr = buildPlainRow(zone, zoneIndex, metrics, { columns, groupStart, targetOptions });
      tbody.appendChild(tr);
      rowEntries.push({ tr, zone, zoneIndex });
      continue;
    }

    // Already emitted as part of an earlier summary+members block.
    if (renderedFamilies.has(fid)) continue;
    renderedFamilies.add(fid);

    const isExpanded = isGroupExpanded(fid);
    const memberRows = familyMemberRows.get(fid) || [];

    // Prefer the representative's row for summary metrics; fall back to first.
    const repRow = memberRows.find((r) => r.zoneIndex === family.representativeIndex) || memberRows[0] || row;
    const repZone = family.representativeZone;
    const repIndex = family.representativeIndex;
    const repMetrics = repRow.metrics;

    const summaryTr = buildSummaryRow(family, repZone, repIndex, repMetrics, {
      columns,
      groupStart,
      isExpanded,
      targetOptions
    });
    tbody.appendChild(summaryTr);
    // Summary row uses representative zone for zone-relation highlighting.
    rowEntries.push({ tr: summaryTr, zone: repZone, zoneIndex: repIndex });

    // Family main-path row (inserted immediately after summary, before members).
    // Only emitted when cycling shots across all family members makes a Main
    // kill reachable that the direct representative path does not already show.
    const familyPathMetrics = buildFamilyMainPathMetrics(repMetrics, family, repZone);
    if (familyPathMetrics) {
      const familyPathTr = buildFamilyMainPathRow(family, repZone, familyPathMetrics, {
        columns,
        familyId: fid,
        hasProjectileTargets,
        hasExplosiveTargets
      });
      tbody.appendChild(familyPathTr);
      rowEntries.push({ tr: familyPathTr, zone: repZone, zoneIndex: repIndex });
    }

    // Render one member row per family member (in sortedRows order).
    const memberTrs = [];
    for (const memberRow of memberRows) {
      const memberTr = buildMemberRow(memberRow.zone, memberRow.zoneIndex, memberRow.metrics, {
        columns,
        familyId: fid,
        visible: isExpanded,
        targetOptions
      });
      tbody.appendChild(memberTr);
      memberTrs.push(memberTr);
      rowEntries.push({ tr: memberTr, zone: memberRow.zone, zoneIndex: memberRow.zoneIndex });
    }

    wireGroupToggle(summaryTr, fid, memberTrs);
  }

  return rowEntries;
}
