import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateHandicapTransition,
  calculateScoreDifferential,
} from "../lib/handicapEngine.ts";
import {
  applyPointsEligibility,
  buildPlayerRankings,
  getLadderPointsCheck,
} from "../lib/results.ts";
import type { HoleScore, PlayerRanking, Round, Scorecard } from "../types/index.ts";

// ── Slope-adjusted score (Paul's Sam vs Joe example) ────────────────────────
test("slope-adjusted score: 100 on a hard course beats 100 on an easy one", () => {
  assert.equal(calculateScoreDifferential({ gross: 100, courseRating: 74, slopeRating: 140 }), 21);
  assert.equal(calculateScoreDifferential({ gross: 100, courseRating: 69, slopeRating: 110 }), 31.8);
  // No rating data → falls back to par and slope 113
  assert.equal(calculateScoreDifferential({ gross: 100, coursePar: 72 }), 28);
  assert.equal(calculateScoreDifferential({ gross: 0, courseRating: 71 }), null);
});

// ── New player: 4 stroke cards → official handicap ──────────────────────────
const tomCards = [98, 102, 95, 101].map((gross, i) => ({
  roundId: `t${i + 1}`,
  date: new Date(2027, i, 1),
  stableford: 0,
  countsForHandicap: false,
  differential: calculateScoreDifferential({ gross, courseRating: 71, slopeRating: 125 }),
}));

test("new player stays on probation for cards 1-3", () => {
  for (let n = 1; n <= 3; n++) {
    const t = calculateHandicapTransition({
      currentHandicap: 0, handicapStatus: "provisional",
      roundResults: tomCards.slice(0, n), window: 8, bestX: 4, effectiveAt: new Date(),
    });
    assert.equal(t.handicapStatus, "provisional");
    assert.equal(t.nextHandicap, 0);
  }
});

test("4th card sets the handicap = average slope-adjusted score, and it's official", () => {
  assert.deepEqual(tomCards.map((c) => c.differential), [24.4, 28, 21.7, 27.1]);
  const t = calculateHandicapTransition({
    currentHandicap: 0, handicapStatus: "provisional",
    roundResults: tomCards, window: 8, bestX: 4, effectiveAt: new Date(2027, 3, 1),
  });
  assert.equal(t.nextHandicap, 25.3);
  assert.equal(t.handicapStatus, "official");
  assert.equal(t.changeType, "initial_allocation");
  console.log("Tom:", t.reason);
});

test("after that, best 4 of 8 ignores his probation cards", () => {
  // Round 5: first Stableford round off his new handicap, 36 points = no move.
  const t = calculateHandicapTransition({
    currentHandicap: 25.3, handicapStatus: "official",
    roundResults: [...tomCards, { roundId: "t5", date: new Date(2027, 4, 1), stableford: 36 }],
    window: 8, bestX: 4, effectiveAt: new Date(2027, 4, 1),
  });
  assert.equal(t.nextHandicap, 25.3);
  assert.deepEqual(t.calculationRoundIds, ["t5"]);
});

// ── Ladder points: probation players don't take a placing ───────────────────
const r = (rank: number, playerId: string, stb: number): PlayerRanking => ({
  rank, playerId, playerName: playerId, grossTotal: 0, stablefordTotal: stb,
  handicap: 18, pointsAwarded: 0, countbackDetail: null,
});

test("probation player's score doesn't push official players down", () => {
  const out = applyPointsEligibility(
    [r(1, "A", 38), r(2, "Tom", 37), r(3, "B", 36), r(4, "C", 33), r(5, "D", 30)],
    (id) => id !== "Tom"
  );
  assert.deepEqual(out.map((x) => [x.playerId, x.rank, x.pointsAwarded]), [
    ["A", 1, 10], ["B", 2, 9], ["C", 3, 8], ["D", 4, 7], ["Tom", 5, 0],
  ]);
  assert.equal(out.find((x) => x.playerId === "Tom")?.pointsEligible, false);
  assert.deepEqual(getLadderPointsCheck(out), { awarded: 34, expected: 34, ok: true });
});

test("an exact tie shares the placing and trips the points check", () => {
  const out = applyPointsEligibility(
    [r(1, "A", 38), r(2, "B", 36), r(3, "C", 33), r(3, "D", 33), r(5, "E", 31)],
    () => true
  );
  assert.deepEqual(out.map((x) => x.pointsAwarded), [10, 9, 8, 8, 6]);
  const check = getLadderPointsCheck(out);
  assert.equal(check.ok, false); // 41 awarded vs 40 expected → warning shown
});

// ── Countback: total → back 9 → hardest hole (stroke index 1 first) ─────────
function card(id: string, backNine: number[], hole7: number): { card: Scorecard; holes: HoleScore[] } {
  // Hole 7 is stroke index 1 (hardest); hole 1 is index 7. Everything else is
  // identical between players so only the tested holes can decide it.
  const holes = Array.from({ length: 18 }, (_, i) => {
    const holeNumber = i + 1;
    const strokeIndex = holeNumber === 7 ? 1 : holeNumber === 1 ? 7 : holeNumber;
    const points = holeNumber === 7 ? hole7 : holeNumber >= 10 ? backNine[holeNumber - 10] : 2;
    return { holeNumber, strokeIndex, par: 4, grossScore: 5, stablefordPoints: points } as unknown as HoleScore;
  });
  return {
    card: { id, playerId: id, totalStableford: 33, totalGross: 90, handicapAtTime: 18 } as unknown as Scorecard,
    holes,
  };
}
const round = { format: "stableford" } as unknown as Round;
const even = [2, 2, 2, 2, 2, 2, 2, 2, 1]; // back 9 = 17
function rank(cards: ReturnType<typeof card>[]) {
  return buildPlayerRankings({
    round,
    scorecards: cards.map((c) => c.card),
    holeScoresByCardId: Object.fromEntries(cards.map((c) => [c.card.id, c.holes])),
    members: [],
  });
}

test("countback: tied on 33 → more back-9 points wins", () => {
  const out = rank([card("Dave", even, 3), card("Mick", [2, 2, 2, 2, 2, 2, 2, 2, 2], 2)]);
  assert.equal(out[0].playerId, "Mick"); // back 9 18 vs 17, despite Dave's better hardest hole
  assert.deepEqual(out.map((x) => x.rank), [1, 2]);
});

test("countback: tied on 33 AND back 9 → straight to the hardest hole", () => {
  const out = rank([card("Mick", even, 2), card("Dave", even, 3)]);
  assert.equal(out[0].playerId, "Dave"); // 3 pts vs 2 on stroke index 1
  assert.match(out[0].countbackDetail ?? "", /index 1 hole 7/);
  assert.deepEqual(out.map((x) => x.rank), [1, 2]);
});
