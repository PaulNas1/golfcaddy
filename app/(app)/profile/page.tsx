"use client";

/**
 * ProfilePage
 *
 * Thin shell — subscribes to the current user's member doc, then delegates
 * all rendering to focused sub-components. If you need to add a new profile
 * section, create a component in components/profile/ and mount it here.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme, type Theme } from "@/contexts/ThemeContext";
import { subscribeMember } from "@/lib/firestore";
import Avatar from "@/components/ui/Avatar";
import PlayerProfileForm from "@/components/profile/PlayerProfileForm";
import SeasonStatsPanel from "@/components/profile/SeasonStatsPanel";
import AccountSecuritySection from "@/components/profile/AccountSecuritySection";
import { ChevronRightIcon } from "@/components/ui/icons";
import type { Member } from "@/types";

export default function ProfilePage() {
  const { appUser, firebaseUser, signOut } = useAuth();
  const { theme, setTheme } = useTheme();
  const router = useRouter();
  const [member, setMember] = useState<Member | null>(null);

  // Subscribe to live member stats (rank, handicap, points, etc.)
  useEffect(() => {
    if (!appUser?.uid) return;
    return subscribeMember(
      appUser.uid,
      setMember,
      (err) => console.warn("Unable to subscribe to member stats", err)
    );
  }, [appUser?.uid]);

  const handleSignOut = async () => {
    await signOut();
    router.replace("/signin");
  };

  if (!appUser) return null;

  const hcp = member?.currentHandicap ?? null;
  const formatHcp = (h: number | null | undefined) => {
    if (h == null) return "—";
    return Number.isInteger(h) ? String(h) : h.toFixed(1);
  };

  return (
    <div className="px-4 py-6 pb-8 space-y-4">
      {/* ── Hero banner ─────────────────────────────────────────────────── */}
      <div className="bg-brand-700 rounded-2xl p-5 text-white">
        <div className="flex items-center gap-4 mb-4">
          <Avatar src={appUser.avatarUrl ?? ""} name={appUser.displayName} size="lg" className="ring-2 ring-brand-400" />
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold truncate">{appUser.displayName}</h1>
            <p className="text-brand-200 text-sm truncate">{appUser.email}</p>
            <span className="mt-1 inline-block text-xs font-medium px-2 py-0.5 bg-brand-600 text-brand-100 rounded-full capitalize">
              {appUser.role}
            </span>
          </div>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: "Rank", value: member?.seasonRank != null ? `#${member.seasonRank}` : "—" },
            { label: "HCP", value: formatHcp(hcp) },
            { label: "Points", value: String(member?.seasonPoints ?? 0) },
            { label: "Rounds", value: String(member?.roundsPlayed ?? 0) },
          ].map(({ label, value }) => (
            <div key={label} className="rounded-xl bg-brand-800/60 p-2 text-center">
              <p className="text-brand-300 text-xs">{label}</p>
              <p className="text-white font-bold font-mono text-lg leading-tight">{value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Editable player profile ────────────────────────────────────── */}
      <PlayerProfileForm appUser={appUser} onSaved={() => { /* appUser updates via AuthContext listener */ }} />

      {/* ── Season stats + round history ───────────────────────────────── */}
      <SeasonStatsPanel appUser={appUser} member={member} />

      {/* ── Email / password security ──────────────────────────────────── */}
      <AccountSecuritySection appUser={appUser} firebaseUser={firebaseUser} />

      {/* ── Appearance ────────────────────────────────────────────────── */}
      <div className="bg-surface-card rounded-2xl border border-surface-overlay p-4">
        <p className="text-sm font-semibold text-ink-title mb-3">Appearance</p>
        <div className="flex rounded-xl border border-surface-overlay bg-surface-muted p-1 gap-1">
          {([
            { value: "light",  label: "☀️ Light"  },
            { value: "system", label: "Auto"       },
            { value: "dark",   label: "🌙 Dark"   },
          ] as { value: Theme; label: string }[]).map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => setTheme(value)}
              className={`flex-1 rounded-lg py-2 text-xs font-semibold transition-colors ${
                theme === value
                  ? "bg-brand-600 text-white shadow-sm"
                  : "text-ink-muted"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-ink-hint">
          Auto follows your phone&apos;s system setting.
        </p>
      </div>

      {/* ── Founder platform link (platform admins only) ───────────────── */}
      {appUser.platformAdmin && (
        <Link
          href="/platform-admin"
          className="flex items-center justify-between gap-3 w-full bg-brand-700 rounded-2xl px-4 py-3.5"
        >
          <div className="flex items-center gap-3">
            <span className="text-xl">🏌️</span>
            <div className="text-left">
              <p className="text-sm font-semibold text-white">Founder Platform</p>
              <p className="text-xs text-brand-200">Manage groups &amp; subscriptions</p>
            </div>
          </div>
          <ChevronRightIcon className="w-4 h-4 text-brand-300" />
        </Link>
      )}

      {/* ── Help & Getting Started ────────────────────────────────────── */}
      <Link
        href="/help"
        className="flex items-center justify-between gap-3 w-full bg-surface-card rounded-2xl border border-surface-overlay px-4 py-3.5"
      >
        <div className="flex items-center gap-3">
          <span className="text-xl">📖</span>
          <div className="text-left">
            <p className="text-sm font-semibold text-ink-title">Help &amp; Getting Started</p>
            <p className="text-xs text-ink-muted">
              {appUser.role === "admin" ? "Guides for admins and members" : "How to use GolfCaddy"}
            </p>
          </div>
        </div>
        <ChevronRightIcon className="w-4 h-4 text-ink-hint" />
      </Link>

      {/* ── Sign out ───────────────────────────────────────────────────── */}
      <button
        type="button"
        onClick={handleSignOut}
        className="w-full py-3 border border-surface-overlay rounded-2xl text-ink-muted text-sm font-medium"
      >
        Sign out
      </button>
    </div>
  );
}
