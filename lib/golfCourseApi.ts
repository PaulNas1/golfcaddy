import "server-only";

import type { CourseHole, CourseTeeSet, HoleType } from "@/types";
import type { SeededCourse } from "@/lib/courseData";
import {
  GolfCourseApiError,
  classifyHttpStatus,
  toGolfCourseApiFailure,
} from "@/lib/golfCourseApiError";
import {
  describePayloadShape,
  toGolfCourseApiTeeBoxes,
  unwrapGolfCourseApiCourse,
} from "@/lib/golfCourseApiPayload";
import { normalizeGolfCourseApiKey } from "@/lib/golfCourseApiKey";

const GOLF_COURSE_API_BASE_URL = "https://api.golfcourseapi.com";
const GOLF_COURSE_API_DOCS_URL = "https://api.golfcourseapi.com/docs/api/";
const SEARCH_CACHE_SECONDS = 60 * 60 * 24;
const COURSE_CACHE_SECONDS = 60 * 60 * 24 * 7;
const REQUEST_TIMEOUT_MS = 8000;

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
  // The provider moved from integer ids to alphanumeric ones ("j7rt0gct").
  // Accept both: rounds saved before the change still carry numeric ids.
  id: string | number;
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
  return normalizeGolfCourseApiKey(process.env.GOLFCOURSE_API_KEY);
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
  if (!tee || typeof tee !== "object") return null;

  const rawHoles = Array.isArray(tee.holes) ? tee.holes : [];
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

function normalizeTeeList(
  course: GolfCourseApiCourse,
  value: unknown,
  gender: CourseTeeSet["gender"]
): CourseTeeSet[] {
  if (value == null) return [];

  const teeBoxes = toGolfCourseApiTeeBoxes(value) as
    | GolfCourseApiTeeBox[]
    | null;

  if (!teeBoxes) {
    console.warn(
      `GolfCourseAPI course ${course.id}: ${gender} tees are ${describePayloadShape(
        value
      )}, expected a list`
    );
    return [];
  }

  if (!Array.isArray(value)) {
    console.warn(
      `GolfCourseAPI course ${course.id}: ${gender} tees arrived as ${describePayloadShape(
        value
      )}, read as ${teeBoxes.length} tee set(s)`
    );
  }

  const teeSets = teeBoxes
    .map((tee) => normalizeTeeSet(course, tee, gender))
    .filter((tee): tee is CourseTeeSet => Boolean(tee));

  // A tee set is dropped whenever its holes array is not exactly 18 long, and
  // that is silent by design. When it removes every one, say which hole counts
  // were rejected — otherwise this reaches an admin as "no 18-hole tee data"
  // while the request itself looks completely successful.
  if (teeBoxes.length > 0 && teeSets.length === 0) {
    const holeCounts = teeBoxes
      .map((tee) => (Array.isArray(tee?.holes) ? tee.holes.length : 0))
      .join(", ");

    console.warn(
      `GolfCourseAPI course ${course.id}: dropped all ${teeBoxes.length} ${gender} tee sets; hole counts were [${holeCounts}], 18 required`
    );
  }

  return teeSets;
}

function normalizeCourse(course: GolfCourseApiCourse): SeededCourse {
  const tees = course.tees as { male?: unknown; female?: unknown } | undefined;
  const maleTees = normalizeTeeList(course, tees?.male, "men");
  const femaleTees = normalizeTeeList(course, tees?.female, "women");
  const name = getCourseName(course);
  const teeSets = [...maleTees, ...femaleTees];

  return {
    id: `golfcourseapi-${course.id}`,
    apiId: String(course.id),
    catalogueSource: "golfcourseapi",
    name,
    location: getCourseLocation(course),
    aliases: [course.club_name, course.course_name].filter(
      (value): value is string => Boolean(value)
    ),
    teeSets,
  };
}

async function golfCourseApiFetch<T>(
  path: string,
  cacheSeconds: number
): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${GOLF_COURSE_API_BASE_URL}${path}`, {
      headers: {
        Authorization: `Key ${getApiKey()}`,
        Accept: "application/json",
      },
      // Without a timeout a slow provider stalls the route until the host kills
      // it, which reaches the browser as an HTML gateway page instead of our
      // JSON error shape. Next drops the signal when it revalidates in the
      // background, so this does not disable the data cache.
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      next: { revalidate: cacheSeconds },
    });
  } catch (error) {
    throw new GolfCourseApiError(
      toGolfCourseApiFailure(error),
      `GolfCourseAPI request to ${path} failed: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }

  if (!response.ok) {
    // The body normally explains the rejection ("invalid key", quota reached).
    // Keep a slice of it so the server log says why, not just that it failed.
    const detail = await response
      .text()
      .then((body) => body.trim().slice(0, 200))
      .catch(() => "");

    throw new GolfCourseApiError(
      classifyHttpStatus(response.status),
      `GolfCourseAPI returned HTTP ${response.status} for ${path}${
        detail ? `: ${detail}` : ""
      }`,
      response.status
    );
  }

  try {
    return (await response.json()) as T;
  } catch {
    throw new GolfCourseApiError(
      "bad_response",
      `GolfCourseAPI returned a non-JSON body for ${path}`,
      response.status
    );
  }
}

export async function searchGolfCourseApiCourses(query: string) {
  if (!isGolfCourseApiConfigured()) return [];

  const path = `/v1/search?search_query=${encodeURIComponent(query)}`;

  let payload: GolfCourseApiSearchResponse;
  try {
    payload = await golfCourseApiFetch<GolfCourseApiSearchResponse>(
      path,
      SEARCH_CACHE_SECONDS
    );
  } catch (error) {
    // A search that matches nothing answers 200 with an empty list, so a 404
    // here is the endpoint itself being gone — never an empty result. Reporting
    // it as "no match" would send an admin hunting for better search terms.
    if (error instanceof GolfCourseApiError && error.failure === "not_found") {
      throw new GolfCourseApiError(
        "endpoint_missing",
        `GolfCourseAPI has no ${path} endpoint`,
        404
      );
    }

    throw error;
  }

  const courses = payload?.courses;

  // A 200 carrying a body we do not recognise used to throw a bare TypeError
  // out of .map below, which the route then reported as a provider outage.
  // Name the shape we actually got so the log says the contract changed.
  if (courses != null && !Array.isArray(courses)) {
    throw new GolfCourseApiError(
      "bad_response",
      `GolfCourseAPI search returned an unexpected body: ${describePayloadShape(
        payload
      )}`
    );
  }

  // A body with no `courses` key at all is ambiguous — it could be an honest
  // "no matches" — so it still returns empty, but leave the shape in the log so
  // a silent "no results" is traceable rather than a dead end.
  if (courses === undefined) {
    console.warn(
      `GolfCourseAPI search returned no courses key: ${describePayloadShape(
        payload
      )}`
    );
  }

  return (courses ?? [])
    .filter(
      (course): course is GolfCourseApiCourse =>
        Boolean(course) && typeof course === "object"
    )
    .map(normalizeCourse);
}

export async function getGolfCourseApiCourse(id: string) {
  if (!isGolfCourseApiConfigured()) return null;

  try {
    const payload = await golfCourseApiFetch<unknown>(
      `/v1/courses/${encodeURIComponent(id)}`,
      COURSE_CACHE_SECONDS
    );
    const course = unwrapGolfCourseApiCourse(payload) as GolfCourseApiCourse | null;

    if (!course || course.id === undefined) {
      throw new GolfCourseApiError(
        "bad_response",
        `GolfCourseAPI course ${id} returned an unexpected body: ${describePayloadShape(
          payload
        )}`
      );
    }

    return normalizeCourse(course);
  } catch (error) {
    // An id the provider does not know is a real answer, not an outage.
    if (error instanceof GolfCourseApiError && error.failure === "not_found") {
      return null;
    }

    throw error;
  }
}
