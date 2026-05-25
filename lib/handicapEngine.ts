export const DEFAULT_HANDICAP_WINDOW = 6;
export const DEFAULT_HANDICAP_BEST_X = 6;

export type HandicapStatus = "official" | "provisional";

export type HandicapRound = {
  roundId: string;
  date: Date;
  stableford: number;
};

export type HandicapTransition = {
  nextHandicap: number;
  handicapStatus: HandicapStatus;
  officialHandicapAssignedAt: Date | null;
  reason: string;
  changeType: "movement" | "initial_allocation" | "provisional_update";
  qualifyingRoundCount: number;
  calculationRoundIds: string[];
  calculationWindow: number;
  usedAllAvailableRounds: boolean;
};

export function getRecentStablefordAverage(
  roundResults: HandicapRound[],
  window = DEFAULT_HANDICAP_WINDOW,
  bestX = DEFAULT_HANDICAP_BEST_X
) {
  const recent = getRecentStablefordRounds(roundResults, window);
  if (recent.length === 0) return null;
  const used = getBestRounds(recent, bestX);
  const total = used.reduce((sum, roundResult) => sum + roundResult.stableford, 0);
  return Number((total / used.length).toFixed(1));
}

export function calculateNextHandicap(
  currentHandicap: number,
  roundResults: HandicapRound[],
  window = DEFAULT_HANDICAP_WINDOW,
  bestX = DEFAULT_HANDICAP_BEST_X
) {
  const computation = getHandicapComputation(roundResults, window, bestX);
  if (!computation) {
    return {
      nextHandicap: currentHandicap,
      reason: "No qualifying Stableford rounds available yet.",
    };
  }

  return {
    nextHandicap: computation.nextHandicap,
    reason: computation.reason,
  };
}

export function calculateInitialHandicap(
  roundResults: HandicapRound[],
  window = DEFAULT_HANDICAP_WINDOW,
  bestX = DEFAULT_HANDICAP_BEST_X
) {
  const computation = getHandicapComputation(roundResults, window, bestX);
  if (!computation) {
    return null;
  }

  return {
    nextHandicap: computation.nextHandicap,
    reason: computation.reason,
  };
}

export function calculateHandicapTransition({
  currentHandicap,
  handicapStatus,
  officialHandicapAssignedAt,
  roundResults,
  window = DEFAULT_HANDICAP_WINDOW,
  bestX = DEFAULT_HANDICAP_BEST_X,
  effectiveAt,
}: {
  currentHandicap: number;
  handicapStatus: HandicapStatus;
  officialHandicapAssignedAt?: Date | null;
  roundResults: HandicapRound[];
  window?: number;
  bestX?: number;
  effectiveAt: Date;
}): HandicapTransition {
  const computation = getHandicapComputation(roundResults, window, bestX);

  if (!computation) {
    return {
      nextHandicap: currentHandicap,
      handicapStatus,
      officialHandicapAssignedAt:
        handicapStatus === "official" ? officialHandicapAssignedAt ?? null : null,
      reason: "No qualifying Stableford rounds available yet.",
      changeType:
        handicapStatus === "official" ? "movement" : "provisional_update",
      qualifyingRoundCount: 0,
      calculationRoundIds: [],
      calculationWindow: window,
      usedAllAvailableRounds: true,
    };
  }

  const nextHandicap = computation.nextHandicap;
  const reachesOfficialWindow = computation.qualifyingRoundCount >= window;
  const nextStatus =
    handicapStatus === "official" || reachesOfficialWindow
      ? "official"
      : "provisional";
  const changeType =
    handicapStatus !== "official" && nextStatus === "official"
      ? "initial_allocation"
      : handicapStatus === "official"
        ? "movement"
        : "provisional_update";

  return {
    nextHandicap,
    handicapStatus: nextStatus,
    officialHandicapAssignedAt:
      nextStatus === "official" ? officialHandicapAssignedAt ?? effectiveAt : null,
    reason: computation.reason,
    changeType,
    qualifyingRoundCount: computation.qualifyingRoundCount,
    calculationRoundIds: computation.calculationRoundIds,
    calculationWindow: window,
    usedAllAvailableRounds: computation.usedAllAvailableRounds,
  };
}

function getRecentStablefordRounds(
  roundResults: HandicapRound[],
  window: number
) {
  return roundResults
    .filter((roundResult) => roundResult.stableford > 0)
    .slice()
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .slice(0, window);
}

function getBestRounds(rounds: HandicapRound[], bestX: number) {
  return rounds
    .slice()
    .sort((a, b) => b.stableford - a.stableford)
    .slice(0, bestX);
}

function getHandicapComputation(
  roundResults: HandicapRound[],
  window: number,
  bestX: number
) {
  const qualifyingRounds = roundResults
    .filter((roundResult) => roundResult.stableford > 0)
    .slice()
    .sort((a, b) => b.date.getTime() - a.date.getTime());
  const windowRounds = qualifyingRounds.slice(0, window);
  const effectiveBestX = Math.min(bestX, windowRounds.length);
  const roundsUsed = getBestRounds(windowRounds, effectiveBestX);

  if (roundsUsed.length === 0) return null;

  const total = roundsUsed.reduce((sum, roundResult) => sum + roundResult.stableford, 0);
  const nextHandicap = Number((total / roundsUsed.length).toFixed(1));
  const usedAllAvailableRounds = qualifyingRounds.length <= window;
  const usingBestX = bestX < windowRounds.length;
  const roundLabel = roundsUsed.length === 1 ? "qualifying round" : "qualifying rounds";
  const reason = usingBestX
    ? `Average Stableford from the best ${roundsUsed.length} of ${windowRounds.length} qualifying rounds is ${nextHandicap}.`
    : usedAllAvailableRounds
    ? `Average Stableford from all ${roundsUsed.length} ${roundLabel} is ${nextHandicap}.`
    : `Average Stableford from the last ${roundsUsed.length} of ${qualifyingRounds.length} qualifying rounds is ${nextHandicap}.`;

  return {
    nextHandicap,
    reason,
    qualifyingRoundCount: qualifyingRounds.length,
    calculationRoundIds: roundsUsed.map((roundResult) => roundResult.roundId),
    usedAllAvailableRounds,
  };
}
