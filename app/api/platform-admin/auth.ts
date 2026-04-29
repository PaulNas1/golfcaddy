import { getFirebaseAdminAuth, getFirebaseAdminDb } from "@/lib/firebaseAdmin";
import type { NextRequest } from "next/server";

/**
 * Verifies that the caller is the platform admin.
 * Returns the caller's uid on success, throws with a message on failure.
 *
 * Two independent checks:
 *  1. Bearer token is a valid Firebase ID token.
 *  2. The decoded email matches PLATFORM_ADMIN_EMAIL env var.
 */
export async function requirePlatformAdmin(request: NextRequest): Promise<string> {
  const platformAdminEmail = process.env.PLATFORM_ADMIN_EMAIL;
  if (!platformAdminEmail) {
    throw new Error("PLATFORM_ADMIN_EMAIL is not configured.");
  }

  const authHeader = request.headers.get("authorization") ?? "";
  const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!idToken) throw new Error("Missing bearer token.");

  const adminAuth = getFirebaseAdminAuth();
  const decoded = await adminAuth.verifyIdToken(idToken);

  if (decoded.email?.toLowerCase() !== platformAdminEmail.toLowerCase()) {
    throw new Error("Forbidden.");
  }

  return decoded.uid;
}

/**
 * Marks a user as platformAdmin in Firestore and returns their uid.
 * Only works when the caller's email matches PLATFORM_ADMIN_EMAIL.
 */
export async function grantPlatformAdmin(uid: string): Promise<void> {
  const adminDb = getFirebaseAdminDb();
  await adminDb.collection("users").doc(uid).update({
    platformAdmin: true,
    updatedAt: new Date(),
  });
}
