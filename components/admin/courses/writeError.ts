/**
 * Turn a Firestore write failure into something an admin can act on.
 *
 * The course catalogue lives at a brand-new path
 * (`groups/{groupId}/courses/{courseId}/tees/{teeId}`), so until
 * firestore.rules is deployed every write to it is denied. A bare
 * "Failed to save" sends you hunting through application code for a
 * problem that is one deploy command away.
 */
export function describeWriteError(caught: unknown, subject: string): string {
  const code =
    typeof caught === "object" && caught !== null && "code" in caught
      ? String((caught as { code: unknown }).code)
      : "";

  if (code.includes("permission-denied")) {
    return (
      `Permission denied writing the ${subject}. The course catalogue is a new ` +
      "Firestore path, so this usually means the security rules have not been " +
      "deployed yet — run `firebase deploy --only firestore:rules`. If they are " +
      "deployed, check your account still has the admin role."
    );
  }

  if (code.includes("unavailable") || code.includes("deadline-exceeded")) {
    return `Could not reach Firestore to save the ${subject}. Check your connection and try again.`;
  }

  if (code.includes("unauthenticated")) {
    return `Your session has expired. Sign in again to save the ${subject}.`;
  }

  const message = caught instanceof Error ? caught.message : "";
  return message
    ? `Failed to save the ${subject}: ${message}`
    : `Failed to save the ${subject}.`;
}
