import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const VIDEO_BUCKET = "qa-videos";
const SIGNED_URL_SECONDS = 60 * 60 * 4;

const env = window.__ENV || {};
const supabase = env.SUPABASE_URL && env.SUPABASE_ANON_KEY
  ? createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY)
  : null;

const managerMain = document.querySelector(".command-main");

const state = {
  user: null,
  profile: null,
  property: null,
  client: null,
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
  selectedVideoKey: "",
  view: "overview",
  requestOpen: false,
  filters: {
    query: "",
    requestStatus: "all",
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
  contractor: "contractor.html",
  sales: "sales.html",
  sales_team: "sales.html",
  property_manager: "property-manager.html"
};

const viewLabels = {
  overview: ["Overview", "Your assigned property overview."],
  "turn-requests": ["Turn Requests", "Manage unit turn requests and track progress."],
  schedule: ["Schedule", "View upcoming unit turns and scheduling windows."],
  "unit-videos": ["Unit Videos", "View before and after videos for completed and in-progress unit turns."],
  messages: ["Messages", "View conversations and communication updates."],
  invoices: ["Invoices", "Track completed services and invoice activity."],
  settings: ["Settings", "Property manager account and portal preferences."],
  support: ["Help & Support", "Send questions, changes, or service feedback to Turnly."]
};

const navViews = new Set(Object.keys(viewLabels));
const closedStatuses = new Set(["completed", "complete", "cancelled", "canceled", "declined", "deleted", "archived"]);
const issueStatuses = new Set(["overdue", "qa_pending", "qa_rejected", "rejected", "needs_rework"]);
const inProgressStatuses = new Set(["in_progress", "claimed", "started", "active", "qa_pending"]);
const readyStatuses = new Set(["ready", "open", "scheduled", "pending", "not_started"]);

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

function getPortalHome(role) {
  return roleDashboards[normalizeRole(role)] || "contractor.html";
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

function propertyTitle(property = state.property) {
  return property?.name || property?.property_name || property?.company_name || "Linked Property";
}

function propertyAddress(property = state.property) {
  return property?.address || compact([property?.city, property?.state, property?.postal_code]).join(", ") || "No address on file";
}

function assignmentTitle(row) {
  return row?.title || row?.property_name || propertyTitle() || "Cleaning assignment";
}

function assignmentUnit(row) {
  const meta = rowMeta(row);
  return row?.unit_number || row?.unit_name || row?.property_unit_name || meta.unit_number || meta.unit_name || meta.unit_id || "";
}

function matchingUnit(rowOrValue) {
  const unitName = typeof rowOrValue === "string" ? rowOrValue : assignmentUnit(rowOrValue);
  if (!unitName) return null;
  return state.units.find((unit) => String(unit.unit_name || "").toLowerCase() === String(unitName).toLowerCase()) || null;
}

function unitBedBath(rowOrUnit) {
  const unit = rowOrUnit?.unit_name ? rowOrUnit : matchingUnit(rowOrUnit);
  const meta = rowMeta(rowOrUnit);
  const bedrooms = unit?.bedrooms || unit?.beds || meta.bedrooms || meta.beds;
  const bathrooms = unit?.bathrooms || unit?.baths || meta.bathrooms || meta.baths;
  return compact([
    bedrooms ? `${bedrooms} Bed` : "",
    bathrooms ? `${bathrooms} Bath` : ""
  ]).join(" / ") || rowOrUnit?.service_type || "Standard Turn";
}

function assignmentCleaner(row) {
  return row?.assigned_to_name || row?.claimed_by_name || row?.completed_by_name || "Turnly crew";
}

function assignmentCustomerAmount(row) {
  const meta = rowMeta(row);
  return asNumber(
    row?.customer_amount ||
    row?.customer_charge ||
    row?.customer_price ||
    row?.invoice_amount ||
    row?.total_amount ||
    meta.unit_customer_price ||
    meta.customer_price ||
    meta.customer_charge
  );
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
  if (status.includes("hold") || status.includes("paused")) return "on_hold";
  if (inProgressStatuses.has(status)) return "in_progress";
  if (readyStatuses.has(status)) return status === "ready" ? "ready" : "open";
  return status || "open";
}

function sortedAssignments(rows = state.assignments, direction = "asc") {
  const factor = direction === "desc" ? -1 : 1;
  return [...rows].sort((a, b) => (dateValue(a.start_window || a.recurring_due_at, 0) - dateValue(b.start_window || b.recurring_due_at, 0)) * factor);
}

function activeAssignments() {
  return sortedAssignments(state.assignments.filter((row) => !isClosedAssignment(row)));
}

function recentCompletedAssignments() {
  return sortedAssignments(state.assignments.filter(isCompletedAssignment), "desc");
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

function isDateBetween(value, start, end) {
  const time = dateValue(value, NaN);
  return Number.isFinite(time) && time >= start.getTime() && time < end.getTime();
}

function currentView() {
  const raw = (window.location.hash || "#overview").replace(/^#/, "") || "overview";
  return navViews.has(raw) ? raw : "overview";
}

function queryMatches(values) {
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
  const completedThisWeek = completed.filter((row) => isDateBetween(row.completed_at || row.checklist_completed_at || row.qa_approved_at || row.start_window, thisWeekStart, thisWeekEnd)).length;
  const completedLastWeek = completed.filter((row) => isDateBetween(row.completed_at || row.checklist_completed_at || row.qa_approved_at || row.start_window, lastWeekStart, thisWeekStart)).length;
  const inProgress = assignments.filter((row) => inProgressStatuses.has(assignmentStatus(row))).length;
  const open = activeAssignments().filter((row) => requestGroup(row) === "open" || requestGroup(row) === "ready").length;
  const scheduled = assignments.filter((row) => requestGroup(row) === "scheduled" || isUpcomingAssignment(row)).length;
  const ready = assignments.filter((row) => requestGroup(row) === "ready").length || Math.max(state.units.length - inProgress, 0);
  const beforeVideos = state.videos.filter((video) => normalizeToken(video.video_phase) === "before").length;
  const afterVideos = state.videos.filter((video) => ["after", "final"].includes(normalizeToken(video.video_phase))).length;
  const videoSets = new Set(state.videos.map((video) => video.assignment_id || video.pair_id || video.id).filter(Boolean)).size;
  const unread = state.threads.filter(managerThreadUnread).length;
  const invoiceTotal = completed.reduce((sum, row) => sum + assignmentCustomerAmount(row), 0);
  const approvedTotal = completed
    .filter((row) => ["approved_for_pay", "paid", "paid_out", "settled"].includes(paymentStatus(row)) || row.qa_approved_at)
    .reduce((sum, row) => sum + assignmentCustomerAmount(row), 0);

  return {
    ready,
    inProgress,
    beforeAfter: Math.max(videoSets, Math.min(beforeVideos, afterVideos), state.videos.length),
    completedThisWeek,
    completedLastWeek,
    totalRequests: assignments.length,
    open,
    scheduled,
    upcoming: upcomingAssignments(500).length,
    issues: issueAssignments().length,
    units: state.units.length,
    unread,
    inbox: state.threads.length,
    beforeVideos,
    afterVideos,
    invoiceTotal,
    approvedTotal
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

  let { data: profile, error } = await supabase
    .from("profiles")
    .select("id,role,full_name,email,status,property_manager_property_id")
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

  const role = normalizeRole(profile?.role);

  if (!profile) {
    window.location.href = "property-manager-login.html";
    return;
  }

  if (role !== "property_manager") {
    window.location.href = getPortalHome(role);
    return;
  }

  if (!isActiveProfile(profile)) {
    renderLockedState("Approval pending", "A Turnly admin must approve this property manager account before property data is visible.");
    return;
  }

  if (!profile.property_manager_property_id) {
    const setupText = profile.access_setup_error
      ? "This account is approved, but the account-access migration is still needed before a property can be linked."
      : "A Turnly admin must link this property manager account to a specific property before any property data is visible.";
    renderLockedState("Property link required", setupText);
    return;
  }

  const { data: property, error: propertyError } = await supabase
    .from("portal_properties")
    .select("*")
    .eq("id", profile.property_manager_property_id)
    .maybeSingle();

  if (propertyError || !property) {
    renderLockedState("Property access unavailable", "This account has a property link, but the linked property could not be loaded.");
    return;
  }

  state.user = user;
  state.profile = profile;
  state.property = property;
  state.view = currentView();
  renderManagerPortal(true);
  await refreshManagerPortal();
}

async function refreshManagerPortal() {
  if (!state.property?.id || state.refreshing) return;
  state.refreshing = true;
  state.dataMessage = "Refreshing property data...";
  state.dataError = false;
  renderManagerPortal(true);

  await loadManagerData();
  await loadManagerMessages();

  state.refreshing = false;
  renderManagerPortal();
}

async function loadManagerData() {
  const notes = [];
  const propertyId = state.property?.id;
  state.client = null;
  state.units = [];
  state.assignments = [];
  state.qaJobs = [];
  state.videos = [];

  if (!supabase || !propertyId) return;

  const [clientResult, unitResult, assignmentResult] = await Promise.allSettled([
    loadLinkedClient(),
    loadPropertyUnits(propertyId),
    loadPropertyAssignments(propertyId)
  ]);

  for (const result of [clientResult, unitResult, assignmentResult]) {
    if (result.status === "fulfilled" && result.value) notes.push(result.value);
    if (result.status === "rejected") notes.push(result.reason?.message || "Some property data could not be loaded.");
  }

  const [qaNote, videoNote] = await Promise.all([
    loadManagerQaJobs(),
    loadManagerVideos()
  ]);
  if (qaNote) notes.push(qaNote);
  if (videoNote) notes.push(videoNote);

  state.dataMessage = notes.length ? notes.join(" ") : "Property data synced.";
  state.dataError = notes.some((note) => /^Unable|^Some|unavailable/i.test(note));
}

async function loadLinkedClient() {
  if (!state.property?.client_id) return "";
  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .eq("id", state.property.client_id)
    .maybeSingle();
  if (error) return `Client details unavailable: ${error.message}.`;
  state.client = data || null;
  return "";
}

async function loadPropertyUnits(propertyId) {
  const { data, error } = await supabase
    .from("property_units")
    .select("*")
    .eq("property_id", propertyId)
    .order("unit_name", { ascending: true })
    .limit(1000);
  if (error) return `Units unavailable: ${error.message}.`;
  state.units = data || [];
  return "";
}

async function loadPropertyAssignments(propertyId) {
  const filter = `portal_property_id.eq.${propertyId},recurring_portal_property_id.eq.${propertyId}`;
  let { data, error } = await supabase
    .from("assignment_blocks")
    .select("*")
    .or(filter)
    .order("start_window", { ascending: false, nullsFirst: false })
    .limit(500);

  if (error) {
    const fallback = await supabase
      .from("assignment_blocks")
      .select("*")
      .eq("portal_property_id", propertyId)
      .order("start_window", { ascending: false, nullsFirst: false })
      .limit(500);
    data = fallback.data;
    error = fallback.error;
  }

  if (error) return `Assignments unavailable: ${error.message}.`;
  state.assignments = data || [];
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
  return [...new Set(compact([
    state.property?.id,
    state.property?.client_id,
    state.property?.property_id,
    state.client?.id,
    propertyMeta.client_id,
    propertyMeta.property_id,
    ...state.assignments.flatMap((row) => {
      const meta = rowMeta(row);
      return [row.property_id, row.portal_property_id, row.recurring_portal_property_id, meta.property_id, meta.portal_property_id];
    })
  ]))];
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
  const requests = [
    ...propertyIds.slice(0, 10).map((id) => supabase
      .from("qa_videos")
      .select("*")
      .eq("property_id", id)
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
  let errors = 0;
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
  setActiveNav();
  const [title, subtitle] = viewLabels[state.view] || viewLabels.overview;
  const headingTitle = state.view === "overview" ? propertyTitle() : title;
  const headingSubtitle = state.view === "overview" ? "Your assigned property overview." : subtitle;

  managerMain.innerHTML = `
    <header class="command-header pm-page-header">
      <div class="pm-heading">
        <h1>${esc(headingTitle)}</h1>
        <p>${esc(headingSubtitle)}</p>
      </div>
      ${renderTopBar()}
    </header>
    ${renderDataStatus(loading)}
    ${renderRequestForm()}
    ${renderCurrentView()}
  `;
}

function renderTopBar() {
  const name = getName(state.user, state.profile);
  const unread = managerMetrics().unread;
  return `
    <div class="pm-topbar">
      <label class="pm-search">
        <span class="sr-only">Search property manager portal</span>
        <span>Search</span>
        <input data-pm-filter="query" value="${esc(state.filters.query)}" placeholder="Search units, requests, or updates..." />
        <kbd>K</kbd>
      </label>
      <button class="notification-btn pm-notification" type="button" aria-label="${unread} unread messages" data-pm-view-button="messages">
        <span>${integer(unread)}</span>
      </button>
      <button class="pm-user-chip" type="button" data-manager-logout>
        <span class="avatar">${esc(initialsFromName(name))}</span>
        <span><strong>${esc(name)}</strong><small>Property Manager</small></span>
        <span>v</span>
      </button>
    </div>
  `;
}

function renderDataStatus(loading) {
  const message = loading ? state.dataMessage || "Loading property data..." : state.dataMessage;
  return message ? `<p id="managerDataStatus" class="pm-page-status ${state.dataError ? "error" : ""}" aria-live="polite">${esc(message)}</p>` : "";
}

function renderCurrentView() {
  if (state.view === "turn-requests") return renderTurnRequestsView();
  if (state.view === "schedule") return renderScheduleView();
  if (state.view === "unit-videos") return renderUnitVideosView();
  if (state.view === "messages") return renderMessagesView();
  if (state.view === "invoices") return renderInvoicesView();
  if (state.view === "settings") return renderSettingsView();
  if (state.view === "support") return renderSupportView();
  return renderOverviewView();
}

function statCard(label, value, caption, tone = "green", view = "") {
  return `
    <article class="panel-card pm-stat-card ${esc(tone)}">
      <span class="pm-stat-icon">${esc(label.slice(0, 1))}</span>
      <div>
        <small>${esc(label)}</small>
        <strong>${esc(value)}</strong>
        <em>${esc(caption)}</em>
      </div>
      ${view ? `<button class="pm-link-button" type="button" data-pm-view-button="${esc(view)}">View</button>` : ""}
    </article>
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
    <section class="pm-stat-grid pm-stat-grid-four" aria-label="Property manager overview">
      ${statCard("Units Ready", integer(metrics.ready), "Ready for Move-In", "green", "turn-requests")}
      ${statCard("In Progress", integer(metrics.inProgress), "Currently Being Cleaned", "violet", "turn-requests")}
      ${statCard("Before & After Videos", integer(metrics.beforeAfter), "Ready to Watch", "blue", "unit-videos")}
      ${statCard("Completed This Week", integer(metrics.completedThisWeek), `${delta >= 0 ? "+" : ""}${delta}% vs last week`, "cyan", "schedule")}
    </section>

    <section class="pm-overview-grid">
      ${panel("Turn Requests", renderOverviewRequests(), {
        className: "pm-overview-requests",
        action: `<button class="new-btn pm-compact-btn" type="button" data-manager-request-toggle>+ New Turn Request</button>`
      })}
      <aside class="pm-side-stack">
        ${panel("Schedule Snapshot", renderScheduleSnapshot(), {
          action: `<select class="pm-mini-select" data-pm-schedule-range><option>This Week</option><option>Next Week</option></select>`
        })}
        ${renderUpdatesPanel("Messages / Updates")}
      </aside>
      ${panel("Before & After Videos", renderVideoRail(), {
        className: "pm-video-overview",
        copy: "Watch recent unit turn videos",
        action: `<button class="pm-link-button" type="button" data-pm-view-button="unit-videos">View all videos</button>`
      })}
    </section>
  `;
}

function renderOverviewRequests() {
  const rows = filteredRequests().slice(0, 5);
  return `
    <div class="pm-tabs">
      ${["all", "in_progress", "ready", "on_hold"].map((key) => `<button type="button" class="${state.filters.requestStatus === key ? "active" : ""}" data-pm-request-status="${key}">${esc(titleCase(key))}</button>`).join("")}
    </div>
    ${rows.length ? renderRequestTable(rows, true) : emptyBlock("No turn requests", "New unit turns will appear here once Turnly schedules work.")}
    <div class="pm-panel-footer"><button class="pm-link-button" type="button" data-pm-view-button="turn-requests">View all turn requests</button></div>
  `;
}

function renderTurnRequestsView() {
  const metrics = managerMetrics();
  const rows = filteredRequests();
  return `
    ${renderRequestToolbar("Search turn requests...", true)}
    <section class="pm-stat-grid pm-stat-grid-five" aria-label="Turn request metrics">
      ${statCard("Total Requests", integer(metrics.totalRequests), "for linked property", "green")}
      ${statCard("Open", integer(metrics.open), "ready to assign", "yellow")}
      ${statCard("In Progress", integer(metrics.inProgress), "being handled now", "blue")}
      ${statCard("Scheduled", integer(metrics.scheduled), "on the calendar", "violet")}
      ${statCard("Completed This Week", integer(metrics.completedThisWeek), "closed out", "green")}
    </section>
    <section class="pm-workspace-grid">
      ${panel("Turn Requests", rows.length ? renderRequestTable(rows) : emptyBlock("No matching requests", "Try clearing the search or status filter."), { className: "pm-table-panel" })}
      ${panel("Request Details", renderRequestDetails(selectedAssignment(rows)), { className: "pm-detail-panel" })}
    </section>
    <section class="pm-two-column-grid">
      ${panel("Recent Activity", renderRecentActivity(), { className: "pm-activity-panel" })}
      ${renderUpdatesPanel("Messages / Updates")}
    </section>
  `;
}

function renderRequestToolbar(placeholder = "Search...", includeNew = false) {
  return `
    <section class="panel-card pm-toolbar">
      <label class="pm-search pm-local-search">
        <span class="sr-only">${esc(placeholder)}</span>
        <span>Search</span>
        <input data-pm-filter="query" value="${esc(state.filters.query)}" placeholder="${esc(placeholder)}" />
      </label>
      <select data-pm-filter="requestStatus" aria-label="Status">
        ${selectOption("all", "Status", state.filters.requestStatus)}
        ${selectOption("open", "Open", state.filters.requestStatus)}
        ${selectOption("in_progress", "In Progress", state.filters.requestStatus)}
        ${selectOption("ready", "Ready", state.filters.requestStatus)}
        ${selectOption("on_hold", "On Hold", state.filters.requestStatus)}
        ${selectOption("completed", "Completed", state.filters.requestStatus)}
      </select>
      <select aria-label="Unit type"><option>Unit Type</option><option>Standard Turn</option><option>Deep Clean</option><option>Inspection</option></select>
      <select aria-label="Priority"><option>Priority</option><option>Normal</option><option>High</option><option>Urgent</option></select>
      <select aria-label="Date range"><option>All Time</option><option>This Week</option><option>Next Week</option></select>
      ${includeNew ? `<button class="new-btn pm-compact-btn" type="button" data-manager-request-toggle>+ New Turn Request</button>` : ""}
    </section>
  `;
}

function selectOption(value, label, current) {
  return `<option value="${esc(value)}" ${String(value) === String(current) ? "selected" : ""}>${esc(label)}</option>`;
}

function filteredRequests() {
  const status = state.filters.requestStatus;
  return sortedAssignments(state.assignments, "asc").filter((row) => {
    const group = requestGroup(row);
    const matchesStatus = status === "all" || group === status || assignmentStatus(row) === status;
    const matchesQuery = queryMatches([
      assignmentTitle(row),
      assignmentUnit(row),
      unitBedBath(row),
      assignmentStatus(row),
      assignmentCleaner(row),
      row?.service_type
    ]);
    return matchesStatus && matchesQuery;
  });
}

function renderRequestTable(rows, compactMode = false) {
  const visible = compactMode ? rows : rows.slice(0, 10);
  return `
    <div class="pm-table-wrap">
      <table class="pm-table">
        <thead>
          <tr>
            <th>Unit</th>
            <th>Bed / Bath</th>
            ${compactMode ? "" : "<th>Request Type</th><th>Requested Date</th>"}
            <th>Status</th>
            <th>Scheduled</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${visible.map((row) => `
            <tr class="${row.id === state.selectedAssignmentId ? "active" : ""}" data-manager-select-assignment="${esc(row.id || "")}">
              <td>${esc(assignmentUnit(row) || "Unit")}</td>
              <td>${esc(unitBedBath(row))}</td>
              ${compactMode ? "" : `<td>${esc(row.service_type || row.assignment_type || "Turn Service")}</td><td>${esc(formatDate(row.created_at || row.start_window, "Not dated"))}</td>`}
              <td>${statusBadge(requestGroup(row))}</td>
              <td>${esc(formatWindow(row))}</td>
              <td><button class="pm-row-action" type="button" data-manager-select-assignment="${esc(row.id || "")}">View Details</button></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
    ${compactMode ? "" : `<div class="pm-pagination"><span>1-${Math.min(visible.length, rows.length)} of ${rows.length}</span><button disabled>&lt;</button><button disabled>&gt;</button><select><option>10 / page</option><option>25 / page</option></select></div>`}
  `;
}

function selectedAssignment(rows = state.assignments) {
  return rows.find((row) => row.id === state.selectedAssignmentId) || rows[0] || state.assignments[0] || null;
}

function renderRequestDetails(row) {
  if (!row) return emptyBlock("No request selected", "Choose a turn request to see schedule, service notes, and videos.");
  const meta = rowMeta(row);
  const videos = videosForAssignment(row);
  const before = videos.find((video) => normalizeToken(video.video_phase) === "before");
  const after = videos.find((video) => ["after", "final"].includes(normalizeToken(video.video_phase)));
  return `
    <div class="pm-detail-list">
      <dl>
        <div><dt>Unit</dt><dd>${esc(assignmentUnit(row) || "Unit")}</dd></div>
        <div><dt>Service</dt><dd>${esc(row.service_type || row.assignment_type || "Turn Service")}</dd></div>
        <div><dt>Priority</dt><dd>${esc(assignmentPriority(row))}</dd></div>
        <div><dt>Scheduled</dt><dd>${esc(formatWindow(row))}</dd></div>
      </dl>
      <h3>Service Notes</h3>
      <p>${esc(row.special_notes || row.notes || meta.special_notes || meta.instructions || "No service notes have been added yet.")}</p>
      <h3>Requested Services</h3>
      <div class="pm-chip-row">${compact([row.service_type, meta.scope, meta.checklist_name, assignmentCleaner(row)]).slice(0, 5).map((item) => `<span>${esc(item)}</span>`).join("") || "<span>Standard turn</span>"}</div>
      <h3>Before & After Videos</h3>
      <div class="pm-video-pair">
        ${renderVideoSlot(before, "Before Video")}
        ${renderVideoSlot(after, "After Video")}
      </div>
    </div>
  `;
}

function renderScheduleView() {
  const metrics = managerMetrics();
  const rows = scheduledRows();
  return `
    <section class="panel-card pm-toolbar">
      <label class="pm-search pm-local-search">
        <span class="sr-only">Search schedule</span>
        <span>Search</span>
        <input data-pm-filter="query" value="${esc(state.filters.query)}" placeholder="Search schedule..." />
      </label>
      <select data-pm-filter="scheduleStatus" aria-label="Schedule status">
        ${selectOption("all", "Status", state.filters.scheduleStatus)}
        ${selectOption("open", "Open", state.filters.scheduleStatus)}
        ${selectOption("in_progress", "In Progress", state.filters.scheduleStatus)}
        ${selectOption("ready", "Ready", state.filters.scheduleStatus)}
        ${selectOption("completed", "Completed", state.filters.scheduleStatus)}
      </select>
      <select aria-label="Date range"><option>Date Range</option><option>This Week</option><option>Next Week</option></select>
      <select aria-label="Calendar view"><option>Week View</option><option>Day View</option><option>Month View</option></select>
      <button class="new-btn pm-compact-btn" type="button" data-manager-request-toggle>+ New Turn Request</button>
    </section>
    <section class="pm-stat-grid pm-stat-grid-four" aria-label="Schedule metrics">
      ${statCard("Today", integer(todayAssignments().length), "turns today", "green")}
      ${statCard("This Week", integer(rows.length), "scheduled turns", "yellow")}
      ${statCard("Upcoming", integer(metrics.upcoming), "future windows", "blue")}
      ${statCard("In Progress", integer(metrics.inProgress), "currently active", "violet")}
    </section>
    <section class="pm-workspace-grid">
      ${panel("Schedule", renderScheduleGrid(rows), { className: "pm-schedule-panel" })}
      <aside class="pm-side-stack">
        ${panel("Schedule Details", renderScheduleDetails(selectedAssignment(rows)), { className: "pm-detail-panel" })}
        ${panel("Upcoming Turns", renderUpcomingTurns(), { className: "pm-compact-panel" })}
        ${renderUpdatesPanel("Requests / Updates")}
      </aside>
    </section>
  `;
}

function scheduledRows() {
  const weekStart = startOfWeek(new Date(), true);
  const weekEnd = endOfWeek(new Date(), true);
  const status = state.filters.scheduleStatus;
  return sortedAssignments(state.assignments.filter((row) => {
    const rowDate = row.start_window || row.recurring_due_at;
    const matchesWeek = isDateBetween(rowDate, weekStart, weekEnd);
    const group = requestGroup(row);
    const matchesStatus = status === "all" || group === status || assignmentStatus(row) === status;
    const matchesQuery = queryMatches([assignmentUnit(row), assignmentTitle(row), assignmentCleaner(row), row.service_type]);
    return matchesWeek && matchesStatus && matchesQuery;
  }));
}

function todayAssignments() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return state.assignments.filter((row) => isDateBetween(row.start_window || row.recurring_due_at, start, end));
}

function renderScheduleGrid(rows) {
  const weekStart = startOfWeek(new Date(), true);
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(weekStart);
    date.setDate(date.getDate() + index);
    return date;
  });
  const times = scheduleTimes(rows);
  return `
    <div class="pm-calendar-controls">
      <button type="button" disabled>&lt;</button>
      <select><option>This Week</option></select>
      <button type="button" disabled>&gt;</button>
    </div>
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
  return `
    <button class="pm-schedule-event ${esc(requestGroup(row))}" type="button" data-manager-select-assignment="${esc(row.id || "")}">
      <strong>${esc(formatShortTime(row.start_window || row.recurring_due_at))}</strong>
      <span>${esc(assignmentUnit(row) ? `Unit ${assignmentUnit(row)}` : assignmentTitle(row))}</span>
      ${statusBadge(requestGroup(row))}
    </button>
  `;
}

function renderScheduleDetails(row) {
  if (!row) return emptyBlock("No scheduled turn selected", "Scheduled unit details will appear here.");
  return `
    <div class="pm-detail-list">
      <dl>
        <div><dt>Window</dt><dd>${esc(formatWindow(row))}</dd></div>
        <div><dt>Unit</dt><dd>${esc(assignmentUnit(row) || "Unit")}</dd></div>
        <div><dt>Status</dt><dd>${esc(titleCase(requestGroup(row)))}</dd></div>
      </dl>
      <p>${esc(compact([row.service_type, unitBedBath(row), assignmentCleaner(row)]).join(" - ") || "Turn service details")}</p>
    </div>
  `;
}

function renderScheduleSnapshot() {
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(startOfWeek(new Date()));
    date.setDate(date.getDate() + index);
    return date;
  });
  const today = new Date();
  const todayRows = todayAssignments().slice(0, 4);
  return `
    <div class="pm-week-strip">
      ${days.map((day) => `<span class="${sameDay(day, today) ? "active" : ""}"><small>${esc(day.toLocaleDateString([], { weekday: "short" }).slice(0, 1))}</small>${esc(day.getDate())}</span>`).join("")}
    </div>
    <p class="pm-snapshot-label">Today - ${esc(today.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" }))}<span>${todayRows.length} scheduled</span></p>
    <div class="pm-snapshot-list">
      ${todayRows.length ? todayRows.map((row) => `
        <button type="button" data-manager-select-assignment="${esc(row.id || "")}">
          <time>${esc(formatShortTime(row.start_window || row.recurring_due_at))}</time>
          <span>${esc(assignmentUnit(row) ? `Unit ${assignmentUnit(row)}` : assignmentTitle(row))}</span>
          ${statusBadge(requestGroup(row))}
        </button>
      `).join("") : emptyBlock("No turns today", "Upcoming turns will appear here.")}
    </div>
    <div class="pm-panel-footer"><button class="pm-link-button" type="button" data-pm-view-button="schedule">View full schedule</button></div>
  `;
}

function renderUpcomingTurns() {
  const rows = upcomingAssignments(5);
  if (!rows.length) return emptyBlock("No upcoming turns", "New schedule windows will appear here.");
  return `<div class="pm-mini-list">${rows.map((row) => `<button type="button" data-manager-select-assignment="${esc(row.id || "")}"><strong>${esc(assignmentUnit(row) || assignmentTitle(row))}</strong><span>${esc(formatWindow(row))}</span>${statusBadge(requestGroup(row))}</button>`).join("")}</div>`;
}

function renderUnitVideosView() {
  const metrics = managerMetrics();
  const groups = filteredVideoGroups();
  return `
    <section class="panel-card pm-toolbar">
      <label class="pm-search pm-local-search">
        <span class="sr-only">Search videos</span>
        <span>Search</span>
        <input data-pm-filter="query" value="${esc(state.filters.query)}" placeholder="Search videos..." />
      </label>
      <select aria-label="Unit"><option>Unit</option>${state.units.slice(0, 80).map((unit) => `<option>${esc(unit.unit_name || "Unit")}</option>`).join("")}</select>
      <select data-pm-filter="videoPhase" aria-label="Video type">
        ${selectOption("all", "Video Type", state.filters.videoPhase)}
        ${selectOption("before", "Before", state.filters.videoPhase)}
        ${selectOption("after", "After", state.filters.videoPhase)}
        ${selectOption("final", "Final", state.filters.videoPhase)}
        ${selectOption("other", "Other", state.filters.videoPhase)}
      </select>
      <select aria-label="Status"><option>Status</option><option>Pending Review</option><option>Approved</option><option>Needs Rework</option></select>
      <select aria-label="Date range"><option>Date Range</option><option>This Week</option><option>This Month</option></select>
      <button class="secondary-command-btn pm-compact-btn" type="button" data-manager-refresh>Filter</button>
    </section>
    <section class="pm-stat-grid pm-stat-grid-four" aria-label="Video metrics">
      ${statCard("Total Videos", integer(state.videos.length), "available clips", "green")}
      ${statCard("Before Videos", integer(metrics.beforeVideos), "before work proof", "yellow")}
      ${statCard("After Videos", integer(metrics.afterVideos), "after work proof", "blue")}
      ${statCard("Recently Uploaded", integer(recentVideos().length), "last 7 days", "violet")}
    </section>
    <section class="pm-workspace-grid">
      ${panel("Video Library", groups.length ? renderVideoTable(groups) : emptyBlock("No videos found", "Before and after videos will appear here when contractors upload them."), { className: "pm-table-panel" })}
      <aside class="pm-side-stack">
        ${panel("Video Details", renderVideoDetails(selectedVideoGroup(groups)), { className: "pm-detail-panel" })}
        ${panel("Messages / Updates", renderThreadSummary(3), { className: "pm-compact-panel" })}
      </aside>
    </section>
    ${panel("Recent Upload Activity", renderVideoActivity(), { className: "pm-activity-panel" })}
  `;
}

function recentVideos() {
  const sevenDaysAgo = Date.now() - 7 * 86400000;
  return state.videos.filter((video) => dateValue(video.created_at || video.recorded_at, 0) >= sevenDaysAgo);
}

function videosForAssignment(row) {
  const id = String(row?.id || "");
  const qaJobId = rowMeta(row).qa_job_id || row?.qa_job_id || "";
  const unit = assignmentUnit(row);
  return state.videos.filter((video) => {
    return String(video.assignment_id || "") === id ||
      (qaJobId && String(video.qa_job_id || "") === String(qaJobId)) ||
      (unit && String(video.unit_name || "").toLowerCase() === String(unit).toLowerCase());
  });
}

function videoGroups() {
  const map = new Map();
  state.videos.forEach((video) => {
    const key = String(video.assignment_id || video.pair_id || video.qa_job_id || video.id);
    const existing = map.get(key) || {
      key,
      assignment: state.assignments.find((row) => String(row.id || "") === String(video.assignment_id || "")) || null,
      videos: []
    };
    existing.videos.push(video);
    map.set(key, existing);
  });

  if (!map.size) {
    recentCompletedAssignments().slice(0, 6).forEach((row) => {
      map.set(row.id, { key: row.id, assignment: row, videos: [] });
    });
  }

  return Array.from(map.values()).map((group) => ({
    ...group,
    videos: group.videos.sort((a, b) => dateValue(b.created_at || b.recorded_at, 0) - dateValue(a.created_at || a.recorded_at, 0))
  }));
}

function filteredVideoGroups() {
  const phase = state.filters.videoPhase;
  return videoGroups().filter((group) => {
    const assignment = group.assignment;
    const matchesPhase = phase === "all" || group.videos.some((video) => normalizeToken(video.video_phase) === phase);
    const matchesQuery = queryMatches([
      assignment ? assignmentTitle(assignment) : "",
      assignment ? assignmentUnit(assignment) : "",
      ...group.videos.flatMap((video) => [video.title, video.label, video.unit_name, video.contractor_name, video.notes])
    ]);
    return matchesPhase && matchesQuery;
  });
}

function selectedVideoGroup(groups = videoGroups()) {
  return groups.find((group) => group.key === state.selectedVideoKey) || groups[0] || null;
}

function renderVideoTable(groups) {
  return `
    <div class="pm-table-wrap">
      <table class="pm-table">
        <thead>
          <tr>
            <th>Unit</th>
            <th>Bed / Bath</th>
            <th>Turn Date</th>
            <th>Before Video</th>
            <th>After Video</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${groups.slice(0, 10).map((group) => {
            const assignment = group.assignment;
            const before = group.videos.find((video) => normalizeToken(video.video_phase) === "before");
            const after = group.videos.find((video) => ["after", "final"].includes(normalizeToken(video.video_phase)));
            const status = group.videos[0]?.review_status || (assignment ? requestGroup(assignment) : "pending_review");
            return `
              <tr class="${group.key === state.selectedVideoKey ? "active" : ""}" data-manager-select-video="${esc(group.key)}">
                <td>${esc(assignment ? assignmentUnit(assignment) || "Unit" : group.videos[0]?.unit_name || "Unit")}</td>
                <td>${esc(assignment ? unitBedBath(assignment) : unitBedBath(group.videos[0]?.unit_name || ""))}</td>
                <td>${esc(formatDate(assignment?.completed_at || assignment?.start_window || group.videos[0]?.recorded_at || group.videos[0]?.created_at, "Not dated"))}</td>
                <td>${renderVideoPill(before, "Before")}</td>
                <td>${renderVideoPill(after, "After")}</td>
                <td>${statusBadge(status)}</td>
                <td><button class="pm-row-action" type="button" data-manager-select-video="${esc(group.key)}">Details</button></td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderVideoPill(video, label) {
  if (!video) return `<span class="pm-video-pill muted">${esc(label)} Pending</span>`;
  return `<button class="pm-video-pill" type="button" data-manager-select-video="${esc(video.assignment_id || video.pair_id || video.qa_job_id || video.id)}">${esc(label)} Ready</button>`;
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

function renderVideoDetails(group) {
  if (!group) return emptyBlock("No video selected", "Choose a video row to view before and after clips.");
  const assignment = group.assignment;
  const before = group.videos.find((video) => normalizeToken(video.video_phase) === "before");
  const after = group.videos.find((video) => ["after", "final"].includes(normalizeToken(video.video_phase)));
  return `
    <div class="pm-detail-list">
      <h3>Unit Information</h3>
      <dl>
        <div><dt>Unit</dt><dd>${esc(assignment ? assignmentUnit(assignment) || "Unit" : group.videos[0]?.unit_name || "Unit")}</dd></div>
        <div><dt>Turn Date</dt><dd>${esc(formatDate(assignment?.completed_at || assignment?.start_window || group.videos[0]?.recorded_at || group.videos[0]?.created_at, "Not dated"))}</dd></div>
        <div><dt>Contractor</dt><dd>${esc(group.videos[0]?.contractor_name || (assignment ? assignmentCleaner(assignment) : "Turnly crew"))}</dd></div>
      </dl>
      <h3>Before Video</h3>
      ${renderVideoSlot(before, "Before Video")}
      <h3>After Video</h3>
      ${renderVideoSlot(after, "After Video")}
      <h3>Notes / Comments</h3>
      <p>${esc(group.videos.map((video) => video.notes || video.reviewer_notes).filter(Boolean).join(" ") || "No notes have been added for this video set.")}</p>
    </div>
  `;
}

function renderVideoRail() {
  const groups = videoGroups().slice(0, 4);
  if (!groups.length) return emptyBlock("No videos yet", "Before and after clips will show here after uploads.");
  return `
    <div class="pm-video-rail">
      ${groups.map((group) => {
        const assignment = group.assignment;
        const before = group.videos.find((video) => normalizeToken(video.video_phase) === "before");
        const after = group.videos.find((video) => ["after", "final"].includes(normalizeToken(video.video_phase)));
        return `
          <article class="pm-video-card">
            <strong>${esc(assignment ? `Unit ${assignmentUnit(assignment) || ""}` : group.videos[0]?.unit_name || "Unit Video")}</strong>
            <small>${esc(assignment ? unitBedBath(assignment) : formatDate(group.videos[0]?.created_at, "Recently uploaded"))}</small>
            <div class="pm-video-thumb-row">
              ${renderSmallVideoThumb(before)}
              ${renderSmallVideoThumb(after)}
            </div>
            <div class="pm-video-actions">
              <button type="button" data-manager-select-video="${esc(group.key)}" data-pm-view-button="unit-videos">View Before</button>
              <button type="button" data-manager-select-video="${esc(group.key)}" data-pm-view-button="unit-videos">View After</button>
            </div>
          </article>
        `;
      }).join("")}
    </div>
  `;
}

function renderSmallVideoThumb(video) {
  return `<div class="pm-video-thumb ${video ? "ready" : ""}"><span>${video ? "Play" : "Pending"}</span></div>`;
}

function renderVideoActivity() {
  const rows = state.videos.slice(0, 5);
  if (!rows.length) return emptyBlock("No recent uploads", "Uploaded clips will appear here.");
  return `<div class="pm-activity-list">${rows.map((video) => `<div><span></span><p><strong>${esc(video.label || video.title || "Video uploaded")}</strong><small>${esc(compact([video.unit_name ? `Unit ${video.unit_name}` : "", titleCase(video.video_phase), formatManagerMessageTime(video.created_at)]).join(" - "))}</small></p></div>`).join("")}</div>`;
}

function renderMessagesView() {
  const metrics = managerMetrics();
  return `
    <section class="panel-card pm-toolbar">
      <label class="pm-search pm-local-search">
        <span class="sr-only">Search messages</span>
        <span>Search</span>
        <input data-pm-filter="query" value="${esc(state.filters.query)}" placeholder="Search messages..." />
      </label>
      <select data-pm-filter="messageView" aria-label="Conversation filter">
        ${selectOption("all", "All Conversations", state.filters.messageView)}
        ${selectOption("unread", "Unread", state.filters.messageView)}
        ${selectOption("archived", "Archived", state.filters.messageView)}
      </select>
      <button class="new-btn pm-compact-btn" type="button" data-manager-message-compose>New Message</button>
    </section>
    <section class="pm-stat-grid pm-stat-grid-four" aria-label="Message metrics">
      ${statCard("Inbox", integer(metrics.inbox), "total conversations", "green")}
      ${statCard("Unread", integer(metrics.unread), "need a reply", "yellow")}
      ${statCard("Open Conversations", integer(metrics.inbox), "active threads", "blue")}
      ${statCard("Archived", "0", "hidden from inbox", "violet")}
    </section>
    ${state.requestOpen ? renderNewMessageForm() : ""}
    <section class="pm-message-grid">
      ${panel("Conversations", renderManagerThreadList(), { className: "pm-conversation-list" })}
      ${panel("Message Thread", renderManagerConversation(), { className: "pm-thread-panel" })}
      ${panel("Conversation Details", renderConversationDetails(), { className: "pm-detail-panel" })}
    </section>
    ${panel("Recent Updates", renderRecentActivity(), { className: "pm-activity-panel" })}
  `;
}

function filteredThreads() {
  return state.threads.filter((thread) => {
    const unread = managerThreadUnread(thread);
    const view = state.filters.messageView;
    const matchesView = view === "all" || (view === "unread" && unread);
    const matchesQuery = queryMatches([thread.subject, thread.last_message_preview, managerParticipantLine(thread.id)]);
    return matchesView && matchesQuery;
  });
}

function renderNewMessageForm() {
  return `
    <section class="panel-card pm-request-form-panel">
      <div class="pm-panel-head">
        <div><h2>New Message</h2><p>Send a note to Turnly operations.</p></div>
        <button class="secondary-command-btn pm-compact-btn" type="button" data-manager-request-close>Close</button>
      </div>
      <form id="managerNewThreadForm" class="manager-message-form pm-inline-form">
        <label><span>Subject</span><input name="subject" placeholder="Question about service, invoices, or property notes" /></label>
        <label><span>Message</span><textarea name="body" rows="4" placeholder="Type your message..." required></textarea></label>
        <button class="new-btn pm-compact-btn" type="submit" ${state.sending ? "disabled" : ""}>Send Message</button>
      </form>
    </section>
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

function renderInvoicesView() {
  const metrics = managerMetrics();
  return `
    <section class="pm-stat-grid pm-stat-grid-four" aria-label="Invoice metrics">
      ${statCard("Completed Services", integer(recentCompletedAssignments().length), "ready for billing", "green")}
      ${statCard("Invoice Total", money(metrics.invoiceTotal), "customer charges", "blue")}
      ${statCard("Approved", money(metrics.approvedTotal), "approved services", "violet")}
      ${statCard("Open Requests", integer(metrics.open), "not completed", "yellow")}
    </section>
    ${panel("Invoice Activity", renderInvoicesSection(), { copy: "Completed services grouped by month." })}
  `;
}

function renderInvoicesSection() {
  const completed = recentCompletedAssignments();
  if (!completed.length) return emptyBlock("No invoice activity", "Completed services will populate this summary.");
  const groups = new Map();
  completed.forEach((row) => {
    const key = monthKey(row.completed_at || row.checklist_completed_at || row.qa_approved_at || row.start_window);
    const group = groups.get(key) || { count: 0, total: 0, approved: 0, paid: 0 };
    group.count += 1;
    group.total += assignmentCustomerAmount(row);
    if (["approved_for_pay", "paid", "paid_out", "settled"].includes(paymentStatus(row)) || row.qa_approved_at) group.approved += assignmentCustomerAmount(row);
    if (["paid", "paid_out", "settled"].includes(paymentStatus(row)) || row.paid_at || row.paid_out) group.paid += assignmentCustomerAmount(row);
    groups.set(key, group);
  });
  return `
    <div class="pm-invoice-list">
      ${Array.from(groups.entries()).slice(0, 8).map(([key, group]) => `
        <article class="pm-invoice-row">
          <div>
            <strong>${esc(key)}</strong>
            <small>${group.count} completed service${group.count === 1 ? "" : "s"}</small>
          </div>
          <dl>
            <div><dt>Total</dt><dd>${esc(money(group.total))}</dd></div>
            <div><dt>Approved</dt><dd>${esc(money(group.approved))}</dd></div>
            <div><dt>Paid</dt><dd>${esc(money(group.paid))}</dd></div>
          </dl>
        </article>
      `).join("")}
    </div>
  `;
}

function renderSettingsView() {
  return `
    <section class="pm-two-column-grid">
      ${panel("Assigned Property", `
        <div class="pm-detail-list">
          <dl>
            <div><dt>Property</dt><dd>${esc(propertyTitle())}</dd></div>
            <div><dt>Address</dt><dd>${esc(propertyAddress())}</dd></div>
            <div><dt>Client</dt><dd>${esc(state.client?.company_name || state.client?.client_name || "Turnly managed")}</dd></div>
            <div><dt>Units</dt><dd>${esc(integer(state.units.length))}</dd></div>
          </dl>
        </div>
      `)}
      ${panel("Account", `
        <div class="pm-detail-list">
          <dl>
            <div><dt>Name</dt><dd>${esc(getName(state.user, state.profile))}</dd></div>
            <div><dt>Email</dt><dd>${esc(state.profile?.email || state.user?.email || "No email")}</dd></div>
            <div><dt>Status</dt><dd>${esc(titleCase(state.profile?.status || "active"))}</dd></div>
          </dl>
          <button class="secondary-command-btn pm-compact-btn" type="button" data-manager-logout>Sign Out</button>
        </div>
      `)}
    </section>
  `;
}

function renderSupportView() {
  return `
    ${panel("Send Feedback", `
      <p class="pm-section-copy">Send service notes, issue follow-up, or billing questions directly to Turnly operations.</p>
      <form id="managerFeedbackForm" class="manager-message-form pm-inline-form">
        <label>
          <span>Topic</span>
          <select name="topic">
            <option>Service feedback</option>
            <option>Schedule request</option>
            <option>Invoice question</option>
            <option>Property access note</option>
          </select>
        </label>
        <label>
          <span>Details</span>
          <textarea name="body" rows="5" placeholder="Tell the Turnly team what changed or what needs attention..." required></textarea>
        </label>
        <button class="new-btn pm-compact-btn" type="submit" ${state.sending ? "disabled" : ""}>Send Feedback</button>
      </form>
    `)}
  `;
}

function renderRequestForm() {
  if (!state.requestOpen || state.view === "messages") return "";
  return `
    <section class="panel-card pm-request-form-panel">
      <div class="pm-panel-head">
        <div><h2>New Turn Request</h2><p>Request a new unit turn or schedule change for ${esc(propertyTitle())}.</p></div>
        <button class="secondary-command-btn pm-compact-btn" type="button" data-manager-request-close>Close</button>
      </div>
      <form id="managerTurnRequestForm" class="manager-message-form pm-request-form">
        <label>
          <span>Unit</span>
          <select name="unit">
            <option value="">Select unit</option>
            ${state.units.map((unit) => `<option value="${esc(unit.unit_name || "")}">${esc(unit.unit_name || "Unit")}</option>`).join("")}
          </select>
        </label>
        <label>
          <span>Service Type</span>
          <select name="service">
            <option>Turn Cleaning</option>
            <option>Move-In Ready Clean</option>
            <option>Inspection Follow-Up</option>
            <option>Maintenance Cleaning</option>
          </select>
        </label>
        <label>
          <span>Priority</span>
          <select name="priority">
            <option>Normal</option>
            <option>High</option>
            <option>Urgent</option>
          </select>
        </label>
        <label>
          <span>Requested Window</span>
          <input name="requested_at" type="datetime-local" />
        </label>
        <label class="span-all">
          <span>Notes</span>
          <textarea name="body" rows="4" placeholder="Access notes, move-in date, special rooms, or follow-up needed..." required></textarea>
        </label>
        <button class="new-btn pm-compact-btn" type="submit" ${state.sending ? "disabled" : ""}>Submit Request</button>
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
      <div class="pm-tabs">
        ${["all", "unread", "archived"].map((key) => `<button type="button" class="${state.filters.messageView === key ? "active" : ""}" data-pm-message-view="${key}">${esc(titleCase(key))}</button>`).join("")}
      </div>
      ${rows.map((thread) => `
        <button class="manager-message-thread ${thread.id === state.selectedThreadId ? "active" : ""} ${managerThreadUnread(thread) ? "unread" : ""}" type="button" data-manager-thread-id="${esc(thread.id)}">
          <strong>${esc(thread.subject || "Message")}</strong>
          <small>${esc(managerParticipantLine(thread.id))}</small>
          <span>${esc(formatManagerMessageTime(thread.last_message_at || thread.created_at))}</span>
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
    <form id="managerReplyForm" class="manager-message-form compact">
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
  const unit = form.elements.unit?.value?.trim() || "";
  const service = form.elements.service?.value?.trim() || "Turn Cleaning";
  const priority = form.elements.priority?.value?.trim() || "Normal";
  const requested = form.elements.requested_at?.value ? new Date(form.elements.requested_at.value).toLocaleString() : "Flexible";
  const notes = form.elements.body?.value?.trim() || "";
  const body = [
    `Property: ${propertyTitle()}`,
    unit ? `Unit: ${unit}` : "",
    `Service: ${service}`,
    `Priority: ${priority}`,
    `Requested window: ${requested}`,
    "",
    notes
  ].filter((line) => line !== "").join("\n");

  await createManagerMessageThread(form, {
    subject: `Turn request - ${unit || propertyTitle()}`,
    topic: "Turn request",
    body
  });

  if (!state.error) {
    state.requestOpen = false;
    renderManagerPortal();
  }
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
      related_type: "property",
      related_id: state.property?.id || "",
      related_title: propertyTitle()
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
  const navLink = event.target.closest(".command-nav .nav-link[data-pm-view]");
  if (navLink) {
    event.preventDefault();
    const view = navLink.dataset.pmView || "overview";
    if (window.location.hash !== `#${view}`) window.location.hash = view;
    state.view = view;
    renderManagerPortal();
    return;
  }

  const viewButton = event.target.closest("[data-pm-view-button]");
  if (viewButton) {
    const videoKey = event.target.closest("[data-manager-select-video]")?.dataset.managerSelectVideo;
    if (videoKey) state.selectedVideoKey = videoKey;
    const threadId = event.target.closest("[data-manager-thread-id]")?.dataset.managerThreadId;
    if (threadId) state.selectedThreadId = threadId;
    const view = viewButton.dataset.pmViewButton;
    window.location.hash = view;
    state.view = view;
    renderManagerPortal();
    return;
  }

  if (event.target.closest("[data-manager-logout]")) {
    await supabase?.auth.signOut();
    window.location.href = "https://portal.turnlypros.com/";
    return;
  }

  const refreshAll = event.target.closest("[data-manager-refresh]");
  if (refreshAll) {
    await refreshManagerPortal();
    return;
  }

  if (event.target.closest("[data-manager-request-toggle]")) {
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

  const statusButton = event.target.closest("[data-pm-request-status]");
  if (statusButton) {
    state.filters.requestStatus = statusButton.dataset.pmRequestStatus || "all";
    renderManagerPortal();
    return;
  }

  const messageViewButton = event.target.closest("[data-pm-message-view]");
  if (messageViewButton) {
    state.filters.messageView = messageViewButton.dataset.pmMessageView || "all";
    renderManagerPortal();
    return;
  }

  const assignmentButton = event.target.closest("[data-manager-select-assignment]");
  if (assignmentButton) {
    state.selectedAssignmentId = assignmentButton.dataset.managerSelectAssignment || "";
    renderManagerPortal();
    return;
  }

  const videoButton = event.target.closest("[data-manager-select-video]");
  if (videoButton) {
    state.selectedVideoKey = videoButton.dataset.managerSelectVideo || "";
    renderManagerPortal();
    return;
  }

  const thread = event.target.closest("[data-manager-thread-id]");
  if (thread) {
    state.selectedThreadId = thread.dataset.managerThreadId || "";
    await markManagerThreadRead(state.selectedThreadId);
    await loadManagerThreadMessages(state.selectedThreadId);
    renderManagerPortal();
  }
});

document.addEventListener("input", (event) => {
  const filter = event.target.closest("[data-pm-filter]");
  if (!filter) return;
  state.filters[filter.dataset.pmFilter] = filter.value;
});

document.addEventListener("change", (event) => {
  const filter = event.target.closest("[data-pm-filter]");
  if (!filter) return;
  state.filters[filter.dataset.pmFilter] = filter.value;
  renderManagerPortal();
});

document.addEventListener("submit", async (event) => {
  if (event.target.matches("#managerNewThreadForm")) {
    event.preventDefault();
    await createManagerMessageThread(event.target);
  }
  if (event.target.matches("#managerFeedbackForm")) {
    event.preventDefault();
    await createManagerMessageThread(event.target, { subject: `Property feedback - ${propertyTitle()}` });
  }
  if (event.target.matches("#managerTurnRequestForm")) {
    event.preventDefault();
    await createTurnRequest(event.target);
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

await requireManagerAccess();
