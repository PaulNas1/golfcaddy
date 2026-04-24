"use client";

import { useEffect, useMemo, useState } from "react";
import {
  subscribeActiveMembers,
  subscribeGroup,
  subscribeMembersForGroup,
  subscribeRoundsForGroup,
  subscribeSeasonStandings,
} from "@/lib/firestore";
import { getVisibleSeasonStandings } from "@/lib/standingsDisplay";
import { useAuth } from "@/contexts/AuthContext";
import type { AppUser, Group, Member, SeasonStanding } from "@/types";

type LeaderboardEntry = {
  memberId: string;
  memberName: string;
  currentRank: number | null;
  previousRank: number | null;
  totalPoints: number;
  grossSeasonPoints: number;
  roundsPlayed: number;
  lastStableford: number | null;
  currentHandicap: number | null;
  probation: boolean;
  hasStanding: boolean;
};

export default function LeaderboardPage() {
  const { appUser } = useAuth();
  const [group, setGroup] = useState<Group | null>(null);
  const [currentSeason, setCurrentSeason] = useState(new Date().getFullYear());
  const [selectedSeason, setSelectedSeason] = useState<number | null>(null);
  const [availableSeasons, setAvailableSeasons] = useState<number[]>([]);
  const [activeMembers, setActiveMembers] = useState<AppUser[]>([]);
  const [groupMembers, setGroupMembers] = useState<Member[]>([]);
  const [standings, setStandings] = useState<SeasonStanding[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!appUser?.groupId) return;

    const groupUnsubscribe = subscribeGroup(
      appUser.groupId,
      (group) => {
        setGroup(group);
        const nextCurrentSeason =
          group?.currentSeason ?? new Date().getFullYear();
        setCurrentSeason(nextCurrentSeason);
        setSelectedSeason((current) => current ?? nextCurrentSeason);
      },
      (err) => {
        console.warn("Unable to subscribe to group", err);
        setLoading(false);
      }
    );

    const roundsUnsubscribe = subscribeRoundsForGroup(
      appUser.groupId,
      (rounds) => {
        const seasons = Array.from(new Set(rounds.map((round) => round.season))).sort(
          (a, b) => b - a
        );
        setAvailableSeasons(seasons);
      },
      (err) => console.warn("Unable to subscribe to rounds", err)
    );

    return () => {
      groupUnsubscribe();
      roundsUnsubscribe();
    };
  }, [appUser?.groupId]);

  useEffect(() => {
    if (!appUser?.groupId) return;

    const activeMembersUnsubscribe = subscribeActiveMembers(
      appUser.groupId,
      setActiveMembers,
      (err) => console.warn("Unable to subscribe to active members", err)
    );
    const groupMembersUnsubscribe = subscribeMembersForGroup(
      appUser.groupId,
      setGroupMembers,
      (err) => console.warn("Unable to subscribe to member stats", err)
    );

    return () => {
      activeMembersUnsubscribe();
      groupMembersUnsubscribe();
    };
  }, [appUser?.groupId]);

  useEffect(() => {
    if (!appUser?.groupId || selectedSeason == null) return;

    setLoading(true);
    return subscribeSeasonStandings(
      appUser.groupId,
      selectedSeason,
      (seasonStandings) => {
        setStandings(seasonStandings);
        setLoading(false);
      },
      (err) => {
        console.warn("Unable to subscribe to season standings", err);
        setLoading(false);
      }
    );
  }, [appUser?.groupId, selectedSeason]);

  const seasonOptions = useMemo(() => {
    const seasons = availableSeasons.length > 0 ? availableSeasons : [currentSeason];
    return Array.from(new Set(seasons)).sort((a, b) => b - a);
  }, [availableSeasons, currentSeason]);

  const leaderboardEntries = useMemo(() => {
    const membersById = new Map(groupMembers.map((member) => [member.id, member]));
    const handicapRoundsWindow = group?.settings.handicapRoundsWindow ?? 3;
    const visibleStandings = getVisibleSeasonStandings(
      standings,
      new Set(activeMembers.map((member) => member.uid))
    );
    const standingsByMemberId = new Map(
      visibleStandings.map((standing) => [standing.memberId, standing])
    );

    return activeMembers
      .map<LeaderboardEntry>((activeMember) => {
        const standing = standingsByMemberId.get(activeMember.uid) ?? null;
        const member = membersById.get(activeMember.uid) ?? null;
        const memberSeasonMatches = member?.seasonYear === selectedSeason;
        const roundsPlayed = standing?.roundsPlayed ?? (memberSeasonMatches ? member?.roundsPlayed ?? 0 : 0);
        const currentHandicap = member?.currentHandicap ?? null;
        const probation =
          !member ||
          ((currentHandicap ?? 0) <= 0 && roundsPlayed < handicapRoundsWindow);

        return {
          memberId: activeMember.uid,
          memberName: activeMember.displayName,
          currentRank: standing?.displayCurrentRank ?? null,
          previousRank: standing?.displayPreviousRank ?? null,
          totalPoints: standing?.totalPoints ?? (memberSeasonMatches ? member?.seasonPoints ?? 0 : 0),
          grossSeasonPoints: standing?.grossSeasonPoints ?? (memberSeasonMatches ? member?.seasonPoints ?? 0 : 0),
          roundsPlayed,
          lastStableford: standing?.roundResults[0]?.stableford ?? null,
          currentHandicap,
          probation,
          hasStanding: Boolean(standing),
        };
      })
      .sort((a, b) => {
        if (a.hasStanding && b.hasStanding) {
          if ((a.currentRank ?? Infinity) !== (b.currentRank ?? Infinity)) {
            return (a.currentRank ?? Infinity) - (b.currentRank ?? Infinity);
          }
          return a.memberName.localeCompare(b.memberName);
        }
        if (a.hasStanding !== b.hasStanding) return a.hasStanding ? -1 : 1;
        return a.memberName.localeCompare(b.memberName);
      });
  }, [activeMembers, group?.settings.handicapRoundsWindow, groupMembers, selectedSeason, standings]);

  const activeMemberIds = useMemo(
    () => new Set(activeMembers.map((member) => member.uid)),
    [activeMembers]
  );
  const sidePrizeStandings = useMemo(
    () => standings.filter((standing) => activeMemberIds.has(standing.memberId)),
    [activeMemberIds, standings]
  );

  const sideLeaderboards = [
    {
      label: "NTP",
      key: "ntpWinsSeason" as const,
    },
    {
      label: "LD",
      key: "ldWinsSeason" as const,
    },
    {
      label: "T2",
      key: "t2WinsSeason" as const,
    },
    {
      label: "T3",
      key: "t3WinsSeason" as const,
    },
  ];

  return (
    <div className="px-4 py-6 pb-8">
      <div className="mb-5">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Season Ladder</h1>
            <p className="text-gray-500 text-sm">
              Season {selectedSeason ?? currentSeason}
              {selectedSeason === currentSeason ? " · active" : ""}
            </p>
          </div>
          <label className="block">
            <span className="mb-1 block text-right text-[11px] font-medium uppercase tracking-wide text-gray-400">
              Season
            </span>
            <select
              value={selectedSeason ?? currentSeason}
              onChange={(event) => setSelectedSeason(Number(event.target.value))}
              className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              {seasonOptions.map((season) => (
                <option key={season} value={season}>
                  {season}
                  {season === currentSeason ? " (Active)" : ""}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3 animate-pulse">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-white rounded-2xl p-4 h-20" />
          ))}
        </div>
      ) : leaderboardEntries.length === 0 ? (
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
            {leaderboardEntries.map((entry) => (
              <StandingCard
                key={entry.memberId}
                entry={entry}
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
                  standings={sidePrizeStandings}
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
  entry,
  currentUserId,
}: {
  entry: LeaderboardEntry;
  currentUserId: string;
}) {
  return (
    <div
      className={`bg-white rounded-2xl shadow-sm border p-4 ${
        entry.memberId === currentUserId
          ? "border-green-200"
          : "border-gray-100"
      }`}
    >
      <div className="flex items-center gap-3">
        <div className="w-10 text-center">
          <p className="text-xl font-bold text-gray-800">
            {entry.currentRank != null ? `#${entry.currentRank}` : "—"}
          </p>
          <p className="text-[11px] text-gray-400">
            {entry.hasStanding ? getRankMovement(entry) : "Unranked"}
          </p>
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-800 truncate">
            {entry.memberName}
          </p>
          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-gray-500">
            <span>{entry.roundsPlayed} round{entry.roundsPlayed === 1 ? "" : "s"}</span>
            {entry.lastStableford != null && (
              <span>Last round {entry.lastStableford} pts</span>
            )}
            <span
              className={`rounded-full px-2 py-0.5 font-medium ${
                entry.probation
                  ? "bg-amber-100 text-amber-700"
                  : "bg-gray-100 text-gray-600"
              }`}
            >
              {entry.probation
                ? "P"
                : `HCP ${formatHandicap(entry.currentHandicap)}`}
            </span>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-lg font-bold text-green-700">
            {entry.totalPoints} <span className="text-sm font-semibold">pts</span>
          </p>
          {entry.grossSeasonPoints !== entry.totalPoints && (
            <p className="text-[11px] text-gray-400">
              {entry.grossSeasonPoints} raw
            </p>
          )}
        </div>
      </div>
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
    .slice(0, 3);

  const leader = leaders[0] ?? null;
  const runnersUp = leaders.slice(1);

  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
        {label}
      </p>
      {!leader ? (
        <div className="mt-3">
          <p className="text-sm font-semibold text-gray-700">No winner yet</p>
          <p className="mt-1 text-xs text-gray-400">
            This category updates after prize winners are published.
          </p>
        </div>
      ) : (
        <div className="mt-3">
          <p className="truncate text-sm font-semibold text-gray-800">
            {leader.memberName}
          </p>
          <p className="mt-1 text-lg font-bold text-green-700">
            {leader[statKey]} {formatWinLabel(leader[statKey])}
          </p>
          <div className="mt-3 space-y-1.5">
            {runnersUp.length === 0 ? (
              <p className="text-xs text-gray-400">No other winners</p>
            ) : (
              runnersUp.map((standing, index) => (
                <div
                  key={standing.memberId}
                  className="flex items-center justify-between gap-3 text-xs"
                >
                  <span className="truncate text-gray-500">
                    #{index + 2} {standing.memberName}
                  </span>
                  <span className="shrink-0 font-semibold text-green-700">
                    {standing[statKey]}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function formatWinLabel(count: number) {
  return count === 1 ? "win" : "wins";
}

function getRankMovement(standing: {
  previousRank: number | null;
  currentRank: number | null;
}) {
  if (standing.previousRank == null || standing.currentRank == null) return "New";
  const diff = standing.previousRank - standing.currentRank;
  if (diff > 0) return `↑${diff}`;
  if (diff < 0) return `↓${Math.abs(diff)}`;
  return "Same";
}

function formatHandicap(handicap: number | null) {
  if (handicap == null) return "—";
  return Number.isInteger(handicap) ? String(handicap) : handicap.toFixed(1);
}
