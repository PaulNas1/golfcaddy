import { test } from "node:test";
import assert from "node:assert/strict";

// Fresh module copy per test (query string busts the cache) so env changes apply.
const load = (spec: string) => import(new URL(spec, import.meta.url).href);

// Billing kill switch: with NEXT_PUBLIC_BILLING_ENABLED unset, nobody is capped or gated.
test("billing off by default → no member cap for any group state", async () => {
  delete process.env.NEXT_PUBLIC_BILLING_ENABLED;
  const { BILLING_ENABLED, getMemberLimit } = await load("../lib/subscription.ts?off");
  assert.equal(BILLING_ENABLED, false);
  assert.equal(getMemberLimit({ status: "exempt", plan: null }), Infinity); // FourPlay today
  assert.equal(getMemberLimit({ status: "suspended", plan: null }), Infinity);
  assert.equal(getMemberLimit({ status: "trial", plan: null }), Infinity);
  assert.equal(getMemberLimit(null), Infinity);
});

test("billing back on → original caps return (code preserved)", async () => {
  process.env.NEXT_PUBLIC_BILLING_ENABLED = "true";
  const { BILLING_ENABLED, getMemberLimit } = await load("../lib/subscription.ts?on");
  assert.equal(BILLING_ENABLED, true);
  assert.equal(getMemberLimit({ status: "exempt", plan: null }), Infinity);
  assert.equal(getMemberLimit({ status: "trial", plan: null }), 20);
  assert.equal(getMemberLimit({ status: "suspended", plan: null }), 0);
  delete process.env.NEXT_PUBLIC_BILLING_ENABLED;
});

test("Stripe off with billing off → not configured, client refuses to build", async () => {
  delete process.env.NEXT_PUBLIC_BILLING_ENABLED;
  process.env.STRIPE_SECRET_KEY = "sk_test_dummy";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_dummy";
  const { isStripeConfigured, getStripe } = await load("../lib/stripeServer.ts?off");
  assert.equal(isStripeConfigured(), false);
  assert.throws(() => getStripe(), /turned off/);
});
