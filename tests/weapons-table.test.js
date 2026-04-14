import test from 'node:test';
import assert from 'node:assert/strict';

if (!globalThis.localStorage) {
  globalThis.localStorage = {
    getItem() {
      return null;
    },
    setItem() {},
    removeItem() {}
  };
}

const weaponsDataModule = await import('../weapons/data.js');
const weaponsTableModule = await import('../weapons/table.js');

const {
  ingestHeadersAndRows,
  state
} = weaponsDataModule;
const {
  DURABLE_RATIO_HEADER,
  renderTable
} = weaponsTableModule;

class TestClassList {
  constructor(element) {
    this.element = element;
    this.tokens = new Set();
  }

  setFromString(value) {
    this.tokens = new Set(String(value || '').split(/\s+/).filter(Boolean));
  }

  syncElement() {
    this.element._className = [...this.tokens].join(' ');
  }

  add(...tokens) {
    tokens
      .flatMap((token) => String(token || '').split(/\s+/))
      .filter(Boolean)
      .forEach((token) => this.tokens.add(token));
    this.syncElement();
  }

  remove(...tokens) {
    tokens
      .flatMap((token) => String(token || '').split(/\s+/))
      .filter(Boolean)
      .forEach((token) => this.tokens.delete(token));
    this.syncElement();
  }

  contains(token) {
    return this.tokens.has(token);
  }
}

class TestElement {
  constructor(tagName, ownerDocument) {
    this.tagName = String(tagName || 'div').toUpperCase();
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.parentNode = null;
    this.style = {};
    this.dataset = {};
    this.listeners = new Map();
    this.title = '';
    this._textContent = '';
    this._className = '';
    this.classList = new TestClassList(this);
  }

  get className() {
    return this._className;
  }

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

  get innerHTML() {
    return '';
  }

  set innerHTML(_value) {
    this._textContent = '';
    this.children = [];
  }

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }
}

class TestDocument {
  constructor() {
    this.elementsById = new Map();
  }

  createElement(tagName) {
    return new TestElement(tagName, this);
  }

  getElementById(id) {
    return this.elementsById.get(id) || null;
  }

  registerElement(id, tagName = 'div') {
    const element = this.createElement(tagName);
    element.id = id;
    this.elementsById.set(id, element);
    return element;
  }
}

function collectElements(root, predicate, matches = []) {
  if (!root) {
    return matches;
  }

  if (predicate(root)) {
    matches.push(root);
  }

  root.children.forEach((child) => collectElements(child, predicate, matches));
  return matches;
}

function snapshotWeaponState() {
  return {
    headers: state.headers,
    rows: state.rows,
    groups: state.groups,
    filteredGroups: state.filteredGroups,
    filterActive: state.filterActive,
    searchQuery: state.searchQuery,
    activeTypes: [...state.activeTypes],
    activeSubs: [...state.activeSubs],
    sortKey: state.sortKey,
    sortDir: state.sortDir,
    typeIndex: state.typeIndex,
    subIndex: state.subIndex,
    searchIndex: state.searchIndex,
    pinnedWeapons: new Set(state.pinnedWeapons),
    patchVersion: state.patchVersion,
    keys: { ...state.keys }
  };
}

function restoreWeaponState(snapshot) {
  state.headers = snapshot.headers;
  state.rows = snapshot.rows;
  state.groups = snapshot.groups;
  state.filteredGroups = snapshot.filteredGroups;
  state.filterActive = snapshot.filterActive;
  state.searchQuery = snapshot.searchQuery;
  state.activeTypes = [...snapshot.activeTypes];
  state.activeSubs = [...snapshot.activeSubs];
  state.sortKey = snapshot.sortKey;
  state.sortDir = snapshot.sortDir;
  state.typeIndex = snapshot.typeIndex;
  state.subIndex = snapshot.subIndex;
  state.searchIndex = snapshot.searchIndex;
  state.pinnedWeapons = new Set(snapshot.pinnedWeapons);
  state.patchVersion = snapshot.patchVersion;
  state.keys = { ...snapshot.keys };
}

function withTableFixture(callback) {
  const previousDocument = globalThis.document;
  const snapshot = snapshotWeaponState();

  globalThis.document = new TestDocument();
  document.registerElement('thead', 'thead');
  document.registerElement('tbody', 'tbody');

  try {
    return callback({
      thead: document.getElementById('thead'),
      tbody: document.getElementById('tbody')
    });
  } finally {
    globalThis.document = previousDocument;
    restoreWeaponState(snapshot);
  }
}

test('renderTable inserts a durable ratio column after DUR with percent and close fraction text', () => withTableFixture(({ thead, tbody }) => {
  ingestHeadersAndRows(
    ['Type', 'Sub', 'Code', 'Name', 'RPM', 'Atk Type', 'Atk Name', 'DMG', 'DUR', 'AP', 'DF', 'ST', 'PF'],
    [{
      Type: 'Primary',
      Sub: 'AR',
      Code: 'AR-23',
      Name: 'Liberator',
      RPM: 640,
      'Atk Type': 'Projectile',
      'Atk Name': '5.5x50mm FULL METAL JACKET_P',
      DMG: 90,
      DUR: 22,
      AP: 2,
      DF: 10,
      ST: 15,
      PF: 10
    }]
  );

  renderTable();

  const headerTexts = collectElements(thead, (element) => element.tagName === 'TH')
    .map((element) => element.textContent);
  const dataRows = collectElements(tbody, (element) => element.tagName === 'TR');
  const ratioCell = dataRows[0]?.children[headerTexts.indexOf(DURABLE_RATIO_HEADER)];

  assert.ok(headerTexts.includes(DURABLE_RATIO_HEADER));
  assert.equal(headerTexts[headerTexts.indexOf('DUR') + 1], DURABLE_RATIO_HEADER);
  assert.equal(ratioCell?.textContent, '24.4% (1/4)');
  assert.match(ratioCell?.title || '', /24\.4% of standard damage/i);
  assert.match(ratioCell?.title || '', /22 \/ 90/i);
  assert.match(ratioCell?.title || '', /1\/4 durable/i);
}));

test('renderTable sorts by the durable ratio column', () => withTableFixture(({ tbody }) => {
  ingestHeadersAndRows(
    ['Type', 'Sub', 'Code', 'Name', 'RPM', 'Atk Type', 'Atk Name', 'DMG', 'DUR', 'AP', 'DF', 'ST', 'PF'],
    [
      {
        Type: 'Primary',
        Sub: 'AR',
        Code: 'AR-23',
        Name: 'Liberator',
        RPM: 640,
        'Atk Type': 'Projectile',
        'Atk Name': 'Liberator Burst',
        DMG: 90,
        DUR: 22,
        AP: 2,
        DF: 10,
        ST: 15,
        PF: 10
      },
      {
        Type: 'Support',
        Sub: 'MG',
        Code: 'MG-43',
        Name: 'Machine Gun',
        RPM: 760,
        'Atk Type': 'Projectile',
        'Atk Name': 'Machine Gun Burst',
        DMG: 80,
        DUR: 40,
        AP: 3,
        DF: 10,
        ST: 20,
        PF: 12
      }
    ]
  );
  state.sortKey = DURABLE_RATIO_HEADER;
  state.sortDir = 'desc';

  renderTable();

  const dataRows = collectElements(tbody, (element) => element.tagName === 'TR');
  assert.equal(dataRows[0]?.children[4]?.textContent, 'Machine Gun');
  assert.equal(dataRows[1]?.children[4]?.textContent, 'Liberator');
}));

test('renderTable sorts mixed durable ratio weapons by projectile rows before explosive companions', () => withTableFixture(({ tbody }) => {
  ingestHeadersAndRows(
    ['Type', 'Sub', 'Code', 'Name', 'RPM', 'Atk Type', 'Atk Name', 'DMG', 'DUR', 'AP', 'DF', 'ST', 'PF'],
    [
      {
        Type: 'Primary',
        Sub: 'PLS',
        Code: 'PL-1',
        Name: 'Hybrid Plasma',
        RPM: 120,
        'Atk Type': 'Projectile',
        'Atk Name': 'Hybrid Bolt_P',
        DMG: 100,
        DUR: 25,
        AP: 2,
        DF: 10,
        ST: 15,
        PF: 10
      },
      {
        Type: 'Primary',
        Sub: 'PLS',
        Code: 'PL-1',
        Name: 'Hybrid Plasma',
        RPM: 120,
        'Atk Type': 'Explosion',
        'Atk Name': 'Hybrid Bolt_P_IE',
        DMG: 100,
        DUR: 100,
        AP: 3,
        DF: 20,
        ST: 20,
        PF: 10
      },
      {
        Type: 'Support',
        Sub: 'MG',
        Code: 'MG-43',
        Name: 'Machine Gun',
        RPM: 760,
        'Atk Type': 'Projectile',
        'Atk Name': 'Machine Gun Burst',
        DMG: 80,
        DUR: 40,
        AP: 3,
        DF: 10,
        ST: 20,
        PF: 12
      },
      {
        Type: 'Primary',
        Sub: 'PLS',
        Code: 'PL-2',
        Name: 'Pure Plasma',
        RPM: 80,
        'Atk Type': 'Explosion',
        'Atk Name': 'Pure Plasma Burst',
        DMG: 120,
        DUR: 120,
        AP: 3,
        DF: 20,
        ST: 20,
        PF: 12
      }
    ]
  );
  state.sortKey = DURABLE_RATIO_HEADER;
  state.sortDir = 'desc';

  renderTable();

  const dataRows = collectElements(tbody, (element) => element.tagName === 'TR');
  const weaponNames = dataRows
    .map((row) => row.children[4]?.textContent || '')
    .filter(Boolean);

  assert.deepEqual(weaponNames, ['Pure Plasma', 'Machine Gun', 'Hybrid Plasma']);
}));

test('renderTable treats zero-damage projectile companions as pure explosive for durable ratio sorting', () => withTableFixture(({ tbody }) => {
  ingestHeadersAndRows(
    ['Type', 'Sub', 'Code', 'Name', 'RPM', 'Atk Type', 'Atk Name', 'DMG', 'DUR', 'AP', 'DF', 'ST', 'PF'],
    [
      {
        Type: 'Primary',
        Sub: 'PLS',
        Code: 'SG-8P',
        Name: 'Punisher Plasma',
        RPM: 80,
        'Atk Type': 'Projectile',
        'Atk Name': 'Plasma Ball_P',
        DMG: 0,
        DUR: 0,
        AP: 2,
        DF: 10,
        ST: 15,
        PF: 10
      },
      {
        Type: 'Primary',
        Sub: 'PLS',
        Code: 'SG-8P',
        Name: 'Punisher Plasma',
        RPM: 80,
        'Atk Type': 'Explosion',
        'Atk Name': 'Plasma Ball_P_IE',
        DMG: 100,
        DUR: 100,
        AP: 3,
        DF: 20,
        ST: 20,
        PF: 10
      },
      {
        Type: 'Support',
        Sub: 'MG',
        Code: 'MG-43',
        Name: 'Machine Gun',
        RPM: 760,
        'Atk Type': 'Projectile',
        'Atk Name': 'Machine Gun Burst',
        DMG: 80,
        DUR: 40,
        AP: 3,
        DF: 10,
        ST: 20,
        PF: 12
      },
      {
        Type: 'Primary',
        Sub: 'AR',
        Code: 'AR-23',
        Name: 'Liberator',
        RPM: 640,
        'Atk Type': 'Projectile',
        'Atk Name': 'Liberator Burst',
        DMG: 90,
        DUR: 22,
        AP: 2,
        DF: 10,
        ST: 15,
        PF: 10
      }
    ]
  );
  state.sortKey = DURABLE_RATIO_HEADER;
  state.sortDir = 'desc';

  renderTable();

  const dataRows = collectElements(tbody, (element) => element.tagName === 'TR');
  const weaponNames = dataRows
    .map((row) => row.children[4]?.textContent || '')
    .filter(Boolean);

  assert.deepEqual(weaponNames, ['Punisher Plasma', 'Machine Gun', 'Liberator']);
}));
