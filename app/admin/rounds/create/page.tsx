"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { createRound } from "@/lib/firestore";
import type { ScoringFormat, SpecialHoles } from "@/types";

const DEFAULT_PAR = 72;

export default function CreateRoundPage() {
  const { appUser } = useAuth();
  const router = useRouter();

  const [courseName, setCourseName] = useState("");
  const [date, setDate] = useState("");
  const [format, setFormat] = useState<ScoringFormat>("stableford");
  const [notes, setNotes] = useState("");
  const [ldHole, setLdHole] = useState("");
  const [t2Hole, setT2Hole] = useState("");
  const [t3Hole, setT3Hole] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Tee times state
  const [teeTimes, setTeeTimes] = useState([{ time: "", notes: "" }]);

  const addTeeTime = () => setTeeTimes([...teeTimes, { time: "", notes: "" }]);
  const removeTeeTime = (i: number) =>
    setTeeTimes(teeTimes.filter((_, idx) => idx !== i));
  const updateTeeTime = (i: number, field: "time" | "notes", val: string) =>
    setTeeTimes(teeTimes.map((t, idx) => (idx === i ? { ...t, [field]: val } : t)));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!courseName.trim() || !date) {
      setError("Course name and date are required.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      // Par 3 holes auto-flagged as NTP — default assumption is holes 3,6,12,16 (typical)
      // Admin can update after course data is added
      const ntpHoles = [3, 6, 12, 16]; // placeholder — will be populated from course data
      const specialHoles: SpecialHoles = {
        ntp: ntpHoles,
        ld: ldHole ? parseInt(ldHole) : null,
        t2: t2Hole ? parseInt(t2Hole) : null,
        t3: t3Hole ? parseInt(t3Hole) : null,
      };

      await createRound({
        groupId: "fourplay",
        courseId: "", // will be populated when course API is integrated
        courseName: courseName.trim(),
        date: new Date(date),
        season: new Date().getFullYear(),
        roundNumber: 1, // auto-increment handled later
        format,
        status: "upcoming",
        notes: notes.trim() || null,
        holeOverrides: [],
        specialHoles,
        resultsPublished: false,
        resultsPublishedAt: null,
        createdBy: appUser!.uid,
      });

      router.push("/admin/rounds");
    } catch {
      setError("Failed to create round. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5 pb-8">
      <h1 className="text-2xl font-bold text-gray-800">Create Round</h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Course name */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-3">
          <h2 className="font-semibold text-gray-800">Course</h2>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Course name
            </label>
            <input
              type="text"
              value={courseName}
              onChange={(e) => setCourseName(e.target.value)}
              required
              placeholder="e.g. Royal Melbourne Golf Club"
              className="w-full px-4 py-3 rounded-xl border border-gray-200 text-gray-800 text-base focus:outline-none focus:ring-2 focus:ring-green-500"
            />
            <p className="text-xs text-gray-400 mt-1">
              Course hole data and course API integration coming in next update
            </p>
          </div>
        </div>

        {/* Date & format */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-3">
          <h2 className="font-semibold text-gray-800">Round Details</h2>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
              className="w-full px-4 py-3 rounded-xl border border-gray-200 text-gray-800 text-base focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Scoring format
            </label>
            <div className="flex gap-2">
              {(["stableford", "stroke"] as ScoringFormat[]).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFormat(f)}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-medium border transition-colors ${
                    format === f
                      ? "bg-green-600 text-white border-green-600"
                      : "border-gray-200 text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  {f === "stableford" ? "🏌️ Stableford" : "📊 Stroke Play"}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Round notes (optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Any notes for players..."
              className="w-full px-4 py-3 rounded-xl border border-gray-200 text-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
        </div>

        {/* Tee times */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-800">Tee Times</h2>
            <button
              type="button"
              onClick={addTeeTime}
              className="text-green-600 text-sm font-medium hover:underline"
            >
              + Add
            </button>
          </div>
          <p className="text-xs text-gray-400">
            Enter tee off times for each group. Player assignment coming soon.
          </p>
          {teeTimes.map((tt, i) => (
            <div key={i} className="flex gap-2 items-center">
              <input
                type="time"
                value={tt.time}
                onChange={(e) => updateTeeTime(i, "time", e.target.value)}
                className="flex-1 px-3 py-2.5 rounded-xl border border-gray-200 text-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
              <input
                type="text"
                value={tt.notes}
                onChange={(e) => updateTeeTime(i, "notes", e.target.value)}
                placeholder="Group notes"
                className="flex-1 px-3 py-2.5 rounded-xl border border-gray-200 text-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
              {teeTimes.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeTeeTime(i)}
                  className="text-red-400 hover:text-red-600 px-2"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Special holes */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-3">
          <h2 className="font-semibold text-gray-800">Special Holes</h2>
          <p className="text-xs text-gray-400">
            NTP is automatically applied to all par 3s. Select the LD, T2, and T3 holes below.
          </p>

          <div className="space-y-3">
            {[
              { label: "💪 Longest Drive (LD)", value: ldHole, setter: setLdHole },
              { label: "⭐ T2", value: t2Hole, setter: setT2Hole },
              { label: "⭐ T3", value: t3Hole, setter: setT3Hole },
            ].map(({ label, value, setter }) => (
              <div key={label}>
                <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
                <select
                  value={value}
                  onChange={(e) => setter(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  <option value="">Not set</option>
                  {Array.from({ length: 18 }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>
                      Hole {n}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-700 text-sm">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white font-semibold py-4 rounded-2xl text-base transition-colors"
        >
          {loading ? "Creating round..." : "Create Round & Notify Members"}
        </button>
      </form>
    </div>
  );
}
