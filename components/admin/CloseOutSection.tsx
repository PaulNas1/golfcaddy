"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import Link from "next/link";
import {
  createRound,
  publishRoundResultsWithStage3,
  updateScorecard,
} from "@/lib/firestore";
import { getEffectiveSpecialHoles } from "@/lib/courseData";
import type {
  AppUser,
  Group,
  PlayerRanking,
  Results,
  Round,
  Scorecard,
  SidePrizeType,
} from "@/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getSuggestedRoundNumberForSeason(
  rounds: Round[],
  seasonValue: string
) {
  const parsed = parseInt(seasonValue, 10);
  if (!Number.isFinite(parsed)) return "1";
  const highest = rounds
    .filter((r) => r.season === parsed)
    .reduce((max, r) => Math.max(max, r.roundNumber), 0);
  return String(highest + 1);
}

// ---------------------------------------------------------------------------
// Local components
// ---------------------------------------------------------------------------

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
      <span className="block text-xs font-medium text-ink-body mb-1">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2.5 rounded-xl border border-surface-overlay text-sm text-ink-title focus:outline-none focus:ring-2 focus:ring-brand-500"
      >
        <option value="">No winner selected</option>
        {options.map((opt) => (
          <option key={opt.id} value={opt.id}>
            {opt.name}
          </option>
        ))}
      </select>
    </label>
  );
}

// ---------------------------------------------------------------------------
// CloseOutSection
// ---------------------------------------------------------------------------

type Props = {
  round: Round;
  rankings: PlayerRanking[];
  scorecards: Scorecard[];
  sideWinnerIds: Record<string, string>;
  playerOptions: Array<{ id: string; name: string }>;
  group: Group | null;
  groupRounds: Round[];
  appUser: AppUser | null;
  members: AppUser[];
  /** Sync shared state after publish */
  onRoundChange: (updated: Round) => void;
  onResultsChange?: (results: Results) => void;
  onScorecardsChange: (scorecards: Scorecard[]) => void;
  /** Persist a side-winner selection */
  onUpdateSideWinner: (
    key: string,
    prizeType: SidePrizeType,
    holeNumber: number,
    winnerId: string
  ) => Promise<void>;
};

export default function CloseOutSection({
  round,
  rankings,
  scorecards,
  sideWinnerIds,
  playerOptions,
  group,
  groupRounds,
  appUser,
  members,
  onRoundChange,
  onResultsChange = undefined,
  onScorecardsChange,
  onUpdateSideWinner,
}: Props) {
  const router = useRouter();

  // Publish state
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState("");

  // Rebook form state
  const [showRebookForm, setShowRebookForm] = useState(false);
  const [rebooking, setRebooking] = useState(false);
  const [rebookDate, setRebookDate] = useState("");
  const [rebookSeason, setRebookSeason] = useState("");
  const [rebookRoundNumber, setRebookRoundNumber] = useState("");
  const [rebookRoundNumberEdited, setRebookRoundNumberEdited] = useState(false);

  // -------------------------------------------------------------------------
  // Derived
  // -------------------------------------------------------------------------

  const specialHoles = getEffectiveSpecialHoles(round);

  const cardsByPlayerId = useMemo(
    () => new Map(scorecards.map((c) => [c.playerId, c])),
    [scorecards]
  );

  const suggestedRebookSeason = useMemo(
    () =>
      String(
        Math.max(round.season + 1, group?.currentSeason ?? round.season)
      ),
    [group?.currentSeason, round.season]
  );

  const suggestedRebookDate = useMemo(() => {
    const nextDate = new Date(round.date);
    nextDate.setFullYear(nextDate.getFullYear() + 1);
    return format(nextDate, "yyyy-MM-dd");
  }, [round.date]);

  const suggestedRoundNumberForSeason = useMemo(
    () =>
      getSuggestedRoundNumberForSeason(
        groupRounds,
        rebookSeason || suggestedRebookSeason
      ),
    [groupRounds, rebookSeason, suggestedRebookSeason]
  );

  const getPlayerName = (playerId: string) =>
    members.find((u) => u.uid === playerId)?.displayName ??
    `Player ${playerId.slice(0, 6)}`;

  const buildSideResult = (key: string, holeNumber: number | null) => {
    const winnerId = sideWinnerIds[key] || null;
    return {
      holeNumber: holeNumber ?? 0,
      winnerId,
      winnerName: winnerId ? getPlayerName(winnerId) : null,
    };
  };

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------

  const openRebookForm = () => {
    setShowRebookForm(true);
    setRebookDate(suggestedRebookDate);
    setRebookSeason(suggestedRebookSeason);
    setRebookRoundNumber(
      getSuggestedRoundNumberForSeason(groupRounds, suggestedRebookSeason)
    );
    setRebookRoundNumberEdited(false);
    setPublishError("");
  };

  const handleReopenCard = async (cardId: string) => {
    if (round.resultsPublished) return;
    try {
      await updateScorecard(cardId, {
        status: "in_progress",
        signedOff: false,
        submittedAt: null,
      });
      onScorecardsChange(
        scorecards.map((c) =>
          c.id === cardId
            ? {
                ...c,
                status: "in_progress",
                signedOff: false,
                submittedAt: null,
              }
            : c
        )
      );
    } catch {
      setPublishError("Failed to re-open card. Please try again.");
    }
  };

  const handlePublish = async () => {
    if (!appUser) return;
    setPublishing(true);
    setPublishError("");
    try {
      const publishedAt = new Date();
      const officialResults: Omit<Results, "id" | "createdAt"> = {
        roundId: round.id,
        groupId: round.groupId,
        season: round.season,
        publishedAt,
        rankings,
        sideResults: {
          ntp: (specialHoles?.ntp ?? []).map((h) =>
            buildSideResult(`ntp-${h}`, h)
          ),
          ld: buildSideResult("ld", specialHoles?.ld ?? null),
          t2: buildSideResult("t2", specialHoles?.t2 ?? null),
          t3: buildSideResult("t3", specialHoles?.t3 ?? null),
        },
      };

      const published = await publishRoundResultsWithStage3({
        round,
        results: officialResults,
        scorecards,
        activeUsers: members,
        publishedBy: appUser,
      });

      onRoundChange({
        ...round,
        status: "completed",
        resultsPublished: true,
        resultsPublishedAt: publishedAt,
      });
      onResultsChange?.(published.officialResults);
      onScorecardsChange(
        scorecards.map((c) => ({
          ...c,
          status: "admin_locked",
          signedOff: true,
        }))
      );
      openRebookForm();
    } catch {
      setPublishError("Failed to publish results. Please try again.");
    } finally {
      setPublishing(false);
    }
  };

  const handleRebook = async () => {
    if (!appUser) return;
    const parsedSeason = parseInt(rebookSeason, 10);
    const parsedRoundNumber = parseInt(rebookRoundNumber, 10);
    const activeSeason = group?.currentSeason ?? round.season;

    if (!rebookDate) {
      setPublishError("Select the new booking date.");
      return;
    }
    if (!Number.isInteger(parsedSeason) || parsedSeason < activeSeason) {
      setPublishError(`Season must be ${activeSeason} or later.`);
      return;
    }
    if (!Number.isInteger(parsedRoundNumber) || parsedRoundNumber <= 0) {
      setPublishError("Round number must be a positive number.");
      return;
    }

    setRebooking(true);
    setPublishError("");
    try {
      const nextRound: Omit<Round, "id" | "createdAt" | "updatedAt"> = {
        groupId: round.groupId,
        courseId: round.courseId,
        courseName: round.courseName,
        teeSetId: round.teeSetId,
        teeSetName: round.teeSetName,
        coursePar: round.coursePar,
        courseRating: round.courseRating,
        slopeRating: round.slopeRating,
        courseHoles: round.courseHoles,
        availableTeeSets: round.availableTeeSets,
        playerTeeAssignments: {},
        courseSource: round.courseSource,
        date: new Date(rebookDate),
        season: parsedSeason,
        roundNumber: parsedRoundNumber,
        format: round.format,
        status: "upcoming",
        notes: null,
        teeTimes: [],
        rsvpOpen: false,
        rsvpNotifiedAt: null,
        holeOverrides: [],
        specialHoles: round.specialHoles,
        scorecardsAvailable: true,
        resultsPublished: false,
        resultsPublishedAt: null,
        createdBy: appUser.uid,
      };
      const nextRoundId = await createRound(nextRound);
      router.push(`/admin/rounds/${nextRoundId}`);
    } catch {
      setPublishError(
        "Failed to create the re-booked round. Please try again."
      );
    } finally {
      setRebooking(false);
    }
  };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div
      className={`rounded-2xl shadow-sm border p-4 space-y-4 ${
        round.resultsPublished
          ? "bg-brand-50 border-brand-200"
          : "bg-surface-card border-surface-overlay"
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-ink-title">
            {round.resultsPublished ? "Official Results" : "Close This Round"}
          </h2>
          {!round.resultsPublished && (
            <p className="mt-0.5 text-xs text-ink-muted">
              {scorecards.length === 0
                ? "Waiting for players to submit scorecards."
                : `${
                    scorecards.filter((c) => c.status !== "in_progress").length
                  } of ${scorecards.length} scorecards submitted`}
            </p>
          )}
          {round.resultsPublished && round.resultsPublishedAt && (
            <p className="mt-0.5 text-xs text-brand-700">
              Published{" "}
              {format(round.resultsPublishedAt, "EEE d MMM yyyy h:mm a")}
            </p>
          )}
        </div>
        <Link
          href={`/admin/rounds/${round.id}/leaderboard`}
          className="shrink-0 text-xs text-brand-700 font-medium hover:underline"
        >
          Full detail →
        </Link>
      </div>

      {/* Standings */}
      {rankings.length === 0 ? (
        <p className="text-xs text-ink-hint">
          Once players submit scores they&apos;ll appear here.
        </p>
      ) : (
        <div className="divide-y divide-gray-100">
          {rankings.map((ranking) => {
            const card = cardsByPlayerId.get(ranking.playerId);
            return (
              <div
                key={ranking.playerId}
                className="flex items-center justify-between py-2 text-sm"
              >
                <div className="flex items-center gap-2">
                  <span className="w-6 text-xs text-ink-hint">
                    #{ranking.rank}
                  </span>
                  <div>
                    <span className="text-ink-body">{ranking.playerName}</span>
                    {ranking.countbackDetail && (
                      <p className="text-xs text-ink-hint">
                        {ranking.countbackDetail}
                      </p>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-ink-title">
                    {round.format === "stableford"
                      ? `${ranking.stablefordTotal} pts`
                      : `${ranking.grossTotal}`}
                  </p>
                  <p className="text-xs text-ink-hint">Hcp {ranking.handicap}</p>
                  {!round.resultsPublished &&
                    card &&
                    card.status !== "in_progress" && (
                      <button
                        type="button"
                        onClick={() => handleReopenCard(card.id)}
                        className="mt-0.5 text-xs text-brand-700 underline"
                      >
                        Re-open card
                      </button>
                    )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Side Winners — select before publishing */}
      {!round.resultsPublished && (
        <div className="space-y-3 border-t border-surface-overlay pt-3">
          <div>
            <p className="text-xs font-semibold text-ink-body">Side Winners</p>
            <p className="text-xs text-ink-hint mt-0.5">
              Select before publishing. Leave blank if a prize wasn&apos;t run.
            </p>
          </div>
          {(specialHoles?.ntp ?? []).map((holeNumber) => (
            <WinnerSelect
              key={holeNumber}
              label={`NTP - Hole ${holeNumber}`}
              value={sideWinnerIds[`ntp-${holeNumber}`] ?? ""}
              options={playerOptions}
              onChange={(id) =>
                onUpdateSideWinner(
                  `ntp-${holeNumber}`,
                  "ntp",
                  holeNumber,
                  id
                )
              }
            />
          ))}
          {specialHoles?.ld && (
            <WinnerSelect
              label={`Longest Drive - Hole ${specialHoles.ld}`}
              value={sideWinnerIds.ld ?? ""}
              options={playerOptions}
              onChange={(id) =>
                onUpdateSideWinner("ld", "ld", specialHoles.ld!, id)
              }
            />
          )}
          {specialHoles?.t2 && (
            <WinnerSelect
              label={`T2 - Hole ${specialHoles.t2}`}
              value={sideWinnerIds.t2 ?? ""}
              options={playerOptions}
              onChange={(id) =>
                onUpdateSideWinner("t2", "t2", specialHoles.t2!, id)
              }
            />
          )}
          {specialHoles?.t3 && (
            <WinnerSelect
              label={`T3 - Hole ${specialHoles.t3}`}
              value={sideWinnerIds.t3 ?? ""}
              options={playerOptions}
              onChange={(id) =>
                onUpdateSideWinner("t3", "t3", specialHoles.t3!, id)
              }
            />
          )}
        </div>
      )}

      {/* Publish */}
      {!round.resultsPublished && (
        <div className="border-t border-surface-overlay pt-3 space-y-2">
          {publishError && (
            <p className="text-xs font-medium text-red-600">{publishError}</p>
          )}
          <p className="text-xs text-ink-muted">
            Publishing saves official results, awards ladder points, locks all
            cards, and marks the round as Completed.
          </p>
          <button
            type="button"
            onClick={handlePublish}
            disabled={publishing || rankings.length === 0}
            className="w-full bg-brand-600 hover:bg-brand-700 disabled:bg-brand-300 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors"
          >
            {publishing ? "Publishing..." : "Publish Results"}
          </button>
        </div>
      )}

      {/* Re-book after publish */}
      {round.resultsPublished && (
        <div className="border-t border-brand-200 pt-3 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-ink-body">
                Re-book This Course
              </p>
              <p className="text-xs text-ink-hint">
                Create a new upcoming round from this course setup.
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                showRebookForm ? setShowRebookForm(false) : openRebookForm()
              }
              className="shrink-0 rounded-xl border border-surface-overlay bg-surface-card px-3 py-2 text-xs font-semibold text-brand-700 hover:bg-brand-50"
            >
              {showRebookForm ? "Hide" : "Re-book"}
            </button>
          </div>

          {showRebookForm && (
            <div className="space-y-3 border-t border-surface-overlay pt-3">
              <div className="rounded-xl border border-green-100 bg-brand-50 px-3 py-2">
                <p className="text-xs font-semibold text-brand-700">
                  Season handling
                </p>
                <p className="mt-0.5 text-xs text-brand-900">
                  Active season: {group?.currentSeason ?? round.season}. This
                  booking can be created in Season{" "}
                  {rebookSeason || suggestedRebookSeason} without changing the
                  active season.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-ink-body">
                    Date
                  </span>
                  <input
                    type="date"
                    value={rebookDate}
                    onChange={(e) => setRebookDate(e.target.value)}
                    className="w-full rounded-xl border border-surface-overlay px-3 py-2.5 text-sm text-ink-title focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-ink-body">
                    Season
                  </span>
                  <input
                    type="number"
                    min={group?.currentSeason ?? round.season}
                    value={rebookSeason}
                    onChange={(e) => {
                      const next = e.target.value;
                      setRebookSeason(next);
                      if (!rebookRoundNumberEdited) {
                        setRebookRoundNumber(
                          getSuggestedRoundNumberForSeason(groupRounds, next)
                        );
                      }
                    }}
                    className="w-full rounded-xl border border-surface-overlay px-3 py-2.5 text-sm text-ink-title focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-ink-body">
                    Round number
                  </span>
                  <input
                    type="number"
                    min={1}
                    value={rebookRoundNumber}
                    onChange={(e) => {
                      setRebookRoundNumber(e.target.value);
                      setRebookRoundNumberEdited(true);
                    }}
                    className="w-full rounded-xl border border-surface-overlay px-3 py-2.5 text-sm text-ink-title focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </label>
              </div>

              <p className="text-xs text-ink-hint">
                Suggested round number for Season{" "}
                {rebookSeason || suggestedRebookSeason}:{" "}
                {suggestedRoundNumberForSeason}. Course data, tee set, pars,
                distances, and prize holes will be copied.
              </p>

              {publishError && (
                <p className="text-xs font-medium text-red-600">
                  {publishError}
                </p>
              )}

              <button
                type="button"
                onClick={handleRebook}
                disabled={rebooking}
                className="w-full rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:bg-brand-300"
              >
                {rebooking ? "Creating..." : "Create re-booked round"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
