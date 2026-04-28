import type {
  AppUser,
  CourseHole,
  CourseTeeSet,
  HoleOverride,
  HoleType,
  Round,
  SpecialHoles,
} from "@/types";

export type SeededCourse = {
  id: string;
  apiId?: number;
  catalogueSource?: "golfcourseapi";
  name: string;
  location: string;
  aliases: string[];
  teeSets: CourseTeeSet[];
};

const DEFAULT_NTP_HOLES = [3, 6, 12, 16];

function holeType(par: number): HoleType {
  if (par === 3) return "par3";
  if (par === 5) return "par5";
  return "par4";
}

export function getCourseSearchLabel(course: SeededCourse) {
  return `${course.name} - ${course.location}`;
}

export function getParThreeHoles(teeSet: CourseTeeSet) {
  return teeSet.holes
    .filter((hole) => hole.par === 3)
    .map((hole) => hole.number);
}

export function getHoleOptionLabel(
  hole: Pick<CourseHole, "number" | "par" | "strokeIndex" | "distanceMeters">
) {
  return [
    `Hole ${hole.number}`,
    `Par ${hole.par}`,
    `SI ${hole.strokeIndex}`,
    hole.distanceMeters ? `${hole.distanceMeters}m` : null,
  ]
    .filter(Boolean)
    .join(" - ");
}

export function getDriveHoleOptions(holes: CourseHole[]) {
  return holes.filter((hole) => hole.par >= 4);
}

export function getRoundTeeSets(round: Round): CourseTeeSet[] {
  if (round.availableTeeSets && round.availableTeeSets.length > 0) {
    return round.availableTeeSets;
  }

  if (round.courseHoles && round.courseHoles.length === 18) {
    return [
      {
        id: round.teeSetId ?? "round-default",
        name: round.teeSetName ?? "Round default",
        gender: "mixed",
        par:
          round.coursePar ??
          round.courseHoles.reduce((total, hole) => total + hole.par, 0),
        distanceMeters: round.courseHoles.reduce(
          (total, hole) => total + (hole.distanceMeters ?? 0),
          0
        ),
        courseRating: round.courseRating,
        slopeRating: round.slopeRating,
        holes: round.courseHoles,
        source:
          round.courseSource ?? {
            provider: "Round data",
            url: "",
            lastVerified: new Date().toISOString().slice(0, 10),
            confidence: "admin_verified",
          },
      },
    ];
  }

  return [];
}

function getTeeSetLabelScore(teeSet: CourseTeeSet) {
  const name = teeSet.name.toLowerCase();
  let score = 0;

  if (/\b(standard|regular|member|members|medal)\b/.test(name)) score += 40;
  if (/\bblue\b/.test(name)) score += 20;
  if (/\bwhite\b/.test(name)) score -= 5;
  if (/\b(senior|forward|front)\b/.test(name)) score -= 30;
  if (/\b(pro|back|champ|championship|black|gold)\b/.test(name)) score -= 35;

  return score;
}

export function getPreferredDefaultTeeSet(teeSets: CourseTeeSet[]) {
  if (teeSets.length === 0) return null;

  const menTeeSets = teeSets.filter((teeSet) => teeSet.gender === "men");
  const mixedTeeSets = teeSets.filter((teeSet) => teeSet.gender === "mixed");
  const relevantTeeSets =
    menTeeSets.length > 0
      ? menTeeSets
      : mixedTeeSets.length > 0
      ? mixedTeeSets
      : teeSets;

  if (relevantTeeSets.length === 1) return relevantTeeSets[0];

  const sortedDistances = relevantTeeSets
    .map((teeSet) => teeSet.distanceMeters)
    .sort((a, b) => a - b);
  const medianDistance =
    sortedDistances[Math.floor(sortedDistances.length / 2)] ?? 0;

  return [...relevantTeeSets].sort((a, b) => {
    const scoreDifference =
      getTeeSetLabelScore(b) - getTeeSetLabelScore(a);
    if (scoreDifference !== 0) return scoreDifference;

    const medianDistanceDifference =
      Math.abs(a.distanceMeters - medianDistance) -
      Math.abs(b.distanceMeters - medianDistance);
    if (medianDistanceDifference !== 0) return medianDistanceDifference;

    return b.distanceMeters - a.distanceMeters;
  })[0];
}

export function getRoundDefaultTeeSet(round: Round) {
  const teeSets = getRoundTeeSets(round);
  return (
    teeSets.find((teeSet) => teeSet.id === round.teeSetId) ??
    getPreferredDefaultTeeSet(teeSets) ??
    null
  );
}

export function getPlayerTeeSet(round: Round, playerId?: string | null) {
  const teeSets = getRoundTeeSets(round);
  const assignedTeeSetId = playerId
    ? round.playerTeeAssignments?.[playerId]
    : null;

  return (
    teeSets.find((teeSet) => teeSet.id === assignedTeeSetId) ??
    getRoundDefaultTeeSet(round)
  );
}

export function applyHoleOverrides(
  holes: CourseHole[],
  overrides: HoleOverride[] = []
) {
  if (overrides.length === 0) return holes;
  const overridesByHole = new Map(
    overrides.map((override) => [override.holeNumber, override])
  );

  return holes.map((hole) => {
    const override = overridesByHole.get(hole.number);
    if (!override) return hole;

    return {
      ...hole,
      par: override.overridePar,
      type: holeType(override.overridePar),
    };
  });
}

export function getEffectiveCourseHoles(
  round: Round,
  playerId?: string | null
) {
  const playerTeeSet = getPlayerTeeSet(round, playerId);
  const baseHoles =
    playerTeeSet?.holes && playerTeeSet.holes.length === 18
      ? playerTeeSet.holes
      : round.courseHoles && round.courseHoles.length === 18
      ? round.courseHoles
      : getFallbackCourseHoles();

  return applyHoleOverrides(baseHoles, round.holeOverrides);
}

export function getEffectiveSpecialHoles(round: Round): SpecialHoles {
  return {
    ...round.specialHoles,
    ntp: getEffectiveCourseHoles(round)
      .filter((hole) => hole.par === 3)
      .map((hole) => hole.number),
  };
}

function arraysEqual(a: number[], b: number[]) {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function normalizeSpecialHoles(
  specialHoles: SpecialHoles | undefined,
  courseHoles: CourseHole[]
): SpecialHoles {
  const existing = specialHoles ?? {
    ntp: DEFAULT_NTP_HOLES,
    ld: null,
    t2: null,
    t3: null,
  };
  const existingNtp = existing.ntp ?? [];
  const parThreeHoles =
    courseHoles.length === 18
      ? courseHoles.filter((hole) => hole.par === 3).map((hole) => hole.number)
      : [];
  const shouldUseCourseNtp =
    parThreeHoles.length > 0 &&
    (existingNtp.length === 0 || arraysEqual(existingNtp, DEFAULT_NTP_HOLES));

  return {
    ...existing,
    ntp: shouldUseCourseNtp ? parThreeHoles : existingNtp,
  };
}

export function withSeededCourseData(round: Round): Round {
  const courseHoles =
    round.courseHoles && round.courseHoles.length === 18
      ? round.courseHoles
      : [];
  const roundWithCourseHoles = {
    ...round,
    courseHoles,
  };

  return {
    ...roundWithCourseHoles,
    courseHoles,
    specialHoles:
      round.holeOverrides && round.holeOverrides.length > 0
        ? getEffectiveSpecialHoles(roundWithCourseHoles)
        : normalizeSpecialHoles(round.specialHoles, courseHoles),
  };
}

/**
 * Resolve which 18 holes a viewer should see on the Course Card.
 *
 * Priority:
 * 1. If the round has a player tee assignment for this user → use that tee set's holes
 * 2. Otherwise fall back to round.courseHoles (the default tee set)
 *
 * Returns the holes plus an optional note to display when the user might
 * eventually get a different assignment (female / senior / pro player on default tees).
 */
export function getViewerHoles(
  round: Round,
  viewer: AppUser | null
): { holes: CourseHole[]; note: string | null } {
  const assignedTeeSetId =
    viewer?.uid ? (round.playerTeeAssignments ?? {})[viewer.uid] : null;

  if (assignedTeeSetId) {
    const assigned = (round.availableTeeSets ?? []).find(
      (ts) => ts.id === assignedTeeSetId
    );
    if (assigned && assigned.holes.length === 18) {
      return { holes: assigned.holes, note: null };
    }
  }

  // Fall back to round default holes
  const holes = round.courseHoles.length === 18 ? round.courseHoles : [];
  if (!holes.length) return { holes: [], note: null };

  // If this user typically plays a different tee set (female / senior / pro)
  // but hasn't been assigned one yet, show a note.
  const mightDiffer =
    viewer &&
    !assignedTeeSetId &&
    (viewer.gender === "female" ||
      viewer.usesSeniorTees === true ||
      viewer.usesProBackTees === true);

  const note = mightDiffer
    ? "Showing default tee set · your tee assignment may be updated once you RSVP and admin confirms."
    : null;

  return { holes, note };
}

export function getFallbackCourseHoles(): CourseHole[] {
  return Array.from({ length: 18 }, (_, index) => {
    const number = index + 1;
    const par = [3, 6, 12, 16].includes(number) ? 3 : 4;
    return {
      number,
      par,
      strokeIndex: number,
      type: holeType(par),
    };
  });
}
