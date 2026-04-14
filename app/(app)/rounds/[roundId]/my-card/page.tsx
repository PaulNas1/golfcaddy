"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { format } from "date-fns";
import { useAuth } from "@/contexts/AuthContext";
import {
  getRound,
  getScorecardForPlayer,
  getScorecardForMarker,
  getHoleScores,
  getActiveMembers,
} from "@/lib/firestore";
import type { Round, Scorecard, HoleScore, AppUser } from "@/types";

interface CourseHoleLite {
  number: number;
  par: number;
  strokeIndex: number;
}

export default function MyCardPage() {
  const { roundId } = useParams<{ roundId: string }>();
  const router = useRouter();
  const { appUser, isActive } = useAuth();

  const [round, setRound] = useState<Round | null>(null);
  const [card, setCard] = useState<Scorecard | null>(null);
  const [markedCard, setMarkedCard] = useState<Scorecard | null>(null);
  const [holes, setHoles] = useState<HoleScore[]>([]);
  const [members, setMembers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!roundId || !appUser || !isActive) return;
    const load = async () => {
      setLoading(true);
      try {
        const [r, c, mCard, activeMembers] = await Promise.all([
          getRound(roundId),
          getScorecardForPlayer(roundId, appUser.uid),
          getScorecardForMarker(roundId, appUser.uid),
          getActiveMembers(),
        ]);
        if (!r) {
          setRound(null);
          setCard(null);
          setMarkedCard(null);
          setHoles([]);
        } else {
          setRound(r);
          setMembers(activeMembers);
          if (!c) {
            setCard(null);
            setMarkedCard(mCard ?? null);
            setHoles([]);
          } else {
            setCard(c);
            setMarkedCard(mCard ?? null);
            const hs = await getHoleScores(c.id);
            const layout = buildCourseLayout(r);
            setHoles(
              hs.length > 0
                ? hs
                : layout.map((h) => ({
                    holeNumber: h.number,
                    par: h.par,
                    strokeIndex: h.strokeIndex,
                    strokesReceived: 0,
                    grossScore: null,
                    netScore: null,
                    stablefordPoints: null,
                    isNTP: r.specialHoles.ntp.includes(h.number),
                    isLD: r.specialHoles.ld === h.number,
                    isT2: r.specialHoles.t2 === h.number,
                    isT3: r.specialHoles.t3 === h.number,
                    savedAt: null,
                  }))
            );
          }
        }
      } catch {
        setError("Failed to load your card.");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [roundId, appUser, isActive]);

  if (!isActive) {
    return (
      <div className="px-4 py-6 text-sm text-gray-500">
        You need an active membership to view your card.
      </div>
    );
  }

  if (loading && !round) {
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

  const layout = buildCourseLayout();
  const markerName =
    card &&
    members.find((m) => m.uid === card.markerId)?.displayName;

  const markedPlayerName =
    markedCard &&
    members.find((m) => m.uid === markedCard.playerId)?.displayName;

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

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-700 text-sm">
          {error}
        </div>
      )}

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

function buildCourseLayout(): CourseHoleLite[] {
  // Placeholder: until course data is wired in, assume par 4 and stroke index = hole number.
  return Array.from({ length: 18 }, (_, i) => ({
    number: i + 1,
    par: 4,
    strokeIndex: i + 1,
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
  holes.forEach((h) => {
    byNumber[h.holeNumber] = h;
  });
  const result: HoleScore[] = [];
  for (let n = start; n <= end; n++) {
    const base = byNumber[n];
    const course = layout[n - 1];
    result.push(
      base ?? ({
        holeNumber: n,
        par: course.par,
        strokeIndex: course.strokeIndex,
        strokesReceived: 0,
        grossScore: null,
        netScore: null,
        stablefordPoints: null,
        isNTP: round.specialHoles.ntp.includes(n),
        isLD: round.specialHoles.ld === n,
        isT2: round.specialHoles.t2 === n,
        isT3: round.specialHoles.t3 === n,
        savedAt: null,
      } as HoleScore)
    );
  }
  return result;
}

function ReadOnlyHoleRow({ hole }: { hole: HoleScore }) {
  const hasPoints = hole.stablefordPoints != null;

  return (
    <div className="grid grid-cols-5 gap-2 items-center py-1 border-b border-gray-50 last:border-0">
      <div className="text-sm font-medium text-gray-700">
        {hole.holeNumber}
        {hole.isNTP && (
          <span className="ml-1 text-[10px] text-yellow-600">NTP</span>
        )}
        {hole.isLD && (
          <span className="ml-1 text-[10px] text-blue-600">LD</span>
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
