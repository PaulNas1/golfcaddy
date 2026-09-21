import type { TeeGender, TeeHole } from "@/types";

// ─── Validation (Brief 1 §5) ────────────────────────────────────────────────
//
// These run on tee save and are the correctness feedback loop for the whole
// feature. V1 and V2 together are what make the "Ringwood Blue renders SI
// 1,2,3…18" class of bug impossible to reintroduce: V1 blocks a card that is
// not a real permutation, V2 warns when the permutation is the identity —
// i.e. hole number masquerading as stroke index.

export type IssueCode = "V1" | "V2" | "V3" | "V4" | "V5";
export type IssueSeverity = "block" | "warn";
export type IssueField = "index" | "par" | "metres" | "rating";

export interface ValidationIssue {
  code: IssueCode;
  severity: IssueSeverity;
  field: IssueField;
  message: string;
}

export interface TeeDraft {
  name: string;
  gender: TeeGender;
  courseRating: number | null;
  slope: number | null;
  holes: TeeHole[];
}

const PAR_TOTAL_MIN_18 = 60;
const PAR_TOTAL_MAX_18 = 75;
const METRES_MIN = 80;
const METRES_MAX = 650;
const SLOPE_MIN = 55;
const SLOPE_MAX = 155;
const RATING_MIN = 55;
const RATING_MAX = 80;

function joinList(values: Array<number | string>): string {
  return values.join(", ");
}

function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}

/** Scale the 18-hole par window to whatever holeCount this course plays. */
function parTotalRange(holeCount: number): { min: number; max: number } {
  const ratio = holeCount / 18;
  return {
    min: Math.round(PAR_TOTAL_MIN_18 * ratio),
    max: Math.round(PAR_TOTAL_MAX_18 * ratio),
  };
}

/**
 * V1 — `index` must be exactly a permutation of 1…holeCount.
 *
 * Blocks the save and names the duplicates and the gaps, because "invalid
 * stroke index" on its own tells an admin nothing about which row to fix.
 */
export function validateStrokeIndex(
  holes: TeeHole[],
  holeCount: number
): ValidationIssue[] {
  if (holes.length !== holeCount) {
    return [
      {
        code: "V1",
        severity: "block",
        field: "index",
        message: `Expected ${holeCount} holes, found ${holes.length}.`,
      },
    ];
  }

  const counts = new Map<number, number>();
  const outOfRange: number[] = [];
  const missing: number[] = [];

  holes.forEach((hole) => {
    const index = hole.index;
    if (!Number.isInteger(index) || index < 1 || index > holeCount) {
      // A blank cell reads as 0 — report it as a hole that still needs a value
      // rather than as an out-of-range number, which would be confusing.
      if (!Number.isFinite(index) || index === 0) missing.push(hole.hole);
      else outOfRange.push(hole.hole);
      return;
    }
    counts.set(index, (counts.get(index) ?? 0) + 1);
  });

  const duplicates = Array.from(counts.entries())
    .filter(([, count]) => count > 1)
    .map(([index]) => index)
    .sort((a, b) => a - b);

  const gaps: number[] = [];
  for (let index = 1; index <= holeCount; index += 1) {
    if (!counts.has(index)) gaps.push(index);
  }

  const problems: string[] = [];
  if (missing.length > 0) {
    problems.push(
      `${plural(missing.length, "Hole", "Holes")} ${joinList(missing)} ${plural(
        missing.length,
        "has no stroke index",
        "have no stroke index"
      )}`
    );
  }
  if (outOfRange.length > 0) {
    problems.push(
      `${plural(outOfRange.length, "Hole", "Holes")} ${joinList(
        outOfRange
      )} ${plural(outOfRange.length, "is", "are")} outside 1–${holeCount}`
    );
  }
  if (duplicates.length > 0) {
    problems.push(
      `${plural(duplicates.length, "Index", "Indexes")} ${joinList(
        duplicates
      )} ${plural(duplicates.length, "is used", "are used")} more than once`
    );
  }
  if (gaps.length > 0) {
    problems.push(
      `${plural(gaps.length, "Index", "Indexes")} ${joinList(gaps)} ${plural(
        gaps.length,
        "is missing",
        "are missing"
      )}`
    );
  }

  if (problems.length === 0) return [];

  return [
    {
      code: "V1",
      severity: "block",
      field: "index",
      message: `Stroke index must use each number from 1 to ${holeCount} exactly once. ${problems.join(
        ". "
      )}.`,
    },
  ];
}

/** V2 — index[i] === i + 1 for every hole: hole number used as stroke index. */
export function validateStrokeIndexNotSequential(
  holes: TeeHole[],
  holeCount: number
): ValidationIssue[] {
  if (holes.length !== holeCount || holeCount === 0) return [];
  if (!holes.every((hole, position) => hole.index === position + 1)) return [];

  return [
    {
      code: "V2",
      severity: "warn",
      field: "index",
      message:
        "Stroke index runs 1, 2, 3… in hole order. This looks like placeholder data, not a real stroke index — check the club scorecard before saving.",
    },
  ];
}

/** V3 — par total in a sane window, and every hole a sane par. */
export function validatePar(
  holes: TeeHole[],
  holeCount: number
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  const oddPars = holes
    .filter((hole) => !Number.isInteger(hole.par) || hole.par < 3 || hole.par > 6)
    .map((hole) => hole.hole);

  if (oddPars.length > 0) {
    issues.push({
      code: "V3",
      severity: "warn",
      field: "par",
      message: `${plural(oddPars.length, "Hole", "Holes")} ${joinList(
        oddPars
      )} ${plural(oddPars.length, "has a par", "have pars")} outside 3–6.`,
    });
  }

  const total = sumPar(holes);
  const { min, max } = parTotalRange(holeCount);
  if (total < min || total > max) {
    issues.push({
      code: "V3",
      severity: "warn",
      field: "par",
      message: `Total par is ${total}. Expected somewhere between ${min} and ${max} for ${holeCount} holes.`,
    });
  }

  return issues;
}

/** V4 — metres present and > 0 for every hole; flag outside 80–650. */
export function validateMetres(holes: TeeHole[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  const absent = holes
    .filter((hole) => !Number.isFinite(hole.metres) || hole.metres <= 0)
    .map((hole) => hole.hole);

  if (absent.length > 0) {
    issues.push({
      code: "V4",
      severity: "warn",
      field: "metres",
      message: `${plural(absent.length, "Hole", "Holes")} ${joinList(
        absent
      )} ${plural(absent.length, "has no distance", "have no distance")}.`,
    });
  }

  const outOfRange = holes
    .filter(
      (hole) =>
        Number.isFinite(hole.metres) &&
        hole.metres > 0 &&
        (hole.metres < METRES_MIN || hole.metres > METRES_MAX)
    )
    .map((hole) => hole.hole);

  if (outOfRange.length > 0) {
    issues.push({
      code: "V4",
      severity: "warn",
      field: "metres",
      message: `${plural(outOfRange.length, "Hole", "Holes")} ${joinList(
        outOfRange
      )} ${plural(
        outOfRange.length,
        "has a distance",
        "have distances"
      )} outside ${METRES_MIN}–${METRES_MAX}m. Check the card is in metres, not yards.`,
    });
  }

  return issues;
}

/** V5 — slope 55–155, courseRating 55–80. */
export function validateRatings(
  courseRating: number | null,
  slope: number | null
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (slope == null) {
    issues.push({
      code: "V5",
      severity: "warn",
      field: "rating",
      message:
        "Slope is not set. Slope-adjusted handicaps will fall back to the standard 113 for this tee.",
    });
  } else if (slope < SLOPE_MIN || slope > SLOPE_MAX) {
    issues.push({
      code: "V5",
      severity: "warn",
      field: "rating",
      message: `Slope ${slope} is outside the valid range ${SLOPE_MIN}–${SLOPE_MAX}.`,
    });
  }

  if (courseRating == null) {
    issues.push({
      code: "V5",
      severity: "warn",
      field: "rating",
      message:
        "Course rating is not set. Slope-adjusted handicaps will skip the rating-minus-par adjustment for this tee.",
    });
  } else if (courseRating < RATING_MIN || courseRating > RATING_MAX) {
    issues.push({
      code: "V5",
      severity: "warn",
      field: "rating",
      message: `Course rating ${courseRating} is outside the valid range ${RATING_MIN}–${RATING_MAX}.`,
    });
  }

  return issues;
}

/** Every rule, in code order. Save is blocked iff any issue is `block`. */
export function validateTee(
  draft: TeeDraft,
  holeCount: number
): ValidationIssue[] {
  return [
    ...validateStrokeIndex(draft.holes, holeCount),
    ...validateStrokeIndexNotSequential(draft.holes, holeCount),
    ...validatePar(draft.holes, holeCount),
    ...validateMetres(draft.holes),
    ...validateRatings(draft.courseRating, draft.slope),
  ];
}

export function isBlocked(issues: ValidationIssue[]): boolean {
  return issues.some((issue) => issue.severity === "block");
}

export function blockingIssues(issues: ValidationIssue[]): ValidationIssue[] {
  return issues.filter((issue) => issue.severity === "block");
}

export function warningIssues(issues: ValidationIssue[]): ValidationIssue[] {
  return issues.filter((issue) => issue.severity === "warn");
}

// ─── Hole helpers ───────────────────────────────────────────────────────────

export function sumPar(holes: TeeHole[]): number {
  return holes.reduce(
    (total, hole) => total + (Number.isFinite(hole.par) ? hole.par : 0),
    0
  );
}

export function sumMetres(holes: TeeHole[]): number {
  return holes.reduce(
    (total, hole) => total + (Number.isFinite(hole.metres) ? hole.metres : 0),
    0
  );
}

/**
 * Out / In / Total for par and metres.
 *
 * "In" is empty on a 9-hole course — there is no back nine to total.
 */
export function teeTotals(holes: TeeHole[]): {
  out: { par: number; metres: number };
  in: { par: number; metres: number } | null;
  total: { par: number; metres: number };
} {
  const front = holes.filter((hole) => hole.hole <= 9);
  const back = holes.filter((hole) => hole.hole > 9);

  return {
    out: { par: sumPar(front), metres: sumMetres(front) },
    in:
      back.length > 0
        ? { par: sumPar(back), metres: sumMetres(back) }
        : null,
    total: { par: sumPar(holes), metres: sumMetres(holes) },
  };
}

/** A blank card: correct hole numbers, everything else zeroed for the admin. */
export function blankHoles(holeCount: number): TeeHole[] {
  return Array.from({ length: holeCount }, (_, position) => ({
    hole: position + 1,
    par: 4,
    index: 0,
    metres: 0,
  }));
}

/** Pad, trim and renumber so `holes` is always exactly holeCount, in order. */
export function normaliseHoles(
  holes: TeeHole[],
  holeCount: number
): TeeHole[] {
  return Array.from({ length: holeCount }, (_, position) => {
    const existing = holes[position];
    return {
      hole: position + 1,
      par: existing && Number.isFinite(existing.par) ? existing.par : 4,
      index: existing && Number.isFinite(existing.index) ? existing.index : 0,
      metres: existing && Number.isFinite(existing.metres) ? existing.metres : 0,
    };
  });
}

// ─── Paste import (Brief 1 §4) ──────────────────────────────────────────────
//
// A textarea accepting holeCount rows, tab / comma / space separated, in
// `par index metres` order. Parsed on submit; the admin corrects the table
// before saving. Replaces the whole GolfCourseAPI path: no network, no key,
// no failure mode, and faster.

export interface PasteParseResult {
  holes: TeeHole[];
  rowCount: number;
  skippedHeader: boolean;
  droppedHoleColumn: boolean;
  errors: string[];
}

const HEADER_WORDS =
  /\b(hole|par|index|idx|si|stroke|metre|meter|metres|meters|yard|yards|dist|distance|length|out|in|total)\b/i;

/** "343m" → 343, "—" → null, "" → null. */
function toNumber(token: string): number | null {
  const cleaned = token.replace(/[^0-9.-]/g, "");
  if (cleaned === "" || cleaned === "-" || cleaned === ".") return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

function splitRow(row: string): string[] {
  return row
    .split(/[\t,;|]+|\s+/)
    .map((token) => token.trim())
    .filter((token) => token !== "");
}

function looksLikeHeader(row: string): boolean {
  const tokens = splitRow(row);
  if (tokens.length === 0) return false;
  // A header has words in it and no leading number.
  const hasWord = tokens.some((token) => /[a-z]/i.test(token));
  return hasWord && HEADER_WORDS.test(row) && toNumber(tokens[0]) === null;
}

/**
 * Parse a pasted scorecard into hole rows.
 *
 * Accepts, per row:
 *   `par index metres`            — the documented shape
 *   `hole par index metres`       — what you get pasting a 4-column table
 *   `par index`                   — distances filled in later (V4 warns)
 *
 * A pasted header row is detected and skipped. Rows that cannot be read are
 * reported in `errors` rather than silently dropped, so nothing is ever
 * fabricated — fabricated data is the bug this whole brief exists to kill.
 */
export function parsePastedTee(
  text: string,
  holeCount: number
): PasteParseResult {
  const errors: string[] = [];
  const rows = text
    .split(/\r?\n/)
    .map((row) => row.trim())
    .filter((row) => row !== "");

  let skippedHeader = false;
  if (rows.length > 0 && looksLikeHeader(rows[0])) {
    rows.shift();
    skippedHeader = true;
  }

  const tokenRows = rows.map(splitRow);

  // Decide once, for the whole paste, whether a leading hole-number column is
  // present. Deciding per row would let a single odd row shift every column.
  const leadValues = tokenRows.map((tokens) =>
    tokens.length >= 4 ? toNumber(tokens[0]) : null
  );
  const droppedHoleColumn =
    tokenRows.length > 0 &&
    leadValues.every(
      (value) =>
        value != null && Number.isInteger(value) && value >= 1 && value <= holeCount
    ) &&
    new Set(leadValues).size === leadValues.length;

  // Fixed-length and position-addressed: a row that cannot be read leaves a
  // blank at *its own* hole rather than shifting every later hole up. A blank
  // index is 0, which V1 blocks — so an unreadable paste can never be saved
  // as if it were real data.
  const holes: TeeHole[] = blankHoles(Math.max(holeCount, tokenRows.length));

  tokenRows.forEach((tokens, position) => {
    const values = (droppedHoleColumn ? tokens.slice(1) : tokens).map(toNumber);

    if (values.length < 2 || values[0] == null || values[1] == null) {
      errors.push(
        `Row ${position + 1} ("${rows[position]}") — could not read a par and a stroke index.`
      );
      return;
    }

    holes[position] = {
      hole: position + 1,
      par: values[0],
      index: values[1],
      metres: values[2] ?? 0,
    };
  });

  if (tokenRows.length > 0 && tokenRows.length !== holeCount) {
    errors.push(
      `Pasted ${tokenRows.length} ${plural(
        tokenRows.length,
        "row",
        "rows"
      )} but this course plays ${holeCount} holes.`
    );
  }

  return {
    holes: normaliseHoles(holes, holeCount),
    rowCount: tokenRows.length,
    skippedHeader,
    droppedHoleColumn,
    errors,
  };
}
