import test from "node:test";
import assert from "node:assert/strict";
import { getPlayerTeeSet, getViewerHoles } from "../lib/courseData.ts";
import { calculatePlayingHandicap } from "../lib/scoring.ts";
import type { AppUser, CourseHole, CourseTeeSet, Round } from "../types/index.ts";

const holes = (par: number): CourseHole[] =>
  Array.from({ length: 18 }, (_, i) => ({ number: i + 1, par, strokeIndex: i + 1, distanceMeters: 300 }) as unknown as CourseHole);

const tee = (id: string, name: string, gender: CourseTeeSet["gender"], cr: number, slope: number): CourseTeeSet =>
  ({ id, name, gender, par: 72, distanceMeters: 5400, courseRating: cr, slopeRating: slope, holes: holes(4), source: "manual" }) as unknown as CourseTeeSet;

// Gardiners Run-style: White (men, default) + Red (women)
const white = tee("white", "White", "men", 67, 117);
const red = tee("red", "Red", "women", 75, 130);
const round = (extra: Partial<Round> = {}) =>
  ({ id: "r10", teeSetId: "white", teeSetName: "White", availableTeeSets: [white, red], courseHoles: [], playerTeeAssignments: {}, ...extra }) as unknown as Round;

const man = { uid: "m1", gender: "male" } as unknown as AppUser;
const woman = { uid: "w1", gender: "female" } as unknown as AppUser;
const senior = { uid: "s1", gender: "male", usesSeniorTees: true } as unknown as AppUser;

test("men play the default tee", () => {
  assert.equal(getPlayerTeeSet(round(), man.uid, man)?.name, "White");
});

test("women automatically get the ladies' tee", () => {
  assert.equal(getPlayerTeeSet(round(), woman.uid, woman)?.name, "Red");
  const v = getViewerHoles(round(), woman);
  assert.equal(v.teeSet?.name, "Red");
  assert.equal(v.note, null);
});

test("an admin assignment always wins", () => {
  const r = round({ playerTeeAssignments: { w1: "white", m1: "red" } });
  assert.equal(getPlayerTeeSet(r, woman.uid, woman)?.name, "White");
  assert.equal(getPlayerTeeSet(r, man.uid, man)?.name, "Red");
});

test("two ladies' tees = ambiguous → default + 'admin will confirm' note", () => {
  const r = round({ availableTeeSets: [white, red, tee("blue", "Blue", "women", 73, 125)] });
  const v = getViewerHoles(r, woman);
  assert.equal(v.teeSet?.name, "White");
  assert.match(v.note ?? "", /admin will confirm/);
});

test("senior-tee players stay on default with the note (tees aren't labelled senior)", () => {
  const v = getViewerHoles(round(), senior);
  assert.equal(v.teeSet?.name, "White");
  assert.match(v.note ?? "", /admin will confirm/);
});

test("playing HCP uses the player's own tee (the bug this fixes)", () => {
  // Handicap 18 woman: old page used White's rating; now uses Red's.
  const onWhite = calculatePlayingHandicap({ handicap: 18, mode: "slope_adjusted", slopeRating: 117, courseRating: 67, coursePar: 72, gender: "female" });
  const t = getPlayerTeeSet(round(), woman.uid, woman)!;
  const onRed = calculatePlayingHandicap({ handicap: 18, mode: "slope_adjusted", slopeRating: t.slopeRating, courseRating: t.courseRating, coursePar: t.par, gender: "female" });
  console.log(`HCP 18 woman at Gardiners-style course: White ${onWhite} → Red ${onRed}`);
  assert.notEqual(onWhite, onRed);
  assert.equal(onRed, calculatePlayingHandicap({ handicap: 18, mode: "slope_adjusted", slopeRating: 130, courseRating: 75, coursePar: 72, gender: "female" }));
});
