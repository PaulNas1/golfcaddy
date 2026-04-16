"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import {
  getGolfCourseCatalogueCourse,
  searchGolfCourseCatalogue,
} from "@/lib/courseCatalogueClient";
import {
  createRound,
  getActiveMembers,
  notifyRoundPlayers,
} from "@/lib/firestore";
import {
  type SeededCourse,
  getCourseSearchLabel,
  getDriveHoleOptions,
  getFallbackCourseHoles,
  getHoleOptionLabel,
  getParThreeHoles,
} from "@/lib/courseData";
import {
  formatShortMemberName,
  getMemberNamesForIds,
  getShortMemberNamesForIds,
  randomiseMemberGroups,
  resolveMemberIdsFromText,
} from "@/lib/teeTimes";
import type {
  AppUser,
  CourseHole,
  Round,
  ScoringFormat,
  SpecialHoles,
  TeeTime,
} from "@/types";

type TeeTimeDraft = {
  time: string;
  notes: string;
  playerIds: string[];
};

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
  const [members, setMembers] = useState<AppUser[]>([]);

  // Tee times state
  const [teeTimes, setTeeTimes] = useState<TeeTimeDraft[]>([
    { time: "", notes: "", playerIds: [] },
  ]);
  const [customHoles, setCustomHoles] = useState<CourseHole[]>(
    getFallbackCourseHoles
  );
  const selectedApiCourseById = useMemo(
    () => apiCourses.find((course) => course.id === courseId) ?? null,
    [apiCourses, courseId]
  );
  const selectedApiCourseByName = useMemo(
    () => apiCourses.find((course) => course.name === courseName) ?? null,
    [apiCourses, courseName]
  );
  const activeCourse = selectedApiCourseById ?? selectedApiCourseByName;
  const selectedTeeSet =
    activeCourse?.teeSets.find((teeSet) => teeSet.id === teeSetId) ?? null;
  const holeOptions = selectedTeeSet?.holes ?? customHoles;
  const driveHoleOptions = getDriveHoleOptions(holeOptions);
  const apiCourseSuggestions = useMemo(
    () =>
      apiCourses.filter(
        (course) => course.id !== activeCourse?.id
      ),
    [activeCourse?.id, apiCourses]
  );
  const showCourseSuggestions = apiCourseSuggestions.length > 0;
  const customCoursePar = customHoles.reduce(
    (total, hole) => total + hole.par,
    0
  );

  useEffect(() => {
    getActiveMembers(appUser?.groupId ?? "fourplay")
      .then(setMembers)
      .catch(() => setMembers([]));
  }, [appUser?.groupId]);

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

  const addTeeTime = () =>
    setTeeTimes([...teeTimes, { time: "", notes: "", playerIds: [] }]);
  const removeTeeTime = (i: number) =>
    setTeeTimes(teeTimes.filter((_, idx) => idx !== i));
  const updateTeeTime = (i: number, field: "time" | "notes", val: string) =>
    setTeeTimes(
      teeTimes.map((t, idx) => {
        if (idx !== i) return t;
        const updated = { ...t, [field]: val };
        return field === "notes"
          ? {
              ...updated,
              playerIds: resolveMemberIdsFromText(val, members),
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
    if (members.length === 0) {
      setError("No active players are available to randomise.");
      return;
    }

    try {
      const groups = randomiseMemberGroups(members, teeTimes.length);
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
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not randomise groups.");
    }
  };

  const updateCustomHole = (
    holeNumber: number,
    field: "par" | "strokeIndex" | "distanceMeters",
    value: string
  ) => {
    setCustomHoles((holes) =>
      holes.map((hole) => {
        if (hole.number !== holeNumber) return hole;

        if (field === "distanceMeters") {
          const distance = parseInt(value, 10);
          return {
            ...hole,
            distanceMeters: Number.isFinite(distance) ? distance : undefined,
          };
        }

        const numericValue = parseInt(value, 10);
        if (!Number.isFinite(numericValue)) return hole;

        return {
          ...hole,
          [field]: numericValue,
          type:
            field === "par"
              ? numericValue === 3
                ? "par3"
                : numericValue === 5
                ? "par5"
                : "par4"
              : hole.type,
        };
      })
    );
  };

  const saveRound = async (notifyPlayers: boolean) => {
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
      const savedCourseHoles = selectedTeeSet?.holes ?? customHoles;
      const ntpHoles = selectedTeeSet
        ? getParThreeHoles(selectedTeeSet)
        : customHoles
            .filter((hole) => hole.par === 3)
            .map((hole) => hole.number);
      const specialHoles: SpecialHoles = {
        ntp: ntpHoles,
        ld: ldHole ? parseInt(ldHole) : null,
        t2: t2Hole ? parseInt(t2Hole) : null,
        t3: t3Hole ? parseInt(t3Hole) : null,
      };
      const savedTeeTimes: TeeTime[] = teeTimes
        .filter((t) => t.time || t.notes.trim() || t.playerIds.length > 0)
        .map((t, index) => ({
          id: `tee-${index + 1}`,
          time: t.time,
          playerIds:
            t.playerIds.length > 0
              ? t.playerIds
              : resolveMemberIdsFromText(t.notes, members),
          notes: t.notes.trim() || null,
        }));

      const roundData: Omit<Round, "id" | "createdAt" | "updatedAt"> = {
        groupId: "fourplay",
        courseId: activeCourse?.id ?? "",
        courseName: courseName.trim(),
        teeSetId: selectedTeeSet?.id ?? null,
        teeSetName: selectedTeeSet?.name ?? "Custom",
        coursePar: selectedTeeSet?.par ?? customCoursePar,
        courseRating: selectedTeeSet?.courseRating ?? null,
        slopeRating: selectedTeeSet?.slopeRating ?? null,
        courseHoles: savedCourseHoles,
        availableTeeSets: activeCourse?.teeSets ?? [],
        playerTeeAssignments: {},
        courseSource: selectedTeeSet?.source ?? {
          provider: "Admin custom",
          url: "",
          lastVerified: new Date().toISOString().slice(0, 10),
          confidence: "admin_verified",
        },
        date: new Date(date),
        season: new Date().getFullYear(),
        roundNumber: parsedRoundNumber,
        format,
        status: "upcoming",
        notes: notes.trim() || null,
        teeTimes: savedTeeTimes,
        rsvpOpen: notifyPlayers,
        rsvpNotifiedAt: null,
        holeOverrides: [],
        specialHoles,
        resultsPublished: false,
        resultsPublishedAt: null,
        createdBy: appUser!.uid,
      };

      const roundId = await createRound(roundData);

      if (notifyPlayers) {
        await notifyRoundPlayers({
          round: {
            id: roundId,
            ...roundData,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          activeUsers: members,
          notifiedBy: appUser,
          mode: "created",
        });
      }

      router.push("/admin/rounds");
    } catch {
      setError("Failed to create round. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await saveRound(false);
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
              placeholder="Start typing a course name..."
              className="w-full px-4 py-3 rounded-xl border border-gray-200 text-gray-800 text-base focus:outline-none focus:ring-2 focus:ring-green-500"
            />
            {showCourseSuggestions && (
              <div className="mt-2 rounded-xl border border-gray-100 bg-gray-50 p-1">
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
              Select a GolfCourseAPI result to auto-fill tee data, pars,
              distances, and NTP holes. If the course is not available, keep
              your typed name and save it as a custom course.
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

          {!activeCourse && (
            <div className="border-t border-gray-100 pt-3">
              <div className="mb-3">
                <h3 className="text-sm font-semibold text-gray-800">
                  Custom course setup
                </h3>
                <p className="text-xs text-gray-400 mt-1">
                  Use this when GolfCourseAPI does not have the course. The
                  hole data is saved to this round.
                </p>
                <p className="text-xs font-medium text-gray-600 mt-2">
                  Custom par total: {customCoursePar}
                </p>
              </div>
              <div className="space-y-2">
                {customHoles.map((hole) => (
                  <div
                    key={hole.number}
                    className="grid grid-cols-[44px_1fr_1fr_1fr] items-center gap-2 text-xs"
                  >
                    <span className="font-semibold text-gray-700">
                      H{hole.number}
                    </span>
                    <select
                      value={hole.par}
                      onChange={(e) =>
                        updateCustomHole(hole.number, "par", e.target.value)
                      }
                      className="min-w-0 rounded-lg border border-gray-200 px-2 py-2 text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500"
                      aria-label={`Hole ${hole.number} par`}
                    >
                      {[3, 4, 5].map((par) => (
                        <option key={par} value={par}>
                          Par {par}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min={1}
                      max={18}
                      value={hole.strokeIndex}
                      onChange={(e) =>
                        updateCustomHole(
                          hole.number,
                          "strokeIndex",
                          e.target.value
                        )
                      }
                      className="min-w-0 rounded-lg border border-gray-200 px-2 py-2 text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500"
                      aria-label={`Hole ${hole.number} stroke index`}
                    />
                    <input
                      type="number"
                      min={1}
                      value={hole.distanceMeters ?? ""}
                      onChange={(e) =>
                        updateCustomHole(
                          hole.number,
                          "distanceMeters",
                          e.target.value
                        )
                      }
                      placeholder="m"
                      className="min-w-0 rounded-lg border border-gray-200 px-2 py-2 text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500"
                      aria-label={`Hole ${hole.number} distance metres`}
                    />
                  </div>
                ))}
              </div>
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
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={randomiseGroups}
                className="text-green-700 text-sm font-medium hover:underline"
              >
                Randomise groups
              </button>
              <button
                type="button"
                onClick={addTeeTime}
                className="text-green-600 text-sm font-medium hover:underline"
              >
                + Add
              </button>
            </div>
          </div>
          <p className="text-xs text-gray-400">
            Enter the tee time and the players in each group. These player
            names control who can be selected when a marker starts a scorecard.
          </p>
          {teeTimes.map((tt, i) => (
            <div
              key={i}
              className="rounded-xl border border-gray-100 bg-gray-50 p-3 space-y-2"
            >
              <div className="flex gap-2 items-center">
                <input
                  type="time"
                  value={tt.time}
                  onChange={(e) => updateTeeTime(i, "time", e.target.value)}
                  className="w-32 px-3 py-2.5 rounded-xl border border-gray-200 text-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
                <input
                  type="text"
                  value={tt.notes}
                  onChange={(e) => updateTeeTime(i, "notes", e.target.value)}
                  placeholder="Players, e.g. Paul, Leigh, Brad"
                  className="flex-1 min-w-0 px-3 py-2.5 rounded-xl border border-gray-200 text-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
                {teeTimes.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeTeeTime(i)}
                    className="text-red-400 hover:text-red-600 px-2"
                    aria-label="Remove tee time"
                  >
                    ✕
                  </button>
                )}
              </div>
              {members.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {members.map((member) => {
                    const selected = tt.playerIds.includes(member.uid);
                    return (
                      <button
                        key={member.uid}
                        type="button"
                        onClick={() => toggleTeeTimePlayer(i, member)}
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

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-white hover:bg-gray-50 disabled:bg-gray-100 text-green-700 border border-green-200 font-semibold py-4 rounded-2xl text-base transition-colors"
          >
            {loading ? "Creating round..." : "Create Round"}
          </button>
          <button
            type="button"
            onClick={() => saveRound(true)}
            disabled={loading}
            className="w-full bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white font-semibold py-4 rounded-2xl text-base transition-colors"
          >
            {loading ? "Creating round..." : "Create & Notify Players"}
          </button>
        </div>
      </form>
    </div>
  );
}
