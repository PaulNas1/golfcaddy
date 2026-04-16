import type {
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

export function getEffectiveCourseHoles(round: Round) {
  const baseHoles =
    round.courseHoles && round.courseHoles.length === 18
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
