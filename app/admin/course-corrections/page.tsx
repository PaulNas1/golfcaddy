"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import {
  deleteCourseCorrection,
  getCourseCorrectionsForGroup,
} from "@/lib/firestore";
import type { CourseCorrection } from "@/types";

export default function CourseCorrectionsPage() {
  const { appUser } = useAuth();
  const [corrections, setCorrections] = useState<CourseCorrection[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!appUser?.groupId) return;

    getCourseCorrectionsForGroup(appUser.groupId)
      .then(setCorrections)
      .catch(() => setError("Failed to load course corrections."))
      .finally(() => setLoading(false));
  }, [appUser?.groupId]);

  const handleDelete = async (correction: CourseCorrection) => {
    const confirmed = window.confirm(
      `Delete saved corrections for ${correction.courseName} — ${correction.teeSetName}? This cannot be undone.`
    );
    if (!confirmed) return;

    setDeleting(correction.teeSetId);
    setError("");
    try {
      await deleteCourseCorrection(appUser!.groupId, correction.teeSetId);
      setCorrections((current) =>
        current.filter((c) => c.teeSetId !== correction.teeSetId)
      );
    } catch {
      setError("Failed to delete correction.");
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="space-y-5 pb-8">
      <div>
        <Link
          href="/admin"
          className="text-xs text-gray-400 hover:text-gray-600"
        >
          ← Admin
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-gray-800">
          Course Corrections
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Saved corrections are offered when you select a matching course during
          round creation. Saving new corrections for the same tee set overwrites
          the previous entry.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="animate-pulse space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 rounded-2xl bg-gray-100" />
          ))}
        </div>
      ) : corrections.length === 0 ? (
        <div className="rounded-2xl border border-gray-100 bg-white p-8 text-center shadow-sm">
          <p className="text-sm font-medium text-gray-700">No saved corrections</p>
          <p className="mt-1 text-xs text-gray-400">
            Open a round, make corrections in the Course Corrections section,
            then tap &ldquo;Save as course corrections&rdquo;.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {corrections.map((correction) => {
            const siCorrected = correction.holeCorrections.length > 0;
            const ratingCorrected =
              correction.correctedCourseRating != null ||
              correction.correctedSlopeRating != null;

            return (
              <div
                key={correction.teeSetId}
                className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm space-y-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-800">
                      {correction.courseName}
                    </p>
                    <p className="text-xs text-gray-500">
                      Tee set: {correction.teeSetName}
                    </p>
                    <p className="mt-0.5 text-[11px] text-gray-400">
                      Saved by {correction.savedByName} ·{" "}
                      {correction.savedAt.toLocaleDateString("en-AU", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDelete(correction)}
                    disabled={deleting === correction.teeSetId}
                    className="shrink-0 rounded-lg border border-red-100 bg-white px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 disabled:text-red-300"
                  >
                    {deleting === correction.teeSetId ? "Deleting…" : "Delete"}
                  </button>
                </div>

                <div className="flex flex-wrap gap-2">
                  {correction.correctedCourseRating != null && (
                    <span className="rounded-full border border-green-100 bg-green-50 px-2 py-0.5 text-[11px] font-medium text-green-700">
                      Course Rating: {correction.correctedCourseRating}
                    </span>
                  )}
                  {correction.correctedSlopeRating != null && (
                    <span className="rounded-full border border-green-100 bg-green-50 px-2 py-0.5 text-[11px] font-medium text-green-700">
                      Slope: {correction.correctedSlopeRating}
                    </span>
                  )}
                  {siCorrected && (
                    <span className="rounded-full border border-blue-100 bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700">
                      {correction.holeCorrections.length} hole corrections
                    </span>
                  )}
                  {!ratingCorrected && !siCorrected && (
                    <span className="text-xs text-gray-400">No data</span>
                  )}
                </div>

                {correction.holeCorrections.length > 0 && (
                  <div className="grid grid-cols-6 gap-x-1.5 gap-y-1.5 text-[10px]">
                    {correction.holeCorrections.map((h) => (
                      <>
                        <div
                          key={`lbl-${h.holeNumber}`}
                          className="flex items-center justify-center rounded-lg bg-gray-50 px-1 py-1 font-semibold text-gray-500"
                        >
                          H{h.holeNumber}
                        </div>
                        <div
                          key={`si-${h.holeNumber}`}
                          className="flex items-center justify-center rounded-lg border border-gray-100 px-1 py-1 text-center font-medium text-gray-800"
                        >
                          {h.strokeIndex}
                        </div>
                      </>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
