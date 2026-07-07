const CHECKLIST_LINK = {
  key: "checklists",
  label: "Checklists",
  href: "checklists.html"
};

function checklistIcon() {
  return `
    <span class="suite-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M9 11l2 2 4-4"></path>
        <path d="M21 12c0 4.97-4.03 9-9 9s-9-4.03-9-9 4.03-9 9-9c1.64 0 3.18.44 4.5 1.21"></path>
      </svg>
    </span>
  `;
}

function findQualityLinks() {
  return document.querySelector('[data-nav-section="quality"]');
}

function revealQualitySection() {
  const qualityLinks = findQualityLinks();
  if (!qualityLinks) return;

  qualityLinks.hidden = false;
  const toggle = document.querySelector('[data-nav-section-toggle="quality"]');
  toggle?.setAttribute("aria-expanded", "true");
  toggle?.closest(".nav-section-group")?.classList.remove("collapsed");
}

function injectSidebarLink() {
  const links = findQualityLinks();
  if (!links) return;

  if (!links.querySelector(`a[href="${CHECKLIST_LINK.href}"]`)) {
    const anchor = document.createElement("a");
    anchor.className = "suite-nav-link";
    anchor.href = CHECKLIST_LINK.href;
    anchor.dataset.injectedQaChecklists = "true";
    anchor.innerHTML = `${checklistIcon()}<span>${CHECKLIST_LINK.label}</span>`;

    const afterQueue = links.querySelector('a[href="qa-queue.html"]');
    if (afterQueue?.nextSibling) {
      links.insertBefore(anchor, afterQueue.nextSibling);
    } else {
      links.appendChild(anchor);
    }
  }

  revealQualitySection();
}

function injectQualityTabs() {
  const tabs = document.querySelector(".suite-content .suite-tabs");
  if (!tabs || tabs.querySelector(`a[href="${CHECKLIST_LINK.href}"]`)) return;

  const hasQualityTabs = Boolean(
    tabs.querySelector('a[href="qa-queue.html"]') ||
    tabs.querySelector('a[href="qa-reviews.html"]') ||
    tabs.querySelector('a[href="qa-analytics.html"]')
  );
  if (!hasQualityTabs) return;

  const tab = document.createElement("a");
  tab.className = "suite-tab";
  tab.href = CHECKLIST_LINK.href;
  tab.textContent = CHECKLIST_LINK.label;

  const afterReviews = tabs.querySelector('a[href="qa-reviews.html"]');
  if (afterReviews?.nextSibling) {
    tabs.insertBefore(tab, afterReviews.nextSibling);
  } else {
    tabs.appendChild(tab);
  }
}

function markChecklistActive() {
  const isChecklistPage = document.body?.dataset.adminPage === CHECKLIST_LINK.key ||
    window.location.pathname.endsWith(`/${CHECKLIST_LINK.href}`);

  if (!isChecklistPage) return;

  document.querySelectorAll(".suite-nav-link.active, .suite-tab.active").forEach((item) => {
    item.classList.remove("active");
  });

  document.querySelectorAll(`a[href="${CHECKLIST_LINK.href}"]`).forEach((item) => {
    item.classList.add(item.classList.contains("suite-tab") ? "suite-tab" : "suite-nav-link");
    item.classList.add("active");
  });

  revealQualitySection();
}

function syncQaChecklistNavigation() {
  injectSidebarLink();
  injectQualityTabs();
  markChecklistActive();
}

let syncCount = 0;
const interval = window.setInterval(() => {
  syncQaChecklistNavigation();
  syncCount += 1;
  if (syncCount > 25 || document.querySelector(`a[href="${CHECKLIST_LINK.href}"]`)) {
    window.clearInterval(interval);
  }
}, 120);

const observer = new MutationObserver(syncQaChecklistNavigation);
observer.observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener("load", syncQaChecklistNavigation);
