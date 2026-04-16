"use client";

import { useEffect, useState } from "react";
import { getGroup, getSeasonStandings } from "@/lib/firestore";
import { useAuth } from "@/contexts/AuthContext";
import type { SeasonStanding } from "@/types";

export default function LeaderboardPage() {
  const { appUser } = useAuth();
  const [season, setSeason] = useState(new Date().getFullYear());
  const [standings, setStandings] = useState<SeasonStanding[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      if (!appUser?.groupId) return;
      try {
        const group = await getGroup();
        const currentSeason = group?.currentSeason ?? new Date().getFullYear();
        setSeason(currentSeason);
        const seasonStandings = await getSeasonStandings(
          appUser.groupId,
          currentSeason
        );
        setStandings(seasonStandings);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [appUser?.groupId]);
  const sideLeaderboards = [
    {
      label: "NTP leaders",
      key: "ntpWinsSeason" as const,
    },
    {
      label: "LD leaders",
      key: "ldWinsSeason" as const,
    },
    {
      label: "T2 leaders",
      key: "t2WinsSeason" as const,
    },
    {
      label: "T3 leaders",
      key: "t3WinsSeason" as const,
    },
  ];

  return (
    <div className="px-4 py-6 pb-8">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-gray-800">Season Ladder</h1>
        <p className="text-gray-500 text-sm">{season}</p>
      </div>

      {loading ? (
        <div className="space-y-3 animate-pulse">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-white rounded-2xl p-4 h-20" />
          ))}
        </div>
      ) : standings.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
          <div className="text-5xl mb-4">🏆</div>
          <p className="font-medium text-gray-500 mb-1">No standings yet</p>
          <p className="text-sm text-center max-w-xs">
            The ladder appears after the first round results are published.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="space-y-3">
            {standings.map((standing) => (
              <StandingCard
                key={standing.id}
                standing={standing}
                currentUserId={appUser?.uid ?? ""}
              />
            ))}
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
            <h2 className="font-semibold text-gray-800 mb-3">
              Side Prize Leaders
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {sideLeaderboards.map(({ label, key }) => (
                <SidePrizeBoard
                  key={key}
                  label={label}
                  standings={standings}
                  statKey={key}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StandingCard({
  standing,
  currentUserId,
}: {
  standing: SeasonStanding;
  currentUserId: string;
}) {
  return (
    <div
      className={`bg-white rounded-2xl shadow-sm border p-4 ${
        standing.memberId === currentUserId
          ? "border-green-200"
          : "border-gray-100"
      }`}
    >
      <div className="flex items-center gap-3">
        <div className="w-10 text-center">
          <p className="text-xl font-bold text-gray-800">
            #{standing.currentRank}
          </p>
          <p className="text-[11px] text-gray-400">
            {getRankMovement(standing)}
          </p>
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-800 truncate">
            {standing.memberName}
          </p>
          <p className="text-xs text-gray-500">
            {standing.roundsPlayed} rounds ·{" "}
            {standing.roundResults[0]?.stableford ?? 0} last
          </p>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold text-green-700">
            {standing.totalPoints}
          </p>
          <p className="text-[11px] text-gray-400">points</p>
          {standing.grossSeasonPoints !== standing.totalPoints && (
            <p className="text-[11px] text-gray-400">
              {standing.grossSeasonPoints} raw
            </p>
          )}
        </div>
      </div>

      {(standing.ntpWinsSeason > 0 ||
        standing.ldWinsSeason > 0 ||
        standing.t2WinsSeason > 0 ||
        standing.t3WinsSeason > 0) && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {standing.ntpWinsSeason > 0 && (
            <Badge label={`NTP ${standing.ntpWinsSeason}`} />
          )}
          {standing.ldWinsSeason > 0 && (
            <Badge label={`LD ${standing.ldWinsSeason}`} />
          )}
          {standing.t2WinsSeason > 0 && (
            <Badge label={`T2 ${standing.t2WinsSeason}`} />
          )}
          {standing.t3WinsSeason > 0 && (
            <Badge label={`T3 ${standing.t3WinsSeason}`} />
          )}
        </div>
      )}
    </div>
  );
}

function SidePrizeBoard({
  label,
  standings,
  statKey,
}: {
  label: string;
  standings: SeasonStanding[];
  statKey:
    | "ntpWinsSeason"
    | "ldWinsSeason"
    | "t2WinsSeason"
    | "t3WinsSeason";
}) {
  const leaders = standings
    .filter((standing) => standing[statKey] > 0)
    .sort((a, b) => b[statKey] - a[statKey] || a.memberName.localeCompare(b.memberName))
    .slice(0, 5);

  return (
    <div className="rounded-xl bg-gray-50 px-3 py-3">
      <p className="text-sm font-semibold text-gray-800">{label}</p>
      {leaders.length === 0 ? (
        <p className="mt-2 text-xs text-gray-400">No winners yet</p>
      ) : (
        <div className="mt-2 space-y-1">
          {leaders.map((standing, index) => (
            <div
              key={standing.memberId}
              className="flex items-center justify-between text-xs"
            >
              <span className="truncate text-gray-600">
                #{index + 1} {standing.memberName}
              </span>
              <span className="font-semibold text-green-700">
                {standing[statKey]}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Badge({ label }: { label: string }) {
  return (
    <span className="rounded-full bg-green-50 px-2 py-0.5 text-[11px] font-medium text-green-700">
      {label}
    </span>
  );
}

function getRankMovement(standing: SeasonStanding) {
  if (standing.previousRank == null) return "new";
  const diff = standing.previousRank - standing.currentRank;
  if (diff > 0) return `↑${diff}`;
  if (diff < 0) return `↓${Math.abs(diff)}`;
  return "same";
}
