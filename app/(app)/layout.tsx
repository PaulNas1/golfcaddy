"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { useGroupData, GroupDataProvider } from "@/contexts/GroupDataContext";
import { subscribeNotifications } from "@/lib/firestore";

// Tab page components — imported directly so they stay permanently mounted
import HomePage from "@/app/(app)/home/page";
import RoundsPage from "@/app/(app)/rounds/page";
import LeaderboardPage from "@/app/(app)/leaderboard/page";
import FeedPage from "@/app/(app)/feed/page";
import PhotosPage from "@/app/(app)/photos/page";
import ProfilePage from "@/app/(app)/profile/page";

const NAV_ITEMS = [
  { href: "/home", label: "Home", icon: HomeIcon },
  { href: "/rounds", label: "Rounds", icon: FlagIcon },
  { href: "/leaderboard", label: "Ladder", icon: TrophyIcon },
  { href: "/feed", label: "Feed", icon: ChatIcon },
  { href: "/photos", label: "Photos", icon: PhotoIcon },
  { href: "/profile", label: "Profile", icon: UserIcon },
];

// Exact pathnames that map to a bottom-nav tab.
// Any other pathname (e.g. /rounds/abc123, /notifications) is a sub-route
// and gets rendered via Next.js `children` normally.
const TAB_PATHS = new Set(["/home", "/rounds", "/leaderboard", "/feed", "/photos", "/profile"]);

/** Return the tab that "owns" the given pathname (handles sub-routes too). */
function resolveActiveTab(path: string): string {
  if (TAB_PATHS.has(path)) return path;
  const match = NAV_ITEMS.find(({ href }) => path.startsWith(href + "/"));
  return match ? match.href : "/home";
}

function AppLayoutInner({ children }: { children: React.ReactNode }) {
  const { firebaseUser, appUser, loading, canAccessAdmin } = useAuth();
  const { group } = useGroupData();
  const router = useRouter();
  const pathname = usePathname();
  const contentRef = useRef<HTMLElement | null>(null);
  const [hasUnreadNotifications, setHasUnreadNotifications] = useState(false);

  // activeTab drives which tab div is visible. It is updated *immediately* on
  // tap so the UI responds in the same frame — no waiting for Next.js router.
  const [activeTab, setActiveTab] = useState(() => resolveActiveTab(pathname));

  // isOnSubRoute hides the parent tab page when a sub-route (e.g. /rounds/abc123)
  // is active so the list and the detail are never both visible at once.
  // Stored in state (not derived from pathname) so handleTabTap can clear it
  // synchronously — preventing a blank flash when tapping Back to the tab list.
  const [isOnSubRoute, setIsOnSubRoute] = useState(() => !TAB_PATHS.has(pathname));

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

  // Keep activeTab and isOnSubRoute in sync with URL-driven changes
  // (browser back/forward, deep links, auth redirects) that bypass the tap handler.
  useEffect(() => {
    setActiveTab(resolveActiveTab(pathname));
    setIsOnSubRoute(!TAB_PATHS.has(pathname));
  }, [pathname]);

  // Scroll to top on every tab switch or sub-route navigation.
  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0, behavior: "auto" });
  }, [activeTab, pathname]);

  // Navigate to a tab: flip display state immediately, then push URL.
  const handleTabTap = (href: string) => {
    setActiveTab(href);      // instant — same render frame as the tap
    setIsOnSubRoute(false);  // instant — hide sub-route content, show tab list
    router.push(href);       // updates URL / browser history
  };

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
    <div className="h-screen bg-gray-50 flex flex-col max-w-lg mx-auto overflow-hidden">
      {/* Top bar */}
      <header className="bg-green-700 text-white px-4 py-3 flex items-center justify-between z-20 shrink-0">
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
        {/*
          Virtual tabs: all six pages are permanently mounted in the React tree
          and toggled with CSS display. This means Firestore subscriptions stay
          alive, state is preserved, and switching between tabs is instantaneous —
          identical to how native mobile apps handle tab bars.

          FeedPage uses useSearchParams() and needs a Suspense boundary.
        */}
        {/* Tab display is driven by activeTab, NOT pathname.
            activeTab updates synchronously on tap so there is zero
            perceived delay — the CSS flip happens in the same frame. */}
        <div style={{ display: activeTab === "/home" && !isOnSubRoute ? "block" : "none" }}>
          <HomePage />
        </div>
        <div style={{ display: activeTab === "/rounds" && !isOnSubRoute ? "block" : "none" }}>
          <RoundsPage />
        </div>
        <div style={{ display: activeTab === "/leaderboard" && !isOnSubRoute ? "block" : "none" }}>
          <LeaderboardPage />
        </div>
        <Suspense fallback={null}>
          <div style={{ display: activeTab === "/feed" && !isOnSubRoute ? "block" : "none" }}>
            <FeedPage />
          </div>
        </Suspense>
        <div style={{ display: activeTab === "/photos" && !isOnSubRoute ? "block" : "none" }}>
          <PhotosPage />
        </div>
        <div style={{ display: activeTab === "/profile" && !isOnSubRoute ? "block" : "none" }}>
          <ProfilePage />
        </div>

        {/* Sub-routes (round detail, notifications, admin, etc.)
            render via Next.js children. isOnSubRoute hides the parent tab above. */}
        {isOnSubRoute && children}
      </main>

      {/* Bottom nav — buttons instead of Links so handleTabTap fires
          synchronously without a router transition delay. */}
      <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-lg bg-white border-t border-gray-200 z-20">
        <div className="flex">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active = activeTab === href;
            return (
              <button
                key={href}
                type="button"
                onClick={() => handleTabTap(href)}
                className={`flex-1 flex flex-col items-center py-2 gap-0.5 transition-colors ${
                  active ? "text-green-600" : "text-gray-400"
                }`}
              >
                <Icon className="w-6 h-6" />
                <span className="text-[10px] font-medium">{label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <GroupDataProvider>
      <AppLayoutInner>{children}</AppLayoutInner>
    </GroupDataProvider>
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
