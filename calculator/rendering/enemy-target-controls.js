import {
  calculatorState,
  getSelectedExplosiveZoneIndices,
  setSelectedExplosiveZone,
  setSelectedZoneIndex
} from '../data.js';

export function appendEnemyProjectileCell(tr, enemyName, zoneIndex, enableRowClick = false, {
  onRefreshEnemyCalculationViews = null
} = {}) {
  const radioTd = document.createElement('td');
  radioTd.style.padding = '4px 10px';
  radioTd.style.borderBottom = '1px solid var(--border)';
  radioTd.style.width = '30px';
  radioTd.style.textAlign = 'center';

  const radio = document.createElement('input');
  radio.type = 'radio';
  radio.name = `enemy-zone-${enemyName}`;
  radio.value = zoneIndex;
  radio.id = `zone-${enemyName}-${zoneIndex}`;
  radio.checked = calculatorState.selectedZoneIndex === zoneIndex;
  radio.addEventListener('change', () => {
    setSelectedZoneIndex(zoneIndex);
    onRefreshEnemyCalculationViews?.();
  });

  if (enableRowClick) {
    tr.style.cursor = 'pointer';
    tr.addEventListener('click', (event) => {
      if (event.target !== radio) {
        radio.checked = true;
        setSelectedZoneIndex(zoneIndex);
        onRefreshEnemyCalculationViews?.();
      }
    });
  }

  radioTd.appendChild(radio);
  tr.appendChild(radioTd);
}

export function appendEnemyExplosionCell(tr, zoneIndex, enableRowClick = false, {
  onRefreshEnemyCalculationViews = null
} = {}) {
  const checkboxTd = document.createElement('td');
  checkboxTd.style.padding = '4px 10px';
  checkboxTd.style.borderBottom = '1px solid var(--border)';
  checkboxTd.style.width = '30px';
  checkboxTd.style.textAlign = 'center';

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.value = zoneIndex;
  checkbox.checked = getSelectedExplosiveZoneIndices().includes(zoneIndex);
  checkbox.addEventListener('change', () => {
    setSelectedExplosiveZone(zoneIndex, checkbox.checked);
    onRefreshEnemyCalculationViews?.();
  });

  if (enableRowClick) {
    tr.style.cursor = 'pointer';
    tr.addEventListener('click', (event) => {
      if (event.target !== checkbox) {
        checkbox.checked = !checkbox.checked;
        setSelectedExplosiveZone(zoneIndex, checkbox.checked);
        onRefreshEnemyCalculationViews?.();
      }
    });
  }

  checkboxTd.appendChild(checkbox);
  tr.appendChild(checkboxTd);
}
