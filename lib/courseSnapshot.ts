import { sumMetres, sumPar } from "./courseValidation.ts";
import type {
  Course,
  CourseDataSource,
  CourseHole,
  CourseSnapshot,
  CourseTee,
  CourseTeeSet,
  HoleType,
  SnapshotTee,
  TeeHole,
} from "@/types";

// ─── Snapshotting (Brief 1 §3) ──────────────────────────────────────────────
//
// R1 — the snapshot is the only scoring source. Nothing that computes a score,
//      a Stableford point, a ladder position or a handicap may read the live
//      course catalogue. `round.courseId` is for display and grouping only.
// R2 — the snapshot is written on round create.
// R3 — it may be rewritten only while the round is unplayed.
// R4 — once status leaves 'upcoming' it is immutable (firestore.rules).
//
// Every tee on the course is copied, not just the default. That single choice
// is what lets a mixed men's/women's group score off different tees without a
// second mechanism: a player on the Women's Red resolves par, index and slope
// from `courseSnapshot.tees.find(t => t.teeId === playerTeeId)`.

const SNAPSHOT_SOURCE: CourseDataSource = {
  provider: "Course catalogue",
  url: "",
  lastVerified: "",
  confidence: "admin_verified",
};

function holeType(par: number): HoleType {
  if (par === 3) return "par3";
  if (par === 5) return "par5";
  return "par4";
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Copy a catalogue tee into its frozen form. Deep — no shared arrays. */
export function freezeTee(tee: CourseTee): SnapshotTee {
  return {
    teeId: tee.id,
    name: tee.name,
    gender: tee.gender,
    courseRating: tee.courseRating,
    slope: tee.slope,
    par: sumPar(tee.holes),
    holes: tee.holes.map((hole) => ({
      hole: hole.hole,
      par: hole.par,
      index: hole.index,
      metres: hole.metres,
    })),
  };
}

/** R2 — build the frozen snapshot written onto a round at creation. */
export function buildCourseSnapshot(
  course: Pick<Course, "id" | "name" | "holeCount">,
  tees: CourseTee[],
  snapshotAt: Date = new Date()
): CourseSnapshot {
  return {
    courseId: course.id,
    courseName: course.name,
    holeCount: course.holeCount,
    snapshotAt,
    tees: tees
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(freezeTee),
  };
}

/**
 * Resolve the tee a player scores off.
 *
 * Falls back to the round's default tee, then to the first tee in the
 * snapshot — never to a fabricated card.
 */
export function resolveSnapshotTee(
  snapshot: CourseSnapshot | null | undefined,
  teeId: string | null | undefined,
  defaultTeeId?: string | null
): SnapshotTee | null {
  if (!snapshot || snapshot.tees.length === 0) return null;
  return (
    snapshot.tees.find((tee) => tee.teeId === teeId) ??
    snapshot.tees.find((tee) => tee.teeId === defaultTeeId) ??
    snapshot.tees[0]
  );
}

// ─── Bridges to the legacy round fields ─────────────────────────────────────
//
// Rounds carry both the snapshot and the pre-Brief-1 `courseHoles` /
// `availableTeeSets` fields, so every existing read path keeps working while
// the snapshot becomes the preferred source. These convert between the two
// shapes; the legacy fields are always *derived* from the snapshot, never
// authored independently.

export function teeHoleToCourseHole(hole: TeeHole): CourseHole {
  return {
    number: hole.hole,
    par: hole.par,
    strokeIndex: hole.index,
    type: holeType(hole.par),
    ...(hole.metres > 0 ? { distanceMeters: hole.metres } : {}),
  };
}

export function courseHoleToTeeHole(hole: CourseHole): TeeHole {
  return {
    hole: hole.number,
    par: hole.par,
    index: hole.strokeIndex,
    metres: hole.distanceMeters ?? 0,
  };
}

export function snapshotTeeToCourseHoles(tee: SnapshotTee): CourseHole[] {
  return tee.holes.map(teeHoleToCourseHole);
}

export function snapshotTeeToTeeSet(
  tee: SnapshotTee,
  snapshotAt: Date
): CourseTeeSet {
  return {
    id: tee.teeId,
    name: tee.name,
    gender: tee.gender,
    par: tee.par,
    distanceMeters: sumMetres(tee.holes),
    courseRating: tee.courseRating,
    slopeRating: tee.slope,
    holes: snapshotTeeToCourseHoles(tee),
    source: { ...SNAPSHOT_SOURCE, lastVerified: isoDay(snapshotAt) },
  };
}

export function snapshotToTeeSets(snapshot: CourseSnapshot): CourseTeeSet[] {
  return snapshot.tees.map((tee) => snapshotTeeToTeeSet(tee, snapshot.snapshotAt));
}

/**
 * The legacy round fields, derived from a snapshot.
 *
 * Written alongside `courseSnapshot` on every round save so that any read path
 * not yet migrated keeps rendering exactly the same data.
 */
export function legacyRoundFieldsFromSnapshot(
  snapshot: CourseSnapshot,
  defaultTeeId: string | null
): {
  teeSetId: string | null;
  teeSetName: string | null;
  coursePar: number | null;
  courseRating: number | null;
  slopeRating: number | null;
  courseHoles: CourseHole[];
  availableTeeSets: CourseTeeSet[];
  courseSource: CourseDataSource;
} {
  const defaultTee = resolveSnapshotTee(snapshot, defaultTeeId);

  return {
    teeSetId: defaultTee?.teeId ?? null,
    teeSetName: defaultTee?.name ?? null,
    coursePar: defaultTee ? defaultTee.par : null,
    courseRating: defaultTee?.courseRating ?? null,
    slopeRating: defaultTee?.slope ?? null,
    courseHoles: defaultTee ? snapshotTeeToCourseHoles(defaultTee) : [],
    availableTeeSets: snapshotToTeeSets(snapshot),
    courseSource: {
      ...SNAPSHOT_SOURCE,
      lastVerified: isoDay(snapshot.snapshotAt),
    },
  };
}

// ─── R3: re-snapshot while unplayed ─────────────────────────────────────────

export interface ResnapshotGate {
  allowed: boolean;
  reason: string | null;
}

/**
 * R3 — "Refresh course data" is permitted only while the round is `upcoming`
 * and no scorecards exist for it. This covers the real case of picking the
 * wrong tee, or fixing a course error before play.
 */
export function canResnapshot(
  status: string,
  scorecardCount: number
): ResnapshotGate {
  if (status !== "upcoming") {
    return {
      allowed: false,
      reason: `This round is ${status}. Course data is sealed once a round leaves upcoming, so past results can never change.`,
    };
  }
  if (scorecardCount > 0) {
    return {
      allowed: false,
      reason: `This round already has ${scorecardCount} scorecard${
        scorecardCount === 1 ? "" : "s"
      }. Delete them first if the course data really needs to change.`,
    };
  }
  return { allowed: true, reason: null };
}

export interface SnapshotDiffRow {
  teeName: string;
  kind: "added" | "removed" | "changed";
  changes: string[];
}

function describeTeeChanges(before: SnapshotTee, after: SnapshotTee): string[] {
  const changes: string[] = [];

  if (before.name !== after.name) {
    changes.push(`Name "${before.name}" → "${after.name}"`);
  }
  if (before.gender !== after.gender) {
    changes.push(`Gender ${before.gender} → ${after.gender}`);
  }
  if (before.courseRating !== after.courseRating) {
    changes.push(
      `Course rating ${before.courseRating ?? "—"} → ${after.courseRating ?? "—"}`
    );
  }
  if (before.slope !== after.slope) {
    changes.push(`Slope ${before.slope ?? "—"} → ${after.slope ?? "—"}`);
  }
  if (before.par !== after.par) {
    changes.push(`Par ${before.par} → ${after.par}`);
  }

  const afterByHole = new Map(after.holes.map((hole) => [hole.hole, hole]));
  const parChanges: string[] = [];
  const indexChanges: string[] = [];
  const metreChanges: string[] = [];

  before.holes.forEach((hole) => {
    const next = afterByHole.get(hole.hole);
    if (!next) return;
    if (hole.par !== next.par) {
      parChanges.push(`H${hole.hole} ${hole.par}→${next.par}`);
    }
    if (hole.index !== next.index) {
      indexChanges.push(`H${hole.hole} ${hole.index}→${next.index}`);
    }
    if (hole.metres !== next.metres) {
      metreChanges.push(`H${hole.hole} ${hole.metres}→${next.metres}`);
    }
  });

  if (parChanges.length > 0) changes.push(`Par: ${parChanges.join(", ")}`);
  if (indexChanges.length > 0) {
    changes.push(`Stroke index: ${indexChanges.join(", ")}`);
  }
  if (metreChanges.length > 0) {
    changes.push(`Distance: ${metreChanges.join(", ")}`);
  }

  return changes;
}

/**
 * R3 — what a "Refresh course data" would change, shown before applying.
 *
 * Tees are matched by id, so a renamed tee reads as a change rather than as a
 * removal plus an addition.
 */
export function diffSnapshots(
  before: CourseSnapshot | null | undefined,
  after: CourseSnapshot
): SnapshotDiffRow[] {
  const rows: SnapshotDiffRow[] = [];
  const beforeTees = before?.tees ?? [];
  const beforeById = new Map(beforeTees.map((tee) => [tee.teeId, tee]));
  const afterById = new Map(after.tees.map((tee) => [tee.teeId, tee]));

  after.tees.forEach((tee) => {
    const previous = beforeById.get(tee.teeId);
    if (!previous) {
      rows.push({
        teeName: tee.name,
        kind: "added",
        changes: [`New tee — par ${tee.par}, slope ${tee.slope ?? "—"}`],
      });
      return;
    }
    const changes = describeTeeChanges(previous, tee);
    if (changes.length > 0) {
      rows.push({ teeName: tee.name, kind: "changed", changes });
    }
  });

  beforeTees.forEach((tee) => {
    if (!afterById.has(tee.teeId)) {
      rows.push({
        teeName: tee.name,
        kind: "removed",
        changes: ["Tee no longer exists on this course"],
      });
    }
  });

  return rows;
}

// ─── Reading a snapshot back out ────────────────────────────────────────────

/** True when a snapshot's stroke index is a real permutation on every tee. */
export function snapshotIndexIsValid(snapshot: CourseSnapshot): boolean {
  return snapshot.tees.every((tee) => {
    if (tee.holes.length !== snapshot.holeCount) return false;
    const seen = new Set(tee.holes.map((hole) => hole.index));
    return (
      seen.size === snapshot.holeCount &&
      Array.from(seen).every(
        (index) => Number.isInteger(index) && index >= 1 && index <= snapshot.holeCount
      )
    );
  });
}

/** True when any tee's stroke index is just the hole number (the R1 bug). */
export function snapshotIndexIsSequential(snapshot: CourseSnapshot): boolean {
  return snapshot.tees.some(
    (tee) =>
      tee.holes.length > 0 &&
      tee.holes.every((hole, position) => hole.index === position + 1)
  );
}
