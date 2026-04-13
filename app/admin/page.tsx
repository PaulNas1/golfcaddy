"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getPendingMembers, getRounds } from "@/lib/firestore";
import type { AppUser, Round } from "@/types";

export default function AdminDashboard() {
  const [pending, setPending] = useState<AppUser[]>([]);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getPendingMembers(), getRounds("fourplay")]).then(
      ([p, r]) => {
        setPending(p);
        setRounds(r);
        setLoading(false);
      }
    );
  }, []);

  const liveRound = rounds.find((r) => r.status === "live");
  const upcomingRound = rounds.find((r) => r.status === "upcoming");

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Admin Dashboard</h1>
        <p className="text-gray-500 text-sm">FourPlay Golf Group</p>
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
            {loading ? "—" : rounds.length}
          </div>
          <div className="text-xs text-gray-500 mt-1">Rounds</div>
        </div>
        <div className="bg-white rounded-2xl p-4 text-center shadow-sm border border-gray-100">
          <div className="text-2xl font-bold text-amber-500">
            {loading ? "—" : pending.length}
          </div>
          <div className="text-xs text-gray-500 mt-1">Pending</div>
        </div>
        <div className="bg-white rounded-2xl p-4 text-center shadow-sm border border-gray-100">
          <div className="text-2xl font-bold text-blue-500">2026</div>
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
          <Link
            href={`/admin/rounds/${liveRound.id}`}
            className="mt-3 inline-block text-sm text-red-600 font-medium hover:underline"
          >
            Manage round →
          </Link>
        </div>
      )}

      {/* Quick actions */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
        <h2 className="font-semibold text-gray-800 mb-3">Quick Actions</h2>
        <div className="space-y-2">
          <Link
            href="/admin/rounds/create"
            className="flex items-center gap-3 p-3 bg-green-50 rounded-xl hover:bg-green-100 transition-colors"
          >
            <span className="text-xl">➕</span>
            <span className="text-sm font-medium text-green-800">Create new round</span>
          </Link>
          <Link
            href="/admin/members"
            className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors"
          >
            <span className="text-xl">👥</span>
            <span className="text-sm font-medium text-gray-700">Manage members</span>
          </Link>
          {upcomingRound && (
            <Link
              href={`/admin/rounds/${upcomingRound.id}`}
              className="flex items-center gap-3 p-3 bg-blue-50 rounded-xl hover:bg-blue-100 transition-colors"
            >
              <span className="text-xl">📋</span>
              <span className="text-sm font-medium text-blue-800">
                Edit upcoming round: {upcomingRound.courseName}
              </span>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

function ChevronRight({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  );
}
