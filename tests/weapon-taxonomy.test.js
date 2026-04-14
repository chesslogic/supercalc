import test from 'node:test';
import assert from 'node:assert/strict';

const {
  getWeaponCompareSortFamilyId,
  getWeaponRecommendationFeatureGroupId,
  getWeaponRoleId,
  getWeaponRoleLabel
} = await import('../weapons/weapon-taxonomy.js');

test('explicit role wins over legacy fallback overrides', () => {
  assert.equal(getWeaponRoleId({
    name: 'Machine Gun Sentry',
    code: 'A/MG-43',
    sub: 'EMP',
    role: 'ordnance'
  }), 'ordnance');
});

test('legacy fallback keeps current automatic and explosive outliers stable without a role column', () => {
  assert.equal(getWeaponRoleId({ name: 'Sickle', code: 'LAS-16', sub: 'NRG' }), 'automatic');
  assert.equal(getWeaponRoleId({ name: 'Machine Gun Sentry', code: 'A/MG-43', sub: 'EMP' }), 'automatic');
  assert.equal(getWeaponRoleId({ name: 'Punisher Plasma', code: 'SG-8P', sub: 'NRG' }), 'explosive');
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
