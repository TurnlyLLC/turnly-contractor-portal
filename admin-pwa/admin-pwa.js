import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const env = window.__ENV || {};
const supabase = env.SUPABASE_URL && env.SUPABASE_ANON_KEY
  ? createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY)
  : null;

const root = document.getElementById("adminPwaApp");
const pageKey = document.body?.dataset?.adminPwaPage || "dashboard";
const themeKey = "turnlyAdminPwaTheme";
const videoBucket = "qa-videos";
const videoMaxBytes = 524288000;
const signedUrlSeconds = 60 * 60 * 4;

const navItems = [
  ["dashboard", "Dashboard", "/admin-pwa/", "home"],
  ["schedule", "Schedule", "/admin-pwa/schedule.html", "calendar"],
  ["assignments", "Assignments", "/admin-pwa/assignments.html", "clipboard"],
  ["videos", "Videos", "/admin-pwa/videos.html", "video"],
  ["people", "People", "/admin-pwa/people.html", "users"],
  ["messages", "Messages", "/admin-pwa/messages.html", "message"]
];

const pageMeta = {
  dashboard: ["Admin PWA", "Mobile command center for Turnly operations."],
  schedule: ["Schedule", "Review weekly jobs, update timing, and open assignment details."],
  assignments: ["Assignments", "Approve, schedule, assign, and update Turnly jobs."],
  videos: ["QA Videos", "Review before and after videos tied to assignment records."],
  people: ["People", "Separate contractor and property manager account views."],
  messages: ["Messages", "Send and reply to Turnly portal conversations."]
};

const statusOptions = [
  ["pending", "Pending"],
  ["open", "Open"],
  ["claimed", "Claimed"],
  ["scheduled", "Scheduled"],
  ["in_progress", "In Progress"],
  ["completed", "Completed"],
  ["qa_pending", "QA Pending"],
  ["cancelled", "Cancelled"],
  ["declined", "Declined"],
  ["draft", "Draft"]
];

const priorityOptions = [
  ["normal", "Normal"],
  ["high", "High"],
  ["urgent", "Urgent"]
];

const state = {
  user: null,
  profile: null,
  assignments: [],
  properties: [],
  profiles: [],
  units: [],
  videos: [],
  videosByAssignmentId: new Map(),
  messages: [],
  threads: [],
  participants: [],
  selectedThreadId: "",
  selectedAssignmentId: "",
  loading: true,
  message: "",
  messageError: false,
  profileMenuOpen: false,
  signInMessage: "",
  signInError: false,
  savingAssignment: false,
  uploadingVideos: false,
  sendingMessage: false,
  filters: {
    search: "",
    status: "board",
    videoSearch: "",
    peopleSearch: ""
  },
  scheduleCursor: startOfWeek(new Date())
};

const iconPaths = {
  bell: '<path d="M10.27 21a2 2 0 0 0 3.46 0"/><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/>',
  calendar: '<path d="M8 2v4"/><path d="M16 2v4"/><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M3 10h18"/>',
  check: '<path d="m20 6-11 11-5-5"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  chevronLeft: '<path d="m15 18-6-6 6-6"/>',
  chevronRight: '<path d="m9 18 6-6-6-6"/>',
  clipboard: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>',
  home: '<path d="m3 11 9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M9 20v-6h6v6"/>',
  logOut: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
  message: '<path d="M21 15a4 4 0 0 1-4 4H7l-4 4V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/>',
  moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
  plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
  refresh: '<path d="M21 12a9 9 0 0 1-15.5 6.2L3 16"/><path d="M3 21v-5h5"/><path d="M3 12A9 9 0 0 1 18.5 5.8L21 8"/><path d="M21 3v5h-5"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="M4.93 4.93l1.41 1.41"/><path d="M17.66 17.66l1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="M6.34 17.66l-1.41 1.41"/><path d="M19.07 4.93l-1.41 1.41"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5"/><path d="M12 3v12"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  video: '<path d="m22 8-6 4 6 4V8Z"/><rect x="2" y="6" width="14" height="12" rx="2"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>'
};

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function selectorValue(value) {
  return String(value ?? "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function icon(name) {
  const path = iconPaths[name] || iconPaths.home;
  return `<span class="ap-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${path}</svg></span>`;
}

function normalizeToken(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function titleCase(value) {
  return String(value || "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function money(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return "$0";
  return number.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateValue(value, fallback = Number.MAX_SAFE_INTEGER) {
  return parseDate(value)?.getTime() || fallback;
}

function startOfWeek(value) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - date.getDay());
  return date;
}

function addDays(value, days) {
  const date = new Date(value);
  date.setDate(date.getDate() + days);
  return date;
}

function sameDay(a, b) {
  return a && b
    && a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

function formatDate(value, fallback = "Not scheduled") {
  const date = parseDate(value);
  return date ? date.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" }) : fallback;
}

function formatShortDate(value, fallback = "") {
  const date = parseDate(value);
  return date ? date.toLocaleDateString([], { month: "short", day: "numeric" }) : fallback;
}

function formatTime(value, fallback = "") {
  const date = parseDate(value);
  return date ? date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : fallback;
}

function formatDateWindow(start, end) {
  const startDate = parseDate(start);
  const endDate = parseDate(end);
  if (!startDate) return "No start time";
  const startText = startDate.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  if (!endDate) return startText;
  const endText = endDate.toLocaleString([], sameDay(startDate, endDate)
    ? { hour: "numeric", minute: "2-digit" }
    : { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  return `${startText} - ${endText}`;
}

function toDatetimeInput(value) {
  const date = parseDate(value);
  if (!date) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function fromDatetimeInput(value) {
  const date = parseDate(value);
  return date ? date.toISOString() : null;
}

function formatBytes(value) {
  const size = Number(value) || 0;
  if (size >= 1024 * 1024 * 1024) return `${(size / 1024 / 1024 / 1024).toFixed(2)} GB`;
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
  if (size >= 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${size} B`;
}

function uuidOrNull(value) {
  const text = String(value || "").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text) ? text : null;
}

function getTheme() {
  try {
    return localStorage.getItem(themeKey) === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

function setTheme(theme) {
  const safeTheme = theme === "light" ? "light" : "dark";
  document.body.dataset.theme = safeTheme;
  try {
    localStorage.setItem(themeKey, safeTheme);
  } catch {
    // Current page can still use the selected theme.
  }
}

function assignmentMetadata(row = {}) {
  const meta = row.metadata;
  if (meta && typeof meta === "object" && !Array.isArray(meta)) return meta;
  if (typeof meta === "string" && meta.trim()) {
    try {
      const parsed = JSON.parse(meta);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

function statusKey(value) {
  return normalizeToken(value || "open");
}

function statusBadge(value) {
  const key = statusKey(value);
  return `<span class="ap-pill ap-status-${esc(key)}">${esc(titleCase(key || "open"))}</span>`;
}

function profileRole(row = {}) {
  return normalizeToken(row.role || "");
}

function isAdminProfile(row = state.profile) {
  return profileRole(row) === "admin";
}

function isContractorProfile(row = {}) {
  const role = profileRole(row);
  return role === "contractor" || role === "cleaner";
}

function isPropertyManagerProfile(row = {}) {
  return ["property-manager", "property_manager", "manager"].includes(profileRole(row));
}

function personName(row = {}) {
  return row.full_name || row.email || "User";
}

function initials() {
  const name = personName(state.profile || state.user || {});
  return name
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "TA";
}

function propertyTitle(row = {}) {
  return row.property_name || row.name || row.title || "Property";
}

function propertyAddress(row = {}) {
  return row.address || [row.city, row.state].filter(Boolean).join(", ") || "";
}

function rowPropertyId(row = {}) {
  const meta = assignmentMetadata(row);
  return row.portal_property_id || row.recurring_portal_property_id || row.property_id || meta.portal_property_id || meta.property_id || "";
}

function unitNumber(row = {}) {
  const meta = assignmentMetadata(row);
  return row.unit_number || row.unit_name || meta.unit_number || meta.unit_name || meta.unit_id || "";
}

function unitMeta(row = {}) {
  const meta = assignmentMetadata(row);
  const sqft = Number(row.unit_square_feet || meta.unit_square_feet || 0);
  const bed = row.bedrooms || meta.bedrooms || meta.bed_count || "";
  const bath = row.bathrooms || meta.bathrooms || meta.bath_count || "";
  return [
    bed || bath ? `${bed || "?"} Bed / ${bath || "?"} Bath` : "",
    sqft > 0 ? `${sqft.toLocaleString()} sq ft` : ""
  ].filter(Boolean).join(" - ");
}

function contractorName(row = {}) {
  return row.assigned_to_name || row.assigned_to_email || row.claimed_by_name || row.claimed_by_email || "Unassigned";
}

function contractorId(row = {}) {
  return row.assigned_to || row.claimed_by || "";
}

function assignmentTitle(row = {}) {
  const unit = unitNumber(row);
  if (unit) return `Unit ${unit}`;
  return row.title || row.property_name || "Assignment";
}

function isBoardStatus(row = {}) {
  return ["pending", "open", "preferred-pending", "claimed", "scheduled", "in-progress", "draft"].includes(statusKey(row.status));
}

function isPendingTurnRequest(row = {}) {
  const meta = assignmentMetadata(row);
  const source = normalizeToken(meta.source || "");
  const approval = normalizeToken(meta.admin_approval_status || "");
  return statusKey(row.status) === "pending" || source === "property-manager-turn-request" && approval !== "approved";
}

function filteredAssignments() {
  const search = state.filters.search.trim().toLowerCase();
  const filter = state.filters.status;
  return state.assignments
    .filter((row) => {
      if (filter === "board" && !isBoardStatus(row)) return false;
      if (filter !== "all" && filter !== "board" && statusKey(row.status) !== normalizeToken(filter)) return false;
      if (!search) return true;
      const haystack = [
        row.title,
        row.property_name,
        row.address,
        unitNumber(row),
        contractorName(row),
        row.service_type,
        row.status
      ].join(" ").toLowerCase();
      return haystack.includes(search);
    })
    .sort((a, b) => dateValue(a.start_window) - dateValue(b.start_window));
}

function pendingTurnRequests() {
  return state.assignments
    .filter(isPendingTurnRequest)
    .sort((a, b) => dateValue(a.created_at, 0) - dateValue(b.created_at, 0));
}

function weekAssignments() {
  const start = state.scheduleCursor;
  const end = addDays(start, 7);
  return state.assignments
    .filter((row) => {
      const date = parseDate(row.start_window);
      return date && date >= start && date < end;
    })
    .sort((a, b) => dateValue(a.start_window) - dateValue(b.start_window));
}

function selectedAssignment() {
  return state.assignments.find((row) => String(row.id || "") === String(state.selectedAssignmentId || "")) || null;
}

function selectedThread() {
  return state.threads.find((thread) => String(thread.id) === String(state.selectedThreadId)) || null;
}

function threadParticipants(threadId) {
  return state.participants.filter((participant) => participant.thread_id === threadId);
}

function participantLine(threadId) {
  const names = threadParticipants(threadId)
    .filter((participant) => participant.user_id !== state.user?.id)
    .map((participant) => participant.display_name || participant.email || titleCase(participant.role || "User"))
    .filter(Boolean);
  return names.length ? names.join(", ") : "Turnly";
}

function messageTime(value) {
  const date = parseDate(value);
  return date ? date.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "No date";
}

function renderShell() {
  setTheme(getTheme());
  if (!root) return;
  if (!supabase) {
    root.innerHTML = renderNotice("Supabase Config Missing", "The admin PWA needs env.js with Supabase URL and anon key.");
    return;
  }
  if (state.loading) {
    root.innerHTML = renderNotice("Loading Admin PWA", "Syncing your Turnly admin data.");
    return;
  }
  if (!state.user) {
    root.innerHTML = renderLogin();
    return;
  }
  if (!isAdminProfile()) {
    root.innerHTML = renderNotice("Admin Access Required", "This PWA is only available for Turnly admin accounts.", true);
    return;
  }

  const [title, subtitle] = pageMeta[pageKey] || pageMeta.dashboard;
  root.innerHTML = `
    <div class="ap-shell">
      <aside class="ap-sidebar">
        ${brand()}
        <nav class="ap-nav" aria-label="Admin PWA navigation">
          <span class="ap-nav-title">Admin PWA</span>
          ${navItems.map(navLink).join("")}
        </nav>
        <div class="ap-sidebar-foot">
          <strong>Turnly mobile admin</strong>
          <span>Separate PWA surface using the same Supabase data.</span>
          <a href="/dashboard.html">Desktop Admin</a>
        </div>
      </aside>
      <main class="ap-main">
        <header class="ap-topbar">
          <div class="ap-page-title">
            <h1>${esc(title)}</h1>
            <p>${esc(subtitle)}</p>
          </div>
          <button class="ap-install" type="button" data-pwa-install hidden>${icon("plus")}<span>Install</span></button>
          <button class="ap-theme-toggle" type="button" data-theme-toggle role="switch" aria-checked="${getTheme() === "light" ? "true" : "false"}">
            <span class="ap-theme-dot"></span><span>${getTheme() === "light" ? "Light" : "Dark"}</span>
          </button>
          <button class="ap-refresh" type="button" data-refresh>${icon("refresh")}<span>Refresh</span></button>
          ${profileMenu()}
        </header>
        ${state.message ? `<p class="ap-status ${state.messageError ? "error" : ""}">${esc(state.message)}</p>` : ""}
        ${renderPage()}
      </main>
      ${bottomNav()}
      ${renderAssignmentModal()}
    </div>
  `;
  refreshInstallControls();
}

function brand() {
  return `<a class="ap-brand" href="/admin-pwa/" aria-label="Turnly Admin PWA"><span class="ap-brand-mark"></span><strong>TURNLY</strong></a>`;
}

function navLink([key, label, href, iconName]) {
  return `
    <a class="ap-nav-link ${key === pageKey ? "active" : ""}" href="${esc(href)}">
      ${icon(iconName)}<span>${esc(label)}</span>
    </a>
  `;
}

function bottomNav() {
  const keys = new Set(["dashboard", "schedule", "assignments", "videos", "messages"]);
  return `
    <nav class="ap-bottom-nav" aria-label="Admin PWA mobile navigation">
      ${navItems.filter(([key]) => keys.has(key)).map(([key, label, href, iconName]) => `
        <a class="${key === pageKey ? "active" : ""}" href="${esc(href)}">
          ${icon(iconName)}<strong>${esc(label)}</strong>
        </a>
      `).join("")}
    </nav>
  `;
}

function profileMenu() {
  return `
    <div class="ap-profile-wrap">
      <button class="ap-profile-btn" type="button" data-profile-toggle aria-haspopup="menu" aria-expanded="${state.profileMenuOpen ? "true" : "false"}">
        <span class="ap-avatar">${esc(initials())}</span>
        <span><strong>${esc(personName(state.profile))}</strong><small>Admin</small></span>
        ${icon("chevronDown")}
      </button>
      <div class="ap-dropdown" data-profile-menu ${state.profileMenuOpen ? "" : "hidden"}>
        <a href="/dashboard.html">${icon("home")}<span><strong>Desktop Admin</strong><small>Open full admin portal</small></span></a>
        <button type="button" data-sign-out>${icon("logOut")}<span><strong>Sign Out</strong><small>Return to portal home</small></span></button>
      </div>
    </div>
  `;
}

function renderPage() {
  if (pageKey === "schedule") return renderSchedule();
  if (pageKey === "assignments") return renderAssignments();
  if (pageKey === "videos") return renderVideos();
  if (pageKey === "people") return renderPeople();
  if (pageKey === "messages") return renderMessages();
  return renderDashboard();
}

function renderNotice(title, text, canSignOut = false) {
  return `
    <div class="ap-login-shell">
      <section class="ap-login-card">
        ${brand()}
        <h1>${esc(title)}</h1>
        <p class="ap-muted">${esc(text)}</p>
        ${canSignOut ? `<button class="ap-secondary" type="button" data-sign-out>${icon("logOut")}<span>Sign Out</span></button>` : ""}
      </section>
    </div>
  `;
}

function renderLogin() {
  return `
    <div class="ap-login-shell">
      <section class="ap-login-card">
        ${brand()}
        <div>
          <p class="ap-muted">Turnly Admin PWA</p>
          <h1>Mobile control for Turnly operations.</h1>
        </div>
        <form class="ap-login-form" id="apLoginForm">
          <label class="ap-form-field">
            <span>Email</span>
            <input name="email" type="email" autocomplete="email" required />
          </label>
          <label class="ap-form-field">
            <span>Password</span>
            <input name="password" type="password" autocomplete="current-password" required />
          </label>
          <button class="ap-btn" type="submit">${icon("check")}<span>Sign In</span></button>
          <a class="ap-muted" href="/reset-password.html">Forgot password?</a>
          ${state.signInMessage ? `<p class="ap-status ${state.signInError ? "error" : ""}">${esc(state.signInMessage)}</p>` : ""}
        </form>
      </section>
    </div>
  `;
}

function renderDashboard() {
  const today = new Date();
  const sevenDaysAgo = addDays(today, -7);
  const metrics = [
    ["Open Jobs", state.assignments.filter((row) => statusKey(row.status) === "open").length, "ready for contractors", "clipboard"],
    ["Pending Requests", pendingTurnRequests().length, "need admin review", "bell"],
    ["In Progress", state.assignments.filter((row) => statusKey(row.status) === "in-progress").length, "currently active", "refresh"],
    ["Completed 7 Days", state.assignments.filter((row) => statusKey(row.status) === "completed" && dateValue(row.completed_at || row.end_window, 0) >= sevenDaysAgo.getTime()).length, "finished recently", "check"],
    ["QA Videos", state.videos.length, "latest uploads", "video"]
  ];
  const todaysJobs = state.assignments
    .filter((row) => sameDay(parseDate(row.start_window), today))
    .sort((a, b) => dateValue(a.start_window) - dateValue(b.start_window))
    .slice(0, 8);
  return `
    <section class="ap-metric-strip">
      ${metrics.map(([label, value, meta, iconName]) => metricCard(label, value, meta, iconName)).join("")}
    </section>
    <section class="ap-dashboard-grid">
      <div class="ap-stack">
        ${panel("Pending Turn Requests", renderPendingRequests(), `<a class="ap-secondary" href="/admin-pwa/assignments.html">All Assignments</a>`)}
        ${panel("Today's Schedule", todaysJobs.length ? todaysJobs.map((row) => assignmentCard(row, true)).join("") : empty("No assignments scheduled for today."), `<a class="ap-secondary" href="/admin-pwa/schedule.html">Open Schedule</a>`)}
      </div>
      <div class="ap-stack">
        ${panel("Quick Actions", `
          <div class="ap-card-grid">
            <button class="ap-btn" type="button" data-open-assignment="new">${icon("plus")}<span>New Assignment</span></button>
            <a class="ap-secondary" href="/admin-pwa/messages.html">${icon("message")}<span>Messages</span></a>
            <a class="ap-secondary" href="/admin-pwa/videos.html">${icon("video")}<span>QA Videos</span></a>
            <a class="ap-secondary" href="/admin-pwa/people.html">${icon("users")}<span>People</span></a>
          </div>
        `)}
        ${panel("Latest QA Videos", renderVideoMiniList())}
      </div>
    </section>
  `;
}

function renderPendingRequests() {
  const rows = pendingTurnRequests().slice(0, 8);
  if (!rows.length) return empty("No pending property manager requests.");
  return `<div class="ap-list">${rows.map((row) => assignmentCard(row, true, true)).join("")}</div>`;
}

function renderVideoMiniList() {
  const rows = state.videos.slice(0, 5);
  if (!rows.length) return empty("No QA videos uploaded yet.");
  return `<div class="ap-list">${rows.map((video) => `
    <article class="ap-list-item">
      <div class="ap-video-head">
        <div>
          <strong>${esc(video.title || video.label || video.file_name || "QA Video")}</strong>
          <small>${esc([video.video_phase, video.property_name, video.unit_name, formatShortDate(video.created_at)].filter(Boolean).join(" - "))}</small>
        </div>
        ${video.signedUrl ? `<a class="ap-secondary" href="${esc(video.signedUrl)}" target="_blank" rel="noreferrer">Open</a>` : ""}
      </div>
    </article>
  `).join("")}</div>`;
}

function metricCard(label, value, meta, iconName) {
  return `
    <article class="ap-metric">
      <span class="ap-metric-icon">${icon(iconName)}</span>
      <strong>${esc(Number(value || 0).toLocaleString())}</strong>
      <span>${esc(label)}</span>
      <p>${esc(meta)}</p>
    </article>
  `;
}

function panel(title, body, action = "") {
  return `
    <section class="ap-panel">
      <div class="ap-panel-head">
        <h2>${esc(title)}</h2>
        ${action}
      </div>
      ${body}
    </section>
  `;
}

function empty(text) {
  return `<div class="ap-empty">${esc(text)}</div>`;
}

function renderSchedule() {
  const start = state.scheduleCursor;
  const days = Array.from({ length: 7 }, (_, index) => addDays(start, index));
  const rows = weekAssignments();
  const pendingCount = rows.filter((row) => ["pending", "draft", "preferred-pending"].includes(statusKey(row.status))).length;
  const openCount = rows.filter((row) => ["open", "scheduled", "claimed"].includes(statusKey(row.status))).length;
  const activeCount = rows.filter((row) => statusKey(row.status) === "in-progress").length;
  const completedCount = rows.filter((row) => statusKey(row.status) === "completed").length;
  return `
    <section class="ap-schedule-hero">
      <div class="ap-schedule-title">
        <span class="ap-eyebrow">Weekly Schedule</span>
        <h2>${esc(formatDate(days[0]))} - ${esc(formatDate(days[6]))}</h2>
        <p>${rows.length.toLocaleString()} assignment${rows.length === 1 ? "" : "s"} scheduled for this Sunday through Saturday window.</p>
      </div>
      <div class="ap-schedule-actions">
        <div class="ap-week-stepper" aria-label="Week navigation">
          <button class="ap-secondary" type="button" data-week-nav="prev">${icon("chevronLeft")}<span>Prev</span></button>
          <button class="ap-secondary" type="button" data-week-nav="today">Today</button>
          <button class="ap-secondary" type="button" data-week-nav="next"><span>Next</span>${icon("chevronRight")}</button>
        </div>
        <button class="ap-btn" type="button" data-open-assignment="new">${icon("plus")}<span>New Assignment</span></button>
      </div>
    </section>
    <section class="ap-schedule-stats" aria-label="Week summary">
      ${scheduleStat("Pending", pendingCount, "Needs review", "pending")}
      ${scheduleStat("Open / Claimed", openCount, "Ready to work", "open")}
      ${scheduleStat("In Progress", activeCount, "Active now", "active")}
      ${scheduleStat("Completed", completedCount, "Finished this week", "completed")}
    </section>
    <section class="ap-calendar" aria-label="Weekly assignment calendar">
      ${days.map((day) => renderScheduleDay(day, rows)).join("")}
    </section>
  `;
}

function scheduleStat(label, value, meta, tone) {
  return `
    <article class="ap-schedule-stat ${tone ? `tone-${esc(tone)}` : ""}">
      <span>${esc(label)}</span>
      <strong>${esc(Number(value || 0).toLocaleString())}</strong>
      <small>${esc(meta)}</small>
    </article>
  `;
}

function renderScheduleDay(day, rows) {
  const dayRows = rows.filter((row) => sameDay(parseDate(row.start_window), day));
  const dayLabel = day.toLocaleDateString([], { weekday: "long" });
  return `
    <article class="ap-calendar-day ${sameDay(day, new Date()) ? "today" : ""} ${dayRows.length ? "has-jobs" : ""}">
      <header class="ap-calendar-day-head">
        <div>
          <span class="ap-day-name">${esc(dayLabel)}</span>
          <strong>${esc(formatShortDate(day))}</strong>
        </div>
        <span class="ap-day-count">${dayRows.length.toLocaleString()} ${dayRows.length === 1 ? "job" : "jobs"}</span>
      </header>
      <div class="ap-calendar-jobs">
        ${dayRows.length ? dayRows.map((row) => assignmentCard(row, false, false, "schedule")).join("") : `<div class="ap-calendar-empty">No jobs scheduled</div>`}
      </div>
    </article>
  `;
}

function renderAssignments() {
  const rows = filteredAssignments();
  return `
    <section class="ap-panel">
      <div class="ap-filter-row">
        <label class="ap-search">
          ${icon("search")}<input id="apAssignmentSearch" type="search" value="${esc(state.filters.search)}" placeholder="Search assignments..." />
        </label>
        <select class="ap-select" id="apStatusFilter" aria-label="Assignment status filter">
          ${[
            ["board", "Job Board"],
            ["all", "All"],
            ...statusOptions
          ].map(([value, label]) => `<option value="${esc(value)}" ${state.filters.status === value ? "selected" : ""}>${esc(label)}</option>`).join("")}
        </select>
        <button class="ap-btn" type="button" data-open-assignment="new">${icon("plus")}<span>New Assignment</span></button>
      </div>
      <p class="ap-muted">${rows.length.toLocaleString()} assignment${rows.length === 1 ? "" : "s"} shown.</p>
      <div class="ap-list">
        ${rows.length ? rows.map((row) => assignmentCard(row, true, isPendingTurnRequest(row))).join("") : empty("No assignments match this view.")}
      </div>
    </section>
  `;
}

function assignmentCard(row, detailed = false, approval = false, variant = "") {
  const id = String(row.id || "");
  const key = statusKey(row.status);
  const unit = unitNumber(row);
  const timeStart = formatTime(row.start_window, "No start");
  const timeEnd = formatTime(row.end_window);
  const timeText = timeEnd ? `${timeStart} - ${timeEnd}` : timeStart;
  const code = row.assignment_code || row.assignment_number || (id ? `A-${id.slice(0, 8).toUpperCase()}` : "");
  const variantClass = variant ? ` is-${esc(variant)}` : "";
  return `
    <article class="ap-list-item ap-assignment-card ap-status-accent-${esc(key)} ${detailed ? "is-detailed" : ""}${variantClass}" role="button" tabindex="0" data-open-assignment="${esc(id)}" aria-label="Open ${esc(assignmentTitle(row))}">
      <div class="ap-list-row ap-assignment-top">
        <div class="ap-assignment-main">
          <div class="ap-assignment-kicker">
            ${code ? `<span>${esc(code)}</span>` : ""}
            <span>${esc(timeText)}</span>
          </div>
          <strong>${esc(assignmentTitle(row))}</strong>
          <small>${esc(row.property_name || "No property")}${unit ? ` - Unit ${esc(unit)}` : ""}</small>
        </div>
        ${statusBadge(key)}
      </div>
      <div class="ap-assignment-meta">
        <span>${icon("calendar")}<b>${esc(formatDateWindow(row.start_window, row.end_window))}</b></span>
        <span>${icon("clipboard")}<b>${esc(unitMeta(row) || (unit ? `Unit ${unit}` : "No unit details"))}</b></span>
        <span>${icon("users")}<b>${esc(contractorName(row))}</b></span>
        <span class="ap-pay-chip">${esc(money(row.pay_amount))}</span>
      </div>
      ${detailed ? `<p class="ap-muted">${esc(row.special_instructions || row.scope || "No notes entered.")}</p>` : ""}
      ${approval ? `<button class="ap-btn ap-approve-btn" type="button" data-approve-assignment="${esc(id)}">${icon("check")}<span>Approve</span></button>` : ""}
    </article>
  `;
}

function renderVideos() {
  const search = state.filters.videoSearch.trim().toLowerCase();
  const rows = state.videos.filter((video) => {
    if (!search) return true;
    return [video.title, video.label, video.file_name, video.property_name, video.unit_name, video.contractor_name, video.video_phase]
      .join(" ")
      .toLowerCase()
      .includes(search);
  });
  return `
    <section class="ap-panel">
      <div class="ap-filter-row">
        <label class="ap-search">
          ${icon("search")}<input id="apVideoSearch" type="search" value="${esc(state.filters.videoSearch)}" placeholder="Search videos..." />
        </label>
      </div>
      <div class="ap-video-grid">
        ${rows.length ? rows.map(videoCard).join("") : empty("No QA videos found.")}
      </div>
    </section>
  `;
}

function videoCard(video) {
  return `
    <article class="ap-card ap-video-card">
      <div class="ap-video-thumb">${icon("video")}</div>
      <div>
        <strong>${esc(video.title || video.label || video.file_name || "QA Video")}</strong>
        <p class="ap-video-meta">${esc([video.video_phase, video.property_name, video.unit_name, video.contractor_name, formatShortDate(video.created_at)].filter(Boolean).join(" - "))}</p>
      </div>
      ${video.notes ? `<p class="ap-muted">${esc(video.notes)}</p>` : ""}
      ${video.signedUrl ? `<a class="ap-secondary" href="${esc(video.signedUrl)}" target="_blank" rel="noreferrer">Open Video</a>` : `<span class="ap-muted">Preview unavailable</span>`}
    </article>
  `;
}

function renderPeople() {
  const search = state.filters.peopleSearch.trim().toLowerCase();
  const people = state.profiles.filter((row) => {
    if (!search) return true;
    return [row.full_name, row.email, row.role, row.status].join(" ").toLowerCase().includes(search);
  });
  const contractors = people.filter(isContractorProfile);
  const managers = people.filter(isPropertyManagerProfile);
  return `
    <section class="ap-panel">
      <div class="ap-filter-row">
        <label class="ap-search">
          ${icon("search")}<input id="apPeopleSearch" type="search" value="${esc(state.filters.peopleSearch)}" placeholder="Search people..." />
        </label>
      </div>
      <section class="ap-dashboard-grid">
        ${panel(`Contractors (${contractors.length})`, peopleList(contractors, "contractor"))}
        ${panel(`Property Managers (${managers.length})`, peopleList(managers, "property_manager"))}
      </section>
    </section>
  `;
}

function peopleList(rows, role) {
  if (!rows.length) return empty(`No ${role === "contractor" ? "contractors" : "property managers"} found.`);
  return `<div class="ap-list">${rows.map((row) => personCard(row, role)).join("")}</div>`;
}

function personCard(row, role) {
  const property = row.property_manager_property_id
    ? state.properties.find((item) => String(item.id) === String(row.property_manager_property_id))
    : null;
  const approved = row.contractor_approved === true || normalizeToken(row.status) === "active";
  return `
    <article class="ap-list-item">
      <div class="ap-list-row">
        <div class="ap-assignment-main">
          <strong>${esc(personName(row))}</strong>
          <small>${esc(row.email || "No email")}</small>
        </div>
        ${role === "contractor" ? statusBadge(approved ? "active" : "pending") : statusBadge(row.status || "active")}
      </div>
      <div class="ap-assignment-meta">
        <span>${esc(titleCase(row.role || role))}</span>
        ${property ? `<span>${esc(propertyTitle(property))}</span>` : ""}
      </div>
      ${role === "contractor" ? `<button class="ap-secondary" type="button" data-toggle-contractor="${esc(row.id)}" data-approved="${approved ? "false" : "true"}">${approved ? "Mark Pending" : "Approve Contractor"}</button>` : ""}
    </article>
  `;
}

function renderMessages() {
  return `
    <section class="ap-thread-layout">
      <aside class="ap-panel">
        <div class="ap-panel-head">
          <h2>Conversations</h2>
          <button class="ap-btn" type="button" data-new-message>${icon("plus")}<span>New</span></button>
        </div>
        ${renderNewMessageForm()}
        <div class="ap-thread-list">
          ${state.threads.length ? state.threads.map(threadCard).join("") : empty("No conversations yet.")}
        </div>
      </aside>
      <section class="ap-panel ap-message-panel">
        ${renderConversation()}
      </section>
    </section>
  `;
}

function renderNewMessageForm() {
  if (!state.newMessageOpen) return "";
  const recipients = state.profiles
    .filter((row) => row.id && row.id !== state.user?.id)
    .sort((a, b) => personName(a).localeCompare(personName(b)));
  return `
    <form id="apNewMessageForm" class="ap-new-message">
      <label class="ap-form-field">
        <span>Recipient</span>
        <select name="recipientId" required>
          <option value="">Choose recipient...</option>
          ${recipients.map((row) => `<option value="${esc(row.id)}">${esc(personName(row))} - ${esc(row.email || titleCase(row.role))}</option>`).join("")}
        </select>
      </label>
      <label class="ap-form-field">
        <span>Subject</span>
        <input name="subject" type="text" placeholder="Message subject" />
      </label>
      <label class="ap-form-field">
        <span>Message</span>
        <textarea name="body" required placeholder="Type your message..."></textarea>
      </label>
      <div class="ap-form-actions">
        <button class="ap-secondary" type="button" data-cancel-new-message>Cancel</button>
        <button class="ap-btn" type="submit" ${state.sendingMessage ? "disabled" : ""}>Send</button>
      </div>
    </form>
  `;
}

function threadCard(thread) {
  return `
    <button class="ap-thread-card ${thread.id === state.selectedThreadId ? "active" : ""}" type="button" data-thread-id="${esc(thread.id)}">
      <strong>${esc(thread.subject || "Message")}</strong>
      <small>${esc(participantLine(thread.id))}</small>
      <p>${esc(thread.last_message_preview || "No messages yet.")}</p>
      <small>${esc(messageTime(thread.last_message_at || thread.created_at))}</small>
    </button>
  `;
}

function renderConversation() {
  const thread = selectedThread();
  if (!thread) return `<div class="ap-empty">Choose or start a conversation.</div>`;
  return `
    <div class="ap-message-head">
      <div>
        <h2>${esc(thread.subject || "Message")}</h2>
        <p class="ap-muted">${esc(participantLine(thread.id))}</p>
      </div>
      <button class="ap-secondary" type="button" data-refresh>${icon("refresh")}<span>Refresh</span></button>
    </div>
    <div class="ap-message-list">
      ${state.messages.length ? state.messages.map(messageBubble).join("") : empty("No messages in this conversation yet.")}
    </div>
    <form id="apReplyForm" class="ap-message-form">
      <label class="ap-form-field">
        <span>Reply</span>
        <textarea name="body" rows="2" required placeholder="Type your reply..."></textarea>
      </label>
      <button class="ap-btn" type="submit" ${state.sendingMessage ? "disabled" : ""}>Send</button>
    </form>
  `;
}

function messageBubble(message) {
  const mine = String(message.sender_id || "") === String(state.user?.id || "");
  return `
    <article class="ap-message-bubble ${mine ? "mine" : ""}">
      <div class="ap-list-row">
        <strong>${esc(message.sender_name || message.sender_email || "User")}</strong>
        <small>${esc(messageTime(message.created_at))}</small>
      </div>
      <p>${esc(message.body || "")}</p>
    </article>
  `;
}

function renderAssignmentModal() {
  if (!state.selectedAssignmentId) return "";
  const row = selectedAssignment();
  const isNew = state.selectedAssignmentId === "new";
  const current = isNew ? {} : row || {};
  const title = isNew ? "New Assignment" : assignmentTitle(current);
  const propertyId = rowPropertyId(current);
  const assigned = contractorId(current);
  return `
    <div class="ap-modal" role="dialog" aria-modal="true" aria-labelledby="apAssignmentModalTitle">
      <button class="ap-modal-backdrop" type="button" aria-label="Close assignment" data-close-assignment></button>
      <section class="ap-modal-panel">
        <div class="ap-modal-head">
          <div>
            <p class="ap-muted">${isNew ? "Create assignment" : "Assignment details"}</p>
            <h2 id="apAssignmentModalTitle">${esc(title)}</h2>
          </div>
          <button class="ap-close" type="button" aria-label="Close assignment" data-close-assignment>${icon("x")}</button>
        </div>
        <form id="apAssignmentForm" class="ap-modal-form" data-assignment-id="${isNew ? "" : esc(current.id || "")}">
          <div class="ap-form-grid">
            <label class="ap-form-field wide">
              <span>Property</span>
              <select name="property_id" required>
                <option value="">Choose property...</option>
                ${state.properties.map((property) => `<option value="${esc(property.id)}" ${String(property.id) === String(propertyId) ? "selected" : ""}>${esc(propertyTitle(property))}</option>`).join("")}
              </select>
            </label>
            ${field("title", "Assignment Title", current.title || "", "text", true)}
            ${field("unit_number", "Unit Number", unitNumber(current), "text")}
            ${selectField("status", "Status", statusOptions, current.status || "open")}
            ${selectField("priority", "Priority", priorityOptions, current.priority || "normal")}
            ${field("start_window", "Start", toDatetimeInput(current.start_window), "datetime-local", true)}
            ${field("end_window", "End", toDatetimeInput(current.end_window), "datetime-local", true)}
            ${field("pay_amount", "Contractor Pay", current.pay_amount ?? "", "number")}
            ${contractorSelect(assigned)}
            ${textareaField("scope", "Scope", current.scope || "")}
            ${textareaField("supplies_notes", "Supplies Notes", current.supplies_notes || "")}
            ${textareaField("special_instructions", "Special Instructions", current.special_instructions || "")}
          </div>
          <div class="ap-form-actions">
            <button class="ap-secondary" type="button" data-close-assignment>Cancel</button>
            <button class="ap-btn" type="submit" ${state.savingAssignment ? "disabled" : ""}>${state.savingAssignment ? "Saving..." : "Save Assignment"}</button>
          </div>
        </form>
        ${isNew ? "" : renderVideoUploadPanel(current)}
      </section>
    </div>
  `;
}

function field(name, label, value, type = "text", required = false) {
  return `
    <label class="ap-form-field">
      <span>${esc(label)}</span>
      <input name="${esc(name)}" type="${esc(type)}" value="${esc(value)}" ${required ? "required" : ""} ${type === "number" ? 'min="0" step="0.01"' : ""} />
    </label>
  `;
}

function textareaField(name, label, value) {
  return `
    <label class="ap-form-field wide">
      <span>${esc(label)}</span>
      <textarea name="${esc(name)}">${esc(value)}</textarea>
    </label>
  `;
}

function selectField(name, label, options, value) {
  const current = normalizeToken(value).replace(/-/g, "_");
  return `
    <label class="ap-form-field">
      <span>${esc(label)}</span>
      <select name="${esc(name)}">
        ${options.map(([optionValue, optionLabel]) => `<option value="${esc(optionValue)}" ${optionValue === current ? "selected" : ""}>${esc(optionLabel)}</option>`).join("")}
      </select>
    </label>
  `;
}

function contractorSelect(value) {
  const contractors = state.profiles.filter(isContractorProfile).sort((a, b) => personName(a).localeCompare(personName(b)));
  return `
    <label class="ap-form-field">
      <span>Assigned Contractor</span>
      <select name="contractor_id">
        <option value="">Unassigned</option>
        ${contractors.map((contractor) => `<option value="${esc(contractor.id)}" ${String(contractor.id) === String(value) ? "selected" : ""}>${esc(personName(contractor))}</option>`).join("")}
      </select>
    </label>
  `;
}

function renderVideoUploadPanel(row) {
  const videos = state.videosByAssignmentId.get(String(row.id || "")) || [];
  return `
    <section class="ap-upload-panel">
      <div class="ap-panel-head">
        <div>
          <h2>Before and After Videos</h2>
          <p class="ap-muted">${videos.length.toLocaleString()} attached to this assignment.</p>
        </div>
      </div>
      <div class="ap-attached-videos">
        ${videos.length ? videos.map(attachedVideoChip).join("") : `<div class="ap-empty">No videos attached yet.</div>`}
      </div>
      <div class="ap-upload-grid">
        ${videoFileField("before", "Before Video")}
        ${videoFileField("after", "After Video")}
      </div>
      <label class="ap-form-field">
        <span>Admin Notes</span>
        <textarea id="apVideoNotes" rows="3" placeholder="Optional note for these uploads"></textarea>
      </label>
      <div class="ap-upload-actions">
        <p class="ap-status ${state.videoError ? "error" : ""}" data-video-message>${esc(state.videoMessage || "")}</p>
        <button class="ap-btn" type="button" data-upload-videos ${state.uploadingVideos ? "disabled" : ""}>${icon("upload")}<span>${state.uploadingVideos ? "Uploading..." : "Upload Videos"}</span></button>
      </div>
    </section>
  `;
}

function videoFileField(phase, label) {
  return `
    <label class="ap-file-card">
      <span>${esc(label)}</span>
      <strong data-video-file-label="${esc(phase)}">Choose a video file</strong>
      <small>Video file up to ${esc(formatBytes(videoMaxBytes))}</small>
      <input type="file" accept="video/*" data-video-file="${esc(phase)}" />
    </label>
  `;
}

function attachedVideoChip(video) {
  const label = videoPhaseLabel(video.video_phase);
  const meta = [video.file_name, formatBytes(video.file_size || video.file_size_bytes || 0), formatShortDate(video.created_at)].filter(Boolean).join(" - ");
  return `
    <article class="ap-video-chip">
      <div>
        <strong>${esc(label)}</strong>
        <small>${esc(meta || video.title || "Uploaded video")}</small>
      </div>
      ${video.signedUrl ? `<a class="ap-secondary" href="${esc(video.signedUrl)}" target="_blank" rel="noreferrer">Open</a>` : ""}
    </article>
  `;
}

async function loadData(options = {}) {
  if (!supabase) return;
  if (!options.quiet) {
    state.loading = true;
    renderShell();
  }
  state.message = options.quiet ? state.message : "";
  state.messageError = false;

  const { data: userData } = await supabase.auth.getUser();
  state.user = userData?.user || null;
  if (!state.user) {
    state.profile = null;
    state.loading = false;
    renderShell();
    return;
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", state.user.id)
    .maybeSingle();
  if (profileError) {
    state.message = `Unable to load profile: ${profileError.message}`;
    state.messageError = true;
  }
  state.profile = profile ? { ...profile, id: state.user.id } : null;
  if (!isAdminProfile()) {
    state.loading = false;
    renderShell();
    return;
  }

  const [assignments, properties, profiles, units, videos] = await Promise.all([
    loadAllRows("assignment_blocks", { order: "start_window", ascending: true, limit: 1000 }),
    loadAllRows("portal_properties", { order: "property_name", ascending: true, limit: 1000 }),
    loadAllRows("profiles", { order: "full_name", ascending: true, limit: 1000 }),
    loadAllRows("property_units", { order: "unit_name", ascending: true, limit: 1000 }),
    loadVideos()
  ]);

  state.assignments = assignments.rows;
  state.properties = properties.rows;
  state.profiles = profiles.rows;
  state.units = units.rows;
  state.videos = videos.rows;
  if (assignments.error || properties.error || profiles.error || units.error || videos.error) {
    state.message = `Loaded with a Supabase warning: ${(assignments.error || properties.error || profiles.error || units.error || videos.error).message}`;
    state.messageError = true;
  }
  if (pageKey === "messages") await loadMessages();
  state.loading = false;
  renderShell();
}

async function loadAllRows(table, options = {}) {
  try {
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .order(options.order || "created_at", { ascending: options.ascending ?? false })
      .limit(options.limit || 1000);
    return { rows: error ? [] : data || [], error };
  } catch (error) {
    return { rows: [], error };
  }
}

async function loadVideos() {
  const { rows, error } = await loadAllRows("qa_videos", { order: "created_at", ascending: false, limit: 120 });
  const signedRows = await Promise.all(rows.map(async (video) => ({
    ...video,
    signedUrl: await signedVideoUrl(video)
  })));
  return { rows: signedRows, error };
}

async function signedVideoUrl(video) {
  const path = String(video?.storage_path || "").trim();
  if (!path) return "";
  try {
    const { data, error } = await supabase.storage
      .from(video.storage_bucket || videoBucket)
      .createSignedUrl(path, signedUrlSeconds);
    return error ? "" : (data?.signedUrl || "");
  } catch {
    return "";
  }
}

async function loadAssignmentVideos(row) {
  const assignmentId = String(row?.id || "");
  if (!assignmentId) return;
  const byId = new Map();
  const addRows = (rows = []) => rows.forEach((video) => {
    if (video?.id) byId.set(String(video.id), video);
  });

  const assignmentResult = await supabase
    .from("qa_videos")
    .select("*")
    .eq("assignment_id", assignmentId)
    .order("created_at", { ascending: false })
    .limit(80);
  if (assignmentResult.error) throw assignmentResult.error;
  addRows(assignmentResult.data);

  const qaJobId = assignmentQaJobId(row);
  if (qaJobId) {
    const jobResult = await supabase
      .from("qa_videos")
      .select("*")
      .eq("qa_job_id", qaJobId)
      .order("created_at", { ascending: false })
      .limit(80);
    if (jobResult.error) throw jobResult.error;
    addRows(jobResult.data);
  }

  const videos = await Promise.all(Array.from(byId.values())
    .sort((a, b) => dateValue(b.created_at || b.recorded_at, 0) - dateValue(a.created_at || a.recorded_at, 0))
    .map(async (video) => ({ ...video, signedUrl: await signedVideoUrl(video) })));
  state.videosByAssignmentId.set(assignmentId, videos);
}

async function loadMessages() {
  const ownResult = await supabase
    .from("message_thread_participants")
    .select("thread_id,last_read_at")
    .eq("user_id", state.user.id)
    .eq("is_archived", false);
  if (ownResult.error) {
    state.message = `Unable to load messages: ${ownResult.error.message}`;
    state.messageError = true;
    return;
  }
  const threadIds = [...new Set((ownResult.data || []).map((row) => row.thread_id).filter(Boolean))];
  if (!threadIds.length) {
    state.threads = [];
    state.participants = [];
    state.messages = [];
    state.selectedThreadId = "";
    return;
  }
  const [threadsResult, participantsResult] = await Promise.all([
    supabase.from("message_threads").select("*").in("id", threadIds).order("last_message_at", { ascending: false }),
    supabase.from("message_thread_participants").select("*").in("thread_id", threadIds).order("display_name", { ascending: true })
  ]);
  if (threadsResult.error || participantsResult.error) {
    const error = threadsResult.error || participantsResult.error;
    state.message = `Unable to load messages: ${error.message}`;
    state.messageError = true;
    return;
  }
  state.threads = threadsResult.data || [];
  state.participants = participantsResult.data || [];
  if (!state.threads.some((thread) => thread.id === state.selectedThreadId)) {
    state.selectedThreadId = state.threads[0]?.id || "";
  }
  await loadThreadMessages(state.selectedThreadId);
}

async function loadThreadMessages(threadId) {
  if (!threadId) {
    state.messages = [];
    return;
  }
  const { data, error } = await supabase
    .from("message_thread_messages")
    .select("*")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true })
    .limit(300);
  if (error) {
    state.message = `Unable to load conversation: ${error.message}`;
    state.messageError = true;
    state.messages = [];
    return;
  }
  state.messages = data || [];
}

async function signIn(form) {
  const formData = new FormData(form);
  state.signInMessage = "Signing in...";
  state.signInError = false;
  renderShell();
  const { error } = await supabase.auth.signInWithPassword({
    email: String(formData.get("email") || "").trim(),
    password: String(formData.get("password") || "")
  });
  if (error) {
    state.signInMessage = error.message;
    state.signInError = true;
    renderShell();
    return;
  }
  await loadData();
}

async function saveAssignment(form) {
  const formData = new FormData(form);
  const editingId = String(form.dataset.assignmentId || "");
  const current = editingId ? state.assignments.find((row) => String(row.id || "") === editingId) || {} : {};
  const propertyId = String(formData.get("property_id") || "");
  const property = state.properties.find((row) => String(row.id || "") === propertyId);
  const selectedContractorId = String(formData.get("contractor_id") || "");
  const selectedContractor = state.profiles.find((row) => String(row.id || "") === selectedContractorId);
  const unit = String(formData.get("unit_number") || "").trim();
  const status = String(formData.get("status") || "open");
  const priority = String(formData.get("priority") || "normal");
  const metadata = {
    ...assignmentMetadata(current),
    portal_property_id: propertyId || rowPropertyId(current) || undefined,
    property_name: property ? propertyTitle(property) : current.property_name,
    unit_number: unit || undefined,
    admin_pwa_updated_at: new Date().toISOString()
  };
  const payload = {
    title: String(formData.get("title") || "").trim() || (unit ? `Unit Cleaning - Unit ${unit}` : "Unit Cleaning"),
    property_name: property ? propertyTitle(property) : current.property_name || "",
    address: property ? propertyAddress(property) : current.address || "",
    service_type: "Unit Cleaning",
    pay_amount: Number(formData.get("pay_amount")) || 0,
    unit_number: unit,
    unit_name: unit,
    status,
    priority,
    start_window: fromDatetimeInput(formData.get("start_window")),
    end_window: fromDatetimeInput(formData.get("end_window")),
    scope: String(formData.get("scope") || ""),
    supplies_notes: String(formData.get("supplies_notes") || ""),
    special_instructions: String(formData.get("special_instructions") || ""),
    portal_property_id: uuidOrNull(propertyId) || uuidOrNull(rowPropertyId(current)),
    recurring_portal_property_id: uuidOrNull(propertyId) || uuidOrNull(rowPropertyId(current)),
    property_id: uuidOrNull(propertyId) || uuidOrNull(rowPropertyId(current)),
    assigned_to: uuidOrNull(selectedContractorId),
    assigned_to_name: selectedContractor ? personName(selectedContractor) : "",
    assigned_to_email: selectedContractor?.email || null,
    metadata
  };
  if (statusKey(status) === "completed" && !current.completed_at) {
    payload.completed_at = new Date().toISOString();
    payload.completed_by = state.user.id;
  }
  if (!editingId) {
    payload.assignment_type = "one_time";
    payload.recurrence_frequency = "one_time";
    payload.recurrence_interval = 1;
    payload.auto_renewal = false;
    payload.visibility = statusKey(status) === "pending" ? "pending" : "open";
    payload.created_by = state.user.id;
  }

  state.savingAssignment = true;
  renderShell();
  const result = editingId
    ? await supabase.from("assignment_blocks").update(payload).eq("id", editingId).select("*").maybeSingle()
    : await supabase.from("assignment_blocks").insert(payload).select("*").maybeSingle();
  state.savingAssignment = false;
  if (result.error) {
    state.message = `Unable to save assignment: ${result.error.message}`;
    state.messageError = true;
    renderShell();
    return;
  }
  if (editingId) {
    state.assignments = state.assignments.map((row) => String(row.id || "") === editingId ? result.data : row);
  } else {
    state.assignments = [result.data, ...state.assignments];
  }
  state.selectedAssignmentId = String(result.data?.id || "");
  state.message = "Assignment saved.";
  state.messageError = false;
  renderShell();
  if (result.data) await loadAssignmentVideos(result.data);
  renderShell();
}

async function approveAssignment(id) {
  const row = state.assignments.find((item) => String(item.id || "") === String(id || ""));
  if (!row) return;
  const metadata = {
    ...assignmentMetadata(row),
    admin_approval_status: "approved",
    approved_by: state.user.id,
    approved_by_name: personName(state.profile),
    approved_at: new Date().toISOString()
  };
  const { data, error } = await supabase
    .from("assignment_blocks")
    .update({ status: "open", visibility: "open", metadata })
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) {
    state.message = `Unable to approve assignment: ${error.message}`;
    state.messageError = true;
  } else {
    state.assignments = state.assignments.map((item) => String(item.id || "") === String(id) ? data : item);
    state.message = `${assignmentTitle(data)} approved.`;
    state.messageError = false;
    await supabase.from("property_assignment_links").update({ assignment_status: "open" }).eq("assignment_id", id);
  }
  renderShell();
}

async function toggleContractorApproval(id, approved) {
  const { data, error } = await supabase
    .from("profiles")
    .update({ contractor_approved: approved, status: approved ? "active" : "pending" })
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) {
    state.message = `Unable to update contractor: ${error.message}`;
    state.messageError = true;
  } else {
    state.profiles = state.profiles.map((row) => String(row.id || "") === String(id) ? data : row);
    state.message = "Contractor access updated.";
    state.messageError = false;
  }
  renderShell();
}

async function uploadAssignmentVideos() {
  const row = selectedAssignment();
  if (!row) return;
  const uploads = ["before", "after"]
    .map((phase) => [phase, document.querySelector(`[data-video-file="${selectorValue(phase)}"]`)?.files?.[0]])
    .filter(([, file]) => file);
  if (!uploads.length) {
    state.videoMessage = "Choose a before or after video before uploading.";
    state.videoError = true;
    renderShell();
    return;
  }
  const oversized = uploads.find(([, file]) => file.size > videoMaxBytes);
  if (oversized) {
    state.videoMessage = `${oversized[1].name} is larger than ${formatBytes(videoMaxBytes)}.`;
    state.videoError = true;
    renderShell();
    return;
  }

  state.uploadingVideos = true;
  state.videoMessage = "Preparing upload...";
  state.videoError = false;
  renderShell();
  try {
    const qaJobId = await ensureAssignmentQaJob(row);
    const pairId = randomId();
    const note = document.getElementById("apVideoNotes")?.value || "";
    for (let index = 0; index < uploads.length; index += 1) {
      const [phase, file] = uploads[index];
      state.videoMessage = `Uploading ${videoPhaseLabel(phase).toLowerCase()} (${index + 1} of ${uploads.length})...`;
      renderShell();
      await uploadAssignmentVideo(row, phase, file, qaJobId, pairId, note);
    }
    state.uploadingVideos = false;
    state.videoMessage = `${uploads.length} video${uploads.length === 1 ? "" : "s"} uploaded.`;
    state.videoError = false;
    await loadAssignmentVideos(row);
    const latest = await loadVideos();
    state.videos = latest.rows;
  } catch (error) {
    state.uploadingVideos = false;
    const sizeHint = /size|exceeded|maximum/i.test(String(error?.message || ""))
      ? " Check the Supabase project and bucket upload limits."
      : "";
    state.videoMessage = `Unable to upload video: ${error?.message || "Unknown error"}${sizeHint}`;
    state.videoError = true;
  }
  renderShell();
}

async function ensureAssignmentQaJob(row) {
  const existing = assignmentQaJobId(row);
  if (existing) return existing;
  const { data, error } = await supabase.rpc("ensure_assignment_qa_job", {
    target_assignment_id: row.id
  });
  if (error) throw error;
  const qaJobId = String(data || "").trim();
  if (!qaJobId) throw new Error("Supabase did not return a QA job ID.");
  const metadata = { ...assignmentMetadata(row), qa_job_id: qaJobId };
  row.metadata = metadata;
  state.assignments = state.assignments.map((item) => String(item.id || "") === String(row.id || "") ? { ...item, metadata } : item);
  return qaJobId;
}

function assignmentQaJobId(row) {
  const meta = assignmentMetadata(row);
  return String(row?.qa_job_id || meta.qa_job_id || "").trim();
}

async function uploadAssignmentVideo(row, phase, file, qaJobId, pairId, note = "") {
  const duration = await fileDuration(file);
  const datePath = new Date().toISOString().slice(0, 10);
  const path = `${state.user.id}/${datePath}/admin-pwa/${row.id}-${phase}-${Date.now()}-${safeFileName(file.name)}`;
  const uploadResult = await supabase.storage
    .from(videoBucket)
    .upload(path, file, {
      contentType: file.type || "video/mp4",
      upsert: false
    });
  if (uploadResult.error) throw uploadResult.error;

  const propertyId = uuidOrNull(rowPropertyId(row));
  const unit = unitNumber(row);
  const payload = {
    pair_id: pairId,
    title: `${row.property_name || row.title || "Assignment"} - ${videoPhaseLabel(phase)}`,
    label: [row.property_name || row.title || "Assignment", unit ? `Unit ${unit}` : ""].filter(Boolean).join(" - "),
    video_phase: phase,
    property_id: propertyId,
    portal_property_id: propertyId,
    property_name: row.property_name || "",
    unit_name: unit || "",
    assignment_id: row.id || null,
    contractor_id: uuidOrNull(contractorId(row)),
    contractor_name: contractorName(row) === "Unassigned" ? "" : contractorName(row),
    recorded_at: new Date().toISOString(),
    notes: note || `Admin uploaded ${videoPhaseLabel(phase).toLowerCase()} from the admin PWA.`,
    tags: ["admin_upload", "admin_pwa", phase],
    storage_bucket: videoBucket,
    storage_path: path,
    file_name: file.name || "",
    mime_type: file.type || "",
    file_size: file.size || 0,
    file_size_bytes: file.size || 0,
    duration_seconds: duration,
    uploaded_by: state.user.id,
    uploaded_by_name: state.user.email || "",
    source: "admin_pwa_upload",
    qa_job_id: qaJobId,
    room_name: unit ? `Unit ${unit}` : (row.service_type || row.property_name || "Assignment"),
    review_status: "pending_review",
    metadata: {
      uploaded_from: "admin_pwa",
      assignment_id: row.id || "",
      qa_job_id: qaJobId || "",
      property_name: row.property_name || "",
      unit_number: unit || "",
      original_file_name: file.name || "",
      upload_user_agent: navigator.userAgent || ""
    }
  };

  const insertResult = await supabase.from("qa_videos").insert(payload).select("*").single();
  if (insertResult.error) {
    await supabase.storage.from(videoBucket).remove([path]).catch(() => null);
    throw insertResult.error;
  }
  return insertResult.data;
}

function videoPhaseLabel(phase) {
  const key = normalizeToken(phase);
  if (key === "before") return "Before Video";
  if (key === "after") return "After Video";
  if (key === "final") return "Final Video";
  if (key === "issue") return "Issue Video";
  return "QA Video";
}

function fileDuration(file) {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    const url = URL.createObjectURL(file);
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(video.duration) ? video.duration : null);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    video.src = url;
  });
}

function safeFileName(name) {
  return String(name || "video")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90) || "video";
}

function randomId() {
  return window.crypto?.randomUUID?.() || `admin-pwa-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function createMessage(form) {
  const formData = new FormData(form);
  const recipientId = String(formData.get("recipientId") || "");
  const subject = String(formData.get("subject") || "Message").trim() || "Message";
  const body = String(formData.get("body") || "").trim();
  if (!recipientId || !body) return;
  state.sendingMessage = true;
  renderShell();
  const { data, error } = await supabase.rpc("create_message_thread_v2", {
    message_payload: {
      recipient_ids: [recipientId],
      subject,
      body,
      related_type: "",
      related_id: "",
      related_title: ""
    }
  });
  state.sendingMessage = false;
  if (error) {
    state.message = `Unable to send message: ${error.message}`;
    state.messageError = true;
  } else {
    state.selectedThreadId = data || state.selectedThreadId;
    state.newMessageOpen = false;
    state.message = "Message sent.";
    state.messageError = false;
    await loadMessages();
  }
  renderShell();
}

async function sendReply(form) {
  const thread = selectedThread();
  const body = String(new FormData(form).get("body") || "").trim();
  if (!thread || !body) return;
  state.sendingMessage = true;
  renderShell();
  const { error } = await supabase.rpc("send_message_reply_v2", {
    message_payload: {
      thread_id: thread.id,
      body
    }
  });
  state.sendingMessage = false;
  if (error) {
    state.message = `Unable to send reply: ${error.message}`;
    state.messageError = true;
  } else {
    state.message = "";
    state.messageError = false;
    await loadMessages();
  }
  renderShell();
}

function updateVideoFileLabel(input) {
  const phase = input.dataset.videoFile || "";
  const label = input.closest(".ap-file-card")?.querySelector(`[data-video-file-label="${selectorValue(phase)}"]`);
  const file = input.files?.[0];
  if (label) label.textContent = file ? file.name : "Choose a video file";
}

function attachEvents() {
  root?.addEventListener("click", async (event) => {
    const themeToggle = event.target.closest("[data-theme-toggle]");
    if (themeToggle) {
      setTheme(getTheme() === "light" ? "dark" : "light");
      renderShell();
      return;
    }

    const profileToggle = event.target.closest("[data-profile-toggle]");
    if (profileToggle) {
      state.profileMenuOpen = !state.profileMenuOpen;
      renderShell();
      return;
    }

    if (state.profileMenuOpen && !event.target.closest("[data-profile-menu], [data-profile-toggle]")) {
      state.profileMenuOpen = false;
      renderShell();
      return;
    }

    const signOut = event.target.closest("[data-sign-out]");
    if (signOut) {
      await supabase.auth.signOut();
      window.location.href = "https://portal.turnlypros.com/";
      return;
    }

    const refresh = event.target.closest("[data-refresh]");
    if (refresh) {
      await loadData();
      return;
    }

    const approve = event.target.closest("[data-approve-assignment]");
    if (approve) {
      await approveAssignment(approve.dataset.approveAssignment);
      return;
    }

    const openAssignment = event.target.closest("[data-open-assignment]");
    if (openAssignment) {
      state.selectedAssignmentId = openAssignment.dataset.openAssignment || "";
      state.videoMessage = "";
      state.videoError = false;
      renderShell();
      const row = selectedAssignment();
      if (row) {
        await loadAssignmentVideos(row);
        renderShell();
      }
      return;
    }

    const closeAssignment = event.target.closest("[data-close-assignment]");
    if (closeAssignment) {
      state.selectedAssignmentId = "";
      renderShell();
      return;
    }

    const weekNav = event.target.closest("[data-week-nav]");
    if (weekNav) {
      const action = weekNav.dataset.weekNav;
      if (action === "prev") state.scheduleCursor = addDays(state.scheduleCursor, -7);
      if (action === "next") state.scheduleCursor = addDays(state.scheduleCursor, 7);
      if (action === "today") state.scheduleCursor = startOfWeek(new Date());
      renderShell();
      return;
    }

    const upload = event.target.closest("[data-upload-videos]");
    if (upload) {
      await uploadAssignmentVideos();
      return;
    }

    const toggleContractor = event.target.closest("[data-toggle-contractor]");
    if (toggleContractor) {
      await toggleContractorApproval(toggleContractor.dataset.toggleContractor, toggleContractor.dataset.approved === "true");
      return;
    }

    const newMessage = event.target.closest("[data-new-message]");
    if (newMessage) {
      state.newMessageOpen = true;
      renderShell();
      return;
    }

    const cancelNewMessage = event.target.closest("[data-cancel-new-message]");
    if (cancelNewMessage) {
      state.newMessageOpen = false;
      renderShell();
      return;
    }

    const thread = event.target.closest("[data-thread-id]");
    if (thread) {
      state.selectedThreadId = thread.dataset.threadId || "";
      await loadThreadMessages(state.selectedThreadId);
      renderShell();
    }
  });

  root?.addEventListener("input", (event) => {
    if (event.target.matches("#apAssignmentSearch")) {
      state.filters.search = event.target.value || "";
      renderShell();
    }
    if (event.target.matches("#apVideoSearch")) {
      state.filters.videoSearch = event.target.value || "";
      renderShell();
    }
    if (event.target.matches("#apPeopleSearch")) {
      state.filters.peopleSearch = event.target.value || "";
      renderShell();
    }
  });

  root?.addEventListener("change", (event) => {
    if (event.target.matches("#apStatusFilter")) {
      state.filters.status = event.target.value || "board";
      renderShell();
      return;
    }
    const videoFile = event.target.closest("[data-video-file]");
    if (videoFile) {
      updateVideoFileLabel(videoFile);
    }
  });

  root?.addEventListener("submit", async (event) => {
    if (event.target.matches("#apLoginForm")) {
      event.preventDefault();
      await signIn(event.target);
      return;
    }
    if (event.target.matches("#apAssignmentForm")) {
      event.preventDefault();
      await saveAssignment(event.target);
      return;
    }
    if (event.target.matches("#apNewMessageForm")) {
      event.preventDefault();
      await createMessage(event.target);
      return;
    }
    if (event.target.matches("#apReplyForm")) {
      event.preventDefault();
      await sendReply(event.target);
    }
  });

  root?.addEventListener("keydown", async (event) => {
    const card = event.target.closest?.("[data-open-assignment]");
    if (card && ["Enter", " "].includes(event.key) && !event.target.closest("button, a, input, select, textarea")) {
      event.preventDefault();
      state.selectedAssignmentId = card.dataset.openAssignment || "";
      renderShell();
      const row = selectedAssignment();
      if (row) {
        await loadAssignmentVideos(row);
        renderShell();
      }
    }
    if (event.key === "Escape" && state.selectedAssignmentId) {
      state.selectedAssignmentId = "";
      renderShell();
    }
  });
}

const installState = {
  prompt: null,
  observerStarted: false
};

function isStandaloneDisplay() {
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

function refreshInstallControls() {
  document.querySelectorAll("[data-pwa-install]").forEach((button) => {
    button.hidden = isStandaloneDisplay() || !installState.prompt;
    button.disabled = !installState.prompt;
  });
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
    navigator.serviceWorker.register("/admin-pwa/sw.js", { scope: "/admin-pwa/" }).catch(() => {});
  });
}

setTheme(getTheme());
attachEvents();
renderShell();
void loadData();
