"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { format } from "date-fns";
import {
  getLiveRound,
  getResultsForRound,
  getRound,
  getRoundRsvp,
  setRoundRsvp,
} from "@/lib/firestore";
import { withSeededCourseData } from "@/lib/courseData";
import { formatTeeTime, getFirstTeeTimeLabel } from "@/lib/teeTimes";
import { useAuth } from "@/contexts/AuthContext";
import type { Results, Round, RoundRsvp } from "@/types";

export default function RoundDetailPage() {
  const { roundId } = useParams<{ roundId: string }>();
  const router = useRouter();
  const [round, setRound] = useState<Round | null>(null);
  const [results, setResults] = useState<Results | null>(null);
  const [myRsvp, setMyRsvp] = useState<RoundRsvp | null>(null);
  const [savingRsvp, setSavingRsvp] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const { appUser, isAdmin } = useAuth();

  useEffect(() => {
    if (roundId) {
      setLoading(true);
      setError("");
      Promise.all([
        getRound(roundId),
        getResultsForRound(roundId),
        appUser?.uid ? getRoundRsvp(roundId, appUser.uid) : Promise.resolve(null),
      ])
        .then(([r, res, rsvp]) => {
          setRound(r ? withSeededCourseData(r) : null);
          setResults(res);
          setMyRsvp(rsvp);
          if (!r) {
            getLiveRound("fourplay")
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
  }, [appUser?.uid, roundId, router]);

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
    try {
      await setRoundRsvp({ round, member: appUser, status });
      const updated = await getRoundRsvp(round.id, appUser.uid);
      setMyRsvp(updated);
    } finally {
      setSavingRsvp(false);
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
          <span className="text-xs text-gray-400">Round {round.roundNumber} · {round.season}</span>
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
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-3">
          <div>
            <h2 className="font-semibold text-gray-800">Playing this round?</h2>
            <p className="text-xs text-gray-500 mt-1">
              Let the admin know so tee-time groups can be set.
            </p>
          </div>
          {myRsvp?.status && myRsvp.status !== "pending" && (
            <p className="text-xs font-medium text-green-700">
              RSVP saved: {myRsvp.status === "accepted" ? "Accepted" : "Declined"}
            </p>
          )}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => handleRsvp("accepted")}
              disabled={savingRsvp}
              className={`rounded-xl border py-2.5 text-sm font-semibold ${
                myRsvp?.status === "accepted"
                  ? "border-green-600 bg-green-600 text-white"
                  : "border-green-200 bg-green-50 text-green-700"
              }`}
            >
              Accept
            </button>
            <button
              type="button"
              onClick={() => handleRsvp("declined")}
              disabled={savingRsvp}
              className={`rounded-xl border py-2.5 text-sm font-semibold ${
                myRsvp?.status === "declined"
                  ? "border-gray-700 bg-gray-800 text-white"
                  : "border-gray-200 bg-white text-gray-600"
              }`}
            >
              Decline
            </button>
          </div>
        </div>
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
            {results.rankings.slice(0, 10).map((ranking) => (
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
                    {ranking.pointsAwarded} ladder pts
                  </p>
                </div>
              </div>
            ))}
          </div>
          <SideResultsList results={results} />
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
                  {teeTime.notes || "Group details TBC"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Special holes */}
      {(round.specialHoles.ntp.length > 0 ||
        round.specialHoles.ld ||
        round.specialHoles.t2 ||
        round.specialHoles.t3) && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
          <h2 className="font-semibold text-gray-800 mb-3">Special Holes</h2>
          <div className="space-y-2">
            {round.specialHoles.ntp.length > 0 && (
              <div className="flex items-center gap-3 bg-yellow-50 rounded-xl px-3 py-2">
                <span className="text-lg">🎯</span>
                <div>
                  <p className="text-sm font-medium text-gray-800">NTP</p>
                  <p className="text-xs text-gray-500">
                    Holes {round.specialHoles.ntp.join(", ")} (all par 3s)
                  </p>
                </div>
              </div>
            )}
            {round.specialHoles.ld && (
              <div className="flex items-center gap-3 bg-blue-50 rounded-xl px-3 py-2">
                <span className="text-lg">💪</span>
                <div>
                  <p className="text-sm font-medium text-gray-800">Longest Drive</p>
                  <p className="text-xs text-gray-500">Hole {round.specialHoles.ld}</p>
                </div>
              </div>
            )}
            {round.specialHoles.t2 && (
              <div className="flex items-center gap-3 bg-purple-50 rounded-xl px-3 py-2">
                <span className="text-lg">⭐</span>
                <div>
                  <p className="text-sm font-medium text-gray-800">T2</p>
                  <p className="text-xs text-gray-500">Hole {round.specialHoles.t2}</p>
                </div>
              </div>
            )}
            {round.specialHoles.t3 && (
              <div className="flex items-center gap-3 bg-orange-50 rounded-xl px-3 py-2">
                <span className="text-lg">⭐</span>
                <div>
                  <p className="text-sm font-medium text-gray-800">T3</p>
                  <p className="text-xs text-gray-500">Hole {round.specialHoles.t3}</p>
                </div>
              </div>
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

      {/* Admin quick link */}
      {isAdmin && (
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
