import { NextRequest, NextResponse } from "next/server";
import { getStripe, isStripeConfigured } from "@/lib/stripeServer";
import { getFirebaseAdminAuth, getFirebaseAdminDb, isFirebaseAdminConfigured } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!isStripeConfigured() || !isFirebaseAdminConfigured()) {
    return NextResponse.json({ error: "Billing not configured." }, { status: 503 });
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

    const userSnap = await adminDb.collection("users").doc(decoded.uid).get();
    if (!userSnap.exists) {
      return NextResponse.json({ error: "User not found." }, { status: 403 });
    }

    const user = userSnap.data()!;
    if (user.status !== "active" || user.role !== "admin" || !user.groupId) {
      return NextResponse.json({ error: "Only active group admins can manage billing." }, { status: 403 });
    }

    const groupSnap = await adminDb.collection("groups").doc(user.groupId).get();
    const stripeCustomerId: string | null =
      groupSnap.data()?.subscription?.stripeCustomerId ?? null;

    if (!stripeCustomerId) {
      return NextResponse.json(
        { error: "No billing account found. Please subscribe first." },
        { status: 404 }
      );
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://golfcaddy-alpha.vercel.app";

    const session = await getStripe().billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: `${appUrl}/admin/settings/billing`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("[portal] error:", err);
    const message = err instanceof Error ? err.message : "Failed to open billing portal.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
