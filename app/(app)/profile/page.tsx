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
import { subscribeMember } from "@/lib/firestore";
import Avatar from "@/components/ui/Avatar";
import PlayerProfileForm from "@/components/profile/PlayerProfileForm";
import SeasonStatsPanel from "@/components/profile/SeasonStatsPanel";
import AccountSecuritySection from "@/components/profile/AccountSecuritySection";
import { ChevronRightIcon } from "@/components/ui/icons";
import type { Member } from "@/types";

export default function ProfilePage() {
  const { appUser, firebaseUser, signOut } = useAuth();
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

  return (
    <div className="px-4 py-6 pb-8 space-y-4">
      <h1 className="text-2xl font-bold text-ink-title">Profile</h1>

      {/* ── Identity card ─────────────────────────────────────────────── */}
      <div className="bg-surface-card rounded-2xl shadow-sm border border-surface-overlay p-5">
        <div className="flex items-center gap-4">
          <Avatar src={appUser.avatarUrl ?? ""} name={appUser.displayName} size="lg" />
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-ink-title truncate">
              {appUser.displayName}
            </h2>
            <p className="text-ink-muted text-sm truncate">{appUser.email}</p>
            <span className="mt-1 inline-block text-xs font-medium px-2 py-0.5 bg-brand-100 text-brand-700 rounded-full capitalize">
              {appUser.role}
            </span>
          </div>
        </div>
      </div>

      {/* ── Editable player profile ────────────────────────────────────── */}
      <PlayerProfileForm appUser={appUser} onSaved={() => { /* appUser updates via AuthContext listener */ }} />

      {/* ── Season stats + round history ───────────────────────────────── */}
      <SeasonStatsPanel appUser={appUser} member={member} />

      {/* ── Email / password security ──────────────────────────────────── */}
      <AccountSecuritySection appUser={appUser} firebaseUser={firebaseUser} />

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
