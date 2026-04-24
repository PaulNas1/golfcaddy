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
  deleteRoundCascade,
  getActiveMembers,
  getRound,
  getRoundRsvps,
  notifyRoundPlayers,
  subscribeRoundRsvps,
  updateRound,
  getScorecardsForRound,
} from "@/lib/firestore";
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
  HoleOverride,
  Round,
  RoundStatus,
  RoundRsvp,
  Scorecard,
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
  const [editingOverride, setEditingOverride] = useState<HoleOverride | null>(
    null
  );
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
  const getScorecardPlayerName = (playerId: string) => {
    const member = members.find((item) => item.uid === playerId);
    return member ? formatShortMemberName(member, members) : "Player";
  };

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
      ]).then(([r, activeMembers, roundRsvps]) => {
        setMembers(activeMembers);
        setRsvps(roundRsvps);
        setRsvpsReady(true);
        setRound(r);
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

  const addGuestToTeeTime = (teeTimeIndex: number) => {
    const guestName =
      typeof window !== "undefined"
        ? window.prompt("Guest name")
        : null;
    const trimmed = guestName?.trim();
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
    reason: string
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
      await createNotificationsForUsers({
        recipientUserIds: activeUsers.map((user) => user.uid),
        groupId: round.groupId,
        type: "change_alert",
        title: "Course update",
        body: `Hole ${holeNumber} is now Par ${overridePar}${reason.trim() ? `: ${reason.trim()}` : "."}`,
        deepLink: `/rounds/${round.id}`,
        roundId: round.id,
      });
      setRound({ ...updatedRound, specialHoles });
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
          Round {round.roundNumber} · {round.season}
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
                    <span className="block text-[11px] text-gray-500">
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
              <p className="text-[11px] text-gray-400 mt-1">
                Searching GolfCourseAPI...
              </p>
            )}
            {apiCourseError && (
              <p className="text-[11px] text-amber-600 mt-1">
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
                <p className="text-[11px] text-gray-400 mt-1">
                  NTP holes from par 3s: {getParThreeHoles(selectedTeeSet).join(", ")}
                </p>
              )}
              <div className="mt-3 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-gray-700">
                      Player tee assignments
                    </p>
                    <p className="text-[11px] text-gray-400">
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
                      <p className="text-[11px] text-gray-400">
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
                                  <p className="text-[10px] font-medium text-amber-600">
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
                  <p className="text-[11px] text-green-700">
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
          <p className="text-[11px] text-gray-400">
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
        <h2 className="font-semibold text-gray-800">Round Status</h2>
        <div className="flex gap-2">
          {(["upcoming", "live", "completed"] as RoundStatus[]).map((s) => (
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
              {s === "live" ? "● Live" : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-400">
          Setting to &quot;Live&quot; opens scoring. Use Save & Notify Players
          above when members need an alert.
        </p>
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

      {/* Live leaderboard (summary) */}
      {round.status !== "upcoming" && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-800">Live Leaderboard</h2>
            <Link
              href={`/admin/rounds/${round.id}/leaderboard`}
              className="text-xs text-green-700 font-medium hover:underline"
            >
              View full table →
            </Link>
          </div>
          {scorecards.length === 0 ? (
            <p className="text-xs text-gray-400">
              No scorecards yet. Once players start entering scores, they will appear here.
            </p>
          ) : (
            <div className="space-y-1 text-sm">
              {scorecards
                .slice()
                .sort((a, b) => {
                  if (round.format === "stableford") {
                    const as = a.totalStableford ?? -Infinity;
                    const bs = b.totalStableford ?? -Infinity;
                    return bs - as;
                  }
                  const ag = a.totalGross ?? Infinity;
                  const bg = b.totalGross ?? Infinity;
                  return ag - bg;
                })
                .slice(0, 3)
                .map((c, idx) => (
                  <div
                    key={c.id}
                    className="grid grid-cols-[2rem_1fr_auto] items-center gap-2 text-gray-700"
                  >
                    <span className="text-xs text-gray-400">
                      #{idx + 1}
                    </span>
                    <span className="truncate text-xs font-medium text-gray-700">
                      {getScorecardPlayerName(c.playerId)}
                    </span>
                    <span className="text-xs font-semibold text-gray-800">
                      {round.format === "stableford"
                        ? c.totalStableford ?? "—"
                        : c.totalGross ?? "—"}
                    </span>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}

      {/* Override hole par */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-3">
        <h2 className="font-semibold text-gray-800">Override Hole Par</h2>
        <p className="text-xs text-gray-500">
          Change a hole&apos;s par for this round only (e.g. GUR). All players are notified instantly.
        </p>
        <HoleOverrideForm
          holes={holeOptions}
          onSubmit={addHoleOverride}
          disabled={saving}
          editingOverride={editingOverride}
          onCancelEdit={() => setEditingOverride(null)}
        />

        {round.holeOverrides.length > 0 && (
          <div className="mt-3 space-y-2">
            <p className="text-xs font-medium text-gray-600">Current overrides:</p>
            {round.holeOverrides.map((o, index) => (
              <div
                key={`${o.holeNumber}-${index}`}
                className="flex items-center justify-between gap-3 bg-amber-50 rounded-xl px-3 py-2 text-sm text-amber-800"
              >
                <div className="min-w-0">
                  <span className="font-medium">
                    Hole {o.holeNumber}: Par {o.originalPar} → {o.overridePar}
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

      {/* Quick info */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-2">
        <h2 className="font-semibold text-gray-800 mb-2">Round Info</h2>
        <InfoRow label="Format" value={round.format === "stableford" ? "Stableford" : "Stroke Play"} />
        <InfoRow label="Tee set" value={round.teeSetName || "Custom"} />
        <InfoRow label="Course par" value={round.coursePar?.toString() || "Not set"} />
        <InfoRow label="Slope rating" value={round.slopeRating?.toString() || "Not set"} />
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

function HoleOverrideForm({
  holes,
  onSubmit,
  disabled,
  editingOverride,
  onCancelEdit,
}: {
  holes: Round["courseHoles"];
  onSubmit: (hole: number, par: number, reason: string) => void;
  disabled: boolean;
  editingOverride: HoleOverride | null;
  onCancelEdit: () => void;
}) {
  const [hole, setHole] = useState("");
  const [par, setPar] = useState("");
  const [reason, setReason] = useState("");
  const isEditing = Boolean(editingOverride);

  useEffect(() => {
    if (!editingOverride) {
      setHole("");
      setPar("");
      setReason("");
      return;
    }
    setHole(String(editingOverride.holeNumber));
    setPar(String(editingOverride.overridePar));
    setReason(editingOverride.reason);
  }, [editingOverride]);

  const handle = () => {
    if (!hole || !par) return;
    onSubmit(parseInt(hole), parseInt(par), reason);
    setHole("");
    setPar("");
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
