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
  previewIdentityValues,
  resolvePreviewProfile,
  resolvePreviewProperty,
  rowMatchesPreviewProperty,
  rowMatchesPreviewUser,
  verifyAdminPreviewSession,
  writeAdminPreviewContext
} from "./admin-preview-context.js?v=20260804-contractor-access-scope";

const env = window.__ENV || {};
const supabase = env.SUPABASE_URL && env.SUPABASE_ANON_KEY
  ? createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY)
  : null;

const root = document.getElementById("contractorPortalApp");
const pageKey = document.body?.dataset?.contractorPage || "dashboard";
const contractorDashboardThemeStorageKey = "turnlyContractorDashboardTheme";

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

const mobileNavItems = [
  ["dashboard", "Today", "contractor.html"],
  ["job-board", "Jobs", "contractor-available.html"],
  ["schedule", "Schedule", "contractor-schedule.html"],
  ["payments", "Pay", "contractor-payments.html"]
];

const mobileMoreItems = [
  ["my-jobs", "My Jobs", "contractor-my-assignments.html"],
  ["messages", "Messages", "contractor-messages.html"],
  ["resources", "Resources", "contractor-resources.html"],
  ["documents", "Documents", "contractor-documents.html"],
  ["performance", "Performance", "contractor-performance-portal.html"],
  ["video-library", "Videos", "contractor-video-library.html"]
];

const pageMeta = {
  dashboard: ["Today", "Jobs and scheduling for today."],
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
  adminPreview: null,
  adminPreviewProperty: null,
  adminUser: null,
  availability: {
    status: "available",
    days: {
      monday: true,
      tuesday: true,
      wednesday: true,
      thursday: true,
      friday: true,
      saturday: false,
      sunday: false
    },
    start_time: "08:00",
    end_time: "17:00",
    notes: "",
    updated_at: ""
  },
  availabilityPersistence: "device",
  availabilitySaving: false,
  availabilityMessage: "",
  availabilityError: false,
  selectedBoardJobId: "",
  messageThreads: [],
  messageParticipants: [],
  messageMessages: [],
  messageReadAt: new Map(),
  selectedThreadId: "",
  messageComposerOpen: false,
  messageStatus: "",
  messageStatusError: false,
  messageSending: false,
  profileMenuOpen: false,
  adminPreviewMenuOpen: false,
  loading: true,
  message: "",
  messageError: false,
  filters: {
    search: "",
    jobType: "all",
    payRange: "all",
    myStatus: "active",
    payoutSearch: "",
    payoutWeek: "",
    videoPhase: "all"
  },
  scheduleCursor: startOfWeek(new Date())
};

const boardVisibleStatuses = new Set(["open", "preferred-pending"]);
const closedAssignmentStatuses = new Set(["completed", "complete", "closed", "done", "cancelled", "canceled", "declined", "qa-pending"]);
const availabilityDays = [
  ["monday", "Mon"],
  ["tuesday", "Tue"],
  ["wednesday", "Wed"],
  ["thursday", "Thu"],
  ["friday", "Fri"],
  ["saturday", "Sat"],
  ["sunday", "Sun"]
];
const availabilityStatuses = [
  ["available", "Available"],
  ["limited", "Limited"],
  ["unavailable", "Unavailable"]
];

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

const cpIconPaths = {
  "chevron-down": '<path d="m6 9 6 6 6-6"/>',
  "chevron-right": '<path d="m9 18 6-6-6-6"/>',
  shield: '<path d="M20 13c0 5-3.5 7.5-8 9-4.5-1.5-8-4-8-9V5l8-3 8 3v8Z"/><path d="m9 12 2 2 4-4"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>'
};

function cpIcon(name, className = "") {
  const path = cpIconPaths[name] || cpIconPaths.users;
  return `<span class="suite-icon ${esc(className)}" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${path}</svg></span>`;
}

function readDashboardTheme() {
  try {
    return window.localStorage?.getItem(contractorDashboardThemeStorageKey) === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

function writeDashboardTheme(theme) {
  try {
    window.localStorage?.setItem(contractorDashboardThemeStorageKey, theme === "light" ? "light" : "dark");
  } catch {
    // Theme still applies for the current page when storage is unavailable.
  }
}

function applyDashboardTheme() {
  if (!document.body) return;
  document.body.dataset.dashboardTheme = readDashboardTheme();
}

function dashboardThemeIcon(theme) {
  const path = theme === "light"
    ? '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>'
    : '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>';
  return `<span class="cp-theme-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${path}</svg></span>`;
}

function dashboardThemeToggleContent(theme) {
  const label = theme === "light" ? "Light" : "Dark";
  return `
    <span class="cp-theme-toggle-track"><span class="cp-theme-toggle-thumb">${dashboardThemeIcon(theme)}</span></span>
    <span class="cp-theme-toggle-label">${esc(label)}</span>
  `;
}

function dashboardThemeToggle() {
  const theme = readDashboardTheme();
  const nextLabel = theme === "light" ? "dark" : "light";
  return `
    <button class="cp-theme-toggle" type="button" data-contractor-theme-toggle role="switch" aria-checked="${theme === "light" ? "true" : "false"}" aria-label="Switch to ${esc(nextLabel)} mode">
      ${dashboardThemeToggleContent(theme)}
    </button>
  `;
}

function updateDashboardThemeToggle() {
  const button = document.querySelector("[data-contractor-theme-toggle]");
  if (!button) return;
  const theme = readDashboardTheme();
  const nextLabel = theme === "light" ? "dark" : "light";
  button.setAttribute("aria-checked", theme === "light" ? "true" : "false");
  button.setAttribute("aria-label", `Switch to ${nextLabel} mode`);
  button.innerHTML = dashboardThemeToggleContent(theme);
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

function formatCompactTime(value, fallback = "") {
  const formatted = formatTime(value, fallback);
  return formatted ? formatted.replace(/\s+/g, "").toLowerCase() : fallback;
}

function formatShortDate(value, fallback = "Not scheduled") {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function formatWindow(item) {
  const start = formatDate(item.start_window);
  const startTime = formatTime(item.start_window);
  const endTime = formatTime(item.end_window);
  return `${start}${startTime ? `, ${startTime}` : ""}${endTime ? ` - ${endTime}` : ""}`;
}

function formatOpenJobWindow(item = {}) {
  const date = formatDate(item.start_window, "Not scheduled");
  const startTime = formatCompactTime(item.start_window);
  const endTime = formatCompactTime(item.end_window);
  if (!startTime) return date;
  return `${date} ${startTime}${endTime ? `-${endTime}` : ""}`;
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

async function applyContractorAdminPreview(authUser) {
  const existing = window.turnlyAdminPreviewContext;
  const session = existing?.preview?.portal === "contractor"
    ? existing
    : await verifyAdminPreviewSession(supabase, authUser);
  if (session?.preview?.portal !== "contractor") return false;

  const previewProfile = session.effectiveProfile || await resolvePreviewProfile(supabase, session.preview, "contractor");
  const previewUser = session.effectiveUser || buildPreviewEffectiveUser(previewProfile, authUser, "contractor");
  if (!previewProfile || !previewUser) {
    state.message = "Admin preview could not find the selected contractor profile.";
    state.messageError = true;
    return false;
  }

  state.adminPreview = session.preview;
  state.adminPreviewProperty = session.property || await resolvePreviewProperty(supabase, session.preview);
  state.adminUser = session.adminUser || authUser;
  state.user = previewUser;
  state.profile = {
    ...previewProfile,
    role: "contractor",
    status: previewProfile.status || "active",
    contractor_approved: true
  };
  return true;
}

function contractorPreviewIdentityValues() {
  return previewIdentityValues(state.profile, state.user);
}

function matchesContractorPreviewUser(row = {}) {
  if (!state.adminPreview) return true;
  return rowMatchesPreviewUser(row, contractorPreviewIdentityValues());
}

function matchesContractorPreviewProperty(row = {}) {
  if (!state.adminPreview) return true;
  return rowMatchesPreviewProperty(row, state.adminPreview);
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

function renderContractorAdminPreviewSwitcher() {
  if (!state.adminPreview) return "";
  const preview = normalizeAdminPreviewContext(state.adminPreview);
  const userOptions = adminPreviewUsersForPortal(preview.portal);
  return `
    <div class="admin-preview-wrap">
      <button id="adminPreviewBtn" class="admin-preview-trigger" type="button" aria-haspopup="menu" aria-expanded="${state.adminPreviewMenuOpen ? "true" : "false"}" aria-controls="adminPreviewMenu">
        ${cpIcon("users")}
        <span><strong>Portal Preview</strong><small id="adminPreviewSummary">${esc(adminPreviewSummary(preview))}</small></span>
        ${cpIcon("chevron-down")}
      </button>
      <div id="adminPreviewMenu" class="topbar-dropdown admin-preview-menu" ${state.adminPreviewMenuOpen ? "" : "hidden"}>
        <div class="admin-preview-header">
          ${cpIcon("shield")}
          <span><strong>Admin Preview Mode</strong><small>Open a portal as a selected user and property.</small></span>
        </div>
        ${renderAdminPreviewSelect("View", "portal", adminPreviewPortalOptions, preview.portal)}
        ${renderAdminPreviewSelect("Property / Contract", "property", adminPreviewPropertyOptions, preview.property)}
        ${renderAdminPreviewSelect("User", "user", userOptions, preview.user)}
        <div class="admin-preview-actions">
          <button class="primary-action" type="button" data-admin-preview-open>${cpIcon("chevron-right")}<span>Open View</span></button>
          <button class="secondary-action" type="button" data-admin-preview-clear>${cpIcon("x")}<span>Clear</span></button>
        </div>
      </div>
    </div>
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

function statusClass(status) {
  return `cp-status-${normalizeToken(status || "unknown")}`;
}

function assignmentTitle(item) {
  return item.property_name || item.title || "Turnly Assignment";
}

function assignmentSubtitle(item) {
  return [item.address, item.service_type].filter(Boolean).join(" - ") || "Details pending";
}

function assignmentMetadata(item = {}) {
  const meta = item.metadata;
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

function uniqueAccessList(values = []) {
  const seen = new Set();
  return values
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .filter((value) => {
      const key = normalizeAccessLookup(value);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function listFromAccess(value) {
  if (Array.isArray(value)) return uniqueAccessList(value);
  if (value && typeof value === "object") return uniqueAccessList(Object.values(value));
  const text = String(value || "").trim();
  if (!text) return [];
  if ((text.startsWith("[") && text.endsWith("]")) || (text.startsWith("{") && text.endsWith("}"))) {
    try {
      return listFromAccess(JSON.parse(text));
    } catch {
      // Fall through to comma parsing.
    }
  }
  return uniqueAccessList(text.split(","));
}

function normalizeAccessLookup(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function contractorAccessScope() {
  const profile = state.profile || {};
  const metadata = profile.metadata && typeof profile.metadata === "object" && !Array.isArray(profile.metadata)
    ? profile.metadata
    : {};
  return {
    regions: uniqueAccessList([
      ...listFromAccess(profile.allowed_regions),
      ...listFromAccess(profile.allowedRegions),
      ...listFromAccess(metadata.allowed_regions),
      ...listFromAccess(metadata.allowedRegions)
    ]),
    propertyIds: uniqueAccessList([
      ...listFromAccess(profile.allowed_property_ids),
      ...listFromAccess(profile.allowedPropertyIds),
      ...listFromAccess(metadata.allowed_property_ids),
      ...listFromAccess(metadata.allowedPropertyIds)
    ]),
    propertyNames: uniqueAccessList([
      ...listFromAccess(profile.allowed_property_names),
      ...listFromAccess(profile.allowedPropertyNames),
      ...listFromAccess(metadata.allowed_property_names),
      ...listFromAccess(metadata.allowedPropertyNames)
    ])
  };
}

function accessCandidateMatches(allowed = [], candidates = []) {
  const allowedValues = allowed.map(normalizeAccessLookup).filter(Boolean);
  const candidateValues = candidates.map(normalizeAccessLookup).filter(Boolean);
  return allowedValues.some((allowedValue) => candidateValues.some((candidate) => (
    candidate === allowedValue || candidate.includes(allowedValue) || allowedValue.includes(candidate)
  )));
}

function assignmentAccessCandidates(item = {}) {
  const meta = assignmentMetadata(item);
  return {
    propertyIds: [
      item.property_id,
      item.portal_property_id,
      item.recurring_property_id,
      item.recurring_portal_property_id,
      meta.property_id,
      meta.portal_property_id,
      meta.recurring_property_id,
      meta.recurring_portal_property_id,
      meta.client_id,
      meta.contract_id
    ],
    propertyNames: [
      item.property_name,
      item.title,
      item.address,
      meta.property_name,
      meta.name,
      meta.title,
      meta.company_name,
      meta.client_name,
      meta.address,
      meta.property_address,
      meta.service_address
    ],
    regions: [
      item.region,
      item.market,
      item.location,
      item.city,
      item.state,
      item.address,
      meta.region,
      meta.market,
      meta.location,
      meta.city,
      meta.state,
      meta.address,
      meta.property_address,
      meta.service_address
    ]
  };
}

function matchesContractorAccess(item = {}) {
  const scope = contractorAccessScope();
  if (!scope.regions.length && !scope.propertyIds.length && !scope.propertyNames.length) return true;
  const candidates = assignmentAccessCandidates(item);
  return accessCandidateMatches(scope.propertyIds, candidates.propertyIds)
    || accessCandidateMatches(scope.propertyNames, candidates.propertyNames)
    || accessCandidateMatches(scope.regions, candidates.regions);
}

function assignmentUnitLabel(item = {}) {
  const meta = assignmentMetadata(item);
  const raw = item.unit_number || item.unit_name || meta.unit_number || meta.unit_name || meta.unit_id || "";
  const text = String(raw || "").trim();
  if (!text) return "";
  return /^(unit\b|#)/i.test(text) ? text : `Unit ${text}`;
}

function assignmentSquareFeetLabel(item = {}) {
  const meta = assignmentMetadata(item);
  const raw = item.unit_square_feet || item.square_feet || item.sq_ft || item.sqft ||
    meta.unit_square_feet || meta.square_feet || meta.sq_ft || meta.sqft || "";
  const text = String(raw || "").trim();
  if (!text) return "";
  const number = Number(text.replace(/,/g, "").replace(/[^\d.]/g, ""));
  if (Number.isFinite(number) && number > 0) return `${number.toLocaleString()} sq ft`;
  return /\bsq\s*ft\b/i.test(text) ? text : "";
}

function isClosedAssignment(item) {
  return closedAssignmentStatuses.has(normalizeToken(item?.status))
    || Boolean(item?.completed_at || item?.completed_by || item?.checklist_completed_at);
}

function isCompletedAssignment(item) {
  return ["completed", "complete", "done"].includes(normalizeToken(item?.status))
    || Boolean(item?.completed_at || item?.completed_by || item?.checklist_completed_at);
}

function isClaimableBoardAssignment(item) {
  return boardVisibleStatuses.has(normalizeToken(item?.status))
    && !isClosedAssignment(item)
    && !item?.claimed_by
    && !item?.assigned_to;
}

function activeAssignments() {
  return state.myAssignments.filter((item) => !isClosedAssignment(item));
}

function completedAssignments(days = 365) {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return state.myAssignments.filter((item) => {
    const completedAt = dateValue(item.completed_at || item.updated_at);
    return isCompletedAssignment(item) && completedAt >= cutoff;
  });
}

function todayAssignments() {
  const today = new Date();
  return activeAssignments().filter((item) => {
    const date = item.start_window ? new Date(item.start_window) : null;
    return date && isSameDay(date, today);
  }).sort((a, b) => dateValue(a.start_window) - dateValue(b.start_window));
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

function currentYear() {
  return new Date().getFullYear();
}

function isCurrentYear(value) {
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.getFullYear() === currentYear();
}

function assignmentPaidDate(item = {}) {
  const payment = assignmentPaymentMetadata(item);
  return item.paid_at ||
    item.payout_at ||
    item.payout_date ||
    item.payout_completed_at ||
    item.payment_sent_at ||
    item.statement_paid_at ||
    item.paid_on ||
    payment.paid_at ||
    "";
}

function assignmentPaymentStatus(item) {
  return normalizeToken(item.payment_status || item.pay_status || item.payout_status || item.invoice_status || assignmentPaymentMetadata(item).status || "");
}

function isPaidAssignment(item) {
  const status = assignmentPaymentStatus(item);
  return Boolean(
    assignmentPaidDate(item) ||
    item.paid === true ||
    item.is_paid === true ||
    item.paid_out === true ||
    assignmentPaymentMetadata(item).paid === true ||
    ["paid", "paid-out", "payout-paid", "payout-sent", "settled"].includes(status)
  );
}

function assignmentPaymentMetadata(item = {}) {
  const meta = assignmentMetadata(item);
  return meta.payment && typeof meta.payment === "object" ? meta.payment : {};
}

function acceptedPayAssignments() {
  return activeAssignments()
    .filter((item) => Number(item.pay_amount) > 0)
    .sort((a, b) => dateValue(a.start_window || a.accepted_at || a.claimed_at) - dateValue(b.start_window || b.accepted_at || b.claimed_at));
}

function completedPayAssignments() {
  return state.myAssignments
    .filter((item) => normalizeToken(item.status) === "completed")
    .sort((a, b) => dateValue(b.completed_at || b.updated_at) - dateValue(a.completed_at || a.updated_at));
}

function completedOwedAssignments() {
  return completedPayAssignments().filter((item) => !isPaidAssignment(item));
}

function paidAssignments() {
  return completedPayAssignments().filter(isPaidAssignment);
}

function isoWeekInputValue(value) {
  const source = new Date(value);
  if (Number.isNaN(source.getTime())) return "";
  const date = new Date(Date.UTC(source.getFullYear(), source.getMonth(), source.getDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function weekRangeLabel(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Week not recorded";
  const start = startOfWeek(date);
  const end = addDays(start, 6);
  return `${formatShortDate(start)} - ${formatDate(end)}`;
}

function payoutGroups() {
  const groups = new Map();
  paidAssignments().forEach((item) => {
    const paidDate = assignmentPaidDate(item) || item.completed_at || item.updated_at;
    const weekKey = isoWeekInputValue(paidDate) || "unknown";
    const group = groups.get(weekKey) || {
      amount: 0,
      count: 0,
      items: [],
      latestDate: 0,
      paidDate,
      weekKey,
      weekLabel: weekRangeLabel(paidDate)
    };
    group.amount += Number(item.pay_amount) || 0;
    group.count += 1;
    group.items.push(item);
    if (dateValue(paidDate) > group.latestDate) {
      group.latestDate = dateValue(paidDate);
      group.paidDate = paidDate;
      group.weekLabel = weekRangeLabel(paidDate);
    }
    groups.set(weekKey, group);
  });

  const ascending = Array.from(groups.values()).sort((a, b) => dateValue(a.paidDate) - dateValue(b.paidDate));
  let runningYtd = 0;
  ascending.forEach((group) => {
    if (isCurrentYear(group.paidDate)) {
      runningYtd += group.amount;
      group.runningYtd = runningYtd;
    } else {
      group.runningYtd = null;
    }
  });
  return ascending.reverse();
}

function filteredPayoutGroups() {
  const term = state.filters.payoutSearch.trim().toLowerCase();
  return payoutGroups().filter((group) => {
    if (state.filters.payoutWeek && group.weekKey !== state.filters.payoutWeek) return false;
    if (!term) return true;
    return [
      group.weekKey,
      group.weekLabel,
      ...group.items.flatMap((item) => [assignmentTitle(item), item.property_name, item.address, item.service_type])
    ].some((value) => String(value || "").toLowerCase().includes(term));
  });
}

function availabilityStorageKey() {
  return `turnly:contractor-availability:${state.user?.id || "anonymous"}`;
}

function normalizeAvailability(value = {}) {
  const rawDays = value.days && typeof value.days === "object" ? value.days : {};
  const hasDays = Object.keys(rawDays).length > 0;
  const days = Object.fromEntries(availabilityDays.map(([key]) => [
    key,
    hasDays ? rawDays[key] === true : !["saturday", "sunday"].includes(key)
  ]));
  const status = availabilityStatuses.some(([key]) => key === normalizeToken(value.status))
    ? normalizeToken(value.status)
    : "available";
  return {
    status,
    days,
    start_time: String(value.preferred_start_time || value.start_time || "08:00").slice(0, 5),
    end_time: String(value.preferred_end_time || value.end_time || "17:00").slice(0, 5),
    notes: value.notes || "",
    updated_at: value.updated_at || value.saved_at || ""
  };
}

function readStoredAvailability() {
  try {
    const raw = window.localStorage?.getItem(availabilityStorageKey());
    return raw ? normalizeAvailability(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

function writeStoredAvailability(value) {
  try {
    window.localStorage?.setItem(availabilityStorageKey(), JSON.stringify(value));
  } catch {
    // Private browsing can block storage; database sync still works when available.
  }
}

function availabilityStatusLabel(status) {
  return availabilityStatuses.find(([key]) => key === status)?.[1] || "Available";
}

function availabilityDaySummary(days) {
  const selected = availabilityDays.filter(([key]) => days[key]).map(([, label]) => label);
  return selected.length ? selected.join(", ") : "No days selected";
}

function availabilityPersistenceLabel() {
  if (state.availability.updated_at) return `Updated ${formatDate(state.availability.updated_at)}`;
  return state.availabilityPersistence === "database" ? "Synced" : "Saved on this device";
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
  const openDetails = mode === "open";
  if (openDetails) return openJobCard(item, "cp-job-row");
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

function openJobCard(item, className = "cp-job-row") {
  const actions = assignmentActions(item, "open");
  const details = [
    assignmentTitle(item),
    assignmentUnitLabel(item),
    assignmentSquareFeetLabel(item),
    formatOpenJobWindow(item)
  ].filter(Boolean);
  return `
    <article class="${esc(className)} cp-open-job-card cp-job-row-clickable" data-open-job-details-id="${esc(item.id)}" data-assignment-address="${esc(item.address || "")}" role="button" tabindex="0" aria-label="View details for ${esc(assignmentTitle(item))}">
      <div class="cp-open-job-lines">
        ${details.map((detail, index) => index === 0
          ? `<strong>${esc(detail)}</strong>`
          : `<span>${esc(detail)}</span>`).join("")}
      </div>
      ${actions ? `<div class="cp-open-job-actions">${actions}</div>` : ""}
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
      ${dashboardThemeToggle()}
      <label class="cp-search">
        <span>Search</span>
        <input id="cpGlobalSearch" type="search" placeholder="Search jobs..." value="${esc(state.filters.search)}" />
      </label>
      <select class="cp-select" aria-label="Switch property">
        <option>Switch Property</option>
        ${Array.from(new Set(state.myAssignments.map((item) => item.property_name).filter(Boolean))).slice(0, 8).map((name) => `<option>${esc(name)}</option>`).join("")}
      </select>
      <button id="installPwaBtn" class="cp-ghost-action cp-install-action" type="button" data-pwa-install hidden>Install App</button>
    </header>
    <p id="claimMessage" class="cp-status-message ${state.messageError ? "error" : ""}" aria-live="polite">${esc(state.message)}</p>
  `;
}

function profileAccountMenu(menuId = "cpProfileMenu") {
  return `
    <div id="${esc(menuId)}" class="cp-profile-menu" data-contractor-profile-menu ${state.profileMenuOpen ? "" : "hidden"}>
      <button class="cp-profile-menu-action" type="button" data-contractor-logout>Sign Out</button>
    </div>
  `;
}

function profileAccountTrigger(menuId = "cpProfileMenu") {
  return `
    <button class="cp-profile" type="button" data-contractor-profile-toggle aria-expanded="${state.profileMenuOpen ? "true" : "false"}" aria-controls="${esc(menuId)}">
      <span class="cp-profile-avatar">${esc(initials())}</span>
      <span>
        <strong>${esc(contractorName())}</strong>
        <small>Contractor</small>
      </span>
    </button>
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
            ${cpNavBadge(key)}
          </a>
        `).join("")}
      </nav>
      <section class="cp-support">
        <small>Need help?</small>
        <strong>Turnly Ops Center</strong>
        <small>ops@turnlypros.com</small>
      </section>
      <div class="cp-legal-links" aria-label="Turnly legal links">
        <a href="/privacy-policy.html" target="_blank" rel="noopener">Privacy Policy</a>
        <a href="/terms-and-conditions.html" target="_blank" rel="noopener">Terms</a>
      </div>
      <section class="cp-profile-wrap">
        ${profileAccountTrigger("cpProfileMenu")}
        ${profileAccountMenu("cpProfileMenu")}
      </section>
    </aside>
  `;
}

function mobileNav() {
  const moreIsActive = mobileMoreItems.some(([key]) => key === pageKey);
  const moreOpen = document.body?.classList.contains("cp-mobile-more-open");
  return `
    <div class="cp-mobile-more-panel" id="cpMobileMorePanel" ${moreOpen ? "" : "hidden"}>
      <div class="cp-mobile-more-grid">
        ${mobileMoreItems.map(([key, label, href]) => `
          <a class="cp-mobile-more-link ${key === pageKey ? "active" : ""}" href="${esc(href)}"><span>${esc(label)}</span>${cpNavBadge(key)}</a>
        `).join("")}
      </div>
      <div class="cp-mobile-profile-account">
        ${profileAccountTrigger("cpMobileProfileMenu")}
        ${profileAccountMenu("cpMobileProfileMenu")}
      </div>
      <div class="cp-mobile-legal-links" aria-label="Turnly legal links">
        <a href="/privacy-policy.html" target="_blank" rel="noopener">Privacy Policy</a>
        <a href="/terms-and-conditions.html" target="_blank" rel="noopener">Terms</a>
      </div>
    </div>
    <nav class="cp-mobile-nav" aria-label="Contractor mobile navigation">
      ${mobileNavItems.map(([key, label, href]) => `
        <a class="${key === pageKey ? "active" : ""}" href="${esc(href)}">
          <strong>${esc(label)}</strong>
        </a>
      `).join("")}
      <button class="${moreIsActive ? "active" : ""}" type="button" aria-expanded="${moreOpen ? "true" : "false"}" aria-controls="cpMobileMorePanel" data-mobile-more-toggle>
        <strong>...</strong>
        ${cpUnreadMessageCount() ? cpNavBadge("messages") : ""}
      </button>
    </nav>
  `;
}

function renderShell() {
  if (!root) return;
  applyDashboardTheme();
  root.innerHTML = `
    <main class="cp-shell">
      ${sidebar()}
      <section class="cp-main" id="${pageKey === "dashboard" ? "contractorDashboard" : "contractorPortalMain"}">
        ${renderContractorAdminPreviewSwitcher()}
        ${renderPage()}
      </section>
      ${jobDetailDrawer()}
      ${mobileNav()}
    </main>
  `;
}

function acceptedAssignments() {
  return activeAssignments()
    .slice()
    .sort((a, b) => dateValue(a.start_window || a.claimed_at || a.created_at) - dateValue(b.start_window || b.claimed_at || b.created_at));
}

function homeJobCard(item, mode = "mine") {
  const status = item.status || "open";
  const actions = assignmentActions(item, mode);
  const openDetails = mode === "open";
  if (openDetails) return openJobCard(item, "cp-home-job-card");
  return `
    <article class="cp-home-job-card">
      <div class="cp-home-job-main">
        <strong>${esc(assignmentTitle(item))}</strong>
        <small>${esc(assignmentSubtitle(item))}</small>
      </div>
      <div class="cp-home-job-meta">
        <span>${esc(formatWindow(item))}</span>
        <span>${esc(money(item.pay_amount))}</span>
        <strong class="cp-pill ${statusClass(status)}">${esc(titleCase(status))}</strong>
      </div>
      ${actions ? `<div class="cp-home-job-actions">${actions}</div>` : ""}
    </article>
  `;
}

function renderHomeJobList(rows, mode, emptyText, limit = 4) {
  if (!rows.length) return emptyState(emptyText);
  const visible = rows.slice(0, limit);
  const remaining = rows.length - visible.length;
  const href = mode === "open" ? "contractor-available.html" : "contractor-my-assignments.html";
  return `
    <div class="cp-home-job-list">
      ${visible.map((item) => homeJobCard(item, mode)).join("")}
      ${remaining > 0 ? `<a class="cp-home-more-link" href="${href}">View ${remaining} more</a>` : ""}
    </div>
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
  const today = todayAssignments();
  const accepted = acceptedAssignments();
  const boardRows = filteredOpenAssignments();
  const preferred = boardRows.filter(isPreferredOffer);
  const available = boardRows.filter((item) => !isPreferredOffer(item));
  return `
    <section class="cp-opening-jobs" aria-label="Contractor jobs">
      ${panel("Accepted Jobs", renderHomeJobList(accepted, "mine", "No accepted jobs yet."), {
        kicker: "Your Work",
        action: `<a class="cp-ghost-action" href="contractor-my-assignments.html">All</a>`
      })}
      ${panel("Preferred Jobs", renderHomeJobList(preferred, "open", "No preferred jobs right now."), {
        kicker: "Offered First",
        action: `<a class="cp-ghost-action" href="contractor-available.html">Jobs</a>`
      })}
      ${panel("Available Jobs", renderHomeJobList(available, "open", "No available jobs right now."), {
        kicker: "Job Board",
        action: `<a class="cp-ghost-action" href="contractor-available.html">Jobs</a>`
      })}
    </section>
    ${renderTodayMetrics(today)}
    <section class="cp-dashboard-grid">
      <div class="cp-stack">
        ${panel("Today's Jobs", today.length ? `<div class="cp-job-list">${today.map((item) => assignmentRow(item, "mine")).join("")}</div>` : emptyState("No jobs scheduled for today."), {
          action: `<a class="cp-ghost-action" href="contractor-schedule.html">Week View</a>`
        })}
        ${panel("Today's Schedule", renderTodaySchedule(today), { kicker: new Date().toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" }) })}
      </div>
      <div class="cp-stack">
        ${panel("Route Summary", renderTodayRouteSummary(today))}
        ${panel("Today's Tasks", renderTodayTasks(today))}
        ${panel("Actions", `
          <div class="cp-quick-grid">
            <a class="cp-action" href="contractor-my-assignments.html">My Jobs</a>
            <a class="cp-ghost-action" href="contractor-available.html">Find Jobs</a>
            <a class="cp-ghost-action" href="contractor-schedule.html">Schedule</a>
            <a class="cp-ghost-action" href="contractor-messages.html">Messages</a>
          </div>
        `)}
      </div>
    </section>
  `;
}

function renderTodayMetrics(today) {
  const inProgress = today.filter((item) => normalizeToken(item.status) === "in-progress").length;
  const next = today.find((item) => dateValue(item.start_window) >= Date.now()) || today[0];
  return `
    <section class="cp-metric-strip">
      ${metric("Today's Jobs", String(today.length), "scheduled today", "T")}
      ${metric("In Progress", String(inProgress), "currently active", "A")}
      ${metric("Today's Pay", money(totalPay(today)), "scheduled earnings", "$")}
      ${metric("Next Start", next ? formatTime(next.start_window, "Anytime") : "None", next ? assignmentTitle(next) : "no jobs today", "N")}
      ${metric("Open Jobs", String(state.openAssignments.length), "available to claim", "J")}
    </section>
  `;
}

function renderTodaySchedule(rows) {
  if (!rows.length) return emptyState("No scheduled times for today.");
  return `
    <div class="cp-mini-list">
      ${rows.map((item) => `
        <div class="cp-mini-row">
          <span>${esc(formatTime(item.start_window, "Anytime"))}</span>
          <strong>${esc(assignmentTitle(item))}</strong>
          <small>${esc([item.address, item.service_type, money(item.pay_amount)].filter(Boolean).join(" - "))}</small>
        </div>
      `).join("")}
    </div>
  `;
}

function renderTodayRouteSummary(rows) {
  const first = rows[0];
  const last = rows[rows.length - 1];
  return `
    <div class="cp-mini-list">
      <div class="cp-mini-row"><span>First Stop</span><strong>${esc(first ? assignmentTitle(first) : "None")}</strong><small>${esc(first ? formatWindow(first) : "No jobs today")}</small></div>
      <div class="cp-mini-row"><span>Last Stop</span><strong>${esc(last ? assignmentTitle(last) : "None")}</strong><small>${esc(last ? formatWindow(last) : "No jobs today")}</small></div>
      <div class="cp-mini-row"><span>Total Pay</span><strong>${esc(money(totalPay(rows)))}</strong><small>for today's scheduled jobs</small></div>
    </div>
  `;
}

function renderTodayTasks(rows) {
  if (!rows.length) return emptyState("Nothing is scheduled for today.");
  const checklistCount = rows.filter((item) => ["in-progress", "claimed", "scheduled"].includes(normalizeToken(item.status))).length;
  return `
    <div class="cp-mini-list">
      <div class="cp-mini-row"><strong>Review access notes</strong><small>${rows.length} job(s) scheduled today.</small></div>
      <div class="cp-mini-row"><strong>Complete checklist proof</strong><small>${checklistCount} active job(s) may need photos or QA video.</small></div>
      <div class="cp-mini-row"><strong>Message Turnly if delayed</strong><small>Use Messages for schedule changes or access issues.</small></div>
    </div>
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
    return [item.title, item.property_name, item.address, item.service_type, assignmentUnitLabel(item), assignmentSquareFeetLabel(item), item.scope, item.special_instructions]
      .some((value) => String(value || "").toLowerCase().includes(term));
  }).sort((a, b) => dateValue(a.start_window) - dateValue(b.start_window));
}

function renderSelectedJobDetail(item) {
  if (!item) return emptyState("Select a job to view details.");
  return `
    <div class="cp-detail-list">
      <div><span>Property</span><strong>${esc(assignmentTitle(item))}</strong></div>
      <div><span>Address</span><strong>${esc(item.address || "Not set")}</strong></div>
      <div><span>Unit</span><strong>${esc(assignmentUnitLabel(item) || "Not set")}</strong></div>
      <div><span>Square Feet</span><strong>${esc(assignmentSquareFeetLabel(item) || "Not set")}</strong></div>
      <div><span>Schedule</span><strong>${esc(formatWindow(item))}</strong></div>
      <div><span>Pay</span><strong>${esc(money(item.pay_amount))}</strong></div>
      <div><span>Scope</span><strong>${esc(item.scope || "No scope listed")}</strong></div>
      <div><span>Notes</span><strong>${esc(item.special_instructions || "No special notes")}</strong></div>
    </div>
  `;
}

function selectedBoardJob(rows = state.openAssignments) {
  if (!state.selectedBoardJobId) return null;
  return rows.find((item) => String(item.id) === String(state.selectedBoardJobId)) || null;
}

function renderBoardJobDetails(item) {
  if (!item) return emptyState("Tap a job to view details.");
  return `
    ${renderSelectedJobDetail(item)}
    <div class="cp-detail-actions">${assignmentActions(item, "open")}</div>
  `;
}

function jobDetailDrawer() {
  if (!["dashboard", "job-board"].includes(pageKey)) return "";
  const item = selectedBoardJob(filteredOpenAssignments());
  if (!item) return "";
  return `
    <section class="cp-detail-drawer" role="dialog" aria-modal="true" aria-labelledby="cpBoardDetailTitle">
      <button class="cp-detail-backdrop" type="button" aria-label="Close job details" data-close-board-details></button>
      <article class="cp-detail-panel">
        <div class="cp-detail-panel-head">
          <div>
            <p class="cp-panel-kicker">Job Details</p>
            <h2 id="cpBoardDetailTitle">${esc(assignmentTitle(item))}</h2>
          </div>
          <button class="cp-ghost-action" type="button" data-close-board-details>Close</button>
        </div>
        ${renderBoardJobDetails(item)}
      </article>
    </section>
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
  const preferred = rows.filter(isPreferredOffer);
  const selected = selectedBoardJob(rows);
  return `
    <section class="cp-job-board-layout">
      ${panel("Jobs", `
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
        <div id="contractorAssignments">${renderJobBoardList(rows)}</div>
      `)}
      <aside class="cp-stack">
        ${panel("Filters", renderBoardFilterSummary())}
        ${panel("Job Details", renderBoardJobDetails(selected))}
      </aside>
    </section>
  `;
}

function option(value, label, current) {
  return `<option value="${esc(value)}" ${value === current ? "selected" : ""}>${esc(label)}</option>`;
}

function isPreferredOffer(item) {
  const preferredIds = Array.isArray(item.preferred_contractor_ids) ? item.preferred_contractor_ids : [];
  return normalizeToken(item.visibility) === "preferred" ||
    normalizeToken(item.status) === "preferred-pending" ||
    item.preferred_first === true ||
    preferredIds.includes(state.user?.id);
}

function renderJobBoardList(rows) {
  if (!rows.length) return emptyState("No open assignments available right now.");
  const preferred = rows.filter(isPreferredOffer);
  const general = rows.filter((item) => !isPreferredOffer(item));
  return `
    ${preferred.length ? `
      <div class="cp-job-list">
        <p class="cp-panel-kicker">Preferred Jobs</p>
        ${preferred.map((item) => assignmentRow(item, "open")).join("")}
      </div>
    ` : ""}
    ${general.length ? `
      <div class="cp-job-list ${preferred.length ? "cp-job-list-spaced" : ""}">
        <p class="cp-panel-kicker">Available Jobs</p>
        ${general.map((item) => assignmentRow(item, "open")).join("")}
      </div>
    ` : ""}
  `;
}

function filteredOpenAssignments() {
  const term = state.filters.search.trim().toLowerCase();
  return state.openAssignments.filter((item) => {
    if (!isClaimableBoardAssignment(item)) return false;
    const type = normalizeToken(item.assignment_type || item.recurrence_frequency || "one_time");
    if (state.filters.jobType !== "all" && type !== normalizeToken(state.filters.jobType)) return false;
    const pay = Number(item.pay_amount) || 0;
    if (state.filters.payRange === "0-100" && (pay < 0 || pay > 100)) return false;
    if (state.filters.payRange === "100-200" && (pay < 100 || pay > 200)) return false;
    if (state.filters.payRange === "200" && pay < 200) return false;
    if (!term) return true;
    return [item.title, item.property_name, item.address, item.service_type, assignmentUnitLabel(item), assignmentSquareFeetLabel(item), item.scope, item.special_instructions]
      .some((value) => String(value || "").toLowerCase().includes(term));
  }).sort((a, b) => {
    const preferredSort = Number(isPreferredOffer(b)) - Number(isPreferredOffer(a));
    if (preferredSort) return preferredSort;
    return dateValue(a.start_window) - dateValue(b.start_window);
  });
}

function renderBoardFilterSummary() {
  const rows = filteredOpenAssignments();
  return `
    <div class="cp-mini-list">
      <div class="cp-mini-row"><span>Showing</span><strong>${rows.length} jobs</strong></div>
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
        ${panel("Availability", renderAvailabilityEditor())}
      </aside>
    </section>
  `;
}

function renderAvailabilityEditor() {
  const availability = state.availability;
  const message = state.availabilityMessage
    ? `<p class="cp-status-message ${state.availabilityError ? "error" : ""}" aria-live="polite">${esc(state.availabilityMessage)}</p>`
    : "";
  return `
    <form id="cpAvailabilityForm" class="cp-availability-form">
      <div class="cp-mini-list">
        <div class="cp-mini-row">
          <span>Status</span>
          <strong>${esc(availabilityStatusLabel(availability.status))}</strong>
          <small>${esc(availabilityPersistenceLabel())}</small>
        </div>
        <div class="cp-mini-row">
          <span>Days</span>
          <strong>${esc(availabilityDaySummary(availability.days))}</strong>
          <small>${esc(availability.start_time)} - ${esc(availability.end_time)}</small>
        </div>
      </div>
      <label class="cp-field">
        <span>Status</span>
        <select name="status">
          ${availabilityStatuses.map(([value, label]) => option(value, label, availability.status)).join("")}
        </select>
      </label>
      <div class="cp-day-toggle-grid" aria-label="Available days">
        ${availabilityDays.map(([value, label]) => `
          <label class="cp-day-toggle">
            <input type="checkbox" name="available_days" value="${esc(value)}" ${availability.days[value] ? "checked" : ""} />
            <span>${esc(label)}</span>
          </label>
        `).join("")}
      </div>
      <div class="cp-availability-time-grid">
        <label class="cp-field">
          <span>Start</span>
          <input type="time" name="start_time" value="${esc(availability.start_time)}" />
        </label>
        <label class="cp-field">
          <span>End</span>
          <input type="time" name="end_time" value="${esc(availability.end_time)}" />
        </label>
      </div>
      <label class="cp-field">
        <span>Notes</span>
        <textarea name="notes" rows="3" maxlength="240">${esc(availability.notes)}</textarea>
      </label>
      <button class="cp-action" type="submit" ${state.availabilitySaving ? "disabled" : ""}>${state.availabilitySaving ? "Saving..." : "Save Availability"}</button>
      ${message}
    </form>
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
                <small>${esc(formatTime(item.start_window, "Time pending"))}</small>
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
  const messageTitle = state.messageComposerOpen ? "New Message" : "Message";
  return `
    <section class="cp-messages-layout">
      ${panel("Conversations", `
        <div class="cp-filter-row cp-message-toolbar">
          <button class="cp-action" type="button" data-cp-new-message>New Message</button>
          <button class="cp-ghost-action" type="button" data-cp-refresh-messages>Refresh</button>
        </div>
        <p id="cpMessageStatus" class="cp-status-message ${state.messageStatusError ? "error" : ""}" aria-live="polite">${esc(state.messageStatus)}</p>
        <div id="cpThreadList" class="cp-chat-list">${renderCpThreadList()}</div>
      `)}
      ${panel(messageTitle, `
        ${state.messageComposerOpen
          ? renderCpNewMessageComposer()
          : `<div id="cpConversation" class="cp-conversation">${renderCpConversation()}</div>`}
      `, { className: "cp-message-panel" })}
    </section>
  `;
}

function renderCpThreadList() {
  if (!state.messageThreads.length) return emptyState("No conversations yet.");
  return state.messageThreads.map((thread) => {
    const active = thread.id === state.selectedThreadId;
    const unread = cpThreadUnread(thread);
    return `
      <button class="cp-chat-item ${active ? "active" : ""} ${unread ? "unread" : ""}" type="button" data-cp-thread-id="${esc(thread.id)}">
        <strong>${esc(thread.subject || "Message")}</strong>
        <small>${esc(cpParticipantLine(thread.id))}</small>
        <span>${esc(formatMessageTime(thread.last_message_at || thread.created_at))}</span>
        <p>${esc(thread.last_message_preview || "No messages yet.")}</p>
      </button>
    `;
  }).join("");
}

function renderCpConversation() {
  const thread = selectedCpThread();
  if (!thread) {
    return `<div class="cp-conversation-box">${emptyState("Start a new message or select a conversation.")}</div>`;
  }
  return `
    <div class="cp-conversation-head">
      <div>
        <p class="cp-panel-kicker">Conversation</p>
        <h2>${esc(thread.subject || "Message")}</h2>
        <small class="cp-muted">${esc(cpParticipantLine(thread.id))}</small>
      </div>
    </div>
    <div class="cp-message-bubbles">
      ${state.messageMessages.length ? state.messageMessages.map(renderCpMessageBubble).join("") : emptyState("No replies yet.")}
    </div>
    <form id="cpMessageReplyForm" class="cp-message-reply-bar">
      <label class="cp-field cp-reply-field">
        <span class="sr-only">Reply</span>
        <textarea name="body" rows="2" placeholder="Type your reply..." required></textarea>
      </label>
      <button class="cp-action cp-reply-send" type="submit" ${state.messageSending ? "disabled" : ""}>Send</button>
    </form>
  `;
}

function renderCpNewMessageComposer() {
  return `
    <form id="cpNewThreadForm" class="cp-new-message-form">
      <div>
        <p class="cp-panel-kicker">Message Turnly</p>
        <h2>Start a conversation</h2>
        <p class="cp-muted">This will send directly to the Turnly admin team.</p>
      </div>
      <label class="cp-field">
        <span>Subject</span>
        <input name="subject" type="text" maxlength="120" placeholder="What is this about?" required />
      </label>
      <label class="cp-field">
        <span>Message</span>
        <textarea name="body" rows="6" placeholder="Type your message..." required></textarea>
      </label>
      <div class="cp-new-message-actions">
        <button class="cp-ghost-action" type="button" data-cp-cancel-new-message>Cancel</button>
        <button class="cp-action" type="submit" ${state.messageSending ? "disabled" : ""}>Send Message</button>
      </div>
    </form>
  `;
}

function renderCpMessageBubble(message) {
  const mine = message.sender_id === state.user?.id;
  return `
    <article class="cp-message-bubble ${mine ? "mine" : ""}">
      <div>
        <strong>${esc(message.sender_name || "User")}</strong>
        <small>${esc(formatMessageTime(message.created_at))}</small>
      </div>
      <p>${esc(message.body || "")}</p>
    </article>
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
  const accepted = acceptedPayAssignments();
  const owed = completedOwedAssignments();
  const paid = paidAssignments();
  const completedYtd = completedPayAssignments().filter((item) => isCurrentYear(item.completed_at || item.updated_at));
  return `
    ${renderPayMetrics({ accepted, owed, paid, completedYtd })}
    <section class="cp-payments-layout">
      <div class="cp-stack">
        ${panel("Accepted Job Pay", renderPayJobList(accepted, "No accepted jobs with pay yet."))}
        ${panel("Completed Owed", renderPayJobList(owed, "No completed jobs are waiting on payout."))}
        ${panel("Previous Payouts", `
          <div class="cp-filter-row">
            <label class="cp-search"><span>Week</span><input id="cpPayoutWeek" type="week" value="${esc(state.filters.payoutWeek)}" /></label>
            <label class="cp-search"><span>Search</span><input id="cpPayoutSearch" type="search" value="${esc(state.filters.payoutSearch)}" placeholder="Search payouts..." /></label>
            <button class="cp-ghost-action" type="button" data-clear-payout-week>Clear</button>
          </div>
          <div id="cpPayoutHistory">${renderPayoutHistory(filteredPayoutGroups())}</div>
        `)}
      </div>
      <aside class="cp-stack">
        ${panel("Year to Date", renderYearToDateSummary(completedYtd, paid, owed))}
        ${panel("Payout Summary", renderPayoutSummary(paid, owed))}
      </aside>
    </section>
  `;
}

function renderPayMetrics({ accepted, owed, paid, completedYtd }) {
  const paidYtd = paid.filter((item) => isCurrentYear(assignmentPaidDate(item) || item.completed_at || item.updated_at));
  return `
    <section class="cp-payment-grid">
      ${metric("Accepted Job Pay", money(totalPay(accepted)), `${accepted.length} active job(s)`, "$")}
      ${metric("Completed Owed", money(totalPay(owed)), "not paid out yet", "O")}
      ${metric("Previous Payouts", money(totalPay(paidYtd)), `${currentYear()} paid out`, "P")}
      ${metric("Year-to-Date Pay", money(totalPay(completedYtd)), `${completedYtd.length} completed job(s)`, "Y")}
    </section>
  `;
}

function renderPayJobList(rows, emptyText) {
  if (!rows.length) return emptyState(emptyText);
  return `
    <div class="cp-pay-card-list">
      ${rows.slice(0, 12).map((item) => `
        <article class="cp-pay-card">
          <div>
            <strong>${esc(assignmentTitle(item))}</strong>
            <small>${esc([formatWindow(item), titleCase(item.status)].filter(Boolean).join(" - "))}</small>
          </div>
          <strong>${esc(money(item.pay_amount))}</strong>
        </article>
      `).join("")}
    </div>
  `;
}

function renderPayoutHistory(groups) {
  if (!groups.length) return emptyState("No previous payouts match this week.");
  return `
    <div class="cp-table-wrap">
      <table class="cp-table">
        <thead><tr><th>Week</th><th>Jobs</th><th>Paid On</th><th>Payout</th><th>YTD Total</th></tr></thead>
        <tbody>
          ${groups.map((group) => `
            <tr>
              <td><strong>${esc(group.weekLabel)}</strong><small>${esc(group.weekKey)}</small></td>
              <td>${esc(String(group.count))}</td>
              <td>${esc(formatDate(group.paidDate, "Pending"))}</td>
              <td>${esc(money(group.amount))}</td>
              <td>${group.runningYtd == null ? "--" : esc(money(group.runningYtd))}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderYearToDateSummary(completedYtd, paid, owed) {
  const paidYtd = paid.filter((item) => isCurrentYear(assignmentPaidDate(item) || item.completed_at || item.updated_at));
  const owedYtd = owed.filter((item) => isCurrentYear(item.completed_at || item.updated_at));
  return `
    <div class="cp-mini-list">
      <div class="cp-mini-row"><span>Completed Pay</span><strong>${esc(money(totalPay(completedYtd)))}</strong><small>${currentYear()} running total</small></div>
      <div class="cp-mini-row"><span>Paid Out</span><strong>${esc(money(totalPay(paidYtd)))}</strong><small>${paidYtd.length} payout job(s)</small></div>
      <div class="cp-mini-row"><span>Still Owed</span><strong>${esc(money(totalPay(owedYtd)))}</strong><small>${owedYtd.length} completed job(s)</small></div>
    </div>
  `;
}

function renderPayoutSummary(paid, owed) {
  const latest = paid[0];
  return `
    <div class="cp-mini-list">
      <div class="cp-mini-row"><span>Latest Payout</span><strong>${esc(money(latest?.pay_amount))}</strong><small>${esc(formatDate(assignmentPaidDate(latest), "No payout recorded"))}</small></div>
      <div class="cp-mini-row"><span>Pending Total</span><strong>${esc(money(totalPay(owed)))}</strong><small>completed, not paid out</small></div>
      <div class="cp-mini-row"><span>Accepted Total</span><strong>${esc(money(totalPay(acceptedPayAssignments())))}</strong><small>scheduled or in progress</small></div>
    </div>
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
            <div class="cp-mini-row"><span>Completed Pay</span><strong>${esc(money(totalPay(completed)))}</strong></div>
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
  const authUser = userData?.user || null;
  state.user = authUser;
  if (!authUser) {
    window.location.href = "contractor-login.html";
    return;
  }

  const previewApplied = await applyContractorAdminPreview(authUser);

  await Promise.all([
    previewApplied ? Promise.resolve() : loadProfile(),
    loadAvailability(),
    loadOpenAssignments(),
    loadMyAssignments(),
    loadVideos(),
    loadMessageThreads()
  ]);
  state.loading = false;
  renderShell();
}

async function loadProfile() {
  let result = await supabase
    .from("profiles")
    .select("full_name,email,role,status,allowed_regions,allowed_property_ids,allowed_property_names")
    .eq("id", state.user.id)
    .maybeSingle();
  if (result.error) {
    result = await supabase
      .from("profiles")
      .select("full_name,email,role,status")
      .eq("id", state.user.id)
      .maybeSingle();
  }
  state.profile = result.data || null;
}

async function loadAvailability() {
  const stored = readStoredAvailability();
  if (stored) state.availability = stored;

  const { data, error } = await supabase
    .from("contractor_availability")
    .select("status,days,preferred_start_time,preferred_end_time,notes,updated_at")
    .eq("contractor_id", state.user.id)
    .maybeSingle();

  if (!error && data) {
    state.availability = normalizeAvailability(data);
    state.availabilityPersistence = "database";
    writeStoredAvailability(state.availability);
  }
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

  state.openAssignments = (data || [])
    .filter(isClaimableBoardAssignment)
    .filter(matchesContractorAccess)
    .filter(matchesContractorPreviewProperty);
}

async function loadMyAssignments() {
  let query = supabase
    .from("assignment_blocks")
    .select("*")
    .order("start_window", { ascending: true });

  if (!state.adminPreview) {
    query = query.or(`claimed_by.eq.${state.user.id},assigned_to.eq.${state.user.id}`);
  }

  const { data, error } = await query;

  if (error) {
    state.message = `Unable to load my jobs: ${error.message}`;
    state.messageError = true;
    state.myAssignments = [];
    return;
  }

  state.myAssignments = (data || [])
    .filter(matchesContractorPreviewUser)
    .filter(matchesContractorPreviewProperty);
}

async function loadVideos() {
  const { data, error } = await supabase
    .from("qa_videos")
    .select("id,title,label,video_phase,property_name,unit_name,contractor_name,recorded_at,notes,created_at")
    .order("created_at", { ascending: false })
    .limit(24);
  const rows = error ? [] : data || [];
  state.videos = state.adminPreview
    ? rows.filter((row) => matchesContractorPreviewProperty(row) && matchesContractorPreviewUser(row))
    : rows;
}

async function loadMessageThreads() {
  if (!supabase || !state.user?.id) return;

  const { data: ownParticipants, error: participantError } = await supabase
    .from("message_thread_participants")
    .select("thread_id,last_read_at")
    .eq("user_id", state.user.id)
    .eq("is_archived", false);

  if (participantError) {
    state.messageThreads = [];
    state.messageParticipants = [];
    state.messageMessages = [];
    state.messageStatus = `Unable to load messages: ${participantError.message}`;
    state.messageStatusError = true;
    return;
  }

  const threadIds = [...new Set((ownParticipants || []).map((row) => row.thread_id).filter(Boolean))];
  if (!threadIds.length) {
    state.messageThreads = [];
    state.messageParticipants = [];
    state.messageMessages = [];
    state.selectedThreadId = "";
    state.messageStatus = "No conversations yet.";
    state.messageStatusError = false;
    return;
  }

  const [threadsResult, participantsResult] = await Promise.all([
    supabase.from("message_threads").select("*").in("id", threadIds).order("last_message_at", { ascending: false }),
    supabase.from("message_thread_participants").select("*").in("thread_id", threadIds).order("display_name", { ascending: true })
  ]);

  if (threadsResult.error || participantsResult.error) {
    state.messageStatus = `Unable to load messages: ${(threadsResult.error || participantsResult.error).message}`;
    state.messageStatusError = true;
    return;
  }

  state.messageThreads = threadsResult.data || [];
  state.messageParticipants = participantsResult.data || [];
  if (!state.messageThreads.some((thread) => thread.id === state.selectedThreadId)) {
    state.selectedThreadId = state.messageThreads[0]?.id || "";
  }
  await loadMessageThreadMessages(state.selectedThreadId);
  if (pageKey === "messages") await markCpMessageThreadRead(state.selectedThreadId);
  state.messageStatus = `${state.messageThreads.length} conversation${state.messageThreads.length === 1 ? "" : "s"} loaded.`;
  state.messageStatusError = false;
}

async function loadMessageThreadMessages(threadId) {
  if (!supabase || !threadId) {
    state.messageMessages = [];
    return;
  }

  const { data, error } = await supabase
    .from("message_thread_messages")
    .select("*")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true })
    .limit(300);

  if (error) {
    state.messageMessages = [];
    state.messageStatus = `Unable to load conversation: ${error.message}`;
    state.messageStatusError = true;
    return;
  }

  state.messageMessages = data || [];
}

async function createCpMessageThread(form) {
  const body = form.elements.body?.value?.trim() || "";
  const subject = form.elements.subject?.value?.trim() || "Message";
  if (!body) return;

  state.messageSending = true;
  state.messageStatus = "Sending message...";
  state.messageStatusError = false;
  renderShell();

  const { data, error } = await supabase.rpc("create_message_thread_v2", {
    message_payload: {
      recipient_ids: [],
      subject,
      body,
      related_type: "",
      related_id: "",
      related_title: ""
    }
  });

  state.messageSending = false;
  if (error) {
    state.messageStatus = `Unable to send message: ${error.message}`;
    state.messageStatusError = true;
    renderShell();
    return;
  }

  state.selectedThreadId = data || state.selectedThreadId;
  state.messageComposerOpen = false;
  await loadMessageThreads();
  state.messageStatus = "Message sent.";
  state.messageStatusError = false;
  renderShell();
}

async function sendCpMessageReply(form) {
  const thread = selectedCpThread();
  const body = form.elements.body?.value?.trim() || "";
  if (!thread || !body) return;

  state.messageSending = true;
  state.messageStatus = "Sending reply...";
  state.messageStatusError = false;
  renderShell();

  const { error } = await supabase.rpc("send_message_reply_v2", {
    message_payload: {
      thread_id: thread.id,
      body
    }
  });

  state.messageSending = false;
  if (error) {
    state.messageStatus = `Unable to send reply: ${error.message}`;
    state.messageStatusError = true;
    renderShell();
    return;
  }

  await loadMessageThreads();
  renderShell();
}

async function markCpMessageThreadRead(threadId) {
  if (!supabase || !threadId) return;
  const readAt = new Date().toISOString();
  const { error } = await supabase.rpc("mark_message_thread_read", { target_thread_id: threadId });
  if (error) {
    await supabase
      .from("message_thread_participants")
      .update({ last_read_at: readAt })
      .eq("thread_id", threadId)
      .eq("user_id", state.user?.id || "");
  }
  const own = cpOwnThreadParticipant(threadId);
  if (own) own.last_read_at = readAt;
  state.messageReadAt.set(threadId, readAt);
}

function selectedCpThread() {
  return state.messageThreads.find((thread) => thread.id === state.selectedThreadId) || null;
}

function cpThreadParticipants(threadId) {
  return state.messageParticipants.filter((participant) => participant.thread_id === threadId);
}

function cpOwnThreadParticipant(threadId) {
  return cpThreadParticipants(threadId).find((participant) => participant.user_id === state.user?.id) || null;
}

function cpParticipantLine(threadId) {
  const names = cpThreadParticipants(threadId)
    .filter((participant) => participant.user_id !== state.user?.id)
    .map((participant) => participant.display_name || participant.email || titleCase(participant.role || "Turnly"))
    .filter(Boolean);
  return names.length ? names.join(", ") : "Turnly Operations";
}

function cpThreadUnread(thread) {
  const own = cpOwnThreadParticipant(thread.id);
  if (!own || !thread.last_message_at) return false;
  const lastMessageAt = new Date(thread.last_message_at).getTime();
  const storedReadAt = own.last_read_at ? new Date(own.last_read_at).getTime() : 0;
  const localReadAt = state.messageReadAt.get(thread.id)
    ? new Date(state.messageReadAt.get(thread.id)).getTime()
    : 0;
  const readAt = Math.max(storedReadAt || 0, localReadAt || 0);
  if (!readAt) return true;
  return lastMessageAt > readAt;
}

function cpUnreadMessageCount() {
  return state.messageThreads.filter(cpThreadUnread).length;
}

function cpCountLabel(count) {
  return count > 99 ? "99+" : String(count || 0);
}

function cpNavBadge(key) {
  const count = key === "messages" ? cpUnreadMessageCount() : 0;
  return count ? `<em class="cp-nav-badge">${esc(cpCountLabel(count))}</em>` : "";
}

function formatMessageTime(value) {
  if (!value) return "No date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No date";
  return date.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

async function claimAssignment(assignmentId) {
  state.message = "Claiming assignment...";
  state.messageError = false;
  renderShell();

  let result = null;
  if (!state.adminPreview) {
    result = await supabase.rpc("claim_assignment_block", { target_assignment_id: assignmentId });
  }
  if (state.adminPreview || (result?.error && /function|schema cache|not found/i.test(result.error.message || ""))) {
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

  if (result?.error) {
    state.message = `Unable to claim assignment: ${result.error.message}`;
    state.messageError = true;
  } else {
    state.message = "Assignment claimed. It is now in My Jobs.";
    state.messageError = false;
  }

  await Promise.all([loadOpenAssignments(), loadMyAssignments()]);
  renderShell();
}

async function saveAvailability(form) {
  const formData = new FormData(form);
  const selectedDays = new Set(formData.getAll("available_days").map(String));
  const next = normalizeAvailability({
    status: formData.get("status"),
    days: Object.fromEntries(availabilityDays.map(([key]) => [key, selectedDays.has(key)])),
    start_time: formData.get("start_time") || "08:00",
    end_time: formData.get("end_time") || "17:00",
    notes: formData.get("notes") || "",
    updated_at: new Date().toISOString()
  });

  state.availability = next;
  state.availabilitySaving = true;
  state.availabilityMessage = "Saving availability...";
  state.availabilityError = false;
  writeStoredAvailability(next);
  renderShell();

  const payload = {
    contractor_id: state.user.id,
    status: next.status,
    days: next.days,
    preferred_start_time: next.start_time || null,
    preferred_end_time: next.end_time || null,
    notes: next.notes,
    updated_at: next.updated_at
  };

  const { data, error } = await supabase
    .from("contractor_availability")
    .upsert(payload, { onConflict: "contractor_id" })
    .select("status,days,preferred_start_time,preferred_end_time,notes,updated_at")
    .maybeSingle();

  state.availabilitySaving = false;
  if (error) {
    state.availabilityPersistence = "device";
    state.availabilityMessage = "Availability saved on this device.";
    state.availabilityError = false;
  } else {
    state.availability = normalizeAvailability(data || payload);
    state.availabilityPersistence = "database";
    state.availabilityMessage = "Availability updated.";
    state.availabilityError = false;
    writeStoredAvailability(state.availability);
  }
  renderShell();
}

function refreshFilterOnly() {
  if (pageKey === "job-board") {
    const target = document.getElementById("contractorAssignments");
    if (target) {
      const rows = filteredOpenAssignments();
      target.innerHTML = renderJobBoardList(rows);
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
  if (pageKey === "payments") {
    const target = document.getElementById("cpPayoutHistory");
    if (target) target.innerHTML = renderPayoutHistory(filteredPayoutGroups());
  }
}

function attachEvents() {
  root?.addEventListener("click", async (event) => {
    const themeToggle = event.target.closest("[data-contractor-theme-toggle]");
    if (themeToggle) {
      const nextTheme = readDashboardTheme() === "light" ? "dark" : "light";
      writeDashboardTheme(nextTheme);
      applyDashboardTheme();
      updateDashboardThemeToggle();
      return;
    }

    const previewButton = event.target.closest("#adminPreviewBtn");
    if (previewButton) {
      state.adminPreviewMenuOpen = !state.adminPreviewMenuOpen;
      state.profileMenuOpen = false;
      renderShell();
      return;
    }

    const previewOpenButton = event.target.closest("[data-admin-preview-open]");
    if (previewOpenButton) {
      const context = adminPreviewContextFromControls();
      window.location.href = adminPreviewTargetUrl(context);
      return;
    }

    const previewClearButton = event.target.closest("[data-admin-preview-clear]");
    if (previewClearButton) {
      clearAdminPreviewContext();
      state.adminPreviewMenuOpen = false;
      window.location.href = "admin.html";
      return;
    }

    if (state.adminPreviewMenuOpen && !event.target.closest(".admin-preview-wrap")) {
      state.adminPreviewMenuOpen = false;
      renderShell();
      return;
    }

    const mobileMoreButton = event.target.closest("[data-mobile-more-toggle]");
    if (mobileMoreButton) {
      const open = mobileMoreButton.getAttribute("aria-expanded") !== "true";
      document.body.classList.toggle("cp-mobile-more-open", open);
      mobileMoreButton.setAttribute("aria-expanded", String(open));
      const panel = document.getElementById("cpMobileMorePanel");
      if (panel) panel.hidden = !open;
      return;
    }

    if (document.body.classList.contains("cp-mobile-more-open") &&
      !event.target.closest(".cp-mobile-more-panel") &&
      !event.target.closest(".cp-mobile-nav")) {
      document.body.classList.remove("cp-mobile-more-open");
      const panel = document.getElementById("cpMobileMorePanel");
      if (panel) panel.hidden = true;
      document.querySelector("[data-mobile-more-toggle]")?.setAttribute("aria-expanded", "false");
    }

    const logoutButton = event.target.closest("[data-contractor-logout], #logoutBtn");
    if (logoutButton) {
      await supabase?.auth.signOut();
      window.location.href = "https://portal.turnlypros.com/";
      return;
    }

    const profileToggle = event.target.closest("[data-contractor-profile-toggle]");
    if (profileToggle) {
      state.profileMenuOpen = !state.profileMenuOpen;
      state.adminPreviewMenuOpen = false;
      renderShell();
      return;
    }

    if (state.profileMenuOpen && !event.target.closest("[data-contractor-profile-menu], [data-contractor-profile-toggle]")) {
      state.profileMenuOpen = false;
      renderShell();
      return;
    }

    const refreshMessages = event.target.closest("[data-cp-refresh-messages]");
    if (refreshMessages) {
      await loadMessageThreads();
      renderShell();
      return;
    }

    const newMessageButton = event.target.closest("[data-cp-new-message]");
    if (newMessageButton) {
      state.messageComposerOpen = true;
      state.messageStatus = "";
      state.messageStatusError = false;
      renderShell();
      return;
    }

    const cancelNewMessageButton = event.target.closest("[data-cp-cancel-new-message]");
    if (cancelNewMessageButton) {
      state.messageComposerOpen = false;
      renderShell();
      return;
    }

    const threadButton = event.target.closest("[data-cp-thread-id]");
    if (threadButton) {
      state.messageComposerOpen = false;
      state.selectedThreadId = threadButton.dataset.cpThreadId || "";
      await markCpMessageThreadRead(state.selectedThreadId);
      await loadMessageThreadMessages(state.selectedThreadId);
      renderShell();
      return;
    }

    const claimButton = event.target.closest("[data-claim-assignment-id]");
    if (claimButton) {
      claimButton.disabled = true;
      await claimAssignment(claimButton.dataset.claimAssignmentId);
      return;
    }

    const closeBoardDetails = event.target.closest("[data-close-board-details]");
    if (closeBoardDetails) {
      state.selectedBoardJobId = "";
      renderShell();
      return;
    }

    const boardDetailTarget = event.target.closest("[data-open-job-details-id]");
    if (boardDetailTarget && !event.target.closest("button, a, input, select, textarea, label")) {
      state.selectedBoardJobId = boardDetailTarget.dataset.openJobDetailsId;
      renderShell();
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

    const clearPayoutWeek = event.target.closest("[data-clear-payout-week]");
    if (clearPayoutWeek) {
      state.filters.payoutWeek = "";
      state.filters.payoutSearch = "";
      renderShell();
      return;
    }
  });

  root?.addEventListener("input", (event) => {
    if (event.target.matches("#cpGlobalSearch, #cpBoardSearch, #cpVideoSearch")) {
      state.filters.search = event.target.value;
      refreshFilterOnly();
    }
    if (event.target.matches("#cpPayoutSearch")) {
      state.filters.payoutSearch = event.target.value;
      refreshFilterOnly();
    }
  });

  root?.addEventListener("change", (event) => {
    if (event.target.matches("[data-admin-preview-field]")) {
      adminPreviewContextFromControls();
      return;
    }
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
    if (event.target.matches("#cpPayoutWeek")) {
      state.filters.payoutWeek = event.target.value;
      refreshFilterOnly();
    }
  });

  root?.addEventListener("submit", async (event) => {
    if (event.target.matches("#cpAvailabilityForm")) {
      event.preventDefault();
      await saveAvailability(event.target);
    }
    if (event.target.matches("#cpNewThreadForm")) {
      event.preventDefault();
      await createCpMessageThread(event.target);
    }
    if (event.target.matches("#cpMessageReplyForm")) {
      event.preventDefault();
      await sendCpMessageReply(event.target);
    }
  });

  root?.addEventListener("keydown", (event) => {
    const boardDetailTarget = event.target.closest?.("[data-open-job-details-id]");
    if (boardDetailTarget && !event.target.closest("button, a, input, select, textarea, label") && ["Enter", " "].includes(event.key)) {
      event.preventDefault();
      state.selectedBoardJobId = boardDetailTarget.dataset.openJobDetailsId;
      renderShell();
    }
    if (event.key === "Escape" && state.selectedBoardJobId) {
      state.selectedBoardJobId = "";
      renderShell();
    }
    if (event.key === "Escape" && state.profileMenuOpen) {
      state.profileMenuOpen = false;
      renderShell();
    }
    if (event.key === "Escape" && state.adminPreviewMenuOpen) {
      state.adminPreviewMenuOpen = false;
      renderShell();
    }
  });
}

attachEvents();
applyDashboardTheme();
renderShell();
void loadData();
