"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { format } from "date-fns";
import {
  createRound,
  getRound,
  getScorecardsForRound,
  getActiveMembers,
  getGroup,
  getHoleScores,
  updateScorecard,
  getResultsForRound,
  getSideClaimsForRound,
  setSideClaim,
  subscribeRoundsForGroup,
  subscribeHoleScores,
  subscribeResultsForRound,
  subscribeRound,
  subscribeScorecardsForRound,
  subscribeSideClaimsForRound,
  publishRoundResultsWithStage3,
} from "@/lib/firestore";
import { useAuth } from "@/contexts/AuthContext";
import { getEffectiveSpecialHoles } from "@/lib/courseData";
import { buildPlayerRankings } from "@/lib/results";
import type {
  Round,
  Scorecard,
  AppUser,
  Results,
  SideResult,
  PlayerRanking,
  SideClaim,
  SidePrizeType,
  HoleScore,
  Group,
} from "@/types";

function getSuggestedRoundNumberForSeason(
  rounds: Round[],
  seasonValue: string
) {
  const parsedSeason = parseInt(seasonValue, 10);
  if (!Number.isFinite(parsedSeason)) return "1";

  const highestRoundNumber = rounds
    .filter((groupRound) => groupRound.season === parsedSeason)
    .reduce(
      (highest, groupRound) => Math.max(highest, groupRound.roundNumber),
      0
    );

  return String(highestRoundNumber + 1);
}

export default function AdminRoundLeaderboardPage() {
  const { roundId } = useParams<{ roundId: string }>();
  const { appUser } = useAuth();
  const router = useRouter();
  const [round, setRound] = useState<Round | null>(null);
  const [groupRounds, setGroupRounds] = useState<Round[]>([]);
  const [cards, setCards] = useState<Scorecard[]>([]);
  const [holeScoresByCardId, setHoleScoresByCardId] = useState<
    Record<string, HoleScore[]>
  >({});
  const [members, setMembers] = useState<AppUser[]>([]);
  const [group, setGroup] = useState<Group | null>(null);
  const [results, setResults] = useState<Results | null>(null);
  const [sideWinnerIds, setSideWinnerIds] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [rebooking, setRebooking] = useState(false);
  const [showRebookForm, setShowRebookForm] = useState(false);
  const [rebookDate, setRebookDate] = useState("");
  const [rebookSeason, setRebookSeason] = useState("");
  const [rebookRoundNumber, setRebookRoundNumber] = useState("");
  const [rebookRoundNumberEdited, setRebookRoundNumberEdited] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!roundId) return;
    return subscribeRound(
      roundId,
      (nextRound) => {
        setRound(nextRound);
        if (!nextRound) {
          setCards([]);
          setHoleScoresByCardId({});
        }
      },
      (err) => console.warn("Unable to subscribe to round updates", err)
    );
  }, [roundId]);

  useEffect(() => {
    if (!roundId) return;
    return subscribeResultsForRound(
      roundId,
      setResults,
      (err) => console.warn("Unable to subscribe to results", err)
    );
  }, [roundId]);

  useEffect(() => {
    if (!roundId) return;
    return subscribeScorecardsForRound(
      roundId,
      setCards,
      (err) => console.warn("Unable to subscribe to scorecards", err)
    );
  }, [roundId]);

  useEffect(() => {
    if (cards.length === 0) {
      setHoleScoresByCardId({});
      return;
    }

    const activeCardIds = new Set(cards.map((card) => card.id));
    setHoleScoresByCardId((current) =>
      Object.fromEntries(
        Object.entries(current).filter(([cardId]) => activeCardIds.has(cardId))
      )
    );

    const unsubscribers = cards.map((card) =>
      subscribeHoleScores(
        card.id,
        (scores) =>
          setHoleScoresByCardId((current) => ({
            ...current,
            [card.id]: scores,
          })),
        (err) =>
          console.warn(`Unable to subscribe to hole scores for ${card.id}`, err)
      )
    );

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [cards]);

  useEffect(() => {
    if (!roundId) return;
    const load = async () => {
      setLoading(true);
      try {
        const [r, activeMembers, existingResults, groupRecord] = await Promise.all([
          getRound(roundId),
          getActiveMembers(appUser?.groupId ?? "fourplay"),
          getResultsForRound(roundId),
          getGroup(appUser?.groupId),
        ]);
        if (!r) {
          setRound(null);
          setCards([]);
          setHoleScoresByCardId({});
          setMembers([]);
          setGroup(groupRecord);
        } else {
          setRound(r);
          const [c, claims] = await Promise.all([
            getScorecardsForRound(r.id),
            getSideClaimsForRound(r.id),
          ]);
          const holeEntries = await Promise.all(
            c.map(async (card) => [card.id, await getHoleScores(card.id)] as const)
          );
          setCards(c);
          setHoleScoresByCardId(Object.fromEntries(holeEntries));
          setSideWinnerIds(buildSideWinnerMap(claims));
          setMembers(activeMembers);
          setGroup(groupRecord);
          setResults(existingResults);
        }
      } catch {
        setError("Failed to load leaderboard.");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [roundId, appUser?.groupId]);

  useEffect(() => {
    if (!roundId) return;
    return subscribeSideClaimsForRound(
      roundId,
      (claims) => setSideWinnerIds(buildSideWinnerMap(claims)),
      (err) => console.warn("Unable to subscribe to side claims", err)
    );
  }, [roundId]);

  useEffect(() => {
    if (!appUser?.groupId) return;
    return subscribeRoundsForGroup(
      appUser.groupId,
      setGroupRounds,
      (err) => console.warn("Unable to subscribe to group rounds", err)
    );
  }, [appUser?.groupId]);

  const rankings = useMemo(
    () =>
      round
        ? buildPlayerRankings({
            round,
            scorecards: cards,
            holeScoresByCardId,
            members,
            settings: group?.settings,
          })
        : [],
    [cards, group?.settings, holeScoresByCardId, members, round]
  );
  const suggestedRebookSeason = useMemo(() => {
    if (!round) return String(group?.currentSeason ?? new Date().getFullYear());

    return String(
      Math.max(round.season + 1, group?.currentSeason ?? round.season)
    );
  }, [group?.currentSeason, round]);
  const suggestedRebookDate = useMemo(() => {
    if (!round) return "";

    const nextDate = new Date(round.date);
    nextDate.setFullYear(nextDate.getFullYear() + 1);
    return format(nextDate, "yyyy-MM-dd");
  }, [round]);
  const suggestedRoundNumberForSeason = useMemo(() => {
    return getSuggestedRoundNumberForSeason(
      groupRounds,
      rebookSeason || suggestedRebookSeason
    );
  }, [groupRounds, rebookSeason, suggestedRebookSeason]);
  const cardsByPlayerId = useMemo(
    () => new Map(cards.map((card) => [card.playerId, card])),
    [cards]
  );

  const getPlayerName = (playerId: string) =>
    members.find((u) => u.uid === playerId)?.displayName ??
    `Player ${playerId.slice(0, 6)}`;

  const playerOptions = members
    .map((member) => ({
      id: member.uid,
      name: member.displayName,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const specialHoles = round ? getEffectiveSpecialHoles(round) : null;

  const buildRankings = (): PlayerRanking[] => {
    return rankings;
  };

  const openRebookForm = () => {
    setShowRebookForm(true);
    setRebookDate(suggestedRebookDate);
    setRebookSeason(suggestedRebookSeason);
    setRebookRoundNumber(
      getSuggestedRoundNumberForSeason(groupRounds, suggestedRebookSeason)
    );
    setRebookRoundNumberEdited(false);
    setError("");
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
          ntp: (specialHoles?.ntp ?? []).map((holeNumber) =>
            buildSideResult(`ntp-${holeNumber}`, holeNumber)
          ),
          ld: buildSideResult("ld", specialHoles?.ld ?? null),
          t2: buildSideResult("t2", specialHoles?.t2 ?? null),
          t3: buildSideResult("t3", specialHoles?.t3 ?? null),
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
      openRebookForm();
    } catch {
      setError("Failed to publish results. Please try again.");
    } finally {
      setPublishing(false);
    }
  };

  const handleRebook = async () => {
    if (!round || !appUser) return;

    const parsedSeason = parseInt(rebookSeason, 10);
    const parsedRoundNumber = parseInt(rebookRoundNumber, 10);
    const activeSeason = group?.currentSeason ?? round.season;

    if (!rebookDate) {
      setError("Select the new booking date.");
      return;
    }

    if (!Number.isInteger(parsedSeason) || parsedSeason < activeSeason) {
      setError(`Season must be ${activeSeason} or later.`);
      return;
    }

    if (!Number.isInteger(parsedRoundNumber) || parsedRoundNumber <= 0) {
      setError("Round number must be a positive number.");
      return;
    }

    setRebooking(true);
    setError("");

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
        resultsPublished: false,
        resultsPublishedAt: null,
        createdBy: appUser.uid,
      };

      const nextRoundId = await createRound(nextRound);
      router.push(`/admin/rounds/${nextRoundId}`);
    } catch {
      setError("Failed to create the re-booked round. Please try again.");
    } finally {
      setRebooking(false);
    }
  };

  const updateSideWinner = async (
    key: string,
    prizeType: SidePrizeType,
    holeNumber: number,
    winnerId: string
  ) => {
    if (!round || !appUser) return;
    setSideWinnerIds((prev) => ({
      ...prev,
      [key]: winnerId,
    }));
    await setSideClaim({
      round,
      prizeType,
      holeNumber,
      winnerId,
      updatedBy: appUser,
      members,
    });
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
            {rankings.length === 0
              ? "No completed cards yet"
              : "Top 10 players"}
          </h2>
          <span className="text-xs text-gray-400">
            Format:{" "}
            {round.format === "stableford" ? "Stableford" : "Stroke"}
          </span>
        </div>

        {rankings.length === 0 ? (
          <p className="text-xs text-gray-400">
            Once players submit scores, they&apos;ll appear here.
          </p>
        ) : (
          <div className="divide-y divide-gray-100">
            {rankings.slice(0, 10).map((ranking) => {
              const card = cardsByPlayerId.get(ranking.playerId);
              return (
              <div
                key={ranking.playerId}
                className="flex items-center justify-between py-2 text-sm"
              >
                <div className="flex items-center gap-2">
                  <span className="w-6 text-xs text-gray-400">
                    #{ranking.rank}
                  </span>
                  <div>
                    <span className="text-gray-700">
                      {ranking.playerName}
                    </span>
                    {ranking.countbackDetail && (
                      <p className="text-[11px] text-gray-400">
                        {ranking.countbackDetail}
                      </p>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-gray-800">
                    {round.format === "stableford"
                      ? ranking.stablefordTotal
                      : ranking.grossTotal}
                  </p>
                  <p className="text-[11px] text-gray-400">
                    Hcp {ranking.handicap}
                  </p>
                  {!round.resultsPublished &&
                    card &&
                    card.status !== "in_progress" && (
                      <button
                        type="button"
                        onClick={() => handleReopenCard(card.id)}
                        className="mt-1 text-[11px] text-green-700 underline"
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
      </div>

      {!round.resultsPublished && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-3">
          <h2 className="font-semibold text-gray-800 text-sm">Side Winners</h2>
          <p className="text-xs text-gray-500">
            Select winners before publishing. Blank winners are allowed if a prize was not run.
          </p>
          {(specialHoles?.ntp ?? []).map((holeNumber) => (
            <WinnerSelect
              key={holeNumber}
              label={`NTP - Hole ${holeNumber}`}
              value={sideWinnerIds[`ntp-${holeNumber}`] ?? ""}
              options={playerOptions}
              onChange={(winnerId) =>
                updateSideWinner(`ntp-${holeNumber}`, "ntp", holeNumber, winnerId)
              }
            />
          ))}
          {specialHoles?.ld && (
            <WinnerSelect
              label={`Longest Drive - Hole ${specialHoles.ld}`}
              value={sideWinnerIds.ld ?? ""}
              options={playerOptions}
              onChange={(winnerId) =>
                updateSideWinner("ld", "ld", specialHoles.ld!, winnerId)
              }
            />
          )}
          {specialHoles?.t2 && (
            <WinnerSelect
              label={`T2 - Hole ${specialHoles.t2}`}
              value={sideWinnerIds.t2 ?? ""}
              options={playerOptions}
              onChange={(winnerId) =>
                updateSideWinner("t2", "t2", specialHoles.t2!, winnerId)
              }
            />
          )}
          {specialHoles?.t3 && (
            <WinnerSelect
              label={`T3 - Hole ${specialHoles.t3}`}
              value={sideWinnerIds.t3 ?? ""}
              options={playerOptions}
              onChange={(winnerId) =>
                updateSideWinner("t3", "t3", specialHoles.t3!, winnerId)
              }
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
                <div>
                  <span>
                    #{ranking.rank} {ranking.playerName}
                  </span>
                  {ranking.countbackDetail && (
                    <p className="text-[11px] text-green-700">
                      {ranking.countbackDetail}
                    </p>
                  )}
                </div>
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

      {round.resultsPublished && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold text-gray-800 text-sm">
                Re-book This Course
              </h2>
              <p className="text-xs text-gray-500">
                Create a new upcoming round from this course setup for a future
                season or the following year.
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                showRebookForm ? setShowRebookForm(false) : openRebookForm()
              }
              className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-green-700 transition-colors hover:bg-green-50"
            >
              {showRebookForm ? "Hide" : "Re-book course"}
            </button>
          </div>

          {showRebookForm && (
            <div className="space-y-3 border-t border-gray-100 pt-3">
              <div className="rounded-xl border border-green-100 bg-green-50 px-3 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-green-700">
                  Season handling
                </p>
                <p className="mt-1 text-xs text-green-900">
                  Active season: {group?.currentSeason ?? round.season}. This
                  booking can still be created in Season{" "}
                  {rebookSeason || suggestedRebookSeason} without changing the
                  active season first.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-gray-700">
                    Date
                  </span>
                  <input
                    type="date"
                    value={rebookDate}
                    onChange={(event) => setRebookDate(event.target.value)}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-gray-700">
                    Season
                  </span>
                  <input
                    type="number"
                    min={group?.currentSeason ?? round.season}
                    value={rebookSeason}
                    onChange={(event) => {
                      const nextSeason = event.target.value;
                      setRebookSeason(nextSeason);
                      if (!rebookRoundNumberEdited) {
                        setRebookRoundNumber(
                          getSuggestedRoundNumberForSeason(
                            groupRounds,
                            nextSeason
                          )
                        );
                      }
                    }}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-gray-700">
                    Round number
                  </span>
                  <input
                    type="number"
                    min={1}
                    value={rebookRoundNumber}
                    onChange={(event) => {
                      setRebookRoundNumber(event.target.value);
                      setRebookRoundNumberEdited(true);
                    }}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </label>
              </div>

              <p className="text-xs text-gray-500">
                Date and round number are editable. The round number shown here
                is only a suggestion.
              </p>

              <p className="text-xs text-gray-500">
                Suggested round number for Season{" "}
                {rebookSeason || suggestedRebookSeason}:{" "}
                {suggestedRoundNumberForSeason}. Course data, tee set, pars,
                distances, and prize holes will be copied. Tee times, player
                assignments, overrides, and results will not.
              </p>

              <button
                type="button"
                onClick={handleRebook}
                disabled={rebooking}
                className="w-full rounded-xl bg-green-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-green-700 disabled:bg-green-300"
              >
                {rebooking
                  ? "Creating re-booked round..."
                  : "Create re-booked round"}
              </button>
            </div>
          )}
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
          disabled={publishing || round.resultsPublished || rankings.length === 0}
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

function buildSideWinnerMap(claims: SideClaim[]) {
  return claims.reduce<Record<string, string>>((claimMap, claim) => {
    const key =
      claim.prizeType === "ntp"
        ? `ntp-${claim.holeNumber}`
        : claim.prizeType;
    if (claim.winnerId) claimMap[key] = claim.winnerId;
    return claimMap;
  }, {});
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
