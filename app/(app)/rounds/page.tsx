"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { useGroupData } from "@/contexts/GroupDataContext";
import { getRoundLabel } from "@/lib/roundDisplay";
import { getFirstTeeTimeLabel } from "@/lib/teeTimes";
import type { RoundStatus } from "@/types";

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
  const { rounds, currentSeason, loading } = useGroupData();
  const [selectedSeason, setSelectedSeason] = useState<string>("");

  const seasonOptions = useMemo(
    () =>
      Array.from(new Set([...rounds.map((r) => r.season), currentSeason])).sort(
        (a, b) => b - a
      ),
    [currentSeason, rounds]
  );

  const activeSeason = Number(selectedSeason || currentSeason);

  const visibleRounds = useMemo(() => {
    if (selectedSeason === "all") return rounds;
    return rounds.filter((r) => r.season === activeSeason);
  }, [activeSeason, rounds, selectedSeason]);

  return (
    <div className="px-4 py-6">
      <div className="mb-5 flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Rounds</h1>
          <p className="text-sm text-gray-500">
            {selectedSeason === "all"
              ? "All seasons"
              : `Season ${activeSeason}`}
          </p>
        </div>
        <label className="block">
          <span className="mb-1 block text-right text-[11px] font-medium uppercase tracking-wide text-gray-400">
            Season
          </span>
          <select
            value={selectedSeason || String(currentSeason)}
            onChange={(event) => setSelectedSeason(event.target.value)}
            className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            <option value={String(currentSeason)}>Active season</option>
            {seasonOptions
              .filter((season) => season !== currentSeason)
              .map((season) => (
                <option key={season} value={String(season)}>
                  {season}
                </option>
              ))}
            <option value="all">All seasons</option>
          </select>
        </label>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-2xl p-4 animate-pulse">
              <div className="h-5 bg-gray-100 rounded w-3/4 mb-2" />
              <div className="h-4 bg-gray-100 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : visibleRounds.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <div className="text-4xl mb-3">📋</div>
          <p className="text-sm">
            {selectedSeason === "all"
              ? "No rounds yet. Admin will schedule the first round soon."
              : `No rounds found for Season ${activeSeason}.`}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {visibleRounds.map((round) => {
            const teeTimeLabel = getFirstTeeTimeLabel(round);
            return (
              <Link key={round.id} href={`/rounds/${round.id}`} prefetch={false}>
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_STYLES[round.status]}`}>
                        {STATUS_LABEL[round.status]}
                      </span>
                      <span className="text-xs text-gray-400">
                        {getRoundLabel(round)}
                      </span>
                    </div>
                    <h3 className="font-semibold text-gray-800">{round.courseName}</h3>
                    <p className="text-gray-500 text-sm">
                      {format(round.date, "EEE d MMM yyyy")}
                      {teeTimeLabel ? ` · ${teeTimeLabel}` : ""}
                      {selectedSeason === "all" ? ` · S${round.season}` : ""}
                    </p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-400 flex-shrink-0" />
                </div>
              </Link>
            );
          })}
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
