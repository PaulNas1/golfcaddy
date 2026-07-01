"use client";

import type { PlayerRanking, ScoringFormat } from "@/types";
import { computeRankMovement } from "@/lib/liveStandings";

const PODIUM_MEDAL = ["🥇", "🥈", "🥉"] as const;

type Props = {
  rankings: PlayerRanking[];
  format: ScoringFormat;
  playedHolesByPlayerId: Record<string, number>;
  lastHolePointsByPlayerId: Record<string, number | null>;
  prevRankById: Record<string, number>;
  roundComplete: boolean;
  currentUserId?: string;
};

export default function LiveStandingsCard({
  rankings,
  format,
  playedHolesByPlayerId,
  lastHolePointsByPlayerId,
  prevRankById,
  roundComplete,
  currentUserId,
}: Props) {
  return (
    <div className="bg-surface-card rounded-2xl shadow-sm border border-surface-overlay p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold text-ink-title">Live Standings</h2>
        <span className="text-xs font-medium text-ink-hint rounded-full bg-surface-muted px-2 py-0.5">
          Unofficial
        </span>
      </div>
      <div className="divide-y divide-surface-overlay">
        {rankings.map((ranking) => {
          const isMe = ranking.playerId === currentUserId;
          const thru = playedHolesByPlayerId[ranking.playerId] ?? 0;
          const lastHolePoints = lastHolePointsByPlayerId[ranking.playerId] ?? null;
          const movement = computeRankMovement(ranking.playerId, ranking.rank, prevRankById);
          const medal = PODIUM_MEDAL[ranking.rank - 1];
          const metaLabel = roundComplete ? "F" : thru === 0 ? "Tee" : `Thru ${thru}`;
          const totalDisplay =
            format === "stableford" ? `${ranking.stablefordTotal} pts` : String(ranking.grossTotal);

          return (
            <div
              key={ranking.playerId}
              className={`flex items-center gap-3 py-2.5 ${isMe ? "font-semibold" : ""}`}
            >
              <div className="w-8 shrink-0 text-center">
                {medal ? (
                  <span className="text-base leading-none">{medal}</span>
                ) : (
                  <span className="text-xs text-ink-muted">#{ranking.rank}</span>
                )}
                {movement.direction === "up" && (
                  <p className="text-[10px] font-bold text-brand-600">▲{movement.amount}</p>
                )}
                {movement.direction === "down" && (
                  <p className="text-[10px] font-bold text-red-500">▼{movement.amount}</p>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <p className={`truncate text-sm ${isMe ? "text-brand-700" : "text-ink-body"}`}>
                  {ranking.playerName}
                  {isMe ? " (you)" : ""}
                </p>
                <p className="text-xs text-ink-muted">
                  {metaLabel} · HCP {ranking.handicap}
                </p>
              </div>

              <div className="shrink-0 text-right">
                <p className={`font-mono text-sm ${isMe ? "text-brand-700" : "text-ink-title"}`}>
                  {totalDisplay}
                </p>
                {format === "stableford" && lastHolePoints != null && (
                  <p
                    className={`text-xs font-semibold ${
                      lastHolePoints >= 3 ? "text-brand-600" : "text-ink-hint"
                    }`}
                  >
                    +{lastHolePoints}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-ink-muted">
        Scores update in real time. Final results are published by the admin after the round.
      </p>
    </div>
  );
}
