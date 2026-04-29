import type { GroupSubscription, SubscriptionPlan } from "@/types";

// ─── Pricing ──────────────────────────────────────────────────────────────────

export const PLAN_PRICES: Record<SubscriptionPlan, { monthly: number; annual: number }> = {
  starter: { monthly: 29, annual: 290 },
  club:    { monthly: 49, annual: 490 },
  society: { monthly: 79, annual: 790 },
};

export const PLAN_LABELS: Record<SubscriptionPlan, string> = {
  starter: "Starter",
  club:    "Club",
  society: "Society",
};

// ─── Member limits ────────────────────────────────────────────────────────────

export const PLAN_MEMBER_LIMITS: Record<SubscriptionPlan, number> = {
  starter: 20,
  club:    40,
  society: 80,
};

export const TRIAL_MEMBER_LIMIT = 20;

/**
 * Returns the maximum number of active members allowed for a group
 * based on its current subscription. Returns Infinity for exempt groups.
 * Accepts the full GroupSubscription type or a partial shape (e.g. from API responses
 * where date fields are serialised as strings).
 */
export function getMemberLimit(subscription: Pick<GroupSubscription, "status" | "plan"> | null | undefined): number {
  if (!subscription) return TRIAL_MEMBER_LIMIT; // no subscription yet → grace at starter cap

  switch (subscription.status) {
    case "exempt":
      return Infinity;
    case "trial":
      return TRIAL_MEMBER_LIMIT;
    case "active":
    case "past_due":
      return subscription.plan ? PLAN_MEMBER_LIMITS[subscription.plan] : TRIAL_MEMBER_LIMIT;
    case "suspended":
      return 0; // suspended groups are redirected to the wall page anyway
    default:
      return TRIAL_MEMBER_LIMIT;
  }
}

/**
 * Returns a human-readable description of the current plan for display
 * in the admin members page.
 */
export function getPlanLabel(subscription: Pick<GroupSubscription, "status" | "plan"> | null | undefined): string {
  if (!subscription) return "No plan";
  switch (subscription.status) {
    case "exempt":  return "Exempt";
    case "trial":   return "Trial (up to 20 members)";
    case "active":  return subscription.plan ? `${PLAN_LABELS[subscription.plan]} plan` : "Active";
    case "past_due": return subscription.plan ? `${PLAN_LABELS[subscription.plan]} (payment overdue)` : "Payment overdue";
    case "suspended": return "Suspended";
    default: return "Unknown";
  }
}

/**
 * The plan a group would need to upgrade to in order to accommodate
 * the given number of members. Returns null if current plan is sufficient.
 */
export function getRequiredPlan(memberCount: number): SubscriptionPlan | null {
  if (memberCount <= 20) return "starter";
  if (memberCount <= 40) return "club";
  if (memberCount <= 80) return "society";
  return "society"; // largest tier
}
