"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
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
  subscription: {
    status: SubscriptionStatus;
    plan: SubscriptionPlan | null;
    exemptReason: string | null;
    trialEndsAt: string | null;
    currentPeriodEndsAt: string | null;
  } | null;
  createdAt: string | null;
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
  exempt:    { label: "Exempt",    bg: "bg-purple-100", text: "text-purple-700" },
  trial:     { label: "Trial",     bg: "bg-blue-100",   text: "text-blue-700" },
  active:    { label: "Active",    bg: "bg-green-100",  text: "text-green-700" },
  past_due:  { label: "Past Due",  bg: "bg-amber-100",  text: "text-amber-700" },
  suspended: { label: "Suspended", bg: "bg-red-100",    text: "text-red-700" },
  none:      { label: "No plan",   bg: "bg-gray-100",   text: "text-gray-500" },
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
  return new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", year: "numeric" }).format(new Date(iso));
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
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Modals
  const [exemptModal, setExemptModal] = useState<GroupRow | null>(null);
  const [exemptReason, setExemptReason] = useState("platform_grant");
  const [trialModal, setTrialModal] = useState<GroupRow | null>(null);
  const [trialDays, setTrialDays] = useState("30");
  const [planModal, setPlanModal] = useState<GroupRow | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan>("starter");

  // ── Auth gate ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (authLoading) return;
    if (!appUser || !appUser.platformAdmin) router.replace("/home");
  }, [authLoading, appUser, router]);

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
    if (!authLoading && appUser?.platformAdmin) fetchGroups();
  }, [authLoading, appUser, fetchGroups]);

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

  if (authLoading || (!appUser?.platformAdmin && !authLoading)) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-400 text-sm">Loading...</p>
      </div>
    );
  }

  const unseeded = groups.filter((g) => !g.subscription);
  const hasUnseeded = unseeded.length > 0;

  return (
    <div className="min-h-screen bg-gray-50">
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

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-7">
            {(
              [
                ["Total",     stats.total,     "bg-white",       "text-gray-800"],
                ["Exempt",    stats.exempt,    "bg-purple-50",   "text-purple-700"],
                ["Trial",     stats.trial,     "bg-blue-50",     "text-blue-700"],
                ["Active",    stats.active,    "bg-green-50",    "text-green-700"],
                ["Past Due",  stats.past_due,  "bg-amber-50",    "text-amber-700"],
                ["Suspended", stats.suspended, "bg-red-50",      "text-red-700"],
                ["No Plan",   stats.none,      "bg-gray-50",     "text-gray-500"],
              ] as [string, number, string, string][]
            ).map(([label, count, bg, text]) => (
              <div key={label} className={`rounded-2xl border border-gray-100 ${bg} p-3 text-center shadow-sm`}>
                <p className={`text-2xl font-bold ${text}`}>{count}</p>
                <p className="mt-0.5 text-xs text-gray-500">{label}</p>
              </div>
            ))}
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
                Run first-time setup to seed FourPlay as exempt and give other groups a 30-day trial.
                Also grants your account platform admin access permanently.
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
            <h2 className="text-lg font-bold text-gray-800">Groups</h2>
            <button
              onClick={fetchGroups}
              disabled={loadingData}
              className="text-xs text-green-600 hover:underline disabled:text-gray-400"
            >
              {loadingData ? "Loading..." : "↻ Refresh"}
            </button>
          </div>

          {loadingData ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="animate-pulse bg-gray-100 rounded-2xl h-24" />
              ))}
            </div>
          ) : groups.length === 0 ? (
            <div className="rounded-2xl bg-white p-8 text-center text-gray-400 text-sm border border-gray-100">
              No groups found.
            </div>
          ) : (
            <div className="space-y-3">
              {groups.map((group) => {
                const subStatus = group.subscription?.status ?? "none";
                const isActioning = actionGroupId === group.id;
                return (
                  <div
                    key={group.id}
                    className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      {/* Left: identity */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-gray-800">{group.name}</span>
                          <span className="rounded-md bg-gray-100 px-1.5 py-0.5 font-mono text-[11px] text-gray-500">
                            {group.slug}
                          </span>
                          <StatusBadge status={subStatus} />
                          {group.subscription?.plan && (
                            <span className="text-xs text-gray-500">
                              {PLAN_LABELS[group.subscription.plan]}
                            </span>
                          )}
                        </div>
                        <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                          <span>{group.memberCount} member{group.memberCount !== 1 ? "s" : ""}</span>
                          {group.adminEmail && <span>Admin: {group.adminEmail}</span>}
                          <span>Created {formatDate(group.createdAt)}</span>
                          {group.subscription?.trialEndsAt && (
                            <span className="text-blue-600">
                              Trial ends {formatDate(group.subscription.trialEndsAt)}
                            </span>
                          )}
                          {group.subscription?.exemptReason && (
                            <span className="text-purple-600">
                              {group.subscription.exemptReason}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Actions menu */}
                      <div className="relative" ref={openMenuId === group.id ? menuRef : null}>
                        <button
                          onClick={() => setOpenMenuId((c) => (c === group.id ? null : group.id))}
                          disabled={isActioning}
                          className="rounded-lg border border-gray-200 p-2 text-gray-500 hover:bg-gray-50 disabled:opacity-40"
                          aria-label={`Actions for ${group.name}`}
                        >
                          <EllipsisIcon className="h-4 w-4" />
                        </button>
                        {openMenuId === group.id && (
                          <div className="absolute right-0 top-10 z-20 w-52 rounded-2xl border border-gray-100 bg-white p-1.5 shadow-xl">
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
                              label="Activate"
                              description="Mark as paid / active"
                              onClick={() => {
                                setOpenMenuId(null);
                                setPlanModal(group);
                              }}
                              color="green"
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
          <p className="text-sm text-gray-500 mb-4">
            This group will have free access permanently. Add a note for your own records.
          </p>
          <label className="block text-sm font-medium text-gray-700 mb-1">Reason</label>
          <input
            type="text"
            value={exemptReason}
            onChange={(e) => setExemptReason(e.target.value)}
            className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
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
            <button onClick={() => setExemptModal(null)} className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm text-gray-600">
              Cancel
            </button>
          </div>
        </Modal>
      )}

      {/* ── Trial Modal ── */}
      {trialModal && (
        <Modal title={`Start Trial: ${trialModal.name}`} onClose={() => setTrialModal(null)}>
          <p className="text-sm text-gray-500 mb-4">
            Give this group free access for a set number of days.
          </p>
          <label className="block text-sm font-medium text-gray-700 mb-1">Trial length (days)</label>
          <input
            type="number"
            min="1"
            max="365"
            value={trialDays}
            onChange={(e) => setTrialDays(e.target.value)}
            className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          />
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
            <button onClick={() => setTrialModal(null)} className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm text-gray-600">
              Cancel
            </button>
          </div>
        </Modal>
      )}

      {/* ── Plan / Activate Modal ── */}
      {planModal && (
        <Modal title={`Activate: ${planModal.name}`} onClose={() => setPlanModal(null)}>
          <p className="text-sm text-gray-500 mb-4">
            Manually activate this group on a plan. Stripe will manage this automatically once billing is live.
          </p>
          <label className="block text-sm font-medium text-gray-700 mb-1">Plan</label>
          <select
            value={selectedPlan}
            onChange={(e) => setSelectedPlan(e.target.value as SubscriptionPlan)}
            className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            <option value="starter">Starter — 1–20 players</option>
            <option value="club">Club — 21–40 players</option>
            <option value="society">Society — 41–80 players</option>
          </select>
          <div className="mt-4 flex gap-2">
            <button
              onClick={async () => {
                const g = planModal;
                setPlanModal(null);
                await updateSubscription(g.id, "active", { plan: selectedPlan });
              }}
              className="flex-1 rounded-xl bg-green-600 py-2.5 text-sm font-semibold text-white hover:bg-green-700"
            >
              Activate
            </button>
            <button onClick={() => setPlanModal(null)} className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm text-gray-600">
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
        className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-800">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg">✕</button>
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
    purple: "text-purple-700 hover:bg-purple-50",
    blue:   "text-blue-700 hover:bg-blue-50",
    green:  "text-green-700 hover:bg-green-50",
    red:    "text-red-600 hover:bg-red-50",
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
