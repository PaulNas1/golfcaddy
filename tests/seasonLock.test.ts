import test from "node:test";
import assert from "node:assert/strict";
import { getSeasonLock, touchesSeasonRules } from "../lib/seasonLock.ts";

const r = (season: number, n: number, published: boolean) => ({ season, roundNumber: n, resultsPublished: published });

test("unlocked before any round of the season is published", () => {
  assert.deepEqual(getSeasonLock([r(2027, 1, false), r(2026, 9, true)], 2027), {
    locked: false, publishedCount: 0, firstPublishedRound: null,
  });
});

test("locks once the first round is published (FourPlay 2026: 9 published)", () => {
  const rounds = [...Array.from({ length: 9 }, (_, i) => r(2026, i + 1, true)), r(2026, 10, false)];
  assert.deepEqual(getSeasonLock(rounds, 2026), { locked: true, publishedCount: 9, firstPublishedRound: 1 });
});

test("only rule changes count as touching the locked rules", () => {
  assert.equal(touchesSeasonRules(["group name", "logo"]), false);
  assert.equal(touchesSeasonRules(["group name", "handicap rules"]), true);
  assert.equal(touchesSeasonRules(["season total"]), true);
});
