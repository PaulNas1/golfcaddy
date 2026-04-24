"use client";

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
import type { AppUser, Group, Round } from "@/types";

function uniqueRoundsById(rounds: Round[]) {
  return Array.from(new Map(rounds.map((round) => [round.id, round])).values());
}

export default function AdminDashboard() {
  const { appUser, isAdmin } = useAuth();
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
      if (pendingLoaded && groupLoaded && roundsLoaded) {
        setLoading(false);
      }
    };

    setLoading(true);

    getPendingMembers(appUser.groupId)
      .then((members) => setPending(members))
      .catch((error) => console.warn("Unable to load pending members", error))
      .finally(() => {
        pendingLoaded = true;
        markLoaded();
      });

    const groupUnsubscribe = subscribeGroup(
      appUser.groupId,
      (groupRecord) => {
        setGroup(groupRecord);
        groupLoaded = true;
        markLoaded();
      },
      (error) => {
        console.warn("Unable to subscribe to group", error);
        groupLoaded = true;
        markLoaded();
      }
    );

    const roundsUnsubscribe = subscribeRoundsForGroup(
      appUser.groupId,
      (nextRounds) => {
        setRounds(uniqueRoundsById(nextRounds));
        roundsLoaded = true;
        markLoaded();
      },
      (error) => {
        console.warn("Unable to subscribe to rounds", error);
        roundsLoaded = true;
        markLoaded();
      }
    );

    return () => {
      groupUnsubscribe();
      roundsUnsubscribe();
    };
  }, [appUser?.groupId]);

  const activeSeason = group?.currentSeason ?? new Date().getFullYear();
  const activeSeasonRounds = rounds.filter(
    (round) => round.season === activeSeason
  );
  const liveRound = rounds.find((r) => r.status === "live");

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Admin Dashboard</h1>
        <p className="text-gray-500 text-sm">
          {group?.name ?? "Golf group"}
        </p>
      </div>

      {/* Alerts */}
      {pending.length > 0 && (
        <Link href="/admin/members">
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-2xl">⏳</span>
              <div>
                <p className="font-semibold text-amber-800 text-sm">
                  {pending.length} pending approval{pending.length > 1 ? "s" : ""}
                </p>
                <p className="text-amber-600 text-xs">Tap to review</p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-amber-500" />
          </div>
        </Link>
      )}

      {/* Quick stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-2xl p-4 text-center shadow-sm border border-gray-100">
          <div className="text-2xl font-bold text-green-600">
            {loading ? "—" : activeSeasonRounds.length}
          </div>
          <div className="text-xs text-gray-500 mt-1">Rounds this season</div>
        </div>
        <div className="bg-white rounded-2xl p-4 text-center shadow-sm border border-gray-100">
          <div className="text-2xl font-bold text-amber-500">
            {loading ? "—" : pending.length}
          </div>
          <div className="text-xs text-gray-500 mt-1">Pending</div>
        </div>
        <div className="bg-white rounded-2xl p-4 text-center shadow-sm border border-gray-100">
          <div className="text-2xl font-bold text-blue-500">
            {loading ? "—" : activeSeason}
          </div>
          <div className="text-xs text-gray-500 mt-1">Season</div>
        </div>
      </div>

      {/* Active round status */}
      {liveRound && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
          <p className="text-xs font-semibold text-red-600 uppercase tracking-wide mb-1">
            ● Round Live
          </p>
          <p className="font-bold text-gray-800">{liveRound.courseName}</p>
          {getFirstTeeTimeLabel(liveRound) && (
            <p className="text-xs text-red-500 mt-1">
              {getFirstTeeTimeLabel(liveRound)}
            </p>
          )}
          <Link
            href={`/admin/rounds/${liveRound.id}`}
            className="mt-3 inline-block text-sm text-red-600 font-medium hover:underline"
          >
            Manage round →
          </Link>
        </div>
      )}

      <div>
        <h2 className="mb-3 font-semibold text-gray-800">Quick Actions</h2>
        <div className="grid grid-cols-2 gap-3">
          <ActionTile
            href="/admin/rounds/create"
            label="Create round"
            description="Set date, course, tee times"
            icon={<PlusIcon className="h-6 w-6" />}
            tone="green"
          />
          <ActionTile
            href="/admin/rounds"
            label="Manage rounds"
            description="Edit, publish, delete"
            icon={<FlagIcon className="h-6 w-6" />}
            tone="blue"
          />
          <ActionTile
            href="/admin/members"
            label="Members"
            description="Approvals and HCPs"
            icon={<MembersIcon className="h-6 w-6" />}
            tone="gray"
          />
          {isAdmin && (
            <ActionTile
              href="/admin/settings"
              label="Settings"
              description="Ladder and handicap rules"
              icon={<SettingsIcon className="h-6 w-6" />}
              tone="amber"
            />
          )}
        </div>
      </div>
    </div>
  );
}

function ActionTile({
  href,
  label,
  description,
  icon,
  tone,
}: {
  href: string;
  label: string;
  description: string;
  icon: ReactNode;
  tone: "green" | "blue" | "gray" | "amber";
}) {
  const toneClasses = {
    green: "border-green-100 bg-green-50 text-green-800 hover:bg-green-100",
    blue: "border-blue-100 bg-blue-50 text-blue-800 hover:bg-blue-100",
    gray: "border-gray-100 bg-white text-gray-800 hover:bg-gray-50",
    amber: "border-amber-100 bg-amber-50 text-amber-800 hover:bg-amber-100",
  };

  return (
    <Link
      href={href}
      className={`rounded-lg border p-4 shadow-sm transition-colors ${toneClasses[tone]}`}
    >
      <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-white/80">
        {icon}
      </span>
      <span className="block text-sm font-semibold">{label}</span>
      <span className="mt-1 block text-xs opacity-70">{description}</span>
    </Link>
  );
}

function ChevronRight({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  );
}

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

function SettingsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8.25a3.75 3.75 0 1 0 0 7.5 3.75 3.75 0 0 0 0-7.5Zm8.25 3.75a8.2 8.2 0 0 0-.08-1.13l2.08-1.62-2-3.46-2.46.99a8.68 8.68 0 0 0-1.96-1.13L15.45 3h-3.9l-.38 2.65a8.68 8.68 0 0 0-1.96 1.13l-2.46-.99-2 3.46 2.08 1.62a8.2 8.2 0 0 0 0 2.26L4.75 14.75l2 3.46 2.46-.99a8.68 8.68 0 0 0 1.96 1.13l.38 2.65h3.9l.38-2.65a8.68 8.68 0 0 0 1.96-1.13l2.46.99 2-3.46-2.08-1.62c.05-.37.08-.75.08-1.13Z" />
    </svg>
  );
}
