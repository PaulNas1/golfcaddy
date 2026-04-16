"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { getRounds } from "@/lib/firestore";
import { getFirstTeeTimeLabel } from "@/lib/teeTimes";
import { useAuth } from "@/contexts/AuthContext";
import type { Round, RoundStatus } from "@/types";

const STATUS_STYLES: Record<RoundStatus, string> = {
  upcoming: "bg-blue-100 text-blue-700",
  live: "bg-red-100 text-red-700",
  completed: "bg-gray-100 text-gray-500",
};

export default function AdminRoundsPage() {
  const { appUser } = useAuth();
  const [rounds, setRounds] = useState<Round[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!appUser?.groupId) return;
    getRounds(appUser.groupId).then((r) => {
      setRounds(r);
      setLoading(false);
    });
  }, [appUser?.groupId]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">Rounds</h1>
        <Link
          href="/admin/rounds/create"
          className="bg-green-600 text-white text-sm font-semibold px-4 py-2 rounded-xl hover:bg-green-700 transition-colors"
        >
          + New round
        </Link>
      </div>

      {loading ? (
        <div className="space-y-3 animate-pulse">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-2xl p-4 h-20 bg-gray-100" />
          ))}
        </div>
      ) : rounds.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-4xl mb-3">📋</div>
          <p className="text-gray-500 text-sm mb-4">No rounds yet</p>
          <Link
            href="/admin/rounds/create"
            className="inline-block bg-green-600 text-white text-sm font-semibold px-5 py-2.5 rounded-xl"
          >
            Create first round
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {rounds.map((round) => (
            <Link key={round.id} href={`/admin/rounds/${round.id}`}>
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 hover:bg-gray-50 transition-colors">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_STYLES[round.status]}`}>
                        {round.status === "live" ? "● Live" : round.status.charAt(0).toUpperCase() + round.status.slice(1)}
                      </span>
                      <span className="text-xs text-gray-400">Round {round.roundNumber}</span>
                    </div>
                    <h3 className="font-semibold text-gray-800">{round.courseName}</h3>
                    <p className="text-gray-500 text-sm">
                      {format(round.date, "EEE d MMM yyyy")}
                      {getFirstTeeTimeLabel(round)
                        ? ` · ${getFirstTeeTimeLabel(round)}`
                        : ""}
                    </p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-400" />
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
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
