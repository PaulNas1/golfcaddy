import type { Round } from "@/types";

export function getRoundLabel(
  round: Pick<Round, "roundNumber" | "roundName">
) {
  return round.roundName?.trim() || `Round ${round.roundNumber}`;
}

export function hasRoundScorecards(
  round: Pick<Round, "scorecardsAvailable">
) {
  return round.scorecardsAvailable !== false;
}
