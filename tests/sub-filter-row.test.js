import test from 'node:test';
import assert from 'node:assert/strict';

class StubClassList {
  constructor() { this.tokens = new Set(); }
  setFromString(value) { this.tokens = new Set(String(value || '').split(/\s+/).filter(Boolean)); }
  add(...tokens) { tokens.forEach((token) => this.tokens.add(token)); }
  remove(...tokens) { tokens.forEach((token) => this.tokens.delete(token)); }
  contains(token) { return this.tokens.has(token); }
}

class StubElement {
  constructor(tag) {
    this.tagName = (tag || 'div').toUpperCase();
    this.children = [];
    this.dataset = {};
    this.listeners = [];
    this._textContent = '';
    this._className = '';
    this.classList = new StubClassList();
  }
  get className() { return this._className; }
  set className(value) {
    this._className = String(value || '');
    this.classList.setFromString(this._className);
  }
  get textContent() {
    return `${this._textContent}${this.children.map((child) => child.textContent).join('')}`;
  }
  set textContent(value) {
    this._textContent = String(value ?? '');
    this.children = [];
  }
  appendChild(child) { this.children.push(child); return child; }
  addEventListener(type, fn) { this.listeners.push({ type, fn }); }
}

if (typeof globalThis.document === 'undefined') {
  globalThis.document = {
    createElement(tag) { return new StubElement(tag); }
  };
}

const {
  createSubtypeFilterChipRow,
  getAvailableWeaponSubs
} = await import('../weapons/sub-filter-row.js');

test('getAvailableWeaponSubs returns only curated shared subtype ids in taxonomy order', () => {
  const result = getAvailableWeaponSubs([
    { sub: 'BCK' },
    { sub: 'RL' },
    { sub: 'AR' },
    { sub: 'CAN' },
    { sub: 'EXP' }
  ]);

  assert.deepEqual(result, ['ar', 'exp', 'rl']);
});

test('createSubtypeFilterChipRow builds chips only for curated shared subtype ids', () => {
  const row = createSubtypeFilterChipRow({
    weapons: [
      { sub: 'BCK' },
      { sub: 'AR' },
      { sub: 'RL' }
    ],
    activeSubs: ['rl', 'bck']
  });
  const chips = row.children.filter((child) => child.tagName === 'BUTTON');

  assert.ok(row.classList.contains('chiprow'));
  assert.deepEqual(chips.map((chip) => chip.textContent), ['AR', 'RL']);
  assert.deepEqual(chips.map((chip) => chip.dataset.val), ['ar', 'rl']);
  assert.ok(!chips[0].classList.contains('active'));
  assert.ok(chips[1].classList.contains('active'));
});

test('createSubtypeFilterChipRow can omit all chips when only hidden subtype ids are present', () => {
  const row = createSubtypeFilterChipRow({
    weapons: [{ sub: 'BCK' }, { sub: 'CAN' }],
    activeSubs: ['bck']
  });
  const chips = row.children.filter((child) => child.tagName === 'BUTTON');

  assert.equal(chips.length, 0);
});
