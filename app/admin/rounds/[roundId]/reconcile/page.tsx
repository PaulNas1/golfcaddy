"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import {
  applyRoundReconciliation,
  getActiveMembers,
  getGroup,
  getHoleScores,
  getRound,
  getScorecardsForRound,
} from "@/lib/firestore";
import { normaliseGroupSettings } from "@/lib/settings";
import {
  parseHandicapList,
  reconcileRound,
  summariseReconcile,
  type ReconcileResult,
} from "@/lib/roundReconcile";
import type { AppUser, Group, HoleScore, Round, Scorecard } from "@/types";

// ─── Round reconciliation ───────────────────────────────────────────────────
//
// Rebuilds a round's scoring from the gross scores already entered, using a
// corrected handicap per player. The dry run writes nothing; nothing is
// applied until the differences have been read.

const TEXTAREA =
  "w-full rounded-xl border border-surface-overlay bg-surface-card px-3 py-2.5 font-mono text-xs text-ink-title focus:outline-none focus:ring-2 focus:ring-brand-500";

/** `Jackson Shegog 37` per line — the totals to check the rebuild against. */
function parseExpectedTotals(text: string): Record<string, number> {
  const out: Record<string, number> = {};
  text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      const cells = line
        .split(/\t|,|;|\s{2,}/)
        .map((cell) => cell.trim())
        .filter(Boolean);
      const parts = cells.length > 1 ? cells : line.split(/\s+/);
      for (let index = parts.length - 1; index >= 1; index -= 1) {
        const value = Number(parts[index]);
        if (Number.isFinite(value)) {
          const name = (cells.length > 1 ? parts[0] : parts.slice(0, index).join(" ")).trim();
          if (name) out[name] = value;
          return;
        }
      }
    });
  return out;
}

export default function ReconcileRoundPage() {
  const { appUser, isAdmin } = useAuth();
  const { roundId } = useParams<{ roundId: string }>();

  const [round, setRound] = useState<Round | null>(null);
  const [group, setGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<AppUser[]>([]);
  const [scorecards, setScorecards] = useState<Scorecard[]>([]);
  const [holeScoresByCardId, setHoleScores] = useState<Record<string, HoleScore[]>>({});
  const [loading, setLoading] = useState(true);

  const [handicapText, setHandicapText] = useState("");
  const [expectedText, setExpectedText] = useState("");
  const [result, setResult] = useState<ReconcileResult | null>(null);
  const [applying, setApplying] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!appUser?.groupId || !roundId) return;
    setLoading(true);
    try {
      const [loadedRound, loadedGroup, loadedMembers, cards] = await Promise.all([
        getRound(roundId),
        getGroup(appUser.groupId),
        getActiveMembers(appUser.groupId),
        getScorecardsForRound(roundId),
      ]);
      const holes = await Promise.all(
        cards.map(async (card) => [card.id, await getHoleScores(card.id)] as const)
      );
      setRound(loadedRound);
      setGroup(loadedGroup);
      setMembers(loadedMembers);
      setScorecards(cards);
      setHoleScores(Object.fromEntries(holes));
    } catch {
      setError("Failed to load the round.");
    } finally {
      setLoading(false);
    }
  }, [appUser?.groupId, roundId]);

  useEffect(() => {
    load();
  }, [load]);

  const parsed = useMemo(() => parseHandicapList(handicapText), [handicapText]);
  const summary = useMemo(
    () => (result ? summariseReconcile(result.rows) : null),
    [result]
  );

  const runDryRun = () => {
    if (!round) return;
    setError("");
    setMessage("");
    setResult(
      reconcileRound({
        scorecards,
        holeScoresByCardId,
        members,
        handicaps: parsed.entries,
        expectedStableford: parseExpectedTotals(expectedText),
        handicapMode: normaliseGroupSettings(group?.settings).handicapMode,
        format: round.format,
      })
    );
    setMessage("Dry run complete. Nothing was written.");
  };

  const apply = async () => {
    if (!result || !appUser) return;
    const changed = result.rows.filter((row) => row.changed);
    if (changed.length === 0) return;

    const confirmed = window.confirm(
      `Rewrite ${changed.length} scorecard${changed.length === 1 ? "" : "s"}? ` +
        "Handicaps, strokes received and Stableford points are replaced. Gross " +
        "scores are not touched. Publish the round afterwards to rebuild the " +
        "ladder."
    );
    if (!confirmed) return;

    setApplying(true);
    setError("");
    try {
      const written = await applyRoundReconciliation({
        adminUid: appUser.uid,
        cards: changed.map((row) => ({
          scorecardId: row.scorecardId,
          handicapAtTime: row.nextPlayingHandicap,
          totalGross: row.nextGross,
          totalStableford: round?.format === "stableford" ? row.nextStableford : null,
          holes: row.holes.map((hole) => ({
            holeNumber: hole.holeNumber,
            strokesReceived: hole.nextStrokes,
            netScore:
              hole.grossScore == null ? null : hole.grossScore - hole.nextStrokes,
            stablefordPoints: hole.nextPoints,
          })),
        })),
      });
      setMessage(
        `Updated ${written.cardsWritten} scorecards and ${written.holesWritten} holes. ` +
          "Now close the round out on the round page to publish results and the ladder."
      );
      setResult(null);
      await load();
    } catch {
      setError("Failed to apply. Nothing may have been written — re-run the dry run.");
    } finally {
      setApplying(false);
    }
  };

  if (!isAdmin) {
    return <p className="text-sm text-ink-muted">Only a group admin can reconcile a round.</p>;
  }
  if (loading) return <p className="text-sm text-ink-hint">Loading round…</p>;
  if (!round) return <p className="text-sm text-ink-muted">Round not found.</p>;

  const changedCount = result?.rows.filter((row) => row.changed).length ?? 0;

  return (
    <div className="space-y-5 pb-8">
      <div>
        <Link href={`/admin/rounds/${roundId}`} className="text-xs text-ink-hint hover:text-ink-body">
          ← Round {round.roundNumber}
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-ink-title">Reconcile scoring</h1>
        <p className="mt-1 text-sm text-ink-muted">
          {round.courseName} · {scorecards.length} scorecards. Rebuilds strokes
          and points from the gross scores already entered. Gross is never
          changed.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}
      {message && (
        <div className="rounded-xl border border-green-200 bg-brand-50 px-4 py-3 text-sm text-brand-800">{message}</div>
      )}

      <div className="space-y-3 rounded-2xl border border-surface-overlay bg-surface-card p-4 shadow-sm">
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-body" htmlFor="hcp">
            Corrected handicaps — name and handicap index, one per line
          </label>
          <textarea
            id="hcp"
            rows={8}
            value={handicapText}
            onChange={(e) => setHandicapText(e.target.value)}
            placeholder={"Ash Grybas\t19.4\nBrad Giampietro\t18.1"}
            className={TEXTAREA}
          />
          {parsed.entries.length > 0 && (
            <p className="mt-1 text-xs text-ink-muted">
              {parsed.entries.length} handicaps read.
            </p>
          )}
          {parsed.errors.map((line) => (
            <p key={line} className="mt-1 text-xs text-amber-600">{line}</p>
          ))}
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-ink-body" htmlFor="expected">
            Expected totals (optional) — checked against the rebuild
          </label>
          <textarea
            id="expected"
            rows={5}
            value={expectedText}
            onChange={(e) => setExpectedText(e.target.value)}
            placeholder={"Jackson Shegog\t37\nAsh Grybas\t34"}
            className={TEXTAREA}
          />
        </div>

        <button
          type="button"
          onClick={runDryRun}
          disabled={parsed.entries.length === 0}
          className="w-full rounded-xl border border-brand-200 bg-surface-card py-2.5 text-sm font-semibold text-brand-700 transition-colors hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Dry run — writes nothing
        </button>
      </div>

      {result && summary && (
        <div className="space-y-3 rounded-2xl border border-surface-overlay bg-surface-card p-4 shadow-sm">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Scorecards" value={summary.cards} />
            <Stat label="Changed" value={summary.changed} />
            <Stat label="Matches sheet" value={summary.matchesSpreadsheet} tone="good" />
            <Stat label="Disagrees" value={summary.disagreesWithSpreadsheet} tone={summary.disagreesWithSpreadsheet > 0 ? "bad" : "good"} />
          </div>

          {result.unmatchedNames.length > 0 && (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Not on this round: {result.unmatchedNames.join(", ")}
            </p>
          )}
          {result.missingHandicapFor.length > 0 && (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              No handicap supplied, left untouched: {result.missingHandicapFor.join(", ")}
            </p>
          )}

          <div className="space-y-1.5">
            {result.rows.map((row) => (
              <div
                key={row.scorecardId}
                className={`rounded-xl border px-3 py-2 ${
                  row.issues.length > 0
                    ? "border-amber-200 bg-amber-50"
                    : row.changed
                    ? "border-surface-overlay bg-surface-muted"
                    : "border-surface-overlay bg-surface-card"
                }`}
              >
                <button
                  type="button"
                  onClick={() =>
                    setExpanded((current) =>
                      current === row.scorecardId ? null : row.scorecardId
                    )
                  }
                  className="flex w-full items-center justify-between gap-2 text-left"
                >
                  <span className="min-w-0 flex-1 truncate text-xs font-semibold text-ink-title">
                    {row.playerName}
                  </span>
                  <span className="shrink-0 text-xs text-ink-muted">
                    HCP {row.previousPlayingHandicap} → {row.nextPlayingHandicap} ·{" "}
                    {row.previousStableford ?? "—"} → <strong>{row.nextStableford}</strong>
                    {row.expectedStableford != null &&
                      ` (sheet ${row.expectedStableford})`}
                  </span>
                </button>

                {row.issues.map((issue) => (
                  <p key={issue} className="mt-1 text-xs text-amber-700">{issue}</p>
                ))}

                {expanded === row.scorecardId && (
                  <div className="mt-2 overflow-x-auto">
                    <table className="w-full min-w-[420px] text-left text-xs">
                      <thead>
                        <tr className="text-ink-muted">
                          <th className="py-1 pr-2">Hole</th>
                          <th className="py-1 pr-2">Par</th>
                          <th className="py-1 pr-2">SI</th>
                          <th className="py-1 pr-2">Gross</th>
                          <th className="py-1 pr-2">Strokes</th>
                          <th className="py-1">Points</th>
                        </tr>
                      </thead>
                      <tbody>
                        {row.holes.map((hole) => (
                          <tr key={hole.holeNumber} className="border-t border-surface-overlay/60">
                            <td className="py-1 pr-2 text-ink-body">{hole.holeNumber}</td>
                            <td className="py-1 pr-2 text-ink-muted">{hole.par}</td>
                            <td className="py-1 pr-2 text-ink-muted">{hole.strokeIndex}</td>
                            <td className="py-1 pr-2 text-ink-body">{hole.grossScore ?? "—"}</td>
                            <td className="py-1 pr-2 text-ink-muted">
                              {hole.previousStrokes} → {hole.nextStrokes}
                            </td>
                            <td className="py-1 text-ink-body">
                              {hole.previousPoints ?? "—"} → {hole.nextPoints ?? "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={apply}
            disabled={applying || changedCount === 0}
            className="w-full rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {applying
              ? "Applying…"
              : `Apply to ${changedCount} scorecard${changedCount === 1 ? "" : "s"}`}
          </button>
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number;
  tone?: "neutral" | "good" | "bad";
}) {
  return (
    <div className="rounded-xl border border-surface-overlay bg-surface-muted px-3 py-2">
      <p
        className={`text-lg font-bold ${
          tone === "bad" ? "text-red-600" : tone === "good" ? "text-brand-700" : "text-ink-title"
        }`}
      >
        {value}
      </p>
      <p className="text-xs text-ink-muted">{label}</p>
    </div>
  );
}
