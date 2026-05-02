"use client";

import { useEffect, useMemo, useState } from "react";
import { useGroupData } from "@/contexts/GroupDataContext";
import { subscribeSeasonStandings } from "@/lib/firestore";
import { getVisibleSeasonStandings } from "@/lib/standingsDisplay";
import { useAuth } from "@/contexts/AuthContext";
import type { SeasonStanding } from "@/types";

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
  const {
    group,
    activeMembers,
    groupMembers,
    currentSeason,
    currentSeasonStandings,
    availableSeasons,
    loading: contextLoading,
  } = useGroupData();

  const [selectedSeason, setSelectedSeason] = useState<number | null>(null);
  const [pastStandings, setPastStandings] = useState<SeasonStanding[]>([]);
  const [pastLoading, setPastLoading] = useState(false);

  // Season options: all available seasons, always including current
  const seasonOptions = useMemo(() => {
    const seasons = availableSeasons.length > 0 ? availableSeasons : [currentSeason];
    return Array.from(new Set([...seasons, currentSeason])).sort((a, b) => b - a);
  }, [availableSeasons, currentSeason]);

  // Default to current season on first data arrival
  useEffect(() => {
    if (selectedSeason == null && currentSeason) {
      setSelectedSeason(currentSeason);
    }
  }, [currentSeason, selectedSeason]);

  // Subscribe to standings for past seasons only; current season comes from context
  useEffect(() => {
    if (!appUser?.groupId || selectedSeason == null) return;
    if (selectedSeason === currentSeason) return;

    setPastLoading(true);
    return subscribeSeasonStandings(
      appUser.groupId,
      selectedSeason,
      (s) => {
        setPastStandings(s);
        setPastLoading(false);
      },
      (err) => {
        console.warn("Unable to subscribe to season standings", err);
        setPastLoading(false);
      }
    );
  }, [appUser?.groupId, currentSeason, selectedSeason]);

  const standings =
    selectedSeason === currentSeason ? currentSeasonStandings : pastStandings;
  const loading = contextLoading || (selectedSeason !== currentSeason && pastLoading);

  const leaderboardEntries = useMemo(() => {
    const membersById = new Map(groupMembers.map((m) => [m.id, m]));
    const handicapRoundsWindow = group?.settings.handicapRoundsWindow ?? 6;
    const minimumRoundsForPoints = group?.settings.minimumRoundsForPoints ?? 3;
    const visibleStandings = getVisibleSeasonStandings(
      standings,
      new Set(activeMembers.map((m) => m.uid))
    );
    const standingsByMemberId = new Map(
      visibleStandings.map((s) => [s.memberId, s])
    );

    return activeMembers
      .map<LeaderboardEntry>((activeMember) => {
        const standing = standingsByMemberId.get(activeMember.uid) ?? null;
        const member = membersById.get(activeMember.uid) ?? null;
        const memberSeasonMatches = member?.seasonYear === selectedSeason;
        const roundsPlayed =
          standing?.roundsPlayed ??
          (memberSeasonMatches ? member?.roundsPlayed ?? 0 : 0);
        const currentHandicap = member?.currentHandicap ?? null;
        const isOfficial =
          member?.handicapStatus === "official" ||
          (member?.handicapStatus == null && (currentHandicap ?? 0) > 0);
        const probation =
          !member ||
          (!isOfficial &&
            (roundsPlayed < minimumRoundsForPoints ||
              member?.handicapStatus === "provisional" ||
              (member?.handicapStatus == null &&
                (currentHandicap ?? 0) <= 0 &&
                roundsPlayed < handicapRoundsWindow)));

        return {
          memberId: activeMember.uid,
          memberName: activeMember.displayName,
          currentRank: standing?.displayCurrentRank ?? null,
          previousRank: standing?.displayPreviousRank ?? null,
          totalPoints:
            standing?.totalPoints ??
            (memberSeasonMatches ? member?.seasonPoints ?? 0 : 0),
          grossSeasonPoints:
            standing?.grossSeasonPoints ??
            (memberSeasonMatches ? member?.seasonPoints ?? 0 : 0),
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
  }, [
    activeMembers,
    group?.settings.handicapRoundsWindow,
    group?.settings.minimumRoundsForPoints,
    groupMembers,
    selectedSeason,
    standings,
  ]);

  const activeMemberIds = useMemo(
    () => new Set(activeMembers.map((m) => m.uid)),
    [activeMembers]
  );
  const sidePrizeStandings = useMemo(
    () => standings.filter((s) => activeMemberIds.has(s.memberId)),
    [activeMemberIds, standings]
  );

  const sideLeaderboards = [
    { label: "NTP", key: "ntpWinsSeason" as const },
    { label: "LD",  key: "ldWinsSeason" as const },
    { label: "T2",  key: "t2WinsSeason" as const },
    { label: "T3",  key: "t3WinsSeason" as const },
  ];

  return (
    <div className="px-4 py-6 pb-8">
      {/* Header + season picker */}
      <div className="mb-5">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-ink-title">Ladder</h1>
            <p className="text-ink-muted text-sm">
              Season {selectedSeason ?? currentSeason}
              {selectedSeason === currentSeason ? " · active" : ""}
            </p>
          </div>
          <label className="block">
            <span className="mb-1 block text-right text-xs font-medium uppercase tracking-wide text-ink-hint">
              Season
            </span>
            <select
              value={selectedSeason ?? currentSeason}
              onChange={(event) => setSelectedSeason(Number(event.target.value))}
              className="rounded-xl border border-surface-overlay bg-surface-card px-3 py-2 text-sm text-ink-body focus:outline-none focus:ring-2 focus:ring-brand-500"
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

      {/* Loading skeleton */}
      {loading ? (
        <div className="space-y-3 animate-pulse">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-surface-card rounded-2xl p-4 h-20" />
          ))}
        </div>
      ) : leaderboardEntries.length === 0 ? (
        /* Empty state */
        <div className="flex flex-col items-center justify-center py-16 text-ink-hint">
          <div className="text-5xl mb-4">🏆</div>
          <p className="font-medium text-ink-muted mb-1">No standings yet</p>
          <p className="text-sm text-center max-w-xs">
            The ladder appears after the first round results are published.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Standings list */}
          <div className="space-y-3">
            {leaderboardEntries.map((entry) => (
              <StandingCard
                key={entry.memberId}
                entry={entry}
                isCurrentUser={entry.memberId === appUser?.uid}
              />
            ))}
          </div>

          {/* Side prize boards */}
          <div className="bg-surface-card rounded-2xl shadow-sm border border-surface-overlay p-4">
            <h2 className="font-semibold text-ink-title mb-3">Side Prize Leaders</h2>
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

// ── Sub-components ──────────────────────────────────────────────────────────

function StandingCard({
  entry,
  isCurrentUser,
}: {
  entry: LeaderboardEntry;
  isCurrentUser: boolean;
}) {
  return (
    <div
      className={`bg-surface-card rounded-2xl shadow-sm border p-4 ${
        isCurrentUser ? "border-brand-200" : "border-surface-overlay"
      }`}
    >
      <div className="flex items-center gap-3">
        {/* Rank column */}
        <div className="w-10 text-center shrink-0">
          <p className="text-xl font-bold text-ink-title">
            {entry.currentRank != null ? `#${entry.currentRank}` : "—"}
          </p>
          <p className="mt-0.5 text-xs text-ink-hint">
            {entry.hasStanding ? getRankMovement(entry) : "Unranked"}
          </p>
        </div>

        {/* Name + meta */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="font-semibold text-ink-title truncate">{entry.memberName}</p>
            {isCurrentUser && (
              <span className="shrink-0 rounded-full bg-brand-100 px-1.5 py-0.5 text-[10px] font-semibold text-brand-700">
                you
              </span>
            )}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-ink-muted">
            <span>
              {entry.roundsPlayed} round{entry.roundsPlayed === 1 ? "" : "s"}
            </span>
            {entry.lastStableford != null && (
              <span>Last {entry.lastStableford} pts</span>
            )}
            <span
              className={`rounded-full px-2 py-0.5 font-medium ${
                entry.probation
                  ? "bg-announce-bg text-announce-muted"
                  : "bg-surface-muted text-ink-muted"
              }`}
            >
              {entry.probation
                ? "Provisional"
                : `HCP ${formatHandicap(entry.currentHandicap)}`}
            </span>
          </div>
        </div>

        {/* Points */}
        <div className="shrink-0 text-right">
          <p className="text-lg font-bold text-brand-700">
            {entry.totalPoints}{" "}
            <span className="text-sm font-semibold">pts</span>
          </p>
          {entry.grossSeasonPoints !== entry.totalPoints && (
            <p className="text-xs text-ink-hint">{entry.grossSeasonPoints} raw</p>
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
  statKey: "ntpWinsSeason" | "ldWinsSeason" | "t2WinsSeason" | "t3WinsSeason";
}) {
  const leaders = standings
    .filter((s) => s[statKey] > 0)
    .sort(
      (a, b) =>
        b[statKey] - a[statKey] || a.memberName.localeCompare(b.memberName)
    )
    .slice(0, 3);

  const leader = leaders[0] ?? null;
  const runnersUp = leaders.slice(1);

  return (
    <div className="rounded-xl border border-surface-overlay bg-surface-muted px-3 py-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-hint">
        {label}
      </p>
      {!leader ? (
        <div className="mt-3">
          <p className="text-sm font-semibold text-ink-muted">No winner yet</p>
          <p className="mt-1 text-xs text-ink-hint">
            Updates after prize winners are published.
          </p>
        </div>
      ) : (
        <div className="mt-3">
          <p className="truncate text-sm font-semibold text-ink-title">
            {leader.memberName}
          </p>
          <p className="mt-1 text-lg font-bold text-brand-700">
            {leader[statKey]} {leader[statKey] === 1 ? "win" : "wins"}
          </p>
          <div className="mt-3 space-y-1.5">
            {runnersUp.length === 0 ? (
              <p className="text-xs text-ink-hint">No other winners</p>
            ) : (
              runnersUp.map((standing, index) => (
                <div
                  key={standing.memberId}
                  className="flex items-center justify-between gap-3 text-xs"
                >
                  <span className="truncate text-ink-muted">
                    #{index + 2} {standing.memberName}
                  </span>
                  <span className="shrink-0 font-semibold text-brand-700">
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

// ── Helpers ─────────────────────────────────────────────────────────────────

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
