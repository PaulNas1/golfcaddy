"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { format } from "date-fns";
import Link from "next/link";
import TeeTimesEditor, { type TeeTimeDraftValue } from "@/components/TeeTimesEditor";
import {
  getGolfCourseCatalogueCourse,
  searchGolfCourseCatalogue,
} from "@/lib/courseCatalogueClient";
import {
  createNotificationsForUsers,
  createRound,
  deleteRoundCascade,
  getActiveMembers,
  getGroup,
  getResultsForRound,
  getRound,
  getRoundRsvps,
  getSideClaimsForRound,
  notifyRoundPlayers,
  publishRoundResultsWithStage3,
  saveCourseCorrection,
  setSideClaim,
  subscribeHoleScores,
  subscribeResultsForRound,
  subscribeRoundRsvps,
  subscribeRoundsForGroup,
  subscribeScorecardsForRound,
  subscribeSideClaimsForRound,
  updateRound,
  updateScorecard,
  getScorecardsForRound,
} from "@/lib/firestore";
import { buildPlayerRankings } from "@/lib/results";
import { useAuth } from "@/contexts/AuthContext";
import {
  type SeededCourse,
  getCourseSearchLabel,
  getDriveHoleOptions,
  getEffectiveSpecialHoles,
  getFallbackCourseHoles,
  getHoleOptionLabel,
  getParThreeHoles,
  getPreferredDefaultTeeSet,
  getRoundTeeSets,
} from "@/lib/courseData";
import { CourseCardPreview } from "@/components/CourseCardPreview";
import { getRoundLabel } from "@/lib/roundDisplay";
import {
  formatShortMemberName,
  getTeeTimeGroupLabel,
  normaliseTeeTimePlayerIds,
  randomiseMemberGroups,
  resolveMemberIdsFromText,
} from "@/lib/teeTimes";
import type {
  AppUser,
  CourseTeeSet,
  Group,
  HoleOverride,
  HoleScore,
  Results,
  Round,
  RoundStatus,
  RoundRsvp,
  Scorecard,
  SideClaim,
  SidePrizeType,
  SideResult,
  ScoringFormat,
  TeeTime,
} from "@/types";

const DATE_INPUT_CLASSNAME =
  "block h-[42px] w-full min-w-0 max-w-full appearance-none rounded-xl border border-gray-200 bg-white px-3 text-left text-sm leading-[42px] text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500 [&::-webkit-date-and-time-value]:block [&::-webkit-date-and-time-value]:min-w-0 [&::-webkit-date-and-time-value]:text-left";

function mergeTeeSets(...groups: Array<CourseTeeSet[] | null | undefined>) {
  const merged = new Map<string, CourseTeeSet>();

  groups.forEach((group) => {
    group?.forEach((teeSet) => {
      merged.set(teeSet.id, teeSet);
    });
  });

  return Array.from(merged.values());
}

function extractGolfCourseApiId(
  courseId: string | null | undefined,
  teeSetId: string | null | undefined
) {
  const courseMatch = courseId?.match(/^golfcourseapi-(\d+)$/);
  if (courseMatch) return Number(courseMatch[1]);

  const teeSetMatch = teeSetId?.match(/^golfcourseapi-(\d+)-/);
  if (teeSetMatch) return Number(teeSetMatch[1]);

  return null;
}

function getRoundAlertRecipientIds(
  round: Round,
  rsvps: RoundRsvp[],
  teeTimes: TeeTime[]
) {
  const ids = new Set<string>();

  rsvps
    .filter((rsvp) => rsvp.status === "accepted")
    .forEach((rsvp) => ids.add(rsvp.memberId));

  teeTimes.forEach((teeTime) => {
    teeTime.playerIds.forEach((playerId) => ids.add(playerId));
  });

  if (ids.size === 0) {
    round.teeTimes.forEach((teeTime) => {
      teeTime.playerIds.forEach((playerId) => ids.add(playerId));
    });
  }

  return Array.from(ids);
}

function getTeeTimeSignature(teeTimes: TeeTime[]) {
  return JSON.stringify(
    teeTimes.map((teeTime) => ({
      id: teeTime.id,
      time: teeTime.time,
      playerIds: [...teeTime.playerIds].sort(),
      guestNames: [...teeTime.guestNames].sort(),
      notes: teeTime.notes ?? null,
    }))
  );
}

export default function AdminRoundDetailPage() {
  const { roundId } = useParams<{ roundId: string }>();
  const router = useRouter();
  const { appUser } = useAuth();
  const [round, setRound] = useState<Round | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [success, setSuccess] = useState("");
  const [detailsError, setDetailsError] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [scorecards, setScorecards] = useState<Scorecard[]>([]);
  const [holeScoresByCardId, setHoleScoresByCardId] = useState<Record<string, HoleScore[]>>({});
  const [results, setResults] = useState<Results | null>(null);
  const [sideWinnerIds, setSideWinnerIds] = useState<Record<string, string>>({});
  const [group, setGroup] = useState<Group | null>(null);
  const [groupRounds, setGroupRounds] = useState<Round[]>([]);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState("");
  const [rebooking, setRebooking] = useState(false);
  const [showRebookForm, setShowRebookForm] = useState(false);
  const [rebookDate, setRebookDate] = useState("");
  const [rebookSeason, setRebookSeason] = useState("");
  const [rebookRoundNumber, setRebookRoundNumber] = useState("");
  const [rebookRoundNumberEdited, setRebookRoundNumberEdited] = useState(false);
  const [courseCorrectionsOpen, setCourseCorrectionsOpen] = useState(false);
  const [editingOverride, setEditingOverride] = useState<HoleOverride | null>(
    null
  );
  const [strokeIndexDrafts, setStrokeIndexDrafts] = useState<Record<number, string>>({});
  const [editingStrokeIndexes, setEditingStrokeIndexes] = useState(false);
  const [savingStrokeIndexes, setSavingStrokeIndexes] = useState(false);
  const [savingCorrectionLibrary, setSavingCorrectionLibrary] = useState(false);
  const [correctionLibrarySaved, setCorrectionLibrarySaved] = useState(false);
  const [editingRatingSlope, setEditingRatingSlope] = useState(false);
  const [courseRatingDraft, setCourseRatingDraft] = useState("");
  const [slopeRatingDraft, setSlopeRatingDraft] = useState("");
  const [savingRatingSlope, setSavingRatingSlope] = useState(false);
  const [apiCourses, setApiCourses] = useState<SeededCourse[]>([]);
  const [apiCourseLoading, setApiCourseLoading] = useState(false);
  const [apiCourseError, setApiCourseError] = useState("");
  const [courseSearchActive, setCourseSearchActive] = useState(false);
  const [members, setMembers] = useState<AppUser[]>([]);
  const [rsvps, setRsvps] = useState<RoundRsvp[]>([]);
  const [rsvpsReady, setRsvpsReady] = useState(false);
  const [courseId, setCourseId] = useState("");
  const [teeSetId, setTeeSetId] = useState("");
  const [courseName, setCourseName] = useState("");
  const [roundNumber, setRoundNumber] = useState<string>("");
  const [date, setDate] = useState("");
  const [formatChoice, setFormatChoice] =
    useState<ScoringFormat>("stableford");
  const [notes, setNotes] = useState("");
  const [ldHole, setLdHole] = useState("");
  const [t2Hole, setT2Hole] = useState("");
  const [t3Hole, setT3Hole] = useState("");
  const [playerTeeAssignments, setPlayerTeeAssignments] = useState<
    Record<string, string>
  >({});
  const [showTeeAssignments, setShowTeeAssignments] = useState(false);
  const [teeTimes, setTeeTimes] = useState<TeeTimeDraftValue[]>([
    { time: "", notes: "", playerIds: [], guestNames: [] },
  ]);
  const selectedCourse = useMemo(() => {
    const apiCourseById = apiCourses.find((course) => course.id === courseId);
    const apiCourseByName = apiCourses.find(
      (course) => course.name === courseName
    );

    return apiCourseById ?? apiCourseByName ?? null;
  }, [apiCourses, courseId, courseName]);
  const courseTeeSets = useMemo(
    () => mergeTeeSets(selectedCourse?.teeSets, round ? getRoundTeeSets(round) : []),
    [round, selectedCourse?.teeSets]
  );
  const selectedTeeSet =
    courseTeeSets.find((teeSet) => teeSet.id === teeSetId) ?? null;
  const apiCourseSuggestions = useMemo(
    () =>
      apiCourses.filter(
        (course) => course.id !== selectedCourse?.id
      ),
    [apiCourses, selectedCourse?.id]
  );
  const showCourseSuggestions =
    courseSearchActive && apiCourseSuggestions.length > 0;
  const holeOptions =
    selectedTeeSet?.holes ??
    (round?.courseHoles && round.courseHoles.length === 18
      ? round.courseHoles
      : getFallbackCourseHoles());
  const driveHoleOptions = getDriveHoleOptions(holeOptions);
  const refreshableTeeSet =
    selectedTeeSet ?? getPreferredDefaultTeeSet(selectedCourse?.teeSets ?? []) ?? null;
  const acceptedMemberIds = useMemo(
    () =>
      rsvps
        .filter((rsvp) => rsvp.status === "accepted")
        .map((rsvp) => rsvp.memberId),
    [rsvps]
  );
  const acceptedMembers = useMemo(() => {
    const acceptedIds = new Set(acceptedMemberIds);
    return members.filter((member) => acceptedIds.has(member.uid));
  }, [acceptedMemberIds, members]);
  const assignmentTeeSets = useMemo(
    () =>
      mergeTeeSets(
        courseTeeSets,
        round?.availableTeeSets,
        selectedCourse?.teeSets
      ),
    [courseTeeSets, round?.availableTeeSets, selectedCourse?.teeSets]
  );
  const teeReviewMembers = acceptedMembers.filter(
    (member) =>
      needsTeeReview(member) &&
      !playerTeeAssignments[member.uid]
  );
  const teeOverrideCount = Object.values(playerTeeAssignments).filter(Boolean)
    .length;

  const applyCourse = (course: SeededCourse) => {
    const defaultTeeSet = getPreferredDefaultTeeSet(course.teeSets);
    setApiCourses([course]);
    setCourseSearchActive(false);
    setCourseId(course.id);
    setTeeSetId(defaultTeeSet?.id ?? "");
    setCourseName(course.name);
    setLdHole("");
    setT2Hole("");
    setT3Hole("");
  };

  const applyApiCourse = async (course: SeededCourse) => {
    let courseToApply = course;

    if (course.apiId && course.teeSets.length === 0) {
      setApiCourseLoading(true);
      setApiCourseError("");
      const result = await getGolfCourseCatalogueCourse(course.apiId);
      setApiCourseLoading(false);

      if (result.course) {
        courseToApply = result.course;
        setApiCourses((current) => [
          result.course!,
          ...current.filter((item) => item.id !== course.id),
        ]);
      } else {
        setApiCourseError(
          result.error ?? "Could not load tee data for that course."
        );
        return;
      }
    }

    if (courseToApply.teeSets.length === 0) {
      setApiCourseError("That course does not include 18-hole tee data.");
      return;
    }

    applyCourse(courseToApply);
  };

  const handleCourseNameChange = (value: string) => {
    setCourseSearchActive(true);
    setCourseName(value);
    setCourseId("");
    setTeeSetId("");
  };

  useEffect(() => {
    const query = courseName.trim();

    if (!courseSearchActive) {
      setApiCourseError("");
      setApiCourseLoading(false);
      return;
    }

    if (query.length < 3) {
      setApiCourses([]);
      setApiCourseError("");
      setApiCourseLoading(false);
      return;
    }
    if (selectedCourse?.name === query) {
      setApiCourseError("");
      setApiCourseLoading(false);
      return;
    }

    let cancelled = false;
    setApiCourseLoading(true);
    const timeout = window.setTimeout(async () => {
      const result = await searchGolfCourseCatalogue(query);
      if (cancelled) return;

      setApiCourses(result.courses.slice(0, 6));
      setApiCourseError(result.error ?? "");
      setApiCourseLoading(false);
    }, 600);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [courseName, courseSearchActive, selectedCourse?.name]);

  const loadScorecards = async (r: Round) => {
    const cards = await getScorecardsForRound(r.id);
    setScorecards(cards);
  };

  useEffect(() => {
    if (roundId) {
      Promise.all([
        getRound(roundId),
        getActiveMembers(appUser?.groupId ?? "fourplay"),
        getRoundRsvps(roundId),
        getGroup(appUser?.groupId),
        getResultsForRound(roundId),
        getSideClaimsForRound(roundId),
      ]).then(([r, activeMembers, roundRsvps, groupRecord, existingResults, claims]) => {
        setMembers(activeMembers);
        setRsvps(roundRsvps);
        setRsvpsReady(true);
        setGroup(groupRecord);
        setResults(existingResults);
        setSideWinnerIds(buildSideWinnerMap(claims));
        setRound(r);
        if (r && r.holeOverrides.length > 0) setCourseCorrectionsOpen(true);
        setLoading(false);
        if (r) {
          setCourseId(r.courseId);
          setTeeSetId(r.teeSetId ?? "");
          setCourseName(r.courseName);
          setRoundNumber(String(r.roundNumber));
          setDate(format(r.date, "yyyy-MM-dd"));
          setFormatChoice(r.format);
          setNotes(r.notes ?? "");
          setLdHole(r.specialHoles.ld ? String(r.specialHoles.ld) : "");
          setT2Hole(r.specialHoles.t2 ? String(r.specialHoles.t2) : "");
          setT3Hole(r.specialHoles.t3 ? String(r.specialHoles.t3) : "");
          setPlayerTeeAssignments(r.playerTeeAssignments ?? {});
          if (r.courseHoles && r.courseHoles.length === 18) {
            const drafts: Record<number, string> = {};
            r.courseHoles.forEach((h) => { drafts[h.number] = String(h.strokeIndex); });
            setStrokeIndexDrafts(drafts);
          }
          setTeeTimes(
            r.teeTimes && r.teeTimes.length > 0
              ? r.teeTimes.map((t) => ({
                  time: t.time,
                  notes: t.notes ?? "",
                  playerIds: normaliseTeeTimePlayerIds(t, activeMembers),
                  guestNames: t.guestNames ?? [],
                }))
              : [{ time: "", notes: "", playerIds: [], guestNames: [] }]
          );
          loadScorecards(r);
        }
      });
    }
  }, [appUser?.groupId, roundId]);

  useEffect(() => {
    if (!roundId) return;

    return subscribeRoundRsvps(
      roundId,
      (nextRsvps) => {
        setRsvps(nextRsvps);
        setRsvpsReady(true);
      },
      (err) => console.warn("Unable to subscribe to RSVP updates", err)
    );
  }, [roundId]);

  useEffect(() => {
    if (!roundId) return;
    return subscribeScorecardsForRound(
      roundId,
      setScorecards,
      (err) => console.warn("Unable to subscribe to scorecards", err)
    );
  }, [roundId]);

  useEffect(() => {
    if (scorecards.length === 0) {
      setHoleScoresByCardId({});
      return;
    }
    const activeCardIds = new Set(scorecards.map((c) => c.id));
    setHoleScoresByCardId((current) =>
      Object.fromEntries(Object.entries(current).filter(([id]) => activeCardIds.has(id)))
    );
    const unsubs = scorecards.map((card) =>
      subscribeHoleScores(
        card.id,
        (scores) => setHoleScoresByCardId((current) => ({ ...current, [card.id]: scores })),
        (err) => console.warn(`Unable to subscribe to hole scores for ${card.id}`, err)
      )
    );
    return () => unsubs.forEach((u) => u());
  }, [scorecards]);

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

  useEffect(() => {
    if (!rsvpsReady) return;

    const acceptedIds = new Set(acceptedMemberIds);

    setTeeTimes((current) => {
      let changed = false;
      const next = current.map((teeTime) => {
        const playerIds = teeTime.playerIds.filter((playerId) =>
          acceptedIds.has(playerId)
        );
        if (playerIds.length === teeTime.playerIds.length) {
          return teeTime;
        }

        changed = true;
        return {
          ...teeTime,
          playerIds,
          notes: getTeeTimeGroupLabel(playerIds, teeTime.guestNames, members),
        };
      });

      return changed ? next : current;
    });

    setPlayerTeeAssignments((current) => {
      const next = Object.fromEntries(
        Object.entries(current).filter(([uid]) => acceptedIds.has(uid))
      );
      return Object.keys(next).length === Object.keys(current).length
        ? current
        : next;
    });
  }, [acceptedMemberIds, members, rsvpsReady]);

  useEffect(() => {
    if (!round) return;

    const existingTeeSets = getRoundTeeSets(round);
    if (existingTeeSets.length > 1) return;

    const apiId = extractGolfCourseApiId(round.courseId, round.teeSetId);
    if (!apiId) return;

    let cancelled = false;
    setApiCourseLoading(true);

    getGolfCourseCatalogueCourse(apiId)
      .then((result) => {
        if (cancelled) return;

        if (result.course && result.course.teeSets.length > 0) {
          setApiCourses((current) => [
            result.course!,
            ...current.filter((course) => course.id !== result.course!.id),
          ]);
          setApiCourseError("");
        } else if (result.error) {
          setApiCourseError(result.error);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setApiCourseError("Could not load tee data for that course.");
        }
      })
      .finally(() => {
        if (!cancelled) setApiCourseLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [round]);

  const rankings = useMemo(
    () =>
      round
        ? buildPlayerRankings({
            round,
            scorecards,
            holeScoresByCardId,
            members,
            settings: group?.settings,
          })
        : [],
    [round, scorecards, holeScoresByCardId, members, group?.settings]
  );

  const suggestedRebookSeason = useMemo(() => {
    if (!round) return String(group?.currentSeason ?? new Date().getFullYear());
    return String(Math.max(round.season + 1, group?.currentSeason ?? round.season));
  }, [group?.currentSeason, round]);

  const suggestedRebookDate = useMemo(() => {
    if (!round) return "";
    const nextDate = new Date(round.date);
    nextDate.setFullYear(nextDate.getFullYear() + 1);
    return format(nextDate, "yyyy-MM-dd");
  }, [round]);

  const suggestedRoundNumberForSeason = useMemo(
    () => getSuggestedRoundNumberForSeason(groupRounds, rebookSeason || suggestedRebookSeason),
    [groupRounds, rebookSeason, suggestedRebookSeason]
  );

  const specialHoles = round ? getEffectiveSpecialHoles(round) : null;
  const cardsByPlayerId = useMemo(() => new Map(scorecards.map((c) => [c.playerId, c])), [scorecards]);

  const getPlayerName = (playerId: string) =>
    members.find((u) => u.uid === playerId)?.displayName ?? `Player ${playerId.slice(0, 6)}`;

  const playingMemberIds = useMemo(() => {
    const ids = new Set<string>();
    rsvps.filter((r) => r.status === "accepted").forEach((r) => ids.add(r.memberId));
    (round?.teeTimes ?? []).forEach((tt) => tt.playerIds.forEach((id) => ids.add(id)));
    return ids;
  }, [rsvps, round?.teeTimes]);

  const playerOptions = useMemo(
    () =>
      members
        .filter((m) => playingMemberIds.has(m.uid))
        .map((m) => ({ id: m.uid, name: m.displayName }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [members, playingMemberIds]
  );

  const buildSideResult = (key: string, holeNumber: number | null): SideResult => {
    const winnerId = sideWinnerIds[key] || null;
    return { holeNumber: holeNumber ?? 0, winnerId, winnerName: winnerId ? getPlayerName(winnerId) : null };
  };

  const openRebookForm = () => {
    setShowRebookForm(true);
    setRebookDate(suggestedRebookDate);
    setRebookSeason(suggestedRebookSeason);
    setRebookRoundNumber(getSuggestedRoundNumberForSeason(groupRounds, suggestedRebookSeason));
    setRebookRoundNumberEdited(false);
    setPublishError("");
  };

  const handlePublish = async () => {
    if (!round) return;
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
          ntp: (specialHoles?.ntp ?? []).map((h) => buildSideResult(`ntp-${h}`, h)),
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
      setRound({ ...round, status: "completed", resultsPublished: true, resultsPublishedAt: publishedAt });
      setResults(published.officialResults);
      setScorecards((prev) => prev.map((c) => ({ ...c, status: "admin_locked", signedOff: true })));
      openRebookForm();
    } catch {
      setPublishError("Failed to publish results. Please try again.");
    } finally {
      setPublishing(false);
    }
  };

  const handleRebook = async () => {
    if (!round || !appUser) return;
    const parsedSeason = parseInt(rebookSeason, 10);
    const parsedRoundNumber = parseInt(rebookRoundNumber, 10);
    const activeSeason = group?.currentSeason ?? round.season;
    if (!rebookDate) { setPublishError("Select the new booking date."); return; }
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
      setPublishError("Failed to create the re-booked round. Please try again.");
    } finally {
      setRebooking(false);
    }
  };

  const updateSideWinner = async (key: string, prizeType: SidePrizeType, holeNumber: number, winnerId: string) => {
    if (!round || !appUser) return;
    setSideWinnerIds((prev) => ({ ...prev, [key]: winnerId }));
    await setSideClaim({ round, prizeType, holeNumber, winnerId, updatedBy: appUser, members });
  };

  const handleReopenCard = async (cardId: string) => {
    if (!round || round.resultsPublished) return;
    try {
      await updateScorecard(cardId, { status: "in_progress", signedOff: false, submittedAt: null });
      setScorecards((prev) =>
        prev.map((c) => c.id === cardId ? { ...c, status: "in_progress", signedOff: false, submittedAt: null } : c)
      );
    } catch {
      setPublishError("Failed to re-open card. Please try again.");
    }
  };

  const setStatus = async (status: RoundStatus) => {
    if (!round) return;
    setSaving(true);
    try {
      await updateRound(round.id, { status });
      setRound({ ...round, status });

      if (status === "live") {
        const activeUsers = await getActiveMembers(round.groupId);
        await createNotificationsForUsers({
          recipientUserIds: activeUsers.map((user) => user.uid),
          groupId: round.groupId,
          type: "round_live",
          title: "Round is live",
          body: `Scoring is now open for Round ${round.roundNumber} at ${round.courseName}.`,
          deepLink: `/rounds/${round.id}/scorecard`,
          roundId: round.id,
        });
      }

      setSuccess(`Round marked as ${status}`);
      setTimeout(() => setSuccess(""), 3000);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveDetails = async (notifyPlayers = false) => {
    if (!round) return;
    if (!courseName.trim() || !date) return;

    setSaving(true);
    setDetailsError("");
    const parsedRoundNumber =
      parseInt(roundNumber, 10) || round.roundNumber;
    const newDate = new Date(date);
    const appliedTeeSet = selectedTeeSet;
    const preserveExistingCourseData =
      !appliedTeeSet &&
      courseName.trim() === round.courseName &&
      round.courseHoles.length === 18;
    const courseDetails = appliedTeeSet
      ? {
          teeSetId: appliedTeeSet.id,
          teeSetName: appliedTeeSet.name,
          coursePar: appliedTeeSet.par,
          courseRating: appliedTeeSet.courseRating,
          slopeRating: appliedTeeSet.slopeRating,
          courseHoles: appliedTeeSet.holes,
          courseSource: appliedTeeSet.source,
        }
      : preserveExistingCourseData
      ? {
          teeSetId: round.teeSetId,
          teeSetName: round.teeSetName,
          coursePar: round.coursePar,
          courseRating: round.courseRating,
          slopeRating: round.slopeRating,
          courseHoles: round.courseHoles,
          courseSource: round.courseSource,
        }
      : {
          teeSetId: null,
          teeSetName: null,
          coursePar: null,
          courseRating: null,
          slopeRating: null,
          courseHoles: [],
          courseSource: null,
        };
    const specialHoles = {
      ...round.specialHoles,
      ntp: appliedTeeSet
        ? getParThreeHoles(appliedTeeSet)
        : round.specialHoles.ntp,
      ld: ldHole ? parseInt(ldHole, 10) : null,
      t2: t2Hole ? parseInt(t2Hole, 10) : null,
      t3: t3Hole ? parseInt(t3Hole, 10) : null,
    };
    const savedTeeTimes: TeeTime[] = teeTimes
      .filter(
        (t) =>
          t.time ||
          t.notes?.trim() ||
          t.playerIds.length > 0 ||
          t.guestNames.length > 0
      )
      .map((t, index) => ({
        id: `tee-${index + 1}`,
        time: t.time,
        playerIds:
          t.playerIds.length > 0
            ? t.playerIds
            : resolveMemberIdsFromText(t.notes, members),
        guestNames: t.guestNames,
        notes:
          getTeeTimeGroupLabel(t.playerIds, t.guestNames, members) ||
          t.notes?.trim() ||
          null,
      }));
    const isEditingExistingCourse =
      !selectedCourse && courseName.trim() === round.courseName;
    const savedCourseId =
      selectedCourse?.id ??
      (isEditingExistingCourse || preserveExistingCourseData ? round.courseId : "");
    const savedAvailableTeeSets =
      selectedCourse?.teeSets ??
      (isEditingExistingCourse || preserveExistingCourseData ? courseTeeSets : []);
    const validTeeSetIds = new Set(
      savedAvailableTeeSets.map((teeSet) => teeSet.id)
    );
    const savedDefaultTeeSetId =
      courseDetails.teeSetId ??
      (isEditingExistingCourse || preserveExistingCourseData ? round.teeSetId : null);
    const savedPlayerTeeAssignments = Object.fromEntries(
      Object.entries(playerTeeAssignments).filter(
        ([, teeId]) =>
          teeId &&
          teeId !== savedDefaultTeeSetId &&
          validTeeSetIds.has(teeId)
      )
    );
    const alertRecipientIds = getRoundAlertRecipientIds(
      round,
      rsvps,
      savedTeeTimes
    );
    const teeTimesChanged =
      getTeeTimeSignature(round.teeTimes) !==
      getTeeTimeSignature(savedTeeTimes);
    const courseChanged =
      round.courseName !== courseName.trim() ||
      round.courseId !== savedCourseId ||
      round.teeSetId !== savedDefaultTeeSetId ||
      round.date.getTime() !== newDate.getTime();

    const updatedRound: Round = {
      ...round,
      courseId: savedCourseId,
      courseName: courseName.trim(),
      ...courseDetails,
      availableTeeSets: savedAvailableTeeSets,
      playerTeeAssignments: savedPlayerTeeAssignments,
      roundNumber: parsedRoundNumber,
      date: newDate,
      format: formatChoice,
      notes: notes.trim() || null,
      teeTimes: savedTeeTimes,
      rsvpOpen: notifyPlayers ? true : round.rsvpOpen,
      rsvpNotifiedAt: notifyPlayers ? new Date() : round.rsvpNotifiedAt,
      specialHoles,
    };

    await updateRound(round.id, {
      courseId: savedCourseId,
      courseName: courseName.trim(),
      ...courseDetails,
      availableTeeSets: savedAvailableTeeSets,
      playerTeeAssignments: savedPlayerTeeAssignments,
      roundNumber: parsedRoundNumber,
      date: newDate,
      format: formatChoice,
      notes: notes.trim() || null,
      teeTimes: savedTeeTimes,
      rsvpOpen: notifyPlayers ? true : round.rsvpOpen,
      rsvpNotifiedAt: notifyPlayers ? new Date() : round.rsvpNotifiedAt,
      specialHoles,
    });

    if (notifyPlayers) {
      await notifyRoundPlayers({
        round: updatedRound,
        activeUsers: members,
        mode: round.rsvpOpen ? "updated" : "created",
      });
    }

    if (alertRecipientIds.length > 0 && teeTimesChanged) {
      await createNotificationsForUsers({
        recipientUserIds: alertRecipientIds,
        groupId: round.groupId,
        type: "change_alert",
        title: "Tee times updated",
        body: `Round ${parsedRoundNumber} tee times or groups have changed. Check your latest slot in GolfCaddy.`,
        deepLink: `/rounds/${round.id}`,
        roundId: round.id,
      });
    }

    if (alertRecipientIds.length > 0 && courseChanged) {
      await createNotificationsForUsers({
        recipientUserIds: alertRecipientIds,
        groupId: round.groupId,
        type: "change_alert",
        title: "Round details changed",
        body: `Round ${parsedRoundNumber} is now set for ${courseName.trim()} on ${format(
          newDate,
          "EEE d MMM yyyy"
        )}.`,
        deepLink: `/rounds/${round.id}`,
        roundId: round.id,
      });
    }

    setRound(updatedRound);
    setPlayerTeeAssignments(savedPlayerTeeAssignments);

    setSuccess(
      notifyPlayers
        ? "Round details saved and players notified"
        : "Round details updated"
    );
    setSaving(false);
    setTimeout(() => setSuccess(""), 3000);
  };

  const handleSendScoreReminder = async () => {
    if (!round) return;

    const recipientIds = Array.from(
      new Set(
        [
          ...rsvps
            .filter((rsvp) => rsvp.status === "accepted")
            .map((rsvp) => rsvp.memberId),
          ...scorecards.map((scorecard) => scorecard.markerId),
        ].filter(Boolean)
      )
    );

    if (recipientIds.length === 0) {
      setDetailsError("No accepted players are available to notify yet.");
      setTimeout(() => setDetailsError(""), 3000);
      return;
    }

    setSaving(true);
    try {
      await createNotificationsForUsers({
        recipientUserIds: recipientIds,
        groupId: round.groupId,
        type: "score_reminder",
        title: "Score reminder",
        body: `Round ${round.roundNumber} is live. Keep your scorecard up to date in GolfCaddy.`,
        deepLink: `/rounds/${round.id}/scorecard`,
        roundId: round.id,
      });
      setSuccess("Score reminder sent.");
      setTimeout(() => setSuccess(""), 3000);
    } finally {
      setSaving(false);
    }
  };

  const handleRefreshCourseData = async () => {
    if (!round || !selectedCourse || !refreshableTeeSet) return;

    setSaving(true);
    const refreshedSpecialHoles = {
      ...round.specialHoles,
      ntp: getParThreeHoles(refreshableTeeSet),
      ld: ldHole ? parseInt(ldHole, 10) : null,
      t2: t2Hole ? parseInt(t2Hole, 10) : null,
      t3: t3Hole ? parseInt(t3Hole, 10) : null,
    };
    const refreshedCourseDetails = {
      courseId: selectedCourse.id,
      courseName: selectedCourse.name,
      teeSetId: refreshableTeeSet.id,
      teeSetName: refreshableTeeSet.name,
      coursePar: refreshableTeeSet.par,
      courseRating: refreshableTeeSet.courseRating,
      slopeRating: refreshableTeeSet.slopeRating,
      courseHoles: refreshableTeeSet.holes,
      availableTeeSets: selectedCourse.teeSets,
      playerTeeAssignments: {},
      courseSource: refreshableTeeSet.source,
      specialHoles: refreshedSpecialHoles,
    };

    await updateRound(round.id, refreshedCourseDetails);
    setCourseId(selectedCourse.id);
    setCourseName(selectedCourse.name);
    setTeeSetId(refreshableTeeSet.id);
    setPlayerTeeAssignments({});
    setRound({
      ...round,
      ...refreshedCourseDetails,
    });
    setSuccess("Course data refreshed from GolfCourseAPI");
    setSaving(false);
    setTimeout(() => setSuccess(""), 3000);
  };

  const handleDeleteRound = async () => {
    if (!round || deleteConfirm !== "DELETE") return;
    const confirmed = window.confirm(
      `Delete Round ${round.roundNumber} at ${round.courseName}? This permanently removes the round, scorecards, hole scores, official results, result feed posts, notifications, and round handicap history.`
    );
    if (!confirmed) return;

    setDeleting(true);
    setDeleteError("");
    try {
      await deleteRoundCascade(round.id);
      router.push("/admin/rounds");
    } catch (err) {
      console.error("Failed to delete round", err);
      const message =
        err instanceof Error && err.message
          ? err.message
          : "Please try again.";
      setDeleteError(`Failed to delete round. ${message}`);
      setDeleting(false);
    }
  };

  const addTeeTime = () =>
    setTeeTimes([
      ...teeTimes,
      { time: "", notes: "", playerIds: [], guestNames: [] },
    ]);

  const removeTeeTime = (index: number) =>
    setTeeTimes(teeTimes.filter((_, i) => i !== index));

  const updateTeeTimeTime = (index: number, value: string) =>
    setTeeTimes(
      teeTimes.map((teeTime, i) => {
        if (i !== index) return teeTime;
        return { ...teeTime, time: value };
      })
    );

  const assignPlayerToTeeTime = (teeTimeIndex: number, member: AppUser) => {
    setTeeTimes((current) =>
      current.map((teeTime, index) => {
        const existingPlayerIds = teeTime.playerIds.filter(
          (playerId) => playerId !== member.uid
        );
        const shouldAssignToThisTeeTime =
          index === teeTimeIndex &&
          !current[teeTimeIndex]?.playerIds.includes(member.uid);
        const playerIds = shouldAssignToThisTeeTime
          ? [...existingPlayerIds, member.uid]
          : existingPlayerIds;
        const notes = getTeeTimeGroupLabel(
          playerIds,
          teeTime.guestNames,
          members
        );

        return {
          ...teeTime,
          playerIds,
          notes,
        };
      })
    );
  };

  const removePlayerFromTeeTime = (teeTimeIndex: number, member: AppUser) => {
    setTeeTimes((current) =>
      current.map((teeTime, index) => {
        if (index !== teeTimeIndex) return teeTime;
        const playerIds = teeTime.playerIds.filter(
          (playerId) => playerId !== member.uid
        );
        return {
          ...teeTime,
          playerIds,
          notes: getTeeTimeGroupLabel(playerIds, teeTime.guestNames, members),
        };
      })
    );
    setSuccess(
      `${formatShortMemberName(member, members)} removed from the tee slot. Save to keep this lineup.`
    );
    setTimeout(() => setSuccess(""), 3000);
  };

  const addGuestToTeeTime = (teeTimeIndex: number, guestName: string) => {
    const trimmed = guestName.trim();
    if (!trimmed) return;

    setTeeTimes((current) =>
      current.map((teeTime, index) => {
        if (index !== teeTimeIndex) return teeTime;
        const guestNames = Array.from(
          new Set([...teeTime.guestNames, trimmed])
        );
        return {
          ...teeTime,
          guestNames,
          notes: getTeeTimeGroupLabel(teeTime.playerIds, guestNames, members),
        };
      })
    );
  };

  const removeGuestFromTeeTime = (
    teeTimeIndex: number,
    guestName: string
  ) => {
    setTeeTimes((current) =>
      current.map((teeTime, index) => {
        if (index !== teeTimeIndex) return teeTime;
        const guestNames = teeTime.guestNames.filter(
          (name) => name !== guestName
        );
        return {
          ...teeTime,
          guestNames,
          notes: getTeeTimeGroupLabel(teeTime.playerIds, guestNames, members),
        };
      })
    );
  };

  const randomiseGroups = () => {
    if (acceptedMembers.length === 0) {
      setDetailsError(
        round?.rsvpOpen
          ? "No accepted players yet. Ask members to RSVP before randomising."
          : "No active players are available to randomise."
      );
      setTimeout(() => setDetailsError(""), 3000);
      return;
    }

    try {
      const groups = randomiseMemberGroups(acceptedMembers, teeTimes.length);
      setTeeTimes((current) =>
        current.map((teeTime, index) => {
          const group = groups[index] ?? [];
          const playerIds = group.map((member) => member.uid);
          return {
            ...teeTime,
            playerIds,
            guestNames: teeTime.guestNames,
            notes: getTeeTimeGroupLabel(
              playerIds,
              teeTime.guestNames,
              members
            ),
          };
        })
      );
      setSuccess("Groups randomised. Save to keep these tee-time groups.");
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setDetailsError(
        err instanceof Error ? err.message : "Could not randomise groups."
      );
      setTimeout(() => setDetailsError(""), 3000);
    }
  };

  const addHoleOverride = async (
    holeNumber: number,
    overridePar: number,
    reason: string,
    yardage?: number
  ) => {
    if (!round) return;
    setSaving(true);
    try {
      const courseHole =
        (round.courseHoles.length === 18
          ? round.courseHoles
          : getFallbackCourseHoles()
        ).find((hole) => hole.number === holeNumber);
      const existingOverride = round.holeOverrides.find(
        (override) => override.holeNumber === holeNumber
      );
      const override: HoleOverride = {
        holeNumber,
        originalPar: existingOverride?.originalPar ?? courseHole?.par ?? 4,
        overridePar,
        ...(yardage != null ? { overrideYardage: yardage } : {}),
        reason: reason.trim(),
        overriddenAt: new Date(),
      };
      const updated = [
        ...round.holeOverrides.filter(
          (current) => current.holeNumber !== holeNumber
        ),
        override,
      ].sort((a, b) => a.holeNumber - b.holeNumber);

      const updatedRound = { ...round, holeOverrides: updated };
      const specialHoles = getEffectiveSpecialHoles(updatedRound);
      await updateRound(round.id, { holeOverrides: updated, specialHoles });
      const activeUsers = await getActiveMembers(round.groupId);
      const yardageNote = yardage != null ? ` · ${yardage}m` : "";
      await createNotificationsForUsers({
        recipientUserIds: activeUsers.map((user) => user.uid),
        groupId: round.groupId,
        type: "change_alert",
        title: "Course update",
        body: `Hole ${holeNumber} is now Par ${overridePar}${yardageNote}${reason.trim() ? `: ${reason.trim()}` : "."}`,
        deepLink: `/rounds/${round.id}`,
        roundId: round.id,
      });
      setRound({ ...updatedRound, specialHoles });
      setCourseCorrectionsOpen(true);
      setEditingOverride(null);
      setSuccess("Hole par updated. Members will be notified.");
      setTimeout(() => setSuccess(""), 3000);
    } finally {
      setSaving(false);
    }
  };

  const deleteHoleOverride = async (
    overrideToDelete: HoleOverride,
    overrideIndex: number
  ) => {
    if (!round) return;
    const confirmed = window.confirm(
      `Delete the par override for hole ${overrideToDelete.holeNumber}?`
    );
    if (!confirmed) return;

    setSaving(true);
    try {
      const updated = round.holeOverrides.filter(
        (_override, index) => index !== overrideIndex
      );

      const updatedRound = { ...round, holeOverrides: updated };
      const specialHoles = getEffectiveSpecialHoles(updatedRound);
      await updateRound(round.id, { holeOverrides: updated, specialHoles });
      const activeUsers = await getActiveMembers(round.groupId);
      await createNotificationsForUsers({
        recipientUserIds: activeUsers.map((user) => user.uid),
        groupId: round.groupId,
        type: "change_alert",
        title: "Course update",
        body: `Hole ${overrideToDelete.holeNumber} par override was removed for Round ${round.roundNumber}.`,
        deepLink: `/rounds/${round.id}`,
        roundId: round.id,
      });
      setRound({ ...updatedRound, specialHoles });
      if (
        editingOverride?.holeNumber === overrideToDelete.holeNumber &&
        editingOverride?.overridePar === overrideToDelete.overridePar &&
        editingOverride?.reason === overrideToDelete.reason
      ) {
        setEditingOverride(null);
      }
      setSuccess("Hole par override deleted. Members will be notified.");
      setTimeout(() => setSuccess(""), 3000);
    } finally {
      setSaving(false);
    }
  };

  const saveStrokeIndexes = async () => {
    if (!round) return;

    const holes =
      round.courseHoles.length === 18
        ? round.courseHoles
        : getFallbackCourseHoles();

    const values = holes.map((h) => parseInt(strokeIndexDrafts[h.number] ?? "", 10));

    if (values.some((v) => isNaN(v) || v < 1 || v > 18)) {
      setDetailsError("Each stroke index must be a number between 1 and 18.");
      setTimeout(() => setDetailsError(""), 4000);
      return;
    }

    if (new Set(values).size !== 18) {
      setDetailsError("Each stroke index must be unique (1–18, no duplicates).");
      setTimeout(() => setDetailsError(""), 4000);
      return;
    }

    setSavingStrokeIndexes(true);
    try {
      const updatedHoles = holes.map((h, i) => ({ ...h, strokeIndex: values[i] }));

      // Mirror the change into the matching tee set so a future course refresh
      // doesn't immediately overwrite what was just corrected.
      const updatedTeeSets = (round.availableTeeSets ?? []).map((ts) => {
        if (ts.id !== round.teeSetId || ts.holes.length !== 18) return ts;
        return {
          ...ts,
          holes: ts.holes.map((h) => {
            const newSI = values[h.number - 1];
            return newSI !== undefined ? { ...h, strokeIndex: newSI } : h;
          }),
        };
      });

      await updateRound(round.id, {
        courseHoles: updatedHoles,
        availableTeeSets: updatedTeeSets,
      });
      setRound({ ...round, courseHoles: updatedHoles, availableTeeSets: updatedTeeSets });
      setEditingStrokeIndexes(false);
      setSuccess("Stroke indexes updated.");
      setTimeout(() => setSuccess(""), 3000);
    } finally {
      setSavingStrokeIndexes(false);
    }
  };

  const correctCoursePar = async (
    holeNumber: number,
    newPar: number,
    yardage?: number
  ) => {
    if (!round) return;
    setSaving(true);
    try {
      const holeType = (p: number): "par3" | "par4" | "par5" =>
        p === 3 ? "par3" : p === 5 ? "par5" : "par4";

      const updatedHoles = (
        round.courseHoles.length === 18 ? round.courseHoles : getFallbackCourseHoles()
      ).map((h) => {
        if (h.number !== holeNumber) return h;
        return {
          ...h,
          par: newPar,
          type: holeType(newPar),
          ...(yardage != null ? { distanceMeters: yardage } : {}),
        };
      });

      const updatedTeeSets = (round.availableTeeSets ?? []).map((ts) => {
        if (ts.id !== round.teeSetId || ts.holes.length !== 18) return ts;
        const updatedTeeHoles = ts.holes.map((h) => {
          if (h.number !== holeNumber) return h;
          return {
            ...h,
            par: newPar,
            type: holeType(newPar),
            ...(yardage != null ? { distanceMeters: yardage } : {}),
          };
        });
        return {
          ...ts,
          holes: updatedTeeHoles,
          par: updatedTeeHoles.reduce((sum, h) => sum + h.par, 0),
        };
      });

      const updatedRound = { ...round, courseHoles: updatedHoles, availableTeeSets: updatedTeeSets };
      const specialHoles = getEffectiveSpecialHoles(updatedRound);
      await updateRound(round.id, {
        courseHoles: updatedHoles,
        availableTeeSets: updatedTeeSets,
        specialHoles,
      });
      setRound({ ...updatedRound, specialHoles });
      setSuccess("Course data corrected.");
      setTimeout(() => setSuccess(""), 3000);
    } finally {
      setSaving(false);
    }
  };

  const saveToCorrectionsLibrary = async () => {
    if (!round || !round.teeSetId || !appUser) return;

    const holes =
      round.courseHoles.length === 18
        ? round.courseHoles
        : getFallbackCourseHoles();

    setSavingCorrectionLibrary(true);
    try {
      await saveCourseCorrection(round.groupId, {
        groupId: round.groupId,
        teeSetId: round.teeSetId,
        courseName: round.courseName,
        teeSetName: round.teeSetName ?? "Unknown",
        correctedCourseRating: round.courseRating,
        correctedSlopeRating: round.slopeRating,
        holeCorrections: holes.map((h) => ({
          holeNumber: h.number,
          strokeIndex: h.strokeIndex,
          par: h.par,
        })),
        savedBy: appUser.uid,
        savedByName: appUser.displayName,
      });
      setCorrectionLibrarySaved(true);
      setTimeout(() => setCorrectionLibrarySaved(false), 4000);
    } finally {
      setSavingCorrectionLibrary(false);
    }
  };

  const saveRatingSlope = async () => {
    if (!round) return;
    const rating = courseRatingDraft.trim() === "" ? null : parseFloat(courseRatingDraft);
    const slope = slopeRatingDraft.trim() === "" ? null : parseInt(slopeRatingDraft, 10);

    if (courseRatingDraft.trim() !== "" && (isNaN(rating!) || rating! < 50 || rating! > 85)) {
      setDetailsError("Course rating must be a number between 50 and 85.");
      setTimeout(() => setDetailsError(""), 4000);
      return;
    }
    if (slopeRatingDraft.trim() !== "" && (isNaN(slope!) || slope! < 55 || slope! > 155)) {
      setDetailsError("Slope rating must be a number between 55 and 155.");
      setTimeout(() => setDetailsError(""), 4000);
      return;
    }

    setSavingRatingSlope(true);
    try {
      await updateRound(round.id, { courseRating: rating, slopeRating: slope });
      setRound({ ...round, courseRating: rating, slopeRating: slope });
      setEditingRatingSlope(false);
      setSuccess("Course rating and slope saved.");
      setTimeout(() => setSuccess(""), 3000);
    } finally {
      setSavingRatingSlope(false);
    }
  };

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 bg-gray-200 rounded w-2/3" />
        <div className="bg-white rounded-2xl p-4 h-32 bg-gray-100" />
      </div>
    );
  }

  if (!round) {
    return <p className="text-gray-400 text-sm">Round not found.</p>;
  }

  return (
    <div className="space-y-4 pb-8">
      <div>
        <div className="text-xs text-gray-500 mb-1">
          {getRoundLabel(round)} · {round.season}
        </div>
        <h1 className="text-xl font-bold text-gray-800">{round.courseName}</h1>
        <p className="text-gray-500 text-sm">{format(round.date, "EEE d MMM yyyy")}</p>
      </div>

      {success && (
        <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-green-700 text-sm">
          ✅ {success}
        </div>
      )}
      {detailsError && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-700 text-sm">
          {detailsError}
        </div>
      )}

      {/* Edit round details */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-3">
        <h2 className="font-semibold text-gray-800">Round Details</h2>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Course search
            </label>
            <input
              type="text"
              value={courseName}
              onChange={(e) => handleCourseNameChange(e.target.value)}
              placeholder="Start typing a course name..."
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500"
            />
            {showCourseSuggestions && (
              <div className="mt-2 rounded-xl border border-gray-100 bg-gray-50 p-1">
                {apiCourseSuggestions.map((course) => (
                  <button
                    key={course.id}
                    type="button"
                    onClick={() => applyApiCourse(course)}
                    disabled={apiCourseLoading}
                    className="block w-full rounded-lg px-3 py-2 text-left text-xs text-gray-700 hover:bg-white disabled:text-gray-400"
                  >
                    <span className="font-medium text-gray-900">
                      {course.name}
                    </span>
                    <span className="block text-xs text-gray-500">
                      GolfCourseAPI · {getCourseSearchLabel(course)}
                      {course.teeSets.length > 0
                        ? ` · ${course.teeSets.length} tee set${
                            course.teeSets.length === 1 ? "" : "s"
                          }`
                        : " · tap to load tee data"}
                    </span>
                  </button>
                ))}
              </div>
            )}
            {apiCourseLoading && (
              <p className="text-xs text-gray-400 mt-1">
                Searching GolfCourseAPI...
              </p>
            )}
            {apiCourseError && (
              <p className="text-xs text-amber-600 mt-1">
                {apiCourseError}
              </p>
            )}
          </div>

          {assignmentTeeSets.length > 0 && (
            <div>
              <div className="mb-1 flex items-center justify-between gap-2">
                <label className="block text-xs font-medium text-gray-700">
                  Tee set
                </label>
                {teeReviewMembers.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowTeeAssignments(true)}
                    className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-amber-100 text-xs font-bold text-amber-700"
                    aria-label={`${teeReviewMembers.length} accepted player tee assignment needs review`}
                    title={`${teeReviewMembers.length} accepted player tee assignment needs review`}
                  >
                    !
                  </button>
                )}
              </div>
              <select
                value={teeSetId}
                onChange={(e) => setTeeSetId(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                {assignmentTeeSets.map((teeSet) => (
                  <option key={teeSet.id} value={teeSet.id}>
                    {teeSet.name} - Par {teeSet.par}
                    {teeSet.slopeRating ? ` / Slope ${teeSet.slopeRating}` : ""}
                  </option>
                ))}
              </select>
              {selectedTeeSet && (
                <p className="text-xs text-gray-400 mt-1">
                  NTP holes from par 3s: {getParThreeHoles(selectedTeeSet).join(", ")}
                </p>
              )}
              <div className="mt-3 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-gray-700">
                      Player tee assignments
                    </p>
                    <p className="text-xs text-gray-400">
                      {acceptedMembers.length} accepted ·{" "}
                      {Math.max(
                        acceptedMembers.length - teeOverrideCount,
                        0
                      )}{" "}
                      default ·{" "}
                      {teeOverrideCount} override
                      {teeReviewMembers.length > 0
                        ? ` · ${teeReviewMembers.length} review`
                        : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowTeeAssignments((value) => !value)}
                    className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-green-700"
                  >
                    {showTeeAssignments ? "Hide" : "Manage"}
                  </button>
                </div>
                {showTeeAssignments && (
                  <div className="mt-3 space-y-2 border-t border-gray-100 pt-3">
                    {acceptedMembers.length === 0 ? (
                      <p className="text-xs text-gray-400">
                        Accepted players will appear here after they RSVP.
                      </p>
                    ) : (
                      acceptedMembers.map((member) => {
                        const suggestedReview = needsTeeReview(member);
                        return (
                          <div
                            key={member.uid}
                            className="grid grid-cols-[5.5rem_1fr] items-center gap-2"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-xs font-semibold text-gray-700">
                                {formatShortMemberName(member, members)}
                              </p>
                              {suggestedReview &&
                                !playerTeeAssignments[member.uid] && (
                                  <p className="text-xs font-medium text-amber-600">
                                    Review
                                  </p>
                                )}
                            </div>
                            <select
                              value={playerTeeAssignments[member.uid] ?? ""}
                              onChange={(event) =>
                                setPlayerTeeAssignments((current) => ({
                                  ...current,
                                  [member.uid]: event.target.value,
                                }))
                              }
                              className="min-w-0 rounded-lg border border-gray-200 bg-white px-2 py-2 text-xs text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500"
                              aria-label={`Tee set for ${member.displayName}`}
                            >
                              <option value="">
                                Default
                                {selectedTeeSet
                                  ? ` (${selectedTeeSet.name})`
                                  : ""}
                              </option>
                              {assignmentTeeSets.map((teeSet) => (
                                <option key={teeSet.id} value={teeSet.id}>
                                  {teeSet.name} - Par {teeSet.par}
                                </option>
                              ))}
                            </select>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
              {selectedCourse && (
                <div className="mt-3 space-y-2 border-t border-green-100 pt-3">
                  <p className="text-xs text-green-700">
                    Refresh pars, stroke indexes, distances, tee metadata, and
                    NTP holes from GolfCourseAPI. LD, T2, and T3 stay as
                    currently selected below.
                  </p>
                  <button
                    type="button"
                    onClick={handleRefreshCourseData}
                    disabled={saving || !refreshableTeeSet}
                    className="w-full rounded-xl border border-green-200 bg-white px-3 py-2 text-xs font-semibold text-green-700 transition-colors hover:bg-green-100 disabled:text-green-300"
                  >
                    {saving ? "Refreshing..." : "Refresh API course data"}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Live course card preview — updates as tee set changes */}
          {holeOptions.length === 18 && (
            <CourseCardPreview
              holes={(() => {
                // Apply any in-progress stroke index drafts so the preview
                // stays in sync while the admin is editing indexes.
                if (!editingStrokeIndexes) return holeOptions;
                return holeOptions.map((h) => {
                  const draft = parseInt(strokeIndexDrafts[h.number] ?? "", 10);
                  return Number.isFinite(draft) ? { ...h, strokeIndex: draft } : h;
                });
              })()}
              distanceUnit={appUser?.distanceUnit ?? "meters"}
              specialHoles={round ? getEffectiveSpecialHoles(round) : undefined}
              teeSetName={selectedTeeSet?.name ?? round?.teeSetName ?? undefined}
            />
          )}

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Date
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className={DATE_INPUT_CLASSNAME}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Round number
            </label>
            <input
              type="number"
              min={1}
              value={roundNumber}
              onChange={(e) => setRoundNumber(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Scoring format
            </label>
            <div className="flex gap-2">
              {(["stableford", "stroke"] as ScoringFormat[]).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFormatChoice(f)}
                  className={`flex-1 py-2 rounded-xl text-xs font-medium border transition-colors ${
                    formatChoice === f
                      ? "bg-green-600 text-white border-green-600"
                      : "border-gray-200 text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  {f === "stableford" ? "Stableford" : "Stroke"}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>

        <TeeTimesEditor
          teeTimes={teeTimes}
          members={members}
          assignableMembers={acceptedMembers}
          playersSummary={
              `Showing accepted players only: ${acceptedMembers.length}`
            }
            emptyPlayersMessage={
              round.rsvpOpen
                ? "No accepted players yet. Tee-time groups can be filled after players RSVP."
                : "No RSVP'd players yet. Use Save & Notify Players first, then assign tee times after members respond."
            }
            onRandomise={randomiseGroups}
            onAddTeeTime={addTeeTime}
          onRemoveTeeTime={removeTeeTime}
          onUpdateTeeTimeTime={updateTeeTimeTime}
          onAssignPlayer={assignPlayerToTeeTime}
          onRemovePlayer={removePlayerFromTeeTime}
          onAddGuest={addGuestToTeeTime}
          onRemoveGuest={removeGuestFromTeeTime}
        />
        </div>

        <div className="border-t border-gray-100 pt-3 mt-2 space-y-3">
          <h3 className="text-xs font-semibold text-gray-700">
            Special holes
          </h3>
          <p className="text-xs text-gray-400">
            NTP holes are set from par 3s. Update LD, T2, and T3 if the course
            changes.
          </p>
          <div className="space-y-2">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                💪 Longest Drive (LD)
              </label>
              <select
                value={ldHole}
                onChange={(e) => setLdHole(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                <option value="">Not set</option>
                {driveHoleOptions.map((hole) => (
                  <option key={hole.number} value={hole.number}>
                    {getHoleOptionLabel(hole)}
                  </option>
                ))}
              </select>
            </div>
            {[
              { label: "⭐ T2", value: t2Hole, setter: setT2Hole },
              { label: "⭐ T3", value: t3Hole, setter: setT3Hole },
            ].map(({ label, value, setter }) => (
              <div key={label}>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  {label}
                </label>
                <select
                  value={value}
                  onChange={(e) => setter(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  <option value="">Not set</option>
                  {holeOptions.map((hole) => (
                    <option key={hole.number} value={hole.number}>
                      {getHoleOptionLabel(hole)}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => handleSaveDetails(false)}
            disabled={saving}
            className="w-full rounded-xl border border-green-200 bg-white py-2.5 text-sm font-semibold text-green-700 transition-colors hover:bg-green-50 disabled:text-green-300"
          >
            {saving ? "Saving..." : "Save"}
          </button>
          <button
            type="button"
            onClick={() => handleSaveDetails(true)}
            disabled={saving}
            className="w-full bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors"
          >
            {saving ? "Saving..." : "Save & Notify Players"}
          </button>
        </div>
      </div>

      {/* Round status controls */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold text-gray-800">Round Status</h2>
          {round.resultsPublished && (
            <span className="rounded-full bg-gray-800 px-3 py-1 text-xs font-semibold text-white">
              Completed
            </span>
          )}
        </div>
        {!round.resultsPublished && (
          <>
            <div className="flex gap-2">
              {(["upcoming", "live"] as RoundStatus[]).map((s) => (
                <button
                  key={s}
                  onClick={() => setStatus(s)}
                  disabled={saving || round.status === s}
                  className={`flex-1 py-2.5 rounded-xl text-xs font-semibold border transition-colors ${
                    round.status === s
                      ? s === "live"
                        ? "bg-red-500 text-white border-red-500"
                        : "bg-gray-800 text-white border-gray-800"
                      : "border-gray-200 text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  {s === "live" ? "● Live" : "Upcoming"}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-400">
              Setting to Live opens scoring and notifies all members. Round is marked Completed automatically when you publish results below.
            </p>
          </>
        )}
        {round.status === "live" && (
          <button
            type="button"
            onClick={handleSendScoreReminder}
            disabled={saving}
            className="w-full rounded-xl border border-gray-200 bg-white py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:text-gray-300"
          >
            {saving ? "Sending..." : "Send score reminder"}
          </button>
        )}
      </div>

      {/* Close-out panel — shown when round is live or completed */}
      {round.status !== "upcoming" && (
        <div className={`rounded-2xl shadow-sm border p-4 space-y-4 ${
          round.resultsPublished
            ? "bg-green-50 border-green-200"
            : "bg-white border-gray-100"
        }`}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold text-gray-800">
                {round.resultsPublished ? "Official Results" : "Close This Round"}
              </h2>
              {!round.resultsPublished && (
                <p className="mt-0.5 text-xs text-gray-500">
                  {scorecards.length === 0
                    ? "Waiting for players to submit scorecards."
                    : `${scorecards.filter((c) => c.status !== "in_progress").length} of ${scorecards.length} scorecards submitted`}
                </p>
              )}
              {round.resultsPublished && results && (
                <p className="mt-0.5 text-xs text-green-700">
                  Published {format(results.publishedAt, "EEE d MMM yyyy h:mm a")}
                </p>
              )}
            </div>
            <Link
              href={`/admin/rounds/${round.id}/leaderboard`}
              className="shrink-0 text-xs text-green-700 font-medium hover:underline"
            >
              Full detail →
            </Link>
          </div>

          {/* Standings */}
          {rankings.length === 0 ? (
            <p className="text-xs text-gray-400">
              Once players submit scores they&apos;ll appear here.
            </p>
          ) : (
            <div className="divide-y divide-gray-100">
              {rankings.map((ranking) => {
                const card = cardsByPlayerId.get(ranking.playerId);
                return (
                  <div key={ranking.playerId} className="flex items-center justify-between py-2 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="w-6 text-xs text-gray-400">#{ranking.rank}</span>
                      <div>
                        <span className="text-gray-700">{ranking.playerName}</span>
                        {ranking.countbackDetail && (
                          <p className="text-xs text-gray-400">{ranking.countbackDetail}</p>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-gray-800">
                        {round.format === "stableford" ? `${ranking.stablefordTotal} pts` : `${ranking.grossTotal}`}
                      </p>
                      <p className="text-xs text-gray-400">Hcp {ranking.handicap}</p>
                      {!round.resultsPublished && card && card.status !== "in_progress" && (
                        <button
                          type="button"
                          onClick={() => handleReopenCard(card.id)}
                          className="mt-0.5 text-xs text-green-700 underline"
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

          {/* Live par override — quick on-the-fly changes during play */}
          {round.status === "live" && !round.resultsPublished && (
            <div className="space-y-3 border-t border-amber-100 pt-3">
              <div>
                <p className="text-xs font-semibold text-gray-700">Live Par Override</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  Apply an on-the-fly change (GUR, temporary tee). Players are notified instantly.
                </p>
              </div>
              <HoleOverrideForm
                holes={holeOptions}
                onSubmit={addHoleOverride}
                disabled={saving}
                editingOverride={editingOverride}
                onCancelEdit={() => setEditingOverride(null)}
              />
            </div>
          )}

          {/* Side winners — only shown before publish */}
          {!round.resultsPublished && (
            <div className="space-y-3 border-t border-gray-100 pt-3">
              <div>
                <p className="text-xs font-semibold text-gray-700">Side Winners</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  Select before publishing. Leave blank if a prize wasn&apos;t run.
                </p>
              </div>
              {(specialHoles?.ntp ?? []).map((holeNumber) => (
                <WinnerSelect
                  key={holeNumber}
                  label={`NTP - Hole ${holeNumber}`}
                  value={sideWinnerIds[`ntp-${holeNumber}`] ?? ""}
                  options={playerOptions}
                  onChange={(id) => updateSideWinner(`ntp-${holeNumber}`, "ntp", holeNumber, id)}
                />
              ))}
              {specialHoles?.ld && (
                <WinnerSelect
                  label={`Longest Drive - Hole ${specialHoles.ld}`}
                  value={sideWinnerIds.ld ?? ""}
                  options={playerOptions}
                  onChange={(id) => updateSideWinner("ld", "ld", specialHoles.ld!, id)}
                />
              )}
              {specialHoles?.t2 && (
                <WinnerSelect
                  label={`T2 - Hole ${specialHoles.t2}`}
                  value={sideWinnerIds.t2 ?? ""}
                  options={playerOptions}
                  onChange={(id) => updateSideWinner("t2", "t2", specialHoles.t2!, id)}
                />
              )}
              {specialHoles?.t3 && (
                <WinnerSelect
                  label={`T3 - Hole ${specialHoles.t3}`}
                  value={sideWinnerIds.t3 ?? ""}
                  options={playerOptions}
                  onChange={(id) => updateSideWinner("t3", "t3", specialHoles.t3!, id)}
                />
              )}
            </div>
          )}

          {/* Publish */}
          {!round.resultsPublished && (
            <div className="border-t border-gray-100 pt-3 space-y-2">
              {publishError && (
                <p className="text-xs font-medium text-red-600">{publishError}</p>
              )}
              <p className="text-xs text-gray-500">
                Publishing saves official results, awards ladder points, locks all cards, and marks the round as Completed.
              </p>
              <button
                type="button"
                onClick={handlePublish}
                disabled={publishing || rankings.length === 0}
                className="w-full bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors"
              >
                {publishing ? "Publishing..." : "Publish Results"}
              </button>
            </div>
          )}

          {/* Re-book after publish */}
          {round.resultsPublished && (
            <div className="border-t border-green-200 pt-3 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold text-gray-700">Re-book This Course</p>
                  <p className="text-xs text-gray-400">
                    Create a new upcoming round from this course setup.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => showRebookForm ? setShowRebookForm(false) : openRebookForm()}
                  className="shrink-0 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-green-700 hover:bg-green-50"
                >
                  {showRebookForm ? "Hide" : "Re-book"}
                </button>
              </div>
              {showRebookForm && (
                <div className="space-y-3 border-t border-gray-100 pt-3">
                  <div className="rounded-xl border border-green-100 bg-green-50 px-3 py-2">
                    <p className="text-xs font-semibold text-green-700">Season handling</p>
                    <p className="mt-0.5 text-xs text-green-900">
                      Active season: {group?.currentSeason ?? round.season}. This booking can be created in Season {rebookSeason || suggestedRebookSeason} without changing the active season.
                    </p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <label className="block">
                      <span className="mb-1 block text-xs font-medium text-gray-700">Date</span>
                      <input
                        type="date"
                        value={rebookDate}
                        onChange={(e) => setRebookDate(e.target.value)}
                        className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs font-medium text-gray-700">Season</span>
                      <input
                        type="number"
                        min={group?.currentSeason ?? round.season}
                        value={rebookSeason}
                        onChange={(e) => {
                          const next = e.target.value;
                          setRebookSeason(next);
                          if (!rebookRoundNumberEdited) {
                            setRebookRoundNumber(getSuggestedRoundNumberForSeason(groupRounds, next));
                          }
                        }}
                        className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs font-medium text-gray-700">Round number</span>
                      <input
                        type="number"
                        min={1}
                        value={rebookRoundNumber}
                        onChange={(e) => { setRebookRoundNumber(e.target.value); setRebookRoundNumberEdited(true); }}
                        className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500"
                      />
                    </label>
                  </div>
                  <p className="text-xs text-gray-400">
                    Suggested round number for Season {rebookSeason || suggestedRebookSeason}: {suggestedRoundNumberForSeason}. Course data, tee set, pars, distances, and prize holes will be copied.
                  </p>
                  {publishError && (
                    <p className="text-xs font-medium text-red-600">{publishError}</p>
                  )}
                  <button
                    type="button"
                    onClick={handleRebook}
                    disabled={rebooking}
                    className="w-full rounded-xl bg-green-600 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:bg-green-300"
                  >
                    {rebooking ? "Creating..." : "Create re-booked round"}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Course Corrections — collapsible, auto-opens when par overrides exist */}
      <div className={`rounded-2xl shadow-sm border p-4 overflow-hidden ${
        round.holeOverrides.length > 0 ? "border-amber-200 bg-amber-50/40" : "border-gray-100 bg-white"
      }`}>
        <button
          type="button"
          onClick={() => setCourseCorrectionsOpen((v) => !v)}
          className="flex w-full items-center justify-between gap-3 text-left"
        >
          <div className="flex items-center gap-2">
            <h2 className="font-semibold text-gray-800">Course Corrections</h2>
            {round.holeOverrides.length > 0 && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                {round.holeOverrides.length} active override{round.holeOverrides.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>
          <span className="shrink-0 text-sm text-gray-400">
            {courseCorrectionsOpen ? "▲" : "▼"}
          </span>
        </button>

        {courseCorrectionsOpen && (
          <div className="mt-4 space-y-6">
            {/* Correct Hole Par — pre-round data fix, no notification */}
            <div className="space-y-3">
              <div>
                <p className="text-sm font-semibold text-gray-800">Correct Hole Par &amp; Yardage</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Fix incorrect course data — writes directly to this round&apos;s hole data. No players are notified. For in-round changes (GUR etc.) use the Live Par Override in the round panel.
                </p>
              </div>
              <CourseParCorrectionForm
                holes={holeOptions}
                onSubmit={correctCoursePar}
                disabled={saving}
              />
              {round.holeOverrides.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-gray-600">Active live overrides:</p>
                  {round.holeOverrides.map((o, index) => (
                    <div
                      key={`${o.holeNumber}-${index}`}
                      className="flex items-center justify-between gap-3 bg-amber-50 rounded-xl px-3 py-2 text-sm text-amber-800 border border-amber-100"
                    >
                      <div className="min-w-0">
                        <span className="font-medium">
                          Hole {o.holeNumber}: Par {o.originalPar} → {o.overridePar}
                          {o.overrideYardage != null && ` · ${o.overrideYardage}m`}
                        </span>
                        {o.reason && (
                          <span className="ml-1 text-amber-600">({o.reason})</span>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setEditingOverride(o)}
                          disabled={saving}
                          aria-label={`Edit override for hole ${o.holeNumber}`}
                          className="rounded-lg border border-amber-200 bg-white p-2 text-amber-700 transition-colors hover:bg-amber-100 disabled:text-amber-300"
                        >
                          <PencilIcon />
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteHoleOverride(o, index)}
                          disabled={saving}
                          aria-label={`Delete override for hole ${o.holeNumber}`}
                          className="rounded-lg border border-red-100 bg-white p-2 text-red-600 transition-colors hover:bg-red-50 disabled:text-red-300"
                        >
                          <TrashIcon />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Course Rating & Slope */}
            <div className="space-y-3 border-t border-gray-100 pt-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-gray-800">Course Rating &amp; Slope</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Used for slope-adjusted playing handicap. Leave blank if not applicable.
                  </p>
                </div>
                {!editingRatingSlope ? (
                  <button
                    type="button"
                    onClick={() => {
                      setCourseRatingDraft(round.courseRating != null ? String(round.courseRating) : "");
                      setSlopeRatingDraft(round.slopeRating != null ? String(round.slopeRating) : "");
                      setEditingRatingSlope(true);
                    }}
                    className="shrink-0 text-xs font-medium text-green-700 hover:underline"
                  >
                    Edit
                  </button>
                ) : (
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => setEditingRatingSlope(false)}
                      disabled={savingRatingSlope}
                      className="text-xs font-medium text-gray-500 hover:underline disabled:text-gray-300"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={saveRatingSlope}
                      disabled={savingRatingSlope}
                      className="text-xs font-semibold text-green-700 hover:underline disabled:text-green-300"
                    >
                      {savingRatingSlope ? "Saving…" : "Save"}
                    </button>
                  </div>
                )}
              </div>
              {group?.settings?.handicapMode === "slope_adjusted" &&
                (round.courseRating == null || round.slopeRating == null) && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  ⚠️ Slope-adjusted handicaps are on, but{" "}
                  {round.courseRating == null && round.slopeRating == null
                    ? "Course Rating and Slope are"
                    : round.courseRating == null
                    ? "Course Rating is"
                    : "Slope is"}{" "}
                  not set. Scorecards created without this data will use{" "}
                  {round.slopeRating == null ? "Slope 113 (standard)" : ""}
                  {round.slopeRating == null && round.courseRating == null ? " and " : ""}
                  {round.courseRating == null ? "no course rating differential" : ""}
                  . Set correct values before play begins.
                </div>
              )}
              {!editingRatingSlope ? (
                <div className="flex gap-3">
                  <div className="flex-1 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2 text-center">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Course Rating</p>
                    <p className="mt-0.5 text-sm font-semibold text-gray-800">
                      {round.courseRating != null ? round.courseRating : "—"}
                    </p>
                  </div>
                  <div className="flex-1 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2 text-center">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Slope</p>
                    <p className="mt-0.5 text-sm font-semibold text-gray-800">
                      {round.slopeRating != null ? round.slopeRating : "—"}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-gray-500 mb-1">Course Rating</label>
                    <input
                      type="number"
                      step="0.1"
                      min={50}
                      max={85}
                      value={courseRatingDraft}
                      onChange={(e) => setCourseRatingDraft(e.target.value)}
                      placeholder="e.g. 71.5"
                      className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-gray-500 mb-1">Slope</label>
                    <input
                      type="number"
                      min={55}
                      max={155}
                      value={slopeRatingDraft}
                      onChange={(e) => setSlopeRatingDraft(e.target.value)}
                      placeholder="e.g. 125"
                      className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Stroke Indexes */}
            {round.courseHoles.length === 18 && (
              <div className="space-y-3 border-t border-gray-100 pt-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-gray-800">Stroke Indexes</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Stroke index 1 = hardest hole. All 18 must be unique.
                    </p>
                  </div>
                  {!editingStrokeIndexes ? (
                    <button
                      type="button"
                      onClick={() => setEditingStrokeIndexes(true)}
                      className="shrink-0 text-xs font-medium text-green-700 hover:underline"
                    >
                      Edit
                    </button>
                  ) : (
                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingStrokeIndexes(false);
                          const drafts: Record<number, string> = {};
                          round.courseHoles.forEach((h) => {
                            drafts[h.number] = String(h.strokeIndex);
                          });
                          setStrokeIndexDrafts(drafts);
                        }}
                        disabled={savingStrokeIndexes}
                        className="text-xs font-medium text-gray-500 hover:underline disabled:text-gray-300"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={saveStrokeIndexes}
                        disabled={savingStrokeIndexes}
                        className="text-xs font-semibold text-green-700 hover:underline disabled:text-green-300"
                      >
                        {savingStrokeIndexes ? "Saving…" : "Save"}
                      </button>
                    </div>
                  )}
                </div>
                {round.courseHoles.every((h) => h.strokeIndex === h.number) && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                    ⚠️ Stroke indexes match hole numbers (1, 2, 3…) — the API likely
                    didn&apos;t provide real handicap data. Tap Edit to enter the correct values from the scorecard.
                  </div>
                )}
                <div className="grid grid-cols-6 gap-x-1.5 gap-y-1.5 text-xs" aria-label="Stroke indexes">
                  {round.courseHoles.flatMap((h) => [
                    <div
                      key={`lbl-${h.number}`}
                      className="flex items-center justify-center rounded-lg bg-gray-50 px-1 py-1.5 text-xs font-semibold text-gray-500"
                    >
                      H{h.number}
                    </div>,
                    editingStrokeIndexes ? (
                      <input
                        key={`si-${h.number}`}
                        type="number"
                        min={1}
                        max={18}
                        value={strokeIndexDrafts[h.number] ?? ""}
                        onChange={(e) =>
                          setStrokeIndexDrafts((d) => ({ ...d, [h.number]: e.target.value }))
                        }
                        className="w-full rounded-lg border border-gray-200 px-1 py-1.5 text-center text-xs text-gray-800 focus:outline-none focus:ring-1 focus:ring-green-500"
                      />
                    ) : (
                      <div
                        key={`si-${h.number}`}
                        className="flex items-center justify-center rounded-lg border border-gray-100 px-1 py-1.5 text-center font-medium text-gray-800"
                      >
                        {strokeIndexDrafts[h.number] ?? h.strokeIndex}
                      </div>
                    ),
                  ])}
                </div>
              </div>
            )}

            {/* Save to Corrections Library */}
            {round.teeSetId && (
              <div className="border-t border-gray-100 pt-5 space-y-2">
                <div>
                  <p className="text-sm font-semibold text-gray-800">Save as Course Corrections</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Saves the current Course Rating, Slope, and all hole Stroke Indexes as permanent corrections for this tee set. Next time you select this course, you&apos;ll be offered these values.
                  </p>
                </div>
                {correctionLibrarySaved && (
                  <div className="rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-700">
                    Corrections saved — they&apos;ll be offered next time this tee set is selected.
                  </div>
                )}
                <button
                  type="button"
                  onClick={saveToCorrectionsLibrary}
                  disabled={savingCorrectionLibrary}
                  className="w-full rounded-xl border border-green-200 bg-green-50 py-2.5 text-sm font-semibold text-green-700 transition-colors hover:bg-green-100 disabled:text-green-400"
                >
                  {savingCorrectionLibrary ? "Saving…" : "Save as course corrections"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Quick info */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-2">
        <h2 className="font-semibold text-gray-800 mb-2">Round Info</h2>
        <InfoRow label="Format" value={round.format === "stableford" ? "Stableford" : "Stroke Play"} />
        <InfoRow label="Tee set" value={round.teeSetName || "Custom"} />
        <InfoRow label="Course par" value={round.coursePar?.toString() || "Not set"} />
        <InfoRow label="Course rating" value={round.courseRating?.toString() || "Not set"} />
        <InfoRow label="Slope rating" value={round.slopeRating?.toString() || "Not set"} />
        <InfoRow label="Handicap mode" value={group?.settings?.handicapMode === "slope_adjusted" ? "Slope adjusted" : "Local"} />
        <InfoRow label="NTP holes" value={round.specialHoles.ntp.join(", ") || "None set"} />
        <InfoRow label="LD hole" value={round.specialHoles.ld?.toString() || "None set"} />
        <InfoRow label="T2 hole" value={round.specialHoles.t2?.toString() || "None set"} />
        <InfoRow label="T3 hole" value={round.specialHoles.t3?.toString() || "None set"} />
      </div>

      {/* Danger zone */}
      <div className="bg-white rounded-2xl shadow-sm border border-red-100 p-4 space-y-3">
        <div>
          <h2 className="font-semibold text-red-700">Delete Round</h2>
          <p className="mt-1 text-xs text-gray-500">
            Permanently removes this round and all linked scorecards, hole
            scores, official results, result feed posts, notifications, and
            round handicap history. Season standings and member stats are
            rebuilt from the remaining published results.
          </p>
        </div>

        {deleteError && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {deleteError}
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Type DELETE to confirm
          </label>
          <input
            type="text"
            value={deleteConfirm}
            onChange={(e) => setDeleteConfirm(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-red-500"
          />
        </div>

        <button
          type="button"
          onClick={handleDeleteRound}
          disabled={deleting || saving || deleteConfirm !== "DELETE"}
          className="w-full rounded-xl bg-red-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:bg-red-300"
        >
          {deleting ? "Deleting round..." : "Delete entire round"}
        </button>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-gray-500">{label}</span>
      <span className="font-medium text-gray-800">{value}</span>
    </div>
  );
}

function PencilIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M6 18h12"
      />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166M19.228 5.79 18.16 19.673A2.25 2.25 0 0 1 15.916 21H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .563c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916A2.25 2.25 0 0 0 13.5 2.25h-3A2.25 2.25 0 0 0 8.25 4.5v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
      />
    </svg>
  );
}

function needsTeeReview(member: AppUser) {
  return (
    member.gender === "female" ||
    member.usesSeniorTees === true ||
    member.usesProBackTees === true
  );
}

function buildSideWinnerMap(claims: SideClaim[]) {
  return claims.reduce<Record<string, string>>((map, claim) => {
    const key = claim.prizeType === "ntp" ? `ntp-${claim.holeNumber}` : claim.prizeType;
    if (claim.winnerId) map[key] = claim.winnerId;
    return map;
  }, {});
}

function getSuggestedRoundNumberForSeason(rounds: Round[], seasonValue: string) {
  const parsed = parseInt(seasonValue, 10);
  if (!Number.isFinite(parsed)) return "1";
  const highest = rounds
    .filter((r) => r.season === parsed)
    .reduce((max, r) => Math.max(max, r.roundNumber), 0);
  return String(highest + 1);
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
      <span className="block text-xs font-medium text-gray-700 mb-1">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500"
      >
        <option value="">No winner selected</option>
        {options.map((opt) => (
          <option key={opt.id} value={opt.id}>{opt.name}</option>
        ))}
      </select>
    </label>
  );
}

function CourseParCorrectionForm({
  holes,
  onSubmit,
  disabled,
}: {
  holes: Round["courseHoles"];
  onSubmit: (hole: number, par: number, yardage?: number) => void;
  disabled: boolean;
}) {
  const [hole, setHole] = useState("");
  const [par, setPar] = useState("");
  const [yardage, setYardage] = useState("");

  const handle = () => {
    if (!hole || !par) return;
    const parsedYardage = yardage.trim() !== "" ? parseInt(yardage, 10) : undefined;
    onSubmit(parseInt(hole), parseInt(par), parsedYardage);
    setHole("");
    setPar("");
    setYardage("");
  };

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-[1fr_7rem_3.5rem] gap-2">
        <select
          value={hole}
          onChange={(e) => setHole(e.target.value)}
          className="min-w-0 px-3 py-2.5 rounded-xl border border-gray-200 text-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
        >
          <option value="">Hole</option>
          {holes.map((h) => (
            <option key={h.number} value={h.number}>
              {getHoleOptionLabel(h)}
            </option>
          ))}
        </select>
        <select
          value={par}
          onChange={(e) => setPar(e.target.value)}
          className="min-w-0 px-2 py-2.5 rounded-xl border border-gray-200 text-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
        >
          <option value="">Par</option>
          {[3, 4, 5].map((n) => (
            <option key={n} value={n}>Par {n}</option>
          ))}
        </select>
        <input
          type="number"
          min={1}
          value={yardage}
          onChange={(e) => setYardage(e.target.value)}
          placeholder="m"
          className="min-w-0 rounded-xl border border-gray-200 px-2 py-2.5 text-center text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500"
          aria-label="Distance in metres"
        />
      </div>
      <button
        type="button"
        onClick={handle}
        disabled={disabled || !hole || !par}
        className="w-full rounded-xl border border-green-200 bg-green-50 py-2.5 text-sm font-semibold text-green-700 transition-colors hover:bg-green-100 disabled:text-green-400"
      >
        Save Correction
      </button>
    </div>
  );
}

function HoleOverrideForm({
  holes,
  onSubmit,
  disabled,
  editingOverride,
  onCancelEdit,
}: {
  holes: Round["courseHoles"];
  onSubmit: (hole: number, par: number, reason: string, yardage?: number) => void;
  disabled: boolean;
  editingOverride: HoleOverride | null;
  onCancelEdit: () => void;
}) {
  const [hole, setHole] = useState("");
  const [par, setPar] = useState("");
  const [yardage, setYardage] = useState("");
  const [reason, setReason] = useState("");
  const isEditing = Boolean(editingOverride);

  useEffect(() => {
    if (!editingOverride) {
      setHole("");
      setPar("");
      setYardage("");
      setReason("");
      return;
    }
    setHole(String(editingOverride.holeNumber));
    setPar(String(editingOverride.overridePar));
    setYardage(editingOverride.overrideYardage != null ? String(editingOverride.overrideYardage) : "");
    setReason(editingOverride.reason);
  }, [editingOverride]);

  const handle = () => {
    if (!hole || !par) return;
    const parsedYardage = yardage.trim() !== "" ? parseInt(yardage, 10) : undefined;
    onSubmit(parseInt(hole), parseInt(par), reason, parsedYardage);
    setHole("");
    setPar("");
    setYardage("");
    setReason("");
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <select
          value={hole}
          onChange={(e) => setHole(e.target.value)}
          disabled={isEditing}
          className="flex-1 px-3 py-2.5 rounded-xl border border-gray-200 text-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
        >
          <option value="">Hole</option>
          {holes.map((courseHole) => (
            <option key={courseHole.number} value={courseHole.number}>
              {getHoleOptionLabel(courseHole)}
            </option>
          ))}
        </select>
        <select
          value={par}
          onChange={(e) => setPar(e.target.value)}
          className="flex-1 px-3 py-2.5 rounded-xl border border-gray-200 text-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
        >
          <option value="">New par</option>
          {[3, 4, 5].map((n) => (
            <option key={n} value={n}>Par {n}</option>
          ))}
        </select>
        <input
          type="number"
          min={1}
          value={yardage}
          onChange={(e) => setYardage(e.target.value)}
          placeholder="m"
          className="w-16 min-w-0 rounded-xl border border-gray-200 px-2 py-2.5 text-center text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500"
          aria-label="Yardage override in metres"
        />
      </div>
      <input
        type="text"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason (e.g. GUR, temporary green)"
        className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
      />
      <button
        type="button"
        onClick={handle}
        disabled={disabled || !hole || !par}
        className="w-full bg-amber-500 hover:bg-amber-600 disabled:bg-amber-300 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors"
      >
        {isEditing
          ? "Save Override & Notify Members"
          : "Apply Override & Notify Members"}
      </button>
      {isEditing && (
        <button
          type="button"
          onClick={() => {
            onCancelEdit();
            setHole("");
            setPar("");
            setYardage("");
            setReason("");
          }}
          disabled={disabled}
          className="w-full rounded-xl border border-gray-200 bg-white py-2.5 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-50 disabled:text-gray-300"
        >
          Cancel edit
        </button>
      )}
    </div>
  );
}
