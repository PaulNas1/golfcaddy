"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getCourseTees, subscribeCourses } from "@/lib/firestore";
import {
  buildCourseSnapshot,
  legacyRoundFieldsFromSnapshot,
} from "@/lib/courseSnapshot";
import { getParThreeHoles } from "@/lib/courseData";
import { useAuth } from "@/contexts/AuthContext";
import type {
  Course,
  CourseHole,
  CourseSnapshot,
  CourseTee,
  CourseTeeSet,
  Round,
  ScoringFormat,
  SpecialHoles,
} from "@/types";

// ─── Create Round (Brief 2 §2) ──────────────────────────────────────────────
//
// Four decisions, one screen, no scroll: course, tee, date, format.
//
// Deliberately NOT here — all of it belongs on the round page, where it
// actually works:
//   · Tee times   — cannot function before anyone has RSVP'd
//   · Special holes (LD/T2/T3) — set once the course is locked
//   · Notes       — rarely written at creation
//   · Notify players — a separate, deliberate act, not a variant of save
//
// This is a separate component from the edit form on purpose. One component
// serving both is what forced every edit-only affordance to render disabled,
// empty and explained during create.

const SELECT_CLASSNAME =
  "w-full rounded-xl border border-surface-overlay bg-surface-card px-3 py-2.5 text-sm text-ink-title focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:bg-surface-muted disabled:text-ink-muted";

/** Prefer a men's tee as the round default, else the first tee on the course. */
function pickDefaultTee(tees: CourseTee[]): CourseTee | null {
  if (tees.length === 0) return null;
  return tees.find((tee) => tee.gender === "men") ?? tees[0];
}

export type CreateRoundPayload = {
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
  specialHoles: SpecialHoles;
};

type CreateRoundFormProps = {
  initialRoundNumber: string;
  defaultFormat?: ScoringFormat;
  onCreate: (payload: CreateRoundPayload) => Promise<void>;
  saving: boolean;
  error?: string;
};

export default function CreateRoundForm({
  initialRoundNumber,
  defaultFormat = "stableford",
  onCreate,
  saving,
  error,
}: CreateRoundFormProps) {
  const { appUser } = useAuth();
  const router = useRouter();

  const [courseId, setCourseId] = useState("");
  const [teeId, setTeeId] = useState("");
  const [date, setDate] = useState("");
  const [format, setFormat] = useState<ScoringFormat>(defaultFormat);
  const [roundNumber, setRoundNumber] = useState(initialRoundNumber);
  const [editingRoundNumber, setEditingRoundNumber] = useState(false);

  const [courses, setCourses] = useState<Course[]>([]);
  const [coursesLoading, setCoursesLoading] = useState(true);
  const [tees, setTees] = useState<CourseTee[]>([]);
  const [teesLoading, setTeesLoading] = useState(false);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    setRoundNumber(initialRoundNumber);
  }, [initialRoundNumber]);

  useEffect(() => {
    if (!appUser?.groupId) return;
    return subscribeCourses(
      appUser.groupId,
      (next) => {
        setCourses(next.filter((course) => !course.archived));
        setCoursesLoading(false);
        setLoadError("");
      },
      () => {
        setLoadError("Could not load the course list.");
        setCoursesLoading(false);
      }
    );
  }, [appUser?.groupId]);

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
        setTeesLoading(false);
        setLoadError("Could not load tees for that course.");
      });

    return () => {
      cancelled = true;
    };
  }, [appUser?.groupId, courseId]);

  // Default the tee as soon as a course's tees arrive.
  useEffect(() => {
    if (teeId || tees.length === 0) return;
    setTeeId(pickDefaultTee(tees)?.id ?? "");
  }, [tees, teeId]);

  const selectedCourse = useMemo(
    () => courses.find((course) => course.id === courseId) ?? null,
    [courses, courseId]
  );

  const snapshot = useMemo<CourseSnapshot | null>(() => {
    if (!selectedCourse || tees.length === 0) return null;
    if (tees.some((tee) => tee.courseId !== selectedCourse.id)) return null;
    return buildCourseSnapshot(selectedCourse, tees);
  }, [selectedCourse, tees]);

  const parsedRoundNumber = Number.parseInt(roundNumber, 10);
  const ready =
    !!snapshot && !!teeId && !!date && Number.isFinite(parsedRoundNumber) && parsedRoundNumber > 0;

  const handleCourseChange = (nextCourseId: string) => {
    setCourseId(nextCourseId);
    setTeeId("");
  };

  const handleCreate = async () => {
    if (!snapshot || !ready) return;

    const legacy = legacyRoundFieldsFromSnapshot(snapshot, teeId);
    const defaultTeeSet = legacy.availableTeeSets.find((tee) => tee.id === teeId);

    await onCreate({
      courseId: snapshot.courseId,
      courseName: snapshot.courseName,
      ...legacy,
      courseSnapshot: snapshot,
      date: new Date(date),
      roundNumber: parsedRoundNumber,
      format,
      // NTP is derived from the tee's par 3s, never chosen. LD/T2/T3 are set
      // on the round page once the course is locked.
      specialHoles: {
        ntp: defaultTeeSet ? getParThreeHoles(defaultTeeSet) : [],
        ld: null,
        t2: null,
        t3: null,
      },
    });
  };

  const noCourses = !coursesLoading && courses.length === 0;

  return (
    <div className="space-y-3 rounded-2xl border border-surface-overlay bg-surface-card p-4 shadow-sm">
      {noCourses ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3">
          <p className="text-sm font-semibold text-amber-800">No courses yet</p>
          <Link
            href="/admin/courses/new"
            className="mt-2 inline-block rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700"
          >
            Add a course
          </Link>
        </div>
      ) : (
        <>
          <div>
            <label
              className="mb-1 block text-xs font-medium text-ink-body"
              htmlFor="create-course"
            >
              Course
            </label>
            <select
              id="create-course"
              value={courseId}
              onChange={(e) => handleCourseChange(e.target.value)}
              disabled={coursesLoading}
              className={SELECT_CLASSNAME}
            >
              <option value="">
                {coursesLoading ? "Loading…" : "Select a course…"}
              </option>
              {courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              className="mb-1 block text-xs font-medium text-ink-body"
              htmlFor="create-tee"
            >
              Tee
            </label>
            <select
              id="create-tee"
              value={teeId}
              onChange={(e) => setTeeId(e.target.value)}
              disabled={!courseId || teesLoading || tees.length === 0}
              className={SELECT_CLASSNAME}
            >
              <option value="">
                {!courseId
                  ? "Pick a course first"
                  : teesLoading
                  ? "Loading…"
                  : tees.length === 0
                  ? "No tees on this course"
                  : "Select a tee…"}
              </option>
              {tees.map((tee) => (
                <option key={tee.id} value={tee.id}>
                  {tee.name} · Par {tee.par}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              className="mb-1 block text-xs font-medium text-ink-body"
              htmlFor="create-date"
            >
              Date
            </label>
            <input
              id="create-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="block h-[42px] w-full min-w-0 max-w-full appearance-none rounded-xl border border-surface-overlay bg-surface-card px-3 text-left text-sm leading-[42px] text-ink-title focus:outline-none focus:ring-2 focus:ring-brand-500 [&::-webkit-date-and-time-value]:block [&::-webkit-date-and-time-value]:min-w-0 [&::-webkit-date-and-time-value]:text-left"
            />
          </div>

          <div>
            <span className="mb-1 block text-xs font-medium text-ink-body">
              Format
            </span>
            <div className="flex gap-2">
              {(["stableford", "stroke"] as ScoringFormat[]).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setFormat(value)}
                  className={`flex-1 rounded-xl border py-2 text-xs font-medium transition-colors ${
                    format === value
                      ? "border-green-600 bg-brand-600 text-white"
                      : "border-surface-overlay text-ink-body hover:bg-surface-muted"
                  }`}
                >
                  {value === "stableford" ? "Stableford" : "Stroke"}
                </button>
              ))}
            </div>
          </div>

          {/* Auto-assigned. Collapsed, because most rounds never need it. */}
          <div>
            {editingRoundNumber ? (
              <>
                <label
                  className="mb-1 block text-xs font-medium text-ink-body"
                  htmlFor="create-round-number"
                >
                  Round number
                </label>
                <input
                  id="create-round-number"
                  type="number"
                  min={1}
                  value={roundNumber}
                  onChange={(e) => setRoundNumber(e.target.value)}
                  className="w-full rounded-xl border border-surface-overlay bg-surface-card px-3 py-2.5 text-sm text-ink-title focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </>
            ) : (
              <button
                type="button"
                onClick={() => setEditingRoundNumber(true)}
                className="text-sm text-ink-body"
              >
                Round {roundNumber || "—"}{" "}
                <span className="font-semibold text-brand-700">· change</span>
              </button>
            )}
          </div>
        </>
      )}

      {(error || loadError) && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error || loadError}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 pt-1">
        <button
          type="button"
          onClick={() => router.push("/admin/rounds")}
          className="w-full rounded-xl border border-surface-overlay bg-surface-card py-2.5 text-sm font-semibold text-ink-body transition-colors hover:bg-surface-muted"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleCreate}
          disabled={saving || !ready}
          className="w-full rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "Creating…" : "Create round"}
        </button>
      </div>
    </div>
  );
}
