import { getEnemyTacticalInfoChips, getEnemyWeakspotBundles } from '../tactical-data.js';

export function renderTacticalGuidePanel(container, enemy) {
  const chips = getEnemyTacticalInfoChips(enemy);
  if (chips.length === 0) {
    return;
  }

  const panel = document.createElement('section');
  panel.className = 'calc-compare-panel calc-info-panel';

  const heading = document.createElement('div');
  heading.className = 'calc-compare-heading';

  const title = document.createElement('div');
  title.className = 'calc-compare-title';
  title.textContent = `${enemy.name} tactical notes`;
  heading.appendChild(title);
  panel.appendChild(heading);

  const body = document.createElement('div');
  body.className = 'calc-compare-body';

  const grid = document.createElement('div');
  grid.className = 'calc-info-grid';
  chips.forEach((chip) => {
    const card = document.createElement('div');
    card.className = 'calc-info-card';

    const label = document.createElement('div');
    label.className = 'calc-info-card-label';
    label.textContent = chip.label;
    card.appendChild(label);

    const value = document.createElement('div');
    value.className = 'calc-info-card-value';
    value.textContent = chip.value;
    card.appendChild(value);

    const description = document.createElement('div');
    description.className = 'calc-info-card-description';
    description.textContent = chip.description;
    card.appendChild(description);

    grid.appendChild(card);
  });

  body.appendChild(grid);
  panel.appendChild(body);
  container.appendChild(panel);
}

export function renderWeakspotBundlesPanel(container, enemy) {
  const bundles = getEnemyWeakspotBundles(enemy);
  if (bundles.length === 0) {
    return;
  }

  const panel = document.createElement('section');
  panel.className = 'calc-compare-panel calc-bundle-panel';

  const heading = document.createElement('div');
  heading.className = 'calc-compare-heading';

  const title = document.createElement('div');
  title.className = 'calc-compare-title';
  title.textContent = `${enemy.name} curated weakspots`;
  heading.appendChild(title);
  panel.appendChild(heading);

  const body = document.createElement('div');
  body.className = 'calc-compare-body';

  const bundleList = document.createElement('div');
  bundleList.className = 'calc-bundle-list';

  bundles.forEach((bundle) => {
    const bundleCard = document.createElement('section');
    bundleCard.className = 'calc-bundle-card';

    const bundleTitle = document.createElement('div');
    bundleTitle.className = 'calc-bundle-title';
    bundleTitle.textContent = bundle.label;
    bundleCard.appendChild(bundleTitle);

    if (bundle.description) {
      const bundleDescription = document.createElement('div');
      bundleDescription.className = 'calc-bundle-description';
      bundleDescription.textContent = bundle.description;
      bundleCard.appendChild(bundleDescription);
    }

    const entries = document.createElement('div');
    entries.className = 'calc-bundle-entries';

    (bundle.entries || []).forEach((entry) => {
      const entryCard = document.createElement('div');
      entryCard.className = 'calc-bundle-entry';

      const entryTitle = document.createElement('div');
      entryTitle.className = 'calc-bundle-entry-title';
      entryTitle.textContent = entry.label;
      entryCard.appendChild(entryTitle);

      if (entry.sourceLabel) {
        const entrySource = document.createElement('div');
        entrySource.className = 'calc-bundle-entry-source';
        entrySource.textContent = entry.sourceLabel;
        entryCard.appendChild(entrySource);
      }

      if (entry.description) {
        const entryDescription = document.createElement('div');
        entryDescription.className = 'calc-bundle-entry-description';
        entryDescription.textContent = entry.description;
        entryCard.appendChild(entryDescription);
      }

      entries.appendChild(entryCard);
    });

    bundleCard.appendChild(entries);
    bundleList.appendChild(bundleCard);
  });

  body.appendChild(bundleList);
  panel.appendChild(body);
  container.appendChild(panel);
}
