import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getFirebaseAdminDb, isFirebaseAdminConfigured } from "@/lib/firebaseAdmin";
import { requirePlatformAdmin } from "../auth";
import type { SubscriptionStatus, SubscriptionPlan } from "@/types";

type UpdateBody = {
  groupId: string;
  status: SubscriptionStatus;
  plan?: SubscriptionPlan | null;
  exemptReason?: string | null;
  trialDays?: number;           // used when status = "trial"
};

export async function POST(request: NextRequest) {
  if (!isFirebaseAdminConfigured()) {
    return NextResponse.json({ error: "Admin not configured." }, { status: 503 });
  }

  try {
    await requirePlatformAdmin(request);

    const body = (await request.json()) as UpdateBody;
    const { groupId, status, plan = null, exemptReason = null, trialDays = 30 } = body;

    if (!groupId || !status) {
      return NextResponse.json({ error: "groupId and status are required." }, { status: 400 });
    }

    const adminDb = getFirebaseAdminDb();
    const groupRef = adminDb.collection("groups").doc(groupId);
    const groupSnap = await groupRef.get();

    if (!groupSnap.exists) {
      return NextResponse.json({ error: "Group not found." }, { status: 404 });
    }

    const now = new Date();
    let trialEndsAt: Date | null = null;
    const currentPeriodEndsAt: Date | null = null;

    if (status === "trial") {
      trialEndsAt = new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000);
    }

    await groupRef.update({
      "subscription.status": status,
      "subscription.plan": plan,
      "subscription.exemptReason": status === "exempt" ? (exemptReason ?? "platform_grant") : null,
      "subscription.trialEndsAt": trialEndsAt,
      "subscription.currentPeriodEndsAt": currentPeriodEndsAt,
      "subscription.updatedAt": FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ ok: true, groupId, status });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed.";
    const status = message === "Forbidden." ? 403 : message === "Missing bearer token." ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
