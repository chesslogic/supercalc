import {
  calculatorState,
  getAttackHitCounts,
  getEnemyOptions,
  getSelectedAttacks,
  getSelectedEnemyTargetTypes,
  getWeaponForSlot
} from '../data.js';
import { buildHallOfFameEntries, buildOverviewRows } from '../compare-utils.js';
import { formatTtkSeconds } from '../summary.js';

function capitalizeWord(value) {
  if (!value) {
    return '';
  }

  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatHallOfFameValue(value, type) {
  if (value === null || value === undefined) {
    return '-';
  }

  return type === 'ttk'
    ? formatTtkSeconds(value)
    : String(value);
}

function getHallOfFameOutcomeLabel(entry) {
  const winnerMetrics = entry.row?.metrics?.bySlot?.[entry.metric.winner];
  const outcomeKind = winnerMetrics?.outcomeKind;
  if (!outcomeKind) {
    return entry.row?.zone?.zone_name === 'Main' ? 'Main' : 'Unavailable';
  }

  return capitalizeWord(outcomeKind === 'fatal' ? 'Kill' : outcomeKind);
}

function buildHallOfFameDiffText(entry) {
  const { metric } = entry;
  if (metric.displayMetric.kind === 'one-sided') {
    return `${metric.winner} Only`;
  }

  const magnitude = Math.abs(metric.displayMetric.value);
  if (metric.displayMode === 'percent') {
    return `${metric.winner} by ${magnitude.toFixed(1).replace(/\.0$/, '')}%`;
  }

  if (metric.metricKey === 'ttk') {
    return `${metric.winner} faster by ${formatTtkSeconds(magnitude)}`;
  }

  return `${metric.winner} by ${magnitude} shot${magnitude === 1 ? '' : 's'}`;
}

function appendHallOfFameEntry(list, entry) {
  const item = document.createElement('div');
  item.className = 'calc-hof-entry';

  const header = document.createElement('div');
  header.className = 'calc-hof-entry-header';
  header.textContent = `${entry.row.enemyName} — ${entry.row.zone?.zone_name || 'Zone'}`;
  item.appendChild(header);

  const meta = document.createElement('div');
  meta.className = 'calc-hof-entry-meta';
  meta.textContent = `${entry.row.faction} • ${getHallOfFameOutcomeLabel(entry)}`;
  item.appendChild(meta);

  const values = document.createElement('div');
  values.className = 'calc-hof-entry-values';

  const aMetrics = entry.row.metrics?.bySlot?.A;
  const bMetrics = entry.row.metrics?.bySlot?.B;
  const type = entry.metric.metricKey;
  const label = type === 'ttk' ? 'TTK' : 'Shots';
  values.textContent = `A ${label}: ${formatHallOfFameValue(type === 'ttk' ? aMetrics?.ttkSeconds : aMetrics?.shotsToKill, type)} • B ${label}: ${formatHallOfFameValue(type === 'ttk' ? bMetrics?.ttkSeconds : bMetrics?.shotsToKill, type)} • ${buildHallOfFameDiffText(entry)}`;
  item.appendChild(values);

  list.appendChild(item);
}

function renderHallOfFamePanel(container, slot, weaponName, entries) {
  const panel = document.createElement('section');
  panel.className = 'calc-compare-panel calc-hof-panel';

  const heading = document.createElement('div');
  heading.className = 'calc-compare-heading';

  const badge = document.createElement('span');
  badge.className = `calc-compare-slot-badge calc-compare-slot-badge-${slot.toLowerCase()}`;
  badge.textContent = slot;
  heading.appendChild(badge);

  const title = document.createElement('div');
  title.className = 'calc-compare-title';
  title.textContent = weaponName ? `${weaponName} hall of fame` : `Weapon ${slot} hall of fame`;
  heading.appendChild(title);

  panel.appendChild(heading);

  const body = document.createElement('div');
  body.className = 'calc-compare-body calc-hof-body';
  panel.appendChild(body);

  if (!weaponName) {
    const emptyState = document.createElement('div');
    emptyState.className = 'muted';
    emptyState.textContent = `Select weapon ${slot} to compare the full roster`;
    body.appendChild(emptyState);
    container.appendChild(panel);
    return;
  }

  if (entries.length === 0) {
    const emptyState = document.createElement('div');
    emptyState.className = 'muted';
    emptyState.textContent = 'No overall wins are available for the current attacks and scope';
    body.appendChild(emptyState);
    container.appendChild(panel);
    return;
  }

  entries.forEach((entry) => appendHallOfFameEntry(body, entry));
  container.appendChild(panel);
}

export function renderOverviewCalculation(container) {
  const weaponA = getWeaponForSlot('A');
  const weaponB = getWeaponForSlot('B');
  const selectedAttacksA = getSelectedAttacks('A');
  const selectedAttacksB = getSelectedAttacks('B');

  const rows = buildOverviewRows({
    units: getEnemyOptions(),
    scope: calculatorState.overviewScope,
    targetTypes: getSelectedEnemyTargetTypes(),
    weaponA,
    weaponB,
    selectedAttacksA,
    selectedAttacksB,
    hitCountsA: getAttackHitCounts('A', selectedAttacksA),
    hitCountsB: getAttackHitCounts('B', selectedAttacksB)
  });

  const hallOfFame = buildHallOfFameEntries(rows, {
    diffDisplayMode: calculatorState.diffDisplayMode,
    limit: 5
  });

  const wrapper = document.createElement('div');
  wrapper.className = 'calc-compare-results calc-overview-results';

  renderHallOfFamePanel(wrapper, 'A', weaponA?.name, hallOfFame.A);
  renderHallOfFamePanel(wrapper, 'B', weaponB?.name, hallOfFame.B);

  container.appendChild(wrapper);
}
