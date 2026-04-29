"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { getGroupBySlug } from "@/lib/firestore";
import type { Group } from "@/types";

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

  return (
    <div className="min-h-screen bg-green-700 flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-center px-6 pt-16 pb-8">

        {/* Brand */}
        <div className="text-center mb-10">
          <div className="text-6xl mb-3">⛳</div>
          <h1 className="text-3xl font-bold text-white">GolfCaddy</h1>
          <p className="text-green-200 mt-1 text-sm">Social golf groups</p>
        </div>

        {/* Step 1 – Find group */}
        {step === 1 && (
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-6">
            <h2 className="text-xl font-bold text-gray-800 mb-1">Find your group</h2>
            <p className="text-gray-500 text-sm mb-6">
              Enter your social golf group name to get started.
            </p>

            <form onSubmit={handleGroupLookup} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Group name
                </label>
                <input
                  type="text"
                  value={groupInput}
                  onChange={(e) => setGroupInput(e.target.value)}
                  required
                  autoFocus
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-gray-800 text-base focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="e.g. Four Play"
                />
              </div>

              {groupError && (
                <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-700 text-sm">
                  {groupError}
                </div>
              )}

              <button
                type="submit"
                disabled={lookingUp || !groupInput.trim()}
                className="w-full bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white font-semibold py-3 rounded-xl text-base transition-colors"
              >
                {lookingUp ? "Looking up..." : "Continue"}
              </button>
            </form>

            <div className="mt-6 pt-6 border-t border-gray-100 text-center">
              <p className="text-gray-500 text-sm">
                New member?{" "}
                <Link href="/signup" className="text-green-600 font-medium hover:underline">
                  Request access
                </Link>
              </p>
            </div>
          </div>
        )}

        {/* Step 2 – Sign in */}
        {step === 2 && foundGroup && (
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-6">
            {/* Group badge */}
            <button
              onClick={() => { setStep(1); setSignInError(""); }}
              className="flex items-center gap-2 mb-5 group"
            >
              {foundGroup.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={foundGroup.logoUrl}
                  alt=""
                  className="h-8 w-8 rounded-lg object-cover"
                />
              ) : (
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-green-100 text-base">
                  ⛳
                </span>
              )}
              <span className="text-sm font-semibold text-gray-700 group-hover:text-green-600 transition-colors">
                {foundGroup.name}
              </span>
              <span className="text-xs text-gray-400 group-hover:text-green-500 transition-colors">
                ✕ change
              </span>
            </button>

            <h2 className="text-xl font-bold text-gray-800 mb-6">Sign in</h2>

            <form onSubmit={handleSignIn} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-gray-800 text-base focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="you@example.com"
                  autoComplete="email"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-gray-800 text-base focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="••••••••"
                  autoComplete="current-password"
                />
              </div>

              {signInError && (
                <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-700 text-sm">
                  {signInError}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white font-semibold py-3 rounded-xl text-base transition-colors"
              >
                {submitting ? "Signing in..." : "Sign in"}
              </button>
            </form>

            <div className="mt-4 text-center">
              <Link
                href="/forgot-password"
                className="text-green-600 text-sm hover:underline"
              >
                Forgot password?
              </Link>
            </div>

            <div className="mt-6 pt-6 border-t border-gray-100 text-center">
              <p className="text-gray-500 text-sm">
                New member?{" "}
                <Link href="/signup" className="text-green-600 font-medium hover:underline">
                  Request access
                </Link>
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
