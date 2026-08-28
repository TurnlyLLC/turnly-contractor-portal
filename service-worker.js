const CACHE_NAME = "turnly-contractor-pwa-v20260828-admin-pwa-safe-cache";

const PRECACHE_URLS = [
  "/",
  "/index.html",
  "/offline.html",
  "/manifest.webmanifest",
  "/pwa-register.js",
  "/style.css",
  "/portal-public.css",
  "/legal.css",
  "/auth-recovery-router.js",
  "/portal-auth.js",
  "/reset-password.html",
  "/privacy-policy.html",
  "/terms-and-conditions.html",
  "/reset-password.js",
  "/admin-preview-context.js",
  "/portal-auth-overrides.css",
  "/access-notice.css",
  "/contractor-portal.css",
  "/contractor-messages-20260717a.css",
  "/contractor-access.js",
  "/contractor-access-20260708a.js",
  "/contractor-access-20260708b.js",
  "/contractor-portal.js",
  "/contractor-portal-20260708a.js",
  "/contractor-portal-20260708b.js",
  "/contractor-job-flow-mobile.js",
  "/contractor-login.html",
  "/property-manager-login.html",
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
  "/contractor-file.html",
  "/messages.html",
  "/property-manager.html",
  "/assets/vetra-forest-hills-front-office.jpg",
  "/assets/property-manager-operations-hero.jpg",
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

function isAdminRuntimeAsset(request) {
  const pathname = new URL(request.url).pathname;
  return pathname === "/admin-suite.js"
    || pathname.startsWith("/admin-suite-")
    || pathname === "/admin-suite.css"
    || pathname === "/admin-regions.js"
    || pathname === "/admin-dashboard.css"
    || pathname === "/contractor-portal.css"
    || pathname === "/portal-public.css"
    || pathname === "/sales-portal.css"
    || pathname === "/auth-recovery-router.js"
    || pathname === "/portal-auth.js"
    || pathname === "/reset-password.js"
    || pathname === "/auth-callback.js"
    || pathname === "/portal-auth-overrides.css"
    || pathname === "/property-workflows.css"
    || pathname === "/app.js"
    || pathname === "/property-manager.js"
    || pathname === "/assignment-client-source.js"
    || pathname === "/assignment-billing-address.js"
    || pathname === "/assignment-unit-metadata.js"
    || pathname === "/client-billing-address.js"
    || pathname.startsWith("/qa-checklists-nav")
    || pathname === "/schedule-live.js"
    || pathname === "/schedule-add-assignment.js"
    || pathname === "/contractor-directory-source.js"
    || pathname.startsWith("/contractor-directory-source-")
    || pathname === "/contractor-file-source.js"
    || pathname.startsWith("/contractor-file-source-")
    || pathname === "/contractor-access.js"
    || pathname.startsWith("/contractor-access-")
    || pathname === "/contractor-portal.js"
    || pathname.startsWith("/contractor-portal-")
    || pathname === "/contractor-job-flow-mobile.js"
    || pathname.startsWith("/property-units-")
    || pathname.startsWith("/property-unit-");
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
        .filter((key) => key.startsWith("turnly-contractor-pwa-") && key !== CACHE_NAME)
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
    event.respondWith(isAdminRuntimeAsset(request) ? networkFirst(request) : staleWhileRevalidate(request));
  }
});
