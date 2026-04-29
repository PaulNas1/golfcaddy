import { NextRequest, NextResponse } from "next/server";
import { getStripe, isStripeConfigured, STRIPE_PRICE_IDS, type StripePlan } from "@/lib/stripeServer";
import { getFirebaseAdminAuth, getFirebaseAdminDb, isFirebaseAdminConfigured } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";

type CheckoutBody = {
  plan: StripePlan;
  successUrl?: string;
  cancelUrl?: string;
};

export async function POST(request: NextRequest) {
  if (!isStripeConfigured() || !isFirebaseAdminConfigured()) {
    return NextResponse.json({ error: "Billing not configured." }, { status: 503 });
  }

  // Verify the caller is an active admin
  const authHeader = request.headers.get("authorization") ?? "";
  const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!idToken) {
    return NextResponse.json({ error: "Missing bearer token." }, { status: 401 });
  }

  try {
    const adminAuth = getFirebaseAdminAuth();
    const adminDb = getFirebaseAdminDb();
    const decoded = await adminAuth.verifyIdToken(idToken);

    const userSnap = await adminDb.collection("users").doc(decoded.uid).get();
    if (!userSnap.exists) {
      return NextResponse.json({ error: "User not found." }, { status: 403 });
    }

    const user = userSnap.data()!;
    if (user.status !== "active" || user.role !== "admin" || !user.groupId) {
      return NextResponse.json({ error: "Only active group admins can manage billing." }, { status: 403 });
    }

    const groupId: string = user.groupId;

    const body = (await request.json()) as CheckoutBody;
    const { plan, successUrl, cancelUrl } = body;

    if (!plan || !STRIPE_PRICE_IDS[plan]) {
      return NextResponse.json({ error: "Invalid plan." }, { status: 400 });
    }

    const groupSnap = await adminDb.collection("groups").doc(groupId).get();
    const groupData = groupSnap.data() ?? {};
    const groupName: string = groupData.name ?? groupId;

    // Reuse existing Stripe customer ID if we have one
    let customerId: string | undefined =
      groupData.subscription?.stripeCustomerId ?? undefined;

    if (!customerId) {
      const customer = await getStripe().customers.create({
        email: user.email,
        name: groupName,
        metadata: { groupId, adminUid: decoded.uid },
      });
      customerId = customer.id;

      // Persist the customer ID right away so we can look it up in the webhook
      await adminDb
        .collection("groups")
        .doc(groupId)
        .set(
          { "subscription.stripeCustomerId": customerId },
          { merge: true }
        );
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://golfcaddy-alpha.vercel.app";

    const session = await getStripe().checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      line_items: [{ price: STRIPE_PRICE_IDS[plan], quantity: 1 }],
      subscription_data: {
        metadata: { groupId },
      },
      success_url: successUrl ?? `${appUrl}/admin/settings/billing?success=1`,
      cancel_url:  cancelUrl  ?? `${appUrl}/admin/settings/billing?cancel=1`,
      allow_promotion_codes: true,
      metadata: { groupId },
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("[checkout] error:", err);
    const message = err instanceof Error ? err.message : "Failed to create checkout session.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
