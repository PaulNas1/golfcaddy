"use client";

import { useEffect, useState } from "react";
import { updateUser } from "@/lib/firestore";
import {
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
      const result = await registerPushNotifications(vapidKey);
      setPermission(result.permission as NotificationPermission);

      if (result.token) {
        await updateUser(appUser.uid, { fcmToken: result.token });
        setMessage("Device notifications are enabled.");
      } else if (result.permission === "granted") {
        setMessage("Permission was granted, but no push token was returned yet.");
      } else {
        setMessage("Notifications were not enabled on this device.");
      }
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not enable notifications."
      );
    } finally {
      setSyncing(false);
    }
  };

  if (!isActive) return null;

  const statusLabel = !supported
    ? "Unsupported"
    : permission === "granted"
      ? appUser?.fcmToken
        ? "Enabled"
        : "Permission granted, token missing"
      : permission === "denied"
        ? "Blocked"
        : "Not enabled";
  const actionLabel = !supported
    ? "Unavailable"
    : permission === "granted" && appUser?.fcmToken
      ? "Re-check"
      : "Enable";

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-800">
            Device Notifications
          </h2>
          <p className="mt-1 text-xs text-gray-500">
            Control alerts for round changes, published results, and feed activity.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <span
              className={`rounded-full px-2.5 py-1 font-semibold ${
                permission === "granted" && appUser?.fcmToken
                  ? "bg-green-100 text-green-700"
                  : permission === "denied"
                    ? "bg-red-100 text-red-700"
                    : "bg-gray-100 text-gray-600"
              }`}
            >
              {statusLabel}
            </span>
            <span className="text-gray-500">
              Token saved: {appUser?.fcmToken ? "Yes" : "No"}
            </span>
          </div>
          {!supported && (
            <p className="mt-2 text-xs text-gray-500">
              This browser or device does not support web push notifications.
            </p>
          )}
          {permission === "denied" && (
            <p className="mt-2 text-xs text-gray-500">
              Notifications are blocked for this Home Screen app. Re-enable them in iPhone Settings.
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={handleEnable}
          disabled={syncing || !supported}
          className="rounded-xl border border-green-200 px-3 py-2 text-xs font-semibold text-green-700 disabled:opacity-60"
        >
          {syncing ? "Checking..." : actionLabel}
        </button>
      </div>
      {message && (
        <p
          className={`mt-3 text-xs ${
            message.includes("enabled") ? "text-green-700" : "text-red-600"
          }`}
        >
          {message}
        </p>
      )}
    </div>
  );
}
