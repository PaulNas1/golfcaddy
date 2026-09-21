import {
  blankHoles,
  normaliseHoles,
  validateStrokeIndex,
  validateStrokeIndexNotSequential,
} from "./courseValidation.ts";
import { courseHoleToTeeHole } from "./courseSnapshot.ts";
import type { CourseHole, Round, TeeGender, TeeHole } from "@/types";

// ─── Migration (Brief 1 §6) ─────────────────────────────────────────────────
//
// Two passes. The first writes nothing.
//
// Pass 1 reads every round and every saved correction and reports what data
// each round actually holds. `indexSequential` means the round currently holds
// fabricated stroke index — hole number wearing a stroke index's clothes — and
// must be fixed before freezing.
//
// Pass 2 builds the course catalogue from what was found, Paul corrects each
// tee in the editor until it passes V1 and V2, and only then are snapshots
// frozen onto the rounds.

/**
 * The pre-Brief-1 `groups/{groupId}/courseCorrections` shape.
 *
 * Deliberately redeclared here rather than kept in `types`: migration code is
 * the only thing that should still know this collection ever existed.
 */
export interface LegacyCorrection {
  teeSetId: string;
  courseName: string;
  teeSetName: string;
  correctedCourseRating: number | null;
  correctedSlopeRating: number | null;
  holeCorrections: { holeNumber: number; strokeIndex: number; par: number }[];
}

export type IndexSource =
  | "snapshot"
  | "round holes"
  | "saved correction"
  | "none";

export interface MigrationRow {
  roundId: string;
  roundNumber: number;
  season: number;
  date: Date;
  status: Round["status"];
  courseName: string;
  teeName: string;
  indexSource: IndexSource;
  indexValid: boolean;
  indexSequential: boolean;
  distancesPresent: boolean;
  holeCount: number;
  hasSnapshot: boolean;
  /** True when this round must be fixed before its snapshot can be frozen. */
  needsFix: boolean;
}

const UNKNOWN_COURSE = "(no course name)";
const UNKNOWN_TEE = "(no tee)";

function correctionKey(courseName: string, teeName: string): string {
  return `${courseName.trim().toLowerCase()}::${teeName.trim().toLowerCase()}`;
}

/** Corrections are keyed by tee-set id *and* matched by name, since the ids
 *  were GolfCourseAPI ids that no longer mean anything. */
function findCorrection(
  corrections: LegacyCorrection[],
  round: Pick<Round, "courseName" | "teeSetId" | "teeSetName">
): LegacyCorrection | null {
  if (round.teeSetId) {
    const byId = corrections.find((c) => c.teeSetId === round.teeSetId);
    if (byId) return byId;
  }
  if (round.teeSetName) {
    const key = correctionKey(round.courseName, round.teeSetName);
    const byName = corrections.find(
      (c) => correctionKey(c.courseName, c.teeSetName) === key
    );
    if (byName) return byName;
  }
  return null;
}

function correctionToHoles(
  correction: LegacyCorrection,
  distanceSource: CourseHole[]
): TeeHole[] {
  const metresByHole = new Map(
    distanceSource.map((hole) => [hole.number, hole.distanceMeters ?? 0])
  );

  return correction.holeCorrections
    .slice()
    .sort((a, b) => a.holeNumber - b.holeNumber)
    .map((item) => ({
      hole: item.holeNumber,
      par: item.par,
      index: item.strokeIndex,
      metres: metresByHole.get(item.holeNumber) ?? 0,
    }));
}

/** Where a round's stroke index actually comes from today, and whether it is real. */
export function resolveRoundHoles(
  round: Round,
  corrections: LegacyCorrection[]
): { holes: TeeHole[]; source: IndexSource } {
  if (round.courseSnapshot && round.courseSnapshot.tees.length > 0) {
    const defaultTee =
      round.courseSnapshot.tees.find((tee) => tee.teeId === round.teeSetId) ??
      round.courseSnapshot.tees[0];
    return { holes: defaultTee.holes, source: "snapshot" };
  }

  if (round.courseHoles.length > 0) {
    return { holes: round.courseHoles.map(courseHoleToTeeHole), source: "round holes" };
  }

  const correction = findCorrection(corrections, round);
  if (correction && correction.holeCorrections.length > 0) {
    return {
      holes: correctionToHoles(correction, round.courseHoles),
      source: "saved correction",
    };
  }

  return { holes: [], source: "none" };
}

/** Pass 1 — the report. Writes nothing. */
export function buildMigrationReport(
  rounds: Round[],
  corrections: LegacyCorrection[]
): MigrationRow[] {
  return rounds
    .slice()
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .map((round) => {
      const { holes, source } = resolveRoundHoles(round, corrections);
      const holeCount = holes.length || round.courseSnapshot?.holeCount || 18;
      const indexValid =
        holes.length > 0 &&
        validateStrokeIndex(holes, holeCount).length === 0;
      const indexSequential =
        holes.length > 0 &&
        validateStrokeIndexNotSequential(holes, holeCount).length > 0;
      const distancesPresent =
        holes.length > 0 && holes.every((hole) => hole.metres > 0);

      return {
        roundId: round.id,
        roundNumber: round.roundNumber,
        season: round.season,
        date: round.date,
        status: round.status,
        courseName: round.courseName || UNKNOWN_COURSE,
        teeName: round.teeSetName || UNKNOWN_TEE,
        indexSource: source,
        indexValid,
        indexSequential,
        distancesPresent,
        holeCount,
        hasSnapshot: !!round.courseSnapshot,
        // A round is fine only when its index is a real permutation that is
        // not simply the hole numbers.
        needsFix: !indexValid || indexSequential,
      };
    });
}

export interface ReportSummary {
  total: number;
  withSnapshot: number;
  sequentialIndex: number;
  invalidIndex: number;
  missingDistances: number;
  needsFix: number;
}

export function summariseReport(rows: MigrationRow[]): ReportSummary {
  return {
    total: rows.length,
    withSnapshot: rows.filter((row) => row.hasSnapshot).length,
    sequentialIndex: rows.filter((row) => row.indexSequential).length,
    invalidIndex: rows.filter((row) => !row.indexValid).length,
    missingDistances: rows.filter((row) => !row.distancesPresent).length,
    needsFix: rows.filter((row) => row.needsFix).length,
  };
}

// ─── Pass 2a — plan the catalogue ───────────────────────────────────────────

export interface PlannedTee {
  name: string;
  gender: TeeGender;
  courseRating: number | null;
  slope: number | null;
  holes: TeeHole[];
  source: IndexSource;
  roundIds: string[];
}

export interface PlannedCourse {
  name: string;
  location: string | null;
  holeCount: number;
  tees: PlannedTee[];
}

function guessGender(teeName: string): TeeGender {
  const name = teeName.toLowerCase();
  if (/\b(women|womens|women's|ladies|red)\b/.test(name)) return "women";
  if (/\b(men|mens|men's)\b/.test(name)) return "men";
  return "men";
}

/**
 * Pass 2a — the distinct (course, tee) pairs found across all rounds, seeded
 * with saved corrections where they exist.
 *
 * Nothing is fabricated: a pair with no usable hole data gets a blank card,
 * which V1 blocks, so it has to be typed in before it can be saved.
 */
export function planCatalogue(
  rounds: Round[],
  corrections: LegacyCorrection[]
): PlannedCourse[] {
  const courses = new Map<string, PlannedCourse>();

  rounds.forEach((round) => {
    const courseName = round.courseName?.trim() || UNKNOWN_COURSE;
    const teeName = round.teeSetName?.trim() || UNKNOWN_TEE;
    const courseKey = courseName.toLowerCase();

    const { holes, source } = resolveRoundHoles(round, corrections);
    const correction = findCorrection(corrections, round);
    const holeCount =
      holes.length > 0 ? holes.length : round.courseSnapshot?.holeCount ?? 18;

    let course = courses.get(courseKey);
    if (!course) {
      course = { name: courseName, location: null, holeCount, tees: [] };
      courses.set(courseKey, course);
    }

    const existing = course.tees.find(
      (tee) => tee.name.toLowerCase() === teeName.toLowerCase()
    );

    if (existing) {
      existing.roundIds.push(round.id);
      // Prefer the round that actually carries hole data.
      if (existing.source === "none" && source !== "none") {
        existing.holes = normaliseHoles(holes, course.holeCount);
        existing.source = source;
      }
      existing.courseRating = existing.courseRating ?? round.courseRating;
      existing.slope = existing.slope ?? round.slopeRating;
      return;
    }

    course.tees.push({
      name: teeName,
      gender: guessGender(teeName),
      courseRating: correction?.correctedCourseRating ?? round.courseRating,
      slope: correction?.correctedSlopeRating ?? round.slopeRating,
      holes:
        holes.length > 0
          ? normaliseHoles(holes, course.holeCount)
          : blankHoles(course.holeCount),
      source,
      roundIds: [round.id],
    });
  });

  return Array.from(courses.values()).sort((a, b) =>
    a.name.localeCompare(b.name)
  );
}

// ─── Pass 2b — freeze snapshots ─────────────────────────────────────────────

export interface FreezePlanRow {
  roundId: string;
  roundNumber: number;
  season: number;
  courseName: string;
  teeName: string;
  /** Null when no catalogue course matches, or its tees fail V1. */
  courseId: string | null;
  teeId: string | null;
  blocked: boolean;
  reason: string | null;
}

/**
 * Step 4's assertion, run *before* anything is written: every round must map
 * to a catalogue course whose tees all pass V1, or it is left alone and named.
 */
export function planFreeze(
  rounds: Round[],
  catalogue: {
    id: string;
    name: string;
    holeCount: number;
    tees: { id: string; name: string; holes: TeeHole[] }[];
  }[]
): FreezePlanRow[] {
  return rounds.map((round) => {
    const base = {
      roundId: round.id,
      roundNumber: round.roundNumber,
      season: round.season,
      courseName: round.courseName || UNKNOWN_COURSE,
      teeName: round.teeSetName || UNKNOWN_TEE,
    };

    const course = catalogue.find(
      (entry) =>
        entry.name.trim().toLowerCase() ===
        (round.courseName || UNKNOWN_COURSE).trim().toLowerCase()
    );

    if (!course) {
      return {
        ...base,
        courseId: null,
        teeId: null,
        blocked: true,
        reason: "No course in the catalogue matches this round's course name.",
      };
    }

    if (course.tees.length === 0) {
      return {
        ...base,
        courseId: course.id,
        teeId: null,
        blocked: true,
        reason: "That course has no tees yet.",
      };
    }

    const badTees = course.tees.filter(
      (tee) => validateStrokeIndex(tee.holes, course.holeCount).length > 0
    );
    if (badTees.length > 0) {
      return {
        ...base,
        courseId: course.id,
        teeId: null,
        blocked: true,
        reason: `Fix the stroke index on: ${badTees
          .map((tee) => tee.name)
          .join(", ")}.`,
      };
    }

    const tee =
      course.tees.find(
        (entry) =>
          entry.name.trim().toLowerCase() ===
          (round.teeSetName || UNKNOWN_TEE).trim().toLowerCase()
      ) ?? course.tees[0];

    return {
      ...base,
      courseId: course.id,
      teeId: tee.id,
      blocked: false,
      reason:
        round.teeSetName &&
        tee.name.trim().toLowerCase() !== round.teeSetName.trim().toLowerCase()
          ? `No tee named "${round.teeSetName}" — will use "${tee.name}".`
          : null,
    };
  });
}
