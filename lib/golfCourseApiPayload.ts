// Understanding what the provider actually sent us.

// Names the shape of a body we did not expect. A 200 carrying the wrong shape
// throws deep inside normalisation, where the message says nothing useful, so
// failure messages carry this instead.
export function describePayloadShape(payload: unknown) {
  if (payload === null) return "null";
  if (Array.isArray(payload)) return `array of ${payload.length}`;
  if (typeof payload !== "object") return typeof payload;

  const keys = Object.keys(payload as object);
  return keys.length ? `object with keys [${keys.join(", ")}]` : "empty object";
}

// The course endpoint wraps its payload as { "course": { ... } }, while search
// returns { "courses": [ ... ] } with the courses bare. Reading the wrapped
// body as a course produced one with no id and no tees, which surfaced to an
// admin as "that course does not include 18-hole tee data". Accept either form.
export function unwrapGolfCourseApiCourse(payload: unknown): unknown {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const inner = (payload as { course?: unknown }).course;
  if (inner && typeof inner === "object" && !Array.isArray(inner)) return inner;

  return payload;
}

// tees.male / tees.female are not reliably arrays: some courses carry a single
// tee box, some a map keyed by tee name, some an empty object. Calling .map on
// those threw a TypeError that took the whole search down with it. Returns null
// only when the value is not a list of tee boxes in any recognisable form.
export function toGolfCourseApiTeeBoxes(value: unknown): unknown[] | null {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return null;

  // One tee box rather than a list of them.
  if ("holes" in value || "tee_name" in value) return [value];

  // A map keyed by tee name. An empty object legitimately yields no tees.
  return Object.values(value);
}
