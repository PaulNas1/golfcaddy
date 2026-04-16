"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import {
  getGroup,
  getMember,
  getSeasonStandingForMember,
} from "@/lib/firestore";
import type { Member, SeasonStanding } from "@/types";

export default function ProfilePage() {
  const { appUser, signOut } = useAuth();
  const router = useRouter();
  const [member, setMember] = useState<Member | null>(null);
  const [standing, setStanding] = useState<SeasonStanding | null>(null);
  const [season, setSeason] = useState(new Date().getFullYear());
  const [loadingStats, setLoadingStats] = useState(true);

  useEffect(() => {
    const load = async () => {
      if (!appUser?.uid || !appUser.groupId) return;
      try {
        const group = await getGroup();
        const currentSeason = group?.currentSeason ?? new Date().getFullYear();
        const [memberRecord, seasonStanding] = await Promise.all([
          getMember(appUser.uid),
          getSeasonStandingForMember(
            appUser.groupId,
            currentSeason,
            appUser.uid
          ),
        ]);
        setSeason(currentSeason);
        setMember(memberRecord);
        setStanding(seasonStanding);
      } finally {
        setLoadingStats(false);
      }
    };
    load();
  }, [appUser?.groupId, appUser?.uid]);

  const handleSignOut = async () => {
    await signOut();
    router.replace("/signin");
  };

  return (
    <div className="px-4 py-6 space-y-4 pb-8">
      <h1 className="text-2xl font-bold text-gray-800">Profile</h1>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center text-2xl font-bold text-green-700">
            {appUser?.displayName?.charAt(0).toUpperCase() || "?"}
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-gray-800 truncate">
              {appUser?.displayName}
            </h2>
            <p className="text-gray-500 text-sm truncate">{appUser?.email}</p>
            <span className="mt-1 inline-block text-xs font-medium px-2 py-0.5 bg-green-100 text-green-700 rounded-full capitalize">
              {appUser?.role}
            </span>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-gray-800">Season {season}</h3>
          <Link href="/leaderboard" className="text-green-600 text-sm">
            Ladder
          </Link>
        </div>

        {loadingStats ? (
          <div className="grid grid-cols-2 gap-3 animate-pulse">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-20 rounded-xl bg-gray-100" />
            ))}
          </div>
        ) : !standing && !member ? (
          <div className="flex flex-col items-center py-8 text-gray-400">
            <div className="text-4xl mb-2">📊</div>
            <p className="text-sm">Stats available after your first result</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <StatCard
                label="Rank"
                value={standing ? `#${standing.currentRank}` : "—"}
              />
              <StatCard
                label="Points"
                value={String(standing?.totalPoints ?? member?.seasonPoints ?? 0)}
              />
              <StatCard
                label="Handicap"
                value={String(member?.currentHandicap ?? "—")}
              />
              <StatCard
                label="Rounds"
                value={String(standing?.roundsPlayed ?? member?.roundsPlayed ?? 0)}
              />
              <StatCard
                label="Avg Stableford"
                value={String(member?.avgStableford ?? "—")}
              />
              <StatCard
                label="Best Stableford"
                value={String(member?.bestStableford ?? "—")}
              />
            </div>

            <div>
              <h4 className="text-sm font-semibold text-gray-800 mb-2">
                Side Prizes
              </h4>
              <div className="flex flex-wrap gap-2">
                <SidePrizePill
                  label="NTP"
                  value={standing?.ntpWinsSeason ?? member?.ntpWins ?? 0}
                />
                <SidePrizePill
                  label="LD"
                  value={standing?.ldWinsSeason ?? member?.ldWins ?? 0}
                />
                <SidePrizePill
                  label="T2"
                  value={standing?.t2WinsSeason ?? member?.t2Wins ?? 0}
                />
                <SidePrizePill
                  label="T3"
                  value={standing?.t3WinsSeason ?? member?.t3Wins ?? 0}
                />
              </div>
            </div>

            {standing && standing.roundResults.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-gray-800 mb-2">
                  Recent Results
                </h4>
                <div className="divide-y divide-gray-100 rounded-xl border border-gray-100">
                  {standing.roundResults.slice(0, 5).map((roundResult) => (
                    <Link
                      key={roundResult.roundId}
                      href={`/rounds/${roundResult.roundId}`}
                      className="flex items-center justify-between px-3 py-2 text-sm"
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-gray-800 truncate">
                          {roundResult.courseName}
                        </p>
                        <p className="text-xs text-gray-400">
                          Finish #{roundResult.finish}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-green-700">
                          {roundResult.pointsAwarded} pts
                        </p>
                        {roundResult.stableford > 0 && (
                          <p className="text-xs text-gray-400">
                            {roundResult.stableford} stb
                          </p>
                        )}
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <button
        onClick={handleSignOut}
        className="w-full py-3 border border-gray-200 rounded-2xl text-gray-600 text-sm font-medium hover:bg-gray-50 transition-colors"
      >
        Sign out
      </button>
    </div>
  );
}

function SidePrizePill({ label, value }: { label: string; value: number }) {
  return (
    <span className="rounded-full bg-green-50 px-3 py-1 text-xs font-semibold text-green-700">
      {label} {value}
    </span>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-gray-50 px-3 py-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="mt-1 text-xl font-bold text-gray-800">{value}</p>
    </div>
  );
}
