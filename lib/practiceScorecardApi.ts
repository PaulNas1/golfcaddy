// In-memory stand-in for the scoring screen's data plug (see scorecardApi.ts).
// Used by /practice: the real round is copied and treated as live; cards,
// hole scores and side-prize claims live only in this object. The only real
// database access is READS (members, group settings, handicaps) so practice
// uses real playing handicaps. Nothing is ever written.

import type { HoleScore, Round, Scorecard, SideClaim } from "../types/index.ts";
import type { ScorecardApi } from "./scorecardApi.ts";

export const PRACTICE_ROUND_ID = "practice";

type Listener<T> = (value: T) => void;

export function createPracticeScorecardApi(
  realReads: Pick<ScorecardApi, "getMember" | "getActiveMembers" | "getGroup">,
  baseRound: Round
): ScorecardApi {
  // A live copy of the round: no tee groups and no RSVPs, so any member can be marked.
  const round: Round = {
    ...baseRound,
    id: PRACTICE_ROUND_ID,
    status: "live",
    resultsPublished: false,
    teeTimes: [],
    rsvpOpen: false,
  };

  const cards = new Map<string, Scorecard>();
  const holes = new Map<string, Map<number, HoleScore>>();
  const claims = new Map<string, SideClaim>();
  const markerListeners: { markerId: string; cb: Listener<Scorecard | null> }[] = [];
  const holeListeners: { cardId: string; cb: Listener<HoleScore[]> }[] = [];
  const claimListeners: Listener<SideClaim[]>[] = [];
  const roundCardListeners: Listener<Scorecard[]>[] = [];
  let nextId = 1;

  const cardForMarker = (markerId: string) =>
    Array.from(cards.values()).find((c) => c.markerId === markerId) ?? null;
  const holeList = (cardId: string) =>
    Array.from(holes.get(cardId)?.values() ?? []).sort((a, b) => a.holeNumber - b.holeNumber);
  const emitCard = (card: Scorecard) => {
    markerListeners.filter((l) => l.markerId === card.markerId).forEach((l) => l.cb(card));
    roundCardListeners.forEach((cb) => cb(Array.from(cards.values())));
  };
  const emitHoles = (cardId: string) =>
    holeListeners.filter((l) => l.cardId === cardId).forEach((l) => l.cb(holeList(cardId)));
  const emitClaims = () => claimListeners.forEach((cb) => cb(Array.from(claims.values())));
  const remove = <T,>(list: T[], item: T) => () => {
    const i = list.indexOf(item);
    if (i >= 0) list.splice(i, 1);
  };

  const api = {
    practice: true,
    // ── Real reads (never writes) ──
    getMember: realReads.getMember,
    getActiveMembers: realReads.getActiveMembers,
    getGroup: realReads.getGroup,
    // ── Round ──
    getRound: async () => round,
    getLiveRound: async () => round,
    subscribeRound: (_id: string, cb: Listener<Round | null>) => {
      cb(round);
      return () => {};
    },
    getRoundRsvps: async () => [],
    subscribeRoundRsvps: (_id: string, cb: Listener<never[]>) => {
      cb([]);
      return () => {};
    },
    // ── Scorecards ──
    getScorecardForPlayer: async (_r: string, playerId: string) =>
      Array.from(cards.values()).find((c) => c.playerId === playerId) ?? null,
    getScorecardForMarker: async (_r: string, markerId: string) => cardForMarker(markerId),
    subscribeScorecardForMarker: (_r: string, markerId: string, cb: Listener<Scorecard | null>) => {
      const entry = { markerId, cb };
      markerListeners.push(entry);
      cb(cardForMarker(markerId));
      return remove(markerListeners, entry);
    },
    subscribeScorecardsForRound: (_r: string, cb: Listener<Scorecard[]>) => {
      roundCardListeners.push(cb);
      cb(Array.from(cards.values()));
      return remove(roundCardListeners, cb);
    },
    createScorecard: async (data: Omit<Scorecard, "id" | "createdAt" | "updatedAt">) => {
      const id = `practice-card-${nextId++}`;
      const now = new Date();
      const card = { ...data, id, createdAt: now, updatedAt: now } as Scorecard;
      cards.set(id, card);
      emitCard(card);
      return id;
    },
    updateScorecard: async (id: string, patch: Partial<Scorecard>) => {
      const current = cards.get(id);
      if (!current) return;
      const next = { ...current, ...patch, updatedAt: new Date() } as Scorecard;
      cards.set(id, next);
      emitCard(next);
    },
    // ── Hole scores ──
    getHoleScores: async (cardId: string) => holeList(cardId),
    setHoleScore: async (cardId: string, holeNumber: number, data: Omit<HoleScore, "holeNumber" | "savedAt">) => {
      if (!holes.has(cardId)) holes.set(cardId, new Map());
      holes.get(cardId)!.set(holeNumber, { holeNumber, ...data, savedAt: new Date() } as HoleScore);
      emitHoles(cardId);
    },
    subscribeHoleScores: (cardId: string, cb: Listener<HoleScore[]>) => {
      const entry = { cardId, cb };
      holeListeners.push(entry);
      cb(holeList(cardId));
      return remove(holeListeners, entry);
    },
    // ── Side prizes ──
    subscribeSideClaimsForRound: (_r: string, cb: Listener<SideClaim[]>) => {
      claimListeners.push(cb);
      cb(Array.from(claims.values()));
      return remove(claimListeners, cb);
    },
    setSideClaim: async ({
      prizeType,
      holeNumber,
      winnerId,
      updatedBy,
      members,
    }: {
      prizeType: SideClaim["prizeType"];
      holeNumber: number;
      winnerId: string;
      updatedBy: { uid: string; displayName: string };
      members: { uid: string; displayName: string }[];
    }) => {
      const key = `${prizeType}-${holeNumber}`;
      const now = new Date();
      claims.set(key, {
        id: key,
        roundId: PRACTICE_ROUND_ID,
        groupId: round.groupId,
        prizeType,
        holeNumber,
        winnerId: winnerId || null,
        winnerName: members.find((m) => m.uid === winnerId)?.displayName ?? null,
        updatedBy: updatedBy.uid,
        updatedByName: updatedBy.displayName,
        updatedAt: now,
        createdAt: claims.get(key)?.createdAt ?? now,
      });
      emitClaims();
    },
  };

  return api as unknown as ScorecardApi;
}
