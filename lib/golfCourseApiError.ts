// Why a GolfCourseAPI call failed. The routes turn these into user-facing copy,
// so they stay coarse enough to be safe on an unauthenticated endpoint but
// specific enough to tell a rejected key apart from a real provider outage.
export type GolfCourseApiFailure =
  | "auth"
  | "forbidden"
  | "rate_limited"
  | "not_found"
  | "timeout"
  | "upstream"
  | "bad_response";

export class GolfCourseApiError extends Error {
  readonly failure: GolfCourseApiFailure;
  readonly status: number | null;

  constructor(
    failure: GolfCourseApiFailure,
    message: string,
    status: number | null = null
  ) {
    super(message);
    this.name = "GolfCourseApiError";
    this.failure = failure;
    this.status = status;
  }
}

export function classifyHttpStatus(status: number): GolfCourseApiFailure {
  if (status === 401) return "auth";
  // 403 is ambiguous: the provider refusing this key's plan looks the same as a
  // proxy or host network policy refusing the outbound request, so keep it
  // separate from a plain rejected key and let the logged body settle it.
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status === 429) return "rate_limited";
  if (status === 408 || status === 504) return "timeout";
  return "upstream";
}

export function toGolfCourseApiFailure(error: unknown): GolfCourseApiFailure {
  if (error instanceof GolfCourseApiError) return error.failure;

  // fetch rejects with an AbortError/TimeoutError once our own timeout fires.
  if (
    error instanceof Error &&
    (error.name === "AbortError" || error.name === "TimeoutError")
  ) {
    return "timeout";
  }

  return "upstream";
}

const FAILURE_HTTP_STATUS: Record<GolfCourseApiFailure, number> = {
  auth: 503,
  forbidden: 503,
  rate_limited: 429,
  not_found: 404,
  timeout: 504,
  upstream: 502,
  bad_response: 502,
};

const FAILURE_MESSAGE: Record<GolfCourseApiFailure, string> = {
  auth: "is not configured correctly — the API key was rejected",
  forbidden: "was blocked — check the API key plan and any network egress rules",
  rate_limited: "is busy right now — try again in a moment",
  not_found: "returned no match",
  timeout: "timed out — try again in a moment",
  upstream: "is unavailable right now",
  bad_response: "returned an unexpected response",
};

// `subject` is a singular noun phrase naming what failed, e.g. "Golf course
// search", so that it agrees with the verbs above.
export function describeFailure(
  failure: GolfCourseApiFailure,
  subject: string
): { status: number; message: string } {
  return {
    status: FAILURE_HTTP_STATUS[failure],
    message: `${subject} ${FAILURE_MESSAGE[failure]}.`,
  };
}
