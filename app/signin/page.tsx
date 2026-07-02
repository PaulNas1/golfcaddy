"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { getGroupBySlug } from "@/lib/firestore";
import { LogoLockup, LogoMark } from "@/components/marketing/Logo";
import type { Group } from "@/types";

const GLOW_STYLE = {
  background: "radial-gradient(60% 55% at 50% 8%, rgba(30,138,62,0.30), transparent 68%)",
};

export default function SignInPage() {
  const { signIn, signOut, appUser, loading } = useAuth();
  const router = useRouter();

  // Step 1 – group lookup
  const [groupInput, setGroupInput] = useState("");
  const [foundGroup, setFoundGroup] = useState<Group | null>(null);
  const [groupError, setGroupError] = useState("");
  const [lookingUp, setLookingUp] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);

  // Step 2 – credentials
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [signInError, setSignInError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!appUser) return;

    // If the user signed in but belongs to a different group, boot them out.
    if (foundGroup && appUser.groupId !== foundGroup.id) {
      signOut().then(() => {
        setFoundGroup(null);
        setGroupInput("");
        setStep(1);
        setSignInError(
          `No account found for ${foundGroup.name}. Check you selected the right group.`
        );
      });
      return;
    }

    if (appUser.status === "active") router.replace("/home");
    else if (appUser.status === "pending") router.replace("/pending");
  }, [appUser, loading, router, foundGroup, signOut]);

  const handleGroupLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    setGroupError("");
    setLookingUp(true);
    try {
      const group = await getGroupBySlug(groupInput);
      if (!group) {
        setGroupError("No group found. Check the name and try again.");
        return;
      }
      setFoundGroup(group);
      setStep(2);
    } catch {
      setGroupError("Something went wrong. Please try again.");
    } finally {
      setLookingUp(false);
    }
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setSignInError("");
    setSubmitting(true);
    try {
      await signIn(email.trim(), password);
    } catch {
      setSignInError("Invalid email or password. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // Show splash while loading OR while we have a session and are waiting for the
  // redirect to complete — this prevents the login form ever flashing on screen.
  if (loading || appUser) {
    return <GolfCaddySplash />;
  }

  return (
    <div className="relative flex min-h-screen flex-col bg-mkt-page">
      <div className="pointer-events-none absolute inset-0" style={GLOW_STYLE} />
      <Link href="/" className="absolute left-8 top-7 z-10">
        <LogoLockup />
      </Link>

      <div className="relative z-[1] flex flex-1 flex-col items-center justify-center px-6 pb-8 pt-24">

        {/* Step 1 – Find group */}
        {step === 1 && (
          <div className="w-[420px] max-w-full rounded-[22px] border border-mkt-border bg-mkt-card p-9 shadow-[0_40px_80px_-35px_rgba(0,0,0,0.5)]">
            <h1 className="mb-1.5 text-[26px] font-extrabold tracking-[-0.03em] text-mkt-text">Welcome back</h1>
            <p className="mb-6 text-[15px] text-mkt-muted">
              Sign in to your group and pick up where the round left off.
            </p>

            <form onSubmit={handleGroupLookup} className="space-y-[18px]">
              <div>
                <label className="mb-[7px] block text-[13px] font-bold text-mkt-chipText">
                  Group name
                </label>
                <input
                  type="text"
                  value={groupInput}
                  onChange={(e) => setGroupInput(e.target.value)}
                  required
                  autoFocus
                  className="w-full rounded-xl border border-mkt-border bg-mkt-card2 px-[14px] py-[13px] text-[15px] text-mkt-text placeholder:text-mkt-faint outline-none focus:border-mkt-accent focus:ring-[3px] focus:ring-[rgba(53,193,94,0.18)]"
                  placeholder="e.g. FourPlay Society"
                />
              </div>

              {groupError && (
                <div className="rounded-xl border border-[#E4685A]/40 bg-[rgba(228,104,90,0.12)] px-4 py-3 text-sm text-[#E4685A]">
                  {groupError}
                </div>
              )}

              <button
                type="submit"
                disabled={lookingUp || !groupInput.trim()}
                className="w-full rounded-xl bg-mkt-primary py-[15px] text-[15px] font-bold text-white shadow-[0_12px_28px_-12px_#22A44A] transition-[filter] hover:brightness-[1.06] disabled:opacity-60"
              >
                {lookingUp ? "Looking up..." : "Continue"}
              </button>
            </form>

            <div className="mt-6 border-t border-mkt-border pt-6 text-center">
              <p className="text-sm text-mkt-muted">
                New to GolfCaddy?{" "}
                <Link href="/signup" className="font-bold text-mkt-accent">
                  Create an account
                </Link>
              </p>
            </div>
          </div>
        )}

        {/* Step 2 – Sign in */}
        {step === 2 && foundGroup && (
          <div className="w-[420px] max-w-full rounded-[22px] border border-mkt-border bg-mkt-card p-9 shadow-[0_40px_80px_-35px_rgba(0,0,0,0.5)]">
            {/* Group badge */}
            <button
              onClick={() => { setStep(1); setSignInError(""); }}
              className="group mb-5 flex items-center gap-2"
            >
              {foundGroup.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={foundGroup.logoUrl}
                  alt=""
                  className="h-8 w-8 rounded-lg object-cover"
                />
              ) : (
                <LogoMark
                  tileClassName="flex h-8 w-8 items-center justify-center rounded-lg bg-mkt-chip"
                  className="h-4 w-4 text-mkt-accent"
                />
              )}
              <span className="text-sm font-semibold text-mkt-text group-hover:text-mkt-accent transition-colors">
                {foundGroup.name}
              </span>
              <span className="text-xs text-mkt-faint group-hover:text-mkt-accent transition-colors">
                ✕ change
              </span>
            </button>

            <h2 className="mb-6 text-[26px] font-extrabold tracking-[-0.03em] text-mkt-text">Sign in</h2>

            <form onSubmit={handleSignIn} className="space-y-[18px]">
              <div>
                <label className="mb-[7px] block text-[13px] font-bold text-mkt-chipText">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                  className="w-full rounded-xl border border-mkt-border bg-mkt-card2 px-[14px] py-[13px] text-[15px] text-mkt-text placeholder:text-mkt-faint outline-none focus:border-mkt-accent focus:ring-[3px] focus:ring-[rgba(53,193,94,0.18)]"
                  placeholder="you@email.com"
                  autoComplete="email"
                />
              </div>

              <div>
                <div className="mb-[7px] flex items-center justify-between">
                  <label className="text-[13px] font-bold text-mkt-chipText">Password</label>
                  <Link href="/forgot-password" className="text-[12.5px] font-semibold text-mkt-accent">
                    Forgot?
                  </Link>
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full rounded-xl border border-mkt-border bg-mkt-card2 px-[14px] py-[13px] text-[15px] text-mkt-text placeholder:text-mkt-faint outline-none focus:border-mkt-accent focus:ring-[3px] focus:ring-[rgba(53,193,94,0.18)]"
                  placeholder="••••••••"
                  autoComplete="current-password"
                />
              </div>

              {signInError && (
                <div className="rounded-xl border border-[#E4685A]/40 bg-[rgba(228,104,90,0.12)] px-4 py-3 text-sm text-[#E4685A]">
                  {signInError}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-xl bg-mkt-primary py-[15px] text-[15px] font-bold text-white shadow-[0_12px_28px_-12px_#22A44A] transition-[filter] hover:brightness-[1.06] disabled:opacity-60"
              >
                {submitting ? "Signing in..." : "Sign in"}
              </button>
            </form>

            <div className="mt-6 border-t border-mkt-border pt-6 text-center">
              <p className="text-sm text-mkt-muted">
                New to GolfCaddy?{" "}
                <Link href="/signup" className="font-bold text-mkt-accent">
                  Create an account
                </Link>
              </p>
            </div>
          </div>
        )}
      </div>

      <footer className="relative z-[1] pb-8 text-center text-xs text-mkt-faint space-x-4">
        <Link href="/terms" className="hover:text-mkt-muted">Terms of Use</Link>
        <Link href="/privacy" className="hover:text-mkt-muted">Privacy Policy</Link>
      </footer>
    </div>
  );
}

function GolfCaddySplash() {
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
