// Retire the portal worker on the customer-facing domain only.
// This lets visitors who previously saw the login page load the public site.
if (self.location.hostname === "residental.turnlypros.com") {
  self.addEventListener("install", (event) => {
    event.waitUntil(self.skipWaiting());
  });
  self.addEventListener("activate", (event) => {
    event.waitUntil((async () => {
      await self.registration.unregister();
      const windows = await self.clients.matchAll({ type: "window" });
      await Promise.all(windows.map((client) => client.navigate("/")));
    })());
  });
}
