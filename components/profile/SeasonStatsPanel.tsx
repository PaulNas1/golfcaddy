"use client";

/**
 * SeasonStatsPanel
 *
 * Displays the player's season stats: rank, points, handicap, round count,
 * Stableford averages, side prizes, handicap trend chart, and full round
 * history with archive support.
 *
 * Season selection (dropdown) lives here — it's only relevant to this panel.
 */

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { useGroupData } from "@/contexts/GroupDataContext";
import {
  getHandicapHistoryForMemberSeason,
  getSeasonStandingForMember,
  subscribeSeasonStandings,
} from "@/lib/firestore";
import {
  getVisibleSeasonStandings,
  type VisibleSeasonStanding,
} from "@/lib/standingsDisplay";
import { hasRoundScorecards } from "@/lib/roundDisplay";
import { ChevronDownIcon, ChevronUpIcon } from "@/components/ui/icons";
import type {
  AppUser,
  HandicapHistory,
  Member,
  Round,
  RoundResult,
  SeasonStanding,
} from "@/types";

interface SeasonStatsPanelProps {
  appUser: AppUser;
  member: Member | null;
}

export default function SeasonStatsPanel({ appUser, member }: SeasonStatsPanelProps) {
  const {
    rounds,
    activeMembers,
    availableSeasons,
    currentSeason,
    currentSeasonStandings,
  } = useGroupData();

  const [selectedSeason, setSelectedSeason] = useState<number | null>(null);

  // Default to current season on first data
  useEffect(() => {
    if (selectedSeason == null && currentSeason) setSelectedSeason(currentSeason);
  }, [currentSeason, selectedSeason]);

  const activeSeason = selectedSeason ?? currentSeason;

  // Subscribe to standings for non-current seasons; current comes from context
  const [pastStandings, setPastStandings] = useState<SeasonStanding[]>([]);
  const [loadingStats, setLoadingStats] = useState(true);
  useEffect(() => {
    if (!appUser.groupId || activeSeason === currentSeason) {
      setLoadingStats(false);
      return;
    }
    setLoadingStats(true);
    return subscribeSeasonStandings(
      appUser.groupId,
      activeSeason,
      (s) => { setPastStandings(s); setLoadingStats(false); },
      (err) => { console.warn("Unable to load season standings", err); setLoadingStats(false); }
    );
  }, [appUser.groupId, activeSeason, currentSeason]);

  const standings = activeSeason === currentSeason ? currentSeasonStandings : pastStandings;

  // Handicap history for the selected season
  const [seasonHandicapHistory, setSeasonHandicapHistory] = useState<HandicapHistory[]>([]);
  const [latestHandicapHistory, setLatestHandicapHistory] = useState<HandicapHistory | null>(null);
  useEffect(() => {
    if (!appUser.groupId || activeSeason == null) {
      setSeasonHandicapHistory([]);
      setLatestHandicapHistory(null);
      return;
    }
    let cancelled = false;
    getHandicapHistoryForMemberSeason(appUser.groupId, appUser.uid, activeSeason)
      .then((history) => {
        if (cancelled) return;
        setSeasonHandicapHistory(history);
        setLatestHandicapHistory(history[0] ?? null);
      })
      .catch((err) => {
        console.warn("Unable to load handicap history", err);
        if (!cancelled) { setSeasonHandicapHistory([]); setLatestHandicapHistory(null); }
      });
    return () => { cancelled = true; };
  }, [appUser.groupId, appUser.uid, activeSeason]);

  // Archive: lazy-load standings per season when the user expands them
  const [archiveStandingsBySeason, setArchiveStandingsBySeason] = useState<Record<number, SeasonStanding | null>>({});
  const [archiveLoadingSeasons, setArchiveLoadingSeasons] = useState<Record<number, boolean>>({});

  const ensureArchiveSeasonLoaded = async (season: number) => {
    if (season === currentSeason) return;
    if (season in archiveStandingsBySeason || archiveLoadingSeasons[season]) return;
    setArchiveLoadingSeasons((prev) => ({ ...prev, [season]: true }));
    try {
      const standing = await getSeasonStandingForMember(appUser.groupId, season, appUser.uid);
      setArchiveStandingsBySeason((prev) => ({ ...prev, [season]: standing }));
    } catch {
      setArchiveStandingsBySeason((prev) => ({ ...prev, [season]: null }));
    } finally {
      setArchiveLoadingSeasons((prev) => ({ ...prev, [season]: false }));
    }
  };

  // Derived values
  const memberSeasonMatches = member?.seasonYear === activeSeason;
  const standing = useMemo(
    () =>
      getVisibleSeasonStandings(standings, new Set(activeMembers.map((m) => m.uid)))
        .find((s) => s.memberId === appUser.uid) ?? null,
    [activeMembers, appUser.uid, standings]
  );

  const statRounds = standing?.roundResults ?? [];

  const fallback = {
    seasonPoints: memberSeasonMatches ? member?.seasonPoints ?? 0 : 0,
    roundsPlayed: memberSeasonMatches ? member?.roundsPlayed ?? 0 : 0,
    avgStableford: memberSeasonMatches ? member?.avgStableford ?? "—" : "—",
    bestStableford: memberSeasonMatches ? member?.bestStableford ?? "—" : "—",
    ntpWins: memberSeasonMatches ? member?.ntpWins ?? 0 : 0,
    ldWins:  memberSeasonMatches ? member?.ldWins ?? 0 : 0,
    t2Wins:  memberSeasonMatches ? member?.t2Wins ?? 0 : 0,
    t3Wins:  memberSeasonMatches ? member?.t3Wins ?? 0 : 0,
  };

  const displayedHandicap = latestHandicapHistory?.newHandicap ?? member?.currentHandicap ?? "—";
  const rankTrend = getRankTrend(standing);
  const handicapTrend = getHandicapTrend(latestHandicapHistory, standing?.roundsPlayed ?? fallback.roundsPlayed);
  const averageTrend = getAverageStablefordTrend(statRounds);
  const bestTrend = getBestStablefordTrend(statRounds);
  const seasonWins = useMemo(() => statRounds.filter((r) => r.finish === 1).length, [statRounds]);
  const seasonTop3 = useMemo(() => statRounds.filter((r) => r.finish <= 3).length, [statRounds]);
  const roundsById = useMemo(() => new Map(rounds.map((r) => [r.id, r])), [rounds]);
  const archiveSeasons = useMemo(() => availableSeasons.filter((s) => s !== currentSeason), [availableSeasons, currentSeason]);

  // Active season results from archive store (if loaded)
  const activeSeasonResults = useMemo(
    () =>
      archiveStandingsBySeason[currentSeason]?.roundResults
        ?.slice().sort((a, b) => b.date.getTime() - a.date.getTime()) ??
      standing?.roundResults?.slice().sort((a, b) => b.date.getTime() - a.date.getTime()) ??
      [],
    [archiveStandingsBySeason, currentSeason, standing]
  );

  // Collapsible sections
  const [recentResultsOpen, setRecentResultsOpen] = useState(false);
  const [seasonArchiveOpen, setSeasonArchiveOpen] = useState(false);
  const [archiveSeasonOpen, setArchiveSeasonOpen] = useState<Record<number, boolean>>({});

  return (
    <div className="bg-surface-card rounded-2xl shadow-sm border border-surface-overlay p-4">
      {/* Header + season selector */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="font-semibold text-ink-title">Season {activeSeason}</h3>
          <p className="text-xs text-ink-hint">
            {activeSeason === currentSeason ? "Active season" : "Archived season"}
          </p>
        </div>
        <Link href="/leaderboard" className="text-brand-600 text-sm font-medium">Ladder</Link>
      </div>

      <label className="mb-3 block">
        <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-ink-hint">Season</span>
        <select
          value={activeSeason}
          onChange={(e) => setSelectedSeason(Number(e.target.value))}
          className="w-full rounded-xl border border-surface-overlay bg-surface-card px-3 py-2 text-sm text-ink-body focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          {availableSeasons.map((s) => (
            <option key={s} value={s}>{s}{s === currentSeason ? " (Active)" : ""}</option>
          ))}
        </select>
      </label>

      {loadingStats ? (
        <div className="grid grid-cols-2 gap-3 animate-pulse">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-20 rounded-xl bg-surface-muted" />)}
        </div>
      ) : !standing && !member ? (
        <div className="flex flex-col items-center py-8 text-ink-hint">
          <div className="text-4xl mb-2">📊</div>
          <p className="text-sm">Stats available after your first result</p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Main stat grid */}
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="Rank"           value={standing ? `#${standing.displayCurrentRank}` : "—"} trend={rankTrend} />
            <StatCard label="Points"         value={`${standing?.totalPoints ?? fallback.seasonPoints} pts`} />
            <StatCard label="Handicap"       value={String(displayedHandicap)} trend={handicapTrend} />
            <StatCard label="Rounds"         value={String(standing?.roundsPlayed ?? fallback.roundsPlayed)} />
            <StatCard label="Avg Stableford" value={String(fallback.avgStableford)} trend={averageTrend} />
            <StatCard label="Best Stableford" value={String(fallback.bestStableford)} trend={bestTrend} />
          </div>

          {/* Side prizes */}
          <div>
            <h4 className="text-sm font-semibold text-ink-title mb-2">Side Prizes</h4>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: "NTP", value: standing?.ntpWinsSeason ?? fallback.ntpWins },
                { label: "LD",  value: standing?.ldWinsSeason  ?? fallback.ldWins },
                { label: "T2",  value: standing?.t2WinsSeason  ?? fallback.t2Wins },
                { label: "T3",  value: standing?.t3WinsSeason  ?? fallback.t3Wins },
              ].map(({ label, value }) => (
                <div key={label} className="rounded-xl bg-brand-50 px-3 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-700">{label}</p>
                  <p className="mt-1 text-lg font-bold text-brand-800">{value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Handicap trend */}
          <div>
            <h4 className="text-sm font-semibold text-ink-title mb-1">Handicap Trend</h4>
            <p className="text-[11px] text-ink-hint mb-2">
              {activeSeason === currentSeason ? "Rolling handicap for the active season" : `Archive history for Season ${activeSeason}`}
            </p>
            <HandicapTrendChart history={seasonHandicapHistory} />
            {seasonHandicapHistory.length > 1 && (
              <div className="mt-3 grid gap-2">
                {seasonHandicapHistory.slice(0, 4).map((h) => (
                  <div key={h.id} className="rounded-xl border border-surface-overlay px-3 py-2">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-ink-title">
                          {h.newHandicap}
                          <span className="ml-2 text-xs font-medium text-ink-hint">from {h.previousHandicap}</span>
                        </p>
                        <p className="text-[11px] text-ink-hint">
                          {h.roundDate ? format(h.roundDate, "d MMM yyyy") : "Manual update"}
                          {h.qualifyingRoundCount ? ` · ${h.qualifyingRoundCount} qualifying rounds` : ""}
                        </p>
                      </div>
                      <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${
                        isHistoryOfficial(h) ? "bg-brand-100 text-brand-700" : "bg-amber-100 text-amber-700"
                      }`}>
                        {isHistoryOfficial(h) ? "Official" : "Provisional"}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-ink-hint">{h.reason}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Season results summary */}
          <div>
            <h4 className="mb-2 text-sm font-semibold text-ink-title">Season Results</h4>
            <div className="grid grid-cols-2 gap-3">
              <StatCard label="Wins"          value={String(seasonWins)} />
              <StatCard label="Top 3 Finishes" value={String(seasonTop3)} />
            </div>
          </div>

          {/* Round history: recent + archive */}
          {(activeSeasonResults.length > 0 || archiveSeasons.length > 0) && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h4 className="text-sm font-semibold text-ink-title">Full Round History</h4>
                <span className="text-[11px] text-ink-hint">
                  {activeSeasonResults.length +
                    archiveSeasons.reduce((sum, s) => sum + (archiveStandingsBySeason[s]?.roundResults?.length ?? 0), 0)
                  } rounds
                </span>
              </div>

              <CollapsibleSection
                title="Recent Results"
                subtitle={`Active season · ${activeSeasonResults.length} rounds`}
                open={recentResultsOpen}
                onToggle={() => setRecentResultsOpen((p) => !p)}
              >
                {activeSeasonResults.length > 0 ? (
                  <div className="divide-y divide-surface-overlay rounded-xl border border-surface-overlay">
                    {activeSeasonResults.map((r) => (
                      <RoundHistoryRow key={`active-${r.roundId}`} roundResult={r} round={roundsById.get(r.roundId) ?? null} />
                    ))}
                  </div>
                ) : (
                  <EmptyHistoryMessage text="No active-season round results yet." />
                )}
              </CollapsibleSection>

              <CollapsibleSection
                title="Season Archive"
                subtitle={archiveSeasons.length > 0 ? `${archiveSeasons.length} archived seasons` : "No archived seasons yet"}
                open={seasonArchiveOpen}
                onToggle={() => setSeasonArchiveOpen((p) => !p)}
              >
                {archiveSeasons.length > 0 ? (
                  <div className="space-y-3">
                    {archiveSeasons.map((season) => {
                      const seasonResults = archiveStandingsBySeason[season]?.roundResults ?? [];
                      const seasonOpen = archiveSeasonOpen[season] ?? false;
                      const seasonLoaded = season in archiveStandingsBySeason;
                      const seasonLoading = archiveLoadingSeasons[season] ?? false;
                      return (
                        <div key={season} className="rounded-xl border border-surface-overlay">
                          <button
                            type="button"
                            onClick={() => {
                              const nextOpen = !seasonOpen;
                              setArchiveSeasonOpen((p) => ({ ...p, [season]: nextOpen }));
                              if (nextOpen) void ensureArchiveSeasonLoaded(season);
                            }}
                            className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left"
                          >
                            <div>
                              <p className="text-sm font-semibold text-ink-title">{season}</p>
                              <p className="text-[11px] text-ink-hint">
                                {seasonLoading ? "Loading…" : seasonLoaded ? `${seasonResults.length} rounds` : "Tap to load"}
                              </p>
                            </div>
                            <span className="text-ink-hint">
                              {seasonOpen ? <ChevronUpIcon className="w-4 h-4" /> : <ChevronDownIcon className="w-4 h-4" />}
                            </span>
                          </button>
                          {seasonOpen && (
                            <div className="border-t border-surface-overlay">
                              {seasonLoading ? (
                                <p className="px-3 py-4 text-sm text-ink-muted">Loading archived results…</p>
                              ) : seasonResults.length > 0 ? (
                                <div className="divide-y divide-surface-overlay">
                                  {seasonResults.map((r) => (
                                    <RoundHistoryRow key={`${season}-${r.roundId}`} roundResult={r} round={roundsById.get(r.roundId) ?? null} archiveLabel="Archive" />
                                  ))}
                                </div>
                              ) : (
                                <p className="px-3 py-4 text-sm text-ink-muted">No archived results for this season.</p>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <EmptyHistoryMessage text="No archived season results yet." />
                )}
              </CollapsibleSection>
              <p className="text-[11px] text-ink-hint">
                Each row links to the round. Imported summary-only results will not have an archived scorecard.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

type StatTrendTone = "positive" | "negative" | "neutral";
type StatTrend = { label: string; tone: StatTrendTone };

function StatCard({ label, value, trend }: { label: string; value: string; trend?: StatTrend | null }) {
  const trendClass =
    trend?.tone === "positive" ? "text-brand-700"
    : trend?.tone === "negative" ? "text-red-600"
    : "text-ink-hint";
  return (
    <div className="rounded-xl bg-surface-muted px-3 py-3">
      <p className="text-xs text-ink-muted">{label}</p>
      <p className="mt-1 text-xl font-bold text-ink-title">{value}</p>
      {trend && <p className={`mt-1 text-[11px] font-medium ${trendClass}`}>{trend.label}</p>}
    </div>
  );
}

function CollapsibleSection({
  title, subtitle, open, onToggle, children,
}: { title: string; subtitle: string; open: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-surface-overlay">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left"
      >
        <div>
          <p className="text-sm font-semibold text-ink-title">{title}</p>
          <p className="text-[11px] text-ink-hint">{subtitle}</p>
        </div>
        <span className="text-ink-hint">
          {open ? <ChevronUpIcon className="w-4 h-4" /> : <ChevronDownIcon className="w-4 h-4" />}
        </span>
      </button>
      {open && <div className="border-t border-surface-overlay p-3">{children}</div>}
    </div>
  );
}

function EmptyHistoryMessage({ text }: { text: string }) {
  return (
    <p className="rounded-xl border border-dashed border-surface-overlay px-3 py-4 text-sm text-ink-muted">
      {text}
    </p>
  );
}

function RoundHistoryRow({
  roundResult, round, archiveLabel,
}: { roundResult: RoundResult; round: Round | null; archiveLabel?: string | null }) {
  return (
    <div className="px-3 py-3 text-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Link
              href={`/rounds/${roundResult.roundId}`}
              prefetch={false}
              className="truncate font-medium text-ink-title underline-offset-2 hover:underline"
            >
              {roundResult.courseName}
            </Link>
            {archiveLabel && (
              <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[10px] font-semibold text-ink-muted">{archiveLabel}</span>
            )}
          </div>
          <p className="text-xs text-ink-hint">
            {format(roundResult.date, "EEE d MMM yyyy")} · Finish #{roundResult.finish}
            {round?.roundName ? ` · ${round.roundName}` : round?.roundNumber ? ` · Round ${round.roundNumber}` : ""}
          </p>
          <p className="mt-1 text-xs text-ink-muted">
            {roundResult.pointsEligible === false
              ? roundResult.pointsIneligibleReason ?? "Provisional - no ladder points yet"
              : `Result ${roundResult.pointsAwarded} pts`}
            {!roundResult.countsForSeason ? " · Not counted in best-of ladder" : ""}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="font-semibold text-brand-700">
            {roundResult.stableford > 0 ? `${roundResult.stableford} stb` : `${roundResult.pointsAwarded} pts`}
          </p>
          {round && hasRoundScorecards(round) ? (
            <Link href={`/rounds/${roundResult.roundId}/my-card`} prefetch={false} className="mt-1 inline-block text-[11px] font-semibold text-brand-700 underline-offset-2 hover:underline">
              My card
            </Link>
          ) : (
            <p className="mt-1 text-[11px] font-semibold text-ink-hint">Results only</p>
          )}
        </div>
      </div>
    </div>
  );
}

function HandicapTrendChart({ history }: { history: HandicapHistory[] }) {
  if (history.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-surface-overlay px-3 py-6 text-center text-sm text-ink-muted">
        Handicap history will appear after published rounds land in this season.
      </div>
    );
  }
  if (history.length === 1) {
    const entry = history[0];
    return (
      <div className="rounded-xl border border-surface-overlay bg-surface-muted px-3 py-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-ink-title">
              {entry.newHandicap}
              <span className="ml-2 text-xs font-medium text-ink-hint">from {entry.previousHandicap}</span>
            </p>
            <p className="text-[11px] text-ink-hint">{entry.roundDate ? format(entry.roundDate, "d MMM yyyy") : "Manual update"}</p>
          </div>
          <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${isHistoryOfficial(entry) ? "bg-brand-100 text-brand-700" : "bg-amber-100 text-amber-700"}`}>
            {isHistoryOfficial(entry) ? "Official" : "Provisional"}
          </span>
        </div>
        <p className="mt-2 text-[11px] text-ink-hint">We need more than one update before a trend line is useful.</p>
      </div>
    );
  }

  const chronological = history.slice().sort((a, b) =>
    (a.roundDate ?? a.createdAt).getTime() - (b.roundDate ?? b.createdAt).getTime()
  );
  const values = chronological.map((e) => e.newHandicap);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const W = 300; const H = 112; const padX = 18; const padY = 16;
  const usableW = W - padX * 2; const usableH = H - padY * 2;
  const yFor = (v: number) => max === min ? H / 2 : padY + ((max - v) / (max - min)) * usableH;
  const points = chronological.map((e, i) => {
    const x = chronological.length === 1 ? W / 2 : padX + (i / (chronological.length - 1)) * usableW;
    return `${x},${yFor(e.newHandicap)}`;
  });

  return (
    <div className="rounded-xl border border-surface-overlay bg-surface-muted px-3 py-3">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-28 w-full">
        <line x1={padX} x2={W - padX} y1={H - padY} y2={H - padY} stroke="#d1d5db" strokeWidth="1" />
        <polyline fill="none" stroke="#15803d" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" points={points.join(" ")} />
        {chronological.map((e, i) => {
          const x = chronological.length === 1 ? W / 2 : padX + (i / (chronological.length - 1)) * usableW;
          return <circle key={e.id} cx={x} cy={yFor(e.newHandicap)} r="4" fill={e.officialAfterChange ? "#15803d" : "#f59e0b"} />;
        })}
      </svg>
      <div className="mt-2 flex items-center justify-between text-[11px] text-ink-hint">
        <span>{format(chronological[0].roundDate ?? chronological[0].createdAt, "d MMM")}</span>
        <span>Lower is better</span>
        <span>{format(chronological[chronological.length - 1].roundDate ?? chronological[chronological.length - 1].createdAt, "d MMM")}</span>
      </div>
    </div>
  );
}

// ── Trend helpers ─────────────────────────────────────────────────────────────

type SeasonRoundResult = Pick<RoundResult, "finish" | "stableford">;

function isHistoryOfficial(h: HandicapHistory) {
  return h.officialAfterChange || h.source === "manual_admin" || h.changeType === "manual_override" || h.changeType === "initial_allocation";
}

function getRankTrend(standing: VisibleSeasonStanding | null): StatTrend | null {
  if (!standing) return { label: "Unranked", tone: "neutral" };
  if (standing.displayPreviousRank == null) return { label: "New", tone: "neutral" };
  const diff = standing.displayPreviousRank - standing.displayCurrentRank;
  if (diff > 0) return { label: `Up ${diff} ${diff === 1 ? "place" : "places"}`, tone: "positive" };
  if (diff < 0) return { label: `Down ${Math.abs(diff)} ${Math.abs(diff) === 1 ? "place" : "places"}`, tone: "negative" };
  return { label: "Same rank", tone: "neutral" };
}

function getHandicapTrend(history: HandicapHistory | null, roundsPlayed: number): StatTrend | null {
  if (!history || roundsPlayed < 2) return { label: "—", tone: "neutral" };
  const change = Number(Math.abs(history.newHandicap - history.previousHandicap).toFixed(1));
  if (change === 0) return { label: "No change", tone: "neutral" };
  return history.newHandicap < history.previousHandicap
    ? { label: `↓ ${change}`, tone: "positive" }
    : { label: `↑ ${change}`, tone: "negative" };
}

function getAverageStablefordTrend(roundResults: SeasonRoundResult[]): StatTrend | null {
  const played = roundResults.filter((r) => r.stableford > 0);
  if (played.length < 2) return null;
  const avg = (arr: SeasonRoundResult[]) => Number((arr.reduce((s, r) => s + r.stableford, 0) / arr.length).toFixed(1));
  const current = avg(played);
  const previous = avg(played.slice(1));
  if (current > previous) return { label: `↑ ${Number((current - previous).toFixed(1))} vs last`, tone: "positive" };
  if (current < previous) return { label: `↓ ${Number((previous - current).toFixed(1))} vs last`, tone: "negative" };
  return { label: "No change", tone: "neutral" };
}

function getBestStablefordTrend(roundResults: SeasonRoundResult[]): StatTrend | null {
  const played = roundResults.filter((r) => r.stableford > 0);
  if (played.length < 2) return null;
  const best = (arr: SeasonRoundResult[]) => Math.max(...arr.map((r) => r.stableford));
  const current = best(played);
  const previous = best(played.slice(1));
  if (current > previous) return { label: `↑ ${current - previous} vs last`, tone: "positive" };
  if (current < previous) return { label: `↓ ${previous - current} vs last`, tone: "negative" };
  return { label: "Matched best", tone: "neutral" };
}
