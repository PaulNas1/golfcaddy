"use client";

import { useEffect, useMemo, useState } from "react";
import { formatShortMemberName, getTeeTimeGroupLabel } from "@/lib/teeTimes";
import type { AppUser } from "@/types";

export type TeeTimeDraftValue = {
  time: string;
  notes: string;
  playerIds: string[];
  guestNames: string[];
};

type TeeTimesEditorProps = {
  teeTimes: TeeTimeDraftValue[];
  members: AppUser[];
  assignableMembers?: AppUser[];
  playersSummary?: string;
  emptyPlayersMessage: string;
  onRandomise: () => void;
  onAddTeeTime: () => void;
  onRemoveTeeTime: (index: number) => void;
  onUpdateTeeTimeTime: (index: number, value: string) => void;
  onAssignPlayer: (teeTimeIndex: number, member: AppUser) => void;
  onAddGuest: (teeTimeIndex: number) => void;
  onRemoveGuest: (teeTimeIndex: number, guestName: string) => void;
};

export default function TeeTimesEditor({
  teeTimes,
  members,
  assignableMembers,
  playersSummary,
  emptyPlayersMessage,
  onRandomise,
  onAddTeeTime,
  onRemoveTeeTime,
  onUpdateTeeTimeTime,
  onAssignPlayer,
  onAddGuest,
  onRemoveGuest,
}: TeeTimesEditorProps) {
  const [activeTeeTimeIndex, setActiveTeeTimeIndex] = useState<number | null>(0);
  const availableMembers = assignableMembers ?? members;

  useEffect(() => {
    if (teeTimes.length === 0) {
      setActiveTeeTimeIndex(null);
      return;
    }

    setActiveTeeTimeIndex((current) =>
      current == null ? current : Math.min(current, teeTimes.length - 1)
    );
  }, [teeTimes.length]);

  const assignedPlayerIndexById = useMemo(() => {
    const playerIndexMap = new Map<string, number>();

    teeTimes.forEach((teeTime, teeTimeIndex) => {
      teeTime.playerIds.forEach((playerId) => {
        playerIndexMap.set(playerId, teeTimeIndex);
      });
    });

    return playerIndexMap;
  }, [teeTimes]);

  const activeTeeTime =
    activeTeeTimeIndex == null ? null : teeTimes[activeTeeTimeIndex] ?? null;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-gray-800">Tee Times</h2>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onRandomise}
            className="text-green-700 text-sm font-medium hover:underline"
          >
            Randomise groups
          </button>
          <button
            type="button"
            onClick={onAddTeeTime}
            className="text-green-600 text-sm font-medium hover:underline"
          >
            + Add tee time
          </button>
        </div>
      </div>
      <p className="text-xs text-gray-400">
        Click a tee slot, then assign players from the full list below. Players
        can only belong to one tee time at a time.
      </p>
      {playersSummary && (
        <p className="text-xs text-green-700">{playersSummary}</p>
      )}

      <div className="space-y-3">
        {teeTimes.map((teeTime, index) => {
          const isActive = index === activeTeeTimeIndex;
          const groupLabel = getTeeTimeGroupLabel(
            teeTime.playerIds,
            teeTime.guestNames,
            members
          );
          const groupCount = teeTime.playerIds.length + teeTime.guestNames.length;

          return (
            <button
              key={index}
              type="button"
              onClick={() =>
                setActiveTeeTimeIndex((current) =>
                  current === index ? null : index
                )
              }
              className={`w-full rounded-xl border p-3 text-left transition-colors ${
                isActive
                  ? "border-green-300 bg-green-50"
                  : "border-gray-100 bg-gray-50 hover:border-gray-200"
              }`}
            >
              <div className="space-y-2">
                <div className="flex gap-2 items-center">
                  <input
                    type="time"
                    value={teeTime.time}
                    onChange={(event) =>
                      onUpdateTeeTimeTime(index, event.target.value)
                    }
                    onClick={(event) => event.stopPropagation()}
                    className="w-32 px-3 py-2.5 rounded-xl border border-gray-200 bg-white text-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                  <div
                    className={`flex-1 min-w-0 rounded-xl border px-3 py-2.5 text-sm ${
                      isActive
                        ? "border-green-300 bg-white text-gray-800"
                        : "border-gray-200 bg-white text-gray-800"
                    }`}
                  >
                    {groupLabel || "Tap this tee time, then choose players below"}
                  </div>
                </div>
                <div className="flex items-center justify-end gap-3">
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-gray-500">
                    {groupCount} player{groupCount === 1 ? "" : "s"}
                  </span>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onAddGuest(index);
                    }}
                    className="text-green-700 text-xs font-medium hover:underline"
                  >
                    Add guest
                  </button>
                  {teeTimes.length > 1 && (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onRemoveTeeTime(index);
                      }}
                      className="text-red-500 text-xs hover:underline"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>

              {(teeTime.guestNames.length > 0 || teeTime.playerIds.length > 0) && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {teeTime.playerIds.map((playerId) => {
                    const member = members.find((item) => item.uid === playerId);
                    if (!member) return null;

                    return (
                      <span
                        key={playerId}
                        className="rounded-lg border border-green-200 bg-white px-2.5 py-1 text-xs font-medium text-green-700"
                      >
                        {formatShortMemberName(member, members)}
                      </span>
                    );
                  })}
                  {teeTime.guestNames.map((guestName) => (
                    <button
                      key={guestName}
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onRemoveGuest(index, guestName);
                      }}
                      className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700"
                    >
                      {guestName} x
                    </button>
                  ))}
                </div>
              )}
            </button>
          );
        })}
      </div>

      <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-gray-800">
              {activeTeeTime && activeTeeTimeIndex != null
                ? `Assign players to tee time ${activeTeeTimeIndex + 1}`
                : "Assigned players"}
            </p>
            <p className="text-xs text-gray-500">
              {activeTeeTime?.time
                ? `Active slot: ${activeTeeTime.time}`
                : activeTeeTimeIndex != null
                ? `Active slot: Group ${activeTeeTimeIndex + 1}`
                : "Tap a tee time above to assign or move players."}
            </p>
          </div>
          {activeTeeTime && (
            <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-gray-500">
              {activeTeeTime.playerIds.length} player
              {activeTeeTime.playerIds.length === 1 ? "" : "s"}
            </span>
          )}
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {availableMembers.length === 0 && (
            <p className="text-[11px] text-gray-400">{emptyPlayersMessage}</p>
          )}
          {availableMembers.map((member) => {
            const assignedIndex = assignedPlayerIndexById.get(member.uid);
            const isAssignedToActive = assignedIndex === activeTeeTimeIndex;
            const isAssigned = assignedIndex !== undefined;
            const assignedLabel =
              assignedIndex !== undefined
                ? teeTimes[assignedIndex]?.time || `Group ${assignedIndex + 1}`
                : null;

            return (
              <button
                key={member.uid}
                type="button"
                onClick={() => {
                  if (activeTeeTimeIndex == null) return;
                  onAssignPlayer(activeTeeTimeIndex, member);
                }}
                disabled={activeTeeTimeIndex == null}
                className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
                  activeTeeTimeIndex != null && isAssignedToActive
                    ? "border-green-600 bg-green-600 text-white"
                    : isAssigned
                    ? "border-green-300 bg-green-50 text-green-700"
                    : activeTeeTimeIndex != null
                    ? "border-gray-200 bg-white text-gray-600 hover:border-green-300 hover:text-green-700"
                    : "border-gray-200 bg-white text-gray-400"
                }`}
              >
                {formatShortMemberName(member, members)}
                {assignedLabel ? ` · ${assignedLabel}` : ""}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
