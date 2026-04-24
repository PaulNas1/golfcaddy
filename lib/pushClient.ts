import { deleteToken, getToken, onMessage } from "firebase/messaging";
import { auth, getMessagingInstance } from "./firebase";

export type PushDispatchPayload = {
  recipientUserIds: string[];
  title: string;
  body: string;
  deepLink?: string | null;
  type: string;
};

export type ForegroundPushPayload = {
  title: string;
  body: string;
  deepLink: string;
  type: string;
};

const FIREBASE_MESSAGING_SW_URL = "/firebase-messaging-sw.js";

export function supportsPushNotifications() {
  return (
    typeof window !== "undefined" &&
    "Notification" in window &&
    "serviceWorker" in navigator
  );
}

async function getMessagingWithRegistration() {
  const messaging = await getMessagingInstance();
  if (!messaging) {
    throw new Error("Push notifications are not supported in this browser.");
  }

  const registration = await navigator.serviceWorker.register(
    FIREBASE_MESSAGING_SW_URL
  );

  return { messaging, registration };
}

export async function registerPushNotifications(vapidKey: string) {
  if (!supportsPushNotifications()) {
    throw new Error("Push notifications are not supported in this browser.");
  }

  if (!vapidKey) {
    throw new Error("Missing Firebase web push VAPID key.");
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return { permission, token: null };
  }

  const { messaging, registration } = await getMessagingWithRegistration();
  const token = await getToken(messaging, {
    vapidKey,
    serviceWorkerRegistration: registration,
  });

  return { permission, token: token || null };
}

export async function syncExistingPushToken(vapidKey: string) {
  if (!supportsPushNotifications()) return null;
  if (Notification.permission !== "granted") return null;
  if (!vapidKey) return null;

  const { messaging, registration } = await getMessagingWithRegistration();
  const token = await getToken(messaging, {
    vapidKey,
    serviceWorkerRegistration: registration,
  });

  return token || null;
}

export async function clearCurrentPushToken() {
  if (!supportsPushNotifications()) return;

  const messaging = await getMessagingInstance();
  if (!messaging) return;

  try {
    await deleteToken(messaging);
  } catch (error) {
    console.warn("Unable to clear push token", error);
  }
}

export async function sendPushNotificationsToUsers(
  payload: PushDispatchPayload
) {
  if (typeof window === "undefined") return;
  if (!auth.currentUser) return;
  if (payload.recipientUserIds.length === 0) return;

  const idToken = await auth.currentUser.getIdToken();
  const response = await fetch("/api/push/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(
      errorBody || `Push delivery failed with status ${response.status}.`
    );
  }
}

export async function subscribeToForegroundPushMessages(
  onReceive: (payload: ForegroundPushPayload) => void
) {
  const messaging = await getMessagingInstance();
  if (!messaging) return () => {};

  return onMessage(messaging, (payload) => {
    const title = payload.data?.title ?? payload.notification?.title ?? "";
    const body = payload.data?.body ?? payload.notification?.body ?? "";
    const deepLink = payload.data?.deepLink ?? "/";
    const type = payload.data?.type ?? "notification";

    if (!title && !body) return;
    onReceive({ title, body, deepLink, type });
  });
}
