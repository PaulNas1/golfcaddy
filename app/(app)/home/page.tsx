"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { format, formatDistanceToNow, isToday } from "date-fns";
import { useAuth } from "@/contexts/AuthContext";
import { useGroupData } from "@/contexts/GroupDataContext";
import {
  subscribeRoundRsvps,
  subscribePinnedAnnouncement,
  setRoundRsvp,
} from "@/lib/firestore";
import { getVisibleSeasonStandings, type VisibleSeasonStanding } from "@/lib/standingsDisplay";
import { getFirstTeeTimeLabel } from "@/lib/teeTimes";
import { getEffectiveSpecialHoles, getViewerHoles } from "@/lib/courseData";
import { CourseCardPreview } from "@/components/CourseCardPreview";
import InstallPrompt from "@/components/InstallPrompt";
import { ChevronRightIcon, ChevronDownIcon, PencilIcon, EyeIcon, CheckIcon, XIcon } from "@/components/ui/icons";
import type { Post, Round, RoundRsvp } from "@/types";

export default function HomePage() {
  const { appUser } = useAuth();
  const {
    group,
    rounds,
    activeMembers,
    groupMembers,
    currentSeason,
    currentSeasonStandings,
    loading,
  } = useGroupData();

  const [nextRoundRsvps, setNextRoundRsvps] = useState<RoundRsvp[]>([]);
  const [pinnedAnnouncement, setPinnedAnnouncement] = useState<Post | null>(null);
  const [rsvpBusy, setRsvpBusy] = useState(false);
  const [rosterOpen, setRosterOpen] = useState(false);

  const liveRound = useMemo(
    () => rounds.find((r) => r.status === "live") ?? null,
    [rounds]
  );

  const nextRound = useMemo<Round | null>(() => {
    return (
      rounds
        .filter((r) => r.status === "upcoming")
        .sort((a, b) => {
          if (a.date.getTime() !== b.date.getTime()) {
            return a.date.getTime() - b.date.getTime();
          }
          return a.roundNumber - b.roundNumber;
        })[0] ?? null
    );
  }, [rounds]);

  const lastCompletedRound = useMemo<Round | null>(() => {
    return (
      rounds
        .filter((r) => r.status === "completed")
        .sort((a, b) => b.date.getTime() - a.date.getTime())[0] ?? null
    );
  }, [rounds]);

  // The season is "wrapped" only once we're past its configured end month —
  // not merely because no round happens to be scheduled.
  const seasonOver = useMemo(() => {
    const startMonth = group?.settings?.seasonStartMonth ?? 1;
    const endMonth = group?.settings?.seasonEndMonth ?? 12;
    const year = Number(currentSeason);
    const endYear = startMonth <= endMonth ? year : year + 1;
    // First instant after the season: first day of the month following endMonth.
    const afterSeason = new Date(endYear, endMonth, 1);
    return new Date() >= afterSeason;
  }, [group?.settings?.seasonStartMonth, group?.settings?.seasonEndMonth, currentSeason]);

  useEffect(() => {
    if (!appUser?.groupId) {
      setPinnedAnnouncement(null);
      return;
    }
    return subscribePinnedAnnouncement(
      appUser.groupId,
      setPinnedAnnouncement,
      (err) => console.warn("Unable to subscribe to pinned announcement", err)
    );
  }, [appUser?.groupId]);

  useEffect(() => {
    if (!nextRound?.id) {
      setNextRoundRsvps([]);
      return;
    }
    return subscribeRoundRsvps(
      nextRound.id,
      setNextRoundRsvps,
      (err) => console.warn("Unable to subscribe to round RSVPs", err)
    );
  }, [nextRound?.id]);

  const visibleStandings = useMemo(
    () =>
      getVisibleSeasonStandings(
        currentSeasonStandings,
        new Set([
          ...activeMembers.map((m) => m.uid),
          ...groupMembers.filter((m) => m.isPlaceholder).map((m) => m.id),
        ])
      ),
    [activeMembers, currentSeasonStandings, groupMembers]
  );

  // Current user's standing — for the personal stats strip
  const myStanding = useMemo(
    () => visibleStandings.find((s) => s.memberId === appUser?.uid) ?? null,
    [visibleStandings, appUser?.uid]
  );

  // Current user's member record — for handicap
  const myMember = useMemo(
    () => groupMembers.find((m) => m.userId === appUser?.uid) ?? null,
    [groupMembers, appUser?.uid]
  );

  // My RSVP + the going / can't-make-it roster for the next round
  const myRsvp = useMemo(
    () => nextRoundRsvps.find((r) => r.memberId === appUser?.uid) ?? null,
    [nextRoundRsvps, appUser?.uid]
  );
  const goingNames = useMemo(
    () => nextRoundRsvps.filter((r) => r.status === "accepted").map((r) => r.memberName),
    [nextRoundRsvps]
  );
  const outNames = useMemo(
    () => nextRoundRsvps.filter((r) => r.status === "declined").map((r) => r.memberName),
    [nextRoundRsvps]
  );

  const firstName = appUser?.displayName?.split(" ")[0] || "there";
  const isRoundDay =
    liveRound != null || (nextRound != null && isToday(nextRound.date));
  const greeting = isRoundDay
    ? `Good luck today, ${firstName}! ⛳`
    : `Hey ${firstName} 👋`;
  const greetingSub = isRoundDay
    ? liveRound
      ? `Round ${liveRound.roundNumber} is live`
      : `Round ${nextRound!.roundNumber} tees off today`
    : (group?.name ?? "Golf group");

  const pinnedAnnouncementSummary =
    pinnedAnnouncement?.content.trim() ||
    (pinnedAnnouncement?.photoUrls.length
      ? `${pinnedAnnouncement.photoUrls.length} photo${
          pinnedAnnouncement.photoUrls.length === 1 ? "" : "s"
        } attached`
      : "An admin shared an announcement in the feed.");

  const handleRsvp = async (status: "accepted" | "declined") => {
    if (!appUser || !nextRound) return;
    // Optimistically flip before the write resolves
    setRsvpBusy(true);
    try {
      await setRoundRsvp({ round: nextRound, member: appUser, status });
    } catch (err) {
      console.error("RSVP failed", err);
    } finally {
      setRsvpBusy(false);
    }
  };

  return (
    <div className="px-4 py-6 space-y-5">
      {/* ── PWA install prompt ─────────────────────────────────────── */}
      <div className="-mx-4">
        <InstallPrompt />
      </div>

      {/* ── Greeting ─────────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-bold text-ink-title">{greeting}</h1>
        <p className="text-ink-muted text-sm mt-0.5">{greetingSub}</p>
      </div>

      {/* ── Personal stats strip ──────────────────────────────────── */}
      {/*
        Replaces the old 2×2 quick-link grid, which was a duplicate of the
        bottom nav. This strip shows information the nav can't show and
        provides a reason to check the home screen beyond navigation.
      */}
      {myStanding && (
        <div className="grid grid-cols-4 gap-2">
          <StatPill
            label="Rank"
            value={myStanding.displayCurrentRank != null ? `#${myStanding.displayCurrentRank}` : "—"}
          />
          <StatPill
            label="Points"
            value={`${myStanding.totalPoints}`}
          />
          <StatPill
            label="Rounds"
            value={String(myStanding.roundsPlayed)}
          />
          <StatPill
            label="HCP"
            value={myMember?.currentHandicap != null
              ? (Number.isInteger(myMember.currentHandicap)
                  ? String(myMember.currentHandicap)
                  : myMember.currentHandicap.toFixed(1))
              : "—"}
          />
        </div>
      )}

      {/* ── Recap card: season wrap (off-season) vs between-rounds standings ── */}
      {!liveRound && !nextRound && !loading && visibleStandings.length > 0 && (
        seasonOver ? (
          <SeasonRecapCard
            standings={visibleStandings}
            season={currentSeason}
            myMemberId={appUser?.uid ?? null}
          />
        ) : (
          <RoundRecapCard
            standings={visibleStandings}
            season={currentSeason}
            roundNumber={lastCompletedRound?.roundNumber ?? null}
            myMemberId={appUser?.uid ?? null}
          />
        )
      )}

      {/* ── Live round banner ─────────────────────────────────────── */}
      {liveRound && (() => {
        const { holes: liveHoles, note: liveNote } = getViewerHoles(liveRound, appUser ?? null);
        return (
          <div className="space-y-2">
            <div className="bg-red-500 text-white rounded-2xl shadow-md overflow-hidden">
              <Link href={`/rounds/${liveRound.id}`} prefetch={false}>
                <div className="p-4 flex items-center justify-between">
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
              <div className="border-t border-red-400 grid grid-cols-2 divide-x divide-red-400">
                <Link
                  href={`/rounds/${liveRound.id}/scorecard`}
                  prefetch={false}
                  className="py-2.5 flex items-center justify-center gap-1.5 text-xs font-semibold text-white/90 hover:bg-red-600 active:bg-red-700 transition-colors"
                >
                  <PencilIcon className="w-3.5 h-3.5" />
                  Scorecard
                </Link>
                <Link
                  href={`/rounds/${liveRound.id}/my-card`}
                  prefetch={false}
                  className="py-2.5 flex items-center justify-center gap-1.5 text-xs font-semibold text-white/90 hover:bg-red-600 active:bg-red-700 transition-colors"
                >
                  <EyeIcon className="w-3.5 h-3.5" />
                  My Card
                </Link>
              </div>
            </div>
            {liveHoles.length === 18 && (
              <CourseCardPreview
                holes={liveHoles}
                distanceUnit={appUser?.distanceUnit ?? "meters"}
                specialHoles={getEffectiveSpecialHoles(liveRound)}
                teeSetName={liveRound.teeSetName ?? undefined}
                note={liveNote ?? undefined}
              />
            )}
          </div>
        );
      })()}

      {/* ── Next round card ───────────────────────────────────────── */}
      <div className="bg-surface-card rounded-2xl shadow-sm border border-surface-overlay overflow-hidden">
        <div className="bg-brand-600 px-4 py-2">
          <p className="text-brand-100 text-xs font-semibold">Next Round</p>
        </div>
        <div className="p-4">
          {loading ? (
            <div className="animate-pulse space-y-2">
              <div className="h-5 bg-surface-muted rounded w-3/4" />
              <div className="h-4 bg-surface-muted rounded w-1/2" />
            </div>
          ) : nextRound ? (
            <>
              {/* Round info — tappable to detail */}
              <Link href={`/rounds/${nextRound.id}`} prefetch={false}>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h2 className="font-bold text-ink-title text-lg leading-tight">
                      {nextRound.courseName}
                    </h2>
                    <p className="text-ink-muted text-sm mt-1">
                      {format(nextRound.date, "EEEE d MMMM yyyy")}
                      {getFirstTeeTimeLabel(nextRound)
                        ? ` · ${getFirstTeeTimeLabel(nextRound)}`
                        : ""}
                    </p>
                    <div className="mt-2 flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-surface-muted text-ink-muted">
                        {nextRound.format === "stableford" ? "Stableford" : "Stroke Play"}
                      </span>
                    </div>
                  </div>
                  <ChevronRightIcon className="w-5 h-5 text-ink-hint mt-1" />
                </div>
              </Link>

              {/* ── Inline RSVP ───────────────────────────────────── */}
              {nextRound.rsvpOpen && (
                <div className="mt-4 border-t border-surface-overlay pt-3 space-y-3">
                  {/* Segmented toggle — neutral until you choose */}
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      disabled={rsvpBusy}
                      aria-pressed={myRsvp?.status === "accepted"}
                      onClick={() => handleRsvp("accepted")}
                      className={`flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-bold border-2 transition-colors disabled:opacity-60 ${
                        myRsvp?.status === "accepted"
                          ? "border-brand-600 bg-brand-600 text-white"
                          : "border-surface-overlay text-ink-body hover:border-brand-600 hover:text-brand-700"
                      }`}
                    >
                      <CheckIcon className="w-4 h-4" />
                      Going
                    </button>
                    <button
                      type="button"
                      disabled={rsvpBusy}
                      aria-pressed={myRsvp?.status === "declined"}
                      onClick={() => handleRsvp("declined")}
                      className={`flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-bold border-2 transition-colors disabled:opacity-60 ${
                        myRsvp?.status === "declined"
                          ? "border-red-600 bg-red-600 text-white"
                          : "border-surface-overlay text-ink-muted hover:border-red-500 hover:text-red-600"
                      }`}
                    >
                      <XIcon className="w-4 h-4" />
                      Can&apos;t make it
                    </button>
                  </div>

                  {/* Who's in / who's out — collapsible */}
                  {(goingNames.length > 0 || outNames.length > 0) && (
                    <div className="rounded-xl bg-surface-muted overflow-hidden text-xs">
                      <button
                        type="button"
                        onClick={() => setRosterOpen((open) => !open)}
                        aria-expanded={rosterOpen}
                        className="flex w-full items-center justify-between px-3 py-2.5"
                      >
                        <span className="flex items-center gap-2">
                          <span className="font-semibold text-brand-700">
                            {goingNames.length} going
                          </span>
                          {outNames.length > 0 && (
                            <>
                              <span className="text-ink-hint">·</span>
                              <span className="font-semibold text-red-600">
                                {outNames.length} out
                              </span>
                            </>
                          )}
                        </span>
                        <ChevronDownIcon
                          className={`w-4 h-4 text-ink-hint transition-transform ${
                            rosterOpen ? "rotate-180" : ""
                          }`}
                        />
                      </button>
                      {rosterOpen && (
                        <div className="border-t border-surface-overlay px-3 py-2.5 space-y-1.5">
                          {goingNames.length > 0 && (
                            <div className="flex gap-2">
                              <span className="shrink-0 font-semibold text-brand-700">Going</span>
                              <span className="text-ink-muted">{goingNames.join(", ")}</span>
                            </div>
                          )}
                          {outNames.length > 0 && (
                            <div className="flex gap-2">
                              <span className="shrink-0 font-semibold text-red-600">Out</span>
                              <span className="text-ink-muted">{outNames.join(", ")}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
              {!nextRound.rsvpOpen && myRsvp && (
                <div className="mt-3 flex items-center gap-2">
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                    myRsvp.status === "accepted"
                      ? "bg-brand-100 text-brand-700"
                      : "bg-surface-muted text-ink-muted"
                  }`}>
                    {myRsvp.status === "accepted" ? "✓ I'm in" : "✗ Can't make it"}
                  </span>
                </div>
              )}

              {/* Course card preview — collapsed by default */}
              {(() => {
                const { holes: nextHoles, note: nextNote } = getViewerHoles(nextRound, appUser ?? null);
                if (nextHoles.length !== 18) return null;
                return (
                  <div className="mt-3">
                    <CourseCardPreview
                      holes={nextHoles}
                      distanceUnit={appUser?.distanceUnit ?? "meters"}
                      specialHoles={getEffectiveSpecialHoles(nextRound)}
                      teeSetName={nextRound.teeSetName ?? undefined}
                      note={nextNote ?? undefined}
                    />
                  </div>
                );
              })()}
            </>
          ) : (
            <div className="text-center py-4">
              <p className="text-ink-hint text-sm">No upcoming rounds scheduled</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Pinned announcement ───────────────────────────────────── */}
      {pinnedAnnouncement && (
        <Link href="/feed" prefetch={false} className="block">
          <div className="rounded-2xl border border-announce-border bg-announce-bg p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-announce-muted">
                  Pinned announcement
                </p>
                <p className="mt-1 text-sm font-semibold text-announce-label">
                  {pinnedAnnouncement.authorName}
                </p>
                <p className="mt-2 text-sm leading-relaxed text-announce-text">
                  {pinnedAnnouncementSummary}
                </p>
                <p className="mt-3 text-xs text-announce-muted">
                  {formatDistanceToNow(pinnedAnnouncement.createdAt, { addSuffix: true })}
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-2xl">📌</span>
                <ChevronRightIcon className="w-4 h-4 text-announce-muted" />
              </div>
            </div>
          </div>
        </Link>
      )}

      {/* ── Season Ladder preview ─────────────────────────────────── */}
      <div className="bg-surface-card rounded-2xl shadow-sm border border-surface-overlay p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="font-semibold text-ink-title">Season Ladder</h3>
            <p className="text-xs text-ink-hint">{currentSeason} standings</p>
          </div>
          <Link href="/leaderboard" className="text-brand-600 text-sm font-medium">
            View all
          </Link>
        </div>
        {visibleStandings.length === 0 ? (
          <div className="flex items-center justify-center py-6 text-ink-hint">
            <div className="text-center">
              <div className="text-3xl mb-1">🏌️</div>
              <p className="text-sm">Leaderboard live after Round 1</p>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-surface-overlay">
            {visibleStandings.slice(0, 3).map((standing) => {
              const isMe = standing.memberId === appUser?.uid;
              return (
                <div
                  key={standing.id}
                  className="flex items-center justify-between py-2.5 text-sm"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-7 text-xs font-semibold text-ink-hint">
                      #{standing.displayCurrentRank}
                    </span>
                    <div className="min-w-0">
                      <p className={`font-medium truncate ${isMe ? "text-ink-action font-semibold" : "text-ink-title"}`}>
                        {standing.memberName}{isMe ? " (you)" : ""}
                      </p>
                      <p className="text-xs text-ink-hint">
                        {standing.roundsPlayed} round{standing.roundsPlayed === 1 ? "" : "s"}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`font-bold ${isMe ? "text-ink-action" : "text-ink-title"}`}>
                      {standing.totalPoints}
                    </p>
                    <p className="text-xs text-ink-hint">pts</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Local sub-components ───────────────────────────────────────────────────

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface-card rounded-xl border border-surface-overlay px-3 py-2.5 text-center shadow-sm">
      <p className="text-xs text-ink-hint">{label}</p>
      <p className="mt-0.5 text-xl font-bold text-ink-title">{value}</p>
    </div>
  );
}

function SeasonRecapCard({
  standings,
  season,
  myMemberId,
}: {
  standings: VisibleSeasonStanding[];
  season: number;
  myMemberId: string | null;
}) {
  const sorted = [...standings]
    .filter((s) => s.displayCurrentRank != null)
    .sort((a, b) => (a.displayCurrentRank ?? 99) - (b.displayCurrentRank ?? 99));

  const podiumMedals = ["🥇", "🥈", "🥉"];
  const top3 = sorted.slice(0, 3);
  const myStanding = myMemberId ? standings.find((s) => s.memberId === myMemberId) : null;
  const myRank = myStanding?.displayCurrentRank;
  const totalRounds = standings.reduce((max, s) => Math.max(max, s.roundsPlayed ?? 0), 0);
  const winner = top3[0];

  return (
    <div className="rounded-2xl border border-brand-200 bg-brand-50 p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-xs font-medium text-ink-action">Season {season}</p>
          <h3 className="font-bold text-ink-title text-lg">Season Wrapped 🏆</h3>
        </div>
        <span className="text-3xl">⛳</span>
      </div>

      {winner && (
        <p className="text-sm text-brand-800 mb-3">
          <span className="font-semibold">{winner.memberName}</span> won Season {season} with{" "}
          <span className="font-semibold">{winner.totalPoints} points</span>
          {totalRounds > 0 ? ` across ${totalRounds} rounds.` : "."}
        </p>
      )}

      <div className="space-y-2">
        {top3.map((s, i) => {
          const isMe = s.memberId === myMemberId;
          return (
            <div
              key={s.memberId}
              className={`flex items-center gap-3 rounded-xl px-3 py-2 ${
                isMe ? "bg-surface-muted" : "bg-surface-card"
              }`}
            >
              <span className="text-lg w-7 text-center">{podiumMedals[i]}</span>
              <span className={`flex-1 font-medium text-sm truncate ${isMe ? "text-brand-800" : "text-ink-title"}`}>
                {s.memberName}{isMe ? " (you)" : ""}
              </span>
              <span className="shrink-0 text-sm font-bold text-brand-700">{s.totalPoints} pts</span>
            </div>
          );
        })}
      </div>

      {myRank != null && myRank > 3 && myStanding && (
        <div className="mt-3 flex items-center gap-3 rounded-xl bg-surface-card px-3 py-2">
          <span className="text-sm font-semibold text-ink-hint w-7 text-center">#{myRank}</span>
          <span className="flex-1 font-medium text-sm text-ink-title truncate">
            {myStanding.memberName} (you)
          </span>
          <span className="shrink-0 text-sm font-bold text-brand-700">{myStanding.totalPoints} pts</span>
        </div>
      )}
    </div>
  );
}

// Mid-season standings snapshot shown between rounds (not a season result).
function RoundRecapCard({
  standings,
  season,
  roundNumber,
  myMemberId,
}: {
  standings: VisibleSeasonStanding[];
  season: number;
  roundNumber: number | null;
  myMemberId: string | null;
}) {
  const sorted = [...standings]
    .filter((s) => s.displayCurrentRank != null)
    .sort((a, b) => (a.displayCurrentRank ?? 99) - (b.displayCurrentRank ?? 99));

  const top3 = sorted.slice(0, 3);
  const myStanding = myMemberId ? standings.find((s) => s.memberId === myMemberId) : null;
  const myRank = myStanding?.displayCurrentRank;
  const totalRounds = standings.reduce((max, s) => Math.max(max, s.roundsPlayed ?? 0), 0);
  const leader = top3[0];

  return (
    <div className="rounded-2xl border border-surface-overlay bg-surface-card p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-xs font-medium text-ink-action">
            Season {season}{roundNumber != null ? ` · Round ${roundNumber} complete` : ""}
          </p>
          <h3 className="font-bold text-ink-title text-lg">Current Standings</h3>
        </div>
        <span className="text-3xl">⛳</span>
      </div>

      {leader && (
        <p className="text-sm text-ink-hint mb-3">
          <span className="font-semibold text-ink-title">{leader.memberName}</span> leads with{" "}
          <span className="font-semibold text-ink-title">{leader.totalPoints} points</span>
          {totalRounds > 0 ? ` after ${totalRounds} rounds.` : "."}
        </p>
      )}

      <div className="space-y-2">
        {top3.map((s) => {
          const isMe = s.memberId === myMemberId;
          return (
            <div
              key={s.memberId}
              className={`flex items-center gap-3 rounded-xl px-3 py-2 ${
                isMe ? "bg-brand-50" : "bg-surface-muted"
              }`}
            >
              <span className="text-sm font-bold text-ink-hint w-7 text-center">#{s.displayCurrentRank}</span>
              <span className={`flex-1 font-medium text-sm truncate ${isMe ? "text-brand-800" : "text-ink-title"}`}>
                {s.memberName}{isMe ? " (you)" : ""}
              </span>
              <span className="shrink-0 text-sm font-bold text-brand-700">{s.totalPoints} pts</span>
            </div>
          );
        })}
      </div>

      {myRank != null && myRank > 3 && myStanding && (
        <div className="mt-3 flex items-center gap-3 rounded-xl bg-surface-muted px-3 py-2">
          <span className="text-sm font-semibold text-ink-hint w-7 text-center">#{myRank}</span>
          <span className="flex-1 font-medium text-sm text-ink-title truncate">
            {myStanding.memberName} (you)
          </span>
          <span className="shrink-0 text-sm font-bold text-brand-700">{myStanding.totalPoints} pts</span>
        </div>
      )}
    </div>
  );
}
