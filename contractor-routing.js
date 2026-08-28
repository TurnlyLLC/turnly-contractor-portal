const contractorPwaRoutes = {
  dashboard: "contractor.html",
  "my-jobs": "contractor-my-assignments.html",
  schedule: "contractor-schedule.html",
  resources: "contractor-resources.html",
  messages: "contractor-messages.html",
  documents: "contractor-documents.html",
  payments: "contractor-payments.html",
  performance: "contractor-performance-portal.html",
  "job-board": "contractor-available.html",
  "video-library": "contractor-video-library.html"
};

const contractorDesktopRoutes = {
  dashboard: "contractor-desktop.html",
  "my-jobs": "contractor-desktop-my-assignments.html",
  schedule: "contractor-desktop-schedule.html",
  resources: "contractor-desktop-resources.html",
  messages: "contractor-desktop-messages.html",
  documents: "contractor-desktop-documents.html",
  payments: "contractor-desktop-payments.html",
  performance: "contractor-desktop-performance.html",
  "job-board": "contractor-desktop-available.html",
  "video-library": "contractor-desktop-video-library.html"
};

function hasWindow() {
  return typeof window !== "undefined";
}

export function currentContractorPageKey() {
  if (!hasWindow()) return "dashboard";
  return document.body?.dataset?.contractorPage || "dashboard";
}

export function currentContractorSurface() {
  if (!hasWindow()) return "pwa";
  return document.body?.dataset?.contractorSurface === "desktop" ? "desktop" : "pwa";
}

export function isStandaloneContractorApp() {
  if (!hasWindow()) return false;
  return Boolean(
    window.matchMedia?.("(display-mode: standalone)")?.matches ||
    window.matchMedia?.("(display-mode: fullscreen)")?.matches ||
    window.navigator?.standalone === true
  );
}

export function isMobileContractorBrowser() {
  if (!hasWindow()) return false;
  const userAgent = window.navigator?.userAgent || "";
  const mobileAgent = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(userAgent);
  const compactTouch = Boolean(
    window.matchMedia?.("(pointer: coarse)")?.matches &&
    window.matchMedia?.("(max-width: 900px)")?.matches
  );
  return mobileAgent || compactTouch;
}

export function contractorSurfaceForBrowser() {
  return isStandaloneContractorApp() || isMobileContractorBrowser() ? "pwa" : "desktop";
}

export function contractorRoute(page = "dashboard", surface = "auto") {
  const normalizedSurface = surface === "auto" ? contractorSurfaceForBrowser() : surface;
  const routes = normalizedSurface === "desktop" ? contractorDesktopRoutes : contractorPwaRoutes;
  return routes[page] || routes.dashboard;
}

export function contractorRoutes(surface = "auto") {
  const normalizedSurface = surface === "auto" ? contractorSurfaceForBrowser() : surface;
  return normalizedSurface === "desktop" ? contractorDesktopRoutes : contractorPwaRoutes;
}

export function contractorHomeForBrowser() {
  return contractorRoute("dashboard", "auto");
}
