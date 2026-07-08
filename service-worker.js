const CACHE_NAME = "turnly-contractor-pwa-v20260708f";

const PRECACHE_URLS = [
  "/",
  "/index.html",
  "/offline.html",
  "/manifest.webmanifest",
  "/pwa-register.js",
  "/style.css",
  "/portal-public.css",
  "/portal-auth-overrides.css",
  "/access-notice.css",
  "/contractor-portal.css",
  "/contractor-access.js",
  "/contractor-portal.js",
  "/contractor-job-flow-mobile.js",
  "/contractor-login.html",
  "/contractor.html",
  "/contractor-my-assignments.html",
  "/contractor-schedule.html",
  "/contractor-messages.html",
  "/contractor-resources.html",
  "/contractor-documents.html",
  "/contractor-payments.html",
  "/contractor-performance-portal.html",
  "/contractor-available.html",
  "/contractor-video-library.html",
  "/favicon.ico",
  "/favicon-32x32.png",
  "/favicon-16x16.png",
  "/icons/turnly-icon-192.png",
  "/icons/turnly-icon-512.png",
  "/icons/turnly-maskable-512.png"
];

const STATIC_EXTENSIONS = [
  ".css",
  ".js",
  ".png",
  ".jpg",
  ".jpeg",
  ".svg",
  ".ico",
  ".webmanifest",
  ".woff",
  ".woff2"
];

function sameOrigin(request) {
  return new URL(request.url).origin === self.location.origin;
}

function normalizedCacheKey(request) {
  const url = new URL(request.url);
  url.search = "";
  return url.toString();
}

function isStaticAsset(request) {
  const pathname = new URL(request.url).pathname;
  return STATIC_EXTENSIONS.some((extension) => pathname.endsWith(extension));
}

async function putIfCacheable(cache, key, response) {
  if (!response || response.status !== 200 || response.type !== "basic") return response;
  await cache.put(key, response.clone());
  return response;
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const key = normalizedCacheKey(request);

  try {
    const response = await fetch(request);
    return putIfCacheable(cache, key, response);
  } catch (error) {
    return caches.match(key) ||
      caches.match(request) ||
      caches.match("/offline.html");
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const key = normalizedCacheKey(request);
  const cached = await caches.match(key);

  const fresh = fetch(request)
    .then((response) => putIfCacheable(cache, key, response))
    .catch(() => null);

  return cached || fresh || caches.match("/offline.html");
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((key) => key !== CACHE_NAME)
        .map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET" || !sameOrigin(request)) return;

  if (request.mode === "navigate" || request.headers.get("accept")?.includes("text/html")) {
    event.respondWith(networkFirst(request));
    return;
  }

  if (new URL(request.url).pathname === "/env.js") {
    event.respondWith(networkFirst(request));
    return;
  }

  if (isStaticAsset(request)) {
    event.respondWith(staleWhileRevalidate(request));
  }
});
