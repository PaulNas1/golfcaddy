import type {
  AppUser,
  GroupSettings,
  HoleScore,
  PlayerRanking,
  Round,
  Scorecard,
} from "@/types";
import { getPointsForRank } from "./settings.ts";
import { placeholderPlayerName } from "./memberNames.ts";

type BuildPlayerRankingsInput = {
  round: Round;
  scorecards: Scorecard[];
  holeScoresByCardId: Record<string, HoleScore[]>;
  members: AppUser[];
  settings?: GroupSettings;
};

type RankedCard = {
  card: Scorecard;
  holes: HoleScore[];
};

export function buildPlayerRankings({
  round,
  scorecards,
  holeScoresByCardId,
  members,
  settings,
}: BuildPlayerRankingsInput): PlayerRanking[] {
  const rankedCards = scorecards
    .filter((card) =>
      round.format === "stableford"
        ? card.totalStableford != null
        : card.totalGross != null
    )
    .map((card) => ({
      card,
      holes: holeScoresByCardId[card.id] ?? [],
    }))
    .sort((a, b) => compareRankedCards(a, b, round.format));

  let previous: RankedCard | null = null;
  let previousRank = 0;

  return rankedCards.map((rankedCard, index) => {
    const rank =
      previous && isExactTie(previous, rankedCard, round.format)
        ? previousRank
        : index + 1;

    previous = rankedCard;
    previousRank = rank;

    return {
      rank,
      playerId: rankedCard.card.playerId,
      playerName: getPlayerName(rankedCard.card.playerId, members),
      grossTotal: rankedCard.card.totalGross ?? 0,
      stablefordTotal: rankedCard.card.totalStableford ?? 0,
      handicap: rankedCard.card.handicapAtTime,
      pointsAwarded: getPointsForRank(rank, settings?.pointsTable),
      countbackDetail: getCountbackDetail(rankedCard, rankedCards, round.format),
      coursePar: rankedCard.card.coursePar ?? round.coursePar ?? null,
      courseRating: rankedCard.card.courseRating ?? round.courseRating ?? null,
      slopeRating: rankedCard.card.slopeRating ?? round.slopeRating ?? null,
    };
  });
}

export function compareRankings(a: PlayerRanking, b: PlayerRanking) {
  if (a.rank !== b.rank) return a.rank - b.rank;
  return a.playerName.localeCompare(b.playerName);
}

function compareRankedCards(
  a: RankedCard,
  b: RankedCard,
  format: Round["format"]
) {
  const primary = comparePrimaryScore(a.card, b.card, format);
  if (primary !== 0) return primary;

  const backNine = compareBackNine(a.holes, b.holes, format);
  if (backNine !== 0) return backNine;

  return compareHardestToEasiest(a.holes, b.holes, format);
}

function comparePrimaryScore(
  a: Scorecard,
  b: Scorecard,
  format: Round["format"]
) {
  if (format === "stableford") {
    return (b.totalStableford ?? -Infinity) - (a.totalStableford ?? -Infinity);
  }

  return (a.totalGross ?? Infinity) - (b.totalGross ?? Infinity);
}

function compareBackNine(
  a: HoleScore[],
  b: HoleScore[],
  format: Round["format"]
) {
  const aBackNine = getBackNineScore(a, format);
  const bBackNine = getBackNineScore(b, format);

  if (format === "stableford") return bBackNine - aBackNine;
  return aBackNine - bBackNine;
}

function compareHardestToEasiest(
  a: HoleScore[],
  b: HoleScore[],
  format: Round["format"]
) {
  const aByIndex = new Map(a.map((hole) => [hole.strokeIndex, hole]));
  const bByIndex = new Map(b.map((hole) => [hole.strokeIndex, hole]));

  for (let index = 1; index <= 18; index += 1) {
    const aHole = aByIndex.get(index);
    const bHole = bByIndex.get(index);
    if (!aHole || !bHole) continue;

    const aValue = getHoleScoreValue(aHole, format);
    const bValue = getHoleScoreValue(bHole, format);
    if (aValue === bValue) continue;

    if (format === "stableford") return bValue - aValue;
    return aValue - bValue;
  }

  return 0;
}

function isExactTie(a: RankedCard, b: RankedCard, format: Round["format"]) {
  return compareRankedCards(a, b, format) === 0;
}

function getCountbackDetail(
  rankedCard: RankedCard,
  rankedCards: RankedCard[],
  format: Round["format"]
) {
  const hasPrimaryTie = rankedCards.some(
    (candidate) =>
      candidate.card.id !== rankedCard.card.id &&
      comparePrimaryScore(candidate.card, rankedCard.card, format) === 0
  );

  if (!hasPrimaryTie) return null;

  const backNine = getBackNineScore(rankedCard.holes, format);
  const decisiveHole = getFirstDecisiveIndexedHole(
    rankedCard,
    rankedCards,
    format
  );

  if (decisiveHole) {
    return `Countback: back 9 ${backNine}, index ${decisiveHole.strokeIndex} hole ${decisiveHole.holeNumber}`;
  }

  return `Countback: back 9 ${backNine}`;
}

function getFirstDecisiveIndexedHole(
  rankedCard: RankedCard,
  rankedCards: RankedCard[],
  format: Round["format"]
) {
  const tiedCards = rankedCards.filter(
    (candidate) =>
      candidate.card.id !== rankedCard.card.id &&
      comparePrimaryScore(candidate.card, rankedCard.card, format) === 0 &&
      compareBackNine(candidate.holes, rankedCard.holes, format) === 0
  );
  if (tiedCards.length === 0) return null;

  const holesByIndex = new Map(
    rankedCard.holes.map((hole) => [hole.strokeIndex, hole])
  );

  for (let index = 1; index <= 18; index += 1) {
    const hole = holesByIndex.get(index);
    if (!hole) continue;

    const value = getHoleScoreValue(hole, format);
    const hasDifferentTieScore = tiedCards.some((candidate) => {
      const candidateHole = candidate.holes.find(
        (candidateScore) => candidateScore.strokeIndex === index
      );
      return candidateHole
        ? getHoleScoreValue(candidateHole, format) !== value
        : false;
    });

    if (hasDifferentTieScore) return hole;
  }

  return null;
}

function getBackNineScore(holes: HoleScore[], format: Round["format"]) {
  return holes
    .filter((hole) => hole.holeNumber >= 10 && hole.holeNumber <= 18)
    .reduce((sum, hole) => sum + getHoleScoreValue(hole, format), 0);
}

function getHoleScoreValue(hole: HoleScore, format: Round["format"]) {
  if (format === "stableford") return hole.stablefordPoints ?? 0;
  return hole.grossScore ?? 0;
}

function getPlayerName(playerId: string, members: AppUser[]) {
  return (
    members.find((member) => member.uid === playerId)?.displayName ??
    placeholderPlayerName(playerId)
  );
}

export const PROBATION_POINTS_REASON =
  "Probation - stroke only, no ladder points until handicap is set";

/**
 * FourPlay ladder rule: only players with an official handicap compete for
 * points. Probationary players are listed (stroke only) but do NOT take a
 * placing — so if one of them has the 2nd-best score, the next official
 * player is still 2nd and still gets 2nd-place points.
 *
 * Countback order from buildPlayerRankings is kept; genuinely tied official
 * players still share the placing and the points.
 */
export function applyPointsEligibility(
  rankings: PlayerRanking[],
  isEligible: (playerId: string) => boolean,
  pointsTable?: Record<string, number>
): PlayerRanking[] {
  const ordered = rankings
    .map((ranking, index) => ({ ranking, index }))
    .sort((a, b) => a.ranking.rank - b.ranking.rank || a.index - b.index)
    .map((entry) => entry.ranking);

  const eligible = ordered.filter((r) => isEligible(r.playerId));
  const ineligible = ordered.filter((r) => !isEligible(r.playerId));

  let previousOriginalRank: number | null = null;
  let previousNewRank = 0;
  const rankedEligible = eligible.map((ranking, position) => {
    const rank =
      previousOriginalRank === ranking.rank ? previousNewRank : position + 1;
    previousOriginalRank = ranking.rank;
    previousNewRank = rank;
    return {
      ...ranking,
      rank,
      pointsAwarded: getPointsForRank(rank, pointsTable),
      pointsEligible: true,
      pointsIneligibleReason: null,
    };
  });

  const listedIneligible = ineligible.map((ranking, i) => ({
    ...ranking,
    rank: rankedEligible.length + i + 1,
    pointsAwarded: 0,
    pointsEligible: false,
    pointsIneligibleReason: PROBATION_POINTS_REASON,
  }));

  return [...rankedEligible, ...listedIneligible];
}

/**
 * Sanity check shown before publishing: the points handed out should equal
 * the points table for the number of official players (55 for a full 10→1
 * table). A mismatch usually means an unresolved tie or a missing player.
 */
export function getLadderPointsCheck(
  rankings: PlayerRanking[],
  pointsTable?: Record<string, number>
) {
  const eligibleCount = rankings.filter((r) => r.pointsEligible !== false).length;
  const awarded = rankings.reduce((sum, r) => sum + (r.pointsAwarded ?? 0), 0);
  let expected = 0;
  for (let rank = 1; rank <= eligibleCount; rank += 1) {
    expected += getPointsForRank(rank, pointsTable);
  }
  return { awarded, expected, ok: awarded === expected };
}
