import test from "node:test";
import assert from "node:assert/strict";
import { normalizeGolfCourseApiKey } from "../lib/golfCourseApiKey.ts";
import {
  extractGolfCourseApiId,
  isGolfCourseApiId,
} from "../lib/golfCourseApiId.ts";
import {
  GolfCourseApiError,
  classifyHttpStatus,
  describeFailure,
  toGolfCourseApiFailure,
} from "../lib/golfCourseApiError.ts";
import {
  describePayloadShape,
  toGolfCourseApiTeeBoxes,
  unwrapGolfCourseApiCourse,
} from "../lib/golfCourseApiPayload.ts";

test("normalizes keys that are padded or quoted when pasted", () => {
  assert.equal(normalizeGolfCourseApiKey("abc123"), "abc123");
  assert.equal(normalizeGolfCourseApiKey("  abc123  "), "abc123");
  assert.equal(normalizeGolfCourseApiKey("abc123\n"), "abc123");
  assert.equal(normalizeGolfCourseApiKey('"abc123"'), "abc123");
  assert.equal(normalizeGolfCourseApiKey("'abc123'"), "abc123");
});

test("treats blank and placeholder keys as unconfigured", () => {
  // These used to pass the Boolean(key) check, so the app claimed the API was
  // configured and then reported the resulting 401 as an outage.
  assert.equal(normalizeGolfCourseApiKey(undefined), "");
  assert.equal(normalizeGolfCourseApiKey(""), "");
  assert.equal(normalizeGolfCourseApiKey("   "), "");
  assert.equal(normalizeGolfCourseApiKey('""'), "");
  assert.equal(normalizeGolfCourseApiKey("your_golfcourseapi_key_here"), "");
  assert.equal(normalizeGolfCourseApiKey(' "your_golfcourseapi_key_here" '), "");
});

test("classifies provider HTTP statuses into distinct failures", () => {
  assert.equal(classifyHttpStatus(401), "auth");
  // A 403 can come from a proxy or host network policy rather than the
  // provider, so it must not be reported as a plain rejected key.
  assert.equal(classifyHttpStatus(403), "forbidden");
  assert.equal(classifyHttpStatus(404), "not_found");
  assert.equal(classifyHttpStatus(429), "rate_limited");
  assert.equal(classifyHttpStatus(504), "timeout");
  assert.equal(classifyHttpStatus(500), "upstream");
  assert.equal(classifyHttpStatus(418), "upstream");
});

test("maps thrown values onto a failure reason", () => {
  assert.equal(
    toGolfCourseApiFailure(new GolfCourseApiError("auth", "rejected", 401)),
    "auth"
  );

  const aborted = new Error("The operation was aborted");
  aborted.name = "TimeoutError";
  assert.equal(toGolfCourseApiFailure(aborted), "timeout");

  assert.equal(toGolfCourseApiFailure(new TypeError("fetch failed")), "upstream");
  assert.equal(toGolfCourseApiFailure("nope"), "upstream");
});

test("gives each failure its own message and HTTP status", () => {
  const auth = describeFailure("auth", "Golf course search");
  assert.equal(auth.status, 503);
  assert.match(auth.message, /not configured correctly/);

  const forbidden = describeFailure("forbidden", "Golf course search");
  assert.equal(forbidden.status, 503);
  assert.match(forbidden.message, /network egress/);
  assert.notEqual(forbidden.message, auth.message);

  const rateLimited = describeFailure("rate_limited", "Golf course search");
  assert.equal(rateLimited.status, 429);

  const upstream = describeFailure("upstream", "Golf course search");
  assert.equal(upstream.status, 502);
  assert.equal(upstream.message, "Golf course search is unavailable right now.");

  // A rejected key must no longer read the same as a provider outage.
  assert.notEqual(auth.message, upstream.message);
});

test("reads as a sentence for every subject and failure", () => {
  const failures = [
    "auth",
    "forbidden",
    "rate_limited",
    "not_found",
    "endpoint_missing",
    "timeout",
    "upstream",
    "bad_response",
  ] as const;

  for (const subject of ["Golf course search", "Golf course lookup"]) {
    for (const failure of failures) {
      const { message } = describeFailure(failure, subject);
      assert.ok(message.startsWith(`${subject} `), message);
      assert.ok(message.endsWith("."), message);
      // Singular subjects, so a plural verb would be a copy bug.
      assert.doesNotMatch(message, / are /, message);
    }
  }
});

test("separates a missing endpoint from an empty search result", () => {
  // /v1/search answers 200 with an empty list when nothing matches, so "no
  // match" and "that path is gone" must never share a message.
  const missing = describeFailure("endpoint_missing", "Golf course search");
  const noMatch = describeFailure("not_found", "Golf course search");

  assert.notEqual(missing.message, noMatch.message);
  assert.match(missing.message, /API path may have changed/);
  assert.equal(missing.status, 502);
  assert.equal(noMatch.status, 404);
});

test("names the shape of an unexpected provider body", () => {
  // A provider that answers 200 with the wrong shape is the one failure that
  // still counts against the daily quota, so the log has to say what arrived.
  assert.equal(
    describePayloadShape({ data: [], meta: {} }),
    "object with keys [data, meta]"
  );
  assert.equal(describePayloadShape({ courses: [] }), "object with keys [courses]");
  assert.equal(describePayloadShape([1, 2, 3]), "array of 3");
  assert.equal(describePayloadShape({}), "empty object");
  assert.equal(describePayloadShape(null), "null");
  assert.equal(describePayloadShape("<!doctype html>"), "string");
});

test("accepts the provider's alphanumeric course ids", () => {
  // The provider moved from integer ids to alphanumeric ones. Coercing an id
  // with Number() turned every real course into NaN, so the detail route
  // rejected it with a 400 before the request ever left the app.
  assert.equal(isGolfCourseApiId("j7rt0gct"), true);
  assert.equal(isGolfCourseApiId("34"), true);
  assert.equal(isGolfCourseApiId("some_course-id"), true);

  assert.equal(isGolfCourseApiId(""), false);
  assert.equal(isGolfCourseApiId(undefined), false);
  assert.equal(isGolfCourseApiId("../../admin"), false);
  assert.equal(isGolfCourseApiId("a/b"), false);
  assert.equal(isGolfCourseApiId("a?b=1"), false);
  assert.equal(isGolfCourseApiId("x".repeat(65)), false);
});

test("recovers an api id from ids stored on a saved round", () => {
  assert.equal(extractGolfCourseApiId("golfcourseapi-j7rt0gct", null), "j7rt0gct");
  assert.equal(
    extractGolfCourseApiId(null, "golfcourseapi-j7rt0gct-men-blue"),
    "j7rt0gct"
  );

  // Rounds saved before the provider changed format still hold numeric ids.
  assert.equal(extractGolfCourseApiId("golfcourseapi-34", null), "34");
  assert.equal(extractGolfCourseApiId(null, "golfcourseapi-34-women-red"), "34");

  assert.equal(extractGolfCourseApiId("custom-course", null), null);
  assert.equal(extractGolfCourseApiId(null, null), null);
});

test("unwraps the course endpoint's wrapped payload", () => {
  // /v1/courses/{id} answers { "course": {...} } while /v1/search answers
  // { "courses": [...] } with the courses bare. Reading the wrapped body as a
  // course gave one with no id and no tees, which reached the admin as "that
  // course does not include 18-hole tee data".
  const course = { id: "j7rt0gct", club_name: "Cimarron Golf Resort" };

  assert.deepEqual(unwrapGolfCourseApiCourse({ course }), course);
  assert.deepEqual(unwrapGolfCourseApiCourse(course), course);

  assert.equal(unwrapGolfCourseApiCourse(null), null);
  assert.equal(unwrapGolfCourseApiCourse("nope"), null);
  assert.equal(unwrapGolfCourseApiCourse([course]), null);
});

test("reads tee lists in every shape the provider sends", () => {
  // `tees.male.map is not a function` in production: the value is not always an
  // array, and the TypeError took the whole search down rather than costing one
  // course its tee data.
  const tee = { tee_name: "Blue", holes: [] };

  assert.deepEqual(toGolfCourseApiTeeBoxes([tee]), [tee]);
  assert.deepEqual(toGolfCourseApiTeeBoxes(tee), [tee], "a single tee box");
  assert.deepEqual(
    toGolfCourseApiTeeBoxes({ blue: tee, white: tee }),
    [tee, tee],
    "a map keyed by tee name"
  );

  // Courses with no tee data at all carry an empty object, not an error.
  assert.deepEqual(toGolfCourseApiTeeBoxes({}), []);

  assert.equal(toGolfCourseApiTeeBoxes(null), null);
  assert.equal(toGolfCourseApiTeeBoxes(undefined), null);
  assert.equal(toGolfCourseApiTeeBoxes("Blue"), null);
  assert.equal(toGolfCourseApiTeeBoxes(3), null);
});
