"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { useAuth } from "@/contexts/AuthContext";
import {
  getRoundRsvp,
  subscribeActiveMembers,
  subscribeGroup,
  subscribeRoundsForGroup,
  subscribeSeasonStandings,
} from "@/lib/firestore";
import { getVisibleSeasonStandings } from "@/lib/standingsDisplay";
import { getFirstTeeTimeLabel } from "@/lib/teeTimes";
import type { AppUser, Group, Round, RoundRsvp, SeasonStanding } from "@/types";

export default function HomePage() {
  const { appUser } = useAuth();
  const [nextRound, setNextRound] = useState<Round | null>(null);
  const [nextRoundRsvp, setNextRoundRsvp] = useState<RoundRsvp | null>(null);
  const [liveRound, setLiveRound] = useState<Round | null>(null);
  const [group, setGroup] = useState<Group | null>(null);
  const [season, setSeason] = useState(new Date().getFullYear());
  const [activeMembers, setActiveMembers] = useState<AppUser[]>([]);
  const [standings, setStandings] = useState<SeasonStanding[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const groupId = appUser?.groupId ?? "fourplay";
    let standingsUnsubscribe: (() => void) | null = null;

    const groupUnsubscribe = subscribeGroup(
      groupId,
      (nextGroup) => {
        setGroup(nextGroup);
        const currentSeason = nextGroup?.currentSeason ?? new Date().getFullYear();
        setSeason(currentSeason);
        standingsUnsubscribe?.();
        standingsUnsubscribe = subscribeSeasonStandings(
          groupId,
          currentSeason,
          setStandings,
          (err) => console.warn("Unable to subscribe to season standings", err)
        );
      },
      (err) => console.warn("Unable to subscribe to group", err)
    );

    const roundsUnsubscribe = subscribeRoundsForGroup(
      groupId,
      (rounds) => {
        const live = rounds.find((round) => round.status === "live") ?? null;
        const next =
          rounds
            .filter((round) => round.status === "upcoming")
            .sort((a, b) => {
              if (a.date.getTime() !== b.date.getTime()) {
                return a.date.getTime() - b.date.getTime();
              }
              return a.roundNumber - b.roundNumber;
            })[0] ?? null;
        setLiveRound(live);
        setNextRound(next);
        setLoading(false);
      },
      (err) => {
        console.warn("Unable to subscribe to rounds", err);
        setLoading(false);
      }
    );

    return () => {
      groupUnsubscribe();
      roundsUnsubscribe();
      standingsUnsubscribe?.();
    };
  }, [appUser?.groupId]);

  useEffect(() => {
    const groupId = appUser?.groupId ?? "fourplay";

    return subscribeActiveMembers(
      groupId,
      setActiveMembers,
      (err) => console.warn("Unable to subscribe to active members", err)
    );
  }, [appUser?.groupId]);

  useEffect(() => {
    if (!nextRound?.id || !appUser?.uid) {
      setNextRoundRsvp(null);
      return;
    }

    let cancelled = false;

    getRoundRsvp(nextRound.id, appUser.uid)
      .then((rsvp) => {
        if (!cancelled) setNextRoundRsvp(rsvp);
      })
      .catch(() => {
        if (!cancelled) setNextRoundRsvp(null);
      });

    return () => {
      cancelled = true;
    };
  }, [appUser?.uid, nextRound?.id]);

  const visibleStandings = useMemo(
    () =>
      getVisibleSeasonStandings(
        standings,
        new Set(activeMembers.map((member) => member.uid))
      ),
    [activeMembers, standings]
  );

  const firstName = appUser?.displayName?.split(" ")[0] || "there";

  return (
    <div className="px-4 py-6 space-y-5">
      {/* Greeting */}
      <div>
        <h1 className="text-2xl font-bold text-gray-800">
          Hey {firstName} 👋
        </h1>
        <p className="text-gray-500 text-sm mt-0.5">
          {group?.name ?? "Golf group"}
        </p>
      </div>

      {/* Live round banner */}
      {liveRound && (
        <Link href={`/rounds/${liveRound.id}`} prefetch={false}>
          <div className="bg-red-500 text-white rounded-2xl p-4 flex items-center justify-between shadow-md">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="inline-block w-2 h-2 bg-white rounded-full animate-pulse" />
                <span className="text-xs font-semibold uppercase tracking-wide">Live now</span>
              </div>
              <p className="font-bold text-lg leading-tight">{liveRound.courseName}</p>
              <p className="text-red-100 text-sm">
                {getFirstTeeTimeLabel(liveRound) ?? "Scoring is open"}
              </p>
            </div>
            <div className="text-3xl">🏌️</div>
          </div>
        </Link>
      )}

      {/* Next round card */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="bg-green-600 px-4 py-2">
          <p className="text-green-100 text-xs font-semibold uppercase tracking-wide">Next Round</p>
        </div>
        <div className="p-4">
          {loading ? (
            <div className="animate-pulse space-y-2">
              <div className="h-5 bg-gray-100 rounded w-3/4" />
              <div className="h-4 bg-gray-100 rounded w-1/2" />
            </div>
          ) : nextRound ? (
            <Link href={`/rounds/${nextRound.id}`} prefetch={false}>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h2 className="font-bold text-gray-800 text-lg leading-tight">
                    {nextRound.courseName}
                  </h2>
                  <p className="text-gray-500 text-sm mt-1">
                    {format(nextRound.date, "EEEE d MMMM yyyy")}
                    {getFirstTeeTimeLabel(nextRound)
                      ? ` · ${getFirstTeeTimeLabel(nextRound)}`
                      : ""}
                  </p>
                  <div className="mt-3 flex items-center gap-2">
                    <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                      nextRound.format === "stableford"
                        ? "bg-green-100 text-green-700"
                        : "bg-blue-100 text-blue-700"
                    }`}>
                      {nextRound.format === "stableford" ? "Stableford" : "Stroke Play"}
                    </span>
                    <span className="text-xs text-gray-400">
                      {nextRound.status === "upcoming" ? "Upcoming" : nextRound.status}
                    </span>
                    {nextRoundRsvp?.status === "accepted" && (
                      <span className="text-xs font-medium rounded-full bg-green-100 px-2.5 py-1 text-green-700">
                        Going
                      </span>
                    )}
                    {nextRoundRsvp?.status === "declined" && (
                      <span className="text-xs font-medium rounded-full bg-gray-100 px-2.5 py-1 text-gray-600">
                        Not going
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-green-600 mt-1">
                  <ChevronRight className="w-5 h-5" />
                </div>
              </div>
            </Link>
          ) : (
            <div className="text-center py-4">
              <p className="text-gray-400 text-sm">No upcoming rounds scheduled</p>
            </div>
          )}
        </div>
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-2 gap-3">
        <Link href="/rounds">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex flex-col items-center gap-2 hover:bg-gray-50 transition-colors">
            <span className="text-3xl">📋</span>
            <span className="text-sm font-medium text-gray-700">All Rounds</span>
          </div>
        </Link>
        <Link href="/leaderboard">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex flex-col items-center gap-2 hover:bg-gray-50 transition-colors">
            <span className="text-3xl">🏆</span>
            <span className="text-sm font-medium text-gray-700">Season Ladder</span>
          </div>
        </Link>
        <Link href="/feed">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex flex-col items-center gap-2 hover:bg-gray-50 transition-colors">
            <span className="text-3xl">💬</span>
            <span className="text-sm font-medium text-gray-700">Group Feed</span>
          </div>
        </Link>
        <Link href="/profile">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex flex-col items-center gap-2 hover:bg-gray-50 transition-colors">
            <span className="text-3xl">👤</span>
            <span className="text-sm font-medium text-gray-700">My Stats</span>
          </div>
        </Link>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="font-semibold text-gray-800">Season Ladder</h3>
            <p className="text-xs text-gray-400">{season} standings</p>
          </div>
          <Link href="/leaderboard" className="text-green-600 text-sm">View all</Link>
        </div>
        {visibleStandings.length === 0 ? (
          <div className="flex items-center justify-center py-6 text-gray-300">
          <div className="text-center">
            <div className="text-3xl mb-1">🏌️</div>
            <p className="text-sm">Leaderboard live after Round 1</p>
          </div>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {visibleStandings.slice(0, 3).map((standing) => (
              <div
                key={standing.id}
                className="flex items-center justify-between py-2 text-sm"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-7 text-xs font-semibold text-gray-400">
                    #{standing.displayCurrentRank}
                  </span>
                  <div className="min-w-0">
                    <p className="font-medium text-gray-800 truncate">
                      {standing.memberName}
                    </p>
                    <p className="text-xs text-gray-400">
                      {standing.roundsPlayed} rounds played
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-bold text-green-700">
                    {standing.totalPoints}
                  </p>
                  <p className="text-[11px] text-gray-400">ladder pts</p>
                  {standing.grossSeasonPoints !== standing.totalPoints && (
                    <p className="text-[11px] text-gray-400">
                      {standing.grossSeasonPoints} raw
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
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
