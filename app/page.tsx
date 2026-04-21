"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";

export default function RootPage() {
  const { firebaseUser, appUser, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    if (!firebaseUser) {
      router.replace("/signin");
    } else if (appUser?.status === "pending") {
      router.replace("/pending");
    } else if (appUser?.status === "active") {
      router.replace("/home");
    } else {
      router.replace("/signin");
    }
  }, [loading, firebaseUser, appUser, router]);

  return (
    <div className="min-h-screen bg-green-700 flex items-center justify-center">
      <div className="text-white text-center">
        <div className="text-4xl mb-2">⛳</div>
        <p className="text-green-200 text-sm">Loading GolfCaddy...</p>
      </div>
    </div>
  );
}
