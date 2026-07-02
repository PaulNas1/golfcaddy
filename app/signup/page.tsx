"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { getMemberInvite } from "@/lib/firestore";
import { LogoLockup } from "@/components/marketing/Logo";
import type { UserGender } from "@/types";

const GLOW_STYLE = {
  background: "radial-gradient(60% 55% at 50% 8%, rgba(30,138,62,0.30), transparent 68%)",
};

const DATE_INPUT_CLASSNAME =
  "w-full rounded-xl border border-mkt-border bg-mkt-page px-4 py-3 text-left text-base text-mkt-text outline-none focus:border-mkt-accent focus:ring-[3px] focus:ring-[rgba(53,193,94,0.18)] [&::-webkit-date-and-time-value]:block [&::-webkit-date-and-time-value]:text-left [&::-webkit-calendar-picker-indicator]:invert";

export default function SignUpPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-mkt-page">
          <div className="text-sm text-mkt-muted">Loading...</div>
        </div>
      }
    >
      <SignUpForm />
    </Suspense>
  );
}

function SignUpForm() {
  const { signUp } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const inviteId = searchParams.get("invite") ?? "";
  const inviteToken = searchParams.get("token") ?? "";
  const urlGroupId = searchParams.get("groupId") ?? "";
  const urlGroupName = searchParams.get("groupName") ?? "";
  const invitedName = searchParams.get("name") ?? "";
  const invitedContact = searchParams.get("contact") ?? "";
  const invitedEmail = invitedContact.includes("@") ? invitedContact : "";
  const invitedMobile = invitedContact && !invitedContact.includes("@") ? invitedContact : "";

  const [resolvedGroupId, setResolvedGroupId] = useState(urlGroupId);
  const [resolvedGroupName, setResolvedGroupName] = useState(urlGroupName || "your golf group");
  const [name, setName] = useState(invitedName);
  const [email, setEmail] = useState(invitedEmail);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [nickname, setNickname] = useState("");
  const [mobileNumber, setMobileNumber] = useState(invitedMobile);
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [gender, setGender] = useState<UserGender | "">("");
  const [usesSeniorTees, setUsesSeniorTees] = useState(false);
  const [usesProBackTees, setUsesProBackTees] = useState(false);
  const [error, setError] = useState("");
  const [inviteError, setInviteError] = useState("");
  const [checkingInvite, setCheckingInvite] = useState(Boolean(inviteId));
  const [loading, setLoading] = useState(false);

  // No invite link at all → show a clear wall
  const hasInvite = Boolean(inviteId);

  useEffect(() => {
    if (!inviteId) {
      setCheckingInvite(false);
      return;
    }
    let cancelled = false;
    setCheckingInvite(true);
    getMemberInvite(inviteId)
      .then((invite) => {
        if (cancelled) return;
        if (!invite || invite.token !== inviteToken) { setInviteError("This invite link is invalid."); return; }
        if (invite.status === "cancelled") { setInviteError("This invite has been revoked."); return; }
        if (invite.status === "used") { setInviteError("This invite has already been used."); return; }
        setResolvedGroupId(invite.groupId);
        setResolvedGroupName(invite.groupName);
        setName(invite.inviteeName);
        if (invite.contact?.includes("@")) { setEmail(invite.contact); setMobileNumber(""); }
        else { setMobileNumber(invite.contact ?? ""); }
      })
      .catch(() => { if (!cancelled) setInviteError("This invite could not be verified. Please ask for a new link."); })
      .finally(() => { if (!cancelled) setCheckingInvite(false); });
    return () => { cancelled = true; };
  }, [inviteId, inviteToken]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (inviteError) { setError(inviteError); return; }
    if (checkingInvite) { setError("Checking your invite. Please wait a moment and try again."); return; }
    if (password !== confirm) { setError("Passwords do not match."); return; }
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }

    setLoading(true);
    try {
      await signUp(email, password, name.trim(), {
        groupId: resolvedGroupId,
        inviteId: inviteId || undefined,
        nickname: nickname.trim() || null,
        mobileNumber: mobileNumber.trim() || null,
        dateOfBirth: dateOfBirth || null,
        gender: gender || null,
        usesSeniorTees,
        usesProBackTees,
      });
      router.replace("/pending");
    } catch (err: unknown) {
      if (err instanceof Error && err.message?.includes("email-already-in-use")) {
        setError("An account with this email already exists.");
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  // ── No invite — invitation-only wall ──────────────────────────────────────
  if (!hasInvite) {
    return (
      <div className="relative flex min-h-screen flex-col items-center justify-center bg-mkt-page px-6">
        <div className="pointer-events-none absolute inset-0" style={GLOW_STYLE} />
        <Link href="/" className="absolute left-8 top-7 z-10">
          <LogoLockup />
        </Link>
        <div className="relative z-[1] w-[420px] max-w-full rounded-[22px] border border-mkt-border bg-mkt-card p-9 text-center shadow-[0_40px_80px_-35px_rgba(0,0,0,0.5)]">
          <div className="mb-3 text-3xl">🔒</div>
          <h2 className="mb-2 text-lg font-bold text-mkt-text">Invitation required</h2>
          <p className="mb-6 text-sm text-mkt-muted">
            GolfCaddy groups are private. You need an invite link from your group
            organiser to create an account.
          </p>
          <p className="mb-6 text-xs text-mkt-faint">
            Ask your group admin to send you an invite from the Members section of
            their GolfCaddy admin panel.
          </p>
          <Link
            href="/signin"
            className="block w-full rounded-xl bg-mkt-primary py-3 text-sm font-bold text-white transition-[filter] hover:brightness-[1.06]"
          >
            Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  // ── Valid invite — registration form ──────────────────────────────────────
  return (
    <div className="relative flex min-h-screen flex-col bg-mkt-page">
      <div className="pointer-events-none absolute inset-0" style={GLOW_STYLE} />
      <Link href="/" className="absolute left-8 top-7 z-10">
        <LogoLockup />
      </Link>

      <div className="relative z-[1] flex flex-1 flex-col items-center justify-center px-6 pb-8 pt-24">
        <div className="w-[420px] max-w-full rounded-[22px] border border-mkt-border bg-mkt-card p-9 shadow-[0_40px_80px_-35px_rgba(0,0,0,0.5)]">
          <h1 className="mb-1.5 text-[26px] font-extrabold tracking-[-0.03em] text-mkt-text">Create your account</h1>
          <p className="mb-6 text-[15px] text-mkt-muted">
            Request access to {resolvedGroupName}. An admin will review and approve your request before you can access the app.
          </p>

          <form onSubmit={handleSubmit} className="space-y-[18px]">
            <div>
              <label className="mb-[7px] block text-[13px] font-bold text-mkt-chipText">Full name</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} required
                className="w-full rounded-xl border border-mkt-border bg-mkt-card2 px-[14px] py-[13px] text-[15px] text-mkt-text placeholder:text-mkt-faint outline-none focus:border-mkt-accent focus:ring-[3px] focus:ring-[rgba(53,193,94,0.18)]"
                placeholder="Paul Ryan" autoComplete="name" />
            </div>

            <div>
              <label className="mb-[7px] block text-[13px] font-bold text-mkt-chipText">Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
                className="w-full rounded-xl border border-mkt-border bg-mkt-card2 px-[14px] py-[13px] text-[15px] text-mkt-text placeholder:text-mkt-faint outline-none focus:border-mkt-accent focus:ring-[3px] focus:ring-[rgba(53,193,94,0.18)]"
                placeholder="you@email.com" autoComplete="email" />
            </div>

            <div>
              <label className="mb-[7px] block text-[13px] font-bold text-mkt-chipText">Password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required
                className="w-full rounded-xl border border-mkt-border bg-mkt-card2 px-[14px] py-[13px] text-[15px] text-mkt-text placeholder:text-mkt-faint outline-none focus:border-mkt-accent focus:ring-[3px] focus:ring-[rgba(53,193,94,0.18)]"
                placeholder="At least 8 characters" autoComplete="new-password" />
            </div>

            <div>
              <label className="mb-[7px] block text-[13px] font-bold text-mkt-chipText">Confirm password</label>
              <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required
                className="w-full rounded-xl border border-mkt-border bg-mkt-card2 px-[14px] py-[13px] text-[15px] text-mkt-text placeholder:text-mkt-faint outline-none focus:border-mkt-accent focus:ring-[3px] focus:ring-[rgba(53,193,94,0.18)]"
                placeholder="••••••••" autoComplete="new-password" />
            </div>

            <div className="rounded-2xl border border-mkt-border bg-mkt-card2 p-4">
              <div className="mb-3">
                <h3 className="text-sm font-semibold text-mkt-text">Player profile</h3>
                <p className="mt-1 text-xs text-mkt-muted">Optional, but recommended so admins can assign tees properly.</p>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-mkt-chipText">Nickname</label>
                  <input type="text" value={nickname} onChange={(e) => setNickname(e.target.value)}
                    className="w-full rounded-xl border border-mkt-border bg-mkt-page px-4 py-3 text-base text-mkt-text placeholder:text-mkt-faint outline-none focus:border-mkt-accent focus:ring-[3px] focus:ring-[rgba(53,193,94,0.18)]"
                    placeholder="Optional nickname" />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-mkt-chipText">Mobile number</label>
                  <input type="tel" value={mobileNumber} onChange={(e) => setMobileNumber(e.target.value)}
                    className="w-full rounded-xl border border-mkt-border bg-mkt-page px-4 py-3 text-base text-mkt-text placeholder:text-mkt-faint outline-none focus:border-mkt-accent focus:ring-[3px] focus:ring-[rgba(53,193,94,0.18)]"
                    placeholder="Optional mobile" autoComplete="tel" />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-mkt-chipText">Date of birth</label>
                  <input type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} className={DATE_INPUT_CLASSNAME} />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-mkt-chipText">Gender</label>
                  <select value={gender} onChange={(e) => setGender(e.target.value as UserGender | "")}
                    className="w-full rounded-xl border border-mkt-border bg-mkt-page px-4 py-3 text-base text-mkt-text outline-none focus:border-mkt-accent focus:ring-[3px] focus:ring-[rgba(53,193,94,0.18)]">
                    <option value="">Not set</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                  </select>
                </div>
                <label className="flex items-center justify-between gap-3 rounded-xl border border-mkt-border bg-mkt-card px-4 py-3">
                  <span className="text-sm font-medium text-mkt-text">I usually play senior tees</span>
                  <input type="checkbox" checked={usesSeniorTees} onChange={(e) => setUsesSeniorTees(e.target.checked)}
                    className="h-5 w-5 rounded border-mkt-border text-mkt-primary" />
                </label>
                <label className="flex items-center justify-between gap-3 rounded-xl border border-mkt-border bg-mkt-card px-4 py-3">
                  <span className="text-sm font-medium text-mkt-text">I usually play pro/back tees</span>
                  <input type="checkbox" checked={usesProBackTees} onChange={(e) => setUsesProBackTees(e.target.checked)}
                    className="h-5 w-5 rounded border-mkt-border text-mkt-primary" />
                </label>
              </div>
            </div>

            {(inviteError || error) && (
              <div className="rounded-xl border border-[#E4685A]/40 bg-[rgba(228,104,90,0.12)] px-4 py-3 text-sm text-[#E4685A]">
                {inviteError || error}
              </div>
            )}
            {checkingInvite && (
              <div className="rounded-xl border border-mkt-border bg-mkt-card2 px-4 py-3 text-sm text-mkt-muted">
                Verifying your invite...
              </div>
            )}

            <button
              type="submit"
              disabled={loading || checkingInvite || Boolean(inviteError)}
              className="w-full rounded-xl bg-mkt-primary py-3 text-base font-bold text-white shadow-[0_12px_28px_-12px_#22A44A] transition-[filter] hover:brightness-[1.06] disabled:opacity-60"
            >
              {loading ? "Submitting..." : checkingInvite ? "Checking invite..." : "Request access"}
            </button>
          </form>

          <p className="mt-4 text-center text-[12.5px] leading-relaxed text-mkt-faint">
            By continuing you agree to our{" "}
            <Link href="/terms" className="text-mkt-muted underline">Terms</Link>{" "}
            and{" "}
            <Link href="/privacy" className="text-mkt-muted underline">Privacy Policy</Link>.
          </p>

          <div className="mt-6 border-t border-mkt-border pt-6 text-center">
            <p className="text-sm text-mkt-muted">
              Already have an account?{" "}
              <Link href="/signin" className="font-bold text-mkt-accent">Sign in</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
