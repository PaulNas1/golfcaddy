import { test } from "node:test";
import assert from "node:assert/strict";
import { calculateHandicapTransition, getPublishHandicapTransition } from "../lib/handicapEngine.ts";

// Mirrors publishRoundResults: each publish starts from the member's CURRENT
// handicap and uses whatever window/bestX the group has saved at that moment.
function publishSeason(scores: number[], ruleForRound: (i: number) => { window: number; bestX: number }) {
  let h = 18, status: "official" | "provisional" = "official";
  const played: { roundId: string; date: Date; stableford: number }[] = [];
  const history: { round: number; before: number; after: number; window: number; bestX: number }[] = [];
  scores.forEach((s, i) => {
    played.push({ roundId: `r${i + 1}`, date: new Date(2026, i, 1), stableford: s });
    const { window, bestX } = ruleForRound(i);
    const t = calculateHandicapTransition({ currentHandicap: h, handicapStatus: status, roundResults: played, window, bestX, effectiveAt: new Date(2026, i, 1) });
    history.push({ round: i + 1, before: h, after: t.nextHandicap, window: t.calculationWindow, bestX });
    h = t.nextHandicap; status = t.handicapStatus;
  });
  return history;
}

const scores = [38, 30, 34, 40, 33, 36];

test("rule change mid-season: earlier rounds untouched, later rounds use the new rule", () => {
  const unchanged = publishSeason(scores, () => ({ window: 6, bestX: 6 }));
  const changed = publishSeason(scores, (i) => (i < 4 ? { window: 6, bestX: 6 } : { window: 6, bestX: 4 }));

  // Rounds 1-4 published before the change are identical.
  assert.deepEqual(changed.slice(0, 4), unchanged.slice(0, 4));
  // Round 5 continues from round 4's handicap (no jump/reset).
  assert.equal(changed[4].before, changed[3].after);
  // Rounds 5-6 use best 4 of 6: R5 best4 of [38,30,34,40,33] = 36.3 → small cut from 18.5
  assert.deepEqual(changed.slice(4).map((r) => r.after), [18.4, 18.2]);
  assert.deepEqual(unchanged.slice(4).map((r) => r.after), [18.7, 18.9]);
  console.log("unchanged:", unchanged.map((r) => r.after).join(" → "));
  console.log("changed  :", changed.map((r) => `${r.after}${r.bestX === 4 ? "*" : ""}`).join(" → "), "(* = best 4 of 6)");
});

test("publish only moves players who were in the round (non-players unchanged)", () => {
  // Dave played R1 (30 pts) only. Three rounds are then published without him.
  const played = [{ roundId: "r1", date: new Date(2026, 0, 1), stableford: 30 }];
  const args = { currentHandicap: 18, handicapStatus: "official" as const, roundResults: played, window: 6, bestX: 6, effectiveAt: new Date() };
  for (let i = 0; i < 3; i++) {
    assert.equal(getPublishHandicapTransition(false, args), null); // no move, no history, no notification
  }
  // When he does play, he still moves normally.
  const t = getPublishHandicapTransition(true, args);
  assert.equal(t?.nextHandicap, 19); // avg 30 → 6 below 36 → +1.0 (max rise per publish)
  console.log("non-player across 3 publishes: 18 → 18 → 18 → 18 | when he plays: 18 → " + t?.nextHandicap);
});
