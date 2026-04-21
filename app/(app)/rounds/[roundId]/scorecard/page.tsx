"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  getRound,
  getLiveRound,
  getMember,
  getActiveMembers,
  getRoundRsvps,
  getScorecardForPlayer,
  getScorecardForMarker,
  createScorecard,
  getHoleScores,
  setHoleScore,
  subscribeHoleScores,
  subscribeRound,
  subscribeRoundRsvps,
  subscribeScorecardForMarker,
  updateScorecard,
} from "@/lib/firestore";
import {
  getEffectiveCourseHoles,
  getEffectiveSpecialHoles,
  getFallbackCourseHoles,
  getPlayerTeeSet,
} from "@/lib/courseData";
import { getEligibleScorecardMembers } from "@/lib/teeTimes";
import { useAuth } from "@/contexts/AuthContext";
import type { Round, Scorecard, HoleScore, AppUser, RoundRsvp } from "@/types";
import { calculateStrokesReceived, calculateStablefordPoints, aggregateTotals } from "@/lib/scoring";

interface CourseHoleLite {
  number: number;
  par: number;
  strokeIndex: number;
  distanceMeters?: number;
}

export default function ScorecardPage() {
  const { roundId } = useParams<{ roundId: string }>();
  const router = useRouter();
  const { appUser, isActive } = useAuth();

  const [round, setRound] = useState<Round | null>(null);
  const [scorecard, setScorecard] = useState<Scorecard | null>(null);
  const [holes, setHoles] = useState<HoleScore[]>([]);
  const [members, setMembers] = useState<AppUser[]>([]);
  const [rsvps, setRsvps] = useState<RoundRsvp[]>([]);
  const [playerToMarkId, setPlayerToMarkId] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingHole, setSavingHole] = useState<number | null>(null);
  const [signing, setSigning] = useState(false);
  const [reopening, setReopening] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!roundId || !appUser || !isActive) return;

    return subscribeRound(
      roundId,
      (nextRound) => {
        if (nextRound) {
          setRound(nextRound);
        }
      },
      (err) => console.warn("Unable to subscribe to round updates", err)
    );
  }, [appUser, isActive, roundId]);

  useEffect(() => {
    if (!roundId || !appUser || !isActive) return;

    const load = async () => {
      setLoading(true);
      try {
        const [r, existing, activeMembers, roundRsvps] = await Promise.all([
          getRound(roundId),
          getScorecardForMarker(roundId, appUser.uid, appUser.groupId),
          getActiveMembers(appUser.groupId),
          getRoundRsvps(roundId),
        ]);

        if (!r) {
          const live = await getLiveRound(appUser.groupId).catch(() => null);
          if (live && live.id !== roundId) {
            router.replace(`/rounds/${live.id}/scorecard`);
            return;
          }
          setError(`Round not found. Tried round ID: ${roundId}`);
          setLoading(false);
          return;
        }
        setRound(r);
        setMembers(
          activeMembers.some((member) => member.uid === appUser.uid)
            ? activeMembers
            : [appUser, ...activeMembers]
        );
        setRsvps(roundRsvps);

        if (!existing) {
          // No card yet — wait for user to pick who they are marking
          setScorecard(null);
          setHoles([]);
          setLoading(false);
          return;
        }

        setScorecard(existing);

        const playerMember = await getMember(existing.playerId);

        const existingHoles = await getHoleScores(existing.id);
        setHoles(
          existingHoles.length > 0
            ? existingHoles
            : buildInitialHoles(
                r,
                playerMember?.currentHandicap ?? 0,
                existing.playerId
              )
        );
      } catch {
        setError("Failed to load scorecard.");
        setRound(null);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [roundId, appUser, isActive, router]);

  useEffect(() => {
    if (!roundId || !appUser || !isActive) return;

    return subscribeScorecardForMarker(
      roundId,
      appUser.uid,
      (nextScorecard) => {
        setScorecard(nextScorecard);
        if (!nextScorecard) {
          setHoles([]);
        }
      },
      {
        groupId: appUser.groupId,
        onError: (err) => console.warn("Unable to subscribe to scorecard", err),
      }
    );
  }, [appUser, isActive, roundId]);

  useEffect(() => {
    if (!roundId || !appUser || !isActive) return;

    return subscribeRoundRsvps(
      roundId,
      setRsvps,
      (err) => console.warn("Unable to subscribe to RSVP updates", err)
    );
  }, [appUser, isActive, roundId]);

  useEffect(() => {
    if (!scorecard?.id) return;

    return subscribeHoleScores(
      scorecard.id,
      (nextHoles) => {
        if (nextHoles.length > 0) {
          setHoles(nextHoles);
        }
      },
      (err) => console.warn("Unable to subscribe to hole scores", err)
    );
  }, [scorecard?.id]);

  const canEdit = useMemo(
    () =>
      scorecard &&
      round?.status === "live" &&
      scorecard.status === "in_progress" &&
      scorecard.markerId === appUser?.uid,
    [scorecard, round, appUser]
  );

  const handleStartCard = async () => {
    if (!round || !appUser) return;
    if (round.status !== "live") {
      setError("Scoring is closed for this round.");
      return;
    }
    if (!playerToMarkId) {
      setError("Please select the player you are marking.");
      return;
    }
    const eligiblePlayers = getEligibleScorecardMembers(
      round,
      members,
      appUser.uid,
      getAcceptedMemberIds(round, rsvps)
    );
    if (!eligiblePlayers.some((member) => member.uid === playerToMarkId)) {
      setError("Please select a player from your tee-time group.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const existingPlayerCard = await getScorecardForPlayer(
        round.id,
        playerToMarkId,
        appUser.groupId
      );
      if (existingPlayerCard) {
        if (existingPlayerCard.markerId === appUser.uid) {
          setScorecard(existingPlayerCard);
          const playerMember = await getMember(existingPlayerCard.playerId);
          const existingHoles = await getHoleScores(existingPlayerCard.id);
          setHoles(
            existingHoles.length > 0
              ? existingHoles
              : buildInitialHoles(
                  round,
                  playerMember?.currentHandicap ??
                    existingPlayerCard.handicapAtTime,
                  existingPlayerCard.playerId
                )
          );
          setLoading(false);
          return;
        }

        const markerName =
          members.find((member) => member.uid === existingPlayerCard.markerId)
            ?.displayName ?? "another marker";
        setError(`That player already has a card started by ${markerName}.`);
        setLoading(false);
        return;
      }

      const playerMember = await getMember(playerToMarkId);
      const handicap = playerMember?.currentHandicap ?? 0;
      const playerTeeSet = getPlayerTeeSet(round, playerToMarkId);
      const playerCourseHoles = getEffectiveCourseHoles(round, playerToMarkId);
      const playerCoursePar =
        playerTeeSet?.par ??
        playerCourseHoles.reduce((total, hole) => total + hole.par, 0);

      const id = await createScorecard({
        roundId: round.id,
        groupId: appUser.groupId,
        playerId: playerToMarkId,
        markerId: appUser.uid,
        handicapAtTime: handicap,
        teeSetId: playerTeeSet?.id ?? round.teeSetId,
        teeSetName: playerTeeSet?.name ?? round.teeSetName,
        coursePar: playerCoursePar,
        courseRating: playerTeeSet?.courseRating ?? round.courseRating,
        slopeRating: playerTeeSet?.slopeRating ?? round.slopeRating,
        courseHoles: playerCourseHoles,
        status: "in_progress",
        submittedAt: null,
        signedOff: false,
        totalGross: null,
        totalStableford: null,
        adminEdited: false,
        adminEditedBy: null,
        adminEditedAt: null,
      });

      const card: Scorecard = {
        id,
        roundId: round.id,
        groupId: appUser.groupId,
        playerId: playerToMarkId,
        markerId: appUser.uid,
        handicapAtTime: handicap,
        teeSetId: playerTeeSet?.id ?? round.teeSetId,
        teeSetName: playerTeeSet?.name ?? round.teeSetName,
        coursePar: playerCoursePar,
        courseRating: playerTeeSet?.courseRating ?? round.courseRating,
        slopeRating: playerTeeSet?.slopeRating ?? round.slopeRating,
        courseHoles: playerCourseHoles,
        status: "in_progress",
        submittedAt: null,
        signedOff: false,
        totalGross: null,
        totalStableford: null,
        adminEdited: false,
        adminEditedBy: null,
        adminEditedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      setScorecard(card);
      setHoles(buildInitialHoles(round, handicap, playerToMarkId));
    } catch {
      setError("Failed to start scorecard. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleHoleChange = async (holeNumber: number, gross: string) => {
    if (!scorecard || !round || !canEdit) return;
    const grossScore = gross ? parseInt(gross, 10) : NaN;
    if (Number.isNaN(grossScore) || grossScore <= 0) {
      // allow clearing
      const updated = holes.map((h) =>
        h.holeNumber === holeNumber
          ? { ...h, grossScore: null, netScore: null, stablefordPoints: null }
          : h
      );
      setHoles(updated);
      await setHoleScore(scorecard.id, holeNumber, {
        ...updated.find((h) => h.holeNumber === holeNumber)!,
        grossScore: null,
        netScore: null,
        stablefordPoints: null,
      });
      await syncTotals(scorecard.id, updated, round.format);
      return;
    }

    const courseHole = buildCourseLayout(round, scorecard)[holeNumber - 1];
    const strokesReceived = calculateStrokesReceived(
      scorecard.handicapAtTime,
      courseHole.strokeIndex
    );
    const netScore = grossScore - strokesReceived;
    const stablefordPoints = calculateStablefordPoints(
      courseHole.par,
      grossScore,
      strokesReceived
    );

    const updated = holes.map((h) =>
      h.holeNumber === holeNumber
        ? {
            ...h,
            par: courseHole.par,
            strokeIndex: courseHole.strokeIndex,
            distanceMeters: courseHole.distanceMeters,
            strokesReceived,
            grossScore,
            netScore,
            stablefordPoints,
          }
        : h
    );
    setHoles(updated);

    setSavingHole(holeNumber);
    try {
      const roundSpecialHoles = getEffectiveSpecialHoles(round);
      await setHoleScore(scorecard.id, holeNumber, {
        par: courseHole.par,
        strokeIndex: courseHole.strokeIndex,
        distanceMeters: courseHole.distanceMeters,
        strokesReceived,
        grossScore,
        netScore,
        stablefordPoints,
        isNTP: roundSpecialHoles.ntp.includes(holeNumber),
        isLD: roundSpecialHoles.ld === holeNumber,
        isT2: roundSpecialHoles.t2 === holeNumber,
        isT3: roundSpecialHoles.t3 === holeNumber,
      });
      await syncTotals(scorecard.id, updated, round.format);
    } finally {
      setSavingHole(null);
    }
  };

  const handleStablefordOverride = async (
    holeNumber: number,
    points: string
  ) => {
    if (!scorecard || !round || !canEdit) return;
    const trimmed = points.trim();
    const value =
      trimmed === "" ? null : Number.isNaN(Number(trimmed)) ? null : parseInt(trimmed, 10);

    const updated = holes.map((h) =>
      h.holeNumber === holeNumber
        ? {
            ...h,
            stablefordPoints: value,
          }
        : h
    );
    setHoles(updated);

    const hole = updated.find((h) => h.holeNumber === holeNumber);
    if (!hole) return;

    await setHoleScore(scorecard.id, holeNumber, {
      par: hole.par,
      strokeIndex: hole.strokeIndex,
      distanceMeters: hole.distanceMeters,
      strokesReceived: hole.strokesReceived,
      grossScore: hole.grossScore,
      netScore: hole.netScore,
      stablefordPoints: hole.stablefordPoints,
      isNTP: hole.isNTP,
      isLD: hole.isLD,
      isT2: hole.isT2,
      isT3: hole.isT3,
    });
    await syncTotals(scorecard.id, updated, round.format);
  };

  const syncTotals = async (
    scorecardId: string,
    localHoles: HoleScore[],
    format: Round["format"]
  ) => {
    const { totalGross, totalStableford } = aggregateTotals(
      localHoles,
      format
    );
    await updateScorecard(scorecardId, {
      totalGross,
      totalStableford,
    });
    setScorecard((prev) =>
      prev
        ? {
            ...prev,
            totalGross,
            totalStableford,
          }
        : prev
    );
  };

  const handleSignOff = async () => {
    if (!scorecard || !round) return;
    if (round.status !== "live") {
      setError("Scoring is closed for this round.");
      return;
    }
    setSigning(true);
    setError("");
    try {
      await updateScorecard(scorecard.id, {
        status: "submitted",
        signedOff: true,
        submittedAt: new Date(),
      });
      setScorecard({
        ...scorecard,
        status: "submitted",
        signedOff: true,
        submittedAt: new Date(),
      });
    } catch {
      setError("Failed to submit card. Please try again.");
    } finally {
      setSigning(false);
    }
  };

  const handleReopen = async () => {
    if (!scorecard || !round) return;
    if (round.status !== "live") {
      setError("Scoring is closed for this round.");
      return;
    }
    setReopening(true);
    setError("");
    try {
      await updateScorecard(scorecard.id, {
        status: "in_progress",
        signedOff: false,
        submittedAt: null,
      });
      setScorecard({
        ...scorecard,
        status: "in_progress",
        signedOff: false,
        submittedAt: null,
      });
    } catch {
      setError("Failed to re-open card. Please try again.");
    } finally {
      setReopening(false);
    }
  };

  if (!isActive) {
    return (
      <div className="px-4 py-6 text-sm text-gray-500">
        You need an active membership to enter scores.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="px-4 py-6 animate-pulse space-y-4">
        <div className="h-8 bg-gray-200 rounded w-2/3" />
        <div className="h-4 bg-gray-100 rounded w-1/2" />
        <div className="bg-white rounded-2xl p-4 h-32 bg-gray-100" />
      </div>
    );
  }

  if (!round) {
    return (
      <div className="px-4 py-6 text-sm text-gray-500">
        Round not found.
      </div>
    );
  }

  const courseLayout = buildCourseLayout(round, scorecard);

  const playerName =
    scorecard &&
    members.find((m) => m.uid === scorecard.playerId)?.displayName;
  const markerName = appUser?.displayName;
  const eligibleMembers =
    round && appUser
      ? getEligibleScorecardMembers(
          round,
          members,
          appUser.uid,
          getAcceptedMemberIds(round, rsvps)
        )
      : members;
  const teeTimesWithPlayers = round.teeTimes.some(
    (teeTime) => teeTime.playerIds.length > 0
  );

  return (
    <div className="px-4 py-6 space-y-4 pb-20">
      <button
        onClick={() => router.back()}
        className="text-xs text-gray-500 mb-1"
      >
        ← Back to round
      </button>

      <h1 className="text-2xl font-bold text-gray-800">
        Scorecard · {round.courseName}
      </h1>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-700 text-sm">
          {error}
        </div>
      )}

      {!scorecard && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-4">
          <h2 className="font-semibold text-gray-800">Who are you marking?</h2>
          <p className="text-xs text-gray-500">
            Select an accepted player from your tee-time group. Guests are
            tee-group only and are not scored in GolfCaddy.
          </p>
          {eligibleMembers.length > 0 ? (
            <select
              value={playerToMarkId}
              onChange={(e) => setPlayerToMarkId(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 text-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              <option value="">Select player</option>
              {eligibleMembers.map((m) => (
                <option key={m.uid} value={m.uid}>
                  {m.uid === appUser?.uid
                    ? `${m.displayName} (my own card)`
                    : m.displayName}
                </option>
              ))}
            </select>
          ) : (
            <div className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700">
              {teeTimesWithPlayers
                ? "You are not assigned to a tee-time group with accepted players. Ask admin to update the groups."
                : "No accepted players are available for scorecards yet."}
            </div>
          )}
          {eligibleMembers.length > 0 && teeTimesWithPlayers && (
            <p className="text-[11px] text-gray-400">
              Showing accepted members assigned to your tee-time group.
            </p>
          )}
          <button
            type="button"
            onClick={handleStartCard}
            disabled={loading || !playerToMarkId}
            className="w-full bg-red-500 hover:bg-red-600 disabled:bg-red-300 text-white text-sm font-semibold py-3 rounded-xl transition-colors"
          >
            Start scorecard
          </button>
        </div>
      )}

      {scorecard && (
        <>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500 mb-0.5">
                Status
              </p>
              <p className="text-sm font-semibold text-gray-800">
                {scorecard.status === "in_progress"
                  ? "In progress"
                  : scorecard.status === "submitted"
                  ? "Submitted"
                  : "Locked by admin"}
              </p>
              <p className="text-[11px] text-gray-500 mt-1">
                Player:{" "}
                <span className="font-semibold text-gray-800">
                  {playerName ?? "—"}
                </span>
                {markerName && round && (
                  <>
                    {" · "}
                    <button
                      type="button"
                      onClick={() =>
                        router.push(`/rounds/${round.id}/my-card`)
                      }
                      className="underline text-green-700"
                    >
                      Marker: {markerName}
                    </button>
                  </>
                )}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-500 mb-0.5">Totals</p>
              <p className="text-sm font-semibold text-gray-800">
                {round.format === "stableford"
                  ? scorecard.totalStableford ?? "—"
                  : scorecard.totalGross ?? "—"}
              </p>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-3">
            <h2 className="font-semibold text-gray-800 mb-2">Front 9</h2>
            <div className="grid grid-cols-5 gap-2 text-xs text-gray-500 mb-1">
              <span>Hole</span>
              <span>Index</span>
              <span>Par</span>
              <span>Strokes</span>
              <span>Stableford</span>
            </div>
            {holesForNine(holes, courseLayout, 1, 9, round).map((h) => (
              <HoleRow
                key={h.holeNumber}
                hole={h}
                disabled={!canEdit}
                saving={savingHole === h.holeNumber}
                onStrokeChange={handleHoleChange}
                onStablefordOverride={handleStablefordOverride}
              />
            ))}
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-3">
            <h2 className="font-semibold text-gray-800 mb-2">Back 9</h2>
            <div className="grid grid-cols-5 gap-2 text-xs text-gray-500 mb-1">
              <span>Hole</span>
              <span>Index</span>
              <span>Par</span>
              <span>Strokes</span>
              <span>Stableford</span>
            </div>
            {holesForNine(holes, courseLayout, 10, 18, round).map((h) => (
              <HoleRow
                key={h.holeNumber}
                hole={h}
                disabled={!canEdit}
                saving={savingHole === h.holeNumber}
                onStrokeChange={handleHoleChange}
                onStablefordOverride={handleStablefordOverride}
              />
            ))}
          </div>

          {scorecard.status === "in_progress" && round.status === "live" && (
            <button
              type="button"
              onClick={handleSignOff}
              disabled={signing}
              className="w-full bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white font-semibold py-4 rounded-2xl text-base transition-colors"
            >
              {signing ? "Submitting card..." : "Sign & submit card"}
            </button>
          )}

          {scorecard.status === "in_progress" && round.status !== "live" && (
            <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4 text-sm text-gray-600">
              Scoring is closed for this round.
            </div>
          )}

          {scorecard.status !== "in_progress" && (
            <div className="space-y-2">
              <div className="bg-green-50 border border-green-200 rounded-2xl p-4 text-sm text-green-800">
                ✅ Card submitted.
              </div>
              {scorecard.status === "submitted" && round.status === "live" && (
                <button
                  type="button"
                  onClick={handleReopen}
                  disabled={reopening}
                  className="w-full bg-white border border-green-300 text-green-700 text-sm font-semibold py-2.5 rounded-2xl"
                >
                  {reopening ? "Re-opening..." : "Re-open card to edit"}
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function buildCourseLayout(
  round?: Round | null,
  scorecard?: Scorecard | null
): CourseHoleLite[] {
  const courseHoles =
    scorecard?.courseHoles && scorecard.courseHoles.length === 18
      ? scorecard.courseHoles
      : round
      ? getEffectiveCourseHoles(round, scorecard?.playerId)
      : getFallbackCourseHoles();

  return mapCourseHoles(courseHoles);
}

function mapCourseHoles(courseHoles: CourseHoleLite[]): CourseHoleLite[] {
  return courseHoles.map((hole) => ({
    number: hole.number,
    par: hole.par,
    strokeIndex: hole.strokeIndex,
    distanceMeters: hole.distanceMeters,
  }));
}

function getAcceptedMemberIds(round: Round, rsvps: RoundRsvp[]) {
  if (!round.rsvpOpen && rsvps.length === 0) return undefined;
  return rsvps
    .filter((rsvp) => rsvp.status === "accepted")
    .map((rsvp) => rsvp.memberId);
}

function buildInitialHoles(
  round: Round,
  handicap: number,
  playerId?: string
): HoleScore[] {
  const layout = mapCourseHoles(getEffectiveCourseHoles(round, playerId));
  const specialHoles = getEffectiveSpecialHoles(round);
  return layout.map((h) => ({
    holeNumber: h.number,
    par: h.par,
    strokeIndex: h.strokeIndex,
    distanceMeters: h.distanceMeters,
    strokesReceived: calculateStrokesReceived(handicap, h.strokeIndex),
    grossScore: null,
    netScore: null,
    stablefordPoints: null,
    isNTP: specialHoles.ntp.includes(h.number),
    isLD: specialHoles.ld === h.number,
    isT2: specialHoles.t2 === h.number,
    isT3: specialHoles.t3 === h.number,
    savedAt: null,
  }));
}

function holesForNine(
  holes: HoleScore[],
  layout: CourseHoleLite[],
  start: number,
  end: number,
  round: Round
): HoleScore[] {
  const byNumber: Record<number, HoleScore> = {};
  const specialHoles = getEffectiveSpecialHoles(round);
  holes.forEach((h) => {
    byNumber[h.holeNumber] = h;
  });
  const result: HoleScore[] = [];
  for (let n = start; n <= end; n++) {
    const base = byNumber[n];
    const course = layout[n - 1];
    result.push(
      base
        ? {
            ...base,
            par: course.par,
            strokeIndex: course.strokeIndex,
            distanceMeters: base.distanceMeters ?? course.distanceMeters,
            isNTP: specialHoles.ntp.includes(n),
            isLD: specialHoles.ld === n,
            isT2: specialHoles.t2 === n,
            isT3: specialHoles.t3 === n,
          }
        : ({
        holeNumber: n,
        par: course.par,
        strokeIndex: course.strokeIndex,
        distanceMeters: course.distanceMeters,
        strokesReceived: 0,
        grossScore: null,
        netScore: null,
        stablefordPoints: null,
        isNTP: specialHoles.ntp.includes(n),
        isLD: specialHoles.ld === n,
        isT2: specialHoles.t2 === n,
        isT3: specialHoles.t3 === n,
        savedAt: null,
      } as HoleScore)
    );
  }
  return result;
}

function HoleRow({
  hole,
  disabled,
  saving,
  onStrokeChange,
  onStablefordOverride,
}: {
  hole: HoleScore;
  disabled: boolean;
  saving: boolean;
  onStrokeChange: (holeNumber: number, gross: string) => void;
  onStablefordOverride: (holeNumber: number, points: string) => void;
}) {
  const hasPoints = hole.stablefordPoints != null;

  return (
    <div className="grid grid-cols-5 gap-2 items-center py-1 border-b border-gray-50 last:border-0">
      <div className="text-sm font-medium text-gray-700">
        {hole.holeNumber}
        {hole.isNTP && <span className="ml-1 text-[10px] text-yellow-600">NTP</span>}
        {hole.isLD && <span className="ml-1 text-[10px] text-blue-600">LD</span>}
        {hole.isT2 && <span className="ml-1 text-[10px] text-emerald-600">T2</span>}
        {hole.isT3 && <span className="ml-1 text-[10px] text-fuchsia-600">T3</span>}
        {hole.distanceMeters && (
          <div className="text-[10px] font-normal text-gray-400">
            {hole.distanceMeters}m
          </div>
        )}
      </div>
      <div className="text-xs text-gray-500 flex items-center gap-1">
        <span>{hole.strokeIndex}</span>
        {hole.strokesReceived > 0 && (
          <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-green-100 text-[9px] text-green-700">
            {hole.strokesReceived}
          </span>
        )}
      </div>
      <div className="text-sm text-gray-600">
        {hole.par}
        <span className="text-[10px] text-gray-400 ml-1">(M/W)</span>
      </div>
      <div>
        <input
          type="number"
          min={1}
          inputMode="numeric"
          disabled={disabled || saving}
          value={hole.grossScore ?? ""}
          onChange={(e) => onStrokeChange(hole.holeNumber, e.target.value)}
          className="w-full px-2 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-800 focus:outline-none focus:ring-1 focus:ring-green-500"
        />
      </div>
      <div className="text-sm text-gray-800 flex items-center justify-between gap-1">
        <span
          className={`inline-flex items-center justify-center min-w-[1.5rem] h-6 rounded-full text-xs px-2 ${
            hasPoints ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-400"
          }`}
        >
          {hasPoints ? hole.stablefordPoints : "—"}
        </span>
        {!disabled && (
          <button
            type="button"
            aria-label={`Edit Stableford points for hole ${hole.holeNumber}`}
            onClick={() => {
              const current =
                hole.stablefordPoints != null
                  ? String(hole.stablefordPoints)
                  : "";
              const next =
                typeof window !== "undefined"
                  ? window.prompt("Stableford points", current)
                  : null;
              if (next == null) return;
              onStablefordOverride(hole.holeNumber, next);
            }}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-green-600 hover:bg-green-50"
          >
            <PencilIcon className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}

function PencilIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16.862 4.487 19.5 7.125m-1.5-4.5a2.121 2.121 0 0 1 3 3L7.5 19.125 3 20.25l1.125-4.5L18 2.625Z"
      />
    </svg>
  );
}
