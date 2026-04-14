"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { format } from "date-fns";
import {
  getRound,
  getScorecardsForRound,
  getActiveMembers,
  updateScorecard,
  getResultsForRound,
  publishRoundResultsWithStage3,
} from "@/lib/firestore";
import { useAuth } from "@/contexts/AuthContext";
import type { Round, Scorecard, AppUser, Results, SideResult, PlayerRanking } from "@/types";

export default function AdminRoundLeaderboardPage() {
  const { roundId } = useParams<{ roundId: string }>();
  const { appUser } = useAuth();
  const [round, setRound] = useState<Round | null>(null);
  const [cards, setCards] = useState<Scorecard[]>([]);
  const [members, setMembers] = useState<AppUser[]>([]);
  const [results, setResults] = useState<Results | null>(null);
  const [sideWinnerIds, setSideWinnerIds] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!roundId) return;
    const load = async () => {
      setLoading(true);
      try {
        const [r, activeMembers, existingResults] = await Promise.all([
          getRound(roundId),
          getActiveMembers(),
          getResultsForRound(roundId),
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
          setResults(existingResults);
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

  const getPlayerName = (playerId: string) =>
    members.find((u) => u.uid === playerId)?.displayName ??
    `Player ${playerId.slice(0, 6)}`;

  const playerOptions = cards
    .map((card) => ({
      id: card.playerId,
      name: getPlayerName(card.playerId),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const buildRankings = (): PlayerRanking[] => {
    const pointsByRank = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
    let previousValue: number | null = null;
    let previousRank = 0;

    return sorted.map((card, index) => {
      const scoreValue =
        round?.format === "stableford"
          ? card.totalStableford ?? 0
          : card.totalGross ?? 0;
      const rank =
        previousValue === scoreValue ? previousRank : index + 1;

      previousValue = scoreValue;
      previousRank = rank;

      return {
        rank,
        playerId: card.playerId,
        playerName: getPlayerName(card.playerId),
        grossTotal: card.totalGross ?? 0,
        stablefordTotal: card.totalStableford ?? 0,
        handicap: card.handicapAtTime,
        pointsAwarded: pointsByRank[rank - 1] ?? 0,
        countbackDetail: null,
      };
    });
  };

  const buildSideResult = (
    key: string,
    holeNumber: number | null
  ): SideResult => {
    const winnerId = sideWinnerIds[key] || null;
    return {
      holeNumber: holeNumber ?? 0,
      winnerId,
      winnerName: winnerId ? getPlayerName(winnerId) : null,
    };
  };

  const handlePublish = async () => {
    if (!round) return;
    setPublishing(true);
    setError("");
    try {
      const publishedAt = new Date();
      const officialResults: Omit<Results, "id" | "createdAt"> = {
        roundId: round.id,
        groupId: round.groupId,
        season: round.season,
        publishedAt,
        rankings: buildRankings(),
        sideResults: {
          ntp: round.specialHoles.ntp.map((holeNumber) =>
            buildSideResult(`ntp-${holeNumber}`, holeNumber)
          ),
          ld: buildSideResult("ld", round.specialHoles.ld),
          t2: buildSideResult("t2", round.specialHoles.t2),
          t3: buildSideResult("t3", round.specialHoles.t3),
        },
      };

      const published = await publishRoundResultsWithStage3({
        round,
        results: officialResults,
        scorecards: cards,
        activeUsers: members,
        publishedBy: appUser,
      });
      setRound({
        ...round,
        status: "completed",
        resultsPublished: true,
        resultsPublishedAt: publishedAt,
      });
      setResults(published.officialResults);
      setCards((prev) =>
        prev.map((card) => ({
          ...card,
          status: "admin_locked",
          signedOff: true,
        }))
      );
    } catch {
      setError("Failed to publish results. Please try again.");
    } finally {
      setPublishing(false);
    }
  };

  const updateSideWinner = (key: string, winnerId: string) => {
    setSideWinnerIds((prev) => ({
      ...prev,
      [key]: winnerId,
    }));
  };

  const handleReopenCard = async (cardId: string) => {
    if (!round) return;
    if (round.resultsPublished) {
      setError("Published results are locked. Re-opening cards is disabled.");
      return;
    }
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
                  const name = getPlayerName(c.playerId);
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
                        {!round.resultsPublished && c.status !== "in_progress" && (
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

      {!round.resultsPublished && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-3">
          <h2 className="font-semibold text-gray-800 text-sm">Side Winners</h2>
          <p className="text-xs text-gray-500">
            Select winners before publishing. Blank winners are allowed if a prize was not run.
          </p>
          {round.specialHoles.ntp.map((holeNumber) => (
            <WinnerSelect
              key={holeNumber}
              label={`NTP - Hole ${holeNumber}`}
              value={sideWinnerIds[`ntp-${holeNumber}`] ?? ""}
              options={playerOptions}
              onChange={(winnerId) =>
                updateSideWinner(`ntp-${holeNumber}`, winnerId)
              }
            />
          ))}
          {round.specialHoles.ld && (
            <WinnerSelect
              label={`Longest Drive - Hole ${round.specialHoles.ld}`}
              value={sideWinnerIds.ld ?? ""}
              options={playerOptions}
              onChange={(winnerId) => updateSideWinner("ld", winnerId)}
            />
          )}
          {round.specialHoles.t2 && (
            <WinnerSelect
              label={`T2 - Hole ${round.specialHoles.t2}`}
              value={sideWinnerIds.t2 ?? ""}
              options={playerOptions}
              onChange={(winnerId) => updateSideWinner("t2", winnerId)}
            />
          )}
          {round.specialHoles.t3 && (
            <WinnerSelect
              label={`T3 - Hole ${round.specialHoles.t3}`}
              value={sideWinnerIds.t3 ?? ""}
              options={playerOptions}
              onChange={(winnerId) => updateSideWinner("t3", winnerId)}
            />
          )}
        </div>
      )}

      {results && (
        <div className="bg-green-50 border border-green-200 rounded-2xl p-4 space-y-3">
          <h2 className="font-semibold text-green-900 text-sm">
            Official Results Published
          </h2>
          <p className="text-xs text-green-800">
            Published {format(results.publishedAt, "EEE d MMM yyyy h:mm a")}
          </p>
          <div className="space-y-1 text-sm text-green-900">
            {results.rankings.slice(0, 10).map((ranking) => (
              <div
                key={ranking.playerId}
                className="flex items-center justify-between"
              >
                <span>
                  #{ranking.rank} {ranking.playerName}
                </span>
                <span className="font-semibold">
                  {round.format === "stableford"
                    ? `${ranking.stablefordTotal} pts`
                    : `${ranking.grossTotal} strokes`}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-2">
        <h2 className="font-semibold text-gray-800 text-sm">Results</h2>
        <p className="text-xs text-gray-500">
          Publishing saves the official top 10, side winners, and locks all cards.
        </p>
        <button
          type="button"
          onClick={handlePublish}
          disabled={publishing || round.resultsPublished || sorted.length === 0}
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

function WinnerSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ id: string; name: string }>;
  onChange: (winnerId: string) => void;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-gray-700 mb-1">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500"
      >
        <option value="">No winner selected</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
      </select>
    </label>
  );
}
