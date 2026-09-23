"use client";

/**
 * /practice — try the real scoring screen without touching real data.
 *
 * Pick any round; its course, tees and prize holes are copied into an
 * in-memory "live" round (lib/practiceScorecardApi.ts). Your real playing
 * handicap is used, but no card, hole score, claim or notification is ever
 * written. Leaving the page throws it all away. Admins/moderators only.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { useAuth } from "@/contexts/AuthContext";
import { subscribeGroup, subscribeRoundsForGroup } from "@/lib/firestore";
import { ScorecardApiContext, realScorecardApi } from "@/lib/scorecardApi";
import { createPracticeScorecardApi, PRACTICE_ROUND_ID } from "@/lib/practiceScorecardApi";
import ScorecardScreen from "@/components/scorecard/ScorecardScreen";
import type { Group, Round } from "@/types";

export default function PracticePage() {
  const { appUser, canAccessAdmin, loading } = useAuth();
  const [rounds, setRounds] = useState<Round[]>([]);
  const [group, setGroup] = useState<Group | null>(null);
  const [roundId, setRoundId] = useState("");
  const [started, setStarted] = useState(false);
  const [session, setSession] = useState(0); // bump to start a fresh practice

  useEffect(() => {
    if (!appUser?.groupId) return;
    const unsubRounds = subscribeRoundsForGroup(appUser.groupId, setRounds);
    const unsubGroup = subscribeGroup(appUser.groupId, setGroup);
    return () => {
      unsubRounds();
      unsubGroup();
    };
  }, [appUser?.groupId]);

  // Rounds with a real card to score against, newest season first.
  const options = useMemo(
    () =>
      rounds
        .filter((r) => (r.courseHoles?.length ?? 0) === 18 || (r.courseSnapshot?.tees?.length ?? 0) > 0)
        .sort((a, b) => b.date.getTime() - a.date.getTime()),
    [rounds]
  );

  // Default: the next unpublished round this season, else the most recent.
  useEffect(() => {
    if (roundId || options.length === 0) return;
    const season = group?.currentSeason;
    const next = [...options]
      .filter((r) => !r.resultsPublished && (season == null || r.season === season))
      .sort((a, b) => a.date.getTime() - b.date.getTime())[0];
    setRoundId((next ?? options[0]).id);
  }, [options, group?.currentSeason, roundId]);

  const chosen = options.find((r) => r.id === roundId) ?? null;
  const practiceApi = useMemo(
    () => (chosen ? createPracticeScorecardApi(realScorecardApi, chosen) : null),
    // A new session (or a different round) = a completely fresh practice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chosen?.id, session]
  );

  if (loading) return null;
  if (!canAccessAdmin) {
    return (
      <div className="px-4 py-10 text-center">
        <p className="font-semibold text-ink-title">Practice scoring is for admins</p>
        <Link href="/home" className="mt-3 inline-block text-sm font-semibold text-ink-action">
          ← Back home
        </Link>
      </div>
    );
  }

  if (!started || !practiceApi || !chosen) {
    return (
      <div className="space-y-4 px-4 py-6">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wide text-amber-500">Practice mode</p>
          <h1 className="text-2xl font-bold text-ink-title">Practice scoring</h1>
          <p className="mt-1 text-sm text-ink-muted">
            The real scoring screen, on a real course, with real handicaps — but
            nothing is saved. No cards, no notifications, nothing on the ladder.
          </p>
        </div>

        <label className="block rounded-2xl border border-surface-overlay bg-surface-card p-4 shadow-sm">
          <span className="mb-1 block text-xs font-semibold text-ink-body">Course to practise on</span>
          <select
            value={roundId}
            onChange={(event) => setRoundId(event.target.value)}
            className="w-full rounded-xl border border-surface-overlay bg-surface-card px-3 py-2.5 text-sm text-ink-title focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            {options.map((r) => (
              <option key={r.id} value={r.id}>
                R{r.roundNumber} · {r.courseName} · {format(r.date, "d MMM yyyy")}
              </option>
            ))}
          </select>
          {options.length === 0 && (
            <p className="mt-2 text-xs text-ink-hint">No rounds with course data yet.</p>
          )}
        </label>

        <button
          type="button"
          disabled={!chosen}
          onClick={() => {
            setSession((n) => n + 1);
            setStarted(true);
          }}
          className="w-full rounded-xl bg-amber-500 py-3 text-sm font-bold text-white hover:bg-amber-600 disabled:opacity-40"
        >
          Start practice
        </button>
        <p className="text-center text-xs text-ink-hint">
          You can mark yourself or any member. Leaving the page wipes the practice.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="sticky top-0 z-40 flex items-center justify-between gap-3 bg-amber-500 px-4 py-2 text-white shadow">
        <p className="min-w-0 truncate text-xs font-bold">
          PRACTICE · nothing is saved · R{chosen.roundNumber} {chosen.courseName}
        </p>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => setSession((n) => n + 1)}
            className="rounded-full bg-white/20 px-3 py-1 text-xs font-semibold"
          >
            Restart
          </button>
          <button
            type="button"
            onClick={() => setStarted(false)}
            className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-amber-600"
          >
            Exit
          </button>
        </div>
      </div>
      <ScorecardApiContext.Provider value={practiceApi}>
        <ScorecardScreen key={`${chosen.id}-${session}`} roundId={PRACTICE_ROUND_ID} />
      </ScorecardApiContext.Provider>
    </div>
  );
}
