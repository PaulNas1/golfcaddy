import test from "node:test";
import assert from "node:assert/strict";
import {
  DocIdProblems,
  describeDocId,
  isDocId,
  requireDocId,
} from "../lib/docIds.ts";
import {
  buildSeasonStandings,
  collectSidePrizeWinners,
} from "../lib/season.ts";
import type { Results, Round } from "../types/index.ts";

// A publish that tripped over a bad id used to die inside the Firestore SDK as
// "n.split is not a function", naming neither the collection, the field, nor
// the record. doc() only validates its first argument — the collection name,
// always a literal here — so the id after it reached ResourcePath.fromString
// unchecked. These cover the guard that now catches it first.

// ─── What counts as a document id ───────────────────────────────────────────

test("only a non-empty string with no slash is a usable document id", () => {
  assert.equal(isDocId("abc123"), true);
  assert.equal(isDocId("g1_2026_u-ash"), true);

  assert.equal(isDocId(undefined), false);
  assert.equal(isDocId(null), false);
  assert.equal(isDocId(""), false);
  assert.equal(isDocId("   "), false);
  assert.equal(isDocId(7), false);
  assert.equal(isDocId(["u-ash"]), false);
  assert.equal(isDocId({ uid: "u-ash" }), false);
  // A slash would silently address a subcollection instead of a document.
  assert.equal(isDocId("rounds/abc"), false);
});

test("a bad id is described in words, not as [object Object]", () => {
  assert.equal(describeDocId(undefined), "missing");
  assert.equal(describeDocId(null), "empty");
  assert.equal(describeDocId(""), "blank");
  assert.match(describeDocId(["u-ash"]), /^a list — \["u-ash"\]$/);
  assert.match(describeDocId(7), /^a number — 7$/);
  assert.match(describeDocId({ uid: "x" }), /^an object — /);
  assert.match(describeDocId("rounds/abc"), /contains a "\/"/);
});

test("a long value is previewed, not dumped whole", () => {
  const described = describeDocId(Array.from({ length: 200 }, (_, i) => i));
  assert.ok(described.length < 90, described);
  assert.match(described, /…/);
});

test("requireDocId returns the id, or names what it got instead", () => {
  assert.equal(requireDocId("u-ash", "The player id"), "u-ash");
  assert.throws(
    () => requireDocId(undefined, "The player id"),
    /The player id is missing\./
  );
});

// ─── Collecting several problems ────────────────────────────────────────────

test("every broken record is named in one error, not one per attempt", () => {
  const problems = new DocIdProblems();
  problems.check("fine", "Round 9");
  problems.check(undefined, "Round 3's results record has no round");
  problems.check(["x"], "Round 5's LD winner's player id");

  assert.equal(problems.length, 2);
  assert.throws(
    () => problems.throwIfAny("Cannot publish these results"),
    (error: Error) => {
      assert.match(error.message, /Cannot publish these results/);
      assert.match(error.message, /Round 3's results record has no round is missing/);
      assert.match(error.message, /Round 5's LD winner's player id is a list/);
      // The one good id is not mentioned.
      assert.ok(!/Round 9/.test(error.message));
      return true;
    }
  );
});

test("a clean run throws nothing", () => {
  const problems = new DocIdProblems();
  problems.check("u-ash", "A player");
  assert.equal(problems.length, 0);
  assert.doesNotThrow(() => problems.throwIfAny("Cannot publish"));
});

// ─── Reading side prize winners ─────────────────────────────────────────────

const currentShape = {
  ntp: [
    { holeNumber: 3, winnerId: "u-ash", winnerName: "Ash Grybas" },
    { holeNumber: 6, winnerId: null, winnerName: null },
  ],
  ld: { holeNumber: 17, winnerId: "u-brad", winnerName: "Brad Giampietro" },
  t2: { holeNumber: 5, winnerId: null, winnerName: null },
  t3: { holeNumber: 11, winnerId: "u-murph", winnerName: "Darren Murphy" },
};

test("reads the current shape and skips prizes nobody won", () => {
  const winners = collectSidePrizeWinners(currentShape);
  assert.deepEqual(
    winners.map((winner) => [winner.prize, winner.winnerId]),
    [
      ["ntp", "u-ash"],
      ["ld", "u-brad"],
      ["t3", "u-murph"],
    ]
  );
  assert.equal(winners[0].winnerName, "Ash Grybas");
});

test("a legacy record stored the other way round still reads", () => {
  // ntp as a single object, ld as a list — the shapes that predate the split.
  const winners = collectSidePrizeWinners({
    ntp: { holeNumber: 3, winnerId: "u-ash", winnerName: "Ash" },
    ld: [{ holeNumber: 17, winnerId: "u-brad", winnerName: "Brad" }],
  });
  assert.deepEqual(
    winners.map((winner) => [winner.prize, winner.winnerId]),
    [
      ["ntp", "u-ash"],
      ["ld", "u-brad"],
    ]
  );
});

test("garbage in the side results yields nothing rather than throwing", () => {
  assert.deepEqual(collectSidePrizeWinners(undefined), []);
  assert.deepEqual(collectSidePrizeWinners(null), []);
  assert.deepEqual(collectSidePrizeWinners("nonsense"), []);
  assert.deepEqual(collectSidePrizeWinners({}), []);
  // A list of bare hole numbers — an old NTP field before winners were stored.
  assert.deepEqual(collectSidePrizeWinners({ ntp: [3, 6, 12, 16] }), []);
});

// ─── The season aggregate survives a broken record ──────────────────────────

function result(overrides: Partial<Results> = {}): Results {
  return {
    id: "round-1",
    roundId: "round-1",
    groupId: "g1",
    season: 2026,
    publishedAt: new Date("2026-03-01"),
    createdAt: new Date("2026-03-01"),
    rankings: [
      {
        rank: 1,
        playerId: "u-ash",
        playerName: "Ash Grybas",
        grossTotal: 92,
        stablefordTotal: 34,
        handicap: 21,
        pointsAwarded: 10,
        countbackDetail: null,
      },
    ],
    sideResults: currentShape,
    ...overrides,
  } as unknown as Results;
}

function build(results: Results[]) {
  return buildSeasonStandings({
    groupId: "g1",
    season: 2026,
    results,
    roundsById: new Map<string, Round>(),
    previousStandings: [],
    updatedAt: new Date("2026-03-01"),
  });
}

test("a legacy single-object ntp no longer stops the season aggregating", () => {
  // The old code called .forEach straight on this and died before reaching
  // any of the rankings.
  const standings = build([
    result({
      sideResults: {
        ntp: { holeNumber: 3, winnerId: "u-ash", winnerName: "Ash" },
        ld: { holeNumber: 17, winnerId: null, winnerName: null },
        t2: { holeNumber: 5, winnerId: null, winnerName: null },
        t3: { holeNumber: 11, winnerId: null, winnerName: null },
      },
    } as unknown as Partial<Results>),
  ]);

  const ash = standings.find((standing) => standing.memberId === "u-ash");
  assert.ok(ash, "Ash should still be in the ladder");
  assert.equal(ash.ntpWinsSeason, 1);
  assert.equal(ash.totalPoints, 10);
});

test("a single wrapped winner id is unwrapped and the win is credited", () => {
  // This is the shape that reached doc(db, "members", …) and detonated:
  // ["d4vz…"] where a bare uid belonged. One id in a list names one player,
  // so it is read as that player rather than thrown away.
  const winners = collectSidePrizeWinners({
    ntp: [{ holeNumber: 3, winnerId: ["u-ash"], winnerName: "Ash" }],
  });
  assert.deepEqual(winners.map((winner) => winner.winnerId), ["u-ash"]);

  const standings = build([
    result({
      sideResults: {
        ntp: [{ holeNumber: 3, winnerId: ["u-ash"], winnerName: "Ash" }],
        ld: { holeNumber: 17, winnerId: null, winnerName: null },
        t2: { holeNumber: 5, winnerId: null, winnerName: null },
        t3: { holeNumber: 11, winnerId: null, winnerName: null },
      },
    } as unknown as Partial<Results>),
  ]);

  const ash = standings.find((standing) => standing.memberId === "u-ash");
  assert.equal(ash?.ntpWinsSeason, 1, "the NTP should be credited, not dropped");
  assert.equal(isDocId(ash!.memberId), true);
});

test("an ambiguous winner id is never guessed at", () => {
  // Nobody, two people, or something that is not an id at all. Choosing one
  // would be inventing a result, so these stay broken for the guard to name.
  const winners = collectSidePrizeWinners({
    ntp: [
      { holeNumber: 3, winnerId: [], winnerName: null },
      { holeNumber: 6, winnerId: ["u-ash", "u-brad"], winnerName: null },
    ],
    ld: { holeNumber: 17, winnerId: 12345, winnerName: "Brad" },
  });

  assert.equal(winners.length, 3);
  winners.forEach((winner) => assert.equal(isDocId(winner.winnerId), false));
});

test("an ambiguous winner id never becomes a member id", () => {
  const standings = build([
    result({
      sideResults: {
        ntp: [{ holeNumber: 3, winnerId: ["u-ash", "u-brad"], winnerName: "?" }],
        ld: { holeNumber: 17, winnerId: 12345, winnerName: "Brad" },
        t2: { holeNumber: 5, winnerId: null, winnerName: null },
        t3: { holeNumber: 11, winnerId: "", winnerName: null },
      },
    } as unknown as Partial<Results>),
  ]);

  standings.forEach((standing) =>
    assert.equal(
      isDocId(standing.memberId),
      true,
      `${standing.memberId} is not a usable member id`
    )
  );

  // Ash is still in the ladder from the ranking, with no NTP credited.
  assert.equal(standings.length, 1);
  assert.equal(standings[0].memberId, "u-ash");
  assert.equal(standings[0].ntpWinsSeason, 0);
});

test("the guard still names an ambiguous winner the aggregate drops", () => {
  // Together these are the contract: the aggregate refuses to credit it, and
  // the publish guard refuses to write silently around it.
  const problems = new DocIdProblems();
  collectSidePrizeWinners({
    ntp: [{ holeNumber: 3, winnerId: ["u-ash", "u-brad"], winnerName: "?" }],
  }).forEach(({ prize, winnerId }) =>
    problems.check(winnerId, `Round 1's ${prize.toUpperCase()} winner's player id`)
  );

  assert.equal(problems.length, 1);
  assert.throws(
    () => problems.throwIfAny("Cannot publish these results"),
    /Round 1's NTP winner's player id is a list/
  );
});

test("the same problem twice is listed once", () => {
  const problems = new DocIdProblems();
  problems.check(["u-a", "u-b"], "Record X has a NTP winner whose player id");
  problems.check(["u-a", "u-b"], "Record X has a NTP winner whose player id");
  assert.equal(problems.length, 1);
});

test("the same fault on two holes is listed twice, told apart by hole", () => {
  // Deduping must not swallow a second genuinely distinct broken record.
  const winners = collectSidePrizeWinners({
    ntp: [
      { holeNumber: 3, winnerId: ["a", "b"], winnerName: null },
      { holeNumber: 12, winnerId: ["a", "b"], winnerName: null },
    ],
  });

  const problems = new DocIdProblems();
  winners.forEach(({ prize, winnerId, holeNumber }) =>
    problems.check(
      winnerId,
      `Record X has a ${prize.toUpperCase()} on hole ${holeNumber} winner whose player id`
    )
  );

  assert.equal(problems.length, 2);
  assert.deepEqual(
    winners.map((winner) => winner.holeNumber),
    [3, 12]
  );
});
