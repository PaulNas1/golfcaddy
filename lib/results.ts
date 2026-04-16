import type {
  AppUser,
  GroupSettings,
  HoleScore,
  PlayerRanking,
  Round,
  Scorecard,
} from "@/types";
import { getPointsForRank } from "./settings";

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
    `Player ${playerId.slice(0, 6)}`
  );
}
