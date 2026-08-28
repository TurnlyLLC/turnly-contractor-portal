const CACHE_NAME = "turnly-admin-pwa-v20260828g";
const APP_SHELL = [
  "/admin-pwa/",
  "/admin-pwa/index.html",
  "/admin-pwa/schedule.html",
  "/admin-pwa/assignments.html",
  "/admin-pwa/videos.html",
  "/admin-pwa/people.html",
  "/admin-pwa/messages.html",
  "/admin-pwa/admin-pwa.css?v=20260828g",
  "/admin-pwa/admin-pwa.js?v=20260828g",
  "/admin-pwa/manifest.webmanifest",
  "/env.js",
  "/favicon-32x32.png?v=20260624t",
  "/icons/turnly-icon-192.png",
  "/icons/turnly-icon-512.png",
  "/icons/turnly-maskable-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((key) => key.startsWith("turnly-admin-pwa-") && key !== CACHE_NAME)
        .map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== location.origin || !url.pathname.startsWith("/admin-pwa/")) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached || caches.match("/admin-pwa/index.html")))
  );
});
