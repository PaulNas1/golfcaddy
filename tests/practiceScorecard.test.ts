import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createPracticeScorecardApi, PRACTICE_ROUND_ID } from "../lib/practiceScorecardApi.ts";
import type { Round } from "../types/index.ts";

const realRound = {
  id: "r10", groupId: "fourplay", roundNumber: 10, courseName: "Gardiners Run",
  status: "upcoming", resultsPublished: false, rsvpOpen: true,
  teeTimes: [{ time: "07:00", playerIds: ["x"], guestNames: [] }],
} as unknown as Round;

const reads = {
  getMember: async () => null,
  getActiveMembers: async () => [],
  getGroup: async () => null,
} as never;

test("practice round is a live copy; the real round object is untouched", async () => {
  const api = createPracticeScorecardApi(reads, realRound);
  const r = await api.getRound(PRACTICE_ROUND_ID);
  assert.equal(r?.status, "live");
  assert.equal(r?.id, PRACTICE_ROUND_ID);
  assert.deepEqual(r?.teeTimes, []); // any member can be marked
  assert.equal(realRound.status, "upcoming");
  assert.equal(realRound.teeTimes.length, 1);
});

test("a full practice card lives only in memory, and subscribers see updates", async () => {
  const api = createPracticeScorecardApi(reads, realRound);
  const seenCards: unknown[] = [];
  api.subscribeScorecardForMarker(PRACTICE_ROUND_ID, "paul", (c) => seenCards.push(c));
  const id = await api.createScorecard({ roundId: PRACTICE_ROUND_ID, playerId: "paul", markerId: "paul", status: "in_progress" } as never);
  assert.match(id, /^practice-card-/);

  const seenHoles: number[] = [];
  api.subscribeHoleScores(id, (h) => seenHoles.push(h.length));
  for (let hole = 1; hole <= 18; hole++) {
    await api.setHoleScore(id, hole, { par: 4, strokeIndex: hole, strokesReceived: 1, grossScore: 5, netScore: 4, stablefordPoints: 2 } as never);
  }
  assert.equal((await api.getHoleScores(id)).length, 18);
  assert.equal(seenHoles.at(-1), 18);

  await api.updateScorecard(id, { status: "submitted", totalStableford: 36 } as never);
  assert.equal((await api.getScorecardForMarker(PRACTICE_ROUND_ID, "paul"))?.status, "submitted");
  assert.equal(seenCards.length >= 3, true);
});

test("a fresh practice starts empty (Restart / Exit wipe everything)", async () => {
  const a = createPracticeScorecardApi(reads, realRound);
  await a.createScorecard({ roundId: PRACTICE_ROUND_ID, playerId: "p", markerId: "m" } as never);
  const b = createPracticeScorecardApi(reads, realRound);
  assert.equal(await b.getScorecardForMarker(PRACTICE_ROUND_ID, "m"), null);
});

test("the scoring screen has no direct database write path", () => {
  const src = readFileSync(new URL("../components/scorecard/ScorecardScreen.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(src, /from "@\/lib\/firestore"/);
  assert.doesNotMatch(src, /\b(setDoc|updateDoc|addDoc|deleteDoc|writeBatch)\b/);
  // Every save goes through the plug:
  for (const fn of ["createScorecard", "setHoleScore", "updateScorecard", "setSideClaim"]) {
    assert.match(src, new RegExp(`api\\.${fn}\\(`));
    assert.doesNotMatch(src, new RegExp(`(?<![\\w.])${fn}\\(`));
  }
});
