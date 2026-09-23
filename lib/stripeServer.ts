import Stripe from "stripe";
import { BILLING_ENABLED } from "./subscription.ts";

// Stripe is OFF while BILLING_ENABLED is false (see lib/subscription.ts).
// Nothing talks to Stripe: getStripe() throws and isStripeConfigured() is false,
// so checkout, portal, webhook and admin cancellations all stand down.

// Lazy singleton — constructed once per cold start, never on the client.
let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!BILLING_ENABLED) throw new Error("Stripe is turned off (billing disabled).");
  if (_stripe) return _stripe;

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set.");

  _stripe = new Stripe(key, {
    // Pin to a known API version so the types stay in sync.
    apiVersion: "2026-04-22.dahlia",
    appInfo: {
      name: "GolfCaddy",
      url: "https://golfcaddy-alpha.vercel.app",
    },
  });

  return _stripe;
}

export function isStripeConfigured(): boolean {
  if (!BILLING_ENABLED) return false;
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET);
}

// ─── Price IDs ────────────────────────────────────────────────────────────────
// These must match the Stripe sandbox prices created for this account.

export const STRIPE_PRICE_IDS: Record<"starter" | "club" | "society", string> = {
  starter: "price_1TRWVW2LcQXwgHoCyGzYwgyY",
  club:    "price_1TRWVd2LcQXwgHoCjIYoZWYP",
  society: "price_1TRWVi2LcQXwgHoC49ySH4tL",
};

export type StripePlan = keyof typeof STRIPE_PRICE_IDS;

/** Reverse-lookup: priceId → plan name */
export const PRICE_ID_TO_PLAN: Record<string, StripePlan> = Object.fromEntries(
  Object.entries(STRIPE_PRICE_IDS).map(([plan, priceId]) => [priceId, plan as StripePlan])
);
