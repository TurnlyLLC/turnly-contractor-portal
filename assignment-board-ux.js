const QUICK_VIEWS = {
  open: { label: "Open Jobs", status: "open" },
  unassigned: { label: "Need Contractor", status: "open", contractor: "unassigned" },
  preferred: { label: "Preferred First", status: "preferred_pending" },
  overdue: { label: "Overdue", status: "overdue" },
  all: { label: "All Jobs", status: "all" }
};

let syncTimer = 0;

function initAssignmentBoardUx() {
  mountQuickViews();
  enhanceAssignmentCards();
  observeAssignments();
  document.addEventListener("click", handleBoardClick);
  document.addEventListener("change", scheduleSyncQuickViews);
  document.addEventListener("input", scheduleSyncQuickViews);
}

function mountQuickViews() {
  const panel = document.querySelector(".assignment-list-panel");
  const toolbar = panel?.querySelector(".suite-toolbar");
  if (!panel || !toolbar || panel.querySelector(".assignment-board-quickbar")) return;

  const bar = document.createElement("div");
  bar.className = "assignment-board-quickbar";
  bar.innerHTML = `
    <div class="assignment-board-quickbar-label">Quick Views</div>
    <div class="assignment-board-quick-actions">
      ${Object.entries(QUICK_VIEWS).map(([key, view]) => `
        <button class="assignment-board-quick-btn" type="button" data-board-quick-view="${key}">${view.label}</button>
      `).join("")}
    </div>
  `;
  toolbar.insertAdjacentElement("afterend", bar);
  syncQuickViews();
}

function handleBoardClick(event) {
  const quickViewButton = event.target.closest("[data-board-quick-view]");
  if (quickViewButton) {
    applyQuickView(quickViewButton.dataset.boardQuickView);
    return;
  }

  if (event.target.closest("[data-assignment-status-tab], [data-assignment-clear-filters]")) {
    scheduleSyncQuickViews();
  }
}

function applyQuickView(key) {
  const view = QUICK_VIEWS[key];
  if (!view) return;

  setSearchValue("");
  setSelectValue("assignmentFrequencyFilter", "all");
  setSelectValue("assignmentContractorFilter", view.contractor || "all");
  clickStatusTab(view.status);
  scheduleSyncQuickViews();
}

function clickStatusTab(status) {
  const tab = document.querySelector(`[data-assignment-status-tab="${status}"]`);
  tab?.click();
}

function setSearchValue(value) {
  const field = document.getElementById("assignmentSearchInput");
  if (!field || field.value === value) return;
  field.value = value;
  field.dispatchEvent(new Event("input", { bubbles: true }));
}

function setSelectValue(id, value) {
  const field = document.getElementById(id);
  if (!field || field.value === value) return;
  field.value = value;
  field.dispatchEvent(new Event("change", { bubbles: true }));
}

function syncQuickViews() {
  const activeTab = document.querySelector("[data-assignment-status-tab].active")?.dataset.assignmentStatusTab || "open";
  const contractor = document.getElementById("assignmentContractorFilter")?.value || "all";
  const activeMatch = Object.entries(QUICK_VIEWS).find(([, view]) => view.status === activeTab && !view.contractor)?.[0] || "";
  const activeKey = contractor === "unassigned" ? "unassigned" : contractor === "all" ? activeMatch : "";

  document.querySelectorAll("[data-board-quick-view]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.boardQuickView === activeKey);
  });
}

function scheduleSyncQuickViews() {
  window.clearTimeout(syncTimer);
  syncTimer = window.setTimeout(syncQuickViews, 50);
}

function enhanceAssignmentCards() {
  document.querySelectorAll(".assignment-list-item:not([data-board-enhanced])").forEach((card) => {
    card.dataset.boardEnhanced = "true";
    addDueChip(card);
    collapseNotes(card);
  });
}

function addDueChip(card) {
  const header = card.querySelector(".assignment-list-item-header");
  const actions = card.querySelector(".assignment-row-actions");
  const scheduleCell = [...card.querySelectorAll(".assignment-detail-cell")].find((cell) => {
    return cell.querySelector("span")?.textContent?.trim().toLowerCase().includes("schedule");
  });
  const scheduleValue = scheduleCell?.querySelector("strong")?.textContent?.trim();
  if (!header || !actions || !scheduleValue || card.querySelector(".assignment-board-due")) return;

  const due = document.createElement("div");
  due.className = "assignment-board-due";
  due.innerHTML = `<span>Scheduled</span>${escapeHtml(scheduleValue)}`;
  actions.insertAdjacentElement("beforebegin", due);
}

function collapseNotes(card) {
  const notes = card.querySelector(":scope > .assignment-notes-preview");
  if (!notes) return;

  const noteCount = notes.querySelectorAll("p").length;
  const drawer = document.createElement("details");
  drawer.className = "assignment-notes-drawer";
  drawer.innerHTML = `<summary><span>Scope and Instructions</span><strong>${noteCount}</strong></summary>`;
  drawer.append(notes);
  card.append(drawer);
}

function observeAssignments() {
  const root = document.querySelector("[data-assignments-page]") || document.body;
  const observer = new MutationObserver(() => {
    mountQuickViews();
    enhanceAssignmentCards();
    scheduleSyncQuickViews();
  });
  observer.observe(root, { childList: true, subtree: true });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[char]));
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initAssignmentBoardUx);
} else {
  initAssignmentBoardUx();
}
