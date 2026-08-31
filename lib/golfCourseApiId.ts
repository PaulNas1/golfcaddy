// GolfCourseAPI course ids are alphanumeric ("j7rt0gct"). They used to be
// integers, and rounds saved before the change still carry the numeric form, so
// everything here accepts both and never coerces to a number.

// Also keeps path separators out of the URL we build for the provider.
export function isGolfCourseApiId(value: string | undefined | null) {
  return /^[A-Za-z0-9_-]{1,64}$/.test((value ?? "").trim());
}

// Recovers the provider id from the ids we store on a saved round.
export function extractGolfCourseApiId(
  courseId: string | null | undefined,
  teeSetId: string | null | undefined
): string | null {
  const courseMatch = courseId?.match(/^golfcourseapi-(.+)$/);
  if (courseMatch) return courseMatch[1];

  // A tee set id is `golfcourseapi-<id>-<gender>-<tee name>`, so the id runs to
  // the first hyphen.
  const teeSetMatch = teeSetId?.match(/^golfcourseapi-([A-Za-z0-9_]+)-/);
  if (teeSetMatch) return teeSetMatch[1];

  return null;
}
