"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  formatDistanceToNow,
  isToday,
  isYesterday,
  isThisWeek,
  startOfDay,
} from "date-fns";
import { useAuth } from "@/contexts/AuthContext";
import {
  markAllNotificationsRead,
  markNotificationRead,
  subscribeNotifications,
} from "@/lib/firestore";
import { ChevronLeftIcon } from "@/components/ui/icons";
import type { AppNotification } from "@/types";

const NOTIFICATION_ICONS: Record<string, string> = {
  round_announced: "📋",
  tee_times_published: "⏰",
  round_live: "🏌️",
  score_reminder: "⏰",
  results_published: "🏆",
  handicap_updated: "📊",
  announcement: "📢",
  change_alert: "⚠️",
  member_approved: "✅",
  new_comment: "💬",
  new_reaction: "❤️",
};

function getDateGroup(date: Date): string {
  if (isToday(date)) return "Today";
  if (isYesterday(date)) return "Yesterday";
  if (isThisWeek(date, { weekStartsOn: 1 })) return "This week";
  return "Earlier";
}

const DATE_GROUP_ORDER = ["Today", "Yesterday", "This week", "Earlier"];

export default function NotificationsPage() {
  const { appUser } = useAuth();
  const router = useRouter();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [markingAll, setMarkingAll] = useState(false);

  useEffect(() => {
    if (!appUser?.uid) return;
    return subscribeNotifications(
      appUser.uid,
      (nextNotifications) => {
        setNotifications(nextNotifications);
        setLoading(false);
      },
      {
        onError: (err) => {
          console.warn("Unable to subscribe to notifications", err);
          setLoading(false);
        },
      }
    );
  }, [appUser?.uid]);

  const handleTap = async (n: AppNotification) => {
    if (!n.read) {
      await markNotificationRead(n.id);
      setNotifications((prev) =>
        prev.map((x) => (x.id === n.id ? { ...x, read: true } : x))
      );
    }
    if (n.deepLink) router.push(n.deepLink);
  };

  const unreadIds = useMemo(
    () => notifications.filter((n) => !n.read).map((n) => n.id),
    [notifications]
  );

  const handleMarkAllRead = async () => {
    if (unreadIds.length === 0) return;
    setMarkingAll(true);
    try {
      await markAllNotificationsRead(unreadIds);
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    } catch (err) {
      console.error("Failed to mark all read", err);
    } finally {
      setMarkingAll(false);
    }
  };

  // Group notifications by date bucket, preserving chronological order within each group
  const groupedNotifications = useMemo(() => {
    const groups: Record<string, AppNotification[]> = {};
    for (const n of notifications) {
      const group = getDateGroup(startOfDay(n.createdAt));
      if (!groups[group]) groups[group] = [];
      groups[group].push(n);
    }
    return DATE_GROUP_ORDER
      .filter((g) => groups[g]?.length > 0)
      .map((g) => ({ label: g, items: groups[g] }));
  }, [notifications]);

  return (
    <div>
      {/* Back navigation + mark all read */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-surface-overlay bg-surface-card">
        <button
          type="button"
          onClick={() => router.back()}
          className="flex items-center gap-1 text-brand-600 text-sm font-medium"
        >
          <ChevronLeftIcon className="w-4 h-4" />
          Back
        </button>
        {unreadIds.length > 0 && (
          <button
            type="button"
            onClick={handleMarkAllRead}
            disabled={markingAll}
            className="text-xs font-medium text-brand-600 disabled:opacity-50"
          >
            {markingAll ? "Marking…" : "Mark all as read"}
          </button>
        )}
      </div>

      <div className="px-4 py-6">
        <h1 className="text-2xl font-bold text-ink-title mb-5">Notifications</h1>

        {loading ? (
          <div className="space-y-3 animate-pulse">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-surface-muted rounded-2xl p-4 h-16" />
            ))}
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-ink-hint">
            <div className="text-4xl mb-3">🔔</div>
            <p className="text-sm">No notifications yet</p>
          </div>
        ) : (
          <div className="space-y-5">
            {groupedNotifications.map(({ label, items }) => (
              <div key={label}>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-hint">
                  {label}
                </p>
                <div className="space-y-2">
                  {items.map((n) => (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => handleTap(n)}
                      className={`w-full text-left bg-surface-card rounded-2xl border p-4 flex gap-3 transition-colors active:bg-surface-muted ${
                        n.read ? "border-surface-overlay" : "border-brand-200 bg-brand-50"
                      }`}
                    >
                      <div className="text-2xl flex-shrink-0">
                        {NOTIFICATION_ICONS[n.type] || "🔔"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-semibold ${n.read ? "text-ink-body" : "text-ink-title"}`}>
                          {n.title}
                        </p>
                        <p className="text-xs text-ink-muted mt-0.5 line-clamp-2">{n.body}</p>
                        <p className="text-xs text-ink-hint mt-1">
                          {formatDistanceToNow(n.createdAt, { addSuffix: true })}
                        </p>
                      </div>
                      {!n.read && (
                        <div className="w-2 h-2 rounded-full bg-brand-600 mt-1 flex-shrink-0" />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
