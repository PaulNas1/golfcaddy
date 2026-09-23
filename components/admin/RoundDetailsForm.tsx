"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import TeeTimesEditor, { type TeeTimeDraftValue } from "@/components/TeeTimesEditor";
import { getCourseTees, subscribeCourses } from "@/lib/firestore";
import {
  getHoleOptionLabel,
  getParThreeHoles,
  getRoundTeeSets,
} from "@/lib/courseData";
import { SIDE_PRIZE_NAMES, sidePrizeFieldLabel } from "@/lib/sidePrizes";
import {
  buildCourseSnapshot,
  diffSnapshots,
  legacyRoundFieldsFromSnapshot,
  snapshotToTeeSets,
} from "@/lib/courseSnapshot";
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
  Course,
  CourseHole,
  CourseSnapshot,
  CourseTee,
  CourseTeeSet,
  Round,
  ScoringFormat,
  SpecialHoles,
  TeeTime,
} from "@/types";

// ─── Helper functions ─────────────────────────────────────────────────────────

function needsTeeReview(member: AppUser): boolean {
  return (
    member.gender === "female" ||
    member.usesSeniorTees === true ||
    member.usesProBackTees === true
  );
}

/** Prefer a men's tee as the round default, else the first tee on the course. */
function pickDefaultTee(tees: CourseTee[]): CourseTee | null {
  if (tees.length === 0) return null;
  return tees.find((tee) => tee.gender === "men") ?? tees[0];
}

const DATE_INPUT_CLASSNAME =
  "block h-[42px] w-full min-w-0 max-w-full appearance-none rounded-xl border border-surface-overlay bg-surface-card px-3 text-left text-sm leading-[42px] text-ink-title focus:outline-none focus:ring-2 focus:ring-brand-500 [&::-webkit-date-and-time-value]:block [&::-webkit-date-and-time-value]:min-w-0 [&::-webkit-date-and-time-value]:text-left";

const SELECT_CLASSNAME =
  "w-full px-3 py-2.5 rounded-xl border border-surface-overlay bg-surface-card text-sm text-ink-title focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:bg-surface-muted disabled:text-ink-muted";

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
  courseSnapshot: CourseSnapshot | null;
  date: Date;
  roundNumber: number;
  format: ScoringFormat;
  notes: string | null;
  teeTimes: TeeTime[];
  specialHoles: SpecialHoles;
};

// ─── Props ────────────────────────────────────────────────────────────────────

type RoundDetailsFormProps = {
  existingRound: Round;
  members: AppUser[];
  assignableMembers?: AppUser[];
  playersSummary?: string;
  emptyPlayersMessage: string;
  teeTimes?: TeeTimeDraftValue[];
  onTeeTimes?: (next: TeeTimeDraftValue[]) => void;
  playerTeeAssignments?: Record<string, string>;
  onPlayerTeeAssignmentsChange?: (v: Record<string, string>) => void;
  /** R3 — true once the round is played, or has scorecards. Set by the parent. */
  courseLocked?: boolean;
  courseLockReason?: string | null;
  onSave: (payload: RoundFormSavePayload) => Promise<void>;
  saving: boolean;
  error?: string;
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function RoundDetailsForm({
  existingRound,
  members,
  assignableMembers,
  playersSummary,
  emptyPlayersMessage,
  teeTimes: controlledTeeTimes,
  onTeeTimes,
  playerTeeAssignments,
  onPlayerTeeAssignmentsChange,
  courseLocked = false,
  courseLockReason,
  onSave,
  saving,
  error,
}: RoundDetailsFormProps) {
  const { appUser } = useAuth();

  // ─── Core form state ────────────────────────────────────────────────────────
  const [courseId, setCourseId] = useState(existingRound.courseId);
  const [teeSetId, setTeeSetId] = useState(existingRound.teeSetId ?? "");

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
    String(existingRound.roundNumber)
  );

  const [scoringFormat, setScoringFormat] = useState<ScoringFormat>(
    existingRound.format
  );

  const [notes, setNotes] = useState(existingRound.notes ?? "");

  const [ldHole, setLdHole] = useState(
    existingRound.specialHoles.ld ? String(existingRound.specialHoles.ld) : ""
  );
  const [t2Hole, setT2Hole] = useState(
    existingRound.specialHoles.t2 ? String(existingRound.specialHoles.t2) : ""
  );
  const [t3Hole, setT3Hole] = useState(
    existingRound.specialHoles.t3 ? String(existingRound.specialHoles.t3) : ""
  );

  // ─── Course catalogue state ─────────────────────────────────────────────────
  const [courses, setCourses] = useState<Course[]>([]);
  const [coursesLoading, setCoursesLoading] = useState(true);
  const [catalogueError, setCatalogueError] = useState("");
  const [tees, setTees] = useState<CourseTee[]>([]);
  const [teesLoading, setTeesLoading] = useState(false);

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

  // ─── Effect: load the group's course catalogue ──────────────────────────────
  useEffect(() => {
    if (!appUser?.groupId) return;
    return subscribeCourses(
      appUser.groupId,
      (next) => {
        setCourses(next);
        setCoursesLoading(false);
        setCatalogueError("");
      },
      () => {
        setCatalogueError("Could not load the course list.");
        setCoursesLoading(false);
      }
    );
  }, [appUser?.groupId]);

  // ─── Effect: load the selected course's tees ────────────────────────────────
  useEffect(() => {
    if (!appUser?.groupId || !courseId) {
      setTees([]);
      return;
    }

    let cancelled = false;
    setTees([]);
    setTeesLoading(true);

    getCourseTees(appUser.groupId, courseId)
      .then((next) => {
        if (cancelled) return;
        setTees(next);
        setTeesLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setTees([]);
        setTeesLoading(false);
        setCatalogueError("Could not load tees for that course.");
      });

    return () => {
      cancelled = true;
    };
  }, [appUser?.groupId, courseId]);

  // ─── Effect: default the tee once a course's tees arrive ────────────────────
  useEffect(() => {
    if (teeSetId || tees.length === 0) return;
    setTeeSetId(pickDefaultTee(tees)?.id ?? "");
  }, [tees, teeSetId]);

  // ─── Derived: course selection ──────────────────────────────────────────────
  const canEditCourse = !courseLocked;

  const selectedCourse = useMemo(
    () => courses.find((course) => course.id === courseId) ?? null,
    [courses, courseId]
  );

  // Archived courses stay selectable when a round already points at one (R6),
  // but never appear as a fresh choice.
  const selectableCourses = useMemo(
    () => courses.filter((course) => !course.archived || course.id === courseId),
    [courses, courseId]
  );

  /**
   * The snapshot this save would write.
   *
   * Null on a sealed round: its course data is frozen (R4) and every save must
   * pass the existing snapshot straight back through, untouched.
   */
  const pendingSnapshot = useMemo<CourseSnapshot | null>(() => {
    if (!canEditCourse) return null;
    if (!selectedCourse || tees.length === 0) return null;
    // Belt and braces against a mid-flight course switch: never mix one
    // course's tees into another course's snapshot.
    if (tees.some((tee) => tee.courseId !== selectedCourse.id)) return null;
    return buildCourseSnapshot(selectedCourse, tees);
  }, [canEditCourse, selectedCourse, tees]);

  // The tee sets in play: from the catalogue while the round can still be
  // re-snapshotted, otherwise read straight out of the frozen snapshot.
  const activeTeeSets = useMemo<CourseTeeSet[]>(() => {
    if (pendingSnapshot) return snapshotToTeeSets(pendingSnapshot);
    if (existingRound.courseSnapshot) {
      return snapshotToTeeSets(existingRound.courseSnapshot);
    }
    return existingRound ? getRoundTeeSets(existingRound) : [];
  }, [pendingSnapshot, existingRound]);

  const selectedTeeSet =
    activeTeeSets.find((teeSet) => teeSet.id === teeSetId) ?? null;
  const assignmentTeeSets = activeTeeSets;

  const holeOptions =
    selectedTeeSet?.holes ??
    (existingRound.courseHoles.length ? existingRound.courseHoles : []);

  // Every par 3 is an NTP hole, always. Only LD, T2 and T3 are decisions.
  const ntpHoles = holeOptions
    .filter((hole) => hole.par === 3)
    .map((hole) => hole.number);

  /** R3 — show a diff of what a re-snapshot will change, before applying it. */
  const snapshotDiff = useMemo(() => {
    if (!existingRound || !pendingSnapshot) return [];
    return diffSnapshots(existingRound.courseSnapshot, pendingSnapshot);
  }, [existingRound, pendingSnapshot]);

  // ─── Derived: edit-mode tee assignments ─────────────────────────────────────
  const acceptedMembers = assignableMembers ?? [];

  const teeReviewMembers = acceptedMembers.filter(
    (m) => needsTeeReview(m) && !playerTeeAssignments?.[m.uid]
  );

  // Must match what the save actually keeps: an assignment equal to the round
  // default is dropped, so counting it as an override makes the summary
  // disagree with the data the moment you reload.
  const teeOverrideCount = Object.values(playerTeeAssignments ?? {}).filter(
    (assignedTeeId) => assignedTeeId && assignedTeeId !== teeSetId
  ).length;

  // ─── Effect: course sync on external round change (edit mode) ───────────────
  useEffect(() => {
    if (!existingRound) return;
    setCourseId(existingRound.courseId);
    setTeeSetId(existingRound.teeSetId ?? "");
  }, [existingRound.courseId, existingRound.teeSetId, existingRound.courseName]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Course handlers ─────────────────────────────────────────────────────────
  const handleCourseChange = (nextCourseId: string) => {
    setCourseId(nextCourseId);
    setTeeSetId("");
    setLdHole("");
    setT2Hole("");
    setT3Hole("");
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
    const ntpHoles = selectedTeeSet
      ? getParThreeHoles(selectedTeeSet)
      : existingRound.specialHoles.ntp;

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

    // A catalogue course in play → write a fresh snapshot (R2) and derive every
    // legacy field from it, so the snapshot is the single authored source.
    // Otherwise pass the round's existing course data straight back through:
    // a sealed round's snapshot must never be rewritten (R4).
    const courseFields = pendingSnapshot
      ? {
          courseId: pendingSnapshot.courseId,
          courseName: pendingSnapshot.courseName,
          courseSnapshot: pendingSnapshot,
          ...legacyRoundFieldsFromSnapshot(pendingSnapshot, teeSetId || null),
        }
      : {
          courseId: existingRound.courseId,
          courseName: existingRound.courseName,
          courseSnapshot: existingRound.courseSnapshot,
          teeSetId: existingRound.teeSetId,
          teeSetName: existingRound.teeSetName,
          coursePar: existingRound.coursePar,
          courseRating: existingRound.courseRating,
          slopeRating: existingRound.slopeRating,
          courseHoles: existingRound.courseHoles,
          availableTeeSets: existingRound.availableTeeSets,
          courseSource: existingRound.courseSource,
        };

    return {
      ...courseFields,
      date: new Date(date),
      roundNumber: parseInt(roundNumber, 10),
      format: scoringFormat,
      notes: notes.trim() || null,
      teeTimes: savedTeeTimes,
      specialHoles,
    };
  };

  // ─── Save handler ────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!date) return;
    const parsed = parseInt(roundNumber, 10);
    if (!parsed || parsed <= 0) return;
    await onSave(computePayload());
  };

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="bg-surface-card rounded-2xl shadow-sm border border-surface-overlay p-4 space-y-3">
      <h2 className="font-semibold text-ink-title">Round Details</h2>

      {/* Course picker — from the group's own catalogue */}
      <div>
        <div className="mb-1 flex items-center justify-between gap-2">
          <label className="block text-xs font-medium text-ink-body" htmlFor="round-course">
            Course
          </label>
          <Link
            href="/admin/courses"
            className="text-xs font-semibold text-brand-700 hover:text-brand-800"
          >
            Manage courses
          </Link>
        </div>
        {!coursesLoading && courses.length === 0 ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3">
            <p className="text-xs font-semibold text-amber-800">No courses yet</p>
            <p className="mt-1 text-xs text-amber-700">
              Add a course and its tees before creating a round — pars, stroke
              indexes and distances all come from there.
            </p>
            <Link
              href="/admin/courses"
              className="mt-2 inline-block rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700"
            >
              Add a course
            </Link>
          </div>
        ) : (
          <select
            id="round-course"
            value={courseId}
            onChange={(e) => handleCourseChange(e.target.value)}
            disabled={!canEditCourse || coursesLoading}
            className={SELECT_CLASSNAME}
          >
            <option value="">
              {coursesLoading ? "Loading courses…" : "Select a course…"}
            </option>
            {selectableCourses.map((course) => (
              <option key={course.id} value={course.id}>
                {course.name}
                {course.location ? ` — ${course.location}` : ""}
                {course.archived ? " (archived)" : ""}
              </option>
            ))}
          </select>
        )}
        {!canEditCourse && (
          <p className="mt-1 text-xs text-ink-hint">
            {courseLockReason ??
              "Course data is sealed for this round so past results can never change."}
          </p>
        )}
        {catalogueError && (
          <p className="mt-1 text-xs text-amber-600">{catalogueError}</p>
        )}
      </div>

      {/* Tee picker */}
      {(courseId || activeTeeSets.length > 0) && (
        <div>
          <div className="mb-1 flex items-center justify-between gap-2">
            <label className="block text-xs font-medium text-ink-body" htmlFor="round-tee">
              Tee
            </label>
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
            id="round-tee"
            value={teeSetId}
            onChange={(e) => setTeeSetId(e.target.value)}
            disabled={!canEditCourse || teesLoading || activeTeeSets.length === 0}
            className={SELECT_CLASSNAME}
          >
            <option value="">
              {teesLoading ? "Loading tees…" : "Select a tee…"}
            </option>
            {activeTeeSets.map((teeSet) => (
              <option key={teeSet.id} value={teeSet.id}>
                {teeSet.name} — Par {teeSet.par}
                {teeSet.slopeRating ? ` / Slope ${teeSet.slopeRating}` : ""}
              </option>
            ))}
          </select>

          {canEditCourse && courseId && !teesLoading && activeTeeSets.length === 0 && (
            <p className="mt-1 text-xs text-amber-600">
              This course has no tees yet.{" "}
              <Link
                href={`/admin/courses/${courseId}`}
                className="font-semibold underline"
              >
                Add one
              </Link>
              .
            </p>
          )}

          {/* Edit mode: player tee assignments panel */}
          {existingRound && assignmentTeeSets.length > 0 && playerTeeAssignments && (
            <div id="tee-assignments" className="mt-3 scroll-mt-24 rounded-xl border border-surface-overlay bg-surface-muted px-3 py-2">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-ink-body">Player tee assignments</p>
                  <p className="text-xs text-ink-hint">
                    {acceptedMembers.length} accepted ·{" "}
                    {Math.max(acceptedMembers.length - teeOverrideCount, 0)} default ·{" "}
                    {teeOverrideCount} override
                    {teeReviewMembers.length > 0 ? ` · ${teeReviewMembers.length} review` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowTeeAssignments((v) => !v)}
                  className="rounded-lg border border-surface-overlay bg-surface-card px-3 py-1.5 text-xs font-semibold text-brand-700"
                >
                  {showTeeAssignments ? "Hide" : "Manage"}
                </button>
              </div>
              {showTeeAssignments && (
                <div className="mt-3 space-y-2 border-t border-surface-overlay pt-3">
                  {acceptedMembers.length === 0 ? (
                    <p className="text-xs text-ink-hint">
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
                            <p className="truncate text-xs font-semibold text-ink-body">
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
                            className="min-w-0 rounded-lg border border-surface-overlay bg-surface-card px-2 py-2 text-xs text-ink-title focus:outline-none focus:ring-2 focus:ring-brand-500"
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


          {/* R3: what a re-snapshot will change, shown before it is applied */}
          {existingRound && canEditCourse && snapshotDiff.length > 0 && (
            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3">
              <p className="text-xs font-semibold text-amber-800">
                Saving will refresh this round&apos;s course data
              </p>
              <p className="mt-1 text-xs text-amber-700">
                The round is still upcoming with no scorecards, so its frozen
                course data can be rebuilt from the catalogue. Here is what
                changes:
              </p>
              <ul className="mt-2 space-y-2">
                {snapshotDiff.map((row) => (
                  <li key={`${row.kind}-${row.teeName}`} className="text-xs text-amber-800">
                    <span className="font-semibold">{row.teeName}</span>{" "}
                    <span className="rounded bg-amber-200 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-900">
                      {row.kind}
                    </span>
                    <ul className="mt-1 space-y-0.5 pl-3 text-amber-700">
                      {row.changes.map((change) => (
                        <li key={change}>· {change}</li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Course card preview */}
      {holeOptions.length > 0 && (
        <CourseCardPreview
          holes={holeOptions}
          distanceUnit={appUser?.distanceUnit ?? "meters"}
          teeSetName={selectedTeeSet?.name ?? existingRound.teeSetName ?? undefined}
          // Every tee on the round, so a women's assignment can be checked
          // against the women's card rather than taken on trust.
          tees={activeTeeSets.map((teeSet) => ({
            id: teeSet.id,
            name: teeSet.name,
            holes: teeSet.holes,
          }))}
          activeTeeId={teeSetId || null}
        />
      )}

      {/* Date */}
      <div>
        <label className="block text-xs font-medium text-ink-body mb-1">Date</label>
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
        <label className="block text-xs font-medium text-ink-body mb-1">Round number</label>
        <input
          type="number"
          min={1}
          value={roundNumber}
          onChange={(e) => setRoundNumber(e.target.value)}
          required
          className="w-full px-3 py-2.5 rounded-xl border border-surface-overlay text-sm text-ink-title focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>

      {/* Scoring format */}
      <div>
        <label className="block text-xs font-medium text-ink-body mb-1">Scoring format</label>
        <div className="flex gap-2">
          {(["stableford", "stroke"] as ScoringFormat[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setScoringFormat(f)}
              className={`flex-1 py-2 rounded-xl text-xs font-medium border transition-colors ${
                scoringFormat === f
                  ? "bg-brand-600 text-white border-green-600"
                  : "border-surface-overlay text-ink-body hover:bg-surface-muted"
              }`}
            >
              {f === "stableford" ? "Stableford" : "Stroke"}
            </button>
          ))}
        </div>
      </div>

      {/* Notes */}
      <div>
        <label className="block text-xs font-medium text-ink-body mb-1">Notes</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Any notes for players..."
          className="w-full px-3 py-2.5 rounded-xl border border-surface-overlay text-sm text-ink-title focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>

      {/* Tee times editor */}
      <div id="tee-times" className="scroll-mt-24" />
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
      <div id="prize-holes" className="scroll-mt-24 border-t border-surface-overlay pt-3 mt-2 space-y-3">
        <h3 className="text-xs font-semibold text-ink-body">Prize holes</h3>
        <div className="flex items-baseline gap-2 rounded-lg bg-surface-muted px-3 py-2">
          <span className="text-xs font-semibold text-ink-body">
            {SIDE_PRIZE_NAMES.ntp.emoji} {SIDE_PRIZE_NAMES.ntp.full}
          </span>
          <span className="text-xs text-ink-muted">
            {ntpHoles.length > 0 ? ntpHoles.join(", ") : "—"}
          </span>
        </div>
        <div className="space-y-2">
          {([
            { prize: "ld", value: ldHole, setter: setLdHole },
            { prize: "t2", value: t2Hole, setter: setT2Hole },
            { prize: "t3", value: t3Hole, setter: setT3Hole },
          ] as const).map(({ prize, value, setter }) => (
            <div key={prize}>
              <label
                className="block text-xs font-medium text-ink-body mb-1"
                htmlFor={`prize-${prize}`}
              >
                {sidePrizeFieldLabel(prize)}
              </label>
              <select
                id={`prize-${prize}`}
                value={value}
                onChange={(e) => setter(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-surface-overlay text-sm text-ink-title focus:outline-none focus:ring-2 focus:ring-brand-500"
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

      {/* Save */}
      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="w-full rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {saving ? "Saving..." : "Save changes"}
      </button>

    </div>
  );
}
