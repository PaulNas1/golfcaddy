import { auth } from "@/lib/firebase";
import type { StripePlan } from "@/lib/stripeServer";

async function getBearerToken(): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error("Not signed in.");
  return user.getIdToken();
}

/**
 * Creates a Stripe Checkout session for the given plan and redirects the
 * browser to the Stripe-hosted checkout page.
 */
export async function startCheckout(plan: StripePlan): Promise<void> {
  const token = await getBearerToken();

  const res = await fetch("/api/stripe/checkout", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ plan }),
  });

  const data = await res.json();
  if (!res.ok || !data.url) {
    throw new Error(data.error ?? "Failed to start checkout.");
  }

  window.location.href = data.url;
}

/**
 * Opens the Stripe Customer Portal so the admin can manage or cancel
 * their subscription. Redirects the browser.
 */
export async function openBillingPortal(): Promise<void> {
  const token = await getBearerToken();

  const res = await fetch("/api/stripe/portal", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });

  const data = await res.json();
  if (!res.ok || !data.url) {
    throw new Error(data.error ?? "Failed to open billing portal.");
  }

  window.location.href = data.url;
}
