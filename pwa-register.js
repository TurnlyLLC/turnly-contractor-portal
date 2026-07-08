const installState = {
  prompt: null,
  observerStarted: false,
  refreshFrame: 0
};

function isStandaloneDisplay() {
  return window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true;
}

function refreshInstallControls() {
  cancelAnimationFrame(installState.refreshFrame);
  installState.refreshFrame = requestAnimationFrame(() => {
    document.documentElement.classList.toggle("pwa-standalone", isStandaloneDisplay());
    document.querySelectorAll("[data-pwa-install]").forEach((button) => {
      button.hidden = isStandaloneDisplay() || !installState.prompt;
      button.disabled = !installState.prompt;
    });
  });
}

function watchInstallControls() {
  if (installState.observerStarted || !document.documentElement) return;
  installState.observerStarted = true;
  const observer = new MutationObserver(refreshInstallControls);
  observer.observe(document.documentElement, { childList: true, subtree: true });
}

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  installState.prompt = event;
  refreshInstallControls();
});

window.addEventListener("appinstalled", () => {
  installState.prompt = null;
  refreshInstallControls();
});

window.matchMedia("(display-mode: standalone)").addEventListener?.("change", refreshInstallControls);

document.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-pwa-install]");
  if (!button || !installState.prompt) return;

  button.disabled = true;
  installState.prompt.prompt();

  try {
    await installState.prompt.userChoice;
  } finally {
    installState.prompt = null;
    refreshInstallControls();
  }
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/service-worker.js").catch(() => {});
  });
}

document.addEventListener("DOMContentLoaded", () => {
  watchInstallControls();
  refreshInstallControls();
});
