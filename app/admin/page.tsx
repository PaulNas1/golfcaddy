"use client";

/**
 * AdminDashboard
 *
 * Overview screen for group admins. Shows live stats, pending-approval
 * alert, an active-round banner, and quick-action tiles for the four
 * primary admin tasks.
 *
 * Quick actions deliberately exclude Settings — it lives in the nav bar
 * and doesn't need a second entry point here.
 */

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import {
  getPendingMembers,
  subscribeGroup,
  subscribeRoundsForGroup,
} from "@/lib/firestore";
import { getFirstTeeTimeLabel } from "@/lib/teeTimes";
import { useAuth } from "@/contexts/AuthContext";
import { ChevronRightIcon } from "@/components/ui/icons";
import type { AppUser, Group, Round } from "@/types";

function uniqueRoundsById(rounds: Round[]) {
  return Array.from(new Map(rounds.map((r) => [r.id, r])).values());
}

export default function AdminDashboard() {
  const { appUser } = useAuth();
  const [pending, setPending] = useState<AppUser[]>([]);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [group, setGroup] = useState<Group | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!appUser?.groupId) return;

    let pendingLoaded = false;
    let groupLoaded = false;
    let roundsLoaded = false;

    const markLoaded = () => {
      if (pendingLoaded && groupLoaded && roundsLoaded) setLoading(false);
    };

    setLoading(true);

    getPendingMembers(appUser.groupId)
      .then((members) => setPending(members))
      .catch((err) => console.warn("Unable to load pending members", err))
      .finally(() => { pendingLoaded = true; markLoaded(); });

    const groupUnsub = subscribeGroup(
      appUser.groupId,
      (g) => { setGroup(g); groupLoaded = true; markLoaded(); },
      (err) => { console.warn("Unable to subscribe to group", err); groupLoaded = true; markLoaded(); }
    );

    const roundsUnsub = subscribeRoundsForGroup(
      appUser.groupId,
      (next) => { setRounds(uniqueRoundsById(next)); roundsLoaded = true; markLoaded(); },
      (err) => { console.warn("Unable to subscribe to rounds", err); roundsLoaded = true; markLoaded(); }
    );

    return () => { groupUnsub(); roundsUnsub(); };
  }, [appUser?.groupId]);

  const activeSeason = group?.currentSeason ?? new Date().getFullYear();
  const activeSeasonRounds = rounds.filter((r) => r.season === activeSeason);
  const liveRound = rounds.find((r) => r.status === "live");

  return (
    <div className="space-y-5">
      {/* Page heading */}
      <div>
        <h1 className="text-2xl font-bold text-ink-title">Admin Dashboard</h1>
        <p className="text-ink-muted text-sm">{group?.name ?? "Golf group"}</p>
      </div>

      {/* Pending-approval alert */}
      {pending.length > 0 && (
        <Link href="/admin/members">
          <div className="bg-announce-bg border border-announce-border rounded-2xl p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-2xl">⏳</span>
              <div>
                <p className="font-semibold text-announce-label text-sm">
                  {pending.length} pending approval{pending.length > 1 ? "s" : ""}
                </p>
                <p className="text-announce-muted text-xs">Tap to review</p>
              </div>
            </div>
            <ChevronRightIcon className="w-5 h-5 text-announce-muted" />
          </div>
        </Link>
      )}

      {/* Quick stats strip */}
      <div className="grid grid-cols-3 gap-3">
        <StatPill label="Rounds" value={loading ? "—" : String(activeSeasonRounds.length)} />
        <StatPill label="Pending" value={loading ? "—" : String(pending.length)} />
        <StatPill label="Season" value={loading ? "—" : String(activeSeason)} />
      </div>

      {/* Live round banner */}
      {liveRound && (
        <div className="bg-live-bg border border-live-text/20 rounded-2xl p-4">
          <p className="text-xs font-semibold text-live-text uppercase tracking-wide mb-1">
            ● Round Live
          </p>
          <p className="font-bold text-ink-title">{liveRound.courseName}</p>
          {getFirstTeeTimeLabel(liveRound) && (
            <p className="text-xs text-live-text mt-1">{getFirstTeeTimeLabel(liveRound)}</p>
          )}
          <Link
            href={`/admin/rounds/${liveRound.id}`}
            className="mt-3 inline-block text-sm text-live-text font-medium hover:underline"
          >
            Manage round →
          </Link>
        </div>
      )}

      {/* Quick actions — Settings omitted (it's in the nav bar) */}
      <div>
        <h2 className="mb-3 font-semibold text-ink-title">Quick Actions</h2>
        <div className="grid grid-cols-2 gap-3">
          <ActionTile
            href="/admin/rounds/create"
            label="Create round"
            description="Set date, course, tee times"
            icon={<PlusIcon className="h-6 w-6" />}
            primary
          />
          <ActionTile
            href="/admin/rounds"
            label="Manage rounds"
            description="Edit, publish, delete"
            icon={<FlagIcon className="h-6 w-6" />}
          />
          <ActionTile
            href="/admin/members"
            label="Members"
            description="Approvals and handicaps"
            icon={<MembersIcon className="h-6 w-6" />}
          />
          <ActionTile
            href="/admin/course-corrections"
            label="Course corrections"
            description="Saved tee set fixes"
            icon={<CourseIcon className="h-6 w-6" />}
          />
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

/** Single stat in the top strip. */
function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface-card rounded-2xl p-4 text-center shadow-sm border border-surface-overlay">
      <div className="text-2xl font-bold text-brand-600">{value}</div>
      <div className="text-xs text-ink-muted mt-1">{label}</div>
    </div>
  );
}

/**
 * Quick-action tile.
 * `primary` = filled brand background (Create round).
 * Default = surface-muted tint, consistent across all secondary actions.
 */
function ActionTile({
  href,
  label,
  description,
  icon,
  primary = false,
}: {
  href: string;
  label: string;
  description: string;
  icon: ReactNode;
  primary?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`rounded-xl border p-4 shadow-sm transition-colors ${
        primary
          ? "border-brand-200 bg-brand-50 text-brand-800 hover:bg-brand-100"
          : "border-surface-overlay bg-surface-muted text-ink-title hover:bg-surface-overlay"
      }`}
    >
      <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-white/70">
        {icon}
      </span>
      <span className="block text-sm font-semibold">{label}</span>
      <span className="mt-1 block text-xs text-ink-muted">{description}</span>
    </Link>
  );
}

// ── Inline icons (admin-specific shapes not in the shared icon set) ──────────

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14m-7-7h14" />
    </svg>
  );
}

function FlagIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 4v16M7 5h9l-1.5 3L16 11H7" />
    </svg>
  );
}

function MembersIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19a6 6 0 0 0-12 0m9-10a4 4 0 1 1-8 0 4 4 0 0 1 8 0Zm8 10a4.5 4.5 0 0 0-4-4.48m1.5-8.02a3 3 0 0 1 0 5.66" />
    </svg>
  );
}

function CourseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v18M3 8l4-2 4 2 4-2 4 2M7 21v-5m4 5v-8m4 8v-5" />
    </svg>
  );
}
