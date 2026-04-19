// Side-effect module: installs a functional localStorage stub on globalThis
// when running under Node.js (which has no built-in localStorage).
// Import this module before any app module that may read localStorage at
// load time (e.g. weapons/data.js which restores pinned weapons on init).

if (!globalThis.localStorage) {
  globalThis.localStorage = {
    _store: {},
    getItem(k) { return this._store[k] ?? null; },
    setItem(k, v) { this._store[k] = String(v); },
    removeItem(k) { delete this._store[k]; }
  };
}
