import test from "node:test";
import assert from "node:assert/strict";
import {
  formatShortMemberName,
  getTeeTimeGroupLabel,
  resolveMemberIdsFromText,
} from "../lib/teeTimes.ts";
import type { AppUser } from "../types/index.ts";

const m = (uid: string, displayName: string, nickname: string | null = null) =>
  ({ uid, displayName, nickname }) as unknown as AppUser;

const members = [
  m("u1", "Darren Murphy", "Murph"),
  m("u2", "Paul Nasrallah", "The Wizard"),
  m("u3", "Paul Albert"),
  m("u4", "Greg Jones", "Jonesy"),
];

test("tee lists show real first names, never nicknames", () => {
  assert.equal(formatShortMemberName(members[0], members), "Darren");
  assert.equal(formatShortMemberName(members[3], members), "Greg");
});

test("two members with the same first name get a last initial", () => {
  assert.equal(formatShortMemberName(members[1], members), "Paul N");
  assert.equal(formatShortMemberName(members[2], members), "Paul A");
});

test("tee group label uses real names", () => {
  assert.equal(
    getTeeTimeGroupLabel(["u1", "u2", "u4"], ["Guest Bob"], members),
    "Darren, Paul N, Greg, Guest Bob"
  );
});

test("typing a nickname into a tee group doesn't match anyone", () => {
  assert.deepEqual(resolveMemberIdsFromText("Murph, Jonesy", members), []);
  assert.deepEqual(resolveMemberIdsFromText("Darren Murphy, Greg", members), ["u1", "u4"]);
});
