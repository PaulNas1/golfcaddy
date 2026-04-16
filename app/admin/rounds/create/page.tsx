"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import {
  getGolfCourseCatalogueCourse,
  searchGolfCourseCatalogue,
} from "@/lib/courseCatalogueClient";
import { createRound } from "@/lib/firestore";
import {
  type SeededCourse,
  findSeededCourseByName,
  getCourseSearchLabel,
  getDefaultTeeSet,
  getDriveHoleOptions,
  getFallbackCourseHoles,
  getHoleOptionLabel,
  getParThreeHoles,
  getTeeSet,
  searchSeededCourses,
} from "@/lib/courseData";
import type { ScoringFormat, SpecialHoles, TeeTime } from "@/types";

export default function CreateRoundPage() {
  const { appUser } = useAuth();
  const router = useRouter();

  const [courseId, setCourseId] = useState("");
  const [teeSetId, setTeeSetId] = useState("");
  const [courseName, setCourseName] = useState("");
  const [date, setDate] = useState("");
  const [roundNumber, setRoundNumber] = useState<string>("1");
  const [format, setFormat] = useState<ScoringFormat>("stableford");
  const [notes, setNotes] = useState("");
  const [ldHole, setLdHole] = useState("");
  const [t2Hole, setT2Hole] = useState("");
  const [t3Hole, setT3Hole] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [apiCourses, setApiCourses] = useState<SeededCourse[]>([]);
  const [apiCourseLoading, setApiCourseLoading] = useState(false);
  const [apiCourseError, setApiCourseError] = useState("");

  // Tee times state
  const [teeTimes, setTeeTimes] = useState([{ time: "", notes: "" }]);
  const selectedCourse = useMemo(
    () => findSeededCourseByName(courseName) ?? null,
    [courseName]
  );
  const selectedCourseById = useMemo(
    () => (courseId ? findSeededCourseByName(courseId) : null),
    [courseId]
  );
  const selectedApiCourseById = useMemo(
    () => apiCourses.find((course) => course.id === courseId) ?? null,
    [apiCourses, courseId]
  );
  const selectedApiCourseByName = useMemo(
    () => apiCourses.find((course) => course.name === courseName) ?? null,
    [apiCourses, courseName]
  );
  const activeCourse =
    selectedCourseById ??
    selectedApiCourseById ??
    selectedCourse ??
    selectedApiCourseByName;
  const selectedTeeSet =
    activeCourse?.teeSets.find((teeSet) => teeSet.id === teeSetId) ??
    (courseId && teeSetId ? getTeeSet(courseId, teeSetId) : null);
  const holeOptions = selectedTeeSet?.holes ?? getFallbackCourseHoles();
  const driveHoleOptions = getDriveHoleOptions(holeOptions);
  const courseSuggestions = useMemo(
    () => searchSeededCourses(courseName),
    [courseName]
  );
  const apiCourseSuggestions = useMemo(
    () =>
      apiCourses.filter(
        (course) =>
          course.id !== activeCourse?.id &&
          !courseSuggestions.some(
            (seededCourse) => seededCourse.name === course.name
          )
      ),
    [activeCourse?.id, apiCourses, courseSuggestions]
  );
  const resolvedCourseFromInput = useMemo(
    () => findSeededCourseByName(courseName),
    [courseName]
  );
  const showCourseSuggestions =
    (courseSuggestions.length > 0 || apiCourseSuggestions.length > 0) &&
    !(activeCourse && resolvedCourseFromInput?.id === activeCourse.id);

  const applyCourse = (course: SeededCourse) => {
    const defaultTeeSet = getDefaultTeeSet(course.id) ?? course.teeSets[0] ?? null;
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

  useEffect(() => {
    const query = courseName.trim();

    if (query.length < 3) {
      setApiCourses([]);
      setApiCourseError("");
      setApiCourseLoading(false);
      return;
    }
    if (activeCourse?.name === query) {
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
  }, [activeCourse?.name, courseName]);

  useEffect(() => {
    if (!courseId || teeSetId) return;
    const defaultTeeSet = getDefaultTeeSet(courseId);
    setTeeSetId(defaultTeeSet?.id ?? "");
  }, [courseId, teeSetId]);

  const addTeeTime = () => setTeeTimes([...teeTimes, { time: "", notes: "" }]);
  const removeTeeTime = (i: number) =>
    setTeeTimes(teeTimes.filter((_, idx) => idx !== i));
  const updateTeeTime = (i: number, field: "time" | "notes", val: string) =>
    setTeeTimes(teeTimes.map((t, idx) => (idx === i ? { ...t, [field]: val } : t)));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!courseName.trim() || !date) {
      setError("Course name and date are required.");
      return;
    }

    const parsedRoundNumber = parseInt(roundNumber, 10);
    if (!parsedRoundNumber || parsedRoundNumber <= 0) {
      setError("Round number must be a positive number.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const ntpHoles = selectedTeeSet
        ? getParThreeHoles(selectedTeeSet)
        : [3, 6, 12, 16];
      const specialHoles: SpecialHoles = {
        ntp: ntpHoles,
        ld: ldHole ? parseInt(ldHole) : null,
        t2: t2Hole ? parseInt(t2Hole) : null,
        t3: t3Hole ? parseInt(t3Hole) : null,
      };
      const savedTeeTimes: TeeTime[] = teeTimes
        .filter((t) => t.time || t.notes.trim())
        .map((t, index) => ({
          id: `tee-${index + 1}`,
          time: t.time,
          playerIds: [],
          notes: t.notes.trim() || null,
        }));

      await createRound({
        groupId: "fourplay",
        courseId: activeCourse?.id ?? "",
        courseName: courseName.trim(),
        teeSetId: selectedTeeSet?.id ?? null,
        teeSetName: selectedTeeSet?.name ?? null,
        coursePar: selectedTeeSet?.par ?? null,
        courseRating: selectedTeeSet?.courseRating ?? null,
        slopeRating: selectedTeeSet?.slopeRating ?? null,
        courseHoles: selectedTeeSet?.holes ?? [],
        courseSource: selectedTeeSet?.source ?? null,
        date: new Date(date),
        season: new Date().getFullYear(),
        roundNumber: parsedRoundNumber,
        format,
        status: "upcoming",
        notes: notes.trim() || null,
        teeTimes: savedTeeTimes,
        holeOverrides: [],
        specialHoles,
        resultsPublished: false,
        resultsPublishedAt: null,
        createdBy: appUser!.uid,
      });

      router.push("/admin/rounds");
    } catch {
      setError("Failed to create round. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5 pb-8">
      <h1 className="text-2xl font-bold text-gray-800">Create Round</h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-3">
          <h2 className="font-semibold text-gray-800">Course</h2>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Course search
            </label>
            <input
              type="text"
              value={courseName}
              onChange={(e) => handleCourseNameChange(e.target.value)}
              required
              placeholder="Start typing Morack, Waterford, Eagle Ridge..."
              className="w-full px-4 py-3 rounded-xl border border-gray-200 text-gray-800 text-base focus:outline-none focus:ring-2 focus:ring-green-500"
            />
            {showCourseSuggestions && (
              <div className="mt-2 rounded-xl border border-gray-100 bg-gray-50 p-1">
                {courseSuggestions.map((course) => (
                  <button
                    key={course.id}
                    type="button"
                    onClick={() => applyCourse(course)}
                    className="block w-full rounded-lg px-3 py-2 text-left text-sm text-gray-700 hover:bg-white"
                  >
                    <span className="font-medium text-gray-900">
                      {course.name}
                    </span>
                    <span className="block text-xs text-gray-500">
                      {getCourseSearchLabel(course)} · {course.teeSets.length} tee set
                      {course.teeSets.length === 1 ? "" : "s"}
                    </span>
                  </button>
                ))}
                {apiCourseSuggestions.map((course) => (
                  <button
                    key={course.id}
                    type="button"
                    onClick={() => applyApiCourse(course)}
                    disabled={apiCourseLoading}
                    className="block w-full rounded-lg px-3 py-2 text-left text-sm text-gray-700 hover:bg-white disabled:text-gray-400"
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
              <p className="text-xs text-amber-600 mt-1">{apiCourseError}</p>
            )}
            <p className="text-xs text-gray-400 mt-1">
              Select a prediction to auto-fill tee data, par, stroke indexes,
              distances, and NTP holes. Unmatched names stay as custom courses.
            </p>
          </div>

          {activeCourse && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Tee set
              </label>
              <select
                value={teeSetId}
                onChange={(e) => setTeeSetId(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 text-gray-800 text-base focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                {activeCourse.teeSets.map((teeSet) => (
                  <option key={teeSet.id} value={teeSet.id}>
                    {teeSet.name} - Par {teeSet.par}
                    {teeSet.slopeRating ? ` / Slope ${teeSet.slopeRating}` : ""}
                  </option>
                ))}
              </select>
              {selectedTeeSet && (
                <p className="text-xs text-gray-400 mt-1">
                  Source: {selectedTeeSet.source.provider}. NTP holes:{" "}
                  {getParThreeHoles(selectedTeeSet).join(", ")}.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Date & format */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-3">
          <h2 className="font-semibold text-gray-800">Round Details</h2>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
              className="w-full px-4 py-3 rounded-xl border border-gray-200 text-gray-800 text-base focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Round number
            </label>
            <input
              type="number"
              min={1}
              value={roundNumber}
              onChange={(e) => setRoundNumber(e.target.value)}
              required
              className="w-full px-4 py-3 rounded-xl border border-gray-200 text-gray-800 text-base focus:outline-none focus:ring-2 focus:ring-green-500"
            />
            <p className="text-xs text-gray-400 mt-1">
              Used for ordering rounds within the season (e.g. 1, 2, 3...).
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Scoring format
            </label>
            <div className="flex gap-2">
              {(["stableford", "stroke"] as ScoringFormat[]).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFormat(f)}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-medium border transition-colors ${
                    format === f
                      ? "bg-green-600 text-white border-green-600"
                      : "border-gray-200 text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  {f === "stableford" ? "🏌️ Stableford" : "📊 Stroke Play"}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Round notes (optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Any notes for players..."
              className="w-full px-4 py-3 rounded-xl border border-gray-200 text-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
        </div>

        {/* Tee times */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-800">Tee Times</h2>
            <button
              type="button"
              onClick={addTeeTime}
              className="text-green-600 text-sm font-medium hover:underline"
            >
              + Add
            </button>
          </div>
          <p className="text-xs text-gray-400">
            Enter tee off times for each group. Player assignment coming soon.
          </p>
          {teeTimes.map((tt, i) => (
            <div key={i} className="flex gap-2 items-center">
              <input
                type="time"
                value={tt.time}
                onChange={(e) => updateTeeTime(i, "time", e.target.value)}
                className="flex-1 px-3 py-2.5 rounded-xl border border-gray-200 text-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
              <input
                type="text"
                value={tt.notes}
                onChange={(e) => updateTeeTime(i, "notes", e.target.value)}
                placeholder="Group notes"
                className="flex-1 px-3 py-2.5 rounded-xl border border-gray-200 text-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
              {teeTimes.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeTeeTime(i)}
                  className="text-red-400 hover:text-red-600 px-2"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Special holes */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-3">
          <h2 className="font-semibold text-gray-800">Special Holes</h2>
          <p className="text-xs text-gray-400">
            NTP is automatically applied to all par 3s. Select the LD, T2, and T3 holes below.
          </p>

          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                💪 Longest Drive (LD)
              </label>
              <select
                value={ldHole}
                onChange={(e) => setLdHole(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 text-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
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
                <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
                <select
                  value={value}
                  onChange={(e) => setter(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
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

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-700 text-sm">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white font-semibold py-4 rounded-2xl text-base transition-colors"
        >
          {loading ? "Creating round..." : "Create Round & Notify Members"}
        </button>
      </form>
    </div>
  );
}
