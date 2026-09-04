import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const TABLES = {
  leads: "sales_leads",
  walkthroughs: "sales_walkthroughs",
  quotes: "sales_quotes",
  contracts: "sales_contracts",
  tasks: "sales_tasks",
  activities: "sales_activities",
  availability: "sales_walkthrough_availability"
};

const XLSX_URL = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
const ADMIN_SALES_PAGES = new Set(["leads", "walkthroughs", "quotes", "contracts-pending"]);

const pageCopy = {
  leads: {
    title: "Sales Leads",
    subtitle: "Import, qualify, delete, and manage the same prospect records your sales team works from."
  },
  walkthroughs: {
    title: "Walkthroughs",
    subtitle: "Schedule walkthrough appointments and manage the admin availability windows shown to sales reps."
  },
  quotes: {
    title: "Quotes",
    subtitle: "Track pricing conversations and move accepted quotes into contract follow-up."
  },
  "contracts-pending": {
    title: "Contracts Pending",
    subtitle: "Review pending agreements and close qualified properties into active accounts."
  }
};

const stageDefs = [
  ["new_leads", "New Prospects"],
  ["contacted", "Contacted"],
  ["quote_sent", "Pricing Confirmed"],
  ["walkthrough", "Walkthrough Set"],
  ["contract_out", "Management Review"],
  ["active", "Won"],
  ["lost", "Lost"]
];

const walkthroughStatuses = ["scheduled", "confirmed", "rescheduled", "completed", "cancelled"];
const quoteStatuses = ["draft", "sent", "viewed", "accepted", "declined", "expired"];
const contractStatuses = ["pending", "sent", "signed", "active", "lost"];
const availabilityStatuses = ["open", "booked", "held", "closed", "cancelled"];
const priorities = ["low", "medium", "high"];

const fieldAliases = {
  property_name: ["property_name", "property", "lead", "lead_name", "name", "business_name", "company", "company_name"],
  name: ["name", "lead_name", "property_name", "property", "business_name", "company", "company_name"],
  address: ["address", "property_address", "street_address", "site_address", "location"],
  contact_phone: ["phone", "phone_number", "contact_phone", "mobile", "cell"],
  pipeline_stage: ["stage", "status", "pipeline_stage", "lead_status"],
  next_step: ["next_step", "next_steps", "next_action", "follow_up", "task", "todo"],
  contact_name: ["contact_name", "contact", "primary_contact", "decision_maker"],
  contact_email: ["email", "email_address", "contact_email", "primary_contact_email"],
  lead_notes: ["notes", "lead_notes", "comments", "description"],
  sales_owner_name: ["owner", "sales_owner", "sales_owner_name", "rep", "sales_rep"]
};

const stageAliases = {
  new: "new_leads",
  lead: "new_leads",
  prospect: "new_leads",
  prospects: "new_leads",
  new_lead: "new_leads",
  new_leads: "new_leads",
  new_prospect: "new_leads",
  new_prospects: "new_leads",
  contacted: "contacted",
  contact: "contacted",
  pricing: "quote_sent",
  price_confirmed: "quote_sent",
  pricing_confirmed: "quote_sent",
  quote: "quote_sent",
  quote_sent: "quote_sent",
  walkthrough: "walkthrough",
  walkthrough_set: "walkthrough",
  management_review: "contract_out",
  contract: "contract_out",
  contract_out: "contract_out",
  won: "active",
  active: "active",
  lost: "lost",
  closed_lost: "lost"
};

const iconPaths = {
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5"/><path d="M12 3v12"/>',
  plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  calendar: '<path d="M8 2v4"/><path d="M16 2v4"/><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M3 10h18"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  file: '<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><path d="M14 2v6h6"/><path d="M8 13h8"/><path d="M8 17h8"/><path d="M8 9h1"/>',
  dollar: '<path d="M12 2v20"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7H14a3.5 3.5 0 0 1 0 7H6"/>',
  phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 3.16 8.81 19.79 19.79 0 0 1 .09 3.18 2 2 0 0 1 2.06 1h3a2 2 0 0 1 2 1.72c.12.9.32 1.78.59 2.63a2 2 0 0 1-.45 2.11L6 8.66a16 16 0 0 0 6.34 6.34l1.2-1.2a2 2 0 0 1 2.11-.45c.85.27 1.73.47 2.63.59A2 2 0 0 1 22 16.92z"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  building: '<path d="M3 21h18"/><path d="M5 21V7l8-4v18"/><path d="M19 21V11l-6-4"/><path d="M9 9h1"/><path d="M9 13h1"/><path d="M9 17h1"/>',
  clipboard: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/>',
  left: '<path d="m15 18-6-6 6-6"/>',
  right: '<path d="m9 18 6-6-6-6"/>',
  refresh: '<path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M3 21v-5h5"/><path d="M3 12a9 9 0 0 1 15.74-6.26L21 8"/><path d="M21 3v5h-5"/>',
  list: '<path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/>'
};

const env = window.__ENV || {};
const supabase = env.SUPABASE_URL && env.SUPABASE_ANON_KEY
  ? createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY)
  : null;

const state = {
  page: document.body?.dataset?.adminPage || "",
  root: null,
  user: null,
  profile: null,
  loading: true,
  message: "",
  messageTone: "",
  leads: [],
  walkthroughs: [],
  quotes: [],
  contracts: [],
  tasks: [],
  activities: [],
  availability: [],
  reps: [],
  rows: [],
  selectedId: "",
  selectedLeadIds: new Set(),
  search: "",
  stageFilter: "all",
  statusFilter: "all",
  ownerFilter: "all",
  calendarMode: "week",
  dateCursor: new Date(),
  modal: null,
  importPayloads: [],
  importErrors: [],
  importFileName: "",
  saving: false
};

let xlsxPromise = null;
let searchRenderTimer = null;

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function icon(name) {
  return `<svg class="admin-sales-icon" viewBox="0 0 24 24" aria-hidden="true">${iconPaths[name] || iconPaths.file}</svg>`;
}

function normalize(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function searchText(value) {
  return String(value || "").toLowerCase();
}

function titleCase(value) {
  return String(value || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function number(value) {
  return new Intl.NumberFormat().format(Number(value || 0));
}

function money(value, compact = false) {
  const amount = Number(value || 0);
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: compact ? 0 : 2
  }).format(amount);
}

function dateValue(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

function formatDate(value, options = {}) {
  const date = dateValue(value);
  if (!date) return options.empty || "Not set";
  return date.toLocaleDateString(undefined, {
    weekday: options.weekday,
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
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

function latestMs(...values) {
  return Math.max(...values.map((value) => dateValue(value)?.getTime() || 0));
}

function compactPayload(payload) {
  return Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined));
}

function stripMeta(row, fields) {
  if (!row) return {};
  return Object.fromEntries(fields.map((field) => [field, row[field]]));
}

function latestRelated(rows, leadId, fields = ["updated_at", "created_at"]) {
  return rows
    .filter((row) => row.lead_id === leadId)
    .slice()
    .sort((a, b) => latestMs(...fields.map((field) => b[field])) - latestMs(...fields.map((field) => a[field])))[0] || null;
}

function composeRows() {
  state.rows = state.leads.map((lead) => {
    const walkthrough = latestRelated(state.walkthroughs, lead.id, ["walkthrough_at", "updated_at", "created_at"]);
    const quote = latestRelated(state.quotes, lead.id, ["quote_sent_at", "updated_at", "created_at"]);
    const contract = latestRelated(state.contracts, lead.id, ["contract_due_at", "updated_at", "created_at"]);
    const task = latestRelated(state.tasks, lead.id, ["task_due_at", "updated_at", "created_at"]);
    return {
      ...lead,
      walkthrough_record_id: walkthrough?.id || "",
      quote_record_id: quote?.id || "",
      contract_record_id: contract?.id || "",
      task_record_id: task?.id || "",
      ...stripMeta(walkthrough, [
        "walkthrough_at",
        "walkthrough_end_at",
        "walkthrough_type",
        "walkthrough_location",
        "walkthrough_assigned_to_id",
        "walkthrough_assigned_to",
        "walkthrough_status",
        "walkthrough_notes"
      ]),
      ...stripMeta(quote, [
        "quote_amount",
        "quote_status",
        "quote_sent_at",
        "quote_expires_at",
        "quote_notes"
      ]),
      ...stripMeta(contract, [
        "contract_status",
        "contract_due_at",
        "contract_value",
        "contract_notes"
      ]),
      ...stripMeta(task, [
        "task_type",
        "task_priority",
        "task_status",
        "task_due_at",
        "next_step"
      ])
    };
  });
}

function stageFor(row) {
  const value = normalize(row?.pipeline_stage);
  return stageDefs.some(([stage]) => stage === value) ? value : "new_leads";
}

function stageLabel(stage) {
  return stageDefs.find(([id]) => id === stage)?.[1] || titleCase(stage || "new_leads");
}

function recordTitle(row) {
  return row?.property_name || row?.company_name || row?.name || "Untitled Prospect";
}

function recordCompany(row) {
  return row?.company_name || row?.property_name || row?.name || "No company saved";
}

function recordAddress(row) {
  const address = row?.address || "";
  const cityState = [row?.sales_city, row?.sales_state].filter(Boolean).join(", ");
  return [address, cityState].filter(Boolean).join(" - ");
}

function recordContact(row) {
  return row?.contact_name || row?.name || "No contact saved";
}

function recordPhone(row) {
  return row?.contact_phone || "No phone saved";
}

function ownerName(row) {
  return row?.sales_owner_name || row?.walkthrough_assigned_to || "Unassigned";
}

function recordUnits(row) {
  return Number(row?.prospect_unit_count || 0);
}

function recordValue(row) {
  return Number(row?.contract_value || row?.quote_amount || row?.lead_value || 0);
}

function walkthroughAt(row) {
  return row?.walkthrough_at || (stageFor(row) === "walkthrough" ? row?.next_step_due_at : null);
}

function quoteStatus(row) {
  return normalize(row?.quote_status || (stageFor(row) === "quote_sent" ? "sent" : "draft"));
}

function taskDue(row) {
  return row?.task_due_at || row?.next_step_due_at || null;
}

function walkthroughRows() {
  return filteredRows(state.rows.filter((row) =>
    Boolean(row.walkthrough_record_id || walkthroughAt(row)) ||
    ["walkthrough", "contract_out", "active"].includes(stageFor(row))
  ));
}

function quoteRows() {
  return filteredRows(state.rows.filter((row) =>
    Boolean(row.quote_record_id || Number(row.quote_amount || 0)) ||
    ["quote_sent", "contract_out", "active", "lost"].includes(stageFor(row))
  ));
}

function contractRows() {
  return filteredRows(state.rows.filter((row) =>
    Boolean(row.contract_record_id || row.contract_status) ||
    ["contract_out", "active"].includes(stageFor(row))
  ));
}

function statusForPage(row) {
  if (state.page === "walkthroughs") return normalize(row.walkthrough_status || "scheduled");
  if (state.page === "quotes") return quoteStatus(row);
  if (state.page === "contracts-pending") return normalize(row.contract_status || stageFor(row));
  return stageFor(row);
}

function filteredRows(rows = state.rows) {
  return rows.filter((row) => {
    if (state.stageFilter !== "all" && stageFor(row) !== state.stageFilter) return false;
    if (state.statusFilter !== "all" && statusForPage(row) !== state.statusFilter) return false;
    if (state.ownerFilter === "unassigned" && ownerName(row) !== "Unassigned") return false;
    if (state.ownerFilter !== "all" && state.ownerFilter !== "unassigned" && ownerName(row) !== state.ownerFilter) return false;
    const term = searchText(state.search);
    if (!term) return true;
    return [
      recordTitle(row),
      recordAddress(row),
      recordContact(row),
      row.contact_phone,
      row.contact_email,
      row.next_step,
      row.lead_notes,
      row.walkthrough_notes,
      row.quote_notes,
      row.contract_notes
    ].some((value) => searchText(value).includes(term));
  });
}

function selectRecord(rows) {
  if (!rows.length) return null;
  if (!state.selectedId || !rows.some((row) => row.id === state.selectedId)) {
    state.selectedId = rows[0].id;
  }
  return rows.find((row) => row.id === state.selectedId) || rows[0];
}

function rowById(id) {
  return state.rows.find((row) => row.id === id) || null;
}

function thisWeekRows(rows, dateField) {
  const start = startOfWeek(new Date());
  const end = endOfWeek(new Date());
  return rows.filter((row) => {
    const date = dateValue(row[dateField]);
    return date && date >= start && date <= end;
  });
}

async function selectRows(table, orderColumn, ascending = false, limit = 2000) {
  const query = supabase.from(table).select("*").order(orderColumn, { ascending }).limit(limit);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

async function loadCurrentUser() {
  const { data: userData, error } = await supabase.auth.getUser();
  if (error) throw error;
  state.user = userData?.user || null;
  if (!state.user) {
    window.location.href = "index.html";
    return;
  }
  const { data: profile } = await supabase
    .from("profiles")
    .select("id,full_name,email,role,status")
    .eq("id", state.user.id)
    .maybeSingle();
  state.profile = profile || null;
}

async function loadData(showLoading = true) {
  if (!supabase) {
    state.loading = false;
    state.message = "Supabase config is missing. Add env.js values before using admin sales pages.";
    state.messageTone = "error";
    render();
    return;
  }
  if (showLoading) {
    state.loading = true;
    render();
  }
  try {
    await loadCurrentUser();
    const [
      leads,
      walkthroughs,
      quotes,
      contracts,
      tasks,
      activities,
      availability,
      reps
    ] = await Promise.all([
      selectRows(TABLES.leads, "last_activity_at", false, 3000),
      selectRows(TABLES.walkthroughs, "created_at", false, 3000),
      selectRows(TABLES.quotes, "created_at", false, 3000),
      selectRows(TABLES.contracts, "created_at", false, 3000),
      selectRows(TABLES.tasks, "created_at", false, 3000),
      selectRows(TABLES.activities, "created_at", false, 4000),
      selectRows(TABLES.availability, "starts_at", true, 500),
      loadReps()
    ]);
    state.leads = leads;
    state.walkthroughs = walkthroughs;
    state.quotes = quotes;
    state.contracts = contracts;
    state.tasks = tasks;
    state.activities = activities;
    state.availability = availability;
    state.reps = reps;
    composeRows();
    const liveIds = new Set(state.rows.map((row) => row.id));
    state.selectedLeadIds = new Set([...state.selectedLeadIds].filter((id) => liveIds.has(id)));
    state.loading = false;
    state.message = "";
    state.messageTone = "";
    render();
  } catch (error) {
    state.loading = false;
    state.message = `Unable to load sales data: ${error.message}`;
    state.messageTone = "error";
    render();
  }
}

async function loadReps() {
  const { data, error } = await supabase
    .from("profiles")
    .select("id,full_name,email,role,status")
    .in("role", ["admin", "sales", "sales_team"])
    .order("full_name", { ascending: true });
  if (error) return [];
  return data || [];
}

function render() {
  if (!state.root) return;
  const copy = pageCopy[state.page] || pageCopy.leads;
  state.root.classList.add("admin-sales-host");
  state.root.innerHTML = `
    <section class="admin-sales-page admin-sales-${esc(state.page)}">
      <header class="admin-sales-page-head">
        <div class="admin-sales-title">
          <h1>${esc(copy.title)}</h1>
          <p>${esc(copy.subtitle)}</p>
        </div>
        <div class="admin-sales-actions">
          ${renderPageActions()}
        </div>
      </header>
      ${state.message ? `<p class="admin-sales-message ${esc(state.messageTone)}">${esc(state.message)}</p>` : ""}
      ${state.loading ? renderLoading() : renderPage()}
      ${renderModal()}
    </section>
  `;
}

function renderPageActions() {
  if (state.page === "leads") {
    return `
      <button class="admin-sales-secondary" type="button" data-admin-sales-open="import">${icon("upload")}Import Leads</button>
      <button class="admin-sales-primary" type="button" data-admin-sales-open="lead">${icon("plus")}Add Lead</button>
    `;
  }
  if (state.page === "walkthroughs") {
    return `<button class="admin-sales-primary" type="button" data-admin-sales-open="walkthrough">${icon("calendar")}Schedule Walkthrough</button>`;
  }
  if (state.page === "quotes") {
    return `<button class="admin-sales-primary" type="button" data-admin-sales-open="quote">${icon("file")}New Quote</button>`;
  }
  if (state.page === "contracts-pending") {
    return `<button class="admin-sales-primary" type="button" data-admin-sales-open="contract">${icon("clipboard")}Add Contract Follow-up</button>`;
  }
  return "";
}

function renderLoading() {
  return `
    <section class="admin-sales-empty admin-sales-loading">
      ${icon("refresh")}
      <strong>Loading sales pipeline</strong>
      <p>Pulling leads, walkthroughs, quotes, contracts, and availability from Supabase.</p>
    </section>
  `;
}

function renderPage() {
  if (state.page === "walkthroughs") return renderWalkthroughsPage();
  if (state.page === "quotes") return renderQuotesPage();
  if (state.page === "contracts-pending") return renderContractsPage();
  return renderLeadsPage();
}

function metricCard(label, value, detail, iconName, tone = "green") {
  return `
    <article class="admin-sales-metric ${esc(tone)}">
      <span class="admin-sales-metric-icon">${icon(iconName)}</span>
      <div>
        <span>${esc(label)}</span>
        <strong>${esc(value)}</strong>
        <small>${esc(detail)}</small>
      </div>
    </article>
  `;
}

function renderLeadMetrics() {
  return `
    <section class="admin-sales-metrics">
      ${metricCard("Total Leads", number(state.rows.length), "prospects in the pipeline", "users")}
      ${metricCard("Contacted", number(state.rows.filter((row) => stageFor(row) !== "new_leads").length), "real outreach started", "phone", "cyan")}
      ${metricCard("Pricing Confirmed", number(state.rows.filter((row) => stageFor(row) === "quote_sent").length), "$0.25/sq ft fit", "dollar", "yellow")}
      ${metricCard("Walkthroughs Set", number(state.rows.filter((row) => stageFor(row) === "walkthrough").length), "appointments scheduled", "calendar", "blue")}
      ${metricCard("Won", number(state.rows.filter((row) => stageFor(row) === "active").length), "active accounts", "check")}
      ${metricCard("Needs Follow-up", number(state.rows.filter((row) => !["active", "lost"].includes(stageFor(row))).length), "open opportunities", "clipboard", "violet")}
    </section>
  `;
}

function renderLeadsPage() {
  const rows = filteredRows();
  const selected = selectRecord(rows);
  const selectedCount = state.selectedLeadIds.size;
  const allVisibleSelected = Boolean(rows.length && rows.every((row) => state.selectedLeadIds.has(row.id)));
  return `
    ${renderLeadMetrics()}
    <section class="admin-sales-table-layout">
      <article class="admin-sales-panel">
        <div class="admin-sales-panel-header">
          <div>
            <h2>Prospect List</h2>
            <p>Name, address, phone, stage, next steps, and owner.</p>
          </div>
          <div class="admin-sales-row-actions">
            <button class="admin-sales-danger" type="button" data-admin-sales-delete-selected ${selectedCount ? "" : "disabled"}>${icon("x")}Delete Selected</button>
            <button class="admin-sales-secondary" type="button" data-admin-sales-refresh>${icon("refresh")}Refresh</button>
          </div>
        </div>
        ${renderLeadFilters()}
        ${renderStageTabs()}
        <div class="admin-sales-bulk-toolbar">
          <label>
            <input type="checkbox" data-admin-sales-select-all ${allVisibleSelected ? "checked" : ""} ${rows.length ? "" : "disabled"} />
            <span>Select all visible</span>
          </label>
          <strong>${number(selectedCount)} selected</strong>
        </div>
        ${renderLeadTable(rows)}
      </article>
      ${renderLeadDetail(selected)}
    </section>
  `;
}

function renderLeadFilters() {
  return `
    <div class="admin-sales-filter-bar">
      <label class="admin-sales-search" aria-label="Search leads">
        ${icon("search")}
        <input type="search" value="${esc(state.search)}" placeholder="Search leads..." data-admin-sales-search />
      </label>
      ${selectShell("owner", "Owner", ownerOptions(), state.ownerFilter)}
      ${selectShell("status", "Stage", [["all", "All Stages"], ...stageDefs], state.stageFilter)}
      <button class="admin-sales-secondary" type="button" data-admin-sales-clear-filters>${icon("x")}Clear</button>
    </div>
  `;
}

function selectShell(key, label, options, selected) {
  return `
    <label class="admin-sales-field">
      <span>${esc(label)}</span>
      <select class="admin-sales-filter" data-admin-sales-filter="${esc(key)}">
        ${options.map(([value, text]) => `<option value="${esc(value)}" ${String(selected) === String(value) ? "selected" : ""}>${esc(text)}</option>`).join("")}
      </select>
    </label>
  `;
}

function ownerOptions() {
  const owners = Array.from(new Set(state.rows.map((row) => ownerName(row)).filter(Boolean))).sort();
  return [["all", "All Owners"], ["unassigned", "Unassigned"], ...owners.filter((owner) => owner !== "Unassigned").map((owner) => [owner, owner])];
}

function renderStageTabs() {
  return `
    <div class="admin-sales-stage-tabs" role="tablist" aria-label="Lead stages">
      <button class="admin-sales-tab ${state.stageFilter === "all" ? "active" : ""}" type="button" data-admin-sales-stage="all">All</button>
      ${stageDefs.map(([stage, label]) => `
        <button class="admin-sales-tab ${state.stageFilter === stage ? "active" : ""}" type="button" data-admin-sales-stage="${esc(stage)}">${esc(label)}</button>
      `).join("")}
    </div>
  `;
}

function renderLeadTable(rows) {
  if (!rows.length) return emptyState("No prospects found", "Import a prospect file or add a lead manually.");
  return `
    <div class="admin-sales-table-wrap">
      <table class="admin-sales-table">
        <thead>
          <tr>
            <th></th>
            <th>Name</th>
            <th>Address</th>
            <th>Phone</th>
            <th>Stage</th>
            <th>Next Steps</th>
            <th>Owner</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((row) => `
            <tr class="${row.id === state.selectedId ? "active" : ""}">
              <td><input type="checkbox" data-admin-sales-select-lead="${esc(row.id)}" ${state.selectedLeadIds.has(row.id) ? "checked" : ""} /></td>
              <td><strong>${esc(recordTitle(row))}</strong><small>${esc(recordContact(row))}</small></td>
              <td>${esc(recordAddress(row) || "No address saved")}</td>
              <td>${esc(recordPhone(row))}</td>
              <td>
                <select class="admin-sales-filter" data-admin-sales-inline-stage="${esc(row.id)}">
                  ${stageDefs.map(([stage, label]) => `<option value="${esc(stage)}" ${stageFor(row) === stage ? "selected" : ""}>${esc(label)}</option>`).join("")}
                </select>
              </td>
              <td><strong>${esc(row.next_step || "No next step")}</strong><small>${esc(formatDateTime(taskDue(row), { empty: "" }))}</small></td>
              <td>${esc(ownerName(row))}</td>
              <td>
                <div class="admin-sales-row-actions">
                  <button class="admin-sales-secondary" type="button" data-admin-sales-select-record="${esc(row.id)}">${icon("list")}Details</button>
                  <button class="admin-sales-primary" type="button" data-admin-sales-open="lead" data-id="${esc(row.id)}">${icon("file")}Edit</button>
                </div>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderLeadDetail(row) {
  if (!row) return detailEmpty("Select a lead", "Lead details will appear here.");
  return `
    <aside class="admin-sales-detail">
      <section class="admin-sales-detail-hero">
        <span class="admin-sales-status ${esc(stageFor(row))}">${esc(stageLabel(stageFor(row)))}</span>
        <h2>${esc(recordTitle(row))}</h2>
        <p>${esc(recordAddress(row) || "No address saved")}</p>
      </section>
      <div class="admin-sales-detail-grid">
        <div class="admin-sales-detail-stat"><span>Contact</span><strong>${esc(recordContact(row))}</strong></div>
        <div class="admin-sales-detail-stat"><span>Phone</span><strong>${esc(recordPhone(row))}</strong></div>
        <div class="admin-sales-detail-stat"><span>Owner</span><strong>${esc(ownerName(row))}</strong></div>
        <div class="admin-sales-detail-stat"><span>Next Step</span><strong>${esc(row.next_step || "No next step")}</strong></div>
      </div>
      <div class="admin-sales-info-block">
        <span>Lead Notes</span>
        <strong>${esc(row.lead_notes || "No lead notes saved.")}</strong>
      </div>
      <div class="admin-sales-action-stack">
        <button class="admin-sales-primary" type="button" data-admin-sales-open="lead" data-id="${esc(row.id)}">${icon("file")}Edit Lead</button>
        <button class="admin-sales-secondary" type="button" data-admin-sales-open="walkthrough" data-id="${esc(row.id)}">${icon("calendar")}Schedule Walkthrough</button>
        <button class="admin-sales-secondary" type="button" data-admin-sales-open="quote" data-id="${esc(row.id)}">${icon("dollar")}Create Quote</button>
      </div>
    </aside>
  `;
}

function renderWalkthroughsPage() {
  const rows = walkthroughRows();
  const selected = selectRecord(rows);
  const today = rows.filter((row) => {
    const date = dateValue(walkthroughAt(row));
    return date && sameDay(date, new Date());
  });
  return `
    <section class="admin-sales-metrics">
      ${metricCard("Scheduled", number(rows.length), "walkthrough records", "calendar", "blue")}
      ${metricCard("Confirmed", number(rows.filter((row) => normalize(row.walkthrough_status) === "confirmed").length), "ready for visit", "check")}
      ${metricCard("Today", number(today.length), "appointments today", "clock", "yellow")}
      ${metricCard("This Week", number(thisWeekRows(rows, "walkthrough_at").length), "scheduled this week", "calendar", "cyan")}
      ${metricCard("Open Slots", number(state.availability.filter((slot) => normalize(slot.status) === "open").length), "available windows", "clock")}
      ${metricCard("Completed", number(rows.filter((row) => normalize(row.walkthrough_status) === "completed").length), "finished walkthroughs", "clipboard", "violet")}
    </section>
    ${renderAvailabilityPanel()}
    <section class="admin-sales-workspace">
      <article class="admin-sales-panel">
        ${renderGenericFilters("Search walkthroughs...", walkthroughStatuses)}
        ${renderCalendar(rows)}
      </article>
      ${renderWalkthroughDetail(selected)}
    </section>
  `;
}

function renderAvailabilityPanel() {
  const slots = state.availability
    .slice()
    .sort((a, b) => latestMs(a.starts_at) - latestMs(b.starts_at))
    .slice(0, 14);
  const tomorrow = toDateInput(addDays(new Date(), 1));
  return `
    <section class="admin-sales-panel">
      <div class="admin-sales-panel-header">
        <div>
          <h2>Walkthrough Availability</h2>
          <p>These windows are what sales reps see when they choose a walkthrough time.</p>
        </div>
      </div>
      <form class="admin-sales-availability-form" data-admin-sales-availability-form>
        ${field("availability_date", "Date", tomorrow, "date", true)}
        ${field("availability_start_time", "Start", "10:00", "time", true)}
        ${field("availability_end_time", "End", "11:00", "time", true)}
        ${field("availability_label", "Window Label", "Quality walkthrough", "text")}
        <button class="admin-sales-primary" type="submit">${icon("plus")}Add Window</button>
      </form>
      <div class="admin-sales-availability-list">
        ${slots.length ? slots.map((slot) => {
          const start = dateValue(slot.starts_at);
          const end = dateValue(slot.ends_at);
          return `
            <article class="admin-sales-availability-slot">
              <div>
                <strong>${esc(formatDate(slot.starts_at, { weekday: "short" }))}</strong>
                <small>${esc(start && end ? `${formatTime(start)} - ${formatTime(end)}` : "Time TBD")} - ${esc(slot.label || "Available walkthrough")}</small>
              </div>
              <select class="admin-sales-filter" data-admin-sales-availability-status="${esc(slot.id)}">
                ${availabilityStatuses.map((status) => `<option value="${esc(status)}" ${normalize(slot.status || "open") === status ? "selected" : ""}>${esc(titleCase(status))}</option>`).join("")}
              </select>
              <button class="admin-sales-danger" type="button" data-admin-sales-delete-availability="${esc(slot.id)}">${icon("x")}Remove</button>
            </article>
          `;
        }).join("") : `<p class="admin-sales-record-subtitle">No admin availability windows are set yet.</p>`}
      </div>
    </section>
  `;
}

function renderGenericFilters(placeholder, statuses = []) {
  return `
    <div class="admin-sales-filter-bar">
      <label class="admin-sales-search" aria-label="${esc(placeholder)}">
        ${icon("search")}
        <input type="search" value="${esc(state.search)}" placeholder="${esc(placeholder)}" data-admin-sales-search />
      </label>
      ${selectShell("owner", "Owner", ownerOptions(), state.ownerFilter)}
      ${selectShell("status", "Status", [["all", "All Statuses"], ...statuses.map((status) => [status, titleCase(status)])], state.statusFilter)}
      <button class="admin-sales-secondary" type="button" data-admin-sales-clear-filters>${icon("x")}Clear</button>
    </div>
  `;
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
    <div class="admin-sales-calendar-shell">
      <header class="admin-sales-calendar-header">
        <div class="admin-sales-calendar-nav">
          <button type="button" data-admin-sales-calendar-nav="prev" aria-label="Previous">${icon("left")}</button>
          <button type="button" data-admin-sales-calendar-today>Today</button>
          <button type="button" data-admin-sales-calendar-nav="next" aria-label="Next">${icon("right")}</button>
        </div>
        <strong>${esc(calendarRangeLabel())}</strong>
        <div class="admin-sales-segmented" aria-label="Calendar view">
          ${["month", "week", "day"].map((mode) => `<button class="${state.calendarMode === mode ? "active" : ""}" type="button" data-admin-sales-calendar-mode="${mode}">${esc(titleCase(mode))}</button>`).join("")}
        </div>
      </header>
      ${state.calendarMode === "day" ? renderDayCalendar(rows) : state.calendarMode === "month" ? renderMonthCalendar(rows) : renderWeekCalendar(rows)}
    </div>
  `;
}

function eventsForDay(rows, day) {
  return rows
    .filter((row) => {
      const date = dateValue(walkthroughAt(row));
      return date && sameDay(date, day);
    })
    .sort((a, b) => latestMs(walkthroughAt(a)) - latestMs(walkthroughAt(b)));
}

function renderCalendarEvent(row) {
  const status = normalize(row.walkthrough_status || "scheduled");
  return `
    <button class="admin-sales-calendar-event ${esc(status)}" type="button" data-admin-sales-select-record="${esc(row.id)}">
      <small>${esc(formatTime(walkthroughAt(row)) || "Time TBD")}</small>
      <strong>${esc(recordTitle(row))}</strong>
      <small>${esc(titleCase(status))}</small>
    </button>
  `;
}

function renderWeekCalendar(rows) {
  const start = startOfWeek(state.dateCursor);
  return `
    <div class="admin-sales-week-grid">
      ${Array.from({ length: 7 }, (_, index) => {
        const day = addDays(start, index);
        const dayRows = eventsForDay(rows, day);
        return `
          <section class="admin-sales-day-column">
            <header><strong>${esc(day.toLocaleDateString(undefined, { weekday: "short" }))}</strong><span>${esc(formatDate(day))}</span></header>
            ${dayRows.length ? dayRows.map(renderCalendarEvent).join("") : `<p class="admin-sales-record-subtitle">No walkthroughs</p>`}
          </section>
        `;
      }).join("")}
    </div>
  `;
}

function renderMonthCalendar(rows) {
  const monthStart = startOfMonth(state.dateCursor);
  const start = startOfWeek(monthStart);
  return `
    <div class="admin-sales-month-grid">
      ${Array.from({ length: 42 }, (_, index) => {
        const day = addDays(start, index);
        const dayRows = eventsForDay(rows, day);
        const muted = day.getMonth() !== monthStart.getMonth();
        return `
          <section class="admin-sales-month-cell ${muted ? "muted" : ""}">
            <header><strong>${esc(day.toLocaleDateString(undefined, { weekday: "short" }))}</strong><span>${day.getDate()}</span></header>
            ${dayRows.slice(0, 3).map(renderCalendarEvent).join("")}
            ${dayRows.length > 3 ? `<small class="admin-sales-record-subtitle">+${dayRows.length - 3} more</small>` : ""}
          </section>
        `;
      }).join("")}
    </div>
  `;
}

function renderDayCalendar(rows) {
  const dayRows = eventsForDay(rows, state.dateCursor);
  if (!dayRows.length) return `<div class="admin-sales-day-view">${emptyState("No walkthroughs on this day", "Use Schedule Walkthrough to add one.")}</div>`;
  return `
    <div class="admin-sales-day-view">
      ${dayRows.map((row) => `
        <article class="admin-sales-card ${row.id === state.selectedId ? "active" : ""}">
          <header>
            <div>
              <h3>${esc(recordTitle(row))}</h3>
              <p>${esc(recordAddress(row) || "No address saved")}</p>
            </div>
            <span class="admin-sales-status ${esc(normalize(row.walkthrough_status || "scheduled"))}">${esc(titleCase(row.walkthrough_status || "scheduled"))}</span>
          </header>
          <p>${esc(formatDateTime(walkthroughAt(row)))} with ${esc(row.walkthrough_assigned_to || ownerName(row))}</p>
          <div class="admin-sales-row-actions">
            <button class="admin-sales-secondary" type="button" data-admin-sales-select-record="${esc(row.id)}">${icon("list")}Details</button>
            <button class="admin-sales-primary" type="button" data-admin-sales-open="walkthrough" data-id="${esc(row.id)}">${icon("calendar")}Edit</button>
          </div>
        </article>
      `).join("")}
    </div>
  `;
}

function renderWalkthroughDetail(row) {
  if (!row) return detailEmpty("Select a walkthrough", "Walkthrough details will appear here.");
  return `
    <aside class="admin-sales-detail">
      <section class="admin-sales-detail-hero">
        <span class="admin-sales-status ${esc(normalize(row.walkthrough_status || "scheduled"))}">${esc(titleCase(row.walkthrough_status || "scheduled"))}</span>
        <h2>${esc(recordTitle(row))}</h2>
        <p>${esc(recordAddress(row) || "No address saved")}</p>
      </section>
      <div class="admin-sales-detail-grid">
        <div class="admin-sales-detail-stat"><span>Date & Time</span><strong>${esc(formatDateTime(walkthroughAt(row)))}</strong></div>
        <div class="admin-sales-detail-stat"><span>Assigned To</span><strong>${esc(row.walkthrough_assigned_to || ownerName(row))}</strong></div>
        <div class="admin-sales-detail-stat"><span>Contact</span><strong>${esc(recordContact(row))}</strong></div>
        <div class="admin-sales-detail-stat"><span>Phone</span><strong>${esc(recordPhone(row))}</strong></div>
      </div>
      <div class="admin-sales-info-block">
        <span>Notes</span>
        <strong>${esc(row.walkthrough_notes || row.lead_notes || "No walkthrough notes saved.")}</strong>
      </div>
      <div class="admin-sales-action-stack">
        <button class="admin-sales-primary" type="button" data-admin-sales-open="walkthrough" data-id="${esc(row.id)}">${icon("calendar")}Edit Walkthrough</button>
        <button class="admin-sales-secondary" type="button" data-admin-sales-open="quote" data-id="${esc(row.id)}">${icon("file")}Create Quote</button>
        <button class="admin-sales-secondary" type="button" data-admin-sales-update-stage="${esc(row.id)}" data-stage="quote_sent">${icon("dollar")}Move to Pricing Confirmed</button>
      </div>
    </aside>
  `;
}

function renderQuotesPage() {
  const rows = quoteRows();
  const selected = selectRecord(rows);
  const totalValue = rows.reduce((sum, row) => sum + Number(row.quote_amount || recordValue(row)), 0);
  return `
    <section class="admin-sales-metrics">
      ${metricCard("Total Quotes", number(rows.length), "quotes in pipeline", "file")}
      ${metricCard("Drafts", number(rows.filter((row) => quoteStatus(row) === "draft").length), "not sent yet", "file", "blue")}
      ${metricCard("Sent", number(rows.filter((row) => quoteStatus(row) === "sent").length), "awaiting response", "mail", "cyan")}
      ${metricCard("Accepted", number(rows.filter((row) => quoteStatus(row) === "accepted").length), "ready for contract", "check")}
      ${metricCard("Quote Value", money(totalValue, true), "total quoted value", "dollar", "violet")}
      ${metricCard("Avg. Quote", money(rows.length ? totalValue / rows.length : 0, true), "per quote", "dollar", "yellow")}
    </section>
    <section class="admin-sales-table-layout">
      <article class="admin-sales-panel">
        ${renderGenericFilters("Search quotes...", quoteStatuses)}
        ${renderQuoteTable(rows)}
      </article>
      ${renderQuoteDetail(selected)}
    </section>
  `;
}

function renderQuoteTable(rows) {
  if (!rows.length) return emptyState("No quotes found", "Create a quote from a lead or walkthrough.");
  return `
    <div class="admin-sales-table-wrap">
      <table class="admin-sales-table">
        <thead>
          <tr>
            <th>Quote</th>
            <th>Contact</th>
            <th>Phone</th>
            <th>Amount</th>
            <th>Date Sent</th>
            <th>Expiration</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((row) => `
            <tr class="${row.id === state.selectedId ? "active" : ""}" data-admin-sales-select-record="${esc(row.id)}">
              <td><strong>${esc(recordTitle(row))}</strong><small>Q-${esc(String(row.quote_record_id || row.id).slice(0, 8).toUpperCase())}</small></td>
              <td><strong>${esc(recordContact(row))}</strong><small>${esc(row.contact_email || "")}</small></td>
              <td>${esc(recordPhone(row))}</td>
              <td>${money(row.quote_amount || recordValue(row))}</td>
              <td>${esc(formatDate(row.quote_sent_at))}</td>
              <td>${esc(formatDate(row.quote_expires_at))}</td>
              <td><span class="admin-sales-status ${esc(quoteStatus(row))}">${esc(titleCase(quoteStatus(row)))}</span></td>
              <td><button class="admin-sales-secondary" type="button" data-admin-sales-open="quote" data-id="${esc(row.id)}">${icon("file")}Edit</button></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderQuoteDetail(row) {
  if (!row) return detailEmpty("Select a quote", "Quote details will appear here.");
  return `
    <aside class="admin-sales-detail">
      <section class="admin-sales-detail-hero">
        <span class="admin-sales-status ${esc(quoteStatus(row))}">${esc(titleCase(quoteStatus(row)))}</span>
        <h2>${esc(recordTitle(row))}</h2>
        <p>${esc(recordAddress(row) || "No address saved")}</p>
      </section>
      <div class="admin-sales-detail-grid">
        <div class="admin-sales-detail-stat"><span>Contact</span><strong>${esc(recordContact(row))}</strong></div>
        <div class="admin-sales-detail-stat"><span>Amount</span><strong>${money(row.quote_amount || recordValue(row))}</strong></div>
        <div class="admin-sales-detail-stat"><span>Sent</span><strong>${esc(formatDate(row.quote_sent_at))}</strong></div>
        <div class="admin-sales-detail-stat"><span>Expires</span><strong>${esc(formatDate(row.quote_expires_at))}</strong></div>
      </div>
      <div class="admin-sales-info-block">
        <span>Quote Notes</span>
        <strong>${esc(row.quote_notes || row.lead_notes || "No quote notes saved.")}</strong>
      </div>
      <div class="admin-sales-action-stack">
        <button class="admin-sales-primary" type="button" data-admin-sales-open="quote" data-id="${esc(row.id)}">${icon("file")}Edit Quote</button>
        <button class="admin-sales-secondary" type="button" data-admin-sales-update-quote="${esc(row.id)}" data-status="sent">${icon("mail")}Mark Sent</button>
        <button class="admin-sales-secondary" type="button" data-admin-sales-update-quote="${esc(row.id)}" data-status="accepted">${icon("check")}Mark Accepted</button>
        <button class="admin-sales-secondary" type="button" data-admin-sales-update-stage="${esc(row.id)}" data-stage="contract_out">${icon("clipboard")}Move to Contracts</button>
      </div>
    </aside>
  `;
}

function renderContractsPage() {
  const rows = contractRows();
  const selected = selectRecord(rows);
  return `
    <section class="admin-sales-metrics">
      ${metricCard("Pending", number(rows.filter((row) => stageFor(row) === "contract_out" || normalize(row.contract_status) === "pending").length), "waiting on signature", "clipboard", "violet")}
      ${metricCard("Won Accounts", number(state.rows.filter((row) => stageFor(row) === "active").length), "signed contracts", "check")}
      ${metricCard("Contract Value", money(rows.reduce((sum, row) => sum + recordValue(row), 0), true), "pipeline value", "dollar")}
      ${metricCard("Due This Week", number(thisWeekRows(rows, "contract_due_at").length), "follow-ups due", "calendar", "yellow")}
      ${metricCard("Avg. Units", number(Math.round(rows.reduce((sum, row) => sum + recordUnits(row), 0) / Math.max(1, rows.length))), "per contract", "building", "blue")}
      ${metricCard("Lost", number(state.rows.filter((row) => stageFor(row) === "lost").length), "closed lost", "x", "red")}
    </section>
    <section class="admin-sales-table-layout">
      <article class="admin-sales-panel">
        ${renderGenericFilters("Search contracts...", contractStatuses)}
        ${renderContractTable(rows)}
      </article>
      ${renderContractDetail(selected)}
    </section>
  `;
}

function renderContractTable(rows) {
  if (!rows.length) return emptyState("No pending contracts", "Move accepted quotes into the contract queue.");
  return `
    <div class="admin-sales-table-wrap">
      <table class="admin-sales-table">
        <thead>
          <tr>
            <th>Property</th>
            <th>Contact</th>
            <th>Phone</th>
            <th>Value</th>
            <th>Due</th>
            <th>Status</th>
            <th>Owner</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((row) => `
            <tr class="${row.id === state.selectedId ? "active" : ""}" data-admin-sales-select-record="${esc(row.id)}">
              <td><strong>${esc(recordTitle(row))}</strong><small>${esc(recordAddress(row) || "No address saved")}</small></td>
              <td><strong>${esc(recordContact(row))}</strong><small>${esc(row.contact_email || "")}</small></td>
              <td>${esc(recordPhone(row))}</td>
              <td>${money(row.contract_value || row.quote_amount || recordValue(row), true)}</td>
              <td>${esc(formatDate(row.contract_due_at || taskDue(row)))}</td>
              <td><span class="admin-sales-status ${esc(normalize(row.contract_status || stageFor(row)))}">${esc(titleCase(row.contract_status || stageLabel(stageFor(row))))}</span></td>
              <td>${esc(ownerName(row))}</td>
              <td><button class="admin-sales-secondary" type="button" data-admin-sales-open="contract" data-id="${esc(row.id)}">${icon("clipboard")}Edit</button></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderContractDetail(row) {
  if (!row) return detailEmpty("Select a contract", "Contract details will appear here.");
  return `
    <aside class="admin-sales-detail">
      <section class="admin-sales-detail-hero">
        <span class="admin-sales-status ${esc(normalize(row.contract_status || stageFor(row)))}">${esc(titleCase(row.contract_status || stageLabel(stageFor(row))))}</span>
        <h2>${esc(recordTitle(row))}</h2>
        <p>${esc(recordCompany(row))}</p>
      </section>
      <div class="admin-sales-detail-grid">
        <div class="admin-sales-detail-stat"><span>Contact</span><strong>${esc(recordContact(row))}</strong></div>
        <div class="admin-sales-detail-stat"><span>Contract Due</span><strong>${esc(formatDate(row.contract_due_at || taskDue(row)))}</strong></div>
        <div class="admin-sales-detail-stat"><span>Quote</span><strong>${money(row.quote_amount || recordValue(row))}</strong></div>
        <div class="admin-sales-detail-stat"><span>Owner</span><strong>${esc(ownerName(row))}</strong></div>
      </div>
      <div class="admin-sales-info-block">
        <span>Contract Notes</span>
        <strong>${esc(row.contract_notes || row.quote_notes || row.lead_notes || "No contract notes saved.")}</strong>
      </div>
      <div class="admin-sales-action-stack">
        <button class="admin-sales-primary" type="button" data-admin-sales-open="contract" data-id="${esc(row.id)}">${icon("clipboard")}Edit Contract</button>
        <button class="admin-sales-secondary" type="button" data-admin-sales-update-contract="${esc(row.id)}" data-status="signed">${icon("check")}Mark Signed</button>
        <button class="admin-sales-secondary" type="button" data-admin-sales-update-stage="${esc(row.id)}" data-stage="active">${icon("check")}Move to Won</button>
      </div>
    </aside>
  `;
}

function emptyState(title, text) {
  return `
    <section class="admin-sales-empty">
      ${icon("list")}
      <strong>${esc(title)}</strong>
      <p>${esc(text)}</p>
    </section>
  `;
}

function detailEmpty(title, text) {
  return `<aside class="admin-sales-detail">${emptyState(title, text)}</aside>`;
}

function renderModal() {
  if (!state.modal) return "";
  if (state.modal.type === "import") return renderImportModal();
  if (state.modal.type === "walkthrough") return renderWalkthroughModal(rowById(state.modal.id));
  if (state.modal.type === "quote") return renderQuoteModal(rowById(state.modal.id));
  if (state.modal.type === "contract") return renderContractModal(rowById(state.modal.id));
  return renderLeadModal(rowById(state.modal.id));
}

function modalShell(title, kicker, body, footer, narrow = false) {
  return `
    <div class="admin-sales-modal">
      <div class="admin-sales-modal-backdrop" data-admin-sales-close></div>
      <section class="admin-sales-modal-panel ${narrow ? "narrow" : ""}" role="dialog" aria-modal="true">
        <header class="admin-sales-modal-header">
          <div>
            <p>${esc(kicker)}</p>
            <h2>${esc(title)}</h2>
          </div>
          <button class="admin-sales-secondary" type="button" data-admin-sales-close>${icon("x")}Close</button>
        </header>
        ${body}
        ${footer}
      </section>
    </div>
  `;
}

function modalFooter(label) {
  return `
    <footer class="admin-sales-modal-footer">
      <p class="admin-sales-message" data-admin-sales-modal-message></p>
      <div class="admin-sales-row-actions">
        <button class="admin-sales-secondary" type="button" data-admin-sales-close>Cancel</button>
        <button class="admin-sales-primary" type="submit">${icon("check")}${esc(label)}</button>
      </div>
    </footer>
  `;
}

function field(name, label, value = "", type = "text", required = false, className = "") {
  return `
    <label class="admin-sales-field ${esc(className)}">
      <span>${esc(label)}</span>
      <input name="${esc(name)}" type="${esc(type)}" value="${esc(value)}" ${required ? "required" : ""} />
    </label>
  `;
}

function textField(name, label, value = "", className = "wide") {
  return `
    <label class="admin-sales-field ${esc(className)}">
      <span>${esc(label)}</span>
      <textarea name="${esc(name)}">${esc(value)}</textarea>
    </label>
  `;
}

function selectField(name, label, options, selected = "", required = false, className = "") {
  return `
    <label class="admin-sales-field ${esc(className)}">
      <span>${esc(label)}</span>
      <select name="${esc(name)}" ${required ? "required" : ""}>
        ${options.map(([value, text]) => `<option value="${esc(value)}" ${String(selected || "") === String(value) ? "selected" : ""}>${esc(text)}</option>`).join("")}
      </select>
    </label>
  `;
}

function leadOptions(selected = "") {
  return [["", "Choose a lead..."], ...state.rows
    .slice()
    .sort((a, b) => recordTitle(a).localeCompare(recordTitle(b)))
    .map((row) => [row.id, recordTitle(row)])]
    .map(([value, label]) => [value, `${label}${value && recordAddress(rowById(value)) ? ` - ${recordAddress(rowById(value))}` : ""}`]);
}

function repOptions(selected = "") {
  const options = [["", "Unassigned"], ...state.reps.map((rep) => [rep.id, rep.full_name || rep.email || "Unnamed user"])];
  return options.map(([value, label]) => [value, label, String(value) === String(selected)]);
}

function renderLeadModal(row) {
  const body = `
    <form data-admin-sales-lead-form>
      <div class="admin-sales-modal-body">
        <div class="admin-sales-form-grid">
          ${field("property_name", "Name", row ? recordTitle(row) : "", "text", true)}
          ${field("address", "Address", row?.address || "", "text")}
          ${field("contact_phone", "Phone Number", row?.contact_phone || "", "tel")}
          ${field("contact_name", "Contact Name", row?.contact_name || "", "text")}
          ${field("contact_email", "Contact Email", row?.contact_email || "", "email")}
          ${selectField("pipeline_stage", "Stage", stageDefs, stageFor(row || {}))}
          ${selectField("sales_owner_id", "Owner", repOptions(row?.sales_owner_id || "").map(([value, label]) => [value, label]), row?.sales_owner_id || "")}
          ${field("next_step", "Next Steps", row?.next_step || "", "text")}
          ${textField("lead_notes", "Notes", row?.lead_notes || "")}
        </div>
      </div>
      ${modalFooter("Save Lead")}
    </form>
  `;
  return modalShell(row ? "Edit Lead" : "New Lead", "Sales Pipeline", body, "", false);
}

function renderWalkthroughModal(row) {
  const leadId = row?.id || "";
  const body = `
    <form data-admin-sales-walkthrough-form data-related-id="${esc(row?.walkthrough_record_id || "")}">
      <div class="admin-sales-modal-body">
        <div class="admin-sales-form-grid">
          ${selectField("lead_id", "Lead", leadOptions(leadId), leadId, true, "wide")}
          ${field("walkthrough_at_date", "Date", toDateInput(walkthroughAt(row)), "date", true)}
          ${field("walkthrough_at_time", "Start Time", toTimeInput(walkthroughAt(row)) || "10:00", "time")}
          ${field("walkthrough_end_time", toDateInput(row?.walkthrough_end_at) && toTimeInput(row?.walkthrough_end_at) ? "End Time" : "End Time", toTimeInput(row?.walkthrough_end_at) || "11:00", "time")}
          ${selectField("walkthrough_status", "Status", walkthroughStatuses.map((status) => [status, titleCase(status)]), row?.walkthrough_status || "scheduled")}
          ${selectField("walkthrough_assigned_to_id", "Assigned To", repOptions(row?.walkthrough_assigned_to_id || "").map(([value, label]) => [value, label]), row?.walkthrough_assigned_to_id || "")}
          ${field("walkthrough_location", "Location", row?.walkthrough_location || row?.address || "", "text", false, "wide")}
          ${textField("walkthrough_notes", "Notes", row?.walkthrough_notes || "")}
        </div>
      </div>
      ${modalFooter("Save Walkthrough")}
    </form>
  `;
  return modalShell(row ? "Edit Walkthrough" : "Schedule Walkthrough", "Walkthroughs", body, "", false);
}

function renderQuoteModal(row) {
  const leadId = row?.id || "";
  const body = `
    <form data-admin-sales-quote-form data-related-id="${esc(row?.quote_record_id || "")}">
      <div class="admin-sales-modal-body">
        <div class="admin-sales-form-grid">
          ${selectField("lead_id", "Lead", leadOptions(leadId), leadId, true, "wide")}
          ${field("quote_amount", "Quote Amount", row?.quote_amount || row?.lead_value || "", "number", false)}
          ${selectField("quote_status", "Quote Status", quoteStatuses.map((status) => [status, titleCase(status)]), row?.quote_status || "draft")}
          ${field("quote_sent_at", "Date Sent", toDateTimeLocal(row?.quote_sent_at), "datetime-local")}
          ${field("quote_expires_at", "Expiration Date", toDateInput(row?.quote_expires_at), "date")}
          ${textField("quote_notes", "Quote Notes", row?.quote_notes || "")}
        </div>
      </div>
      ${modalFooter("Save Quote")}
    </form>
  `;
  return modalShell(row ? "Edit Quote" : "New Quote", "Quotes", body, "", false);
}

function renderContractModal(row) {
  const leadId = row?.id || "";
  const body = `
    <form data-admin-sales-contract-form data-related-id="${esc(row?.contract_record_id || "")}">
      <div class="admin-sales-modal-body">
        <div class="admin-sales-form-grid">
          ${selectField("lead_id", "Lead", leadOptions(leadId), leadId, true, "wide")}
          ${selectField("contract_status", "Contract Status", contractStatuses.map((status) => [status, titleCase(status)]), row?.contract_status || "pending")}
          ${field("contract_due_at", "Due Date", toDateTimeLocal(row?.contract_due_at || taskDue(row)), "datetime-local")}
          ${field("contract_value", "Contract Value", row?.contract_value || row?.quote_amount || row?.lead_value || "", "number")}
          ${textField("contract_notes", "Contract Notes", row?.contract_notes || "")}
        </div>
      </div>
      ${modalFooter("Save Contract")}
    </form>
  `;
  return modalShell(row ? "Edit Contract" : "Add Contract Follow-up", "Contracts", body, "", false);
}

function renderImportModal() {
  const body = `
    <div class="admin-sales-modal-body">
      <label class="admin-sales-import-dropzone">
        ${icon("upload")}
        <strong>${state.importFileName ? esc(state.importFileName) : "Upload a prospect file"}</strong>
        <small>CSV, TSV, XLS, or XLSX. Expected columns: name, address, phone number, stage, and next steps.</small>
        <input type="file" accept=".csv,.tsv,.xls,.xlsx" data-admin-sales-import-file />
      </label>
      <div class="admin-sales-import-summary">
        <p class="admin-sales-message">${state.importPayloads.length ? `${number(state.importPayloads.length)} leads ready to import.` : "Choose a file to begin."}</p>
        ${state.importErrors.length ? `<p class="admin-sales-message error">${esc(state.importErrors.slice(0, 4).join(" "))}</p>` : ""}
        ${renderImportPreview()}
      </div>
    </div>
  `;
  const footer = `
    <footer class="admin-sales-modal-footer">
      <p class="admin-sales-message" data-admin-sales-modal-message></p>
      <div class="admin-sales-row-actions">
        <button class="admin-sales-secondary" type="button" data-admin-sales-close>Cancel</button>
        <button class="admin-sales-primary" type="button" data-admin-sales-run-import ${state.importPayloads.length ? "" : "disabled"}>${icon("upload")}Import Leads</button>
      </div>
    </footer>
  `;
  return modalShell("Import Leads", "Prospect Upload", body, footer, true);
}

function renderImportPreview() {
  if (!state.importPayloads.length) return "";
  return `
    <div class="admin-sales-import-preview">
      <table class="admin-sales-table">
        <thead>
          <tr><th>Name</th><th>Address</th><th>Phone</th><th>Stage</th><th>Next Steps</th></tr>
        </thead>
        <tbody>
          ${state.importPayloads.slice(0, 8).map((row) => `
            <tr>
              <td><strong>${esc(row.property_name)}</strong></td>
              <td>${esc(row.address || "")}</td>
              <td>${esc(row.contact_phone || "")}</td>
              <td>${esc(stageLabel(row.pipeline_stage))}</td>
              <td>${esc(row.next_step || "")}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function valuesFromForm(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function repById(id) {
  return state.reps.find((rep) => rep.id === id) || null;
}

function showModalMessage(form, message, tone = "") {
  const target = form?.querySelector("[data-admin-sales-modal-message]");
  if (!target) return;
  target.textContent = message || "";
  target.classList.toggle("error", tone === "error");
  target.classList.toggle("success", tone === "success");
}

async function saveLead(form) {
  if (state.saving) return;
  state.saving = true;
  showModalMessage(form, "Saving lead...");
  const values = valuesFromForm(form);
  const row = rowById(state.modal?.id);
  const owner = repById(values.sales_owner_id);
  const title = String(values.property_name || row?.property_name || "Untitled Prospect").trim();
  const payload = compactPayload({
    property_name: title,
    name: title,
    company_name: title,
    address: values.address || "",
    contact_phone: values.contact_phone || "",
    contact_name: values.contact_name || "",
    contact_email: values.contact_email || "",
    pipeline_stage: normalizeStage(values.pipeline_stage),
    sales_owner_id: owner?.id || null,
    sales_owner_name: owner ? owner.full_name || owner.email || "" : "",
    next_step: values.next_step || "",
    lead_notes: values.lead_notes || "",
    last_activity_at: new Date().toISOString()
  });
  try {
    const result = row
      ? await supabase.from(TABLES.leads).update(payload).eq("id", row.id)
      : await supabase.from(TABLES.leads).insert({ ...payload, created_by: state.user?.id || null });
    if (result.error) throw result.error;
    state.modal = null;
    await loadData(false);
  } catch (error) {
    showModalMessage(form, `Unable to save lead: ${error.message}`, "error");
  } finally {
    state.saving = false;
  }
}

async function saveWalkthrough(form) {
  if (state.saving) return;
  state.saving = true;
  showModalMessage(form, "Saving walkthrough...");
  const values = valuesFromForm(form);
  const leadId = values.lead_id;
  const row = rowById(leadId);
  const relatedId = form.dataset.relatedId && row?.walkthrough_record_id === form.dataset.relatedId ? form.dataset.relatedId : "";
  const start = combineDateTime(values.walkthrough_at_date, values.walkthrough_at_time, "10:00");
  const end = combineDateTime(values.walkthrough_at_date, values.walkthrough_end_time, "11:00");
  const assignee = repById(values.walkthrough_assigned_to_id);
  const payload = compactPayload({
    lead_id: leadId,
    walkthrough_at: start,
    walkthrough_end_at: end,
    walkthrough_type: "Property Walkthrough",
    walkthrough_location: values.walkthrough_location || row?.address || "",
    walkthrough_assigned_to_id: assignee?.id || null,
    walkthrough_assigned_to: assignee ? assignee.full_name || assignee.email || "" : "",
    walkthrough_status: normalize(values.walkthrough_status) || "scheduled",
    walkthrough_notes: values.walkthrough_notes || ""
  });
  try {
    if (!leadId || !start) throw new Error("Choose a lead and date before saving.");
    const result = relatedId
      ? await supabase.from(TABLES.walkthroughs).update(payload).eq("id", relatedId)
      : await supabase.from(TABLES.walkthroughs).insert({ ...payload, created_by: state.user?.id || null });
    if (result.error) throw result.error;
    await supabase.from(TABLES.leads)
      .update({
        pipeline_stage: "walkthrough",
        next_step: "Walkthrough scheduled",
        next_step_due_at: start,
        last_activity_at: new Date().toISOString()
      })
      .eq("id", leadId);
    state.modal = null;
    await loadData(false);
  } catch (error) {
    showModalMessage(form, `Unable to save walkthrough: ${error.message}`, "error");
  } finally {
    state.saving = false;
  }
}

async function saveQuote(form) {
  if (state.saving) return;
  state.saving = true;
  showModalMessage(form, "Saving quote...");
  const values = valuesFromForm(form);
  const leadId = values.lead_id;
  const row = rowById(leadId);
  const relatedId = form.dataset.relatedId && row?.quote_record_id === form.dataset.relatedId ? form.dataset.relatedId : "";
  const status = normalize(values.quote_status) || "draft";
  const payload = compactPayload({
    lead_id: leadId,
    quote_amount: Number(values.quote_amount || 0),
    quote_status: status,
    quote_sent_at: values.quote_sent_at ? new Date(values.quote_sent_at).toISOString() : null,
    quote_expires_at: values.quote_expires_at || null,
    quote_notes: values.quote_notes || ""
  });
  try {
    if (!leadId) throw new Error("Choose a lead before saving.");
    const result = relatedId
      ? await supabase.from(TABLES.quotes).update(payload).eq("id", relatedId)
      : await supabase.from(TABLES.quotes).insert({ ...payload, created_by: state.user?.id || null });
    if (result.error) throw result.error;
    await supabase.from(TABLES.leads)
      .update({
        pipeline_stage: status === "accepted" ? "contract_out" : "quote_sent",
        lead_value: Number(values.quote_amount || 0),
        last_activity_at: new Date().toISOString()
      })
      .eq("id", leadId);
    state.modal = null;
    await loadData(false);
  } catch (error) {
    showModalMessage(form, `Unable to save quote: ${error.message}`, "error");
  } finally {
    state.saving = false;
  }
}

async function saveContract(form) {
  if (state.saving) return;
  state.saving = true;
  showModalMessage(form, "Saving contract...");
  const values = valuesFromForm(form);
  const leadId = values.lead_id;
  const row = rowById(leadId);
  const relatedId = form.dataset.relatedId && row?.contract_record_id === form.dataset.relatedId ? form.dataset.relatedId : "";
  const status = normalize(values.contract_status) || "pending";
  const payload = compactPayload({
    lead_id: leadId,
    contract_status: status,
    contract_due_at: values.contract_due_at ? new Date(values.contract_due_at).toISOString() : null,
    contract_value: values.contract_value === "" ? null : Number(values.contract_value || 0),
    contract_notes: values.contract_notes || ""
  });
  try {
    if (!leadId) throw new Error("Choose a lead before saving.");
    const result = relatedId
      ? await supabase.from(TABLES.contracts).update(payload).eq("id", relatedId)
      : await supabase.from(TABLES.contracts).insert({ ...payload, created_by: state.user?.id || null });
    if (result.error) throw result.error;
    await supabase.from(TABLES.leads)
      .update({
        pipeline_stage: ["signed", "active"].includes(status) ? "active" : "contract_out",
        lead_value: values.contract_value === "" ? row?.lead_value || null : Number(values.contract_value || 0),
        last_activity_at: new Date().toISOString()
      })
      .eq("id", leadId);
    state.modal = null;
    await loadData(false);
  } catch (error) {
    showModalMessage(form, `Unable to save contract: ${error.message}`, "error");
  } finally {
    state.saving = false;
  }
}

async function saveAvailability(form) {
  if (state.saving) return;
  state.saving = true;
  const values = valuesFromForm(form);
  const startsAt = combineDateTime(values.availability_date, values.availability_start_time, "10:00");
  const endsAt = combineDateTime(values.availability_date, values.availability_end_time, "11:00");
  try {
    if (!startsAt || !endsAt) throw new Error("Choose a date, start time, and end time.");
    if (dateValue(endsAt) <= dateValue(startsAt)) throw new Error("End time must be after start time.");
    const { error } = await supabase.from(TABLES.availability).insert({
      starts_at: startsAt,
      ends_at: endsAt,
      label: values.availability_label || "Available walkthrough",
      status: "open",
      created_by: state.user?.id || null
    });
    if (error) throw error;
    await loadData(false);
  } catch (error) {
    state.message = `Unable to add availability: ${error.message}`;
    state.messageTone = "error";
    render();
  } finally {
    state.saving = false;
  }
}

async function updateLeadStage(id, stage) {
  const payload = {
    pipeline_stage: normalizeStage(stage),
    last_activity_at: new Date().toISOString()
  };
  const { error } = await supabase.from(TABLES.leads).update(payload).eq("id", id);
  if (error) throw error;
  await loadData(false);
}

async function updateQuoteStatus(id, status) {
  const row = rowById(id);
  if (!row) return;
  const payload = {
    lead_id: id,
    quote_status: normalize(status),
    quote_amount: Number(row.quote_amount || row.lead_value || 0),
    quote_sent_at: row.quote_sent_at || new Date().toISOString(),
    quote_expires_at: row.quote_expires_at || null,
    quote_notes: row.quote_notes || ""
  };
  const result = row.quote_record_id
    ? await supabase.from(TABLES.quotes).update(payload).eq("id", row.quote_record_id)
    : await supabase.from(TABLES.quotes).insert({ ...payload, created_by: state.user?.id || null });
  if (result.error) throw result.error;
  await supabase.from(TABLES.leads)
    .update({ pipeline_stage: normalize(status) === "accepted" ? "contract_out" : "quote_sent", last_activity_at: new Date().toISOString() })
    .eq("id", id);
  await loadData(false);
}

async function updateContractStatus(id, status) {
  const row = rowById(id);
  if (!row) return;
  const normalized = normalize(status);
  const payload = {
    lead_id: id,
    contract_status: normalized,
    contract_due_at: row.contract_due_at || null,
    contract_value: Number(row.contract_value || row.quote_amount || row.lead_value || 0),
    contract_notes: row.contract_notes || ""
  };
  const result = row.contract_record_id
    ? await supabase.from(TABLES.contracts).update(payload).eq("id", row.contract_record_id)
    : await supabase.from(TABLES.contracts).insert({ ...payload, created_by: state.user?.id || null });
  if (result.error) throw result.error;
  await supabase.from(TABLES.leads)
    .update({ pipeline_stage: ["signed", "active"].includes(normalized) ? "active" : "contract_out", last_activity_at: new Date().toISOString() })
    .eq("id", id);
  await loadData(false);
}

async function deleteSelectedLeads() {
  const ids = [...state.selectedLeadIds];
  if (!ids.length) return;
  const confirmed = window.confirm(`Delete ${ids.length} selected lead${ids.length === 1 ? "" : "s"}? Related sales walkthroughs, quotes, contracts, tasks, and activities are linked to these leads and will be removed with them.`);
  if (!confirmed) return;
  state.message = `Deleting ${ids.length} lead${ids.length === 1 ? "" : "s"}...`;
  state.messageTone = "";
  render();
  try {
    const { error } = await supabase.from(TABLES.leads).delete().in("id", ids);
    if (error) throw error;
    state.selectedLeadIds.clear();
    state.message = "Selected leads deleted.";
    state.messageTone = "success";
    await loadData(false);
  } catch (error) {
    state.message = `Unable to delete leads: ${error.message}`;
    state.messageTone = "error";
    render();
  }
}

async function updateAvailabilityStatus(id, status) {
  const { error } = await supabase.from(TABLES.availability).update({ status: normalize(status) || "open" }).eq("id", id);
  if (error) throw error;
  await loadData(false);
}

async function deleteAvailability(id) {
  const { error } = await supabase.from(TABLES.availability).delete().eq("id", id);
  if (error) {
    state.message = `Unable to remove availability: ${error.message}`;
    state.messageTone = "error";
    render();
    return;
  }
  await loadData(false);
}

function normalizeStage(value) {
  const normalized = normalize(value);
  return stageAliases[normalized] || (stageDefs.some(([stage]) => stage === normalized) ? normalized : "new_leads");
}

function normalizedHeader(value) {
  return normalize(value);
}

function getImportValue(row, field) {
  const aliases = (fieldAliases[field] || [field]).map(normalizedHeader);
  for (const alias of aliases) {
    if (row[alias] !== undefined && row[alias] !== null && String(row[alias]).trim() !== "") {
      return String(row[alias]).trim();
    }
  }
  return "";
}

function rowsToObjects(rows) {
  if (!rows.length) return [];
  const headers = rows[0].map(normalizedHeader);
  return rows.slice(1)
    .filter((row) => row.some((cell) => String(cell ?? "").trim() !== ""))
    .map((row) => {
      const object = {};
      headers.forEach((header, index) => {
        if (header) object[header] = row[index] ?? "";
      });
      return object;
    });
}

function parseDelimited(text, delimiter) {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && quoted && next === '"') {
      value += '"';
      index += 1;
      continue;
    }
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (char === delimiter && !quoted) {
      row.push(value);
      value = "";
      continue;
    }
    if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(value);
      rows.push(row);
      row = [];
      value = "";
      continue;
    }
    value += char;
  }
  if (value || row.length) {
    row.push(value);
    rows.push(row);
  }
  return rows;
}

async function loadXlsx() {
  if (window.XLSX) return window.XLSX;
  if (!xlsxPromise) {
    xlsxPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[src="${XLSX_URL}"]`);
      if (existing) {
        existing.addEventListener("load", () => resolve(window.XLSX), { once: true });
        existing.addEventListener("error", () => reject(new Error("Unable to load the Excel parser.")), { once: true });
        return;
      }
      const script = document.createElement("script");
      script.src = XLSX_URL;
      script.onload = () => resolve(window.XLSX);
      script.onerror = () => reject(new Error("Unable to load the Excel parser."));
      document.head.appendChild(script);
    });
  }
  return xlsxPromise;
}

async function readImportFile(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv") || name.endsWith(".tsv") || file.type.includes("csv") || file.type.includes("tab-separated")) {
    const text = await file.text();
    const delimiter = name.endsWith(".tsv") ? "\t" : ",";
    return rowsToObjects(parseDelimited(text, delimiter));
  }
  if (name.endsWith(".xls") || name.endsWith(".xlsx")) {
    const XLSX = await loadXlsx();
    const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
    const sheetName = workbook.SheetNames[0];
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, raw: false, defval: "" });
    return rowsToObjects(rows);
  }
  throw new Error("Use a CSV, TSV, XLS, or XLSX file.");
}

function buildImportPayloads(rows) {
  const payloads = [];
  const errors = [];
  rows.forEach((row, index) => {
    const propertyName = getImportValue(row, "property_name") || getImportValue(row, "name");
    const address = getImportValue(row, "address");
    const phone = getImportValue(row, "contact_phone");
    const stage = getImportValue(row, "pipeline_stage");
    const nextStep = getImportValue(row, "next_step");
    if (!propertyName && !address && !phone && !nextStep) return;
    if (!propertyName) {
      errors.push(`Row ${index + 2} is missing a name.`);
      return;
    }
    payloads.push(compactPayload({
      property_name: propertyName,
      name: propertyName,
      company_name: propertyName,
      address,
      contact_phone: phone,
      contact_name: getImportValue(row, "contact_name"),
      contact_email: getImportValue(row, "contact_email"),
      pipeline_stage: normalizeStage(stage),
      next_step: nextStep,
      lead_notes: getImportValue(row, "lead_notes"),
      sales_owner_name: getImportValue(row, "sales_owner_name"),
      created_by: state.user?.id || null,
      last_activity_at: new Date().toISOString()
    }));
  });
  return { payloads, errors };
}

async function handleImportFile(file) {
  if (!file) return;
  state.importFileName = file.name;
  state.importPayloads = [];
  state.importErrors = [];
  render();
  try {
    const rows = await readImportFile(file);
    const { payloads, errors } = buildImportPayloads(rows);
    state.importPayloads = payloads;
    state.importErrors = errors;
    render();
  } catch (error) {
    state.importErrors = [error.message];
    render();
  }
}

async function runImport(button) {
  if (!state.importPayloads.length || state.saving) return;
  state.saving = true;
  if (button) button.disabled = true;
  const batchSize = 100;
  try {
    for (let index = 0; index < state.importPayloads.length; index += batchSize) {
      const batch = state.importPayloads.slice(index, index + batchSize);
      const { error } = await supabase.from(TABLES.leads).insert(batch.map(compactPayload));
      if (error) throw error;
    }
    const count = state.importPayloads.length;
    state.importPayloads = [];
    state.importErrors = [];
    state.importFileName = "";
    state.modal = null;
    state.message = `Imported ${number(count)} lead${count === 1 ? "" : "s"}.`;
    state.messageTone = "success";
    await loadData(false);
  } catch (error) {
    state.importErrors = [error.message];
    render();
  } finally {
    state.saving = false;
  }
}

function moveCalendar(direction) {
  const amount = direction === "prev" ? -1 : 1;
  if (state.calendarMode === "month") {
    state.dateCursor = addMonths(state.dateCursor, amount);
  } else if (state.calendarMode === "week") {
    state.dateCursor = addDays(state.dateCursor, amount * 7);
  } else {
    state.dateCursor = addDays(state.dateCursor, amount);
  }
}

async function handleClick(event) {
  const target = event.target;
  const close = target.closest("[data-admin-sales-close]");
  if (close) {
    state.modal = null;
    state.importPayloads = [];
    state.importErrors = [];
    state.importFileName = "";
    render();
    return;
  }

  const open = target.closest("[data-admin-sales-open]");
  if (open) {
    const type = open.dataset.adminSalesOpen || "lead";
    const explicitId = open.hasAttribute("data-id") ? open.dataset.id || "" : "";
    const fallbackId = type === "lead" || type === "import" ? "" : state.selectedId || "";
    state.modal = { type, id: explicitId || fallbackId };
    render();
    return;
  }

  const refresh = target.closest("[data-admin-sales-refresh]");
  if (refresh) {
    await loadData(true);
    return;
  }

  const clear = target.closest("[data-admin-sales-clear-filters]");
  if (clear) {
    state.search = "";
    state.stageFilter = "all";
    state.statusFilter = "all";
    state.ownerFilter = "all";
    render();
    return;
  }

  const deleteSelected = target.closest("[data-admin-sales-delete-selected]");
  if (deleteSelected) {
    await deleteSelectedLeads();
    return;
  }

  const selectAll = target.closest("[data-admin-sales-select-all]");
  if (selectAll) {
    const rows = filteredRows();
    if (selectAll.checked) rows.forEach((row) => state.selectedLeadIds.add(row.id));
    else rows.forEach((row) => state.selectedLeadIds.delete(row.id));
    render();
    return;
  }

  const record = target.closest("[data-admin-sales-select-record]");
  if (record) {
    state.selectedId = record.dataset.adminSalesSelectRecord || "";
    render();
    return;
  }

  const stage = target.closest("[data-admin-sales-stage]");
  if (stage) {
    state.stageFilter = stage.dataset.adminSalesStage || "all";
    state.statusFilter = "all";
    render();
    return;
  }

  const nav = target.closest("[data-admin-sales-calendar-nav]");
  if (nav) {
    moveCalendar(nav.dataset.adminSalesCalendarNav);
    render();
    return;
  }

  const today = target.closest("[data-admin-sales-calendar-today]");
  if (today) {
    state.dateCursor = new Date();
    render();
    return;
  }

  const mode = target.closest("[data-admin-sales-calendar-mode]");
  if (mode) {
    state.calendarMode = mode.dataset.adminSalesCalendarMode || "week";
    render();
    return;
  }

  const updateStage = target.closest("[data-admin-sales-update-stage]");
  if (updateStage) {
    try {
      await updateLeadStage(updateStage.dataset.adminSalesUpdateStage, updateStage.dataset.stage);
    } catch (error) {
      state.message = `Unable to update stage: ${error.message}`;
      state.messageTone = "error";
      render();
    }
    return;
  }

  const updateQuote = target.closest("[data-admin-sales-update-quote]");
  if (updateQuote) {
    try {
      await updateQuoteStatus(updateQuote.dataset.adminSalesUpdateQuote, updateQuote.dataset.status);
    } catch (error) {
      state.message = `Unable to update quote: ${error.message}`;
      state.messageTone = "error";
      render();
    }
    return;
  }

  const updateContract = target.closest("[data-admin-sales-update-contract]");
  if (updateContract) {
    try {
      await updateContractStatus(updateContract.dataset.adminSalesUpdateContract, updateContract.dataset.status);
    } catch (error) {
      state.message = `Unable to update contract: ${error.message}`;
      state.messageTone = "error";
      render();
    }
    return;
  }

  const deleteAvailabilityButton = target.closest("[data-admin-sales-delete-availability]");
  if (deleteAvailabilityButton) {
    await deleteAvailability(deleteAvailabilityButton.dataset.adminSalesDeleteAvailability);
    return;
  }

  const runImportButton = target.closest("[data-admin-sales-run-import]");
  if (runImportButton) {
    await runImport(runImportButton);
  }
}

async function handleChange(event) {
  const target = event.target;
  if (target.matches("[data-admin-sales-search]")) {
    state.search = target.value || "";
    render();
    return;
  }
  if (target.matches("[data-admin-sales-filter]")) {
    const key = target.dataset.adminSalesFilter;
    if (key === "owner") state.ownerFilter = target.value || "all";
    if (key === "status") {
      if (state.page === "leads") {
        state.stageFilter = target.value || "all";
        state.statusFilter = "all";
      } else {
        state.statusFilter = target.value || "all";
      }
    }
    render();
    return;
  }
  if (target.matches("[data-admin-sales-select-lead]")) {
    const id = target.dataset.adminSalesSelectLead;
    if (target.checked) state.selectedLeadIds.add(id);
    else state.selectedLeadIds.delete(id);
    render();
    return;
  }
  if (target.matches("[data-admin-sales-inline-stage]")) {
    try {
      await updateLeadStage(target.dataset.adminSalesInlineStage, target.value);
    } catch (error) {
      state.message = `Unable to update stage: ${error.message}`;
      state.messageTone = "error";
      render();
    }
    return;
  }
  if (target.matches("[data-admin-sales-availability-status]")) {
    try {
      await updateAvailabilityStatus(target.dataset.adminSalesAvailabilityStatus, target.value);
    } catch (error) {
      state.message = `Unable to update availability: ${error.message}`;
      state.messageTone = "error";
      render();
    }
    return;
  }
  if (target.matches("[data-admin-sales-import-file]")) {
    await handleImportFile(target.files?.[0]);
  }
}

async function handleSubmit(event) {
  const form = event.target;
  if (form.matches("[data-admin-sales-lead-form]")) {
    event.preventDefault();
    await saveLead(form);
  }
  if (form.matches("[data-admin-sales-walkthrough-form]")) {
    event.preventDefault();
    await saveWalkthrough(form);
  }
  if (form.matches("[data-admin-sales-quote-form]")) {
    event.preventDefault();
    await saveQuote(form);
  }
  if (form.matches("[data-admin-sales-contract-form]")) {
    event.preventDefault();
    await saveContract(form);
  }
  if (form.matches("[data-admin-sales-availability-form]")) {
    event.preventDefault();
    await saveAvailability(form);
  }
}

function bindEvents() {
  if (!state.root || state.root.dataset.adminSalesBound === "true") return;
  state.root.dataset.adminSalesBound = "true";
  state.root.addEventListener("click", (event) => {
    void handleClick(event);
  });
  state.root.addEventListener("change", (event) => {
    void handleChange(event);
  });
  state.root.addEventListener("input", (event) => {
    if (event.target.matches("[data-admin-sales-search]")) {
      state.search = event.target.value || "";
      window.clearTimeout(searchRenderTimer);
      searchRenderTimer = window.setTimeout(() => {
        render();
        const input = state.root?.querySelector("[data-admin-sales-search]");
        if (input) {
          input.focus();
          input.setSelectionRange(input.value.length, input.value.length);
        }
      }, 140);
    }
  });
  state.root.addEventListener("submit", (event) => {
    void handleSubmit(event);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && state.modal) {
      state.modal = null;
      render();
    }
  });
}

function mountWhenReady(attempt = 0) {
  if (!ADMIN_SALES_PAGES.has(state.page)) return;
  const root = document.querySelector("#adminSuiteApp .suite-content");
  if (!root) {
    if (attempt < 40) window.setTimeout(() => mountWhenReady(attempt + 1), 50);
    return;
  }
  state.root = root;
  bindEvents();
  void loadData(true);
}

mountWhenReady();
