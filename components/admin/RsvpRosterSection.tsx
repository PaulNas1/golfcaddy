"use client";

import { useMemo, useState } from "react";
import { createNotificationsForUsers, setRoundRsvp } from "@/lib/firestore";
import type { AppUser, Round, RoundRsvp, RoundRsvpStatus } from "@/types";

type Props = {
  round: Round;
  members: AppUser[];
  rsvps: RoundRsvp[];
  appUser: AppUser | null;
  onSuccess: (message: string) => void;
};

const STATUS_BADGES: Record<
  RoundRsvpStatus,
  { label: string; className: string }
> = {
  accepted: {
    label: "In",
    className: "bg-brand-50 text-brand-700 border border-brand-200",
  },
  declined: {
    label: "Out",
    className: "bg-red-50 text-red-700 border border-red-200",
  },
  pending: {
    label: "Pending",
    className: "bg-surface-muted text-ink-muted border border-surface-overlay",
  },
};

export default function RsvpRosterSection({
  round,
  members,
  rsvps,
  appUser,
  onSuccess,
}: Props) {
  const [busyMemberId, setBusyMemberId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const rsvpsByMemberId = useMemo(
    () => new Map(rsvps.map((r) => [r.memberId, r])),
    [rsvps]
  );

  const roster = useMemo(
    () =>
      [...members]
        .sort((a, b) => a.displayName.localeCompare(b.displayName))
        .map((member) => ({
          member,
          rsvp: rsvpsByMemberId.get(member.uid) ?? null,
        })),
    [members, rsvpsByMemberId]
  );

  const counts = useMemo(() => {
    let accepted = 0;
    let declined = 0;
    roster.forEach(({ rsvp }) => {
      if (rsvp?.status === "accepted") accepted += 1;
      else if (rsvp?.status === "declined") declined += 1;
    });
    return { accepted, declined, pending: roster.length - accepted - declined };
  }, [roster]);

  const locked = round.resultsPublished;

  const handleSetStatus = async (
    member: AppUser,
    status: Exclude<RoundRsvpStatus, "pending">
  ) => {
    if (!appUser || locked) return;
    setBusyMemberId(member.uid);
    setError("");
    try {
      await setRoundRsvp({ round, member, status, respondedBy: appUser });
      if (member.uid !== appUser.uid) {
        await createNotificationsForUsers({
          recipientUserIds: [member.uid],
          groupId: round.groupId,
          type: "change_alert",
          title:
            status === "accepted"
              ? "You've been marked as playing"
              : "You've been marked as not playing",
          body: `${appUser.displayName} set your RSVP to "${
            status === "accepted" ? "Going" : "Not going"
          }" for Round ${round.roundNumber} at ${round.courseName}.`,
          deepLink: `/rounds/${round.id}`,
          roundId: round.id,
        });
      }
      onSuccess(
        `${member.displayName} marked as ${
          status === "accepted" ? "going" : "not going"
        }`
      );
    } catch {
      setError("Failed to update RSVP. Please try again.");
    } finally {
      setBusyMemberId(null);
    }
  };

  return (
    <div className="bg-surface-card rounded-2xl shadow-sm border border-surface-overlay p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold text-ink-title">RSVPs</h2>
        <span className="text-xs text-ink-muted">
          {counts.accepted} in · {counts.declined} out · {counts.pending}{" "}
          pending
        </span>
      </div>

      <p className="text-xs text-ink-hint">
        {locked
          ? "Results are published — RSVPs are locked."
          : round.rsvpOpen
            ? "Respond on a player's behalf if you know their plans. Accepted players become assignable to tee-time groups above, and the player is notified."
            : "RSVP isn't open yet. You can still set responses manually — use Save & Notify Players above to invite the rest of the group."}
      </p>

      {error && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
          {error}
        </p>
      )}

      <ul className="divide-y divide-surface-overlay">
        {roster.map(({ member, rsvp }) => {
          const status: RoundRsvpStatus = rsvp?.status ?? "pending";
          const badge = STATUS_BADGES[status];
          const busy = busyMemberId === member.uid;
          const setByOther =
            rsvp?.respondedById != null &&
            rsvp.respondedById !== member.uid &&
            status !== "pending";
          return (
            <li
              key={member.uid}
              className="flex items-center justify-between gap-3 py-2.5"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink-body truncate">
                  {member.displayName}
                </p>
                {setByOther && (
                  <p className="text-[11px] text-ink-hint">
                    Set by {rsvp?.respondedByName ?? "an admin"}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span
                  className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${badge.className}`}
                >
                  {badge.label}
                </span>
                {!locked && (
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => handleSetStatus(member, "accepted")}
                      disabled={busy || status === "accepted"}
                      className="rounded-lg border border-brand-600 px-2.5 py-1 text-xs font-semibold text-brand-700 transition-colors hover:bg-brand-50 disabled:border-surface-overlay disabled:text-ink-hint"
                    >
                      {busy ? "…" : "Going"}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSetStatus(member, "declined")}
                      disabled={busy || status === "declined"}
                      className="rounded-lg border border-surface-overlay px-2.5 py-1 text-xs font-semibold text-ink-body transition-colors hover:bg-surface-muted disabled:text-ink-hint"
                    >
                      {busy ? "…" : "Not going"}
                    </button>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {roster.length === 0 && (
        <p className="text-xs text-ink-hint">No active members found.</p>
      )}
    </div>
  );
}
