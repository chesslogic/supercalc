import { getZoneRelationContext } from '../../enemies/data.js';

function normalizeZoneRelationKey(value) {
  return String(value ?? '').trim().toLowerCase();
}

export function getZoneRelationHighlightKind(enemy, anchorZoneReference, candidateZoneReference) {
  const relationContext = getZoneRelationContext(enemy, anchorZoneReference);
  if (!relationContext) {
    return null;
  }

  const anchorZoneName = typeof anchorZoneReference === 'object'
    ? anchorZoneReference?.zone_name
    : anchorZoneReference;
  const candidateZoneName = typeof candidateZoneReference === 'object'
    ? candidateZoneReference?.zone_name
    : candidateZoneReference;
  const normalizedAnchorZoneName = normalizeZoneRelationKey(anchorZoneName);
  const normalizedCandidateZoneName = normalizeZoneRelationKey(candidateZoneName);
  if (!normalizedCandidateZoneName) {
    return null;
  }

  if (normalizedCandidateZoneName === normalizedAnchorZoneName) {
    return 'anchor';
  }

  if (relationContext.sameZoneNames.some((zoneName) => normalizeZoneRelationKey(zoneName) === normalizedCandidateZoneName)) {
    return 'group';
  }

  if (relationContext.mirrorZoneNames.some((zoneName) => normalizeZoneRelationKey(zoneName) === normalizedCandidateZoneName)) {
    return 'mirror';
  }

  return null;
}

function clearZoneRelationClasses(rowEntries, classPrefix) {
  rowEntries.forEach(({ tr }) => {
    tr.classList.remove(
      `${classPrefix}-anchor`,
      `${classPrefix}-group`,
      `${classPrefix}-mirror`
    );
  });
}

function applyZoneRelationClasses(rowEntries, enemy, anchorZoneReference, classPrefix) {
  clearZoneRelationClasses(rowEntries, classPrefix);
  if (!anchorZoneReference) {
    return;
  }

  rowEntries.forEach(({ tr, zone }) => {
    const highlightKind = getZoneRelationHighlightKind(enemy, anchorZoneReference, zone);
    if (!highlightKind) {
      return;
    }

    tr.classList.add(`${classPrefix}-${highlightKind}`);
  });
}

export function wireZoneRelationHighlights(rowEntries, enemy, selectedZoneReference = null) {
  if (!Array.isArray(rowEntries) || rowEntries.length === 0) {
    return;
  }

  applyZoneRelationClasses(rowEntries, enemy, selectedZoneReference, 'calc-zone-link-selected');

  rowEntries.forEach(({ tr, zone }) => {
    if (!getZoneRelationContext(enemy, zone)) {
      return;
    }

    tr.addEventListener('mouseenter', () => {
      applyZoneRelationClasses(rowEntries, enemy, zone, 'calc-zone-link-hover');
    });
    tr.addEventListener('mouseleave', () => {
      clearZoneRelationClasses(rowEntries, 'calc-zone-link-hover');
    });
  });
}
