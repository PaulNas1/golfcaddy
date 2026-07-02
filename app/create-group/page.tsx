"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { auth } from "@/lib/firebase";
import {
  checkGroupSlugAvailable,
  createGroup,
} from "@/lib/firestore";
import { useAuth } from "@/contexts/AuthContext";
import { LogoLockup, LogoMark } from "@/components/marketing/Logo";

const GLOW_STYLE = {
  background: "radial-gradient(60% 55% at 50% 8%, rgba(30,138,62,0.30), transparent 68%)",
};

function toSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

export default function CreateGroupPage() {
  const { appUser, loading } = useAuth();
  const router = useRouter();

  // Step 1 – group details
  const [groupName, setGroupName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const [slugError, setSlugError] = useState("");
  const [checkingSlug, setCheckingSlug] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);

  // Step 2 – admin account
  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Auto-redirect if already signed in
  useEffect(() => {
    if (loading) return;
    if (appUser?.status === "active") router.replace("/home");
  }, [loading, appUser, router]);

  // Auto-derive slug from group name (unless manually edited)
  useEffect(() => {
    if (!slugManuallyEdited) {
      setSlug(toSlug(groupName));
    }
  }, [groupName, slugManuallyEdited]);

  const handleSlugChange = (value: string) => {
    setSlugManuallyEdited(true);
    setSlug(toSlug(value));
    setSlugError("");
  };

  const handleStep1 = async (e: React.FormEvent) => {
    e.preventDefault();
    setSlugError("");

    if (!groupName.trim()) return;
    if (!slug) { setSlugError("Group ID cannot be empty."); return; }
    if (slug.length < 3) { setSlugError("Group ID must be at least 3 characters."); return; }

    setCheckingSlug(true);
    try {
      const available = await checkGroupSlugAvailable(slug);
      if (!available) {
        setSlugError("That group ID is already taken. Try a different one.");
        return;
      }
      setStep(2);
    } catch {
      setSlugError("Could not check availability. Please try again.");
    } finally {
      setCheckingSlug(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password !== confirm) { setError("Passwords do not match."); return; }
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }

    setSubmitting(true);
    try {
      // Create Firebase Auth user — signs them in automatically
      const { user } = await createUserWithEmailAndPassword(auth, adminEmail.trim(), password);

      // Write user doc first (rules allow isSignedIn + own uid),
      // then group + member batch (rules require isAdmin — user doc must exist first).
      const trialEndsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      await createGroup({
        name: groupName.trim(),
        slug,
        adminUid: user.uid,
        adminDisplayName: adminName.trim(),
        adminEmail: adminEmail.trim(),
      });

      // Fire welcome email — non-blocking, don't await
      fetch("/api/email/welcome", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: adminEmail.trim(),
          adminName: adminName.trim(),
          groupName: groupName.trim(),
          trialEndsAt: trialEndsAt.toISOString(),
        }),
      }).catch(() => {});

      // All writes succeeded — go straight home, no need to search for the group.
      router.replace("/home");
    } catch (err: unknown) {
      if (err instanceof Error) {
        if (err.message.includes("email-already-in-use")) {
          setError("An account with this email already exists. Sign in instead.");
        } else {
          setError("Something went wrong. Please try again.");
        }
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-mkt-page">
        <LogoMark
          tileClassName="flex h-16 w-16 items-center justify-center rounded-2xl bg-mkt-header"
          className="h-9 w-9 text-white"
        />
        <h1 className="mt-4 text-3xl font-bold text-mkt-text">GolfCaddy</h1>
        <p className="mt-2 text-sm text-mkt-muted">Social golf groups</p>
        <div className="mt-8 flex gap-1.5">
          <span className="h-2 w-2 animate-bounce rounded-full bg-mkt-primary [animation-delay:-0.3s]" />
          <span className="h-2 w-2 animate-bounce rounded-full bg-mkt-primary [animation-delay:-0.15s]" />
          <span className="h-2 w-2 animate-bounce rounded-full bg-mkt-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen flex-col bg-mkt-page">
      <div className="pointer-events-none absolute inset-0" style={GLOW_STYLE} />
      <Link href="/" className="absolute left-8 top-7 z-10">
        <LogoLockup />
      </Link>

      <div className="relative z-[1] flex flex-1 flex-col items-center justify-center px-6 pb-8 pt-24">

        {/* Step 1 – Group details */}
        {step === 1 && (
          <div className="w-[460px] max-w-full rounded-[22px] border border-mkt-border bg-mkt-card p-9 shadow-[0_40px_80px_-35px_rgba(0,0,0,0.5)]">
            <h2 className="mb-1 text-[26px] font-extrabold tracking-[-0.03em] text-mkt-text">Group details</h2>
            <p className="mb-6 text-[15px] text-mkt-muted">
              Give your social golf group a name. Members will use this to find and join your group.
            </p>

            <form onSubmit={handleStep1} className="space-y-[18px]">
              <div>
                <label className="mb-[7px] block text-[13px] font-bold text-mkt-chipText">
                  Group name
                </label>
                <input
                  type="text"
                  value={groupName}
                  onChange={(e) => { setGroupName(e.target.value); setSlugError(""); }}
                  required
                  autoFocus
                  className="w-full rounded-xl border border-mkt-border bg-mkt-card2 px-[14px] py-[13px] text-[15px] text-mkt-text placeholder:text-mkt-faint outline-none focus:border-mkt-accent focus:ring-[3px] focus:ring-[rgba(53,193,94,0.18)]"
                  placeholder="e.g. Four Play"
                />
              </div>

              <div>
                <label className="mb-[7px] block text-[13px] font-bold text-mkt-chipText">
                  Group ID
                  <span className="ml-1 text-xs font-normal text-mkt-faint">(used in invite links)</span>
                </label>
                <div className="flex items-center overflow-hidden rounded-xl border border-mkt-border bg-mkt-card2 focus-within:border-mkt-accent focus-within:ring-[3px] focus-within:ring-[rgba(53,193,94,0.18)]">
                  <span className="select-none border-r border-mkt-border bg-mkt-page px-3 py-3 text-sm text-mkt-faint">
                    gc/
                  </span>
                  <input
                    type="text"
                    value={slug}
                    onChange={(e) => handleSlugChange(e.target.value)}
                    required
                    className="flex-1 bg-transparent px-3 py-3 text-[15px] text-mkt-text outline-none"
                    placeholder="four-play"
                  />
                </div>
                <p className="mt-1 text-xs text-mkt-faint">
                  Lowercase letters, numbers, and hyphens only.
                </p>
              </div>

              {slugError && (
                <div className="rounded-xl border border-[#E4685A]/40 bg-[rgba(228,104,90,0.12)] px-4 py-3 text-sm text-[#E4685A]">
                  {slugError}
                </div>
              )}

              <button
                type="submit"
                disabled={checkingSlug || !groupName.trim() || !slug}
                className="w-full rounded-xl bg-mkt-primary py-[15px] text-[15px] font-bold text-white shadow-[0_12px_28px_-12px_#22A44A] transition-[filter] hover:brightness-[1.06] disabled:opacity-60"
              >
                {checkingSlug ? "Checking..." : "Continue"}
              </button>
            </form>

            <div className="mt-6 border-t border-mkt-border pt-6 text-center">
              <p className="text-sm text-mkt-muted">
                Already have an account?{" "}
                <Link href="/signin" className="font-bold text-mkt-accent">
                  Sign in
                </Link>
              </p>
            </div>
          </div>
        )}

        {/* Step 2 – Admin account */}
        {step === 2 && (
          <div className="w-[460px] max-w-full rounded-[22px] border border-mkt-border bg-mkt-card p-9 shadow-[0_40px_80px_-35px_rgba(0,0,0,0.5)]">
            {/* Group badge */}
            <button
              onClick={() => { setStep(1); setError(""); }}
              className="group mb-5 flex items-center gap-2"
            >
              <LogoMark
                tileClassName="flex h-8 w-8 items-center justify-center rounded-lg bg-mkt-chip"
                className="h-4 w-4 text-mkt-accent"
              />
              <span className="text-sm font-semibold text-mkt-text group-hover:text-mkt-accent transition-colors">
                {groupName}
              </span>
              <span className="font-mono text-xs text-mkt-faint group-hover:text-mkt-accent transition-colors">
                gc/{slug} · change
              </span>
            </button>

            <h2 className="mb-1 text-[26px] font-extrabold tracking-[-0.03em] text-mkt-text">Your admin account</h2>
            <p className="mb-6 text-[15px] text-mkt-muted">
              You will be the group organiser and admin. You can invite members once you&rsquo;re set up.
            </p>

            <form onSubmit={handleCreate} className="space-y-[18px]">
              <div>
                <label className="mb-[7px] block text-[13px] font-bold text-mkt-chipText">Your name</label>
                <input
                  type="text"
                  value={adminName}
                  onChange={(e) => setAdminName(e.target.value)}
                  required
                  autoFocus
                  className="w-full rounded-xl border border-mkt-border bg-mkt-card2 px-[14px] py-[13px] text-[15px] text-mkt-text placeholder:text-mkt-faint outline-none focus:border-mkt-accent focus:ring-[3px] focus:ring-[rgba(53,193,94,0.18)]"
                  placeholder="Paul Smith"
                  autoComplete="name"
                />
              </div>

              <div>
                <label className="mb-[7px] block text-[13px] font-bold text-mkt-chipText">Email</label>
                <input
                  type="email"
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                  required
                  className="w-full rounded-xl border border-mkt-border bg-mkt-card2 px-[14px] py-[13px] text-[15px] text-mkt-text placeholder:text-mkt-faint outline-none focus:border-mkt-accent focus:ring-[3px] focus:ring-[rgba(53,193,94,0.18)]"
                  placeholder="you@example.com"
                  autoComplete="email"
                />
              </div>

              <div>
                <label className="mb-[7px] block text-[13px] font-bold text-mkt-chipText">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full rounded-xl border border-mkt-border bg-mkt-card2 px-[14px] py-[13px] text-[15px] text-mkt-text placeholder:text-mkt-faint outline-none focus:border-mkt-accent focus:ring-[3px] focus:ring-[rgba(53,193,94,0.18)]"
                  placeholder="Min 8 characters"
                  autoComplete="new-password"
                />
              </div>

              <div>
                <label className="mb-[7px] block text-[13px] font-bold text-mkt-chipText">Confirm password</label>
                <input
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                  className="w-full rounded-xl border border-mkt-border bg-mkt-card2 px-[14px] py-[13px] text-[15px] text-mkt-text placeholder:text-mkt-faint outline-none focus:border-mkt-accent focus:ring-[3px] focus:ring-[rgba(53,193,94,0.18)]"
                  placeholder="••••••••"
                  autoComplete="new-password"
                />
              </div>

              {error && (
                <div className="rounded-xl border border-[#E4685A]/40 bg-[rgba(228,104,90,0.12)] px-4 py-3 text-sm text-[#E4685A]">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-xl bg-mkt-primary py-[15px] text-[15px] font-bold text-white shadow-[0_12px_28px_-12px_#22A44A] transition-[filter] hover:brightness-[1.06] disabled:opacity-60"
              >
                {submitting ? "Creating group..." : "Create group"}
              </button>
            </form>

            <div className="mt-4 flex items-center justify-center gap-2 text-[13px] text-mkt-muted">
              <span className="h-1.5 w-1.5 rounded-full bg-mkt-accent" />
              30 days free · no credit card required
            </div>

            <div className="mt-6 border-t border-mkt-border pt-6 text-center">
              <p className="text-sm text-mkt-muted">
                Already have an account?{" "}
                <Link href="/signin" className="font-bold text-mkt-accent">
                  Sign in
                </Link>
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
