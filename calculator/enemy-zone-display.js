function toFiniteNumber(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function toBoolean(value) {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return value !== 0;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1' || normalized === 'yes') {
      return true;
    }
    if (normalized === 'false' || normalized === '0' || normalized === 'no') {
      return false;
    }
  }

  return false;
}

export const ZERO_BLEED_CON_TOOLTIP = 'This enemy has a Constitution with 0 Bleed, effectively a second health bar.';
export const MAIN_CON_ANY_DEATH_TOOLTIP = 'This Main Constitution still applies even when the enemy dies through a fatal or downing part rather than by depleting Main.';

export function hasZeroBleedConstitution(zone) {
  const con = toFiniteNumber(zone?.Con) ?? 0;
  const conRate = toFiniteNumber(zone?.ConRate);
  return con > 0 && (toBoolean(zone?.ConNoBleed) || conRate === 0);
}

function hasAnyDeathConstitutionNote(zone) {
  const con = toFiniteNumber(zone?.Con) ?? 0;
  return con > 0 && toBoolean(zone?.ConAppliesAnyDeath);
}

export function getEnemyZoneHealthDisplayInfo(zone) {
  const health = toFiniteNumber(zone?.health);
  const con = toFiniteNumber(zone?.Con) ?? 0;
  const usesConAsHealth = hasZeroBleedConstitution(zone);

  if (health === null) {
    return {
      text: '',
      sortValue: null,
      title: '',
      usesConAsHealth: false,
      effectiveHealth: null
    };
  }

  if (health < 0) {
    return {
      text: '-',
      sortValue: health,
      title: '',
      usesConAsHealth: false,
      effectiveHealth: health
    };
  }

  const effectiveHealth = usesConAsHealth ? health + con : health;
  return {
    text: String(effectiveHealth),
    sortValue: effectiveHealth,
    title: '',
    usesConAsHealth,
    effectiveHealth
  };
}

export function getEnemyZoneConDisplayInfo(zone) {
  const con = toFiniteNumber(zone?.Con) ?? 0;
  const usesConAsHealth = hasZeroBleedConstitution(zone);

  if (con <= 0) {
    return {
      text: '-',
      sortValue: 0,
      title: '',
      usesConAsHealth: false,
      isEmpty: true
    };
  }

  if (usesConAsHealth) {
    return {
      text: '*',
      sortValue: con,
      title: ZERO_BLEED_CON_TOOLTIP,
      usesConAsHealth: true,
      isEmpty: false
    };
  }

  if (hasAnyDeathConstitutionNote(zone)) {
    return {
      text: `${con}*`,
      sortValue: con,
      title: MAIN_CON_ANY_DEATH_TOOLTIP,
      usesConAsHealth: false,
      isEmpty: false
    };
  }

  return {
    text: String(con),
    sortValue: con,
    title: '',
    usesConAsHealth: false,
    isEmpty: false
  };
}

export function applyEnemyZoneHealthDisplayToCell(td, zone) {
  const info = getEnemyZoneHealthDisplayInfo(zone);
  td.textContent = info.text;
  td.title = info.title;
}

export function applyEnemyZoneConDisplayToCell(td, zone) {
  const info = getEnemyZoneConDisplayInfo(zone);
  td.textContent = info.text;
  td.title = info.title;

  if (info.isEmpty) {
    td.style.color = 'var(--muted)';
    td.style.opacity = '0.6';
    return;
  }

  td.style.color = '';
  td.style.opacity = '';

  if (info.title) {
    td.style.cursor = 'help';
    return;
  }

  td.style.cursor = '';
}
