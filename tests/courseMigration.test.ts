import test from "node:test";
import assert from "node:assert/strict";
import {
  buildMigrationReport,
  planCatalogue,
  planFreeze,
  resolveRoundHoles,
  summariseReport,
  type LegacyCorrection,
} from "../lib/courseMigration.ts";
import { buildCourseSnapshot } from "../lib/courseSnapshot.ts";
import type { CourseHole, Round, TeeHole } from "../types/index.ts";

const PARS = [4, 4, 3, 5, 4, 3, 4, 4, 4, 4, 5, 4, 3, 4, 4, 3, 5, 4];
// Ringwood's real index, and the fabricated one the app renders today.
const REAL_INDEX = [15, 1, 8, 10, 14, 5, 13, 11, 18, 16, 17, 12, 7, 2, 3, 9, 6, 4];
const FAKE_INDEX = Array.from({ length: 18 }, (_, position) => position + 1);
const METRES = [
  343, 372, 155, 480, 360, 148, 330, 395, 340, 355, 465, 318, 162, 384, 347,
  140, 470, 355,
];

function courseHoles(index: number[], withMetres = true): CourseHole[] {
  return index.map((value, position) => ({
    number: position + 1,
    par: PARS[position],
    strokeIndex: value,
    type: PARS[position] === 3 ? "par3" : PARS[position] === 5 ? "par5" : "par4",
    ...(withMetres ? { distanceMeters: METRES[position] } : {}),
  }));
}

function round(overrides: Partial<Round> = {}): Round {
  return {
    id: "round-1",
    groupId: "group-1",
    courseId: "",
    courseName: "Ringwood Golf Course",
    roundName: null,
    teeSetId: null,
    teeSetName: "White",
    coursePar: 72,
    courseRating: 70.1,
    slopeRating: 121,
    courseHoles: [],
    availableTeeSets: [],
    playerTeeAssignments: {},
    courseSource: null,
    courseSnapshot: null,
    date: new Date("2026-03-14T00:00:00.000Z"),
    season: 2026,
    roundNumber: 1,
    format: "stableford",
    status: "completed",
    notes: null,
    teeTimes: [],
    rsvpOpen: false,
    rsvpNotifiedAt: null,
    holeOverrides: [],
    specialHoles: { ntp: [], ld: null, t2: null, t3: null },
    scorecardsAvailable: true,
    resultsPublished: true,
    resultsPublishedAt: null,
    createdBy: "admin",
    createdAt: new Date("2026-03-01T00:00:00.000Z"),
    updatedAt: new Date("2026-03-01T00:00:00.000Z"),
    ...overrides,
  };
}

const RINGWOOD_CORRECTION: LegacyCorrection = {
  teeSetId: "golfcourseapi-30104-white",
  courseName: "Ringwood Golf Course",
  teeSetName: "White",
  correctedCourseRating: 70.1,
  correctedSlopeRating: 121,
  holeCorrections: REAL_INDEX.map((index, position) => ({
    holeNumber: position + 1,
    strokeIndex: index,
    par: PARS[position],
  })),
};

// ─── Pass 1 — the report ────────────────────────────────────────────────────

test("a historical-import round with no hole data reports index source 'none'", () => {
  // This is what the 2026 rounds actually look like: historicalImportFirestore
  // writes every imported round with courseHoles: [].
  const rows = buildMigrationReport([round()], []);
  assert.equal(rows[0].indexSource, "none");
  assert.equal(rows[0].indexValid, false);
  assert.equal(rows[0].distancesPresent, false);
  assert.equal(rows[0].needsFix, true);
});

test("a saved correction supplies the index when the round has none", () => {
  const rows = buildMigrationReport([round()], [RINGWOOD_CORRECTION]);
  assert.equal(rows[0].indexSource, "saved correction");
  assert.equal(rows[0].indexValid, true);
  assert.equal(rows[0].indexSequential, false);
  assert.equal(rows[0].needsFix, false);
  // The correction carries no distances, so V4 still has something to say.
  assert.equal(rows[0].distancesPresent, false);
});

test("the Ringwood-Blue bug is reported as sequential and needing a fix", () => {
  const rows = buildMigrationReport(
    [round({ teeSetName: "Blue", courseHoles: courseHoles(FAKE_INDEX) })],
    []
  );
  assert.equal(rows[0].indexSource, "round holes");
  assert.equal(rows[0].indexValid, true); // 1…18 IS a valid permutation
  assert.equal(rows[0].indexSequential, true); // …but it is the hole number
  assert.equal(rows[0].needsFix, true);
  assert.equal(rows[0].distancesPresent, true);
});

test("a round with real hole data needs no fix", () => {
  const rows = buildMigrationReport(
    [round({ courseHoles: courseHoles(REAL_INDEX) })],
    []
  );
  assert.equal(rows[0].needsFix, false);
  assert.equal(rows[0].distancesPresent, true);
});

test("a round that already carries a snapshot reports it as the source", () => {
  const holes: TeeHole[] = REAL_INDEX.map((index, position) => ({
    hole: position + 1,
    par: PARS[position],
    index,
    metres: METRES[position],
  }));
  const snapshot = buildCourseSnapshot(
    { id: "c1", name: "Ringwood Golf Course", holeCount: 18 },
    [
      {
        id: "t1",
        courseId: "c1",
        name: "White",
        gender: "men",
        courseRating: 70.1,
        slope: 121,
        par: 72,
        holes,
        updatedAt: new Date(),
      },
    ]
  );

  const rows = buildMigrationReport(
    [round({ teeSetId: "t1", courseSnapshot: snapshot })],
    []
  );
  assert.equal(rows[0].indexSource, "snapshot");
  assert.equal(rows[0].hasSnapshot, true);
  assert.equal(rows[0].needsFix, false);
});

test("a correction matches on tee-set id as well as name", () => {
  const { source } = resolveRoundHoles(
    round({ teeSetId: "golfcourseapi-30104-white", teeSetName: "Something else" }),
    [RINGWOOD_CORRECTION]
  );
  assert.equal(source, "saved correction");
});

test("the summary counts what has to be fixed before freezing", () => {
  const rows = buildMigrationReport(
    [
      round({ id: "a" }),
      round({ id: "b", courseHoles: courseHoles(FAKE_INDEX) }),
      round({ id: "c", courseHoles: courseHoles(REAL_INDEX) }),
    ],
    []
  );
  const summary = summariseReport(rows);

  assert.equal(summary.total, 3);
  assert.equal(summary.sequentialIndex, 1);
  assert.equal(summary.invalidIndex, 1);
  assert.equal(summary.needsFix, 2);
  assert.equal(summary.withSnapshot, 0);
});

test("the report is ordered oldest first", () => {
  const rows = buildMigrationReport(
    [
      round({ id: "late", date: new Date("2026-08-01T00:00:00.000Z") }),
      round({ id: "early", date: new Date("2026-02-01T00:00:00.000Z") }),
    ],
    []
  );
  assert.deepEqual(rows.map((row) => row.roundId), ["early", "late"]);
});

// ─── Pass 2a — plan the catalogue ───────────────────────────────────────────

test("planning groups distinct course and tee pairs", () => {
  const plan = planCatalogue(
    [
      round({ id: "a", courseName: "Ringwood Golf Course", teeSetName: "White" }),
      round({ id: "b", courseName: "Ringwood Golf Course", teeSetName: "Blue" }),
      round({ id: "c", courseName: "Ringwood Golf Course", teeSetName: "White" }),
      round({ id: "d", courseName: "Gardiners Run", teeSetName: "White" }),
    ],
    []
  );

  assert.deepEqual(plan.map((course) => course.name), [
    "Gardiners Run",
    "Ringwood Golf Course",
  ]);

  const ringwood = plan.find((course) => course.name === "Ringwood Golf Course")!;
  assert.deepEqual(ringwood.tees.map((tee) => tee.name).sort(), ["Blue", "White"]);
  assert.deepEqual(
    ringwood.tees.find((tee) => tee.name === "White")!.roundIds,
    ["a", "c"]
  );
});

test("planning seeds a tee from its saved correction", () => {
  const plan = planCatalogue([round()], [RINGWOOD_CORRECTION]);
  const tee = plan[0].tees[0];

  assert.equal(tee.source, "saved correction");
  assert.deepEqual(tee.holes.map((hole) => hole.index), REAL_INDEX);
  assert.equal(tee.slope, 121);
});

test("planning never fabricates a card — an empty tee gets a blank one", () => {
  const plan = planCatalogue([round()], []);
  const tee = plan[0].tees[0];

  assert.equal(tee.source, "none");
  assert.equal(tee.holes.length, 18);
  // Every index is 0, which V1 blocks — it has to be typed in.
  assert.ok(tee.holes.every((hole) => hole.index === 0));
});

test("planning prefers the round that actually carries hole data", () => {
  const plan = planCatalogue(
    [
      round({ id: "empty", teeSetName: "White" }),
      round({ id: "full", teeSetName: "White", courseHoles: courseHoles(REAL_INDEX) }),
    ],
    []
  );
  const tee = plan[0].tees[0];

  assert.equal(tee.source, "round holes");
  assert.deepEqual(tee.holes.map((hole) => hole.index), REAL_INDEX);
  assert.deepEqual(tee.roundIds, ["empty", "full"]);
});

test("planning guesses gender from the tee name", () => {
  const plan = planCatalogue(
    [
      round({ id: "a", teeSetName: "Men's White" }),
      round({ id: "b", teeSetName: "Women's Red" }),
      round({ id: "c", teeSetName: "Ladies" }),
    ],
    []
  );
  const byName = Object.fromEntries(
    plan[0].tees.map((tee) => [tee.name, tee.gender])
  );

  assert.equal(byName["Men's White"], "men");
  assert.equal(byName["Women's Red"], "women");
  assert.equal(byName["Ladies"], "women");
});

// ─── Pass 2b — freeze ───────────────────────────────────────────────────────

const GOOD_TEE_HOLES: TeeHole[] = REAL_INDEX.map((index, position) => ({
  hole: position + 1,
  par: PARS[position],
  index,
  metres: METRES[position],
}));

const BAD_TEE_HOLES: TeeHole[] = GOOD_TEE_HOLES.map((hole) => ({
  ...hole,
  index: 0,
}));

test("freezing is blocked when no catalogue course matches", () => {
  const plan = planFreeze([round({ courseName: "Somewhere Else" })], [
    { id: "c1", name: "Ringwood Golf Course", holeCount: 18, tees: [] },
  ]);
  assert.equal(plan[0].blocked, true);
  assert.match(plan[0].reason ?? "", /No course in the catalogue/);
});

test("freezing is blocked while any tee still fails V1", () => {
  const plan = planFreeze([round()], [
    {
      id: "c1",
      name: "Ringwood Golf Course",
      holeCount: 18,
      tees: [{ id: "t1", name: "White", holes: BAD_TEE_HOLES }],
    },
  ]);
  assert.equal(plan[0].blocked, true);
  assert.match(plan[0].reason ?? "", /Fix the stroke index on: White/);
});

test("freezing resolves the matching tee by name", () => {
  const plan = planFreeze([round({ teeSetName: "White" })], [
    {
      id: "c1",
      name: "Ringwood Golf Course",
      holeCount: 18,
      tees: [
        { id: "t1", name: "Blue", holes: GOOD_TEE_HOLES },
        { id: "t2", name: "White", holes: GOOD_TEE_HOLES },
      ],
    },
  ]);

  assert.equal(plan[0].blocked, false);
  assert.equal(plan[0].courseId, "c1");
  assert.equal(plan[0].teeId, "t2");
  assert.equal(plan[0].reason, null);
});

test("freezing falls back to the first tee and says so", () => {
  const plan = planFreeze([round({ teeSetName: "Gold" })], [
    {
      id: "c1",
      name: "Ringwood Golf Course",
      holeCount: 18,
      tees: [{ id: "t1", name: "White", holes: GOOD_TEE_HOLES }],
    },
  ]);

  assert.equal(plan[0].blocked, false);
  assert.equal(plan[0].teeId, "t1");
  assert.match(plan[0].reason ?? "", /No tee named "Gold" — will use "White"/);
});
