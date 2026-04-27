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

test("slope-adjusted mode uses slope and course rating adjustment", () => {
  assert.equal(
    calculatePlayingHandicap({
      handicap: 18,
      mode: "slope_adjusted",
      slopeRating: 132,
      courseRating: 72.4,
      coursePar: 72,
    }),
    21
  );
});

test("slope-adjusted mode falls back cleanly when tee data is missing", () => {
  assert.equal(
    calculatePlayingHandicap({
      handicap: 12.2,
      mode: "slope_adjusted",
      slopeRating: null,
      courseRating: null,
      coursePar: null,
    }),
    12
  );
});
