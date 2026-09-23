import type {
  GroupSettings,
  HandicapStatus,
  Results,
  Round,
  RoundResult,
  SeasonStanding,
} from "@/types";
import {
  DEFAULT_HANDICAP_WINDOW,
  DEFAULT_HANDICAP_BEST_X,
  calculateHandicapTransition as calculateHandicapTransitionCore,
  calculateInitialHandicap as calculateInitialHandicapCore,
  calculateNextHandicap as calculateNextHandicapCore,
  getRecentStablefordAverage as getRecentStablefordAverageCore,
  calculateScoreDifferential,
} from "./handicapEngine.ts";
import { normaliseGroupSettings } from "./settings.ts";
export { DEFAULT_HANDICAP_WINDOW };
export { getPublishHandicapTransition } from "./handicapEngine.ts";
export type { HandicapTransition } from "./handicapEngine.ts";

export const getSeasonStandingId = (
  groupId: string,
  season: number,
  memberId: string
) => `${groupId}_${season}_${memberId}`;

// ─── Side prize winners ─────────────────────────────────────────────────────
//
// `ntp` is a list and `ld`/`t2`/`t3` are single objects, but older records
// predate that split and a hand-edited one can be any shape at all. Reading
// them through here means a legacy document cannot stop a season aggregating
// with "forEach is not a function", and gives the publish guard one place to
// find every winner id that is about to become a document path.

export type SidePrizeKey = "ntp" | "ld" | "t2" | "t3";

export type SidePrizeWinner = {
  prize: SidePrizeKey;
  /** Unknown on purpose: validating it is the caller's job. */
  winnerId: unknown;
  winnerName: string | null;
  /** Null when the record does not say which hole. */
  holeNumber: number | null;
};

const SIDE_PRIZE_KEYS: SidePrizeKey[] = ["ntp", "ld", "t2", "t3"];

/**
 * At least one old results record stores each winner id wrapped in a list —
 * ["d4vz…"] rather than "d4vz…". A single wrapped id is not ambiguous, so it
 * is unwrapped and the win is credited to that player.
 *
 * Anything else is handed back untouched for the caller to reject: an empty
 * list names nobody, and a list of two would mean choosing which of them won.
 */
function unwrapWinnerId(value: unknown): unknown {
  return Array.isArray(value) && value.length === 1 ? value[0] : value;
}

function asRecords(value: unknown): Record<string, unknown>[] {
  const entries = Array.isArray(value) ? value : [value];
  return entries.filter(
    (entry): entry is Record<string, unknown> =>
      typeof entry === "object" && entry !== null
  );
}

export function collectSidePrizeWinners(sideResults: unknown): SidePrizeWinner[] {
  if (typeof sideResults !== "object" || sideResults === null) return [];
  const source = sideResults as Record<string, unknown>;

  return SIDE_PRIZE_KEYS.flatMap((prize) =>
    asRecords(source[prize])
      // No winner is the normal case for a prize nobody won, not a problem.
      .filter((entry) => entry.winnerId != null)
      .map((entry) => ({
        prize,
        winnerId: unwrapWinnerId(entry.winnerId),
        winnerName:
          typeof entry.winnerName === "string" ? entry.winnerName : null,
        holeNumber:
          typeof entry.holeNumber === "number" ? entry.holeNumber : null,
      }))
  );
}

type BuildSeasonStandingsInput = {
  groupId: string;
  season: number;
  results: Results[];
  roundsById: Map<string, Round>;
  previousStandings: SeasonStanding[];
  updatedAt: Date;
  settings?: GroupSettings;
};

type StandingAccumulator = Omit<
  SeasonStanding,
  "id" | "currentRank" | "previousRank" | "updatedAt"
> & {
  totalStableford: number;
};

export function buildSeasonStandings({
  groupId,
  season,
  results,
  roundsById,
  previousStandings,
  updatedAt,
  settings,
}: BuildSeasonStandingsInput): SeasonStanding[] {
  const groupSettings = normaliseGroupSettings(settings);
  const previousRankByMember = new Map(
    previousStandings.map((standing) => [
      standing.memberId,
      standing.currentRank,
    ])
  );
  const accumulators = new Map<string, StandingAccumulator>();

  const getAccumulator = (memberId: string, memberName: string) => {
    const existing = accumulators.get(memberId);
    if (existing) return existing;

    const created: StandingAccumulator = {
      season,
      groupId,
      memberId,
      memberName,
      totalPoints: 0,
      grossSeasonPoints: 0,
      roundsPlayed: 0,
      roundResults: [],
      ntpWinsSeason: 0,
      ldWinsSeason: 0,
      t2WinsSeason: 0,
      t3WinsSeason: 0,
      totalStableford: 0,
    };

    accumulators.set(memberId, created);
    return created;
  };

  results.forEach((result) => {
    const round = roundsById.get(result.roundId);

    result.rankings.forEach((ranking) => {
      const standing = getAccumulator(ranking.playerId, ranking.playerName);
      standing.totalPoints += ranking.pointsAwarded;
      standing.grossSeasonPoints += ranking.pointsAwarded;
      standing.roundsPlayed += 1;
      standing.totalStableford += ranking.stablefordTotal;
      standing.roundResults.push({
        roundId: result.roundId,
        courseName: round?.courseName ?? "Round",
        date: round?.date ?? result.publishedAt,
        finish: ranking.rank,
        stableford: ranking.stablefordTotal,
        pointsAwarded: ranking.pointsAwarded,
        pointsEligible: ranking.pointsEligible ?? true,
        pointsIneligibleReason: ranking.pointsIneligibleReason ?? null,
        countsForSeason: true,
        grossTotal: ranking.grossTotal ?? null,
        differential: calculateScoreDifferential({
          gross: ranking.grossTotal,
          courseRating: ranking.courseRating ?? round?.courseRating ?? null,
          slopeRating: ranking.slopeRating ?? round?.slopeRating ?? null,
          coursePar: ranking.coursePar ?? round?.coursePar ?? null,
        }),
        // Probation rounds (no points) never feed the official best X of Y.
        countsForHandicap: ranking.pointsEligible !== false,
      });
    });

    collectSidePrizeWinners(result.sideResults).forEach(
      ({ prize, winnerId, winnerName }) => {
        // A winner id that is not a usable string cannot be credited to
        // anyone. Publishing refuses outright rather than write a ladder that
        // is quietly missing a win; the rebuild paths carry on without it.
        if (typeof winnerId !== "string" || winnerId.trim() === "") return;
        const standing = getAccumulator(winnerId, winnerName ?? "Player");
        if (prize === "ntp") standing.ntpWinsSeason += 1;
        else if (prize === "ld") standing.ldWinsSeason += 1;
        else if (prize === "t2") standing.t2WinsSeason += 1;
        else standing.t3WinsSeason += 1;
      }
    );
  });

  const standingsWithSeasonPoints = Array.from(accumulators.values()).map(
    applySeasonPointsRule(groupSettings)
  );

  const sorted = standingsWithSeasonPoints.sort((a, b) => {
    if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
    if (b.totalStableford !== a.totalStableford) {
      return b.totalStableford - a.totalStableford;
    }
    return a.memberName.localeCompare(b.memberName);
  });

  let previousPoints: number | null = null;
  let previousRank = 0;

  return sorted.map((standing, index) => {
    const currentRank =
      previousPoints === standing.totalPoints ? previousRank : index + 1;

    previousPoints = standing.totalPoints;
    previousRank = currentRank;

    return {
      id: getSeasonStandingId(groupId, season, standing.memberId),
      season: standing.season,
      groupId: standing.groupId,
      memberId: standing.memberId,
      memberName: standing.memberName,
      totalPoints: standing.totalPoints,
      grossSeasonPoints: standing.grossSeasonPoints,
      roundsPlayed: standing.roundsPlayed,
      currentRank,
      previousRank: previousRankByMember.get(standing.memberId) ?? null,
      roundResults: standing.roundResults
        .slice()
        .sort((a, b) => b.date.getTime() - a.date.getTime()),
      ntpWinsSeason: standing.ntpWinsSeason,
      ldWinsSeason: standing.ldWinsSeason,
      t2WinsSeason: standing.t2WinsSeason,
      t3WinsSeason: standing.t3WinsSeason,
      updatedAt,
    };
  });
}

function applySeasonPointsRule(settings: GroupSettings) {
  return (standing: StandingAccumulator): StandingAccumulator => {
    if (!settings.bestXofY.enabled || settings.bestXofY.bestX <= 0) {
      return standing;
    }

    const countedRoundIds = new Set(
      standing.roundResults
        .slice()
        .sort((a, b) => {
          if (b.pointsAwarded !== a.pointsAwarded) {
            return b.pointsAwarded - a.pointsAwarded;
          }
          if (b.stableford !== a.stableford) return b.stableford - a.stableford;
          return b.date.getTime() - a.date.getTime();
        })
        .slice(0, settings.bestXofY.bestX)
        .map((roundResult) => roundResult.roundId)
    );

    const roundResults = standing.roundResults.map((roundResult) => ({
      ...roundResult,
      countsForSeason: countedRoundIds.has(roundResult.roundId),
    }));

    return {
      ...standing,
      totalPoints: roundResults.reduce(
        (sum, roundResult) =>
          roundResult.countsForSeason
            ? sum + roundResult.pointsAwarded
            : sum,
        0
      ),
      roundResults,
    };
  };
}

export function getAverageStableford(roundResults: RoundResult[]) {
  const stablefordRounds = roundResults.filter(
    (roundResult) => roundResult.stableford > 0
  );
  if (stablefordRounds.length === 0) return null;

  const total = stablefordRounds.reduce(
    (sum, roundResult) => sum + roundResult.stableford,
    0
  );
  return Number((total / stablefordRounds.length).toFixed(1));
}

export function getBestStableford(roundResults: RoundResult[]) {
  const best = roundResults.reduce<RoundResult | null>((currentBest, result) => {
    if (result.stableford <= 0) return currentBest;
    if (!currentBest || result.stableford > currentBest.stableford) {
      return result;
    }
    return currentBest;
  }, null);

  return {
    bestStableford: best?.stableford ?? null,
    bestRoundId: best?.roundId ?? null,
  };
}

export function getRecentStablefordAverage(
  roundResults: RoundResult[],
  window = DEFAULT_HANDICAP_WINDOW
) {
  return getRecentStablefordAverageCore(roundResults, window);
}

export function calculateNextHandicap(
  currentHandicap: number,
  roundResults: RoundResult[],
  window = DEFAULT_HANDICAP_WINDOW,
  bestX = DEFAULT_HANDICAP_BEST_X
) {
  return calculateNextHandicapCore(currentHandicap, roundResults, window, bestX);
}

export function calculateInitialHandicap(
  roundResults: RoundResult[],
  window = DEFAULT_HANDICAP_WINDOW,
  bestX = DEFAULT_HANDICAP_BEST_X
) {
  return calculateInitialHandicapCore(roundResults, window, bestX);
}

export function calculateHandicapTransition({
  currentHandicap,
  handicapStatus,
  officialHandicapAssignedAt,
  roundResults,
  window = DEFAULT_HANDICAP_WINDOW,
  bestX = DEFAULT_HANDICAP_BEST_X,
  cardsToEstablish,
  effectiveAt,
}: {
  currentHandicap: number;
  handicapStatus: HandicapStatus;
  officialHandicapAssignedAt?: Date | null;
  roundResults: RoundResult[];
  window?: number;
  bestX?: number;
  cardsToEstablish?: number;
  effectiveAt: Date;
}) {
  return calculateHandicapTransitionCore({
    currentHandicap,
    handicapStatus,
    officialHandicapAssignedAt,
    roundResults,
    window,
    bestX,
    cardsToEstablish,
    effectiveAt,
  });
}

export function inferHandicapStatus(
  currentHandicap: number | null | undefined,
  handicapStatus?: HandicapStatus
): HandicapStatus {
  if (handicapStatus === "official" || handicapStatus === "provisional") {
    return handicapStatus;
  }

  return (currentHandicap ?? 0) > 0 ? "official" : "provisional";
}
