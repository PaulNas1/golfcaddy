import {
  calculatePlayingHandicap,
  calculateStablefordPoints,
  calculateStrokesReceived,
} from "./scoring.ts";
import type {
  AppUser,
  HandicapMode,
  HoleScore,
  Scorecard,
  ScoringFormat,
} from "@/types";

// ─── Round reconciliation ───────────────────────────────────────────────────
//
// Rebuilds a round's scoring from the gross scores already entered, using a
// corrected handicap for each player.
//
// The chain this repairs, in order:
//
//   handicap index  (e.g. 19.4, the number that was wrong)
//     → calculatePlayingHandicap(index, slope, CR, par, gender)
//     → scorecard.handicapAtTime          ← stores the PLAYING handicap
//     → calculateStrokesReceived(playing, strokeIndex)  per hole
//     → calculateStablefordPoints(par, gross, strokes)  per hole
//     → card totals → rankings → ladder
//
// Gross scores are never touched: what a player actually hit is not in doubt.
// Slope, course rating and par are read off the scorecard, not the round, so
// a player on a different tee is recomputed against the tee they played.
//
// The supplied number can be either end of that chain:
//
//   "index"   — a handicap index (19.4). Converted per player against the tee
//               they played. Use this when the indexes themselves were wrong.
//   "playing" — an already-adjusted playing handicap (21). Used exactly as
//               given, no slope conversion. Use this when the adjusted figures
//               are already known — off a ladder or a printed card — and the
//               indexes behind them are not.

/** Which end of the chain the pasted number sits at. */
export type HandicapKind = "index" | "playing";

export interface HandicapEntry {
  name: string;
  /** An index or a playing handicap, per the run's `handicapKind`. */
  handicap: number;
}

export interface ReconcileHoleRow {
  holeNumber: number;
  par: number;
  strokeIndex: number;
  grossScore: number | null;
  previousStrokes: number;
  nextStrokes: number;
  previousPoints: number | null;
  nextPoints: number | null;
}

export interface ReconcileRow {
  scorecardId: string;
  playerId: string;
  playerName: string;
  /** The number this was rebuilt from. Null when none was supplied. */
  suppliedHandicap: number | null;
  previousPlayingHandicap: number;
  nextPlayingHandicap: number;
  previousStableford: number | null;
  nextStableford: number;
  previousGross: number | null;
  nextGross: number;
  /** Optional cross-check from the admin's spreadsheet. */
  expectedStableford: number | null;
  holes: ReconcileHoleRow[];
  issues: string[];
  changed: boolean;
}

export interface ReconcileResult {
  rows: ReconcileRow[];
  /** Supplied handicaps that matched nobody on the round. */
  unmatchedNames: string[];
  /** Players on the round with no handicap supplied — left untouched. */
  missingHandicapFor: string[];
}

// ─── Parsing the pasted handicap list ───────────────────────────────────────

function normaliseName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Accepts the Members tab pasted straight out of the sheet.
 *
 * `Ash Grybas<tab>Official<tab>19.4` and `Ash Grybas, 19.4` both work: the
 * name is everything before the last number on the line, so a Status column
 * in between is ignored rather than mistaken for data.
 */
export function parseHandicapList(text: string): {
  entries: HandicapEntry[];
  errors: string[];
} {
  const entries: HandicapEntry[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();

  text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .forEach((line, position) => {
      const cells = line
        .split(/\t|,|;|\s{2,}/)
        .map((cell) => cell.trim())
        .filter((cell) => cell !== "");

      // Fall back to single-space splitting when the row has no real columns.
      const hasColumns = cells.length > 1;
      const parts = hasColumns ? cells : line.split(/\s+/);

      let handicap: number | null = null;
      let handicapAt = -1;
      for (let index = parts.length - 1; index >= 1; index -= 1) {
        const value = Number(parts[index]);
        if (Number.isFinite(value)) {
          handicap = value;
          handicapAt = index;
          break;
        }
      }

      // With real columns the name is the first cell, so a Status column in
      // between is skipped rather than glued onto the name. Only a row split
      // on single spaces needs everything before the number.
      const name = (
        hasColumns
          ? parts[0]
          : parts.slice(0, handicapAt === -1 ? parts.length : handicapAt).join(" ")
      ).trim();

      if (handicap == null || !name) {
        // A header row is a normal thing to paste; say so rather than failing.
        if (/\b(player|name|handicap|index|status)\b/i.test(line)) return;
        errors.push(`Line ${position + 1} ("${line}") — no name and handicap.`);
        return;
      }

      if (handicap < 0 || handicap > 54) {
        errors.push(`${name} — handicap ${handicap} is outside 0–54. Skipped.`);
        return;
      }

      const key = normaliseName(name);
      if (seen.has(key)) {
        errors.push(`${name} appears more than once. Using the first.`);
        return;
      }
      seen.add(key);
      entries.push({ name, handicap });
    });

  return { entries, errors };
}

/**
 * Match a spreadsheet name to a member.
 *
 * Tries the full display name, then the nickname the app shows on round
 * screens, then first name plus last initial. Never guesses on first name
 * alone — two Pauls and two Gregs in one group make that actively dangerous.
 */
export function matchMemberByName(
  name: string,
  members: AppUser[]
): AppUser | null {
  const target = normaliseName(name);

  const byDisplay = members.find(
    (member) => normaliseName(member.displayName) === target
  );
  if (byDisplay) return byDisplay;

  const byNickname = members.find(
    (member) => member.nickname && normaliseName(member.nickname) === target
  );
  if (byNickname) return byNickname;

  const [first, ...rest] = target.split(" ");
  const lastInitial = rest.length > 0 ? rest[rest.length - 1][0] : null;
  if (!lastInitial) return null;

  const candidates = members.filter((member) => {
    const parts = normaliseName(member.displayName).split(" ");
    return (
      parts[0] === first &&
      parts.length > 1 &&
      parts[parts.length - 1][0] === lastInitial
    );
  });

  return candidates.length === 1 ? candidates[0] : null;
}

// ─── Recomputation ──────────────────────────────────────────────────────────

export interface ReconcileInput {
  scorecards: Scorecard[];
  holeScoresByCardId: Record<string, HoleScore[]>;
  members: AppUser[];
  handicaps: HandicapEntry[];
  /**
   * How to read the supplied numbers. Defaults to "index", which is what the
   * chain above describes. "playing" skips the conversion entirely.
   */
  handicapKind?: HandicapKind;
  expectedStableford?: Record<string, number>;
  handicapMode: HandicapMode;
  format: ScoringFormat;
}

export function reconcileRound({
  scorecards,
  holeScoresByCardId,
  members,
  handicaps,
  handicapKind = "index",
  expectedStableford = {},
  handicapMode,
  format,
}: ReconcileInput): ReconcileResult {
  const membersByUid = new Map(members.map((member) => [member.uid, member]));

  // Resolve every supplied name to a player id up front, so an unmatched name
  // is reported rather than silently doing nothing.
  const handicapByPlayerId = new Map<string, number>();
  const expectedByPlayerId = new Map<string, number>();
  const unmatchedNames: string[] = [];

  handicaps.forEach((entry) => {
    const member = matchMemberByName(entry.name, members);
    if (!member) {
      unmatchedNames.push(entry.name);
      return;
    }
    handicapByPlayerId.set(member.uid, entry.handicap);
  });

  Object.entries(expectedStableford).forEach(([name, total]) => {
    const member = matchMemberByName(name, members);
    if (member) expectedByPlayerId.set(member.uid, total);
  });

  const missingHandicapFor: string[] = [];

  const rows = scorecards.map((scorecard) => {
    const member = membersByUid.get(scorecard.playerId);
    const playerName = member?.displayName ?? scorecard.playerId;
    const supplied = handicapByPlayerId.get(scorecard.playerId) ?? null;
    const issues: string[] = [];

    if (supplied == null) {
      missingHandicapFor.push(playerName);
      issues.push("No corrected handicap supplied — left untouched.");
    }

    // A playing handicap is a whole number of strokes. Rounding one silently
    // would change someone's points without saying so, so say so.
    if (
      supplied != null &&
      handicapKind === "playing" &&
      !Number.isInteger(supplied)
    ) {
      issues.push(
        `Playing handicap ${supplied} is not a whole number — used as ${Math.round(
          supplied
        )}.`
      );
    }

    // Slope, rating and par come off the scorecard: that is the tee this
    // player actually played, which may not be the round default. A playing
    // handicap has already been through that conversion, so it is taken as is.
    const nextPlayingHandicap =
      supplied == null
        ? scorecard.handicapAtTime
        : handicapKind === "playing"
        ? Math.max(0, Math.round(supplied))
        : calculatePlayingHandicap({
            handicap: supplied,
            mode: handicapMode,
            slopeRating: scorecard.slopeRating,
            courseRating: scorecard.courseRating,
            coursePar: scorecard.coursePar,
            gender: member?.gender ?? null,
          });

    const holes = (holeScoresByCardId[scorecard.id] ?? [])
      .slice()
      .sort((a, b) => a.holeNumber - b.holeNumber);

    if (holes.length === 0) issues.push("No hole scores recorded.");

    const holeRows: ReconcileHoleRow[] = holes.map((hole) => {
      const nextStrokes = calculateStrokesReceived(
        nextPlayingHandicap,
        hole.strokeIndex
      );
      const nextPoints =
        hole.grossScore == null
          ? null
          : calculateStablefordPoints(hole.par, hole.grossScore, nextStrokes);

      return {
        holeNumber: hole.holeNumber,
        par: hole.par,
        strokeIndex: hole.strokeIndex,
        grossScore: hole.grossScore,
        previousStrokes: hole.strokesReceived,
        nextStrokes,
        previousPoints: hole.stablefordPoints,
        nextPoints,
      };
    });

    const unscored = holeRows.filter((hole) => hole.grossScore == null);
    if (holes.length > 0 && unscored.length > 0) {
      issues.push(
        `${unscored.length} hole${unscored.length === 1 ? "" : "s"} with no gross score.`
      );
    }

    const nextGross = holeRows.reduce(
      (total, hole) => total + (hole.grossScore ?? 0),
      0
    );
    const nextStableford = holeRows.reduce(
      (total, hole) => total + (hole.nextPoints ?? 0),
      0
    );

    const expected = expectedByPlayerId.get(scorecard.playerId) ?? null;
    if (expected != null && format === "stableford" && expected !== nextStableford) {
      issues.push(
        `Recomputed ${nextStableford} but the spreadsheet says ${expected} (difference ${
          nextStableford - expected > 0 ? "+" : ""
        }${nextStableford - expected}).`
      );
    }

    const changed =
      nextPlayingHandicap !== scorecard.handicapAtTime ||
      nextStableford !== (scorecard.totalStableford ?? 0) ||
      holeRows.some(
        (hole) =>
          hole.nextStrokes !== hole.previousStrokes ||
          hole.nextPoints !== hole.previousPoints
      );

    return {
      scorecardId: scorecard.id,
      playerId: scorecard.playerId,
      playerName,
      suppliedHandicap: supplied,
      previousPlayingHandicap: scorecard.handicapAtTime,
      nextPlayingHandicap,
      previousStableford: scorecard.totalStableford,
      nextStableford,
      previousGross: scorecard.totalGross,
      nextGross,
      expectedStableford: expected,
      holes: holeRows,
      issues,
      changed,
    };
  });

  return { rows, unmatchedNames, missingHandicapFor };
}

export interface ReconcileSummary {
  cards: number;
  changed: number;
  withIssues: number;
  handicapsChanged: number;
  matchesSpreadsheet: number;
  disagreesWithSpreadsheet: number;
}

export function summariseReconcile(rows: ReconcileRow[]): ReconcileSummary {
  return {
    cards: rows.length,
    changed: rows.filter((row) => row.changed).length,
    withIssues: rows.filter((row) => row.issues.length > 0).length,
    handicapsChanged: rows.filter(
      (row) => row.nextPlayingHandicap !== row.previousPlayingHandicap
    ).length,
    matchesSpreadsheet: rows.filter(
      (row) =>
        row.expectedStableford != null &&
        row.expectedStableford === row.nextStableford
    ).length,
    disagreesWithSpreadsheet: rows.filter(
      (row) =>
        row.expectedStableford != null &&
        row.expectedStableford !== row.nextStableford
    ).length,
  };
}
