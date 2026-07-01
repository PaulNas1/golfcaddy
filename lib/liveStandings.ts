import type { HoleScore, PlayerRanking, Scorecard, ScoringFormat } from "@/types";

export function computePlayedHoles(holes: HoleScore[]): number {
  return holes.reduce(
    (max, h) => (h.grossScore != null && h.holeNumber > max ? h.holeNumber : max),
    0
  );
}

export function computeMaxPlayedHoles(
  playedHolesByPlayerId: Record<string, number>
): number {
  const values = Object.values(playedHolesByPlayerId);
  return values.length > 0 ? Math.max(...values) : 0;
}

export function isRoundComplete(
  playedHolesByPlayerId: Record<string, number>,
  totalHoles = 18
): boolean {
  const values = Object.values(playedHolesByPlayerId);
  return values.length > 0 && values.every((v) => v >= totalHoles);
}

export function buildRankById(
  rankings: Pick<PlayerRanking, "playerId" | "rank">[]
): Record<string, number> {
  return Object.fromEntries(rankings.map((r) => [r.playerId, r.rank]));
}

export function computeRankMovement(
  playerId: string,
  currentRank: number,
  prevRankById: Record<string, number>
): { direction: "up" | "down" | "none"; amount: number } {
  const prevRank = prevRankById[playerId];
  if (prevRank == null) return { direction: "none", amount: 0 };
  const diff = prevRank - currentRank;
  if (diff > 0) return { direction: "up", amount: diff };
  if (diff < 0) return { direction: "down", amount: -diff };
  return { direction: "none", amount: 0 };
}

export function seedZeroTotals(
  scorecards: Scorecard[],
  format: ScoringFormat
): Scorecard[] {
  return scorecards.map((card) =>
    format === "stableford"
      ? { ...card, totalStableford: card.totalStableford ?? 0 }
      : { ...card, totalGross: card.totalGross ?? 0 }
  );
}
