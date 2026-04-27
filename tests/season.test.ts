import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateHandicapTransition,
  getRecentStablefordAverage,
} from "../lib/handicapEngine.ts";
import type { HandicapRound } from "../lib/handicapEngine.ts";

function roundResult({
  roundId,
  date,
  stableford,
}: {
  roundId: string;
  date: string;
  stableford: number;
}): HandicapRound {
  return {
    roundId,
    date: new Date(date),
    stableford,
  };
}

test("recent handicap average uses all available qualifying rounds when below the window", () => {
  const average = getRecentStablefordAverage(
    [
      roundResult({ roundId: "r2", date: "2026-02-10", stableford: 35 }),
      roundResult({ roundId: "r1", date: "2026-01-10", stableford: 31 }),
    ],
    6
  );

  assert.equal(average, 33);
});

test("handicap stays provisional until the configured window is reached", () => {
  const transition = calculateHandicapTransition({
    currentHandicap: 0,
    handicapStatus: "provisional",
    roundResults: [
      roundResult({ roundId: "r2", date: "2026-02-10", stableford: 35 }),
      roundResult({ roundId: "r1", date: "2026-01-10", stableford: 31 }),
    ],
    window: 3,
    effectiveAt: new Date("2026-02-10"),
  });

  assert.equal(transition.nextHandicap, 33);
  assert.equal(transition.handicapStatus, "provisional");
  assert.equal(transition.changeType, "provisional_update");
  assert.deepEqual(transition.calculationRoundIds, ["r2", "r1"]);
});

test("handicap becomes official once the configured window is reached", () => {
  const transition = calculateHandicapTransition({
    currentHandicap: 33,
    handicapStatus: "provisional",
    roundResults: [
      roundResult({ roundId: "r3", date: "2026-03-10", stableford: 36 }),
      roundResult({ roundId: "r2", date: "2026-02-10", stableford: 35 }),
      roundResult({ roundId: "r1", date: "2026-01-10", stableford: 31 }),
    ],
    window: 3,
    effectiveAt: new Date("2026-03-10"),
  });

  assert.equal(transition.nextHandicap, 34);
  assert.equal(transition.handicapStatus, "official");
  assert.equal(transition.changeType, "initial_allocation");
  assert.equal(transition.qualifyingRoundCount, 3);
});

test("handicap uses the most recent qualifying rounds once the sample exceeds the window", () => {
  const transition = calculateHandicapTransition({
    currentHandicap: 34,
    handicapStatus: "official",
    roundResults: [
      roundResult({ roundId: "r1", date: "2026-01-10", stableford: 31 }),
      roundResult({ roundId: "r4", date: "2026-04-10", stableford: 37 }),
      roundResult({ roundId: "r2", date: "2026-02-10", stableford: 35 }),
      roundResult({ roundId: "r3", date: "2026-03-10", stableford: 36 }),
    ],
    window: 3,
    effectiveAt: new Date("2026-04-10"),
  });

  assert.equal(transition.nextHandicap, 36);
  assert.equal(transition.handicapStatus, "official");
  assert.equal(transition.changeType, "movement");
  assert.deepEqual(transition.calculationRoundIds, ["r4", "r3", "r2"]);
});

test("non-qualifying rounds leave the handicap unchanged", () => {
  const transition = calculateHandicapTransition({
    currentHandicap: 18,
    handicapStatus: "official",
    roundResults: [roundResult({ roundId: "stroke-1", date: "2026-05-10", stableford: 0 })],
    window: 6,
    effectiveAt: new Date("2026-05-10"),
  });

  assert.equal(transition.nextHandicap, 18);
  assert.equal(transition.qualifyingRoundCount, 0);
  assert.equal(transition.reason, "No qualifying Stableford rounds available yet.");
});
