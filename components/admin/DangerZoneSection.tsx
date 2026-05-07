"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteRoundCascade } from "@/lib/firestore";
import type { Round } from "@/types";

type Props = {
  round: Round;
  /** Prevent deletion while an unrelated save is in-flight. */
  saving: boolean;
};

export default function DangerZoneSection({ round, saving }: Props) {
  const router = useRouter();
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const handleDelete = async () => {
    if (deleteConfirm !== "DELETE") return;
    const confirmed = window.confirm(
      `Delete Round ${round.roundNumber} at ${round.courseName}? This permanently removes the round, scorecards, hole scores, official results, result feed posts, notifications, and round handicap history.`
    );
    if (!confirmed) return;

    setDeleting(true);
    setDeleteError("");
    try {
      await deleteRoundCascade(round.id);
      router.push("/admin/rounds");
    } catch (err) {
      console.error("Failed to delete round", err);
      const message =
        err instanceof Error && err.message ? err.message : "Please try again.";
      setDeleteError(`Failed to delete round. ${message}`);
      setDeleting(false);
    }
  };

  return (
    <div className="bg-surface-card rounded-2xl shadow-sm border border-red-100 p-4 space-y-3">
      <div>
        <h2 className="font-semibold text-red-700">Delete Round</h2>
        <p className="mt-1 text-xs text-ink-muted">
          Permanently removes this round and all linked scorecards, hole scores,
          official results, result feed posts, notifications, and round handicap
          history. Season standings and member stats are rebuilt from the
          remaining published results.
        </p>
      </div>

      {deleteError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {deleteError}
        </div>
      )}

      <div>
        <label className="block text-xs font-medium text-ink-body mb-1">
          Type DELETE to confirm
        </label>
        <input
          type="text"
          value={deleteConfirm}
          onChange={(e) => setDeleteConfirm(e.target.value)}
          className="w-full px-3 py-2.5 rounded-xl border border-surface-overlay text-sm text-ink-title focus:outline-none focus:ring-2 focus:ring-red-500"
        />
      </div>

      <button
        type="button"
        onClick={handleDelete}
        disabled={deleting || saving || deleteConfirm !== "DELETE"}
        className="w-full rounded-xl bg-red-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:bg-red-300"
      >
        {deleting ? "Deleting round..." : "Delete entire round"}
      </button>
    </div>
  );
}
