"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import type { UserGender } from "@/types";

const DATE_INPUT_CLASSNAME =
  "w-full rounded-xl border border-gray-200 px-4 py-3 text-left text-base text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500 [&::-webkit-date-and-time-value]:block [&::-webkit-date-and-time-value]:text-left";

export default function SignUpPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-green-700 flex items-center justify-center">
          <div className="text-sm text-green-100">Loading signup...</div>
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
  const invitedName = searchParams.get("name") ?? "";
  const invitedContact = searchParams.get("contact") ?? "";
  const invitedEmail = invitedContact.includes("@") ? invitedContact : "";
  const inviteId = searchParams.get("invite") ?? "";
  const groupId = searchParams.get("groupId") ?? "fourplay";
  const groupName = searchParams.get("groupName") ?? "your golf group";
  const [name, setName] = useState(invitedName);
  const [email, setEmail] = useState(invitedEmail);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [nickname, setNickname] = useState("");
  const [mobileNumber, setMobileNumber] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [gender, setGender] = useState<UserGender | "">("");
  const [usesSeniorTees, setUsesSeniorTees] = useState(false);
  const [usesProBackTees, setUsesProBackTees] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setLoading(true);
    try {
      await signUp(email, password, name.trim(), {
        groupId,
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

  return (
    <div className="min-h-screen bg-green-700 flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-center px-6 pt-16 pb-8">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">⛳</div>
          <h1 className="text-2xl font-bold text-white">GolfCaddy</h1>
          <p className="text-green-200 mt-1 text-sm">
            Request access to {groupName}
          </p>
        </div>

        <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-6">
          <h2 className="text-xl font-bold text-gray-800 mb-2">Create account</h2>
          <p className="text-gray-500 text-sm mb-6">
            An admin will review and approve your request before you can access
            the app.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Full name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full px-4 py-3 rounded-xl border border-gray-200 text-gray-800 text-base focus:outline-none focus:ring-2 focus:ring-green-500"
                placeholder="Paul Smith"
                autoComplete="name"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
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
                placeholder="Min 8 characters"
                autoComplete="new-password"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Confirm password
              </label>
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

            <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
              <div className="mb-3">
                <h3 className="text-sm font-semibold text-gray-800">
                  Player profile
                </h3>
                <p className="mt-1 text-xs text-gray-500">
                  Optional, but recommended so admins can assign tees properly.
                </p>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nickname
                  </label>
                  <input
                    type="text"
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 text-gray-800 text-base focus:outline-none focus:ring-2 focus:ring-green-500"
                    placeholder="Optional nickname"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Mobile number
                  </label>
                  <input
                    type="tel"
                    value={mobileNumber}
                    onChange={(e) => setMobileNumber(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 text-gray-800 text-base focus:outline-none focus:ring-2 focus:ring-green-500"
                    placeholder="Optional mobile"
                    autoComplete="tel"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Date of birth
                  </label>
                  <input
                    type="date"
                    value={dateOfBirth}
                    onChange={(e) => setDateOfBirth(e.target.value)}
                    className={DATE_INPUT_CLASSNAME}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Gender
                  </label>
                  <select
                    value={gender}
                    onChange={(e) => setGender(e.target.value as UserGender | "")}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 text-gray-800 text-base focus:outline-none focus:ring-2 focus:ring-green-500"
                  >
                    <option value="">Not set</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                  </select>
                </div>

                <label className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3">
                  <span className="text-sm font-medium text-gray-700">
                    I usually play senior tees
                  </span>
                  <input
                    type="checkbox"
                    checked={usesSeniorTees}
                    onChange={(e) => setUsesSeniorTees(e.target.checked)}
                    className="h-5 w-5 rounded border-gray-300 text-green-600"
                  />
                </label>

                <label className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3">
                  <span className="text-sm font-medium text-gray-700">
                    I usually play pro/back tees
                  </span>
                  <input
                    type="checkbox"
                    checked={usesProBackTees}
                    onChange={(e) => setUsesProBackTees(e.target.checked)}
                    className="h-5 w-5 rounded border-gray-300 text-green-600"
                  />
                </label>
              </div>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-700 text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white font-semibold py-3 rounded-xl text-base transition-colors"
            >
              {loading ? "Submitting..." : "Request access"}
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
      </div>
    </div>
  );
}
