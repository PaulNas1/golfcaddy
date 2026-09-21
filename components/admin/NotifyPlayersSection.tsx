"use client";

import { format, formatDistanceToNow } from "date-fns";
import type { Round } from "@/types";

/**
 * Brief 2 — notifying players is a separate, deliberate act on the round page,
 * not a variant of save.
 *
 * The old "Save" / "Save & Notify Players" pair made it ambiguous what plain
 * Save did. Here the button says what it will do, to how many people, and when
 * it last happened.
 */
export default function NotifyPlayersSection({
  round,
  recipientCount,
  onNotify,
  busy,
}: {
  round: Round;
  recipientCount: number;
  onNotify: () => void;
  busy: boolean;
}) {
  const sentAt = round.rsvpNotifiedAt;
  const firstTime = !round.rsvpOpen;

  const handleClick = () => {
    const confirmed = window.confirm(
      firstTime
        ? `Notify ${recipientCount} player${
            recipientCount === 1 ? "" : "s"
          } that this round is open, and start collecting RSVPs?`
        : `Send an update to ${recipientCount} player${
            recipientCount === 1 ? "" : "s"
          }? They were last notified ${
            sentAt ? formatDistanceToNow(sentAt, { addSuffix: true }) : "earlier"
          }.`
    );
    if (confirmed) onNotify();
  };

  return (
    <div className="rounded-2xl border border-surface-overlay bg-surface-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-semibold text-ink-title">Notify players</h2>
          <p className="mt-0.5 text-xs text-ink-muted">
            {sentAt
              ? `Last sent ${format(sentAt, "EEE d MMM, h:mma")}`
              : "Not sent yet"}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-surface-muted px-2.5 py-1 text-xs font-semibold text-ink-muted">
          {recipientCount} recipient{recipientCount === 1 ? "" : "s"}
        </span>
      </div>

      <button
        type="button"
        onClick={handleClick}
        disabled={busy || recipientCount === 0}
        className="mt-3 w-full rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy
          ? "Sending…"
          : firstTime
          ? "Notify players & open RSVPs"
          : "Send update"}
      </button>
    </div>
  );
}
