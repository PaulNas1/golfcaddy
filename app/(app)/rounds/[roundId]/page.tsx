"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { format } from "date-fns";
import { getRound } from "@/lib/firestore";
import { useAuth } from "@/contexts/AuthContext";
import type { Round } from "@/types";

export default function RoundDetailPage() {
  const { roundId } = useParams<{ roundId: string }>();
  const [round, setRound] = useState<Round | null>(null);
  const [loading, setLoading] = useState(true);
  const { isAdmin } = useAuth();

  useEffect(() => {
    if (roundId) {
      getRound(roundId).then((r) => {
        setRound(r);
        setLoading(false);
      });
    }
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
        <p className="text-sm">Round not found.</p>
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
        <p className="text-gray-500 mt-1">{format(round.date, "EEEE d MMMM yyyy")}</p>
      </div>

      {/* Scoring format */}
      <div className="flex gap-2">
        <span className={`text-sm font-medium px-3 py-1.5 rounded-full ${
          round.format === "stableford" ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"
        }`}>
          {round.format === "stableford" ? "🏌️ Stableford" : "📊 Stroke Play"}
        </span>
      </div>

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
