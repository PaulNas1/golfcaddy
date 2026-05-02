"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import TeeTimesEditor, { type TeeTimeDraftValue } from "@/components/TeeTimesEditor";
import {
  getGolfCourseCatalogueCourse,
  searchGolfCourseCatalogue,
} from "@/lib/courseCatalogueClient";
import {
  createRound,
  getActiveMembers,
  getCourseCorrection,
  getRounds,
  notifyRoundPlayers,
  subscribeGroup,
} from "@/lib/firestore";
import {
  type SeededCourse,
  getCourseSearchLabel,
  getDriveHoleOptions,
  getFallbackCourseHoles,
  getHoleOptionLabel,
  getParThreeHoles,
  getPreferredDefaultTeeSet,
} from "@/lib/courseData";
import { CourseCardPreview } from "@/components/CourseCardPreview";
import {
  getTeeTimeGroupLabel,
  randomiseMemberGroups,
  resolveMemberIdsFromText,
} from "@/lib/teeTimes";
import type {
  AppUser,
  CourseCorrection,
  CourseHole,
  Round,
  ScoringFormat,
  SpecialHoles,
  TeeTime,
} from "@/types";

const DATE_INPUT_CLASSNAME =
  "block h-[50px] w-full min-w-0 max-w-full appearance-none bg-white px-4 text-left text-base leading-[50px] text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500 [&::-webkit-date-and-time-value]:block [&::-webkit-date-and-time-value]:min-w-0 [&::-webkit-date-and-time-value]:text-left";

export default function CreateRoundPage() {
  const { appUser } = useAuth();
  const router = useRouter();
  const assignableMembers: AppUser[] = [];

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
  const [courseSearchActive, setCourseSearchActive] = useState(false);
  const [showCustomCourseSetup, setShowCustomCourseSetup] = useState(false);
  const [members, setMembers] = useState<AppUser[]>([]);
  const [activeSeason, setActiveSeason] = useState<number | null>(null);
  const [pendingCorrection, setPendingCorrection] = useState<CourseCorrection | null>(null);
  const [dismissedCorrectionId, setDismissedCorrectionId] = useState<string | null>(null);

  // Tee times state
  const [teeTimes, setTeeTimes] = useState<TeeTimeDraftValue[]>([
    { time: "", notes: "", playerIds: [], guestNames: [] },
  ]);
  const [customHoles, setCustomHoles] = useState<CourseHole[]>(
    getFallbackCourseHoles
  );
  const [customStrokeIndexInputs, setCustomStrokeIndexInputs] = useState<
    Record<number, string>
  >({});
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
  const showCourseSuggestions =
    courseSearchActive && apiCourseSuggestions.length > 0;
  const customCoursePar = customHoles.reduce(
    (total, hole) => total + hole.par,
    0
  );
  const customCourseDistanceCount = customHoles.filter(
    (hole) => typeof hole.distanceMeters === "number"
  ).length;

  useEffect(() => {
    getActiveMembers(appUser?.groupId ?? "fourplay")
      .then(setMembers)
      .catch(() => setMembers([]));
  }, [appUser?.groupId]);

  useEffect(() => {
    if (!appUser?.groupId) return;

    return subscribeGroup(
      appUser.groupId,
      (group) => {
        const season = group?.currentSeason ?? new Date().getFullYear();
        setActiveSeason(season);
        // Auto-set round number to next in the current season
        getRounds(appUser.groupId)
          .then((existingRounds) => {
            const seasonRounds = existingRounds.filter((r) => r.season === season);
            const maxNumber = seasonRounds.reduce(
              (max, r) => Math.max(max, r.roundNumber),
              0
            );
            setRoundNumber(String(maxNumber + 1));
          })
          .catch(() => {});
      },
      () => {
        setActiveSeason(new Date().getFullYear());
      }
    );
  }, [appUser?.groupId]);

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

  useEffect(() => {
    if (!teeSetId || !appUser?.groupId || !activeCourse) return;
    if (teeSetId === dismissedCorrectionId) return;

    getCourseCorrection(appUser.groupId, teeSetId)
      .then((correction) => {
        if (correction) setPendingCorrection(correction);
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teeSetId]);

  const applyCorrections = (correction: CourseCorrection) => {
    setApiCourses((current) =>
      current.map((course) => ({
        ...course,
        teeSets: course.teeSets.map((teeSet) => {
          if (teeSet.id !== correction.teeSetId) return teeSet;
          return {
            ...teeSet,
            courseRating: correction.correctedCourseRating ?? teeSet.courseRating,
            slopeRating: correction.correctedSlopeRating ?? teeSet.slopeRating,
            holes: teeSet.holes.map((hole) => {
              const item = correction.holeCorrections.find(
                (c) => c.holeNumber === hole.number
              );
              if (!item) return hole;
              return {
                ...hole,
                strokeIndex: item.strokeIndex,
                par: item.par,
                type:
                  item.par === 3 ? "par3" : item.par === 5 ? "par5" : "par4",
              };
            }),
          };
        }),
      }))
    );
    setPendingCorrection(null);
  };

  const handleCourseNameChange = (value: string) => {
    setCourseSearchActive(true);
    setCourseName(value);
    setCourseId("");
    setTeeSetId("");
    setPendingCorrection(null);
    setDismissedCorrectionId(null);
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
  }, [activeCourse?.name, courseName, courseSearchActive]);

  const addTeeTime = () =>
    setTeeTimes([
      ...teeTimes,
      { time: "", notes: "", playerIds: [], guestNames: [] },
    ]);
  const removeTeeTime = (i: number) =>
    setTeeTimes(teeTimes.filter((_, idx) => idx !== i));
  const updateTeeTimeTime = (i: number, val: string) =>
    setTeeTimes(
      teeTimes.map((t, idx) => {
        if (idx !== i) return t;
        return { ...t, time: val };
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
    if (assignableMembers.length === 0) {
      setError(
        "Players can be assigned after the round is created and members RSVP."
      );
      return;
    }

    try {
      const groups = randomiseMemberGroups(assignableMembers, teeTimes.length);
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
    if (field === "strokeIndex") {
      setCustomStrokeIndexInputs((current) => ({
        ...current,
        [holeNumber]: value,
      }));
    }

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

    if (!activeSeason) {
      setError("The active season is still loading. Please try again.");
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
        .filter(
          (t) =>
            t.time ||
            t.notes.trim() ||
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
            t.notes.trim() ||
            null,
        }));

      const roundData: Omit<Round, "id" | "createdAt" | "updatedAt"> = {
        groupId: appUser!.groupId,
        courseId: activeCourse?.id ?? "",
        courseName: courseName.trim(),
        roundName: null,
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
        season: activeSeason,
        roundNumber: parsedRoundNumber,
        format,
        status: "upcoming",
        notes: notes.trim() || null,
        teeTimes: savedTeeTimes,
        rsvpOpen: notifyPlayers,
        rsvpNotifiedAt: null,
        holeOverrides: [],
        specialHoles,
        scorecardsAvailable: true,
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
              {selectedTeeSet && selectedTeeSet.holes.length === 18 && (
                <div className="mt-3">
                  <CourseCardPreview
                    holes={selectedTeeSet.holes}
                    distanceUnit={appUser?.distanceUnit ?? "meters"}
                    teeSetName={selectedTeeSet.name}
                  />
                </div>
              )}

              {pendingCorrection && (
                <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 space-y-2">
                  <p className="text-sm font-semibold text-amber-800">
                    Saved course corrections available
                  </p>
                  <p className="text-xs text-amber-700">
                    You have saved corrections for {pendingCorrection.courseName} — {pendingCorrection.teeSetName}.
                    {pendingCorrection.correctedCourseRating != null &&
                      ` Course Rating: ${pendingCorrection.correctedCourseRating}.`}
                    {pendingCorrection.correctedSlopeRating != null &&
                      ` Slope: ${pendingCorrection.correctedSlopeRating}.`}
                    {" "}Hole Stroke Indexes and pars have been corrected for all 18 holes.
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => applyCorrections(pendingCorrection)}
                      className="flex-1 rounded-lg bg-amber-600 py-2 text-xs font-semibold text-white transition-colors hover:bg-amber-700"
                    >
                      Apply corrections
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDismissedCorrectionId(pendingCorrection.teeSetId);
                        setPendingCorrection(null);
                      }}
                      className="flex-1 rounded-lg border border-amber-200 bg-white py-2 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-50"
                    >
                      Use API data as-is
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {!activeCourse && (
            <div className="border-t border-gray-100 pt-3">
              <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-800">
                      Custom course setup
                    </h3>
                    <p className="mt-1 text-xs text-gray-500">
                      Use this when GolfCourseAPI does not return 18-hole round
                      data. The hole data is saved to this round only.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setShowCustomCourseSetup((current) => !current)
                    }
                    className="shrink-0 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-green-700 transition-colors hover:bg-green-50"
                    aria-expanded={showCustomCourseSetup}
                  >
                    {showCustomCourseSetup ? "Hide holes" : "Set up holes"}
                  </button>
                </div>
                <p className="mt-2 text-xs font-medium text-gray-600">
                  Custom par total: {customCoursePar} · {customHoles.length}{" "}
                  holes · {customCourseDistanceCount} distances entered
                </p>
              </div>
              {showCustomCourseSetup && (
                <div className="mt-3">
                  <div className="grid grid-cols-[34px_minmax(0,1fr)_62px_84px] items-center gap-1.5 text-xs font-semibold text-gray-500">
                      <span>Hole</span>
                      <span>Par</span>
                      <span>Index</span>
                      <span>Distance</span>
                  </div>
                  <div className="mt-2 space-y-2">
                    {customHoles.map((hole) => (
                      <div
                        key={hole.number}
                        className="grid grid-cols-[34px_minmax(0,1fr)_62px_84px] items-center gap-1.5 text-xs"
                      >
                        <span className="font-semibold text-gray-700">
                          H{hole.number}
                        </span>
                        <select
                          value={hole.par}
                          onChange={(e) =>
                            updateCustomHole(
                              hole.number,
                              "par",
                              e.target.value
                            )
                          }
                          className="min-w-0 rounded-lg border border-gray-200 bg-white px-2 py-2 text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500"
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
                          value={customStrokeIndexInputs[hole.number] ?? ""}
                          onChange={(e) =>
                            updateCustomHole(
                              hole.number,
                              "strokeIndex",
                              e.target.value
                            )
                          }
                          placeholder={String(hole.number)}
                          className="min-w-0 rounded-lg border border-gray-200 bg-white px-2 py-2 text-center text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500"
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
                          className="min-w-0 rounded-lg border border-gray-200 bg-white px-2 py-2 text-center text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500"
                          aria-label={`Hole ${hole.number} distance metres`}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Date & format */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-3">
          <h2 className="font-semibold text-gray-800">Round Details</h2>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
                className={DATE_INPUT_CLASSNAME}
              />
            </div>
          </div>

          <div className="rounded-xl border border-green-100 bg-green-50 px-3 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-green-700">
              Active season
            </p>
            <p className="mt-1 text-base font-semibold text-gray-800">
              {activeSeason ?? "Loading..."}
            </p>
            <p className="mt-1 text-xs text-gray-600">
              This round will count toward Season {activeSeason ?? "..."}. If
              you are creating a new-year round for a new ladder, change the
              active season in Admin Settings first.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Round number
            </label>
            <select
              value={roundNumber}
              onChange={(e) => setRoundNumber(e.target.value)}
              required
              className="w-full px-4 py-3 rounded-xl border border-gray-200 text-gray-800 text-base focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
            >
              {Array.from({ length: 30 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={String(n)}>
                  Round {n}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-400 mt-1">
              Auto-set to the next round in the current season. Adjust if needed.
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

        <TeeTimesEditor
          teeTimes={teeTimes}
          members={members}
          assignableMembers={assignableMembers}
          playersSummary="Players appear here after the round is created, invites are sent, and members RSVP."
          emptyPlayersMessage="No RSVP'd players yet. Create the round first, then assign tee times once members respond."
          onRandomise={randomiseGroups}
          onAddTeeTime={addTeeTime}
          onRemoveTeeTime={removeTeeTime}
          onUpdateTeeTimeTime={updateTeeTimeTime}
          onAssignPlayer={assignPlayerToTeeTime}
          onRemovePlayer={removePlayerFromTeeTime}
          onAddGuest={addGuestToTeeTime}
          onRemoveGuest={removeGuestFromTeeTime}
        />

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
