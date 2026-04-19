// Minimal DOM stub classes shared across UI and table test suites.
// All classes are designed to be a compatible superset of the local variants
// previously duplicated across weapons-table, weapons-table-pinning,
// calculator-ui, and calculator-recommendation-tooltips test files.

export class TestClassList {
  constructor(element) {
    this.element = element;
    this.tokens = new Set();
  }

  // Both names are used in different suites; they are equivalent.
  setFromString(value) {
    this.tokens = new Set(String(value || '').split(/\s+/).filter(Boolean));
  }

  syncFromString(value) {
    this.setFromString(value);
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

  toggle(token, force) {
    const t = String(token || '').trim();
    if (!t) return false;
    if (force === true) { this.add(t); return true; }
    if (force === false) { this.remove(t); return false; }
    if (this.contains(t)) { this.remove(t); return false; }
    this.add(t);
    return true;
  }
}

export class TestElement {
  constructor(tagName, ownerDocument) {
    this.tagName = String(tagName || 'div').toUpperCase();
    this.ownerDocument = ownerDocument || null;
    this.children = [];
    this.parentNode = null;
    this.style = {};
    this.dataset = {};
    this.listeners = new Map();
    this.title = '';
    this.value = '';
    this.checked = false;
    this.disabled = false;
    this.type = '';
    this.name = '';
    this.id = '';
    this.min = '';
    this.max = '';
    this.step = '';
    this.htmlFor = '';
    this.href = '';
    this.target = '';
    this.rel = '';
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
    return `${this._textContent}${[...this.children].map((c) => c.textContent).join('')}`;
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

  get childElementCount() {
    return this.children.length;
  }

  appendChild(child) {
    if (!child) return child;
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  dispatch(type, event = {}) {
    const listeners = this.listeners.get(type) || [];
    listeners.forEach((listener) => listener({ target: this, currentTarget: this, ...event }));
  }

  querySelectorAll() {
    return [];
  }
}

export class TestDocument {
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

  querySelectorAll() {
    return [];
  }

  addEventListener() {}
}

// Browser-like variants that simulate index-accessible children collections.
// Used in calculator-recommendation-tooltips tests to verify that rendering
// code works correctly in environments where element.children behaves like
// an HTMLCollection (accessible by numeric index).

export class BrowserLikeChildCollection {
  constructor() {
    this._items = [];
  }

  push(child) {
    const index = this._items.length;
    this._items.push(child);
    this[index] = child;
    return this._items.length;
  }

  forEach(callback) {
    return this._items.forEach(callback);
  }

  item(index) {
    return this._items[index] || null;
  }

  get length() {
    return this._items.length;
  }

  [Symbol.iterator]() {
    return this._items[Symbol.iterator]();
  }
}

export class BrowserLikeTestElement extends TestElement {
  constructor(tagName) {
    super(tagName);
    this.children = new BrowserLikeChildCollection();
  }

  // Keep textContent as a plain string property so that setting it on leaf
  // elements does not accidentally clear the children collection of container
  // elements (production code only sets textContent OR appends children on
  // any given element, never both).
  get textContent() {
    return this._textContent;
  }

  set textContent(value) {
    this._textContent = String(value ?? '');
  }
}

export class BrowserLikeTestDocument extends TestDocument {
  createElement(tagName) {
    return new BrowserLikeTestElement(tagName);
  }
}

// Depth-first element collector, equivalent to querySelectorAll with a JS
// predicate.  Handles null/undefined roots and both plain-Array and
// BrowserLikeChildCollection children.
export function collectElements(root, predicate, matches = []) {
  if (!root) return matches;
  if (predicate(root)) matches.push(root);
  (root.children || []).forEach((child) => collectElements(child, predicate, matches));
  return matches;
}
