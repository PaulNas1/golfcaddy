import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCourseSnapshot,
  canResnapshot,
  courseHoleToTeeHole,
  diffSnapshots,
  freezeTee,
  legacyRoundFieldsFromSnapshot,
  resolveSnapshotTee,
  snapshotIndexIsSequential,
  snapshotIndexIsValid,
  snapshotTeeToCourseHoles,
} from "../lib/courseSnapshot.ts";
import {
  calculatePlayingHandicap,
  calculateStablefordPoints,
  calculateStrokesReceived,
} from "../lib/scoring.ts";
import { calculateHandicapTransition } from "../lib/handicapEngine.ts";
import type { Course, CourseTee, SnapshotTee } from "../types/index.ts";

// ─── Fixtures ───────────────────────────────────────────────────────────────

const PARS = [4, 4, 3, 5, 4, 3, 4, 4, 4, 4, 5, 4, 3, 4, 4, 3, 5, 4];
const REAL_INDEX = [
  15, 1, 8, 10, 14, 5, 13, 11, 18, 16, 17, 12, 7, 2, 3, 9, 6, 4,
];
const METRES = [
  343, 372, 155, 480, 360, 148, 330, 395, 340, 355, 465, 318, 162, 384, 347,
  140, 470, 355,
];
const GROSS = [5, 4, 4, 6, 5, 3, 5, 6, 4, 5, 6, 4, 3, 5, 5, 4, 6, 5];

const SNAPSHOT_AT = new Date("2026-03-14T00:00:00.000Z");

function course(): Course {
  return {
    id: "course-ringwood",
    groupId: "group-1",
    name: "Ringwood Golf Course",
    location: "Ringwood, VIC",
    holeCount: 18,
    archived: false,
    createdAt: SNAPSHOT_AT,
    updatedAt: SNAPSHOT_AT,
  };
}

function tee(overrides: Partial<CourseTee> = {}): CourseTee {
  return {
    id: "tee-white",
    courseId: "course-ringwood",
    name: "Men's White",
    gender: "men",
    courseRating: 70.1,
    slope: 121,
    par: PARS.reduce((total, par) => total + par, 0),
    holes: REAL_INDEX.map((index, position) => ({
      hole: position + 1,
      par: PARS[position],
      index,
      metres: METRES[position],
    })),
    updatedAt: SNAPSHOT_AT,
    ...overrides,
  };
}

function womensTee(): CourseTee {
  return tee({
    id: "tee-red",
    name: "Women's Red",
    gender: "women",
    courseRating: 72.6,
    slope: 128,
    holes: REAL_INDEX.map((index, position) => ({
      hole: position + 1,
      par: PARS[position],
      // A genuinely different index — women's cards often reorder.
      index: ((index + 5) % 18) + 1,
      metres: Math.round(METRES[position] * 0.88),
    })),
  });
}

/** Exactly what the app does: playing handicap, then strokes, then points. */
function scoreOff(
  playedTee: Pick<SnapshotTee, "par" | "slope" | "courseRating" | "holes">,
  handicap: number,
  gender: "male" | "female" = "male"
): { playingHandicap: number; stableford: number } {
  const playingHandicap = calculatePlayingHandicap({
    handicap,
    mode: "slope_adjusted",
    slopeRating: playedTee.slope,
    courseRating: playedTee.courseRating,
    coursePar: playedTee.par,
    gender,
  });

  const stableford = playedTee.holes.reduce((total, hole, position) => {
    const strokes = calculateStrokesReceived(playingHandicap, hole.index);
    return total + calculateStablefordPoints(hole.par, GROSS[position], strokes);
  }, 0);

  return { playingHandicap, stableford };
}

// ─── §3 — the critical requirement ──────────────────────────────────────────

test("editing a course does not change a completed round", () => {
  // 1. Create course C with tee T, with a real stroke index.
  const liveCourse = course();
  const liveTee = tee();

  // 2. Create round R on C/T — the snapshot is written at create time (R2).
  const snapshot = buildCourseSnapshot(liveCourse, [liveTee], SNAPSHOT_AT);
  const round = {
    courseId: liveCourse.id,
    teeSetId: liveTee.id,
    status: "completed" as const,
    courseSnapshot: snapshot,
  };

  // 3. Record R's computed Stableford totals, read off the snapshot (R1).
  const snapshotTee = resolveSnapshotTee(round.courseSnapshot, round.teeSetId);
  assert.ok(snapshotTee);
  const before = scoreOff(snapshotTee, 18);
  const frozenJson = JSON.stringify(round.courseSnapshot);

  // 4. Edit C/T in the live catalogue: index, slope, and three distances.
  liveTee.slope = 137;
  liveTee.courseRating = 72.9;
  liveTee.holes = liveTee.holes.map((hole, position) => ({
    ...hole,
    index: ((hole.index + 7) % 18) + 1,
    metres: position < 3 ? hole.metres + 40 : hole.metres,
  }));

  // 5. Re-read R → totals identical, snapshot byte-identical.
  const afterTee = resolveSnapshotTee(round.courseSnapshot, round.teeSetId);
  assert.ok(afterTee);
  const after = scoreOff(afterTee, 18);

  assert.equal(after.stableford, before.stableford);
  assert.equal(after.playingHandicap, before.playingHandicap);
  assert.equal(JSON.stringify(round.courseSnapshot), frozenJson);

  // 6. Recalculating season handicaps reads stored Stableford totals, never
  //    the course. The engine takes no slope, rating or hole data at all —
  //    so the same totals in produce the same handicap out, before and after
  //    the course edit. This is the step that matters most (R5).
  const transitionArgs = {
    currentHandicap: 18,
    handicapStatus: "official" as const,
    officialHandicapAssignedAt: SNAPSHOT_AT,
    effectiveAt: new Date("2026-04-01T00:00:00.000Z"),
  };
  const handicapBefore = calculateHandicapTransition({
    ...transitionArgs,
    roundResults: [
      { roundId: "round-1", date: SNAPSHOT_AT, stableford: before.stableford },
    ],
  });
  const handicapAfter = calculateHandicapTransition({
    ...transitionArgs,
    roundResults: [
      { roundId: "round-1", date: SNAPSHOT_AT, stableford: after.stableford },
    ],
  });

  assert.equal(handicapAfter.nextHandicap, handicapBefore.nextHandicap);
  assert.deepEqual(handicapAfter, handicapBefore);
});

test("the integrity test has teeth: scoring off the live course WOULD change", () => {
  // If any read path resolved the tee from `courses/*` instead of the round's
  // snapshot, the edit in the test above would silently rewrite history. This
  // asserts the edit is materially different, so the test above is not
  // trivially passing.
  const liveTee = tee();
  const snapshot = buildCourseSnapshot(course(), [liveTee], SNAPSHOT_AT);
  const frozen = resolveSnapshotTee(snapshot, liveTee.id);
  assert.ok(frozen);
  const fromSnapshot = scoreOff(frozen, 18);

  liveTee.slope = 137;
  liveTee.courseRating = 72.9;
  liveTee.holes = liveTee.holes.map((hole) => ({
    ...hole,
    index: ((hole.index + 7) % 18) + 1,
  }));
  const fromLiveCourse = scoreOff(liveTee, 18);

  assert.notEqual(fromLiveCourse.playingHandicap, fromSnapshot.playingHandicap);
  assert.notEqual(fromLiveCourse.stableford, fromSnapshot.stableford);
});

test("freezing a tee deep-copies its holes", () => {
  const liveTee = tee();
  const frozen = freezeTee(liveTee);

  liveTee.holes[0].index = 99;
  liveTee.holes[0].par = 6;

  assert.equal(frozen.holes[0].index, REAL_INDEX[0]);
  assert.equal(frozen.holes[0].par, PARS[0]);
});

test("the snapshot carries every tee, not just the default", () => {
  const snapshot = buildCourseSnapshot(
    course(),
    [tee(), womensTee()],
    SNAPSHOT_AT
  );
  assert.equal(snapshot.tees.length, 2);
  assert.deepEqual(
    snapshot.tees.map((entry) => entry.teeId).sort(),
    ["tee-red", "tee-white"]
  );
});

test("a player on the women's tee scores off that tee's par, index and slope", () => {
  const snapshot = buildCourseSnapshot(
    course(),
    [tee(), womensTee()],
    SNAPSHOT_AT
  );

  const mens = resolveSnapshotTee(snapshot, "tee-white");
  const womens = resolveSnapshotTee(snapshot, "tee-red");
  assert.ok(mens && womens);

  assert.equal(womens.slope, 128);
  assert.equal(womens.gender, "women");
  assert.notDeepEqual(
    womens.holes.map((hole) => hole.index),
    mens.holes.map((hole) => hole.index)
  );

  const womensScore = scoreOff(womens, 24, "female");
  const mensScore = scoreOff(mens, 24, "male");
  assert.notEqual(womensScore.playingHandicap, mensScore.playingHandicap);
});

test("an unknown tee id falls back to the round default, never to nothing", () => {
  const snapshot = buildCourseSnapshot(
    course(),
    [tee(), womensTee()],
    SNAPSHOT_AT
  );
  const resolved = resolveSnapshotTee(snapshot, "tee-that-never-existed", "tee-red");
  assert.equal(resolved?.teeId, "tee-red");
});

test("resolving against an empty snapshot returns null rather than a fake card", () => {
  assert.equal(resolveSnapshotTee(null, "tee-white"), null);
  assert.equal(
    resolveSnapshotTee(
      { ...buildCourseSnapshot(course(), [], SNAPSHOT_AT) },
      "tee-white"
    ),
    null
  );
});

// ─── Dual-write bridge to the legacy round fields ───────────────────────────

test("legacy round fields are derived from the snapshot's default tee", () => {
  const snapshot = buildCourseSnapshot(
    course(),
    [tee(), womensTee()],
    SNAPSHOT_AT
  );
  const legacy = legacyRoundFieldsFromSnapshot(snapshot, "tee-white");

  assert.equal(legacy.teeSetId, "tee-white");
  assert.equal(legacy.teeSetName, "Men's White");
  assert.equal(legacy.coursePar, PARS.reduce((total, par) => total + par, 0));
  assert.equal(legacy.courseRating, 70.1);
  assert.equal(legacy.slopeRating, 121);
  assert.equal(legacy.courseHoles.length, 18);
  assert.equal(legacy.availableTeeSets.length, 2);

  // The legacy CourseHole shape the rest of the app already reads.
  assert.deepEqual(legacy.courseHoles[0], {
    number: 1,
    par: 4,
    strokeIndex: 15,
    type: "par4",
    distanceMeters: 343,
  });
  assert.equal(legacy.courseHoles[2].type, "par3");
  assert.equal(legacy.courseHoles[3].type, "par5");
});

test("the legacy hole bridge round-trips", () => {
  const frozen = freezeTee(tee());
  const roundTripped = snapshotTeeToCourseHoles(frozen).map(courseHoleToTeeHole);
  assert.deepEqual(roundTripped, frozen.holes);
});

// ─── R3 — re-snapshot only while unplayed ───────────────────────────────────

test("R3 allows a refresh on an upcoming round with no scorecards", () => {
  assert.deepEqual(canResnapshot("upcoming", 0), { allowed: true, reason: null });
});

test("R3 blocks a refresh once the round is live or completed", () => {
  for (const status of ["live", "completed"]) {
    const gate = canResnapshot(status, 0);
    assert.equal(gate.allowed, false);
    assert.match(gate.reason ?? "", /sealed/);
  }
});

test("R3 blocks a refresh once scorecards exist", () => {
  const gate = canResnapshot("upcoming", 3);
  assert.equal(gate.allowed, false);
  assert.match(gate.reason ?? "", /3 scorecards/);
});

test("the diff names exactly what a refresh would change", () => {
  const before = buildCourseSnapshot(course(), [tee()], SNAPSHOT_AT);

  const edited = tee();
  edited.slope = 137;
  edited.holes = edited.holes.map((hole) =>
    hole.hole === 1 ? { ...hole, index: 2, metres: 383 } : hole
  );
  const after = buildCourseSnapshot(course(), [edited], SNAPSHOT_AT);

  const rows = diffSnapshots(before, after);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].kind, "changed");
  assert.equal(rows[0].teeName, "Men's White");
  assert.ok(rows[0].changes.some((change) => /Slope 121 → 137/.test(change)));
  assert.ok(rows[0].changes.some((change) => /H1 15→2/.test(change)));
  assert.ok(rows[0].changes.some((change) => /H1 343→383/.test(change)));
});

test("the diff reports added and removed tees", () => {
  const before = buildCourseSnapshot(course(), [tee()], SNAPSHOT_AT);
  const after = buildCourseSnapshot(course(), [womensTee()], SNAPSHOT_AT);

  const rows = diffSnapshots(before, after);
  assert.equal(rows.length, 2);
  assert.ok(rows.some((row) => row.kind === "added" && row.teeName === "Women's Red"));
  assert.ok(rows.some((row) => row.kind === "removed" && row.teeName === "Men's White"));
});

test("an identical refresh produces an empty diff", () => {
  const before = buildCourseSnapshot(course(), [tee()], SNAPSHOT_AT);
  const after = buildCourseSnapshot(course(), [tee()], SNAPSHOT_AT);
  assert.deepEqual(diffSnapshots(before, after), []);
});

// ─── Snapshot health, used by the migration report ──────────────────────────

test("a real index reads as valid and not sequential", () => {
  const snapshot = buildCourseSnapshot(course(), [tee()], SNAPSHOT_AT);
  assert.equal(snapshotIndexIsValid(snapshot), true);
  assert.equal(snapshotIndexIsSequential(snapshot), false);
});

test("the Ringwood-Blue bug reads as valid but sequential", () => {
  const fake = tee({
    holes: PARS.map((par, position) => ({
      hole: position + 1,
      par,
      index: position + 1,
      metres: METRES[position],
    })),
  });
  const snapshot = buildCourseSnapshot(course(), [fake], SNAPSHOT_AT);

  assert.equal(snapshotIndexIsValid(snapshot), true);
  assert.equal(snapshotIndexIsSequential(snapshot), true);
});

test("a duplicated index reads as invalid", () => {
  const broken = tee();
  broken.holes[5].index = broken.holes[0].index;
  const snapshot = buildCourseSnapshot(course(), [broken], SNAPSHOT_AT);
  assert.equal(snapshotIndexIsValid(snapshot), false);
});
