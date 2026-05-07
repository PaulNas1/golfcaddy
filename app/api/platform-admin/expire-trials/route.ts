import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getFirebaseAdminDb, isFirebaseAdminConfigured } from "@/lib/firebaseAdmin";
import { requirePlatformAdmin } from "../auth";

export async function POST(request: NextRequest) {
  if (!isFirebaseAdminConfigured()) {
    return NextResponse.json({ error: "Admin not configured." }, { status: 503 });
  }

  try {
    await requirePlatformAdmin(request);

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
      return NextResponse.json({ ok: true, expired: 0, groups: [] });
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

    const groups = expired.map((d) => ({ id: d.id, name: d.data().name ?? d.id }));
    console.log(`[expire-trials] suspended ${expired.length} group(s):`, groups.map((g) => g.id));

    return NextResponse.json({ ok: true, expired: expired.length, groups });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed.";
    const status = message === "Forbidden." ? 403 : message === "Missing bearer token." ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
