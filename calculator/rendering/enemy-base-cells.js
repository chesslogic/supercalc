import {
  armorValueColor,
  durPercentageColor
} from '../../colors.js';
import { applyExplosiveDisplayToCell } from '../explosive-display.js';
import {
  applyEnemyZoneConDisplayToCell,
  applyEnemyZoneHealthDisplayToCell
} from '../enemy-zone-display.js';

export function formatEnemyBaseCell(td, zone, header) {
  const value = zone?.[header];

  if (header === 'zone_name') {
    td.textContent = value || '';
    return;
  }

  if (header === 'health') {
    applyEnemyZoneHealthDisplayToCell(td, zone);
    return;
  }

  if (header === 'Con') {
    applyEnemyZoneConDisplayToCell(td, zone);
    return;
  }

  if (header === 'Dur%') {
    const durability = value || 0;
    td.textContent = `${(durability * 100).toFixed(0)}%`;
    td.style.color = durPercentageColor(durability);
    return;
  }

  if (header === 'AV') {
    td.textContent = value || 0;
    td.style.color = armorValueColor(value);
    return;
  }

  if (header === 'IsFatal') {
    td.textContent = value ? 'Yes' : 'No';
    if (value) {
      td.style.color = 'var(--red)';
    }
    return;
  }

  if (header === 'ExMult') {
    applyExplosiveDisplayToCell(td, zone);
    return;
  }

  if (header === 'ToMain%') {
    td.textContent = `${((value || 0) * 100).toFixed(0)}%`;
    return;
  }

  if (header === 'MainCap') {
    td.textContent = value ? 'Yes' : 'No';
    return;
  }

  td.textContent = value || '';
}

export function formatOverviewBaseCell(td, row, header) {
  if (header === 'faction') {
    td.textContent = row.faction || '';
    return;
  }

  if (header === 'enemy') {
    td.textContent = row.enemyName || '';
    return;
  }

  formatEnemyBaseCell(td, row.zone, header);
}
