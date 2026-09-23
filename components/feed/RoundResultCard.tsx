"use client";

/**
 * RoundResultCard
 *
 * Auto-generated feed card for a published round: winner, podium and side
 * prizes, read straight from the `results` doc (so corrections show up
 * automatically). Reactions/replies go through a companion post that is
 * created on first use — see roundResultPostId() in lib/firestore.ts.
 */

import Link from "next/link";
import { format } from "date-fns";
import Avatar from "@/components/ui/Avatar";
import PostEngagement, { type EngagementHandlers } from "@/components/feed/PostEngagement";
import type { AppUser, Post, PostReaction, Results, Round } from "@/types";

interface RoundResultCardProps extends EngagementHandlers {
  round: Round;
  results: Results;
  post: Post;
  appUser: AppUser | null;
  isAdmin: boolean;
  myReaction: PostReaction | null;
}

export default function RoundResultCard({
  round,
  results,
  post,
  appUser,
  isAdmin,
  myReaction,
  ...engagement
}: RoundResultCardProps) {
  const isStroke = round.format === "stroke";
  const ranked = [...results.rankings].sort((a, b) => a.rank - b.rank);
  const [winner, ...rest] = ranked;
  const podium = rest.slice(0, 2);
  const score = (r: (typeof ranked)[number]) =>
    isStroke ? `${r.grossTotal}` : `${r.stablefordTotal} pts`;

  const s = results.sideResults;
  const sidePrizes = [
    ...(s?.ntp ?? []).map((r) => ({ icon: "🎯", label: `NTP ${r.holeNumber}`, name: r.winnerName })),
    { icon: "💥", label: "LD", name: s?.ld?.winnerName ?? null },
    { icon: "🏌️", label: "T2", name: s?.t2?.winnerName ?? null },
    { icon: "🏌️", label: "T3", name: s?.t3?.winnerName ?? null },
  ].filter((p) => p.name);

  if (!winner) return null;

  return (
    <article
      className="overflow-hidden rounded-2xl border border-surface-overlay bg-surface-card px-4 pb-2 pt-4"
      style={{ backgroundImage: "linear-gradient(180deg, rgba(34,164,74,0.20) 0%, rgba(34,164,74,0) 70%)" }}
    >
      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-brand-600">⛳ Round result</p>
      <h3 className="mt-0.5 text-lg font-bold leading-snug text-ink-title">
        {`Round ${round.roundNumber} · ${round.courseName}`}
      </h3>
      <p className="text-[13px] text-ink-muted">
        {format(round.date, "EEE d MMM")} · {ranked.length} players · {isStroke ? "Stroke" : "Stableford"}
      </p>

      {/* Winner */}
      <div className="mt-3 flex items-center gap-3 rounded-2xl bg-surface-muted px-3 py-3">
        <span className="text-3xl leading-none">🏆</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-bold text-ink-title">{winner.playerName}</p>
          <p className="text-[13px] font-bold text-brand-600">
            {score(winner)}
            {winner.pointsAwarded > 0 && ` · +${winner.pointsAwarded} ladder`}
          </p>
        </div>
        <Avatar name={winner.playerName} size="sm" />
      </div>

      {/* 2nd + 3rd */}
      {podium.length > 0 && (
        <div className="mt-2 grid grid-cols-2 gap-2">
          {podium.map((r, i) => (
            <div key={r.playerId} className="min-w-0 rounded-xl bg-surface-muted px-3 py-2">
              <p className="truncate text-[13px] font-semibold text-ink-title">
                {i === 0 ? "🥈" : "🥉"} {r.playerName}
              </p>
              <p className="text-xs text-ink-muted">
                {score(r)}
                {r.countbackDetail ? " (c/b)" : ""}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Side prizes */}
      {sidePrizes.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {sidePrizes.map((p) => (
            <span key={p.label} className="rounded-full bg-surface-muted px-2.5 py-1 text-xs text-ink-body">
              {p.icon} {p.label} · {p.name}
            </span>
          ))}
        </div>
      )}

      <PostEngagement
        post={post}
        appUser={appUser}
        isAdmin={isAdmin}
        myReaction={myReaction}
        {...engagement}
        trailing={
          <Link
            href={`/rounds/${round.id}`}
            className="rounded-lg px-2.5 py-1.5 text-[13px] font-semibold text-brand-600 hover:bg-surface-muted"
          >
            Full results ›
          </Link>
        }
      />
    </article>
  );
}
