import test from "node:test";
import assert from "node:assert/strict";
import type { HoleScore, Scorecard } from "@/types";
import {
  computePlayedHoles,
  computeMaxPlayedHoles,
  isRoundComplete,
  buildRankById,
  computeRankMovement,
  seedZeroTotals,
} from "../lib/liveStandings.ts";

function hole(holeNumber: number, grossScore: number | null): HoleScore {
  return {
    holeNumber,
    par: 4,
    strokeIndex: holeNumber,
    strokesReceived: 0,
    grossScore,
    netScore: grossScore,
    stablefordPoints: grossScore != null ? 2 : null,
    isNTP: false,
    isLD: false,
    isT2: false,
    isT3: false,
    savedAt: null,
  };
}

function scorecard(overrides: Partial<Scorecard>): Scorecard {
  return {
    id: "sc1",
    roundId: "r1",
    groupId: "g1",
    playerId: "p1",
    markerId: "p2",
    handicapAtTime: 12,
    teeSetId: null,
    teeSetName: null,
    coursePar: 72,
    courseRating: null,
    slopeRating: null,
    courseHoles: [],
    status: "in_progress",
    submittedAt: null,
    signedOff: false,
    totalGross: null,
    totalStableford: null,
    adminEdited: false,
    adminEditedBy: null,
    adminEditedAt: null,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    ...overrides,
  };
}

test("computePlayedHoles returns highest holeNumber with a gross score", () => {
  const holes = [hole(1, 4), hole(2, 5), hole(3, null)];
  assert.equal(computePlayedHoles(holes), 2);
});

test("computePlayedHoles returns 0 when nothing is scored", () => {
  assert.equal(computePlayedHoles([hole(1, null)]), 0);
});

test("computeMaxPlayedHoles returns 0 for an empty field", () => {
  assert.equal(computeMaxPlayedHoles({}), 0);
});

test("computeMaxPlayedHoles returns the furthest-along player", () => {
  assert.equal(computeMaxPlayedHoles({ a: 3, b: 7, c: 5 }), 7);
});

test("isRoundComplete is false until every player reaches 18", () => {
  assert.equal(isRoundComplete({ a: 18, b: 17 }), false);
  assert.equal(isRoundComplete({ a: 18, b: 18 }), true);
});

test("isRoundComplete is false for an empty field", () => {
  assert.equal(isRoundComplete({}), false);
});

test("buildRankById maps playerId to rank", () => {
  const rankings = [
    { rank: 1, playerId: "p1" },
    { rank: 2, playerId: "p2" },
  ];
  assert.deepEqual(buildRankById(rankings), { p1: 1, p2: 2 });
});

test("computeRankMovement reports up/down/none", () => {
  assert.deepEqual(computeRankMovement("p1", 1, { p1: 3 }), { direction: "up", amount: 2 });
  assert.deepEqual(computeRankMovement("p1", 3, { p1: 1 }), { direction: "down", amount: 2 });
  assert.deepEqual(computeRankMovement("p1", 1, { p1: 1 }), { direction: "none", amount: 0 });
});

test("computeRankMovement reports none for a player with no previous rank", () => {
  assert.deepEqual(computeRankMovement("p1", 1, {}), { direction: "none", amount: 0 });
});

test("seedZeroTotals turns null stableford totals into 0 so cards still rank", () => {
  const cards = [
    scorecard({ id: "a", totalStableford: null }),
    scorecard({ id: "b", totalStableford: 20 }),
  ];
  const seeded = seedZeroTotals(cards, "stableford");
  assert.equal(seeded[0].totalStableford, 0);
  assert.equal(seeded[1].totalStableford, 20);
});

test("seedZeroTotals seeds totalGross for stroke-play format", () => {
  const cards = [scorecard({ id: "a", totalGross: null })];
  const seeded = seedZeroTotals(cards, "stroke");
  assert.equal(seeded[0].totalGross, 0);
});
