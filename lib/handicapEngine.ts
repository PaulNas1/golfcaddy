export const DEFAULT_HANDICAP_WINDOW = 6;
export const DEFAULT_HANDICAP_BEST_X = 6;

// ── Official handicap movement ──────────────────────────────────────────────
//
// A Stableford score of 36 means "played exactly to handicap" — it is the
// target, not a handicap value. An *official* handicap must therefore move
// incrementally from its current value based on how far a player's recent
// average sits from 36, never be replaced by the raw average outright.
// (Provisional/initial-allocation handicaps are the one case where setting
// the value straight from the average is correct — there is no existing
// official number yet to adjust from.)
//
// These constants mirror common social-golf handicapping: cuts (playing
// better than your handicap) move faster and further than rises (playing
// worse), and both are capped per publish so no single round — or one bad
// stretch of qualifying rounds — can swing a handicap wildly.
const AVERAGE_STABLEFORD_TARGET = 36;
const HANDICAP_CUT_FACTOR = 0.2; // per point the average sits above 36
const HANDICAP_RISE_FACTOR = 0.2; // per point the average sits below 36
const MAX_HANDICAP_CUT_PER_PUBLISH = 3; // largest single-publish reduction
const MAX_HANDICAP_RISE_PER_PUBLISH = 1; // largest single-publish increase

function applyOfficialHandicapMovement(
  currentHandicap: number,
  averageStableford: number
): number {
  const deviation = AVERAGE_STABLEFORD_TARGET - averageStableford;
  const rawMovement =
    deviation < 0 ? deviation * HANDICAP_CUT_FACTOR : deviation * HANDICAP_RISE_FACTOR;
  const clampedMovement =
    rawMovement < 0
      ? Math.max(rawMovement, -MAX_HANDICAP_CUT_PER_PUBLISH)
      : Math.min(rawMovement, MAX_HANDICAP_RISE_PER_PUBLISH);

  return Math.max(0, Number((currentHandicap + clampedMovement).toFixed(1)));
}

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

  // Only an already-official handicap moves incrementally from its current
  // value. The first time a handicap goes official (initial_allocation) —
  // and every provisional update before that — there is no existing official
  // number to adjust from, so setting it straight from the qualifying-round
  // average is correct.
  const nextHandicap =
    changeType === "movement"
      ? applyOfficialHandicapMovement(currentHandicap, computation.nextHandicap)
      : computation.nextHandicap;

  const reason =
    changeType === "movement"
      ? `${computation.reason} Handicap moved from ${currentHandicap} to ${nextHandicap} (target average is 36).`
      : computation.reason;

  return {
    nextHandicap,
    handicapStatus: nextStatus,
    officialHandicapAssignedAt:
      nextStatus === "official" ? officialHandicapAssignedAt ?? effectiveAt : null,
    reason,
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
