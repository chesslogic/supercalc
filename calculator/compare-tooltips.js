import { formatTtkSeconds } from './summary.js';

const EPSILON = 1e-9;

function isFiniteNumber(value) {
  return Number.isFinite(value);
}

function areEqualNumbers(a, b) {
  return isFiniteNumber(a) && isFiniteNumber(b) && Math.abs(a - b) <= EPSILON;
}

function toFiniteNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function usesBeamCadence(slotMetrics) {
  return Boolean(slotMetrics?.usesBeamCadence);
}

function getBeamTicksPerSecond(slotMetrics) {
  const beamTicksPerSecond = toFiniteNumber(slotMetrics?.beamTicksPerSecond);
  return beamTicksPerSecond !== null && beamTicksPerSecond > 0
    ? beamTicksPerSecond
    : null;
}

function buildBeamCadenceNote(slotA, slotB) {
  const beamSlots = [
    ['A', slotA],
    ['B', slotB]
  ].filter(([, slotMetrics]) => usesBeamCadence(slotMetrics));
  if (beamSlots.length === 0) {
    return null;
  }

  const cadenceLabels = beamSlots.map(([slot, slotMetrics]) => {
    const beamTicksPerSecond = getBeamTicksPerSecond(slotMetrics);
    return beamTicksPerSecond === null
      ? `Weapon ${slot} beam cadence`
      : `Weapon ${slot}: ${beamTicksPerSecond} beam ticks/sec`;
  });

  return `Continuous beam rows use sustained contact (${cadenceLabels.join('; ')}), not trigger pulls or RPM gaps.`;
}

function getSlotLabel(slot, slotMetrics) {
  const weaponName = String(slotMetrics?.weapon?.name || '').trim();
  return weaponName
    ? `Weapon ${slot} (${weaponName})`
    : `Weapon ${slot}`;
}

function getShortSlotLabel(slot) {
  return `Weapon ${slot}`;
}

function getCompareWinner(slotA, slotB, winnerSlot) {
  return winnerSlot === 'B'
    ? {
      slot: 'B',
      label: getSlotLabel('B', slotB),
      shortLabel: getShortSlotLabel('B'),
      metrics: slotB
    }
    : {
      slot: 'A',
      label: getSlotLabel('A', slotA),
      shortLabel: getShortSlotLabel('A'),
      metrics: slotA
    };
}

function getCompareLoser(slotA, slotB, winnerSlot) {
  return winnerSlot === 'B'
    ? {
      slot: 'A',
      label: getSlotLabel('A', slotA),
      shortLabel: getShortSlotLabel('A'),
      metrics: slotA
    }
    : {
      slot: 'B',
      label: getSlotLabel('B', slotB),
      shortLabel: getShortSlotLabel('B'),
      metrics: slotB
    };
}

function buildWinnerReason(slotA, slotB, winnerSlot) {
  const winner = getCompareWinner(slotA, slotB, winnerSlot);
  const loser = getCompareLoser(slotA, slotB, winnerSlot);
  const winnerShots = toFiniteNumber(winner.metrics?.shotsToKill);
  const loserShots = toFiniteNumber(loser.metrics?.shotsToKill);
  const winnerUsesBeamCadence = usesBeamCadence(winner.metrics);
  const loserUsesBeamCadence = usesBeamCadence(loser.metrics);
  const winnerRpm = toFiniteNumber(winner.metrics?.weapon?.rpm);
  const loserRpm = toFiniteNumber(loser.metrics?.weapon?.rpm);

  const shotsComparable = winnerShots !== null && loserShots !== null;
  const rpmComparable = winnerRpm !== null && loserRpm !== null;
  const shotsEqual = shotsComparable && areEqualNumbers(winnerShots, loserShots);
  const rpmEqual = rpmComparable && areEqualNumbers(winnerRpm, loserRpm);
  const winnerHasFewerShots = shotsComparable && winnerShots < loserShots && !shotsEqual;
  const winnerHasHigherRpm = rpmComparable && winnerRpm > loserRpm && !rpmEqual;

  if (winnerUsesBeamCadence || loserUsesBeamCadence) {
    if (winnerUsesBeamCadence && loserUsesBeamCadence && shotsComparable && !shotsEqual) {
      return `${winner.shortLabel} needs fewer sustained-contact beam ticks (${winnerShots} vs ${loserShots}).`;
    }
    return null;
  }

  if (shotsComparable && shotsEqual && rpmComparable && !rpmEqual) {
    return `Equal shots to kill, but ${winner.shortLabel} has higher RPM (${winnerRpm} vs ${loserRpm}).`;
  }

  if (shotsComparable && !shotsEqual && rpmComparable && rpmEqual) {
    return `${winner.shortLabel} needs fewer shots to kill (${winnerShots} vs ${loserShots}).`;
  }

  if (shotsComparable && !shotsEqual && rpmComparable && !rpmEqual) {
    if (winnerHasFewerShots && winnerHasHigherRpm) {
      return `${winner.shortLabel} needs fewer shots to kill (${winnerShots} vs ${loserShots}) and has higher RPM (${winnerRpm} vs ${loserRpm}).`;
    }

    if (winnerHasFewerShots) {
      return `${winner.shortLabel} needs fewer shots to kill (${winnerShots} vs ${loserShots}), which outweighs ${loser.shortLabel}'s higher RPM (${loserRpm} vs ${winnerRpm}).`;
    }

    if (winnerHasHigherRpm) {
      return `${winner.shortLabel} has higher RPM (${winnerRpm} vs ${loserRpm}), which outweighs ${loser.shortLabel}'s lower shot count (${loserShots} vs ${winnerShots}).`;
    }
  }

  return null;
}

function buildEqualTtkReason(slotA, slotB) {
  const shotsA = toFiniteNumber(slotA?.shotsToKill);
  const shotsB = toFiniteNumber(slotB?.shotsToKill);
  const slotAUsesBeamCadence = usesBeamCadence(slotA);
  const slotBUsesBeamCadence = usesBeamCadence(slotB);
  const rpmA = toFiniteNumber(slotA?.weapon?.rpm);
  const rpmB = toFiniteNumber(slotB?.weapon?.rpm);

  const shotsComparable = shotsA !== null && shotsB !== null;
  const rpmComparable = rpmA !== null && rpmB !== null;

  if (slotAUsesBeamCadence || slotBUsesBeamCadence) {
    if (
      slotAUsesBeamCadence
      && slotBUsesBeamCadence
      && shotsComparable
      && areEqualNumbers(shotsA, shotsB)
    ) {
      return 'Equal sustained-contact beam ticks to kill.';
    }
    return null;
  }

  if (shotsComparable && areEqualNumbers(shotsA, shotsB) && rpmComparable && areEqualNumbers(rpmA, rpmB)) {
    return 'Equal shots to kill and equal RPM.';
  }

  if (shotsComparable && rpmComparable) {
    return 'Different shot counts and RPM cancel out to the same displayed TTK.';
  }

  return null;
}

export function buildCompareTtkTooltip(slotA, slotB) {
  const ttkA = toFiniteNumber(slotA?.ttkSeconds);
  const ttkB = toFiniteNumber(slotB?.ttkSeconds);
  const labelA = getSlotLabel('A', slotA);
  const labelB = getSlotLabel('B', slotB);
  const beamCadenceNote = buildBeamCadenceNote(slotA, slotB);

  if (ttkA === null && ttkB === null) {
    return null;
  }

  if (ttkA !== null && ttkB === null) {
    return [
      `${labelA} has a finite TTK with the current selection; ${labelB} does not.`,
      beamCadenceNote
    ].filter(Boolean).join('\n');
  }

  if (ttkA === null && ttkB !== null) {
    return [
      `${labelB} has a finite TTK with the current selection; ${labelA} does not.`,
      beamCadenceNote
    ].filter(Boolean).join('\n');
  }

  if (areEqualNumbers(ttkA, ttkB)) {
    const lines = [`${labelA} and ${labelB} have equal TTK (${formatTtkSeconds(ttkA)}).`];
    const reason = buildEqualTtkReason(slotA, slotB);
    if (reason) {
      lines.push(reason);
    }
    if (beamCadenceNote) {
      lines.push(beamCadenceNote);
    }
    return lines.join('\n');
  }

  const winnerSlot = ttkA < ttkB ? 'A' : 'B';
  const winner = getCompareWinner(slotA, slotB, winnerSlot);
  const loser = getCompareLoser(slotA, slotB, winnerSlot);
  const lines = [
    `${winner.label} has a shorter TTK (${formatTtkSeconds(winner.metrics?.ttkSeconds)} vs ${formatTtkSeconds(loser.metrics?.ttkSeconds)}).`
  ];
  const reason = buildWinnerReason(slotA, slotB, winnerSlot);
  if (reason) {
    lines.push(reason);
  }
  if (beamCadenceNote) {
    lines.push(beamCadenceNote);
  }
  return lines.join('\n');
}
