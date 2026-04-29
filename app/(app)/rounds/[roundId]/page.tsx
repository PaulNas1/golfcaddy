"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { format, formatDistanceToNow } from "date-fns";
import {
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
  subscribeSideClaimsForRound,
} from "@/lib/firestore";
import {
  getEffectiveSpecialHoles,
  getViewerHoles,
  withSeededCourseData,
} from "@/lib/courseData";
import { CourseCardPreview } from "@/components/CourseCardPreview";
import { getRoundLabel, hasRoundScorecards } from "@/lib/roundDisplay";
import {
  formatTeeTime,
  getFirstTeeTimeLabel,
  getTeeTimeGroupLabel,
} from "@/lib/teeTimes";
import { useAuth } from "@/contexts/AuthContext";
import type {
  AppUser,
  Post,
  Results,
  Round,
  RoundRsvp,
  Scorecard,
  SideClaim,
  SidePrizeType,
} from "@/types";

export default function RoundDetailPage() {
  const { roundId } = useParams<{ roundId: string }>();
  const router = useRouter();
  const [round, setRound] = useState<Round | null>(null);
  const [results, setResults] = useState<Results | null>(null);
  const [myRsvp, setMyRsvp] = useState<RoundRsvp | null>(null);
  const [rsvps, setRsvps] = useState<RoundRsvp[]>([]);
  const [members, setMembers] = useState<AppUser[]>([]);
  const [sideClaims, setSideClaims] = useState<SideClaim[]>([]);
  const [liveCards, setLiveCards] = useState<Scorecard[]>([]);
  const [roundPosts, setRoundPosts] = useState<Post[]>([]);
  const [savingRsvp, setSavingRsvp] = useState(false);
  const [changingRsvp, setChangingRsvp] = useState(false);
  const [savingClaim, setSavingClaim] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const { appUser, canAccessAdmin } = useAuth();

  useEffect(() => {
    if (roundId) {
      setLoading(true);
      setError("");
      Promise.all([
        getRound(roundId),
        getResultsForRound(roundId),
        appUser?.uid ? getRoundRsvp(roundId, appUser.uid) : Promise.resolve(null),
        getActiveMembers(appUser?.groupId ?? "fourplay"),
        getSideClaimsForRound(roundId),
      ])
        .then(([r, res, rsvp, activeMembers, claims]) => {
          setRound(r ? withSeededCourseData(r) : null);
          setResults(res);
          setMyRsvp(rsvp);
          setMembers(activeMembers);
          setSideClaims(claims);
          if (!r) {
            getLiveRound(appUser?.groupId ?? "fourplay")
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
    if (!roundId || round?.status !== "live") {
      setLiveCards([]);
      return;
    }
    return subscribeScorecardsForRound(
      roundId,
      setLiveCards,
      (err) => console.warn("Unable to subscribe to live scorecards", err)
    );
  }, [roundId, round?.status]);

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

  if (loading) {
    return (
      <div className="px-4 py-6 animate-pulse space-y-4">
        <div className="h-8 bg-gray-200 rounded w-2/3" />
        <div className="h-4 bg-gray-100 rounded w-1/2" />
        <div className="bg-white rounded-2xl p-4 space-y-3">
          <div className="h-4 bg-gray-100 rounded" />
          <div className="h-4 bg-gray-100 rounded w-3/4" />
        </div>
      </div>
    );
  }

  if (!round) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-gray-400">
        <div className="text-4xl mb-3">🚫</div>
        <p className="text-sm">
          {error ? "Could not load round." : "Round not found."}
        </p>
        {roundId && (
          <p className="mt-2 max-w-xs break-all text-center text-xs text-gray-500">
            Tried round ID: {roundId}
          </p>
        )}
        {error && (
          <p className="mt-2 max-w-xs text-center text-xs text-gray-500">
            {error}
          </p>
        )}
        <Link
          href="/reset-cache.html"
          className="mt-4 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700"
        >
          Reset app cache
        </Link>
        <Link
          href="/rounds"
          className="mt-2 rounded-xl bg-green-600 px-4 py-2 text-sm font-semibold text-white"
        >
          Back to rounds
        </Link>
      </div>
    );
  }

  const statusColor =
    round.status === "live"
      ? "bg-red-100 text-red-700"
      : round.status === "upcoming"
      ? "bg-blue-100 text-blue-700"
      : "bg-gray-100 text-gray-600";

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
  const { holes: viewerHoles, note: viewerNote } = getViewerHoles(round, appUser ?? null);
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

  return (
    <div className="px-4 py-6 space-y-4 pb-8">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${statusColor}`}>
            {statusLabel}
          </span>
          <span className="text-xs text-gray-400">{getRoundLabel(round)} · {round.season}</span>
        </div>
        <h1 className="text-2xl font-bold text-gray-800 leading-tight">{round.courseName}</h1>
        <p className="text-gray-500 mt-1">
          {format(round.date, "EEEE d MMMM yyyy")}
          {getFirstTeeTimeLabel(round)
            ? ` · ${getFirstTeeTimeLabel(round)}`
            : ""}
        </p>
      </div>

      {/* Scoring format */}
      <div className="flex gap-2">
        <span className={`text-sm font-medium px-3 py-1.5 rounded-full ${
          round.format === "stableford" ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"
        }`}>
          {round.format === "stableford" ? "🏌️ Stableford" : "📊 Stroke Play"}
        </span>
      </div>


      {round.rsvpOpen && round.status !== "completed" && (
        <RsvpCard
          myRsvp={myRsvp}
          rsvps={rsvps}
          members={members}
          saving={savingRsvp}
          changing={changingRsvp}
          onRespond={handleRsvp}
          onChangeResponse={() => setChangingRsvp(true)}
        />
      )}

      {round.resultsPublished && results && (
        <div className="bg-green-50 border border-green-200 rounded-2xl p-4 space-y-4">
          <div>
            <h2 className="font-semibold text-green-900">Final Results</h2>
            <p className="text-xs text-green-800 mt-1">
              Published {format(results.publishedAt, "EEE d MMM yyyy h:mm a")}
            </p>
          </div>
          <div className="space-y-1 text-sm text-green-950">
            {results.rankings.map((ranking) => (
              <div
                key={ranking.playerId}
                className={`flex items-center justify-between rounded-xl px-2 py-1 ${
                  ranking.playerId === appUser?.uid ? "bg-white/70" : ""
                }`}
              >
                <div>
                  <span>
                    #{ranking.rank} {ranking.playerName}
                  </span>
                  {ranking.countbackDetail && (
                    <p className="text-[11px] text-green-700">
                      {ranking.countbackDetail}
                    </p>
                  )}
                  {ranking.playerId === appUser?.uid && (
                    <span className="ml-2 text-xs font-semibold text-green-700">
                      You
                    </span>
                  )}
                </div>
                <div className="text-right">
                  <p className="font-semibold">
                    {round.format === "stableford"
                      ? `${ranking.stablefordTotal} pts`
                      : `${ranking.grossTotal} strokes`}
                  </p>
                  <p className="text-[11px] text-green-700">
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
      )}

      {!hasRoundScorecards(round) && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p className="font-semibold text-amber-900">Historical import</p>
          <p className="mt-1 text-sm text-amber-800">
            This round was imported as published results only. Hole-by-hole
            scorecards are not available.
          </p>
        </div>
      )}

      {/* Live scoring button */}
      {round.status === "live" && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
          <p className="font-semibold text-red-700 mb-1">Scoring is open</p>
          <p className="text-red-600 text-sm mb-3">
            Enter your scores hole by hole
          </p>
          <a
            href={`/rounds/${round.id}/scorecard`}
            className="block text-center w-full bg-red-500 text-white font-semibold py-3 rounded-xl"
          >
            Enter Scores →
          </a>
        </div>
      )}

      {/* Live standings */}
      {round.status === "live" && liveCards.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-semibold text-gray-800">Live Standings</h2>
            <span className="text-[11px] font-medium text-gray-400 rounded-full bg-gray-50 px-2 py-0.5">
              Unofficial
            </span>
          </div>
          <div className="divide-y divide-gray-100">
            {liveCards
              .slice()
              .sort((a, b) => {
                if (round.format === "stableford") {
                  return (b.totalStableford ?? -Infinity) - (a.totalStableford ?? -Infinity);
                }
                return (a.totalGross ?? Infinity) - (b.totalGross ?? Infinity);
              })
              .map((card, idx) => {
                const member = members.find((m) => m.uid === card.playerId);
                const name = member?.displayName ?? `Player ${card.playerId.slice(0, 6)}`;
                const isMe = card.playerId === appUser?.uid;
                return (
                  <div
                    key={card.id}
                    className={`flex items-center justify-between py-2 text-sm ${isMe ? "font-semibold" : ""}`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-6 text-xs text-gray-400">#{idx + 1}</span>
                      <span className={isMe ? "text-green-700" : "text-gray-700"}>
                        {name}{isMe ? " (you)" : ""}
                      </span>
                    </div>
                    <span className={isMe ? "text-green-700" : "text-gray-800"}>
                      {round.format === "stableford"
                        ? card.totalStableford != null ? `${card.totalStableford} pts` : "—"
                        : card.totalGross != null ? String(card.totalGross) : "—"}
                    </span>
                  </div>
                );
              })}
          </div>
          <p className="text-[11px] text-gray-400">
            Scores update in real time. Final results are published by the admin after the round.
          </p>
        </div>
      )}

      {/* Course info */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-3">
        <h2 className="font-semibold text-gray-800">Course Info</h2>
        <div className="text-sm text-gray-600 space-y-2">
          <p className="font-medium text-gray-800">{round.courseName}</p>
          {round.teeSetName && (
            <p className="text-xs text-gray-500">
              {round.teeSetName} tees · Par {round.coursePar ?? "—"}
              {round.slopeRating ? ` · Slope ${round.slopeRating}` : ""}
            </p>
          )}
          {round.courseSource && (
            <p className="text-[11px] text-gray-400">
              Course data: {round.courseSource.provider}
            </p>
          )}
          <a
            href={`https://maps.google.com/?q=${encodeURIComponent(round.courseName)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-green-600 hover:underline"
          >
            📍 Open in Maps
          </a>
        </div>
      </div>

      {viewerHoles.length === 18 && (
        <CourseCardPreview
          holes={viewerHoles}
          distanceUnit={appUser?.distanceUnit ?? "meters"}
          specialHoles={specialHoles}
          teeSetName={round.teeSetName ?? undefined}
          note={viewerNote ?? undefined}
        />
      )}

      {round.teeTimes.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
          <h2 className="font-semibold text-gray-800 mb-3">Tee Times</h2>
          <div className="divide-y divide-gray-100">
            {round.teeTimes.map((teeTime) => (
              <div
                key={teeTime.id}
                className="flex items-center justify-between py-2 text-sm"
              >
                <span className="font-semibold text-gray-800">
                  {teeTime.time ? formatTeeTime(teeTime.time) : "TBC"}
                </span>
                <span className="text-gray-500 text-right">
                  {getTeeTimeLabel(teeTime.playerIds, teeTime.guestNames ?? [])}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Special holes */}
      {(specialHoles.ntp.length > 0 ||
        specialHoles.ld ||
        specialHoles.t2 ||
        specialHoles.t3) && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
          <h2 className="font-semibold text-gray-800 mb-3">Special Holes</h2>
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
                label={`Longest Drive - Hole ${specialHoles.ld}`}
                claim={getClaim("ld", specialHoles.ld)}
                members={members}
                disabled={round.status !== "live" || round.resultsPublished}
                saving={savingClaim === "ld"}
                onChange={(winnerId) => handleClaim("ld", specialHoles.ld!, winnerId)}
              />
            )}
            {specialHoles.t2 && (
              <SideClaimSelect
                label={`T2 - Hole ${specialHoles.t2}`}
                claim={getClaim("t2", specialHoles.t2)}
                members={members}
                disabled={round.status !== "live" || round.resultsPublished}
                saving={savingClaim === "t2"}
                onChange={(winnerId) => handleClaim("t2", specialHoles.t2!, winnerId)}
              />
            )}
            {specialHoles.t3 && (
              <SideClaimSelect
                label={`T3 - Hole ${specialHoles.t3}`}
                claim={getClaim("t3", specialHoles.t3)}
                members={members}
                disabled={round.status !== "live" || round.resultsPublished}
                saving={savingClaim === "t3"}
                onChange={(winnerId) => handleClaim("t3", specialHoles.t3!, winnerId)}
              />
            )}
          </div>
        </div>
      )}

      {/* Hole par overrides */}
      {round.holeOverrides.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
          <h2 className="font-semibold text-amber-800 mb-2">⚠️ Course Updates</h2>
          {round.holeOverrides.map((o) => (
            <div key={o.holeNumber} className="text-sm text-amber-700">
              Hole {o.holeNumber}: Par changed from {o.originalPar} → {o.overridePar}
              {o.reason && <span className="text-amber-600"> ({o.reason})</span>}
            </div>
          ))}
        </div>
      )}

      {/* Notes */}
      {round.notes && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
          <h2 className="font-semibold text-gray-800 mb-2">Notes</h2>
          <p className="text-gray-600 text-sm whitespace-pre-wrap">{round.notes}</p>
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-gray-800">Round activity</h2>
            <p className="mt-1 text-xs text-gray-500">
              Updates and photos posted for this round.
            </p>
          </div>
          <Link
            href={`/feed?roundId=${round.id}`}
            className="shrink-0 rounded-xl bg-green-600 px-3 py-2 text-sm font-semibold text-white"
          >
            Post update
          </Link>
        </div>
        {roundPosts.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-center text-sm text-gray-400">
            No round updates yet.
          </div>
        ) : (
          <div className="space-y-3">
            {roundPosts.map((post) => (
              <div key={post.id} className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-gray-800">
                      {post.authorName}
                    </p>
                    <p className="text-[11px] text-gray-400">
                      {formatDistanceToNow(post.createdAt, { addSuffix: true })}
                    </p>
                  </div>
                  <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-gray-600">
                    {post.commentCount} replies
                  </span>
                </div>
                {post.content ? (
                  <p className="mt-2 text-sm leading-relaxed text-gray-700">
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

      {/* Admin quick link */}
      {canAccessAdmin && (
        <div className="bg-white rounded-2xl shadow-sm border border-blue-100 p-4">
          <h2 className="font-semibold text-gray-800 mb-2">Admin</h2>
          <p className="text-xs text-gray-500 mb-2">
            Edit course details, tee times, and round status.
          </p>
          <Link
            href={`/admin/rounds/${round.id}`}
            className="inline-flex items-center gap-2 text-sm font-medium text-blue-700 hover:underline"
          >
            <span>Open round in admin</span>
            <span className="text-lg">↗</span>
          </Link>
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
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-4">
        <div>
          <h2 className="font-semibold text-gray-800">Playing this round?</h2>
          <p className="text-xs text-gray-500 mt-1">
            Let the group know so tee-time groups can be arranged.
          </p>
        </div>

        {accepted.length > 0 && (
          <p className="text-xs text-gray-500">
            <span className="font-semibold text-gray-700">{accepted.length}</span>
            {totalMembers > 0 ? ` of ${totalMembers}` : ""} members attending
          </p>
        )}

        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => onRespond("accepted")}
            disabled={saving}
            className="flex items-center justify-center gap-2 rounded-xl border-2 border-green-500 bg-green-500 py-3 text-sm font-bold text-white disabled:opacity-60 active:bg-green-600"
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
            className="flex items-center justify-center gap-2 rounded-xl border-2 border-gray-200 bg-white py-3 text-sm font-bold text-gray-600 disabled:opacity-60 active:bg-gray-50"
          >
            {saving ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-400 border-t-transparent" />
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
      <div className="rounded-2xl border border-green-200 bg-green-50 p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-bold text-green-800 text-lg">✓ You&apos;re in!</p>
            <p className="text-xs text-green-700 mt-0.5">
              Your RSVP is confirmed.
            </p>
          </div>
          <button
            type="button"
            onClick={onChangeResponse}
            className="shrink-0 rounded-full border border-green-300 bg-white px-3 py-1 text-xs font-semibold text-green-700"
          >
            Change
          </button>
        </div>

        {accepted.length > 0 && (
          <div className="rounded-xl bg-white/70 px-3 py-2.5 space-y-1.5">
            <p className="text-xs font-semibold text-green-800">
              {accepted.length}{totalMembers > 0 ? ` of ${totalMembers}` : ""} members attending
            </p>
            <p className="text-xs text-green-700 leading-relaxed">
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
    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-bold text-gray-700 text-lg">✗ Not attending</p>
          <p className="text-xs text-gray-500 mt-0.5">
            You&apos;ve declined this round.
          </p>
        </div>
        <button
          type="button"
          onClick={onChangeResponse}
          className="shrink-0 rounded-full border border-gray-300 bg-white px-3 py-1 text-xs font-semibold text-gray-600"
        >
          Change
        </button>
      </div>

      {accepted.length > 0 && (
        <div className="rounded-xl bg-white/80 px-3 py-2.5">
          <p className="text-xs text-gray-500">
            <span className="font-semibold text-gray-700">{accepted.length}</span>
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
    <label className="block rounded-xl bg-gray-50 px-3 py-2">
      <span className="block text-sm font-medium text-gray-800">{label}</span>
      <span className="block text-[11px] text-gray-500 mb-1">
        Current holder: {claim?.winnerName ?? "Not set"}
      </span>
      <select
        value={claim?.winnerId ?? ""}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled || saving}
        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 disabled:bg-gray-100 disabled:text-gray-400"
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
    { label: `Longest Drive - Hole ${results.sideResults.ld.holeNumber}`, result: results.sideResults.ld },
    { label: `T2 - Hole ${results.sideResults.t2.holeNumber}`, result: results.sideResults.t2 },
    { label: `T3 - Hole ${results.sideResults.t3.holeNumber}`, result: results.sideResults.t3 },
  ].filter(({ result }) => result.holeNumber > 0);

  if (sideResults.length === 0) return null;

  return (
    <div className="border-t border-green-200 pt-3 space-y-1 text-sm text-green-950">
      <p className="font-semibold text-green-900">Side Winners</p>
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
