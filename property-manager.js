import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";
import {
  adminPreviewPortalOptions,
  adminPreviewPropertyOptions,
  adminPreviewSummary,
  adminPreviewTargetUrl,
  adminPreviewUsersForPortal,
  buildPreviewEffectiveUser,
  clearAdminPreviewContext,
  normalizeAdminPreviewContext,
  resolvePreviewProfile,
  resolvePreviewProperty,
  verifyAdminPreviewSession,
  writeAdminPreviewContext
} from "./admin-preview-context.js?v=20260828-contractor-desktop-split";
import { contractorHomeForBrowser } from "./contractor-routing.js?v=20260828-contractor-desktop-split";

const VIDEO_BUCKET = "qa-videos";
const SIGNED_URL_SECONDS = 60 * 60 * 4;
const TURN_REQUEST_SERVICE = "Unit Cleaning";
const MOVE_IN_TIME_LABEL = "2:00 PM";
const MOVE_IN_HOUR = 14;
const PROPERTY_MANAGER_GUIDE_STORAGE_PREFIX = "turnlyPropertyManagerWelcomeGuide:v2";
const PROPERTY_MANAGER_THEME_STORAGE_KEY = "turnlyPropertyManagerDashboardTheme";
const PROPERTY_MANAGER_NOTIFICATION_CLEAR_PREFIX = "turnlyPropertyManagerNotificationsClearedAt:v1";

const env = window.__ENV || {};
const supabase = env.SUPABASE_URL && env.SUPABASE_ANON_KEY
  ? createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY)
  : null;

const managerMain = document.querySelector(".command-main");

const state = {
  user: null,
  profile: null,
  adminPreview: null,
  adminUser: null,
  property: null,
  propertyLinkPending: false,
  client: null,
  contract: null,
  relatedProperties: [],
  managedPropertyLinks: [],
  managedRegionLinks: [],
  managedRegionPropertyLinks: [],
  units: [],
  assignments: [],
  qaJobs: [],
  videos: [],
  dataMessage: "",
  dataError: false,
  threads: [],
  participants: [],
  messages: [],
  selectedThreadId: "",
  selectedAssignmentId: "",
  selectedScheduleDate: "",
  scheduleWeekStart: "",
  scheduleView: "week",
  view: "overview",
  requestOpen: false,
  assignmentDetailsOpen: false,
  requestPage: 1,
  requestPageSize: 10,
  feedbackSaving: false,
  feedbackMessage: "",
  feedbackError: false,
  accountMenuOpen: false,
  adminPreviewMenuOpen: false,
  guideOpen: false,
  guideStep: 0,
  notificationClearedAt: 0,
  filters: {
    query: "",
    requestStatus: "open",
    requestSort: "scheduled_date",
    requestSortDirection: "asc",
    scheduleStatus: "all",
    videoPhase: "all",
    messageView: "all"
  },
  message: "",
  error: false,
  sending: false,
  refreshing: false
};

const roleDashboards = {
  admin: "admin.html",
  sales: "sales.html",
  sales_team: "sales.html",
  property_manager: "property-manager.html"
};

const pmIconPaths = {
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
  "chevron-down": '<path d="m6 9 6 6 6-6"/>',
  "chevron-right": '<path d="m9 18 6-6-6-6"/>',
  home: '<path d="m3 11 9-8 9 8"/><path d="M5 10v11h14V10"/><path d="M9 21v-7h6v7"/>',
  plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  shield: '<path d="M20 13c0 5-3.5 7.5-8 9-4.5-1.5-8-4-8-9V5l8-3 8 3v8Z"/><path d="m9 12 2 2 4-4"/>',
  moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>'
};

function pmIcon(name, className = "") {
  const path = pmIconPaths[name] || pmIconPaths.search;
  return `<span class="suite-icon ${esc(className)}" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${path}</svg></span>`;
}

function readDashboardTheme() {
  try {
    return window.localStorage?.getItem(PROPERTY_MANAGER_THEME_STORAGE_KEY) === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

function writeDashboardTheme(theme) {
  try {
    window.localStorage?.setItem(PROPERTY_MANAGER_THEME_STORAGE_KEY, theme === "light" ? "light" : "dark");
  } catch {
    // Theme still applies for the current page when storage is blocked.
  }
}

function applyDashboardTheme() {
  if (!document.body) return;
  document.body.dataset.dashboardTheme = readDashboardTheme();
}

function dashboardThemeToggleContent(theme) {
  const isLight = theme === "light";
  return `
    <span class="theme-toggle-track"><span class="theme-toggle-thumb">${pmIcon(isLight ? "sun" : "moon")}</span></span>
    <span class="theme-toggle-label">${esc(isLight ? "Light" : "Dark")}</span>
  `;
}

function dashboardThemeToggleMarkup() {
  const theme = readDashboardTheme();
  const nextLabel = theme === "light" ? "dark" : "light";
  return `
    <button class="pm-theme-toggle" type="button" data-pm-theme-toggle role="switch" aria-checked="${theme === "light" ? "true" : "false"}" aria-label="Switch to ${esc(nextLabel)} mode">
      ${dashboardThemeToggleContent(theme)}
    </button>
  `;
}

function updateDashboardThemeToggle() {
  const button = document.querySelector("[data-pm-theme-toggle]");
  if (!button) return;
  const theme = readDashboardTheme();
  const nextLabel = theme === "light" ? "dark" : "light";
  button.setAttribute("aria-checked", theme === "light" ? "true" : "false");
  button.setAttribute("aria-label", `Switch to ${nextLabel} mode`);
  button.innerHTML = dashboardThemeToggleContent(theme);
}

const viewLabels = {
  overview: ["Overview", "Your assigned property overview."],
  "turn-requests": ["Turn Requests", "Manage unit turn requests and track progress."],
  schedule: ["Schedule", "View upcoming unit turns and scheduling windows."],
  messages: ["Messages", "View conversations and communication updates."]
};

const navViews = new Set(Object.keys(viewLabels));
const searchlessViews = new Set(["turn-requests", "schedule", "messages"]);
const closedStatuses = new Set(["completed", "complete", "cancelled", "canceled", "declined", "deleted", "archived"]);
const issueStatuses = new Set(["overdue", "qa_pending", "qa_rejected", "rejected", "needs_rework"]);
const inProgressStatuses = new Set(["in_progress", "claimed", "started", "active", "qa_pending"]);
const managerGuideSteps = {
  overview: [
    {
      key: "overview-hero",
      title: "Welcome to your property overview",
      body: "This page gives you the fastest read on your property, the next turn, and the actions Turnly expects you to use most."
    },
    {
      key: "overview-metrics",
      title: "Scan the status cards",
      body: "These cards summarize ready units, in-progress turns, upcoming work, and recently completed cleans for your assigned property."
    },
    {
      key: "overview-next",
      title: "Watch the next turn",
      body: "The Next Turn card keeps the next scheduled unit front and center so you can open details without hunting through the schedule."
    },
    {
      key: "overview-requests",
      title: "Review turn requests",
      body: "Use this section to track open requests and start a new unit cleaning request when another turn is ready to send to Turnly."
    }
  ],
  "turn-requests": [
    {
      key: "request-new",
      title: "Start a turn request",
      body: "Use this area to submit a unit cleaning request with the unit and scheduled move-in date. Requests stay property-specific."
    },
    {
      key: "request-filters",
      title: "Filter and sort requests",
      body: "Use the status buttons and sort controls to move between open, pending, completed, and other request groups."
    },
    {
      key: "request-table",
      title: "Read the request list",
      body: "The table shows unit, bed and bath count, current status, scheduled window, and completed date when you are viewing completed work."
    },
    {
      key: "request-details",
      title: "Open details and leave feedback",
      body: "Click View Details to open the full request window, see related media, and send feedback about that clean.",
      emptyBody: "When requests appear here, click View Details to open the full request window, see related media, and send feedback about that clean."
    }
  ],
  schedule: [
    {
      key: "date-controls",
      title: "Move through the schedule",
      body: "Use the arrows or date picker to jump to the day, week, or month you want to inspect."
    },
    {
      key: "selector",
      title: "Change your schedule view",
      body: "Use Day, Week, and Month to change how assignments are displayed on the schedule."
    },
    {
      key: "assignment",
      title: "Open assignment details",
      body: "Click an assignment card to view the full details, see before and after videos, and leave feedback for that specific clean.",
      emptyBody: "When assignments appear on the schedule, click a card to view the full details, see before and after videos, and leave feedback for that specific clean."
    }
  ],
  messages: [
    {
      key: "message-compose",
      title: "Start a conversation",
      body: "Use New Message to contact Turnly operations about property questions, schedule changes, service updates, or feedback."
    },
    {
      key: "message-threads",
      title: "Choose an open conversation",
      body: "Open conversations stay in this left rail with recipients, last sent date, and a one-line preview so you can move between threads quickly."
    },
    {
      key: "message-display",
      title: "Read the full thread",
      body: "The main message area shows the selected conversation and keeps the full exchange in one focused workspace."
    },
    {
      key: "message-reply",
      title: "Send a reply",
      body: "Use the reply box to keep updates tied to the same thread so Turnly can track the whole conversation.",
      emptyBody: "Once a conversation is selected, use the reply box to keep updates tied to the same thread so Turnly can track the whole conversation."
    }
  ]
};
const pendingStatuses = new Set(["pending", "pending_approval"]);
const readyStatuses = new Set(["ready", "open", "scheduled", "not_started"]);

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
    .replace(/[\s-]+/g, "_");
}

function normalizeRole(role) {
  return normalizeToken(role);
}

function normalizeStatus(status) {
  return normalizeToken(status);
}

function titleCase(value) {
  return String(value || "")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim() || "None";
}

function isActiveProfile(profile) {
  return ["active", "approved", "enabled"].includes(normalizeStatus(profile?.status));
}

function hasPropertyManagerSignal(user, profile) {
  return normalizeRole(user?.user_metadata?.role) === "property_manager" ||
    normalizeRole(profile?.role) === "property_manager" ||
    Boolean(profile?.property_manager_property_id) ||
    Boolean(profile?.requested_property_name) ||
    Boolean(user?.user_metadata?.requested_property_name);
}

function metadataFlag(value) {
  return value === true || String(value || "").toLowerCase() === "true";
}

function timeValue(value) {
  const parsed = Date.parse(value || "");
  return Number.isFinite(parsed) ? parsed : 0;
}

function requiresPasswordChange(user) {
  const appMetadata = user?.app_metadata || {};
  const userMetadata = user?.user_metadata || {};
  const resetAt = appMetadata.turnly_password_reset_by_admin_at || userMetadata.turnly_password_reset_by_admin_at || "";
  const tempAt = appMetadata.turnly_temp_password_created_at || userMetadata.turnly_temp_password_created_at || "";
  const requestedAt = resetAt || tempAt;
  const changedAt = userMetadata.turnly_password_changed_at || "";
  if (requestedAt && changedAt && timeValue(changedAt) >= timeValue(requestedAt)) return false;
  if (changedAt && String(userMetadata.turnly_force_password_change).toLowerCase() === "false") return false;

  return metadataFlag(appMetadata.turnly_force_password_change) ||
    metadataFlag(appMetadata.force_password_change) ||
    metadataFlag(userMetadata.turnly_force_password_change) ||
    metadataFlag(userMetadata.force_password_change);
}

function setManagerPasswordMessage(message, error = false) {
  const node = document.getElementById("managerForcedPasswordMessage");
  if (!node) return;
  node.textContent = message || "";
  node.classList.toggle("error", error);
}

async function clearManagerForcedPasswordFlag() {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token || "";
  if (!token) return;
  await fetch("/api/portal-password-change-complete", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({})
  }).catch(() => null);
}

async function renderManagerPasswordChangeRequired(user) {
  if (!managerMain) return;
  const name = getName(user, state.profile);
  managerMain.innerHTML = `
    <header class="command-header pm-page-header">
      <div class="pm-heading">
        <h1>Change your password</h1>
        <p>Choose your own password before opening the property manager portal.</p>
      </div>
    </header>
    <section class="panel-card pm-lock-panel pm-forced-password-panel">
      <p class="pm-eyebrow">Security Step</p>
      <h2>Welcome${name ? `, ${esc(name)}` : ""}</h2>
      <p>A Turnly admin created your account with a temporary password. Create a new password to continue.</p>
      <form id="managerForcedPasswordForm" class="pm-inline-form pm-forced-password-form">
        <label><span>New Password</span><input id="managerForcedNewPassword" type="password" autocomplete="new-password" minlength="8" required /></label>
        <label><span>Confirm Password</span><input id="managerForcedConfirmPassword" type="password" autocomplete="new-password" minlength="8" required /></label>
        <p id="managerForcedPasswordMessage" class="pm-forced-password-message" aria-live="polite"></p>
        <button class="new-btn" type="submit">Update Password</button>
      </form>
    </section>
  `;

  const form = document.getElementById("managerForcedPasswordForm");
  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const password = document.getElementById("managerForcedNewPassword")?.value || "";
    const confirmPassword = document.getElementById("managerForcedConfirmPassword")?.value || "";
    const button = form.querySelector("button[type='submit']");

    if (password.length < 8) {
      setManagerPasswordMessage("Password must be at least 8 characters.", true);
      return;
    }
    if (password !== confirmPassword) {
      setManagerPasswordMessage("Passwords do not match.", true);
      return;
    }

    if (button) button.disabled = true;
    setManagerPasswordMessage("Updating password...");

    const changedAt = new Date().toISOString();
    const { error } = await supabase.auth.updateUser({
      password,
      data: {
        ...(user?.user_metadata || {}),
        turnly_force_password_change: false,
        turnly_password_changed_at: changedAt
      }
    });

    if (error) {
      if (button) button.disabled = false;
      setManagerPasswordMessage(error.message || "Unable to update password.", true);
      return;
    }

    await clearManagerForcedPasswordFlag();
    await supabase.auth.refreshSession().catch(() => null);
    setManagerPasswordMessage("Password updated. Loading your portal...");
    window.location.reload();
  });
}

async function applyManagerAdminPreview(authUser) {
  const session = await verifyAdminPreviewSession(supabase, authUser);
  if (session?.preview?.portal !== "property_manager") return false;

  const previewProfile = await resolvePreviewProfile(supabase, session.preview, "property_manager");
  const previewProperty = await resolvePreviewProperty(supabase, session.preview);
  const previewUser = buildPreviewEffectiveUser(previewProfile, authUser, "property_manager");
  if (!previewProfile || !previewUser) {
    state.dataMessage = "Admin preview could not find the selected property manager profile.";
    state.dataError = true;
    return false;
  }

  state.adminPreview = session.preview;
  state.adminUser = authUser;
  state.user = previewUser;
  state.profile = {
    ...previewProfile,
    role: "property_manager",
    status: previewProfile.status || "active",
    property_manager_property_id: previewProperty?.id || previewProfile.property_manager_property_id || null,
    requested_property_name: session.preview.propertyLabel || previewProfile.requested_property_name || ""
  };
  state.view = currentView();

  if (!state.profile.property_manager_property_id) {
    state.property = null;
    state.propertyLinkPending = true;
    state.client = null;
    state.contract = null;
    state.relatedProperties = [];
    state.units = [];
    state.assignments = [];
    state.qaJobs = [];
    state.videos = [];
    state.dataMessage = `Admin preview could not find ${session.preview.propertyLabel} in portal properties.`;
    state.dataError = true;
    renderManagerPortal();
    await loadManagerMessages();
    renderManagerPortal();
    return true;
  }

  state.property = previewProperty || {
    id: state.profile.property_manager_property_id,
    name: state.profile.requested_property_name,
    property_name: state.profile.requested_property_name,
    access_limited: true
  };
  state.propertyLinkPending = false;
  renderManagerPortal(true);
  await refreshManagerPortal();
  return true;
}

async function repairPropertyManagerProfile(user, profile = {}) {
  if (!user?.id || !supabase) return { ...profile, role: "property_manager", status: "active", contractor_approved: true };
  const requestedPropertyName = profile?.requested_property_name ||
    user.user_metadata?.requested_property_name ||
    user.user_metadata?.associated_property ||
    user.user_metadata?.property_name ||
    "";
  const payload = {
    id: user.id,
    email: profile?.email || user.email || "",
    role: "property_manager",
    status: "active",
    contractor_approved: true
  };

  if (requestedPropertyName) {
    payload.requested_property_name = requestedPropertyName;
  }

  const { error } = await supabase
    .from("profiles")
    .upsert(payload, { onConflict: "id" });

  if (error) {
    console.warn("Property manager profile repair skipped:", error.message);
  }

  return { ...profile, ...payload };
}

function getPortalHome(role) {
  return normalizeRole(role) === "contractor"
    ? contractorHomeForBrowser()
    : roleDashboards[normalizeRole(role)] || contractorHomeForBrowser();
}

function getName(user, profile) {
  return profile?.full_name ||
    user?.user_metadata?.full_name ||
    user?.email?.split("@")[0] ||
    "Property Manager";
}

function initialsFromName(value) {
  const parts = String(value || "PM").trim().split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? `${parts[0][0]}${parts[1][0]}` : parts[0]?.slice(0, 2) || "PM").toUpperCase();
}

function managerProfileDefaults() {
  const email = state.profile?.email || state.user?.email || "";
  const name = getName(state.user, state.profile);
  return {
    name,
    role: "Property Manager",
    email,
    initials: initialsFromName(name || email || "PM"),
    avatarUrl: state.profile?.avatar_url || state.user?.user_metadata?.avatar_url || ""
  };
}

function renderManagerAvatar(profile, id = "", large = false) {
  return `<span ${id ? `id="${esc(id)}"` : ""} class="user-photo ${large ? "large" : ""}">${profile.avatarUrl ? `<img src="${esc(profile.avatarUrl)}" alt="" />` : esc(profile.initials)}</span>`;
}

function asNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function money(value) {
  return asNumber(value).toLocaleString([], { style: "currency", currency: "USD" });
}

function integer(value) {
  return Math.round(asNumber(value)).toLocaleString();
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateValue(value, fallback = 0) {
  const date = parseDate(value);
  return date ? date.getTime() : fallback;
}

function formatDate(value, fallback = "Not scheduled") {
  const date = parseDate(value);
  if (!date) return fallback;
  return date.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

function formatShortDate(value, fallback = "Not set") {
  const date = parseDate(value);
  if (!date) return fallback;
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function localDate(value = new Date()) {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(year, month - 1, day);
    date.setHours(0, 0, 0, 0);
    return date;
  }
  const date = parseDate(value) || new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function dateInputValue(value = new Date()) {
  const date = localDate(value);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function scheduledMoveInDate(value) {
  if (!value) return null;
  const date = localDate(value);
  date.setHours(MOVE_IN_HOUR, 0, 0, 0);
  return date;
}

function formatMoveInDate(value, fallback = "Not selected") {
  const date = scheduledMoveInDate(value);
  if (!date) return fallback;
  return date.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

function openNativeDatePicker(control) {
  if (!control || typeof control.showPicker !== "function") return;
  try {
    control.showPicker();
  } catch {
    // Some browsers only allow showPicker during direct pointer interaction.
  }
}

function addDays(value, days) {
  const date = localDate(value);
  date.setDate(date.getDate() + days);
  return date;
}

function formatShortTime(value, fallback = "Open") {
  const date = parseDate(value);
  if (!date) return fallback;
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function formatWindow(row) {
  const start = parseDate(row?.start_window || row?.recurring_due_at);
  const end = parseDate(row?.end_window);
  if (!start) return "Not scheduled";
  const date = start.toLocaleDateString([], { month: "short", day: "numeric" });
  const startTime = start.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const endTime = end ? end.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "";
  return `${date}, ${startTime}${endTime ? ` - ${endTime}` : ""}`;
}

function compact(values) {
  return values.map((value) => String(value || "").trim()).filter(Boolean);
}

function chunk(values, size = 80) {
  const rows = [];
  for (let index = 0; index < values.length; index += size) rows.push(values.slice(index, index + size));
  return rows;
}

function rowMeta(row) {
  const metadata = row?.metadata;
  if (!metadata) return {};
  if (typeof metadata === "object" && !Array.isArray(metadata)) return metadata;
  if (typeof metadata === "string") {
    try {
      const parsed = JSON.parse(metadata);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

const managerSensitiveAssignmentFields = [
  "pay_amount",
  "contractor_pay",
  "contractor_amount",
  "assigned_to",
  "assigned_to_name",
  "assigned_to_email",
  "contractor_id",
  "contractor_name",
  "contractor_email",
  "claimed_by",
  "claimed_by_name",
  "claimed_by_email",
  "completed_by",
  "completed_by_name",
  "completed_by_email",
  "preferred_contractor_names",
  "scope",
  "supplies_notes",
  "special_instructions",
  "special_notes",
  "notes",
  "instructions"
];

const managerSensitiveMetadataFields = new Set([
  ...managerSensitiveAssignmentFields,
  "scope_of_work",
  "unit_notes",
  "unit_contractor_pay",
  "property_manager_notes"
]);

function redactManagerAssignment(row) {
  if (!row || typeof row !== "object") return row;
  const redacted = { ...row };
  managerSensitiveAssignmentFields.forEach((field) => delete redacted[field]);
  const metadata = rowMeta(redacted);
  if (Object.keys(metadata).length) {
    const cleanedMetadata = { ...metadata };
    managerSensitiveMetadataFields.forEach((field) => delete cleanedMetadata[field]);
    redacted.metadata = cleanedMetadata;
  }
  return redacted;
}

function hasLinkedProperty() {
  return Boolean(state.property?.id);
}

function propertyLinkPendingMessage() {
  const requested = state.profile?.requested_property_name
    ? ` Requested property: ${state.profile.requested_property_name}.`
    : "";
  if (state.profile?.access_setup_error) {
    return "Your account is active, but Turnly still needs to finish the property-link setup before data can be matched to this dashboard.";
  }
  return `Your account is active. A Turnly admin still needs to link your account to a property before property data appears.${requested}`;
}

function propertyTitle(property = state.property) {
  return property?.name || property?.property_name || property?.company_name || "Property Manager Dashboard";
}

function propertyHeroClass(property = state.property) {
  const key = lookupKey([
    propertyTitle(property),
    property?.address,
    state.profile?.requested_property_name
  ].join(" "));
  if (key.includes("vetra forest hills") || key.includes("501 towns")) return "pm-hero-vetra";
  return "pm-hero-default";
}

function propertyAddress(property = state.property) {
  if (!property?.id) return "Waiting for admin property link";
  return property?.address || compact([property?.city, property?.state, property?.postal_code]).join(", ") || "No address on file";
}

function lookupKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueValues(values = []) {
  return [...new Set(compact(values))];
}

function uuidValues(values = []) {
  return uniqueValues(values).filter((value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value));
}

function lookupSet(values = []) {
  return new Set(uniqueValues(values).map(lookupKey).filter(Boolean));
}

function lookupMatches(value, keys) {
  const key = lookupKey(value);
  if (!key || !keys?.size) return false;
  if (keys.has(key)) return true;
  return [...keys].some((candidate) => candidate.length >= 6 && (key.includes(candidate) || candidate.includes(key)));
}

function dedupeRows(rows = []) {
  const seen = new Set();
  return rows.filter((row) => {
    if (!row) return false;
    const key = row.id ? `id:${row.id}` : JSON.stringify(row);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function missingColumnError(error) {
  const message = String(error?.message || error?.details || "");
  return /column .* does not exist|relation .* does not exist|could not find .* column|schema cache/i.test(message);
}

function errorMessage(error, fallback = "Unknown error") {
  return String(error?.message || error?.details || error || fallback);
}

function recordPrimaryIds(row = {}) {
  const meta = rowMeta(row);
  return [
    row?.id,
    row?.client_id,
    row?.property_id,
    row?.portal_property_id,
    row?.contract_id,
    meta.id,
    meta.client_id,
    meta.property_id,
    meta.portal_property_id,
    meta.contract_id,
    meta.source_property_id
  ];
}

function linkedDataIds(row = {}) {
  const meta = rowMeta(row);
  return [
    row?.property_id,
    row?.portal_property_id,
    row?.recurring_property_id,
    row?.recurring_portal_property_id,
    row?.client_id,
    row?.contract_id,
    meta.property_id,
    meta.portal_property_id,
    meta.recurring_property_id,
    meta.recurring_portal_property_id,
    meta.client_id,
    meta.contract_id,
    meta.source_property_id
  ];
}

function propertyNameValues(row = {}) {
  const meta = rowMeta(row);
  return [
    row?.name,
    row?.property_name,
    row?.company_name,
    row?.client_name,
    row?.title,
    row?.display_name,
    meta.name,
    meta.property_name,
    meta.company_name,
    meta.client_name,
    meta.title
  ];
}

function propertyAddressValues(row = {}) {
  const meta = rowMeta(row);
  return [
    row?.address,
    row?.billing_address,
    row?.property_address,
    row?.service_address,
    compact([row?.city, row?.state, row?.postal_code]).join(", "),
    meta.address,
    meta.billing_address,
    meta.property_address,
    meta.service_address
  ];
}

function managerPropertyIdValues() {
  return uniqueValues([
    ...recordPrimaryIds(state.property),
    ...recordPrimaryIds(state.client),
    ...recordPrimaryIds(state.contract),
    ...state.relatedProperties.flatMap((row) => recordPrimaryIds(row))
  ]);
}

function managerPropertyNameKeys() {
  return lookupSet([
    state.profile?.requested_property_name,
    ...propertyNameValues(state.property),
    ...propertyNameValues(state.client),
    ...propertyNameValues(state.contract),
    ...state.relatedProperties.flatMap((row) => propertyNameValues(row))
  ]);
}

function managerPropertyAddressKeys() {
  return lookupSet([
    ...propertyAddressValues(state.property),
    ...propertyAddressValues(state.client),
    ...propertyAddressValues(state.contract),
    ...state.relatedProperties.flatMap((row) => propertyAddressValues(row))
  ]);
}

function rowMatchesManagerProperty(row) {
  const ids = new Set(managerPropertyIdValues());
  if (linkedDataIds(row).some((value) => ids.has(String(value || "").trim()))) return true;
  const nameKeys = managerPropertyNameKeys();
  if (propertyNameValues(row).some((value) => lookupMatches(value, nameKeys))) return true;
  const addressKeys = managerPropertyAddressKeys();
  if (propertyAddressValues(row).some((value) => lookupMatches(value, addressKeys))) return true;
  return false;
}

async function fetchRowsByColumn(table, column, ids, options = {}) {
  const values = uuidValues(ids);
  const rows = [];
  let firstError = null;
  for (const group of chunk(values, 80)) {
    let query = supabase.from(table).select(options.select || "*").in(column, group);
    if (options.order) {
      query = query.order(options.order, {
        ascending: options.ascending !== false,
        nullsFirst: options.nullsFirst
      });
    }
    if (options.limit) query = query.limit(options.limit);
    const { data, error } = await query;
    if (error) {
      if (!firstError) firstError = error;
    } else {
      rows.push(...(data || []));
    }
  }
  return { rows, error: firstError };
}

async function fetchPropertyScopeLinks(table, propertyIds, idColumn, options = {}) {
  const { rows, error } = await fetchRowsByColumn(table, "portal_property_id", propertyIds, {
    select: options.select || `${idColumn},portal_property_id,link_type,source,metadata`,
    limit: options.limit || 1000
  });
  return {
    rows,
    ids: uniqueValues(rows.map((row) => row?.[idColumn])),
    error
  };
}

async function loadManagedAccessProperties() {
  const managerId = state.profile?.id || state.user?.id;
  if (!supabase || !managerId) return { rows: [], error: null };

  const [directResult, regionResult] = await Promise.allSettled([
    supabase
      .from("property_manager_property_links")
      .select("*")
      .eq("profile_id", managerId)
      .eq("status", "active")
      .limit(1000),
    supabase
      .from("property_manager_region_links")
      .select("*")
      .eq("profile_id", managerId)
      .eq("status", "active")
      .limit(1000)
  ]);

  const directError = directResult.status === "fulfilled" ? directResult.value.error : directResult.reason;
  const regionError = regionResult.status === "fulfilled" ? regionResult.value.error : regionResult.reason;
  const directLinks = directResult.status === "fulfilled" && !directResult.value.error ? directResult.value.data || [] : [];
  const regionLinks = regionResult.status === "fulfilled" && !regionResult.value.error ? regionResult.value.data || [] : [];
  state.managedPropertyLinks = directLinks;
  state.managedRegionLinks = regionLinks;

  const regionIds = uniqueValues(regionLinks.map((row) => row.region_id));
  let regionPropertyLinks = [];
  let regionPropertyError = null;
  if (regionIds.length) {
    const result = await fetchRowsByColumn("property_region_links", "region_id", regionIds, {
      select: "*",
      limit: 1000
    });
    regionPropertyLinks = result.rows.filter((row) => normalizeStatus(row.status || "active") === "active");
    regionPropertyError = result.error;
  }
  state.managedRegionPropertyLinks = regionPropertyLinks;

  const portalPropertyIds = uniqueValues([
    ...directLinks.map((row) => row.portal_property_id),
    ...regionPropertyLinks.map((row) => row.portal_property_id)
  ]);
  const contractIds = uniqueValues([
    ...directLinks.map((row) => row.contract_id),
    ...regionPropertyLinks.map((row) => row.contract_id)
  ]);

  const [directProperties, contractClientProperties, contractIdProperties] = await Promise.allSettled([
    fetchRowsByColumn("portal_properties", "id", portalPropertyIds, { limit: 1000 }),
    fetchRowsByColumn("portal_properties", "client_id", contractIds, { limit: 1000 }),
    fetchRowsByColumn("portal_properties", "id", contractIds, { limit: 1000 })
  ]);

  const rows = [
    ...(directProperties.status === "fulfilled" ? directProperties.value.rows : []),
    ...(contractClientProperties.status === "fulfilled" ? contractClientProperties.value.rows : []),
    ...(contractIdProperties.status === "fulfilled" ? contractIdProperties.value.rows : [])
  ];

  const firstError = [
    directError,
    regionError,
    regionPropertyError,
    directProperties.status === "fulfilled" ? directProperties.value.error : directProperties.reason,
    contractClientProperties.status === "fulfilled" ? contractClientProperties.value.error : contractClientProperties.reason,
    contractIdProperties.status === "fulfilled" ? contractIdProperties.value.error : contractIdProperties.reason
  ].find(Boolean) || null;

  return { rows: dedupeRows(rows), error: firstError };
}

async function resolvePrimaryPropertyFromManagedAccess() {
  const access = await loadManagedAccessProperties();
  if (access.error && !missingColumnError(access.error)) {
    console.warn("[property-manager] Managed access lookup failed", access.error);
  }
  return access.rows[0] || null;
}

function managerClientName() {
  return state.client?.company_name
    || state.client?.client_name
    || state.client?.name
    || state.contract?.company_name
    || state.contract?.property_name
    || state.contract?.name
    || "Turnly managed";
}

function assignmentTitle(row) {
  return row?.title || row?.property_name || propertyTitle() || "Cleaning assignment";
}

function assignmentUnit(row) {
  const meta = rowMeta(row);
  const direct = row?.unit_number || row?.unit_name || row?.property_unit_name || row?.unit || meta.unit_number || meta.unit_name || meta.property_unit_name || meta.unit || "";
  if (direct) return direct;
  const unit = matchingUnit(row?.unit_id || meta.unit_id || row?.property_unit_id || meta.property_unit_id);
  return unit?.unit_number || unit?.unit_name || unit?.name || "";
}

function normalizeUnitLookup(value) {
  return String(value || "").trim().toLowerCase();
}

function unitLookupValues(value) {
  const meta = typeof value === "object" ? rowMeta(value) : {};
  return compact([
    typeof value === "string" || typeof value === "number" ? value : "",
    value?.id,
    value?.unit_id,
    value?.property_unit_id,
    value?.unit_number,
    value?.unit_name,
    value?.property_unit_name,
    value?.name,
    value?.unit,
    meta.unit_id,
    meta.property_unit_id,
    meta.unit_number,
    meta.unit_name,
    meta.property_unit_name,
    meta.unit
  ]).map(normalizeUnitLookup).filter(Boolean);
}

function matchingUnit(rowOrValue) {
  const directValues = unitLookupValues(rowOrValue);
  const assignmentValue = typeof rowOrValue === "object" ? normalizeUnitLookup(assignmentUnit(rowOrValue)) : "";
  const values = new Set(compact([...directValues, assignmentValue]));
  if (!values.size) return null;
  return state.units.find((unit) => unitLookupValues(unit).some((value) => values.has(value))) || null;
}

function unitBedBath(rowOrUnit) {
  const unit = matchingUnit(rowOrUnit) || (rowOrUnit?.unit_name || rowOrUnit?.unit_number || rowOrUnit?.name ? rowOrUnit : null);
  const meta = rowMeta(rowOrUnit);
  const bedrooms = unit?.bedroom_count ?? unit?.bedrooms ?? unit?.beds ?? unit?.bed_count ?? meta.bedroom_count ?? meta.bedrooms ?? meta.beds ?? meta.bed_count;
  const bathrooms = unit?.bathroom_count ?? unit?.bathrooms ?? unit?.baths ?? unit?.bath_count ?? meta.bathroom_count ?? meta.bathrooms ?? meta.baths ?? meta.bath_count;
  return compact([
    bedrooms !== undefined && bedrooms !== null && bedrooms !== "" ? `${bedrooms} Bed` : "",
    bathrooms !== undefined && bathrooms !== null && bathrooms !== "" ? `${bathrooms} Bath` : ""
  ]).join(" / ") || "Bed/Bath not set";
}

function assignmentStatus(row) {
  return normalizeStatus(row?.status || "scheduled");
}

function paymentStatus(row) {
  return normalizeStatus(row?.payment_status || row?.pay_status || row?.payout_status || rowMeta(row).payment_status || "unpaid");
}

function assignmentPriority(row) {
  return titleCase(row?.priority || rowMeta(row).priority || "normal");
}

function isClosedAssignment(row) {
  return closedStatuses.has(assignmentStatus(row));
}

function isCompletedAssignment(row) {
  return assignmentStatus(row) === "completed" || Boolean(row?.completed_at || row?.checklist_completed_at || row?.qa_approved_at);
}

function completionDateValue(row) {
  return row?.completed_at || row?.checklist_completed_at || row?.qa_approved_at || row?.end_window || row?.start_window || row?.updated_at || row?.created_at;
}

function requestDateValue(row) {
  const meta = rowMeta(row);
  return row?.requested_at || meta.requested_at || row?.created_at || row?.updated_at || row?.start_window || row?.recurring_due_at;
}

function scheduledDateValue(row) {
  return row?.start_window || row?.recurring_due_at || row?.end_window || row?.created_at;
}

function isUpcomingAssignment(row) {
  return !isClosedAssignment(row) && dateValue(row?.start_window || row?.recurring_due_at, Infinity) >= Date.now() - 86400000;
}

function isIssueAssignment(row) {
  const status = assignmentStatus(row);
  const end = parseDate(row?.end_window || row?.start_window);
  return issueStatuses.has(status) || (!isClosedAssignment(row) && end && end.getTime() < Date.now());
}

function requestGroup(row) {
  const status = assignmentStatus(row);
  if (isCompletedAssignment(row)) return "completed";
  if (pendingStatuses.has(status)) return "pending";
  if (status.includes("hold") || status.includes("paused")) return "on_hold";
  if (inProgressStatuses.has(status)) return "in_progress";
  if (readyStatuses.has(status)) return status === "ready" ? "ready" : "open";
  return status || "open";
}

function sortedAssignments(rows = state.assignments, direction = "asc") {
  const factor = direction === "desc" ? -1 : 1;
  return [...rows].sort((a, b) => (dateValue(a.start_window || a.recurring_due_at, 0) - dateValue(b.start_window || b.recurring_due_at, 0)) * factor);
}

function compareMissing(aMissing, bMissing) {
  if (aMissing && bMissing) return 0;
  if (aMissing) return 1;
  if (bMissing) return -1;
  return 0;
}

function compareTextFields(a, b, getter, factor) {
  const left = String(getter(a) || "").trim();
  const right = String(getter(b) || "").trim();
  const missing = compareMissing(!left, !right);
  if (missing) return missing;
  return left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" }) * factor;
}

function compareDateFields(a, b, getter, factor) {
  const left = dateValue(getter(a), NaN);
  const right = dateValue(getter(b), NaN);
  const missing = compareMissing(!Number.isFinite(left), !Number.isFinite(right));
  if (missing) return missing;
  return (left - right) * factor;
}

function bedBathSortValue(row) {
  const label = unitBedBath(row);
  const bedrooms = Number((label.match(/([\d.]+)\s*Bed/i) || [])[1] || 0);
  const bathrooms = Number((label.match(/([\d.]+)\s*Bath/i) || [])[1] || 0);
  return bedrooms * 100 + bathrooms;
}

function sortRequests(rows) {
  const sortKey = state.filters.requestSort || "scheduled_date";
  const direction = state.filters.requestSortDirection === "desc" ? "desc" : "asc";
  const factor = direction === "desc" ? -1 : 1;
  return [...rows].sort((a, b) => {
    let result = 0;
    if (sortKey === "status") result = compareTextFields(a, b, (row) => requestGroup(row), factor);
    else if (sortKey === "date") result = compareDateFields(a, b, requestDateValue, factor);
    else if (sortKey === "unit") result = compareTextFields(a, b, (row) => assignmentUnit(row), factor);
    else if (sortKey === "bed_bath") {
      const left = bedBathSortValue(a);
      const right = bedBathSortValue(b);
      result = (left - right) * factor;
    } else if (sortKey === "completed_date") result = compareDateFields(a, b, completionDateValue, factor);
    else result = compareDateFields(a, b, scheduledDateValue, factor);
    return result || compareDateFields(a, b, scheduledDateValue, 1) || compareTextFields(a, b, (row) => assignmentUnit(row), 1);
  });
}

function activeAssignments() {
  return sortedAssignments(state.assignments.filter((row) => !isClosedAssignment(row)));
}

function completedAssignments() {
  return sortedAssignments(state.assignments.filter(isCompletedAssignment), "desc");
}

function recentCompletedAssignments(days = 30) {
  const cutoff = Date.now() - days * 86400000;
  return completedAssignments().filter((row) => dateValue(completionDateValue(row), 0) >= cutoff);
}

function upcomingAssignments(limit = 8) {
  return sortedAssignments(state.assignments.filter(isUpcomingAssignment)).slice(0, limit);
}

function issueAssignments() {
  return sortedAssignments(state.assignments.filter(isIssueAssignment), "asc").slice(0, 8);
}

function monthKey(value) {
  const date = parseDate(value);
  if (!date) return "Unscheduled";
  return date.toLocaleDateString([], { month: "long", year: "numeric" });
}

function startOfWeek(value = new Date(), monday = false) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  const day = date.getDay();
  const diff = monday ? (day === 0 ? -6 : 1 - day) : -day;
  date.setDate(date.getDate() + diff);
  return date;
}

function endOfWeek(value = new Date(), monday = false) {
  const date = startOfWeek(value, monday);
  date.setDate(date.getDate() + 7);
  return date;
}

function ensureScheduleState() {
  if (!state.selectedScheduleDate) state.selectedScheduleDate = dateInputValue(new Date());
  if (!state.scheduleWeekStart) state.scheduleWeekStart = dateInputValue(startOfWeek(localDate(state.selectedScheduleDate), true));
}

function setScheduleDate(value) {
  const date = localDate(value);
  state.selectedScheduleDate = dateInputValue(date);
  state.scheduleWeekStart = dateInputValue(startOfWeek(date, true));
}

function moveScheduleWindow(direction) {
  ensureScheduleState();
  const selected = localDate(state.selectedScheduleDate);
  const amount = Number(direction) || 0;
  if (state.scheduleView === "month") {
    selected.setMonth(selected.getMonth() + amount);
    setScheduleDate(selected);
    return;
  }
  selected.setDate(selected.getDate() + (state.scheduleView === "day" ? amount : amount * 7));
  setScheduleDate(selected);
}

function formatWeekRange(startValue) {
  const start = localDate(startValue);
  const end = addDays(start, 6);
  const startLabel = start.toLocaleDateString([], { month: "short", day: "numeric" });
  const endLabel = end.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
  return `${startLabel} - ${endLabel}`;
}

function scheduleRangeLabel() {
  ensureScheduleState();
  const selected = localDate(state.selectedScheduleDate);
  if (state.scheduleView === "day") {
    return selected.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric", year: "numeric" });
  }
  if (state.scheduleView === "month") {
    return selected.toLocaleDateString([], { month: "long", year: "numeric" });
  }
  return formatWeekRange(state.scheduleWeekStart);
}

function isDateBetween(value, start, end) {
  const time = dateValue(value, NaN);
  return Number.isFinite(time) && time >= start.getTime() && time < end.getTime();
}

function currentView() {
  const raw = (window.location.hash || "#overview").replace(/^#/, "") || "overview";
  return navViews.has(raw) ? raw : "overview";
}

function viewSupportsSearch(view = state.view) {
  return !searchlessViews.has(view);
}

function queryMatches(values) {
  if (!viewSupportsSearch()) return true;
  const term = state.filters.query.trim().toLowerCase();
  if (!term) return true;
  return values.some((value) => String(value || "").toLowerCase().includes(term));
}

function managerMetrics() {
  const now = new Date();
  const thisWeekStart = startOfWeek(now);
  const thisWeekEnd = endOfWeek(now);
  const lastWeekStart = new Date(thisWeekStart);
  lastWeekStart.setDate(lastWeekStart.getDate() - 7);
  const assignments = state.assignments;
  const completed = assignments.filter(isCompletedAssignment);
  const completedThisWeek = completed.filter((row) => isDateBetween(completionDateValue(row), thisWeekStart, thisWeekEnd)).length;
  const completedLastWeek = completed.filter((row) => isDateBetween(completionDateValue(row), lastWeekStart, thisWeekStart)).length;
  const inProgress = assignments.filter((row) => inProgressStatuses.has(assignmentStatus(row))).length;
  const open = activeAssignments().filter((row) => requestGroup(row) === "open" || requestGroup(row) === "ready").length;
  const pending = assignments.filter((row) => requestGroup(row) === "pending").length;
  const scheduled = assignments.filter((row) => requestGroup(row) === "scheduled" || isUpcomingAssignment(row)).length;
  const ready = recentCompletedAssignments(30).length;
  const beforeVideos = state.videos.filter((video) => normalizeToken(video.video_phase) === "before").length;
  const afterVideos = state.videos.filter((video) => ["after", "final"].includes(normalizeToken(video.video_phase))).length;
  const videoSets = new Set(state.videos.map((video) => video.assignment_id || video.pair_id || video.id).filter(Boolean)).size;
  const unread = state.threads.filter(managerThreadUnread).length;
  return {
    ready,
    inProgress,
    beforeAfter: Math.max(videoSets, Math.min(beforeVideos, afterVideos), state.videos.length),
    completedThisWeek,
    completedLastWeek,
    totalRequests: assignments.length,
    open,
    pending,
    scheduled,
    upcoming: upcomingAssignments(500).length,
    issues: issueAssignments().length,
    units: state.units.length,
    unread,
    inbox: state.threads.length,
    beforeVideos,
    afterVideos
  };
}

function renderLockedState(title, body) {
  if (!managerMain) return;
  managerMain.innerHTML = `
    <header class="command-header pm-page-header">
      <div>
        <h1>${esc(title)}</h1>
        <p>${esc(body)}</p>
      </div>
    </header>
    <section class="panel-card pm-lock-panel">
      <p class="pm-eyebrow">Account Access</p>
      <h2>${esc(title)}</h2>
      <p>${esc(body)}</p>
    </section>
  `;
}

async function requireManagerAccess() {
  if (!supabase) {
    renderLockedState("Configuration needed", "Supabase configuration is missing for this deployment.");
    return;
  }

  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user || null;

  if (!user) {
    window.location.href = "property-manager-login.html";
    return;
  }

  if (await applyManagerAdminPreview(user)) {
    return;
  }

  let { data: profile, error } = await supabase
    .from("profiles")
    .select("id,role,full_name,email,status,property_manager_property_id,requested_property_name")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    const fallback = await supabase
      .from("profiles")
      .select("id,role,full_name,email,status")
      .eq("id", user.id)
      .maybeSingle();
    profile = fallback.data ? { ...fallback.data, property_manager_property_id: null, access_setup_error: true } : null;
  }

  if (!profile) {
    if (normalizeRole(user.user_metadata?.role) === "property_manager") {
      profile = await repairPropertyManagerProfile(user, {});
    } else {
      window.location.href = "property-manager-login.html";
      return;
    }
  } else if (hasPropertyManagerSignal(user, profile) && normalizeRole(profile.role) !== "property_manager") {
    profile = await repairPropertyManagerProfile(user, profile);
  }

  const role = hasPropertyManagerSignal(user, profile)
    ? "property_manager"
    : normalizeRole(profile?.role);

  if (role !== "property_manager") {
    window.location.href = getPortalHome(role);
    return;
  }

  state.user = user;
  state.profile = profile;
  state.view = currentView();

  if (requiresPasswordChange(user)) {
    await renderManagerPasswordChangeRequired(user);
    return;
  }

  if (!profile.property_manager_property_id) {
    const accessProperty = await resolvePrimaryPropertyFromManagedAccess();
    if (accessProperty?.id) {
      state.profile = { ...state.profile, property_manager_property_id: accessProperty.id };
      state.property = accessProperty;
      state.propertyLinkPending = false;
      renderManagerPortal(true);
      await refreshManagerPortal();
      return;
    }

    state.property = null;
    state.propertyLinkPending = true;
    state.client = null;
    state.contract = null;
    state.relatedProperties = [];
    state.units = [];
    state.assignments = [];
    state.qaJobs = [];
    state.videos = [];
    state.dataMessage = propertyLinkPendingMessage();
    state.dataError = false;
    renderManagerPortal();
    await loadManagerMessages();
    renderManagerPortal();
    return;
  }

  const { data: property, error: propertyError } = await supabase
    .from("portal_properties")
    .select("*")
    .eq("id", profile.property_manager_property_id)
    .maybeSingle();

  if (propertyError || !property) {
    state.property = {
      id: profile.property_manager_property_id,
      name: profile.requested_property_name || "Linked Property",
      property_name: profile.requested_property_name || "Linked Property",
      access_limited: true
    };
    state.propertyLinkPending = false;
    state.dataMessage = "Loading linked property tables...";
    state.dataError = false;
    renderManagerPortal(true);
    await refreshManagerPortal();
    return;
  }

  state.property = property;
  state.propertyLinkPending = false;
  renderManagerPortal(true);
  await refreshManagerPortal();
}

async function refreshManagerPortal() {
  if (state.refreshing) return;
  if (!state.property?.id) {
    state.dataMessage = propertyLinkPendingMessage();
    state.dataError = false;
    renderManagerPortal();
    return;
  }
  state.refreshing = true;
  state.dataMessage = "Refreshing property data...";
  state.dataError = false;
  renderManagerPortal(true);

  try {
    await loadManagerData();
    await loadManagerMessages();
  } catch (error) {
    console.error("[property-manager] Portal refresh failed", error);
    state.dataMessage = `Unable to finish loading property data: ${errorMessage(error)}.`;
    state.dataError = true;
  } finally {
    state.refreshing = false;
    renderManagerPortal();
  }
}

async function loadManagerData() {
  const notes = [];
  const propertyId = state.property?.id;
  state.client = null;
  state.contract = null;
  state.relatedProperties = [];
  state.managedPropertyLinks = [];
  state.managedRegionLinks = [];
  state.managedRegionPropertyLinks = [];
  state.units = [];
  state.assignments = [];
  state.qaJobs = [];
  state.videos = [];

  if (!supabase || !propertyId) return;

  const clientResult = await Promise.resolve().then(loadLinkedClient);
  if (clientResult) notes.push(clientResult);

  const relatedResult = await Promise.resolve().then(loadRelatedPortalProperties);
  if (relatedResult) notes.push(relatedResult);

  const [unitResult, assignmentResult] = await Promise.allSettled([
    loadPropertyUnits(propertyId),
    loadPropertyAssignments(propertyId)
  ]);

  for (const result of [unitResult, assignmentResult]) {
    if (result.status === "fulfilled" && result.value) notes.push(result.value);
    if (result.status === "rejected") notes.push(result.reason?.message || "Some property data could not be loaded.");
  }

  const [qaResult, videoResult] = await Promise.allSettled([
    loadManagerQaJobs(),
    loadManagerVideos()
  ]);

  if (qaResult.status === "fulfilled" && qaResult.value) notes.push(qaResult.value);
  if (qaResult.status === "rejected") notes.push(`QA review details are limited right now: ${errorMessage(qaResult.reason)}.`);
  if (videoResult.status === "fulfilled" && videoResult.value) notes.push(videoResult.value);
  if (videoResult.status === "rejected") notes.push(`Unit videos are limited right now: ${errorMessage(videoResult.reason)}.`);

  state.dataMessage = notes.length ? notes.join(" ") : `Property data synced: ${state.assignments.length} jobs and ${state.units.length} units loaded.`;
  state.dataError = notes.some((note) => /^Unable|^Some|unavailable/i.test(note));
}

async function loadLinkedClient() {
  const ids = uniqueValues([
    state.property?.client_id,
    state.property?.property_id,
    rowMeta(state.property).client_id,
    rowMeta(state.property).contract_id
  ]);
  if (!ids.length) return "";

  const [clientResult, contractResult] = await Promise.allSettled([
    fetchRowsByColumn("clients", "id", ids, { limit: 5 }),
    fetchRowsByColumn("client_contracts", "id", ids, { limit: 5 })
  ]);

  const clientRows = clientResult.status === "fulfilled" && !clientResult.value.error ? clientResult.value.rows : [];
  const contractRows = contractResult.status === "fulfilled" && !contractResult.value.error ? contractResult.value.rows : [];
  state.client = clientRows[0] || null;
  state.contract = contractRows[0] || null;
  if (!state.client && state.contract) state.client = state.contract;

  const clientError = clientResult.status === "fulfilled" ? clientResult.value.error : clientResult.reason;
  const contractError = contractResult.status === "fulfilled" ? contractResult.value.error : contractResult.reason;
  if (!state.client && !state.contract && (clientError || contractError)) {
    return `Client details unavailable: ${(clientError || contractError)?.message || "access rules blocked the lookup"}.`;
  }
  return "";
}

async function loadRelatedPortalProperties() {
  if (!state.property?.id) return "";
  const propertyIds = uniqueValues([
    state.property.id,
    state.property.client_id,
    state.client?.id,
    state.contract?.id
  ]);
  const rows = [state.property];
  let blocked = false;

  const managedAccess = await loadManagedAccessProperties();
  if (managedAccess.error && !missingColumnError(managedAccess.error)) blocked = true;
  rows.push(...managedAccess.rows);

  const direct = await fetchRowsByColumn("portal_properties", "id", propertyIds, { limit: 100 });
  if (direct.error && !missingColumnError(direct.error)) blocked = true;
  rows.push(...direct.rows);

  const byClient = await fetchRowsByColumn("portal_properties", "client_id", propertyIds, { limit: 100 });
  if (byClient.error && !missingColumnError(byClient.error)) blocked = true;
  rows.push(...byClient.rows);

  const names = managerPropertyNameKeys();
  const addresses = managerPropertyAddressKeys();
  const { data: visibleProperties, error: visibleError } = await supabase
    .from("portal_properties")
    .select("*")
    .limit(1000);
  if (visibleError && !missingColumnError(visibleError)) blocked = true;
  rows.push(...((visibleProperties || []).filter((property) => (
    propertyNameValues(property).some((value) => lookupMatches(value, names))
    || propertyAddressValues(property).some((value) => lookupMatches(value, addresses))
  ))));

  state.relatedProperties = dedupeRows(rows);
  return blocked && state.relatedProperties.length <= 1 ? "Some related property records are limited by current access rules." : "";
}

async function loadPropertyUnits(propertyId) {
  const ids = uniqueValues([propertyId, ...managerPropertyIdValues()]);
  const { rows, error } = await fetchRowsByColumn("property_units", "property_id", ids, {
    order: "unit_name",
    ascending: true,
    limit: 1000
  });
  if (error && !rows.length && !missingColumnError(error)) return `Units unavailable: ${error.message}.`;
  state.units = dedupeRows(rows).sort((a, b) => String(a.unit_name || a.name || "").localeCompare(String(b.unit_name || b.name || "")));
  return "";
}

async function loadPropertyAssignments(propertyId) {
  const ids = uniqueValues([propertyId, ...managerPropertyIdValues()]);
  const rows = [];
  const hardErrors = [];
  const columns = ["portal_property_id", "recurring_portal_property_id", "property_id", "recurring_property_id", "client_id", "contract_id"];
  const linkedAssignments = await fetchPropertyScopeLinks("property_assignment_links", ids, "assignment_id");

  if (linkedAssignments.error && !missingColumnError(linkedAssignments.error)) {
    hardErrors.push(linkedAssignments.error);
  }

  if (linkedAssignments.ids.length) {
    const result = await fetchRowsByColumn("assignment_blocks", "id", linkedAssignments.ids, {
      order: "start_window",
      ascending: false,
      nullsFirst: false,
      limit: 500
    });
    rows.push(...result.rows.map((row) => ({ ...row, __propertyScopeLinked: true })));
    if (result.error && !missingColumnError(result.error)) hardErrors.push(result.error);
  }

  for (const column of columns) {
    const result = await fetchRowsByColumn("assignment_blocks", column, ids, {
      order: "start_window",
      ascending: false,
      nullsFirst: false,
      limit: 500
    });
    rows.push(...result.rows);
    if (result.error && !missingColumnError(result.error)) hardErrors.push(result.error);
  }

  const broad = await supabase
    .from("assignment_blocks")
    .select("*")
    .order("start_window", { ascending: false, nullsFirst: false })
    .limit(1000);
  if (broad.error && !missingColumnError(broad.error)) {
    hardErrors.push(broad.error);
  } else {
    rows.push(...((broad.data || []).filter(rowMatchesManagerProperty)));
  }

  state.assignments = dedupeRows(rows)
    .filter((row) => row.__propertyScopeLinked || rowMatchesManagerProperty(row))
    .map(redactManagerAssignment)
    .sort((a, b) => dateValue(b.start_window || b.recurring_due_at || b.created_at, 0) - dateValue(a.start_window || a.recurring_due_at || a.created_at, 0));
  if (hardErrors.length && !state.assignments.length) return `Assignments unavailable: ${hardErrors[0].message}.`;
  return "";
}

async function loadManagerQaJobs() {
  const assignmentIds = state.assignments.map((row) => row.id).filter(Boolean);
  if (!assignmentIds.length) return "";
  const rows = [];
  let blocked = false;
  for (const ids of chunk(assignmentIds, 80)) {
    const { data, error } = await supabase
      .from("qa_jobs")
      .select("*")
      .in("assignment_id", ids)
      .order("service_date", { ascending: false })
      .limit(200);
    if (error) {
      blocked = true;
    } else {
      rows.push(...(data || []));
    }
  }
  state.qaJobs = rows;
  return blocked && !rows.length ? "QA review details are limited by current access rules." : "";
}

function videoPropertyCandidates() {
  const propertyMeta = rowMeta(state.property);
  return uuidValues([
    ...managerPropertyIdValues(),
    state.property?.id,
    state.property?.client_id,
    state.property?.property_id,
    state.client?.id,
    state.contract?.id,
    propertyMeta.client_id,
    propertyMeta.property_id,
    ...state.assignments.flatMap((row) => {
      const meta = rowMeta(row);
      return [
        row.property_id,
        row.portal_property_id,
        row.recurring_property_id,
        row.recurring_portal_property_id,
        row.client_id,
        row.contract_id,
        meta.property_id,
        meta.portal_property_id,
        meta.recurring_property_id,
        meta.recurring_portal_property_id,
        meta.client_id,
        meta.contract_id
      ];
    })
  ]);
}

async function signedVideoUrl(video) {
  if (!video?.storage_path) return "";
  try {
    const result = await supabase.storage
      .from(video.storage_bucket || VIDEO_BUCKET)
      .createSignedUrl(video.storage_path, SIGNED_URL_SECONDS);
    return result.data?.signedUrl || "";
  } catch {
    return "";
  }
}

async function attachSignedVideoUrls(rows) {
  return Promise.all((rows || []).map(async (row) => ({
    ...row,
    signedUrl: await signedVideoUrl(row)
  })));
}

async function loadManagerVideos() {
  if (!supabase) return "";
  const assignmentIds = state.assignments.map((row) => row.id).filter(Boolean);
  const propertyIds = videoPropertyCandidates();
  const linkedVideos = await fetchPropertyScopeLinks("property_qa_video_links", propertyIds, "qa_video_id");
  const requests = [
    ...chunk(linkedVideos.ids, 80).map((ids) => supabase
      .from("qa_videos")
      .select("*")
      .in("id", ids)
      .order("created_at", { ascending: false })
      .limit(120)),
    ...propertyIds.slice(0, 10).map((id) => supabase
      .from("qa_videos")
      .select("*")
      .eq("property_id", id)
      .order("created_at", { ascending: false })
      .limit(120)),
    ...propertyIds.slice(0, 10).map((id) => supabase
      .from("qa_videos")
      .select("*")
      .eq("portal_property_id", id)
      .order("created_at", { ascending: false })
      .limit(120)),
    ...chunk(assignmentIds, 80).map((ids) => supabase
      .from("qa_videos")
      .select("*")
      .in("assignment_id", ids)
      .order("created_at", { ascending: false })
      .limit(120))
  ];

  if (!requests.length) return "";
  const results = await Promise.allSettled(requests);
  const byId = new Map();
  let errors = linkedVideos.error && !missingColumnError(linkedVideos.error) ? 1 : 0;
  results.forEach((result) => {
    if (result.status !== "fulfilled" || result.value.error) {
      errors += 1;
      return;
    }
    (result.value.data || []).forEach((row) => byId.set(row.id, row));
  });

  state.videos = await attachSignedVideoUrls(Array.from(byId.values()).sort((a, b) => dateValue(b.created_at, 0) - dateValue(a.created_at, 0)));
  if (errors && !state.videos.length) return "Unit videos are limited by current access rules.";
  return "";
}

function renderManagerPortal(loading = false) {
  if (!managerMain) return;
  state.view = currentView();
  maybeStartScheduleGuide();
  setActiveNav();
  const [title, subtitle] = viewLabels[state.view] || viewLabels.overview;
  const headingTitle = state.view === "overview" ? propertyTitle() : title;
  const headingSubtitle = state.view === "overview"
    ? ""
    : subtitle;

  managerMain.innerHTML = `
    <header class="command-header pm-page-header">
      <div class="pm-heading">
        <h1>${esc(headingTitle)}</h1>
        ${headingSubtitle ? `<p>${esc(headingSubtitle)}</p>` : ""}
      </div>
      ${renderTopBar()}
    </header>
    ${renderPropertyLinkNotice()}
    ${renderRequestForm()}
    ${renderCurrentView()}
    ${renderAssignmentDetailsModal()}
    ${renderManagerGuideOverlay()}
  `;
}

function currentGuideSteps() {
  return managerGuideSteps[state.view] || [];
}

function guideStorageKey(view = state.view) {
  return `${PROPERTY_MANAGER_GUIDE_STORAGE_PREFIX}:${state.user?.id || "browser"}:${view}`;
}

function hasSeenManagerGuide(view = state.view) {
  try {
    return window.localStorage?.getItem(guideStorageKey(view)) === "seen";
  } catch {
    return false;
  }
}

function markManagerGuideSeen(view = state.view) {
  try {
    window.localStorage?.setItem(guideStorageKey(view), "seen");
  } catch {
    // localStorage can be unavailable in private or restricted browsing.
  }
}

function maybeStartScheduleGuide() {
  const steps = currentGuideSteps();
  if (!steps.length || state.assignmentDetailsOpen || state.requestOpen || state.guideOpen || hasSeenManagerGuide()) return;
  state.guideOpen = true;
  state.guideStep = 0;
}

function currentScheduleGuideStep() {
  const steps = currentGuideSteps();
  return steps[Math.min(Math.max(state.guideStep, 0), steps.length - 1)] || steps[0] || null;
}

function scheduleGuideTargetClass(key, row = null) {
  const step = currentScheduleGuideStep();
  if (!state.guideOpen || !step || step.key !== key) return "";
  if (key === "assignment") {
    const target = scheduledRows()[0];
    if (!target || String(target.id || "") !== String(row?.id || "")) return "";
  }
  return "pm-guide-target";
}

function renderManagerGuideOverlay() {
  if (!state.guideOpen) return "";
  const steps = currentGuideSteps();
  if (!steps.length) return "";
  const step = currentScheduleGuideStep();
  if (!step) return "";
  const isLast = state.guideStep >= steps.length - 1;
  const hasAssignmentTarget = Boolean(scheduledRows()[0]);
  const hasRequestTarget = Boolean(filteredRequests()[0]);
  const body = (
    (step.key === "assignment" && !hasAssignmentTarget) ||
    (step.key === "request-details" && !hasRequestTarget) ||
    (step.key === "message-reply" && !selectedManagerThread())
  ) ? step.emptyBody : step.body;
  const pageTitle = viewLabels[state.view]?.[0] || "Portal";
  return `
    <div class="pm-guide-layer" aria-live="polite">
      <button class="pm-guide-backdrop" type="button" data-pm-guide-skip aria-label="Dismiss page guide"></button>
      <section class="pm-guide-card pm-guide-card-${esc(step.key)}" role="dialog" aria-modal="false" aria-labelledby="pmGuideTitle">
        <p class="pm-eyebrow">${esc(pageTitle)} Guide ${esc(state.guideStep + 1)} of ${esc(steps.length)}</p>
        <h2 id="pmGuideTitle">${esc(step.title)}</h2>
        <p>${esc(body)}</p>
        <div class="pm-guide-actions">
          <button class="pm-link-button" type="button" data-pm-guide-skip>Skip</button>
          <button class="new-btn pm-compact-btn" type="button" data-pm-guide-next>${esc(isLast ? "Done" : "Next")}</button>
        </div>
      </section>
    </div>
  `;
}

function closeScheduleGuide(markSeen = true) {
  if (markSeen) markManagerGuideSeen();
  state.guideOpen = false;
  state.guideStep = 0;
}

function renderManagerAdminPreviewSwitcher() {
  if (!state.adminPreview) return "";
  const preview = normalizeAdminPreviewContext(state.adminPreview);
  const userOptions = adminPreviewUsersForPortal(preview.portal);
  return `
    <div class="admin-preview-wrap">
      <button id="adminPreviewBtn" class="admin-preview-trigger" type="button" aria-haspopup="menu" aria-expanded="${state.adminPreviewMenuOpen ? "true" : "false"}" aria-controls="adminPreviewMenu">
        ${pmIcon("users")}
        <span><strong>Portal Preview</strong><small id="adminPreviewSummary">${esc(adminPreviewSummary(preview))}</small></span>
        ${pmIcon("chevron-down")}
      </button>
      <div id="adminPreviewMenu" class="topbar-dropdown admin-preview-menu" ${state.adminPreviewMenuOpen ? "" : "hidden"}>
        <div class="admin-preview-header">
          ${pmIcon("shield")}
          <span><strong>Admin Preview Mode</strong><small>Open a portal as a selected user and property.</small></span>
        </div>
        ${renderAdminPreviewSelect("View", "portal", adminPreviewPortalOptions, preview.portal)}
        ${renderAdminPreviewSelect("Property / Contract", "property", adminPreviewPropertyOptions, preview.property)}
        ${renderAdminPreviewSelect("User", "user", userOptions, preview.user)}
        <div class="admin-preview-actions">
          <button class="primary-action" type="button" data-admin-preview-open>${pmIcon("chevron-right")}<span>Open View</span></button>
          <button class="secondary-action" type="button" data-admin-preview-clear>${pmIcon("x")}<span>Clear</span></button>
        </div>
      </div>
    </div>
  `;
}

function renderAdminPreviewSelect(label, field, options, selectedValue) {
  return `
    <label class="admin-preview-field">
      <span>${esc(label)}</span>
      <select data-admin-preview-field="${esc(field)}">
        ${options.map((option) => `<option value="${esc(option.value)}" ${option.value === selectedValue ? "selected" : ""}>${esc(option.label)}</option>`).join("")}
      </select>
    </label>
  `;
}

function syncAdminPreviewControls(context = state.adminPreview) {
  const normalized = normalizeAdminPreviewContext(context || {});
  const portalField = document.querySelector("[data-admin-preview-field='portal']");
  const propertyField = document.querySelector("[data-admin-preview-field='property']");
  const userField = document.querySelector("[data-admin-preview-field='user']");
  if (portalField) portalField.value = normalized.portal;
  if (propertyField) propertyField.value = normalized.property;
  if (userField) {
    const userOptions = adminPreviewUsersForPortal(normalized.portal);
    userField.innerHTML = userOptions
      .map((option) => `<option value="${esc(option.value)}" ${option.value === normalized.user ? "selected" : ""}>${esc(option.label)}</option>`)
      .join("");
    userField.value = normalized.user;
  }
  const summary = document.getElementById("adminPreviewSummary");
  if (summary) summary.textContent = adminPreviewSummary(normalized);
  return normalized;
}

function adminPreviewContextFromControls() {
  const current = { ...(state.adminPreview || {}) };
  document.querySelectorAll("[data-admin-preview-field]").forEach((field) => {
    current[field.dataset.adminPreviewField] = field.value;
  });
  const context = writeAdminPreviewContext(current);
  state.adminPreview = context;
  syncAdminPreviewControls(context);
  return context;
}

function renderPropertyLinkNotice() {
  if (hasLinkedProperty()) return "";
  return `
    <section class="panel-card pm-link-pending-panel">
      <div class="pm-panel-head">
        <div>
          <p class="pm-eyebrow">Property Link Pending</p>
          <h2>Property link pending</h2>
          <p>${esc(propertyLinkPendingMessage())}</p>
        </div>
        <button class="secondary-command-btn pm-compact-btn" type="button" data-pm-view-button="messages">Message Turnly</button>
      </div>
    </section>
  `;
}

function renderTopBar() {
  const profile = managerProfileDefaults();
  const unread = managerNotificationUnreadCount();
  return `
    <div class="pm-topbar topbar-tools">
      ${renderManagerAdminPreviewSwitcher()}
      ${viewSupportsSearch() ? `<div class="global-search topbar-search-wrap" role="search">
        ${pmIcon("search")}
        <input data-manager-global-search data-pm-filter="query" type="search" value="${esc(state.filters.query)}" placeholder="Search anything..." autocomplete="off" />
        <kbd>K</kbd>
      </div>` : ""}
      ${dashboardThemeToggleMarkup()}
      <div class="topbar-popover-wrap">
        <button class="top-icon" type="button" aria-label="${unread} unread messages" data-pm-notifications>
          ${pmIcon("bell")}
          <span ${unread ? "" : "hidden"}>${esc(unread > 99 ? "99+" : String(unread))}</span>
        </button>
      </div>
      <div class="topbar-profile-wrap pm-account-menu-wrap">
        <button id="topProfileBtn" class="top-user" type="button" aria-label="Profile menu" aria-haspopup="menu" aria-expanded="${state.accountMenuOpen ? "true" : "false"}" data-manager-account-toggle>
          ${renderManagerAvatar(profile, "topUserAvatar")}
          <span><strong id="topUserName">${esc(profile.name)}</strong><small id="topUserRole">${esc(profile.role)}</small></span>
          ${pmIcon("chevron-down")}
        </button>
        <div id="topProfileMenu" class="topbar-dropdown topbar-profile-menu" role="menu" ${state.accountMenuOpen ? "" : "hidden"}>
          <div class="topbar-profile-card">
            ${renderManagerAvatar(profile, "topProfileAvatarLarge", true)}
            <span><strong id="topProfileName">${esc(profile.name)}</strong><small id="topProfileEmail">${esc(profile.email || profile.role)}</small></span>
          </div>
          <p id="topProfileMessage" class="topbar-profile-message" aria-live="polite"></p>
          <a href="property-manager.html#overview" role="menuitem">${pmIcon("home")}<span>Open Dashboard</span></a>
          <button id="topSignOutBtn" type="button" role="menuitem" data-manager-logout>${pmIcon("chevron-right")}<span>Sign Out</span></button>
        </div>
      </div>
    </div>
  `;
}

function renderManagerSearch(placeholder, options = {}) {
  const filter = options.filter || "query";
  const value = state.filters[filter] || "";
  const className = options.className ? ` ${options.className}` : "";
  return `
    <label class="pm-search${className}">
      <span class="sr-only">${esc(options.label || placeholder)}</span>
      <span class="pm-search-icon" aria-hidden="true"></span>
      <input data-pm-filter="${esc(filter)}" type="search" value="${esc(value)}" placeholder="${esc(placeholder)}" autocomplete="off" />
    </label>
  `;
}

function renderDataStatus(loading) {
  const message = loading ? state.dataMessage || "Loading property data..." : state.dataMessage;
  return message ? `<p id="managerDataStatus" class="pm-page-status ${state.dataError ? "error" : ""}" aria-live="polite">${esc(message)}</p>` : "";
}

function renderCurrentView() {
  if (state.view === "turn-requests") return renderTurnRequestsView();
  if (state.view === "schedule") return renderScheduleView();
  if (state.view === "messages") return renderMessagesView();
  return renderOverviewView();
}

function statCard(label, value, caption, tone = "green", view = "") {
  return `
    <article class="panel-card pm-stat-card ${esc(tone)}">
      <div>
        <small>${esc(label)}</small>
        <strong>${esc(value)}</strong>
        <em>${esc(caption)}</em>
      </div>
      ${view ? `<button class="pm-link-button" type="button" data-pm-view-button="${esc(view)}">View</button>` : ""}
    </article>
  `;
}

function renderNewTurnRequestButton(label = "+ New Turn Request") {
  if (!hasLinkedProperty()) {
    return `<button class="secondary-command-btn pm-compact-btn" type="button" disabled>Property Link Pending</button>`;
  }
  return `<button class="new-btn pm-compact-btn" type="button" data-manager-request-toggle>${esc(label)}</button>`;
}

function overviewWeekRows(limit = 7) {
  const weekStart = startOfWeek(new Date());
  const weekEnd = endOfWeek(new Date());
  return sortedAssignments(state.assignments.filter((row) => isDateBetween(row.start_window || row.recurring_due_at, weekStart, weekEnd))).slice(0, limit);
}

function latestMediaAssignment() {
  const withMedia = completedAssignments()
    .find((row) => videosForAssignment(row).some((video) => video.signedUrl && ["after", "final", "before"].includes(normalizeToken(video.video_phase))));
  return withMedia || upcomingAssignments(1)[0] || sortedAssignments(state.assignments, "desc")[0] || null;
}

function overviewHeroVideo(row = null) {
  const rowVideos = row ? videosForAssignment(row) : [];
  return rowVideos.find((video) => video.signedUrl && ["after", "final"].includes(normalizeToken(video.video_phase)))
    || rowVideos.find((video) => video.signedUrl && normalizeToken(video.video_phase) === "before")
    || state.videos.find((video) => video.signedUrl && ["after", "final"].includes(normalizeToken(video.video_phase)))
    || state.videos.find((video) => video.signedUrl)
    || null;
}

function assignmentForVideo(video) {
  if (!video?.assignment_id) return null;
  return state.assignments.find((row) => String(row.id || "") === String(video.assignment_id)) || null;
}

function renderOverviewHero(metrics, delta) {
  const next = upcomingAssignments(1)[0] || null;
  return `
    <section class="panel-card pm-experience-hero pm-picture-hero ${propertyHeroClass()} ${scheduleGuideTargetClass("overview-hero")}">
      <div class="pm-picture-backdrop pm-picture-backdrop-image" aria-hidden="true"></div>
      <div class="pm-picture-hero-content">
        <div class="pm-experience-copy">
          <p class="pm-eyebrow">Property Operations</p>
          <h2>${esc(propertyTitle())}</h2>
          <div class="pm-experience-actions">
            ${renderNewTurnRequestButton("Request Turn")}
            <button class="secondary-command-btn pm-compact-btn" type="button" data-pm-view-button="schedule">View Schedule</button>
          </div>
        </div>
        ${renderOverviewFocusPanel(metrics, next)}
      </div>
    </section>
  `;
}

function renderOverviewHeroMedia(video, row = null) {
  const label = video ? titleCase(video.video_phase || "Video") : "Turnover Readiness";
  const mediaTitle = row ? (assignmentUnit(row) ? `Unit ${assignmentUnit(row)}` : assignmentTitle(row)) : "Ready for the next move-in";
  const mediaSubtext = row ? formatWindow(row) : "Cleaning progress, turn requests, and QA media live in one place.";
  const action = row?.id
    ? `<button class="pm-hero-media-action" type="button" data-manager-view-assignment="${esc(row.id)}">View Details</button>`
    : "";
  return `
    <div class="pm-hero-media-card">
      ${video?.signedUrl
        ? `<video class="pm-hero-video" autoplay muted loop playsinline preload="metadata" src="${esc(video.signedUrl)}"></video>`
        : `<div class="pm-hero-visual-fallback" aria-hidden="true">
            <div class="pm-hero-room-card"><span></span><span></span><span></span></div>
            <div class="pm-hero-room-lines"><i></i><i></i><i></i></div>
          </div>`}
      <div class="pm-hero-media-overlay">
        <span>${esc(label)}</span>
        <strong>${esc(mediaTitle)}</strong>
        <small>${esc(mediaSubtext)}</small>
        ${action}
      </div>
    </div>
  `;
}

function renderOverviewFocusPanel(metrics, next) {
  return `
    <aside class="pm-overview-focus-card ${scheduleGuideTargetClass("overview-next")}" aria-label="Current property focus">
      <div class="pm-focus-next">
        <span>Next Turn</span>
        <strong>${esc(next ? (assignmentUnit(next) ? `Unit ${assignmentUnit(next)}` : assignmentTitle(next)) : "No upcoming turn")}</strong>
        <small>${esc(next ? formatWindow(next) : "Scheduled turns will appear here after Turnly confirms them.")}</small>
        ${next?.id ? `<button class="pm-row-action" type="button" data-manager-view-assignment="${esc(next.id)}">View details</button>` : ""}
      </div>
    </aside>
  `;
}

function renderPageHero(view) {
  const metrics = managerMetrics();
  const configs = {
    "turn-requests": {
      eyebrow: "Turn Requests",
      title: "Submit and track unit turns",
      copy: `Send Turnly the unit, move-in date, and access notes for ${propertyTitle()}. ${integer(metrics.open)} open request${metrics.open === 1 ? "" : "s"} are currently active.`,
      action: renderNewTurnRequestButton("New Turn Request")
    },
    schedule: {
      eyebrow: "Scheduling",
      title: "See every confirmed cleaning window",
      copy: `Move through day, week, and month views for ${propertyTitle()}. ${integer(metrics.upcoming)} future turn${metrics.upcoming === 1 ? "" : "s"} are on the schedule.`,
      action: renderNewTurnRequestButton("Request Turn")
    },
    messages: {
      eyebrow: "Messages",
      title: "Keep property updates in one place",
      copy: `Message Turnly operations about ${propertyTitle()}, open requests, completed cleans, and schedule questions.`,
      action: `<button class="new-btn pm-compact-btn" type="button" data-manager-message-compose>${pmIcon("plus")} New Message</button>`
    }
  };
  const config = configs[view];
  if (!config) return "";
  return `
    <section class="panel-card pm-page-image-hero pm-page-image-hero-${esc(view)}">
      <div class="pm-page-image-backdrop" aria-hidden="true"></div>
      <div class="pm-page-image-content">
        <p class="pm-eyebrow">${esc(config.eyebrow)}</p>
        <h2>${esc(config.title)}</h2>
        <p>${esc(config.copy)}</p>
        <div class="pm-page-image-actions">${config.action}</div>
      </div>
    </section>
  `;
}

function renderOverviewJourney(metrics) {
  const steps = [
    ["Requested", metrics.pending, "Turnly review"],
    ["Scheduled", metrics.scheduled, "Dates confirmed"],
    ["Accepted", activeAssignments().filter((row) => scheduleAcceptanceStatus(row).tone === "accepted").length, "Work confirmed"],
    ["In Progress", metrics.inProgress, "Cleaning active"],
    ["Completed", metrics.ready, "Last 30 days"],
    ["Feedback", metrics.issues, "Needs attention"]
  ];
  return `
    <section class="panel-card pm-experience-timeline" aria-label="Turn request progress">
      ${steps.map(([label, value, caption], index) => `
        <article class="${value ? "active" : ""}">
          <span>${esc(index + 1)}</span>
          <strong>${esc(label)}</strong>
          <em>${esc(integer(value))}</em>
          <small>${esc(caption)}</small>
        </article>
      `).join("")}
    </section>
  `;
}

function renderWeeklyPlanPreview() {
  const rows = overviewWeekRows(6);
  const weekStart = startOfWeek(new Date());
  const weekEnd = addDays(weekStart, 6);
  if (!rows.length) return emptyBlock("No turns this week", "New scheduled work will appear here once Turnly confirms it.");
  return `
    <div class="pm-weekly-plan-head">
      <span>${esc(formatShortDate(weekStart))} - ${esc(formatShortDate(weekEnd))}</span>
      <strong>${esc(rows.length)} scheduled</strong>
    </div>
    <div class="pm-weekly-plan-list">
      ${rows.map((row) => `
        <button type="button" data-manager-view-assignment="${esc(row.id || "")}">
          <time>${esc(parseDate(row.start_window || row.recurring_due_at)?.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" }) || "No date")}</time>
          <span>
            <strong>${esc(assignmentUnit(row) ? `Unit ${assignmentUnit(row)}` : assignmentTitle(row))}</strong>
            <small>${esc(scheduleEventTime(row))}</small>
          </span>
          ${statusBadge(requestGroup(row))}
        </button>
      `).join("")}
    </div>
  `;
}

function renderCompletedMediaStrip() {
  const mediaRows = completedAssignments()
    .filter((row) => videosForAssignment(row).some((video) => video.signedUrl))
    .slice(0, 4);
  const rows = mediaRows.length ? mediaRows : recentCompletedAssignments(30).slice(0, 4);
  if (!rows.length) return emptyBlock("No completed media yet", "Before and after clips will appear as completed turns are reviewed.");
  return `
    <div class="pm-completed-media-grid">
      ${rows.map(renderCompletedMediaCard).join("")}
    </div>
  `;
}

function renderCompletedMediaCard(row) {
  const videos = videosForAssignment(row);
  const before = videos.find((video) => normalizeToken(video.video_phase) === "before");
  const after = videos.find((video) => ["after", "final"].includes(normalizeToken(video.video_phase)));
  return `
    <article class="pm-completed-media-card">
      <div class="pm-completed-media-title">
        <div>
          <strong>${esc(assignmentUnit(row) ? `Unit ${assignmentUnit(row)}` : assignmentTitle(row))}</strong>
          <small>${esc([unitBedBath(row), formatShortDate(completionDateValue(row), "Completed")].filter(Boolean).join(" - "))}</small>
        </div>
        ${statusBadge("completed")}
      </div>
      <div class="pm-completed-thumbs">
        ${renderOverviewVideoThumb(before, "Before")}
        ${renderOverviewVideoThumb(after, "After")}
      </div>
      <button class="pm-row-action" type="button" data-manager-view-assignment="${esc(row.id || "")}">View Details</button>
    </article>
  `;
}

function renderOverviewVideoThumb(video, label) {
  return `
    <div class="pm-overview-video-thumb ${video?.signedUrl ? "ready" : ""}">
      ${video?.signedUrl ? `<video muted playsinline preload="metadata" src="${esc(video.signedUrl)}"></video>` : `<span>${esc(label)}</span>`}
      <strong>${esc(label)}</strong>
    </div>
  `;
}

function panel(title, content, options = {}) {
  const className = options.className ? ` ${options.className}` : "";
  const action = options.action || "";
  const eyebrow = options.eyebrow ? `<p class="pm-eyebrow">${esc(options.eyebrow)}</p>` : "";
  return `
    <section class="panel-card pm-panel${className}" ${options.id ? `id="${esc(options.id)}"` : ""}>
      <div class="pm-panel-head">
        <div>${eyebrow}<h2>${esc(title)}</h2>${options.copy ? `<p>${esc(options.copy)}</p>` : ""}</div>
        ${action}
      </div>
      ${content}
    </section>
  `;
}

function renderOverviewView() {
  const metrics = managerMetrics();
  const delta = metrics.completedLastWeek
    ? Math.round(((metrics.completedThisWeek - metrics.completedLastWeek) / metrics.completedLastWeek) * 100)
    : (metrics.completedThisWeek ? 100 : 0);
  return `
    ${renderOverviewHero(metrics, delta)}

    <section class="pm-overview-body">
      <div class="pm-overview-main-stack">
        <section class="pm-stat-grid pm-stat-grid-four ${scheduleGuideTargetClass("overview-metrics")}" aria-label="Property manager overview">
          ${statCard("Units Ready", integer(metrics.ready), "completed last 30 days", "green", "turn-requests")}
          ${statCard("In Progress", integer(metrics.inProgress), "currently active", "violet", "turn-requests")}
          ${statCard("Upcoming", integer(metrics.upcoming), "future scheduled turns", "blue", "schedule")}
          ${statCard("Completed This Week", integer(metrics.completedThisWeek), `${delta >= 0 ? "+" : ""}${delta}% vs last week`, "cyan", "schedule")}
        </section>
        ${panel("Turn Requests", renderOverviewRequests(), {
          className: `pm-overview-requests ${scheduleGuideTargetClass("overview-requests")}`,
          action: renderNewTurnRequestButton()
        })}
      </div>
      <aside class="pm-overview-aside-stack">
        ${panel("This Week's Turn Plan", renderWeeklyPlanPreview(), {
          className: "pm-weekly-plan-panel",
          action: `<button class="pm-link-button" type="button" data-pm-view-button="schedule">Open schedule</button>`
        })}
        ${panel("Completed Turn Media", renderCompletedMediaStrip(), {
          className: "pm-completed-media-panel"
        })}
      </aside>
    </section>
  `;
}

function renderOverviewRequests() {
  const rows = filteredRequests().slice(0, 5);
  return `
    <div class="pm-tabs">
      ${["all", "pending", "open", "in_progress", "ready", "on_hold"].map((key) => `<button type="button" class="${state.filters.requestStatus === key ? "active" : ""}" data-pm-request-status="${key}">${esc(key === "all" ? "All" : titleCase(key))}</button>`).join("")}
    </div>
    ${rows.length ? renderRequestTable(rows, true) : emptyBlock("No turn requests", "New unit turns will appear here once Turnly schedules work.")}
    <div class="pm-panel-footer"><button class="pm-link-button" type="button" data-pm-view-button="turn-requests">View all turn requests</button></div>
  `;
}

function renderTurnRequestsView() {
  const metrics = managerMetrics();
  const rows = filteredRequests();
  return `
    ${renderPageHero("turn-requests")}
    ${renderTurnRequestCallout()}
    ${renderRequestToolbar()}
    <section class="pm-stat-grid pm-stat-grid-five" aria-label="Turn request metrics">
      ${statCard("Total Requests", integer(metrics.totalRequests), "for linked property", "green")}
      ${statCard("Pending", integer(metrics.pending), "awaiting Turnly approval", "yellow")}
      ${statCard("Open", integer(metrics.open), "ready to assign", "yellow")}
      ${statCard("In Progress", integer(metrics.inProgress), "being handled now", "blue")}
      ${statCard("Completed This Week", integer(metrics.completedThisWeek), "closed out", "green")}
    </section>
    <section class="pm-turn-request-workspace">
      ${panel("Turn Requests", rows.length ? renderRequestTable(rows) : emptyBlock("No matching requests", "Try changing the status filter."), { className: `pm-table-panel ${scheduleGuideTargetClass("request-table")}` })}
    </section>
  `;
}

function renderTurnRequestCallout() {
  const linked = hasLinkedProperty();
  return `
    <section class="panel-card pm-action-banner ${linked ? "" : "is-disabled"} ${scheduleGuideTargetClass("request-new")}">
      <div>
        <p class="pm-eyebrow">${linked ? "Submit a Turn" : "Property Link Required"}</p>
        <h2>${linked ? "Request a unit turn" : "Turn requests unlock after your property is linked"}</h2>
        <p>${linked ? `Send Turnly the unit, scheduled move-in date, and access notes for ${propertyTitle()}. Service type is set to ${TURN_REQUEST_SERVICE}.` : propertyLinkPendingMessage()}</p>
      </div>
      <dl>
        <div><dt>Property</dt><dd>${esc(propertyTitle())}</dd></div>
        <div><dt>Units</dt><dd>${esc(integer(state.units.length))}</dd></div>
        <div><dt>Open Requests</dt><dd>${esc(integer(managerMetrics().open))}</dd></div>
      </dl>
      ${renderNewTurnRequestButton("Start Turn Request")}
    </section>
  `;
}

function renderRequestToolbar(placeholder = "Search...", includeNew = false) {
  const sortDirection = state.filters.requestSortDirection === "desc" ? "desc" : "asc";
  return `
    <section class="panel-card pm-toolbar pm-turn-toolbar ${scheduleGuideTargetClass("request-filters")}">
      <div class="pm-status-segment" aria-label="Request status">
        ${["all", "pending", "open", "in_progress", "ready", "on_hold", "completed"].map((key) => `<button type="button" class="${state.filters.requestStatus === key ? "active" : ""}" data-pm-request-status="${esc(key)}">${esc(key === "all" ? "All" : titleCase(key))}</button>`).join("")}
      </div>
      <div class="pm-request-sort" aria-label="Turn request sorting">
        <label>
          Sort by
          <select data-pm-request-sort aria-label="Sort turn requests by">
            ${selectOption("status", "Status", state.filters.requestSort)}
            ${selectOption("date", "Request Date", state.filters.requestSort)}
            ${selectOption("unit", "Unit", state.filters.requestSort)}
            ${selectOption("bed_bath", "Bed / Bath", state.filters.requestSort)}
            ${selectOption("scheduled_date", "Scheduled Date", state.filters.requestSort)}
            ${selectOption("completed_date", "Completed Date", state.filters.requestSort)}
          </select>
        </label>
        <button type="button" data-pm-request-sort-direction="${esc(sortDirection === "asc" ? "desc" : "asc")}" aria-label="Toggle request sort direction">${esc(sortDirection === "asc" ? "Ascending" : "Descending")}</button>
      </div>
      ${includeNew ? renderNewTurnRequestButton("Start Turn Request") : ""}
    </section>
  `;
}

function selectOption(value, label, current) {
  return `<option value="${esc(value)}" ${String(value) === String(current) ? "selected" : ""}>${esc(label)}</option>`;
}

function filteredRequests() {
  const status = state.filters.requestStatus;
  const rows = sortedAssignments(state.assignments, "asc").filter((row) => {
    const group = requestGroup(row);
    const matchesStatus = status === "all" || group === status || assignmentStatus(row) === status;
    const matchesQuery = queryMatches([
      assignmentTitle(row),
      assignmentUnit(row),
      unitBedBath(row),
      assignmentStatus(row),
      row?.service_type
    ]);
    return matchesStatus && matchesQuery;
  });
  return sortRequests(rows);
}

function renderRequestTable(rows, compactMode = false) {
  const showCompletedDates = !compactMode && state.filters.requestStatus === "completed";
  const pageSize = [10, 25].includes(Number(state.requestPageSize)) ? Number(state.requestPageSize) : 10;
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const page = Math.min(Math.max(1, Number(state.requestPage) || 1), totalPages);
  if (!compactMode && page !== state.requestPage) state.requestPage = page;
  const start = compactMode ? 0 : (page - 1) * pageSize;
  const visible = compactMode ? rows : rows.slice(start, start + pageSize);
  const detailGuideTargetId = scheduleGuideTargetClass("request-details") ? visible[0]?.id || "" : "";
  return `
    <div class="pm-table-wrap">
      <table class="pm-table">
        <thead>
          <tr>
            <th>Unit</th>
            <th>Bed / Bath</th>
            ${compactMode ? "" : "<th>Request Type</th>"}
            <th>Status</th>
            ${showCompletedDates ? "<th>Request Date</th>" : ""}
            <th>Scheduled</th>
            ${showCompletedDates ? "<th>Completed Date</th>" : ""}
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${visible.map((row) => `
            <tr class="${row.id === state.selectedAssignmentId ? "active" : ""}">
              <td>${esc(assignmentUnit(row) || "Unit")}</td>
              <td>${esc(unitBedBath(row))}</td>
              ${compactMode ? "" : `<td>${esc(row.service_type || row.assignment_type || "Turn Service")}</td>`}
              <td>${statusBadge(requestGroup(row))}</td>
              ${showCompletedDates ? `<td>${esc(formatDate(requestDateValue(row), "Not recorded"))}</td>` : ""}
              <td>${esc(formatWindow(row))}</td>
              ${showCompletedDates ? `<td>${esc(formatDate(completionDateValue(row), "Not recorded"))}</td>` : ""}
              <td><button class="pm-row-action ${String(row.id || "") === String(detailGuideTargetId) ? "pm-guide-target" : ""}" type="button" data-manager-view-assignment="${esc(row.id || "")}">View Details</button></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
    ${compactMode ? "" : renderRequestPagination(rows.length, page, pageSize, totalPages, visible.length)}
  `;
}

function renderRequestPagination(totalRows, page, pageSize, totalPages, visibleCount) {
  const first = totalRows ? ((page - 1) * pageSize) + 1 : 0;
  const last = totalRows ? first + visibleCount - 1 : 0;
  return `
    <div class="pm-pagination">
      <span>${esc(first)}-${esc(last)} of ${esc(totalRows)}</span>
      <button type="button" data-pm-request-page="${esc(page - 1)}" ${page <= 1 ? "disabled" : ""} aria-label="Previous turn request page">&lt;</button>
      <button type="button" data-pm-request-page="${esc(page + 1)}" ${page >= totalPages ? "disabled" : ""} aria-label="Next turn request page">&gt;</button>
      <select data-pm-request-page-size aria-label="Turn requests per page">
        <option value="10" ${pageSize === 10 ? "selected" : ""}>10 / page</option>
        <option value="25" ${pageSize === 25 ? "selected" : ""}>25 / page</option>
      </select>
    </div>
  `;
}

function selectedAssignment(rows = state.assignments) {
  return rows.find((row) => row.id === state.selectedAssignmentId) || rows[0] || state.assignments[0] || null;
}

function renderAssignmentDetailsModal() {
  if (!state.assignmentDetailsOpen) return "";
  const row = selectedAssignment(state.assignments);
  if (!row) return "";
  return `
    <div class="pm-assignment-detail-modal" role="dialog" aria-modal="true" aria-labelledby="pmAssignmentDetailTitle">
      <button class="pm-assignment-detail-backdrop" type="button" aria-label="Close request details" data-manager-close-assignment-details></button>
      <section class="pm-assignment-detail-panel">
        <header class="pm-assignment-detail-header">
          <div>
            <p class="pm-eyebrow">Request Details</p>
            <h2 id="pmAssignmentDetailTitle">${esc(assignmentTitle(row))}</h2>
          </div>
          <button class="pm-modal-close" type="button" aria-label="Close request details" data-manager-close-assignment-details>${pmIcon("x")}</button>
        </header>
        <div class="pm-assignment-detail-body">
          ${renderAssignmentDetailsCard(row)}
        </div>
      </section>
    </div>
  `;
}

function scheduleStatusKey(value) {
  return String(value || "scheduled").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "scheduled";
}

function scheduleAcceptanceStatus(row) {
  const status = scheduleStatusKey(row?.status);
  if (["cancelled", "canceled", "declined"].includes(status)) return { label: titleCase(status), tone: status };
  if (row?.accepted_at || row?.claimed_at || ["claimed", "in-progress", "completed", "qa-pending"].includes(status)) {
    return { label: "Confirmed", tone: "accepted" };
  }
  if ((row?.start_window || row?.end_window) && !pendingStatuses.has(assignmentStatus(row))) {
    return { label: "Confirmed", tone: "assigned" };
  }
  if (status === "preferred-pending" || pendingStatuses.has(assignmentStatus(row))) return { label: "Pending Confirmation", tone: "pending" };
  return { label: "Pending Confirmation", tone: "not-accepted" };
}

function scheduleEventTime(row) {
  const start = parseDate(row?.start_window || row?.recurring_due_at);
  const end = parseDate(row?.end_window);
  if (!start) return "Time not set";
  const startText = start.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (!end) return startText;
  return `${startText} - ${end.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
}

function assignmentDateWindow(row) {
  const start = parseDate(row?.start_window || row?.recurring_due_at);
  const end = parseDate(row?.end_window);
  if (!start) return "No start time";
  const startText = start.toLocaleString([], { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
  if (!end) return startText;
  const sameDate = sameDay(start, end);
  const endText = end.toLocaleString([], sameDate
    ? { hour: "numeric", minute: "2-digit" }
    : { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
  return `${startText} - ${endText}`;
}

function assignmentFrequencyLabel(row) {
  return titleCase(row?.recurrence_frequency || row?.assignment_type || "one_time");
}

function assignmentUnitMeta(row) {
  const unit = matchingUnit(row);
  const meta = rowMeta(row);
  const feet = unit?.square_feet ?? unit?.sq_ft ?? row?.unit_square_feet ?? meta.unit_square_feet ?? meta.square_feet ?? meta.sq_ft ?? row?.square_feet ?? row?.sq_ft;
  const bedBath = unitBedBath(row);
  return compact([
    bedBath === "Bed/Bath not set" ? "" : bedBath,
    feet ? `${integer(feet)} sq ft` : ""
  ]).join(" - ") || "Unit details";
}

function assignmentAddress(row) {
  const meta = rowMeta(row);
  return row?.address || row?.property_address || meta.address || meta.property_address || propertyAddress() || "No address";
}

function assignmentShortId(row) {
  return row?.id ? `A-${String(row.id).slice(0, 8).toUpperCase()}` : "Assignment";
}

function renderAssignmentDetailsCard(row, emptyTitle = "No request selected") {
  if (!row) return emptyBlock(emptyTitle, "Choose an assignment to see schedule, service notes, and videos.");
  const meta = rowMeta(row);
  const accepted = scheduleAcceptanceStatus(row);
  const title = assignmentTitle(row);
  const videos = videosForAssignment(row);
  const before = videos.find((video) => normalizeToken(video.video_phase) === "before");
  const after = videos.find((video) => ["after", "final"].includes(normalizeToken(video.video_phase)));
  const detailItems = [
    ["Property Name", title, assignmentAddress(row)],
    ["Unit Number", assignmentUnit(row) || "Unit", assignmentUnitMeta(row)],
    ["Schedule", assignmentDateWindow(row), assignmentFrequencyLabel(row)],
    ["Service Type", row.service_type || row.assignment_type || "Turn Service", "Requested service"],
    ["Status", titleCase(row.status || requestGroup(row) || "scheduled"), accepted.label]
  ];
  if (isCompletedAssignment(row)) {
    const completedValue = completionDateValue(row);
    const completedTime = formatShortTime(completedValue, "");
    detailItems.splice(3, 0, ["Completed Date", formatDate(completedValue, "Not recorded"), completedTime ? `Completed at ${completedTime}` : "Completion recorded"]);
  }
  return `
    <section class="schedule-assignment-detail pm-assignment-detail-card">
      <div class="schedule-assignment-hero">
        <div>
          <span>${esc(assignmentShortId(row))}</span>
          <h3>${esc(row.title || title)}</h3>
          <p>${esc([assignmentAddress(row), row.service_type].filter(Boolean).join(" - ") || "Assignment details")}</p>
        </div>
        <div class="schedule-assignment-badges">
          <span class="status-badge status-${esc(scheduleStatusKey(row.status || requestGroup(row)))}">${esc(titleCase(row.status || requestGroup(row) || "scheduled"))}</span>
          <span class="status-badge schedule-acceptance-badge is-${esc(accepted.tone)}">${esc(accepted.label)}</span>
        </div>
      </div>
      <div class="schedule-assignment-detail-grid">
        ${detailItems.map(([label, value, subtext]) => `
          <div>
            <span>${esc(label)}</span>
            <strong>${esc(value)}</strong>
            <small>${esc(subtext)}</small>
          </div>
        `).join("")}
      </div>
      <h3>Requested Services</h3>
      <div class="pm-chip-row">${compact([row.service_type, meta.checklist_name]).slice(0, 5).map((item) => `<span>${esc(item)}</span>`).join("") || "<span>Standard turn</span>"}</div>
      <h3>Before & After Videos</h3>
      <div class="pm-video-pair">
        ${renderVideoSlot(before, "Before Video")}
        ${renderVideoSlot(after, "After Video")}
      </div>
      ${renderCleanFeedbackForm(row)}
    </section>
  `;
}

function renderRequestDetails(row) {
  return renderAssignmentDetailsCard(row);
}

function renderCleanFeedbackForm(row) {
  if (!row?.id) return "";
  const statusClass = state.feedbackMessage ? (state.feedbackError ? "error" : "success") : "";
  return `
    <section class="pm-clean-feedback-panel">
      <div>
        <p class="pm-eyebrow">Clean Feedback / Complaints</p>
        <h3>Tell Turnly what needs attention</h3>
        <p>Use this for missed areas, quality issues, access problems, or anything that should be corrected on this clean.</p>
      </div>
      <form id="managerCleanFeedbackForm" class="manager-message-form pm-clean-feedback-form" data-feedback-assignment-id="${esc(row.id)}">
        <label>
          <span>Feedback Type</span>
          <select name="feedback_type">
            <option value="complaint">Complaint / Needs Attention</option>
            <option value="quality_issue">Quality Issue</option>
            <option value="access_issue">Access Issue</option>
            <option value="compliment">Compliment</option>
            <option value="general">General Feedback</option>
          </select>
        </label>
        <label>
          <span>Feedback</span>
          <textarea name="body" rows="4" placeholder="Describe exactly what happened, where the issue is, and what you want Turnly to review..." required></textarea>
        </label>
        <div class="pm-form-actions">
          <button class="new-btn pm-compact-btn" type="submit" ${state.feedbackSaving ? "disabled" : ""}>Send Feedback</button>
          <small class="${esc(statusClass)}">${esc(state.feedbackMessage)}</small>
        </div>
      </form>
    </section>
  `;
}

function renderScheduleView() {
  ensureScheduleState();
  const metrics = managerMetrics();
  const rows = scheduledRows();
  return `
    ${renderPageHero("schedule")}
    <section class="panel-card pm-toolbar pm-schedule-toolbar">
      <div class="pm-schedule-toolbar-controls">
        ${renderScheduleSnapshotControls()}
        <strong class="pm-week-range">${esc(scheduleRangeLabel())}</strong>
      </div>
      <div class="pm-schedule-view-tabs ${scheduleGuideTargetClass("selector")}" role="group" aria-label="Schedule view">
        ${["day", "week", "month"].map((view) => `<button type="button" class="${state.scheduleView === view ? "active" : ""}" data-pm-schedule-view="${esc(view)}">${esc(titleCase(view))}</button>`).join("")}
      </div>
      ${renderNewTurnRequestButton("Request Turn")}
    </section>
    <section class="pm-stat-grid pm-stat-grid-four" aria-label="Schedule metrics">
      ${statCard("Today", integer(todayAssignments().length), "turns today", "green")}
      ${statCard("This View", integer(rows.length), "scheduled turns", "yellow")}
      ${statCard("Upcoming", integer(metrics.upcoming), "future windows", "blue")}
      ${statCard("In Progress", integer(metrics.inProgress), "currently active", "violet")}
    </section>
    <section class="pm-turn-request-workspace">
      ${panel("Schedule", renderScheduleSurface(rows), { className: "pm-schedule-panel" })}
    </section>
  `;
}

function scheduledRows() {
  ensureScheduleState();
  const selectedDate = localDate(state.selectedScheduleDate);
  if (state.scheduleView === "day") {
    const nextDay = addDays(selectedDate, 1);
    return sortedAssignments(state.assignments.filter((row) => isDateBetween(row.start_window || row.recurring_due_at, selectedDate, nextDay)));
  }
  if (state.scheduleView === "month") {
    const monthStart = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
    const monthEnd = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 1);
    return sortedAssignments(state.assignments.filter((row) => isDateBetween(row.start_window || row.recurring_due_at, monthStart, monthEnd)));
  }
  const weekStart = localDate(state.scheduleWeekStart);
  const weekEnd = addDays(weekStart, 7);
  return sortedAssignments(state.assignments.filter((row) => {
    const rowDate = row.start_window || row.recurring_due_at;
    const matchesWeek = isDateBetween(rowDate, weekStart, weekEnd);
    return matchesWeek;
  }));
}

function renderScheduleSurface(rows) {
  if (state.scheduleView === "day") return renderScheduleDayView(rows);
  if (state.scheduleView === "month") return renderScheduleMonthView(rows);
  return renderScheduleGrid(rows);
}

function renderScheduleDayView(rows) {
  if (!rows.length) return emptyBlock("No turns scheduled", "Select another date or request a new turn.");
  return `
    <div class="pm-day-schedule-grid">
      ${rows.map(renderScheduleEvent).join("")}
    </div>
  `;
}

function renderScheduleMonthView(rows) {
  const selectedDate = localDate(state.selectedScheduleDate);
  const monthStart = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
  const gridStart = startOfWeek(monthStart, true);
  const days = Array.from({ length: 42 }, (_, index) => addDays(gridStart, index));
  const month = selectedDate.getMonth();
  const monthLabel = selectedDate.toLocaleDateString([], { month: "long", year: "numeric" });
  return `
    <div class="pm-month-view-heading">
      <span>Monthly Schedule</span>
      <strong>${esc(monthLabel)}</strong>
    </div>
    <div class="pm-month-calendar">
      ${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => `<strong>${esc(day)}</strong>`).join("")}
      ${days.map((day) => {
        const dayValue = dateInputValue(day);
        const allDayRows = rows.filter((row) => sameDay(row.start_window || row.recurring_due_at, day));
        const visibleRows = allDayRows.slice(0, 3);
        return `
          <article class="pm-month-day ${day.getMonth() === month ? "" : "is-muted"} ${sameDay(day, new Date()) ? "is-today" : ""}" data-pm-schedule-select-date="${esc(dayValue)}" aria-label="View ${esc(day.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric", year: "numeric" }))}">
            <button class="pm-month-day-number" type="button" data-pm-schedule-select-date="${esc(dayValue)}">${esc(day.getDate())}</button>
            <div class="pm-month-day-events">
              ${visibleRows.map(renderScheduleEvent).join("")}
              ${allDayRows.length > visibleRows.length ? `<button class="pm-month-more" type="button" data-pm-schedule-select-date="${esc(dayValue)}">+${esc(allDayRows.length - visibleRows.length)} more</button>` : ""}
            </div>
          </article>
        `;
      }).join("")}
    </div>
  `;
}

function todayAssignments() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return state.assignments.filter((row) => isDateBetween(row.start_window || row.recurring_due_at, start, end));
}

function renderScheduleGrid(rows) {
  ensureScheduleState();
  const weekStart = localDate(state.scheduleWeekStart);
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(weekStart);
    date.setDate(date.getDate() + index);
    return date;
  });
  const times = scheduleTimes(rows);
  return `
    <div class="pm-calendar-grid" style="--pm-time-count:${times.length}">
      <div class="pm-calendar-corner">Time</div>
      ${days.map((day) => `<div class="pm-calendar-day">${esc(day.toLocaleDateString([], { weekday: "short" }))}<small>${esc(day.toLocaleDateString([], { month: "short", day: "numeric" }))}</small></div>`).join("")}
      ${times.map((time) => `
        <div class="pm-calendar-time">${esc(time)}</div>
        ${days.map((day) => {
          const events = rows.filter((row) => sameDay(row.start_window || row.recurring_due_at, day) && formatShortTime(row.start_window || row.recurring_due_at) === time);
          return `<div class="pm-calendar-cell">${events.map(renderScheduleEvent).join("")}</div>`;
        }).join("")}
      `).join("")}
    </div>
  `;
}

function scheduleTimes(rows) {
  const times = [...new Set(rows.map((row) => formatShortTime(row.start_window || row.recurring_due_at, "")).filter(Boolean))].sort((a, b) => {
    const dateA = parseDate(`2020-01-01 ${a}`);
    const dateB = parseDate(`2020-01-01 ${b}`);
    return dateValue(dateA, 0) - dateValue(dateB, 0);
  });
  return (times.length ? times : ["9:00 AM", "11:00 AM", "1:00 PM", "2:30 PM", "4:00 PM"]).slice(0, 8);
}

function sameDay(value, day) {
  const date = parseDate(value);
  return date && date.getFullYear() === day.getFullYear() && date.getMonth() === day.getMonth() && date.getDate() === day.getDate();
}

function renderScheduleEvent(row) {
  const accepted = scheduleAcceptanceStatus(row);
  const title = assignmentTitle(row);
  const unit = assignmentUnit(row);
  const subtitle = [unit ? `Unit ${unit}` : "", row.service_type].filter(Boolean).join(" - ");
  return `
    <article class="schedule-event-card pm-schedule-event-card ${esc(requestGroup(row))} ${scheduleGuideTargetClass("assignment", row)}" data-manager-view-assignment="${esc(row.id || "")}" role="button" tabindex="0" aria-label="View details for ${esc(title)}.">
      <div class="schedule-event-time">${esc(scheduleEventTime(row))}</div>
      <strong>${esc(title)}</strong>
      <p>${esc(subtitle || row.title || "Assignment")}</p>
      <small>${esc(unitBedBath(row))}</small>
      <div class="schedule-event-badges">
        <span class="status-badge status-${esc(scheduleStatusKey(row.status || requestGroup(row)))}">${esc(titleCase(row.status || requestGroup(row) || "scheduled"))}</span>
        <span class="status-badge schedule-acceptance-badge is-${esc(accepted.tone)}">${esc(accepted.label)}</span>
      </div>
    </article>
  `;
}

function renderScheduleDetails(row) {
  return renderAssignmentDetailsCard(row, "No scheduled turn selected");
}

function renderScheduleSnapshot() {
  ensureScheduleState();
  const weekStart = localDate(state.scheduleWeekStart);
  const selectedDate = localDate(state.selectedScheduleDate);
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(weekStart);
    date.setDate(date.getDate() + index);
    return date;
  });
  const today = new Date();
  const selectedRows = state.assignments
    .filter((row) => sameDay(row.start_window || row.recurring_due_at, selectedDate))
    .filter((row) => queryMatches([assignmentUnit(row), assignmentTitle(row), row.service_type]))
    .sort((a, b) => dateValue(a.start_window || a.recurring_due_at, 0) - dateValue(b.start_window || b.recurring_due_at, 0))
    .slice(0, 4);
  return `
    <div class="pm-week-strip">
      ${days.map((day) => {
        const value = dateInputValue(day);
        return `
          <button type="button" class="${sameDay(day, selectedDate) ? "active" : ""} ${sameDay(day, today) ? "today" : ""}" data-pm-schedule-select-date="${esc(value)}" aria-label="${esc(day.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" }))}">
            <small>${esc(day.toLocaleDateString([], { weekday: "short" }))}</small>
            <strong>${esc(day.getDate())}</strong>
          </button>
        `;
      }).join("")}
    </div>
    <p class="pm-snapshot-label">${esc(selectedDate.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" }))}<span>${selectedRows.length} scheduled</span></p>
    <div class="pm-snapshot-list">
      ${selectedRows.length ? selectedRows.map((row) => `
        <button type="button" data-manager-view-assignment="${esc(row.id || "")}">
          <time>${esc(formatShortTime(row.start_window || row.recurring_due_at))}</time>
          <span>${esc(assignmentUnit(row) ? `Unit ${assignmentUnit(row)}` : assignmentTitle(row))}</span>
          ${statusBadge(requestGroup(row))}
        </button>
      `).join("") : emptyBlock("No turns scheduled", "Select another date or use the arrows to move through the schedule.")}
    </div>
    <div class="pm-panel-footer"><button class="pm-link-button" type="button" data-pm-view-button="schedule">View full schedule</button></div>
  `;
}

function renderScheduleSnapshotControls() {
  ensureScheduleState();
  return `
    <div class="pm-schedule-controls ${scheduleGuideTargetClass("date-controls")}" aria-label="Schedule date controls">
      <button type="button" aria-label="Previous schedule window" data-pm-schedule-shift="-1"></button>
      <input type="date" value="${esc(state.selectedScheduleDate)}" aria-label="Select schedule date" data-pm-schedule-date />
      <button type="button" aria-label="Next schedule window" data-pm-schedule-shift="1"></button>
    </div>
  `;
}

function videosForAssignment(row) {
  const id = String(row?.id || "");
  const meta = rowMeta(row);
  const qaJobId = meta.qa_job_id || row?.qa_job_id || "";
  const unit = matchingUnit(row);
  const unitValues = new Set([...unitLookupValues(row), ...unitLookupValues(unit)]);
  return state.videos.filter((video) => {
    const videoMeta = rowMeta(video);
    const videoQaJobId = video.qa_job_id || video.job_id || videoMeta.qa_job_id || videoMeta.job_id || "";
    return String(video.assignment_id || "") === id ||
      String(video.assignment_block_id || "") === id ||
      String(videoMeta.assignment_id || "") === id ||
      String(videoMeta.assignment_block_id || "") === id ||
      (qaJobId && String(videoQaJobId) === String(qaJobId)) ||
      (unitValues.size && unitLookupValues(video).some((value) => unitValues.has(value)));
  });
}

function renderVideoSlot(video, label) {
  if (!video) {
    return `<div class="pm-video-slot"><span>${esc(label)}</span><strong>Not uploaded yet</strong></div>`;
  }
  return `
    <div class="pm-video-slot ready">
      <span>${esc(label)}</span>
      ${video.signedUrl ? `<video controls preload="metadata" src="${esc(video.signedUrl)}"></video>` : `<strong>${esc(video.file_name || video.label || "Video uploaded")}</strong>`}
      ${video.signedUrl ? `<a href="${esc(video.signedUrl)}" target="_blank" rel="noreferrer">Open Video</a>` : `<small>Preview unavailable</small>`}
    </div>
  `;
}

function renderMessagesView() {
  return `
    ${renderPageHero("messages")}
    <section class="panel-card pm-messages-workspace">
      <aside class="pm-message-sidebar ${scheduleGuideTargetClass("message-threads")}" aria-label="Open conversations">
        <div class="pm-message-sidebar-head">
          <div>
            <h2>Open Conversations</h2>
            <p>${esc(integer(state.threads.length))} active</p>
          </div>
          <button class="new-btn pm-message-compose-icon ${scheduleGuideTargetClass("message-compose")}" type="button" data-manager-message-compose aria-label="New message">${pmIcon("plus")}</button>
        </div>
        ${renderManagerThreadList()}
      </aside>
      <section class="pm-message-display ${scheduleGuideTargetClass("message-display")}" aria-label="Message display">
        ${state.requestOpen ? renderNewMessageForm() : renderManagerConversation()}
      </section>
    </section>
  `;
}

function filteredThreads() {
  return state.threads;
}

function renderNewMessageForm() {
  return `
    <div class="pm-message-compose-panel">
      <div class="pm-panel-head">
        <div><h2>New Message</h2><p>Send a note to Turnly operations.</p></div>
        <button class="secondary-command-btn pm-compact-btn" type="button" data-manager-request-close>Close</button>
      </div>
      <div id="managerMessageStatus" class="manager-message-status ${state.error ? "error" : ""}" aria-live="polite">${esc(state.message || "")}</div>
      <form id="managerNewThreadForm" class="manager-message-form pm-inline-form">
        <label><span>Subject</span><input name="subject" placeholder="Question about service or property notes" /></label>
        <label><span>Message</span><textarea name="body" rows="4" placeholder="Type your message..." required></textarea></label>
        <button class="new-btn pm-compact-btn" type="submit" ${state.sending ? "disabled" : ""}>Send Message</button>
      </form>
    </div>
  `;
}

function renderConversationDetails() {
  const thread = selectedManagerThread();
  if (!thread) return emptyBlock("No conversation selected", "Choose a message thread to see participants and linked details.");
  const participants = managerThreadParticipants(thread.id);
  return `
    <div class="pm-detail-list">
      <h3>Participants</h3>
      <div class="pm-participant-list">
        ${participants.map((participant) => `<span>${esc(initialsFromName(participant.display_name || participant.email || "T"))}<small>${esc(participant.display_name || participant.email || "Turnly")}</small></span>`).join("")}
      </div>
      <h3>Linked Unit</h3>
      <p>${esc(thread.related_title || propertyTitle())}</p>
      <h3>Attachments</h3>
      <div class="pm-attachment-box">No attachments</div>
      <h3>Activity</h3>
      ${renderThreadActivity(thread)}
    </div>
  `;
}

function renderThreadActivity(thread) {
  const messages = state.messages.filter((message) => message.thread_id === thread.id).slice(-5);
  if (!messages.length) return `<div class="pm-activity-list"><div><span></span><p><strong>Thread opened</strong><small>${esc(formatManagerMessageTime(thread.created_at))}</small></p></div></div>`;
  return `<div class="pm-activity-list">${messages.map((message) => `<div><span></span><p><strong>${esc(message.sender_name || "User")}</strong><small>${esc(formatManagerMessageTime(message.created_at))}</small></p></div>`).join("")}</div>`;
}

function renderRequestForm() {
  if (!state.requestOpen || state.view === "messages") return "";
  if (!hasLinkedProperty()) return "";
  return `
    <section class="panel-card pm-request-form-panel">
      <div class="pm-panel-head">
        <div><h2>New Turn Request</h2><p>Send Turnly the unit, scheduled move-in date, and access notes for ${esc(propertyTitle())}.</p></div>
        <button class="secondary-command-btn pm-compact-btn" type="button" data-manager-request-close>Close</button>
      </div>
      <p class="pm-form-note">Turn requests go straight to Turnly operations. Service type is fixed to ${esc(TURN_REQUEST_SERVICE)}, and move-in time is automatically set to ${esc(MOVE_IN_TIME_LABEL)}.</p>
      <form id="managerTurnRequestForm" class="manager-message-form pm-request-form">
        <label>
          <span>Unit</span>
          <input name="unit" type="search" list="managerUnitOptions" placeholder="Start typing a unit..." autocomplete="off" required />
          <datalist id="managerUnitOptions">
            ${state.units.map((unit) => {
              const name = unit.unit_name || unit.name || unit.unit_number || "";
              return name ? `<option value="${esc(name)}"></option>` : "";
            }).join("")}
          </datalist>
        </label>
        <label>
          <span>Service Type</span>
          <select name="service" required>
            <option value="${esc(TURN_REQUEST_SERVICE)}" selected>${esc(TURN_REQUEST_SERVICE)}</option>
          </select>
        </label>
        <label>
          <span>Scheduled Move-In Date</span>
          <input name="move_in_date" type="date" min="${esc(dateInputValue(new Date()))}" data-manager-move-in-date required />
        </label>
        <label>
          <span>Move-In Time</span>
          <input name="move_in_time" type="text" value="${esc(MOVE_IN_TIME_LABEL)}" readonly aria-readonly="true" />
        </label>
        <label>
          <span>Priority</span>
          <select name="priority">
            <option>Normal</option>
            <option>High</option>
            <option>Urgent</option>
          </select>
        </label>
        <label class="span-all">
          <span>Access / Turn Notes</span>
          <textarea name="body" rows="4" placeholder="Move-out date, lockbox or access notes, special rooms, supply concerns, or anything Turnly should know..." required></textarea>
        </label>
        <div class="pm-form-actions span-all">
          <button class="new-btn pm-compact-btn" type="submit" ${state.sending ? "disabled" : ""}>Submit Turn Request</button>
          <small>Turnly will review the request and confirm schedule details in Messages.</small>
        </div>
      </form>
    </section>
  `;
}

function renderRecentActivity() {
  const assignmentRows = sortedAssignments(state.assignments, "desc").slice(0, 5).map((row) => ({
    title: `${assignmentUnit(row) ? `Unit ${assignmentUnit(row)} - ` : ""}${titleCase(requestGroup(row))}`,
    meta: formatWindow(row)
  }));
  if (!assignmentRows.length) return emptyBlock("No recent activity", "Updates will appear as Turnly schedules and completes work.");
  return `<div class="pm-activity-list">${assignmentRows.map((item) => `<div><span></span><p><strong>${esc(item.title)}</strong><small>${esc(item.meta)}</small></p></div>`).join("")}</div>`;
}

function renderUpdatesPanel(title) {
  return panel(title, renderThreadSummary(3), { className: "pm-compact-panel", action: `<button class="pm-link-button" type="button" data-pm-view-button="messages">View all</button>` });
}

function renderThreadSummary(limit = 3) {
  const rows = state.threads.slice(0, limit);
  if (!rows.length) return emptyBlock("No updates yet", "Messages from Turnly will appear here.");
  return `
    <div class="pm-thread-summary">
      ${rows.map((thread) => `
        <button type="button" data-manager-thread-id="${esc(thread.id)}" data-pm-view-button="messages">
          <span>${esc(initialsFromName(managerParticipantLine(thread.id)))}</span>
          <p><strong>${esc(thread.subject || "Message")}</strong><small>${esc(thread.last_message_preview || managerParticipantLine(thread.id))}</small></p>
          <time>${esc(formatManagerMessageTime(thread.last_message_at || thread.created_at))}</time>
        </button>
      `).join("")}
    </div>
  `;
}

function statusBadge(value) {
  const key = normalizeToken(value || "scheduled");
  return `<span class="pm-status-badge is-${esc(key)}">${esc(titleCase(value || "scheduled"))}</span>`;
}

function emptyBlock(title, body) {
  return `
    <div class="manager-message-empty pm-empty">
      <strong>${esc(title)}</strong>
      <span>${esc(body)}</span>
    </div>
  `;
}

async function loadManagerMessages() {
  if (!supabase || !state.user?.id) return;
  const { data: ownParticipants, error: participantError } = await supabase
    .from("message_thread_participants")
    .select("thread_id,last_read_at,is_archived")
    .eq("user_id", state.user.id)
    .eq("is_archived", false);

  if (participantError) {
    state.threads = [];
    state.participants = [];
    state.messages = [];
    setManagerMessageStatus(`Unable to load messages: ${participantError.message}`, true);
    return;
  }

  const threadIds = [...new Set((ownParticipants || []).map((row) => row.thread_id).filter(Boolean))];
  if (!threadIds.length) {
    state.threads = [];
    state.participants = [];
    state.messages = [];
    state.selectedThreadId = "";
    setManagerMessageStatus("No conversations yet.");
    return;
  }

  const [threadsResult, participantsResult] = await Promise.all([
    supabase.from("message_threads").select("*").in("id", threadIds).order("last_message_at", { ascending: false }),
    supabase.from("message_thread_participants").select("*").in("thread_id", threadIds).order("display_name", { ascending: true })
  ]);

  if (threadsResult.error || participantsResult.error) {
    setManagerMessageStatus(`Unable to load messages: ${(threadsResult.error || participantsResult.error).message}`, true);
    return;
  }

  state.threads = threadsResult.data || [];
  state.participants = participantsResult.data || [];
  if (!state.threads.some((thread) => thread.id === state.selectedThreadId)) {
    state.selectedThreadId = state.threads[0]?.id || "";
  }
  await loadManagerThreadMessages(state.selectedThreadId);
  setManagerMessageStatus(`${state.threads.length} conversation${state.threads.length === 1 ? "" : "s"} loaded.`);
}

async function loadManagerThreadMessages(threadId) {
  if (!supabase || !threadId) {
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
    state.messages = [];
    setManagerMessageStatus(`Unable to load conversation: ${error.message}`, true);
    return;
  }

  state.messages = data || [];
}

function renderManagerThreadList() {
  const rows = filteredThreads();
  if (!rows.length) return `<div class="manager-message-empty">No conversations yet.</div>`;
  return `
    <div class="manager-message-thread-list">
      ${rows.map((thread) => `
        <button class="manager-message-thread ${thread.id === state.selectedThreadId ? "active" : ""} ${managerThreadUnread(thread) ? "unread" : ""}" type="button" data-manager-thread-id="${esc(thread.id)}">
          <div class="pm-thread-meta">
            <strong>${esc(managerParticipantLine(thread.id))}</strong>
            <time datetime="${esc(thread.last_message_at || thread.created_at || "")}">${esc(formatManagerMessageTime(thread.last_message_at || thread.created_at))}</time>
          </div>
          <p>${esc(thread.last_message_preview || "No messages yet.")}</p>
        </button>
      `).join("")}
    </div>
  `;
}

function renderManagerConversation() {
  const thread = selectedManagerThread();
  if (!thread) return `<div class="manager-message-empty">Select a conversation or send Turnly a new message.</div>`;
  return `
    <div id="managerMessageStatus" class="manager-message-status ${state.error ? "error" : ""}" aria-live="polite">${esc(state.message || "")}</div>
    <div class="manager-message-conversation-head">
      <div>
        <span>Message Thread</span>
        <h3>${esc(thread.subject || "Message")}</h3>
        <small>${esc(managerParticipantLine(thread.id))}</small>
      </div>
    </div>
    <div class="manager-message-bubbles">
      ${state.messages.length ? state.messages.map(renderManagerBubble).join("") : `<div class="manager-message-empty">No replies yet.</div>`}
    </div>
    <form id="managerReplyForm" class="manager-message-form compact ${scheduleGuideTargetClass("message-reply")}">
      <label>
        <span>Reply</span>
        <textarea name="body" rows="3" placeholder="Type your reply..." required></textarea>
      </label>
      <button class="new-btn pm-compact-btn" type="submit" ${state.sending ? "disabled" : ""}>Send Reply</button>
    </form>
  `;
}

function renderManagerBubble(message) {
  const mine = message.sender_id === state.user?.id;
  return `
    <article class="manager-message-bubble ${mine ? "mine" : ""}">
      <div>
        <strong>${esc(message.sender_name || "User")}</strong>
        <small>${esc(formatManagerMessageTime(message.created_at))}</small>
      </div>
      <p>${esc(message.body || "")}</p>
    </article>
  `;
}

async function createTurnRequest(form) {
  if (!hasLinkedProperty()) {
    state.dataMessage = propertyLinkPendingMessage();
    state.dataError = false;
    renderManagerPortal();
    return;
  }

  const unit = form.elements.unit?.value?.trim() || "";
  const service = TURN_REQUEST_SERVICE;
  const priority = form.elements.priority?.value?.trim() || "Normal";
  const moveInDateValue = form.elements.move_in_date?.value || "";
  const moveInDate = scheduledMoveInDate(moveInDateValue);
  const notes = form.elements.body?.value?.trim() || "";
  if (!moveInDate) {
    setManagerMessageStatus("Choose a scheduled move-in date.", true);
    renderManagerPortal();
    return;
  }

  state.sending = true;
  setManagerMessageStatus("Submitting turn request...");
  renderManagerPortal();

  let assignmentId = "";
  let requestError = null;
  if (state.adminPreview) {
    const result = await createAdminPreviewTurnRequest({
      unit,
      service,
      priority,
      moveInDateValue,
      moveInDate,
      notes
    });
    assignmentId = result.assignmentId || "";
    requestError = result.error || null;
  } else {
    const result = await supabase.rpc("create_property_manager_turn_request", {
      request_payload: {
        unit,
        service_type: service,
        priority,
        move_in_date: moveInDateValue,
        move_in_time: MOVE_IN_TIME_LABEL,
        notes
      }
    });
    assignmentId = result.data || "";
    requestError = result.error || null;
  }

  if (requestError) {
    state.sending = false;
    setManagerMessageStatus(`Unable to submit turn request: ${requestError.message}`, true);
    renderManagerPortal();
    return;
  }

  const body = [
    `Property: ${propertyTitle()}`,
    unit ? `Unit: ${unit}` : "",
    `Service: ${service}`,
    `Priority: ${priority}`,
    `Scheduled move-in date: ${formatMoveInDate(moveInDateValue)}`,
    `Move-in time: ${MOVE_IN_TIME_LABEL}`,
    moveInDate ? `Scheduled move-in timestamp: ${moveInDate.toLocaleString()}` : "",
    assignmentId ? `Assignment request ID: ${assignmentId}` : "",
    "",
    notes
  ].filter((line) => line !== "").join("\n");

  await createManagerMessageThread(form, {
    subject: `${TURN_REQUEST_SERVICE} request - ${unit || propertyTitle()}`,
    topic: "Unit cleaning request",
    body,
    relatedType: "assignment",
    relatedId: assignmentId || state.property?.id || "",
    relatedTitle: `${TURN_REQUEST_SERVICE} request - ${unit || propertyTitle()}`
  });

  if (!state.error) {
    state.selectedAssignmentId = assignmentId || state.selectedAssignmentId;
    state.requestOpen = false;
    state.dataMessage = "Turn request submitted as pending for Turnly approval.";
    state.dataError = false;
    await refreshManagerPortal();
    renderManagerPortal();
  }
}

async function submitCleanFeedback(form) {
  if (!supabase || state.feedbackSaving) return;
  const assignmentId = form.dataset.feedbackAssignmentId || state.selectedAssignmentId || "";
  const row = state.assignments.find((assignment) => String(assignment.id || "") === String(assignmentId)) || null;
  const feedbackType = form.elements.feedback_type?.value || "complaint";
  const body = form.elements.body?.value?.trim() || "";
  if (!assignmentId || !row) {
    state.feedbackMessage = "Select an assignment before sending feedback.";
    state.feedbackError = true;
    renderManagerPortal();
    return;
  }
  if (!body) {
    state.feedbackMessage = "Add the feedback details before sending.";
    state.feedbackError = true;
    renderManagerPortal();
    return;
  }

  state.feedbackSaving = true;
  state.feedbackMessage = "Sending feedback to Turnly...";
  state.feedbackError = false;
  renderManagerPortal();

  const feedbackPayload = {
    assignment_id: assignmentId,
    portal_property_id: state.property?.id || row.portal_property_id || rowMeta(row).portal_property_id || null,
    property_name: assignmentTitle(row) || propertyTitle(),
    unit_number: assignmentUnit(row) || "",
    feedback_type: feedbackType,
    message: body
  };

  let result = await supabase.rpc("create_property_manager_clean_feedback", {
    feedback_payload: feedbackPayload
  });

  if (result.error && /function|schema cache|create_property_manager_clean_feedback/i.test(result.error.message || "")) {
    result = await supabase
      .from("property_manager_clean_feedback")
      .insert({
        assignment_id: feedbackPayload.assignment_id,
        portal_property_id: feedbackPayload.portal_property_id,
        property_name: feedbackPayload.property_name,
        unit_number: feedbackPayload.unit_number,
        feedback_type: feedbackPayload.feedback_type,
        message: feedbackPayload.message,
        status: "open",
        created_by: state.user?.id || null
      })
      .select("id")
      .maybeSingle();
  }

  let sentThroughMessages = false;
  if (result.error) {
    const messageBody = [
      `Feedback type: ${titleCase(feedbackType)}`,
      `Property: ${feedbackPayload.property_name}`,
      feedbackPayload.unit_number ? `Unit: ${feedbackPayload.unit_number}` : "",
      `Assignment ID: ${feedbackPayload.assignment_id}`,
      "",
      feedbackPayload.message
    ].filter((line) => line !== "").join("\n");

    const fallback = await supabase.rpc("create_message_thread_v2", {
      message_payload: {
        recipient_ids: [],
        subject: `Clean feedback - ${feedbackPayload.unit_number || feedbackPayload.property_name}`,
        body: `[Clean Feedback / Complaints]\n\n${messageBody}`,
        related_type: "assignment",
        related_id: feedbackPayload.assignment_id,
        related_title: `Clean feedback - ${feedbackPayload.unit_number || feedbackPayload.property_name}`
      }
    });

    result = fallback;
    sentThroughMessages = !fallback.error;
  }

  state.feedbackSaving = false;
  if (result.error) {
    state.feedbackMessage = `Unable to send feedback: ${result.error.message}`;
    state.feedbackError = true;
    renderManagerPortal();
    return;
  }

  state.feedbackMessage = sentThroughMessages
    ? "Feedback sent to Turnly as a message. Thank you."
    : "Feedback sent to Turnly. Thank you.";
  state.feedbackError = false;
  if (sentThroughMessages) await loadManagerMessages();
  renderManagerPortal();
}

async function createAdminPreviewTurnRequest({ unit, service, priority, moveInDateValue, moveInDate, notes }) {
  const unitRecord = unit ? matchingUnit({ unit_name: unit, unit_number: unit }) : null;
  const start = moveInDate || scheduledMoveInDate(moveInDateValue);
  const end = start ? new Date(start.getTime() + 2 * 60 * 60 * 1000) : null;
  const propertyId = state.profile?.property_manager_property_id || state.property?.id || null;
  const propertyName = propertyTitle();
  const requesterName = getName(state.user, state.profile);
  const requesterEmail = state.profile?.email || state.user?.email || "";
  if (!propertyId) {
    return { assignmentId: "", error: new Error("Select a linked portal property before submitting a preview turn request.") };
  }

  const metadata = {
    source: "property_manager_turn_request",
    admin_preview_source: true,
    admin_approval_status: "pending",
    requested_by: state.user?.id || "",
    requested_by_name: requesterName,
    requested_by_email: requesterEmail,
    requested_at: new Date().toISOString(),
    portal_property_id: propertyId,
    property_name: propertyName,
    unit_id: unitRecord?.id || null,
    unit_name: unit || null,
    unit_number: unit || null,
    unit_square_feet: unitRecord?.square_feet ?? unitRecord?.sq_ft ?? null,
    unit_customer_price: unitRecord?.customer_price ?? null,
    unit_contractor_pay: unitRecord?.contractor_pay ?? null,
    move_in_date: moveInDateValue,
    move_in_time: MOVE_IN_TIME_LABEL,
    property_manager_notes: notes || "",
    admin_only_editable: ["start_window", "end_window"]
  };

  const payload = {
    title: `${service}${unit ? ` - Unit ${unit}` : ""}`,
    property_name: propertyName,
    address: propertyAddress(),
    service_type: service,
    pay_amount: Number(unitRecord?.contractor_pay || 0),
    unit_id: unitRecord?.id || null,
    unit_number: unit || "",
    unit_name: unit || "",
    scope: "Property manager submitted unit cleaning request.",
    supplies_notes: "",
    special_instructions: notes || "",
    status: "pending",
    priority: normalizeToken(priority || "normal"),
    start_window: start ? start.toISOString() : null,
    end_window: end ? end.toISOString() : null,
    assignment_type: "one_time",
    recurrence_frequency: "one_time",
    recurrence_interval: 1,
    auto_renewal: false,
    visibility: "pending",
    created_by: state.user?.id || null,
    portal_property_id: propertyId,
    recurring_portal_property_id: propertyId,
    metadata
  };

  const { data, error } = await supabase
    .from("assignment_blocks")
    .insert(payload)
    .select("id")
    .maybeSingle();

  if (error || !data?.id) return { assignmentId: "", error: error || new Error("Turn request was created without an assignment id.") };

  const linkPayload = {
    portal_property_id: propertyId,
    assignment_id: data.id,
    link_type: "primary",
    source: "property_manager_turn_request",
    metadata: {
      assignment_status: "pending",
      assignment_start_window: start ? start.toISOString() : null,
      requested_by: state.user?.id || ""
    }
  };

  const { error: linkError } = await supabase
    .from("property_assignment_links")
    .upsert(linkPayload, { onConflict: "portal_property_id,assignment_id,link_type" });

  return { assignmentId: data.id, error: linkError || null };
}

async function createManagerMessageThread(form, options = {}) {
  const body = options.body || form.elements.body?.value?.trim() || "";
  const topic = options.topic || form.elements.topic?.value?.trim() || "";
  const subject = options.subject || form.elements.subject?.value?.trim() || topic || "Message";
  if (!body) return;

  state.sending = true;
  setManagerMessageStatus("Sending message...");
  renderManagerPortal();

  const { data, error } = await supabase.rpc("create_message_thread_v2", {
    message_payload: {
      recipient_ids: [],
      subject,
      body: topic ? `[${topic}]\n\n${body}` : body,
      related_type: options.relatedType || "property",
      related_id: options.relatedId || state.property?.id || "",
      related_title: options.relatedTitle || propertyTitle()
    }
  });

  state.sending = false;
  if (error) {
    setManagerMessageStatus(`Unable to send message: ${error.message}`, true);
    renderManagerPortal();
    return;
  }

  form.reset();
  state.selectedThreadId = data || state.selectedThreadId;
  await loadManagerMessages();
  renderManagerPortal();
}

async function sendManagerReply(form) {
  const thread = selectedManagerThread();
  const body = form.elements.body?.value?.trim() || "";
  if (!thread || !body) return;

  state.sending = true;
  setManagerMessageStatus("Sending reply...");
  renderManagerPortal();

  const { error } = await supabase.rpc("send_message_reply_v2", {
    message_payload: {
      thread_id: thread.id,
      body
    }
  });

  state.sending = false;
  if (error) {
    setManagerMessageStatus(`Unable to send reply: ${error.message}`, true);
    renderManagerPortal();
    return;
  }

  form.reset();
  await loadManagerMessages();
  renderManagerPortal();
}

async function markManagerThreadRead(threadId) {
  if (!supabase || !threadId) return;
  const { error } = await supabase.rpc("mark_message_thread_read", { target_thread_id: threadId });
  if (error) {
    await supabase
      .from("message_thread_participants")
      .update({ last_read_at: new Date().toISOString() })
      .eq("thread_id", threadId)
      .eq("user_id", state.user?.id || "");
  }
}

function selectedManagerThread() {
  return state.threads.find((thread) => thread.id === state.selectedThreadId) || null;
}

function managerThreadParticipants(threadId) {
  return state.participants.filter((participant) => participant.thread_id === threadId);
}

function managerParticipantLine(threadId) {
  const names = managerThreadParticipants(threadId)
    .filter((participant) => participant.user_id !== state.user?.id)
    .map((participant) => participant.display_name || participant.email || "Turnly")
    .filter(Boolean);
  return names.length ? names.join(", ") : "Turnly Operations";
}

function managerThreadUnread(thread) {
  const own = managerThreadParticipants(thread.id).find((participant) => participant.user_id === state.user?.id);
  if (!own || !thread.last_message_at) return false;
  if (!own.last_read_at) return true;
  return new Date(thread.last_message_at).getTime() > new Date(own.last_read_at).getTime();
}

function notificationClearStorageKey() {
  return `${PROPERTY_MANAGER_NOTIFICATION_CLEAR_PREFIX}:${state.user?.id || "browser"}`;
}

function readNotificationClearedAt() {
  try {
    const value = Number(window.localStorage?.getItem(notificationClearStorageKey()) || 0);
    return Number.isFinite(value) ? value : 0;
  } catch {
    return state.notificationClearedAt || 0;
  }
}

function writeNotificationClearedAt(value = Date.now()) {
  state.notificationClearedAt = Number(value) || Date.now();
  try {
    window.localStorage?.setItem(notificationClearStorageKey(), String(state.notificationClearedAt));
  } catch {
    // The current-page badge can still be cleared when storage is unavailable.
  }
}

function managerNotificationUnreadCount() {
  const clearedAt = Math.max(Number(state.notificationClearedAt) || 0, readNotificationClearedAt());
  state.notificationClearedAt = clearedAt;
  return state.threads.filter((thread) => {
    if (!managerThreadUnread(thread)) return false;
    return dateValue(thread.last_message_at || thread.created_at, 0) > clearedAt;
  }).length;
}

function formatManagerMessageTime(value) {
  if (!value) return "No date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No date";
  return date.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function setManagerMessageStatus(message, error = false) {
  state.message = message || "";
  state.error = Boolean(error);
  const target = document.getElementById("managerMessageStatus");
  if (!target) return;
  target.textContent = state.message;
  target.classList.toggle("error", state.error);
}

function setActiveNav() {
  document.querySelectorAll(".command-nav .nav-link").forEach((link) => {
    link.classList.toggle("active", link.dataset.pmView === state.view);
  });
}

document.addEventListener("click", async (event) => {
  const moveInDateInput = event.target.closest("[data-manager-move-in-date]");
  if (moveInDateInput) openNativeDatePicker(moveInDateInput);

  const previewButton = event.target.closest("#adminPreviewBtn");
  if (previewButton) {
    event.preventDefault();
    state.adminPreviewMenuOpen = !state.adminPreviewMenuOpen;
    state.accountMenuOpen = false;
    renderManagerPortal();
    return;
  }

  const previewOpenButton = event.target.closest("[data-admin-preview-open]");
  if (previewOpenButton) {
    event.preventDefault();
    const context = adminPreviewContextFromControls();
    window.location.href = adminPreviewTargetUrl(context);
    return;
  }

  const previewClearButton = event.target.closest("[data-admin-preview-clear]");
  if (previewClearButton) {
    event.preventDefault();
    clearAdminPreviewContext();
    state.adminPreviewMenuOpen = false;
    window.location.href = "admin.html";
    return;
  }

  if (event.target.closest("[data-pm-guide-skip]")) {
    closeScheduleGuide(true);
    renderManagerPortal();
    return;
  }

  if (event.target.closest("[data-pm-guide-next]")) {
    const steps = currentGuideSteps();
    if (state.guideStep >= steps.length - 1) {
      closeScheduleGuide(true);
    } else {
      state.guideStep += 1;
    }
    renderManagerPortal();
    return;
  }

  const accountWasOpen = state.accountMenuOpen;
  const accountWrap = event.target.closest(".pm-account-menu-wrap");
  if (!accountWrap && accountWasOpen) state.accountMenuOpen = false;
  if (state.adminPreviewMenuOpen && !event.target.closest(".admin-preview-wrap")) {
    state.adminPreviewMenuOpen = false;
    renderManagerPortal();
    return;
  }

  if (event.target.closest("[data-pm-theme-toggle]")) {
    const nextTheme = readDashboardTheme() === "light" ? "dark" : "light";
    writeDashboardTheme(nextTheme);
    applyDashboardTheme();
    updateDashboardThemeToggle();
    return;
  }

  if (event.target.closest("[data-pm-notifications]")) {
    writeNotificationClearedAt();
    window.location.hash = "messages";
    state.view = "messages";
    state.assignmentDetailsOpen = false;
    renderManagerPortal();
    return;
  }

  const navLink = event.target.closest(".command-nav .nav-link[data-pm-view]");
  if (navLink) {
    event.preventDefault();
    const view = navLink.dataset.pmView || "overview";
    if (window.location.hash !== `#${view}`) window.location.hash = view;
    state.guideOpen = false;
    state.guideStep = 0;
    state.view = view;
    state.assignmentDetailsOpen = false;
    renderManagerPortal();
    return;
  }

  if (event.target.closest("[data-manager-account-toggle]")) {
    state.accountMenuOpen = !state.accountMenuOpen;
    state.adminPreviewMenuOpen = false;
    renderManagerPortal();
    return;
  }

  const viewButton = event.target.closest("[data-pm-view-button]");
  if (viewButton) {
    const threadId = event.target.closest("[data-manager-thread-id]")?.dataset.managerThreadId;
    if (threadId) state.selectedThreadId = threadId;
    const view = viewButton.dataset.pmViewButton;
    window.location.hash = view;
    state.guideOpen = false;
    state.guideStep = 0;
    state.view = view;
    state.assignmentDetailsOpen = false;
    renderManagerPortal();
    return;
  }

  if (event.target.closest("[data-manager-logout]")) {
    await supabase?.auth.signOut();
    window.location.href = "https://portal.turnlypros.com/";
    return;
  }

  const scheduleShift = event.target.closest("[data-pm-schedule-shift]");
  if (scheduleShift) {
    moveScheduleWindow(Number(scheduleShift.dataset.pmScheduleShift || 0));
    renderManagerPortal();
    return;
  }

  const scheduleView = event.target.closest("[data-pm-schedule-view]");
  if (scheduleView) {
    state.scheduleView = scheduleView.dataset.pmScheduleView || "week";
    setScheduleDate(state.selectedScheduleDate || dateInputValue(new Date()));
    renderManagerPortal();
    return;
  }

  const scheduleDay = event.target.closest("[data-pm-schedule-select-date]");
  if (scheduleDay && !event.target.closest("[data-manager-view-assignment]")) {
    setScheduleDate(scheduleDay.dataset.pmScheduleSelectDate);
    if (state.view === "schedule" && state.scheduleView === "month") state.scheduleView = "day";
    renderManagerPortal();
    return;
  }

  const refreshAll = event.target.closest("[data-manager-refresh]");
  if (refreshAll) {
    await refreshManagerPortal();
    return;
  }

  if (event.target.closest("[data-manager-request-toggle]")) {
    if (!hasLinkedProperty()) {
      state.dataMessage = propertyLinkPendingMessage();
      state.dataError = false;
      renderManagerPortal();
      return;
    }
    state.requestOpen = true;
    renderManagerPortal();
    return;
  }

  if (event.target.closest("[data-manager-message-compose]")) {
    state.requestOpen = true;
    renderManagerPortal();
    return;
  }

  if (event.target.closest("[data-manager-request-close]")) {
    state.requestOpen = false;
    renderManagerPortal();
    return;
  }

  if (event.target.closest("[data-manager-close-assignment-details]")) {
    state.assignmentDetailsOpen = false;
    renderManagerPortal();
    return;
  }

  const statusButton = event.target.closest("[data-pm-request-status]");
  if (statusButton) {
    state.filters.requestStatus = statusButton.dataset.pmRequestStatus || "open";
    state.requestPage = 1;
    state.assignmentDetailsOpen = false;
    renderManagerPortal();
    return;
  }

  const requestSortDirection = event.target.closest("[data-pm-request-sort-direction]");
  if (requestSortDirection) {
    state.filters.requestSortDirection = requestSortDirection.dataset.pmRequestSortDirection === "desc" ? "desc" : "asc";
    state.requestPage = 1;
    renderManagerPortal();
    return;
  }

  const requestPageButton = event.target.closest("[data-pm-request-page]");
  if (requestPageButton) {
    const pageSize = [10, 25].includes(Number(state.requestPageSize)) ? Number(state.requestPageSize) : 10;
    const totalPages = Math.max(1, Math.ceil(filteredRequests().length / pageSize));
    state.requestPage = Math.min(Math.max(1, Number(requestPageButton.dataset.pmRequestPage) || 1), totalPages);
    renderManagerPortal();
    return;
  }

  const messageViewButton = event.target.closest("[data-pm-message-view]");
  if (messageViewButton) {
    state.filters.messageView = messageViewButton.dataset.pmMessageView || "all";
    renderManagerPortal();
    return;
  }

  const assignmentDetailButton = event.target.closest("[data-manager-view-assignment]");
  if (assignmentDetailButton) {
    if (state.guideOpen) closeScheduleGuide(true);
    state.selectedAssignmentId = assignmentDetailButton.dataset.managerViewAssignment || "";
    state.assignmentDetailsOpen = true;
    state.feedbackMessage = "";
    state.feedbackError = false;
    renderManagerPortal();
    return;
  }

  const thread = event.target.closest("[data-manager-thread-id]");
  if (thread) {
    state.selectedThreadId = thread.dataset.managerThreadId || "";
    await markManagerThreadRead(state.selectedThreadId);
    await loadManagerThreadMessages(state.selectedThreadId);
    renderManagerPortal();
    return;
  }

  if (!accountWrap && accountWasOpen) renderManagerPortal();
});

document.addEventListener("focusin", (event) => {
  if (event.target.matches("[data-manager-move-in-date]")) {
    openNativeDatePicker(event.target);
  }
});

document.addEventListener("input", (event) => {
  const filter = event.target.closest("[data-pm-filter]");
  if (!filter) return;
  state.filters[filter.dataset.pmFilter] = filter.value;
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && state.assignmentDetailsOpen) {
    state.assignmentDetailsOpen = false;
    renderManagerPortal();
    return;
  }

  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
    if (!viewSupportsSearch()) return;
    event.preventDefault();
    document.querySelector("[data-manager-global-search]")?.focus();
    return;
  }

  if (!["Enter", " "].includes(event.key)) return;
  const assignmentCard = event.target.closest("[data-manager-view-assignment][role='button']");
  if (assignmentCard) {
    event.preventDefault();
    state.selectedAssignmentId = assignmentCard.dataset.managerViewAssignment || "";
    state.assignmentDetailsOpen = true;
    state.feedbackMessage = "";
    state.feedbackError = false;
    renderManagerPortal();
  }
});

document.addEventListener("change", (event) => {
  const previewField = event.target.closest("[data-admin-preview-field]");
  if (previewField) {
    adminPreviewContextFromControls();
    return;
  }

  const scheduleDate = event.target.closest("[data-pm-schedule-date]");
  if (scheduleDate) {
    setScheduleDate(scheduleDate.value);
    renderManagerPortal();
    return;
  }

  const requestPageSize = event.target.closest("[data-pm-request-page-size]");
  if (requestPageSize) {
    state.requestPageSize = [10, 25].includes(Number(requestPageSize.value)) ? Number(requestPageSize.value) : 10;
    state.requestPage = 1;
    renderManagerPortal();
    return;
  }

  const requestSort = event.target.closest("[data-pm-request-sort]");
  if (requestSort) {
    state.filters.requestSort = requestSort.value || "scheduled_date";
    state.requestPage = 1;
    renderManagerPortal();
    return;
  }

  const filter = event.target.closest("[data-pm-filter]");
  if (!filter) return;
  state.filters[filter.dataset.pmFilter] = filter.value;
  renderManagerPortal();
});

document.addEventListener("submit", async (event) => {
  if (event.target.matches("#managerNewThreadForm")) {
    event.preventDefault();
    await createManagerMessageThread(event.target);
    if (!state.error) {
      state.requestOpen = false;
      renderManagerPortal();
    }
  }
  if (event.target.matches("#managerTurnRequestForm")) {
    event.preventDefault();
    await createTurnRequest(event.target);
  }
  if (event.target.matches("#managerCleanFeedbackForm")) {
    event.preventDefault();
    await submitCleanFeedback(event.target);
  }
  if (event.target.matches("#managerReplyForm")) {
    event.preventDefault();
    await sendManagerReply(event.target);
  }
});

window.addEventListener("hashchange", () => {
  state.view = currentView();
  renderManagerPortal();
});

try {
  applyDashboardTheme();
  await requireManagerAccess();
} catch (error) {
  console.error("[property-manager] Portal startup failed", error);
  state.dataMessage = `Unable to load the property manager portal: ${errorMessage(error)}.`;
  state.dataError = true;
  if (state.user || state.profile) {
    renderManagerPortal();
  } else {
    renderLockedState("Portal loading error", state.dataMessage);
  }
}
