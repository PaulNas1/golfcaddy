// The value shipped in .env.local.example. Treat it as "still unset" so a
// half-finished setup reports as unconfigured instead of failing on a 401.
const PLACEHOLDER_API_KEY = "your_golfcourseapi_key_here";

// Keys pasted into a hosting dashboard or .env file often arrive padded with
// whitespace or wrapped in quotes. The provider rejects those, which is
// indistinguishable from an outage once the error reaches the browser, so
// normalise here and let an unusable key report as simply not configured.
export function normalizeGolfCourseApiKey(raw: string | undefined) {
  const trimmed = (raw ?? "").trim();
  const unquoted = trimmed.replace(/^(["'])([\s\S]*)\1$/, "$2").trim();

  return unquoted === PLACEHOLDER_API_KEY ? "" : unquoted;
}
