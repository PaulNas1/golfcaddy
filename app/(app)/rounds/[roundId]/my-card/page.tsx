"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { format } from "date-fns";
import { useAuth } from "@/contexts/AuthContext";
import { useGroupData } from "@/contexts/GroupDataContext";
import {
  getEffectiveCourseHoles,
  getEffectiveSpecialHoles,
  getFallbackCourseHoles,
} from "@/lib/courseData";
import { hasRoundScorecards } from "@/lib/roundDisplay";
import {
  getLiveRound,
  getScorecardForMarker,
  subscribeRound,
  subscribeScorecardForPlayer,
  subscribeHoleScores,
} from "@/lib/firestore";
import type { Round, Scorecard, HoleScore } from "@/types";

interface CourseHoleLite {
  number: number;
  par: number;
  strokeIndex: number;
  distanceMeters?: number;
}

export default function MyCardPage() {
  const { roundId } = useParams<{ roundId: string }>();
  const router = useRouter();
  const { appUser, isActive } = useAuth();
  const { activeMembers } = useGroupData();

  const [round, setRound] = useState<Round | null>(null);
  const [card, setCard] = useState<Scorecard | null>(null);
  const [markedCard, setMarkedCard] = useState<Scorecard | null>(null);
  const [holes, setHoles] = useState<HoleScore[]>([]);
  const [loading, setLoading] = useState(true);
  const redirectedRef = useRef(false);

  // Subscribe to the round in real-time
  useEffect(() => {
    if (!roundId || !appUser || !isActive) return;

    return subscribeRound(
      roundId,
      async (nextRound) => {
        if (nextRound) {
          setRound(nextRound);
          setLoading(false);
        } else if (!redirectedRef.current) {
          // Round not found — check if there's a different live round to redirect to
          redirectedRef.current = true;
          const live = await getLiveRound(appUser.groupId).catch(() => null);
          if (live && live.id !== roundId) {
            router.replace(`/rounds/${live.id}/my-card`);
          } else {
            setRound(null);
            setLoading(false);
          }
        }
      },
      (err) => {
        console.warn("Unable to subscribe to round", err);
        setLoading(false);
      }
    );
  }, [roundId, appUser, isActive, router]);

  // Subscribe to the player's own scorecard in real-time
  useEffect(() => {
    if (!roundId || !appUser || !isActive) return;

    return subscribeScorecardForPlayer(
      roundId,
      appUser.uid,
      (nextCard) => setCard(nextCard),
      {
        groupId: appUser.groupId,
        onError: (err) => console.warn("Unable to subscribe to player scorecard", err),
      }
    );
  }, [roundId, appUser, isActive]);

  // Fetch the card this player is marking (one-time, just for the link button)
  useEffect(() => {
    if (!roundId || !appUser || !isActive) return;
    let cancelled = false;
    getScorecardForMarker(roundId, appUser.uid, appUser.groupId)
      .then((mc) => { if (!cancelled) setMarkedCard(mc ?? null); })
      .catch(() => { if (!cancelled) setMarkedCard(null); });
    return () => { cancelled = true; };
  }, [roundId, appUser, isActive]);

  // Subscribe to hole scores when we have a card
  useEffect(() => {
    if (!card?.id) {
      setHoles([]);
      return;
    }

    return subscribeHoleScores(
      card.id,
      (nextHoles) => setHoles(nextHoles),
      (err) => console.warn("Unable to subscribe to hole scores", err)
    );
  }, [card?.id]);

  if (!isActive) {
    return (
      <div className="px-4 py-6 text-sm text-gray-500">
        You need an active membership to view your card.
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
        Round not found. Tried round ID: {roundId}
      </div>
    );
  }

  if (!hasRoundScorecards(round)) {
    return (
      <div className="px-4 py-6 space-y-4">
        <button
          onClick={() => router.back()}
          className="text-xs text-gray-500"
        >
          ← Back
        </button>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-semibold">No scorecard archive for this round</p>
          <p className="mt-1 text-amber-800">
            This historical round was imported from summary results only, so
            there is no hole-by-hole card to display.
          </p>
        </div>
      </div>
    );
  }

  const layout = buildCourseLayout(round, card);
  const markerName =
    card && activeMembers.find((m) => m.uid === card.markerId)?.displayName;
  const markedPlayerName =
    markedCard && activeMembers.find((m) => m.uid === markedCard.playerId)?.displayName;

  const frontNine = holesForNine(holes, layout, 1, 9, round);
  const backNine = holesForNine(holes, layout, 10, 18, round);

  return (
    <div className="px-4 py-6 space-y-4 pb-20">
      <button
        onClick={() => router.back()}
        className="text-xs text-gray-500 mb-1"
      >
        ← Back
      </button>

      <h1 className="text-2xl font-bold text-gray-800">
        My card · {round.courseName}
      </h1>
      <p className="text-gray-500 text-sm">
        {format(round.date, "EEEE d MMMM yyyy")}
      </p>

      {!card && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 text-sm text-gray-500">
          Your marker hasn&apos;t started your card yet. Once they do, you&apos;ll
          see it here.
        </div>
      )}

      {card && (
        <>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500 mb-0.5">Status</p>
              <p className="text-sm font-semibold text-gray-800">
                {card.status === "in_progress"
                  ? "In progress"
                  : card.status === "submitted"
                  ? "Submitted"
                  : "Locked by admin"}
              </p>
              <p className="text-[11px] text-gray-500 mt-1">
                Player:{" "}
                <span className="font-semibold text-gray-800">
                  {appUser?.displayName}
                </span>
                {markerName && <> · Marker: {markerName}</>}
              </p>
              <p className="text-[11px] text-gray-500 mt-1">
                Playing HCP:{" "}
                <span className="font-semibold text-gray-800">
                  {card.handicapAtTime}
                </span>
              </p>
              {markedCard && markedPlayerName && (
                <button
                  type="button"
                  onClick={() => router.push(`/rounds/${round.id}/scorecard`)}
                  className="mt-1 text-[11px] text-green-700 underline"
                >
                  Card you&apos;re marking: {markedPlayerName}
                </button>
              )}
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-500 mb-0.5">Totals</p>
              <p className="text-sm font-semibold text-gray-800">
                {round.format === "stableford"
                  ? card.totalStableford ?? "—"
                  : card.totalGross ?? "—"}
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
            {frontNine.map((h) => (
              <ReadOnlyHoleRow key={h.holeNumber} hole={h} />
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
            {backNine.map((h) => (
              <ReadOnlyHoleRow key={h.holeNumber} hole={h} />
            ))}
          </div>
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

  return courseHoles.map((hole) => ({
    number: hole.number,
    par: hole.par,
    strokeIndex: hole.strokeIndex,
    distanceMeters: hole.distanceMeters,
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

function ReadOnlyHoleRow({ hole }: { hole: HoleScore }) {
  const hasPoints = hole.stablefordPoints != null;
  const isScored = hole.grossScore != null;

  return (
    <div
      className={`grid grid-cols-5 gap-2 items-center py-1 border-b border-gray-50 last:border-0 rounded-lg px-1 -mx-1 ${
        isScored ? "bg-green-50" : ""
      }`}
    >
      <div className="text-sm font-medium text-gray-700">
        {hole.holeNumber}
        {hole.isNTP && (
          <span className="ml-1 text-[10px] text-yellow-600">NTP</span>
        )}
        {hole.isLD && (
          <span className="ml-1 text-[10px] text-blue-600">LD</span>
        )}
        {hole.isT2 && (
          <span className="ml-1 text-[10px] text-emerald-600">T2</span>
        )}
        {hole.isT3 && (
          <span className="ml-1 text-[10px] text-fuchsia-600">T3</span>
        )}
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
      <div className="text-sm text-gray-600">{hole.par}</div>
      <div className="text-sm text-gray-800">
        {hole.grossScore != null ? hole.grossScore : "—"}
      </div>
      <div className="text-sm text-gray-800">
        <span
          className={`inline-flex items-center justify-center min-w-[1.5rem] h-6 rounded-full text-xs px-2 ${
            hasPoints ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-400"
          }`}
        >
          {hasPoints ? hole.stablefordPoints : "—"}
        </span>
      </div>
    </div>
  );
}
