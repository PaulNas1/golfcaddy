import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getFirebaseAdminDb, isFirebaseAdminConfigured } from "@/lib/firebaseAdmin";
import { sendTrialExpiredEmail, sendTrialWarningEmail } from "@/lib/email";

export const runtime = "nodejs";

// Called daily by Vercel Cron (vercel.json). Secured via CRON_SECRET env var.
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

  // Fetch all groups currently on trial in one query
  const snap = await adminDb
    .collection("groups")
    .where("subscription.status", "==", "trial")
    .get();

  // Split into expired and approaching-7-day-warning buckets
  const warningWindowStart = new Date(now.getTime() + 6 * 24 * 60 * 60 * 1000);
  const warningWindowEnd   = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const expired:  typeof snap.docs = [];
  const warning:  typeof snap.docs = [];

  for (const doc of snap.docs) {
    const trialEndsAt: Date | undefined = doc.data().subscription?.trialEndsAt?.toDate?.();
    if (!trialEndsAt) continue;
    if (trialEndsAt < now) {
      expired.push(doc);
    } else if (trialEndsAt >= warningWindowStart && trialEndsAt < warningWindowEnd) {
      warning.push(doc);
    }
  }

  // ── 1. Expire overdue trials ──────────────────────────────────────────────
  let expiredCount = 0;
  if (expired.length > 0) {
    const batch = adminDb.batch();
    for (const doc of expired) {
      batch.update(doc.ref, {
        "subscription.status": "suspended",
        "subscription.updatedAt": FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    await batch.commit();
    expiredCount = expired.length;
    console.log(`[cron/expire-trials] suspended ${expiredCount} group(s)`);

    // Send expiry email to each group admin (non-fatal)
    await Promise.allSettled(
      expired.map((doc) => sendExpiryEmail(adminDb, doc.id, doc.data()))
    );
  }

  // ── 2. Send 7-day warnings ────────────────────────────────────────────────
  let warnedCount = 0;
  if (warning.length > 0) {
    await Promise.allSettled(
      warning.map((doc) => sendWarningEmail(adminDb, doc.id, doc.data()))
    );
    warnedCount = warning.length;
    console.log(`[cron/expire-trials] sent ${warnedCount} 7-day warning(s)`);
  }

  return NextResponse.json({ ok: true, expired: expiredCount, warned: warnedCount });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getAdminDetails(
  adminDb: ReturnType<typeof getFirebaseAdminDb>,
  adminIds: string[]
): Promise<{ email: string; displayName: string } | null> {
  if (adminIds.length === 0) return null;
  try {
    const snap = await adminDb.collection("users").doc(adminIds[0]).get();
    const data = snap.data();
    if (!data?.email) return null;
    return { email: data.email, displayName: data.displayName ?? "there" };
  } catch {
    return null;
  }
}

async function sendExpiryEmail(
  adminDb: ReturnType<typeof getFirebaseAdminDb>,
  groupId: string,
  data: FirebaseFirestore.DocumentData
) {
  const admin = await getAdminDetails(adminDb, data.adminIds ?? []);
  if (!admin) {
    console.warn(`[cron/expire-trials] no admin email for group ${groupId}`);
    return;
  }
  await sendTrialExpiredEmail({
    to: admin.email,
    adminName: admin.displayName,
    groupName: data.name ?? groupId,
  });
}

async function sendWarningEmail(
  adminDb: ReturnType<typeof getFirebaseAdminDb>,
  groupId: string,
  data: FirebaseFirestore.DocumentData
) {
  const admin = await getAdminDetails(adminDb, data.adminIds ?? []);
  if (!admin) {
    console.warn(`[cron/expire-trials] no admin email for group ${groupId}`);
    return;
  }
  const trialEndsAt: Date = data.subscription.trialEndsAt.toDate();
  await sendTrialWarningEmail({
    to: admin.email,
    adminName: admin.displayName,
    groupName: data.name ?? groupId,
    trialEndsAt,
  });
}
