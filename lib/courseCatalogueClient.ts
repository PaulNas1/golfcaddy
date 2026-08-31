import type { SeededCourse } from "@/lib/courseData";

export type GolfCourseSearchResult = {
  configured: boolean;
  courses: SeededCourse[];
  reason?: string;
  error?: string;
};

export type GolfCourseDetailResult = {
  configured: boolean;
  course: SeededCourse | null;
  reason?: string;
  error?: string;
};

type ParsedResponse = {
  ok: boolean;
  payload: Partial<GolfCourseSearchResult & GolfCourseDetailResult> | null;
};

// A failing route does not always answer with our JSON shape: a host gateway
// timeout, an offline device, or a service-worker miss all produce HTML or no
// response at all. Parsing before checking that would throw and leave callers
// stuck, so every failure comes back as a value instead.
async function requestCatalogue(path: string): Promise<ParsedResponse> {
  try {
    const response = await fetch(path);

    try {
      return { ok: response.ok, payload: await response.json() };
    } catch {
      return { ok: false, payload: null };
    }
  } catch {
    return { ok: false, payload: null };
  }
}

export async function searchGolfCourseCatalogue(
  query: string
): Promise<GolfCourseSearchResult> {
  const { ok, payload } = await requestCatalogue(
    `/api/golf-courses?q=${encodeURIComponent(query)}`
  );

  if (!ok || !payload) {
    return {
      configured: payload?.configured ?? true,
      courses: [],
      reason: payload?.reason ?? "unreachable",
      error: payload?.error ?? "Golf course search failed.",
    };
  }

  return {
    configured: payload.configured ?? true,
    courses: payload.courses ?? [],
    reason: payload.reason,
    error: payload.error,
  };
}

export async function getGolfCourseCatalogueCourse(
  id: string
): Promise<GolfCourseDetailResult> {
  const { ok, payload } = await requestCatalogue(
    `/api/golf-courses/${encodeURIComponent(id)}`
  );

  if (!ok || !payload) {
    return {
      configured: payload?.configured ?? true,
      course: null,
      reason: payload?.reason ?? "unreachable",
      error: payload?.error ?? "Golf course details failed.",
    };
  }

  return {
    configured: payload.configured ?? true,
    course: payload.course ?? null,
    reason: payload.reason,
    error: payload.error,
  };
}
