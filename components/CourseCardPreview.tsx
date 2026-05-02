"use client";

import { useState } from "react";
import type { CourseHole, DistanceUnit } from "@/types";

type SpecialHoles = {
  ntp: number[];
  ld: number | null;
  t2: number | null;
  t3: number | null;
};

function specialLabel(holeNumber: number, special?: SpecialHoles): string {
  if (!special) return "";
  const markers: string[] = [];
  if (special.ntp.includes(holeNumber)) markers.push("NTP");
  if (special.ld === holeNumber) markers.push("LD");
  if (special.t2 === holeNumber) markers.push("T2");
  if (special.t3 === holeNumber) markers.push("T3");
  return markers.join(" · ");
}

function fmtDist(meters: number | undefined, unit: DistanceUnit): string {
  if (meters == null || meters === 0) return "—";
  if (unit === "yards") return `${Math.round(meters / 0.9144)}y`;
  return `${meters}m`;
}

function sumDist(holes: CourseHole[], unit: DistanceUnit): string {
  if (holes.some((h) => !h.distanceMeters)) return "—";
  const totalM = holes.reduce((s, h) => s + (h.distanceMeters ?? 0), 0);
  if (unit === "yards") return `${Math.round(totalM / 0.9144)}y`;
  return `${totalM}m`;
}

function HoleRow({
  hole,
  special,
  unit,
  shaded,
}: {
  hole: CourseHole;
  special?: SpecialHoles;
  unit: DistanceUnit;
  shaded: boolean;
}) {
  const label = specialLabel(hole.number, special);
  return (
    <tr className={shaded ? "bg-gray-50" : "bg-white"}>
      <td className="px-3 py-2 font-semibold text-gray-700 text-xs">
        {hole.number}
        {label && (
          <span className="ml-1.5 text-[10px] font-bold text-green-600">
            {label}
          </span>
        )}
      </td>
      <td className="px-2 py-2 text-center text-xs text-gray-700">{hole.par}</td>
      <td className="px-2 py-2 text-center text-xs text-gray-500">{hole.strokeIndex}</td>
      <td className="px-3 py-2 text-right text-xs text-gray-500">
        {fmtDist(hole.distanceMeters, unit)}
      </td>
    </tr>
  );
}

function SubtotalRow({
  label,
  holes,
  unit,
}: {
  label: string;
  holes: CourseHole[];
  unit: DistanceUnit;
}) {
  const par = holes.reduce((s, h) => s + h.par, 0);
  return (
    <tr className="bg-green-700 text-white">
      <td className="px-3 py-1.5 text-[11px] font-bold">{label}</td>
      <td className="px-2 py-1.5 text-center text-[11px] font-bold">{par}</td>
      <td className="px-2 py-1.5" />
      <td className="px-3 py-1.5 text-right text-[11px] font-bold">
        {sumDist(holes, unit)}
      </td>
    </tr>
  );
}

function TotalRow({ holes, unit }: { holes: CourseHole[]; unit: DistanceUnit }) {
  const par = holes.reduce((s, h) => s + h.par, 0);
  return (
    <tr className="bg-gray-800 text-white">
      <td className="px-3 py-2 text-xs font-bold">Total</td>
      <td className="px-2 py-2 text-center text-xs font-bold">{par}</td>
      <td className="px-2 py-2" />
      <td className="px-3 py-2 text-right text-xs font-bold">
        {sumDist(holes, unit)}
      </td>
    </tr>
  );
}

export function CourseCardPreview({
  holes,
  distanceUnit = "meters",
  specialHoles,
  note,
  teeSetName,
  defaultOpen = false,
}: {
  holes: CourseHole[];
  distanceUnit?: DistanceUnit;
  specialHoles?: SpecialHoles;
  note?: string;
  teeSetName?: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  if (holes.length !== 18) return null;

  const front9 = holes.slice(0, 9);
  const back9 = holes.slice(9, 18);
  const totalPar = holes.reduce((s, h) => s + h.par, 0);

  return (
    <div className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <span className="shrink-0 font-semibold text-gray-800 text-sm">Course Card</span>
          {teeSetName && (
            <span className="truncate text-xs text-gray-400">{teeSetName}</span>
          )}
        </div>
        <span className="shrink-0 text-gray-400 text-xs flex items-center gap-1">
          {open ? "Hide" : `Par ${totalPar} · tap to view`}
          <svg
            className={`w-4 h-4 transition-transform ${open ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </span>
      </button>

      {open && (
        <div className="border-t border-gray-100">
          {note && (
            <p className="px-4 py-2 text-[11px] text-amber-700 bg-amber-50 border-b border-amber-100">
              ℹ️ {note}
            </p>
          )}
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-gray-100 text-gray-500">
                  <th className="px-3 py-2 text-left text-[11px] font-semibold w-20">Hole</th>
                  <th className="px-2 py-2 text-center text-[11px] font-semibold w-12">Par</th>
                  <th className="px-2 py-2 text-center text-[11px] font-semibold w-12">SI</th>
                  <th className="px-3 py-2 text-right text-[11px] font-semibold">
                    Dist ({distanceUnit === "yards" ? "yds" : "m"})
                  </th>
                </tr>
              </thead>
              <tbody>
                {front9.map((hole) => (
                  <HoleRow
                    key={hole.number}
                    hole={hole}
                    special={specialHoles}
                    unit={distanceUnit}
                    shaded={hole.number % 2 === 0}
                  />
                ))}
              </tbody>
              <tbody>
                <SubtotalRow label="Out" holes={front9} unit={distanceUnit} />
              </tbody>
              <tbody>
                {back9.map((hole) => (
                  <HoleRow
                    key={hole.number}
                    hole={hole}
                    special={specialHoles}
                    unit={distanceUnit}
                    shaded={hole.number % 2 === 0}
                  />
                ))}
              </tbody>
              <tbody>
                <SubtotalRow label="In" holes={back9} unit={distanceUnit} />
                <TotalRow holes={holes} unit={distanceUnit} />
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
