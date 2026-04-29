import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import {
  getFirebaseAdminAuth,
  getFirebaseAdminDb,
  isFirebaseAdminConfigured,
} from "@/lib/firebaseAdmin";

/**
 * One-time setup endpoint.
 * - Marks the caller as platformAdmin in Firestore.
 * - Seeds the "fourplay" group as exempt with reason "founder_group".
 *
 * Auth: Bearer token required; email must match PLATFORM_ADMIN_EMAIL env var.
 * Safe to call multiple times — subsequent calls are idempotent.
 */
export async function POST(request: NextRequest) {
  if (!isFirebaseAdminConfigured()) {
    return NextResponse.json({ error: "Admin not configured." }, { status: 503 });
  }

  const platformAdminEmail = process.env.PLATFORM_ADMIN_EMAIL;
  if (!platformAdminEmail) {
    return NextResponse.json({ error: "PLATFORM_ADMIN_EMAIL not set." }, { status: 503 });
  }

  const authHeader = request.headers.get("authorization") ?? "";
  const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!idToken) {
    return NextResponse.json({ error: "Missing bearer token." }, { status: 401 });
  }

  try {
    const adminAuth = getFirebaseAdminAuth();
    const adminDb = getFirebaseAdminDb();

    const decoded = await adminAuth.verifyIdToken(idToken);
    if (decoded.email?.toLowerCase() !== platformAdminEmail.toLowerCase()) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const uid = decoded.uid;

    // 1. Grant platform admin on the user doc
    await adminDb.collection("users").doc(uid).update({
      platformAdmin: true,
      updatedAt: FieldValue.serverTimestamp(),
    });

    // 2. Seed every existing group that has no subscription yet
    //    FourPlay ("fourplay") gets "exempt / founder_group".
    //    Any other existing groups get a 30-day trial.
    const groupsSnap = await adminDb.collection("groups").get();
    const now = new Date();
    const trialEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const batch = adminDb.batch();
    for (const groupDoc of groupsSnap.docs) {
      const existing = groupDoc.data();
      if (existing.subscription?.status) continue; // already set, skip

      const isFourPlay = groupDoc.id === "fourplay";
      batch.update(groupDoc.ref, {
        "subscription.status": isFourPlay ? "exempt" : "trial",
        "subscription.plan": null,
        "subscription.exemptReason": isFourPlay ? "founder_group" : null,
        "subscription.trialEndsAt": isFourPlay ? null : trialEnd,
        "subscription.currentPeriodEndsAt": null,
        "subscription.stripeCustomerId": null,
        "subscription.stripeSubscriptionId": null,
        "subscription.updatedAt": FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    await batch.commit();

    return NextResponse.json({
      ok: true,
      uid,
      message: `Platform admin granted. ${groupsSnap.size} group(s) seeded.`,
    });
  } catch (err) {
    console.error("Platform admin seed failed", err);
    const message = err instanceof Error ? err.message : "Seed failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
