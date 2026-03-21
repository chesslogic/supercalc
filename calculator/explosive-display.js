import { normalizeExplosionDamageMultiplier } from './zone-damage.js';

export const EXPLOSIVE_DISPLAY_COLUMN_LABEL = 'ExDR';

function normalizeZoneName(zone) {
  return String(zone?.zone_name || '').trim().toLowerCase();
}

function formatPercent(value) {
  return `${value.toFixed(0)}%`;
}

function buildReductionTitle({ resistancePercent, receivedPercent, rawValue, isImplicit }) {
  const valueSource = isImplicit
    ? 'implicit ExMult 1'
    : `ExMult ${rawValue}`;

  if (resistancePercent < 0) {
    return `${valueSource} -> ${formatPercent(resistancePercent)} ExDR (${formatPercent(receivedPercent)} explosive damage received).`;
  }

  return `${valueSource} -> ${formatPercent(resistancePercent)} ExDR (${formatPercent(receivedPercent)} explosive damage received).`;
}

function buildRoutedTitle() {
  return 'The app currently treats this as a special explosive-handling case: direct explosive part damage and explosive passthrough from this part are suppressed, but if an AoE ray hits the enemy the calculator still performs one direct Main explosive check using Main defenses. The asterisk marks current calculator handling for this special case rather than a confirmed separate in-game ExDR value for the part.';
}

export function getExplosiveDisplayInfo(zone) {
  const isMainZone = normalizeZoneName(zone) === 'main';
  const isRouted = !isMainZone && String(zone?.ExTarget || '').trim().toLowerCase() === 'main';

  if (isRouted) {
    return {
      text: '100%*',
      title: buildRoutedTitle(),
      sortValue: 1,
      strike: false,
      isImplicit: zone?.ExMult === null || zone?.ExMult === undefined || zone?.ExMult === '',
      isRouted: true
    };
  }

  if (zone?.ExMult === '-') {
    return {
      text: '100%',
      title: 'Explicit explosion immunity.',
      sortValue: 1,
      strike: false,
      isImplicit: false,
      isRouted: false
    };
  }

  const isImplicit = zone?.ExMult === null || zone?.ExMult === undefined || zone?.ExMult === '';
  const multiplier = normalizeExplosionDamageMultiplier(zone?.ExMult);
  const resistancePercent = (1 - multiplier) * 100;
  const receivedPercent = multiplier * 100;

  return {
    text: formatPercent(resistancePercent),
    title: buildReductionTitle({
      resistancePercent,
      receivedPercent,
      rawValue: zone?.ExMult,
      isImplicit
    }),
    sortValue: resistancePercent / 100,
    strike: false,
    isImplicit,
    isRouted: false
  };
}

export function applyExplosiveDisplayToCell(td, zone) {
  const info = getExplosiveDisplayInfo(zone);
  td.textContent = info.text;
  td.title = info.title;

  if (info.isRouted) {
    td.style.color = 'var(--muted)';
    td.style.opacity = '0.85';
    return td;
  }

  if (info.sortValue < 0) {
    td.style.color = 'var(--red)';
    return td;
  }

  if (info.isImplicit) {
    td.style.color = 'var(--muted)';
    td.style.opacity = '0.85';
  }

  return td;
}
