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
      // Create Firebase Auth user — this signs them in automatically
      const { user } = await createUserWithEmailAndPassword(auth, adminEmail.trim(), password);

      // Write group + user + member docs in one batch
      await createGroup({
        name: groupName.trim(),
        slug,
        adminUid: user.uid,
        adminDisplayName: adminName.trim(),
        adminEmail: adminEmail.trim(),
      });

      // onAuthStateChanged picks up the new user and appUser becomes active → redirects to /home
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
      <div className="min-h-screen bg-green-700 flex items-center justify-center">
        <p className="text-green-200 text-sm">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-green-700 flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-center px-6 pt-16 pb-8">

        {/* Brand */}
        <div className="text-center mb-10">
          <div className="text-6xl mb-3">⛳</div>
          <h1 className="text-3xl font-bold text-white">GolfCaddy</h1>
          <p className="text-green-200 mt-1 text-sm">Create your social golf group</p>
        </div>

        {/* Step 1 – Group details */}
        {step === 1 && (
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-6">
            <h2 className="text-xl font-bold text-gray-800 mb-1">Group details</h2>
            <p className="text-gray-500 text-sm mb-6">
              Give your social golf group a name. Members will use this to find and join your group.
            </p>

            <form onSubmit={handleStep1} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Group name
                </label>
                <input
                  type="text"
                  value={groupName}
                  onChange={(e) => { setGroupName(e.target.value); setSlugError(""); }}
                  required
                  autoFocus
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-gray-800 text-base focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="e.g. Four Play"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Group ID
                  <span className="ml-1 text-xs font-normal text-gray-400">(used in invite links)</span>
                </label>
                <div className="flex items-center rounded-xl border border-gray-200 overflow-hidden focus-within:ring-2 focus-within:ring-green-500">
                  <span className="px-3 py-3 bg-gray-50 text-gray-400 text-sm border-r border-gray-200 select-none">
                    gc/
                  </span>
                  <input
                    type="text"
                    value={slug}
                    onChange={(e) => handleSlugChange(e.target.value)}
                    required
                    className="flex-1 px-3 py-3 text-gray-800 text-base focus:outline-none bg-white"
                    placeholder="four-play"
                  />
                </div>
                <p className="mt-1 text-xs text-gray-400">
                  Lowercase letters, numbers, and hyphens only.
                </p>
              </div>

              {slugError && (
                <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-700 text-sm">
                  {slugError}
                </div>
              )}

              <button
                type="submit"
                disabled={checkingSlug || !groupName.trim() || !slug}
                className="w-full bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white font-semibold py-3 rounded-xl text-base transition-colors"
              >
                {checkingSlug ? "Checking..." : "Continue"}
              </button>
            </form>

            <div className="mt-6 pt-6 border-t border-gray-100 text-center">
              <p className="text-gray-500 text-sm">
                Already have an account?{" "}
                <Link href="/signin" className="text-green-600 font-medium hover:underline">
                  Sign in
                </Link>
              </p>
            </div>
          </div>
        )}

        {/* Step 2 – Admin account */}
        {step === 2 && (
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-6">
            {/* Group badge */}
            <button
              onClick={() => { setStep(1); setError(""); }}
              className="flex items-center gap-2 mb-5 group"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-green-100 text-base">
                ⛳
              </span>
              <span className="text-sm font-semibold text-gray-700 group-hover:text-green-600 transition-colors">
                {groupName}
              </span>
              <span className="text-xs font-mono text-gray-400 group-hover:text-green-500 transition-colors">
                gc/{slug} · change
              </span>
            </button>

            <h2 className="text-xl font-bold text-gray-800 mb-1">Your admin account</h2>
            <p className="text-gray-500 text-sm mb-6">
              You will be the group organiser and admin. You can invite members once you&rsquo;re set up.
            </p>

            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Your name</label>
                <input
                  type="text"
                  value={adminName}
                  onChange={(e) => setAdminName(e.target.value)}
                  required
                  autoFocus
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-gray-800 text-base focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="Paul Smith"
                  autoComplete="name"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                  required
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-gray-800 text-base focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="you@example.com"
                  autoComplete="email"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-gray-800 text-base focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="Min 8 characters"
                  autoComplete="new-password"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Confirm password</label>
                <input
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-gray-800 text-base focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="••••••••"
                  autoComplete="new-password"
                />
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-700 text-sm">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white font-semibold py-3 rounded-xl text-base transition-colors"
              >
                {submitting ? "Creating group..." : "Create group"}
              </button>
            </form>

            <div className="mt-6 pt-6 border-t border-gray-100 text-center">
              <p className="text-gray-500 text-sm">
                Already have an account?{" "}
                <Link href="/signin" className="text-green-600 font-medium hover:underline">
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
