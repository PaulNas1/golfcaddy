"use client";

// Live (unofficial) standings for a round, shared by the round page and the
// scoring screen's quick-view. Data comes through the subscribe functions
// passed in, so /practice can feed it practice cards instead of real ones.

import { useEffect, useMemo, useRef, useState } from "react";
import { buildPlayerRankings } from "@/lib/results";
import {
  computePlayedHoles,
  computeMaxPlayedHoles,
  isRoundComplete,
  buildRankById,
  seedZeroTotals,
} from "@/lib/liveStandings";
import type { AppUser, GroupSettings, HoleScore, PlayerRanking, Round, Scorecard } from "@/types";

type Unsubscribe = () => void;

export function useLiveStandings({
  round,
  members,
  settings,
  subscribeScorecardsForRound,
  subscribeHoleScores,
  enabled = true,
}: {
  round: Round | null;
  members: AppUser[];
  settings?: GroupSettings;
  subscribeScorecardsForRound: (
    roundId: string,
    onChange: (cards: Scorecard[]) => void,
    onError?: (error: Error) => void
  ) => Unsubscribe;
  subscribeHoleScores: (
    cardId: string,
    onChange: (scores: HoleScore[]) => void,
    onError?: (error: Error) => void
  ) => Unsubscribe;
  enabled?: boolean;
}) {
  const [liveCards, setLiveCards] = useState<Scorecard[]>([]);
  const [holeScoresByCardId, setHoleScoresByCardId] = useState<Record<string, HoleScore[]>>({});
  const roundId = round?.id ?? null;
  const isLive = round?.status === "live";

  useEffect(() => {
    if (!enabled || !roundId || !isLive) {
      setLiveCards([]);
      return;
    }
    return subscribeScorecardsForRound(roundId, setLiveCards, (err) =>
      console.warn("Unable to subscribe to live scorecards", err)
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, roundId, isLive]);

  const liveCardIdsKey = useMemo(
    () => liveCards.map((c) => c.id).sort().join(","),
    [liveCards]
  );

  useEffect(() => {
    if (liveCards.length === 0) {
      setHoleScoresByCardId({});
      return;
    }
    const activeIds = new Set(liveCards.map((c) => c.id));
    setHoleScoresByCardId((cur) =>
      Object.fromEntries(Object.entries(cur).filter(([id]) => activeIds.has(id)))
    );
    const unsubs = liveCards.map((card) =>
      subscribeHoleScores(
        card.id,
        (scores) => setHoleScoresByCardId((cur) => ({ ...cur, [card.id]: scores })),
        (err) => console.warn(`Unable to subscribe to hole scores for ${card.id}`, err)
      )
    );
    return () => unsubs.forEach((u) => u());
    // Keyed on the stable set of card ids, not the array reference:
    // resubscribing every hole-score listener on unrelated card updates churns
    // Firestore watch targets fast enough to trip an internal SDK assertion.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveCardIdsKey]);

  const prevRankByIdRef = useRef<Record<string, number>>({});
  const lastProgressKeyRef = useRef<number | null>(null);

  const playedHolesByPlayerId = useMemo(() => {
    const map: Record<string, number> = {};
    liveCards.forEach((card) => {
      map[card.playerId] = computePlayedHoles(holeScoresByCardId[card.id] ?? []);
    });
    return map;
  }, [liveCards, holeScoresByCardId]);

  const maxPlayedHoles = computeMaxPlayedHoles(playedHolesByPlayerId);
  const roundComplete = isRoundComplete(playedHolesByPlayerId);

  const rankings = useMemo<PlayerRanking[]>(() => {
    if (!round) return [];
    const seeded = seedZeroTotals(liveCards, round.format);
    return buildPlayerRankings({ round, scorecards: seeded, holeScoresByCardId, members, settings });
  }, [round, liveCards, holeScoresByCardId, members, settings]);

  const currentRankById = useMemo(() => buildRankById(rankings), [rankings]);

  // Movement arrows = "since the last hole": snapshot only when the field's
  // furthest progress advances.
  useEffect(() => {
    if (lastProgressKeyRef.current !== maxPlayedHoles) {
      lastProgressKeyRef.current = maxPlayedHoles;
      prevRankByIdRef.current = currentRankById;
    }
  }, [maxPlayedHoles, currentRankById]);

  const lastHolePointsByPlayerId = useMemo(() => {
    const map: Record<string, number | null> = {};
    liveCards.forEach((card) => {
      const holes = holeScoresByCardId[card.id] ?? [];
      const thru = computePlayedHoles(holes);
      map[card.playerId] = holes.find((h) => h.holeNumber === thru)?.stablefordPoints ?? null;
    });
    return map;
  }, [liveCards, holeScoresByCardId]);

  return {
    liveCards,
    holeScoresByCardId,
    rankings,
    playedHolesByPlayerId,
    lastHolePointsByPlayerId,
    prevRankById: prevRankByIdRef.current,
    roundComplete,
  };
}
