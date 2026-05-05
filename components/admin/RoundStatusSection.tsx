"use client";

import type { Round, RoundStatus } from "@/types";

type Props = {
  round: Round;
  saving: boolean;
  onSetStatus: (status: RoundStatus) => void;
  onSendScoreReminder: () => void;
};

export default function RoundStatusSection({
  round,
  saving,
  onSetStatus,
  onSendScoreReminder,
}: Props) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold text-gray-800">Round Status</h2>
        {round.resultsPublished && (
          <span className="rounded-full bg-gray-800 px-3 py-1 text-xs font-semibold text-white">
            Completed
          </span>
        )}
      </div>

      {!round.resultsPublished && (
        <>
          <div className="flex gap-2">
            {(["upcoming", "live"] as RoundStatus[]).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => onSetStatus(s)}
                disabled={saving || round.status === s}
                className={`flex-1 py-2.5 rounded-xl text-xs font-semibold border transition-colors ${
                  round.status === s
                    ? s === "live"
                      ? "bg-red-500 text-white border-red-500"
                      : "bg-gray-800 text-white border-gray-800"
                    : "border-gray-200 text-gray-600 hover:bg-gray-50"
                }`}
              >
                {s === "live" ? "● Live" : "Upcoming"}
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-400">
            Setting to Live opens scoring and notifies all members. Round is
            marked Completed automatically when you publish results below.
          </p>
        </>
      )}

      {round.status === "live" && (
        <button
          type="button"
          onClick={onSendScoreReminder}
          disabled={saving}
          className="w-full rounded-xl border border-gray-200 bg-white py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:text-gray-300"
        >
          {saving ? "Sending..." : "Send score reminder"}
        </button>
      )}
    </div>
  );
}
