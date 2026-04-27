import type { HoleScore, RoundResult } from "@/types";

export type PlayerRoundHistoryEntry = {
  roundResult: RoundResult;
  holeScores: HoleScore[];
};

export type PlayerAdvancedStats = {
  wins: number;
  podiums: number;
  topFives: number;
  averageFinish: number | null;
  formDelta: number | null;
  stablefordDeviation: number | null;
  parTypeAverages: Record<"par3" | "par4" | "par5", number | null>;
  specialHoleAverage: number | null;
  easiestHole: { holeNumber: number; averageStableford: number } | null;
  hardestHole: { holeNumber: number; averageStableford: number } | null;
};

export function calculatePlayerAdvancedStats(
  roundResults: RoundResult[],
  scorecardHistory: PlayerRoundHistoryEntry[]
): PlayerAdvancedStats {
  const playedRounds = roundResults.filter((roundResult) => roundResult.stableford > 0);
  const wins = roundResults.filter((roundResult) => roundResult.finish === 1).length;
  const podiums = roundResults.filter((roundResult) => roundResult.finish <= 3).length;
  const topFives = roundResults.filter((roundResult) => roundResult.finish <= 5).length;
  const averageFinish =
    roundResults.length === 0
      ? null
      : Number(
          (
            roundResults.reduce((sum, roundResult) => sum + roundResult.finish, 0) /
            roundResults.length
          ).toFixed(1)
        );
  const formDelta = getFormDelta(playedRounds);
  const stablefordDeviation = getStablefordDeviation(playedRounds);
  const parTypeAverages = getParTypeAverages(scorecardHistory);
  const specialHoleAverage = getSpecialHoleAverage(scorecardHistory);
  const { easiestHole, hardestHole } = getHoleDifficulty(scorecardHistory);

  return {
    wins,
    podiums,
    topFives,
    averageFinish,
    formDelta,
    stablefordDeviation,
    parTypeAverages,
    specialHoleAverage,
    easiestHole,
    hardestHole,
  };
}

function getFormDelta(roundResults: RoundResult[]) {
  if (roundResults.length < 2) return null;

  const chronological = roundResults
    .slice()
    .sort((a, b) => a.date.getTime() - b.date.getTime());
  const sampleSize = Math.min(3, chronological.length);
  const openingAverage =
    chronological.slice(0, sampleSize).reduce((sum, roundResult) => sum + roundResult.stableford, 0) /
    sampleSize;
  const closingAverage =
    chronological
      .slice(-sampleSize)
      .reduce((sum, roundResult) => sum + roundResult.stableford, 0) / sampleSize;

  return Number((closingAverage - openingAverage).toFixed(1));
}

function getStablefordDeviation(roundResults: RoundResult[]) {
  if (roundResults.length < 2) return null;

  const average =
    roundResults.reduce((sum, roundResult) => sum + roundResult.stableford, 0) /
    roundResults.length;
  const variance =
    roundResults.reduce(
      (sum, roundResult) => sum + (roundResult.stableford - average) ** 2,
      0
    ) / roundResults.length;

  return Number(Math.sqrt(variance).toFixed(1));
}

function getParTypeAverages(scorecardHistory: PlayerRoundHistoryEntry[]) {
  const sums = {
    par3: { total: 0, count: 0 },
    par4: { total: 0, count: 0 },
    par5: { total: 0, count: 0 },
  };

  scorecardHistory.forEach(({ holeScores }) => {
    holeScores.forEach((hole) => {
      if (hole.stablefordPoints == null) return;
      const key = hole.par === 3 ? "par3" : hole.par === 5 ? "par5" : "par4";
      sums[key].total += hole.stablefordPoints;
      sums[key].count += 1;
    });
  });

  return {
    par3: toAverage(sums.par3.total, sums.par3.count),
    par4: toAverage(sums.par4.total, sums.par4.count),
    par5: toAverage(sums.par5.total, sums.par5.count),
  };
}

function getSpecialHoleAverage(scorecardHistory: PlayerRoundHistoryEntry[]) {
  let total = 0;
  let count = 0;

  scorecardHistory.forEach(({ holeScores }) => {
    holeScores.forEach((hole) => {
      if (
        hole.stablefordPoints == null ||
        (!hole.isNTP && !hole.isLD && !hole.isT2 && !hole.isT3)
      ) {
        return;
      }
      total += hole.stablefordPoints;
      count += 1;
    });
  });

  return toAverage(total, count);
}

function getHoleDifficulty(scorecardHistory: PlayerRoundHistoryEntry[]) {
  const holeMap = new Map<number, { total: number; count: number }>();

  scorecardHistory.forEach(({ holeScores }) => {
    holeScores.forEach((hole) => {
      if (hole.stablefordPoints == null) return;
      const existing = holeMap.get(hole.holeNumber) ?? { total: 0, count: 0 };
      existing.total += hole.stablefordPoints;
      existing.count += 1;
      holeMap.set(hole.holeNumber, existing);
    });
  });

  const ranked = Array.from(holeMap.entries())
    .map(([holeNumber, summary]) => ({
      holeNumber,
      averageStableford: Number((summary.total / summary.count).toFixed(1)),
    }))
    .sort((a, b) => a.averageStableford - b.averageStableford);

  return {
    hardestHole: ranked[0] ?? null,
    easiestHole: ranked[ranked.length - 1] ?? null,
  };
}

function toAverage(total: number, count: number) {
  if (count === 0) return null;
  return Number((total / count).toFixed(1));
}
