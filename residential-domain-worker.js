// Retire the portal worker on the customer-facing domain only.
// This lets visitors who previously saw the login page load the public site.
if (["residental.turnlypros.com", "res.turnlypros.com"].includes(self.location.hostname)) {
  self.addEventListener("install", (event) => {
    event.waitUntil(self.skipWaiting());
  });
  self.addEventListener("activate", (event) => {
    event.waitUntil((async () => {
      await self.clients.claim();
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key.startsWith("turnly-contractor-pwa-")).map((key) => caches.delete(key)));
      await self.registration.unregister();
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      await Promise.all(windows.map((client) => client.navigate("/")));
    })());
  });
}
