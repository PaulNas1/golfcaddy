"use client";

import { useEffect } from "react";

const DEV_SW_RESET_KEY = "golfcaddy_dev_sw_reset_v1";

export default function DevServiceWorkerCleanup() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    if (!("serviceWorker" in navigator)) return;

    const cleanup = async () => {
      const registrations = await navigator.serviceWorker.getRegistrations();
      const legacyRegistrations = registrations.filter((registration) => {
        const scriptUrl = registration.active?.scriptURL ?? registration.scope;
        return scriptUrl.includes("/sw.js");
      });
      const hadLegacyRegistrations = legacyRegistrations.length > 0;
      await Promise.all(
        legacyRegistrations.map((registration) => registration.unregister())
      );

      if ("caches" in window) {
        const cacheNames = await window.caches.keys();
        await Promise.all(cacheNames.map((cacheName) => window.caches.delete(cacheName)));
      }

      const alreadyReset =
        window.sessionStorage.getItem(DEV_SW_RESET_KEY) === "1";

      if (hadLegacyRegistrations && !alreadyReset) {
        window.sessionStorage.setItem(DEV_SW_RESET_KEY, "1");
        window.location.reload();
        return;
      }

      if (!hadLegacyRegistrations && alreadyReset) {
        window.sessionStorage.removeItem(DEV_SW_RESET_KEY);
      }
    };

    cleanup().catch((error) => {
      console.warn("Unable to clear service worker cache", error);
    });
  }, []);

  return null;
}
