"use client";

// The scoring screen's data plug.
// Normally it's wired to Firestore (realScorecardApi). /practice swaps in an
// in-memory stand-in (lib/practiceScorecardApi.ts) so the SAME screen can be
// used without writing anything to the database.

import { createContext, useContext } from "react";
import {
  getRound,
  getLiveRound,
  getMember,
  getActiveMembers,
  getGroup,
  getRoundRsvps,
  getScorecardForPlayer,
  getScorecardForMarker,
  createScorecard,
  getHoleScores,
  setHoleScore,
  subscribeHoleScores,
  subscribeRound,
  subscribeRoundRsvps,
  subscribeScorecardForMarker,
  subscribeSideClaimsForRound,
  setSideClaim,
  updateScorecard,
} from "@/lib/firestore";

export const realScorecardApi = {
  practice: false as boolean,
  getRound,
  getLiveRound,
  getMember,
  getActiveMembers,
  getGroup,
  getRoundRsvps,
  getScorecardForPlayer,
  getScorecardForMarker,
  createScorecard,
  getHoleScores,
  setHoleScore,
  subscribeHoleScores,
  subscribeRound,
  subscribeRoundRsvps,
  subscribeScorecardForMarker,
  subscribeSideClaimsForRound,
  setSideClaim,
  updateScorecard,
};

export type ScorecardApi = typeof realScorecardApi;

export const ScorecardApiContext = createContext<ScorecardApi>(realScorecardApi);

export const useScorecardApi = () => useContext(ScorecardApiContext);
