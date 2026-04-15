"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { format } from "date-fns";
import Link from "next/link";
import {
  deleteRoundCascade,
  getRound,
  updateRound,
  getScorecardsForRound,
} from "@/lib/firestore";
import {
  type SeededCourse,
  findSeededCourseByName,
  getCourseSearchLabel,
  getDriveHoleOptions,
  getFallbackCourseHoles,
  getHoleOptionLabel,
  getParThreeHoles,
  getTeeSet,
  getDefaultTeeSet,
  searchSeededCourses,
} from "@/lib/courseData";
import type { Round, RoundStatus, Scorecard, ScoringFormat, TeeTime } from "@/types";

export default function AdminRoundDetailPage() {
  const { roundId } = useParams<{ roundId: string }>();
  const router = useRouter();
  const [round, setRound] = useState<Round | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [success, setSuccess] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [scorecards, setScorecards] = useState<Scorecard[]>([]);
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
  const [teeTimes, setTeeTimes] = useState<Array<{ time: string; notes: string }>>([
    { time: "", notes: "" },
  ]);
  const selectedCourse = useMemo(
    () =>
      (courseId ? findSeededCourseByName(courseId) : null) ??
      findSeededCourseByName(courseName),
    [courseId, courseName]
  );
  const selectedTeeSet = courseId && teeSetId ? getTeeSet(courseId, teeSetId) : null;
  const courseSuggestions = useMemo(
    () => searchSeededCourses(courseName),
    [courseName]
  );
  const resolvedCourseFromInput = useMemo(
    () => findSeededCourseByName(courseName),
    [courseName]
  );
  const showCourseSuggestions =
    courseSuggestions.length > 0 &&
    !(selectedCourse && resolvedCourseFromInput?.id === selectedCourse.id);
  const holeOptions =
    selectedTeeSet?.holes ??
    (round?.courseHoles && round.courseHoles.length === 18
      ? round.courseHoles
      : getFallbackCourseHoles());
  const driveHoleOptions = getDriveHoleOptions(holeOptions);
  const refreshableTeeSet =
    selectedTeeSet ?? (selectedCourse ? getDefaultTeeSet(selectedCourse.id) : null);

  const applySeededCourse = (course: SeededCourse) => {
    const defaultTeeSet = getDefaultTeeSet(course.id);
    setCourseId(course.id);
    setTeeSetId(defaultTeeSet?.id ?? "");
    setCourseName(course.name);
    setLdHole("");
    setT2Hole("");
    setT3Hole("");
  };

  const handleCourseNameChange = (value: string) => {
    setCourseName(value);
    const matchedCourse = findSeededCourseByName(value);
    if (matchedCourse) {
      const defaultTeeSet = getDefaultTeeSet(matchedCourse.id);
      setCourseId(matchedCourse.id);
      setTeeSetId(defaultTeeSet?.id ?? "");
      return;
    }
    setCourseId("");
    setTeeSetId("");
  };

  const loadScorecards = async (r: Round) => {
    const cards = await getScorecardsForRound(r.id);
    setScorecards(cards);
  };

  useEffect(() => {
    if (roundId) {
      getRound(roundId).then((r) => {
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
                }))
              : [{ time: "", notes: "" }]
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

  const handleSaveDetails = async () => {
    if (!round) return;
    if (!courseName.trim() || !date) return;

    setSaving(true);
    const parsedRoundNumber =
      parseInt(roundNumber, 10) || round.roundNumber;
    const newDate = new Date(date);
    const appliedTeeSet = selectedTeeSet;
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
      .filter((t) => t.time || t.notes?.trim())
      .map((t, index) => ({
        id: `tee-${index + 1}`,
        time: t.time,
        playerIds: [],
        notes: t.notes?.trim() || null,
      }));

    await updateRound(round.id, {
      courseId: selectedCourse?.id ?? "",
      courseName: courseName.trim(),
      ...courseDetails,
      roundNumber: parsedRoundNumber,
      date: newDate,
      format: formatChoice,
      notes: notes.trim() || null,
      teeTimes: savedTeeTimes,
      specialHoles,
    });

    setRound({
      ...round,
      courseId: selectedCourse?.id ?? "",
      courseName: courseName.trim(),
      ...courseDetails,
      roundNumber: parsedRoundNumber,
      date: newDate,
      format: formatChoice,
      notes: notes.trim() || null,
      teeTimes: savedTeeTimes,
      specialHoles,
    });

    setSuccess("Round details updated");
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
    setSuccess("Course data refreshed from seeded catalogue");
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
    } catch {
      setDeleteError("Failed to delete round. Please try again.");
      setDeleting(false);
    }
  };

  const addTeeTime = () =>
    setTeeTimes([...teeTimes, { time: "", notes: "" }]);

  const removeTeeTime = (index: number) =>
    setTeeTimes(teeTimes.filter((_, i) => i !== index));

  const updateTeeTime = (
    index: number,
    field: "time" | "notes",
    value: string
  ) =>
    setTeeTimes(
      teeTimes.map((teeTime, i) =>
        i === index ? { ...teeTime, [field]: value } : teeTime
      )
    );

  const addHoleOverride = async (
    holeNumber: number,
    overridePar: number,
    reason: string
  ) => {
    if (!round) return;
    setSaving(true);
    const courseHole =
      (round.courseHoles.length === 18
        ? round.courseHoles
        : getFallbackCourseHoles()
      ).find((hole) => hole.number === holeNumber);
    const override = {
      holeNumber,
      originalPar: courseHole?.par ?? 4,
      overridePar,
      reason,
      overriddenAt: new Date(),
    };
    const updated = [...round.holeOverrides, override];
    await updateRound(round.id, { holeOverrides: updated });
    setRound({ ...round, holeOverrides: updated });
    setSuccess("Hole par updated. Members will be notified.");
    setSaving(false);
    setTimeout(() => setSuccess(""), 3000);
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
              placeholder="Start typing Morack, Waterford, Eagle Ridge..."
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500"
            />
            {showCourseSuggestions && (
              <div className="mt-2 rounded-xl border border-gray-100 bg-gray-50 p-1">
                {courseSuggestions.map((course) => (
                  <button
                    key={course.id}
                    type="button"
                    onClick={() => applySeededCourse(course)}
                    className="block w-full rounded-lg px-3 py-2 text-left text-xs text-gray-700 hover:bg-white"
                  >
                    <span className="font-medium text-gray-900">
                      {course.name}
                    </span>
                    <span className="block text-[11px] text-gray-500">
                      {getCourseSearchLabel(course)}
                    </span>
                  </button>
                ))}
              </div>
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
                  holes from the seeded course catalogue. LD, T2, and T3 stay as
                  currently selected below.
                </p>
                <button
                  type="button"
                  onClick={handleRefreshCourseData}
                  disabled={saving || !refreshableTeeSet}
                  className="w-full rounded-xl border border-green-200 bg-white px-3 py-2 text-xs font-semibold text-green-700 transition-colors hover:bg-green-100 disabled:text-green-300"
                >
                  {saving ? "Refreshing..." : "Refresh course data"}
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
              <button
                type="button"
                onClick={addTeeTime}
                className="text-xs font-medium text-green-700 underline"
              >
                + Add tee time
              </button>
            </div>
            {teeTimes.map((teeTime, index) => (
              <div key={index} className="flex gap-2 items-center">
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
                  placeholder="Group notes"
                  className="flex-1 px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500"
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

        <button
          type="button"
          onClick={handleSaveDetails}
          disabled={saving}
          className="w-full bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors"
        >
          {saving ? "Saving..." : "Save round details"}
        </button>
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
          Setting to &quot;Live&quot; opens scoring and notifies all members. &quot;Completed&quot; closes scoring.
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
                    className="flex items-center justify-between text-gray-700"
                  >
                    <span className="text-xs text-gray-400">
                      #{idx + 1}
                    </span>
                    <span className="flex-1 text-xs text-right">
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
        />

        {round.holeOverrides.length > 0 && (
          <div className="mt-3 space-y-2">
            <p className="text-xs font-medium text-gray-600">Current overrides:</p>
            {round.holeOverrides.map((o) => (
              <div
                key={o.holeNumber}
                className="bg-amber-50 rounded-xl px-3 py-2 text-sm text-amber-800"
              >
                Hole {o.holeNumber}: Par {o.originalPar} → {o.overridePar}
                {o.reason && <span className="text-amber-600"> ({o.reason})</span>}
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

function HoleOverrideForm({
  holes,
  onSubmit,
  disabled,
}: {
  holes: Round["courseHoles"];
  onSubmit: (hole: number, par: number, reason: string) => void;
  disabled: boolean;
}) {
  const [hole, setHole] = useState("");
  const [par, setPar] = useState("");
  const [reason, setReason] = useState("");

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
        Apply Override & Notify Members
      </button>
    </div>
  );
}
