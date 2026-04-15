"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  getRound,
  getLiveRound,
  getMember,
  getActiveMembers,
  getScorecardForPlayer,
  getScorecardForMarker,
  createScorecard,
  getHoleScores,
  setHoleScore,
  updateScorecard,
} from "@/lib/firestore";
import { getFallbackCourseHoles } from "@/lib/courseData";
import { useAuth } from "@/contexts/AuthContext";
import type { Round, Scorecard, HoleScore, AppUser } from "@/types";
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
  const [playerToMarkId, setPlayerToMarkId] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingHole, setSavingHole] = useState<number | null>(null);
  const [signing, setSigning] = useState(false);
  const [reopening, setReopening] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!roundId || !appUser || !isActive) return;

    const load = async () => {
      setLoading(true);
      try {
        const [r, existing, activeMembers] = await Promise.all([
          getRound(roundId),
          getScorecardForMarker(roundId, appUser.uid),
          getActiveMembers(),
        ]);

        if (!r) {
          const live = await getLiveRound("fourplay").catch(() => null);
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
            : buildInitialHoles(r, playerMember?.currentHandicap ?? 0)
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
    setError("");
    setLoading(true);
    try {
      const existingPlayerCard = await getScorecardForPlayer(
        round.id,
        playerToMarkId
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
                  playerMember?.currentHandicap ?? existingPlayerCard.handicapAtTime
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

      const id = await createScorecard({
        roundId: round.id,
        groupId: appUser.groupId,
        playerId: playerToMarkId,
        markerId: appUser.uid,
        handicapAtTime: handicap,
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
      setHoles(buildInitialHoles(round, handicap));
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

    const courseHole = buildCourseLayout(round)[holeNumber - 1];
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
      await setHoleScore(scorecard.id, holeNumber, {
        par: courseHole.par,
        strokeIndex: courseHole.strokeIndex,
        distanceMeters: courseHole.distanceMeters,
        strokesReceived,
        grossScore,
        netScore,
        stablefordPoints,
        isNTP: round.specialHoles.ntp.includes(holeNumber),
        isLD: round.specialHoles.ld === holeNumber,
        isT2: round.specialHoles.t2 === holeNumber,
        isT3: round.specialHoles.t3 === holeNumber,
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

  const courseLayout = buildCourseLayout(round);

  const playerName =
    scorecard &&
    members.find((m) => m.uid === scorecard.playerId)?.displayName;
  const markerName = appUser?.displayName;

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
            Select yourself to start your own card, or choose another player if
            you are marking them today.
          </p>
          <select
            value={playerToMarkId}
            onChange={(e) => setPlayerToMarkId(e.target.value)}
            className="w-full px-4 py-3 rounded-xl border border-gray-200 text-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            <option value="">Select player</option>
            {members.map((m) => (
              <option key={m.uid} value={m.uid}>
                {m.uid === appUser?.uid
                  ? `${m.displayName} (my own card)`
                  : m.displayName}
              </option>
            ))}
          </select>
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
            {holesForNine(holes, courseLayout, 1, 9).map((h) => (
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
            {holesForNine(holes, courseLayout, 10, 18).map((h) => (
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

function buildCourseLayout(round?: Round | null): CourseHoleLite[] {
  const courseHoles =
    round?.courseHoles && round.courseHoles.length === 18
      ? round.courseHoles
      : getFallbackCourseHoles();

  return courseHoles.map((hole) => ({
    number: hole.number,
    par: hole.par,
    strokeIndex: hole.strokeIndex,
    distanceMeters: hole.distanceMeters,
  }));
}

function buildInitialHoles(round: Round, handicap: number): HoleScore[] {
  const layout = buildCourseLayout(round);
  return layout.map((h) => ({
    holeNumber: h.number,
    par: h.par,
    strokeIndex: h.strokeIndex,
    distanceMeters: h.distanceMeters,
    strokesReceived: calculateStrokesReceived(handicap, h.strokeIndex),
    grossScore: null,
    netScore: null,
    stablefordPoints: null,
    isNTP: round.specialHoles.ntp.includes(h.number),
    isLD: round.specialHoles.ld === h.number,
    isT2: round.specialHoles.t2 === h.number,
    isT3: round.specialHoles.t3 === h.number,
    savedAt: null,
  }));
}

function holesForNine(
  holes: HoleScore[],
  layout: CourseHoleLite[],
  start: number,
  end: number
): HoleScore[] {
  const byNumber: Record<number, HoleScore> = {};
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
            distanceMeters: base.distanceMeters ?? course.distanceMeters,
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
        isNTP: false,
        isLD: false,
        isT2: false,
        isT3: false,
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
            className="text-[10px] text-green-600 underline"
          >
            Edit
          </button>
        )}
      </div>
    </div>
  );
}
