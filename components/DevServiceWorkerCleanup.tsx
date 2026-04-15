"use client";

import { useEffect } from "react";

export default function DevServiceWorkerCleanup() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const cleanup = async () => {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));

      if ("caches" in window) {
        const cacheNames = await window.caches.keys();
        await Promise.all(cacheNames.map((cacheName) => window.caches.delete(cacheName)));
      }
    };

    cleanup().catch((error) => {
      console.warn("Unable to clear service worker cache", error);
    });
  }, []);

  return null;
}
