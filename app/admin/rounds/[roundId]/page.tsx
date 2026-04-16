"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { format } from "date-fns";
import Link from "next/link";
import {
  getGolfCourseCatalogueCourse,
  searchGolfCourseCatalogue,
} from "@/lib/courseCatalogueClient";
import {
  deleteRoundCascade,
  getActiveMembers,
  getRound,
  getRoundRsvps,
  notifyRoundPlayers,
  updateRound,
  getScorecardsForRound,
} from "@/lib/firestore";
import {
  type SeededCourse,
  getCourseSearchLabel,
  getDriveHoleOptions,
  getEffectiveSpecialHoles,
  getFallbackCourseHoles,
  getHoleOptionLabel,
  getParThreeHoles,
} from "@/lib/courseData";
import {
  formatShortMemberName,
  getMemberNamesForIds,
  getShortMemberNamesForIds,
  normaliseTeeTimePlayerIds,
  randomiseMemberGroups,
  resolveMemberIdsFromText,
} from "@/lib/teeTimes";
import type {
  AppUser,
  HoleOverride,
  Round,
  RoundStatus,
  RoundRsvp,
  Scorecard,
  ScoringFormat,
  TeeTime,
} from "@/types";

type TeeTimeDraft = {
  time: string;
  notes: string;
  playerIds: string[];
};

export default function AdminRoundDetailPage() {
  const { roundId } = useParams<{ roundId: string }>();
  const router = useRouter();
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
  const [members, setMembers] = useState<AppUser[]>([]);
  const [rsvps, setRsvps] = useState<RoundRsvp[]>([]);
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
  const [teeTimes, setTeeTimes] = useState<TeeTimeDraft[]>([
    { time: "", notes: "", playerIds: [] },
  ]);
  const selectedCourse = useMemo(() => {
    const apiCourseById = apiCourses.find((course) => course.id === courseId);
    const apiCourseByName = apiCourses.find(
      (course) => course.name === courseName
    );

    return apiCourseById ?? apiCourseByName ?? null;
  }, [apiCourses, courseId, courseName]);
  const selectedTeeSet =
    selectedCourse?.teeSets.find((teeSet) => teeSet.id === teeSetId) ?? null;
  const apiCourseSuggestions = useMemo(
    () =>
      apiCourses.filter(
        (course) => course.id !== selectedCourse?.id
      ),
    [apiCourses, selectedCourse?.id]
  );
  const showCourseSuggestions = apiCourseSuggestions.length > 0;
  const holeOptions =
    selectedTeeSet?.holes ??
    (round?.courseHoles && round.courseHoles.length === 18
      ? round.courseHoles
      : getFallbackCourseHoles());
  const driveHoleOptions = getDriveHoleOptions(holeOptions);
  const refreshableTeeSet =
    selectedTeeSet ?? selectedCourse?.teeSets[0] ?? null;
  const acceptedMembers = useMemo(() => {
    if (!round?.rsvpOpen) return members;
    const acceptedIds = new Set(
      rsvps
        .filter((rsvp) => rsvp.status === "accepted")
        .map((rsvp) => rsvp.memberId)
    );
    return members.filter((member) => acceptedIds.has(member.uid));
  }, [members, round?.rsvpOpen, rsvps]);
  const getScorecardPlayerName = (playerId: string) => {
    const member = members.find((item) => item.uid === playerId);
    return member ? formatShortMemberName(member) : "Player";
  };

  const applyCourse = (course: SeededCourse) => {
    const defaultTeeSet = course.teeSets[0] ?? null;
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
    setCourseName(value);
    setCourseId("");
    setTeeSetId("");
  };

  useEffect(() => {
    const query = courseName.trim();

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
  }, [courseName, selectedCourse?.name]);

  const loadScorecards = async (r: Round) => {
    const cards = await getScorecardsForRound(r.id);
    setScorecards(cards);
  };

  useEffect(() => {
    if (roundId) {
      Promise.all([
        getRound(roundId),
        getActiveMembers("fourplay"),
        getRoundRsvps(roundId),
      ]).then(([r, activeMembers, roundRsvps]) => {
        setMembers(activeMembers);
        setRsvps(roundRsvps);
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
          setTeeTimes(
            r.teeTimes && r.teeTimes.length > 0
              ? r.teeTimes.map((t) => ({
                  time: t.time,
                  notes: t.notes ?? "",
                  playerIds: normaliseTeeTimePlayerIds(t, activeMembers),
                }))
              : [{ time: "", notes: "", playerIds: [] }]
          );
          loadScorecards(r);
        }
      });
    }
  }, [roundId]);

  const setStatus = async (status: RoundStatus) => {
    if (!round) return;
    setSaving(true);
    await updateRound(round.id, { status });
    setRound({ ...round, status });
    setSuccess(`Round marked as ${status}`);
    setSaving(false);
    setTimeout(() => setSuccess(""), 3000);
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
      .filter((t) => t.time || t.notes?.trim() || t.playerIds.length > 0)
      .map((t, index) => ({
        id: `tee-${index + 1}`,
        time: t.time,
        playerIds:
          t.playerIds.length > 0
            ? t.playerIds
            : resolveMemberIdsFromText(t.notes, members),
        notes: t.notes?.trim() || null,
      }));
    const savedCourseId =
      selectedCourse?.id ?? (preserveExistingCourseData ? round.courseId : "");

    const updatedRound: Round = {
      ...round,
      courseId: savedCourseId,
      courseName: courseName.trim(),
      ...courseDetails,
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
        notifiedBy: null,
        mode: round.rsvpOpen ? "updated" : "created",
      });
      setRsvps(await getRoundRsvps(round.id));
    }

    setRound(updatedRound);

    setSuccess(
      notifyPlayers
        ? "Round details saved and players notified"
        : "Round details updated"
    );
    setSaving(false);
    setTimeout(() => setSuccess(""), 3000);
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
      courseSource: refreshableTeeSet.source,
      specialHoles: refreshedSpecialHoles,
    };

    await updateRound(round.id, refreshedCourseDetails);
    setCourseId(selectedCourse.id);
    setCourseName(selectedCourse.name);
    setTeeSetId(refreshableTeeSet.id);
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
    setTeeTimes([...teeTimes, { time: "", notes: "", playerIds: [] }]);

  const removeTeeTime = (index: number) =>
    setTeeTimes(teeTimes.filter((_, i) => i !== index));

  const updateTeeTime = (
    index: number,
    field: "time" | "notes",
    value: string
  ) =>
    setTeeTimes(
      teeTimes.map((teeTime, i) => {
        if (i !== index) return teeTime;
        const updated = { ...teeTime, [field]: value };
        return field === "notes"
          ? {
              ...updated,
              playerIds: resolveMemberIdsFromText(value, members),
            }
          : updated;
      })
    );

  const toggleTeeTimePlayer = (teeTimeIndex: number, member: AppUser) => {
    setTeeTimes((current) =>
      current.map((teeTime, index) => {
        if (index !== teeTimeIndex) return teeTime;

        const playerIds = teeTime.playerIds.includes(member.uid)
          ? teeTime.playerIds.filter((playerId) => playerId !== member.uid)
          : [...teeTime.playerIds, member.uid];
        const names = getMemberNamesForIds(playerIds, members);

        return {
          ...teeTime,
          playerIds,
          notes: names.join(", "),
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
            notes: getShortMemberNamesForIds(playerIds, members).join(", "),
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

          {selectedCourse && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Tee set
              </label>
              <select
                value={teeSetId}
                onChange={(e) => setTeeSetId(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                {selectedCourse.teeSets.map((teeSet) => (
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
              <div className="mt-3 space-y-2 border-t border-green-100 pt-3">
                <p className="text-[11px] text-green-700">
                  Refresh pars, stroke indexes, distances, tee metadata, and NTP
                  holes from GolfCourseAPI. LD, T2, and T3 stay as
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
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500"
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

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-medium text-gray-700">
                Tee times
              </label>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={randomiseGroups}
                  className="text-xs font-medium text-green-700 underline"
                >
                  Randomise groups
                </button>
                <button
                  type="button"
                  onClick={addTeeTime}
                  className="text-xs font-medium text-green-700 underline"
                >
                  + Add tee time
                </button>
              </div>
            </div>
            <p className="text-[11px] text-gray-400">
              Add the players for each tee time. These names limit who can be
              selected when a marker starts a scorecard.
            </p>
            {round.rsvpOpen && (
              <p className="text-[11px] text-green-700">
                Showing accepted players only: {acceptedMembers.length}
              </p>
            )}
            {teeTimes.map((teeTime, index) => (
              <div
                key={index}
                className="rounded-xl border border-gray-100 bg-gray-50 p-3 space-y-2"
              >
                <div className="flex gap-2 items-center">
                  <input
                    type="time"
                    value={teeTime.time}
                    onChange={(e) =>
                      updateTeeTime(index, "time", e.target.value)
                    }
                    className="w-28 px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                  <input
                    type="text"
                    value={teeTime.notes}
                    onChange={(e) =>
                      updateTeeTime(index, "notes", e.target.value)
                    }
                    placeholder="Players, e.g. Paul, Leigh, Brad"
                    className="flex-1 min-w-0 px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                  {teeTimes.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeTeeTime(index)}
                      className="text-xs text-red-500 underline"
                    >
                      Remove
                    </button>
                  )}
                </div>
                {acceptedMembers.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {acceptedMembers.map((member) => {
                      const selected = teeTime.playerIds.includes(member.uid);
                      return (
                        <button
                          key={member.uid}
                          type="button"
                          onClick={() => toggleTeeTimePlayer(index, member)}
                          className={`rounded-lg border px-2.5 py-1 text-xs font-medium ${
                            selected
                              ? "border-green-600 bg-green-50 text-green-700"
                              : "border-gray-200 bg-white text-gray-500"
                          }`}
                        >
                          {formatShortMemberName(member)}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
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
