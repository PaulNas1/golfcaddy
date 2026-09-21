"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import {
  createCourseTee,
  getCourse,
  getCourseTee,
  updateCourseTee,
} from "@/lib/firestore";
import {
  blankHoles,
  isBlocked,
  parsePastedTee,
  teeTotals,
  validateTee,
  warningIssues,
} from "@/lib/courseValidation";
import { TeeIssueList } from "@/components/admin/courses/TeeIssueList";
import { describeWriteError } from "@/components/admin/courses/writeError";
import type { Course, TeeGender, TeeHole } from "@/types";

const INPUT_CLASSNAME =
  "w-full rounded-xl border border-surface-overlay bg-surface-card px-3 py-2.5 text-sm text-ink-title focus:outline-none focus:ring-2 focus:ring-brand-500";

const CELL_CLASSNAME =
  "min-w-0 rounded-lg border border-surface-overlay bg-surface-card px-1 py-2 text-center text-xs text-ink-title focus:outline-none focus:ring-2 focus:ring-brand-500";

const GENDERS: { value: TeeGender; label: string }[] = [
  { value: "men", label: "Men's" },
  { value: "women", label: "Women's" },
  { value: "mixed", label: "Mixed" },
];

/**
 * Cells are held as strings so a field can be emptied while typing. They are
 * converted to numbers only at validate/save time — a blank reads as 0, which
 * V1 blocks, so an incomplete card can never be saved as if it were real.
 */
type RowDraft = { par: string; index: string; metres: string };

function toDrafts(holes: TeeHole[]): RowDraft[] {
  return holes.map((hole) => ({
    par: hole.par ? String(hole.par) : "",
    index: hole.index ? String(hole.index) : "",
    metres: hole.metres ? String(hole.metres) : "",
  }));
}

function toHoles(rows: RowDraft[]): TeeHole[] {
  return rows.map((row, position) => ({
    hole: position + 1,
    par: Number.parseInt(row.par, 10) || 0,
    index: Number.parseInt(row.index, 10) || 0,
    metres: Number.parseInt(row.metres, 10) || 0,
  }));
}

export default function TeeEditorPage() {
  const { appUser } = useAuth();
  const router = useRouter();
  const params = useParams<{ courseId: string; teeId: string }>();
  const { courseId, teeId } = params;
  const isNew = teeId === "new";

  const [course, setCourse] = useState<Course | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [name, setName] = useState("");
  const [gender, setGender] = useState<TeeGender>("men");
  const [courseRating, setCourseRating] = useState("");
  const [slope, setSlope] = useState("");
  const [rows, setRows] = useState<RowDraft[]>([]);

  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [pasteFeedback, setPasteFeedback] = useState<string[]>([]);

  const holeCount = course?.holeCount ?? 18;

  useEffect(() => {
    if (!appUser?.groupId) return;
    let cancelled = false;

    Promise.all([
      getCourse(appUser.groupId, courseId),
      isNew ? Promise.resolve(null) : getCourseTee(appUser.groupId, courseId, teeId),
    ])
      .then(([loadedCourse, loadedTee]) => {
        if (cancelled) return;
        if (!loadedCourse) {
          setError("That course no longer exists.");
          setLoading(false);
          return;
        }
        setCourse(loadedCourse);

        if (loadedTee) {
          setName(loadedTee.name);
          setGender(loadedTee.gender);
          setCourseRating(
            loadedTee.courseRating != null ? String(loadedTee.courseRating) : ""
          );
          setSlope(loadedTee.slope != null ? String(loadedTee.slope) : "");
          setRows(toDrafts(loadedTee.holes));
        } else {
          setRows(toDrafts(blankHoles(loadedCourse.holeCount)));
        }
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setError("Failed to load the tee.");
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [appUser?.groupId, courseId, teeId, isNew]);

  const holes = useMemo(() => toHoles(rows), [rows]);
  const totals = useMemo(() => teeTotals(holes), [holes]);

  const parsedRating = courseRating.trim() === "" ? null : Number(courseRating);
  const parsedSlope = slope.trim() === "" ? null : Number(slope);

  const issues = useMemo(
    () =>
      validateTee(
        {
          name,
          gender,
          courseRating: Number.isFinite(parsedRating) ? parsedRating : null,
          slope: Number.isFinite(parsedSlope) ? parsedSlope : null,
          holes,
        },
        holeCount
      ),
    [name, gender, parsedRating, parsedSlope, holes, holeCount]
  );

  const blocked = isBlocked(issues);
  const warnings = warningIssues(issues);

  const updateCell = (position: number, field: keyof RowDraft, value: string) => {
    setRows((current) =>
      current.map((row, index) =>
        index === position ? { ...row, [field]: value } : row
      )
    );
  };

  const handlePaste = () => {
    const result = parsePastedTee(pasteText, holeCount);
    const feedback: string[] = [];

    if (result.rowCount === 0) {
      setPasteFeedback(["Nothing to read — paste 18 rows of par, index, metres."]);
      return;
    }
    if (result.skippedHeader) feedback.push("Skipped a header row.");
    if (result.droppedHoleColumn) {
      feedback.push("Ignored a leading hole-number column.");
    }
    feedback.push(
      `Read ${result.rowCount} ${result.rowCount === 1 ? "row" : "rows"}.`
    );
    feedback.push(...result.errors);

    setRows(toDrafts(result.holes));
    setPasteFeedback(feedback);
    setPasteText("");
  };

  const handleSave = async () => {
    if (!appUser?.groupId || blocked) return;
    if (!name.trim()) {
      setError("Give this tee a name before saving.");
      return;
    }

    if (warnings.length > 0) {
      const confirmed = window.confirm(
        `${warnings.length} warning${warnings.length === 1 ? "" : "s"} on this tee:\n\n` +
          warnings.map((issue) => `· ${issue.message}`).join("\n") +
          "\n\nSave anyway?"
      );
      if (!confirmed) return;
    }

    setSaving(true);
    setError("");

    const payload = {
      name: name.trim(),
      gender,
      courseRating: Number.isFinite(parsedRating) ? parsedRating : null,
      slope: Number.isFinite(parsedSlope) ? parsedSlope : null,
      holes,
    };

    try {
      if (isNew) {
        await createCourseTee(appUser.groupId, courseId, payload);
      } else {
        await updateCourseTee(appUser.groupId, courseId, teeId, payload);
      }
      router.push(`/admin/courses/${courseId}`);
    } catch (caught) {
      setError(describeWriteError(caught, "tee"));
      setSaving(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-ink-hint">Loading tee…</p>;
  }

  return (
    <div className="space-y-5 pb-8">
      <div>
        <Link
          href={`/admin/courses/${courseId}`}
          className="text-xs text-ink-hint hover:text-ink-body"
        >
          ← {course?.name ?? "Course"}
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-ink-title">
          {isNew ? "New tee" : name || "Tee"}
        </h1>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* ── Tee identity and ratings ──────────────────────────────────────── */}
      <div className="space-y-3 rounded-2xl border border-surface-overlay bg-surface-card p-4 shadow-sm">
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-body" htmlFor="tee-name">
            Tee name
          </label>
          <input
            id="tee-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Men's White"
            className={INPUT_CLASSNAME}
          />
        </div>

        <div>
          <span className="mb-1 block text-xs font-medium text-ink-body">Gender</span>
          <div className="flex gap-2">
            {GENDERS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setGender(option.value)}
                className={`flex-1 rounded-xl border py-2 text-xs font-medium transition-colors ${
                  gender === option.value
                    ? "border-green-600 bg-brand-600 text-white"
                    : "border-surface-overlay text-ink-body hover:bg-surface-muted"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-body" htmlFor="tee-cr">
              Course rating
            </label>
            <input
              id="tee-cr"
              type="number"
              step="0.1"
              inputMode="decimal"
              value={courseRating}
              onChange={(e) => setCourseRating(e.target.value)}
              placeholder="70.1"
              className={INPUT_CLASSNAME}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-body" htmlFor="tee-slope">
              Slope
            </label>
            <input
              id="tee-slope"
              type="number"
              inputMode="numeric"
              value={slope}
              onChange={(e) => setSlope(e.target.value)}
              placeholder="121"
              className={INPUT_CLASSNAME}
            />
          </div>
        </div>
      </div>

      {/* ── Paste import ──────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-surface-overlay bg-surface-card p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-ink-title">Paste from a scorecard</h2>
            <p className="mt-1 text-xs text-ink-muted">
              {holeCount} rows of <code>par index metres</code>, separated by
              tabs, commas or spaces. A header row is skipped automatically.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setPasteOpen((current) => !current)}
            className="shrink-0 rounded-lg border border-surface-overlay bg-surface-muted px-3 py-1.5 text-xs font-semibold text-brand-700 transition-colors hover:bg-surface-overlay"
            aria-expanded={pasteOpen}
          >
            {pasteOpen ? "Hide" : "Paste"}
          </button>
        </div>

        {pasteOpen && (
          <div className="mt-3 space-y-2">
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              rows={6}
              placeholder={"4\t15\t343\n4\t1\t372\n3\t8\t155\n…"}
              className="w-full rounded-xl border border-surface-overlay bg-surface-card px-3 py-2.5 font-mono text-xs text-ink-title focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            <button
              type="button"
              onClick={handlePaste}
              disabled={!pasteText.trim()}
              className="w-full rounded-xl border border-brand-200 bg-surface-card py-2 text-xs font-semibold text-brand-700 transition-colors hover:bg-brand-50 disabled:text-brand-300"
            >
              Fill the table
            </button>
          </div>
        )}

        {pasteFeedback.length > 0 && (
          <ul className="mt-2 space-y-1">
            {pasteFeedback.map((line) => (
              <li key={line} className="text-xs text-ink-muted">
                {line}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ── The table ─────────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-surface-overlay bg-surface-card p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-ink-title">Card</h2>

        <div className="grid grid-cols-[34px_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.3fr)] items-center gap-1.5 text-xs font-semibold text-ink-muted">
          <span>Hole</span>
          <span className="text-center">Par</span>
          <span className="text-center">Index</span>
          <span className="text-center">Metres</span>
        </div>

        <div className="mt-2 space-y-1.5">
          {rows.map((row, position) => (
            <div
              key={position}
              className="grid grid-cols-[34px_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.3fr)] items-center gap-1.5"
            >
              <span className="text-xs font-semibold text-ink-body">
                H{position + 1}
              </span>
              <input
                type="number"
                inputMode="numeric"
                min={3}
                max={6}
                value={row.par}
                onChange={(e) => updateCell(position, "par", e.target.value)}
                className={CELL_CLASSNAME}
                aria-label={`Hole ${position + 1} par`}
              />
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={holeCount}
                value={row.index}
                onChange={(e) => updateCell(position, "index", e.target.value)}
                className={CELL_CLASSNAME}
                aria-label={`Hole ${position + 1} stroke index`}
              />
              <input
                type="number"
                inputMode="numeric"
                min={1}
                value={row.metres}
                onChange={(e) => updateCell(position, "metres", e.target.value)}
                className={CELL_CLASSNAME}
                aria-label={`Hole ${position + 1} distance in metres`}
              />
            </div>
          ))}
        </div>

        {/* Running totals */}
        <div className="mt-4 space-y-1 border-t border-surface-overlay pt-3">
          <TotalRow label="Out" par={totals.out.par} metres={totals.out.metres} />
          {totals.in && (
            <TotalRow label="In" par={totals.in.par} metres={totals.in.metres} />
          )}
          <TotalRow
            label="Total"
            par={totals.total.par}
            metres={totals.total.metres}
            emphasis
          />
        </div>
      </div>

      {/* ── Validation ────────────────────────────────────────────────────── */}
      <TeeIssueList issues={issues} />

      {/* ── Save ──────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-2">
        <Link
          href={`/admin/courses/${courseId}`}
          className="w-full rounded-xl border border-surface-overlay bg-surface-card py-2.5 text-center text-sm font-semibold text-ink-body transition-colors hover:bg-surface-muted"
        >
          Cancel
        </Link>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || blocked}
          className="w-full rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save tee"}
        </button>
      </div>
    </div>
  );
}

function TotalRow({
  label,
  par,
  metres,
  emphasis = false,
}: {
  label: string;
  par: number;
  metres: number;
  emphasis?: boolean;
}) {
  return (
    <div
      className={`grid grid-cols-[34px_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.3fr)] items-center gap-1.5 text-xs ${
        emphasis ? "font-bold text-ink-title" : "font-semibold text-ink-body"
      }`}
    >
      <span>{label}</span>
      <span className="text-center">{par}</span>
      <span className="text-center">—</span>
      <span className="text-center">{metres}m</span>
    </div>
  );
}
