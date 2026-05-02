"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { useGroupData, GroupDataProvider } from "@/contexts/GroupDataContext";
import { subscribeNotifications } from "@/lib/firestore";
import Avatar from "@/components/ui/Avatar";
import {
  HomeIcon,
  FlagIcon,
  TrophyIcon,
  ChatIcon,
  PhotoIcon,
  UserIcon,
  BellIcon,
} from "@/components/ui/icons";

// Tab page components — imported directly so they stay permanently mounted.
// This means Firestore subscriptions stay alive and tab switches are instant —
// identical to how native mobile apps handle tab bars.
import HomePage from "@/app/(app)/home/page";
import RoundsPage from "@/app/(app)/rounds/page";
import LeaderboardPage from "@/app/(app)/leaderboard/page";
import FeedPage from "@/app/(app)/feed/page";
import PhotosPage from "@/app/(app)/photos/page";
import ProfilePage from "@/app/(app)/profile/page";

const NAV_ITEMS = [
  { href: "/home",        label: "Home",   icon: HomeIcon },
  { href: "/rounds",      label: "Rounds", icon: FlagIcon },
  { href: "/leaderboard", label: "Ladder", icon: TrophyIcon },
  { href: "/feed",        label: "Feed",   icon: ChatIcon },
  { href: "/photos",      label: "Photos", icon: PhotoIcon },
  { href: "/profile",     label: "Profile",icon: UserIcon },
];

// Exact pathnames that map to a bottom-nav tab.
// Any other pathname (e.g. /rounds/abc123, /notifications) is a sub-route
// and renders via Next.js `children` normally.
const TAB_PATHS = new Set(NAV_ITEMS.map((item) => item.href));

/** Returns the tab that "owns" the given pathname (handles sub-routes too). */
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

  // activeTab drives which tab div is visible. Updated immediately on tap
  // so the UI responds in the same frame — no waiting for the Next.js router.
  const [activeTab, setActiveTab] = useState(() => resolveActiveTab(pathname));

  // isOnSubRoute hides the parent tab page when a sub-route is active
  // so the list and detail are never visible simultaneously.
  const [isOnSubRoute, setIsOnSubRoute] = useState(() => !TAB_PATHS.has(pathname));

  useEffect(() => {
    if (!appUser?.uid || appUser.status !== "active") {
      setHasUnreadNotifications(false);
      return;
    }

    return subscribeNotifications(
      appUser.uid,
      (notifications) => {
        setHasUnreadNotifications(notifications.some((n) => !n.read));
      },
      {
        limitCount: 20,
        onError: () => setHasUnreadNotifications(false),
      }
    );
  }, [appUser?.status, appUser?.uid]);

  // Auth & status redirect guards
  useEffect(() => {
    if (loading) return;
    if (!firebaseUser) { router.replace("/signin"); return; }
    if (appUser?.status === "pending") { router.replace("/pending"); return; }
    if (appUser?.status !== "active") { router.replace("/signin"); }
  }, [loading, firebaseUser, appUser, router]);

  // Subscription gate — redirect suspended groups to the wall page.
  useEffect(() => {
    if (!group) return;
    if (appUser?.platformAdmin) return;
    if (group.subscription?.status === "suspended") {
      router.replace("/subscription");
    }
  }, [group, appUser?.platformAdmin, router]);

  // Keep activeTab and isOnSubRoute in sync with URL-driven changes
  // (browser back/forward, deep links, auth redirects).
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
    setActiveTab(href);
    setIsOnSubRoute(false);
    router.push(href);
  };

  if (loading || !appUser || appUser.status !== "active") {
    return (
      <div className="min-h-dvh bg-brand-700 flex items-center justify-center">
        <div className="text-center">
          <div className="text-5xl mb-3">⛳</div>
          <div className="flex items-center gap-2 text-brand-200 text-sm">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-brand-300 animate-bounce [animation-delay:0ms]" />
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-brand-300 animate-bounce [animation-delay:150ms]" />
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-brand-300 animate-bounce [animation-delay:300ms]" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-dvh bg-surface-page flex flex-col max-w-lg mx-auto overflow-hidden">
      {/* ── Top bar ────────────────────────────────────────────────── */}
      <header className="bg-brand-700 text-white px-4 py-3 flex items-center justify-between z-20 shrink-0">
        <div className="flex items-center gap-2.5">
          {group?.logoUrl ? (
            <Avatar src={group.logoUrl} name={group.name ?? "GolfCaddy"} size="xs" className="rounded-lg" />
          ) : (
            <span className="text-xl">⛳</span>
          )}
          <span className="font-bold text-lg tracking-tight">
            {group?.name ?? "GolfCaddy"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {canAccessAdmin && (
            <Link
              href="/admin"
              className="bg-white/15 hover:bg-white/25 active:bg-white/30 text-white text-xs font-semibold px-3 py-1.5 rounded-full transition-colors"
            >
              Admin
            </Link>
          )}
          <Link
            href="/notifications"
            className="relative p-1.5 -mr-1"
            aria-label="Notifications"
          >
            <BellIcon className="w-6 h-6" />
            {hasUnreadNotifications && (
              <span className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-brand-700" />
            )}
          </Link>
        </div>
      </header>

      {/* ── Page content ────────────────────────────────────────────── */}
      {/*
        Each tab page is permanently mounted and shown/hidden with CSS.
        This preserves Firestore subscription state across tab switches
        and makes transitions feel instantaneous.

        Bottom padding (pb-20) clears the fixed nav bar.
        On iPhone the nav bar itself adds env(safe-area-inset-bottom)
        so we don't double-pad here.
      */}
      <main ref={contentRef} className="flex-1 min-h-0 overflow-y-auto pb-20">
        <div style={{ display: activeTab === "/home"        && !isOnSubRoute ? "block" : "none" }}><HomePage /></div>
        <div style={{ display: activeTab === "/rounds"      && !isOnSubRoute ? "block" : "none" }}><RoundsPage /></div>
        <div style={{ display: activeTab === "/leaderboard" && !isOnSubRoute ? "block" : "none" }}><LeaderboardPage /></div>
        <Suspense fallback={null}>
          <div style={{ display: activeTab === "/feed"      && !isOnSubRoute ? "block" : "none" }}><FeedPage /></div>
        </Suspense>
        <div style={{ display: activeTab === "/photos"      && !isOnSubRoute ? "block" : "none" }}><PhotosPage /></div>
        <div style={{ display: activeTab === "/profile"     && !isOnSubRoute ? "block" : "none" }}><ProfilePage /></div>

        {/* Sub-routes (round detail, notifications, admin, etc.) */}
        {isOnSubRoute && children}
      </main>

      {/* ── Bottom navigation bar ───────────────────────────────────── */}
      {/*
        Uses <button> (not <Link>) so handleTabTap fires synchronously
        without a router transition delay, giving instant visual feedback.

        The `pb-safe` utility adds env(safe-area-inset-bottom) so the
        nav bar content sits above the iPhone home indicator.
      */}
      <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-lg bg-white border-t border-surface-overlay z-20 pb-safe">
        <div className="flex">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active = activeTab === href;
            return (
              <button
                key={href}
                type="button"
                onClick={() => handleTabTap(href)}
                className={`flex-1 flex flex-col items-center pt-2 pb-1 gap-0.5 transition-colors ${
                  active ? "text-brand-600" : "text-ink-hint"
                }`}
              >
                <Icon className="w-6 h-6" />
                <span className="text-xs font-medium">{label}</span>
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
