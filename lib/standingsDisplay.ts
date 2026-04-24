import type { SeasonStanding } from "@/types";

export type VisibleSeasonStanding = SeasonStanding & {
  displayCurrentRank: number;
  displayPreviousRank: number | null;
};

function compressRanks<T extends { memberId: string; totalPoints: number }>(
  entries: T[]
) {
  const compressedRanks = new Map<string, number>();
  let previousPoints: number | null = null;
  let previousRank = 0;

  entries.forEach((entry, index) => {
    const rank =
      previousPoints === entry.totalPoints ? previousRank : index + 1;
    compressedRanks.set(entry.memberId, rank);
    previousPoints = entry.totalPoints;
    previousRank = rank;
  });

  return compressedRanks;
}

export function getVisibleSeasonStandings(
  standings: SeasonStanding[],
  activeMemberIds: Set<string>
): VisibleSeasonStanding[] {
  const visibleStandings = standings.filter((standing) =>
    activeMemberIds.has(standing.memberId)
  );

  const currentOrder = [...visibleStandings].sort((a, b) => {
    if (a.currentRank !== b.currentRank) return a.currentRank - b.currentRank;
    return a.memberName.localeCompare(b.memberName);
  });
  const previousOrder = [...visibleStandings].sort((a, b) => {
    if (a.previousRank == null && b.previousRank == null) {
      return a.memberName.localeCompare(b.memberName);
    }
    if (a.previousRank == null) return 1;
    if (b.previousRank == null) return -1;
    if (a.previousRank !== b.previousRank) return a.previousRank - b.previousRank;
    return a.memberName.localeCompare(b.memberName);
  });

  const displayCurrentRanks = compressRanks(currentOrder);
  const displayPreviousRanks = compressRanks(
    previousOrder.filter((standing) => standing.previousRank != null)
  );

  return currentOrder.map((standing) => ({
    ...standing,
    displayCurrentRank: displayCurrentRanks.get(standing.memberId) ?? standing.currentRank,
    displayPreviousRank:
      standing.previousRank == null
        ? null
        : displayPreviousRanks.get(standing.memberId) ?? standing.previousRank,
  }));
}
