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

  return (
    <div className="mb-4 rounded-2xl border border-green-200 bg-green-50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-green-900">
            Device Notifications
          </h2>
          <p className="mt-1 text-xs text-green-800">
            Status: {statusLabel}
          </p>
          <p className="mt-1 text-xs text-green-800">
            Token saved: {appUser?.fcmToken ? "Yes" : "No"}
          </p>
          {permission === "denied" && (
            <p className="mt-2 text-xs text-green-800">
              Notifications are blocked for this Home Screen app. Re-enable them in iPhone Settings.
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={handleEnable}
          disabled={syncing || !supported}
          className="rounded-xl bg-green-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
        >
          {syncing ? "Checking..." : "Enable"}
        </button>
      </div>
      {message && <p className="mt-3 text-xs text-red-600">{message}</p>}
    </div>
  );
}
