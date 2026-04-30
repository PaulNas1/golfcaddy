import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { FieldValue } from "firebase-admin/firestore";
import { getStripe, isStripeConfigured, PRICE_ID_TO_PLAN } from "@/lib/stripeServer";
import { getFirebaseAdminDb, isFirebaseAdminConfigured } from "@/lib/firebaseAdmin";
import type { SubscriptionStatus, SubscriptionPlan } from "@/types";

// ─── Stripe requires the raw body for signature verification ─────────────────
export const runtime = "nodejs";

// Helper: map a Stripe subscription status to our internal status
function toSubscriptionStatus(stripeStatus: Stripe.Subscription.Status): SubscriptionStatus {
  switch (stripeStatus) {
    case "active":
    case "trialing":
      return "active";
    case "past_due":
      return "past_due";
    case "canceled":
    case "unpaid":
    case "paused":
    case "incomplete":
    case "incomplete_expired":
      return "suspended";
    default:
      return "suspended";
  }
}

// Helper: extract the plan from the first subscription item's price
function extractPlan(subscription: Stripe.Subscription): SubscriptionPlan | null {
  const priceId = subscription.items?.data?.[0]?.price?.id;
  return (priceId && PRICE_ID_TO_PLAN[priceId]) || null;
}

// Helper: find the Firestore groupId stored in subscription metadata
function groupIdFromSubscription(subscription: Stripe.Subscription): string | null {
  return (subscription.metadata?.groupId as string | undefined) ?? null;
}

// Helper: find groupId by looking up the Stripe customer ID in Firestore
async function groupIdByCustomer(
  adminDb: ReturnType<typeof getFirebaseAdminDb>,
  stripeCustomerId: string
): Promise<string | null> {
  const snap = await adminDb
    .collection("groups")
    .where("subscription.stripeCustomerId", "==", stripeCustomerId)
    .limit(1)
    .get();
  return snap.empty ? null : snap.docs[0].id;
}

async function syncSubscription(
  adminDb: ReturnType<typeof getFirebaseAdminDb>,
  subscription: Stripe.Subscription
) {
  const groupId =
    groupIdFromSubscription(subscription) ||
    (await groupIdByCustomer(adminDb, String(subscription.customer)));

  if (!groupId) {
    console.warn("[webhook] Could not resolve groupId for subscription", subscription.id);
    return;
  }

  const status = toSubscriptionStatus(subscription.status);
  const plan = extractPlan(subscription);
  const currentPeriodEndsAt = subscription.items?.data?.[0]?.current_period_end
    ? new Date(subscription.items.data[0].current_period_end * 1000)
    : null;

  await adminDb
    .collection("groups")
    .doc(groupId)
    .update({
      "subscription.status": status,
      "subscription.plan": plan,
      "subscription.stripeSubscriptionId": subscription.id,
      "subscription.stripeCustomerId": String(subscription.customer),
      "subscription.currentPeriodEndsAt": currentPeriodEndsAt,
      "subscription.trialEndsAt": null,
      "subscription.exemptReason": null,
      "subscription.updatedAt": FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

  console.log(`[webhook] synced group ${groupId} → status=${status} plan=${plan}`);
}

// In Stripe SDK v22, Invoice.subscription moved to Invoice.parent.subscription_details.subscription
function getInvoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const parent = invoice.parent as (Stripe.Invoice["parent"] & {
    subscription_details?: { subscription?: string | Stripe.Subscription };
  }) | null;
  const sub = parent?.subscription_details?.subscription;
  if (!sub) return null;
  return typeof sub === "string" ? sub : sub.id;
}

async function handleInvoicePaymentFailed(
  adminDb: ReturnType<typeof getFirebaseAdminDb>,
  invoice: Stripe.Invoice
) {
  const stripeCustomerId = String(invoice.customer);
  const groupId = await groupIdByCustomer(adminDb, stripeCustomerId);
  if (!groupId) return;

  await adminDb
    .collection("groups")
    .doc(groupId)
    .update({
      "subscription.status": "past_due" as SubscriptionStatus,
      "subscription.updatedAt": FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

  console.log(`[webhook] payment failed for group ${groupId} → past_due`);
}

export async function POST(request: NextRequest) {
  if (!isStripeConfigured() || !isFirebaseAdminConfigured()) {
    return NextResponse.json({ error: "Stripe not configured." }, { status: 503 });
  }

  const rawBody = await request.text();
  const signature = request.headers.get("stripe-signature") ?? "";
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Signature verification failed.";
    console.error("[webhook] signature error:", msg);
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const adminDb = getFirebaseAdminDb();

  try {
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await syncSubscription(adminDb, event.data.object as Stripe.Subscription);
        break;

      case "invoice.payment_failed":
        await handleInvoicePaymentFailed(adminDb, event.data.object as Stripe.Invoice);
        break;

      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        const subId = getInvoiceSubscriptionId(invoice);
        if (subId) {
          const sub = await getStripe().subscriptions.retrieve(subId);
          await syncSubscription(adminDb, sub);
        }
        break;
      }

      default:
        break;
    }
  } catch (err) {
    console.error("[webhook] handler error:", err);
    return NextResponse.json({ ok: false, error: "Internal handler error." });
  }

  return NextResponse.json({ ok: true, type: event.type });
}
