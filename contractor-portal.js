import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const env = window.__ENV || {};
const supabase = env.SUPABASE_URL && env.SUPABASE_ANON_KEY
  ? createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY)
  : null;

const root = document.getElementById("contractorPortalApp");
const pageKey = document.body?.dataset?.contractorPage || "dashboard";

const navItems = [
  ["dashboard", "Dashboard", "contractor.html"],
  ["my-jobs", "My Jobs", "contractor-my-assignments.html"],
  ["schedule", "Schedule", "contractor-schedule.html"],
  ["resources", "Resources", "contractor-resources.html"],
  ["messages", "Messages", "contractor-messages.html"],
  ["documents", "Documents", "contractor-documents.html"],
  ["payments", "Payments", "contractor-payments.html"],
  ["performance", "Performance", "contractor-performance-portal.html"],
  ["job-board", "Job Board", "contractor-available.html"],
  ["video-library", "Video Library", "contractor-video-library.html"]
];

const pageMeta = {
  dashboard: ["Dashboard", "Good morning, Contractor"],
  "my-jobs": ["My Jobs", "View and manage all jobs assigned to you."],
  schedule: ["Schedule", "Track upcoming assignments and manage availability."],
  resources: ["Resources", "Access important files, forms, and resources."],
  messages: ["Messages", "Communicate with property managers and the operations team."],
  documents: ["Documents", "Access important files, forms, and resources."],
  payments: ["Payments", "Track your earnings, view payment history, and manage payment methods."],
  performance: ["Performance", "Track your performance, quality, and growth over time."],
  "job-board": ["Job Board", "Find and apply for jobs that match your preferences and availability."],
  "video-library": ["Video Library", "View and manage all QA videos you have uploaded from completed jobs."]
};

const state = {
  user: null,
  profile: null,
  openAssignments: [],
  myAssignments: [],
  videos: [],
  loading: true,
  message: "",
  messageError: false,
  filters: {
    search: "",
    jobType: "all",
    payRange: "all",
    myStatus: "active",
    videoPhase: "all"
  },
  scheduleCursor: startOfWeek(new Date())
};

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function normalizeToken(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function titleCase(value) {
  return String(value || "")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function money(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return "$0";
  return number.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function dateValue(value) {
  if (!value) return 0;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function formatDate(value, fallback = "Not scheduled") {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return date.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

function formatTime(value, fallback = "") {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function formatWindow(item) {
  const start = formatDate(item.start_window);
  const startTime = formatTime(item.start_window);
  const endTime = formatTime(item.end_window);
  return `${start}${startTime ? `, ${startTime}` : ""}${endTime ? ` - ${endTime}` : ""}`;
}

function isSameDay(a, b) {
  return a && b &&
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

function startOfWeek(value) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - date.getDay());
  return date;
}

function addDays(value, count) {
  const date = new Date(value);
  date.setDate(date.getDate() + count);
  return date;
}

function initials() {
  const name = state.profile?.full_name || state.user?.user_metadata?.full_name || state.user?.email || "Contractor";
  return name
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "CO";
}

function contractorName() {
  return state.profile?.full_name || state.user?.user_metadata?.full_name || state.user?.email?.split("@")[0] || "Contractor";
}

function statusClass(status) {
  return `cp-status-${normalizeToken(status || "unknown")}`;
}

function assignmentTitle(item) {
  return item.property_name || item.title || "Turnly Assignment";
}

function assignmentSubtitle(item) {
  return [item.address, item.service_type].filter(Boolean).join(" - ") || "Details pending";
}

function activeAssignments() {
  return state.myAssignments.filter((item) => !["completed", "cancelled", "declined"].includes(normalizeToken(item.status)));
}

function completedAssignments(days = 365) {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return state.myAssignments.filter((item) => {
    const status = normalizeToken(item.status);
    const completedAt = dateValue(item.completed_at || item.updated_at);
    return status === "completed" && completedAt >= cutoff;
  });
}

function todayAssignments() {
  const today = new Date();
  return activeAssignments().filter((item) => {
    const date = item.start_window ? new Date(item.start_window) : null;
    return date && isSameDay(date, today);
  });
}

function nextAssignments(limit = 6) {
  return activeAssignments()
    .slice()
    .sort((a, b) => dateValue(a.start_window) - dateValue(b.start_window))
    .slice(0, limit);
}

function totalPay(rows) {
  return rows.reduce((sum, item) => sum + (Number(item.pay_amount) || 0), 0);
}

function metric(label, value, subtext, icon) {
  return `
    <article class="cp-metric">
      <span class="cp-metric-icon">${esc(icon)}</span>
      <strong>${esc(value)}</strong>
      <p>${esc(label)}</p>
      <small class="cp-muted">${esc(subtext)}</small>
    </article>
  `;
}

function panel(title, content, options = {}) {
  const action = options.action || "";
  const kicker = options.kicker ? `<p class="cp-panel-kicker">${esc(options.kicker)}</p>` : "";
  return `
    <section class="cp-panel ${options.className || ""}">
      <div class="cp-panel-heading">
        <div>${kicker}<h2>${esc(title)}</h2></div>
        ${action}
      </div>
      ${content}
    </section>
  `;
}

function emptyState(text) {
  return `<div class="cp-empty">${esc(text)}</div>`;
}

function mapLink(item) {
  const query = item.address || item.property_name || item.title || "";
  return query ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` : "";
}

function assignmentActions(item, mode) {
  const status = normalizeToken(item.status);
  const directions = mapLink(item);
  const actions = [];
  if (mode === "open") {
    actions.push(`<button type="button" class="cp-action" data-claim-assignment-id="${esc(item.id)}">Claim</button>`);
  }
  if (mode === "mine" && ["open", "preferred-pending", "claimed", "scheduled"].includes(status)) {
    actions.push(`<button type="button" class="cp-action" data-start-assignment-id="${esc(item.id)}">Start</button>`);
  }
  if (mode === "mine" && status === "in-progress") {
    actions.push(`<button type="button" class="cp-action" data-tj-open-checklist="${esc(item.id)}">Checklist</button>`);
  }
  if (directions) {
    actions.push(`<a class="cp-ghost-action" href="${esc(directions)}" target="_blank" rel="noopener">Map</a>`);
  }
  return actions.join("");
}

function assignmentRow(item, mode = "mine") {
  const status = item.status || "open";
  const actions = assignmentActions(item, mode);
  return `
    <article class="cp-job-row">
      <div class="cp-job-main">
        <strong>${esc(assignmentTitle(item))}</strong>
        <small>${esc(assignmentSubtitle(item))}</small>
      </div>
      <div class="cp-job-meta">
        <span>Schedule</span>
        <strong>${esc(formatWindow(item))}</strong>
      </div>
      <div class="cp-job-meta">
        <span>Pay</span>
        <strong>${esc(money(item.pay_amount))}</strong>
      </div>
      <div class="cp-job-meta">
        <span>Status</span>
        <strong class="cp-pill ${statusClass(status)}">${esc(titleCase(status))}</strong>
      </div>
      <div class="cp-job-actions">${actions}</div>
    </article>
  `;
}

function topbar() {
  const meta = pageMeta[pageKey] || pageMeta.dashboard;
  return `
    <header class="cp-topbar">
      <div class="cp-page-title">
        <h1>${esc(meta[0])}</h1>
        <p>${esc(meta[1])}</p>
      </div>
      <label class="cp-search">
        <span>Search</span>
        <input id="cpGlobalSearch" type="search" placeholder="Search jobs..." value="${esc(state.filters.search)}" />
      </label>
      <select class="cp-select" aria-label="Switch property">
        <option>Switch Property</option>
        ${Array.from(new Set(state.myAssignments.map((item) => item.property_name).filter(Boolean))).slice(0, 8).map((name) => `<option>${esc(name)}</option>`).join("")}
      </select>
      <button id="logoutBtn" class="cp-ghost-action" type="button">Sign Out</button>
    </header>
    <p id="claimMessage" class="cp-status-message ${state.messageError ? "error" : ""}" aria-live="polite">${esc(state.message)}</p>
  `;
}

function sidebar() {
  return `
    <aside class="cp-sidebar">
      <a class="cp-brand" href="contractor.html" aria-label="Turnly contractor dashboard">
        <span class="cp-brand-mark">T</span>
        <span>TURNLY</span>
      </a>
      <nav class="cp-nav" aria-label="Contractor navigation">
        <p class="cp-nav-title">Contractor Portal</p>
        ${navItems.map(([key, label, href]) => `
          <a class="cp-nav-link ${key === pageKey ? "active" : ""}" href="${esc(href)}">
            <span>${esc(label)}</span>
          </a>
        `).join("")}
      </nav>
      <section class="cp-support">
        <small>Need help?</small>
        <strong>Turnly Ops Center</strong>
        <small>ops@turnlypros.com</small>
      </section>
      <section class="cp-profile">
        <span class="cp-profile-avatar">${esc(initials())}</span>
        <span>
          <strong>${esc(contractorName())}</strong>
          <small>Contractor</small>
        </span>
      </section>
    </aside>
  `;
}

function renderShell() {
  if (!root) return;
  root.innerHTML = `
    <main class="cp-shell">
      ${sidebar()}
      <section class="cp-main" id="${pageKey === "dashboard" ? "contractorDashboard" : "contractorPortalMain"}">
        ${topbar()}
        ${renderPage()}
      </section>
    </main>
  `;
}

function renderPage() {
  if (state.loading) return loadingPanels();
  switch (pageKey) {
    case "my-jobs": return renderMyJobs();
    case "schedule": return renderSchedule();
    case "resources": return renderResources();
    case "messages": return renderMessages();
    case "documents": return renderDocuments();
    case "payments": return renderPayments();
    case "performance": return renderPerformance();
    case "job-board": return renderJobBoard();
    case "video-library": return renderVideoLibrary();
    default: return renderDashboard();
  }
}

function loadingPanels() {
  return `
    <section class="cp-metric-strip">
      ${[1, 2, 3, 4, 5].map((index) => metric("Loading", index === 1 ? "..." : "--", "Syncing Supabase", "T")).join("")}
    </section>
    ${panel("Loading Portal", emptyState("Loading contractor data..."))}
  `;
}

function renderMetrics() {
  const completed30 = completedAssignments(30);
  const active = activeAssignments();
  const today = todayAssignments();
  const open = state.openAssignments;
  const onTimeRate = state.myAssignments.length ? Math.round((completedAssignments(365).length / state.myAssignments.length) * 100) : 0;
  return `
    <section class="cp-metric-strip">
      ${metric("Total Earnings", money(totalPay(completed30)), "last 30 days", "$")}
      ${metric("Active Projects", String(active.length), "claimed and in progress", "A")}
      ${metric("Today's Jobs", String(today.length), "scheduled today", "T")}
      ${metric("Open Jobs", String(open.length), "available on board", "B")}
      ${metric("Completion Rate", `${onTimeRate}%`, "based on assignments", "P")}
    </section>
  `;
}

function renderDashboard() {
  const upcoming = nextAssignments(5);
  return `
    ${renderMetrics()}
    <section class="cp-dashboard-grid">
      <div class="cp-stack">
        ${panel("Upcoming Assignments", upcoming.length ? `<div class="cp-job-list">${upcoming.map((item) => assignmentRow(item, "mine")).join("")}</div>` : emptyState("No upcoming assignments."), {
          action: `<a class="cp-ghost-action" href="contractor-my-assignments.html">View All</a>`
        })}
        ${panel("Earnings Overview", renderChart(completedAssignments(60)), { kicker: "Payments" })}
      </div>
      <div class="cp-stack">
        ${panel("Announcements", renderAnnouncements())}
        ${panel("Tasks", emptyState("No critical tasks due right now."))}
        ${panel("Quick Actions", `
          <div class="cp-quick-grid">
            <a class="cp-action" href="contractor-available.html">Find Jobs</a>
            <a class="cp-ghost-action" href="contractor-schedule.html">Open Schedule</a>
            <a class="cp-ghost-action" href="contractor-documents.html">Documents</a>
            <a class="cp-ghost-action" href="contractor-payments.html">Payments</a>
          </div>
        `)}
      </div>
    </section>
  `;
}

function renderAnnouncements() {
  const items = [
    ["Schedule Updates", `${todayAssignments().length} job(s) on today's route.`],
    ["Quality Reminder", "Capture notes before completing active work."],
    ["Payments", `${money(totalPay(completedAssignments(30)))} completed this month.`]
  ];
  return `<div class="cp-feed-list">${items.map(([title, body]) => `<div class="cp-feed-item"><strong>${esc(title)}</strong><small>${esc(body)}</small></div>`).join("")}</div>`;
}

function renderChart(rows) {
  const weeks = Array.from({ length: 8 }, (_, index) => {
    const end = Date.now() - (7 - index) * 7 * 24 * 60 * 60 * 1000;
    const start = end - 7 * 24 * 60 * 60 * 1000;
    return totalPay(rows.filter((item) => {
      const value = dateValue(item.completed_at || item.updated_at);
      return value >= start && value < end;
    }));
  });
  const max = Math.max(...weeks, 1);
  return `<div class="cp-chart">${weeks.map((value) => `<span style="height:${Math.max(14, Math.round((value / max) * 130))}px"></span>`).join("")}</div>`;
}

function renderMyJobs() {
  const rows = filteredMyAssignments();
  return `
    ${renderMetrics()}
    <section class="cp-two-column">
      ${panel("Claimed Work", `
        <div class="cp-tabs">
          ${["active", "claimed", "in_progress", "completed", "all"].map((status) => `<button class="cp-tab ${state.filters.myStatus === status ? "active" : ""}" type="button" data-my-status="${esc(status)}">${esc(titleCase(status))}</button>`).join("")}
        </div>
        <div id="myAssignments" class="cp-job-list">${rows.length ? rows.map((item) => assignmentRow(item, "mine")).join("") : emptyState("No jobs match this view.")}</div>
      `)}
      <aside class="cp-stack">
        ${panel("Job Details", renderSelectedJobDetail(rows[0] || state.myAssignments[0]))}
        ${panel("Job Summary", renderJobSummary())}
      </aside>
    </section>
  `;
}

function filteredMyAssignments() {
  const term = state.filters.search.trim().toLowerCase();
  return state.myAssignments.filter((item) => {
    const status = normalizeToken(item.status);
    if (state.filters.myStatus === "active" && ["completed", "cancelled", "declined"].includes(status)) return false;
    if (!["active", "all"].includes(state.filters.myStatus) && normalizeToken(state.filters.myStatus) !== status) return false;
    if (!term) return true;
    return [item.title, item.property_name, item.address, item.service_type, item.scope, item.special_instructions]
      .some((value) => String(value || "").toLowerCase().includes(term));
  }).sort((a, b) => dateValue(a.start_window) - dateValue(b.start_window));
}

function renderSelectedJobDetail(item) {
  if (!item) return emptyState("Select a job to view details.");
  return `
    <div class="cp-detail-list">
      <div><span>Property</span><strong>${esc(assignmentTitle(item))}</strong></div>
      <div><span>Address</span><strong>${esc(item.address || "Not set")}</strong></div>
      <div><span>Schedule</span><strong>${esc(formatWindow(item))}</strong></div>
      <div><span>Pay</span><strong>${esc(money(item.pay_amount))}</strong></div>
      <div><span>Scope</span><strong>${esc(item.scope || "No scope listed")}</strong></div>
      <div><span>Notes</span><strong>${esc(item.special_instructions || "No special notes")}</strong></div>
    </div>
  `;
}

function renderJobSummary() {
  const active = activeAssignments();
  return `
    <div class="cp-mini-list">
      <div class="cp-mini-row"><span>Claimed</span><strong>${active.filter((item) => normalizeToken(item.status) === "claimed").length}</strong></div>
      <div class="cp-mini-row"><span>In Progress</span><strong>${active.filter((item) => normalizeToken(item.status) === "in-progress").length}</strong></div>
      <div class="cp-mini-row"><span>Completed This Month</span><strong>${completedAssignments(30).length}</strong></div>
    </div>
  `;
}

function renderJobBoard() {
  const rows = filteredOpenAssignments();
  const preferred = rows.filter((item) => normalizeToken(item.visibility) === "preferred" || item.preferred_first);
  return `
    <section class="cp-job-board-layout">
      ${panel("Available Jobs", `
        <div class="cp-filter-row">
          <label class="cp-search"><span>Search</span><input id="cpBoardSearch" type="search" value="${esc(state.filters.search)}" placeholder="Search jobs..." /></label>
          <select id="cpJobType" class="cp-select" aria-label="Job type">
            ${option("all", "All Job Types", state.filters.jobType)}
            ${option("one_time", "One Time", state.filters.jobType)}
            ${option("recurring", "Recurring", state.filters.jobType)}
            ${option("hybrid", "Hybrid", state.filters.jobType)}
          </select>
          <select id="cpPayRange" class="cp-select" aria-label="Pay range">
            ${option("all", "All Pay", state.filters.payRange)}
            ${option("0-100", "$0 - $100", state.filters.payRange)}
            ${option("100-200", "$100 - $200", state.filters.payRange)}
            ${option("200", "$200+", state.filters.payRange)}
          </select>
        </div>
        ${preferred.length ? `<p class="cp-muted">${preferred.length} preferred job(s) are visible to you.</p>` : ""}
        <div id="contractorAssignments" class="cp-job-list">${rows.length ? rows.map((item) => assignmentRow(item, "open")).join("") : emptyState("No open assignments available right now.")}</div>
      `)}
      <aside class="cp-stack">
        ${panel("Filters", renderBoardFilterSummary())}
        ${panel("How It Works", `
          <div class="cp-mini-list">
            <div class="cp-mini-row"><strong>Claim</strong><small>Move open work into My Jobs.</small></div>
            <div class="cp-mini-row"><strong>Start</strong><small>Start from My Jobs when you are ready.</small></div>
            <div class="cp-mini-row"><strong>Complete</strong><small>Finish the checklist from the active job flow.</small></div>
          </div>
        `)}
      </aside>
    </section>
  `;
}

function option(value, label, current) {
  return `<option value="${esc(value)}" ${value === current ? "selected" : ""}>${esc(label)}</option>`;
}

function filteredOpenAssignments() {
  const term = state.filters.search.trim().toLowerCase();
  return state.openAssignments.filter((item) => {
    const type = normalizeToken(item.assignment_type || item.recurrence_frequency || "one_time");
    if (state.filters.jobType !== "all" && type !== normalizeToken(state.filters.jobType)) return false;
    const pay = Number(item.pay_amount) || 0;
    if (state.filters.payRange === "0-100" && (pay < 0 || pay > 100)) return false;
    if (state.filters.payRange === "100-200" && (pay < 100 || pay > 200)) return false;
    if (state.filters.payRange === "200" && pay < 200) return false;
    if (!term) return true;
    return [item.title, item.property_name, item.address, item.service_type, item.scope, item.special_instructions]
      .some((value) => String(value || "").toLowerCase().includes(term));
  }).sort((a, b) => dateValue(a.start_window) - dateValue(b.start_window));
}

function renderBoardFilterSummary() {
  const rows = filteredOpenAssignments();
  return `
    <div class="cp-mini-list">
      <div class="cp-mini-row"><span>Showing</span><strong>${rows.length} jobs</strong></div>
      <div class="cp-mini-row"><span>Average Pay</span><strong>${esc(money(rows.length ? totalPay(rows) / rows.length : 0))}</strong></div>
      <div class="cp-mini-row"><span>Next Available</span><strong>${esc(formatDate(rows[0]?.start_window, "None"))}</strong></div>
    </div>
  `;
}

function renderSchedule() {
  const start = new Date(state.scheduleCursor);
  const end = addDays(start, 6);
  return `
    <section class="cp-schedule-layout">
      ${panel("Weekly Schedule", `
        <div class="cp-filter-row">
          <button class="cp-ghost-action" type="button" data-schedule-nav="prev">Previous</button>
          <button class="cp-ghost-action" type="button" data-schedule-nav="today">Today</button>
          <button class="cp-ghost-action" type="button" data-schedule-nav="next">Next</button>
          <strong>${esc(formatDate(start))} - ${esc(formatDate(end))}</strong>
        </div>
        ${renderCalendar(start)}
      `)}
      <aside class="cp-stack">
        ${panel("Mini Calendar", renderMiniCalendar(new Date()))}
        ${panel("Upcoming Assignments", `<div class="cp-mini-list">${nextAssignments(5).map((item) => `<div class="cp-mini-row"><strong>${esc(assignmentTitle(item))}</strong><small>${esc(formatWindow(item))}</small></div>`).join("") || emptyState("No upcoming assignments.")}</div>`)}
        ${panel("Availability", `
          <div class="cp-mini-list">
            <div class="cp-mini-row"><span>Monday</span><strong>Available</strong></div>
            <div class="cp-mini-row"><span>Tuesday</span><strong>Available</strong></div>
            <div class="cp-mini-row"><span>Weekend</span><strong>By assignment</strong></div>
          </div>
        `)}
      </aside>
    </section>
  `;
}

function renderCalendar(start) {
  const days = Array.from({ length: 7 }, (_, index) => addDays(start, index));
  return `
    <div class="cp-calendar">
      ${days.map((day) => {
        const rows = activeAssignments().filter((item) => item.start_window && isSameDay(new Date(item.start_window), day));
        return `
          <section class="cp-calendar-day ${isSameDay(day, new Date()) ? "today" : ""}">
            <strong>${esc(day.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" }))}</strong>
            ${rows.map((item) => `
              <a class="cp-calendar-event" href="contractor-my-assignments.html">
                <strong>${esc(assignmentTitle(item))}</strong>
                <small>${esc(formatTime(item.start_window))} ${esc(money(item.pay_amount))}</small>
              </a>
            `).join("") || `<small class="cp-muted">No jobs</small>`}
          </section>
        `;
      }).join("")}
    </div>
  `;
}

function renderMiniCalendar(value) {
  const start = startOfWeek(new Date(value.getFullYear(), value.getMonth(), 1));
  const days = Array.from({ length: 35 }, (_, index) => addDays(start, index));
  return `
    <div class="cp-mini-calendar">
      ${["S", "M", "T", "W", "T", "F", "S"].map((day) => `<strong>${day}</strong>`).join("")}
      ${days.map((day) => `<span class="${isSameDay(day, new Date()) ? "active" : ""}">${day.getDate()}</span>`).join("")}
    </div>
  `;
}

function renderResources() {
  const resources = [
    ["Cleaning Standards", "Turnly quality expectations for recurring service."],
    ["Property Access", "Gate codes, lockboxes, and arrival process notes."],
    ["Supplies Guide", "Approved products, replacements, and supply handling."],
    ["Safety SOPs", "Incident response and site safety standards."],
    ["Forms", "Reusable field forms and service records."],
    ["Announcements", "Operational updates from the Turnly team."]
  ];
  return panel("Resource Hub", `<div class="cp-resource-grid">${resources.map(([title, body]) => `<article class="cp-resource-item"><strong>${esc(title)}</strong><p>${esc(body)}</p></article>`).join("")}</div>`);
}

function renderMessages() {
  const conversations = nextAssignments(8);
  return `
    <section class="cp-messages-layout">
      ${panel("Conversations", `<div class="cp-chat-list">${conversations.length ? conversations.map((item, index) => `<div class="cp-chat-item ${index === 0 ? "active" : ""}"><strong>${esc(assignmentTitle(item))}</strong><small>${esc(item.address || "Operations Team")}</small></div>`).join("") : emptyState("No conversations yet.")}</div>`)}
      ${panel("Message", `
        <div class="cp-conversation">
          <div class="cp-conversation-box">
            <p class="cp-panel-kicker">Conversation Details</p>
            <h2>${esc(assignmentTitle(conversations[0]))}</h2>
            <p class="cp-muted">Messages for this job will appear here when connected to the messaging backend.</p>
          </div>
        </div>
      `)}
      ${panel("Shared Files", emptyState("No files shared yet."))}
    </section>
  `;
}

function renderDocuments() {
  const docs = [
    ["Contractor Agreement", "Ready"],
    ["Insurance", "Valid"],
    ["W-9", "Ready"],
    ["Training SOPs", "Ready"],
    ["Company Policies", "Ready"],
    ["Emergency Information", "Ready"]
  ];
  return `
    <section class="cp-documents-layout">
      ${panel("Document Hub", `<div class="cp-document-grid">${docs.map(([title, status]) => `<article class="cp-document-tile"><strong>${esc(title)}</strong><p>${esc(status)}</p></article>`).join("")}</div>`)}
      <aside class="cp-stack">
        ${panel("Recent Uploads", emptyState("No recent uploads."))}
        ${panel("Quick Actions", `<div class="cp-mini-list"><a class="cp-ghost-action" href="#">Upload Document</a><a class="cp-ghost-action" href="#">Request Document</a><a class="cp-ghost-action" href="#">Download All</a></div>`)}
      </aside>
    </section>
  `;
}

function renderPayments() {
  const completed = completedAssignments(365).sort((a, b) => dateValue(b.completed_at) - dateValue(a.completed_at));
  return `
    ${renderMetrics()}
    <section class="cp-payments-layout">
      <div class="cp-stack">
        ${panel("Earnings Overview", renderChart(completed))}
        ${panel("Transaction History", renderPaymentTable(completed))}
      </div>
      <aside class="cp-stack">
        ${panel("Payment Methods", emptyState("No payment methods added."))}
        ${panel("Quick Actions", `<div class="cp-mini-list"><a class="cp-ghost-action" href="#">View Invoices</a><a class="cp-ghost-action" href="#">Download Statements</a><a class="cp-ghost-action" href="#">Payment Help</a></div>`)}
      </aside>
    </section>
  `;
}

function renderPaymentTable(rows) {
  if (!rows.length) return emptyState("No completed payment history yet.");
  return `
    <table class="cp-table">
      <thead><tr><th>Job</th><th>Date</th><th>Status</th><th>Amount</th></tr></thead>
      <tbody>
        ${rows.slice(0, 12).map((item) => `<tr><td>${esc(assignmentTitle(item))}</td><td>${esc(formatDate(item.completed_at || item.updated_at))}</td><td>${esc(titleCase(item.status))}</td><td>${esc(money(item.pay_amount))}</td></tr>`).join("")}
      </tbody>
    </table>
  `;
}

function renderPerformance() {
  const completed = completedAssignments(365);
  const total = state.myAssignments.length || 1;
  const completionRate = Math.round((completed.length / total) * 100);
  const active = activeAssignments();
  return `
    <section class="cp-performance-grid">
      ${metric("Task Completion", `${completionRate}%`, "assigned jobs completed", "C")}
      ${metric("Quality Score", "94%", "latest QA trend", "Q")}
      ${metric("On-Time Rate", active.length ? "Tracking" : "100%", "based on schedules", "T")}
    </section>
    <section class="cp-dashboard-grid">
      ${panel("Job Completion", renderChart(completed), { kicker: "Performance Overview" })}
      <aside class="cp-stack">
        ${panel("Performance Summary", `
          <div class="cp-mini-list">
            <div class="cp-mini-row"><span>Completed Jobs</span><strong>${completed.length}</strong></div>
            <div class="cp-mini-row"><span>Active Jobs</span><strong>${active.length}</strong></div>
            <div class="cp-mini-row"><span>Average Pay</span><strong>${esc(money(completed.length ? totalPay(completed) / completed.length : 0))}</strong></div>
          </div>
        `)}
        ${panel("Next Goal", `<div class="cp-mini-row"><strong>Complete active jobs cleanly</strong><small>Keep checklist notes updated for each site.</small></div>`)}
      </aside>
    </section>
  `;
}

function renderVideoLibrary() {
  const videos = filteredVideos();
  return `
    <section class="cp-video-layout">
      ${panel("Video Library", `
        <div class="cp-filter-row">
          <label class="cp-search"><span>Search</span><input id="cpVideoSearch" type="search" value="${esc(state.filters.search)}" placeholder="Search videos..." /></label>
          <select id="cpVideoPhase" class="cp-select" aria-label="Video phase">
            ${option("all", "All Videos", state.filters.videoPhase)}
            ${option("before", "Before", state.filters.videoPhase)}
            ${option("after", "After", state.filters.videoPhase)}
            ${option("other", "Other", state.filters.videoPhase)}
          </select>
        </div>
        <div class="cp-video-grid">${videos.length ? videos.map(renderVideoCard).join("") : renderVideoPlaceholders()}</div>
      `)}
      <aside class="cp-stack">
        ${panel("Storage Overview", `
          <div class="cp-mini-list">
            <div class="cp-mini-row"><span>Total Videos</span><strong>${state.videos.length}</strong></div>
            <div class="cp-mini-row"><span>This Month</span><strong>${state.videos.filter((video) => dateValue(video.created_at) > Date.now() - 30 * 24 * 60 * 60 * 1000).length}</strong></div>
          </div>
        `)}
        ${panel("Quick Actions", `<div class="cp-mini-list"><a class="cp-ghost-action" href="contractor-my-assignments.html">Open Active Jobs</a><a class="cp-ghost-action" href="contractor-resources.html">Training Resources</a></div>`)}
      </aside>
    </section>
  `;
}

function filteredVideos() {
  const term = state.filters.search.trim().toLowerCase();
  return state.videos.filter((video) => {
    const phase = normalizeToken(video.video_phase || "other");
    if (state.filters.videoPhase !== "all" && phase !== normalizeToken(state.filters.videoPhase)) return false;
    if (!term) return true;
    return [video.title, video.label, video.property_name, video.unit_name, video.contractor_name, video.notes]
      .some((value) => String(value || "").toLowerCase().includes(term));
  });
}

function renderVideoCard(video) {
  return `
    <article class="cp-video-card">
      <div class="cp-video-thumb"><span class="cp-play">Play</span></div>
      <strong>${esc(video.title || video.label || "QA Video")}</strong>
      <small>${esc(video.property_name || "Property not linked")}</small>
      <p>${esc(formatDate(video.recorded_at || video.created_at))}</p>
    </article>
  `;
}

function renderVideoPlaceholders() {
  const labels = ["Job Pro Walkthrough", "Floor Detail Review", "Turnover Checklist", "Supply Setup", "Final QA Review", "Issue Documentation"];
  return labels.map((label) => `
    <article class="cp-video-card">
      <div class="cp-video-thumb"><span class="cp-play">Play</span></div>
      <strong>${esc(label)}</strong>
      <small>Training</small>
      <p>Ready when videos are uploaded.</p>
    </article>
  `).join("");
}

async function loadData() {
  if (!supabase) {
    state.loading = false;
    state.message = "Supabase configuration is missing.";
    state.messageError = true;
    renderShell();
    return;
  }

  const { data: userData } = await supabase.auth.getUser();
  state.user = userData?.user || null;
  if (!state.user) {
    window.location.href = "contractor-login.html";
    return;
  }

  await Promise.all([
    loadProfile(),
    loadOpenAssignments(),
    loadMyAssignments(),
    loadVideos()
  ]);
  state.loading = false;
  renderShell();
}

async function loadProfile() {
  const { data } = await supabase
    .from("profiles")
    .select("full_name,email,role,status")
    .eq("id", state.user.id)
    .maybeSingle();
  state.profile = data || null;
}

async function loadOpenAssignments() {
  const { data, error } = await supabase
    .from("assignment_blocks")
    .select("*")
    .in("status", ["open", "preferred_pending"])
    .is("claimed_by", null)
    .order("start_window", { ascending: true });

  if (error) {
    state.message = `Unable to load open jobs: ${error.message}`;
    state.messageError = true;
    state.openAssignments = [];
    return;
  }

  state.openAssignments = data || [];
}

async function loadMyAssignments() {
  const { data, error } = await supabase
    .from("assignment_blocks")
    .select("*")
    .or(`claimed_by.eq.${state.user.id},assigned_to.eq.${state.user.id}`)
    .order("start_window", { ascending: true });

  if (error) {
    state.message = `Unable to load my jobs: ${error.message}`;
    state.messageError = true;
    state.myAssignments = [];
    return;
  }

  state.myAssignments = data || [];
}

async function loadVideos() {
  const { data, error } = await supabase
    .from("qa_videos")
    .select("id,title,label,video_phase,property_name,unit_name,contractor_name,recorded_at,notes,created_at")
    .order("created_at", { ascending: false })
    .limit(24);
  state.videos = error ? [] : data || [];
}

async function claimAssignment(assignmentId) {
  state.message = "Claiming assignment...";
  state.messageError = false;
  renderShell();

  let result = await supabase.rpc("claim_assignment_block", { target_assignment_id: assignmentId });
  if (result.error && /function|schema cache|not found/i.test(result.error.message || "")) {
    const contractor = contractorName();
    const claimPayload = {
      status: "claimed",
      claimed_by: state.user.id,
      claimed_by_name: contractor,
      claimed_by_email: state.user.email || null,
      claimed_at: new Date().toISOString()
    };
    result = await supabase
      .from("assignment_blocks")
      .update(claimPayload)
      .eq("id", assignmentId)
      .eq("status", "open")
      .is("claimed_by", null)
      .select("*")
      .maybeSingle();
    if (result.error && /claimed_by_name|claimed_by_email|schema cache|could not find/i.test(result.error.message || "")) {
      result = await supabase
        .from("assignment_blocks")
        .update({
          status: claimPayload.status,
          claimed_by: claimPayload.claimed_by,
          claimed_at: claimPayload.claimed_at
        })
        .eq("id", assignmentId)
        .eq("status", "open")
        .is("claimed_by", null)
        .select("*")
        .maybeSingle();
    }
  }

  if (result.error) {
    state.message = `Unable to claim assignment: ${result.error.message}`;
    state.messageError = true;
  } else {
    state.message = "Assignment claimed. It is now in My Jobs.";
    state.messageError = false;
  }

  await Promise.all([loadOpenAssignments(), loadMyAssignments()]);
  renderShell();
}

function refreshFilterOnly() {
  if (pageKey === "job-board") {
    const target = document.getElementById("contractorAssignments");
    if (target) {
      const rows = filteredOpenAssignments();
      target.innerHTML = rows.length ? rows.map((item) => assignmentRow(item, "open")).join("") : emptyState("No open assignments available right now.");
    }
  }
  if (pageKey === "my-jobs") {
    const target = document.getElementById("myAssignments");
    if (target) {
      const rows = filteredMyAssignments();
      target.innerHTML = rows.length ? rows.map((item) => assignmentRow(item, "mine")).join("") : emptyState("No jobs match this view.");
    }
  }
  if (pageKey === "video-library") {
    const target = document.querySelector(".cp-video-grid");
    if (target) {
      const rows = filteredVideos();
      target.innerHTML = rows.length ? rows.map(renderVideoCard).join("") : renderVideoPlaceholders();
    }
  }
}

function attachEvents() {
  root?.addEventListener("click", async (event) => {
    const logoutButton = event.target.closest("#logoutBtn");
    if (logoutButton) {
      await supabase?.auth.signOut();
      window.location.href = "contractor-login.html";
      return;
    }

    const claimButton = event.target.closest("[data-claim-assignment-id]");
    if (claimButton) {
      claimButton.disabled = true;
      await claimAssignment(claimButton.dataset.claimAssignmentId);
      return;
    }

    const statusButton = event.target.closest("[data-my-status]");
    if (statusButton) {
      state.filters.myStatus = statusButton.dataset.myStatus;
      renderShell();
      return;
    }

    const scheduleNav = event.target.closest("[data-schedule-nav]");
    if (scheduleNav) {
      const action = scheduleNav.dataset.scheduleNav;
      if (action === "today") state.scheduleCursor = startOfWeek(new Date());
      if (action === "prev") state.scheduleCursor = addDays(state.scheduleCursor, -7);
      if (action === "next") state.scheduleCursor = addDays(state.scheduleCursor, 7);
      renderShell();
    }
  });

  root?.addEventListener("input", (event) => {
    if (event.target.matches("#cpGlobalSearch, #cpBoardSearch, #cpVideoSearch")) {
      state.filters.search = event.target.value;
      refreshFilterOnly();
    }
  });

  root?.addEventListener("change", (event) => {
    if (event.target.matches("#cpJobType")) {
      state.filters.jobType = event.target.value;
      renderShell();
    }
    if (event.target.matches("#cpPayRange")) {
      state.filters.payRange = event.target.value;
      renderShell();
    }
    if (event.target.matches("#cpVideoPhase")) {
      state.filters.videoPhase = event.target.value;
      renderShell();
    }
  });
}

attachEvents();
renderShell();
void loadData();
