"use client";

/**
 * AdminDashboard
 *
 * Overview screen for group admins. Shows live stats, a pending-approval
 * alert, an active-round banner, and four quick-action tiles.
 *
 * Quick actions:
 *   - Create round  (primary CTA)
 *   - Manage rounds (nav shortcut kept — different context than the dashboard)
 *   - Invite to join (QR code modal — scan-to-signup on the course)
 *   - Course corrections
 *
 * Members and Settings are in the nav bar and are NOT duplicated here.
 */

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import {
  createMemberInvite,
  getPendingMembers,
  subscribeGroup,
  subscribeRoundsForGroup,
} from "@/lib/firestore";
import { getFirstTeeTimeLabel } from "@/lib/teeTimes";
import { useAuth } from "@/contexts/AuthContext";
import { ChevronRightIcon } from "@/components/ui/icons";
import type { AppUser, Group, MemberInvite, Round } from "@/types";

function uniqueRoundsById(rounds: Round[]) {
  return Array.from(new Map(rounds.map((r) => [r.id, r])).values());
}

export default function AdminDashboard() {
  const { appUser } = useAuth();
  const [pending, setPending] = useState<AppUser[]>([]);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [group, setGroup] = useState<Group | null>(null);
  const [loading, setLoading] = useState(true);

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
  const activeSeasonRounds = rounds.filter((r) => r.season === activeSeason);
  const liveRound = rounds.find((r) => r.status === "live");

  // Build signup URL from invite
  const inviteUrl = qrInvite
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/signup?invite=${qrInvite.id}&token=${qrInvite.token}&groupId=${qrInvite.groupId}&groupName=${encodeURIComponent(qrInvite.groupName)}`
    : "";

  return (
    <>
      <div className="space-y-5">
        {/* Page heading */}
        <div>
          <h1 className="text-2xl font-bold text-ink-title">Admin Dashboard</h1>
          <p className="text-ink-muted text-sm">{group?.name ?? "Golf group"}</p>
        </div>

        {/* Pending-approval alert */}
        {pending.length > 0 && (
          <Link href="/admin/members">
            <div className="bg-announce-bg border border-announce-border rounded-2xl p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-2xl">⏳</span>
                <div>
                  <p className="font-semibold text-announce-label text-sm">
                    {pending.length} pending approval{pending.length > 1 ? "s" : ""}
                  </p>
                  <p className="text-announce-muted text-xs">Tap to review</p>
                </div>
              </div>
              <ChevronRightIcon className="w-5 h-5 text-announce-muted" />
            </div>
          </Link>
        )}

        {/* Quick stats strip */}
        <div className="grid grid-cols-3 gap-3">
          <StatPill label="Rounds"  value={loading ? "—" : String(activeSeasonRounds.length)} />
          <StatPill label="Pending" value={loading ? "—" : String(pending.length)} />
          <StatPill label="Season"  value={loading ? "—" : String(activeSeason)} />
        </div>

        {/* Live round banner */}
        {liveRound && (
          <div className="bg-live-bg border border-live-text/20 rounded-2xl p-4">
            <p className="text-xs font-semibold text-live-text uppercase tracking-wide mb-1">
              ● Round Live
            </p>
            <p className="font-bold text-ink-title">{liveRound.courseName}</p>
            {getFirstTeeTimeLabel(liveRound) && (
              <p className="text-xs text-live-text mt-1">{getFirstTeeTimeLabel(liveRound)}</p>
            )}
            <Link
              href={`/admin/rounds/${liveRound.id}`}
              className="mt-3 inline-block text-sm text-live-text font-medium hover:underline"
            >
              Manage round →
            </Link>
          </div>
        )}

        {/* Quick actions */}
        <div>
          <h2 className="mb-3 font-semibold text-ink-title">Quick Actions</h2>
          <div className="grid grid-cols-2 gap-3">
            <ActionTile
              href="/admin/rounds/create"
              label="Create round"
              description="Set date, course, tee times"
              icon={<PlusIcon className="h-6 w-6" />}
              primary
            />
            <ActionTile
              href="/admin/rounds"
              label="Manage rounds"
              description="Edit, publish, delete"
              icon={<FlagIcon className="h-6 w-6" />}
            />
            {/* Invite tile — opens QR modal instead of navigating */}
            <button
              type="button"
              onClick={handleOpenQR}
              disabled={!group}
              className="rounded-xl border border-surface-overlay bg-surface-muted p-4 shadow-sm text-left transition-colors hover:bg-surface-overlay disabled:opacity-40"
            >
              <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-white/70">
                <QRIcon className="h-6 w-6 text-ink-title" />
              </span>
              <span className="block text-sm font-semibold text-ink-title">Invite to join</span>
              <span className="mt-1 block text-xs text-ink-muted">Scan to sign up on the spot</span>
            </button>
            <ActionTile
              href="/admin/course-corrections"
              label="Course corrections"
              description="Saved tee set fixes"
              icon={<CourseIcon className="h-6 w-6" />}
            />
          </div>
        </div>
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
                <div className="rounded-2xl border-2 border-brand-100 bg-white p-2">
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

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface-card rounded-2xl p-4 text-center shadow-sm border border-surface-overlay">
      <div className="text-2xl font-bold text-brand-600">{value}</div>
      <div className="text-xs text-ink-muted mt-1">{label}</div>
    </div>
  );
}

function ActionTile({
  href,
  label,
  description,
  icon,
  primary = false,
}: {
  href: string;
  label: string;
  description: string;
  icon: ReactNode;
  primary?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`rounded-xl border p-4 shadow-sm transition-colors ${
        primary
          ? "border-brand-200 bg-brand-50 text-brand-800 hover:bg-brand-100"
          : "border-surface-overlay bg-surface-muted text-ink-title hover:bg-surface-overlay"
      }`}
    >
      <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-white/70">
        {icon}
      </span>
      <span className="block text-sm font-semibold">{label}</span>
      <span className="mt-1 block text-xs text-ink-muted">{description}</span>
    </Link>
  );
}

// ── Icons ────────────────────────────────────────────────────────────────────

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14m-7-7h14" />
    </svg>
  );
}

function FlagIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 4v16M7 5h9l-1.5 3L16 11H7" />
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

function CourseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v18M3 8l4-2 4 2 4-2 4 2M7 21v-5m4 5v-8m4 8v-5" />
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
