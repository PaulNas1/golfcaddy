"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { useGroupData } from "@/contexts/GroupDataContext";
import { getRoundLabel } from "@/lib/roundDisplay";
import { getFirstTeeTimeLabel } from "@/lib/teeTimes";
import { ChevronRightIcon } from "@/components/ui/icons";
import type { RoundStatus } from "@/types";

const STATUS_STYLES: Record<RoundStatus, string> = {
  upcoming: "bg-upcoming-bg text-upcoming-text",
  live:     "bg-live-bg text-live-text",
  completed:"bg-completed-bg text-completed-text",
};

const STATUS_LABEL: Record<RoundStatus, string> = {
  upcoming:  "Upcoming",
  live:      "● Live",
  completed: "Completed",
};

type StatusFilter = "upcoming" | "all";

export default function RoundsPage() {
  const { rounds, availableSeasons, currentSeason, loading } = useGroupData();

  const [selectedSeason, setSelectedSeason] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("upcoming");

  const activeSeason = Number(selectedSeason || currentSeason);

  // Rounds filtered by season
  const seasonRounds = useMemo(() => {
    if (selectedSeason === "all") return rounds;
    return rounds.filter((r) => r.season === activeSeason);
  }, [activeSeason, rounds, selectedSeason]);

  // Rounds further filtered by status
  const visibleRounds = useMemo(() => {
    if (statusFilter === "all") return seasonRounds;
    // "upcoming" filter shows live + upcoming (i.e. anything not completed)
    return seasonRounds.filter((r) => r.status !== "completed");
  }, [seasonRounds, statusFilter]);

  // Switch to "all" automatically when there are no upcoming rounds for the
  // chosen season — avoids a confusing empty state when the season is done.
  const hasUpcoming = seasonRounds.some((r) => r.status !== "completed");

  return (
    <div className="px-4 py-6">
      {/* ── Header row ─────────────────────────────────────────────── */}
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink-title">Rounds</h1>
          <p className="text-sm text-ink-muted">
            {selectedSeason === "all"
              ? "All seasons"
              : `Season ${activeSeason}`}
          </p>
        </div>
        <label className="block">
          <span className="mb-1 block text-right text-xs font-medium uppercase tracking-wide text-ink-hint">
            Season
          </span>
          <select
            value={selectedSeason || String(currentSeason)}
            onChange={(e) => {
              setSelectedSeason(e.target.value);
              // Reset status filter to "upcoming" when switching season,
              // but fall back to "all" if the new season has no upcoming rounds.
              setStatusFilter("upcoming");
            }}
            className="rounded-xl border border-surface-overlay bg-surface-card px-3 py-2 text-sm text-ink-body focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value={String(currentSeason)}>Active season</option>
            {availableSeasons
              .filter((s) => s !== currentSeason)
              .map((s) => (
                <option key={s} value={String(s)}>{s}</option>
              ))}
            <option value="all">All seasons</option>
          </select>
        </label>
      </div>

      {/* ── Status filter toggle ────────────────────────────────────── */}
      {/*
        Only shown when the selected season has a mix of statuses.
        Hidden automatically when all rounds are upcoming (e.g. new season)
        or when "all seasons" is selected.
      */}
      {selectedSeason !== "all" && (
        <div className="mb-4 inline-flex rounded-xl border border-surface-overlay bg-surface-muted p-1">
          {(["upcoming", "all"] as StatusFilter[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setStatusFilter(f)}
              className={`rounded-lg px-4 py-1.5 text-xs font-semibold transition-colors ${
                statusFilter === f
                  ? "bg-surface-card text-ink-title shadow-sm"
                  : "text-ink-hint hover:text-ink-muted"
              }`}
            >
              {f === "upcoming" ? (hasUpcoming ? "Upcoming" : "No upcoming") : "All rounds"}
            </button>
          ))}
        </div>
      )}

      {/* ── Round list ─────────────────────────────────────────────── */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-surface-card rounded-2xl p-4 animate-pulse">
              <div className="h-5 bg-surface-muted rounded w-3/4 mb-2" />
              <div className="h-4 bg-surface-muted rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : visibleRounds.length === 0 ? (
        <div className="text-center py-16 text-ink-hint">
          <div className="text-4xl mb-3">📋</div>
          <p className="text-sm">
            {statusFilter === "upcoming"
              ? "No upcoming rounds. Tap \"All rounds\" to see completed rounds."
              : selectedSeason === "all"
              ? "No rounds yet. Admin will schedule the first round soon."
              : `No rounds found for Season ${activeSeason}.`}
          </p>
          {statusFilter === "upcoming" && seasonRounds.length > 0 && (
            <button
              type="button"
              onClick={() => setStatusFilter("all")}
              className="mt-3 text-brand-600 text-sm font-medium underline"
            >
              Show all rounds
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {visibleRounds.map((round) => {
            const teeTimeLabel = getFirstTeeTimeLabel(round);
            return (
              <Link key={round.id} href={`/rounds/${round.id}`} prefetch={false}>
                <div className="bg-surface-card rounded-2xl shadow-sm border border-surface-overlay p-4 flex items-center justify-between hover:bg-surface-muted transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_STYLES[round.status]}`}>
                        {STATUS_LABEL[round.status]}
                      </span>
                      <span className="text-xs text-ink-hint truncate">
                        {getRoundLabel(round)}
                      </span>
                    </div>
                    <h3 className="font-semibold text-ink-title truncate">{round.courseName}</h3>
                    <p className="text-ink-muted text-sm">
                      {format(round.date, "EEE d MMM yyyy")}
                      {teeTimeLabel ? ` · ${teeTimeLabel}` : ""}
                      {selectedSeason === "all" ? ` · S${round.season}` : ""}
                    </p>
                  </div>
                  <ChevronRightIcon className="w-5 h-5 text-ink-hint shrink-0 ml-2" />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
