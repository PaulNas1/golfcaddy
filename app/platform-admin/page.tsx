"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { getMemberLimit, getPlanLabel } from "@/lib/subscription";
import type { SubscriptionStatus, SubscriptionPlan } from "@/types";

// ─── Types ────────────────────────────────────────────────────────────────────

type GroupRow = {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  memberCount: number;
  currentSeason: number;
  adminEmail: string | null;
  platformNotes: string | null;
  subscription: {
    status: SubscriptionStatus;
    plan: SubscriptionPlan | null;
    exemptReason: string | null;
    stripeCustomerId: string | null;
    stripeSubscriptionId: string | null;
    trialEndsAt: string | null;
    currentPeriodEndsAt: string | null;
  } | null;
  createdAt: string | null;
  activity: {
    lastRoundAt: string | null;
    roundsLast30Days: number;
    newMembersLast30Days: number;
    membersActiveThisWeek: number;
    totalMembers: number;
  } | null;
};

type Stats = {
  total: number;
  exempt: number;
  trial: number;
  active: number;
  past_due: number;
  suspended: number;
  none: number;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  SubscriptionStatus | "none",
  { label: string; bg: string; text: string }
> = {
  exempt:    { label: "Exempt",    bg: "bg-[var(--sub-exempt-bg)]",    text: "text-[var(--sub-exempt-text)]" },
  trial:     { label: "Trial",     bg: "bg-[var(--sub-trial-bg)]",     text: "text-[var(--sub-trial-text)]" },
  active:    { label: "Active",    bg: "bg-[var(--sub-active-bg)]",    text: "text-[var(--sub-active-text)]" },
  past_due:  { label: "Past Due",  bg: "bg-[var(--sub-pastdue-bg)]",   text: "text-[var(--sub-pastdue-text)]" },
  suspended: { label: "Suspended", bg: "bg-[var(--sub-suspended-bg)]", text: "text-[var(--sub-suspended-text)]" },
  none:      { label: "No plan",   bg: "bg-[var(--sub-none-bg)]",      text: "text-[var(--sub-none-text)]" },
};

const PLAN_LABELS: Record<SubscriptionPlan, string> = {
  starter: "Starter (1–20)",
  club:    "Club (21–40)",
  society: "Society (41–80)",
};

function StatusBadge({ status }: { status: SubscriptionStatus | "none" }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${cfg.bg} ${cfg.text}`}>
      {cfg.label}
    </span>
  );
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (!isFinite(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", year: "numeric" }).format(d);
}

function timeAgo(iso: string | null): string {
  if (!iso) return "never";
  const diffMs = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diffMs / 86400000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months === 1) return "1mo ago";
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}yr ago`;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function PlatformAdminPage() {
  const { appUser, loading: authLoading } = useAuth();
  const router = useRouter();

  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [actionGroupId, setActionGroupId] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [expiringTrials, setExpiringTrials] = useState(false);
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [editingNotesId, setEditingNotesId] = useState<string | null>(null);
  const [notesValue, setNotesValue] = useState("");

  // Modals
  const [exemptModal, setExemptModal] = useState<GroupRow | null>(null);
  const [exemptReason, setExemptReason] = useState("platform_grant");
  const [trialModal, setTrialModal] = useState<GroupRow | null>(null);
  const [trialDays, setTrialDays] = useState("30");

  // ── Auth gate ────────────────────────────────────────────────────────────
  // Allow access if the Firestore flag is set OR if the signed-in email matches
  // the platform admin email (bootstrap: flag not yet written via seed).
  const platformAdminEmail = process.env.NEXT_PUBLIC_PLATFORM_ADMIN_EMAIL ?? "";
  const isAuthorised =
    appUser?.platformAdmin === true ||
    (!!appUser?.email && appUser.email.toLowerCase() === platformAdminEmail.toLowerCase());

  useEffect(() => {
    if (authLoading) return;
    if (!appUser || !isAuthorised) router.replace("/home");
  }, [authLoading, appUser, isAuthorised, router]);

  // ── Close menu on outside click ──────────────────────────────────────────
  useEffect(() => {
    if (!openMenuId) return;
    const handler = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setOpenMenuId(null);
    };
    document.addEventListener("pointerdown", handler);
    return () => document.removeEventListener("pointerdown", handler);
  }, [openMenuId]);

  // ── Fetch groups ─────────────────────────────────────────────────────────
  const fetchGroups = useCallback(async () => {
    setLoadingData(true);
    setError("");
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch("/api/platform-admin/groups", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to load groups.");
      const data = await res.json();
      setGroups(data.groups);
      setStats(data.stats);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load groups.");
    } finally {
      setLoadingData(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && isAuthorised) fetchGroups();
  }, [authLoading, isAuthorised, fetchGroups]);

  // ── One-time seed (first visit) ──────────────────────────────────────────
  const handleSeed = async () => {
    setSeeding(true);
    setError("");
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch("/api/platform-admin/seed", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Seed failed.");
      setSuccess(data.message);
      await fetchGroups();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Seed failed.");
    } finally {
      setSeeding(false);
    }
  };

  // ── Expire trials ────────────────────────────────────────────────────────
  const handleExpireTrials = async () => {
    setExpiringTrials(true);
    setError("");
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch("/api/platform-admin/expire-trials", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed.");
      setSuccess(
        data.expired === 0
          ? "No expired trials found."
          : `Suspended ${data.expired} expired trial${data.expired !== 1 ? "s" : ""}.`
      );
      if (data.expired > 0) await fetchGroups();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed.");
    } finally {
      setExpiringTrials(false);
    }
  };

  // ── Save notes ────────────────────────────────────────────────────────────
  const saveNotes = async (groupId: string, notes: string) => {
    try {
      const token = await auth.currentUser?.getIdToken();
      await fetch("/api/platform-admin/notes", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ groupId, notes }),
      });
      setGroups((prev) =>
        prev.map((g) => (g.id === groupId ? { ...g, platformNotes: notes.trim() || null } : g))
      );
    } catch {
      // non-fatal — notes save silently fails
    }
    setEditingNotesId(null);
  };

  // ── Update subscription ──────────────────────────────────────────────────
  const updateSubscription = async (
    groupId: string,
    status: SubscriptionStatus,
    extras: { plan?: SubscriptionPlan | null; exemptReason?: string; trialDays?: number } = {}
  ) => {
    setActionGroupId(groupId);
    setError("");
    setSuccess("");
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch("/api/platform-admin/subscription", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ groupId, status, ...extras }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Update failed.");
      setSuccess(`${groups.find((g) => g.id === groupId)?.name ?? groupId} → ${status}`);
      await fetchGroups();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed.");
    } finally {
      setActionGroupId(null);
    }
  };

  if (authLoading || (!isAuthorised && !authLoading)) {
    return (
      <div className="min-h-screen bg-surface-page flex items-center justify-center">
        <p className="text-ink-hint text-sm">Loading...</p>
      </div>
    );
  }

  const unseeded = groups.filter((g) => !g.subscription);
  const hasUnseeded = unseeded.length > 0;

  return (
    <div className="min-h-screen bg-surface-page">
      {/* Header */}
      <div className="bg-green-700 px-4 py-5">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-2xl">⛳</span>
              <h1 className="text-xl font-bold text-white">GolfCaddy</h1>
              <span className="ml-1 rounded-full bg-green-500 px-2.5 py-0.5 text-xs font-bold text-white">
                Platform Admin
              </span>
            </div>
            <p className="mt-0.5 text-green-200 text-xs">
              You are signed in as {appUser?.email}
            </p>
          </div>
          <button
            onClick={() => router.push("/home")}
            className="rounded-xl border border-green-500 px-3 py-1.5 text-xs font-semibold text-green-100 hover:bg-green-600 transition-colors"
          >
            ← App
          </button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">

        {/* Messages */}
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        )}
        {success && (
          <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">{success}</div>
        )}

        {/* Stats — click to filter */}
        {stats && (
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-7">
            {(
              [
                ["Total",     stats.total,     "bg-surface-card",              "text-ink-title",                    null],
                ["Exempt",    stats.exempt,    "bg-[var(--sub-exempt-bg)]",    "text-[var(--sub-exempt-text)]",    "exempt"],
                ["Trial",     stats.trial,     "bg-[var(--sub-trial-bg)]",     "text-[var(--sub-trial-text)]",     "trial"],
                ["Active",    stats.active,    "bg-[var(--sub-active-bg)]",    "text-[var(--sub-active-text)]",    "active"],
                ["Past Due",  stats.past_due,  "bg-[var(--sub-pastdue-bg)]",   "text-[var(--sub-pastdue-text)]",   "past_due"],
                ["Suspended", stats.suspended, "bg-[var(--sub-suspended-bg)]", "text-[var(--sub-suspended-text)]", "suspended"],
                ["No Plan",   stats.none,      "bg-[var(--sub-none-bg)]",      "text-[var(--sub-none-text)]",      "none"],
              ] as [string, number, string, string, string | null][]
            ).map(([label, count, bg, text, filterKey]) => {
              const isActive = activeFilter === filterKey;
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => setActiveFilter(isActive ? null : filterKey)}
                  className={`rounded-2xl border p-3 text-center shadow-sm transition-all ${bg} ${
                    isActive
                      ? "border-ink-muted ring-2 ring-ink-muted ring-offset-1"
                      : "border-surface-overlay hover:border-ink-hint"
                  }`}
                >
                  <p className={`text-2xl font-bold ${text}`}>{count}</p>
                  <p className="mt-0.5 text-xs text-ink-muted">{label}</p>
                </button>
              );
            })}
          </div>
        )}

        {/* Seed banner */}
        {hasUnseeded && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-amber-800">
                {unseeded.length} group{unseeded.length !== 1 ? "s" : ""} without a subscription plan
              </p>
              <p className="mt-1 text-xs text-amber-700">
                Run first-time setup to give unseeded groups a 30-day trial and grant your account
                platform admin access permanently.
              </p>
            </div>
            <button
              onClick={handleSeed}
              disabled={seeding}
              className="shrink-0 rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50 transition-colors"
            >
              {seeding ? "Running..." : "Run Setup"}
            </button>
          </div>
        )}

        {/* Groups list */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-ink-title">Groups</h2>
              {activeFilter && (
                <span className="rounded-full bg-surface-overlay px-2.5 py-0.5 text-xs font-medium text-ink-muted capitalize">
                  {activeFilter.replace("_", " ")}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleExpireTrials}
                disabled={expiringTrials || loadingData}
                className="text-xs text-amber-600 hover:underline disabled:text-ink-hint"
              >
                {expiringTrials ? "Expiring..." : "⏱ Expire Trials"}
              </button>
              <button
                onClick={fetchGroups}
                disabled={loadingData}
                className="text-xs text-green-600 hover:underline disabled:text-ink-hint"
              >
                {loadingData ? "Loading..." : "↻ Refresh"}
              </button>
            </div>
          </div>

          {loadingData ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="animate-pulse bg-surface-muted rounded-2xl h-24" />
              ))}
            </div>
          ) : groups.length === 0 ? (
            <div className="rounded-2xl bg-surface-card p-8 text-center text-ink-hint text-sm border border-surface-overlay">
              No groups found.
            </div>
          ) : (
            <div className="space-y-3">
              {groups
                .filter((g) => {
                  if (!activeFilter) return true;
                  const status = g.subscription?.status ?? "none";
                  return status === activeFilter;
                })
                .map((group) => {
                const subStatus = group.subscription?.status ?? "none";
                const isActioning = actionGroupId === group.id;
                return (
                  <div
                    key={group.id}
                    className="rounded-2xl border border-surface-overlay bg-surface-card p-4 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      {/* Left: identity */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-ink-title">{group.name}</span>
                          <span className="rounded-md bg-surface-muted px-1.5 py-0.5 font-mono text-xs text-ink-muted">
                            {group.slug}
                          </span>
                          <StatusBadge status={subStatus} />
                          {group.subscription?.plan && (
                            <span className="text-xs text-ink-muted">
                              {PLAN_LABELS[group.subscription.plan]}
                            </span>
                          )}
                        </div>
                        <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted">
                          {/* Member usage */}
                          {(() => {
                            const limit = getMemberLimit(group.subscription);
                            const count = group.memberCount;
                            const pct = limit === Infinity ? 0 : Math.min(100, (count / limit) * 100);
                            const atLimit = limit !== Infinity && count >= limit;
                            const nearLimit = limit !== Infinity && pct >= 80 && !atLimit;
                            const planStr = getPlanLabel(group.subscription);
                            return (
                              <span className="flex items-center gap-1.5 flex-wrap">
                                <span className={atLimit ? "font-semibold text-red-500" : nearLimit ? "font-semibold text-amber-500" : ""}>
                                  {limit === Infinity ? `${count} members` : `${count} / ${limit} members`}
                                </span>
                                {limit !== Infinity && (
                                  <span className="inline-flex w-16 h-1.5 rounded-full bg-surface-overlay overflow-hidden">
                                    <span
                                      className={`h-full rounded-full ${atLimit ? "bg-red-400" : nearLimit ? "bg-amber-400" : "bg-green-500"}`}
                                      style={{ width: `${pct}%` }}
                                    />
                                  </span>
                                )}
                                <span className="text-ink-hint">· {planStr}</span>
                              </span>
                            );
                          })()}
                          {group.adminEmail && <span>Admin: {group.adminEmail}</span>}
                          <span>Created {formatDate(group.createdAt)}</span>
                          {group.subscription?.exemptReason && (
                            <span className="text-purple-600">
                              {group.subscription.exemptReason}
                            </span>
                          )}
                          {group.subscription?.stripeCustomerId && (
                            <a
                              href={`https://dashboard.stripe.com/test/customers/${group.subscription.stripeCustomerId}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-500 hover:underline"
                              onClick={(e) => e.stopPropagation()}
                            >
                              Stripe ↗
                            </a>
                          )}
                          {group.subscription?.currentPeriodEndsAt && group.subscription.status === "active" && (
                            <span>Renews {formatDate(group.subscription.currentPeriodEndsAt)}</span>
                          )}
                        </div>

                        {/* Activity signals */}
                        {group.activity && (
                          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                            {/* Last round */}
                            <span className={`flex items-center gap-1 ${
                              !group.activity.lastRoundAt ? "text-ink-hint" :
                              Date.now() - new Date(group.activity.lastRoundAt).getTime() > 60 * 86400000
                                ? "text-red-500 font-medium"
                                : Date.now() - new Date(group.activity.lastRoundAt).getTime() > 30 * 86400000
                                  ? "text-amber-500 font-medium"
                                  : "text-ink-muted"
                            }`}>
                              <span>⛳</span>
                              <span>Last round: {timeAgo(group.activity.lastRoundAt)}</span>
                            </span>
                            {/* Rounds last 30 days */}
                            <span className="text-ink-muted">
                              {group.activity.roundsLast30Days} round{group.activity.roundsLast30Days !== 1 ? "s" : ""} / 30d
                            </span>
                            {/* New members */}
                            {group.activity.newMembersLast30Days > 0 && (
                              <span className="text-green-600 font-medium">
                                +{group.activity.newMembersLast30Days} member{group.activity.newMembersLast30Days !== 1 ? "s" : ""}
                              </span>
                            )}
                            {/* Login activity */}
                            {group.activity.totalMembers > 0 && (
                              <span className={`${
                                group.activity.membersActiveThisWeek === 0 ? "text-ink-hint" :
                                group.activity.membersActiveThisWeek / group.activity.totalMembers < 0.3
                                  ? "text-amber-500"
                                  : "text-ink-muted"
                              }`}>
                                {group.activity.membersActiveThisWeek}/{group.activity.totalMembers} active this week
                              </span>
                            )}
                          </div>
                        )}

                        {/* Trial countdown bar */}
                        {group.subscription?.status === "trial" && group.subscription.trialEndsAt && (() => {
                          const end = new Date(group.subscription.trialEndsAt!);
                          const now = new Date();
                          const totalDays = 30;
                          const daysLeft = Math.max(0, Math.ceil((end.getTime() - now.getTime()) / 86400000));
                          const daysUsed = totalDays - daysLeft;
                          const pct = Math.min(100, (daysUsed / totalDays) * 100);
                          const urgent = daysLeft <= 7;
                          const warning = daysLeft <= 14 && !urgent;
                          return (
                            <div className="mt-2.5">
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-xs text-ink-hint">Trial period</span>
                                <span className={`text-xs font-semibold ${urgent ? "text-red-500" : warning ? "text-amber-500" : "text-blue-500"}`}>
                                  {daysLeft === 0 ? "Expires today" : `${daysLeft} day${daysLeft !== 1 ? "s" : ""} left`}
                                </span>
                              </div>
                              <div className="h-1.5 w-full rounded-full bg-surface-muted overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all ${urgent ? "bg-red-400" : warning ? "bg-amber-400" : "bg-blue-400"}`}
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            </div>
                          );
                        })()}

                        {/* Notes */}
                        {editingNotesId === group.id ? (
                          <div className="mt-3">
                            <textarea
                              autoFocus
                              value={notesValue}
                              onChange={(e) => setNotesValue(e.target.value)}
                              onBlur={() => saveNotes(group.id, notesValue)}
                              onKeyDown={(e) => {
                                if (e.key === "Escape") setEditingNotesId(null);
                                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) saveNotes(group.id, notesValue);
                              }}
                              rows={2}
                              placeholder="Internal notes (only visible here)…"
                              className="w-full resize-none rounded-lg border border-surface-overlay bg-surface-page px-3 py-2 text-xs text-ink-body focus:outline-none focus:ring-2 focus:ring-green-500"
                            />
                            <p className="mt-1 text-xs text-ink-hint">⌘+Enter to save · Esc to cancel · blur to save</p>
                          </div>
                        ) : (
                          <button
                            onClick={() => {
                              setNotesValue(group.platformNotes ?? "");
                              setEditingNotesId(group.id);
                            }}
                            className="mt-2 text-xs text-ink-hint hover:text-ink-muted"
                          >
                            {group.platformNotes
                              ? `📝 ${group.platformNotes}`
                              : "+ add notes"}
                          </button>
                        )}
                      </div>

                      {/* Actions menu */}
                      <div className="relative" ref={openMenuId === group.id ? menuRef : null}>
                        <button
                          onClick={() => setOpenMenuId((c) => (c === group.id ? null : group.id))}
                          disabled={isActioning}
                          className="rounded-lg border border-surface-overlay p-2 text-ink-muted hover:bg-surface-page disabled:opacity-40"
                          aria-label={`Actions for ${group.name}`}
                        >
                          <EllipsisIcon className="h-4 w-4" />
                        </button>
                        {openMenuId === group.id && (
                          <div className="absolute right-0 top-10 z-20 w-52 rounded-2xl border border-surface-overlay bg-surface-card p-1.5 shadow-xl">
                            <ActionItem
                              label="Mark Exempt"
                              description="Free forever"
                              onClick={() => {
                                setOpenMenuId(null);
                                setExemptReason(group.subscription?.exemptReason ?? "platform_grant");
                                setExemptModal(group);
                              }}
                              color="purple"
                            />
                            <ActionItem
                              label="Start Trial"
                              description="Time-limited free access"
                              onClick={() => {
                                setOpenMenuId(null);
                                setTrialDays("30");
                                setTrialModal(group);
                              }}
                              color="blue"
                            />
                            <ActionItem
                              label="Suspend"
                              description="Block access"
                              onClick={() => {
                                setOpenMenuId(null);
                                updateSubscription(group.id, "suspended");
                              }}
                              color="red"
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Exempt Modal ── */}

      {exemptModal && (
        <Modal title={`Exempt: ${exemptModal.name}`} onClose={() => setExemptModal(null)}>
          <p className="text-sm text-ink-muted mb-4">
            This group will have free access permanently. Add a note for your own records.
          </p>
          <label className="block text-sm font-medium text-ink-body mb-1">Reason</label>
          <input
            type="text"
            value={exemptReason}
            onChange={(e) => setExemptReason(e.target.value)}
            className="w-full rounded-xl border border-surface-overlay px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            placeholder="e.g. founder_group, beta_tester"
          />
          <div className="mt-4 flex gap-2">
            <button
              onClick={async () => {
                const g = exemptModal;
                setExemptModal(null);
                await updateSubscription(g.id, "exempt", { exemptReason });
              }}
              className="flex-1 rounded-xl bg-purple-600 py-2.5 text-sm font-semibold text-white hover:bg-purple-700"
            >
              Mark Exempt
            </button>
            <button onClick={() => setExemptModal(null)} className="flex-1 rounded-xl border border-surface-overlay py-2.5 text-sm text-ink-muted">
              Cancel
            </button>
          </div>
        </Modal>
      )}

      {/* ── Trial Modal ── */}
      {trialModal && (
        <Modal title={`Start Trial: ${trialModal.name}`} onClose={() => setTrialModal(null)}>
          {trialModal.subscription?.status === "trial" && trialModal.subscription.trialEndsAt && (
            <div className="rounded-xl bg-blue-50 border border-blue-100 px-3 py-2.5 text-xs text-blue-700 mb-4">
              Currently expires <strong>{formatDate(trialModal.subscription.trialEndsAt)}</strong>. Setting a new trial replaces this.
            </div>
          )}
          <p className="text-sm text-ink-muted mb-4">
            Set how many days of free access to grant from today.
          </p>
          <label className="block text-sm font-medium text-ink-body mb-1">Trial length (days)</label>
          <input
            type="number"
            min="1"
            max="365"
            value={trialDays}
            onChange={(e) => setTrialDays(e.target.value)}
            className="w-full rounded-xl border border-surface-overlay px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          />
          {Number(trialDays) > 0 && (
            <p className="mt-2 text-xs text-ink-hint">
              Trial will end on{" "}
              <strong>
                {new Intl.DateTimeFormat("en-AU", {
                  day: "numeric", month: "short", year: "numeric",
                }).format(new Date(Date.now() + Number(trialDays) * 86_400_000))}
              </strong>
            </p>
          )}
          <div className="mt-4 flex gap-2">
            <button
              onClick={async () => {
                const g = trialModal;
                setTrialModal(null);
                await updateSubscription(g.id, "trial", { trialDays: Number(trialDays) });
              }}
              className="flex-1 rounded-xl bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Start Trial
            </button>
            <button onClick={() => setTrialModal(null)} className="flex-1 rounded-xl border border-surface-overlay py-2.5 text-sm text-ink-muted">
              Cancel
            </button>
          </div>
        </Modal>
      )}

    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-surface-card p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-ink-title">{title}</h3>
          <button onClick={onClose} className="text-ink-hint hover:text-ink-muted text-lg">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ActionItem({
  label,
  description,
  onClick,
  color,
}: {
  label: string;
  description: string;
  onClick: () => void;
  color: "purple" | "blue" | "green" | "red";
}) {
  const colors = {
    purple: "text-[var(--sub-exempt-text)] hover:bg-[var(--sub-exempt-bg)]",
    blue:   "text-[var(--sub-trial-text)] hover:bg-[var(--sub-trial-bg)]",
    green:  "text-[var(--sub-active-text)] hover:bg-[var(--sub-active-bg)]",
    red:    "text-[var(--sub-suspended-text)] hover:bg-[var(--sub-suspended-bg)]",
  };
  return (
    <button
      onClick={onClick}
      className={`w-full rounded-xl px-3 py-2 text-left transition-colors ${colors[color]}`}
    >
      <p className="text-sm font-semibold">{label}</p>
      <p className="text-xs opacity-70">{description}</p>
    </button>
  );
}

function EllipsisIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 12h.01M12 12h.01M18 12h.01" />
    </svg>
  );
}
