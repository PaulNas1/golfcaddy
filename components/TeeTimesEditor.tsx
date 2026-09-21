"use client";

import { useEffect, useMemo, useState } from "react";
import { formatShortMemberName } from "@/lib/teeTimes";
import type { AppUser } from "@/types";

// ─── Groups (Brief 2 §4) ────────────────────────────────────────────────────
//
// One name per object. A slot was previously "tee time 1", "Group 1" and
// "Active slot: 07:00" within about 100px of each other; it is now a **Group**,
// numbered, with its time as the subtitle, everywhere.
//
// The instruction text that used to sit inside the slot — where player chips
// belong, and which persisted even when the slot was already selected — is
// gone. A group shows an empty state or chips, never both.
//
// Removing a player is an × on their chip. The old press-and-hold gesture
// needed a written sentence to be discoverable at all, which is the tell that
// it was the wrong control.

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
  onRemovePlayer: (teeTimeIndex: number, member: AppUser) => void;
  onAddGuest: (teeTimeIndex: number, guestName: string) => void;
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
  onRemovePlayer,
  onAddGuest,
  onRemoveGuest,
}: TeeTimesEditorProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(0);
  const [guestInputIndex, setGuestInputIndex] = useState<number | null>(null);
  const [guestInputValue, setGuestInputValue] = useState("");
  const availableMembers = assignableMembers ?? members;

  useEffect(() => {
    if (teeTimes.length === 0) {
      setActiveIndex(null);
      return;
    }
    setActiveIndex((current) =>
      current == null ? current : Math.min(current, teeTimes.length - 1)
    );
  }, [teeTimes.length]);

  const confirmGuest = (index: number) => {
    const trimmed = guestInputValue.trim();
    if (trimmed) onAddGuest(index, trimmed);
    setGuestInputIndex(null);
    setGuestInputValue("");
  };

  const groupIndexByPlayerId = useMemo(() => {
    const map = new Map<string, number>();
    teeTimes.forEach((teeTime, index) => {
      teeTime.playerIds.forEach((playerId) => map.set(playerId, index));
    });
    return map;
  }, [teeTimes]);

  const activeGroup = activeIndex == null ? null : teeTimes[activeIndex] ?? null;

  return (
    <div className="space-y-3 rounded-2xl border border-surface-overlay bg-surface-card p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold text-ink-title">Groups</h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onRandomise}
            className="rounded-lg border border-surface-overlay px-2.5 py-1.5 text-xs font-medium text-ink-muted transition-colors hover:border-ink-muted"
          >
            ⇄ Randomise
          </button>
          <button
            type="button"
            onClick={onAddTeeTime}
            className="rounded-lg bg-brand-600 px-2.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-brand-500"
          >
            + Add group
          </button>
        </div>
      </div>

      {playersSummary && (
        <p className="text-xs text-ink-action">{playersSummary}</p>
      )}

      <div className="space-y-3">
        {teeTimes.map((teeTime, index) => {
          const isActive = index === activeIndex;
          const playerCount = teeTime.playerIds.length + teeTime.guestNames.length;
          const isEmpty = playerCount === 0;

          return (
            <div
              key={index}
              className={`rounded-xl border p-3 transition-colors ${
                isActive
                  ? "border-surface-selectedBorder bg-surface-selected"
                  : "border-surface-overlay bg-surface-muted"
              }`}
            >
              {/* Identity: Group N, with the time as its subtitle */}
              <div className="flex items-start justify-between gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setActiveIndex((current) => (current === index ? null : index))
                  }
                  className="min-w-0 flex-1 text-left"
                >
                  <span className="block text-sm font-semibold text-ink-title">
                    Group {index + 1}
                    {isActive && (
                      <span className="ml-2 rounded-full bg-brand-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand-800">
                        Selected
                      </span>
                    )}
                  </span>
                  <span className="block text-xs text-ink-muted">
                    {playerCount} player{playerCount === 1 ? "" : "s"}
                  </span>
                </button>

                <input
                  type="time"
                  value={teeTime.time}
                  onChange={(event) => onUpdateTeeTimeTime(index, event.target.value)}
                  aria-label={`Group ${index + 1} tee time`}
                  className="w-28 shrink-0 rounded-xl border border-surface-overlay bg-surface-card px-2 py-2 text-sm text-ink-title focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>

              {/* Members: an empty state OR chips — never both */}
              <div className="mt-2">
                {isEmpty ? (
                  <p className="rounded-lg border border-dashed border-surface-overlay px-3 py-2 text-xs text-ink-hint">
                    {isActive ? "Pick players below" : "Empty"}
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {teeTime.playerIds.map((playerId) => {
                      const member = members.find((item) => item.uid === playerId);
                      if (!member) return null;
                      return (
                        <span
                          key={playerId}
                          className="inline-flex items-center gap-1 rounded-lg border border-brand-200 bg-surface-card px-2 py-1 text-xs font-medium text-ink-action dark:border-brand-700"
                        >
                          {formatShortMemberName(member, members)}
                          <button
                            type="button"
                            onClick={() => onRemovePlayer(index, member)}
                            aria-label={`Remove ${member.displayName} from Group ${index + 1}`}
                            className="text-ink-muted transition-colors hover:text-red-500"
                          >
                            ×
                          </button>
                        </span>
                      );
                    })}
                    {teeTime.guestNames.map((guestName) => (
                      <span
                        key={guestName}
                        className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300"
                      >
                        {guestName}
                        <button
                          type="button"
                          onClick={() => onRemoveGuest(index, guestName)}
                          aria-label={`Remove guest ${guestName} from Group ${index + 1}`}
                          className="transition-colors hover:text-red-500"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="mt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setGuestInputIndex(index);
                    setGuestInputValue("");
                  }}
                  className="text-xs text-ink-muted transition-colors hover:text-ink-action"
                >
                  Add guest
                </button>
                {teeTimes.length > 1 && (
                  <button
                    type="button"
                    onClick={() => onRemoveTeeTime(index)}
                    className="text-xs text-red-500 hover:underline"
                  >
                    Remove group
                  </button>
                )}
              </div>

              {guestInputIndex === index && (
                <div className="mt-2 space-y-2">
                  <input
                    // eslint-disable-next-line jsx-a11y/no-autofocus
                    autoFocus
                    type="text"
                    value={guestInputValue}
                    onChange={(event) => setGuestInputValue(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        confirmGuest(index);
                      } else if (event.key === "Escape") {
                        setGuestInputIndex(null);
                        setGuestInputValue("");
                      }
                    }}
                    placeholder="Guest name"
                    className="w-full rounded-lg border border-surface-overlay bg-surface-card px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => confirmGuest(index)}
                      className="flex-1 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white"
                    >
                      Add
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setGuestInputIndex(null);
                        setGuestInputValue("");
                      }}
                      className="flex-1 rounded-lg border border-surface-overlay px-3 py-1.5 text-xs font-medium text-ink-muted"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Player picker — targets whichever group is selected */}
      <div className="rounded-xl border border-surface-overlay bg-surface-muted p-3">
        <p className="text-sm font-semibold text-ink-title">
          {activeIndex == null
            ? "Select a group above"
            : `Add to Group ${activeIndex + 1}`}
          {activeGroup?.time ? (
            <span className="ml-1 font-normal text-ink-muted">
              · {activeGroup.time}
            </span>
          ) : null}
        </p>

        <div className="mt-3 flex flex-wrap gap-2">
          {availableMembers.length === 0 && (
            <p className="text-xs text-ink-hint">{emptyPlayersMessage}</p>
          )}
          {availableMembers.map((member) => {
            const assignedIndex = groupIndexByPlayerId.get(member.uid);
            const isAssigned = assignedIndex !== undefined;
            const isInActiveGroup = assignedIndex === activeIndex;

            return (
              <button
                key={member.uid}
                type="button"
                onClick={() => {
                  if (activeIndex == null) return;
                  onAssignPlayer(activeIndex, member);
                }}
                disabled={activeIndex == null}
                className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
                  activeIndex != null && isInActiveGroup
                    ? "border-brand-600 bg-brand-600 text-white"
                    : isAssigned
                    ? "border-surface-selectedBorder bg-surface-selected text-ink-action"
                    : activeIndex != null
                    ? "border-surface-overlay bg-surface-card text-ink-body hover:border-surface-selectedBorder hover:text-ink-action"
                    : "border-surface-overlay bg-surface-card text-ink-hint"
                }`}
              >
                {formatShortMemberName(member, members)}
                {isAssigned ? ` · Group ${assignedIndex! + 1}` : ""}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
