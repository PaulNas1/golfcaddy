"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { getGroup } from "@/lib/firestore";
import { openBillingPortal } from "@/lib/billingClient";
import { PLAN_LABELS, PLAN_PRICES } from "@/lib/subscription";
import type { GroupSubscription } from "@/types";

export default function BillingPage() {
  const { appUser } = useAuth();
  const searchParams = useSearchParams();
  const success = searchParams.get("success") === "1";
  const cancelled = searchParams.get("cancel") === "1";

  const [subscription, setSubscription] = useState<GroupSubscription | null | undefined>(undefined);
  const [portalLoading, setPortalLoading] = useState(false);
  const [portalError, setPortalError] = useState("");

  useEffect(() => {
    if (!appUser?.groupId) return;
    getGroup(appUser.groupId).then((group) => {
      setSubscription(group?.subscription ?? null);
    });
  }, [appUser?.groupId]);

  async function handleManage() {
    setPortalLoading(true);
    setPortalError("");
    try {
      await openBillingPortal();
    } catch (err) {
      setPortalError(err instanceof Error ? err.message : "Something went wrong.");
      setPortalLoading(false);
    }
  }

  const isActive = subscription?.status === "active";
  const isPastDue = subscription?.status === "past_due";
  const plan = subscription?.plan;
  const renewalDate = subscription?.currentPeriodEndsAt
    ? new Date(subscription.currentPeriodEndsAt).toLocaleDateString("en-AU", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;

  return (
    <div className="space-y-6 max-w-lg">
      {/* Result banner */}
      {success && (
        <div className="rounded-xl border border-green-200 bg-green-50 p-4 flex items-start gap-3">
          <CheckCircleIcon className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-green-800">Subscription activated</p>
            <p className="text-sm text-green-700 mt-0.5">
              Your plan is now live. Thanks for subscribing to GolfCaddy.
            </p>
          </div>
        </div>
      )}
      {cancelled && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 flex items-start gap-3">
          <InfoIcon className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-amber-800">Checkout cancelled</p>
            <p className="text-sm text-amber-700 mt-0.5">
              No payment was taken. You can choose a plan from Settings whenever you&apos;re ready.
            </p>
          </div>
        </div>
      )}

      {/* Current plan card */}
      <div className="rounded-xl border border-gray-200 bg-white divide-y divide-gray-100">
        <div className="px-5 py-4">
          <h2 className="font-semibold text-gray-900">Current plan</h2>
        </div>

        <div className="px-5 py-4">
          {subscription === undefined ? (
            <p className="text-sm text-gray-400">Loading…</p>
          ) : !isActive && !isPastDue ? (
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-700 capitalize">{subscription?.status ?? "No plan"}</p>
                <p className="text-sm text-gray-500 mt-0.5">
                  Choose a plan in{" "}
                  <Link href="/admin/settings" className="text-green-700 underline">
                    Settings
                  </Link>{" "}
                  to unlock full access.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-gray-900">
                    {plan ? PLAN_LABELS[plan] : "Active"} plan
                  </p>
                  {plan && (
                    <p className="text-sm text-gray-500">
                      ${PLAN_PRICES[plan].monthly} AUD / month
                    </p>
                  )}
                </div>
                <span
                  className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                    isActive
                      ? "bg-green-100 text-green-700"
                      : "bg-amber-100 text-amber-700"
                  }`}
                >
                  {isActive ? "Active" : "Past due"}
                </span>
              </div>

              {isPastDue && (
                <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  Your last payment failed. Please update your payment method to avoid suspension.
                </p>
              )}

              {renewalDate && (
                <p className="text-sm text-gray-500">
                  {isActive ? "Renews" : "Period ends"} {renewalDate}
                </p>
              )}

              {portalError && (
                <p className="text-sm text-red-600">{portalError}</p>
              )}

              <button
                onClick={handleManage}
                disabled={portalLoading}
                className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-100 transition-colors disabled:opacity-50"
              >
                {portalLoading ? "Opening portal…" : "Manage billing"}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Plan comparison */}
      {(isActive || isPastDue) && plan && (
        <div className="rounded-xl border border-gray-200 bg-white divide-y divide-gray-100">
          <div className="px-5 py-4">
            <h2 className="font-semibold text-gray-900">Plan limits</h2>
          </div>
          <div className="px-5 py-4 grid grid-cols-3 gap-3 text-center">
            {(["starter", "club", "society"] as const).map((p) => (
              <div
                key={p}
                className={`rounded-lg border p-3 ${
                  p === plan
                    ? "border-green-300 bg-green-50"
                    : "border-gray-100 bg-gray-50"
                }`}
              >
                <p className={`text-xs font-semibold uppercase tracking-wide ${p === plan ? "text-green-700" : "text-gray-500"}`}>
                  {PLAN_LABELS[p]}
                </p>
                <p className={`text-lg font-bold mt-1 ${p === plan ? "text-green-800" : "text-gray-400"}`}>
                  ${PLAN_PRICES[p].monthly}
                </p>
                <p className="text-xs text-gray-400">AUD/mo</p>
              </div>
            ))}
          </div>
          <div className="px-5 py-3">
            <p className="text-xs text-gray-400 text-center">
              To change plan, use &ldquo;Manage billing&rdquo; above.
            </p>
          </div>
        </div>
      )}

      <Link
        href="/admin/settings"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
      >
        ← Back to Settings
      </Link>
    </div>
  );
}

function CheckCircleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function InfoIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
    </svg>
  );
}
