// Local DOM stubs for calculator-recommendation-tooltips split suites.
//
// These intentionally use single-function listener storage
// (addEventListener calls listeners.set(type, fn)) so that tests can call
// element.listeners.get(type) directly and get back one function.  This
// differs from the array-based dispatch in tests/dom-stubs.js; do not merge
// until a unified listener API is agreed upon.

export class TestClassList {
  constructor(element) {
    this.element = element;
    this.tokens = new Set();
  }

  syncFromString(value) {
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

export class TestElement {
  constructor(tagName) {
    this.tagName = String(tagName || '').toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.textContent = '';
    this.title = '';
    this.id = '';
    this.type = '';
    this.min = '';
    this.max = '';
    this.step = '';
    this.value = '';
    this.htmlFor = '';
    this.dataset = {};
    this.listeners = new Map();
    this._className = '';
    this.classList = new TestClassList(this);
  }

  get className() {
    return this._className;
  }

  set className(value) {
    this._className = String(value || '');
    this.classList.syncFromString(this._className);
  }

  appendChild(child) {
    if (!child) {
      return child;
    }
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  // Single-function storage: tests call element.listeners.get(type) and
  // invoke the returned function directly (not via an array dispatch loop).
  addEventListener(type, handler) {
    this.listeners.set(type, handler);
  }

  get childElementCount() {
    return this.children.length;
  }
}

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
}

export class TestDocument {
  createElement(tagName) {
    return new TestElement(tagName);
  }

  getElementById() {
    return null;
  }
}

export class BrowserLikeTestDocument extends TestDocument {
  createElement(tagName) {
    return new BrowserLikeTestElement(tagName);
  }
}

// Depth-first element collector with a JS predicate.  Handles both
// plain-Array and BrowserLikeChildCollection children.
export function collectElements(root, predicate, results = []) {
  if (!root) {
    return results;
  }
  if (predicate(root)) {
    results.push(root);
  }
  (root.children || []).forEach((child) => collectElements(child, predicate, results));
  return results;
}

// Finds the first chip-row element whose first child text matches `label`.
export function getChipRowByLabel(container, label) {
  return collectElements(container, (element) => (
    element.classList.contains('chiprow')
    && element.children[0]?.textContent === label
  ))[0] || null;
}

// Finds the first recommendation-section element whose first child text
// matches `titleText`.
export function getRecommendationSection(container, titleText) {
  return collectElements(container, (element) => (
    element.classList.contains('calc-recommend-section')
    && element.children[0]?.textContent === titleText
  ))[0] || null;
}
