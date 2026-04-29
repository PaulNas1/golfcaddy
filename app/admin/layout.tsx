"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { appUser, loading, canAccessAdmin, isAdmin } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (loading) return;
    if (!appUser || !canAccessAdmin) {
      router.replace("/home");
    }
  }, [loading, appUser, canAccessAdmin, router]);

  if (loading || !canAccessAdmin) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-400 text-sm">Loading...</div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-gray-50 max-w-lg mx-auto flex flex-col overflow-hidden">
      <header className="bg-gray-900 text-white px-4 py-3 flex items-center justify-between z-20 shrink-0">
        <div className="flex items-center gap-2">
          <AdminIcon className="h-5 w-5 text-green-300" />
          <span className="font-bold">Admin</span>
        </div>
        <Link href="/home" className="text-gray-400 hover:text-white text-sm transition-colors">
          ← Back to app
        </Link>
      </header>

      <nav className="border-b border-gray-100 bg-white px-4 py-3 shrink-0">
        <div className="flex gap-2 overflow-x-auto">
          {adminNavItems
            .filter(({ adminOnly }) => !adminOnly || isAdmin)
            .map(({ href, label, Icon }) => {
            const active =
              href === "/admin" ? pathname === href : pathname.startsWith(href);

            return (
            <Link
              key={href}
              href={href}
              className={`flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors ${
                active
                  ? "border-green-200 bg-green-50 text-green-800"
                  : "border-gray-100 bg-gray-50 text-gray-600 hover:bg-gray-100 hover:text-gray-800"
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
            );
          })}
        </div>
      </nav>

      <main className="flex-1 overflow-y-auto p-4">{children}</main>
    </div>
  );
}

const adminNavItems = [
  { href: "/admin", label: "Dashboard", Icon: DashboardIcon },
  { href: "/admin/rounds", label: "Rounds", Icon: RoundsIcon },
  { href: "/admin/members", label: "Members", Icon: MembersIcon },
  { href: "/admin/settings", label: "Settings", Icon: SettingsIcon, adminOnly: true },
];

function AdminIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h3m-7 4.5h11m-9 4.5h7m-10.5 6h15a1.5 1.5 0 0 0 1.5-1.5v-15A1.5 1.5 0 0 0 20 3H5a1.5 1.5 0 0 0-1.5 1.5v15A1.5 1.5 0 0 0 5 21Z" />
    </svg>
  );
}

function DashboardIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 13h6V4H4v9Zm0 7h6v-4H4v4Zm10 0h6v-9h-6v9Zm0-13h6V4h-6v3Z" />
    </svg>
  );
}

function RoundsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 4v16M7 5h9l-1.5 3L16 11H7" />
    </svg>
  );
}

function MembersIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19a6 6 0 0 0-12 0m9-10a4 4 0 1 1-8 0 4 4 0 0 1 8 0Zm8 10a4.5 4.5 0 0 0-4-4.48m1.5-8.02a3 3 0 0 1 0 5.66" />
    </svg>
  );
}

function SettingsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8.25a3.75 3.75 0 1 0 0 7.5 3.75 3.75 0 0 0 0-7.5Zm8.25 3.75a8.2 8.2 0 0 0-.08-1.13l2.08-1.62-2-3.46-2.46.99a8.68 8.68 0 0 0-1.96-1.13L15.45 3h-3.9l-.38 2.65a8.68 8.68 0 0 0-1.96 1.13l-2.46-.99-2 3.46 2.08 1.62a8.2 8.2 0 0 0 0 2.26L4.75 14.75l2 3.46 2.46-.99a8.68 8.68 0 0 0 1.96 1.13l.38 2.65h3.9l.38-2.65a8.68 8.68 0 0 0 1.96-1.13l2.46.99 2-3.46-2.08-1.62c.05-.37.08-.75.08-1.13Z" />
    </svg>
  );
}
