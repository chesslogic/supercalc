import test from 'node:test';
import assert from 'node:assert/strict';

import { getEnemyDropdownQueryState } from '../calculator/selector-utils.js';
import {
  applyExplosiveDisplayToCell,
  EXPLOSIVE_DISPLAY_COLUMN_LABEL,
  getExplosiveDisplayInfo
} from '../calculator/explosive-display.js';

test('enemy dropdown keeps real enemies visible when overview is the current compare selection', () => {
  const state = getEnemyDropdownQueryState('Overview', {
    mode: 'compare',
    compareView: 'overview'
  });

  assert.equal(state.effectiveQuery, '');
  assert.equal(state.showOverviewOption, true);
});

test('enemy dropdown still filters normally for typed overview searches outside the selected overview label', () => {
  const state = getEnemyDropdownQueryState('over', {
    mode: 'compare',
    compareView: 'focused'
  });

  assert.equal(state.effectiveQuery, 'over');
  assert.equal(state.showOverviewOption, true);
});

test('enemy dropdown does not offer overview in single mode', () => {
  const state = getEnemyDropdownQueryState('', {
    mode: 'single',
    compareView: 'focused'
  });

  assert.equal(state.effectiveQuery, '');
  assert.equal(state.showOverviewOption, false);
});

test('explosive display shows missing multipliers as zero reduction', () => {
  const info = getExplosiveDisplayInfo({
    zone_name: 'Main',
    ExTarget: 'Main'
  });

  assert.equal(EXPLOSIVE_DISPLAY_COLUMN_LABEL, 'ExDR');
  assert.equal(info.text, '0%');
  assert.equal(info.sortValue, 0);
  assert.equal(info.isImplicit, true);
  assert.equal(info.isRouted, false);
  assert.match(info.title, /implicit ExMult 1/i);
});

test('explosive display converts direct multipliers into user-facing reduction percentages', () => {
  const info = getExplosiveDisplayInfo({
    zone_name: 'armor',
    ExTarget: 'Part',
    ExMult: 0.45
  });

  assert.equal(info.text, '55%');
  assert.equal(info.sortValue, 0.55);
  assert.equal(info.isImplicit, false);
  assert.equal(info.isRouted, false);
  assert.match(info.title, /ExMult 0\.45/i);
});

test('explosive display flags special non-main zones that suppress part explosive damage', () => {
  const info = getExplosiveDisplayInfo({
    zone_name: 'left_arm',
    ExTarget: 'Main'
  });

  assert.equal(info.text, '100%*');
  assert.equal(info.sortValue, 1);
  assert.equal(info.isRouted, true);
  assert.match(info.title, /direct explosive part damage and explosive passthrough from this part are suppressed/i);
  assert.match(info.title, /one direct Main explosive check using Main defenses/i);
  assert.match(info.title, /asterisk marks current calculator handling/i);
});

test('explosive display applies routed markers without line-through styling', () => {
  const td = {
    textContent: '',
    title: '',
    style: {}
  };

  applyExplosiveDisplayToCell(td, {
    zone_name: 'left_arm',
    ExTarget: 'Main'
  });

  assert.equal(td.textContent, '100%*');
  assert.match(td.title, /current calculator handling/i);
  assert.notEqual(td.style.textDecoration, 'line-through');
  assert.equal(td.style.color, 'var(--muted)');
});
