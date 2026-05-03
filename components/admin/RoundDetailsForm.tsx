"use client";

import { useEffect, useMemo, useState } from "react";
import TeeTimesEditor, { type TeeTimeDraftValue } from "@/components/TeeTimesEditor";
import {
  getGolfCourseCatalogueCourse,
  searchGolfCourseCatalogue,
} from "@/lib/courseCatalogueClient";
import { getCourseCorrection } from "@/lib/firestore";
import {
  type SeededCourse,
  getCourseSearchLabel,
  getDriveHoleOptions,
  getFallbackCourseHoles,
  getHoleOptionLabel,
  getParThreeHoles,
  getPreferredDefaultTeeSet,
  getRoundTeeSets,
} from "@/lib/courseData";
import { CourseCardPreview } from "@/components/CourseCardPreview";
import {
  formatShortMemberName,
  getTeeTimeGroupLabel,
  randomiseMemberGroups,
  resolveMemberIdsFromText,
} from "@/lib/teeTimes";
import { useAuth } from "@/contexts/AuthContext";
import type {
  AppUser,
  CourseTeeSet,
  CourseHole,
  CourseCorrection,
  Round,
  ScoringFormat,
  SpecialHoles,
  TeeTime,
} from "@/types";

// ─── Helper functions ─────────────────────────────────────────────────────────

function mergeTeeSets(...groups: Array<CourseTeeSet[] | null | undefined>): CourseTeeSet[] {
  const merged = new Map<string, CourseTeeSet>();
  groups.forEach((group) => {
    group?.forEach((teeSet) => {
      merged.set(teeSet.id, teeSet);
    });
  });
  return Array.from(merged.values());
}

function needsTeeReview(member: AppUser): boolean {
  return (
    member.gender === "female" ||
    member.usesSeniorTees === true ||
    member.usesProBackTees === true
  );
}

function extractApiId(
  courseId: string | null | undefined,
  teeSetId: string | null | undefined
): number | null {
  const courseMatch = courseId?.match(/^golfcourseapi-(\d+)$/);
  if (courseMatch) return Number(courseMatch[1]);

  const teeSetMatch = teeSetId?.match(/^golfcourseapi-(\d+)-/);
  if (teeSetMatch) return Number(teeSetMatch[1]);

  return null;
}

const DATE_INPUT_CLASSNAME =
  "block h-[42px] w-full min-w-0 max-w-full appearance-none rounded-xl border border-gray-200 bg-white px-3 text-left text-sm leading-[42px] text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500 [&::-webkit-date-and-time-value]:block [&::-webkit-date-and-time-value]:min-w-0 [&::-webkit-date-and-time-value]:text-left";

// ─── Public types ─────────────────────────────────────────────────────────────

export type RoundFormSavePayload = {
  courseId: string;
  courseName: string;
  teeSetId: string | null;
  teeSetName: string | null;
  coursePar: number | null;
  courseRating: number | null;
  slopeRating: number | null;
  courseHoles: CourseHole[];
  availableTeeSets: CourseTeeSet[];
  courseSource: Round["courseSource"];
  date: Date;
  roundNumber: number;
  format: ScoringFormat;
  notes: string | null;
  teeTimes: TeeTime[];
  specialHoles: SpecialHoles;
};

// ─── Props ────────────────────────────────────────────────────────────────────

type RoundDetailsFormProps = {
  existingRound?: Round | null;
  activeSeason?: number | null;
  members: AppUser[];
  assignableMembers?: AppUser[];
  playersSummary?: string;
  emptyPlayersMessage: string;
  teeTimes?: TeeTimeDraftValue[];
  onTeeTimes?: (next: TeeTimeDraftValue[]) => void;
  playerTeeAssignments?: Record<string, string>;
  onPlayerTeeAssignmentsChange?: (v: Record<string, string>) => void;
  onRefreshCourseData?: (course: SeededCourse, teeSet: CourseTeeSet) => Promise<void>;
  refreshing?: boolean;
  onSave: (payload: RoundFormSavePayload, notifyPlayers: boolean) => Promise<void>;
  saving: boolean;
  error?: string;
  initialRoundNumber?: string;
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function RoundDetailsForm({
  existingRound,
  activeSeason,
  members,
  assignableMembers,
  playersSummary,
  emptyPlayersMessage,
  teeTimes: controlledTeeTimes,
  onTeeTimes,
  playerTeeAssignments,
  onPlayerTeeAssignmentsChange,
  onRefreshCourseData,
  refreshing,
  onSave,
  saving,
  error,
  initialRoundNumber,
}: RoundDetailsFormProps) {
  const { appUser } = useAuth();

  // ─── Core form state ────────────────────────────────────────────────────────
  const [courseId, setCourseId] = useState(existingRound?.courseId ?? "");
  const [teeSetId, setTeeSetId] = useState(existingRound?.teeSetId ?? "");
  const [courseName, setCourseName] = useState(existingRound?.courseName ?? "");

  const [date, setDate] = useState(() => {
    if (existingRound) {
      const d = existingRound.date;
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    }
    return "";
  });

  const [roundNumber, setRoundNumber] = useState(
    existingRound ? String(existingRound.roundNumber) : (initialRoundNumber ?? "1")
  );

  const [scoringFormat, setScoringFormat] = useState<ScoringFormat>(
    existingRound?.format ?? "stableford"
  );

  const [notes, setNotes] = useState(existingRound?.notes ?? "");

  const [ldHole, setLdHole] = useState(
    existingRound?.specialHoles.ld ? String(existingRound.specialHoles.ld) : ""
  );
  const [t2Hole, setT2Hole] = useState(
    existingRound?.specialHoles.t2 ? String(existingRound.specialHoles.t2) : ""
  );
  const [t3Hole, setT3Hole] = useState(
    existingRound?.specialHoles.t3 ? String(existingRound.specialHoles.t3) : ""
  );

  // ─── API / course search state ───────────────────────────────────────────────
  const [apiCourses, setApiCourses] = useState<SeededCourse[]>([]);
  const [apiCourseLoading, setApiCourseLoading] = useState(false);
  const [apiCourseError, setApiCourseError] = useState("");
  const [courseSearchActive, setCourseSearchActive] = useState(false);

  // ─── Create-mode only state ──────────────────────────────────────────────────
  const [showCustomCourseSetup, setShowCustomCourseSetup] = useState(false);
  const [customHoles, setCustomHoles] = useState<CourseHole[]>(getFallbackCourseHoles);
  const [customStrokeIndexInputs, setCustomStrokeIndexInputs] = useState<Record<number, string>>({});
  const [pendingCorrection, setPendingCorrection] = useState<CourseCorrection | null>(null);
  const [dismissedCorrectionId, setDismissedCorrectionId] = useState<string | null>(null);

  // ─── Internal tee times (uncontrolled mode) ──────────────────────────────────
  const [internalTeeTimes, setInternalTeeTimes] = useState<TeeTimeDraftValue[]>([
    { time: "", notes: "", playerIds: [], guestNames: [] },
  ]);

  // ─── Edit-mode tee assignment panel ─────────────────────────────────────────
  const [showTeeAssignments, setShowTeeAssignments] = useState(false);

  // ─── Tee time resolution ─────────────────────────────────────────────────────
  const activeTeeTimes = controlledTeeTimes !== undefined ? controlledTeeTimes : internalTeeTimes;
  const setActiveTeeTimes = (next: TeeTimeDraftValue[]) => {
    if (controlledTeeTimes !== undefined) {
      onTeeTimes!(next);
    } else {
      setInternalTeeTimes(next);
    }
  };

  // ─── Derived: course ─────────────────────────────────────────────────────────
  const selectedCourse = useMemo(() => {
    const byId = apiCourses.find((c) => c.id === courseId);
    const byName = apiCourses.find((c) => c.name === courseName);
    return byId ?? byName ?? null;
  }, [apiCourses, courseId, courseName]);

  const courseTeeSets = useMemo(
    () => mergeTeeSets(selectedCourse?.teeSets, existingRound ? getRoundTeeSets(existingRound) : []),
    [selectedCourse?.teeSets, existingRound]
  );

  const selectedTeeSet = courseTeeSets.find((ts) => ts.id === teeSetId) ?? null;

  const apiCourseSuggestions = useMemo(
    () => apiCourses.filter((c) => c.id !== selectedCourse?.id),
    [apiCourses, selectedCourse?.id]
  );

  const showCourseSuggestions = courseSearchActive && apiCourseSuggestions.length > 0;

  const holeOptions =
    selectedTeeSet?.holes ??
    (existingRound?.courseHoles?.length === 18 ? existingRound.courseHoles : customHoles);

  const driveHoleOptions = getDriveHoleOptions(holeOptions);

  const customCoursePar = customHoles.reduce((total, hole) => total + hole.par, 0);
  const customCourseDistanceCount = customHoles.filter(
    (hole) => typeof hole.distanceMeters === "number"
  ).length;

  const refreshableTeeSet =
    selectedTeeSet ?? getPreferredDefaultTeeSet(selectedCourse?.teeSets ?? []) ?? null;

  // ─── Derived: edit-mode tee assignments ─────────────────────────────────────
  const acceptedMembers = assignableMembers ?? [];

  const assignmentTeeSets = useMemo(
    () => mergeTeeSets(courseTeeSets, existingRound?.availableTeeSets, selectedCourse?.teeSets),
    [courseTeeSets, existingRound?.availableTeeSets, selectedCourse?.teeSets]
  );

  const teeReviewMembers = acceptedMembers.filter(
    (m) => needsTeeReview(m) && !playerTeeAssignments?.[m.uid]
  );

  const teeOverrideCount = Object.values(playerTeeAssignments ?? {}).filter(Boolean).length;

  // ─── Effect: initial API course load (edit mode) ─────────────────────────────
  useEffect(() => {
    if (!existingRound) return;

    const existingTeeSets = getRoundTeeSets(existingRound);
    if (existingTeeSets.length > 1) return;

    const apiId = extractApiId(existingRound.courseId, existingRound.teeSetId);
    if (!apiId) return;

    let cancelled = false;
    setApiCourseLoading(true);

    getGolfCourseCatalogueCourse(apiId)
      .then((result) => {
        if (cancelled) return;

        if (result.course && result.course.teeSets.length > 0) {
          setApiCourses((current) => [
            result.course!,
            ...current.filter((c) => c.id !== result.course!.id),
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
  // Run once on mount (existingRound identity is stable on first render)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Effect: course sync on refresh (edit mode) ──────────────────────────────
  // When the parent refreshes course data via onRefreshCourseData, it updates
  // existingRound and the new courseId/teeSetId/courseName come in here.
  useEffect(() => {
    if (!existingRound) return;
    setCourseId(existingRound.courseId);
    setTeeSetId(existingRound.teeSetId ?? "");
    setCourseName(existingRound.courseName);
  }, [existingRound?.courseId, existingRound?.teeSetId, existingRound?.courseName]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Effect: course search debounce ─────────────────────────────────────────
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

  // ─── Effect: course correction check (create mode only) ─────────────────────
  useEffect(() => {
    if (existingRound) return;
    if (!teeSetId || !appUser?.groupId || !selectedCourse) return;
    if (teeSetId === dismissedCorrectionId) return;

    getCourseCorrection(appUser.groupId, teeSetId)
      .then((correction) => {
        if (correction) setPendingCorrection(correction);
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teeSetId]);

  // ─── Course handlers ─────────────────────────────────────────────────────────
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
        setApiCourseError(result.error ?? "Could not load tee data for that course.");
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
    if (!existingRound) {
      setPendingCorrection(null);
      setDismissedCorrectionId(null);
    }
  };

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
                type: item.par === 3 ? "par3" : item.par === 5 ? "par5" : "par4",
              };
            }),
          };
        }),
      }))
    );
    setPendingCorrection(null);
  };

  // ─── Custom hole handlers (create mode only) ─────────────────────────────────
  const updateCustomHole = (
    holeNumber: number,
    field: "par" | "strokeIndex" | "distanceMeters",
    value: string
  ) => {
    if (field === "strokeIndex") {
      setCustomStrokeIndexInputs((current) => ({ ...current, [holeNumber]: value }));
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
              ? numericValue === 3 ? "par3" : numericValue === 5 ? "par5" : "par4"
              : hole.type,
        };
      })
    );
  };

  // ─── Tee time handlers ───────────────────────────────────────────────────────
  const addTeeTime = () =>
    setActiveTeeTimes([
      ...activeTeeTimes,
      { time: "", notes: "", playerIds: [], guestNames: [] },
    ]);

  const removeTeeTime = (i: number) =>
    setActiveTeeTimes(activeTeeTimes.filter((_, idx) => idx !== i));

  const updateTeeTimeTime = (i: number, val: string) =>
    setActiveTeeTimes(
      activeTeeTimes.map((t, idx) => {
        if (idx !== i) return t;
        return { ...t, time: val };
      })
    );

  const assignPlayerToTeeTime = (teeTimeIndex: number, member: AppUser) => {
    setActiveTeeTimes(
      activeTeeTimes.map((teeTime, index) => {
        const existingPlayerIds = teeTime.playerIds.filter(
          (playerId) => playerId !== member.uid
        );
        const shouldAssignToThisTeeTime =
          index === teeTimeIndex &&
          !activeTeeTimes[teeTimeIndex]?.playerIds.includes(member.uid);
        const playerIds = shouldAssignToThisTeeTime
          ? [...existingPlayerIds, member.uid]
          : existingPlayerIds;
        const notes = getTeeTimeGroupLabel(playerIds, teeTime.guestNames, members);
        return { ...teeTime, playerIds, notes };
      })
    );
  };

  const removePlayerFromTeeTime = (teeTimeIndex: number, member: AppUser) => {
    setActiveTeeTimes(
      activeTeeTimes.map((teeTime, index) => {
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

    setActiveTeeTimes(
      activeTeeTimes.map((teeTime, index) => {
        if (index !== teeTimeIndex) return teeTime;
        const guestNames = Array.from(new Set([...teeTime.guestNames, trimmed]));
        return {
          ...teeTime,
          guestNames,
          notes: getTeeTimeGroupLabel(teeTime.playerIds, guestNames, members),
        };
      })
    );
  };

  const removeGuestFromTeeTime = (teeTimeIndex: number, guestName: string) => {
    setActiveTeeTimes(
      activeTeeTimes.map((teeTime, index) => {
        if (index !== teeTimeIndex) return teeTime;
        const guestNames = teeTime.guestNames.filter((name) => name !== guestName);
        return {
          ...teeTime,
          guestNames,
          notes: getTeeTimeGroupLabel(teeTime.playerIds, guestNames, members),
        };
      })
    );
  };

  const randomiseGroups = () => {
    if (acceptedMembers.length === 0) return;

    try {
      const groups = randomiseMemberGroups(acceptedMembers, activeTeeTimes.length);
      setActiveTeeTimes(
        activeTeeTimes.map((teeTime, index) => {
          const group = groups[index] ?? [];
          const playerIds = group.map((member) => member.uid);
          return {
            ...teeTime,
            playerIds,
            guestNames: teeTime.guestNames,
            notes: getTeeTimeGroupLabel(playerIds, teeTime.guestNames, members),
          };
        })
      );
    } catch {
      // silently ignore — caller can show its own error
    }
  };

  // ─── Payload computation ─────────────────────────────────────────────────────
  const computePayload = (): RoundFormSavePayload => {
    const appliedTeeSet = selectedTeeSet;
    const preserveExistingCourseData =
      !!existingRound &&
      !appliedTeeSet &&
      courseName.trim() === existingRound.courseName &&
      existingRound.courseHoles.length === 18;

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
          teeSetId: existingRound!.teeSetId,
          teeSetName: existingRound!.teeSetName,
          coursePar: existingRound!.coursePar,
          courseRating: existingRound!.courseRating,
          slopeRating: existingRound!.slopeRating,
          courseHoles: existingRound!.courseHoles,
          courseSource: existingRound!.courseSource,
        }
      : {
          teeSetId: null,
          teeSetName: existingRound ? null : "Custom",
          coursePar: existingRound ? null : customCoursePar,
          courseRating: null,
          slopeRating: null,
          courseHoles: existingRound ? [] : customHoles,
          courseSource: existingRound
            ? null
            : {
                provider: "Admin custom",
                url: "",
                lastVerified: new Date().toISOString().slice(0, 10),
                confidence: "admin_verified" as const,
              },
        };

    const isEditingExistingCourse =
      !!existingRound && !selectedCourse && courseName.trim() === existingRound.courseName;
    const resolvedCourseId =
      selectedCourse?.id ??
      ((isEditingExistingCourse || preserveExistingCourseData) ? existingRound!.courseId : "");
    const resolvedAvailableTeeSets =
      selectedCourse?.teeSets ??
      ((isEditingExistingCourse || preserveExistingCourseData) ? courseTeeSets : []);

    const ntpHoles = appliedTeeSet
      ? getParThreeHoles(appliedTeeSet)
      : preserveExistingCourseData
      ? (existingRound!.specialHoles.ntp ?? [])
      : customHoles.filter((h) => h.par === 3).map((h) => h.number);

    const specialHoles: SpecialHoles = {
      ntp: ntpHoles,
      ld: ldHole ? parseInt(ldHole, 10) : null,
      t2: t2Hole ? parseInt(t2Hole, 10) : null,
      t3: t3Hole ? parseInt(t3Hole, 10) : null,
    };

    const savedTeeTimes: TeeTime[] = activeTeeTimes
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

    return {
      courseId: resolvedCourseId,
      courseName: courseName.trim(),
      ...courseDetails,
      availableTeeSets: resolvedAvailableTeeSets,
      date: new Date(date),
      roundNumber: parseInt(roundNumber, 10),
      format: scoringFormat,
      notes: notes.trim() || null,
      teeTimes: savedTeeTimes,
      specialHoles,
    };
  };

  // ─── Save handler ────────────────────────────────────────────────────────────
  const handleSave = async (notifyPlayers: boolean) => {
    if (!courseName.trim() || !date) return;
    const parsed = parseInt(roundNumber, 10);
    if (!parsed || parsed <= 0) return;
    await onSave(computePayload(), notifyPlayers);
  };

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-3">
      <h2 className="font-semibold text-gray-800">Round Details</h2>

      {/* Course search */}
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">
          Course search
        </label>
        <input
          type="text"
          value={courseName}
          onChange={(e) => handleCourseNameChange(e.target.value)}
          required
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
                <span className="font-medium text-gray-900">{course.name}</span>
                <span className="block text-xs text-gray-500">
                  GolfCourseAPI · {getCourseSearchLabel(course)}
                  {course.teeSets.length > 0
                    ? ` · ${course.teeSets.length} tee set${course.teeSets.length === 1 ? "" : "s"}`
                    : " · tap to load tee data"}
                </span>
              </button>
            ))}
          </div>
        )}
        {apiCourseLoading && (
          <p className="text-xs text-gray-400 mt-1">Searching GolfCourseAPI...</p>
        )}
        {apiCourseError && (
          <p className="text-xs text-amber-600 mt-1">{apiCourseError}</p>
        )}
        <p className="text-xs text-gray-400 mt-1">
          Select a GolfCourseAPI result to auto-fill tee data, pars, distances, and NTP holes.
          If the course is not available, keep your typed name and save it as a custom course.
        </p>
      </div>

      {/* Tee set selector */}
      {courseTeeSets.length > 0 && (
        <div>
          <div className="mb-1 flex items-center justify-between gap-2">
            <label className="block text-xs font-medium text-gray-700">Tee set</label>
            {existingRound && teeReviewMembers.length > 0 && (
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
            {(existingRound ? assignmentTeeSets : courseTeeSets).map((teeSet) => (
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

          {/* Edit mode: player tee assignments panel */}
          {existingRound && assignmentTeeSets.length > 0 && playerTeeAssignments && (
            <div className="mt-3 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-gray-700">Player tee assignments</p>
                  <p className="text-xs text-gray-400">
                    {acceptedMembers.length} accepted ·{" "}
                    {Math.max(acceptedMembers.length - teeOverrideCount, 0)} default ·{" "}
                    {teeOverrideCount} override
                    {teeReviewMembers.length > 0 ? ` · ${teeReviewMembers.length} review` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowTeeAssignments((v) => !v)}
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
                            {suggestedReview && !playerTeeAssignments[member.uid] && (
                              <p className="text-xs font-medium text-amber-600">Review</p>
                            )}
                          </div>
                          <select
                            value={playerTeeAssignments[member.uid] ?? ""}
                            onChange={(event) =>
                              onPlayerTeeAssignmentsChange?.({
                                ...playerTeeAssignments,
                                [member.uid]: event.target.value,
                              })
                            }
                            className="min-w-0 rounded-lg border border-gray-200 bg-white px-2 py-2 text-xs text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500"
                            aria-label={`Tee set for ${member.displayName}`}
                          >
                            <option value="">
                              Default{selectedTeeSet ? ` (${selectedTeeSet.name})` : ""}
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
          )}

          {/* Edit mode: refresh API course data */}
          {existingRound && selectedCourse && refreshableTeeSet && (
            <div className="mt-3 space-y-2 border-t border-green-100 pt-3">
              <p className="text-xs text-green-700">
                Refresh pars, stroke indexes, distances, tee metadata, and NTP holes from
                GolfCourseAPI. LD, T2, and T3 stay as currently selected below.
              </p>
              <button
                type="button"
                onClick={() => onRefreshCourseData?.(selectedCourse, refreshableTeeSet)}
                disabled={refreshing}
                className="w-full rounded-xl border border-green-200 bg-white px-3 py-2 text-xs font-semibold text-green-700 transition-colors hover:bg-green-100 disabled:text-green-300"
              >
                {refreshing ? "Refreshing..." : "Refresh API course data"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Course card preview */}
      {holeOptions.length === 18 && (
        <CourseCardPreview
          holes={holeOptions}
          distanceUnit={appUser?.distanceUnit ?? "meters"}
          teeSetName={selectedTeeSet?.name ?? existingRound?.teeSetName ?? undefined}
        />
      )}

      {/* Create mode: pending correction */}
      {!existingRound && pendingCorrection && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 space-y-2">
          <p className="text-sm font-semibold text-amber-800">
            Saved course corrections available
          </p>
          <p className="text-xs text-amber-700">
            You have saved corrections for {pendingCorrection.courseName} —{" "}
            {pendingCorrection.teeSetName}.
            {pendingCorrection.correctedCourseRating != null &&
              ` Course Rating: ${pendingCorrection.correctedCourseRating}.`}
            {pendingCorrection.correctedSlopeRating != null &&
              ` Slope: ${pendingCorrection.correctedSlopeRating}.`}{" "}
            Hole Stroke Indexes and pars have been corrected for all 18 holes.
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

      {/* Create mode: custom course setup */}
      {!existingRound && !selectedCourse && (
        <div className="border-t border-gray-100 pt-3">
          <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-gray-800">Custom course setup</h3>
                <p className="mt-1 text-xs text-gray-500">
                  Use this when GolfCourseAPI does not return 18-hole round data. The hole data
                  is saved to this round only.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowCustomCourseSetup((current) => !current)}
                className="shrink-0 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-green-700 transition-colors hover:bg-green-50"
                aria-expanded={showCustomCourseSetup}
              >
                {showCustomCourseSetup ? "Hide holes" : "Set up holes"}
              </button>
            </div>
            <p className="mt-2 text-xs font-medium text-gray-600">
              Custom par total: {customCoursePar} · {customHoles.length} holes ·{" "}
              {customCourseDistanceCount} distances entered
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
                    <span className="font-semibold text-gray-700">H{hole.number}</span>
                    <select
                      value={hole.par}
                      onChange={(e) => updateCustomHole(hole.number, "par", e.target.value)}
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
                      onChange={(e) => updateCustomHole(hole.number, "strokeIndex", e.target.value)}
                      placeholder={String(hole.number)}
                      className="min-w-0 rounded-lg border border-gray-200 bg-white px-2 py-2 text-center text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500"
                      aria-label={`Hole ${hole.number} stroke index`}
                    />
                    <input
                      type="number"
                      min={1}
                      value={hole.distanceMeters ?? ""}
                      onChange={(e) => updateCustomHole(hole.number, "distanceMeters", e.target.value)}
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

      {/* Create mode: active season banner */}
      {!existingRound && activeSeason != null && (
        <div className="rounded-xl border border-green-100 bg-green-50 px-3 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-green-700">
            Active season
          </p>
          <p className="mt-1 text-base font-semibold text-gray-800">{activeSeason}</p>
          <p className="mt-1 text-xs text-gray-600">
            This round will count toward Season {activeSeason}. If you are creating a new-year
            round for a new ladder, change the active season in Admin Settings first.
          </p>
        </div>
      )}

      {/* Date */}
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Date</label>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          required
          className={DATE_INPUT_CLASSNAME}
        />
      </div>

      {/* Round number */}
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Round number</label>
        <input
          type="number"
          min={1}
          value={roundNumber}
          onChange={(e) => setRoundNumber(e.target.value)}
          required
          className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500"
        />
        {!existingRound && (
          <p className="text-xs text-gray-400 mt-1">
            Auto-set to the next round in the current season. Adjust if needed.
          </p>
        )}
      </div>

      {/* Scoring format */}
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Scoring format</label>
        <div className="flex gap-2">
          {(["stableford", "stroke"] as ScoringFormat[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setScoringFormat(f)}
              className={`flex-1 py-2 rounded-xl text-xs font-medium border transition-colors ${
                scoringFormat === f
                  ? "bg-green-600 text-white border-green-600"
                  : "border-gray-200 text-gray-600 hover:bg-gray-50"
              }`}
            >
              {f === "stableford" ? "Stableford" : "Stroke"}
            </button>
          ))}
        </div>
      </div>

      {/* Notes */}
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Notes</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Any notes for players..."
          className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500"
        />
      </div>

      {/* Tee times editor */}
      <TeeTimesEditor
        teeTimes={activeTeeTimes}
        members={members}
        assignableMembers={assignableMembers}
        playersSummary={playersSummary}
        emptyPlayersMessage={emptyPlayersMessage}
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
      <div className="border-t border-gray-100 pt-3 mt-2 space-y-3">
        <h3 className="text-xs font-semibold text-gray-700">Special holes</h3>
        <p className="text-xs text-gray-400">
          NTP holes are set from par 3s. Update LD, T2, and T3 if the course changes.
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
          {([
            { label: "⭐ T2", value: t2Hole, setter: setT2Hole },
            { label: "⭐ T3", value: t3Hole, setter: setT3Hole },
          ] as const).map(({ label, value, setter }) => (
            <div key={label}>
              <label className="block text-xs font-medium text-gray-700 mb-1">{label}</label>
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

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Save buttons */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => handleSave(false)}
          disabled={saving}
          className="w-full rounded-xl border border-green-200 bg-white py-2.5 text-sm font-semibold text-green-700 transition-colors hover:bg-green-50 disabled:text-green-300"
        >
          {saving ? "Saving..." : "Save"}
        </button>
        <button
          type="button"
          onClick={() => handleSave(true)}
          disabled={saving}
          className="w-full bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors"
        >
          {saving ? "Saving..." : "Save & Notify Players"}
        </button>
      </div>
    </div>
  );
}
