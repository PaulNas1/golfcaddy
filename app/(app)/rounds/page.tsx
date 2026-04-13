"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { getRounds } from "@/lib/firestore";
import type { Round, RoundStatus } from "@/types";

const STATUS_STYLES: Record<RoundStatus, string> = {
  upcoming: "bg-blue-100 text-blue-700",
  live: "bg-red-100 text-red-700",
  completed: "bg-gray-100 text-gray-600",
};

const STATUS_LABEL: Record<RoundStatus, string> = {
  upcoming: "Upcoming",
  live: "● Live",
  completed: "Completed",
};

export default function RoundsPage() {
  const [rounds, setRounds] = useState<Round[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getRounds("fourplay").then((r) => {
      setRounds(r);
      setLoading(false);
    });
  }, []);

  return (
    <div className="px-4 py-6">
      <h1 className="text-2xl font-bold text-gray-800 mb-5">Rounds</h1>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-2xl p-4 animate-pulse">
              <div className="h-5 bg-gray-100 rounded w-3/4 mb-2" />
              <div className="h-4 bg-gray-100 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : rounds.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <div className="text-4xl mb-3">📋</div>
          <p className="text-sm">No rounds yet. Admin will schedule the first round soon.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {rounds.map((round) => (
            <Link key={round.id} href={`/rounds/${round.id}`}>
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_STYLES[round.status]}`}>
                      {STATUS_LABEL[round.status]}
                    </span>
                    <span className="text-xs text-gray-400">
                      Round {round.roundNumber}
                    </span>
                  </div>
                  <h3 className="font-semibold text-gray-800">{round.courseName}</h3>
                  <p className="text-gray-500 text-sm">{format(round.date, "EEE d MMM yyyy")}</p>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-400 flex-shrink-0" />
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
