self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      if (self.registration) {
        await self.registration.unregister();
      }

      if (self.caches) {
        const cacheNames = await self.caches.keys();
        await Promise.all(cacheNames.map((cacheName) => self.caches.delete(cacheName)));
      }

      const clients = await self.clients.matchAll({ type: "window" });
      clients.forEach((client) => client.navigate(client.url));
    })()
  );
});
