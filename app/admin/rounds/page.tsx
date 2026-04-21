"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { subscribeGroup, subscribeRoundsForGroup } from "@/lib/firestore";
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
  const [currentSeason, setCurrentSeason] = useState(new Date().getFullYear());
  const [selectedSeason, setSelectedSeason] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!appUser?.groupId) return;

    const groupUnsubscribe = subscribeGroup(
      appUser.groupId,
      (group) => {
        const nextCurrentSeason =
          group?.currentSeason ?? new Date().getFullYear();
        setCurrentSeason(nextCurrentSeason);
        setSelectedSeason((current) => current || String(nextCurrentSeason));
      },
      (err) => console.warn("Unable to subscribe to group", err)
    );

    const roundsUnsubscribe = subscribeRoundsForGroup(
      appUser.groupId,
      (nextRounds) => {
        setRounds(nextRounds);
        setLoading(false);
      },
      (err) => {
        console.warn("Unable to subscribe to admin rounds", err);
        setLoading(false);
      }
    );

    return () => {
      groupUnsubscribe();
      roundsUnsubscribe();
    };
  }, [appUser?.groupId]);

  const seasonOptions = useMemo(
    () =>
      Array.from(new Set([...rounds.map((round) => round.season), currentSeason])).sort(
        (a, b) => b - a
      ),
    [currentSeason, rounds]
  );

  const visibleRounds = useMemo(() => {
    if (selectedSeason === "all") return rounds;
    const season = Number(selectedSeason || currentSeason);
    return rounds.filter((round) => round.season === season);
  }, [currentSeason, rounds, selectedSeason]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Rounds</h1>
          <p className="text-sm text-gray-500">
            {selectedSeason === "all"
              ? "All seasons"
              : `Season ${selectedSeason || currentSeason}`}
          </p>
        </div>
        <div className="flex items-end gap-2">
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
          <Link
            href="/admin/rounds/create"
            className="bg-green-600 text-white text-sm font-semibold px-4 py-2 rounded-xl hover:bg-green-700 transition-colors"
          >
            + New round
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3 animate-pulse">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-2xl p-4 h-20 bg-gray-100" />
          ))}
        </div>
      ) : visibleRounds.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-4xl mb-3">📋</div>
          <p className="text-gray-500 text-sm mb-4">
            {selectedSeason === "all"
              ? "No rounds yet"
              : `No rounds found for Season ${selectedSeason || currentSeason}`}
          </p>
          <Link
            href="/admin/rounds/create"
            className="inline-block bg-green-600 text-white text-sm font-semibold px-5 py-2.5 rounded-xl"
          >
            Create first round
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {visibleRounds.map((round) => (
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
                      {selectedSeason === "all" ? ` · S${round.season}` : ""}
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
