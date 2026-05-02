"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { format, formatDistanceToNow } from "date-fns";
import { useAuth } from "@/contexts/AuthContext";
import { useGroupData } from "@/contexts/GroupDataContext";
import {
  subscribeRoundRsvp,
  subscribePinnedAnnouncement,
  setRoundRsvp,
} from "@/lib/firestore";
import { getVisibleSeasonStandings } from "@/lib/standingsDisplay";
import { getFirstTeeTimeLabel } from "@/lib/teeTimes";
import { getEffectiveSpecialHoles, getViewerHoles } from "@/lib/courseData";
import { CourseCardPreview } from "@/components/CourseCardPreview";
import { ChevronRightIcon } from "@/components/ui/icons";
import type { Post, Round, RoundRsvp } from "@/types";

export default function HomePage() {
  const { appUser } = useAuth();
  const {
    group,
    rounds,
    activeMembers,
    currentSeason,
    currentSeasonStandings,
    loading,
  } = useGroupData();

  const [nextRoundRsvp, setNextRoundRsvp] = useState<RoundRsvp | null>(null);
  const [pinnedAnnouncement, setPinnedAnnouncement] = useState<Post | null>(null);
  const [rsvpBusy, setRsvpBusy] = useState(false);

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
    if (!nextRound?.id || !appUser?.uid) {
      setNextRoundRsvp(null);
      return;
    }
    return subscribeRoundRsvp(
      nextRound.id,
      appUser.uid,
      (rsvp) => setNextRoundRsvp(rsvp),
      () => setNextRoundRsvp(null)
    );
  }, [appUser?.uid, nextRound?.id]);

  const visibleStandings = useMemo(
    () =>
      getVisibleSeasonStandings(
        currentSeasonStandings,
        new Set(activeMembers.map((m) => m.uid))
      ),
    [activeMembers, currentSeasonStandings]
  );

  // Current user's standing — for the personal stats strip
  const myStanding = useMemo(
    () => visibleStandings.find((s) => s.memberId === appUser?.uid) ?? null,
    [visibleStandings, appUser?.uid]
  );

  const firstName = appUser?.displayName?.split(" ")[0] || "there";
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
      {/* ── Greeting ─────────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-bold text-ink-title">
          Hey {firstName} 👋
        </h1>
        <p className="text-ink-muted text-sm mt-0.5">
          {group?.name ?? "Golf group"}
        </p>
      </div>

      {/* ── Personal stats strip ──────────────────────────────────── */}
      {/*
        Replaces the old 2×2 quick-link grid, which was a duplicate of the
        bottom nav. This strip shows information the nav can't show and
        provides a reason to check the home screen beyond navigation.
      */}
      {myStanding && (
        <div className="grid grid-cols-3 gap-2">
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
        </div>
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
                  className="py-2.5 text-center text-xs font-semibold text-white/90 hover:bg-red-600 active:bg-red-700 transition-colors"
                >
                  ✏️ Scorecard
                </Link>
                <Link
                  href={`/rounds/${liveRound.id}/my-card`}
                  prefetch={false}
                  className="py-2.5 text-center text-xs font-semibold text-white/90 hover:bg-red-600 active:bg-red-700 transition-colors"
                >
                  👁 My Card
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
          <p className="text-brand-100 text-xs font-semibold uppercase tracking-wide">Next Round</p>
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
                      <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                        nextRound.format === "stableford"
                          ? "bg-brand-100 text-brand-700"
                          : "bg-blue-100 text-blue-700"
                      }`}>
                        {nextRound.format === "stableford" ? "Stableford" : "Stroke Play"}
                      </span>
                    </div>
                  </div>
                  <ChevronRightIcon className="w-5 h-5 text-ink-hint mt-1" />
                </div>
              </Link>

              {/* ── Inline RSVP ───────────────────────────────────── */}
              {nextRound.rsvpOpen && (
                <div className="mt-4 border-t border-surface-overlay pt-3">
                  <p className="text-xs font-semibold text-ink-muted mb-2">Are you playing?</p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={rsvpBusy}
                      onClick={() => handleRsvp("accepted")}
                      className={`flex-1 py-2 rounded-xl text-xs font-semibold border transition-colors ${
                        nextRoundRsvp?.status === "accepted"
                          ? "bg-brand-600 border-brand-600 text-white"
                          : "bg-surface-muted border-surface-overlay text-ink-body hover:border-brand-400"
                      }`}
                    >
                      ✓ Going
                    </button>
                    <button
                      type="button"
                      disabled={rsvpBusy}
                      onClick={() => handleRsvp("declined")}
                      className={`flex-1 py-2 rounded-xl text-xs font-semibold border transition-colors ${
                        nextRoundRsvp?.status === "declined"
                          ? "bg-ink-muted border-ink-muted text-white"
                          : "bg-surface-muted border-surface-overlay text-ink-body hover:border-ink-muted"
                      }`}
                    >
                      ✕ Not going
                    </button>
                  </div>
                </div>
              )}
              {!nextRound.rsvpOpen && nextRoundRsvp && (
                <div className="mt-3 flex items-center gap-2">
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                    nextRoundRsvp.status === "accepted"
                      ? "bg-brand-100 text-brand-700"
                      : "bg-surface-muted text-ink-muted"
                  }`}>
                    {nextRoundRsvp.status === "accepted" ? "✓ You're going" : "✕ Not going"}
                  </span>
                </div>
              )}

              {/* Course card preview */}
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
        <Link href="/feed" prefetch={false}>
          <div className="rounded-2xl border border-announce-border bg-announce-bg p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-announce-muted">
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
              <div className="text-2xl">📌</div>
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
                  className={`flex items-center justify-between py-2.5 text-sm ${
                    isMe ? "text-brand-700" : ""
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-7 text-xs font-semibold text-ink-hint">
                      #{standing.displayCurrentRank}
                    </span>
                    <div className="min-w-0">
                      <p className={`font-medium truncate ${isMe ? "text-brand-700" : "text-ink-title"}`}>
                        {standing.memberName}{isMe ? " (you)" : ""}
                      </p>
                      <p className="text-xs text-ink-hint">
                        {standing.roundsPlayed} round{standing.roundsPlayed === 1 ? "" : "s"}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-brand-700">
                      {standing.totalPoints}
                    </p>
                    <p className="text-[11px] text-ink-hint">pts</p>
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
      <p className="mt-0.5 text-base font-bold text-ink-title">{value}</p>
    </div>
  );
}
