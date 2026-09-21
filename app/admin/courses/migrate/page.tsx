"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { useAuth } from "@/contexts/AuthContext";
import {
  backupRounds,
  countBackedUpRounds,
  createCourse,
  createCourseTee,
  getAllRoundsForGroup,
  getCourseTees,
  getCourses,
  getLegacyCourseCorrections,
  writeRoundCourseSnapshot,
} from "@/lib/firestore";
import {
  buildMigrationReport,
  planCatalogue,
  planFreeze,
  summariseReport,
  type FreezePlanRow,
  type MigrationRow,
  type PlannedCourse,
} from "@/lib/courseMigration";
import { buildCourseSnapshot } from "@/lib/courseSnapshot";
import type { Course, CourseTee } from "@/types";

const BACKUP_COLLECTION = "rounds_backup_20260920";

type Phase = "idle" | "running" | "done" | "error";

export default function CourseMigrationPage() {
  const { appUser, isAdmin } = useAuth();

  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState("");
  const [rows, setRows] = useState<MigrationRow[] | null>(null);
  const [plan, setPlan] = useState<PlannedCourse[] | null>(null);
  const [freezePlan, setFreezePlan] = useState<FreezePlanRow[] | null>(null);
  const [log, setLog] = useState<string[]>([]);

  const summary = useMemo(() => (rows ? summariseReport(rows) : null), [rows]);

  const note = useCallback((line: string) => {
    setLog((current) => [...current, line]);
  }, []);

  const run = useCallback(
    async (label: string, work: () => Promise<void>) => {
      setPhase("running");
      setMessage(`${label}…`);
      try {
        await work();
        setPhase("done");
        setMessage(`${label} finished.`);
      } catch (error) {
        setPhase("error");
        setMessage(
          `${label} failed: ${error instanceof Error ? error.message : "unknown error"}`
        );
      }
    },
    []
  );

  // ── Pass 1 — report. Writes nothing. ──────────────────────────────────────
  const runPass1 = () =>
    run("Pass 1 report", async () => {
      setLog([]);
      const groupId = appUser!.groupId;
      const [allRounds, corrections] = await Promise.all([
        getAllRoundsForGroup(groupId),
        getLegacyCourseCorrections(groupId),
      ]);

      note(`Read ${allRounds.length} rounds.`);
      note(`Read ${corrections.length} saved course corrections.`);
      note("Nothing was written.");
      setRows(buildMigrationReport(allRounds, corrections));
      setPlan(null);
      setFreezePlan(null);
    });

  // ── Pass 2a — build the catalogue. Writes courses and tees only. ──────────
  const runPass2a = () =>
    run("Pass 2a — build catalogue", async () => {
      setLog([]);
      const groupId = appUser!.groupId;
      const [allRounds, corrections, existing] = await Promise.all([
        getAllRoundsForGroup(groupId),
        getLegacyCourseCorrections(groupId),
        getCourses(groupId, { includeArchived: true }),
      ]);

      const planned = planCatalogue(allRounds, corrections);
      setPlan(planned);

      const existingByName = new Map(
        existing.map((course) => [course.name.trim().toLowerCase(), course])
      );

      for (const plannedCourse of planned) {
        const key = plannedCourse.name.trim().toLowerCase();
        let course = existingByName.get(key);

        if (!course) {
          const newId = await createCourse(groupId, {
            name: plannedCourse.name,
            location: plannedCourse.location,
            holeCount: plannedCourse.holeCount,
          });
          course = {
            id: newId,
            groupId,
            name: plannedCourse.name,
            location: plannedCourse.location,
            holeCount: plannedCourse.holeCount,
            archived: false,
            createdAt: new Date(),
            updatedAt: new Date(),
          } satisfies Course;
          existingByName.set(key, course);
          note(`Created course "${plannedCourse.name}".`);
        } else {
          note(`Course "${plannedCourse.name}" already exists — leaving it alone.`);
        }

        const existingTees = await getCourseTees(groupId, course.id);
        const existingTeeNames = new Set(
          existingTees.map((tee) => tee.name.trim().toLowerCase())
        );

        for (const plannedTee of plannedCourse.tees) {
          if (existingTeeNames.has(plannedTee.name.trim().toLowerCase())) {
            note(`  Tee "${plannedTee.name}" already exists — skipped.`);
            continue;
          }
          await createCourseTee(groupId, course.id, {
            name: plannedTee.name,
            gender: plannedTee.gender,
            courseRating: plannedTee.courseRating,
            slope: plannedTee.slope,
            holes: plannedTee.holes,
          });
          note(
            `  Created tee "${plannedTee.name}" from ${plannedTee.source}` +
              (plannedTee.source === "none"
                ? " — BLANK, type the card in before freezing."
                : ".")
          );
        }
      }

      note("Now open each tee and fix it until it passes V1 and V2.");
    });

  // ── Pass 2b — freeze snapshots onto rounds. ───────────────────────────────
  const runPass2b = (dryRun: boolean) =>
    run(dryRun ? "Pass 2b — dry run" : "Pass 2b — freeze snapshots", async () => {
      setLog([]);
      const groupId = appUser!.groupId;
      const [allRounds, courses] = await Promise.all([
        getAllRoundsForGroup(groupId),
        getCourses(groupId, { includeArchived: true }),
      ]);

      const teesByCourse = new Map<string, CourseTee[]>();
      for (const course of courses) {
        teesByCourse.set(course.id, await getCourseTees(groupId, course.id));
      }

      const catalogue = courses.map((course) => ({
        id: course.id,
        name: course.name,
        holeCount: course.holeCount,
        tees: (teesByCourse.get(course.id) ?? []).map((tee) => ({
          id: tee.id,
          name: tee.name,
          holes: tee.holes,
        })),
      }));

      const planned = planFreeze(allRounds, catalogue);
      setFreezePlan(planned);

      const blocked = planned.filter((row) => row.blocked);
      const ready = planned.filter((row) => !row.blocked);

      note(`${ready.length} rounds ready to freeze, ${blocked.length} blocked.`);

      if (dryRun) {
        note("Dry run — nothing was written.");
        return;
      }

      if (blocked.length > 0) {
        note(
          "Refusing to write while any round is blocked. Fix the tees named above, then run again."
        );
        return;
      }

      const alreadyBackedUp = await countBackedUpRounds(BACKUP_COLLECTION);
      if (alreadyBackedUp === 0) {
        const copied = await backupRounds(groupId, BACKUP_COLLECTION);
        note(`Backed up ${copied} rounds to ${BACKUP_COLLECTION}.`);
      } else {
        note(
          `${BACKUP_COLLECTION} already holds ${alreadyBackedUp} rounds — keeping the original backup.`
        );
      }

      const roundsById = new Map(allRounds.map((round) => [round.id, round]));
      let frozen = 0;
      let skipped = 0;

      for (const row of ready) {
        const round = roundsById.get(row.roundId);

        // Already-frozen sealed rounds are immutable by design (R4) — the
        // one-time backfill exception only fills an ABSENT snapshot. Skip
        // them so a second run is a no-op rather than a wall of errors.
        if (round && round.courseSnapshot && round.status !== "upcoming") {
          skipped += 1;
          note(
            `Skipped R${row.roundNumber} ${row.courseName} — already frozen and sealed.`
          );
          continue;
        }

        const course = courses.find((entry) => entry.id === row.courseId)!;
        const tees = teesByCourse.get(course.id) ?? [];
        const snapshot = buildCourseSnapshot(course, tees, new Date());
        await writeRoundCourseSnapshot(row.roundId, snapshot, row.teeId!);
        frozen += 1;
        note(
          `Froze R${row.roundNumber} ${row.courseName} (${row.teeName}` +
            `${row.reason ? ` — ${row.reason}` : ""})` +
            `${round && round.status !== "upcoming" ? " [sealed]" : ""}`
        );
      }

      note(
        `Done. ${frozen} rounds frozen` +
          (skipped > 0 ? `, ${skipped} already sealed and left alone.` : ".")
      );
    });

  if (!isAdmin) {
    return (
      <p className="text-sm text-ink-muted">
        Only a group admin can run the course migration.
      </p>
    );
  }

  const busy = phase === "running";

  return (
    <div className="space-y-5 pb-8">
      <div>
        <Link href="/admin/courses" className="text-xs text-ink-hint hover:text-ink-body">
          ← Courses
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-ink-title">Course migration</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Moves existing rounds onto the new course model. Run the passes in
          order — the first one writes nothing.
        </p>
      </div>

      {message && (
        <div
          className={`rounded-xl border px-4 py-3 text-sm ${
            phase === "error"
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-green-200 bg-brand-50 text-brand-800"
          }`}
        >
          {message}
        </div>
      )}

      {/* ── Pass 1 ────────────────────────────────────────────────────────── */}
      <section className="space-y-3 rounded-2xl border border-surface-overlay bg-surface-card p-4 shadow-sm">
        <div>
          <h2 className="font-semibold text-ink-title">Pass 1 — report</h2>
          <p className="mt-1 text-xs text-ink-muted">
            Reads every round and every saved correction, and reports what each
            round actually holds. Writes nothing.
          </p>
        </div>
        <button
          type="button"
          onClick={runPass1}
          disabled={busy}
          className="w-full rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:bg-brand-400"
        >
          Run Pass 1 report
        </button>

        {summary && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Stat label="Rounds" value={summary.total} />
            <Stat label="With snapshot" value={summary.withSnapshot} />
            <Stat label="Fake index" value={summary.sequentialIndex} tone={summary.sequentialIndex > 0 ? "bad" : "good"} />
            <Stat label="Invalid index" value={summary.invalidIndex} tone={summary.invalidIndex > 0 ? "bad" : "good"} />
            <Stat label="Missing distances" value={summary.missingDistances} tone={summary.missingDistances > 0 ? "warn" : "good"} />
            <Stat label="Need fixing" value={summary.needsFix} tone={summary.needsFix > 0 ? "bad" : "good"} />
          </div>
        )}

        {rows && rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-xs">
              <thead>
                <tr className="border-b border-surface-overlay text-ink-muted">
                  <th className="py-2 pr-2 font-semibold">Round</th>
                  <th className="py-2 pr-2 font-semibold">Course</th>
                  <th className="py-2 pr-2 font-semibold">Tee</th>
                  <th className="py-2 pr-2 font-semibold">Index source</th>
                  <th className="py-2 pr-2 font-semibold">Valid?</th>
                  <th className="py-2 pr-2 font-semibold">Sequential?</th>
                  <th className="py-2 font-semibold">Distances?</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.roundId}
                    className={`border-b border-surface-overlay/60 ${
                      row.needsFix ? "bg-red-50/40" : ""
                    }`}
                  >
                    <td className="py-2 pr-2 text-ink-body">
                      R{row.roundNumber}
                      <span className="block text-ink-hint">
                        {format(row.date, "d MMM yyyy")}
                      </span>
                    </td>
                    <td className="py-2 pr-2 text-ink-body">{row.courseName}</td>
                    <td className="py-2 pr-2 text-ink-body">{row.teeName}</td>
                    <td className="py-2 pr-2 text-ink-body">{row.indexSource}</td>
                    <td className="py-2 pr-2">
                      <Flag ok={row.indexValid} />
                    </td>
                    <td className="py-2 pr-2">
                      <Flag ok={!row.indexSequential} badLabel="fake" />
                    </td>
                    <td className="py-2">
                      <Flag ok={row.distancesPresent} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Pass 2a ───────────────────────────────────────────────────────── */}
      <section className="space-y-3 rounded-2xl border border-surface-overlay bg-surface-card p-4 shadow-sm">
        <div>
          <h2 className="font-semibold text-ink-title">Pass 2a — build the catalogue</h2>
          <p className="mt-1 text-xs text-ink-muted">
            Creates a course and tee for every distinct pair found in the
            rounds, seeded from saved corrections where they exist. Existing
            courses and tees are never overwritten. Rounds are not touched.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            if (
              window.confirm(
                "Create courses and tees from the existing rounds? This writes to the course catalogue but does not touch any round."
              )
            ) {
              runPass2a();
            }
          }}
          disabled={busy}
          className="w-full rounded-xl border border-brand-200 bg-surface-card py-2.5 text-sm font-semibold text-brand-700 transition-colors hover:bg-brand-50 disabled:text-brand-300"
        >
          Build catalogue
        </button>

        {plan && (
          <div className="space-y-2">
            {plan.map((course) => (
              <div
                key={course.name}
                className="rounded-xl border border-surface-overlay bg-surface-muted p-3"
              >
                <p className="text-xs font-semibold text-ink-title">
                  {course.name} · {course.holeCount} holes
                </p>
                <ul className="mt-1 space-y-0.5">
                  {course.tees.map((tee) => (
                    <li key={tee.name} className="text-xs text-ink-muted">
                      {tee.name} — from {tee.source} ·{" "}
                      {tee.roundIds.length}{" "}
                      {tee.roundIds.length === 1 ? "round" : "rounds"}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Pass 2b ───────────────────────────────────────────────────────── */}
      <section className="space-y-3 rounded-2xl border border-surface-overlay bg-surface-card p-4 shadow-sm">
        <div>
          <h2 className="font-semibold text-ink-title">Pass 2b — freeze snapshots</h2>
          <p className="mt-1 text-xs text-ink-muted">
            Writes a <code>courseSnapshot</code> onto every round from the
            corrected tees. Refuses to write while any tee still fails V1, and
            copies every round into <code>{BACKUP_COLLECTION}</code> first.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => runPass2b(true)}
            disabled={busy}
            className="w-full rounded-xl border border-surface-overlay bg-surface-muted py-2.5 text-sm font-semibold text-ink-body transition-colors hover:bg-surface-overlay disabled:opacity-50"
          >
            Dry run
          </button>
          <button
            type="button"
            onClick={() => {
              if (
                window.confirm(
                  `Freeze course snapshots onto every round? Rounds are backed up to ${BACKUP_COLLECTION} first. This rewrites course data on rounds that have already been played.`
                )
              ) {
                runPass2b(false);
              }
            }}
            disabled={busy}
            className="w-full rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:bg-brand-400"
          >
            Freeze
          </button>
        </div>

        {freezePlan && (
          <div className="space-y-1.5">
            {freezePlan.map((row) => (
              <div
                key={row.roundId}
                className={`rounded-lg border px-3 py-2 text-xs ${
                  row.blocked
                    ? "border-red-200 bg-red-50 text-red-700"
                    : row.reason
                    ? "border-amber-200 bg-amber-50 text-amber-700"
                    : "border-surface-overlay bg-surface-muted text-ink-muted"
                }`}
              >
                <span className="font-semibold">
                  R{row.roundNumber} · {row.courseName} · {row.teeName}
                </span>
                {row.reason && <span className="block">{row.reason}</span>}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Log ───────────────────────────────────────────────────────────── */}
      {log.length > 0 && (
        <section className="rounded-2xl border border-surface-overlay bg-surface-card p-4 shadow-sm">
          <h2 className="mb-2 font-semibold text-ink-title">Log</h2>
          <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-xl bg-surface-muted p-3 font-mono text-xs text-ink-body">
            {log.join("\n")}
          </pre>
        </section>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number;
  tone?: "neutral" | "good" | "warn" | "bad";
}) {
  const toneClass =
    tone === "bad"
      ? "text-red-600"
      : tone === "warn"
      ? "text-amber-600"
      : tone === "good"
      ? "text-brand-700"
      : "text-ink-title";

  return (
    <div className="rounded-xl border border-surface-overlay bg-surface-muted px-3 py-2">
      <p className={`text-lg font-bold ${toneClass}`}>{value}</p>
      <p className="text-xs text-ink-muted">{label}</p>
    </div>
  );
}

function Flag({ ok, badLabel = "no" }: { ok: boolean; badLabel?: string }) {
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
        ok ? "bg-brand-100 text-brand-800" : "bg-red-100 text-red-700"
      }`}
    >
      {ok ? "yes" : badLabel}
    </span>
  );
}
