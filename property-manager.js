import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const VIDEO_BUCKET = "qa-videos";
const SIGNED_URL_SECONDS = 60 * 60 * 4;
const TURN_REQUEST_SERVICE = "Unit Cleaning";
const MOVE_IN_TIME_LABEL = "2:00 PM";
const MOVE_IN_HOUR = 14;

const env = window.__ENV || {};
const supabase = env.SUPABASE_URL && env.SUPABASE_ANON_KEY
  ? createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY)
  : null;

const managerMain = document.querySelector(".command-main");

const state = {
  user: null,
  profile: null,
  property: null,
  propertyLinkPending: false,
  client: null,
  contract: null,
  relatedProperties: [],
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
  selectedScheduleDate: "",
  scheduleWeekStart: "",
  view: "overview",
  requestOpen: false,
  accountMenuOpen: false,
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

const pmIconPaths = {
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
  "chevron-down": '<path d="m6 9 6 6 6-6"/>',
  "chevron-right": '<path d="m9 18 6-6-6-6"/>',
  home: '<path d="m3 11 9-8 9 8"/><path d="M5 10v11h14V10"/><path d="M9 21v-7h6v7"/>',
  plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>'
};

function pmIcon(name, className = "") {
  const path = pmIconPaths[name] || pmIconPaths.search;
  return `<span class="suite-icon ${esc(className)}" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${path}</svg></span>`;
}

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
const searchlessViews = new Set(["turn-requests", "schedule", "unit-videos", "messages"]);
const closedStatuses = new Set(["completed", "complete", "cancelled", "canceled", "declined", "deleted", "archived"]);
const issueStatuses = new Set(["overdue", "qa_pending", "qa_rejected", "rejected", "needs_rework"]);
const inProgressStatuses = new Set(["in_progress", "claimed", "started", "active", "qa_pending"]);
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

function assignmentCleaner(row) {
  return row?.assigned_to_name || row?.claimed_by_name || row?.completed_by_name || "Turnly crew";
}

function assignmentContractorText(row) {
  const meta = rowMeta(row);
  const names = Array.isArray(row?.preferred_contractor_names)
    ? row.preferred_contractor_names.filter(Boolean)
    : (Array.isArray(meta.preferred_contractor_names) ? meta.preferred_contractor_names.filter(Boolean) : []);
  return row?.assigned_to_name
    || row?.assigned_to_email
    || row?.contractor_name
    || row?.contractor_email
    || row?.claimed_by_name
    || row?.claimed_by_email
    || names.join(", ")
    || "Unassigned";
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

function completionDateValue(row) {
  return row?.completed_at || row?.checklist_completed_at || row?.qa_approved_at || row?.end_window || row?.start_window || row?.updated_at || row?.created_at;
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

function moveScheduleWeek(days) {
  ensureScheduleState();
  const nextStart = addDays(state.scheduleWeekStart, days);
  state.scheduleWeekStart = dateInputValue(nextStart);
  state.selectedScheduleDate = dateInputValue(nextStart);
}

function formatWeekRange(startValue) {
  const start = localDate(startValue);
  const end = addDays(start, 6);
  const startLabel = start.toLocaleDateString([], { month: "short", day: "numeric" });
  const endLabel = end.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
  return `${startLabel} - ${endLabel}`;
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
    pending,
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

  if (!profile.property_manager_property_id) {
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
  setActiveNav();
  const [title, subtitle] = viewLabels[state.view] || viewLabels.overview;
  const headingTitle = state.view === "overview" ? propertyTitle() : title;
  const headingSubtitle = state.view === "overview"
    ? (hasLinkedProperty() ? "Your assigned property overview." : "")
    : subtitle;

  managerMain.innerHTML = `
    <header class="command-header pm-page-header">
      <div class="pm-heading">
        <h1>${esc(headingTitle)}</h1>
        ${headingSubtitle ? `<p>${esc(headingSubtitle)}</p>` : ""}
      </div>
      ${renderTopBar()}
    </header>
    ${renderDataStatus(loading)}
    ${renderPropertyLinkNotice()}
    ${renderRequestForm()}
    ${renderCurrentView()}
  `;
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
  const unread = managerMetrics().unread;
  return `
    <div class="pm-topbar topbar-tools">
      ${viewSupportsSearch() ? `<div class="global-search topbar-search-wrap" role="search">
        ${pmIcon("search")}
        <input data-manager-global-search data-pm-filter="query" type="search" value="${esc(state.filters.query)}" placeholder="Search anything..." autocomplete="off" />
        <kbd>K</kbd>
      </div>`}
      <div class="topbar-popover-wrap">
        <button class="top-icon" type="button" aria-label="${unread} unread messages" data-pm-view-button="messages">
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
      ${statCard("Units Ready", integer(metrics.ready), "completed last 30 days", "green", "turn-requests")}
      ${statCard("In Progress", integer(metrics.inProgress), "Currently Being Cleaned", "violet", "turn-requests")}
      ${statCard("Before & After Videos", integer(metrics.beforeAfter), "Ready to Watch", "blue", "unit-videos")}
      ${statCard("Completed This Week", integer(metrics.completedThisWeek), `${delta >= 0 ? "+" : ""}${delta}% vs last week`, "cyan", "schedule")}
    </section>

    <section class="pm-overview-grid">
      ${panel("Turn Requests", renderOverviewRequests(), {
        className: "pm-overview-requests",
        action: renderNewTurnRequestButton()
      })}
      <aside class="pm-side-stack">
        ${panel("Schedule Snapshot", renderScheduleSnapshot(), {
          action: renderScheduleSnapshotControls()
        })}
        ${renderUpdatesPanel("Messages / Updates")}
      </aside>
      ${panel("Before & After Videos", renderVideoRail(), {
        className: "pm-video-overview",
        copy: "Watch recent unit turn videos",
        action: `<button class="pm-link-button" type="button" data-pm-view-button="unit-videos">View all videos</button>`
      })}
      ${panel("Property Details", renderPropertyDataPreview(), {
        className: "pm-property-data-panel",
        action: `<button class="pm-link-button" type="button" data-pm-view-button="settings">View settings</button>`
      })}
    </section>
  `;
}

function renderPropertyDataPreview() {
  const next = upcomingAssignments(1)[0];
  const units = state.units.slice(0, 6);
  const accessNotes = state.property?.access_notes
    || state.contract?.access_notes
    || state.client?.access_notes
    || state.property?.notes
    || state.contract?.notes
    || "No access notes on file";
  return `
    <div class="pm-detail-list">
      <dl>
        <div><dt>Property</dt><dd>${esc(propertyTitle())}</dd></div>
        <div><dt>Address</dt><dd>${esc(propertyAddress())}</dd></div>
        <div><dt>Client</dt><dd>${esc(managerClientName())}</dd></div>
        <div><dt>Next Job</dt><dd>${esc(next ? formatWindow(next) : "No upcoming jobs")}</dd></div>
        <div><dt>Total Units</dt><dd>${esc(integer(state.units.length))}</dd></div>
        <div><dt>Total Jobs</dt><dd>${esc(integer(state.assignments.length))}</dd></div>
      </dl>
      <h3>Access / Property Notes</h3>
      <p>${esc(accessNotes)}</p>
      <h3>Unit Information</h3>
      ${units.length ? `
        <div class="pm-unit-table">
          <div class="pm-unit-head"><span>Unit</span><span>Bed / Bath</span><span>Sq Ft</span><span>Status</span></div>
          ${units.map((unit) => `
            <article class="pm-unit-row">
              <div><strong>${esc(unit.unit_name || unit.name || "Unit")}</strong><span>${esc(unit.notes || unit.unit_instructions || "No unit notes")}</span></div>
              <span>${esc(unitBedBath(unit))}</span>
              <span>${esc(integer(unit.square_feet || unit.sq_ft || 0))}</span>
              ${statusBadge(unit.status || "active")}
            </article>
          `).join("")}
        </div>
      ` : emptyBlock("No units found", "Unit records will appear here once the linked property data is available.")}
    </div>
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
    ${renderTurnRequestCallout()}
    ${renderRequestToolbar()}
    <section class="pm-stat-grid pm-stat-grid-five" aria-label="Turn request metrics">
      ${statCard("Total Requests", integer(metrics.totalRequests), "for linked property", "green")}
      ${statCard("Pending", integer(metrics.pending), "awaiting Turnly approval", "yellow")}
      ${statCard("Open", integer(metrics.open), "ready to assign", "yellow")}
      ${statCard("In Progress", integer(metrics.inProgress), "being handled now", "blue")}
      ${statCard("Completed This Week", integer(metrics.completedThisWeek), "closed out", "green")}
    </section>
    <section class="pm-workspace-grid">
      ${panel("Turn Requests", rows.length ? renderRequestTable(rows) : emptyBlock("No matching requests", "Try changing the status filter."), { className: "pm-table-panel" })}
      ${panel("Request Details", renderRequestDetails(selectedAssignment(rows)), { className: "pm-detail-panel" })}
    </section>
    <section class="pm-two-column-grid">
      ${panel("Recent Activity", renderRecentActivity(), { className: "pm-activity-panel" })}
      ${renderUpdatesPanel("Messages / Updates")}
    </section>
  `;
}

function renderTurnRequestCallout() {
  const linked = hasLinkedProperty();
  return `
    <section class="panel-card pm-action-banner ${linked ? "" : "is-disabled"}">
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
  return `
    <section class="panel-card pm-toolbar pm-turn-toolbar">
      <div class="pm-status-segment" aria-label="Request status">
        ${["all", "pending", "open", "in_progress", "ready", "on_hold", "completed"].map((key) => `<button type="button" class="${state.filters.requestStatus === key ? "active" : ""}" data-pm-request-status="${esc(key)}">${esc(key === "all" ? "All" : titleCase(key))}</button>`).join("")}
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

function scheduleStatusKey(value) {
  return String(value || "scheduled").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "scheduled";
}

function scheduleAcceptanceStatus(row) {
  const status = scheduleStatusKey(row?.status);
  if (["cancelled", "canceled", "declined"].includes(status)) return { label: titleCase(status), tone: status };
  if (row?.accepted_at || row?.claimed_at || row?.claimed_by || ["claimed", "in-progress", "completed", "qa-pending"].includes(status)) {
    return { label: "Accepted", tone: "accepted" };
  }
  if (row?.assigned_to || row?.assigned_to_name || row?.assigned_to_email || row?.contractor_id || row?.contractor_name) {
    return { label: "Assigned", tone: "assigned" };
  }
  if (status === "preferred-pending" || pendingStatuses.has(assignmentStatus(row))) return { label: "Awaiting Accept", tone: "pending" };
  return { label: "Not Accepted", tone: "not-accepted" };
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

function assignmentRoutingMeta(row) {
  const meta = rowMeta(row);
  const names = Array.isArray(row?.preferred_contractor_names)
    ? row.preferred_contractor_names.filter(Boolean)
    : (Array.isArray(meta.preferred_contractor_names) ? meta.preferred_contractor_names.filter(Boolean) : []);
  if (row?.assigned_to || row?.assigned_to_name || row?.assigned_to_email || row?.contractor_id || row?.contractor_name) return "Assigned contractor";
  if (row?.claimed_by || row?.claimed_by_name || row?.claimed_by_email) return "Claimed contractor";
  if (names.length) return `${names.length} preferred contractor${names.length === 1 ? "" : "s"}`;
  return "Open to contractors";
}

function assignmentPayAmount(row) {
  const meta = rowMeta(row);
  return asNumber(row?.pay_amount ?? row?.contractor_pay ?? row?.contractor_amount ?? meta.contractor_pay ?? meta.unit_contractor_pay);
}

function assignmentNotes(row) {
  const meta = rowMeta(row);
  return {
    scope: row?.scope || meta.scope || meta.scope_of_work || "",
    supplies: row?.supplies_notes || meta.supplies_notes || "",
    special: row?.special_instructions || row?.special_notes || row?.notes || meta.unit_notes || meta.special_notes || meta.instructions || ""
  };
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
  const notes = assignmentNotes(row);
  const videos = videosForAssignment(row);
  const before = videos.find((video) => normalizeToken(video.video_phase) === "before");
  const after = videos.find((video) => ["after", "final"].includes(normalizeToken(video.video_phase)));
  const detailItems = [
    ["Property Name", title, assignmentAddress(row)],
    ["Unit Number", assignmentUnit(row) || "Unit", assignmentUnitMeta(row)],
    ["Schedule", assignmentDateWindow(row), assignmentFrequencyLabel(row)],
    ["Contractor Routing", assignmentContractorText(row), assignmentRoutingMeta(row)],
    ["Contractor Pay", money(assignmentPayAmount(row)), row.service_type || "No service type"],
    ["Special Notes", notes.special || notes.scope || "No special notes", notes.special ? "Special instructions" : "Scope"]
  ];
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
      <div class="schedule-assignment-notes">
        <div><span>Scope of Work</span><p>${esc(notes.scope || meta.scope || "No scope entered.")}</p></div>
        <div><span>Supplies Notes</span><p>${esc(notes.supplies || "No supplies notes entered.")}</p></div>
        <div><span>Special Instructions</span><p>${esc(notes.special || "No special instructions entered.")}</p></div>
      </div>
      <h3>Requested Services</h3>
      <div class="pm-chip-row">${compact([row.service_type, meta.scope, meta.checklist_name, assignmentCleaner(row)]).slice(0, 5).map((item) => `<span>${esc(item)}</span>`).join("") || "<span>Standard turn</span>"}</div>
      <h3>Before & After Videos</h3>
      <div class="pm-video-pair">
        ${renderVideoSlot(before, "Before Video")}
        ${renderVideoSlot(after, "After Video")}
      </div>
    </section>
  `;
}

function renderRequestDetails(row) {
  return renderAssignmentDetailsCard(row);
}

function renderScheduleView() {
  ensureScheduleState();
  const metrics = managerMetrics();
  const rows = scheduledRows();
  const weekStart = localDate(state.scheduleWeekStart);
  return `
    <section class="panel-card pm-toolbar pm-schedule-toolbar">
      <div class="pm-schedule-toolbar-controls">
        ${renderScheduleSnapshotControls()}
        <strong class="pm-week-range">${esc(formatWeekRange(weekStart))}</strong>
      </div>
      ${renderNewTurnRequestButton("Request Turn")}
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
  ensureScheduleState();
  const weekStart = localDate(state.scheduleWeekStart);
  const weekEnd = addDays(weekStart, 7);
  return sortedAssignments(state.assignments.filter((row) => {
    const rowDate = row.start_window || row.recurring_due_at;
    const matchesWeek = isDateBetween(rowDate, weekStart, weekEnd);
    return matchesWeek;
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
    <article class="schedule-event-card pm-schedule-event-card ${esc(requestGroup(row))}" data-manager-select-assignment="${esc(row.id || "")}" role="button" tabindex="0" aria-label="View details for ${esc(title)}.">
      <div class="schedule-event-time">${esc(scheduleEventTime(row))}</div>
      <strong>${esc(title)}</strong>
      <p>${esc(subtitle || row.title || "Assignment")}</p>
      <small>${esc(assignmentContractorText(row))}</small>
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
    .filter((row) => queryMatches([assignmentUnit(row), assignmentTitle(row), assignmentCleaner(row), row.service_type]))
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
        <button type="button" data-manager-select-assignment="${esc(row.id || "")}">
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
    <div class="pm-schedule-controls" aria-label="Schedule date controls">
      <button type="button" aria-label="Previous week" data-pm-schedule-shift="-7"></button>
      <input type="date" value="${esc(state.selectedScheduleDate)}" aria-label="Select schedule date" data-pm-schedule-date />
      <button type="button" aria-label="Next week" data-pm-schedule-shift="7"></button>
    </div>
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

function qaJobForVideo(video) {
  const meta = rowMeta(video);
  const ids = new Set(compact([video?.qa_job_id, video?.job_id, meta.qa_job_id, meta.job_id]).map(String));
  if (!ids.size) return null;
  return state.qaJobs.find((job) => ids.has(String(job.id || ""))) || null;
}

function assignmentForVideo(video) {
  const meta = rowMeta(video);
  const qaJob = qaJobForVideo(video);
  const ids = new Set(compact([
    video?.assignment_id,
    video?.assignment_block_id,
    meta.assignment_id,
    meta.assignment_block_id,
    qaJob?.assignment_id
  ]).map(String));
  const direct = state.assignments.find((row) => ids.has(String(row.id || "")));
  if (direct) return direct;
  const unit = matchingUnit(video);
  if (!unit) return null;
  const unitValues = new Set(unitLookupValues(unit));
  return state.assignments.find((row) => unitLookupValues(row).some((value) => unitValues.has(value))) || null;
}

function videoGroups() {
  const map = new Map();
  state.videos.forEach((video) => {
    const assignment = assignmentForVideo(video);
    const key = String(assignment?.id || video.assignment_id || video.pair_id || video.qa_job_id || video.id);
    const existing = map.get(key) || {
      key,
      assignment: assignment || null,
      videos: []
    };
    if (!existing.assignment && assignment) existing.assignment = assignment;
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
  return videoGroups().filter((group) => {
    const assignment = assignmentForVideoGroup(group);
    const matchesQuery = queryMatches([
      assignment ? assignmentTitle(assignment) : "",
      assignment ? assignmentUnit(assignment) : "",
      ...group.videos.flatMap((video) => [video.title, video.label, video.unit_name, video.contractor_name, video.notes])
    ]);
    return matchesQuery;
  });
}

function selectedVideoGroup(groups = videoGroups()) {
  return groups.find((group) => String(group.key) === String(state.selectedVideoKey)) || groups[0] || null;
}

function assignmentForVideoGroup(group) {
  return group?.assignment || (group?.videos || []).map(assignmentForVideo).find(Boolean) || null;
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
            const assignment = assignmentForVideoGroup(group);
            const before = group.videos.find((video) => normalizeToken(video.video_phase) === "before");
            const after = group.videos.find((video) => ["after", "final"].includes(normalizeToken(video.video_phase)));
            const status = group.videos[0]?.review_status || (assignment ? requestGroup(assignment) : "pending_review");
            return `
              <tr class="${group.key === state.selectedVideoKey ? "active" : ""}" data-manager-select-video="${esc(group.key)}">
                <td>${esc(assignment ? assignmentUnit(assignment) || "Unit" : group.videos[0]?.unit_name || "Unit")}</td>
                <td>${esc(assignment ? unitBedBath(assignment) : unitBedBath(group.videos[0]?.unit_name || ""))}</td>
                <td>${esc(formatDate(assignment?.completed_at || assignment?.start_window || group.videos[0]?.recorded_at || group.videos[0]?.created_at, "Not dated"))}</td>
                <td>${renderVideoPill(before, "Before", group.key)}</td>
                <td>${renderVideoPill(after, "After", group.key)}</td>
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

function renderVideoPill(video, label, groupKey = "") {
  if (!video) return `<span class="pm-video-pill muted">${esc(label)} Pending</span>`;
  return `<button class="pm-video-pill" type="button" data-manager-select-video="${esc(groupKey || video.assignment_id || video.pair_id || video.qa_job_id || video.id)}">${esc(label)} Ready</button>`;
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
  const assignment = assignmentForVideoGroup(group);
  if (assignment) return renderAssignmentDetailsCard(assignment, "No assignment selected");
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
        const assignment = assignmentForVideoGroup(group);
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
  return `
    <section class="panel-card pm-messages-workspace">
      <aside class="pm-message-sidebar" aria-label="Open conversations">
        <div class="pm-message-sidebar-head">
          <div>
            <h2>Open Conversations</h2>
            <p>${esc(integer(state.threads.length))} active</p>
          </div>
          <button class="new-btn pm-message-compose-icon" type="button" data-manager-message-compose aria-label="New message">${pmIcon("plus")}</button>
        </div>
        ${renderManagerThreadList()}
      </aside>
      <section class="pm-message-display" aria-label="Message display">
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
        <label><span>Subject</span><input name="subject" placeholder="Question about service, invoices, or property notes" /></label>
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

function renderInvoicesView() {
  const metrics = managerMetrics();
  return `
    <section class="pm-stat-grid pm-stat-grid-four" aria-label="Invoice metrics">
      ${statCard("Completed Services", integer(completedAssignments().length), "ready for billing", "green")}
      ${statCard("Invoice Total", money(metrics.invoiceTotal), "customer charges", "blue")}
      ${statCard("Approved", money(metrics.approvedTotal), "approved services", "violet")}
      ${statCard("Open Requests", integer(metrics.open), "not completed", "yellow")}
    </section>
    ${panel("Invoice Activity", renderInvoicesSection(), { copy: "Completed services grouped by month." })}
  `;
}

function renderInvoicesSection() {
  const completed = completedAssignments();
  if (!completed.length) return emptyBlock("No invoice activity", "Completed services will populate this summary.");
  const groups = new Map();
  completed.forEach((row) => {
    const key = monthKey(completionDateValue(row));
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
            <div><dt>Client</dt><dd>${esc(managerClientName())}</dd></div>
            <div><dt>Units</dt><dd>${esc(integer(state.units.length))}</dd></div>
            <div><dt>Jobs</dt><dd>${esc(integer(state.assignments.length))}</dd></div>
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

  const { data: assignmentId, error: requestError } = await supabase.rpc("create_property_manager_turn_request", {
    request_payload: {
      unit,
      service_type: service,
      priority,
      move_in_date: moveInDateValue,
      move_in_time: MOVE_IN_TIME_LABEL,
      notes
    }
  });

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

  const accountWasOpen = state.accountMenuOpen;
  const accountWrap = event.target.closest(".pm-account-menu-wrap");
  if (!accountWrap && accountWasOpen) state.accountMenuOpen = false;

  const navLink = event.target.closest(".command-nav .nav-link[data-pm-view]");
  if (navLink) {
    event.preventDefault();
    const view = navLink.dataset.pmView || "overview";
    if (window.location.hash !== `#${view}`) window.location.hash = view;
    state.view = view;
    renderManagerPortal();
    return;
  }

  if (event.target.closest("[data-manager-account-toggle]")) {
    state.accountMenuOpen = !state.accountMenuOpen;
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

  const scheduleShift = event.target.closest("[data-pm-schedule-shift]");
  if (scheduleShift) {
    moveScheduleWeek(Number(scheduleShift.dataset.pmScheduleShift || 0));
    renderManagerPortal();
    return;
  }

  const scheduleDay = event.target.closest("[data-pm-schedule-select-date]");
  if (scheduleDay) {
    setScheduleDate(scheduleDay.dataset.pmScheduleSelectDate);
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
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
    if (!viewSupportsSearch()) return;
    event.preventDefault();
    document.querySelector("[data-manager-global-search]")?.focus();
    return;
  }

  if (!["Enter", " "].includes(event.key)) return;
  const assignmentCard = event.target.closest("[data-manager-select-assignment][role='button']");
  if (assignmentCard) {
    event.preventDefault();
    state.selectedAssignmentId = assignmentCard.dataset.managerSelectAssignment || "";
    renderManagerPortal();
  }
});

document.addEventListener("change", (event) => {
  const scheduleDate = event.target.closest("[data-pm-schedule-date]");
  if (scheduleDate) {
    setScheduleDate(scheduleDate.value);
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

try {
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
