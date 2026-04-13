"use client";

import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";

export default function ProfilePage() {
  const { appUser, signOut } = useAuth();
  const router = useRouter();

  const handleSignOut = async () => {
    await signOut();
    router.replace("/signin");
  };

  return (
    <div className="px-4 py-6 space-y-4">
      <h1 className="text-2xl font-bold text-gray-800">Profile</h1>

      {/* Member card */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center text-2xl font-bold text-green-700">
            {appUser?.displayName?.charAt(0).toUpperCase() || "?"}
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-800">{appUser?.displayName}</h2>
            <p className="text-gray-500 text-sm">{appUser?.email}</p>
            <span className="mt-1 inline-block text-xs font-medium px-2 py-0.5 bg-green-100 text-green-700 rounded-full capitalize">
              {appUser?.role}
            </span>
          </div>
        </div>
      </div>

      {/* Stats placeholder */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
        <h3 className="font-semibold text-gray-800 mb-3">My Stats</h3>
        <div className="flex flex-col items-center py-8 text-gray-400">
          <div className="text-4xl mb-2">📊</div>
          <p className="text-sm">Stats available after Round 1</p>
        </div>
      </div>

      {/* Sign out */}
      <button
        onClick={handleSignOut}
        className="w-full py-3 border border-gray-200 rounded-2xl text-gray-600 text-sm font-medium hover:bg-gray-50 transition-colors"
      >
        Sign out
      </button>
    </div>
  );
}
