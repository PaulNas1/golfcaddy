import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getFirebaseAdminDb, isFirebaseAdminConfigured } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";

// Called daily by Vercel Cron. Secured via CRON_SECRET env var.
export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (!isFirebaseAdminConfigured()) {
    return NextResponse.json({ error: "Admin not configured." }, { status: 503 });
  }

  const adminDb = getFirebaseAdminDb();
  const now = new Date();

  const snap = await adminDb
    .collection("groups")
    .where("subscription.status", "==", "trial")
    .get();

  const expired = snap.docs.filter((doc) => {
    const trialEndsAt = doc.data().subscription?.trialEndsAt?.toDate?.();
    return trialEndsAt && trialEndsAt < now;
  });

  if (expired.length === 0) {
    console.log("[cron/expire-trials] no expired trials found");
    return NextResponse.json({ ok: true, expired: 0 });
  }

  const batch = adminDb.batch();
  for (const doc of expired) {
    batch.update(doc.ref, {
      "subscription.status": "suspended",
      "subscription.updatedAt": FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
  await batch.commit();

  console.log(`[cron/expire-trials] suspended ${expired.length} group(s)`);
  return NextResponse.json({ ok: true, expired: expired.length });
}
