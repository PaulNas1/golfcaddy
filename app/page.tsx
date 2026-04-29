"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";

export default function RootPage() {
  const { firebaseUser, appUser, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!firebaseUser) return; // stay on landing
    if (appUser?.status === "pending") router.replace("/pending");
    else if (appUser?.status === "active") router.replace("/home");
  }, [loading, firebaseUser, appUser, router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-green-700 flex items-center justify-center">
        <p className="text-green-200 text-sm">Loading GolfCaddy...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-green-700 flex flex-col">
      {/* Hero */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 pt-20 pb-12">
        <div className="text-center mb-12">
          <div className="text-7xl mb-4">⛳</div>
          <h1 className="text-4xl font-bold text-white tracking-tight">GolfCaddy</h1>
          <p className="text-green-200 mt-2 text-base">Social golf, simplified.</p>
        </div>

        <div className="w-full max-w-xs space-y-3">
          <Link
            href="/signin"
            className="block w-full bg-white text-green-700 font-semibold text-base py-3.5 rounded-2xl text-center shadow-lg hover:bg-green-50 transition-colors"
          >
            Sign in to your group
          </Link>
          <Link
            href="/create-group"
            className="block w-full bg-green-600 border border-green-400 text-white font-semibold text-base py-3.5 rounded-2xl text-center hover:bg-green-500 transition-colors"
          >
            Create Social Group Account
          </Link>
        </div>
      </div>

      {/* Footer */}
      <div className="text-center pb-10 px-6">
        <p className="text-green-300 text-xs">
          Running your own social golf group?{" "}
          <span className="text-green-100 font-medium">
            Ask your organiser to set up GolfCaddy.
          </span>
        </p>
      </div>
    </div>
  );
}
