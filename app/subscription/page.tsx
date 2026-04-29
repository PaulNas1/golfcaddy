"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";

export default function SubscriptionWallPage() {
  const { appUser, loading, signOut } = useAuth();
  const router = useRouter();

  // If the group's subscription is restored, send them back in.
  // Also handle edge cases where user shouldn't be here.
  useEffect(() => {
    if (loading) return;
    if (!appUser) {
      router.replace("/signin");
    }
  }, [loading, appUser, router]);

  const handleSignOut = async () => {
    await signOut();
    router.replace("/signin");
  };

  return (
    <div className="min-h-screen bg-green-700 flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-8 text-center">
        {/* Icon */}
        <div className="text-5xl mb-4">🔒</div>

        {/* Heading */}
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          Account Suspended
        </h1>

        {/* Body */}
        <p className="text-gray-500 text-sm leading-relaxed mb-6">
          Your group&apos;s GolfCaddy access has been suspended. Please contact
          your group organiser or reach out to GolfCaddy support to resolve
          this.
        </p>

        {/* Group info */}
        {appUser?.groupId && (
          <div className="bg-gray-50 rounded-xl px-4 py-3 mb-6 text-left">
            <p className="text-xs text-gray-400 mb-0.5">Group</p>
            <p className="text-sm font-semibold text-gray-700">{appUser.groupId}</p>
          </div>
        )}

        {/* Contact */}
        <a
          href="mailto:support@golfcaddy.app"
          className="block w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3 rounded-xl text-sm transition-colors mb-3"
        >
          Contact Support
        </a>

        <button
          type="button"
          onClick={handleSignOut}
          className="block w-full text-gray-400 hover:text-gray-600 text-sm transition-colors py-2"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
