"use client";

import { useEffect, useState } from "react";
import { updateUser } from "@/lib/firestore";
import {
  clearCurrentPushToken,
  registerPushNotifications,
  supportsPushNotifications,
  syncExistingPushToken,
} from "@/lib/pushClient";
import { useAuth } from "@/contexts/AuthContext";

const DISMISS_KEY = "golfcaddy_push_prompt_dismissed";

export default function PushNotificationSettingsCard() {
  const { appUser, isActive } = useAuth();
  const [supported, setSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | "unknown">(
    "unknown"
  );
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState("");

  const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY ?? "";

  useEffect(() => {
    if (typeof window === "undefined") return;
    setSupported(supportsPushNotifications());
    setPermission(
      "Notification" in window ? Notification.permission : "denied"
    );
  }, []);

  useEffect(() => {
    if (!isActive || !appUser?.uid || !supported || permission !== "granted") {
      return;
    }

    let cancelled = false;
    syncExistingPushToken(vapidKey)
      .then((token) => {
        if (cancelled || !token || token === appUser.fcmToken) return;
        return updateUser(appUser.uid, { fcmToken: token });
      })
      .catch((error) => {
        if (!cancelled) {
          setMessage(
            error instanceof Error
              ? error.message
              : "Could not sync your notification token."
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [appUser?.fcmToken, appUser?.uid, isActive, permission, supported, vapidKey]);

  const handleEnable = async () => {
    if (!appUser?.uid) return;

    if (typeof window !== "undefined") {
      window.localStorage.removeItem(DISMISS_KEY);
    }

    setSyncing(true);
    setMessage("");
    try {
      if (permission === "denied") {
        setMessage("Notifications are turned off in your phone settings.");
        return;
      }

      const result = await registerPushNotifications(vapidKey);
      setPermission(result.permission as NotificationPermission);

      if (result.token) {
        await updateUser(appUser.uid, { fcmToken: result.token });
        setMessage("Notifications are on for this device.");
      } else if (result.permission === "granted") {
        setMessage("Notifications are almost ready. Please try again.");
      } else {
        setMessage("Notifications are off for this device.");
      }
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not update notifications."
      );
    } finally {
      setSyncing(false);
    }
  };

  const handleDisable = async () => {
    if (!appUser?.uid) return;

    setSyncing(true);
    setMessage("");
    try {
      await clearCurrentPushToken();
      await updateUser(appUser.uid, { fcmToken: null });
      setMessage("Notifications are off for this device.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not update notifications."
      );
    } finally {
      setSyncing(false);
    }
  };

  if (!isActive) return null;

  const notificationsEnabled =
    supported && permission === "granted" && Boolean(appUser?.fcmToken);

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-800">
            Allow notifications
          </h2>
          <p className="mt-1 text-xs text-gray-500">
            Get alerts for round updates, results, and feed activity.
          </p>
          <div className="mt-3 inline-flex rounded-xl border border-gray-200 bg-gray-50 p-1">
            <button
              type="button"
              onClick={handleEnable}
              disabled={syncing || !supported}
              aria-pressed={notificationsEnabled}
              className={`rounded-lg px-4 py-2 text-xs font-semibold transition-colors disabled:opacity-60 ${
                notificationsEnabled
                  ? "bg-green-600 text-white shadow-sm"
                  : "text-gray-600"
              }`}
            >
              Yes
            </button>
            <button
              type="button"
              onClick={handleDisable}
              disabled={syncing || !supported}
              aria-pressed={!notificationsEnabled}
              className={`rounded-lg px-4 py-2 text-xs font-semibold transition-colors disabled:opacity-60 ${
                !notificationsEnabled
                  ? "bg-white text-gray-800 shadow-sm"
                  : "text-gray-600"
              }`}
            >
              No
            </button>
          </div>
          {!supported && (
            <p className="mt-2 text-xs text-gray-500">
              Notifications are not available on this device.
            </p>
          )}
          {permission === "denied" && (
            <p className="mt-2 text-xs text-gray-500">
              Notifications are turned off in your iPhone settings.
            </p>
          )}
        </div>
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
            notificationsEnabled
              ? "bg-green-100 text-green-700"
              : "bg-gray-100 text-gray-600"
          }`}
        >
          {syncing ? "Saving..." : notificationsEnabled ? "Yes" : "No"}
        </span>
      </div>
      {message && (
        <p
          className={`mt-3 text-xs ${
            message.includes("on for this device")
              ? "text-green-700"
              : "text-gray-600"
          }`}
        >
          {message}
        </p>
      )}
    </div>
  );
}
