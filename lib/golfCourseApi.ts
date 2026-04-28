import "server-only";

import type { CourseHole, CourseTeeSet, HoleType } from "@/types";
import type { SeededCourse } from "@/lib/courseData";

const GOLF_COURSE_API_BASE_URL = "https://api.golfcourseapi.com";
const GOLF_COURSE_API_DOCS_URL = "https://api.golfcourseapi.com/docs/api/";
const SEARCH_CACHE_SECONDS = 60 * 60 * 24;
const COURSE_CACHE_SECONDS = 60 * 60 * 24 * 7;

type GolfCourseApiHole = {
  par?: number;
  yardage?: number;
  handicap?: number;
};

type GolfCourseApiTeeBox = {
  tee_name?: string;
  course_rating?: number;
  slope_rating?: number;
  total_meters?: number;
  total_yards?: number;
  number_of_holes?: number;
  par_total?: number;
  holes?: GolfCourseApiHole[];
};

type GolfCourseApiCourse = {
  id: number;
  club_name?: string;
  course_name?: string;
  location?: {
    address?: string;
    city?: string;
    state?: string;
    country?: string;
    latitude?: number;
    longitude?: number;
  };
  tees?: {
    female?: GolfCourseApiTeeBox[];
    male?: GolfCourseApiTeeBox[];
  };
};

type GolfCourseApiSearchResponse = {
  courses?: GolfCourseApiCourse[];
};

function getApiKey() {
  return process.env.GOLFCOURSE_API_KEY ?? "";
}

export function isGolfCourseApiConfigured() {
  return Boolean(getApiKey());
}

function getCourseName(course: GolfCourseApiCourse) {
  const clubName = course.club_name?.trim();
  const courseName = course.course_name?.trim();

  if (clubName && courseName && clubName !== courseName) {
    return `${clubName} - ${courseName}`;
  }

  return clubName || courseName || `Golf course ${course.id}`;
}

function getCourseLocation(course: GolfCourseApiCourse) {
  const location = course.location;
  if (!location) return "Location unavailable";

  const parts = [location.city, location.state, location.country]
    .filter(Boolean)
    .join(", ");

  return parts || location.address || "Location unavailable";
}

function normalizeId(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function holeType(par: number): HoleType {
  if (par === 3) return "par3";
  if (par === 5) return "par5";
  return "par4";
}

function yardsToMeters(yards: number | undefined) {
  return typeof yards === "number" ? Math.round(yards * 0.9144) : undefined;
}

function normalizeTeeSet(
  course: GolfCourseApiCourse,
  tee: GolfCourseApiTeeBox,
  gender: CourseTeeSet["gender"]
): CourseTeeSet | null {
  const rawHoles = tee.holes ?? [];
  if (rawHoles.length !== 18) return null;

  const holes: CourseHole[] = rawHoles.map((hole, index) => {
    const par = hole.par ?? 4;
    return {
      number: index + 1,
      par,
      // hole.handicap is the stroke index from the API.
      // Use || (not ??) so that 0 is also treated as "not provided" —
      // valid stroke indexes run 1–18, never 0.
      strokeIndex: hole.handicap || index + 1,
      type: holeType(par),
      distanceMeters: yardsToMeters(hole.yardage),
    };
  });
  const teeName = tee.tee_name?.trim() || `${gender} tee`;
  const totalMeters = tee.total_meters ?? yardsToMeters(tee.total_yards) ?? 0;

  return {
    id: `golfcourseapi-${course.id}-${gender}-${normalizeId(teeName)}`,
    name: teeName,
    gender,
    par: tee.par_total ?? holes.reduce((total, hole) => total + hole.par, 0),
    distanceMeters: totalMeters,
    courseRating: tee.course_rating ?? null,
    slopeRating: tee.slope_rating ?? null,
    holes,
    source: {
      provider: "GolfCourseAPI",
      url: GOLF_COURSE_API_DOCS_URL,
      lastVerified: new Date().toISOString().slice(0, 10),
      confidence: "provider",
    },
  };
}

function normalizeCourse(course: GolfCourseApiCourse): SeededCourse {
  const maleTees =
    course.tees?.male
      ?.map((tee) => normalizeTeeSet(course, tee, "men"))
      .filter((tee): tee is CourseTeeSet => Boolean(tee)) ?? [];
  const femaleTees =
    course.tees?.female
      ?.map((tee) => normalizeTeeSet(course, tee, "women"))
      .filter((tee): tee is CourseTeeSet => Boolean(tee)) ?? [];
  const name = getCourseName(course);

  return {
    id: `golfcourseapi-${course.id}`,
    apiId: course.id,
    catalogueSource: "golfcourseapi",
    name,
    location: getCourseLocation(course),
    aliases: [course.club_name, course.course_name].filter(
      (value): value is string => Boolean(value)
    ),
    teeSets: [...maleTees, ...femaleTees],
  };
}

async function golfCourseApiFetch<T>(
  path: string,
  cacheSeconds: number
): Promise<T> {
  const response = await fetch(`${GOLF_COURSE_API_BASE_URL}${path}`, {
    headers: {
      Authorization: `Key ${getApiKey()}`,
      Accept: "application/json",
    },
    next: { revalidate: cacheSeconds },
  });

  if (!response.ok) {
    throw new Error(`GolfCourseAPI returned HTTP ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export async function searchGolfCourseApiCourses(query: string) {
  if (!isGolfCourseApiConfigured()) return [];

  const payload = await golfCourseApiFetch<GolfCourseApiSearchResponse>(
    `/v1/search?search_query=${encodeURIComponent(query)}`,
    SEARCH_CACHE_SECONDS
  );

  return (payload.courses ?? []).map(normalizeCourse);
}

export async function getGolfCourseApiCourse(id: number) {
  if (!isGolfCourseApiConfigured()) return null;

  const course = await golfCourseApiFetch<GolfCourseApiCourse>(
    `/v1/courses/${id}`,
    COURSE_CACHE_SECONDS
  );

  return normalizeCourse(course);
}
