"use client";

import { useMemo, useState } from "react";
import {
  clearRoundRsvp,
  createNotificationsForUsers,
  setRoundRsvp,
} from "@/lib/firestore";
import type { AppUser, Round, RoundRsvp, RoundRsvpStatus } from "@/types";

type Props = {
  round: Round;
  members: AppUser[];
  rsvps: RoundRsvp[];
  appUser: AppUser | null;
  onSuccess: (message: string) => void;
};

export default function RsvpRosterSection({
  round,
  members,
  rsvps,
  appUser,
  onSuccess,
}: Props) {
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

  const handleToggleStatus = async (
    member: AppUser,
    target: Exclude<RoundRsvpStatus, "pending">,
    existingRsvp: RoundRsvp | null
  ) => {
    if (!appUser || locked) return;
    // Clicking the already-selected status clears the response back to
    // pending (undo an accidental tap); otherwise set the new status.
    const clearing = existingRsvp?.status === target;
    setError("");
    // The write is not awaited before updating the UI: Firestore's local
    // cache reflects the change to this page's live subscription instantly,
    // so the highlight flips immediately instead of waiting for the server.
    try {
      if (clearing) {
        await clearRoundRsvp(round.id, member.uid);
        onSuccess(`${member.displayName}'s RSVP cleared`);
      } else {
        await setRoundRsvp({
          round,
          member,
          status: target,
          respondedBy: appUser,
          existingRsvp,
        });
        onSuccess(
          `${member.displayName} marked as ${
            target === "accepted" ? "going" : "not going"
          }`
        );
      }
    } catch {
      setError("Failed to update RSVP. Please try again.");
      return;
    }
    // The player notification is a best-effort side effect. Only notify when
    // setting a definitive status on someone else, not when clearing.
    if (!clearing && member.uid !== appUser.uid) {
      createNotificationsForUsers({
        recipientUserIds: [member.uid],
        groupId: round.groupId,
        type: "change_alert",
        title:
          target === "accepted"
            ? "You've been marked as playing"
            : "You've been marked as not playing",
        body: `${appUser.displayName} set your RSVP to "${
          target === "accepted" ? "Going" : "Not going"
        }" for Round ${round.roundNumber} at ${round.courseName}.`,
        deepLink: `/rounds/${round.id}`,
        roundId: round.id,
      }).catch(() => {
        /* notification is best-effort; ignore failures */
      });
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
              <div className="flex gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => handleToggleStatus(member, "accepted", rsvp)}
                  disabled={locked}
                  title={
                    status === "accepted" ? "Click again to clear" : undefined
                  }
                  className={`rounded-lg border px-2.5 py-1 text-xs transition-colors ${
                    status === "accepted"
                      ? "border-brand-500 bg-brand-50 font-semibold text-brand-700"
                      : "border-surface-overlay font-medium text-ink-hint hover:bg-surface-muted"
                  }`}
                >
                  Going
                </button>
                <button
                  type="button"
                  onClick={() => handleToggleStatus(member, "declined", rsvp)}
                  disabled={locked}
                  title={
                    status === "declined" ? "Click again to clear" : undefined
                  }
                  className={`rounded-lg border px-2.5 py-1 text-xs transition-colors ${
                    status === "declined"
                      ? "border-red-500 bg-red-50 font-semibold text-red-700"
                      : "border-surface-overlay font-medium text-ink-hint hover:bg-surface-muted"
                  }`}
                >
                  Not going
                </button>
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
