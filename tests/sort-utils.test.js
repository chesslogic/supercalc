import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildSortModeLookup,
  compareByComparators,
  compareNullableValues,
  getNextSortState,
  markGroupStarts,
  normalizeSortDirection,
  normalizeSortModeId
} from '../sort-utils.js';

test('normalizeSortDirection only accepts asc and desc', () => {
  assert.equal(normalizeSortDirection(), 'asc');
  assert.equal(normalizeSortDirection('desc'), 'desc');
  assert.equal(normalizeSortDirection('DESC'), 'desc');
  assert.equal(normalizeSortDirection('sideways'), 'asc');
});

test('getNextSortState flips direction for the same key and resets on a new key', () => {
  assert.deepEqual(
    getNextSortState({
      currentKey: 'name',
      currentDir: 'asc',
      nextKey: 'name'
    }),
    { key: 'name', dir: 'desc' }
  );

  assert.deepEqual(
    getNextSortState({
      currentKey: 'name',
      currentDir: 'desc',
      nextKey: 'name'
    }),
    { key: 'name', dir: 'asc' }
  );

  assert.deepEqual(
    getNextSortState({
      currentKey: 'name',
      currentDir: 'desc',
      nextKey: 'damage'
    }),
    { key: 'damage', dir: 'asc' }
  );
});

test('compareNullableValues sorts missing values last and handles numeric direction', () => {
  assert.equal(compareNullableValues(2, 5, { numeric: true }), -3);
  assert.equal(compareNullableValues(2, 5, { numeric: true, direction: 'desc' }), 3);
  assert.equal(compareNullableValues(null, 5, { numeric: true }), 1);
  assert.equal(compareNullableValues(5, null, { numeric: true }), -1);
});

test('compareNullableValues can keep empty strings in normal string ordering when requested', () => {
  assert.equal(compareNullableValues('', 'Alpha', { emptyStringIsNull: false }) < 0, true);
  assert.equal(compareNullableValues('', 'Alpha') > 0, true);
});

test('compareByComparators returns the first non-zero comparison', () => {
  const rows = [
    { group: 1, name: 'Beta' },
    { group: 0, name: 'Gamma' },
    { group: 0, name: 'Alpha' }
  ];

  const sorted = [...rows].sort((left, right) => compareByComparators(left, right, [
    (currentLeft, currentRight) => currentLeft.group - currentRight.group,
    (currentLeft, currentRight) => compareNullableValues(currentLeft.name, currentRight.name)
  ]));

  assert.deepEqual(sorted.map((row) => row.name), ['Alpha', 'Gamma', 'Beta']);
});

test('normalizeSortModeId honors aliases and availability filters', () => {
  const definitions = [
    { id: 'grouped', label: 'Grouped' },
    { id: 'match-reference', label: 'Match', compareOnly: true }
  ];
  const lookup = buildSortModeLookup(definitions, [
    ['match', 'match-reference']
  ]);

  assert.equal(
    normalizeSortModeId('match', {
      defaultMode: 'grouped',
      lookup,
      definitions,
      isAvailable: (definition) => !definition.compareOnly
    }),
    'grouped'
  );

  assert.equal(
    normalizeSortModeId('match', {
      defaultMode: 'grouped',
      lookup,
      definitions,
      isAvailable: () => true
    }),
    'match-reference'
  );
});

test('markGroupStarts flags only group boundaries after the first row', () => {
  const rows = markGroupStarts([
    { id: 'a', group: 'alpha' },
    { id: 'b', group: 'alpha' },
    { id: 'c', group: 'beta' }
  ], (row) => row.group);

  assert.deepEqual(rows.map((row) => row.groupStart), [false, false, true]);
});
