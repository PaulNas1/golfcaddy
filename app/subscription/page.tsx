"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { getGroup } from "@/lib/firestore";
import { startCheckout } from "@/lib/billingClient";
import { PLAN_PRICES, PLAN_MEMBER_LIMITS, getRequiredPlan } from "@/lib/subscription";
import type { Group } from "@/types";
import type { StripePlan } from "@/lib/stripeServer";

const PLANS: { id: StripePlan; name: string; tagline: string }[] = [
  { id: "starter", name: "Starter",  tagline: "Up to 20 players" },
  { id: "club",    name: "Club",     tagline: "Up to 40 players" },
  { id: "society", name: "Society",  tagline: "Up to 80 players" },
];

type SuspendReason = "trial_expired" | "payment_issue" | "manual";

function detectReason(group: Group | null): SuspendReason {
  if (!group?.subscription) return "manual";
  const { trialEndsAt, stripeCustomerId } = group.subscription;
  if (trialEndsAt && !stripeCustomerId) return "trial_expired";
  if (stripeCustomerId) return "payment_issue";
  return "manual";
}

export default function SubscriptionWallPage() {
  const { appUser, loading, signOut } = useAuth();
  const router = useRouter();
  const [group, setGroup] = useState<Group | null>(null);
  const [groupLoading, setGroupLoading] = useState(true);
  const [checkoutPlan, setCheckoutPlan] = useState<StripePlan | null>(null);
  const [checkoutError, setCheckoutError] = useState("");

  useEffect(() => {
    if (!appUser?.groupId) { setGroupLoading(false); return; }
    getGroup(appUser.groupId)
      .then(setGroup)
      .catch(() => setGroup(null))
      .finally(() => setGroupLoading(false));
  }, [appUser?.groupId]);

  useEffect(() => {
    if (loading) return;
    if (!appUser) router.replace("/signin");
  }, [loading, appUser, router]);

  // If subscription is restored (admin acted from portal), let them back in.
  useEffect(() => {
    if (!group) return;
    const s = group.subscription?.status;
    if (s === "active" || s === "trial" || s === "exempt") router.replace("/home");
  }, [group, router]);

  const handleCheckout = async (plan: StripePlan) => {
    setCheckoutPlan(plan);
    setCheckoutError("");
    try {
      await startCheckout(plan);
    } catch (err) {
      setCheckoutError(err instanceof Error ? err.message : "Something went wrong — please try again.");
      setCheckoutPlan(null);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    router.replace("/signin");
  };

  if (loading || groupLoading || !appUser) {
    return (
      <div className="min-h-screen bg-brand-700 flex items-center justify-center">
        <div className="text-center">
          <div className="text-5xl mb-3">⛳</div>
          <div className="flex items-center justify-center gap-2">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-brand-300 animate-bounce [animation-delay:0ms]" />
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-brand-300 animate-bounce [animation-delay:150ms]" />
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-brand-300 animate-bounce [animation-delay:300ms]" />
          </div>
        </div>
      </div>
    );
  }

  const isAdmin = appUser.role === "admin";
  const memberCount = group?.memberCount ?? 0;
  const recommendedPlan = getRequiredPlan(memberCount) ?? "starter";
  const reason = detectReason(group);
  const groupName = group?.name ?? "your group";

  const copy: Record<SuspendReason, { heading: string; subtext: string; showPricing: boolean }> = {
    trial_expired: {
      heading: "Your free trial has ended",
      subtext: `Thanks for trying GolfCaddy with ${groupName}. Your rounds, leaderboards and history are all safe — pick a plan to keep going.`,
      showPricing: true,
    },
    payment_issue: {
      heading: `Let's get ${groupName} back on the course`,
      subtext: "There was a problem with your last payment. Choose a plan below to restore access — everything is exactly as you left it.",
      showPricing: true,
    },
    manual: {
      heading: "Access has been paused",
      subtext: "Please reach out to GolfCaddy support and we'll get you sorted out as quickly as possible.",
      showPricing: false,
    },
  };

  const { heading, subtext, showPricing } = copy[reason];

  return (
    <div className="min-h-screen bg-brand-700 flex flex-col">

      {/* Header */}
      <div className="px-6 pt-10 pb-8 text-center">
        <div className="text-4xl mb-2">⛳</div>
        <p className="text-brand-100 font-semibold text-lg">{groupName}</p>
      </div>

      {/* Sheet */}
      <div className="flex-1 bg-white rounded-t-3xl px-6 pt-8 pb-12">

        {/* Hero */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-3 leading-tight">{heading}</h1>
          <p className="text-gray-500 text-sm leading-relaxed max-w-xs mx-auto">{subtext}</p>
        </div>

        {/* Pricing — admin only */}
        {showPricing && isAdmin && (
          <>
            <div className="space-y-3 mb-5">
              {PLANS.map((plan) => {
                const price = PLAN_PRICES[plan.id];
                const limit = PLAN_MEMBER_LIMITS[plan.id];
                const isRecommended = plan.id === recommendedPlan;
                const isLoading = checkoutPlan === plan.id;

                return (
                  <button
                    key={plan.id}
                    onClick={() => handleCheckout(plan.id)}
                    disabled={!!checkoutPlan}
                    className={`w-full text-left rounded-2xl border-2 p-4 transition-all active:scale-[0.99] ${
                      isRecommended
                        ? "border-surface-selectedBorder bg-surface-selected"
                        : "border-surface-overlay bg-surface-muted hover:border-surface-overlay"
                    } disabled:opacity-60`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-gray-900">{plan.name}</span>
                          {isRecommended && (
                            <span className="rounded-full bg-green-600 px-2 py-0.5 text-xs font-bold text-white">
                              Recommended
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5">{plan.tagline} &mdash; ${price.annual}/yr billed annually</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-bold text-gray-900 text-lg leading-none">
                          ${price.monthly}
                          <span className="text-xs font-normal text-gray-400">/mo</span>
                        </p>
                        {isLoading ? (
                          <span className="text-xs text-green-600">Redirecting…</span>
                        ) : (
                          <span className="text-xs text-green-600 font-semibold">Select →</span>
                        )}
                      </div>
                    </div>

                    {/* Member usage bar for recommended plan */}
                    {isRecommended && memberCount > 0 && (
                      <div className="mt-3">
                        <div className="flex justify-between text-xs text-gray-400 mb-1">
                          <span>Your group</span>
                          <span>{memberCount} / {limit} members</span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-green-400"
                            style={{ width: `${Math.min(100, (memberCount / limit) * 100)}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {checkoutError && (
              <p className="text-sm text-red-500 text-center mb-4">{checkoutError}</p>
            )}

            <p className="text-center text-xs text-gray-400 mb-8">
              Cancel anytime &middot; Secure checkout via Stripe
            </p>
          </>
        )}

        {/* Non-admin notice */}
        {showPricing && !isAdmin && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-8 text-center">
            <p className="text-sm text-amber-800 font-medium mb-1">Admin action required</p>
            <p className="text-xs text-amber-700">
              Only your group admin can restore billing. Let them know and they can get everyone back on the course.
            </p>
          </div>
        )}

        {/* Footer */}
        <div className="space-y-3">
          <a
            href="mailto:support@golfcaddy.app"
            className="block w-full text-center bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-3 rounded-xl text-sm transition-colors"
          >
            Contact Support
          </a>
          <button
            type="button"
            onClick={handleSignOut}
            className="block w-full text-center text-gray-400 hover:text-gray-600 text-sm py-2 transition-colors"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
