"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { useAuth } from "@/contexts/AuthContext";
import { markNotificationRead, subscribeNotifications } from "@/lib/firestore";
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

export default function NotificationsPage() {
  const { appUser } = useAuth();
  const router = useRouter();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);

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

  return (
    <div>
      {/* Back navigation */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-surface-overlay bg-surface-card">
        <button
          type="button"
          onClick={() => router.back()}
          className="flex items-center gap-1 text-brand-600 text-sm font-medium"
        >
          <ChevronLeftIcon className="w-4 h-4" />
          Back
        </button>
      </div>

      <div className="px-4 py-6">
      <h1 className="text-2xl font-bold text-ink-title mb-5">Notifications</h1>

      {loading ? (
        <div className="space-y-3 animate-pulse">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-2xl p-4 h-16 bg-gray-100" />
          ))}
        </div>
      ) : notifications.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
          <div className="text-4xl mb-3">🔔</div>
          <p className="text-sm">No notifications yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map((n) => (
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
      )}
      </div>
    </div>
  );
}
