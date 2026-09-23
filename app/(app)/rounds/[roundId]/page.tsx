"use client";

import { Fragment, useEffect, useState } from "react";
import { sidePrizeLabel } from "@/lib/sidePrizes";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { format, formatDistanceToNow } from "date-fns";
import {
  createFeedPost,
  getLiveRound,
  getActiveMembers,
  getResultsForRound,
  getRound,
  getRoundRsvp,
  getSideClaimsForRound,
  setSideClaim,
  setRoundRsvp,
  subscribeRoundRsvp,
  subscribeRoundRsvps,
  subscribeResultsForRound,
  subscribeRound,
  subscribeRoundLinkedPosts,
  subscribeScorecardsForRound,
  subscribeHoleScores,
  subscribeSideClaimsForRound,
} from "@/lib/firestore";
import { ChevronRightIcon } from "@/components/ui/icons";
import {
  getEffectiveSpecialHoles,
  getViewerHoles,
  withSeededCourseData,
} from "@/lib/courseData";
import { CourseCardPreview } from "@/components/CourseCardPreview";
import LiveStandingsCard from "@/components/rounds/LiveStandingsCard";
import { getRoundLabel, hasRoundScorecards } from "@/lib/roundDisplay";
import {
  formatTeeTime,
  getFirstTeeTimeLabel,
  getTeeTimeGroupLabel,
} from "@/lib/teeTimes";
import { useAuth } from "@/contexts/AuthContext";
import { useGroupData } from "@/contexts/GroupDataContext";
import { calculatePlayingHandicap } from "@/lib/scoring";
import { normaliseGroupSettings } from "@/lib/settings";
import { uploadFeedPostImages, validateImageFile } from "@/lib/storageUploads";
import { useLiveStandings } from "@/hooks/useLiveStandings";
import type {
  AppUser,
  Post,
  Results,
  Round,
  RoundRsvp,
  RoundStatus,
  SideClaim,
  SidePrizeType,
} from "@/types";

// ─── Section config ───────────────────────────────────────────────────────────
//
// To change what appears (and in what order) for a given round status, edit
// SECTIONS_BY_STATUS — no hunting through JSX needed.
// Each key maps to a renderer defined inside RoundDetailPage via a closure,
// so every renderer has natural access to all state and handlers.
// A renderer can still return null if its own data condition isn't met
// (e.g. tee times returns null when the round has no tee times).

type SectionKey =
  | "rsvp"
  | "liveScoring"
  | "liveStandings"
  | "results"
  | "historicalImport"
  | "courseInfo"
  | "courseCard"
  | "teeTimes"
  | "specialHoles"
  | "holeOverrides"
  | "notes"
  | "activity"
  | "adminLink";

const SECTIONS_BY_STATUS: Record<RoundStatus, SectionKey[]> = {
  // ── Upcoming ── RSVP first (action needed), tee times second (when am I playing), then course context
  upcoming: [
    "rsvp",
    "teeTimes",
    "courseInfo",
    "specialHoles",
    "holeOverrides",
    "notes",
    "activity",
  ],
  // ── Live ── Primary scoring CTA first, then standings, then course context
  live: [
    "liveScoring",
    "rsvp",
    "liveStandings",
    "courseInfo",
    "teeTimes",
    "specialHoles",
    "holeOverrides",
    "notes",
    "activity",
  ],
  // ── Completed ── Results lead; tee times / side-claim selectors are omitted
  // because results already surface side winners via SideResultsList.
  completed: [
    "results",
    "historicalImport",
    "courseInfo",
    "holeOverrides",
    "notes",
    "activity",
  ],
};

export default function RoundDetailPage() {
  const { roundId } = useParams<{ roundId: string }>();
  const router = useRouter();
  const [round, setRound] = useState<Round | null>(null);
  const [results, setResults] = useState<Results | null>(null);
  const [myRsvp, setMyRsvp] = useState<RoundRsvp | null>(null);
  const [rsvps, setRsvps] = useState<RoundRsvp[]>([]);
  const [members, setMembers] = useState<AppUser[]>([]);
  const [sideClaims, setSideClaims] = useState<SideClaim[]>([]);
  const [roundPosts, setRoundPosts] = useState<Post[]>([]);
  const [savingRsvp, setSavingRsvp] = useState(false);
  const [changingRsvp, setChangingRsvp] = useState(false);
  const [savingClaim, setSavingClaim] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showPostSheet, setShowPostSheet] = useState(false);
  const [postContent, setPostContent] = useState("");
  const [postingUpdate, setPostingUpdate] = useState(false);
  const [postUpdateError, setPostUpdateError] = useState("");
  const [postPhoto, setPostPhoto] = useState<File | null>(null);
  const [postPhotoPreview, setPostPhotoPreview] = useState<string | null>(null);
  const { appUser, canAccessAdmin } = useAuth();
  const { group, groupMembers } = useGroupData();

  useEffect(() => {
    if (roundId && appUser?.groupId) {
      setLoading(true);
      setError("");
      Promise.all([
        getRound(roundId),
        getResultsForRound(roundId),
        appUser.uid ? getRoundRsvp(roundId, appUser.uid) : Promise.resolve(null),
        getActiveMembers(appUser.groupId),
        getSideClaimsForRound(roundId),
      ])
        .then(([r, res, rsvp, activeMembers, claims]) => {
          setRound(r ? withSeededCourseData(r) : null);
          setResults(res);
          setMyRsvp(rsvp);
          setMembers(activeMembers);
          setSideClaims(claims);
          if (!r) {
            getLiveRound(appUser.groupId!)
              .then((live) => {
                if (live && live.id !== roundId) {
                  router.replace(`/rounds/${live.id}`);
                }
              })
              .catch((err) => {
                console.warn("Unable to recover missing round route", err);
              });
          }
        })
        .catch((err) => {
          console.error("Failed to load round detail", err);
          setRound(null);
          setResults(null);
          setError(
            err instanceof Error && err.message
              ? err.message
              : "Unable to load this round."
          );
        })
        .finally(() => setLoading(false));
    }
  }, [appUser?.groupId, appUser?.uid, roundId, router]);

  useEffect(() => {
    if (!roundId) return;
    return subscribeRound(
      roundId,
      (nextRound) => setRound(nextRound ? withSeededCourseData(nextRound) : null),
      (err) => console.warn("Unable to subscribe to round updates", err)
    );
  }, [roundId]);

  useEffect(() => {
    if (!roundId) return;
    return subscribeResultsForRound(
      roundId,
      setResults,
      (err) => console.warn("Unable to subscribe to results", err)
    );
  }, [roundId]);

  useEffect(() => {
    if (!roundId || !appUser?.uid) return;
    return subscribeRoundRsvp(
      roundId,
      appUser.uid,
      setMyRsvp,
      (err) => console.warn("Unable to subscribe to RSVP updates", err)
    );
  }, [appUser?.uid, roundId]);

  useEffect(() => {
    if (!roundId) return;
    return subscribeRoundRsvps(
      roundId,
      setRsvps,
      (err) => console.warn("Unable to subscribe to round RSVPs", err)
    );
  }, [roundId]);

  useEffect(() => {
    if (!roundId) return;
    return subscribeSideClaimsForRound(
      roundId,
      setSideClaims,
      (err) => console.warn("Unable to subscribe to side claims", err)
    );
  }, [roundId]);

  useEffect(() => {
    if (!roundId) return;
    return subscribeRoundLinkedPosts(
      roundId,
      setRoundPosts,
      {
        limitCount: 6,
        onError: (err) =>
          console.warn("Unable to subscribe to round-linked posts", err),
      }
    );
  }, [roundId]);

  // Live (unofficial) standings — shared with the scoring screen's quick view.
  const {
    liveCards,
    rankings,
    playedHolesByPlayerId,
    lastHolePointsByPlayerId,
    prevRankById,
    roundComplete,
  } = useLiveStandings({
    round,
    members,
    settings: group?.settings,
    subscribeScorecardsForRound,
    subscribeHoleScores,
  });

  if (loading) {
    return (
      <div className="px-4 py-6 animate-pulse space-y-4">
        <div className="h-8 bg-surface-overlay rounded w-2/3" />
        <div className="h-4 bg-surface-muted rounded w-1/2" />
        <div className="bg-surface-card rounded-2xl p-4 space-y-3">
          <div className="h-4 bg-surface-muted rounded" />
          <div className="h-4 bg-surface-muted rounded w-3/4" />
        </div>
      </div>
    );
  }

  if (!round) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-ink-hint">
        <div className="text-4xl mb-3">🚫</div>
        <p className="text-sm">
          {error ? "Could not load round." : "Round not found."}
        </p>
        {roundId && (
          <p className="mt-2 max-w-xs break-all text-center text-xs text-ink-muted">
            Tried round ID: {roundId}
          </p>
        )}
        {error && (
          <p className="mt-2 max-w-xs text-center text-xs text-ink-muted">
            {error}
          </p>
        )}
        <Link
          href="/reset-cache.html"
          className="mt-4 rounded-xl border border-surface-overlay bg-surface-card px-4 py-2 text-sm font-semibold text-ink-body"
        >
          Reset app cache
        </Link>
        <Link
          href="/rounds"
          className="mt-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white"
        >
          Back to rounds
        </Link>
      </div>
    );
  }

  const statusColor =
    round.status === "live"
      ? "bg-live-bg text-live-text"
      : round.status === "upcoming"
      ? "bg-upcoming-bg text-upcoming-text"
      : "bg-completed-bg text-completed-text";

  const statusLabel =
    round.status === "live" ? "● Live" : round.status === "upcoming" ? "Upcoming" : "Completed";

  const handleRsvp = async (status: "accepted" | "declined") => {
    if (!round || !appUser) return;
    setSavingRsvp(true);
    setMyRsvp((current) =>
      current
        ? { ...current, status, respondedAt: new Date(), updatedAt: new Date() }
        : {
            id: appUser.uid,
            roundId: round.id,
            groupId: round.groupId,
            memberId: appUser.uid,
            memberName: appUser.displayName,
            status,
            respondedAt: new Date(),
            createdAt: new Date(),
            updatedAt: new Date(),
          }
    );
    try {
      await setRoundRsvp({ round, member: appUser, status });
      setChangingRsvp(false);
    } finally {
      setSavingRsvp(false);
    }
  };
  const specialHoles = getEffectiveSpecialHoles(round);
  // ONE tee drives the card, the tee line and the playing HCP (same rule the
  // scorecard uses): admin assignment → ladies' tee for women → default.
  const { holes: viewerHoles, note: viewerNote, teeSet: viewerTeeSet } =
    getViewerHoles(round, appUser ?? null);
  const viewerTeeName = viewerTeeSet?.name ?? round.teeSetName;
  const viewerPar = viewerTeeSet?.par ?? round.coursePar;
  const viewerSlope = viewerTeeSet?.slopeRating ?? round.slopeRating;
  const viewerCR = viewerTeeSet?.courseRating ?? round.courseRating;
  const groupSettings = normaliseGroupSettings(group?.settings);
  const myMember = appUser ? groupMembers.find((m) => m.userId === appUser.uid) : null;
  const myPlayingHandicap =
    myMember != null && myMember.currentHandicap > 0
      ? calculatePlayingHandicap({
          handicap: myMember.currentHandicap,
          mode: groupSettings.handicapMode,
          slopeRating: viewerSlope,
          courseRating: viewerCR,
          coursePar: viewerPar,
          gender: appUser?.gender,
        })
      : null;
  const acceptedMemberIds = new Set(
    rsvps
      .filter((rsvp) => rsvp.status === "accepted")
      .map((rsvp) => rsvp.memberId)
  );
  const getTeeTimeLabel = (playerIds: string[], guestNames: string[]) => {
    const visiblePlayerIds =
      round.rsvpOpen || rsvps.length > 0
        ? playerIds.filter((playerId) => acceptedMemberIds.has(playerId))
        : playerIds;

    return (
      getTeeTimeGroupLabel(visiblePlayerIds, guestNames, members) ||
      "Group details TBC"
    );
  };
  const getClaim = (prizeType: SidePrizeType, holeNumber: number) =>
    sideClaims.find(
      (claim) =>
        claim.prizeType === prizeType && claim.holeNumber === holeNumber
    ) ?? null;
  const handleClaim = async (
    prizeType: SidePrizeType,
    holeNumber: number,
    winnerId: string
  ) => {
    if (!round || !appUser) return;
    const claimId = prizeType === "ntp" ? `ntp-${holeNumber}` : prizeType;
    setSavingClaim(claimId);
    try {
      await setSideClaim({
        round,
        prizeType,
        holeNumber,
        winnerId,
        updatedBy: appUser,
        members,
      });
    } finally {
      setSavingClaim("");
    }
  };

  const handlePostUpdate = async () => {
    if (!appUser?.groupId || (!postContent.trim() && !postPhoto)) return;
    setPostingUpdate(true);
    setPostUpdateError("");
    try {
      let photoUrls: string[] = [];
      if (postPhoto) {
        const uploads = await uploadFeedPostImages(appUser.groupId, appUser.uid, [postPhoto]);
        photoUrls = uploads.map((u) => u.url);
      }
      await createFeedPost({
        groupId: appUser.groupId,
        author: appUser,
        content: postContent,
        type: "round_linked",
        roundId: round?.id ?? null,
        photoUrls,
      });
      setPostContent("");
      setPostPhoto(null);
      setPostPhotoPreview(null);
      setPostUpdateError("");
      setShowPostSheet(false);
    } catch (err) {
      console.error("Failed to post round update", err);
      setPostUpdateError(
        err instanceof Error && err.message
          ? err.message
          : "Failed to post update. Please try again."
      );
    } finally {
      setPostingUpdate(false);
    }
  };

  // ─── Section renderers ─────────────────────────────────────────────────────
  //
  // Each renderer closes over all state/handlers in this component.
  // Returning null from a renderer skips the section silently.
  // The ORDER of sections is controlled by SECTIONS_BY_STATUS above —
  // not by the order of these definitions.

  const sections: Record<SectionKey, () => React.ReactNode> = {

    rsvp: () => {
      if (!round.rsvpOpen) return null;
      return (
        <RsvpCard
          myRsvp={myRsvp}
          rsvps={rsvps}
          members={members}
          saving={savingRsvp}
          changing={changingRsvp}
          onRespond={handleRsvp}
          onChangeResponse={() => setChangingRsvp(true)}
        />
      );
    },

    liveScoring: () => (
      <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
        <p className="font-semibold text-red-700 mb-1">Scoring is open</p>
        <p className="text-red-600 text-sm mb-3">Enter your scores hole by hole</p>
        <Link
          href={`/rounds/${round.id}/scorecard`}
          prefetch={false}
          className="block text-center w-full bg-red-500 text-white font-semibold py-3 rounded-xl"
        >
          Enter Scores →
        </Link>
      </div>
    ),

    liveStandings: () => {
      if (liveCards.length === 0) return null;
      return (
        <LiveStandingsCard
          rankings={rankings}
          format={round.format}
          playedHolesByPlayerId={playedHolesByPlayerId}
          lastHolePointsByPlayerId={lastHolePointsByPlayerId}
          prevRankById={prevRankById}
          roundComplete={roundComplete}
          currentUserId={appUser?.uid}
        />
      );
    },

    results: () => {
      if (!round.resultsPublished || !results) return null;
      return (
        <div className="bg-brand-50 border border-brand-200 rounded-2xl p-4 space-y-4">
          <div>
            <h2 className="font-semibold text-brand-900">Final Results</h2>
            <p className="text-xs text-brand-800 mt-1">
              Published {format(results.publishedAt, "EEE d MMM yyyy h:mm a")}
            </p>
          </div>
          <div className="space-y-1 text-sm text-ink-title">
            {results.rankings.map((ranking) => (
              <div
                key={ranking.playerId}
                className={`flex items-center justify-between rounded-xl px-2 py-1 ${
                  ranking.playerId === appUser?.uid ? "bg-white/70" : ""
                }`}
              >
                <div>
                  <span>#{ranking.rank} {ranking.playerName}</span>
                  {ranking.countbackDetail && (
                    <p className="text-xs text-brand-700">{ranking.countbackDetail}</p>
                  )}
                  {ranking.playerId === appUser?.uid && (
                    <span className="ml-2 text-xs font-semibold text-brand-700">You</span>
                  )}
                </div>
                <div className="text-right">
                  <p className="font-semibold">
                    {round.format === "stableford"
                      ? `${ranking.stablefordTotal} pts`
                      : `${ranking.grossTotal} strokes`}
                  </p>
                  <p className="text-xs text-brand-700">
                    {ranking.pointsEligible === false
                      ? ranking.pointsIneligibleReason ?? "Provisional - no ladder points yet"
                      : `${ranking.pointsAwarded} ladder pts`}
                  </p>
                </div>
              </div>
            ))}
          </div>
          <SideResultsList results={results} />
        </div>
      );
    },

    historicalImport: () => {
      if (hasRoundScorecards(round)) return null;
      return (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p className="font-semibold text-amber-900">Historical import</p>
          <p className="mt-1 text-sm text-amber-800">
            This round was imported as published results only. Hole-by-hole
            scorecards are not available.
          </p>
        </div>
      );
    },

    courseInfo: () => (
      <div className="bg-surface-card rounded-2xl shadow-sm border border-surface-overlay p-4 space-y-3">
        <h2 className="font-semibold text-ink-title">Course Info</h2>
        <div className="text-sm text-ink-body space-y-2">
          <p className="font-medium text-ink-title">{round.courseName}</p>
          {viewerTeeName && (
            <p className="text-xs text-ink-muted">
              <span className="font-medium text-ink-body">Your tee:</span>{" "}
              {viewerTeeName} · Par {viewerPar ?? "—"}
              {viewerSlope ? ` · Slope ${viewerSlope}` : ""}
              {viewerCR ? ` · CR ${viewerCR}` : ""}
            </p>
          )}
          {myPlayingHandicap != null && (
            <p className="text-xs text-ink-muted">
              Your playing HCP:{" "}
              <span className="font-semibold text-ink-title">{myPlayingHandicap}</span>
              {groupSettings.handicapMode === "slope_adjusted" && (
                <span className="ml-1 text-ink-hint">(slope adjusted)</span>
              )}
            </p>
          )}
          {round.courseSource && (
            <p className="text-xs text-ink-hint">
              Course data: {round.courseSource.provider}
            </p>
          )}
          <a
            href={`https://maps.google.com/?q=${encodeURIComponent(round.courseName)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-brand-600 hover:underline"
          >
            📍 Open in Maps
          </a>
        </div>
        {viewerHoles.length === 18 && (
          <CourseCardPreview
            embedded
            holes={viewerHoles}
            distanceUnit={appUser?.distanceUnit ?? "meters"}
            specialHoles={specialHoles}
            teeSetName={viewerTeeName ?? undefined}
            note={viewerNote ?? undefined}
          />
        )}
      </div>
    ),

    courseCard: () => {
      if (viewerHoles.length !== 18) return null;
      return (
        <CourseCardPreview
          holes={viewerHoles}
          distanceUnit={appUser?.distanceUnit ?? "meters"}
          specialHoles={specialHoles}
          teeSetName={viewerTeeName ?? undefined}
          note={viewerNote ?? undefined}
        />
      );
    },

    teeTimes: () => {
      if (round.teeTimes.length === 0) return null;
      return (
        <div className="bg-surface-card rounded-2xl shadow-sm border border-surface-overlay p-4">
          <h2 className="font-semibold text-ink-title mb-3">Groups</h2>
          <div className="divide-y divide-surface-overlay">
            {round.teeTimes.map((teeTime, groupIndex) => {
              const isMyGroup = appUser?.uid != null && teeTime.playerIds?.includes(appUser.uid);
              return (
                <div
                  key={teeTime.id}
                  className={`flex items-center justify-between py-2 px-2 -mx-2 rounded-lg text-sm ${
                    isMyGroup ? "bg-brand-50" : ""
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`font-semibold ${isMyGroup ? "text-brand-700" : "text-ink-title"}`}>
                      Group {groupIndex + 1}
                      <span className="ml-1.5 font-normal text-ink-muted">
                        {teeTime.time ? formatTeeTime(teeTime.time) : "TBC"}
                      </span>
                    </span>
                    {isMyGroup && (
                      <span className="rounded-full bg-brand-100 px-1.5 py-0.5 text-xs font-semibold text-brand-700">
                        you
                      </span>
                    )}
                  </div>
                  <span className={`text-right ${isMyGroup ? "text-brand-700" : "text-ink-muted"}`}>
                    {getTeeTimeLabel(teeTime.playerIds, teeTime.guestNames ?? [])}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      );
    },

    specialHoles: () => {
      const hasSpecial =
        specialHoles.ntp.length > 0 ||
        specialHoles.ld ||
        specialHoles.t2 ||
        specialHoles.t3;
      if (!hasSpecial) return null;
      // Before (and after) play, pickers can't be used — show a one-line summary.
      if (round.status !== "live" || round.resultsPublished) {
        // Set holes show their number; unset ones show "TBC" so players know
        // they're still to be announced rather than not running.
        const set = [
          specialHoles.ld ? `LD ${specialHoles.ld}` : null,
          specialHoles.t2 ? `T2 ${specialHoles.t2}` : null,
          specialHoles.t3 ? `T3 ${specialHoles.t3}` : null,
        ].filter(Boolean);
        const unset = [
          specialHoles.ld ? null : "LD",
          specialHoles.t2 ? null : "T2",
          specialHoles.t3 ? null : "T3",
        ].filter(Boolean);
        const extras = [
          ...set,
          ...(unset.length > 0 && round.status === "upcoming" ? [`${unset.join(" · ")} TBC`] : []),
        ];
        return (
          <div className="bg-surface-card rounded-2xl shadow-sm border border-surface-overlay px-4 py-3">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="font-semibold text-ink-title">Special Holes</h2>
              <p className="text-right text-sm text-ink-body">
                {specialHoles.ntp.length > 0 && (
                  <span>NTP {specialHoles.ntp.join(" · ")}</span>
                )}
                {extras.length > 0 && (
                  <span className="text-ink-muted">
                    {specialHoles.ntp.length > 0 ? "  |  " : ""}
                    {extras.join(" · ")}
                  </span>
                )}
              </p>
            </div>
            <p className="mt-1 text-xs text-ink-hint">Winners are claimed once the round is live.</p>
          </div>
        );
      }
      return (
        <div className="bg-surface-card rounded-2xl shadow-sm border border-surface-overlay p-4">
          <h2 className="font-semibold text-ink-title mb-3">Special Holes</h2>
          <div className="space-y-3">
            {specialHoles.ntp.map((holeNumber) => (
              <SideClaimSelect
                key={`ntp-${holeNumber}`}
                label={`NTP - Hole ${holeNumber}`}
                claim={getClaim("ntp", holeNumber)}
                members={members}
                disabled={round.status !== "live" || round.resultsPublished}
                saving={savingClaim === `ntp-${holeNumber}`}
                onChange={(winnerId) => handleClaim("ntp", holeNumber, winnerId)}
              />
            ))}
            {specialHoles.ld && (
              <SideClaimSelect
                label={sidePrizeLabel("ld", specialHoles.ld)}
                claim={getClaim("ld", specialHoles.ld)}
                members={members}
                disabled={round.status !== "live" || round.resultsPublished}
                saving={savingClaim === "ld"}
                onChange={(winnerId) => handleClaim("ld", specialHoles.ld!, winnerId)}
              />
            )}
            {specialHoles.t2 && (
              <SideClaimSelect
                label={sidePrizeLabel("t2", specialHoles.t2)}
                claim={getClaim("t2", specialHoles.t2)}
                members={members}
                disabled={round.status !== "live" || round.resultsPublished}
                saving={savingClaim === "t2"}
                onChange={(winnerId) => handleClaim("t2", specialHoles.t2!, winnerId)}
              />
            )}
            {specialHoles.t3 && (
              <SideClaimSelect
                label={sidePrizeLabel("t3", specialHoles.t3)}
                claim={getClaim("t3", specialHoles.t3)}
                members={members}
                disabled={round.status !== "live" || round.resultsPublished}
                saving={savingClaim === "t3"}
                onChange={(winnerId) => handleClaim("t3", specialHoles.t3!, winnerId)}
              />
            )}
          </div>
        </div>
      );
    },

    holeOverrides: () => {
      if (round.holeOverrides.length === 0) return null;
      return (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
          <h2 className="font-semibold text-amber-800 mb-2">⚠️ Course Updates</h2>
          {round.holeOverrides.map((o) => (
            <div key={o.holeNumber} className="text-sm text-amber-700">
              Hole {o.holeNumber}: Par changed from {o.originalPar} → {o.overridePar}
              {o.reason && <span className="text-amber-600"> ({o.reason})</span>}
            </div>
          ))}
        </div>
      );
    },

    notes: () => {
      if (!round.notes) return null;
      return (
        <div className="bg-surface-card rounded-2xl shadow-sm border border-surface-overlay p-4">
          <h2 className="font-semibold text-ink-title mb-2">Notes</h2>
          <p className="text-ink-body text-sm whitespace-pre-wrap">{round.notes}</p>
        </div>
      );
    },

    activity: () => (
      <div className="bg-surface-card rounded-2xl shadow-sm border border-surface-overlay p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-ink-title">Round activity</h2>
            <p className="mt-1 text-xs text-ink-muted">
              Updates and photos posted for this round.
            </p>
          </div>
          <button
            type="button"
            onClick={() => { setShowPostSheet(true); setPostUpdateError(""); }}
            className="shrink-0 rounded-xl bg-brand-600 px-3 py-2 text-sm font-semibold text-white"
          >
            Post update
          </button>
        </div>
        {roundPosts.length === 0 ? (
          <div className="rounded-xl border border-dashed border-surface-overlay bg-surface-muted px-4 py-6 text-center text-sm text-ink-hint">
            No round updates yet.
          </div>
        ) : (
          <div className="space-y-3">
            {roundPosts.map((post) => (
              <div key={post.id} className="rounded-xl border border-surface-overlay bg-surface-muted p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink-title">
                      {post.authorName}
                    </p>
                    <p className="text-xs text-ink-hint">
                      {formatDistanceToNow(post.createdAt, { addSuffix: true })}
                    </p>
                  </div>
                  <span className="rounded-full bg-surface-card px-2 py-0.5 text-xs font-medium text-ink-body">
                    {post.commentCount} replies
                  </span>
                </div>
                {post.content ? (
                  <p className="mt-2 text-sm leading-relaxed text-ink-body">
                    {post.content}
                  </p>
                ) : null}
                {post.photoUrls.length > 0 ? (
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {post.photoUrls.slice(0, 3).map((photoUrl) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={photoUrl}
                        src={photoUrl}
                        alt=""
                        className="aspect-square rounded-xl object-cover"
                      />
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>
    ),

    adminLink: () => {
      if (!canAccessAdmin) return null;
      return (
        <div className="bg-surface-card rounded-2xl shadow-sm border border-surface-overlay p-4">
          <h2 className="font-semibold text-ink-title mb-2">Admin</h2>
          <p className="text-xs text-ink-muted mb-2">
            Edit course details, tee times, and round status.
          </p>
          <Link
            href={`/admin/rounds/${round.id}`}
            className="inline-flex items-center gap-2 text-sm font-medium text-blue-700 hover:underline"
          >
            <span>Open round in admin</span>
            <ChevronRightIcon className="w-4 h-4" />
          </Link>
        </div>
      );
    },
  };

  return (
    <div className="px-4 py-6 space-y-4 pb-8 relative">

      {/* ── Fixed header — always shown ─────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${statusColor}`}>
            {statusLabel}
          </span>
          <span className="text-xs text-ink-hint">{getRoundLabel(round)} · {round.season}</span>
          {canAccessAdmin && (
            <Link
              href={`/admin/rounds/${round.id}`}
              aria-label="Edit round in admin"
              className="ml-auto inline-flex items-center gap-1 rounded-full border border-surface-overlay bg-surface-card px-3 py-1 text-xs font-semibold text-ink-body hover:bg-surface-muted"
            >
              <span aria-hidden>✎</span> Edit
            </Link>
          )}
        </div>
        <h1 className="text-2xl font-bold text-ink-title leading-tight">{round.courseName}</h1>
        <p className="text-ink-muted mt-1">
          {format(round.date, "EEEE d MMMM yyyy")}
          {getFirstTeeTimeLabel(round) ? ` · ${getFirstTeeTimeLabel(round)}` : ""}
        </p>
      </div>

      {/* ── Scoring format badge — always shown ─────────────────────────── */}
      <div className="flex gap-2">
        <span className={`text-sm font-semibold px-3 py-1 rounded-full border ${
          round.format === "stableford"
            ? "border-brand-500 bg-transparent text-brand-600"
            : "border-blue-400 bg-transparent text-blue-500"
        }`}>
          {round.format === "stableford" ? "🏌️ Stableford" : "📊 Stroke Play"}
        </span>
      </div>

      {/* ── Status-driven sections (order defined in SECTIONS_BY_STATUS) ── */}
      {SECTIONS_BY_STATUS[round.status].map((key) => {
        const node = sections[key]();
        if (!node) return null;
        return <Fragment key={key}>{node}</Fragment>;
      })}

      {/* ── Live scoring FAB ── only visible during live rounds ────────── */}
      {round.status === "live" && (
        <div className="fixed bottom-24 right-4 z-30">
          <Link
            href={`/rounds/${round.id}/scorecard`}
            prefetch={false}
            className="flex items-center gap-2 rounded-full bg-red-500 px-5 py-3 text-sm font-bold text-white shadow-lg active:bg-red-600"
          >
            <span className="inline-block w-2 h-2 rounded-full bg-white animate-pulse" />
            Enter Scores
          </Link>
        </div>
      )}

      {/* ── Post sheet — fixed overlay, outside the section flow ────────── */}
      {showPostSheet && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setShowPostSheet(false)}
          />
          <div className="relative bg-surface-card rounded-t-2xl p-4 space-y-3 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-ink-title">Post round update</h3>
              <button
                type="button"
                onClick={() => { setShowPostSheet(false); setPostPhoto(null); setPostPhotoPreview(null); }}
                className="text-ink-hint hover:text-ink-body transition-colors"
                aria-label="Close"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <textarea
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
              value={postContent}
              onChange={(event) => setPostContent(event.target.value)}
              placeholder="Share a moment from the round…"
              rows={3}
              className="w-full rounded-xl border border-surface-overlay bg-surface-muted px-3 py-2.5 text-sm text-ink-body placeholder:text-ink-hint focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
            />
            {/* Photo picker */}
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 cursor-pointer rounded-xl border border-surface-overlay bg-surface-muted px-3 py-2 text-xs font-semibold text-ink-body hover:bg-surface-overlay transition-colors">
                <svg className="w-4 h-4 text-ink-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                {postPhoto ? "Change photo" : "Add photo"}
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="sr-only"
                  onChange={(e) => {
                    const file = e.target.files?.[0] ?? null;
                    const err = validateImageFile(file);
                    if (err) { setPostUpdateError(err); return; }
                    setPostUpdateError("");
                    setPostPhoto(file);
                    if (file) {
                      const url = URL.createObjectURL(file);
                      setPostPhotoPreview(url);
                    }
                  }}
                />
              </label>
              {postPhotoPreview && (
                <div className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={postPhotoPreview} alt="Selected" className="h-12 w-12 rounded-lg object-cover border border-surface-overlay" />
                  <button
                    type="button"
                    onClick={() => { setPostPhoto(null); setPostPhotoPreview(null); }}
                    className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-ink-body text-white flex items-center justify-center text-xs leading-none"
                    aria-label="Remove photo"
                  >
                    ×
                  </button>
                </div>
              )}
            </div>
            {postUpdateError && (
              <p className="text-xs font-medium text-red-600">{postUpdateError}</p>
            )}
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => { setShowPostSheet(false); setPostPhoto(null); setPostPhotoPreview(null); }}
                className="rounded-xl border border-surface-overlay px-4 py-2 text-sm font-semibold text-ink-muted"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={(!postContent.trim() && !postPhoto) || postingUpdate}
                onClick={handlePostUpdate}
                className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {postingUpdate ? "Posting…" : "Post"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── RSVP Card ───────────────────────────────────────────────────────────────

function RsvpCard({
  myRsvp,
  rsvps,
  members,
  saving,
  changing,
  onRespond,
  onChangeResponse,
}: {
  myRsvp: RoundRsvp | null;
  rsvps: RoundRsvp[];
  members: AppUser[];
  saving: boolean;
  changing: boolean;
  onRespond: (status: "accepted" | "declined") => void;
  onChangeResponse: () => void;
}) {
  const accepted = rsvps.filter((r) => r.status === "accepted");
  const totalMembers = members.length;
  const hasResponded =
    myRsvp?.status === "accepted" || myRsvp?.status === "declined";
  const showButtons = !hasResponded || changing;

  // Names of accepted members, excluding current user (shown as "You")
  const attendeeNames = accepted.map((r) => r.memberName).slice(0, 6);

  if (showButtons) {
    return (
      <div className="bg-surface-card rounded-2xl shadow-sm border border-surface-overlay p-4 space-y-4">
        <div>
          <h2 className="font-semibold text-ink-title">Playing this round?</h2>
          <p className="text-xs text-ink-muted mt-1">
            Let the group know so tee-time groups can be arranged.
          </p>
        </div>

        {accepted.length > 0 && (
          <p className="text-xs text-ink-muted">
            <span className="font-semibold text-ink-body">{accepted.length}</span>
            {totalMembers > 0 ? ` of ${totalMembers}` : ""} members attending
          </p>
        )}

        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => onRespond("accepted")}
            disabled={saving}
            className="flex items-center justify-center gap-2 rounded-xl border-2 border-brand-600 bg-brand-600 py-3 text-sm font-bold text-white disabled:opacity-60 active:bg-brand-700"
          >
            {saving ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              "✓ I'm in"
            )}
          </button>
          <button
            type="button"
            onClick={() => onRespond("declined")}
            disabled={saving}
            className="flex items-center justify-center gap-2 rounded-xl border-2 border-surface-overlay bg-surface-card py-3 text-sm font-bold text-ink-body disabled:opacity-60 active:bg-surface-muted"
          >
            {saving ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-ink-hint border-t-transparent" />
            ) : (
              "✗ Can't make it"
            )}
          </button>
        </div>
      </div>
    );
  }

  // Confirmed response state
  if (myRsvp?.status === "accepted") {
    return (
      <div className="rounded-2xl border border-surface-selectedBorder bg-surface-selected p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-bold text-ink-title text-lg">✓ You&apos;re in!</p>
            <p className="text-xs text-ink-body mt-0.5">
              Your RSVP is confirmed.
            </p>
          </div>
          <button
            type="button"
            onClick={onChangeResponse}
            className="shrink-0 rounded-full border border-surface-selectedBorder bg-surface-card px-3 py-1 text-xs font-semibold text-ink-action"
          >
            Change
          </button>
        </div>

        {accepted.length > 0 && (
          <div className="rounded-xl bg-surface-card px-3 py-2.5 space-y-1.5">
            <p className="text-xs font-semibold text-ink-title">
              {accepted.length}{totalMembers > 0 ? ` of ${totalMembers}` : ""} members attending
            </p>
            <p className="text-xs text-ink-body leading-relaxed">
              {attendeeNames.join(", ")}
              {accepted.length > 6 ? ` +${accepted.length - 6} more` : ""}
            </p>
          </div>
        )}
      </div>
    );
  }

  // Declined state
  return (
    <div className="rounded-2xl border border-surface-overlay bg-surface-muted p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-bold text-ink-body text-lg">✗ Not attending</p>
          <p className="text-xs text-ink-muted mt-0.5">
            You&apos;ve declined this round.
          </p>
        </div>
        <button
          type="button"
          onClick={onChangeResponse}
          className="shrink-0 rounded-full border border-surface-overlay bg-surface-card px-3 py-1 text-xs font-semibold text-ink-body"
        >
          Change
        </button>
      </div>

      {accepted.length > 0 && (
        <div className="rounded-xl bg-surface-card/80 px-3 py-2.5">
          <p className="text-xs text-ink-muted">
            <span className="font-semibold text-ink-body">{accepted.length}</span>
            {totalMembers > 0 ? ` of ${totalMembers}` : ""} members attending
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Side Claims ─────────────────────────────────────────────────────────────

function SideClaimSelect({
  label,
  claim,
  members,
  disabled,
  saving,
  onChange,
}: {
  label: string;
  claim: SideClaim | null;
  members: AppUser[];
  disabled: boolean;
  saving: boolean;
  onChange: (winnerId: string) => void;
}) {
  return (
    <label className="block rounded-xl bg-surface-muted px-3 py-2">
      <span className="block text-sm font-medium text-ink-title">{label}</span>
      <span className="block text-xs text-ink-muted mb-1">
        Current holder: {claim?.winnerName ?? "Not set"}
      </span>
      <select
        value={claim?.winnerId ?? ""}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled || saving}
        className="w-full rounded-lg border border-surface-overlay bg-surface-card px-3 py-2 text-sm text-ink-title disabled:bg-surface-muted disabled:text-ink-hint"
      >
        <option value="">No winner selected</option>
        {members.map((member) => (
          <option key={member.uid} value={member.uid}>
            {member.displayName}
          </option>
        ))}
      </select>
    </label>
  );
}

function SideResultsList({ results }: { results: Results }) {
  const sideResults = [
    ...results.sideResults.ntp.map((result) => ({
      label: `NTP - Hole ${result.holeNumber}`,
      result,
    })),
    { label: sidePrizeLabel("ld", results.sideResults.ld.holeNumber), result: results.sideResults.ld },
    { label: sidePrizeLabel("t2", results.sideResults.t2.holeNumber), result: results.sideResults.t2 },
    { label: sidePrizeLabel("t3", results.sideResults.t3.holeNumber), result: results.sideResults.t3 },
  ].filter(({ result }) => result.holeNumber > 0);

  if (sideResults.length === 0) return null;

  return (
    <div className="border-t border-brand-200 pt-3 space-y-1 text-sm text-ink-title">
      <p className="font-semibold text-brand-900">Side Winners</p>
      {sideResults.map(({ label, result }) => (
        <div key={label} className="flex items-center justify-between">
          <span>{label}</span>
          <span className="font-semibold">
            {result.winnerName ?? "No winner recorded"}
          </span>
        </div>
      ))}
    </div>
  );
}
