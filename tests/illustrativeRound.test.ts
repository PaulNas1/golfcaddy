import test from "node:test";
import assert from "node:assert/strict";
import {
  getIllustrativeRoster,
  buildIllustrativeRound,
  computeIllustrativeStandings,
} from "../lib/illustrativeRound.ts";

test("getIllustrativeRoster returns 5 fictional players with names and handicaps", () => {
  const roster = getIllustrativeRoster();
  assert.equal(roster.length, 5);
  roster.forEach((player) => {
    assert.equal(typeof player.id, "string");
    assert.equal(typeof player.name, "string");
    assert.equal(typeof player.handicap, "number");
  });
});

test("buildIllustrativeRound produces 18 holes per player, deterministically", () => {
  const roundA = buildIllustrativeRound();
  const roundB = buildIllustrativeRound();
  const roster = getIllustrativeRoster();
  roster.forEach((player) => {
    assert.equal(roundA.playerHoles[player.id].length, 18);
    assert.deepEqual(roundA.playerHoles[player.id], roundB.playerHoles[player.id]);
  });
});

test("computeIllustrativeStandings ranks players by total stableford points through N holes", () => {
  const round = buildIllustrativeRound();
  const { rankings } = computeIllustrativeStandings(round, 9);
  assert.equal(rankings.length, 5);
  for (let i = 1; i < rankings.length; i++) {
    assert.ok(rankings[i - 1].stablefordTotal >= rankings[i].stablefordTotal);
  }
  const roster = getIllustrativeRoster();
  const rankedIds = rankings.map((r) => r.playerId).sort();
  assert.deepEqual(rankedIds, roster.map((p) => p.id).sort());
});

test("computeIllustrativeStandings returns 0 points at 0 played holes", () => {
  const round = buildIllustrativeRound();
  const { rankings } = computeIllustrativeStandings(round, 0);
  rankings.forEach((r) => assert.equal(r.stablefordTotal, 0));
});

test("computeIllustrativeStandings reports the last played hole's points per player", () => {
  const round = buildIllustrativeRound();
  const { rankings, lastHoleByPlayerId } = computeIllustrativeStandings(round, 5);
  rankings.forEach((r) => {
    const last = lastHoleByPlayerId[r.playerId];
    assert.ok(last);
    assert.equal(typeof last.stablefordPoints, "number");
  });
});
