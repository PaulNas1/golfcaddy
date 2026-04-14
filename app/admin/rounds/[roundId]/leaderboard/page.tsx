"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { format } from "date-fns";
import {
  getRound,
  getScorecardsForRound,
  updateRound,
  getActiveMembers,
  updateScorecard,
} from "@/lib/firestore";
import type { Round, Scorecard, AppUser } from "@/types";

export default function AdminRoundLeaderboardPage() {
  const { roundId } = useParams<{ roundId: string }>();
  const [round, setRound] = useState<Round | null>(null);
  const [cards, setCards] = useState<Scorecard[]>([]);
  const [members, setMembers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!roundId) return;
    const load = async () => {
      setLoading(true);
      try {
        const [r, activeMembers] = await Promise.all([
          getRound(roundId),
          getActiveMembers(),
        ]);
        if (!r) {
          setRound(null);
          setCards([]);
          setMembers([]);
        } else {
          setRound(r);
          const c = await getScorecardsForRound(r.id);
          setCards(c);
          setMembers(activeMembers);
        }
      } catch {
        setError("Failed to load leaderboard.");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [roundId]);

  const sorted = cards
    .slice()
    .filter((c) =>
      round?.format === "stableford"
        ? c.totalStableford != null
        : c.totalGross != null
    )
    .sort((a, b) => {
      if (!round) return 0;
      if (round.format === "stableford") {
        const as = a.totalStableford ?? -Infinity;
        const bs = b.totalStableford ?? -Infinity;
        return bs - as; // higher is better
      }
      const ag = a.totalGross ?? Infinity;
      const bg = b.totalGross ?? Infinity;
      return ag - bg; // lower is better
    });

  const handlePublish = async () => {
    if (!round) return;
    setPublishing(true);
    setError("");
    try {
      await updateRound(round.id, {
        resultsPublished: true,
        resultsPublishedAt: new Date(),
      });
      setRound({
        ...round,
        resultsPublished: true,
        resultsPublishedAt: new Date(),
      });
    } catch {
      setError("Failed to publish results. Please try again.");
    } finally {
      setPublishing(false);
    }
  };

  const handleReopenCard = async (cardId: string) => {
    if (!round) return;
    try {
      await updateScorecard(cardId, {
        status: "in_progress",
        signedOff: false,
        submittedAt: null,
      });
      setCards((prev) =>
        prev.map((c) =>
          c.id === cardId
            ? { ...c, status: "in_progress", signedOff: false, submittedAt: null }
            : c
        )
      );
    } catch {
      setError("Failed to re-open card. Please try again.");
    }
  };

  if (loading && !round) {
    return (
      <div className="space-y-4">
        <div className="h-8 bg-gray-200 rounded w-2/3 animate-pulse" />
        <div className="bg-white rounded-2xl p-4 h-32 bg-gray-100 animate-pulse" />
      </div>
    );
  }

  if (!round) {
    return (
      <div className="text-gray-400 text-sm">
        Round not found.
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-8">
      <div>
        <p className="text-xs text-gray-500 mb-1">
          Round {round.roundNumber} · {round.season}
        </p>
        <h1 className="text-xl font-bold text-gray-800">
          Live Leaderboard
        </h1>
        <p className="text-gray-500 text-sm">
          {round.courseName} · {format(round.date, "EEE d MMM yyyy")}
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-700 text-sm">
          {error}
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-gray-800 text-sm">
            {sorted.length === 0
              ? "No completed cards yet"
              : "Top 10 players"}
          </h2>
          <span className="text-xs text-gray-400">
            Format:{" "}
            {round.format === "stableford" ? "Stableford" : "Stroke"}
          </span>
        </div>

        {sorted.length === 0 ? (
          <p className="text-xs text-gray-400">
            Once players submit scores, they&apos;ll appear here.
          </p>
        ) : (
          <div className="divide-y divide-gray-100">
            {sorted.slice(0, 10).map((c, idx) => (
              <div
                key={c.id}
                className="flex items-center justify-between py-2 text-sm"
              >
                {(() => {
                  const m = members.find((u) => u.uid === c.playerId);
                  const name =
                    m?.displayName ?? `Player ${c.playerId.slice(0, 6)}`;
                  return (
                    <>
                      <div className="flex items-center gap-2">
                        <span className="w-6 text-xs text-gray-400">
                          #{idx + 1}
                        </span>
                        <span className="text-gray-700">{name}</span>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-gray-800">
                          {round.format === "stableford"
                            ? c.totalStableford
                            : c.totalGross}
                        </p>
                        <p className="text-[11px] text-gray-400">
                          Hcp {c.handicapAtTime}
                        </p>
                        {c.status !== "in_progress" && (
                          <button
                            type="button"
                            onClick={() => handleReopenCard(c.id)}
                            className="mt-1 text-[11px] text-green-700 underline"
                          >
                            Re-open card
                          </button>
                        )}
                      </div>
                    </>
                  );
                })()}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-2">
        <h2 className="font-semibold text-gray-800 text-sm">Results</h2>
        <p className="text-xs text-gray-500">
          Publishing will mark results as official and make the leaderboard visible to players in the next stage.
        </p>
        <button
          type="button"
          onClick={handlePublish}
          disabled={publishing || round.resultsPublished}
          className="w-full bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors"
        >
          {round.resultsPublished
            ? "Results published"
            : publishing
            ? "Publishing..."
            : "Publish results"}
        </button>
      </div>
    </div>
  );
}
