"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { getGroup, subscribeNotifications } from "@/lib/firestore";
import type { Group } from "@/types";

const NAV_ITEMS = [
  { href: "/home", label: "Home", icon: HomeIcon },
  { href: "/rounds", label: "Rounds", icon: FlagIcon },
  { href: "/leaderboard", label: "Ladder", icon: TrophyIcon },
  { href: "/feed", label: "Feed", icon: ChatIcon },
  { href: "/photos", label: "Photos", icon: PhotoIcon },
  { href: "/profile", label: "Profile", icon: UserIcon },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { firebaseUser, appUser, loading, canAccessAdmin } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const contentRef = useRef<HTMLElement | null>(null);
  const [group, setGroup] = useState<Group | null>(null);
  const [hasUnreadNotifications, setHasUnreadNotifications] = useState(false);

  useEffect(() => {
    if (!appUser?.groupId || appUser.status !== "active") return;
    getGroup(appUser.groupId)
      .then(setGroup)
      .catch(() => setGroup(null));
  }, [appUser?.groupId, appUser?.status]);

  useEffect(() => {
    if (!appUser?.uid || appUser.status !== "active") {
      setHasUnreadNotifications(false);
      return;
    }

    return subscribeNotifications(
      appUser.uid,
      (notifications) => {
        setHasUnreadNotifications(notifications.some((notification) => !notification.read));
      },
      {
        limitCount: 20,
        onError: () => setHasUnreadNotifications(false),
      }
    );
  }, [appUser?.status, appUser?.uid]);

  useEffect(() => {
    if (loading) return;

    if (!firebaseUser) {
      router.replace("/signin");
      return;
    }
    if (appUser?.status === "pending") {
      router.replace("/pending");
      return;
    }
    if (appUser?.status !== "active") {
      router.replace("/signin");
    }
  }, [loading, firebaseUser, appUser, router]);

  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0, behavior: "auto" });
  }, [pathname]);

  if (loading || !appUser || appUser.status !== "active") {
    return (
      <div className="min-h-screen bg-green-700 flex items-center justify-center">
        <div className="text-white text-center">
          <div className="text-4xl mb-2">⛳</div>
          <p className="text-green-200 text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col max-w-lg mx-auto">
      {/* Top bar */}
      <header className="bg-green-700 text-white px-4 py-3 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-2">
          {group?.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={group.logoUrl}
              alt=""
              className="h-7 w-7 rounded-lg object-cover"
            />
          ) : (
            <span className="text-xl">⛳</span>
          )}
          <span className="font-bold text-lg">
            {group?.name ?? "GolfCaddy"}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {canAccessAdmin && (
            <Link
              href="/admin"
              className="bg-white/20 hover:bg-white/30 text-white text-xs font-medium px-3 py-1 rounded-full transition-colors"
            >
              Admin
            </Link>
          )}
          <Link
            href="/notifications"
            className="relative p-1"
            aria-label="Notifications"
          >
            <BellIcon className="w-6 h-6" />
            {hasUnreadNotifications && (
              <span className="absolute right-0 top-0 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-green-700" />
            )}
          </Link>
        </div>
      </header>

      {/* Page content */}
      <main ref={contentRef} className="flex-1 overflow-y-auto pb-20">
        {children}
      </main>

      {/* Bottom nav */}
      <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-lg bg-white border-t border-gray-200 z-20">
        <div className="flex">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(href + "/");
            return (
              <Link
                key={href}
                href={href}
                className={`flex-1 flex flex-col items-center py-2 gap-0.5 transition-colors ${
                  active ? "text-green-600" : "text-gray-400 hover:text-gray-600"
                }`}
              >
                <Icon className="w-6 h-6" />
                <span className="text-[10px] font-medium">{label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

// ─── Icons ───────────────────────────────────────────────────────────────────

function HomeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  );
}

function FlagIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 21V4a1 1 0 011-1h13l-3 4 3 4H4" />
    </svg>
  );
}

function TrophyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
    </svg>
  );
}

function ChatIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
    </svg>
  );
}

function UserIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  );
}

function PhotoIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 7a2 2 0 012-2h12a2 2 0 012 2v10a2 2 0 01-2 2H6a2 2 0 01-2-2V7z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 13l2.5-2.5a1.5 1.5 0 012.121 0L17 15" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.5 9.5h.01" />
    </svg>
  );
}

function BellIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
    </svg>
  );
}
