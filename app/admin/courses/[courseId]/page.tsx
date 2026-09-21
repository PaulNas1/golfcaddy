"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import {
  createCourse,
  createCourseTee,
  deleteCourseTee,
  getCourse,
  getCourseTees,
  setCourseArchived,
  updateCourse,
} from "@/lib/firestore";
import {
  isBlocked,
  validateStrokeIndex,
  validateStrokeIndexNotSequential,
} from "@/lib/courseValidation";
import { genderLabel } from "@/components/admin/courses/TeeIssueList";
import { describeWriteError } from "@/components/admin/courses/writeError";
import type { Course, CourseTee } from "@/types";

const INPUT_CLASSNAME =
  "w-full rounded-xl border border-surface-overlay bg-surface-card px-3 py-2.5 text-sm text-ink-title focus:outline-none focus:ring-2 focus:ring-brand-500";

export default function CourseEditorPage() {
  const { appUser } = useAuth();
  const router = useRouter();
  const params = useParams<{ courseId: string }>();
  const courseId = params.courseId;
  const isNew = courseId === "new";

  const [course, setCourse] = useState<Course | null>(null);
  const [tees, setTees] = useState<CourseTee[]>([]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [holeCount, setHoleCount] = useState(18);

  const loadTees = useCallback(async () => {
    if (!appUser?.groupId || isNew) return;
    const next = await getCourseTees(appUser.groupId, courseId).catch(() => []);
    setTees(next);
  }, [appUser?.groupId, courseId, isNew]);

  useEffect(() => {
    if (!appUser?.groupId || isNew) return;
    let cancelled = false;

    Promise.all([
      getCourse(appUser.groupId, courseId),
      getCourseTees(appUser.groupId, courseId),
    ])
      .then(([loadedCourse, loadedTees]) => {
        if (cancelled) return;
        if (!loadedCourse) {
          setError("That course no longer exists.");
          setLoading(false);
          return;
        }
        setCourse(loadedCourse);
        setName(loadedCourse.name);
        setLocation(loadedCourse.location ?? "");
        setHoleCount(loadedCourse.holeCount);
        setTees(loadedTees);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setError("Failed to load the course.");
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [appUser?.groupId, courseId, isNew]);

  const flash = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 3000);
  };

  const handleSaveCourse = async () => {
    if (!appUser?.groupId) return;
    if (!name.trim()) {
      setError("Enter a course name before saving.");
      return;
    }
    setSaving(true);
    setError("");

    try {
      if (isNew) {
        const newId = await createCourse(appUser.groupId, {
          name: name.trim(),
          location: location.trim() || null,
          holeCount,
        });
        router.replace(`/admin/courses/${newId}`);
        return;
      }

      await updateCourse(appUser.groupId, courseId, {
        name: name.trim(),
        location: location.trim() || null,
        holeCount,
      });
      setCourse((current) =>
        current
          ? {
              ...current,
              name: name.trim(),
              location: location.trim() || null,
              holeCount,
            }
          : current
      );
      flash("Course saved.");
    } catch (caught) {
      setError(describeWriteError(caught, "course"));
    } finally {
      setSaving(false);
    }
  };

  /**
   * R6 — a course is archived, never deleted. Rounds keep their snapshots and
   * carry on rendering; the course simply leaves the pickers.
   */
  const handleArchiveToggle = async () => {
    if (!appUser?.groupId || !course) return;
    const nextArchived = !course.archived;
    const confirmed = window.confirm(
      nextArchived
        ? `Archive ${course.name}? It disappears from the course picker. Rounds already played keep their own frozen copy and are unaffected.`
        : `Restore ${course.name} to the course picker?`
    );
    if (!confirmed) return;

    setSaving(true);
    try {
      await setCourseArchived(appUser.groupId, courseId, nextArchived);
      setCourse({ ...course, archived: nextArchived });
      flash(nextArchived ? "Course archived." : "Course restored.");
    } catch (caught) {
      setError(describeWriteError(caught, "course"));
    } finally {
      setSaving(false);
    }
  };

  /** A second tee that differs only in distances is the common case. */
  const handleDuplicateTee = async (tee: CourseTee) => {
    if (!appUser?.groupId) return;
    setSaving(true);
    try {
      const newId = await createCourseTee(appUser.groupId, courseId, {
        name: `${tee.name} (copy)`,
        gender: tee.gender,
        courseRating: tee.courseRating,
        slope: tee.slope,
        holes: tee.holes.map((hole) => ({ ...hole })),
      });
      router.push(`/admin/courses/${courseId}/tees/${newId}`);
    } catch (caught) {
      setError(describeWriteError(caught, "tee"));
      setSaving(false);
    }
  };

  const handleDeleteTee = async (tee: CourseTee) => {
    if (!appUser?.groupId) return;
    const confirmed = window.confirm(
      `Delete the ${tee.name} tee? Rounds that already used it keep their own frozen copy, so nothing already played changes.`
    );
    if (!confirmed) return;

    setSaving(true);
    try {
      await deleteCourseTee(appUser.groupId, courseId, tee.id);
      await loadTees();
      flash("Tee deleted.");
    } catch (caught) {
      setError(describeWriteError(caught, "tee"));
    } finally {
      setSaving(false);
    }
  };

  const dirty =
    !isNew &&
    course != null &&
    (name.trim() !== course.name ||
      (location.trim() || null) !== course.location ||
      holeCount !== course.holeCount);

  if (loading) {
    return <p className="text-sm text-ink-hint">Loading course…</p>;
  }

  return (
    <div className="space-y-5 pb-8">
      <div>
        <Link
          href="/admin/courses"
          className="text-xs text-ink-hint hover:text-ink-body"
        >
          ← Courses
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-ink-title">
          {isNew ? "New course" : course?.name}
        </h1>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {notice && (
        <div className="rounded-xl border border-green-200 bg-brand-50 px-4 py-3 text-sm text-brand-800">
          {notice}
        </div>
      )}

      {/* ── Course fields ─────────────────────────────────────────────────── */}
      <div className="space-y-3 rounded-2xl border border-surface-overlay bg-surface-card p-4 shadow-sm">
        <h2 className="font-semibold text-ink-title">Course</h2>

        <div>
          <label className="mb-1 block text-xs font-medium text-ink-body" htmlFor="course-name">
            Name
          </label>
          <input
            id="course-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Gardiners Run"
            className={INPUT_CLASSNAME}
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-ink-body" htmlFor="course-location">
            Location
          </label>
          <input
            id="course-location"
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="e.g. Lilydale, VIC"
            className={INPUT_CLASSNAME}
          />
        </div>

        <div>
          <span className="mb-1 block text-xs font-medium text-ink-body">Holes</span>
          <div className="flex gap-2">
            {[18, 9].map((count) => (
              <button
                key={count}
                type="button"
                onClick={() => setHoleCount(count)}
                className={`flex-1 rounded-xl border py-2 text-xs font-medium transition-colors ${
                  holeCount === count
                    ? "border-green-600 bg-brand-600 text-white"
                    : "border-surface-overlay text-ink-body hover:bg-surface-muted"
                }`}
              >
                {count} holes
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={handleSaveCourse}
          disabled={saving || (!isNew && !dirty)}
          className="w-full rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "Saving…" : isNew ? "Create course" : "Save course"}
        </button>
      </div>

      {/* ── Tees ──────────────────────────────────────────────────────────── */}
      {!isNew && (
        <div className="space-y-3 rounded-2xl border border-surface-overlay bg-surface-card p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-semibold text-ink-title">Tees</h2>
            <Link
              href={`/admin/courses/${courseId}/tees/new`}
              className="rounded-lg border border-brand-200 bg-surface-card px-3 py-1.5 text-xs font-semibold text-brand-700 transition-colors hover:bg-brand-50"
            >
              + Add tee
            </Link>
          </div>

          {tees.length === 0 ? (
            <p className="text-sm text-ink-muted">
              No tees yet. Add one and enter its card — par, stroke index and
              distance for all {holeCount} holes.
            </p>
          ) : (
            <div className="space-y-2">
              {tees.map((tee) => (
                <TeeRow
                  key={tee.id}
                  tee={tee}
                  courseId={courseId}
                  holeCount={holeCount}
                  busy={saving}
                  onDuplicate={() => handleDuplicateTee(tee)}
                  onDelete={() => handleDeleteTee(tee)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Archive ───────────────────────────────────────────────────────── */}
      {!isNew && course && (
        <div className="rounded-2xl border border-surface-overlay bg-surface-card p-4 shadow-sm">
          <h2 className="font-semibold text-ink-title">
            {course.archived ? "Restore course" : "Archive course"}
          </h2>
          <p className="mt-1 text-xs text-ink-muted">
            Courses are archived, never deleted. Every round keeps its own
            frozen copy of the course, so past results never change.
          </p>
          <button
            type="button"
            onClick={handleArchiveToggle}
            disabled={saving}
            className="mt-3 w-full rounded-xl border border-surface-overlay bg-surface-muted py-2.5 text-sm font-semibold text-ink-body transition-colors hover:bg-surface-overlay disabled:opacity-50"
          >
            {course.archived ? "Restore course" : "Archive course"}
          </button>
        </div>
      )}
    </div>
  );
}

function TeeRow({
  tee,
  courseId,
  holeCount,
  busy,
  onDuplicate,
  onDelete,
}: {
  tee: CourseTee;
  courseId: string;
  holeCount: number;
  busy: boolean;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  // Surfaced in the list so a bad card is obvious without opening it.
  const { blocked, sequential } = useMemo(() => {
    const indexIssues = validateStrokeIndex(tee.holes, holeCount);
    return {
      blocked: isBlocked(indexIssues),
      sequential:
        validateStrokeIndexNotSequential(tee.holes, holeCount).length > 0,
    };
  }, [tee.holes, holeCount]);

  return (
    <div className="rounded-xl border border-surface-overlay bg-surface-muted p-3">
      <div className="flex items-start justify-between gap-3">
        <Link
          href={`/admin/courses/${courseId}/tees/${tee.id}`}
          className="min-w-0 flex-1"
        >
          <p className="truncate text-sm font-semibold text-ink-title">
            {tee.name}
          </p>
          <p className="text-xs text-ink-muted">
            {genderLabel(tee.gender)} · Par {tee.par} ·{" "}
            {tee.slope != null ? `Slope ${tee.slope}` : "No slope"} ·{" "}
            {tee.courseRating != null ? `CR ${tee.courseRating}` : "No CR"}
          </p>
        </Link>
        <div className="flex shrink-0 gap-1.5">
          <button
            type="button"
            onClick={onDuplicate}
            disabled={busy}
            className="rounded-lg border border-surface-overlay bg-surface-card px-2 py-1 text-xs font-semibold text-brand-700 disabled:opacity-50"
          >
            Duplicate
          </button>
          <button
            type="button"
            onClick={onDelete}
            disabled={busy}
            className="rounded-lg border border-surface-overlay bg-surface-card px-2 py-1 text-xs font-semibold text-red-600 disabled:opacity-50"
          >
            Delete
          </button>
        </div>
      </div>

      {(blocked || sequential) && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {blocked && (
            <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-700">
              Invalid stroke index
            </span>
          )}
          {sequential && (
            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700">
              Index looks like hole number
            </span>
          )}
        </div>
      )}
    </div>
  );
}
