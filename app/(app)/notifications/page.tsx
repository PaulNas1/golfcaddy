"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { useAuth } from "@/contexts/AuthContext";
import { markNotificationRead, subscribeNotifications } from "@/lib/firestore";
import PushNotificationSettingsCard from "@/components/PushNotificationSettingsCard";
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
    <div className="px-4 py-6">
      <h1 className="text-2xl font-bold text-gray-800 mb-5">Notifications</h1>
      <PushNotificationSettingsCard />

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
            <div
              key={n.id}
              onClick={() => handleTap(n)}
              className={`bg-white rounded-2xl border p-4 flex gap-3 cursor-pointer transition-colors ${
                n.read ? "border-gray-100" : "border-green-200 bg-green-50"
              }`}
            >
              <div className="text-2xl flex-shrink-0">
                {NOTIFICATION_ICONS[n.type] || "🔔"}
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-semibold ${n.read ? "text-gray-700" : "text-gray-900"}`}>
                  {n.title}
                </p>
                <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{n.body}</p>
                <p className="text-xs text-gray-400 mt-1">
                  {formatDistanceToNow(n.createdAt, { addSuffix: true })}
                </p>
              </div>
              {!n.read && (
                <div className="w-2 h-2 rounded-full bg-green-500 mt-1 flex-shrink-0" />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
