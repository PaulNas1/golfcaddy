"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { parseFirebaseAuthError } from "@/lib/authErrors";

export default function ForgotPasswordPage() {
  const { resetPassword } = useAuth();
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    // Mobile keyboards routinely autofill a trailing space and capitalise the
    // first letter. Firebase stores emails lowercased, so normalise here the
    // same way sign-in does.
    const address = email.trim().toLowerCase();
    try {
      await resetPassword(address);
      setSentTo(address);
    } catch (err) {
      // Firebase only ever fails this call for a real reason (bad address,
      // rate limit, misconfigured project). Log it — without this there is no
      // way to tell a delivery problem from a rejected request.
      console.error("[forgot-password] reset email failed", err);
      // With email enumeration protection on (the Firebase default) an unknown
      // address resolves successfully instead of throwing. Show the same
      // neutral screen when it's off so the flow doesn't leak which addresses
      // have accounts — and doesn't read as a bug to the person resetting.
      if ((err as { code?: string } | null)?.code === "auth/user-not-found") {
        setSentTo(address);
      } else {
        setError(parseFirebaseAuthError(err));
      }
    } finally {
      setLoading(false);
    }
  };

  const tryAnotherAddress = () => {
    setSentTo(null);
    setEmail("");
    setError("");
  };

  return (
    <div className="min-h-screen bg-green-700 flex flex-col items-center justify-center px-6">
      <div className="text-center mb-8">
        <div className="text-5xl mb-3">🔑</div>
        <h1 className="text-2xl font-bold text-white">Reset password</h1>
      </div>

      <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-6">
        {sentTo ? (
          <div className="text-center">
            <div className="text-4xl mb-3">📧</div>
            <h2 className="text-lg font-bold text-gray-800 mb-2">Check your email</h2>
            {/*
              Firebase's email enumeration protection makes this call succeed
              whether or not an account exists, so we can't honestly promise a
              message is on its way to this address.
            */}
            <p className="text-gray-500 text-sm mb-4">
              If an account exists for{" "}
              <span className="font-semibold text-gray-700 break-all">{sentTo}</span>, a
              reset link is on its way.
            </p>
            <p className="text-gray-500 text-sm mb-6">
              It can take a few minutes. If it hasn&apos;t arrived, check your junk or spam
              folder — and make sure that&apos;s the address you signed up with.
            </p>
            <Link
              href="/signin"
              className="block w-full bg-green-600 text-white font-semibold py-3 rounded-xl text-center"
            >
              Back to sign in
            </Link>
            <button
              type="button"
              onClick={tryAnotherAddress}
              className="mt-3 w-full text-green-600 text-sm hover:underline"
            >
              Try a different email
            </button>
          </div>
        ) : (
          <>
            <h2 className="text-xl font-bold text-gray-800 mb-2">Forgot password?</h2>
            <p className="text-gray-500 text-sm mb-6">
              Enter your email and we&apos;ll send you a reset link.
            </p>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-gray-800 text-base focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="you@example.com"
                />
              </div>
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-700 text-sm">
                  {error}
                </div>
              )}
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white font-semibold py-3 rounded-xl transition-colors"
              >
                {loading ? "Sending..." : "Send reset link"}
              </button>
            </form>
            <div className="mt-4 text-center">
              <Link href="/signin" className="text-green-600 text-sm hover:underline">
                Back to sign in
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
