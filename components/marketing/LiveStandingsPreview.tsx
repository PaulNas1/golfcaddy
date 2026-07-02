"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  buildIllustrativeRound,
  computeIllustrativeStandings,
} from "@/lib/illustrativeRound";
import { buildRankById, computeRankMovement } from "@/lib/liveStandings";

const HOLE_ADVANCE_MS = 3000;
const MEDALS = ["🥇", "🥈", "🥉"] as const;

export default function LiveStandingsPreview() {
  const round = useMemo(() => buildIllustrativeRound(), []);
  const [playedHoles, setPlayedHoles] = useState(6);
  const prevRankByIdRef = useRef<Record<string, number>>({});
  const lastProgressKeyRef = useRef<number | null>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      setPlayedHoles((current) => (current >= 18 ? 1 : current + 1));
    }, HOLE_ADVANCE_MS);
    return () => clearInterval(interval);
  }, []);

  const { rankings, lastHoleByPlayerId } = useMemo(
    () => computeIllustrativeStandings(round, playedHoles),
    [round, playedHoles]
  );

  const currentRankById = useMemo(() => buildRankById(rankings), [rankings]);

  // Snapshot the previous-hole rank map only when the hole count advances,
  // so movement arrows reflect "since the last hole." This must run in the
  // effect body itself (not a cleanup function) — a cleanup-based snapshot
  // fires one render cycle too late and ends up comparing hole N-2 to N
  // instead of N-1 to N. This mirrors the proven pattern already reviewed
  // and shipped in app/(app)/rounds/[roundId]/page.tsx.
  useEffect(() => {
    if (lastProgressKeyRef.current !== playedHoles) {
      lastProgressKeyRef.current = playedHoles;
      prevRankByIdRef.current = currentRankById;
    }
  }, [playedHoles, currentRankById]);

  return (
    <div className="overflow-hidden rounded-[20px] border border-mkt-border bg-mkt-card shadow-[0_30px_60px_-25px_rgba(0,0,0,0.5)]">
      <div className="flex items-center justify-between px-4 pb-3.5 pt-4">
        <div>
          <p className="text-base font-extrabold text-mkt-text">Live Standings</p>
          <p className="mt-0.5 text-[11.5px] text-mkt-faint">Ivanhoe &middot; Round 7 &middot; Stableford</p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-mkt-chip px-2.5 py-1">
          <span className="h-1.5 w-1.5 animate-gc-pulse rounded-full bg-mkt-live" />
          <span className="text-[11px] font-extrabold tracking-[0.06em] text-mkt-chipText">LIVE</span>
        </span>
      </div>

      <div className="px-3 pb-2">
        {rankings.map((ranking) => {
          const medal = MEDALS[ranking.rank - 1];
          const movement = computeRankMovement(ranking.playerId, ranking.rank, prevRankByIdRef.current);
          const lastHole = lastHoleByPlayerId[ranking.playerId];
          const isLeader = ranking.rank === 1;

          return (
            <div
              key={ranking.playerId}
              className={`mb-2 flex items-center gap-3 rounded-[14px] border p-2.5 ${
                isLeader ? "border-mkt-gold bg-[rgba(231,184,75,0.06)]" : "border-mkt-border"
              }`}
            >
              <div className="flex w-8 shrink-0 flex-col items-center">
                <div className="flex h-8 w-8 items-center justify-center rounded-[9px] bg-mkt-card2 text-sm font-extrabold text-mkt-muted">
                  {medal ?? `#${ranking.rank}`}
                </div>
                {movement.direction === "up" && (
                  <span className="mt-0.5 text-[10px] font-extrabold leading-none text-mkt-accent">
                    &#9650;{movement.amount}
                  </span>
                )}
                {movement.direction === "down" && (
                  <span className="mt-0.5 text-[10px] font-extrabold leading-none text-mkt-down">
                    &#9660;{movement.amount}
                  </span>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-bold tracking-[-0.01em] text-mkt-text">
                  {ranking.playerName}
                </p>
                <p className="mt-px text-xs text-mkt-faint">
                  Thru {playedHoles} &middot; HCP {ranking.handicap}
                </p>
              </div>

              <div className="shrink-0 text-right">
                <p className="font-mono text-lg font-bold leading-none text-mkt-accent">
                  {ranking.stablefordTotal}
                </p>
                {lastHole != null && (
                  <p
                    className={`mt-0.5 text-[10px] font-bold ${
                      lastHole.stablefordPoints >= 3 ? "text-mkt-accent" : "text-mkt-faint"
                    }`}
                  >
                    +{lastHole.stablefordPoints}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <p className="pb-3.5 pt-1 text-center text-[11px] text-mkt-faint">
        Illustrative example &middot; live for members during every round
      </p>
    </div>
  );
}
