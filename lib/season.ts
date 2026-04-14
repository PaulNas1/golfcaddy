import type { Results, Round, RoundResult, SeasonStanding } from "@/types";

export const getSeasonStandingId = (
  groupId: string,
  season: number,
  memberId: string
) => `${groupId}_${season}_${memberId}`;

type BuildSeasonStandingsInput = {
  groupId: string;
  season: number;
  results: Results[];
  roundsById: Map<string, Round>;
  previousStandings: SeasonStanding[];
  updatedAt: Date;
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
}: BuildSeasonStandingsInput): SeasonStanding[] {
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
      standing.roundsPlayed += 1;
      standing.totalStableford += ranking.stablefordTotal;
      standing.roundResults.push({
        roundId: result.roundId,
        courseName: round?.courseName ?? "Round",
        date: round?.date ?? result.publishedAt,
        finish: ranking.rank,
        stableford: ranking.stablefordTotal,
        pointsAwarded: ranking.pointsAwarded,
      });
    });

    result.sideResults.ntp.forEach((sideResult) => {
      if (!sideResult.winnerId) return;
      getAccumulator(
        sideResult.winnerId,
        sideResult.winnerName ?? "Player"
      ).ntpWinsSeason += 1;
    });

    if (result.sideResults.ld.winnerId) {
      getAccumulator(
        result.sideResults.ld.winnerId,
        result.sideResults.ld.winnerName ?? "Player"
      ).ldWinsSeason += 1;
    }

    if (result.sideResults.t2.winnerId) {
      getAccumulator(
        result.sideResults.t2.winnerId,
        result.sideResults.t2.winnerName ?? "Player"
      ).t2WinsSeason += 1;
    }

    if (result.sideResults.t3.winnerId) {
      getAccumulator(
        result.sideResults.t3.winnerId,
        result.sideResults.t3.winnerName ?? "Player"
      ).t3WinsSeason += 1;
    }
  });

  const sorted = Array.from(accumulators.values()).sort((a, b) => {
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

export function getRecentStablefordAverage(roundResults: RoundResult[]) {
  const recent = roundResults
    .filter((roundResult) => roundResult.stableford > 0)
    .slice(0, 3);

  if (recent.length < 3) return null;

  const total = recent.reduce(
    (sum, roundResult) => sum + roundResult.stableford,
    0
  );
  return Number((total / recent.length).toFixed(1));
}

export function calculateNextHandicap(
  currentHandicap: number,
  roundResults: RoundResult[]
) {
  const recentAverage = getRecentStablefordAverage(roundResults);
  if (recentAverage == null) {
    return {
      nextHandicap: currentHandicap,
      reason: "Needs three Stableford rounds before automatic movement.",
    };
  }

  if (recentAverage >= 39) {
    return {
      nextHandicap: Math.max(0, currentHandicap - 1),
      reason: `Last three Stableford average is ${recentAverage}.`,
    };
  }

  if (recentAverage <= 29) {
    return {
      nextHandicap: currentHandicap + 1,
      reason: `Last three Stableford average is ${recentAverage}.`,
    };
  }

  return {
    nextHandicap: currentHandicap,
    reason: `Last three Stableford average is ${recentAverage}.`,
  };
}
