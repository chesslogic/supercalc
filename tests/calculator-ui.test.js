import test from 'node:test';
import assert from 'node:assert/strict';

import { getEnemyDropdownQueryState } from '../calculator/selector-utils.js';
import {
  applyExplosiveDisplayToCell,
  EXPLOSIVE_DISPLAY_COLUMN_LABEL,
  getExplosiveDisplayInfo
} from '../calculator/explosive-display.js';
import { buildCompareTtkTooltip } from '../calculator/compare-tooltips.js';

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

test('compare TTK tooltip identifies the faster weapon when shots are equal but RPM differs', () => {
  const tooltip = buildCompareTtkTooltip(
    {
      weapon: { name: 'Tenderizer', rpm: 600 },
      shotsToKill: 5,
      ttkSeconds: 0.4
    },
    {
      weapon: { name: 'Liberator Carbine', rpm: 920 },
      shotsToKill: 5,
      ttkSeconds: 0.2608695652173913
    }
  );

  assert.match(tooltip, /Weapon B \(Liberator Carbine\) has a shorter TTK/i);
  assert.match(tooltip, /Equal shots to kill, but Weapon B has higher RPM \(920 vs 600\)\./i);
});

test('compare TTK tooltip explains when lower shots beat higher RPM', () => {
  const tooltip = buildCompareTtkTooltip(
    {
      weapon: { name: 'Weapon A', rpm: 900 },
      shotsToKill: 5,
      ttkSeconds: 0.26666666666666666
    },
    {
      weapon: { name: 'Weapon B', rpm: 600 },
      shotsToKill: 4,
      ttkSeconds: 0.3
    }
  );

  assert.match(tooltip, /Weapon A \(Weapon A\) has a shorter TTK/i);
  assert.match(tooltip, /Weapon A has higher RPM \(900 vs 600\), which outweighs Weapon B's lower shot count \(4 vs 5\)\./i);
});
