import test from "node:test";
import assert from "node:assert/strict";
import { calculatePlayingHandicap } from "../lib/scoring.ts";

test("local handicap mode keeps the rounded local handicap", () => {
  assert.equal(
    calculatePlayingHandicap({
      handicap: 18.6,
      mode: "local",
      slopeRating: 132,
      courseRating: 72.4,
      coursePar: 72,
    }),
    19
  );
});

test("slope-adjusted mode applies GA WHS factor (men)", () => {
  // HI=18, Slope=132, CR=72.4, Par=72
  // raw = 18×132/113 + 0.4 = 21.43
  // GA men = 21.43 × 0.93 × 0.9986 = 19.9 → 20
  assert.equal(
    calculatePlayingHandicap({
      handicap: 18,
      mode: "slope_adjusted",
      slopeRating: 132,
      courseRating: 72.4,
      coursePar: 72,
      gender: "male",
    }),
    20
  );
});

test("slope-adjusted mode applies GA WHS factor (women)", () => {
  // HI=18, Slope=132, CR=72.4, Par=72
  // raw = 21.43 × 0.93 × 1.0483 = 20.86 → 21
  assert.equal(
    calculatePlayingHandicap({
      handicap: 18,
      mode: "slope_adjusted",
      slopeRating: 132,
      courseRating: 72.4,
      coursePar: 72,
      gender: "female",
    }),
    21
  );
});

test("slope-adjusted mode falls back cleanly when tee data is missing", () => {
  // HI=12.2, no slope/CR/Par → raw=12.2 × 0.93 × 0.9986 = 11.33 → 11
  assert.equal(
    calculatePlayingHandicap({
      handicap: 12.2,
      mode: "slope_adjusted",
      slopeRating: null,
      courseRating: null,
      coursePar: null,
    }),
    11
  );
});
