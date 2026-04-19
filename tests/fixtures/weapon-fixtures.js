// Shared weapon / enemy fixture factories used across calculator and
// weapon-table test suites.  The signatures here match the "standard"
// full-row form (name, damage, ap).  Suites that need a different local
// variant (e.g. calculator-ui's AP-first signature) should keep their own
// local factory and NOT import from here.

export function makeAttackRow(name, damage, ap = 2) {
  return {
    'Atk Type': 'Projectile',
    'Atk Name': name,
    DMG: damage,
    DUR: 0,
    AP: ap,
    DF: 10,
    ST: 10,
    PF: 10
  };
}

export function makeExplosionAttackRow(name, damage, ap = 3) {
  return {
    ...makeAttackRow(name, damage, ap),
    'Atk Type': 'Explosion'
  };
}

export function makeWeapon(name, {
  code = '',
  index = 0,
  rpm = 60,
  role = null,
  sub = 'AR',
  type = 'Primary',
  rows = []
} = {}) {
  return { name, code, index, rpm, role, type, sub, rows };
}

export function makeZone(zoneName, {
  health = 100,
  isFatal = false,
  av = 1,
  toMainPercent = 0
} = {}) {
  return {
    zone_name: zoneName,
    health,
    Con: 0,
    AV: av,
    'Dur%': 0,
    'ToMain%': toMainPercent,
    ExTarget: 'Part',
    ExMult: 1,
    IsFatal: isFatal
  };
}
