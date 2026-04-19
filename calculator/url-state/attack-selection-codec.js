import {
  calculatorState,
  getSelectedAttackKeys,
  getSelectedAttacks,
  getWeaponForSlot
} from '../data.js';
import { isExplosiveAttack } from '../attack-types.js';
import { getAttackRowKey, getDefaultSelectedAttackKeys } from '../compare-utils.js';
import { isDeepEqual, normalizeArrayOfStrings } from './param-codecs.js';

function isIntegerLike(value) {
  if (typeof value === 'number') {
    return Number.isInteger(value);
  }

  if (typeof value !== 'string' || value.trim() === '') {
    return false;
  }

  return Number.isInteger(Number(value));
}

function getWeaponAttackRows(weapon) {
  return Array.isArray(weapon?.rows) ? weapon.rows : [];
}

function getAttackKeysForWeapon(weapon) {
  return getWeaponAttackRows(weapon).map((row) => getAttackRowKey(row));
}

function getSelectedAttackRowIndicesForWeapon(weapon, selectedAttackKeys = []) {
  if (!weapon) {
    return [];
  }

  const selectedKeySet = new Set(selectedAttackKeys);
  return getWeaponAttackRows(weapon).reduce((indices, row, rowIndex) => {
    if (selectedKeySet.has(getAttackRowKey(row))) {
      indices.push(rowIndex);
    }
    return indices;
  }, []);
}

export function normalizeAttackSelectionValue(value, weapon) {
  const rows = getWeaponAttackRows(weapon);
  if (rows.length === 0) {
    return [];
  }

  const entries = Array.isArray(value) ? value : [];
  if (entries.every((entry) => isIntegerLike(entry))) {
    return [...new Set(
      entries
        .map((entry) => Number(entry))
        .filter((rowIndex) => Number.isInteger(rowIndex) && rowIndex >= 0 && rowIndex < rows.length)
        .map((rowIndex) => getAttackRowKey(rows[rowIndex]))
    )];
  }

  const validAttackKeys = new Set(getAttackKeysForWeapon(weapon));
  return normalizeArrayOfStrings(entries).filter((attackKey) => validAttackKeys.has(attackKey));
}

export function normalizeAttackHitCountValue(value, weapon) {
  const rows = getWeaponAttackRows(weapon);
  if (!value || typeof value !== 'object' || Array.isArray(value) || rows.length === 0) {
    return {};
  }

  const validAttackKeys = new Set(getAttackKeysForWeapon(weapon));
  return Object.entries(value).reduce((hitCounts, [attackRef, hitCount]) => {
    const numericHitCount = Number(hitCount);
    if (!Number.isFinite(numericHitCount) || numericHitCount < 1) {
      return hitCounts;
    }

    let attackKey = '';
    if (isIntegerLike(attackRef)) {
      const rowIndex = Number(attackRef);
      attackKey = rowIndex >= 0 && rowIndex < rows.length
        ? getAttackRowKey(rows[rowIndex])
        : '';
    } else {
      const normalizedAttackKey = String(attackRef || '').trim();
      attackKey = validAttackKeys.has(normalizedAttackKey) ? normalizedAttackKey : '';
    }

    if (!attackKey) {
      return hitCounts;
    }

    hitCounts[attackKey] = Math.max(1, Math.round(numericHitCount));
    return hitCounts;
  }, {});
}

export function getEncodedSelectedAttackValue(slot) {
  const weapon = getWeaponForSlot(slot);
  const selectedAttackKeys = getSelectedAttackKeys(slot);
  if (!weapon) {
    return null;
  }

  const defaultAttackKeys = getDefaultSelectedAttackKeys(weapon);
  if (isDeepEqual(selectedAttackKeys, defaultAttackKeys)) {
    return null;
  }

  return getSelectedAttackRowIndicesForWeapon(weapon, selectedAttackKeys);
}

export function getEncodedAttackHitCountsValue(slot) {
  const weapon = getWeaponForSlot(slot);
  if (!weapon) {
    return null;
  }

  const selectedAttackKeys = getSelectedAttackKeys(slot);
  if (selectedAttackKeys.length === 0) {
    return null;
  }

  const selectedAttackIndices = getSelectedAttackRowIndicesForWeapon(weapon, selectedAttackKeys);
  const selectedAttackIndexByKey = new Map(
    selectedAttackIndices.map((rowIndex) => [getAttackRowKey(getWeaponAttackRows(weapon)[rowIndex]), rowIndex])
  );

  const hitCountState = calculatorState.attackHitCounts?.[slot] || {};
  const compactHitCounts = selectedAttackKeys.reduce((entries, attackKey) => {
    const hitCount = Number(hitCountState[attackKey]);
    const rowIndex = selectedAttackIndexByKey.get(attackKey);
    if (!Number.isFinite(hitCount) || hitCount <= 1 || !Number.isInteger(rowIndex)) {
      return entries;
    }

    entries[rowIndex] = Math.max(1, Math.round(hitCount));
    return entries;
  }, {});

  return Object.keys(compactHitCounts).length > 0 ? compactHitCounts : null;
}

export function hasSelectedExplosiveAttacks() {
  return ['A', 'B'].some((slot) =>
    getSelectedAttacks(slot).some((attack) => isExplosiveAttack(attack))
  );
}
