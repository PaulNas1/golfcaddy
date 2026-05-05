"use client";

import { useEffect, useState } from "react";
import {
  createNotificationsForUsers,
  getActiveMembers,
  saveCourseCorrection,
  updateRound,
} from "@/lib/firestore";
import {
  getEffectiveSpecialHoles,
  getFallbackCourseHoles,
  getHoleOptionLabel,
} from "@/lib/courseData";
import { PencilIcon, TrashIcon } from "@/components/ui/icons";
import type { AppUser, Group, HoleOverride, Round } from "@/types";

// ---------------------------------------------------------------------------
// Local form components
// ---------------------------------------------------------------------------

function CourseParCorrectionForm({
  holes,
  onSubmit,
  disabled,
}: {
  holes: Round["courseHoles"];
  onSubmit: (hole: number, par: number, yardage?: number) => void;
  disabled: boolean;
}) {
  const [hole, setHole] = useState("");
  const [par, setPar] = useState("");
  const [yardage, setYardage] = useState("");

  const handle = () => {
    if (!hole || !par) return;
    const parsedYardage =
      yardage.trim() !== "" ? parseInt(yardage, 10) : undefined;
    onSubmit(parseInt(hole), parseInt(par), parsedYardage);
    setHole("");
    setPar("");
    setYardage("");
  };

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-[1fr_7rem_3.5rem] gap-2">
        <select
          value={hole}
          onChange={(e) => setHole(e.target.value)}
          className="min-w-0 px-3 py-2.5 rounded-xl border border-gray-200 text-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
        >
          <option value="">Hole</option>
          {holes.map((h) => (
            <option key={h.number} value={h.number}>
              {getHoleOptionLabel(h)}
            </option>
          ))}
        </select>
        <select
          value={par}
          onChange={(e) => setPar(e.target.value)}
          className="min-w-0 px-2 py-2.5 rounded-xl border border-gray-200 text-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
        >
          <option value="">Par</option>
          {[3, 4, 5].map((n) => (
            <option key={n} value={n}>
              Par {n}
            </option>
          ))}
        </select>
        <input
          type="number"
          min={1}
          value={yardage}
          onChange={(e) => setYardage(e.target.value)}
          placeholder="m"
          className="min-w-0 rounded-xl border border-gray-200 px-2 py-2.5 text-center text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500"
          aria-label="Distance in metres"
        />
      </div>
      <button
        type="button"
        onClick={handle}
        disabled={disabled || !hole || !par}
        className="w-full rounded-xl border border-green-200 bg-green-50 py-2.5 text-sm font-semibold text-green-700 transition-colors hover:bg-green-100 disabled:text-green-400"
      >
        Save Correction
      </button>
    </div>
  );
}

function HoleOverrideForm({
  holes,
  onSubmit,
  disabled,
  editingOverride,
  onCancelEdit,
}: {
  holes: Round["courseHoles"];
  onSubmit: (
    hole: number,
    par: number,
    reason: string,
    yardage?: number
  ) => void;
  disabled: boolean;
  editingOverride: HoleOverride | null;
  onCancelEdit: () => void;
}) {
  const [hole, setHole] = useState("");
  const [par, setPar] = useState("");
  const [yardage, setYardage] = useState("");
  const [reason, setReason] = useState("");
  const isEditing = Boolean(editingOverride);

  useEffect(() => {
    if (!editingOverride) {
      setHole("");
      setPar("");
      setYardage("");
      setReason("");
      return;
    }
    setHole(String(editingOverride.holeNumber));
    setPar(String(editingOverride.overridePar));
    setYardage(
      editingOverride.overrideYardage != null
        ? String(editingOverride.overrideYardage)
        : ""
    );
    setReason(editingOverride.reason);
  }, [editingOverride]);

  const handle = () => {
    if (!hole || !par) return;
    const parsedYardage =
      yardage.trim() !== "" ? parseInt(yardage, 10) : undefined;
    onSubmit(parseInt(hole), parseInt(par), reason, parsedYardage);
    setHole("");
    setPar("");
    setYardage("");
    setReason("");
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <select
          value={hole}
          onChange={(e) => setHole(e.target.value)}
          disabled={isEditing}
          className="flex-1 px-3 py-2.5 rounded-xl border border-gray-200 text-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
        >
          <option value="">Hole</option>
          {holes.map((h) => (
            <option key={h.number} value={h.number}>
              {getHoleOptionLabel(h)}
            </option>
          ))}
        </select>
        <select
          value={par}
          onChange={(e) => setPar(e.target.value)}
          className="flex-1 px-3 py-2.5 rounded-xl border border-gray-200 text-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
        >
          <option value="">New par</option>
          {[3, 4, 5].map((n) => (
            <option key={n} value={n}>
              Par {n}
            </option>
          ))}
        </select>
        <input
          type="number"
          min={1}
          value={yardage}
          onChange={(e) => setYardage(e.target.value)}
          placeholder="m"
          className="w-16 min-w-0 rounded-xl border border-gray-200 px-2 py-2.5 text-center text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500"
          aria-label="Yardage override in metres"
        />
      </div>
      <input
        type="text"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason (e.g. GUR, temporary green)"
        className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
      />
      <button
        type="button"
        onClick={handle}
        disabled={disabled || !hole || !par}
        className="w-full bg-amber-500 hover:bg-amber-600 disabled:bg-amber-300 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors"
      >
        {isEditing
          ? "Save Override & Notify Members"
          : "Apply Override & Notify Members"}
      </button>
      {isEditing && (
        <button
          type="button"
          onClick={() => {
            onCancelEdit();
            setHole("");
            setPar("");
            setYardage("");
            setReason("");
          }}
          disabled={disabled}
          className="w-full rounded-xl border border-gray-200 bg-white py-2.5 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-50 disabled:text-gray-300"
        >
          Cancel edit
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// CourseCorrectionsSection
// ---------------------------------------------------------------------------

type Props = {
  round: Round;
  group: Group | null;
  appUser: AppUser | null;
  onRoundChange: (updated: Round) => void;
  onSuccess: (message: string) => void;
};

export default function CourseCorrectionsSection({
  round,
  group,
  appUser,
  onRoundChange,
  onSuccess,
}: Props) {
  const [open, setOpen] = useState(round.holeOverrides.length > 0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [editingOverride, setEditingOverride] = useState<HoleOverride | null>(
    null
  );

  const [editingStrokeIndexes, setEditingStrokeIndexes] = useState(false);
  const [savingStrokeIndexes, setSavingStrokeIndexes] = useState(false);
  const [strokeIndexDrafts, setStrokeIndexDrafts] = useState<
    Record<number, string>
  >(() => {
    if (round.courseHoles.length !== 18) return {};
    const d: Record<number, string> = {};
    round.courseHoles.forEach((h) => {
      d[h.number] = String(h.strokeIndex);
    });
    return d;
  });

  const [editingRatingSlope, setEditingRatingSlope] = useState(false);
  const [courseRatingDraft, setCourseRatingDraft] = useState("");
  const [slopeRatingDraft, setSlopeRatingDraft] = useState("");
  const [savingRatingSlope, setSavingRatingSlope] = useState(false);

  const [savingCorrectionLibrary, setSavingCorrectionLibrary] = useState(false);
  const [correctionLibrarySaved, setCorrectionLibrarySaved] = useState(false);

  // Auto-open panel when overrides arrive
  useEffect(() => {
    if (round.holeOverrides.length > 0) setOpen(true);
  }, [round.holeOverrides.length]);

  // Keep stroke-index drafts in sync when round data changes externally
  // (e.g. after a course refresh), but only when not actively editing
  useEffect(() => {
    if (editingStrokeIndexes || round.courseHoles.length !== 18) return;
    const d: Record<number, string> = {};
    round.courseHoles.forEach((h) => {
      d[h.number] = String(h.strokeIndex);
    });
    setStrokeIndexDrafts(d);
  }, [round.courseHoles, editingStrokeIndexes]);

  const roundHoleOptions =
    round.courseHoles.length === 18
      ? round.courseHoles
      : getFallbackCourseHoles();

  const showError = (msg: string) => {
    setError(msg);
    setTimeout(() => setError(""), 4000);
  };

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------

  const addHoleOverride = async (
    holeNumber: number,
    overridePar: number,
    reason: string,
    yardage?: number
  ) => {
    setSaving(true);
    try {
      const courseHole = roundHoleOptions.find((h) => h.number === holeNumber);
      const existing = round.holeOverrides.find(
        (o) => o.holeNumber === holeNumber
      );
      const override: HoleOverride = {
        holeNumber,
        originalPar: existing?.originalPar ?? courseHole?.par ?? 4,
        overridePar,
        ...(yardage != null ? { overrideYardage: yardage } : {}),
        reason: reason.trim(),
        overriddenAt: new Date(),
      };
      const updated = [
        ...round.holeOverrides.filter((o) => o.holeNumber !== holeNumber),
        override,
      ].sort((a, b) => a.holeNumber - b.holeNumber);

      const updatedRound = { ...round, holeOverrides: updated };
      const specialHoles = getEffectiveSpecialHoles(updatedRound);
      await updateRound(round.id, { holeOverrides: updated, specialHoles });

      const activeUsers = await getActiveMembers(round.groupId);
      const yardageNote = yardage != null ? ` · ${yardage}m` : "";
      await createNotificationsForUsers({
        recipientUserIds: activeUsers.map((u) => u.uid),
        groupId: round.groupId,
        type: "change_alert",
        title: "Course update",
        body: `Hole ${holeNumber} is now Par ${overridePar}${yardageNote}${reason.trim() ? `: ${reason.trim()}` : "."}`,
        deepLink: `/rounds/${round.id}`,
        roundId: round.id,
      });

      onRoundChange({ ...updatedRound, specialHoles });
      setEditingOverride(null);
      onSuccess("Hole par updated. Members will be notified.");
    } finally {
      setSaving(false);
    }
  };

  const deleteHoleOverride = async (
    overrideToDelete: HoleOverride,
    overrideIndex: number
  ) => {
    const confirmed = window.confirm(
      `Delete the par override for hole ${overrideToDelete.holeNumber}?`
    );
    if (!confirmed) return;

    setSaving(true);
    try {
      const updated = round.holeOverrides.filter((_, i) => i !== overrideIndex);
      const updatedRound = { ...round, holeOverrides: updated };
      const specialHoles = getEffectiveSpecialHoles(updatedRound);
      await updateRound(round.id, { holeOverrides: updated, specialHoles });

      const activeUsers = await getActiveMembers(round.groupId);
      await createNotificationsForUsers({
        recipientUserIds: activeUsers.map((u) => u.uid),
        groupId: round.groupId,
        type: "change_alert",
        title: "Course update",
        body: `Hole ${overrideToDelete.holeNumber} par override was removed for Round ${round.roundNumber}.`,
        deepLink: `/rounds/${round.id}`,
        roundId: round.id,
      });

      onRoundChange({ ...updatedRound, specialHoles });

      if (
        editingOverride?.holeNumber === overrideToDelete.holeNumber &&
        editingOverride?.overridePar === overrideToDelete.overridePar &&
        editingOverride?.reason === overrideToDelete.reason
      ) {
        setEditingOverride(null);
      }
      onSuccess("Hole par override deleted. Members will be notified.");
    } finally {
      setSaving(false);
    }
  };

  const correctCoursePar = async (
    holeNumber: number,
    newPar: number,
    yardage?: number
  ) => {
    setSaving(true);
    try {
      const holeType = (p: number): "par3" | "par4" | "par5" =>
        p === 3 ? "par3" : p === 5 ? "par5" : "par4";

      const updatedHoles = roundHoleOptions.map((h) =>
        h.number !== holeNumber
          ? h
          : {
              ...h,
              par: newPar,
              type: holeType(newPar),
              ...(yardage != null ? { distanceMeters: yardage } : {}),
            }
      );

      const updatedTeeSets = (round.availableTeeSets ?? []).map((ts) => {
        if (ts.id !== round.teeSetId || ts.holes.length !== 18) return ts;
        const updatedTeeHoles = ts.holes.map((h) =>
          h.number !== holeNumber
            ? h
            : {
                ...h,
                par: newPar,
                type: holeType(newPar),
                ...(yardage != null ? { distanceMeters: yardage } : {}),
              }
        );
        return {
          ...ts,
          holes: updatedTeeHoles,
          par: updatedTeeHoles.reduce((sum, h) => sum + h.par, 0),
        };
      });

      const updatedRound = {
        ...round,
        courseHoles: updatedHoles,
        availableTeeSets: updatedTeeSets,
      };
      const specialHoles = getEffectiveSpecialHoles(updatedRound);
      await updateRound(round.id, {
        courseHoles: updatedHoles,
        availableTeeSets: updatedTeeSets,
        specialHoles,
      });
      onRoundChange({ ...updatedRound, specialHoles });
      onSuccess("Course data corrected.");
    } finally {
      setSaving(false);
    }
  };

  const saveStrokeIndexes = async () => {
    const holes = roundHoleOptions;
    const values = holes.map((h) =>
      parseInt(strokeIndexDrafts[h.number] ?? "", 10)
    );

    if (values.some((v) => isNaN(v) || v < 1 || v > 18)) {
      showError("Each stroke index must be a number between 1 and 18.");
      return;
    }
    if (new Set(values).size !== 18) {
      showError("Each stroke index must be unique (1–18, no duplicates).");
      return;
    }

    setSavingStrokeIndexes(true);
    try {
      const updatedHoles = holes.map((h, i) => ({
        ...h,
        strokeIndex: values[i],
      }));
      const updatedTeeSets = (round.availableTeeSets ?? []).map((ts) => {
        if (ts.id !== round.teeSetId || ts.holes.length !== 18) return ts;
        return {
          ...ts,
          holes: ts.holes.map((h) => {
            const newSI = values[h.number - 1];
            return newSI !== undefined ? { ...h, strokeIndex: newSI } : h;
          }),
        };
      });
      await updateRound(round.id, {
        courseHoles: updatedHoles,
        availableTeeSets: updatedTeeSets,
      });
      onRoundChange({
        ...round,
        courseHoles: updatedHoles,
        availableTeeSets: updatedTeeSets,
      });
      setEditingStrokeIndexes(false);
      onSuccess("Stroke indexes updated.");
    } finally {
      setSavingStrokeIndexes(false);
    }
  };

  const saveRatingSlope = async () => {
    const rating =
      courseRatingDraft.trim() === ""
        ? null
        : parseFloat(courseRatingDraft);
    const slope =
      slopeRatingDraft.trim() === ""
        ? null
        : parseInt(slopeRatingDraft, 10);

    if (
      courseRatingDraft.trim() !== "" &&
      (isNaN(rating!) || rating! < 50 || rating! > 85)
    ) {
      showError("Course rating must be a number between 50 and 85.");
      return;
    }
    if (
      slopeRatingDraft.trim() !== "" &&
      (isNaN(slope!) || slope! < 55 || slope! > 155)
    ) {
      showError("Slope rating must be a number between 55 and 155.");
      return;
    }

    setSavingRatingSlope(true);
    try {
      await updateRound(round.id, { courseRating: rating, slopeRating: slope });
      onRoundChange({ ...round, courseRating: rating, slopeRating: slope });
      setEditingRatingSlope(false);
      onSuccess("Course rating and slope saved.");
    } finally {
      setSavingRatingSlope(false);
    }
  };

  const saveToCorrectionsLibrary = async () => {
    if (!round.teeSetId || !appUser) return;
    const holes = roundHoleOptions;
    setSavingCorrectionLibrary(true);
    try {
      await saveCourseCorrection(round.groupId, {
        groupId: round.groupId,
        teeSetId: round.teeSetId,
        courseName: round.courseName,
        teeSetName: round.teeSetName ?? "Unknown",
        correctedCourseRating: round.courseRating,
        correctedSlopeRating: round.slopeRating,
        holeCorrections: holes.map((h) => ({
          holeNumber: h.number,
          strokeIndex: h.strokeIndex,
          par: h.par,
        })),
        savedBy: appUser.uid,
        savedByName: appUser.displayName,
      });
      setCorrectionLibrarySaved(true);
      setTimeout(() => setCorrectionLibrarySaved(false), 4000);
    } finally {
      setSavingCorrectionLibrary(false);
    }
  };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div
      className={`rounded-2xl shadow-sm border p-4 overflow-hidden ${
        round.holeOverrides.length > 0
          ? "border-amber-200 bg-amber-50/40"
          : "border-gray-100 bg-white"
      }`}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <div className="flex items-center gap-2">
          <h2 className="font-semibold text-gray-800">Course Corrections</h2>
          {round.holeOverrides.length > 0 && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
              {round.holeOverrides.length} active override
              {round.holeOverrides.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
        <span className="shrink-0 text-sm text-gray-400">
          {open ? "▲" : "▼"}
        </span>
      </button>

      {open && (
        <div className="mt-4 space-y-6">
          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {error}
            </div>
          )}

          {/* Correct Hole Par */}
          <div className="space-y-3">
            <div>
              <p className="text-sm font-semibold text-gray-800">
                Correct Hole Par &amp; Yardage
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                Fix incorrect course data — writes directly to this round&apos;s
                hole data. No players are notified. For in-round changes (GUR
                etc.) use the Live Par Override in the round panel.
              </p>
            </div>
            <CourseParCorrectionForm
              holes={roundHoleOptions}
              onSubmit={correctCoursePar}
              disabled={saving}
            />

            {round.holeOverrides.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-gray-600">
                  Active live overrides:
                </p>
                {round.holeOverrides.map((o, index) => (
                  <div
                    key={`${o.holeNumber}-${index}`}
                    className="flex items-center justify-between gap-3 bg-amber-50 rounded-xl px-3 py-2 text-sm text-amber-800 border border-amber-100"
                  >
                    <div className="min-w-0">
                      <span className="font-medium">
                        Hole {o.holeNumber}: Par {o.originalPar} →{" "}
                        {o.overridePar}
                        {o.overrideYardage != null
                          ? ` · ${o.overrideYardage}m`
                          : ""}
                      </span>
                      {o.reason && (
                        <span className="ml-1 text-amber-600">
                          ({o.reason})
                        </span>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setEditingOverride(o)}
                        disabled={saving}
                        aria-label={`Edit override for hole ${o.holeNumber}`}
                        className="rounded-lg border border-amber-200 bg-white p-2 text-amber-700 transition-colors hover:bg-amber-100 disabled:text-amber-300"
                      >
                        <PencilIcon className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteHoleOverride(o, index)}
                        disabled={saving}
                        aria-label={`Delete override for hole ${o.holeNumber}`}
                        className="rounded-lg border border-red-100 bg-white p-2 text-red-600 transition-colors hover:bg-red-50 disabled:text-red-300"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Live Par Override — shown only during live rounds */}
          {round.status === "live" && !round.resultsPublished && (
            <div className="space-y-3 border-t border-amber-100 pt-5">
              <div>
                <p className="text-sm font-semibold text-gray-700">
                  Live Par Override
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  Apply an on-the-fly change (GUR, temporary tee). Players are
                  notified instantly.
                </p>
              </div>
              <HoleOverrideForm
                holes={roundHoleOptions}
                onSubmit={addHoleOverride}
                disabled={saving}
                editingOverride={editingOverride}
                onCancelEdit={() => setEditingOverride(null)}
              />
            </div>
          )}

          {/* Course Rating & Slope */}
          <div className="space-y-3 border-t border-gray-100 pt-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-gray-800">
                  Course Rating &amp; Slope
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Used for slope-adjusted playing handicap. Leave blank if not
                  applicable.
                </p>
              </div>
              {!editingRatingSlope ? (
                <button
                  type="button"
                  onClick={() => {
                    setCourseRatingDraft(
                      round.courseRating != null
                        ? String(round.courseRating)
                        : ""
                    );
                    setSlopeRatingDraft(
                      round.slopeRating != null
                        ? String(round.slopeRating)
                        : ""
                    );
                    setEditingRatingSlope(true);
                  }}
                  className="shrink-0 text-xs font-medium text-green-700 hover:underline"
                >
                  Edit
                </button>
              ) : (
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setEditingRatingSlope(false)}
                    disabled={savingRatingSlope}
                    className="text-xs font-medium text-gray-500 hover:underline disabled:text-gray-300"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={saveRatingSlope}
                    disabled={savingRatingSlope}
                    className="text-xs font-semibold text-green-700 hover:underline disabled:text-green-300"
                  >
                    {savingRatingSlope ? "Saving…" : "Save"}
                  </button>
                </div>
              )}
            </div>

            {group?.settings?.handicapMode === "slope_adjusted" &&
              (round.courseRating == null || round.slopeRating == null) && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  ⚠️ Slope-adjusted handicaps are on, but{" "}
                  {round.courseRating == null && round.slopeRating == null
                    ? "Course Rating and Slope are"
                    : round.courseRating == null
                    ? "Course Rating is"
                    : "Slope is"}{" "}
                  not set. Scorecards created without this data will use{" "}
                  {round.slopeRating == null ? "Slope 113 (standard)" : ""}
                  {round.slopeRating == null && round.courseRating == null
                    ? " and "
                    : ""}
                  {round.courseRating == null
                    ? "no course rating differential"
                    : ""}
                  . Set correct values before play begins.
                </div>
              )}

            {!editingRatingSlope ? (
              <div className="flex gap-3">
                <div className="flex-1 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2 text-center">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                    Course Rating
                  </p>
                  <p className="mt-0.5 text-sm font-semibold text-gray-800">
                    {round.courseRating != null ? round.courseRating : "—"}
                  </p>
                </div>
                <div className="flex-1 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2 text-center">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                    Slope
                  </p>
                  <p className="mt-0.5 text-sm font-semibold text-gray-800">
                    {round.slopeRating != null ? round.slopeRating : "—"}
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    Course Rating
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min={50}
                    max={85}
                    value={courseRatingDraft}
                    onChange={(e) => setCourseRatingDraft(e.target.value)}
                    placeholder="e.g. 71.5"
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    Slope
                  </label>
                  <input
                    type="number"
                    min={55}
                    max={155}
                    value={slopeRatingDraft}
                    onChange={(e) => setSlopeRatingDraft(e.target.value)}
                    placeholder="e.g. 125"
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Stroke Indexes */}
          {round.courseHoles.length === 18 && (
            <div className="space-y-3 border-t border-gray-100 pt-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-gray-800">
                    Stroke Indexes
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Stroke index 1 = hardest hole. All 18 must be unique.
                  </p>
                </div>
                {!editingStrokeIndexes ? (
                  <button
                    type="button"
                    onClick={() => setEditingStrokeIndexes(true)}
                    className="shrink-0 text-xs font-medium text-green-700 hover:underline"
                  >
                    Edit
                  </button>
                ) : (
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingStrokeIndexes(false);
                        const drafts: Record<number, string> = {};
                        round.courseHoles.forEach((h) => {
                          drafts[h.number] = String(h.strokeIndex);
                        });
                        setStrokeIndexDrafts(drafts);
                      }}
                      disabled={savingStrokeIndexes}
                      className="text-xs font-medium text-gray-500 hover:underline disabled:text-gray-300"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={saveStrokeIndexes}
                      disabled={savingStrokeIndexes}
                      className="text-xs font-semibold text-green-700 hover:underline disabled:text-green-300"
                    >
                      {savingStrokeIndexes ? "Saving…" : "Save"}
                    </button>
                  </div>
                )}
              </div>

              {round.courseHoles.every(
                (h) => h.strokeIndex === h.number
              ) && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  ⚠️ Stroke indexes match hole numbers (1, 2, 3…) — the API
                  likely didn&apos;t provide real handicap data. Tap Edit to
                  enter the correct values from the scorecard.
                </div>
              )}

              <div
                className="grid grid-cols-6 gap-x-1.5 gap-y-1.5 text-xs"
                aria-label="Stroke indexes"
              >
                {round.courseHoles.flatMap((h) => [
                  <div
                    key={`lbl-${h.number}`}
                    className="flex items-center justify-center rounded-lg bg-gray-50 px-1 py-1.5 text-xs font-semibold text-gray-500"
                  >
                    H{h.number}
                  </div>,
                  editingStrokeIndexes ? (
                    <input
                      key={`si-${h.number}`}
                      type="number"
                      min={1}
                      max={18}
                      value={strokeIndexDrafts[h.number] ?? ""}
                      onChange={(e) =>
                        setStrokeIndexDrafts((d) => ({
                          ...d,
                          [h.number]: e.target.value,
                        }))
                      }
                      className="w-full rounded-lg border border-gray-200 px-1 py-1.5 text-center text-xs text-gray-800 focus:outline-none focus:ring-1 focus:ring-green-500"
                    />
                  ) : (
                    <div
                      key={`si-${h.number}`}
                      className="flex items-center justify-center rounded-lg border border-gray-100 px-1 py-1.5 text-center font-medium text-gray-800"
                    >
                      {strokeIndexDrafts[h.number] ?? h.strokeIndex}
                    </div>
                  ),
                ])}
              </div>
            </div>
          )}

          {/* Save to Corrections Library */}
          {round.teeSetId && (
            <div className="border-t border-gray-100 pt-5 space-y-2">
              <div>
                <p className="text-sm font-semibold text-gray-800">
                  Save as Course Corrections
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Saves the current Course Rating, Slope, and all hole Stroke
                  Indexes as permanent corrections for this tee set. Next time
                  you select this course, you&apos;ll be offered these values.
                </p>
              </div>
              {correctionLibrarySaved && (
                <div className="rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-700">
                  Corrections saved — they&apos;ll be offered next time this tee
                  set is selected.
                </div>
              )}
              <button
                type="button"
                onClick={saveToCorrectionsLibrary}
                disabled={savingCorrectionLibrary}
                className="w-full rounded-xl border border-green-200 bg-green-50 py-2.5 text-sm font-semibold text-green-700 transition-colors hover:bg-green-100 disabled:text-green-400"
              >
                {savingCorrectionLibrary
                  ? "Saving…"
                  : "Save as course corrections"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
