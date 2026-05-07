importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyCNA9NctYDfmn7NN9TKfSTpYuqodjv2xPs",
  authDomain: "golfcaddy-7f1c1.firebaseapp.com",
  projectId: "golfcaddy-7f1c1",
  storageBucket: "golfcaddy-7f1c1.firebasestorage.app",
  messagingSenderId: "409473460857",
  appId: "1:409473460857:web:5892a3be87ae948e5fc2a8",
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const { title, body } = payload.notification ?? {};
  const deepLink = payload.data?.deepLink ?? "/notifications";

  self.registration.showNotification(title ?? "GolfCaddy", {
    body: body ?? "",
    icon: "/icons/icon-192x192.png",
    badge: "/icons/icon-192x192.png",
    data: { deepLink },
  });
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const deepLink = event.notification.data?.deepLink ?? "/notifications";
  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windowClients) => {
        for (const client of windowClients) {
          if ("focus" in client) {
            client.navigate(deepLink);
            return client.focus();
          }
        }
        return clients.openWindow(deepLink);
      })
  );
});
