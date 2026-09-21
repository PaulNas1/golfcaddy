"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { getCourseTees, subscribeCourses } from "@/lib/firestore";
import type { Course } from "@/types";

export default function AdminCoursesPage() {
  const { appUser, isAdmin } = useAuth();
  const [courses, setCourses] = useState<Course[]>([]);
  const [teeCounts, setTeeCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showArchived, setShowArchived] = useState(false);

  useEffect(() => {
    if (!appUser?.groupId) return;
    return subscribeCourses(
      appUser.groupId,
      (next) => {
        setCourses(next);
        setLoading(false);
        setError("");
      },
      () => {
        setError("Failed to load courses.");
        setLoading(false);
      }
    );
  }, [appUser?.groupId]);

  // Tee counts are a per-course read, so they arrive after the list itself.
  useEffect(() => {
    if (!appUser?.groupId || courses.length === 0) return;
    let cancelled = false;

    Promise.all(
      courses.map(async (course) => {
        const tees = await getCourseTees(appUser.groupId, course.id).catch(() => []);
        return [course.id, tees.length] as const;
      })
    ).then((entries) => {
      if (cancelled) return;
      setTeeCounts(Object.fromEntries(entries));
    });

    return () => {
      cancelled = true;
    };
  }, [appUser?.groupId, courses]);

  const active = useMemo(() => courses.filter((c) => !c.archived), [courses]);
  const archived = useMemo(() => courses.filter((c) => c.archived), [courses]);

  return (
    <div className="space-y-5 pb-8">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink-title">Courses</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Par, stroke index and distance for every tee. Rounds freeze a copy
            of this when they are created, so editing a course never changes a
            round that has already been played.
          </p>
        </div>
        <Link
          href="/admin/courses/new"
          className="shrink-0 rounded-xl bg-brand-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
        >
          + New course
        </Link>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-ink-hint">Loading courses…</p>
      ) : active.length === 0 && archived.length === 0 ? (
        <div className="rounded-2xl border border-surface-overlay bg-surface-card p-6 text-center shadow-sm">
          <p className="text-sm font-semibold text-ink-title">No courses yet</p>
          <p className="mt-1 text-sm text-ink-muted">
            Add your first course, then enter its scorecard into a tee: par,
            stroke index and distance for every hole.
          </p>
          <Link
            href="/admin/courses/new"
            className="mt-4 inline-block rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
          >
            + New course
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {active.map((course) => (
            <CourseRow
              key={course.id}
              course={course}
              teeCount={teeCounts[course.id]}
            />
          ))}
        </div>
      )}

      {isAdmin && (
        <div className="rounded-2xl border border-surface-overlay bg-surface-muted p-4">
          <p className="text-xs font-semibold text-ink-body">
            Migrating existing rounds
          </p>
          <p className="mt-1 text-xs text-ink-muted">
            A one-time tool that reports what course data your existing rounds
            hold, builds this catalogue from them, then freezes a copy onto
            each round. The first pass writes nothing.
          </p>
          <Link
            href="/admin/courses/migrate"
            className="mt-2 inline-block text-xs font-semibold text-brand-700 hover:text-brand-800"
          >
            Open course migration →
          </Link>
        </div>
      )}

      {archived.length > 0 && (
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setShowArchived((current) => !current)}
            className="text-xs font-semibold text-ink-muted hover:text-ink-body"
          >
            {showArchived ? "Hide" : "Show"} archived ({archived.length})
          </button>
          {showArchived &&
            archived.map((course) => (
              <CourseRow
                key={course.id}
                course={course}
                teeCount={teeCounts[course.id]}
              />
            ))}
        </div>
      )}
    </div>
  );
}

function CourseRow({
  course,
  teeCount,
}: {
  course: Course;
  teeCount: number | undefined;
}) {
  return (
    <Link
      href={`/admin/courses/${course.id}`}
      className="block rounded-2xl border border-surface-overlay bg-surface-card p-4 shadow-sm transition-colors hover:bg-surface-muted"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink-title">
            {course.name}
            {course.archived && (
              <span className="ml-2 rounded bg-surface-overlay px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-ink-muted">
                Archived
              </span>
            )}
          </p>
          {course.location && (
            <p className="truncate text-xs text-ink-muted">{course.location}</p>
          )}
        </div>
        <div className="shrink-0 text-right">
          <p className="text-xs font-semibold text-ink-body">
            {teeCount === undefined
              ? "…"
              : `${teeCount} ${teeCount === 1 ? "tee" : "tees"}`}
          </p>
          <p className="text-xs text-ink-hint">{course.holeCount} holes</p>
        </div>
      </div>
    </Link>
  );
}
