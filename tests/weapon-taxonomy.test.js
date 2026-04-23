import test from 'node:test';
import assert from 'node:assert/strict';

const {
  getAvailableWeaponSubIds,
  getWeaponCompareSortFamilyId,
  getWeaponRecommendationFeatureGroupId,
  getWeaponRoleId,
  getWeaponRoleLabel,
  getWeaponSubLabel
} = await import('../weapons/weapon-taxonomy.js');

test('explicit role wins over legacy fallback overrides', () => {
  assert.equal(getWeaponRoleId({
    name: 'Machine Gun Sentry',
    code: 'A/MG-43',
    sub: 'EMP',
    role: 'ordnance'
  }), 'ordnance');
});

test('legacy fallback only covers the stable subtype-wide role groups', () => {
  assert.equal(getWeaponRoleId({ sub: 'GR' }), 'explosive');
  assert.equal(getWeaponRoleId({ sub: 'PDW' }), 'precision');
  assert.equal(getWeaponRoleId({ sub: 'NRG' }), null);
});

test('mixed NRG weapons rely on explicit CSV roles instead of subtype fallbacks', () => {
  assert.equal(getWeaponRoleId({ sub: 'NRG', role: 'explosive' }), 'explosive');
  assert.equal(getWeaponRoleId({ sub: 'NRG', role: 'shotgun' }), 'shotgun');
  assert.equal(getWeaponRoleId({ sub: 'NRG', role: 'energy' }), 'energy');
});

test('shared subtype taxonomy only surfaces curated player-facing subtype families', () => {
  assert.deepEqual(
    getAvailableWeaponSubIds([
      { sub: 'BCK' },
      { sub: 'AR' },
      { sub: 'RL' },
      { sub: 'CAN' }
    ], { visibility: 'shared' }),
    ['ar', 'rl']
  );
});

test('subtype labels stay stable for known ids and fall back to uppercase for unknown ids', () => {
  assert.equal(getWeaponSubLabel('ar'), 'AR');
  assert.equal(getWeaponSubLabel('lsr'), 'LSR');
});

test('recommendation feature groups only expose the currently grouped player-facing roles', () => {
  assert.equal(getWeaponRecommendationFeatureGroupId({ role: 'automatic' }), 'auto');
  assert.equal(getWeaponRecommendationFeatureGroupId({ role: 'explosive' }), 'explosive');
  assert.equal(getWeaponRecommendationFeatureGroupId({ role: 'special' }), 'special');
  assert.equal(getWeaponRecommendationFeatureGroupId({ role: 'ordnance' }), 'ordnance');
  assert.equal(getWeaponRecommendationFeatureGroupId({ role: 'shotgun' }), null);
  assert.equal(getWeaponRecommendationFeatureGroupId({ role: 'precision' }), null);
});

test('compare sort families only use the current cross-subtype role buckets', () => {
  assert.equal(getWeaponCompareSortFamilyId({ role: 'automatic' }), 'automatic');
  assert.equal(getWeaponCompareSortFamilyId({ role: 'precision' }), 'precision');
  assert.equal(getWeaponCompareSortFamilyId({ role: 'explosive' }), null);
  assert.equal(getWeaponCompareSortFamilyId({ role: 'shotgun' }), null);
});

test('role labels stay human-readable for known and future role ids', () => {
  assert.equal(getWeaponRoleLabel('automatic'), 'Automatic');
  assert.equal(getWeaponRoleLabel('energy'), 'Energy');
  assert.equal(getWeaponRoleLabel('support-hybrid'), 'Support Hybrid');
});
