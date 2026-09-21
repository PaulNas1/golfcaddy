import test from "node:test";
import assert from "node:assert/strict";
import {
  blankHoles,
  isBlocked,
  parsePastedTee,
  teeTotals,
  validateMetres,
  validatePar,
  validateRatings,
  validateStrokeIndex,
  validateStrokeIndexNotSequential,
  validateTee,
} from "../lib/courseValidation.ts";
import type { TeeHole } from "../types/index.ts";

// Ringwood Golf Course, White tee — the real stroke index from Brief 1.
const RINGWOOD_INDEX = [
  15, 1, 8, 10, 14, 5, 13, 11, 18, 16, 17, 12, 7, 2, 3, 9, 6, 4,
];
const PARS = [4, 4, 3, 5, 4, 3, 4, 4, 4, 4, 5, 4, 3, 4, 4, 3, 5, 4];
const METRES = [
  343, 372, 155, 480, 360, 148, 330, 395, 340, 355, 465, 318, 162, 384, 347,
  140, 470, 355,
];

function holes(
  index: number[] = RINGWOOD_INDEX,
  pars: number[] = PARS,
  metres: number[] = METRES
): TeeHole[] {
  return index.map((value, position) => ({
    hole: position + 1,
    par: pars[position],
    index: value,
    metres: metres[position],
  }));
}

// ─── V1 — stroke index must be a permutation of 1…holeCount ─────────────────

test("V1 accepts a real stroke index", () => {
  assert.deepEqual(validateStrokeIndex(holes(), 18), []);
});

test("V1 blocks a duplicate index and names it", () => {
  const withDuplicate = holes();
  withDuplicate[5].index = 15; // hole 6 now duplicates hole 1's index of 15

  const issues = validateStrokeIndex(withDuplicate, 18);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].severity, "block");
  assert.equal(issues[0].code, "V1");
  assert.match(issues[0].message, /Index 15 is used more than once/);
  assert.match(issues[0].message, /Index 5 is missing/);
});

test("V1 blocks a blank index and names the hole", () => {
  const withBlank = holes();
  withBlank[11].index = 0;

  const issues = validateStrokeIndex(withBlank, 18);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].severity, "block");
  assert.match(issues[0].message, /Hole 12 has no stroke index/);
  assert.match(issues[0].message, /Index 12 is missing/);
});

test("V1 blocks an out-of-range index", () => {
  const outOfRange = holes();
  outOfRange[2].index = 21;

  const issues = validateStrokeIndex(outOfRange, 18);
  assert.match(issues[0].message, /Hole 3 is outside 1–18/);
});

test("V1 blocks the wrong number of holes", () => {
  const issues = validateStrokeIndex(holes().slice(0, 17), 18);
  assert.equal(issues[0].severity, "block");
  assert.match(issues[0].message, /Expected 18 holes, found 17/);
});

test("V1 validates a 9-hole card against 1…9", () => {
  const nine: TeeHole[] = [4, 8, 2, 6, 9, 1, 5, 7, 3].map((value, position) => ({
    hole: position + 1,
    par: 4,
    index: value,
    metres: 300,
  }));
  assert.deepEqual(validateStrokeIndex(nine, 9), []);
});

// ─── V2 — the Ringwood-Blue bug ─────────────────────────────────────────────

test("V2 warns when stroke index is just the hole number", () => {
  const sequential = holes(
    Array.from({ length: 18 }, (_, position) => position + 1)
  );

  const issues = validateStrokeIndexNotSequential(sequential, 18);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].severity, "warn");
  assert.match(issues[0].message, /looks like placeholder data/);
});

test("V2 is silent on a real stroke index", () => {
  assert.deepEqual(validateStrokeIndexNotSequential(holes(), 18), []);
});

test("V1 and V2 together let a sequential index warn but still save", () => {
  const sequential = holes(
    Array.from({ length: 18 }, (_, position) => position + 1)
  );
  const issues = validateTee(
    {
      name: "Blue",
      gender: "men",
      courseRating: 70.2,
      slope: 125,
      holes: sequential,
    },
    18
  );

  // A sequential index is a valid permutation, so V1 passes and the save is
  // allowed — but the admin is told, which is the whole point of V2.
  assert.equal(isBlocked(issues), false);
  assert.ok(issues.some((issue) => issue.code === "V2"));
});

// ─── V3 / V4 / V5 ───────────────────────────────────────────────────────────

test("V3 warns when the par total is outside 60–75", () => {
  const lowPar = holes(RINGWOOD_INDEX, new Array(18).fill(3));
  const issues = validatePar(lowPar, 18);
  assert.ok(issues.some((issue) => /Total par is 54/.test(issue.message)));
  assert.ok(issues.every((issue) => issue.severity === "warn"));
});

test("V3 scales the par window for a 9-hole course", () => {
  const nine: TeeHole[] = Array.from({ length: 9 }, (_, position) => ({
    hole: position + 1,
    par: 4,
    index: position + 1,
    metres: 300,
  }));
  // 36 sits inside the scaled 30–38 window, so no warning.
  assert.deepEqual(validatePar(nine, 9), []);
});

test("V3 warns about an impossible par on a single hole", () => {
  const oddPar = holes();
  oddPar[7].par = 9;
  const issues = validatePar(oddPar, 18);
  assert.ok(issues.some((issue) => /Hole 8 has a par outside 3–6/.test(issue.message)));
});

test("V4 warns about a missing distance and names the hole", () => {
  const noDistance = holes();
  noDistance[3].metres = 0;
  const issues = validateMetres(noDistance);
  assert.ok(issues.some((issue) => /Hole 4 has no distance/.test(issue.message)));
});

test("V4 warns when distances look like yards", () => {
  const yards = holes(RINGWOOD_INDEX, PARS, new Array(18).fill(700));
  const issues = validateMetres(yards);
  assert.ok(issues.some((issue) => /outside 80–650m/.test(issue.message)));
});

test("V5 warns on an out-of-range slope and rating", () => {
  const issues = validateRatings(92.5, 190);
  assert.equal(issues.length, 2);
  assert.ok(issues.every((issue) => issue.severity === "warn"));
  assert.ok(issues.some((issue) => /Slope 190/.test(issue.message)));
  assert.ok(issues.some((issue) => /Course rating 92.5/.test(issue.message)));
});

test("V5 warns that a missing slope silently falls back to 113", () => {
  const issues = validateRatings(70.1, null);
  assert.ok(issues.some((issue) => /fall back to the standard 113/.test(issue.message)));
});

test("V5 is silent on sane ratings", () => {
  assert.deepEqual(validateRatings(70.1, 121), []);
});

test("a clean card produces no issues at all", () => {
  assert.deepEqual(
    validateTee(
      {
        name: "Men's White",
        gender: "men",
        courseRating: 70.1,
        slope: 121,
        holes: holes(),
      },
      18
    ),
    []
  );
});

// ─── Totals ─────────────────────────────────────────────────────────────────

test("teeTotals splits Out / In / Total", () => {
  const totals = teeTotals(holes());
  assert.equal(totals.out.par, PARS.slice(0, 9).reduce((a, b) => a + b, 0));
  assert.equal(totals.in?.par, PARS.slice(9).reduce((a, b) => a + b, 0));
  assert.equal(totals.total.par, PARS.reduce((a, b) => a + b, 0));
  assert.equal(totals.total.metres, METRES.reduce((a, b) => a + b, 0));
});

test("teeTotals has no In on a 9-hole course", () => {
  assert.equal(teeTotals(blankHoles(9)).in, null);
});

// ─── Paste import ───────────────────────────────────────────────────────────

test("paste parses 18 tab-separated par/index/metres rows", () => {
  const pasted = PARS.map(
    (par, position) => `${par}\t${RINGWOOD_INDEX[position]}\t${METRES[position]}`
  ).join("\n");

  const result = parsePastedTee(pasted, 18);
  assert.deepEqual(result.errors, []);
  assert.equal(result.rowCount, 18);
  assert.equal(result.skippedHeader, false);
  assert.deepEqual(result.holes, holes());
});

test("paste skips a header row", () => {
  const pasted = [
    "Par\tIndex\tMetres",
    ...PARS.map(
      (par, position) => `${par}\t${RINGWOOD_INDEX[position]}\t${METRES[position]}`
    ),
  ].join("\n");

  const result = parsePastedTee(pasted, 18);
  assert.equal(result.skippedHeader, true);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.holes, holes());
});

test("paste drops a leading hole-number column", () => {
  const pasted = PARS.map(
    (par, position) =>
      `${position + 1}\t${par}\t${RINGWOOD_INDEX[position]}\t${METRES[position]}`
  ).join("\n");

  const result = parsePastedTee(pasted, 18);
  assert.equal(result.droppedHoleColumn, true);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.holes, holes());
});

test("paste accepts commas and spaces, and a metres suffix", () => {
  const pasted = PARS.map(
    (par, position) =>
      `${par}, ${RINGWOOD_INDEX[position]}, ${METRES[position]}m`
  ).join("\n");

  const result = parsePastedTee(pasted, 18);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.holes, holes());
});

test("paste accepts two columns and leaves distances for V4 to flag", () => {
  const pasted = PARS.map(
    (par, position) => `${par}\t${RINGWOOD_INDEX[position]}`
  ).join("\n");

  const result = parsePastedTee(pasted, 18);
  assert.deepEqual(result.errors, []);
  assert.ok(result.holes.every((hole) => hole.metres === 0));
  assert.ok(validateMetres(result.holes).length > 0);
});

test("an unreadable row blanks its own hole and never shifts the others", () => {
  const rows = PARS.map(
    (par, position) => `${par}\t${RINGWOOD_INDEX[position]}\t${METRES[position]}`
  );
  rows[4] = "rain delay";

  const result = parsePastedTee(rows.join("\n"), 18);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /Row 5/);

  // Hole 5 is blank — and blocked by V1 — but hole 6 onwards is untouched.
  assert.equal(result.holes[4].index, 0);
  assert.equal(result.holes[5].index, RINGWOOD_INDEX[5]);
  assert.equal(result.holes[17].index, RINGWOOD_INDEX[17]);
  assert.ok(isBlocked(validateStrokeIndex(result.holes, 18)));
});

test("paste reports the wrong row count", () => {
  const pasted = PARS.slice(0, 9)
    .map((par, position) => `${par}\t${RINGWOOD_INDEX[position]}\t${METRES[position]}`)
    .join("\n");

  const result = parsePastedTee(pasted, 18);
  assert.ok(result.errors.some((error) => /Pasted 9 rows but this course plays 18 holes/.test(error)));
});

test("paste of nothing yields a blank card and no errors", () => {
  const result = parsePastedTee("   \n\n  ", 18);
  assert.deepEqual(result.errors, []);
  assert.equal(result.rowCount, 0);
  assert.equal(result.holes.length, 18);
});
