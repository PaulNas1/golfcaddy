import test from "node:test";
import assert from "node:assert/strict";
import { buildNextUp, buildNeedsAttention } from "../lib/adminChecklist.ts";
import type { AppUser, CourseTeeSet, Round, RoundRsvp } from "../types/index.ts";

const holes = Array.from({ length: 18 }, (_, i) => ({ number: i + 1, par: 4, strokeIndex: i + 1, distanceMeters: 300 }));
const tee = (id: string, name: string, gender: CourseTeeSet["gender"]) =>
  ({ id, name, gender, par: 72, distanceMeters: 5400, courseRating: 70, slopeRating: 120, holes, source: "manual" }) as unknown as CourseTeeSet;
const now = new Date(2026, 8, 23); // 23 Sep 2026

const round = (extra: Partial<Round> = {}) =>
  ({
    id: "r10", roundNumber: 10, season: 2026, status: "upcoming", resultsPublished: false,
    date: new Date(2026, 9, 18), courseName: "Gardiners Run", teeSetId: "white", teeSetName: "White",
    availableTeeSets: [tee("white", "White", "men"), tee("red", "Red", "women")], courseHoles: [],
    playerTeeAssignments: {}, teeTimes: [{ time: "07:00", playerIds: [], guestNames: [] }],
    specialHoles: { ntp: [3, 7, 11, 16], ld: null, t2: null, t3: null }, ...extra,
  }) as unknown as Round;

// 24 active: 11 going (2 seniors), 1 out, 12 no reply — Round 10's real counts.
const members: AppUser[] = Array.from({ length: 24 }, (_, i) =>
  ({ uid: `u${i}`, displayName: `Player${i} X`, gender: "male", usesSeniorTees: i === 1 || i === 2 }) as unknown as AppUser);
const rsvps = [
  ...members.slice(0, 11).map((m) => ({ memberId: m.uid, status: "accepted" })),
  { memberId: "u11", status: "declined" },
] as unknown as RoundRsvp[];

test("Round 10 today: 1 of 5 ready, with the right actions", () => {
  const n = buildNextUp({ rounds: [round()], season: 2026, rsvps, activeMembers: members, now });
  assert.equal(n.mode, "prep");
  if (n.mode !== "prep") return;
  assert.equal(n.daysAway, 25);
  const by = Object.fromEntries(n.items.map((i) => [i.key, i]));
  assert.equal(by.course.done, true);
  assert.equal(by.course.detail, "White / Red");
  assert.equal(by.rsvps.detail, "11 going · 1 out · 12 no reply");
  assert.equal(by.rsvps.action?.kind, "nudge");
  assert.equal(by.groups.detail, "0 of 11 going players placed");
  assert.equal((by.groups.action as { href: string }).href, "/admin/rounds/r10#tee-times");
  assert.equal(by.prizeHoles.label, "LD · T2 · T3 not picked");
  assert.equal(by.tees.label, "2 players need a tee");
  assert.equal(n.doneCount, 1);
});

test("everything done → 5 of 5", () => {
  const r = round({
    teeTimes: [{ time: "07:00", playerIds: members.slice(0, 11).map((m) => m.uid), guestNames: [] }] as unknown as Round["teeTimes"],
    specialHoles: { ntp: [3], ld: 5, t2: 9, t3: 14 } as Round["specialHoles"],
    playerTeeAssignments: { u1: "white", u2: "white" },
  });
  const allReplied = [...rsvps, ...members.slice(12).map((m) => ({ memberId: m.uid, status: "declined" }))] as unknown as RoundRsvp[];
  const n = buildNextUp({ rounds: [r], season: 2026, rsvps: allReplied, activeMembers: members, now });
  assert.equal(n.mode === "prep" && n.doneCount, 5);
});

test("live round → live mode; past unpublished → close-out mode", () => {
  assert.equal(buildNextUp({ rounds: [round({ status: "live" })], season: 2026, rsvps, activeMembers: members, now }).mode, "live");
  const past = round({ date: new Date(2026, 8, 20) });
  assert.equal(buildNextUp({ rounds: [past], season: 2026, rsvps, activeMembers: members, now }).mode, "closeOut");
});

test("needs attention: approvals, a second unpublished round, nothing scheduled", () => {
  const r9 = round({ id: "r9", roundNumber: 9, date: new Date(2026, 8, 13) });
  const r8 = round({ id: "r8", roundNumber: 8, date: new Date(2026, 8, 6) });
  const items = buildNeedsAttention({ rounds: [r8, r9], season: 2026, pendingCount: 2, now, nextUpRoundId: "r8" });
  assert.deepEqual(items.map((i) => i.text), [
    "2 players waiting for approval",
    "Round 9 played but not published",
    "No upcoming round scheduled",
  ]);
});

test("quiet week → nothing needs attention", () => {
  assert.deepEqual(buildNeedsAttention({ rounds: [round()], season: 2026, pendingCount: 0, now, nextUpRoundId: "r10" }), []);
});
