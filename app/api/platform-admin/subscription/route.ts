import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getFirebaseAdminDb, isFirebaseAdminConfigured } from "@/lib/firebaseAdmin";
import { getStripe, isStripeConfigured } from "@/lib/stripeServer";
import { requirePlatformAdmin } from "../auth";
import type { SubscriptionStatus, SubscriptionPlan } from "@/types";

type UpdateBody = {
  groupId: string;
  status: SubscriptionStatus;
  plan?: SubscriptionPlan | null;
  exemptReason?: string | null;
  trialDays?: number;
};

async function cancelActiveStripeSubscription(
  stripeSubscriptionId: string,
  immediately: boolean
): Promise<void> {
  const stripe = getStripe();
  if (immediately) {
    await stripe.subscriptions.cancel(stripeSubscriptionId);
  } else {
    await stripe.subscriptions.update(stripeSubscriptionId, { cancel_at_period_end: true });
  }
}

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

    const stripeSubscriptionId: string | null =
      groupSnap.data()?.subscription?.stripeSubscriptionId ?? null;

    // Cancel the Stripe subscription when overriding billing manually.
    // - Exempt / Trial: cancel immediately — billing is no longer appropriate.
    // - Suspend: cancel at period end — group keeps access until their paid period expires,
    //   stopping future renewals. The webhook that fires is guarded in webhook/route.ts
    //   so it won't overwrite the admin-set status.
    // - Active: leave Stripe untouched — Stripe is the source of truth for active subs.
    if (stripeSubscriptionId && isStripeConfigured()) {
      if (status === "exempt" || status === "trial") {
        await cancelActiveStripeSubscription(stripeSubscriptionId, true);
      } else if (status === "suspended") {
        await cancelActiveStripeSubscription(stripeSubscriptionId, false);
      }
    }

    const now = new Date();
    let trialEndsAt: Date | null = null;

    if (status === "trial") {
      trialEndsAt = new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000);
    }

    await groupRef.update({
      "subscription.status": status,
      "subscription.plan": plan,
      "subscription.exemptReason": status === "exempt" ? (exemptReason ?? "platform_grant") : null,
      "subscription.trialEndsAt": trialEndsAt,
      "subscription.currentPeriodEndsAt": null,
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
