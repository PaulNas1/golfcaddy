"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { format } from "date-fns";
import { getRound, updateRound } from "@/lib/firestore";
import type { Round, RoundStatus } from "@/types";

export default function AdminRoundDetailPage() {
  const { roundId } = useParams<{ roundId: string }>();
  const [round, setRound] = useState<Round | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState("");

  useEffect(() => {
    if (roundId) {
      getRound(roundId).then((r) => {
        setRound(r);
        setLoading(false);
      });
    }
  }, [roundId]);

  const setStatus = async (status: RoundStatus) => {
    if (!round) return;
    setSaving(true);
    await updateRound(round.id, { status });
    setRound({ ...round, status });
    setSuccess(`Round marked as ${status}`);
    setSaving(false);
    setTimeout(() => setSuccess(""), 3000);
  };

  const addHoleOverride = async (
    holeNumber: number,
    overridePar: number,
    reason: string
  ) => {
    if (!round) return;
    setSaving(true);
    const override = {
      holeNumber,
      originalPar: 4, // default — will be from course data
      overridePar,
      reason,
      overriddenAt: new Date(),
    };
    const updated = [...round.holeOverrides, override];
    await updateRound(round.id, { holeOverrides: updated });
    setRound({ ...round, holeOverrides: updated });
    setSuccess("Hole par updated. Members will be notified.");
    setSaving(false);
    setTimeout(() => setSuccess(""), 3000);
  };

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 bg-gray-200 rounded w-2/3" />
        <div className="bg-white rounded-2xl p-4 h-32 bg-gray-100" />
      </div>
    );
  }

  if (!round) {
    return <p className="text-gray-400 text-sm">Round not found.</p>;
  }

  return (
    <div className="space-y-4 pb-8">
      <div>
        <div className="text-xs text-gray-500 mb-1">
          Round {round.roundNumber} · {round.season}
        </div>
        <h1 className="text-xl font-bold text-gray-800">{round.courseName}</h1>
        <p className="text-gray-500 text-sm">{format(round.date, "EEE d MMM yyyy")}</p>
      </div>

      {success && (
        <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-green-700 text-sm">
          ✅ {success}
        </div>
      )}

      {/* Round status controls */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-3">
        <h2 className="font-semibold text-gray-800">Round Status</h2>
        <div className="flex gap-2">
          {(["upcoming", "live", "completed"] as RoundStatus[]).map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              disabled={saving || round.status === s}
              className={`flex-1 py-2.5 rounded-xl text-xs font-semibold border transition-colors ${
                round.status === s
                  ? s === "live"
                    ? "bg-red-500 text-white border-red-500"
                    : "bg-gray-800 text-white border-gray-800"
                  : "border-gray-200 text-gray-600 hover:bg-gray-50"
              }`}
            >
              {s === "live" ? "● Live" : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-400">
          Setting to &quot;Live&quot; opens scoring and notifies all members. &quot;Completed&quot; closes scoring.
        </p>
      </div>

      {/* Override hole par */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-3">
        <h2 className="font-semibold text-gray-800">Override Hole Par</h2>
        <p className="text-xs text-gray-500">
          Change a hole&apos;s par for this round only (e.g. GUR). All players are notified instantly.
        </p>
        <HoleOverrideForm onSubmit={addHoleOverride} disabled={saving} />

        {round.holeOverrides.length > 0 && (
          <div className="mt-3 space-y-2">
            <p className="text-xs font-medium text-gray-600">Current overrides:</p>
            {round.holeOverrides.map((o) => (
              <div
                key={o.holeNumber}
                className="bg-amber-50 rounded-xl px-3 py-2 text-sm text-amber-800"
              >
                Hole {o.holeNumber}: Par {o.originalPar} → {o.overridePar}
                {o.reason && <span className="text-amber-600"> ({o.reason})</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quick info */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-2">
        <h2 className="font-semibold text-gray-800 mb-2">Round Info</h2>
        <InfoRow label="Format" value={round.format === "stableford" ? "Stableford" : "Stroke Play"} />
        <InfoRow label="NTP holes" value={round.specialHoles.ntp.join(", ") || "None set"} />
        <InfoRow label="LD hole" value={round.specialHoles.ld?.toString() || "None set"} />
        <InfoRow label="T2 hole" value={round.specialHoles.t2?.toString() || "None set"} />
        <InfoRow label="T3 hole" value={round.specialHoles.t3?.toString() || "None set"} />
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-gray-500">{label}</span>
      <span className="font-medium text-gray-800">{value}</span>
    </div>
  );
}

function HoleOverrideForm({
  onSubmit,
  disabled,
}: {
  onSubmit: (hole: number, par: number, reason: string) => void;
  disabled: boolean;
}) {
  const [hole, setHole] = useState("");
  const [par, setPar] = useState("");
  const [reason, setReason] = useState("");

  const handle = () => {
    if (!hole || !par) return;
    onSubmit(parseInt(hole), parseInt(par), reason);
    setHole("");
    setPar("");
    setReason("");
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <select
          value={hole}
          onChange={(e) => setHole(e.target.value)}
          className="flex-1 px-3 py-2.5 rounded-xl border border-gray-200 text-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
        >
          <option value="">Hole</option>
          {Array.from({ length: 18 }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>Hole {n}</option>
          ))}
        </select>
        <select
          value={par}
          onChange={(e) => setPar(e.target.value)}
          className="flex-1 px-3 py-2.5 rounded-xl border border-gray-200 text-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
        >
          <option value="">New par</option>
          {[3, 4, 5].map((n) => (
            <option key={n} value={n}>Par {n}</option>
          ))}
        </select>
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
        Apply Override & Notify Members
      </button>
    </div>
  );
}
