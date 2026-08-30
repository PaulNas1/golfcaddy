import test from "node:test";
import assert from "node:assert/strict";
import { normalizeGolfCourseApiKey } from "../lib/golfCourseApiKey.ts";
import {
  GolfCourseApiError,
  classifyHttpStatus,
  describeFailure,
  describePayloadShape,
  toGolfCourseApiFailure,
} from "../lib/golfCourseApiError.ts";

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
