import test from "node:test";
import assert from "node:assert/strict";
import {
  matchMemberByName,
  parseHandicapList,
  reconcileRound,
  summariseReconcile,
} from "../lib/roundReconcile.ts";
import { calculatePlayingHandicap } from "../lib/scoring.ts";
import type { AppUser, HoleScore, Scorecard } from "../types/index.ts";

// Ringwood, White tee — the real card.
const PARS = [4, 4, 3, 5, 4, 3, 4, 4, 4, 4, 5, 4, 3, 4, 4, 3, 5, 4];
const INDEX = [15, 1, 8, 10, 14, 5, 13, 11, 18, 16, 17, 12, 7, 2, 3, 9, 6, 4];
const GROSS = [5, 5, 4, 6, 5, 4, 5, 6, 5, 5, 6, 5, 4, 5, 5, 4, 6, 5];

function member(overrides: Partial<AppUser> = {}): AppUser {
  return {
    uid: "u-ash",
    email: "ash@example.com",
    displayName: "Ash Grybas",
    nickname: "Ash",
    gender: "male",
    role: "member",
    status: "active",
    groupId: "g1",
    avatarUrl: null,
    fcmToken: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as AppUser;
}

function card(overrides: Partial<Scorecard> = {}): Scorecard {
  return {
    id: "card-ash",
    roundId: "round-9",
    groupId: "g1",
    playerId: "u-ash",
    markerId: "u-ash",
    handicapAtTime: 30, // the wrong one
    teeSetId: "tee-white",
    teeSetName: "Mens White",
    coursePar: 69,
    courseRating: 68.9,
    slopeRating: 112,
    courseHoles: [],
    status: "submitted",
    submittedAt: new Date(),
    signedOff: true,
    totalGross: GROSS.reduce((a, b) => a + b, 0),
    totalStableford: 44, // inflated by the wrong handicap
    adminEdited: false,
    adminEditedBy: null,
    adminEditedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Scorecard;
}

function holes(): HoleScore[] {
  return PARS.map((par, position) => ({
    holeNumber: position + 1,
    par,
    strokeIndex: INDEX[position],
    strokesReceived: 2,
    grossScore: GROSS[position],
    netScore: GROSS[position] - 2,
    stablefordPoints: 3,
    isNTP: false,
    isLD: false,
    isT2: false,
    isT3: false,
    savedAt: new Date(),
  }));
}

// ─── Parsing the Members tab ────────────────────────────────────────────────

test("parses the Members tab pasted with its Status column", () => {
  const { entries, errors } = parseHandicapList(
    [
      "Player\tStatus\tHandicap Index",
      "Ash Grybas\tOfficial\t19.4",
      "Brad Giampietro\tOfficial\t18.1",
      "Rick Cucanic\tOfficial\t11",
    ].join("\n")
  );

  assert.deepEqual(errors, []);
  assert.deepEqual(entries, [
    { name: "Ash Grybas", handicap: 19.4 },
    { name: "Brad Giampietro", handicap: 18.1 },
    { name: "Rick Cucanic", handicap: 11 },
  ]);
});

test("parses a plain name and number, comma or tab", () => {
  const { entries } = parseHandicapList("Paul Nasrallah, 22.3\nTim Vafides\t31.1");
  assert.deepEqual(entries, [
    { name: "Paul Nasrallah", handicap: 22.3 },
    { name: "Tim Vafides", handicap: 31.1 },
  ]);
});

test("a duplicated player is reported, not silently doubled", () => {
  const { entries, errors } = parseHandicapList(
    "Rick Cucanic\t11\nRick Cucanic\t11"
  );
  assert.equal(entries.length, 1);
  assert.ok(errors.some((error) => /appears more than once/.test(error)));
});

test("an impossible handicap is rejected rather than used", () => {
  const { entries, errors } = parseHandicapList("Someone Odd\t91");
  assert.equal(entries.length, 0);
  assert.ok(errors.some((error) => /outside 0–54/.test(error)));
});

// ─── Name matching ──────────────────────────────────────────────────────────

test("matches on display name and first name plus last initial — never nickname", () => {
  const members = [
    member(),
    member({ uid: "u-murph", displayName: "Darren Murphy", nickname: "Murph" }),
  ];

  assert.equal(matchMemberByName("Ash Grybas", members)?.uid, "u-ash");
  // Nicknames are profile-only; admin tools must not resolve them.
  assert.equal(matchMemberByName("  murph ", members), null);
  assert.equal(matchMemberByName("Darren M", members)?.uid, "u-murph");
});

test("never guesses on first name alone", () => {
  const members = [
    member({ uid: "u-pn", displayName: "Paul Nasrallah", nickname: null }),
    member({ uid: "u-pa", displayName: "Paul Albert", nickname: null }),
  ];
  // Two Pauls — a first-name match would be a coin flip on someone's ladder
  // points, so it returns nothing and the name is reported as unmatched.
  assert.equal(matchMemberByName("Paul", members), null);
  assert.equal(matchMemberByName("Paul N", members)?.uid, "u-pn");
});

// ─── Recomputation ──────────────────────────────────────────────────────────

test("a corrected handicap rebuilds strokes, points and totals", () => {
  const result = reconcileRound({
    scorecards: [card()],
    holeScoresByCardId: { "card-ash": holes() },
    members: [member()],
    handicaps: [{ name: "Ash Grybas", handicap: 19.4 }],
    handicapMode: "slope_adjusted",
    format: "stableford",
  });

  const row = result.rows[0];
  const expectedPlaying = calculatePlayingHandicap({
    handicap: 19.4,
    mode: "slope_adjusted",
    slopeRating: 112,
    courseRating: 68.9,
    coursePar: 69,
    gender: "male",
  });

  assert.equal(row.nextPlayingHandicap, expectedPlaying);
  assert.notEqual(row.nextPlayingHandicap, row.previousPlayingHandicap);
  assert.equal(row.changed, true);

  // Gross is never touched — what they hit is not in doubt.
  assert.equal(row.nextGross, GROSS.reduce((a, b) => a + b, 0));

  // Every hole's strokes now come from the corrected playing handicap.
  assert.ok(row.holes.every((hole) => hole.nextStrokes !== hole.previousStrokes));
  assert.equal(
    row.nextStableford,
    row.holes.reduce((total, hole) => total + (hole.nextPoints ?? 0), 0)
  );
});

test("a player on a different tee is recomputed against the tee they played", () => {
  // Same index, different slope and rating — the card, not the round, decides.
  const womens = card({
    id: "card-red",
    playerId: "u-red",
    slopeRating: 128,
    courseRating: 72.6,
    coursePar: 69,
  });

  const result = reconcileRound({
    scorecards: [card(), womens],
    holeScoresByCardId: { "card-ash": holes(), "card-red": holes() },
    members: [member(), member({ uid: "u-red", displayName: "Red Player" })],
    handicaps: [
      { name: "Ash Grybas", handicap: 19.4 },
      { name: "Red Player", handicap: 19.4 },
    ],
    handicapMode: "slope_adjusted",
    format: "stableford",
  });

  const [ash, red] = result.rows;
  // Identical index, different tee → different playing handicap.
  assert.notEqual(red.nextPlayingHandicap, ash.nextPlayingHandicap);
});

test("a spreadsheet total that disagrees is named, not quietly accepted", () => {
  const result = reconcileRound({
    scorecards: [card()],
    holeScoresByCardId: { "card-ash": holes() },
    members: [member()],
    handicaps: [{ name: "Ash Grybas", handicap: 19.4 }],
    expectedStableford: { "Ash Grybas": 99 },
    handicapMode: "slope_adjusted",
    format: "stableford",
  });

  assert.ok(
    result.rows[0].issues.some((issue) =>
      /the spreadsheet says 99/.test(issue)
    )
  );
  assert.equal(summariseReconcile(result.rows).disagreesWithSpreadsheet, 1);
});

test("a player with no supplied handicap is left completely alone", () => {
  const result = reconcileRound({
    scorecards: [card()],
    holeScoresByCardId: { "card-ash": holes() },
    members: [member()],
    handicaps: [],
    handicapMode: "slope_adjusted",
    format: "stableford",
  });

  const row = result.rows[0];
  assert.equal(row.nextPlayingHandicap, row.previousPlayingHandicap);
  assert.ok(row.issues.some((issue) => /No corrected handicap/.test(issue)));
  assert.deepEqual(result.missingHandicapFor, ["Ash Grybas"]);
});

test("a supplied name that matches nobody is reported", () => {
  const result = reconcileRound({
    scorecards: [card()],
    holeScoresByCardId: { "card-ash": holes() },
    members: [member()],
    handicaps: [
      { name: "Ash Grybas", handicap: 19.4 },
      { name: "Andrew Radze", handicap: 12 },
    ],
    handicapMode: "slope_adjusted",
    format: "stableford",
  });

  assert.deepEqual(result.unmatchedNames, ["Andrew Radze"]);
});

test("an unscored hole contributes nothing and is flagged", () => {
  const partial = holes();
  partial[7].grossScore = null;

  const result = reconcileRound({
    scorecards: [card()],
    holeScoresByCardId: { "card-ash": partial },
    members: [member()],
    handicaps: [{ name: "Ash Grybas", handicap: 19.4 }],
    handicapMode: "slope_adjusted",
    format: "stableford",
  });

  const row = result.rows[0];
  assert.equal(row.holes[7].nextPoints, null);
  assert.ok(row.issues.some((issue) => /1 hole with no gross score/.test(issue)));
});

// ─── Playing handicaps entered directly ─────────────────────────────────────

test("a playing handicap is used exactly as given, with no slope conversion", () => {
  const result = reconcileRound({
    scorecards: [card()],
    holeScoresByCardId: { "card-ash": holes() },
    members: [member()],
    handicaps: [{ name: "Ash Grybas", handicap: 21 }],
    handicapKind: "playing",
    handicapMode: "slope_adjusted",
    format: "stableford",
  });

  const row = result.rows[0];
  assert.equal(row.nextPlayingHandicap, 21);

  // 21 over 18 holes: one stroke everywhere, a second on the three hardest.
  assert.equal(row.holes.find((hole) => hole.strokeIndex === 1)?.nextStrokes, 2);
  assert.equal(row.holes.find((hole) => hole.strokeIndex === 3)?.nextStrokes, 2);
  assert.equal(row.holes.find((hole) => hole.strokeIndex === 4)?.nextStrokes, 1);
  assert.equal(row.holes.find((hole) => hole.strokeIndex === 18)?.nextStrokes, 1);
});

test("the same number means different things in the two modes", () => {
  const run = (handicapKind: "index" | "playing") =>
    reconcileRound({
      scorecards: [card()],
      holeScoresByCardId: { "card-ash": holes() },
      members: [member()],
      handicaps: [{ name: "Ash Grybas", handicap: 21 }],
      handicapKind,
      handicapMode: "slope_adjusted",
      format: "stableford",
    }).rows[0];

  // Ringwood White is slope 112, CR 68.9, par 69 — an index of 21 plays off
  // less than 21. If these ever came out equal the toggle would be decorative.
  assert.notEqual(run("index").nextPlayingHandicap, run("playing").nextPlayingHandicap);
  assert.equal(run("playing").nextPlayingHandicap, 21);
});

test("the default is still an index, so an existing call is unchanged", () => {
  const withDefault = reconcileRound({
    scorecards: [card()],
    holeScoresByCardId: { "card-ash": holes() },
    members: [member()],
    handicaps: [{ name: "Ash Grybas", handicap: 19.4 }],
    handicapMode: "slope_adjusted",
    format: "stableford",
  }).rows[0];

  assert.equal(
    withDefault.nextPlayingHandicap,
    calculatePlayingHandicap({
      handicap: 19.4,
      mode: "slope_adjusted",
      slopeRating: 112,
      courseRating: 68.9,
      coursePar: 69,
      gender: "male",
    })
  );
});

test("a fractional playing handicap is rounded, and says so", () => {
  const result = reconcileRound({
    scorecards: [card()],
    holeScoresByCardId: { "card-ash": holes() },
    members: [member()],
    handicaps: [{ name: "Ash Grybas", handicap: 20.6 }],
    handicapKind: "playing",
    handicapMode: "slope_adjusted",
    format: "stableford",
  });

  const row = result.rows[0];
  assert.equal(row.nextPlayingHandicap, 21);
  assert.ok(row.issues.some((issue) => /not a whole number/.test(issue)));
});

test("a woman entered as a playing handicap skips the gender factor entirely", () => {
  // Direct entry is the way round the conversion, whatever the conversion
  // would have done — the number on the ladder is the number that is used.
  const result = reconcileRound({
    scorecards: [card({ id: "card-red", playerId: "u-red", slopeRating: 128 })],
    holeScoresByCardId: { "card-red": holes() },
    members: [member({ uid: "u-red", displayName: "Red Player", gender: "female" })],
    handicaps: [{ name: "Red Player", handicap: 27 }],
    handicapKind: "playing",
    handicapMode: "slope_adjusted",
    format: "stableford",
  });

  assert.equal(result.rows[0].nextPlayingHandicap, 27);
});
