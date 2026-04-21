import {
  calculatorState,
  getSelectedExplosiveZoneIndices,
  setSelectedExplosiveZone,
  setSelectedZoneIndex
} from '../data.js';

export function appendEnemyProjectileCell(tr, enemyName, zoneIndex, enableRowClick = false, {
  onRefreshEnemyCalculationViews = null,
  checked = calculatorState.selectedZoneIndex === zoneIndex,
  controlName = `enemy-zone-${enemyName}`,
  controlId = `zone-${enemyName}-${zoneIndex}`,
  selectZoneIndex = zoneIndex,
  title = ''
} = {}) {
  const effectiveZoneIndex = Number.isInteger(selectZoneIndex) ? selectZoneIndex : zoneIndex;
  const radioTd = document.createElement('td');
  radioTd.style.padding = '4px 10px';
  radioTd.style.borderBottom = '1px solid var(--border)';
  radioTd.style.width = '30px';
  radioTd.style.textAlign = 'center';

  const radio = document.createElement('input');
  radio.type = 'radio';
  radio.name = controlName;
  radio.value = effectiveZoneIndex;
  radio.id = controlId;
  radio.checked = checked;
  radio.title = title;

  const selectProjectileZone = () => {
    setSelectedZoneIndex(effectiveZoneIndex);
    onRefreshEnemyCalculationViews?.();
  };

  radio.addEventListener('change', selectProjectileZone);

  if (enableRowClick) {
    tr.style.cursor = 'pointer';
    tr.addEventListener('click', (event) => {
      if (event.target !== radio) {
        radio.checked = true;
        selectProjectileZone();
      }
    });
  }

  radioTd.appendChild(radio);
  tr.appendChild(radioTd);
}

export function appendEnemyExplosionCell(tr, zoneIndex, enableRowClick = false, {
  onRefreshEnemyCalculationViews = null,
  variant = 'checkbox',
  checked = getSelectedExplosiveZoneIndices().includes(zoneIndex),
  title = '',
  buttonLabel = '',
  onActivate = null
} = {}) {
  const checkboxTd = document.createElement('td');
  checkboxTd.style.padding = '4px 10px';
  checkboxTd.style.borderBottom = '1px solid var(--border)';
  checkboxTd.style.width = '30px';
  checkboxTd.style.textAlign = 'center';

  if (variant === 'count') {
    const triggerActivate = () => {
      onActivate?.();
      onRefreshEnemyCalculationViews?.();
    };

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'zone-group-explosion-count';
    if (checked) {
      button.classList.add('is-active');
    }
    button.textContent = buttonLabel;
    button.title = title;
    button.addEventListener('click', (event) => {
      event?.stopPropagation?.();
      triggerActivate();
    });

    if (enableRowClick) {
      tr.style.cursor = 'pointer';
      tr.addEventListener('click', (event) => {
        if (event.target !== button) {
          triggerActivate();
        }
      });
    }

    checkboxTd.appendChild(button);
    tr.appendChild(checkboxTd);
    return;
  }

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.value = zoneIndex;
  checkbox.checked = checked;
  checkbox.title = title;
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
