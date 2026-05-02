"use client";

/**
 * AccountSecuritySection
 *
 * Collapsible section for changing email address and password.
 * Uses the shared parseFirebaseAuthError util so error copy is
 * consistent with the rest of the app.
 */

import { useEffect, useState } from "react";
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword as updateFirebasePassword,
  verifyBeforeUpdateEmail,
} from "firebase/auth";
import { auth } from "@/lib/firebase";
import { parseFirebaseAuthError } from "@/lib/authErrors";
import { ChevronDownIcon, ChevronUpIcon } from "@/components/ui/icons";
import type { AppUser } from "@/types";
import type { User as FirebaseUser } from "firebase/auth";

interface AccountSecuritySectionProps {
  appUser: AppUser;
  firebaseUser: FirebaseUser | null;
}

export default function AccountSecuritySection({
  appUser,
  firebaseUser,
}: AccountSecuritySectionProps) {
  const [open, setOpen] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  // ── Email change state ─────────────────────────────────────────────
  const [emailDraft, setEmailDraft] = useState(appUser.email ?? "");
  const [emailPassword, setEmailPassword] = useState("");
  const [savingEmail, setSavingEmail] = useState(false);

  // ── Password change state ──────────────────────────────────────────
  const [passwordCurrent, setPasswordCurrent] = useState("");
  const [passwordNext, setPasswordNext] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  // Sync email draft if appUser email changes
  useEffect(() => {
    setEmailDraft(appUser.email ?? "");
  }, [appUser.email]);

  const showSuccess = (msg: string) => {
    setSuccessMsg(msg);
    setErrorMsg("");
    setTimeout(() => setSuccessMsg(""), 4000);
  };

  const handleUpdateEmail = async () => {
    if (!firebaseUser || !auth.currentUser) return;
    const nextEmail = emailDraft.trim();
    if (!nextEmail) { setErrorMsg("Enter your email address."); return; }
    if (!emailPassword) { setErrorMsg("Enter your current password to change email."); return; }
    if (nextEmail.toLowerCase() === (appUser.email ?? "").toLowerCase()) {
      setErrorMsg("That email address is already on your account.");
      return;
    }

    setSavingEmail(true);
    setErrorMsg("");
    try {
      const credential = EmailAuthProvider.credential(
        firebaseUser.email ?? appUser.email,
        emailPassword
      );
      await reauthenticateWithCredential(auth.currentUser, credential);
      await verifyBeforeUpdateEmail(auth.currentUser, nextEmail);
      setEmailPassword("");
      showSuccess(`Verification email sent to ${nextEmail}. Open it to finish the change.`);
    } catch (error) {
      setErrorMsg(parseFirebaseAuthError(error));
    } finally {
      setSavingEmail(false);
    }
  };

  const handleUpdatePassword = async () => {
    if (!firebaseUser || !auth.currentUser) return;
    if (!passwordCurrent) { setErrorMsg("Enter your current password."); return; }
    if (passwordNext.length < 8) { setErrorMsg("New password must be at least 8 characters."); return; }
    if (passwordNext !== passwordConfirm) { setErrorMsg("New passwords do not match."); return; }

    setSavingPassword(true);
    setErrorMsg("");
    try {
      const credential = EmailAuthProvider.credential(
        firebaseUser.email ?? appUser.email,
        passwordCurrent
      );
      await reauthenticateWithCredential(auth.currentUser, credential);
      await updateFirebasePassword(auth.currentUser, passwordNext);
      setPasswordCurrent("");
      setPasswordNext("");
      setPasswordConfirm("");
      showSuccess("Password updated.");
    } catch (error) {
      setErrorMsg(parseFirebaseAuthError(error));
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <div className="bg-surface-card rounded-2xl shadow-sm border border-surface-overlay p-4">
      {/* Collapsible header */}
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-start justify-between gap-3 text-left"
        aria-expanded={open}
      >
        <div>
          <h3 className="font-semibold text-ink-title">Account Security</h3>
          <p className="text-xs text-ink-hint">Change email or password when needed.</p>
        </div>
        <span className="shrink-0 text-ink-hint mt-0.5">
          {open ? <ChevronUpIcon className="w-4 h-4" /> : <ChevronDownIcon className="w-4 h-4" />}
        </span>
      </button>

      {open && (
        <div className="mt-4 space-y-4">
          {successMsg && (
            <p className="rounded-xl bg-brand-50 px-3 py-2 text-xs font-medium text-brand-700">{successMsg}</p>
          )}
          {errorMsg && (
            <p className="rounded-xl bg-red-50 px-3 py-2 text-xs font-medium text-red-700">{errorMsg}</p>
          )}

          {/* Email section */}
          <div className="rounded-xl border border-surface-overlay bg-surface-muted p-3 space-y-3">
            <div>
              <h4 className="text-sm font-semibold text-ink-title">Email</h4>
              <p className="mt-1 text-xs text-ink-muted">
                We&apos;ll send a verification email before the address changes.
              </p>
            </div>
            <SecurityInput label="Email address" type="email" inputMode="email" value={emailDraft} onChange={setEmailDraft} />
            <SecurityInput label="Current password" type="password" value={emailPassword} onChange={setEmailPassword} />
            <button
              type="button"
              onClick={handleUpdateEmail}
              disabled={savingEmail}
              className="w-full rounded-xl border border-brand-200 py-2.5 text-sm font-semibold text-brand-700 disabled:opacity-40"
            >
              {savingEmail ? "Sending verification…" : "Verify new email"}
            </button>
          </div>

          {/* Password section */}
          <div className="rounded-xl border border-surface-overlay bg-surface-muted p-3 space-y-3">
            <div>
              <h4 className="text-sm font-semibold text-ink-title">Password</h4>
              <p className="mt-1 text-xs text-ink-muted">Choose a new password with at least 8 characters.</p>
            </div>
            <SecurityInput label="Current password"     type="password" value={passwordCurrent} onChange={setPasswordCurrent} />
            <SecurityInput label="New password"         type="password" value={passwordNext}    onChange={setPasswordNext} />
            <SecurityInput label="Confirm new password" type="password" value={passwordConfirm} onChange={setPasswordConfirm} />
            <button
              type="button"
              onClick={handleUpdatePassword}
              disabled={savingPassword}
              className="w-full rounded-xl border border-brand-200 py-2.5 text-sm font-semibold text-brand-700 disabled:opacity-40"
            >
              {savingPassword ? "Updating password…" : "Update password"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function SecurityInput({
  label, type, inputMode, value, onChange,
}: {
  label: string;
  type: string;
  inputMode?: "email";
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-ink-muted">{label}</span>
      <input
        type={type}
        inputMode={inputMode}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-surface-overlay px-3 py-2.5 text-sm text-ink-body focus:outline-none focus:ring-2 focus:ring-brand-500"
      />
    </label>
  );
}
