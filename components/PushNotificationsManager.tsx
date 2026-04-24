"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { updateUser } from "@/lib/firestore";
import {
  registerPushNotifications,
  subscribeToForegroundPushMessages,
  supportsPushNotifications,
  syncExistingPushToken,
  type ForegroundPushPayload,
} from "@/lib/pushClient";

const DISMISS_KEY = "golfcaddy_push_prompt_dismissed";

export default function PushNotificationsManager() {
  const router = useRouter();
  const { appUser, isActive } = useAuth();
  const [supported, setSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | "unknown">(
    "unknown"
  );
  const [dismissed, setDismissed] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState("");
  const [foregroundPush, setForegroundPush] =
    useState<ForegroundPushPayload | null>(null);

  const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY ?? "";

  useEffect(() => {
    if (typeof window === "undefined") return;
    setSupported(supportsPushNotifications());
    setDismissed(window.localStorage.getItem(DISMISS_KEY) === "1");
    setPermission(
      "Notification" in window ? Notification.permission : "denied"
    );
  }, []);

  useEffect(() => {
    if (!isActive || !appUser?.uid || !supported || permission !== "granted") {
      return;
    }

    let cancelled = false;
    setSyncing(true);
    syncExistingPushToken(vapidKey)
      .then((token) => {
        if (cancelled || !token || token === appUser.fcmToken) return;
        return updateUser(appUser.uid, { fcmToken: token });
      })
      .catch((nextError) => {
        if (!cancelled) {
          setError(
            nextError instanceof Error
              ? nextError.message
              : "Could not sync your push notification token."
          );
        }
      })
      .finally(() => {
        if (!cancelled) setSyncing(false);
      });

    return () => {
      cancelled = true;
    };
  }, [appUser?.fcmToken, appUser?.uid, isActive, permission, supported, vapidKey]);

  useEffect(() => {
    if (!isActive || !supported) return;

    let unsubscribe = () => {};
    subscribeToForegroundPushMessages((payload) => {
      setForegroundPush(payload);
    })
      .then((cleanup) => {
        unsubscribe = cleanup;
      })
      .catch((nextError) => {
        console.warn("Unable to subscribe to foreground push", nextError);
      });

    return () => unsubscribe();
  }, [isActive, supported]);

  const shouldShowEnablePrompt = useMemo(
    () =>
      isActive &&
      supported &&
      permission === "default" &&
      !dismissed &&
      !appUser?.fcmToken,
    [appUser?.fcmToken, dismissed, isActive, permission, supported]
  );

  const handleEnablePush = async () => {
    if (!appUser?.uid) return;

    setSyncing(true);
    setError("");
    try {
      const result = await registerPushNotifications(vapidKey);
      setPermission(result.permission as NotificationPermission);

      if (result.token) {
        await updateUser(appUser.uid, { fcmToken: result.token });
      }

      if (result.permission !== "granted") {
        setError("Notifications were not enabled on this device.");
      }
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Could not enable notifications."
      );
    } finally {
      setSyncing(false);
    }
  };

  const handleDismissPrompt = () => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(DISMISS_KEY, "1");
    }
    setDismissed(true);
  };

  const handleOpenPush = () => {
    if (!foregroundPush) return;
    setForegroundPush(null);
    router.push(foregroundPush.deepLink || "/notifications");
  };

  if (!isActive) return null;

  return (
    <>
      {shouldShowEnablePrompt && (
        <div className="mx-auto w-full max-w-lg px-4 pt-4">
          <div className="rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold">Enable real device notifications</p>
                <p className="mt-1 text-xs text-green-800">
                  Get round updates, results, and replies even when GolfCaddy is closed.
                </p>
              </div>
              <button
                type="button"
                onClick={handleDismissPrompt}
                className="text-xs font-semibold text-green-700"
              >
                Not now
              </button>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={handleEnablePush}
                disabled={syncing}
                className="rounded-xl bg-green-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
              >
                {syncing ? "Enabling..." : "Enable notifications"}
              </button>
              <Link
                href="/notifications"
                className="text-xs font-semibold text-green-700"
              >
                View in-app inbox
              </Link>
            </div>
            {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
          </div>
        </div>
      )}

      {foregroundPush && (
        <div className="pointer-events-none fixed inset-x-0 top-4 z-50 flex justify-center px-4">
          <button
            type="button"
            onClick={handleOpenPush}
            className="pointer-events-auto w-full max-w-md rounded-2xl border border-green-200 bg-white px-4 py-3 text-left shadow-lg"
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-green-700">
              New notification
            </p>
            <p className="mt-1 text-sm font-semibold text-gray-900">
              {foregroundPush.title}
            </p>
            <p className="mt-1 text-sm text-gray-600">{foregroundPush.body}</p>
            <p className="mt-2 text-xs font-semibold text-green-700">
              Tap to open
            </p>
          </button>
        </div>
      )}
    </>
  );
}
