/**
 * authErrors
 *
 * Converts a raw Firebase Auth error into a human-readable message.
 * Centralised here so every form that calls Firebase Auth (sign-in,
 * email change, password change, etc.) shows consistent error copy
 * and the mapping only lives in one place.
 *
 * Usage:
 *   } catch (error) {
 *     setError(parseFirebaseAuthError(error));
 *   }
 */
export function parseFirebaseAuthError(error: unknown): string {
  const code =
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as Record<string, unknown>).code === "string"
      ? (error as Record<string, string>).code
      : "";

  const message =
    error instanceof Error ? error.message.toLowerCase() : "";

  // Wrong password / invalid credentials
  if (
    code === "auth/wrong-password" ||
    code === "auth/invalid-credential" ||
    message.includes("wrong-password") ||
    message.includes("invalid-credential")
  ) {
    return "Current password is incorrect.";
  }

  // Email already in use
  if (
    code === "auth/email-already-in-use" ||
    message.includes("email-already-in-use")
  ) {
    return "That email is already in use by another account.";
  }

  // Invalid email format
  if (code === "auth/invalid-email") {
    return "Enter a valid email address.";
  }

  // Requires re-login
  if (code === "auth/requires-recent-login") {
    return "Please sign in again before making this change.";
  }

  // Too many requests / rate-limit
  if (code === "auth/too-many-requests") {
    return "Too many attempts. Please wait a moment and try again.";
  }

  // Weak password
  if (code === "auth/weak-password") {
    return "Choose a stronger password (at least 8 characters).";
  }

  // Network errors
  if (code === "auth/network-request-failed" || message.includes("network")) {
    return "Network error. Check your connection and try again.";
  }

  // Generic fallback — include raw message in dev, hide in prod
  if (process.env.NODE_ENV === "development" && message) {
    return `Auth error: ${message}`;
  }

  return "Something went wrong. Please try again.";
}
