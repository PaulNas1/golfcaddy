import type { SeededCourse } from "@/lib/courseData";

export type GolfCourseSearchResult = {
  configured: boolean;
  courses: SeededCourse[];
  error?: string;
};

export type GolfCourseDetailResult = {
  configured: boolean;
  course: SeededCourse | null;
  error?: string;
};

export async function searchGolfCourseCatalogue(
  query: string
): Promise<GolfCourseSearchResult> {
  const response = await fetch(
    `/api/golf-courses?q=${encodeURIComponent(query)}`
  );
  const payload = (await response.json()) as GolfCourseSearchResult;

  if (!response.ok) {
    return {
      configured: payload.configured,
      courses: [],
      error: payload.error ?? "Golf course search failed.",
    };
  }

  return payload;
}

export async function getGolfCourseCatalogueCourse(
  id: number
): Promise<GolfCourseDetailResult> {
  const response = await fetch(`/api/golf-courses/${id}`);
  const payload = (await response.json()) as GolfCourseDetailResult;

  if (!response.ok) {
    return {
      configured: payload.configured,
      course: null,
      error: payload.error ?? "Golf course details failed.",
    };
  }

  return payload;
}
