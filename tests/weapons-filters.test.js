import test from 'node:test';
import assert from 'node:assert/strict';
import './env-stubs.js';
import { TestDocument } from './dom-stubs.js';

const { state } = await import('../weapons/data.js');
const { buildRoleFilters, buildSubFilters } = await import('../weapons/filters.js');

function snapshotState() {
  return {
    groups: state.groups,
    filteredGroups: state.filteredGroups,
    filterActive: state.filterActive,
    searchQuery: state.searchQuery,
    activeTypes: [...state.activeTypes],
    activeSubs: [...state.activeSubs],
    activeRoles: [...state.activeRoles]
  };
}

function restoreState(snapshot) {
  state.groups = snapshot.groups;
  state.filteredGroups = snapshot.filteredGroups;
  state.filterActive = snapshot.filterActive;
  state.searchQuery = snapshot.searchQuery;
  state.activeTypes = [...snapshot.activeTypes];
  state.activeSubs = [...snapshot.activeSubs];
  state.activeRoles = [...snapshot.activeRoles];
}

function withWeaponFilterDom(callback) {
  const previousDocument = globalThis.document;
  const snapshot = snapshotState();
  const testDocument = new TestDocument();
  testDocument.registerElement('subFilters', 'div');
  testDocument.registerElement('roleFilters', 'div');
  globalThis.document = testDocument;
  state.groups = [];
  state.filteredGroups = [];
  state.filterActive = false;
  state.searchQuery = '';
  state.activeTypes = [];
  state.activeSubs = [];
  state.activeRoles = [];

  try {
    return callback(testDocument);
  } finally {
    globalThis.document = previousDocument;
    restoreState(snapshot);
  }
}

test('buildSubFilters appends only subtype chips into the weapons filter container', () => withWeaponFilterDom((document) => {
  state.groups = [
    { name: 'Liberator', sub: 'AR' },
    { name: 'Commando', sub: 'RL' }
  ];

  buildSubFilters();

  const container = document.getElementById('subFilters');
  const children = Array.from(container.children);
  assert.deepEqual(children.map((child) => child.textContent), ['AR', 'RL']);
  assert.ok(children.every((child) => child.classList.contains('chip')));
  assert.equal(children.some((child) => child.classList.contains('muted')), false);
}));

test('buildRoleFilters appends only role chips into the weapons filter container', () => withWeaponFilterDom((document) => {
  state.groups = [
    { name: 'Liberator', role: 'automatic' },
    { name: 'Diligence', role: 'precision' }
  ];

  buildRoleFilters();

  const container = document.getElementById('roleFilters');
  const children = Array.from(container.children);
  assert.deepEqual(children.map((child) => child.textContent), ['Automatic', 'Precision']);
  assert.ok(children.every((child) => child.classList.contains('chip')));
  assert.equal(children.some((child) => child.classList.contains('muted')), false);
}));
