import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const SALES_TABLES = {
  leads: "sales_leads",
  walkthroughs: "sales_walkthroughs",
  quotes: "sales_quotes",
  contracts: "sales_contracts",
  tasks: "sales_tasks",
  activities: "sales_activities"
};
const PROFILES_TABLE = "profiles";
const XLSX_URL = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
const allowedRoles = new Set(["admin", "sales", "sales_team"]);

const pageConfig = {
  dashboard: {
    title: "Sales Dashboard",
    subtitle: "Identify ideal properties, confirm the $0.25/sq ft fit, and schedule walkthroughs for management."
  },
  leads: {
    title: "Lead Qualification",
    subtitle: "Qualify prospects, confirm pricing fit, and prepare walkthrough-ready candidates."
  },
  walkthroughs: {
    title: "Walkthroughs",
    subtitle: "Schedule walkthroughs for management to close qualified opportunities."
  },
  tasks: {
    title: "Tasks & Follow-ups",
    subtitle: "Track outreach, pricing confirmation, reminders, and next sales actions."
  }
};

const navItems = [
  ["dashboard", "Dashboard", "sales.html", "dashboard"],
  ["leads", "Leads", "sales-leads.html", "users"],
  ["walkthroughs", "Walkthroughs", "sales-walkthroughs.html", "calendar"],
  ["tasks", "Tasks & Follow-ups", "sales-tasks.html", "clipboard-check"]
];

const stageDefs = [
  { id: "new_leads", label: "New Prospects", tone: "green" },
  { id: "contacted", label: "Contacted", tone: "cyan" },
  { id: "quote_sent", label: "Pricing Confirmed", tone: "yellow" },
  { id: "walkthrough", label: "Walkthrough Set", tone: "blue" },
  { id: "contract_out", label: "Management Review", tone: "violet" },
  { id: "active", label: "Won", tone: "green" },
  { id: "lost", label: "Lost", tone: "red" }
];

const walkthroughStatuses = ["scheduled", "confirmed", "rescheduled", "completed", "cancelled"];
const quoteStatuses = ["draft", "sent", "viewed", "accepted", "declined", "expired"];
const taskStatuses = ["open", "in_progress", "pending", "completed"];
const priorities = ["low", "medium", "high"];
const salesTaskTypes = [
  "Call decision maker",
  "Confirm $0.25/sq ft",
  "Follow up on pricing fit",
  "Schedule walkthrough",
  "Prepare management handoff",
  "Follow up after walkthrough",
  "No-answer follow-up"
];
const services = [
  "Turnover Cleaning",
  "Model / Leasing Office",
  "Move-in Cleaning",
  "Trash-Out",
  "Before / After Video",
  "Common Area Cleaning"
];
const painPoints = [
  "Quality issues",
  "Communication",
  "Missed deadlines",
  "Last-minute needs",
  "Vendor turnover",
  "Budget pressure"
];

const optionalColumns = [
  "company_name",
  "contact_name",
  "contact_email",
  "contact_phone",
  "lead_value",
  "square_feet",
  "sales_owner_id",
  "sales_owner_name",
  "next_step",
  "next_step_due_at",
  "last_activity_at",
  "lead_source",
  "lead_notes",
  "walkthrough_at",
  "walkthrough_end_at",
  "walkthrough_type",
  "walkthrough_location",
  "walkthrough_assigned_to",
  "walkthrough_status",
  "walkthrough_notes",
  "quote_amount",
  "quote_sent_at",
  "quote_notes",
  "sales_city",
  "sales_state",
  "sales_county",
  "sales_website",
  "property_class",
  "prospect_unit_count",
  "average_turns_per_month",
  "budget_range",
  "desired_start_date",
  "decision_maker_status",
  "current_vendor",
  "service_needs",
  "sales_pain_points",
  "opportunity_score",
  "qualification_notes",
  "quote_status",
  "quote_expires_at",
  "contract_status",
  "contract_due_at",
  "task_type",
  "task_priority",
  "task_status",
  "task_due_at",
  "sales_activity_log",
  "created_by"
];

const coreColumns = new Set([
  "id",
  "created_by",
  "client_id",
  "property_name",
  "name",
  "address",
  "pipeline_stage",
  "default_service_type",
  "default_scope",
  "lead_source",
  "lead_notes",
  "walkthrough_at",
  "walkthrough_end_at",
  "walkthrough_type",
  "walkthrough_location",
  "walkthrough_assigned_to",
  "walkthrough_status",
  "walkthrough_notes",
  "quote_amount",
  "quote_sent_at",
  "quote_notes",
  "company_name",
  "contact_name",
  "contact_email",
  "contact_phone",
  "lead_value",
  "square_feet",
  "sales_owner_id",
  "sales_owner_name",
  "next_step",
  "next_step_due_at",
  "last_activity_at",
  "created_by"
]);

const leadColumnSet = new Set([
  "created_by",
  "client_id",
  "property_name",
  "name",
  "company_name",
  "contact_name",
  "contact_email",
  "contact_phone",
  "address",
  "sales_city",
  "sales_state",
  "sales_county",
  "sales_website",
  "property_class",
  "prospect_unit_count",
  "average_turns_per_month",
  "budget_range",
  "desired_start_date",
  "decision_maker_status",
  "current_vendor",
  "service_needs",
  "sales_pain_points",
  "opportunity_score",
  "qualification_notes",
  "default_service_type",
  "default_scope",
  "lead_source",
  "lead_notes",
  "lead_value",
  "pipeline_stage",
  "sales_owner_id",
  "sales_owner_name",
  "next_step",
  "next_step_due_at",
  "task_priority",
  "task_status",
  "task_due_at",
  "last_activity_at"
]);

const walkthroughColumnSet = new Set([
  "walkthrough_at",
  "walkthrough_end_at",
  "walkthrough_type",
  "walkthrough_location",
  "walkthrough_assigned_to",
  "walkthrough_status",
  "walkthrough_notes"
]);

const quoteColumnSet = new Set([
  "quote_amount",
  "quote_status",
  "quote_sent_at",
  "quote_expires_at",
  "quote_notes"
]);

const contractColumnSet = new Set([
  "contract_status",
  "contract_due_at",
  "contract_value",
  "contract_notes"
]);

const taskColumnSet = new Set([
  "task_type",
  "task_priority",
  "task_status",
  "task_due_at",
  "next_step"
]);

const fieldAliases = {
  property_name: ["name", "property", "property_name", "lead", "lead_name", "company", "company_name", "business_name"],
  company_name: ["company", "company_name", "management_company", "owner_company"],
  contact_name: ["contact", "contact_name", "primary_contact", "manager", "name"],
  contact_email: ["email", "email_address", "contact_email", "primary_contact_email"],
  contact_phone: ["phone", "phone_number", "mobile", "cell", "contact_phone"],
  address: ["address", "street_address", "property_address", "site_address"],
  sales_city: ["city", "sales_city"],
  sales_state: ["state", "sales_state"],
  sales_county: ["county", "sales_county"],
  property_class: ["class", "property_class", "property_type"],
  prospect_unit_count: ["units", "unit_count", "total_units", "prospect_unit_count"],
  average_turns_per_month: ["turns_per_month", "average_turns_per_month", "monthly_turns"],
  lead_source: ["source", "lead_source", "referral_source"],
  lead_value: ["value", "lead_value", "pipeline_value", "annual_value", "quote_amount"],
  pipeline_stage: ["stage", "status", "pipeline_stage"],
  budget_range: ["pricing_fit", "price_fit", "cost_fit", "pricing_acceptance", "budget_range"],
  next_step: ["next_steps", "next_step", "next_action", "task", "follow_up"],
  next_step_due_at: ["due_date", "follow_up_date", "next_step_due_at", "next_step_due"],
  lead_notes: ["notes", "lead_notes", "comments"]
};

const iconPaths = {
  dashboard: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/>',
  "file-text": '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/>',
  "file-check": '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="m9 15 2 2 4-4"/>',
  "clipboard-check": '<path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><path d="M9 5a3 3 0 0 1 6 0v1H9z"/><path d="m9 14 2 2 4-4"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
  plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5"/><path d="M12 3v12"/>',
  chevron: '<path d="m9 18 6-6-6-6"/>',
  left: '<path d="m15 18-6-6 6-6"/>',
  check: '<path d="m20 6-11 11-5-5"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  dollar: '<path d="M12 2v20"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
  trophy: '<path d="M8 21h8"/><path d="M12 17v4"/><path d="M7 4h10v6a5 5 0 0 1-10 0z"/><path d="M5 5H3v2a4 4 0 0 0 4 4"/><path d="M19 5h2v2a4 4 0 0 1-4 4"/>',
  phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.86 19.86 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.86 19.86 0 0 1 2.1 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.9.33 1.77.63 2.61a2 2 0 0 1-.45 2.11L8 9.73a16 16 0 0 0 6.27 6.27l1.29-1.29a2 2 0 0 1 2.11-.45c.84.3 1.71.51 2.61.63A2 2 0 0 1 22 16.92z"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  map: '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0z"/><circle cx="12" cy="10" r="3"/>',
  building: '<path d="M3 21h18"/><path d="M5 21V5a2 2 0 0 1 2-2h7v18"/><path d="M14 8h3a2 2 0 0 1 2 2v11"/><path d="M8 7h2"/><path d="M8 11h2"/><path d="M8 15h2"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  more: '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>'
};

const env = window.__ENV || {};
const supabase = env.SUPABASE_URL && env.SUPABASE_ANON_KEY
  ? createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY)
  : null;

const app = document.getElementById("salesApp");
const retiredPages = new Set(["quotes", "contracts"]);
const requestedSalesPage = document.body.dataset.salesPage || "dashboard";
if (retiredPages.has(requestedSalesPage)) {
  window.history.replaceState(null, "", "sales.html");
}

const state = {
  page: retiredPages.has(requestedSalesPage) ? "dashboard" : requestedSalesPage,
  user: null,
  profile: null,
  rows: [],
  leads: [],
  walkthroughs: [],
  quotes: [],
  contracts: [],
  tasks: [],
  activities: [],
  reps: [],
  selectedId: null,
  search: "",
  ownerFilter: "all",
  stageFilter: "all",
  statusFilter: "all",
  calendarMode: "month",
  dateCursor: new Date(),
  modal: null,
  importPayloads: [],
  importErrors: [],
  importFileName: "",
  selectedLeadIds: new Set(),
  leadFocusMode: false,
  message: "",
  messageTone: "",
  profileOpen: false,
  loading: true
};

function icon(name) {
  return `<svg class="sales-icon" viewBox="0 0 24 24" aria-hidden="true">${iconPaths[name] || iconPaths.dashboard}</svg>`;
}

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function normalize(value) {
  return String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function titleCase(value) {
  return String(value || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function number(value) {
  return Number(value || 0).toLocaleString();
}

function money(value, compact = false) {
  const amount = Number(value) || 0;
  if (compact && Math.abs(amount) >= 1000000) return `$${(amount / 1000000).toFixed(2)}M`;
  if (compact && Math.abs(amount) >= 1000) return `$${Math.round(amount / 1000)}K`;
  return amount.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  });
}

function dateValue(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

function formatDate(value, options = {}) {
  const date = dateValue(value);
  if (!date) return options.empty || "Not set";
  return date.toLocaleDateString(undefined, {
    month: options.month || "short",
    day: options.day || "numeric",
    year: options.year || "numeric"
  });
}

function formatDateTime(value, options = {}) {
  const date = dateValue(value);
  if (!date) return options.empty || "Not scheduled";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function formatTime(value) {
  const date = dateValue(value);
  if (!date) return "";
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function toDateInput(value) {
  const date = dateValue(value);
  if (!date) return "";
  const pad = (part) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function toTimeInput(value) {
  const date = dateValue(value);
  if (!date) return "";
  const pad = (part) => String(part).padStart(2, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function toDateTimeLocal(value) {
  const date = dateValue(value);
  if (!date) return "";
  const pad = (part) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fromDateTimeLocal(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function combineDateTime(date, time, fallback = "10:00") {
  if (!date) return null;
  const parsed = new Date(`${date}T${time || fallback}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function startOfWeek(value = new Date()) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - date.getDay());
  return date;
}

function endOfWeek(value = new Date()) {
  const date = startOfWeek(value);
  date.setDate(date.getDate() + 6);
  date.setHours(23, 59, 59, 999);
  return date;
}

function startOfMonth(value = new Date()) {
  const date = new Date(value);
  date.setDate(1);
  date.setHours(0, 0, 0, 0);
  return date;
}

function addDays(value, days) {
  const date = new Date(value);
  date.setDate(date.getDate() + days);
  return date;
}

function addMonths(value, months) {
  const date = new Date(value);
  date.setMonth(date.getMonth() + months);
  return date;
}

function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

function relativeDate(value) {
  const date = dateValue(value);
  if (!date) return "No activity";
  const diff = Date.now() - date.getTime();
  const minutes = Math.max(1, Math.floor(diff / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function parseList(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (!value) return [];
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.filter(Boolean);
    } catch {
      return value.split(",").map((item) => item.trim()).filter(Boolean);
    }
  }
  return [];
}

function parseActivity(row) {
  const activity = row?.sales_activity_log;
  if (Array.isArray(activity)) return activity;
  if (typeof activity === "string") {
    try {
      const parsed = JSON.parse(activity);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function stageFor(row) {
  const stage = normalize(row?.pipeline_stage || "new_leads");
  return stageDefs.some((item) => item.id === stage) ? stage : "new_leads";
}

function stageMeta(stage) {
  return stageDefs.find((item) => item.id === stage) || stageDefs[0];
}

function stageLabel(stage) {
  return stageMeta(stage).label;
}

function recordTitle(row) {
  return row?.property_name || row?.name || row?.company_name || "Untitled prospect";
}

function recordCompany(row) {
  return row?.company_name || "No company listed";
}

function recordAddress(row) {
  return [row?.address, row?.sales_city, row?.sales_state].filter(Boolean).join(", ") || "No address entered";
}

function recordContact(row) {
  return row?.contact_name || row?.contact_email || row?.contact_phone || "No contact saved";
}

function recordUnits(row) {
  return Number(row?.prospect_unit_count || row?.unit_count || row?.total_units || 0);
}

function recordValue(row) {
  return Number(row?.lead_value || row?.quote_amount || 0);
}

function quoteStatus(row) {
  return normalize(row?.quote_status || (stageFor(row) === "quote_sent" ? "sent" : "draft"));
}

function taskStatus(row) {
  return normalize(row?.task_status || "open");
}

function taskDue(row) {
  return row?.task_due_at || row?.next_step_due_at;
}

function walkthroughAt(row) {
  return row?.walkthrough_at || (stageFor(row) === "walkthrough" ? row?.next_step_due_at : null);
}

function currentName() {
  return state.profile?.full_name || state.user?.user_metadata?.full_name || state.user?.email?.split("@")[0] || "Sales User";
}

function initials(name) {
  return String(name || "TU")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "TU";
}

function roleLabel() {
  if (state.profile?.role === "admin") return "Sales Admin";
  return "Sales Team";
}

function setMessage(text, tone = "") {
  state.message = text || "";
  state.messageTone = tone;
  render();
}

function compactPayload(payload) {
  const output = {};
  Object.entries(payload).forEach(([key, value]) => {
    if (value !== undefined) output[key] = value;
  });
  return output;
}

function pickPayload(payload, allowedColumns) {
  return Object.entries(payload).reduce((acc, [key, value]) => {
    if (allowedColumns.has(key) && value !== undefined) acc[key] = value;
    return acc;
  }, {});
}

function hasPayload(payload) {
  return Object.keys(payload || {}).length > 0;
}

function sortableTime(value) {
  const date = dateValue(value);
  return date ? date.getTime() : 0;
}

function latestRelated(rows, leadId, dateFields = ["updated_at", "created_at"]) {
  return rows
    .filter((row) => row.lead_id === leadId)
    .sort((a, b) => {
      const aTime = Math.max(...dateFields.map((fieldName) => sortableTime(a[fieldName])));
      const bTime = Math.max(...dateFields.map((fieldName) => sortableTime(b[fieldName])));
      return bTime - aTime;
    })[0] || null;
}

function latestTimestamp(...values) {
  const latest = values
    .map((value) => dateValue(value))
    .filter(Boolean)
    .sort((a, b) => b.getTime() - a.getTime())[0];
  return latest ? latest.toISOString() : null;
}

function activityLogForLead(leadId) {
  return state.activities
    .filter((activity) => activity.lead_id === leadId)
    .sort((a, b) => sortableTime(b.created_at) - sortableTime(a.created_at));
}

function composeSalesRow(lead) {
  const leadId = lead.id;
  const walkthrough = latestRelated(state.walkthroughs, leadId, ["walkthrough_at", "updated_at", "created_at"]);
  const quote = latestRelated(state.quotes, leadId, ["quote_sent_at", "updated_at", "created_at"]);
  const contract = latestRelated(state.contracts, leadId, ["contract_due_at", "updated_at", "created_at"]);
  const task = latestRelated(state.tasks, leadId, ["task_due_at", "updated_at", "created_at"]);
  const activities = activityLogForLead(leadId);
  const lastActivityAt = latestTimestamp(
    activities[0]?.created_at,
    task?.updated_at,
    task?.created_at,
    contract?.updated_at,
    contract?.created_at,
    quote?.updated_at,
    quote?.created_at,
    walkthrough?.updated_at,
    walkthrough?.created_at,
    lead.last_activity_at,
    lead.updated_at,
    lead.created_at
  );

  return {
    ...lead,
    name: lead.name || lead.property_name || "",
    walkthrough_at: walkthrough?.walkthrough_at || null,
    walkthrough_end_at: walkthrough?.walkthrough_end_at || null,
    walkthrough_type: walkthrough?.walkthrough_type || "",
    walkthrough_location: walkthrough?.walkthrough_location || "",
    walkthrough_assigned_to_id: walkthrough?.walkthrough_assigned_to_id || null,
    walkthrough_assigned_to: walkthrough?.walkthrough_assigned_to || "",
    walkthrough_status: walkthrough?.walkthrough_status || "",
    walkthrough_notes: walkthrough?.walkthrough_notes || "",
    quote_amount: quote?.quote_amount ?? null,
    quote_status: quote?.quote_status || "draft",
    quote_sent_at: quote?.quote_sent_at || null,
    quote_expires_at: quote?.quote_expires_at || null,
    quote_notes: quote?.quote_notes || "",
    contract_status: contract?.contract_status || "",
    contract_due_at: contract?.contract_due_at || null,
    contract_value: contract?.contract_value ?? null,
    contract_notes: contract?.contract_notes || "",
    task_type: task?.task_type || "",
    task_priority: task?.task_priority || lead.task_priority || "medium",
    task_status: task?.task_status || lead.task_status || "open",
    task_due_at: task?.task_due_at || lead.task_due_at || lead.next_step_due_at || null,
    next_step: task?.next_step || lead.next_step || "",
    next_step_due_at: task?.task_due_at || lead.next_step_due_at || null,
    last_activity_at: lastActivityAt || lead.last_activity_at,
    sales_activity_log: activities.map((activity) => ({
      at: activity.created_at,
      text: activity.activity_text,
      user: activity.user_name,
      type: activity.activity_type,
      metadata: activity.metadata || {}
    }))
  };
}

function composeSalesRows() {
  state.rows = state.leads
    .map(composeSalesRow)
    .sort((a, b) => sortableTime(b.last_activity_at || b.updated_at || b.created_at) - sortableTime(a.last_activity_at || a.updated_at || a.created_at));
}

async function upsertLatestRelated(tableName, existingRows, leadId, payload, dateFields) {
  const cleanPayload = compactPayload(payload);
  if (!hasPayload(cleanPayload)) return null;
  const existing = latestRelated(existingRows, leadId, dateFields);
  const result = existing?.id
    ? await supabase.from(tableName).update(cleanPayload).eq("id", existing.id).select("*").maybeSingle()
    : await supabase.from(tableName).insert([{ lead_id: leadId, created_by: state.user?.id || null, ...cleanPayload }]).select("*").single();

  if (result.error) throw result.error;
  return result.data;
}

async function writeSalesActivity(leadId, activityText, metadata = {}) {
  if (!activityText) return null;
  const { data, error } = await supabase
    .from(SALES_TABLES.activities)
    .insert([{
      lead_id: leadId,
      user_id: state.user?.id || null,
      user_name: currentName(),
      activity_type: "system",
      activity_text: activityText,
      metadata
    }])
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

function contractStatusFromStage(stage) {
  if (stage === "contract_out") return "pending";
  if (stage === "active") return "won";
  if (stage === "lost") return "lost";
  return "";
}

async function saveRecord(id, payload, activityText = "") {
  if (!supabase) throw new Error("Supabase config is missing.");
  const basePayload = compactPayload({
    ...payload,
    last_activity_at: new Date().toISOString()
  });
  const leadPayload = pickPayload(basePayload, leadColumnSet);

  let leadId = id;
  let savedLead = null;
  if (leadId) {
    if (hasPayload(leadPayload)) {
      const result = await supabase
        .from(SALES_TABLES.leads)
        .update(leadPayload)
        .eq("id", leadId)
        .select("*")
        .maybeSingle();
      if (result.error) throw result.error;
      savedLead = result.data;
    } else {
      savedLead = state.leads.find((row) => row.id === leadId) || null;
    }
  } else {
    const result = await supabase
      .from(SALES_TABLES.leads)
      .insert([{ ...leadPayload, created_by: state.user?.id || null }])
      .select("*")
      .single();
    if (result.error) throw result.error;
    savedLead = result.data;
    leadId = savedLead.id;
  }

  const walkthroughPayload = pickPayload(basePayload, walkthroughColumnSet);
  if ("sales_owner_id" in basePayload) walkthroughPayload.walkthrough_assigned_to_id = basePayload.sales_owner_id || null;
  await upsertLatestRelated(SALES_TABLES.walkthroughs, state.walkthroughs, leadId, walkthroughPayload, ["walkthrough_at", "updated_at", "created_at"]);

  const quotePayload = pickPayload(basePayload, quoteColumnSet);
  await upsertLatestRelated(SALES_TABLES.quotes, state.quotes, leadId, quotePayload, ["quote_sent_at", "updated_at", "created_at"]);

  const taskPayload = pickPayload(basePayload, taskColumnSet);
  if (basePayload.next_step_due_at && !taskPayload.task_due_at) taskPayload.task_due_at = basePayload.next_step_due_at;
  const shouldSaveTask = Boolean(
    taskPayload.task_type ||
    taskPayload.task_due_at ||
    taskPayload.next_step ||
    basePayload.next_step_due_at ||
    (taskPayload.task_status && taskPayload.task_status !== "open")
  );
  if (shouldSaveTask) {
    await upsertLatestRelated(SALES_TABLES.tasks, state.tasks, leadId, taskPayload, ["task_due_at", "updated_at", "created_at"]);
  }

  const contractPayload = pickPayload(basePayload, contractColumnSet);
  if (basePayload.pipeline_stage && ["contract_out", "active", "lost"].includes(basePayload.pipeline_stage)) {
    contractPayload.contract_status = contractPayload.contract_status || contractStatusFromStage(basePayload.pipeline_stage);
    contractPayload.contract_value = contractPayload.contract_value ?? basePayload.lead_value ?? basePayload.quote_amount ?? null;
  }
  await upsertLatestRelated(SALES_TABLES.contracts, state.contracts, leadId, contractPayload, ["contract_due_at", "updated_at", "created_at"]);

  await writeSalesActivity(leadId, activityText, { changedFields: Object.keys(payload || {}) });
  return { ...(savedLead || {}), id: leadId };
}

async function requireSalesAccess() {
  if (!supabase) {
    state.loading = false;
    state.message = "Supabase config is missing. Add env.js values before using the Sales Portal.";
    state.messageTone = "error";
    render();
    return false;
  }

  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) {
    window.location.href = "sales-login.html";
    return false;
  }

  state.user = data.user;
  const { data: profile } = await supabase
    .from(PROFILES_TABLE)
    .select("id,full_name,email,role,status")
    .eq("id", data.user.id)
    .maybeSingle();

  const role = normalize(profile?.role || data.user.user_metadata?.role);
  if (!allowedRoles.has(role)) {
    window.location.href = "index.html";
    return false;
  }

  state.profile = profile || { role };
  return true;
}

async function loadRows() {
  const queries = await Promise.all([
    supabase.from(SALES_TABLES.leads).select("*").order("last_activity_at", { ascending: false }).limit(2000),
    supabase.from(SALES_TABLES.walkthroughs).select("*").order("created_at", { ascending: false }).limit(2000),
    supabase.from(SALES_TABLES.quotes).select("*").order("created_at", { ascending: false }).limit(2000),
    supabase.from(SALES_TABLES.contracts).select("*").order("created_at", { ascending: false }).limit(2000),
    supabase.from(SALES_TABLES.tasks).select("*").order("created_at", { ascending: false }).limit(2000),
    supabase.from(SALES_TABLES.activities).select("*").order("created_at", { ascending: false }).limit(4000)
  ]);
  const error = queries.find((result) => result.error)?.error;
  if (error) throw error;

  state.leads = queries[0].data || [];
  state.walkthroughs = queries[1].data || [];
  state.quotes = queries[2].data || [];
  state.contracts = queries[3].data || [];
  state.tasks = queries[4].data || [];
  state.activities = queries[5].data || [];
  composeSalesRows();
  const liveLeadIds = new Set(state.rows.map((row) => row.id));
  state.selectedLeadIds = new Set([...state.selectedLeadIds].filter((id) => liveLeadIds.has(id)));
}

async function loadReps() {
  const { data, error } = await supabase
    .from(PROFILES_TABLE)
    .select("id,full_name,email,role,status")
    .in("role", ["admin", "sales", "sales_team"])
    .order("full_name", { ascending: true });

  if (error) {
    state.reps = [];
    return;
  }

  state.reps = data || [];
}

async function refreshData(showLoading = true) {
  if (showLoading) {
    state.loading = true;
    render();
  }

  try {
    await Promise.all([loadRows(), loadReps()]);
    state.loading = false;
    state.message = "";
    render();
  } catch (error) {
    state.loading = false;
    state.message = `Unable to load sales data: ${error.message}`;
    state.messageTone = "error";
    render();
  }
}

function pageTitle() {
  return pageConfig[state.page] || pageConfig.dashboard;
}

function render() {
  if (!app) return;
  app.innerHTML = `
    <main class="sales-app">
      ${renderSidebar()}
      <section class="sales-main">
        ${renderTopbar()}
        <section class="sales-page-body">
          ${state.message ? `<p class="sales-message ${esc(state.messageTone)}">${esc(state.message)}</p>` : ""}
          ${state.loading ? renderLoading() : renderPage()}
        </section>
      </section>
      ${renderModal()}
    </main>
  `;
}

function renderSidebar() {
  return `
    <aside class="sales-sidebar">
      <a class="sales-brand" href="sales.html" aria-label="Turnly sales dashboard">
        <span class="sales-brand-mark">T</span>
        <span>
          <strong>Turnly</strong>
          <small>Sales Platform</small>
        </span>
      </a>
      <p class="sales-side-kicker">Sales</p>
      <nav class="sales-nav" aria-label="Sales navigation">
        ${navItems.map(([key, label, href, iconName]) => `
          <a class="sales-nav-link ${state.page === key ? "active" : ""}" href="${href}">
            ${icon(iconName)}<span>${label}</span>
          </a>
        `).join("")}
      </nav>
      <div class="sales-sidebar-footer">
        <div class="sales-collapse-note">${icon("left")}<span>Collapse</span></div>
      </div>
    </aside>
  `;
}

function renderTopbar() {
  const page = pageTitle();
  return `
    <header class="sales-topbar">
      <div class="sales-title">
        <h1>${esc(page.title)}</h1>
        <p>${esc(page.subtitle)}</p>
      </div>
      <div class="sales-top-actions">
        <label class="sales-search" aria-label="Search sales records">
          ${icon("search")}
          <input id="salesGlobalSearch" type="search" value="${esc(state.search)}" placeholder="Search leads, clients, properties..." />
        </label>
        <button class="sales-date-pill" type="button" data-calendar-today>
          ${icon("calendar")}
          <span>${esc(formatDate(startOfWeek(), { year: "numeric" }))} - ${esc(formatDate(endOfWeek(), { year: "numeric" }))}</span>
        </button>
        <button class="sales-icon-button" type="button" aria-label="Notifications">
          ${icon("bell")}
          <span class="sales-badge">${number(openTasks().length)}</span>
        </button>
        <button class="sales-primary-button sales-upload-prospects-button" type="button" data-open-import>
          ${icon("upload")}<span>Upload Prospects</span>
        </button>
        <div class="sales-profile">
          <button class="sales-profile-button" type="button" data-profile-toggle aria-expanded="${state.profileOpen ? "true" : "false"}">
            <span class="sales-avatar">${esc(initials(currentName()))}</span>
            <span>
              <strong>${esc(currentName())}</strong>
              <small>${esc(roleLabel())}</small>
            </span>
            ${icon("chevron")}
          </button>
          <div class="sales-profile-menu" ${state.profileOpen ? "" : "hidden"}>
            <a href="index.html">${icon("dashboard")}Portal Home</a>
            <button type="button" data-sales-logout>${icon("left")}Sign Out</button>
          </div>
        </div>
      </div>
    </header>
  `;
}

function renderLoading() {
  return `
    <section class="sales-panel sales-empty">
      <div>
        <strong>Loading sales portal</strong>
        <p>Pulling the latest prospects and workflow details from Supabase.</p>
      </div>
    </section>
  `;
}

function renderPage() {
  if (state.page === "leads") return renderLeadsPage();
  if (state.page === "walkthroughs") return renderWalkthroughsPage();
  if (state.page === "tasks") return renderTasksPage();
  return renderDashboardPage();
}

function baseFilteredRows(rows = state.rows) {
  const search = state.search.trim().toLowerCase();
  return rows.filter((row) => {
    if (state.ownerFilter !== "all") {
      if (state.ownerFilter === "unassigned" && row.sales_owner_id) return false;
      if (state.ownerFilter !== "unassigned" && row.sales_owner_id !== state.ownerFilter) return false;
    }
    if (state.stageFilter !== "all" && stageFor(row) !== state.stageFilter) return false;
    if (state.statusFilter !== "all") {
      const status = statusForCurrentPage(row);
      if (status !== state.statusFilter) return false;
    }
    if (!search) return true;
    return [
      recordTitle(row),
      recordCompany(row),
      recordContact(row),
      recordAddress(row),
      row.lead_source,
      row.next_step,
      row.default_scope,
      row.lead_notes,
      row.walkthrough_notes,
      row.quote_notes
    ].some((value) => String(value || "").toLowerCase().includes(search));
  });
}

function statusForCurrentPage(row) {
  if (state.page === "walkthroughs") return normalize(row.walkthrough_status || "scheduled");
  if (state.page === "quotes") return quoteStatus(row);
  if (state.page === "tasks") return taskStatus(row);
  return stageFor(row);
}

function ownerName(row) {
  return row.sales_owner_name || state.reps.find((rep) => rep.id === row.sales_owner_id)?.full_name || "Unassigned";
}

function selectRecord(rows) {
  if (!rows.length) {
    state.selectedId = null;
    return null;
  }
  if (!rows.some((row) => row.id === state.selectedId)) state.selectedId = rows[0].id;
  return rows.find((row) => row.id === state.selectedId) || rows[0];
}

function rowsByStage(stage) {
  return state.rows.filter((row) => stageFor(row) === stage);
}

function dateInRange(value, start, end) {
  const date = dateValue(value);
  return Boolean(date && date >= start && date <= end);
}

function thisWeekRows(rows = state.rows, field = "created_at") {
  const start = startOfWeek();
  const end = endOfWeek();
  return rows.filter((row) => dateInRange(row[field], start, end));
}

function metricCard(label, value, detail, iconName, tone = "green") {
  return `
    <article class="sales-metric-card ${tone}">
      <span class="sales-metric-icon">${icon(iconName)}</span>
      <div>
        <span>${esc(label)}</span>
        <strong>${esc(value)}</strong>
        <small>${esc(detail)}</small>
      </div>
    </article>
  `;
}

function renderDashboardPage() {
  const total = state.rows.length;
  const newWeek = thisWeekRows().length;
  const walkthroughCount = walkthroughRows().length;
  const pricingConfirmedCount = rowsByStage("quote_sent").length;
  const managementReviewCount = rowsByStage("contract_out").length;
  const won = rowsByStage("active").length;
  const closed = won + rowsByStage("lost").length;
  const winRate = closed ? Math.round((won / closed) * 1000) / 10 : 0;

  return `
    <section class="sales-metric-grid">
      ${metricCard("Total Prospects", number(total), `${number(rowsByStage("new_leads").length)} new this cycle`, "users", "green")}
      ${metricCard("New This Week", number(newWeek), "created this week", "plus", "green")}
      ${metricCard("Pricing Confirmed", number(pricingConfirmedCount), "$0.25/sq ft fit accepted", "check", "yellow")}
      ${metricCard("Walkthroughs Set", number(walkthroughCount), "ready for management", "calendar", "cyan")}
      ${metricCard("Management Review", number(managementReviewCount), "ready to close", "clipboard-check", "violet")}
      ${metricCard("Win Rate", `${winRate}%`, `${number(won)} won opportunities`, "trophy", "violet")}
    </section>

    <section class="sales-dashboard-grid">
      <article class="sales-panel sales-chart-shell">
        <div class="sales-panel-header">
          <div>
            <h2>Leads Trend</h2>
            <p>New prospects added by month.</p>
          </div>
          <button class="sales-secondary-button" type="button" data-open-import>${icon("upload")}Import</button>
        </div>
        ${renderMonthlyLineChart()}
      </article>

      <article class="sales-panel sales-chart-shell">
        <div class="sales-panel-header">
          <div>
            <h2>Qualification Funnel</h2>
            <p>Where prospects stand before management walkthroughs.</p>
          </div>
        </div>
        ${renderFunnel()}
      </article>

      <article class="sales-panel">
        <div class="sales-panel-header">
          <div>
            <h2>Upcoming Walkthroughs</h2>
            <p>Next scheduled property visits.</p>
          </div>
          <a class="sales-link-action" href="sales-walkthroughs.html">View All</a>
        </div>
        ${renderUpcomingWalkthroughs(6)}
      </article>
    </section>

    <section class="sales-two-column">
      <article class="sales-panel">
        <div class="sales-panel-header">
          <div>
            <h2>Fit-Ready Snapshot</h2>
            <p>How many prospects are ready for a walkthrough conversation.</p>
          </div>
        </div>
        ${renderConversionDonut()}
      </article>
      <article class="sales-panel">
        <div class="sales-panel-header">
          <div>
            <h2>Recent Activity</h2>
            <p>Latest movement across the sales floor.</p>
          </div>
        </div>
        ${renderRecentActivity()}
      </article>
    </section>

    <section class="sales-panel">
      <div class="sales-panel-header">
        <div>
          <h2>Prospect Work Queue</h2>
          <p>Next leads and follow-ups your team should work through.</p>
        </div>
        <a class="sales-link-action" href="sales-leads.html">Open Leads</a>
      </div>
      ${renderProspectWorkQueue()}
    </section>
  `;
}

function renderMonthlyLineChart() {
  const months = [];
  const cursor = new Date();
  cursor.setDate(1);
  cursor.setHours(0, 0, 0, 0);
  for (let i = 5; i >= 0; i -= 1) {
    const date = addMonths(cursor, -i);
    months.push({
      key: `${date.getFullYear()}-${date.getMonth()}`,
      label: date.toLocaleDateString(undefined, { month: "short", year: "2-digit" }),
      count: 0
    });
  }

  state.rows.forEach((row) => {
    const date = dateValue(row.created_at);
    if (!date) return;
    const key = `${date.getFullYear()}-${date.getMonth()}`;
    const bucket = months.find((item) => item.key === key);
    if (bucket) bucket.count += 1;
  });

  const max = Math.max(1, ...months.map((item) => item.count));
  const points = months.map((item, index) => {
    const x = 40 + (index * (620 / Math.max(1, months.length - 1)));
    const y = 235 - (item.count / max) * 185;
    return { ...item, x, y };
  });
  const pointString = points.map((point) => `${point.x},${point.y}`).join(" ");
  const areaString = `40,245 ${pointString} 660,245`;

  return `
    <svg class="sales-line-chart" viewBox="0 0 700 280" role="img" aria-label="Monthly lead trend">
      <line class="sales-grid-line" x1="40" x2="660" y1="50" y2="50"></line>
      <line class="sales-grid-line" x1="40" x2="660" y1="112" y2="112"></line>
      <line class="sales-grid-line" x1="40" x2="660" y1="174" y2="174"></line>
      <line class="sales-grid-line" x1="40" x2="660" y1="236" y2="236"></line>
      <polygon class="sales-chart-area" points="${areaString}"></polygon>
      <polyline class="sales-chart-line" points="${pointString}"></polyline>
      ${points.map((point) => `
        <g>
          <circle class="sales-chart-point" cx="${point.x}" cy="${point.y}" r="5"></circle>
          <text class="sales-axis-label" x="${point.x}" y="${point.y - 14}" text-anchor="middle">${number(point.count)}</text>
          <text class="sales-axis-label" x="${point.x}" y="265" text-anchor="middle">${esc(point.label)}</text>
        </g>
      `).join("")}
    </svg>
  `;
}

function renderFunnel() {
  const funnelStages = [
    { id: "new_leads", label: "New Prospects", detail: "Need first touch", tone: "green" },
    { id: "contacted", label: "Contacted", detail: "Conversation started", tone: "cyan" },
    { id: "quote_sent", label: "Pricing Confirmed", detail: "$0.25/sq ft accepted", tone: "yellow" },
    { id: "walkthrough", label: "Walkthrough Set", detail: "Ready for management", tone: "blue" },
    { id: "contract_out", label: "Management Review", detail: "Management closing", tone: "violet" },
    { id: "active", label: "Won", detail: "Active client", tone: "green" }
  ].map((stage) => ({ ...stage, count: rowsByStage(stage.id).length }));
  const total = Math.max(1, state.rows.length);
  const maxCount = Math.max(1, ...funnelStages.map((stage) => stage.count));
  return `
    <div class="sales-funnel">
      ${funnelStages.map((stage) => {
        const percent = Math.round((stage.count / total) * 1000) / 10;
        const width = stage.count ? Math.max(8, Math.round((stage.count / maxCount) * 100)) : 0;
        return `
          <div class="sales-funnel-row">
            <div class="sales-funnel-stage">
              <strong>${esc(stage.label)}</strong>
              <small>${esc(stage.detail)}</small>
            </div>
            <div class="sales-funnel-track" aria-label="${esc(`${stage.label}: ${stage.count} prospects`)}">
              <div class="sales-funnel-bar ${esc(stage.tone)}" style="width:${width}%"></div>
            </div>
            <span class="sales-funnel-count">${number(stage.count)}</span>
            <span class="sales-funnel-rate">${percent}%</span>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function renderConversionDonut() {
  const total = Math.max(1, state.rows.length);
  const pricingFit = rowsByStage("quote_sent").length;
  const walkthroughSet = rowsByStage("walkthrough").length;
  const managementReview = rowsByStage("contract_out").length;
  const won = rowsByStage("active").length;
  const idealCandidates = state.rows.filter((row) =>
    Number(row.opportunity_score || 0) >= 75 ||
    ["quote_sent", "walkthrough", "contract_out", "active"].includes(stageFor(row))
  ).length;
  const needsQualification = state.rows.filter((row) => ["new_leads", "contacted"].includes(stageFor(row))).length;
  const rate = Math.round((idealCandidates / total) * 1000) / 10;
  const legendRows = [
    { label: "Ideal candidates", value: `${number(idealCandidates)} (${rate}%)`, tone: "green" },
    { label: "$0.25/sq ft confirmed", value: number(pricingFit), tone: "yellow" },
    { label: "Walkthroughs set", value: number(walkthroughSet), tone: "blue" },
    { label: "Management review", value: number(managementReview), tone: "violet" },
    { label: "Needs qualification", value: number(needsQualification), tone: "cyan" },
    { label: "Won", value: number(won), tone: "green" }
  ];
  return `
    <div class="sales-donut-layout">
      <div class="sales-donut" style="--donut-value:${Math.max(2, rate)}%" role="img" aria-label="${esc(`${rate}% of prospects are fit ready`)}">
        <span>${rate}%<small>Fit Ready</small></span>
      </div>
      <div class="sales-legend">
        ${legendRows.map((item) => `
            <div class="sales-legend-row">
              <i class="sales-dot ${esc(item.tone)}"></i>
              <span>${esc(item.label)}</span>
              <strong>${esc(item.value)}</strong>
            </div>
          `).join("")}
      </div>
    </div>
  `;
}

function renderUpcomingWalkthroughs(limit = 5) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const rows = walkthroughRows()
    .filter((row) => dateValue(walkthroughAt(row)) >= today)
    .sort((a, b) => dateValue(walkthroughAt(a)) - dateValue(walkthroughAt(b)))
    .slice(0, limit);

  if (!rows.length) return emptyState("No walkthroughs scheduled", "Schedule one from the Walkthroughs page.");

  return `
    <div class="sales-upcoming-list">
      ${rows.map((row) => `
        <button class="sales-upcoming-row" type="button" data-select-record="${esc(row.id)}" data-go-page="walkthroughs">
          <i class="sales-dot ${esc(stageMeta(stageFor(row)).tone)}"></i>
          <span>
            <strong>${esc(recordTitle(row))}</strong>
            <span>${esc(formatDateTime(walkthroughAt(row)))} with ${esc(row.walkthrough_assigned_to || ownerName(row))}</span>
          </span>
          ${icon("chevron")}
        </button>
      `).join("")}
    </div>
  `;
}

function renderRecentActivity(limit = 5) {
  const rows = [...state.rows]
    .sort((a, b) => dateValue(b.last_activity_at || b.updated_at || b.created_at) - dateValue(a.last_activity_at || a.updated_at || a.created_at))
    .slice(0, limit);

  if (!rows.length) return emptyState("No sales activity yet", "Import prospects or add a lead to begin.");

  return `
    <div class="sales-activity-list">
      ${rows.map((row) => {
        const stage = stageMeta(stageFor(row));
        return `
          <button class="sales-activity-row" type="button" data-select-record="${esc(row.id)}" data-go-page="leads">
            <i class="sales-dot ${esc(stage.tone)}"></i>
            <span>
              <strong>${esc(stage.label)}</strong>
              <span>${esc(recordTitle(row))}</span>
            </span>
            <small>${esc(relativeDate(row.last_activity_at || row.updated_at || row.created_at))}</small>
          </button>
        `;
      }).join("")}
    </div>
  `;
}

function renderProspectWorkQueue(limit = 8) {
  const rows = baseFilteredRows(state.rows)
    .filter((row) => !["active", "lost"].includes(stageFor(row)))
    .sort((a, b) => {
      const aDue = dateValue(taskDue(a)) || dateValue(a.walkthrough_at) || dateValue(a.last_activity_at) || dateValue(a.created_at);
      const bDue = dateValue(taskDue(b)) || dateValue(b.walkthrough_at) || dateValue(b.last_activity_at) || dateValue(b.created_at);
      return (aDue?.getTime() || 0) - (bDue?.getTime() || 0);
    })
    .slice(0, limit);

  if (!rows.length) return emptyState("No open prospects", "Upload a prospect list or create a new lead to start the queue.");

  return `
    <div class="sales-work-queue">
      ${rows.map((row) => {
        const stage = stageFor(row);
        const due = taskDue(row) || walkthroughAt(row);
        const actionLabel = stage === "new_leads" || stage === "contacted"
          ? "Qualify"
          : stage === "walkthrough"
            ? "Walkthrough"
            : stage === "quote_sent"
              ? "Set Walkthrough"
              : "Review";
        const actionPage = ["walkthrough", "quote_sent", "contract_out"].includes(stage) ? "walkthroughs" : "leads";
        return `
          <article class="sales-work-row">
            <div>
              <span class="sales-status-pill ${esc(stage)}">${esc(stageLabel(stage))}</span>
              <strong>${esc(recordTitle(row))}</strong>
              <small>${esc(recordContact(row))} ${due ? `- ${formatDateTime(due)}` : "- No due date"}</small>
            </div>
            <div>
              <strong>${recordUnits(row) ? number(recordUnits(row)) : "--"}</strong>
              <small>units</small>
            </div>
            <div>
              <strong>${money(recordValue(row), true)}</strong>
              <small>pipeline</small>
            </div>
            <div class="sales-row-actions">
              <button class="sales-secondary-button" type="button" data-open-task="${esc(row.id)}">${icon("clipboard-check")}Follow-up</button>
              <button class="sales-primary-button" type="button" data-go-page="${esc(actionPage)}" data-select-record="${esc(row.id)}">${esc(actionLabel)}</button>
            </div>
          </article>
        `;
      }).join("")}
    </div>
  `;
}

function emptyState(title, text) {
  return `
    <div class="sales-empty">
      <div>
        <strong>${esc(title)}</strong>
        <p>${esc(text || "")}</p>
      </div>
    </div>
  `;
}

function renderFilters(options = {}) {
  const stageOptions = `<option value="all">All Stages</option>${stageDefs.map((stage) => `<option value="${stage.id}" ${state.stageFilter === stage.id ? "selected" : ""}>${esc(stage.label)}</option>`).join("")}`;
  const ownerOptions = `<option value="all">All Reps</option><option value="unassigned" ${state.ownerFilter === "unassigned" ? "selected" : ""}>Unassigned</option>${state.reps.map((rep) => `<option value="${rep.id}" ${state.ownerFilter === rep.id ? "selected" : ""}>${esc(rep.full_name || rep.email || "Sales user")}</option>`).join("")}`;
  const statusOptions = options.statuses
    ? `<option value="all">All Statuses</option>${options.statuses.map((status) => `<option value="${status}" ${state.statusFilter === status ? "selected" : ""}>${esc(titleCase(status))}</option>`).join("")}`
    : "";

  return `
    <div class="sales-filter-bar">
      <label class="sales-search">
        ${icon("search")}
        <input id="salesPageSearch" type="search" value="${esc(state.search)}" placeholder="${esc(options.placeholder || "Search records...")}" />
      </label>
      <select class="sales-filter" data-filter-owner>${ownerOptions}</select>
      <select class="sales-filter" data-filter-stage>${stageOptions}</select>
      ${options.statuses ? `<select class="sales-filter" data-filter-status>${statusOptions}</select>` : `<span></span>`}
      <button class="sales-primary-button" type="button" data-open-lead>${icon("plus")}New Prospect</button>
    </div>
  `;
}

function renderLeadFilters() {
  return `
    <div class="sales-lead-filter-row">
      <label class="sales-search">
        ${icon("search")}
        <input id="salesPageSearch" type="search" value="${esc(state.search)}" placeholder="Search prospects..." />
      </label>
    </div>
  `;
}

function renderStageTabs() {
  return `
    <div class="sales-tabs" role="tablist" aria-label="Pipeline stages">
      <button class="sales-tab-button ${state.stageFilter === "all" ? "active" : ""}" type="button" data-set-stage-filter="all">All</button>
      ${stageDefs.map((stage) => `
        <button class="sales-tab-button ${state.stageFilter === stage.id ? "active" : ""}" type="button" data-set-stage-filter="${stage.id}">
          ${esc(stage.label)}
        </button>
      `).join("")}
    </div>
  `;
}

function renderLeadsPage() {
  const rows = baseFilteredRows();
  if (state.leadFocusMode) return renderLeadFocusMode(rows);
  const selectedCount = state.selectedLeadIds.size;
  const visibleSelectedCount = rows.filter((row) => state.selectedLeadIds.has(row.id)).length;
  const allVisibleSelected = Boolean(rows.length && visibleSelectedCount === rows.length);
  return `
    <section class="sales-leads-start">
      <button class="sales-focus-start-button" type="button" data-enter-lead-focus ${rows.length ? "" : "disabled"}>
        <span>${icon("check")}</span>
        <strong>Let's Get To Work</strong>
        <small>${rows.length ? `${number(rows.length)} prospect${rows.length === 1 ? "" : "s"} in this view` : "Upload prospects to begin"}</small>
      </button>
    </section>
    <section class="sales-leads-layout">
      <article class="sales-panel sales-leads-panel">
        <div class="sales-panel-header">
          <div>
            <h2>Prospect List</h2>
            <p>Name, address, phone, stage, and next steps.</p>
          </div>
          <div class="sales-row-actions">
            <button class="sales-secondary-button" type="button" data-open-import>${icon("upload")}Upload</button>
            <button class="sales-secondary-button" type="button" data-open-lead>${icon("plus")}Add Lead</button>
            <button class="sales-danger-button" type="button" data-delete-selected-leads ${selectedCount ? "" : "disabled"}>${icon("x")}Delete Selected</button>
          </div>
        </div>
        ${renderLeadFilters()}
        ${renderStageTabs()}
        <div class="sales-bulk-toolbar">
          <label>
            <input type="checkbox" data-lead-select-all ${allVisibleSelected ? "checked" : ""} ${rows.length ? "" : "disabled"} />
            <span>Select all visible</span>
          </label>
          <strong>${number(selectedCount)} selected</strong>
        </div>
        ${renderLeadTable(rows)}
      </article>
    </section>
  `;
}

function renderLeadTable(rows) {
  if (!rows.length) return emptyState("No prospects found", "Upload a prospect list or create a new prospect.");
  return `
    <div class="sales-table-wrap">
      <table class="sales-table sales-leads-table">
        <thead>
          <tr>
            <th></th>
            <th>Name</th>
            <th>Address</th>
            <th>Phone Number</th>
            <th>Stage</th>
            <th>Next Steps</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((row) => `
            <tr class="${row.id === state.selectedId ? "active" : ""}">
              <td>
                <input type="checkbox" data-lead-select="${esc(row.id)}" aria-label="Select ${esc(recordTitle(row))}" ${state.selectedLeadIds.has(row.id) ? "checked" : ""} />
              </td>
              <td><strong>${esc(recordTitle(row))}</strong></td>
              <td>${esc(recordAddress(row) || "No address saved")}</td>
              <td>${esc(row.contact_phone || "No phone saved")}</td>
              <td>
                <select class="sales-filter" data-inline-stage="${esc(row.id)}" aria-label="Update stage">
                  ${stageDefs.map((stage) => `<option value="${stage.id}" ${stageFor(row) === stage.id ? "selected" : ""}>${esc(stage.label)}</option>`).join("")}
                </select>
              </td>
              <td><strong>${esc(row.next_step || "No next step")}</strong><small>${esc(formatDateTime(taskDue(row), { empty: "" }))}</small></td>
              <td>
                <div class="sales-row-actions compact">
                  <button class="sales-secondary-button" type="button" data-select-record="${esc(row.id)}" data-enter-lead-focus>${icon("check")}Focus</button>
                  <button class="sales-secondary-button" type="button" data-open-lead="${esc(row.id)}">${icon("more")}Edit</button>
                </div>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderLeadFocusMode(rows) {
  const row = selectRecord(rows);
  if (!row) {
    return `
      <section class="sales-panel sales-empty">
        <div>
          <strong>No prospects in this view</strong>
          <p>Upload prospects or clear filters to start focus mode.</p>
        </div>
        <button class="sales-secondary-button" type="button" data-exit-lead-focus>${icon("left")}Back To Leads</button>
      </section>
    `;
  }
  const index = rows.findIndex((item) => item.id === row.id);
  const position = index >= 0 ? index + 1 : 1;
  const phoneHref = contactPhoneHref(row);
  return `
    <section class="sales-lead-focus-shell">
      <article class="sales-panel sales-lead-focus-card">
        <header class="sales-focus-header">
          <div>
            <span class="sales-status-pill ${esc(stageFor(row))}">${esc(stageLabel(stageFor(row)))}</span>
            <h2>${esc(recordTitle(row))}</h2>
            <p>${number(position)} of ${number(rows.length)} prospects in this view</p>
          </div>
          <button class="sales-secondary-button" type="button" data-exit-lead-focus>${icon("x")}Exit Focus</button>
        </header>
        <form data-focus-lead-form data-record-id="${esc(row.id)}">
          <div class="sales-focus-grid">
            ${field("property_name", "Name", recordTitle(row), "text", true)}
            ${field("contact_phone", "Phone Number", row.contact_phone || "")}
            ${field("address", "Address", row.address || "", "text", false, "span-two")}
            ${selectField("pipeline_stage", "Stage", stageDefs.map((stage) => [stage.id, stage.label]), stageFor(row))}
            ${selectField("task_status", "Follow-up Status", taskStatuses.map((status) => [status, titleCase(status)]), taskStatus(row))}
            ${field("next_step_due_at", "Next Step Due", toDateTimeLocal(taskDue(row)), "datetime-local")}
            ${textAreaField("next_step", "Next Steps", row.next_step || "", "span-two")}
            ${textAreaField("lead_notes", "Notes", row.lead_notes || row.default_scope || "", "span-two")}
          </div>
          <footer class="sales-focus-footer">
            <p class="sales-message" data-modal-message></p>
            <div class="sales-row-actions">
              <button class="sales-secondary-button" type="button" data-focus-prev ${rows.length <= 1 ? "disabled" : ""}>${icon("left")}Previous</button>
              ${phoneHref ? `<a class="sales-secondary-button" href="${esc(phoneHref)}">${icon("phone")}Call</a>` : `<button class="sales-secondary-button" type="button" disabled>${icon("phone")}Call</button>`}
              <button class="sales-primary-button" type="submit">${icon("check")}Save Progress</button>
              <button class="sales-secondary-button" type="button" data-focus-next ${rows.length <= 1 ? "disabled" : ""}>Next${icon("chevron")}</button>
            </div>
          </footer>
        </form>
      </article>
    </section>
  `;
}

function renderQualificationWorksheet(row) {
  if (!row) return "";
  const savedServices = parseList(row.service_needs);
  const savedPain = parseList(row.sales_pain_points);
  return `
    <form class="sales-qualification-form" data-qualification-form data-record-id="${esc(row.id)}">
      <div class="sales-section-title">
        <div>
          <h2>Qualification Worksheet</h2>
          <p>Capture property fit, decision maker, service needs, $0.25/sq ft acceptance, and timing.</p>
        </div>
        <button class="sales-primary-button" type="submit">${icon("check")}Save Qualification</button>
      </div>
      <div class="sales-qualification-grid">
        <section class="sales-qualification-block">
          <span>Property Fit</span>
          ${selectField("property_class", "Property Class", [["", "Not set"], ["A", "Class A"], ["B", "Class B"], ["C", "Class C"], ["Mixed", "Mixed"], ["Other", "Other"]], row.property_class || "")}
          ${field("prospect_unit_count", "Approx. Unit Count", row.prospect_unit_count || "", "number")}
        </section>
        <section class="sales-qualification-block">
          <span>Decision Maker</span>
          ${selectField("decision_maker_status", "Decision Maker Status", [["", "Unknown"], ["confirmed", "Confirmed"], ["in_progress", "In Progress"], ["not_confirmed", "Not Confirmed"]], row.decision_maker_status || "")}
          ${field("current_vendor", "Current Vendor", row.current_vendor || "")}
        </section>
        <section class="sales-qualification-block">
          <span>Service Needs</span>
          <div class="sales-check-row">${checkboxList("service_needs", services, savedServices)}</div>
          ${field("average_turns_per_month", "Average Turns / Month", row.average_turns_per_month || "")}
        </section>
        <section class="sales-qualification-block">
          <span>Pain Points, Timing & Pricing Fit</span>
          <div class="sales-check-row">${checkboxList("sales_pain_points", painPoints, savedPain)}</div>
          ${field("desired_start_date", "Desired Start Date", toDateInput(row.desired_start_date), "date")}
          ${field("budget_range", "$0.25/Sq Ft Fit", row.budget_range || "")}
          ${field("opportunity_score", "Opportunity Score", row.opportunity_score || "", "number")}
        </section>
        <section class="sales-qualification-block span-two">
          <span>Notes / Summary</span>
          ${textAreaField("qualification_notes", "Qualification Notes", row.qualification_notes || row.lead_notes || "", "span-two")}
        </section>
      </div>
    </form>
  `;
}

function checkboxList(name, options, selected = []) {
  const selectedSet = new Set(selected);
  return options.map((option) => `
    <label class="sales-checkbox-pill">
      <input type="checkbox" name="${esc(name)}" value="${esc(option)}" ${selectedSet.has(option) ? "checked" : ""} />
      ${esc(option)}
    </label>
  `).join("");
}

function renderLeadDetail(row) {
  if (!row) {
    return `<aside class="sales-detail-card">${emptyState("Select a prospect", "Prospect details will appear here.")}</aside>`;
  }

  const score = Number(row.opportunity_score || 0);
  const serviceList = parseList(row.service_needs);
  const painList = parseList(row.sales_pain_points);

  return `
    <aside class="sales-detail-card">
      <section class="sales-detail-hero">
        <span class="sales-status-pill ${esc(stageFor(row))}">${esc(stageLabel(stageFor(row)))}</span>
        <h2>${esc(recordTitle(row))}</h2>
        <p>${esc(recordCompany(row))}</p>
      </section>
      <div class="sales-detail-grid">
        <div class="sales-detail-stat"><span>Contact</span><strong>${esc(recordContact(row))}</strong></div>
        <div class="sales-detail-stat"><span>Phone</span><strong>${esc(row.contact_phone || "Not saved")}</strong></div>
        <div class="sales-detail-stat"><span>Units</span><strong>${recordUnits(row) ? number(recordUnits(row)) : "Not set"}</strong></div>
        <div class="sales-detail-stat"><span>Value</span><strong>${money(recordValue(row), true)}</strong></div>
      </div>
      <div class="sales-score">
        <div class="sales-score-ring" style="--score:${Math.max(0, Math.min(100, score || 0))}%"><strong>${score || "--"}</strong></div>
        <div class="sales-score-copy">
          <strong>${score >= 75 ? "High Opportunity" : score >= 45 ? "Developing Opportunity" : "Needs Qualification"}</strong>
          <p>${esc(row.qualification_notes || row.lead_notes || "Capture fit, decision maker, timing, $0.25/sq ft acceptance, and service needs.")}</p>
        </div>
      </div>
      <div class="sales-detail-grid">
        <div class="sales-detail-stat"><span>Class</span><strong>${esc(row.property_class || "Not set")}</strong></div>
        <div class="sales-detail-stat"><span>$0.25/Sq Ft Fit</span><strong>${esc(row.budget_range || "Not set")}</strong></div>
        <div class="sales-detail-stat"><span>Decision Maker</span><strong>${esc(row.decision_maker_status || "Unknown")}</strong></div>
        <div class="sales-detail-stat"><span>Start Timeline</span><strong>${esc(formatDate(row.desired_start_date, { empty: "Not set" }))}</strong></div>
      </div>
      <div class="sales-qualification-block">
        <span>Services Needed</span>
        <strong>${serviceList.length ? esc(serviceList.join(", ")) : "Not captured"}</strong>
      </div>
      <div class="sales-qualification-block">
        <span>Pain Points</span>
        <strong>${painList.length ? esc(painList.join(", ")) : "Not captured"}</strong>
      </div>
      <div class="sales-action-stack">
        <button class="sales-primary-button" type="button" data-open-walkthrough="${esc(row.id)}">${icon("calendar")}Schedule Walkthrough</button>
        <button class="sales-secondary-button" type="button" data-update-stage="${esc(row.id)}" data-stage="quote_sent">${icon("check")}Confirm $0.25/Sq Ft Fit</button>
        <button class="sales-secondary-button" type="button" data-update-stage="${esc(row.id)}" data-stage="contract_out">${icon("clipboard-check")}Send to Management</button>
        <button class="sales-secondary-button" type="button" data-open-task="${esc(row.id)}">${icon("clipboard-check")}Create Follow-up</button>
        <button class="sales-secondary-button" type="button" data-open-lead="${esc(row.id)}">${icon("users")}Edit Prospect</button>
      </div>
    </aside>
  `;
}

function walkthroughRows() {
  return baseFilteredRows(state.rows.filter((row) =>
    stageFor(row) === "walkthrough" ||
    Boolean(row.walkthrough_at || row.walkthrough_notes || row.walkthrough_status)
  ));
}

function renderWalkthroughsPage() {
  const rows = walkthroughRows();
  const selected = selectRecord(rows);
  const todayRows = rows.filter((row) => dateInRange(walkthroughAt(row), new Date(new Date().setHours(0, 0, 0, 0)), new Date(new Date().setHours(23, 59, 59, 999))));
  return `
    <section class="sales-metric-grid">
      ${metricCard("Scheduled", number(rows.filter((row) => normalize(row.walkthrough_status || "scheduled") === "scheduled").length), "active walkthroughs", "calendar", "blue")}
      ${metricCard("Confirmed", number(rows.filter((row) => normalize(row.walkthrough_status) === "confirmed").length), "ready for visit", "check", "green")}
      ${metricCard("Today", number(todayRows.length), "on today's calendar", "clock", "yellow")}
      ${metricCard("Completed", number(rows.filter((row) => normalize(row.walkthrough_status) === "completed").length), "ready for management", "clipboard-check", "violet")}
      ${metricCard("This Week", number(thisWeekRows(rows, "walkthrough_at").length), "scheduled this week", "calendar", "cyan")}
      ${metricCard("Pricing Fit", number(rowsByStage("quote_sent").length), "$0.25/sq ft confirmed", "check", "green")}
    </section>
    <section class="sales-workspace">
      <article class="sales-panel">
        ${renderFilters({ placeholder: "Search walkthroughs...", statuses: walkthroughStatuses })}
        ${renderCalendar(rows)}
      </article>
      ${renderWalkthroughDetail(selected)}
    </section>
  `;
}

function conversionRate(fromStage, toStage) {
  const from = rowsByStage(fromStage).length;
  const to = rowsByStage(toStage).length;
  return from ? Math.round((to / from) * 100) : 0;
}

function calendarRangeLabel() {
  const cursor = new Date(state.dateCursor);
  if (state.calendarMode === "day") {
    return cursor.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  }
  if (state.calendarMode === "week") {
    return `${formatDate(startOfWeek(cursor))} - ${formatDate(endOfWeek(cursor))}`;
  }
  return cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function renderCalendar(rows) {
  return `
    <div class="sales-calendar-shell">
      <header class="sales-calendar-header">
        <div class="sales-calendar-nav">
          <button type="button" data-calendar-nav="prev" aria-label="Previous">${icon("left")}</button>
          <button type="button" data-calendar-today>Today</button>
          <button type="button" data-calendar-nav="next" aria-label="Next">${icon("chevron")}</button>
        </div>
        <strong class="sales-calendar-title">${esc(calendarRangeLabel())}</strong>
        <div class="sales-segmented" aria-label="Calendar view">
          ${["month", "week", "day"].map((mode) => `<button class="${state.calendarMode === mode ? "active" : ""}" type="button" data-calendar-mode="${mode}">${esc(titleCase(mode))}</button>`).join("")}
        </div>
      </header>
      ${state.calendarMode === "day" ? renderDayCalendar(rows) : state.calendarMode === "week" ? renderWeekCalendar(rows) : renderMonthCalendar(rows)}
    </div>
  `;
}

function eventsForDay(rows, day) {
  return rows
    .filter((row) => {
      const date = dateValue(walkthroughAt(row));
      return date && sameDay(date, day);
    })
    .sort((a, b) => dateValue(walkthroughAt(a)) - dateValue(walkthroughAt(b)));
}

function renderCalendarEvent(row) {
  const status = normalize(row.walkthrough_status || "scheduled");
  return `
    <button class="sales-calendar-event ${esc(status)}" type="button" data-select-record="${esc(row.id)}">
      <small>${esc(formatTime(walkthroughAt(row)) || "Time TBD")}</small>
      <strong>${esc(recordTitle(row))}</strong>
      <small>${esc(titleCase(status))}</small>
    </button>
  `;
}

function renderWeekCalendar(rows) {
  const start = startOfWeek(state.dateCursor);
  return `
    <div class="sales-week-grid">
      ${Array.from({ length: 7 }, (_, index) => {
        const day = addDays(start, index);
        const dayRows = eventsForDay(rows, day);
        return `
          <section class="sales-day-column">
            <header><strong>${esc(day.toLocaleDateString(undefined, { weekday: "short" }))}</strong><span>${esc(formatDate(day))}</span></header>
            ${dayRows.length ? dayRows.map(renderCalendarEvent).join("") : `<p class="sales-record-subtitle">No walkthroughs</p>`}
          </section>
        `;
      }).join("")}
    </div>
  `;
}

function renderDayCalendar(rows) {
  const dayRows = eventsForDay(rows, state.dateCursor);
  return `
    <div class="sales-day-view">
      ${dayRows.length ? dayRows.map((row) => `
        <article class="sales-property-card ${row.id === state.selectedId ? "active" : ""}">
          <header>
            <div>
              <h3>${esc(recordTitle(row))}</h3>
              <p>${esc(recordAddress(row))}</p>
            </div>
            <span class="sales-status-pill ${esc(normalize(row.walkthrough_status || "scheduled"))}">${esc(titleCase(row.walkthrough_status || "scheduled"))}</span>
          </header>
          <p>${esc(formatDateTime(walkthroughAt(row)))} with ${esc(row.walkthrough_assigned_to || ownerName(row))}</p>
          <div class="sales-row-actions">
            <button class="sales-secondary-button" type="button" data-select-record="${esc(row.id)}">View Details</button>
            <button class="sales-primary-button" type="button" data-open-walkthrough="${esc(row.id)}">Edit</button>
          </div>
        </article>
      `).join("") : emptyState("No walkthroughs on this day", "Use Schedule Walkthrough to add one.")}
    </div>
  `;
}

function renderMonthCalendar(rows) {
  const first = startOfMonth(state.dateCursor);
  const gridStart = addDays(first, -first.getDay());
  return `
    <div class="sales-month-grid">
      ${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => `<div class="sales-month-label">${day}</div>`).join("")}
      ${Array.from({ length: 42 }, (_, index) => {
        const day = addDays(gridStart, index);
        const dayRows = eventsForDay(rows, day).slice(0, 3);
        const muted = day.getMonth() !== first.getMonth();
        return `
          <article class="sales-month-day ${muted ? "muted" : ""} ${sameDay(day, new Date()) ? "today" : ""}" data-calendar-day="${toDateInput(day)}">
            <time>${day.getDate()}</time>
            ${dayRows.map(renderCalendarEvent).join("")}
            ${eventsForDay(rows, day).length > dayRows.length ? `<small>+${eventsForDay(rows, day).length - dayRows.length} more</small>` : ""}
          </article>
        `;
      }).join("")}
    </div>
  `;
}

function renderWalkthroughDetail(row) {
  if (!row) return `<aside class="sales-detail-card">${emptyState("Select a walkthrough", "Walkthrough details will appear here.")}</aside>`;
  return `
    <aside class="sales-detail-card">
      <div class="sales-selected-heading">
        <div>
          <h2>Selected Event</h2>
          <p>${esc(formatDateTime(walkthroughAt(row)))}</p>
        </div>
        <span class="sales-status-pill ${esc(normalize(row.walkthrough_status || "scheduled"))}">${esc(titleCase(row.walkthrough_status || "scheduled"))}</span>
      </div>
      <section class="sales-detail-hero">
        <h2>${esc(recordTitle(row))}</h2>
        <p>${esc(recordAddress(row))}</p>
      </section>
      <div class="sales-detail-grid">
        <div class="sales-detail-stat"><span>Contact</span><strong>${esc(recordContact(row))}</strong></div>
        <div class="sales-detail-stat"><span>Assigned To</span><strong>${esc(row.walkthrough_assigned_to || ownerName(row))}</strong></div>
        <div class="sales-detail-stat"><span>Type</span><strong>${esc(row.walkthrough_type || "Property Walkthrough")}</strong></div>
        <div class="sales-detail-stat"><span>Units</span><strong>${recordUnits(row) ? number(recordUnits(row)) : "Not set"}</strong></div>
      </div>
      <div class="sales-qualification-block">
        <span>Walkthrough Notes</span>
        <strong>${esc(row.walkthrough_notes || "No walkthrough notes saved.")}</strong>
      </div>
      <div class="sales-action-stack">
        <button class="sales-primary-button" type="button" data-update-walkthrough-status="${esc(row.id)}" data-status="confirmed">${icon("check")}Confirm Walkthrough</button>
        <button class="sales-secondary-button" type="button" data-update-walkthrough-status="${esc(row.id)}" data-status="completed">${icon("clipboard-check")}Send to Management</button>
        <button class="sales-secondary-button" type="button" data-open-walkthrough="${esc(row.id)}">${icon("calendar")}Reschedule</button>
      </div>
    </aside>
  `;
}

function quoteRows() {
  return baseFilteredRows(state.rows.filter((row) =>
    ["quote_sent", "contract_out", "active", "lost"].includes(stageFor(row)) ||
    Boolean(row.quote_amount || row.quote_sent_at || row.quote_notes)
  ));
}

function renderQuotesPage() {
  const rows = quoteRows();
  const selected = selectRecord(rows);
  const totalValue = rows.reduce((sum, row) => sum + Number(row.quote_amount || recordValue(row)), 0);
  const accepted = rows.filter((row) => quoteStatus(row) === "accepted" || stageFor(row) === "active").length;
  return `
    <section class="sales-metric-grid">
      ${metricCard("Total Quotes", number(rows.length), "quotes in pipeline", "file-text", "green")}
      ${metricCard("Drafts", number(rows.filter((row) => quoteStatus(row) === "draft").length), "not sent yet", "file-text", "blue")}
      ${metricCard("Sent", number(rows.filter((row) => quoteStatus(row) === "sent").length), "awaiting view", "mail", "cyan")}
      ${metricCard("Accepted", number(accepted), "ready for contract", "check", "green")}
      ${metricCard("Quote Value", money(totalValue, true), "total quoted value", "dollar", "violet")}
      ${metricCard("Avg. Quote", money(rows.length ? totalValue / rows.length : 0, true), "per quote", "dollar", "yellow")}
    </section>
    <section class="sales-quote-layout">
      <article class="sales-panel">
        ${renderFilters({ placeholder: "Search quotes...", statuses: quoteStatuses })}
        ${renderQuoteTable(rows)}
      </article>
      ${renderQuoteDetail(selected)}
    </section>
  `;
}

function renderQuoteTable(rows) {
  if (!rows.length) return emptyState("No quotes found", "Create a quote from a lead or walkthrough.");
  return `
    <div class="sales-table-wrap">
      <table class="sales-table">
        <thead>
          <tr>
            <th>Quote</th>
            <th>Contact</th>
            <th>Units</th>
            <th>Amount</th>
            <th>Date Sent</th>
            <th>Expiration</th>
            <th>Status</th>
            <th>Owner</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((row) => `
            <tr class="${row.id === state.selectedId ? "active" : ""}" data-select-record="${esc(row.id)}">
              <td><strong>${esc(recordTitle(row))}</strong><small>Q-${esc(String(row.id).slice(0, 8).toUpperCase())}</small></td>
              <td><strong>${esc(recordContact(row))}</strong><small>${esc(row.contact_phone || row.contact_email || "")}</small></td>
              <td>${recordUnits(row) ? number(recordUnits(row)) : "Not set"}</td>
              <td>${money(row.quote_amount || recordValue(row))}</td>
              <td>${esc(formatDate(row.quote_sent_at))}</td>
              <td>${esc(formatDate(row.quote_expires_at))}</td>
              <td><span class="sales-status-pill ${esc(quoteStatus(row))}">${esc(titleCase(quoteStatus(row)))}</span></td>
              <td>${esc(ownerName(row))}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderQuoteDetail(row) {
  if (!row) return `<aside class="sales-detail-card">${emptyState("Select a quote", "Quote details will appear here.")}</aside>`;
  return `
    <aside class="sales-detail-card">
      <section class="sales-detail-hero">
        <span class="sales-status-pill ${esc(quoteStatus(row))}">${esc(titleCase(quoteStatus(row)))}</span>
        <h2>${esc(recordTitle(row))}</h2>
        <p>${esc(recordAddress(row))}</p>
      </section>
      <div class="sales-detail-grid">
        <div class="sales-detail-stat"><span>Contact</span><strong>${esc(recordContact(row))}</strong></div>
        <div class="sales-detail-stat"><span>Amount</span><strong>${money(row.quote_amount || recordValue(row))}</strong></div>
        <div class="sales-detail-stat"><span>Sent</span><strong>${esc(formatDate(row.quote_sent_at))}</strong></div>
        <div class="sales-detail-stat"><span>Expires</span><strong>${esc(formatDate(row.quote_expires_at))}</strong></div>
      </div>
      <div class="sales-qualification-block">
        <span>Quote Notes</span>
        <strong>${esc(row.quote_notes || row.lead_notes || "No quote notes saved.")}</strong>
      </div>
      <div class="sales-action-stack">
        <button class="sales-primary-button" type="button" data-open-quote="${esc(row.id)}">${icon("file-text")}Edit Quote</button>
        <button class="sales-secondary-button" type="button" data-update-quote-status="${esc(row.id)}" data-status="sent">${icon("mail")}Mark Sent</button>
        <button class="sales-secondary-button" type="button" data-update-quote-status="${esc(row.id)}" data-status="accepted">${icon("check")}Mark Accepted</button>
        <button class="sales-secondary-button" type="button" data-update-stage="${esc(row.id)}" data-stage="contract_out">${icon("file-check")}Move to Contract</button>
      </div>
    </aside>
  `;
}

function contractRows() {
  return baseFilteredRows(state.rows.filter((row) => ["contract_out", "active"].includes(stageFor(row)) || row.contract_status));
}

function renderContractsPage() {
  const rows = contractRows();
  const selected = selectRecord(rows);
  return `
    <section class="sales-metric-grid">
      ${metricCard("Contracts Pending", number(rows.filter((row) => stageFor(row) === "contract_out").length), "waiting on signature", "file-check", "violet")}
      ${metricCard("Won Accounts", number(rowsByStage("active").length), "signed contracts", "trophy", "green")}
      ${metricCard("Contract Value", money(rows.reduce((sum, row) => sum + recordValue(row), 0), true), "weighted value", "dollar", "green")}
      ${metricCard("Due This Week", number(thisWeekRows(rows, "contract_due_at").length), "contract follow-ups", "calendar", "yellow")}
      ${metricCard("Avg. Units", number(Math.round(rows.reduce((sum, row) => sum + recordUnits(row), 0) / Math.max(1, rows.length))), "per contract", "building", "blue")}
      ${metricCard("Lost", number(rowsByStage("lost").length), "closed lost", "x", "violet")}
    </section>
    <section class="sales-table-layout">
      <article class="sales-panel">
        ${renderFilters({ placeholder: "Search contracts..." })}
        ${renderContractTable(rows)}
      </article>
      ${renderContractDetail(selected)}
    </section>
  `;
}

function renderContractTable(rows) {
  if (!rows.length) return emptyState("No pending contracts", "Move accepted quotes into the contract queue.");
  return `
    <div class="sales-table-wrap">
      <table class="sales-table">
        <thead>
          <tr>
            <th>Property</th>
            <th>Contact</th>
            <th>Units</th>
            <th>Value</th>
            <th>Contract Due</th>
            <th>Status</th>
            <th>Owner</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((row) => `
            <tr class="${row.id === state.selectedId ? "active" : ""}" data-select-record="${esc(row.id)}">
              <td><strong>${esc(recordTitle(row))}</strong><small>${esc(recordAddress(row))}</small></td>
              <td><strong>${esc(recordContact(row))}</strong><small>${esc(row.contact_email || row.contact_phone || "")}</small></td>
              <td>${recordUnits(row) ? number(recordUnits(row)) : "Not set"}</td>
              <td>${money(recordValue(row), true)}</td>
              <td>${esc(formatDate(row.contract_due_at || taskDue(row)))}</td>
              <td><span class="sales-status-pill ${esc(stageFor(row))}">${esc(stageLabel(stageFor(row)))}</span></td>
              <td>${esc(ownerName(row))}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderContractDetail(row) {
  if (!row) return `<aside class="sales-detail-card">${emptyState("Select a contract", "Contract details will appear here.")}</aside>`;
  return `
    <aside class="sales-detail-card">
      <section class="sales-detail-hero">
        <span class="sales-status-pill ${esc(stageFor(row))}">${esc(stageLabel(stageFor(row)))}</span>
        <h2>${esc(recordTitle(row))}</h2>
        <p>${esc(recordCompany(row))}</p>
      </section>
      <div class="sales-detail-grid">
        <div class="sales-detail-stat"><span>Contact</span><strong>${esc(recordContact(row))}</strong></div>
        <div class="sales-detail-stat"><span>Contract Due</span><strong>${esc(formatDate(row.contract_due_at || taskDue(row)))}</strong></div>
        <div class="sales-detail-stat"><span>Quote</span><strong>${money(row.quote_amount || recordValue(row))}</strong></div>
        <div class="sales-detail-stat"><span>Owner</span><strong>${esc(ownerName(row))}</strong></div>
      </div>
      <div class="sales-action-stack">
        <button class="sales-primary-button" type="button" data-update-stage="${esc(row.id)}" data-stage="active">${icon("trophy")}Mark Won</button>
        <button class="sales-secondary-button" type="button" data-open-task="${esc(row.id)}">${icon("clipboard-check")}Add Follow-up</button>
        <button class="sales-danger-button" type="button" data-update-stage="${esc(row.id)}" data-stage="lost">${icon("x")}Mark Lost</button>
      </div>
    </aside>
  `;
}

function openTasks() {
  return state.rows.filter((row) => row.next_step || taskDue(row))
    .filter((row) => taskStatus(row) !== "completed");
}

function taskRows() {
  return baseFilteredRows(state.rows.filter((row) =>
    row.next_step ||
    taskDue(row) ||
    row.task_status ||
    row.task_type ||
    !["active", "lost"].includes(stageFor(row))
  ));
}

function pricingFitConfirmed(row) {
  const stage = stageFor(row);
  const fitText = normalize(row?.budget_range || "");
  if (["no", "not_ok", "not_accepted", "not_confirmed", "needs_confirmation", "pending", "unknown", "declined", "too_high", "does_not_work"].includes(fitText)) return false;
  return ["quote_sent", "walkthrough", "contract_out", "active"].includes(stage) ||
    fitText.includes("confirmed") ||
    fitText.includes("accepted") ||
    fitText.includes("works") ||
    fitText === "yes" ||
    fitText === "ok";
}

function pricingFitText(row) {
  if (pricingFitConfirmed(row)) return row?.budget_range || "Confirmed at $0.25/sq ft";
  return row?.budget_range || "Needs confirmation";
}

function taskDueMeta(row) {
  const status = taskStatus(row);
  const due = dateValue(taskDue(row));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const endToday = new Date(today);
  endToday.setHours(23, 59, 59, 999);
  if (status === "completed") return { label: "Completed", tone: "completed", rank: 4 };
  if (!due) return { label: "No due date", tone: "low", rank: 3 };
  if (due < today) return { label: "Overdue", tone: "overdue", rank: 0 };
  if (due <= endToday) return { label: "Due today", tone: "open", rank: 1 };
  return { label: formatDateTime(due), tone: "low", rank: 2 };
}

function recommendedTaskAction(row) {
  if (taskStatus(row) === "completed") return "Review completed follow-up";
  const savedTask = row?.task_type || row?.next_step;
  if (savedTask) return savedTask;
  const stage = stageFor(row);
  if (stage === "new_leads") return "Call decision maker";
  if (!pricingFitConfirmed(row)) return "Confirm $0.25/sq ft";
  if (!walkthroughAt(row) && !["walkthrough", "contract_out", "active", "lost"].includes(stage)) return "Schedule walkthrough";
  if (stage === "walkthrough") return "Prepare management walkthrough";
  if (stage === "contract_out") return "Management is closing";
  return row?.next_step || "Follow up";
}

function contactPhoneHref(row) {
  const phone = String(row?.contact_phone || "").replace(/[^\d+]/g, "");
  return phone ? `tel:${phone}` : "";
}

function contactEmailHref(row) {
  const email = String(row?.contact_email || "").trim();
  if (!email) return "";
  const subject = encodeURIComponent(`Turnly walkthrough for ${recordTitle(row)}`);
  return `mailto:${email}?subject=${subject}`;
}

function renderTaskFilters() {
  const ownerOptions = `<option value="all">All Reps</option><option value="unassigned" ${state.ownerFilter === "unassigned" ? "selected" : ""}>Unassigned</option>${state.reps.map((rep) => `<option value="${rep.id}" ${state.ownerFilter === rep.id ? "selected" : ""}>${esc(rep.full_name || rep.email || "Sales user")}</option>`).join("")}`;
  const stageOptions = `<option value="all">All Stages</option>${stageDefs.map((stage) => `<option value="${stage.id}" ${state.stageFilter === stage.id ? "selected" : ""}>${esc(stage.label)}</option>`).join("")}`;
  const statusOptions = `<option value="all">All Task Statuses</option>${taskStatuses.map((status) => `<option value="${status}" ${state.statusFilter === status ? "selected" : ""}>${esc(titleCase(status))}</option>`).join("")}`;
  return `
    <div class="sales-task-toolbar">
      <label class="sales-search">
        ${icon("search")}
        <input id="salesPageSearch" type="search" value="${esc(state.search)}" placeholder="Search follow-ups, contacts, or properties..." />
      </label>
      <select class="sales-filter" data-filter-owner>${ownerOptions}</select>
      <select class="sales-filter" data-filter-stage>${stageOptions}</select>
      <select class="sales-filter" data-filter-status>${statusOptions}</select>
      <button class="sales-primary-button" type="button" data-open-task="${esc(state.selectedId || "")}">${icon("plus")}New Follow-up</button>
    </div>
  `;
}

function renderTaskFlowStrip() {
  const steps = [
    { label: "Identify", detail: "Find ideal apartment prospects.", count: rowsByStage("new_leads").length, iconName: "users" },
    { label: "Confirm Price", detail: "Make sure $0.25/sq ft works.", count: rowsByStage("quote_sent").length, iconName: "check" },
    { label: "Set Walkthrough", detail: "Put management on site.", count: rowsByStage("walkthrough").length, iconName: "calendar" }
  ];
  return `
    <section class="sales-task-flow-strip" aria-label="Sales workflow">
      ${steps.map((step) => `
        <article class="sales-task-flow-step">
          <span>${icon(step.iconName)}</span>
          <div>
            <strong>${esc(step.label)}</strong>
            <small>${esc(step.detail)}</small>
          </div>
          <b>${number(step.count)}</b>
        </article>
      `).join("")}
    </section>
  `;
}

function renderTaskFocusLanes(groups) {
  const lanes = [
    {
      title: "Work First",
      detail: "Overdue and due-today follow-ups.",
      total: [...groups.overdue, ...groups.dueToday].length,
      rows: [...groups.overdue, ...groups.dueToday].slice(0, 4),
      empty: "No urgent follow-ups.",
      tone: "yellow"
    },
    {
      title: "Confirm Price Fit",
      detail: "Prospects that still need $0.25/sq ft confirmation.",
      total: groups.pricingFollowUps.length,
      rows: groups.pricingFollowUps.slice(0, 4),
      empty: "No price-fit follow-ups waiting.",
      tone: "green"
    },
    {
      title: "Ready For Walkthrough",
      detail: "Price-fit prospects that need a walkthrough scheduled.",
      total: groups.walkthroughsToSchedule.length,
      rows: groups.walkthroughsToSchedule.slice(0, 4),
      empty: "No walkthrough-ready prospects.",
      tone: "cyan"
    }
  ];
  return `
    <section class="sales-task-focus-grid">
      ${lanes.map((lane) => `
        <article class="sales-task-focus-card ${esc(lane.tone)}">
          <header>
            <div>
              <h3>${esc(lane.title)}</h3>
              <p>${esc(lane.detail)}</p>
            </div>
            <strong>${number(lane.total)}</strong>
          </header>
          <div class="sales-task-mini-list">
            ${lane.rows.length ? lane.rows.map((row) => `
              <button type="button" data-select-record="${esc(row.id)}">
                <span>${esc(recordTitle(row))}</span>
                <small>${esc(recommendedTaskAction(row))}</small>
              </button>
            `).join("") : `<p>${esc(lane.empty)}</p>`}
          </div>
        </article>
      `).join("")}
    </section>
  `;
}

function renderTasksPage() {
  const rows = taskRows().sort((a, b) => {
    const aMeta = taskDueMeta(a);
    const bMeta = taskDueMeta(b);
    const aDue = dateValue(taskDue(a))?.getTime() || Number.MAX_SAFE_INTEGER;
    const bDue = dateValue(taskDue(b))?.getTime() || Number.MAX_SAFE_INTEGER;
    return aMeta.rank - bMeta.rank || aDue - bDue;
  });
  const selected = selectRecord(rows);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const endToday = new Date(today);
  endToday.setHours(23, 59, 59, 999);
  const openRows = rows.filter((row) => taskStatus(row) !== "completed");
  const overdue = rows.filter((row) => {
    const due = dateValue(taskDue(row));
    return due && due < today && taskStatus(row) !== "completed";
  });
  const dueToday = openRows.filter((row) => dateInRange(taskDue(row), today, endToday));
  const pricingFollowUps = openRows.filter((row) => {
    const action = normalize(`${row.task_type || ""} ${row.next_step || ""}`);
    return !pricingFitConfirmed(row) && (["new_leads", "contacted"].includes(stageFor(row)) || action.includes("pricing") || action.includes("price"));
  });
  const walkthroughsToSchedule = openRows.filter((row) =>
    pricingFitConfirmed(row) &&
    !walkthroughAt(row) &&
    !["walkthrough", "contract_out", "active", "lost"].includes(stageFor(row))
  );
  return `
    <section class="sales-metric-grid">
      ${metricCard("Due Today", number(dueToday.length), "calls and follow-ups", "calendar", "blue")}
      ${metricCard("Overdue", number(overdue.length), "past due", "clock", "yellow")}
      ${metricCard("Pricing Fit Follow-ups", number(pricingFollowUps.length), "confirm $0.25/sq ft", "check", "green")}
      ${metricCard("Walkthroughs To Schedule", number(walkthroughsToSchedule.length), "ready for management", "calendar", "cyan")}
      ${metricCard("Completed This Week", number(thisWeekRows(rows.filter((row) => taskStatus(row) === "completed"), "last_activity_at").length), "finished tasks", "check", "green")}
      ${metricCard("High Priority", number(openRows.filter((row) => normalize(row.task_priority) === "high").length), "important follow-ups", "bell", "violet")}
    </section>
    ${renderTaskFlowStrip()}
    ${renderTaskFocusLanes({ overdue, dueToday, pricingFollowUps, walkthroughsToSchedule })}
    <section class="sales-task-layout">
      <article class="sales-panel sales-task-command-panel">
        <div class="sales-panel-header">
          <div>
            <h2>Daily Sales Work Queue</h2>
            <p>Work from the top down: contact, confirm price fit, then schedule management walkthroughs.</p>
          </div>
        </div>
        ${renderTaskFilters()}
        ${renderTaskTable(rows)}
      </article>
      ${renderTaskDetail(selected)}
    </section>
  `;
}

function renderTaskTable(rows) {
  if (!rows.length) return emptyState("No follow-ups found", "Create a next step from any prospect.");
  return `
    <div class="sales-task-queue">
      ${rows.map((row) => {
        const due = taskDueMeta(row);
        const phoneHref = contactPhoneHref(row);
        const emailHref = contactEmailHref(row);
        return `
          <article class="sales-task-item ${row.id === state.selectedId ? "active" : ""}">
            <button class="sales-task-select" type="button" data-select-record="${esc(row.id)}">
              <div class="sales-task-item-main">
                <span class="sales-status-pill ${esc(due.tone)}">${esc(due.label)}</span>
                <strong>${esc(recommendedTaskAction(row))}</strong>
                <small>${esc(recordTitle(row))} - ${esc(recordContact(row))}</small>
              </div>
              <div class="sales-task-meta-grid">
                <span><b>Stage</b>${esc(stageLabel(stageFor(row)))}</span>
                <span><b>Price Fit</b>${esc(pricingFitText(row))}</span>
                <span><b>Priority</b>${esc(titleCase(row.task_priority || "medium"))}</span>
                <span><b>Owner</b>${esc(ownerName(row))}</span>
              </div>
              <p class="sales-task-note">${esc(row.next_step || row.lead_notes || "No next step saved yet.")}</p>
            </button>
            <div class="sales-task-actions">
              ${phoneHref ? `<a class="sales-secondary-button" href="${esc(phoneHref)}">${icon("phone")}Call</a>` : `<button class="sales-secondary-button" type="button" disabled>${icon("phone")}Call</button>`}
              ${emailHref ? `<a class="sales-secondary-button" href="${esc(emailHref)}">${icon("mail")}Email</a>` : `<button class="sales-secondary-button" type="button" disabled>${icon("mail")}Email</button>`}
              ${pricingFitConfirmed(row) ? "" : `<button class="sales-secondary-button" type="button" data-update-stage="${esc(row.id)}" data-stage="quote_sent">${icon("check")}Confirm Fit</button>`}
              <button class="sales-secondary-button" type="button" data-open-walkthrough="${esc(row.id)}">${icon("calendar")}Walkthrough</button>
              <button class="sales-primary-button" type="button" data-update-task-status="${esc(row.id)}" data-status="completed">${icon("check")}Done</button>
            </div>
          </article>
        `;
      }).join("")}
    </div>
  `;
}

function renderTaskDetail(row) {
  if (!row) return `<aside class="sales-detail-card">${emptyState("Select a task", "Task details will appear here.")}</aside>`;
  const phoneHref = contactPhoneHref(row);
  const emailHref = contactEmailHref(row);
  return `
    <aside class="sales-detail-card">
      <section class="sales-detail-hero">
        <span class="sales-status-pill ${esc(taskStatus(row))}">${esc(titleCase(taskStatus(row)))}</span>
        <h2>${esc(recommendedTaskAction(row))}</h2>
        <p>${esc(recordTitle(row))}</p>
      </section>
      <div class="sales-detail-grid">
        <div class="sales-detail-stat"><span>Due Date</span><strong>${esc(formatDateTime(taskDue(row)))}</strong></div>
        <div class="sales-detail-stat"><span>Priority</span><strong>${esc(titleCase(row.task_priority || "medium"))}</strong></div>
        <div class="sales-detail-stat"><span>Contact</span><strong>${esc(recordContact(row))}</strong></div>
        <div class="sales-detail-stat"><span>Owner</span><strong>${esc(ownerName(row))}</strong></div>
        <div class="sales-detail-stat"><span>Stage</span><strong>${esc(stageLabel(stageFor(row)))}</strong></div>
        <div class="sales-detail-stat"><span>Price Fit</span><strong>${esc(pricingFitText(row))}</strong></div>
        <div class="sales-detail-stat"><span>Decision Maker</span><strong>${esc(row.decision_maker_status || "Unknown")}</strong></div>
        <div class="sales-detail-stat"><span>Units</span><strong>${recordUnits(row) ? number(recordUnits(row)) : "Not set"}</strong></div>
      </div>
      <div class="sales-qualification-block">
        <span>Recommended Next Move</span>
        <strong>${esc(recommendedTaskAction(row))}</strong>
      </div>
      <div class="sales-qualification-block">
        <span>Next Step / Notes</span>
        <strong>${esc(row.next_step || row.lead_notes || "No task notes saved.")}</strong>
      </div>
      <div class="sales-action-stack">
        <button class="sales-primary-button" type="button" data-update-task-status="${esc(row.id)}" data-status="completed">${icon("check")}Mark Complete</button>
        ${phoneHref ? `<a class="sales-secondary-button" href="${esc(phoneHref)}">${icon("phone")}Call Now</a>` : `<button class="sales-secondary-button" type="button" disabled>${icon("phone")}Call Now</button>`}
        <button class="sales-secondary-button" type="button" data-log-touch="${esc(row.id)}" data-touch-text="Call logged.">${icon("phone")}Log Call</button>
        ${emailHref ? `<a class="sales-secondary-button" href="${esc(emailHref)}">${icon("mail")}Send Email</a>` : `<button class="sales-secondary-button" type="button" disabled>${icon("mail")}Send Email</button>`}
        ${pricingFitConfirmed(row) ? "" : `<button class="sales-secondary-button" type="button" data-update-stage="${esc(row.id)}" data-stage="quote_sent">${icon("check")}Confirm $0.25/Sq Ft</button>`}
        <button class="sales-secondary-button" type="button" data-open-walkthrough="${esc(row.id)}">${icon("calendar")}Schedule Walkthrough</button>
        <button class="sales-secondary-button" type="button" data-open-task="${esc(row.id)}">${icon("clipboard-check")}Reschedule / Edit</button>
        <button class="sales-secondary-button" type="button" data-open-lead="${esc(row.id)}">${icon("users")}Open Prospect</button>
      </div>
    </aside>
  `;
}

function renderModal() {
  if (!state.modal) return "";
  if (state.modal.type === "import") return renderImportModal();
  if (state.modal.type === "walkthrough") return renderWalkthroughModal(recordById(state.modal.id));
  if (state.modal.type === "quote") return renderQuoteModal(recordById(state.modal.id));
  if (state.modal.type === "task") return renderTaskModal(recordById(state.modal.id));
  return renderLeadModal(recordById(state.modal.id));
}

function recordById(id) {
  return state.rows.find((row) => row.id === id) || null;
}

function renderModalShell(title, kicker, body, footer, narrow = false) {
  return `
    <div class="sales-modal">
      <div class="sales-modal-backdrop" data-close-modal></div>
      <section class="sales-modal-panel ${narrow ? "narrow" : ""}" role="dialog" aria-modal="true" aria-labelledby="salesModalTitle">
        <header class="sales-modal-header">
          <div>
            <p>${esc(kicker)}</p>
            <h2 id="salesModalTitle">${esc(title)}</h2>
          </div>
          <button class="sales-secondary-button" type="button" data-close-modal>${icon("x")}Close</button>
        </header>
        ${body}
        ${footer}
      </section>
    </div>
  `;
}

function renderLeadModal(row) {
  const body = `
    <form data-lead-form data-record-id="${esc(row?.id || "")}">
      <div class="sales-modal-body">
        <div class="sales-form-grid">
          ${field("property_name", "Name", row ? recordTitle(row) : "", "text", true)}
          ${field("contact_phone", "Phone Number", row?.contact_phone || "")}
          ${field("address", "Address", row?.address || "", "text", false, "span-two")}
          ${selectField("pipeline_stage", "Stage", stageDefs.map((stage) => [stage.id, stage.label]), stageFor(row))}
          ${field("next_step", "Next Step", row?.next_step || "", "text", false, "span-two")}
          ${field("next_step_due_at", "Next Step Due", toDateTimeLocal(taskDue(row)), "datetime-local")}
          ${textAreaField("lead_notes", "Notes", row?.lead_notes || row?.default_scope || "", "span-two")}
        </div>
      </div>
      ${modalFooter("Save Prospect")}
    </form>
  `;
  return renderModalShell(row ? "Edit Prospect" : "New Prospect", "Sales Pipeline", body, "", false);
}

function renderWalkthroughModal(row) {
  const selectedId = row?.id || state.selectedId || "";
  const body = `
    <form data-walkthrough-form data-record-id="${esc(selectedId)}">
      <div class="sales-modal-body">
        <div class="sales-form-grid">
          ${selectField("record_id", "Property / Lead", recordOptions(), selectedId, true, "span-two")}
          ${field("walkthrough_at_date", "Date", toDateInput(walkthroughAt(row)), "date", true)}
          ${field("walkthrough_at_time", "Start Time", toTimeInput(walkthroughAt(row)) || "10:00", "time")}
          ${field("walkthrough_end_time", "End Time", toTimeInput(row?.walkthrough_end_at) || "11:00", "time")}
          ${selectField("walkthrough_status", "Status", walkthroughStatuses.map((status) => [status, titleCase(status)]), row?.walkthrough_status || "scheduled")}
          ${field("walkthrough_type", "Walkthrough Type", row?.walkthrough_type || "Property Walkthrough")}
          ${selectField("walkthrough_assigned_to_id", "Assigned Rep", repOptions(), row?.sales_owner_id || "")}
          ${field("walkthrough_location", "Location / Meeting Link", row?.walkthrough_location || row?.address || "", "text", false, "span-two")}
          ${textAreaField("walkthrough_notes", "Walkthrough Notes", row?.walkthrough_notes || "", "span-two")}
        </div>
      </div>
      ${modalFooter("Save Walkthrough")}
    </form>
  `;
  return renderModalShell(row ? "Edit Walkthrough" : "Schedule Walkthrough", "Walkthroughs", body, "", false);
}

function renderQuoteModal(row) {
  const selectedId = row?.id || state.selectedId || "";
  const body = `
    <form data-quote-form data-record-id="${esc(selectedId)}">
      <div class="sales-modal-body">
        <div class="sales-form-grid">
          ${selectField("record_id", "Property / Lead", recordOptions(), selectedId, true, "span-two")}
          ${field("quote_amount", "Quote Amount", row?.quote_amount || row?.lead_value || "", "number", true)}
          ${selectField("quote_status", "Quote Status", quoteStatuses.map((status) => [status, titleCase(status)]), row?.quote_status || "sent")}
          ${field("quote_sent_at", "Date Sent", toDateInput(row?.quote_sent_at) || toDateInput(new Date()), "date")}
          ${field("quote_expires_at", "Expiration Date", toDateInput(row?.quote_expires_at), "date")}
          ${field("lead_value", "Pipeline Value", row?.lead_value || row?.quote_amount || "", "number")}
          ${textAreaField("quote_notes", "Quote Notes", row?.quote_notes || "", "span-two")}
        </div>
      </div>
      ${modalFooter("Save Quote")}
    </form>
  `;
  return renderModalShell(row ? "Edit Quote" : "Create Quote", "Quotes", body, "", false);
}

function renderTaskModal(row) {
  const selectedId = row?.id || state.selectedId || "";
  const body = `
    <form data-task-form data-record-id="${esc(selectedId)}">
      <div class="sales-modal-body">
        <div class="sales-form-grid">
          ${selectField("record_id", "Property / Lead", recordOptions(), selectedId, true, "span-two")}
          ${selectField("task_type", "Task Type", taskTypeOptions(row?.task_type || row?.next_step || ""), row?.task_type || row?.next_step || salesTaskTypes[0])}
          ${selectField("task_status", "Status", taskStatuses.map((status) => [status, titleCase(status)]), row?.task_status || "open")}
          ${selectField("task_priority", "Priority", priorities.map((priority) => [priority, titleCase(priority)]), row?.task_priority || "medium")}
          ${field("task_due_at", "Due Date", toDateTimeLocal(taskDue(row)), "datetime-local")}
          ${textAreaField("next_step", "Next Step / Notes", row?.next_step || "", "span-two")}
        </div>
      </div>
      ${modalFooter("Save Task")}
    </form>
  `;
  return renderModalShell(row ? "Edit Follow-up" : "New Follow-up", "Tasks", body, "", false);
}

function renderImportModal() {
  const body = `
    <div class="sales-modal-body">
      <label class="sales-import-dropzone">
        ${icon("upload")}
        <strong>Upload a CSV or Excel prospect list</strong>
        <small>Use columns for name, address, phone number, stage, and next steps.</small>
        <input id="salesImportFile" type="file" accept=".csv,.tsv,.xls,.xlsx,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" />
      </label>
      <p class="sales-template-link">
        <a href="sales-prospect-template.csv" download>Download prospect upload template</a>
      </p>
      ${state.importFileName ? `
        <div class="sales-import-summary">
          <strong>${esc(state.importFileName)}</strong>
          <span>${number(state.importPayloads.length)} prospect${state.importPayloads.length === 1 ? "" : "s"} ready to import.</span>
          <small>${number(state.importErrors.length)} skipped row${state.importErrors.length === 1 ? "" : "s"}.</small>
        </div>
      ` : ""}
      ${state.importErrors.length ? `<div class="sales-import-errors">${state.importErrors.slice(0, 8).map((item) => `<p>${esc(item)}</p>`).join("")}</div>` : ""}
    </div>
  `;
  const footer = `
    <footer class="sales-modal-footer">
      <p class="sales-message">${state.importPayloads.length ? "Review the parsed rows, then import them." : "Choose a file to begin."}</p>
      <div class="sales-row-actions">
        <button class="sales-secondary-button" type="button" data-close-modal>Cancel</button>
        <button class="sales-primary-button" type="button" data-run-import ${state.importPayloads.length ? "" : "disabled"}>${icon("upload")}Import Prospects</button>
      </div>
    </footer>
  `;
  return renderModalShell("Import Prospects", "Prospect Upload", body, footer, true);
}

function field(name, label, value = "", type = "text", required = false, className = "") {
  return `
    <label class="sales-field ${esc(className)}">
      ${esc(label)}
      <input name="${esc(name)}" type="${esc(type)}" value="${esc(value)}" ${required ? "required" : ""} />
    </label>
  `;
}

function textAreaField(name, label, value = "", className = "") {
  return `
    <label class="sales-field ${esc(className)}">
      ${esc(label)}
      <textarea name="${esc(name)}">${esc(value)}</textarea>
    </label>
  `;
}

function selectField(name, label, options, selected = "", required = false, className = "") {
  return `
    <label class="sales-field ${esc(className)}">
      ${esc(label)}
      <select name="${esc(name)}" ${required ? "required" : ""}>
        ${options.map(([value, text]) => `<option value="${esc(value)}" ${String(selected || "") === String(value) ? "selected" : ""}>${esc(text)}</option>`).join("")}
      </select>
    </label>
  `;
}

function modalFooter(label) {
  return `
    <footer class="sales-modal-footer">
      <p class="sales-message" data-modal-message></p>
      <div class="sales-row-actions">
        <button class="sales-secondary-button" type="button" data-close-modal>Cancel</button>
        <button class="sales-primary-button" type="submit">${esc(label)}</button>
      </div>
    </footer>
  `;
}

function repOptions() {
  return [
    ["", "Unassigned"],
    ...state.reps.map((rep) => [rep.id, rep.full_name || rep.email || "Sales user"])
  ];
}

function taskTypeOptions(current = "") {
  const options = salesTaskTypes.map((item) => [item, item]);
  if (current && !salesTaskTypes.includes(current)) options.push([current, current]);
  return options;
}

function recordOptions() {
  return state.rows
    .slice()
    .sort((a, b) => recordTitle(a).localeCompare(recordTitle(b)))
    .map((row) => [row.id, recordTitle(row)]);
}

function readForm(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function cleanNumber(value) {
  const text = String(value || "").replace(/[$,\s]/g, "");
  if (!text) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function cleanInt(value) {
  const parsed = cleanNumber(value);
  return parsed === null ? null : Math.round(parsed);
}

function dateOnlyIso(value) {
  if (!value) return null;
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  const pad = (part) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function ownerPayload(ownerId) {
  const rep = state.reps.find((item) => item.id === ownerId);
  return {
    sales_owner_id: ownerId || null,
    sales_owner_name: ownerId ? rep?.full_name || rep?.email || "" : ""
  };
}

async function handleLeadForm(form) {
  const values = readForm(form);
  const id = form.dataset.recordId || "";
  const propertyName = values.property_name?.trim();
  if (!propertyName) return setInlineFormMessage(form, "Lead name is required.", "error");

  const payload = {
    property_name: propertyName,
    name: propertyName,
    contact_phone: values.contact_phone?.trim() || "",
    address: values.address?.trim() || "",
    pipeline_stage: values.pipeline_stage || "new_leads",
    next_step: values.next_step?.trim() || "",
    next_step_due_at: fromDateTimeLocal(values.next_step_due_at),
    lead_notes: values.lead_notes?.trim() || "",
    default_scope: values.lead_notes?.trim() || ""
  };
  if (!id) Object.assign(payload, ownerPayload(state.user?.id || ""));

  await persistForm(form, id, payload, id ? "Prospect updated." : "Prospect created.");
}

async function handleLeadFocusForm(form) {
  const values = readForm(form);
  const id = form.dataset.recordId || "";
  const propertyName = values.property_name?.trim();
  if (!id) return setInlineFormMessage(form, "Choose a lead before saving.", "error");
  if (!propertyName) return setInlineFormMessage(form, "Lead name is required.", "error");

  const payload = {
    property_name: propertyName,
    name: propertyName,
    contact_phone: values.contact_phone?.trim() || "",
    address: values.address?.trim() || "",
    pipeline_stage: values.pipeline_stage || "new_leads",
    task_status: values.task_status || "open",
    next_step: values.next_step?.trim() || "",
    next_step_due_at: fromDateTimeLocal(values.next_step_due_at),
    lead_notes: values.lead_notes?.trim() || "",
    default_scope: values.lead_notes?.trim() || ""
  };

  await persistForm(form, id, payload, "Lead progress saved.");
}

async function handleWalkthroughForm(form) {
  const values = readForm(form);
  const id = values.record_id || form.dataset.recordId || "";
  if (!id) return setInlineFormMessage(form, "Choose a property or lead.", "error");

  const start = combineDateTime(values.walkthrough_at_date, values.walkthrough_at_time, "10:00");
  const end = combineDateTime(values.walkthrough_at_date, values.walkthrough_end_time, "11:00");
  if (!start) return setInlineFormMessage(form, "Choose a walkthrough date.", "error");

  const owner = ownerPayload(values.walkthrough_assigned_to_id);
  const payload = {
    pipeline_stage: "walkthrough",
    walkthrough_at: start,
    walkthrough_end_at: end,
    walkthrough_status: values.walkthrough_status || "scheduled",
    walkthrough_type: values.walkthrough_type?.trim() || "Property Walkthrough",
    walkthrough_location: values.walkthrough_location?.trim() || "",
    walkthrough_assigned_to: owner.sales_owner_name || values.walkthrough_assigned_to_id || currentName(),
    ...owner,
    walkthrough_notes: values.walkthrough_notes?.trim() || ""
  };

  await persistForm(form, id, payload, "Walkthrough saved.");
}

async function handleQuoteForm(form) {
  const values = readForm(form);
  const id = values.record_id || form.dataset.recordId || "";
  if (!id) return setInlineFormMessage(form, "Choose a property or lead.", "error");
  const amount = cleanNumber(values.quote_amount);
  if (!amount) return setInlineFormMessage(form, "Quote amount is required.", "error");

  const status = values.quote_status || "sent";
  const payload = {
    pipeline_stage: status === "accepted" ? "contract_out" : "quote_sent",
    quote_amount: amount,
    lead_value: cleanNumber(values.lead_value) || amount,
    quote_status: status,
    quote_sent_at: dateOnlyIso(values.quote_sent_at) || new Date().toISOString(),
    quote_expires_at: dateOnlyIso(values.quote_expires_at),
    quote_notes: values.quote_notes?.trim() || ""
  };

  await persistForm(form, id, payload, "Quote saved.");
}

async function handleTaskForm(form) {
  const values = readForm(form);
  const id = values.record_id || form.dataset.recordId || "";
  if (!id) return setInlineFormMessage(form, "Choose a property or lead.", "error");

  const payload = {
    task_type: values.task_type?.trim() || "Follow-up",
    task_status: values.task_status || "open",
    task_priority: values.task_priority || "medium",
    task_due_at: fromDateTimeLocal(values.task_due_at),
    next_step_due_at: fromDateTimeLocal(values.task_due_at),
    next_step: values.next_step?.trim() || ""
  };

  await persistForm(form, id, payload, "Follow-up saved.");
}

async function handleQualificationForm(form) {
  const values = readForm(form);
  const id = form.dataset.recordId || "";
  if (!id) return setMessage("Select a prospect before saving qualification.", "error");

  const payload = {
    property_class: values.property_class || "",
    prospect_unit_count: cleanInt(values.prospect_unit_count),
    average_turns_per_month: values.average_turns_per_month?.trim() || "",
    decision_maker_status: values.decision_maker_status || "",
    current_vendor: values.current_vendor?.trim() || "",
    desired_start_date: values.desired_start_date || null,
    budget_range: values.budget_range?.trim() || "",
    opportunity_score: cleanInt(values.opportunity_score),
    service_needs: new FormData(form).getAll("service_needs"),
    sales_pain_points: new FormData(form).getAll("sales_pain_points"),
    qualification_notes: values.qualification_notes?.trim() || "",
    lead_notes: values.qualification_notes?.trim() || values.lead_notes || ""
  };

  try {
    await saveRecord(id, payload, "Qualification updated.");
    await refreshData(false);
    setMessage("Qualification updated.", "success");
  } catch (error) {
    setMessage(`Unable to save qualification: ${error.message}`, "error");
  }
}

async function persistForm(form, id, payload, successText) {
  setInlineFormMessage(form, "Saving...");
  try {
    const saved = await saveRecord(id, payload, successText);
    state.selectedId = saved?.id || id || state.selectedId;
    state.modal = null;
    await refreshData(false);
    setMessage(successText, "success");
  } catch (error) {
    setInlineFormMessage(form, `Unable to save: ${error.message}`, "error");
  }
}

function setInlineFormMessage(form, text, tone = "") {
  const message = form.querySelector("[data-modal-message]");
  if (!message) return;
  message.textContent = text;
  message.className = `sales-message ${tone}`;
}

function normalizeHeader(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function csvRows(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (quoted) {
      if (char === '"' && next === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === "," || char === "\t") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      if (row.some((value) => String(value || "").trim())) rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") {
      cell += char;
    }
  }
  row.push(cell);
  if (row.some((value) => String(value || "").trim())) rows.push(row);
  return rows;
}

function rowsToObjects(rows) {
  const dataRows = rows.filter((row) => row.some((cell) => String(cell || "").trim()));
  if (!dataRows.length) return [];
  const headers = dataRows[0].map(normalizeHeader);
  return dataRows.slice(1).map((row) => {
    const object = {};
    headers.forEach((header, index) => {
      if (header) object[header] = row[index] || "";
    });
    return object;
  });
}

async function loadXlsx() {
  if (window.XLSX) return window.XLSX;
  await new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${XLSX_URL}"]`);
    if (existing) {
      existing.addEventListener("load", resolve, { once: true });
      existing.addEventListener("error", reject, { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = XLSX_URL;
    script.async = true;
    script.onload = resolve;
    script.onerror = () => reject(new Error("Unable to load the Excel parser."));
    document.head.appendChild(script);
  });
  return window.XLSX;
}

async function readProspectFile(file) {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension === "csv" || extension === "tsv" || file.type === "text/csv") {
    return rowsToObjects(csvRows(await file.text()));
  }
  if (extension === "xls" || extension === "xlsx") {
    const XLSX = await loadXlsx();
    const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) return [];
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
      header: 1,
      raw: false,
      defval: ""
    });
    return rowsToObjects(rows);
  }
  throw new Error("Use a CSV, TSV, XLS, or XLSX file.");
}

function valueFrom(row, field) {
  const aliases = fieldAliases[field] || [field];
  for (const alias of aliases) {
    const value = row[normalizeHeader(alias)];
    if (String(value || "").trim()) return String(value).trim();
  }
  return "";
}

function stageFromUpload(value) {
  const stage = normalize(value);
  const aliases = {
    new: "new_leads",
    lead: "new_leads",
    prospect: "new_leads",
    new_lead: "new_leads",
    contacted: "contacted",
    qualified: "contacted",
    walkthrough: "walkthrough",
    walkthrough_scheduled: "walkthrough",
    pricing: "quote_sent",
    pricing_fit: "quote_sent",
    pricing_confirmed: "quote_sent",
    price_confirmed: "quote_sent",
    cost_confirmed: "quote_sent",
    quote: "quote_sent",
    quote_sent: "quote_sent",
    management: "contract_out",
    management_review: "contract_out",
    contract: "contract_out",
    contract_out: "contract_out",
    contracts_pending: "contract_out",
    won: "active",
    active: "active",
    lost: "lost"
  };
  return aliases[stage] || "new_leads";
}

function payloadFromUpload(row, rowNumber) {
  const propertyName = valueFrom(row, "property_name") || valueFrom(row, "company_name") || valueFrom(row, "contact_name") || valueFrom(row, "contact_email");
  if (!propertyName) return { error: `Row ${rowNumber}: missing lead name.` };

  const leadNotes = valueFrom(row, "lead_notes");
  return {
    payload: {
      property_name: propertyName,
      name: propertyName,
      contact_phone: valueFrom(row, "contact_phone"),
      address: valueFrom(row, "address"),
      lead_source: valueFrom(row, "lead_source") || "Imported",
      pipeline_stage: stageFromUpload(valueFrom(row, "pipeline_stage")),
      next_step: valueFrom(row, "next_step"),
      next_step_due_at: fromDateTimeLocal(valueFrom(row, "next_step_due_at")) || dateOnlyIso(valueFrom(row, "next_step_due_at")),
      lead_notes: leadNotes,
      default_scope: leadNotes,
      sales_owner_id: state.user?.id || null,
      sales_owner_name: currentName(),
      last_activity_at: new Date().toISOString()
    }
  };
}

async function handleImportFile(file) {
  if (!file) return;
  state.importFileName = file.name;
  state.importPayloads = [];
  state.importErrors = [];
  render();

  try {
    const rows = await readProspectFile(file);
    const payloads = [];
    const errors = [];
    rows.forEach((row, index) => {
      const result = payloadFromUpload(row, index + 2);
      if (result.error) errors.push(result.error);
      if (result.payload) payloads.push(result.payload);
    });
    state.importPayloads = payloads;
    state.importErrors = errors;
  } catch (error) {
    state.importErrors = [error.message];
  }

  render();
}

async function runImport() {
  if (!state.importPayloads.length || !supabase) return;
  state.message = `Importing ${number(state.importPayloads.length)} prospects...`;
  state.messageTone = "";
  render();

  try {
    for (let index = 0; index < state.importPayloads.length; index += 100) {
      const batch = state.importPayloads.slice(index, index + 100);
      const result = await supabase.from(SALES_TABLES.leads).insert(batch.map(compactPayload));
      if (result.error) throw result.error;
    }
    const count = state.importPayloads.length;
    state.importPayloads = [];
    state.importErrors = [];
    state.importFileName = "";
    state.modal = null;
    await refreshData(false);
    setMessage(`Imported ${number(count)} prospects.`, "success");
  } catch (error) {
    setMessage(`Unable to import prospects: ${error.message}`, "error");
  }
}

async function updateStage(id, stage) {
  try {
    state.selectedId = id;
    const row = recordById(id);
    const payload = { pipeline_stage: stage };
    if (stage === "quote_sent" && !pricingFitConfirmed(row)) {
      payload.budget_range = "Confirmed at $0.25/sq ft";
    }
    await saveRecord(id, payload, `Moved to ${stageLabel(stage)}.`);
    await refreshData(false);
    setMessage(`Moved to ${stageLabel(stage)}.`, "success");
  } catch (error) {
    setMessage(`Unable to update stage: ${error.message}`, "error");
  }
}

async function updateStatus(kind, id, status) {
  try {
    const payload = {};
    let text = "";
    if (kind === "walkthrough") {
      payload.walkthrough_status = status;
      if (status === "completed") payload.pipeline_stage = "contract_out";
      text = status === "completed" ? "Walkthrough sent to management review." : `Walkthrough marked ${titleCase(status)}.`;
    } else if (kind === "quote") {
      payload.quote_status = status;
      if (status === "accepted") payload.pipeline_stage = "contract_out";
      text = `Quote marked ${titleCase(status)}.`;
    } else {
      payload.task_status = status;
      text = `Task marked ${titleCase(status)}.`;
    }
    state.selectedId = id;
    await saveRecord(id, payload, text);
    await refreshData(false);
    setMessage(text, "success");
  } catch (error) {
    setMessage(`Unable to update status: ${error.message}`, "error");
  }
}

async function logSalesTouch(id, text) {
  try {
    state.selectedId = id;
    await saveRecord(id, {}, text || "Sales touch logged.");
    await refreshData(false);
    setMessage(text || "Sales touch logged.", "success");
  } catch (error) {
    setMessage(`Unable to log activity: ${error.message}`, "error");
  }
}

function moveLeadFocus(direction) {
  const rows = baseFilteredRows();
  if (!rows.length) return;
  const currentIndex = rows.findIndex((row) => row.id === state.selectedId);
  const nextIndex = currentIndex >= 0 ? (currentIndex + direction + rows.length) % rows.length : 0;
  state.selectedId = rows[nextIndex].id;
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function deleteSelectedLeads() {
  const ids = [...state.selectedLeadIds].filter(Boolean);
  if (!ids.length || !supabase) return;
  const confirmed = window.confirm(`Delete ${ids.length} selected lead${ids.length === 1 ? "" : "s"} and attached sales follow-ups?`);
  if (!confirmed) return;

  state.message = `Deleting ${number(ids.length)} selected lead${ids.length === 1 ? "" : "s"}...`;
  state.messageTone = "";
  render();

  try {
    const childDeletes = [
      SALES_TABLES.activities,
      SALES_TABLES.tasks,
      SALES_TABLES.walkthroughs,
      SALES_TABLES.quotes,
      SALES_TABLES.contracts
    ];
    for (const tableName of childDeletes) {
      const result = await supabase.from(tableName).delete().in("lead_id", ids);
      if (result.error) throw result.error;
    }

    const result = await supabase.from(SALES_TABLES.leads).delete().in("id", ids);
    if (result.error) throw result.error;

    if (ids.includes(state.selectedId)) state.selectedId = null;
    state.selectedLeadIds.clear();
    await refreshData(false);
    setMessage(`Deleted ${number(ids.length)} selected lead${ids.length === 1 ? "" : "s"}.`, "success");
  } catch (error) {
    setMessage(`Unable to delete selected leads: ${error.message}`, "error");
  }
}

function setFilter(type, value) {
  if (type === "owner") state.ownerFilter = value;
  if (type === "stage") state.stageFilter = value;
  if (type === "status") state.statusFilter = value;
  render();
}

function changeCalendar(direction) {
  const cursor = new Date(state.dateCursor);
  if (state.calendarMode === "month") {
    state.dateCursor = addMonths(cursor, direction);
  } else if (state.calendarMode === "week") {
    state.dateCursor = addDays(cursor, direction * 7);
  } else {
    state.dateCursor = addDays(cursor, direction);
  }
  render();
}

function bindEvents() {
  document.addEventListener("click", async (event) => {
    const target = event.target;
    if (target.closest("[data-profile-toggle]")) {
      state.profileOpen = !state.profileOpen;
      render();
      return;
    }

    if (!target.closest(".sales-profile")) {
      state.profileOpen = false;
    }

    if (target.closest("[data-sales-logout]")) {
      await supabase?.auth.signOut();
      window.location.href = "index.html";
      return;
    }

    const enterLeadFocus = target.closest("[data-enter-lead-focus]");
    if (enterLeadFocus) {
      state.selectedId = enterLeadFocus.dataset.selectRecord || state.selectedId;
      state.leadFocusMode = true;
      render();
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    if (target.closest("[data-exit-lead-focus]")) {
      state.leadFocusMode = false;
      render();
      return;
    }

    if (target.closest("[data-focus-prev]")) {
      moveLeadFocus(-1);
      return;
    }

    if (target.closest("[data-focus-next]")) {
      moveLeadFocus(1);
      return;
    }

    if (target.closest("[data-delete-selected-leads]")) {
      await deleteSelectedLeads();
      return;
    }

    if (target.closest("[data-open-import]")) {
      state.modal = { type: "import" };
      state.importPayloads = [];
      state.importErrors = [];
      state.importFileName = "";
      render();
      return;
    }

    const goPage = target.closest("[data-go-page]");
    if (goPage) {
      state.selectedId = goPage.dataset.selectRecord || state.selectedId;
      window.location.href = `${navItems.find(([key]) => key === goPage.dataset.goPage)?.[2] || "sales.html"}#${state.selectedId || ""}`;
      return;
    }

    const openLead = target.closest("[data-open-lead]");
    if (openLead) {
      state.modal = { type: "lead", id: openLead.dataset.openLead || "" };
      render();
      return;
    }

    const select = target.closest("[data-select-record]");
    if (select) {
      state.selectedId = select.dataset.selectRecord;
      render();
      return;
    }

    const openWalkthrough = target.closest("[data-open-walkthrough]");
    if (openWalkthrough) {
      state.modal = { type: "walkthrough", id: openWalkthrough.dataset.openWalkthrough || "" };
      render();
      return;
    }

    const openQuote = target.closest("[data-open-quote]");
    if (openQuote) {
      state.modal = { type: "quote", id: openQuote.dataset.openQuote || "" };
      render();
      return;
    }

    const openTask = target.closest("[data-open-task]");
    if (openTask) {
      state.modal = { type: "task", id: openTask.dataset.openTask || "" };
      render();
      return;
    }

    const close = target.closest("[data-close-modal]");
    if (close) {
      state.modal = null;
      render();
      return;
    }

    const runImportButton = target.closest("[data-run-import]");
    if (runImportButton) {
      runImportButton.disabled = true;
      await runImport();
      return;
    }

    const updateStageButton = target.closest("[data-update-stage]");
    if (updateStageButton) {
      await updateStage(updateStageButton.dataset.updateStage, updateStageButton.dataset.stage);
      return;
    }

    const walkthroughStatusButton = target.closest("[data-update-walkthrough-status]");
    if (walkthroughStatusButton) {
      await updateStatus("walkthrough", walkthroughStatusButton.dataset.updateWalkthroughStatus, walkthroughStatusButton.dataset.status);
      return;
    }

    const quoteStatusButton = target.closest("[data-update-quote-status]");
    if (quoteStatusButton) {
      await updateStatus("quote", quoteStatusButton.dataset.updateQuoteStatus, quoteStatusButton.dataset.status);
      return;
    }

    const taskStatusButton = target.closest("[data-update-task-status]");
    if (taskStatusButton) {
      await updateStatus("task", taskStatusButton.dataset.updateTaskStatus, taskStatusButton.dataset.status);
      return;
    }

    const logTouchButton = target.closest("[data-log-touch]");
    if (logTouchButton) {
      await logSalesTouch(logTouchButton.dataset.logTouch, logTouchButton.dataset.touchText);
      return;
    }

    const calendarMode = target.closest("[data-calendar-mode]");
    if (calendarMode) {
      state.calendarMode = calendarMode.dataset.calendarMode;
      render();
      return;
    }

    const calendarNav = target.closest("[data-calendar-nav]");
    if (calendarNav) {
      changeCalendar(calendarNav.dataset.calendarNav === "next" ? 1 : -1);
      return;
    }

    if (target.closest("[data-calendar-today]")) {
      state.dateCursor = new Date();
      render();
      return;
    }

    const calendarDay = target.closest("[data-calendar-day]");
    if (calendarDay) {
      state.dateCursor = new Date(`${calendarDay.dataset.calendarDay}T12:00:00`);
      state.calendarMode = "day";
      render();
    }
  });

  document.addEventListener("input", (event) => {
    if (event.target?.id === "salesGlobalSearch" || event.target?.id === "salesPageSearch") {
      state.search = event.target.value;
      window.clearTimeout(bindEvents.searchTimer);
      bindEvents.searchTimer = window.setTimeout(render, 180);
    }
  });

  document.addEventListener("change", async (event) => {
    if (event.target?.matches("[data-filter-owner]")) setFilter("owner", event.target.value);
    if (event.target?.matches("[data-filter-stage]")) setFilter("stage", event.target.value);
    if (event.target?.matches("[data-filter-status]")) setFilter("status", event.target.value);

    if (event.target?.matches("[data-set-stage-filter]")) setFilter("stage", event.target.dataset.setStageFilter);

    if (event.target?.matches("[data-lead-select]")) {
      const id = event.target.dataset.leadSelect;
      if (event.target.checked) state.selectedLeadIds.add(id);
      else state.selectedLeadIds.delete(id);
      render();
      return;
    }

    if (event.target?.matches("[data-lead-select-all]")) {
      const visibleIds = baseFilteredRows().map((row) => row.id);
      if (event.target.checked) visibleIds.forEach((id) => state.selectedLeadIds.add(id));
      else visibleIds.forEach((id) => state.selectedLeadIds.delete(id));
      render();
      return;
    }

    if (event.target?.matches("[data-inline-stage]")) {
      await updateStage(event.target.dataset.inlineStage, event.target.value);
    }

    if (event.target?.id === "salesImportFile") {
      await handleImportFile(event.target.files?.[0]);
    }
  });

  document.addEventListener("click", (event) => {
    const stageTab = event.target.closest("[data-set-stage-filter]");
    if (stageTab) setFilter("stage", stageTab.dataset.setStageFilter);
  });

  document.addEventListener("submit", async (event) => {
    const form = event.target;
    if (form.matches("[data-lead-form]")) {
      event.preventDefault();
      await handleLeadForm(form);
    } else if (form.matches("[data-focus-lead-form]")) {
      event.preventDefault();
      await handleLeadFocusForm(form);
    } else if (form.matches("[data-walkthrough-form]")) {
      event.preventDefault();
      await handleWalkthroughForm(form);
    } else if (form.matches("[data-quote-form]")) {
      event.preventDefault();
      await handleQuoteForm(form);
    } else if (form.matches("[data-task-form]")) {
      event.preventDefault();
      await handleTaskForm(form);
    } else if (form.matches("[data-qualification-form]")) {
      event.preventDefault();
      await handleQualificationForm(form);
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && state.modal) {
      state.modal = null;
      render();
    }
  });
}

bindEvents();

if (await requireSalesAccess()) {
  const hashId = window.location.hash.replace("#", "");
  if (hashId) state.selectedId = hashId;
  await refreshData();
}
