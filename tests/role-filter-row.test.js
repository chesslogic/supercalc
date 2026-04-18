import test from 'node:test';
import assert from 'node:assert/strict';

// Minimal DOM stubs required by createFilterChip / createFilterChipRow
class StubClassList {
  constructor() { this.tokens = new Set(); }
  setFromString(v) { this.tokens = new Set(String(v || '').split(/\s+/).filter(Boolean)); }
  add(...ts) { ts.forEach((t) => this.tokens.add(t)); }
  remove(...ts) { ts.forEach((t) => this.tokens.delete(t)); }
  contains(t) { return this.tokens.has(t); }
}

class StubElement {
  constructor(tag) {
    this.tagName = (tag || 'div').toUpperCase();
    this.children = [];
    this.dataset = {};
    this.title = '';
    this._textContent = '';
    this._className = '';
    this.classList = new StubClassList();
    this.listeners = [];
    this.type = '';
  }
  get className() { return this._className; }
  set className(v) {
    this._className = String(v || '');
    this.classList.setFromString(this._className);
  }
  get textContent() {
    return `${this._textContent}${this.children.map((c) => c.textContent).join('')}`;
  }
  set textContent(v) { this._textContent = String(v ?? ''); this.children = []; }
  appendChild(child) { this.children.push(child); return child; }
  addEventListener(_type, fn) { this.listeners.push({ type: _type, fn }); }
}

if (typeof globalThis.document === 'undefined') {
  globalThis.document = {
    createElement(tag) { return new StubElement(tag); }
  };
}

const { getAvailableWeaponRoles, createRoleFilterChipRow } = await import('../weapons/role-filter-row.js');
const { WEAPON_ROLE_ORDER } = await import('../weapons/weapon-taxonomy.js');

// --- getAvailableWeaponRoles ---

test('getAvailableWeaponRoles returns roles present in weapons, in taxonomy order', () => {
  const weapons = [
    { role: 'precision' },
    { role: 'automatic' },
    { role: 'precision' },
    { role: 'explosive' }
  ];
  const result = getAvailableWeaponRoles(weapons);
  assert.deepEqual(result, ['automatic', 'precision', 'explosive']);
});

test('getAvailableWeaponRoles returns empty array for no weapons', () => {
  assert.deepEqual(getAvailableWeaponRoles([]), []);
  assert.deepEqual(getAvailableWeaponRoles(null), []);
  assert.deepEqual(getAvailableWeaponRoles(undefined), []);
});

test('getAvailableWeaponRoles falls back to legacy sub-based roles', () => {
  const weapons = [
    { sub: 'AR' },
    { sub: 'DMR' }
  ];
  const result = getAvailableWeaponRoles(weapons);
  assert.deepEqual(result, ['automatic', 'precision']);
});

test('getAvailableWeaponRoles supports all seven taxonomy roles', () => {
  const weapons = WEAPON_ROLE_ORDER.map((roleId) => ({ role: roleId }));
  const result = getAvailableWeaponRoles(weapons);
  assert.deepEqual(result, [...WEAPON_ROLE_ORDER]);
});

test('getAvailableWeaponRoles includes Precision role', () => {
  const weapons = [{ role: 'precision' }, { role: 'automatic' }];
  assert.ok(getAvailableWeaponRoles(weapons).includes('precision'));
});

// --- createRoleFilterChipRow ---

test('createRoleFilterChipRow builds a chiprow with role chips', () => {
  const weapons = [
    { role: 'automatic' },
    { role: 'precision' },
    { role: 'shotgun' }
  ];
  const row = createRoleFilterChipRow({ weapons, activeRoles: ['precision'] });
  assert.ok(row.classList.contains('chiprow'));

  const labelSpan = row.children.find((c) => c.classList.contains('muted'));
  assert.equal(labelSpan.textContent, 'Role');

  const chips = row.children.filter((c) => c.tagName === 'BUTTON');
  assert.equal(chips.length, 3);

  const labels = chips.map((c) => c.textContent);
  assert.deepEqual(labels, ['Automatic', 'Precision', 'Shotgun']);

  assert.ok(chips[1].classList.contains('active'), 'Precision chip should be active');
  assert.ok(!chips[0].classList.contains('active'), 'Automatic chip should not be active');
});

test('createRoleFilterChipRow uses custom label', () => {
  const row = createRoleFilterChipRow({
    weapons: [{ role: 'automatic' }],
    label: 'Feature'
  });
  const labelSpan = row.children.find((c) => c.classList.contains('muted'));
  assert.equal(labelSpan.textContent, 'Feature');
});

test('createRoleFilterChipRow sets data-role on each chip', () => {
  const weapons = [{ role: 'energy' }, { role: 'ordnance' }];
  const row = createRoleFilterChipRow({ weapons });
  const chips = row.children.filter((c) => c.tagName === 'BUTTON');
  const roles = chips.map((c) => c.dataset.role);
  assert.deepEqual(roles, ['ordnance', 'energy']);
});

test('createRoleFilterChipRow calls onToggleRole and onRefresh on click', () => {
  const toggled = [];
  let refreshed = 0;
  const weapons = [{ role: 'automatic' }];
  const row = createRoleFilterChipRow({
    weapons,
    onToggleRole: (roleId) => toggled.push(roleId),
    onRefresh: () => { refreshed += 1; }
  });
  const chip = row.children.find((c) => c.tagName === 'BUTTON');
  const clickHandler = chip.listeners.find((l) => l.type === 'click');
  clickHandler.fn();
  assert.deepEqual(toggled, ['automatic']);
  assert.equal(refreshed, 1);
});

test('createRoleFilterChipRow returns empty row when no roles present', () => {
  const row = createRoleFilterChipRow({ weapons: [] });
  const chips = row.children.filter((c) => c.tagName === 'BUTTON');
  assert.equal(chips.length, 0);
});
