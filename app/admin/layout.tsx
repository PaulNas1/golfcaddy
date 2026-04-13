"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { appUser, loading, isAdmin } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!appUser || !isAdmin) {
      router.replace("/home");
    }
  }, [loading, appUser, isAdmin, router]);

  if (loading || !isAdmin) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-400 text-sm">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 max-w-lg mx-auto">
      {/* Admin header */}
      <header className="bg-gray-900 text-white px-4 py-3 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-2">
          <span className="text-lg">⚙️</span>
          <span className="font-bold">Admin</span>
        </div>
        <Link href="/home" className="text-gray-400 hover:text-white text-sm transition-colors">
          ← Back to app
        </Link>
      </header>

      {/* Admin nav */}
      <nav className="bg-white border-b border-gray-200 px-4">
        <div className="flex overflow-x-auto gap-1 py-2">
          {[
            { href: "/admin", label: "Dashboard" },
            { href: "/admin/rounds", label: "Rounds" },
            { href: "/admin/members", label: "Members" },
          ].map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className="flex-shrink-0 text-sm font-medium px-3 py-1.5 rounded-lg text-gray-600 hover:bg-gray-100 hover:text-gray-800 transition-colors"
            >
              {label}
            </Link>
          ))}
        </div>
      </nav>

      <main className="p-4">{children}</main>
    </div>
  );
}
