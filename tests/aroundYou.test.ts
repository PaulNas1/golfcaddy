import test from "node:test";
import assert from "node:assert/strict";
import { buildAroundYou, type AroundYouStanding } from "../lib/aroundYou.ts";

// FourPlay's real 2026 standings (top half + a few below).
const s = (rank: number, name: string, pts: number, rounds = 9): AroundYouStanding => ({
  memberId: name.toLowerCase().replace(/\s+/g, "-"), memberName: name, totalPoints: pts, roundsPlayed: rounds, displayCurrentRank: rank,
});
const ladder = [
  s(1, "Ash Grybas", 42), s(1, "Brad Giampietro", 42), s(3, "Tim Vafides", 40),
  s(4, "Jackson Shegog", 35, 8), s(5, "Paul Albert", 34, 8), s(6, "Darren Murphy", 31),
  s(7, "Edward Edlich", 30), s(8, "Leigh Giampietro", 29), s(8, "Simon Castle", 29, 6), s(8, "Greg Faulkner", 29),
  s(11, "Paul Nasrallah", 26), s(12, "Rick Cucanic", 23, 7), s(13, "Craig Chilton", 22),
];
const view = (id: string, opts = {}) => {
  const r = buildAroundYou(ladder, id, opts);
  assert.equal(r.kind, "ok");
  return r as Extract<typeof r, { kind: "ok" }>;
};
const lines = (r: ReturnType<typeof view>) => r.rows.map((x) => `${x.rankLabel} ${x.label} ${x.points} | ${x.meta}`);

test("Paul (#11): 3-way tie above folds into one row, gap shown", () => {
  const r = view("paul-nasrallah");
  assert.deepEqual(lines(r), [
    "#8= Greg F, Leigh G, Simon C 29 | 3 players tied", // tied names A→Z
    "#11 You 26 | 3 pts off #8 · 3 ahead of #12",
    "#12 Rick Cucanic 23 | 7 rounds",
  ]);
  assert.equal(r.leader, "Ash G & Brad G · 42 pts");
});

test("Ash (tied 1st): you, your co-leader, then next", () => {
  const r = view("ash-grybas");
  assert.deepEqual(lines(r), [
    "#1= You 42 | Tied for the lead",
    "#1= Brad Giampietro 42 | 9 rounds",
    "#3 Tim Vafides 40 | 9 rounds",
  ]);
  assert.equal(r.leader, null);
});

test("Darren (#6): race both ways", () => {
  assert.deepEqual(lines(view("darren-murphy")), [
    "#5 Paul Albert 34 | 8 rounds",
    "#6 You 31 | 3 pts off #5 · 1 ahead of #7",
    "#7 Edward Edlich 30 | 9 rounds",
  ]);
});

test("Simon (in the 3-way tie): tied-with text, tie-mates row below", () => {
  assert.deepEqual(lines(view("simon-castle")), [
    "#7 Edward Edlich 30 | 9 rounds",
    "#8= You 29 | Tied with Greg F & Leigh G · 1 pt off #7",
    "#8= Greg F & Leigh G 29 | 2 players tied",
  ]);
});

test("last place: the two above plus you", () => {
  const r = view("craig-chilton");
  assert.equal(r.rows.length, 3);
  assert.equal(r.rows[2].isMe, true);
  assert.equal(r.rows[2].meta, "1 pt off #12");
});

test("sole leader: 'Leading by X'", () => {
  const r = buildAroundYou([s(1, "A B", 20), s(2, "C D", 15)], "a-b");
  assert.equal(r.kind, "ok");
  if (r.kind === "ok") assert.equal(r.rows[0].meta, "Leading by 5 pts");
});

test("probation with no points, or no standing → join-the-ladder message", () => {
  assert.equal(buildAroundYou([...ladder, s(22, "David Knoff", 0, 2)], "david-knoff", { onProbation: true }).kind, "notOnLadder");
  assert.equal(buildAroundYou(ladder, "someone-new").kind, "notOnLadder");
  assert.equal(buildAroundYou([], "paul-nasrallah").kind, "empty");
});
