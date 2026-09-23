"use client";

/**
 * AdminDashboard — "what needs doing next".
 *
 * NEXT UP: the next round as a checklist (course, RSVPs, tee groups,
 * LD/T2/T3, tees), each item one tap from done. Switches to a live card on
 * round day and a close-out card once the round has been played.
 * NEEDS ATTENTION: approvals, unpublished rounds, nothing scheduled — only
 * shown when something's there. Logic lives in lib/adminChecklist.ts.
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  createMemberInvite,
  getActiveMembers,
  getPendingMembers,
  nudgeRoundNonResponders,
  subscribeGroup,
  subscribeRoundRsvps,
  subscribeRoundsForGroup,
} from "@/lib/firestore";
import { getFirstTeeTimeLabel } from "@/lib/teeTimes";
import { buildNeedsAttention, buildNextUp, pickNextRound } from "@/lib/adminChecklist";
import { format } from "date-fns";
import { useAuth } from "@/contexts/AuthContext";
import type { AppUser, Group, MemberInvite, Round, RoundRsvp } from "@/types";

function uniqueRoundsById(rounds: Round[]) {
  return Array.from(new Map(rounds.map((r) => [r.id, r])).values());
}

export default function AdminDashboard() {
  const { appUser } = useAuth();
  const [pending, setPending] = useState<AppUser[]>([]);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [group, setGroup] = useState<Group | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeMembers, setActiveMembers] = useState<AppUser[]>([]);
  const [rsvps, setRsvps] = useState<RoundRsvp[]>([]);
  const [nudging, setNudging] = useState(false);
  const [nudgeMessage, setNudgeMessage] = useState("");

  // ── Invite QR modal state ─────────────────────────────────────────────────
  const [qrOpen, setQrOpen] = useState(false);
  const [qrInvite, setQrInvite] = useState<MemberInvite | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [qrError, setQrError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!appUser?.groupId) return;

    let pendingLoaded = false;
    let groupLoaded = false;
    let roundsLoaded = false;

    const markLoaded = () => {
      if (pendingLoaded && groupLoaded && roundsLoaded) setLoading(false);
    };

    setLoading(true);

    getActiveMembers(appUser.groupId)
      .then(setActiveMembers)
      .catch((err) => console.warn("Unable to load active members", err));

    getPendingMembers(appUser.groupId)
      .then((members) => setPending(members))
      .catch((err) => console.warn("Unable to load pending members", err))
      .finally(() => { pendingLoaded = true; markLoaded(); });

    const groupUnsub = subscribeGroup(
      appUser.groupId,
      (g) => { setGroup(g); groupLoaded = true; markLoaded(); },
      (err) => { console.warn("Unable to subscribe to group", err); groupLoaded = true; markLoaded(); }
    );

    const roundsUnsub = subscribeRoundsForGroup(
      appUser.groupId,
      (next) => { setRounds(uniqueRoundsById(next)); roundsLoaded = true; markLoaded(); },
      (err) => { console.warn("Unable to subscribe to rounds", err); roundsLoaded = true; markLoaded(); }
    );

    return () => { groupUnsub(); roundsUnsub(); };
  }, [appUser?.groupId]);

  // RSVPs for the round the checklist is about.
  const rsvpRoundId =
    pickNextRound(rounds, group?.currentSeason ?? new Date().getFullYear())?.id ?? null;
  useEffect(() => {
    if (!rsvpRoundId) {
      setRsvps([]);
      return;
    }
    return subscribeRoundRsvps(rsvpRoundId, setRsvps);
  }, [rsvpRoundId]);

  const handleOpenQR = async () => {
    if (!appUser || !group) return;
    setQrOpen(true);
    setQrError("");
    setQrInvite(null);
    setQrLoading(true);
    try {
      const invite = await createMemberInvite({
        group,
        inviteeName: "New member",
        contact: null,
        createdBy: appUser,
      });
      setQrInvite(invite);
    } catch (err) {
      console.warn("Unable to create invite", err);
      setQrError("Couldn't generate invite. Check your connection and try again.");
    } finally {
      setQrLoading(false);
    }
  };

  const handleCopyLink = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard not available (e.g. non-HTTPS dev) — ignore
    }
  };

  const activeSeason = group?.currentSeason ?? new Date().getFullYear();
  const now = new Date();
  const focusRound = pickNextRound(rounds, activeSeason);
  const focusRoundId = focusRound?.id ?? null;

  const nextUp = buildNextUp({ rounds, season: activeSeason, rsvps, activeMembers, now });
  const attention = buildNeedsAttention({
    rounds,
    season: activeSeason,
    pendingCount: pending.length,
    now,
    nextUpRoundId: focusRoundId,
  });

  const handleNudge = async () => {
    if (!focusRound || nudging) return;
    const noReply = nextUp.mode === "prep"
      ? nextUp.items.find((i) => i.key === "rsvps")?.detail.match(/(\d+) no reply/)?.[1]
      : null;
    if (!window.confirm(`Send an RSVP reminder to the ${noReply ?? ""} member(s) who haven't replied?`)) return;
    setNudging(true);
    setNudgeMessage("");
    try {
      const sent = await nudgeRoundNonResponders({ round: focusRound, activeUsers: activeMembers });
      setNudgeMessage(sent > 0 ? `Reminder sent to ${sent} member${sent === 1 ? "" : "s"}.` : "Everyone has already replied.");
    } catch {
      setNudgeMessage("Couldn't send the reminder. Try again.");
    } finally {
      setNudging(false);
    }
  };

  // Build signup URL from invite
  const inviteUrl = qrInvite
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/signup?invite=${qrInvite.id}&token=${qrInvite.token}&groupId=${qrInvite.groupId}&groupName=${encodeURIComponent(qrInvite.groupName)}`
    : "";

  return (
    <>
      <div className="space-y-5">
        {/* Header: title + the two things you start from scratch */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-ink-title">Admin</h1>
            <p className="text-sm text-ink-muted">
              {group?.name ?? "Golf group"} · {activeSeason} season
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={handleOpenQR}
              disabled={!group}
              aria-label="Invite with QR code"
              className="inline-flex items-center gap-1.5 rounded-full border border-surface-overlay px-3 py-2 text-xs font-semibold text-ink-body hover:bg-surface-muted disabled:opacity-40"
            >
              <QRIcon className="h-4 w-4" /> Invite
            </button>
            <Link
              href="/admin/rounds/create"
              className="inline-flex items-center gap-1 rounded-full bg-brand-600 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-700"
            >
              <PlusIcon className="h-4 w-4" /> New round
            </Link>
          </div>
        </div>

        {loading ? (
          <div className="h-56 animate-pulse rounded-2xl bg-surface-muted" />
        ) : (
          <NextUpCard
            nextUp={nextUp}
            onNudge={handleNudge}
            nudging={nudging}
            nudgeMessage={nudgeMessage}
          />
        )}

        {!loading && attention.length > 0 && (
          <section>
            <h2 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-ink-hint">
              Needs attention
            </h2>
            <div className="divide-y divide-surface-overlay rounded-2xl border border-surface-overlay bg-surface-card shadow-sm">
              {attention.map((item) => (
                <Link
                  key={item.key}
                  href={item.href}
                  className="flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-surface-muted"
                >
                  <span className="text-ink-body">
                    <span className="mr-2 text-amber-500">●</span>
                    {item.text}
                  </span>
                  <span className="shrink-0 text-xs font-semibold text-ink-action">
                    {item.action} →
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>

      {/* ── Invite QR modal ──────────────────────────────────────────────────── */}
      {qrOpen && (
        <InviteQRModal
          loading={qrLoading}
          error={qrError}
          inviteUrl={inviteUrl}
          groupName={group?.name ?? "your group"}
          copied={copied}
          onCopy={() => handleCopyLink(inviteUrl)}
          onClose={() => { setQrOpen(false); setQrInvite(null); setQrError(""); }}
        />
      )}
    </>
  );
}

// ── Invite QR Modal ──────────────────────────────────────────────────────────

function InviteQRModal({
  loading,
  error,
  inviteUrl,
  groupName,
  copied,
  onCopy,
  onClose,
}: {
  loading: boolean;
  error: string;
  inviteUrl: string;
  groupName: string;
  copied: boolean;
  onCopy: () => void;
  onClose: () => void;
}) {
  const backdropRef = useRef<HTMLDivElement>(null);

  // Close on backdrop click
  const handleBackdrop = (e: React.MouseEvent) => {
    if (e.target === backdropRef.current) onClose();
  };

  const qrSrc = inviteUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=12&data=${encodeURIComponent(inviteUrl)}`
    : "";

  return (
    <div
      ref={backdropRef}
      onClick={handleBackdrop}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 px-4 pb-6"
    >
      <div className="w-full max-w-sm rounded-2xl bg-surface-card shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div>
            <h3 className="font-bold text-ink-title">Invite to join</h3>
            <p className="text-xs text-ink-muted mt-0.5">{groupName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-ink-hint hover:bg-surface-muted transition-colors"
            aria-label="Close"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 pb-5 space-y-4">
          {loading ? (
            <div className="flex flex-col items-center py-10 gap-3">
              <div className="flex gap-1.5">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="h-2.5 w-2.5 rounded-full bg-brand-400 animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }}
                  />
                ))}
              </div>
              <p className="text-xs text-ink-hint">Generating invite…</p>
            </div>
          ) : error ? (
            <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : (
            <>
              {/* QR code */}
              <div className="flex flex-col items-center gap-3">
                <div className="rounded-2xl border-2 border-brand-100 bg-surface-card p-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={qrSrc}
                    alt="Scan to join"
                    width={220}
                    height={220}
                    className="rounded-xl"
                  />
                </div>
                <p className="text-center text-xs text-ink-muted max-w-[220px]">
                  Point your camera at this code to go straight to sign-up.
                </p>
              </div>

              {/* Instructions */}
              <div className="rounded-xl bg-brand-50 px-4 py-3 text-xs text-brand-800 space-y-1">
                <p className="font-semibold">How it works</p>
                <p>The scanner fills in their own details and submits a join request. You&apos;ll see them in Members → Pending for approval.</p>
              </div>

              {/* Copy link fallback */}
              <button
                type="button"
                onClick={onCopy}
                className="w-full rounded-xl border border-surface-overlay py-2.5 text-sm font-semibold text-ink-body transition-colors hover:bg-surface-muted"
              >
                {copied ? "✓ Link copied" : "Copy invite link"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Reusable tile components ─────────────────────────────────────────────────



// ── Icons ────────────────────────────────────────────────────────────────────

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14m-7-7h14" />
    </svg>
  );
}


function QRIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0 1 3.75 9.375v-4.5ZM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 0 1-1.125-1.125v-4.5ZM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0 1 13.5 9.375v-4.5ZM13.5 14.625c0-.621.504-1.125 1.125-1.125h1.5c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5ZM18 14.625c0-.621.504-1.125 1.125-1.125h.375c.621 0 1.125.504 1.125 1.125v.375c0 .621-.504 1.125-1.125 1.125H19.125A1.125 1.125 0 0 1 18 15v-.375ZM13.5 19.125c0-.621.504-1.125 1.125-1.125h.375c.621 0 1.125.504 1.125 1.125v.375c0 .621-.504 1.125-1.125 1.125h-.375a1.125 1.125 0 0 1-1.125-1.125v-.375ZM18 19.125c0-.621.504-1.125 1.125-1.125h.375c.621 0 1.125.504 1.125 1.125v.375c0 .621-.504 1.125-1.125 1.125H19.125A1.125 1.125 0 0 1 18 19.5v-.375Z" />
    </svg>
  );
}


function CloseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

// ─── Next up card ─────────────────────────────────────────────────────────────

function NextUpCard({
  nextUp,
  onNudge,
  nudging,
  nudgeMessage,
}: {
  nextUp: ReturnType<typeof buildNextUp>;
  onNudge: () => void;
  nudging: boolean;
  nudgeMessage: string;
}) {
  if (nextUp.mode === "none") {
    return (
      <section className="rounded-2xl border border-dashed border-surface-overlay bg-surface-card p-6 text-center">
        <p className="font-semibold text-ink-title">No round on the calendar</p>
        <p className="mt-1 text-sm text-ink-muted">Create the next one and the checklist starts here.</p>
        <Link
          href="/admin/rounds/create"
          className="mt-4 inline-flex rounded-full bg-brand-600 px-4 py-2 text-sm font-semibold text-white"
        >
          + New round
        </Link>
      </section>
    );
  }

  const { round } = nextUp;
  const heading = (
    <p className="text-[11px] font-bold uppercase tracking-wide text-ink-hint">
      {nextUp.mode === "live" ? "Live now" : nextUp.mode === "closeOut" ? "Ready to close out" : "Next up"}
    </p>
  );
  const title = (
    <p className="mt-1 font-bold text-ink-title">
      Round {round.roundNumber} · {round.courseName}
    </p>
  );

  if (nextUp.mode === "live") {
    return (
      <section className="rounded-2xl border border-live-text/30 bg-live-bg p-4">
        <p className="text-[11px] font-bold uppercase tracking-wide text-live-text">● Live now</p>
        {title}
        <p className="text-xs text-live-text">{getFirstTeeTimeLabel(round) ?? format(round.date, "EEE d MMM")}</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Link
            href={`/admin/rounds/${round.id}/leaderboard`}
            className="rounded-xl border border-surface-overlay bg-surface-card py-2.5 text-center text-sm font-semibold text-ink-body"
          >
            Live cards
          </Link>
          <Link
            href={`/admin/rounds/${round.id}`}
            className="rounded-xl bg-brand-600 py-2.5 text-center text-sm font-semibold text-white"
          >
            Close out →
          </Link>
        </div>
      </section>
    );
  }

  if (nextUp.mode === "closeOut") {
    return (
      <section className="rounded-2xl border border-amber-300/60 bg-surface-card p-4 shadow-sm">
        {heading}
        {title}
        <p className="text-xs text-ink-muted">
          Played {format(round.date, "EEE d MMM")} · results not published yet
        </p>
        <Link
          href={`/admin/rounds/${round.id}`}
          className="mt-3 block rounded-xl bg-brand-600 py-2.5 text-center text-sm font-semibold text-white"
        >
          Close out &amp; publish →
        </Link>
      </section>
    );
  }

  const { items, doneCount, daysAway } = nextUp;
  const when =
    daysAway === 0 ? "today" : daysAway === 1 ? "tomorrow" : `in ${daysAway} days`;
  return (
    <section className="rounded-2xl border border-surface-overlay bg-surface-card shadow-sm">
      <Link href={`/admin/rounds/${round.id}`} className="block px-4 pt-4 pb-3 hover:bg-surface-muted/50">
        {heading}
        {title}
        <p className="text-xs text-ink-muted">
          {format(round.date, "EEE d MMM")} · {when}
        </p>
      </Link>
      <ul className="divide-y divide-surface-overlay border-t border-surface-overlay">
        {items.map((item) => (
          <li key={item.key} className="flex items-center gap-3 px-4 py-3">
            <span
              aria-label={item.done ? "done" : "to do"}
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px] font-bold ${
                item.done
                  ? "border-brand-500 bg-brand-500 text-white"
                  : "border-surface-overlay text-transparent"
              }`}
            >
              ✓
            </span>
            <div className="min-w-0 flex-1">
              <p className={`text-sm ${item.done ? "text-ink-muted" : "font-semibold text-ink-title"}`}>
                {item.label}
              </p>
              <p className="truncate text-xs text-ink-hint">{item.detail}</p>
            </div>
            {item.action?.kind === "link" && (
              <Link
                href={item.action.href}
                className="shrink-0 rounded-full border border-surface-overlay px-3 py-1.5 text-xs font-semibold text-ink-action hover:bg-surface-muted"
              >
                {item.action.label}
              </Link>
            )}
            {item.action?.kind === "nudge" && (
              <button
                type="button"
                onClick={onNudge}
                disabled={nudging}
                className="shrink-0 rounded-full border border-surface-overlay px-3 py-1.5 text-xs font-semibold text-ink-action hover:bg-surface-muted disabled:opacity-50"
              >
                {nudging ? "Sending…" : item.action.label}
              </button>
            )}
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-3 border-t border-surface-overlay px-4 py-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-muted">
          <div
            className="h-full rounded-full bg-brand-500 transition-all"
            style={{ width: `${(doneCount / items.length) * 100}%` }}
          />
        </div>
        <span className="shrink-0 text-xs font-semibold text-ink-muted">
          {doneCount} of {items.length} ready
        </span>
      </div>
      {nudgeMessage && (
        <p className="border-t border-surface-overlay px-4 py-2 text-xs text-ink-action">{nudgeMessage}</p>
      )}
      {round.rsvpNudgedAt && !nudgeMessage && (
        <p className="border-t border-surface-overlay px-4 py-2 text-[11px] text-ink-hint">
          Last nudged {format(round.rsvpNudgedAt, "EEE d MMM, h:mm a")}
        </p>
      )}
    </section>
  );
}
