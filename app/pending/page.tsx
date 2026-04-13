"use client";

import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";

export default function PendingPage() {
  const { appUser, signOut } = useAuth();
  const router = useRouter();

  const handleSignOut = async () => {
    await signOut();
    router.replace("/signin");
  };

  return (
    <div className="min-h-screen bg-green-700 flex flex-col items-center justify-center px-6">
      <div className="text-center mb-8">
        <div className="text-6xl mb-4">⏳</div>
        <h1 className="text-2xl font-bold text-white mb-2">Awaiting approval</h1>
        <p className="text-green-200 text-sm max-w-xs">
          Hey {appUser?.displayName?.split(" ")[0] || "there"} — your request to join FourPlay has been submitted. The admin will approve you shortly.
        </p>
      </div>

      <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-6">
        <div className="space-y-4">
          <div className="flex items-center gap-3 p-4 bg-green-50 rounded-xl">
            <span className="text-2xl">✅</span>
            <div>
              <p className="font-medium text-gray-800 text-sm">Account created</p>
              <p className="text-gray-500 text-xs">{appUser?.email}</p>
            </div>
          </div>

          <div className="flex items-center gap-3 p-4 bg-amber-50 rounded-xl">
            <span className="text-2xl">⏳</span>
            <div>
              <p className="font-medium text-gray-800 text-sm">Admin approval pending</p>
              <p className="text-gray-500 text-xs">You&apos;ll get an email when approved</p>
            </div>
          </div>

          <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-xl opacity-50">
            <span className="text-2xl">🏌️</span>
            <div>
              <p className="font-medium text-gray-800 text-sm">Access granted</p>
              <p className="text-gray-500 text-xs">Start tracking your rounds</p>
            </div>
          </div>
        </div>

        <button
          onClick={handleSignOut}
          className="w-full mt-6 py-3 border border-gray-200 rounded-xl text-gray-500 text-sm hover:bg-gray-50 transition-colors"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
