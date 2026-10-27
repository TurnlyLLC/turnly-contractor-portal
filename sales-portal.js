import {mountOnboarding} from './crm-onboarding.mjs?v=20261027-onboarding';
import {mountEarnings} from './crm-earnings.mjs?v=20261027-onboarding';
import {startMessageBadge,paintMessageBadge,refreshMessageBadge} from './crm-message-badge.mjs?v=20261021-desktop';
import {mountDemandMap} from "./demand-map.mjs?v=20261027-status-rings";
import {mountMessages} from './crm-messages.mjs?v=20261021-alerts';
import {mountBudget} from './crm-budget.mjs?v=20261020';
import { installCalling } from './crm-calling.mjs?v=20261027-onboarding';
import {GIFT_CARD_URL,RESIDENTIAL_URL,PRODUCT_FACTS,PLAYBOOK,SALES_SCRIPTS,SALES_OBJECTIONS} from './crm-sales-content.mjs?v=20261021-training';
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.0/+esm";
import {
  adminPreviewPortalOptions,
  adminPreviewPropertyOptions,
  adminPreviewSummary,
  adminPreviewTargetUrl,
  adminPreviewUsersForPortal,
  buildPreviewEffectiveUser,
  clearAdminPreviewContext,
  readAdminPreviewContext,
  resolvePreviewProfile,
  verifyAdminPreviewSession,
  writeAdminPreviewContext
} from "./admin-preview-context.js?v=20260908-sales-preview";
import {
  generateTurnlyQuotePdf,
  openGmailQuoteDraft,
  quoteSenderEmail
} from "./quote-proposal-tools.js?v=20260911-gmail-focus";

const SALES_TABLES = {
  leads: "sales_leads",
  walkthroughs: "sales_walkthroughs",
  quotes: "sales_quotes",
  contracts: "sales_contracts",
  tasks: "sales_tasks",
  activities: "sales_activities",
  availability: "sales_walkthrough_availability"
};
const PROFILES_TABLE = "profiles";
const XLSX_URL = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
const allowedRoles = new Set(["admin", "sales", "sales_team"]);

const pageConfig = {
  dashboard: {
    title: "Overview",
    subtitle: "Your team, your opportunities, and the next conversation that matters."
  },
  leads: {
    title: "Prospects",
    subtitle: "Qualify prospects, confirm pricing fit, and prepare walkthrough-ready candidates."
  },
  walkthroughs: {
    title: "Walkthroughs",
    subtitle: "Schedule walkthroughs for management to close qualified opportunities."
  },
  tasks: {
    title: "Follow-ups",
    subtitle: "Track outreach, pricing confirmation, reminders, and next sales actions."
  }
};

Object.assign(pageConfig,{communications:{title:'Calling & texting',subtitle:'Budgets, usage and outreach controls.'},pipeline:{title:"Deal pipeline",subtitle:"Move opportunities forward, one meaningful conversation at a time."},contacts:{title:"Contacts",subtitle:"The people and properties behind every relationship."},quotes:{title:"Proposals",subtitle:"Prepare, review, and follow up on your quotes."},contracts:{title:"Closing",subtitle:"Track management review, contracts, and won business."},team:{title:"Team",subtitle:"Ownership, workload, and results across your sales team."}});
pageConfig.onboarding={title:'Onboarding',subtitle:'A short introduction, your playbook, and your seller agreement.'};
pageConfig.earnings={title:'Earnings',subtitle:'First-purchase commissions, approvals, and payment records.'};
pageConfig.messages={title:'Messages',subtitle:'Stay connected with Turnly admin and your sales team.'};
pageConfig.map={title:'Realtor lead map',subtitle:'Explore outreach coverage and find your next market.'};
const navItems = [
 ['onboarding','Onboarding','crm-onboarding.html','file-check'],
 ['earnings','Earnings','crm-earnings.html','dashboard'],
 ['map','Lead map','crm-map.html','dashboard'],
 ['messages','Messages','crm-messages.html','users'],
 ['dashboard','Overview','sales.html','dashboard'],
 ['leads','Prospects','sales-leads.html','users'],
 ['pipeline','Deal pipeline','crm-pipeline.html','dashboard'],
 ['tasks','Follow-ups','sales-tasks.html','clipboard-check'],
 ['scripts','Scripts','crm-scripts.html','file-text'],
 ['communications','Calling & texting','crm-communications.html','phone'],
 ['sales','Sales dashboard','crm-sales.html','dashboard'],
 ['team','Team','crm-team.html','users'],
 ['guide','Team playbook','crm-guide.html','file-check']
];
Object.assign(pageConfig,{
 leads:{title:'Prospects',subtitle:'Realtors and residential clients. One owner, one clear next step.'},
 scripts:{title:'Scripts',subtitle:'Outreach scripts, objection responses and respectful next steps.'},
 guide:{title:'Team playbook',subtitle:'Sell Turnly gift cards and residential cleaning with confidence.'},
 tasks:{title:'Follow-ups',subtitle:'Calls, purchase-link follow-ups and next conversations.'}
});
const stageDefs = [
 {id:'new_leads',label:'New',tone:'green'},
 {id:'contacted',label:'Contacted',tone:'cyan'},
 {id:'interested',label:'Interested',tone:'yellow'},
 {id:'link_sent',label:'Purchase link sent',tone:'blue'},
 {id:'follow_up',label:'Follow-up',tone:'violet'},
 {id:'active',label:'Purchased / Booked',tone:'green'},
 {id:'lost',label:'Not interested',tone:'red'}
];

const focusStageDefs = [
  { id: "contacted", label: "Contacted", detail: "A real contact attempt happened." },
  { id: "pricing_confirmed", label: "Pricing Confirmed", detail: "the residential estimate has been discussed." },
  { id: "walkthrough_set", label: "Walkthrough Set", detail: "A walkthrough window is selected." },
  { id: "follow_up_needed", label: "Follow Up Needed", detail: "Keep this prospect in the work queue." },
  { id: "not_interested", label: "Not Interested", detail: "The prospect declined moving forward." },
  { id: "handled_by_corporate", label: "Handled by Corporate", detail: "Cleaning decisions are managed at corporate." }
];
const focusFollowUpStatuses = [
  ["open", "Needed"],
  ["in_progress", "In Progress"],
  ["completed", "Completed"]
];
const focusQuestionDefs = [
  { id: "decision_maker", label: "Are you talking to the decision maker?" },
  { id: "cleaning_crew", label: "Do they currently have a cleaning crew in place?" },
  { id: "wants_quote", label: "Would they like a quote from another cleaning crew?" },
  { id: "price_acceptable", label: "Is the quoted price of the residential estimate acceptable?" },
  { id: "wants_quality_walkthrough", label: "Would they like an in-person walkthrough demonstration of our quality control processes?" }
];
const SALES_FOCUS_PLACE_STORAGE_PREFIX = "turnlySalesFocusPlace:v1";
const FOCUS_STATE_PREFIX = "TURNLY_FOCUS_STATE:";
const FOCUS_STATE_VERSION = "20260911-yes-only-conditionals";
const walkthroughStatuses = ["scheduled", "confirmed", "rescheduled", "completed", "cancelled"];
const quoteStatuses = ["draft", "sent", "viewed", "accepted", "declined", "expired"];
const taskStatuses = ["open", "in_progress", "pending", "completed"];
const priorities = ["low", "medium", "high"];
const salesTaskTypes = ['Call realtor','Discuss closing gifts','Send requested purchase link','Follow up on gift cards','Verify completed purchase','Help with residential booking','No-answer follow-up'];

const services = [
  "Turnover Cleaning",
  "Recurring Home Cleaning",
  "Move-in Cleaning",
  "Move-out Cleaning",
  "Before / After Video",
  "Deep Cleaning"
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
 "prospect_type","gift_card_quantity","sales_confirmation_ref","do_not_contact",
  "business_segment",
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
  company_name: ["brokerage", "company", "company_name", "management_company", "owner_company"],
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
  ? createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {global:{fetch:crmFetch}})
  : null;

const app = document.getElementById("salesApp");
const retiredPages = new Set();
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
  walkthroughAvailability: [],
  reps: [],
  selectedId: null,
  search: "",
  ownerFilter: "all",
  prospectType:"all",cityFilter:"all",prospectPage:1,librarySearch:"",libraryCategory:"all",libraryKind:"scripts",
  stageFilter: "all",
  statusFilter: "all",
  calendarMode: "month",
  dateCursor: new Date(),
  modal: null,
  importPayloads: [],
  importErrors: [],
  importFileName: "",
  selectedLeadIds: new Set(),
  leadSort: { key: "last_activity", direction: "desc" },
  leadColumnWidths: { notes: savedLeadColumnWidth("notes") },
  leadFocusMode: false,
  message: "",
  messageTone: "",
  profileOpen: false,
  loading: true,
  adminPreview: null
};
let focusSavePromise = null;
let focusSaveQueuedOptions = null;
let quotePreviewUrl = "";
let quotePreviewBlob = null;
let quotePreviewFileName = "";
let leadColumnResize = null;
const LEAD_NOTES_FULL_WIDTH = 420;


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

const DISPLAY_TIME_ZONE = "America/New_York";
const displayTimeFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: DISPLAY_TIME_ZONE,
  calendar: "gregory",
  numberingSystem: "latn",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23"
});

function displayTimeParts(value) {
  const date = dateValue(value);
  if (!date) return null;
  return displayTimeFormatter.formatToParts(date).reduce((parts, part) => {
    if (part.type !== "literal") parts[part.type] = Number(part.value);
    return parts;
  }, {});
}

function easternWallTimeToIso(date, time) {
  const dateParts = String(date || "").split("-").map(Number);
  const timeParts = String(time || "").split(":").map(Number);
  if (dateParts.length !== 3 || timeParts.length < 2 || dateParts.some((part) => !Number.isFinite(part)) || timeParts.some((part) => !Number.isFinite(part))) return null;
  const [year, month, day] = dateParts;
  const [hour, minute] = timeParts;
  const wallMs = Date.UTC(year, month - 1, day, hour, minute);
  if (!Number.isFinite(wallMs)) return null;
  let utcMs = wallMs;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const parts = displayTimeParts(new Date(utcMs));
    if (!parts) return null;
    const representedWallMs = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
    utcMs += wallMs - representedWallMs;
  }
  const result = new Date(utcMs);
  return Number.isNaN(result.getTime()) ? null : result.toISOString();
}

function easternDateOffset(days = 0) {
  const now = displayTimeParts(new Date());
  if (!now) return "";
  const date = new Date(Date.UTC(now.year, now.month - 1, now.day + days, 12));
  const pad = (part) => String(part).padStart(2, "0");
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

function formatDate(value, options = {}) {
  const date = dateValue(value);
  if (!date) return options.empty || "Not set";
  return date.toLocaleDateString(undefined, {
    timeZone: DISPLAY_TIME_ZONE,
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
    timeZone: DISPLAY_TIME_ZONE,
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
  return date.toLocaleTimeString([], { timeZone: DISPLAY_TIME_ZONE, hour: "numeric", minute: "2-digit" });
}

function toDateInput(value) {
  const date = dateValue(value);
  if (!date) return "";
  const parts = displayTimeParts(date);
  const pad = (part) => String(part).padStart(2, "0");
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

function toTimeInput(value) {
  const date = dateValue(value);
  if (!date) return "";
  const parts = displayTimeParts(date);
  const pad = (part) => String(part).padStart(2, "0");
  return `${pad(parts.hour)}:${pad(parts.minute)}`;
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
  return easternWallTimeToIso(date, time || fallback);
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

function splitQualificationNotes(value) {
  const raw = String(value || "");
  let focusState = {};
  const visible = raw
    .split(/\r?\n/)
    .filter((line) => {
      if (!line.startsWith(FOCUS_STATE_PREFIX)) return true;
      try {
        focusState = JSON.parse(line.slice(FOCUS_STATE_PREFIX.length)) || {};
      } catch {
        focusState = {};
      }
      return false;
    })
    .join("\n")
    .trim();
  return { visible, focusState };
}

function qualificationNotesText(row) {
  return splitQualificationNotes(row?.qualification_notes || "").visible;
}

function mergeQualificationNotes(visibleText, focusState) {
  const cleanText = String(visibleText || "").trim();
  const hasFocusState = Boolean(focusState && Object.keys(focusState).length);
  const stateLine = hasFocusState ? `${FOCUS_STATE_PREFIX}${JSON.stringify(focusState)}` : "";
  return [cleanText, stateLine].filter(Boolean).join("\n");
}

function focusStateFor(row) {
  const parsed = splitQualificationNotes(row?.qualification_notes || "").focusState || {};
  const useSavedFocusState = parsed.version === FOCUS_STATE_VERSION;
  const stage = stageFor(row);
  const storedStages = useSavedFocusState ? parsed.stages || {} : {};
  const storedQuestions = useSavedFocusState ? parsed.questions || {} : {};
  const stages = {
    contacted: storedStages.contacted ?? stage !== "new_leads",
    pricing_confirmed: storedStages.pricing_confirmed ?? pricingFitConfirmed(row),
    walkthrough_set: storedStages.walkthrough_set ?? Boolean(walkthroughAt(row) || ["walkthrough", "contract_out", "active"].includes(stage)),
    follow_up_needed: storedStages.follow_up_needed ?? Boolean(row?.next_step || row?.task_due_at || ["in_progress", "pending"].includes(taskStatus(row))),
    not_interested: storedStages.not_interested ?? false,
    handled_by_corporate: storedStages.handled_by_corporate ?? false
  };
  const questions = {
    decision_maker: storedQuestions.decision_maker || "",
    cleaning_crew: storedQuestions.cleaning_crew || "",
    wants_quote: storedQuestions.wants_quote || "",
    price_acceptable: storedQuestions.price_acceptable || "",
    wants_quality_walkthrough: storedQuestions.wants_quality_walkthrough || ""
  };
  const followUpStatus = useSavedFocusState ? parsed.follow_up_status || taskStatus(row) : taskStatus(row);
  return {
    stages,
    questions,
    follow_up_status: focusFollowUpStatuses.some(([status]) => status === followUpStatus) ? followUpStatus : "open",
    walkthrough_window: useSavedFocusState ? parsed.walkthrough_window || "" : "",
    qualification_outcome: useSavedFocusState ? parsed.qualification_outcome || "" : "",
    qualification_detail: useSavedFocusState ? parsed.qualification_detail || "" : "",
    current_cleaning_quote_price: useSavedFocusState ? parsed.current_cleaning_quote_price || "" : ""
  };
}

function yesNoFromDecisionMaker(value) {
  const normalized = normalize(value);
  if (normalized === "confirmed" || normalized === "yes") return "yes";
  if (normalized === "not_confirmed" || normalized === "no") return "no";
  return "";
}

function yesNoFromText(value) {
  const normalized = normalize(value);
  if (["yes", "true", "confirmed"].includes(normalized)) return "yes";
  if (["no", "false", "not_confirmed"].includes(normalized)) return "no";
  return "";
}

function yesNoFromPriceFit(value) {
  const normalized = normalize(value);
  if (!normalized) return "";
  if (normalized.includes("not") || normalized.includes("no") || normalized.includes("declined")) return "no";
  if (normalized.includes("confirmed") || normalized.includes("acceptable") || normalized.includes("accepted")) return "yes";
  return "";
}

function stageFor(row) {
  const rawStage = normalize(row?.pipeline_stage || "new_leads");
  const stage=({quote_sent:"interested",walkthrough:"follow_up",contract_out:"follow_up"})[rawStage]||rawStage;
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

function salesNotesFor(row) {
  return String(row?.lead_notes || qualificationNotesText(row) || row?.default_scope || "").trim();
}

function leadSortValue(row, key) {
  if (key === "name") return recordTitle(row);
  if (key === "address") return recordAddress(row);
  if (key === "phone") return row?.contact_phone || "";
  if (key === "stage") return stageLabel(stageFor(row));
  if (key === "next_step") return row?.next_step || "";
  if (key === "notes") return salesNotesFor(row);
  if (key === "last_activity") return row?.last_activity_at || row?.updated_at || row?.created_at || "";
  return "";
}

function sortedLeadRows(rows) {
  const { key, direction } = state.leadSort || {};
  const multiplier = direction === "desc" ? -1 : 1;
  return rows.slice().sort((a, b) => {
    const aValue = leadSortValue(a, key);
    const bValue = leadSortValue(b, key);
    const aDate = key === "last_activity" ? sortableTime(aValue) : 0;
    const bDate = key === "last_activity" ? sortableTime(bValue) : 0;
    let comparison = key === "last_activity"
      ? aDate - bDate
      : String(aValue).localeCompare(String(bValue), undefined, { numeric: true, sensitivity: "base" });
    if (!comparison) comparison = recordTitle(a).localeCompare(recordTitle(b), undefined, { sensitivity: "base" });
    return comparison * multiplier;
  });
}

function leadColumnWidth(key) {
  const value = Number(state.leadColumnWidths?.[key]);
  return Math.min(900, Math.max(220, Number.isFinite(value) ? value : 260));
}

function applyLeadColumnWidth(key, width, table = document.querySelector(".sales-leads-table")) {
  if (!table) return;
  const widthValue = `${width}px`;
  table.querySelectorAll(`[data-lead-column="${key}"], [data-lead-column-cell="${key}"]`).forEach((cell) => {
    cell.style.width = widthValue;
    cell.style.minWidth = widthValue;
  });
  if (key === "notes") {
    table.querySelectorAll(".sales-inline-notes").forEach((notes) => {
      notes.classList.toggle("is-wide", width >= LEAD_NOTES_FULL_WIDTH);
    });
  }
}

function resizeLeadColumn(key, width) {
  const nextWidth = Math.min(900, Math.max(220, Math.round(width)));
  state.leadColumnWidths[key] = nextWidth;
  applyLeadColumnWidth(key, nextWidth, leadColumnResize?.table);
  try {
    window.localStorage.setItem(`turnly.sales.lead-column.${key}`, String(nextWidth));
  } catch {
    // Storage can be unavailable in private or restricted browser contexts.
  }
}

function savedLeadColumnWidth(key, fallback = 260) {
  try {
    const saved = Number(window.localStorage.getItem(`turnly.sales.lead-column.${key}`));
    return Number.isFinite(saved) ? saved : fallback;
  } catch {
    return fallback;
  }
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
  return row?.follow_up_due_at || row?.task_due_at || row?.next_step_due_at;
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

function isSalesAdmin() {
  return normalize(state.profile?.role) === "admin";
}

function salesFocusPlaceStorageKey() {
  return `${SALES_FOCUS_PLACE_STORAGE_PREFIX}:${state.user?.id || "browser"}`;
}

function readSalesFocusPlace() {
  try {
    const raw = window.localStorage?.getItem(salesFocusPlaceStorageKey());
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeSalesFocusPlace({ leadId = state.selectedId, leadFocusMode = state.leadFocusMode } = {}) {
  if (!leadId) return;
  try {
    window.localStorage?.setItem(salesFocusPlaceStorageKey(), JSON.stringify({
      leadId,
      leadFocusMode: Boolean(leadFocusMode),
      updatedAt: new Date().toISOString()
    }));
  } catch {
    // Restoring focus position is helpful, not required for the sales workflow.
  }
}

function restoreSalesFocusPlace() {
  const saved = readSalesFocusPlace();
  if (!saved.leadId) return false;
  state.selectedId = saved.leadId;
  state.leadFocusMode = Boolean(saved.leadFocusMode);
  return true;
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
  if (id && !state.leads.some(row => row.id === id && row.business_segment === 'residential')) {
    throw new Error('This lead is not in the residential workspace. Refresh and try again.');
  }
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
        .eq("business_segment", "residential")
        .select("*")
        .maybeSingle();
      if (result.error) throw result.error;
      savedLead = result.data;
      if (!savedLead) throw new Error("Lead is no longer available in this workspace.");
    } else {
      savedLead = state.leads.find((row) => row.id === leadId) || null;
    }
  } else {
    if (!isSalesAdmin()) {
      throw new Error("Only admins can create new sales leads.");
    }
    const result = await supabase
      .from(SALES_TABLES.leads)
      .insert([{ ...leadPayload, business_segment: "residential", created_by: state.user?.id || null }])
      .select("*")
      .single();
    if (result.error) throw result.error;
    savedLead = result.data;
    leadId = savedLead.id;
  }

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

  let effectiveProfile = profile || null;
  const previewSession = await verifyAdminPreviewSession(supabase, data.user);
  state.adminPreview = previewSession?.preview?.portal === "sales" ? previewSession.preview : null;
  if (previewSession?.preview?.portal === "sales") {
    const previewProfile = await resolvePreviewProfile(supabase, previewSession.preview, "sales");
    if (previewProfile) {
      effectiveProfile = {
        ...previewProfile,
        role: normalize(previewProfile.role) === "sales_team" ? "sales_team" : "sales"
      };
      state.user = buildPreviewEffectiveUser(effectiveProfile, data.user, effectiveProfile.role);
    }
  }

  const role = normalize(effectiveProfile?.role);
  if (!allowedRoles.has(role) || ["inactive", "disabled", "suspended", "rejected"].includes(normalize(effectiveProfile?.status))) {
    window.location.href = "sales-login.html";
    return false;
  }

  const {data:crmAccess,error:crmError}=await supabase.rpc('crm_access_state');
  if(crmError||!crmAccess?.active||!crmAccess.session_valid){window.location.href='sales-login.html';return false;}
  if(crmAccess.must_change_password){window.location.href='crm-password.html';return false;}
  state.profile = effectiveProfile || { role };
  if(role!=='admin'&&!state.adminPreview&&!['onboarding','earnings','messages','guide'].includes(state.page)){
   const {data:session}=await supabase.auth.getSession();
   const response=await crmFetch('/api/crm-onboarding',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+session.session.access_token},body:JSON.stringify({action:'status'})});
   if(!response.ok)throw Error('Unable to verify onboarding. Please retry.');
   const onboarding=await response.json();if(!onboarding.ready){window.location.href='crm-onboarding.html';return false;}
  }

  if (role !== "admin") state.ownerFilter = "mine";
  else {const owner=new URLSearchParams(window.location.search||'').get('owner');if(owner)state.ownerFilter=owner;}
  return true;
}

async function loadWalkthroughAvailability() {
  try {
    const { data, error } = await supabase
      .from(SALES_TABLES.availability)
      .select("*")
      .gte("starts_at", new Date().toISOString())
      .order("starts_at", { ascending: true })
      .limit(200);
    if (error) throw error;
    return data || [];
  } catch (error) {
    console.warn("Walkthrough availability unavailable, using default windows.", error);
    return [];
  }
}

function crmFetch(url,options={}) {
 const timeout=AbortSignal.timeout(20000);
 return fetch(url,{...options,signal:options.signal?AbortSignal.any([options.signal,timeout]):timeout});
}
async function withCrmTimeout(promise,milliseconds=30000) {
 let timer;
 try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Loading took too long. Please retry.')),milliseconds);})]);}
 finally{clearTimeout(timer);}
}
async function loadSalesCollection(tableName,compact=false) {
  const rows=[];
  for(let offset=0;;offset+=500){
    const isLead = tableName === SALES_TABLES.leads;
    const result = await supabase.from(tableName)
      .select(isLead ? (compact?'id,business_segment,sales_owner_id,pipeline_stage,do_not_contact,sales_region,sales_city,prospect_type':'*') : '*,sales_leads!inner(business_segment)')
      .eq(isLead ? 'business_segment' : 'sales_leads.business_segment', 'residential')
      .order('id',{ascending:true}).range(offset,offset+499);
    if(result.error)throw result.error;
    rows.push(...(result.data||[]));
    if((result.data||[]).length<500)return {data:rows};
  }
}
async function loadRows() {
 const team=state.page==='team';
 const [leads,tasks,activities]=await Promise.all([loadSalesCollection(SALES_TABLES.leads,team),team?{data:[]}:loadSalesCollection(SALES_TABLES.tasks),team?{data:[]}:loadSalesCollection(SALES_TABLES.activities)]);
 return {leads:leads.data||[],tasks:tasks.data||[],activities:activities.data||[]};
}
async function loadReps() {
 const result=await crmTeamRequest('list');return result.members||[];
}
async function refreshData(showLoading = true,accessChecked=false) {
  if(["scripts","guide","communications","messages","map","onboarding","earnings"].includes(state.page)){state.loading=false;render();return;}
  if(showLoading){state.loading=true;state.loadFailed=false;state.message='';render();}
  try {
    if(!accessChecked&&!await withCrmTimeout(requireSalesAccess())){state.rows=[];state.leads=[];return;}
    const [collections,reps,salesContext]=await withCrmTimeout(Promise.all([loadRows(),loadReps(),crmSalesRequest('context')]));
    state.salesContext=salesContext;
    Object.assign(state,collections,{reps,walkthroughs:[],quotes:[],contracts:[],walkthroughAvailability:[]});
    composeSalesRows();
    const ids=new Set(state.rows.map(row=>row.id));state.selectedLeadIds=new Set([...state.selectedLeadIds].filter(id=>ids.has(id)));
    state.loading=false;state.loadFailed=false;state.message='';render();
  } catch(error) {
    state.loading=false;state.loadFailed=true;state.message='';
    state.loadError=/timeout|abort|took too long/i.test(error.message)?'The connection took too long. Your data is safe. Try loading again.':`We could not load your workspace. ${error.message}`;
    render();
  }
}
function renderLoadFailure(){return `<article class="sales-panel crm-call-panel"><h2>Your workspace could not load</h2><p role="alert">${esc(state.loadError)}</p><button class="sales-primary-button" data-retry-workspace>Retry loading</button></article>`;}

function pageTitle() {
  return pageConfig[state.page] || pageConfig.dashboard;
}

function render() {
  if (!app) return;
  const focusId=document.activeElement?.id,caret=document.activeElement?.selectionStart;
  app.innerHTML = `
    <main class="sales-app">
      ${renderSidebar()}
      <section class="sales-main">
        ${renderTopbar()}
        <section class="sales-page-body">
          ${state.message ? `<p class="sales-message ${esc(state.messageTone)}">${esc(state.message)}</p>` : ""}
          ${state.loading ? renderLoading() : state.loadFailed ? renderLoadFailure() : renderPage()}
        </section>
      </section>
      ${renderModal()}
    </main>
  `;
  const mapRoot=document.getElementById('crmLeadMap');
  if(mapRoot)void mountDemandMap(mapRoot,{dataset:'sales',request:async values=>{const {data}=await supabase.auth.getSession();if(!data?.session)throw Error('Sign in again.');const r=await crmFetch('/api/admin-map',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+data.session.access_token},body:JSON.stringify(values)});const result=await r.json();if(!r.ok)throw Error(result.error||'Unable to load map.');return result;}});
  const messagesRoot=document.getElementById('crmMessages');
  if(messagesRoot)void mountMessages(messagesRoot,async values=>{const result=await crmMessageRequest(values);if(['read','reply','create'].includes(values.action))void refreshMessageBadge();return result;});
  paintMessageBadge();
  const onboardingRequest=async(kind,values)=>{const {data}=await supabase.auth.getSession();if(!data?.session)throw Error('Sign in again.');const response=await fetch('/api/crm-'+kind,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+data.session.access_token},body:JSON.stringify(values)});const result=await response.json();if(!response.ok)throw Error(result.error||'Unable to save.');return result;};
  const onboardingRoot=document.getElementById('crmOnboarding');if(onboardingRoot)void mountOnboarding(onboardingRoot,onboardingRequest);
  const earningsRoot=document.getElementById('crmEarnings');if(earningsRoot)void mountEarnings(earningsRoot,values=>onboardingRequest('earnings',values));
  const budgetRoot=document.getElementById('communicationBudget');
  if(budgetRoot)void mountBudget(budgetRoot,async values=>{const {data}=await supabase.auth.getSession();if(!data?.session)throw Error('Sign in again.');const response=await fetch('/api/communication-budget',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+data.session.access_token},body:JSON.stringify(values)});const result=await response.json();if(!response.ok)throw Error(result.error||'Unable to load budgets.');return result;});
  if(['salesGlobalSearch','salesPageSearch','crmLibrarySearch','crmTeamSearch'].includes(focusId)){const input=document.getElementById(focusId);input?.focus();if(caret!=null)input?.setSelectionRange(caret,caret);}

}

function renderSidebar() {
  return `
    <aside class="sales-sidebar">
      <a class="sales-brand" href="sales.html" aria-label="Turnly sales dashboard">
        <span class="sales-brand-mark">T</span>
        <span>
          <strong>Turnly Residential</strong>
          <small>RESIDENTIAL WORKSPACE</small>
        </span>
      </a>
      <p class="sales-side-kicker">Workspace</p>
      <nav class="sales-nav" aria-label="Sales navigation">
        ${navItems.filter(([key])=>!['sales','communications','map','team'].includes(key)||isSalesAdmin()).map(([key, label, href, iconName]) => `
          <a class="sales-nav-link ${state.page === key ? "active" : ""}" href="${href}">
            ${icon(iconName)}<span>${label}</span>${key==='messages'?'<span data-message-unread class="crm-message-unread" role="status" hidden></span>':''}
          </a>
        `).join("")}
      </nav>
      <div class="sales-sidebar-footer"><button type="button" class="crm-message-sound" data-message-desktop aria-pressed="false">Enable desktop alerts</button><button type="button" class="crm-message-sound" data-message-sound aria-pressed="true">Message sound: on</button>
        <div class="crm-workspace-note"><span class="crm-live-dot"></span> Team workspace</div>
      </div>
    </aside>
  `;
}

function renderSalesPreviewSelect(label, field, options, selectedValue) {
  return `
    <label class="sales-preview-field">
      <span>${esc(label)}</span>
      <select data-sales-preview-field="${esc(field)}">
        ${options.map((option) => `<option value="${esc(option.value)}" ${option.value === selectedValue ? "selected" : ""}>${esc(option.label)}</option>`).join("")}
      </select>
    </label>
  `;
}

function renderSalesPreviewSwitcher() {
  if (!state.adminPreview) return "";
  const preview = readAdminPreviewContext();
  const userOptions = adminPreviewUsersForPortal(preview.portal);
  return `
    <section class="sales-preview-switcher" aria-label="Admin portal preview selector">
      <div class="sales-preview-summary">
        <strong>Portal Preview</strong>
        <small>${esc(adminPreviewSummary(preview))}</small>
      </div>
      <div class="sales-preview-controls">
        ${renderSalesPreviewSelect("View", "portal", adminPreviewPortalOptions, preview.portal)}
        ${renderSalesPreviewSelect("Property / Contract", "property", adminPreviewPropertyOptions, preview.property)}
        ${renderSalesPreviewSelect("User", "user", userOptions, preview.user)}
      </div>
      <div class="sales-preview-actions">
        <button class="sales-primary-button" type="button" data-sales-preview-open>${icon("chevron")}Open View</button>
        <button class="sales-secondary-button" type="button" data-sales-preview-clear>Back To Admin</button>
      </div>
    </section>
  `;
}

function updateSalesPreviewFromControls() {
  const current = readAdminPreviewContext();
  const previousPortal = current.portal;
  document.querySelectorAll("[data-sales-preview-field]").forEach((field) => {
    current[field.dataset.salesPreviewField] = field.value;
  });
  if (current.portal !== previousPortal) {
    const firstUser = adminPreviewUsersForPortal(current.portal)[0];
    current.user = firstUser?.value || "";
    current.userLabel = firstUser?.label || "";
  } else {
    const selectedUser = adminPreviewUsersForPortal(current.portal).find((option) => option.value === current.user);
    if (selectedUser) current.userLabel = selectedUser.label;
  }
  return writeAdminPreviewContext(current);
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
        ${renderSalesPreviewSwitcher()}
        <label class="sales-search" aria-label="Search sales records">
          ${icon("search")}
          <input id="salesGlobalSearch" type="search" value="${esc(state.search)}" placeholder="Search leads, clients, properties..." />
        </label>
        <button class="sales-date-pill" type="button" data-calendar-today>
          ${icon("calendar")}
          <span>${esc(formatDate(startOfWeek(), { year: "numeric" }))} - ${esc(formatDate(endOfWeek(), { year: "numeric" }))}</span>
        </button>
        <a class="sales-icon-button" href="sales.html#notifications" aria-label="Open notifications">
          ${icon("bell")}
          <span class="sales-badge">${number(state.salesContext?.notifications?.length||0)}</span>
        </a>
        ${isSalesAdmin() ? `
          <button class="sales-primary-button sales-upload-prospects-button" type="button" data-open-import>
            ${icon("upload")}<span>Upload Prospects</span>
          </button>
        ` : ""}
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
            <a href="crm-guide.html">${icon("file-text")}CRM playbook</a>
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
        <strong>Loading your workspace</strong>
        <p>Getting your latest contacts, opportunities, and follow-ups.</p>
      </div>
    </section>
  `;
}

function renderPage() {
 if(state.page==='map')return isSalesAdmin()?'<div id="crmLeadMap"></div>':emptyState('Administrator access required','Open Overview for your results.');
 if(state.page==='onboarding')return '<div id="crmOnboarding"></div>';
 if(state.page==='earnings')return '<div id="crmEarnings"></div>';
 if(state.page==='messages')return '<div id="crmMessages"></div>';
 if(state.page==='communications')return isSalesAdmin()?'<div id="communicationBudget"></div>':emptyState('Administrator access required','Open Overview for your results.');
 if(state.page==='scripts')return renderScriptsPage();
 if(state.page==='guide')return renderPlaybookPage();
 if(state.page==='pipeline')return renderCrmPipeline();
 if(state.page==='sales')return isSalesAdmin()?renderSalesDashboard():emptyState('Administrator access required','Open Overview for your sales results.');
 if(state.page==='team')return isSalesAdmin()?renderCrmTeam():emptyState('Administrator access required','Open Overview for your own workspace.');
 if(state.page==='leads')return renderLeadsPage();
 if(state.page==='tasks')return renderTasksPage();
 return renderCrmOverview();
}

function baseFilteredRows(rows = state.rows) {
  const search = state.search.trim().toLowerCase();
  return rows.filter((row) => {
    if(state.prospectType!=="all" && (row.prospect_type||"residential")!==state.prospectType)return false;
    if(state.cityFilter!=="all" && row.sales_city!==state.cityFilter)return false;
    if (state.ownerFilter !== "all") {
      if (state.ownerFilter === "unassigned" && row.sales_owner_id) return false;
      if (state.ownerFilter === "mine" && row.sales_owner_id !== state.user?.id) return false;
      if (!["unassigned", "mine"].includes(state.ownerFilter) && row.sales_owner_id !== state.ownerFilter) return false;
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
      row.contact_email,
      row.contact_phone,
      JSON.stringify(row.source_contact||{}),
      row.lead_source,
      row.next_step,
      row.default_scope,
      row.lead_notes,
      row.walkthrough_notes,
      row.quote_notes
    ].some((value) => String(value || "").toLowerCase().includes(search));
  });
}

function leadFocusRows() {
  return baseFilteredRows().filter(row=>!row.do_not_contact && !['lost','follow_up','active'].includes(stageFor(row)));
}

function statusForCurrentPage(row) {
  if (state.page === "walkthroughs") return normalize(row.walkthrough_status || "scheduled");
  if (state.page === "quotes") return quoteStatus(row);
  if (state.page === "tasks") return taskStatus(row);
  return stageFor(row);
}

function ownerName(row) {
  if(!row.sales_owner_id)return "Unassigned";
  return row.sales_owner_name || state.reps.find((rep) => rep.id === row.sales_owner_id)?.full_name || "Unassigned";
}

function selectRecord(rows) {
  if (!rows.length) {
    state.selectedId = null;
    return null;
  }
  if (!rows.some((row) => row.id === state.selectedId)) state.selectedId = rows[0].id;
  if (state.leadFocusMode) writeSalesFocusPlace({ leadId: state.selectedId, leadFocusMode: true });
  return rows.find((row) => row.id === state.selectedId) || rows[0];
}

function selectLeadFocusRecord(preferredId = "") {
  const rows = leadFocusRows();
  if (!rows.length) {
    state.selectedId = null;
    return null;
  }
  const preferred = preferredId && rows.find((row) => row.id === preferredId);
  const current = state.selectedId && rows.find((row) => row.id === state.selectedId);
  const row = preferred || current || rows[0];
  state.selectedId = row.id;
  return row;
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
      ${metricCard("Pricing Confirmed", number(pricingConfirmedCount), "Estimate accepted", "check", "yellow")}
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
          ${isSalesAdmin() ? `<button class="sales-secondary-button" type="button" data-open-import>${icon("upload")}Import</button>` : ""}
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
    { id: "quote_sent", label: "Pricing Confirmed", detail: "the residential estimate accepted", tone: "yellow" },
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
    { label: "the residential estimate confirmed", value: number(pricingFit), tone: "yellow" },
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

  if (!rows.length) {
    return emptyState(
      "No open prospects",
      isSalesAdmin() ? "Upload a prospect list or create a new lead to start the queue." : "No prospects are ready for your queue yet."
    );
  }

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
  const ownerOptions = `<option value="all">All operators</option><option value="mine" ${state.ownerFilter === "mine" ? "selected" : ""}>My leads</option><option value="unassigned" ${state.ownerFilter === "unassigned" ? "selected" : ""}>Unassigned</option>${state.reps.map((rep) => `<option value="${rep.id}" ${state.ownerFilter === rep.id ? "selected" : ""}>${esc(rep.full_name || rep.email || "Sales user")}</option>`).join("")}`;
  const statusOptions = options.statuses
    ? `<option value="all">All Statuses</option>${options.statuses.map((status) => `<option value="${status}" ${state.statusFilter === status ? "selected" : ""}>${esc(titleCase(status))}</option>`).join("")}`
    : "";

  return `
    <div class="sales-filter-bar">
      <label class="sales-search">
        ${icon("search")}
        <input id="salesPageSearch" aria-label="Search records" type="search" value="${esc(state.search)}" placeholder="${esc(options.placeholder || "Search records...")}" />
      </label>
      <select class="sales-filter" aria-label="Filter by owner" data-filter-owner>${ownerOptions}</select>
      ${state.page==='pipeline'?'':`<select class="sales-filter" aria-label="Filter by stage" data-filter-stage>${stageOptions}</select>`}
      ${options.statuses ? `<select class="sales-filter" data-filter-status>${statusOptions}</select>` : `<span></span>`}
      ${isSalesAdmin() ? `<button class="sales-primary-button" type="button" data-open-lead>${icon("plus")}New Prospect</button>` : ""}
    </div>
  `;
}

function renderLeadFilters() {
  return `
    <div class="sales-lead-filter-row">
      <label class="sales-search">
        ${icon("search")}
        <input id="salesPageSearch" aria-label="Search records" type="search" value="${esc(state.search)}" placeholder="Search prospects..." />
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
 const rows=baseFilteredRows(),focus=leadFocusRows();
 if(state.leadFocusMode){const selected=recordById(state.selectedId);return renderLeadFocusMode(selected&&(selected.do_not_contact||['lost','follow_up','active'].includes(stageFor(selected)))?[selected]:focus);}
 const page=pagedProspects(rows),admin=isSalesAdmin();
 return `<div class="crm-welcome"><div><p class="crm-eyebrow">REALTORS & RESIDENTIAL CLIENTS</p><h2>Your next conversation starts here.</h2><p>Call, understand the opportunity, and offer a useful next step.</p></div><button class="sales-primary-button" data-enter-lead-focus ${focus.length?'':'disabled'}>Start calling</button></div>
 <article class="sales-panel"><div class="sales-panel-header"><div><h2>Prospects</h2><p>${number(rows.length)} matches · realtor and residential contacts in one list</p></div>${admin?'<div class="sales-row-actions"><button class="sales-secondary-button" data-open-import>Import prospects</button><button class="sales-primary-button" data-open-lead>Add prospect</button></div>':''}</div>
 ${renderFilters({placeholder:'Search name, brokerage, email, phone or notes...'})}${renderProspectFilters()}
 ${admin?`<div class="sales-bulk-toolbar"><label><input type="checkbox" data-lead-select-all ${page.rows.length&&page.rows.every(r=>state.selectedLeadIds.has(r.id))?'checked':''}> Select this page</label><strong>${state.selectedLeadIds.size} selected across pages</strong><button class="sales-secondary-button" data-select-batch>Select first ${Math.min(rows.length,2000)} matches</button><button class="sales-secondary-button" data-clear-selection>Clear selection</button><button class="sales-primary-button" data-assign-selected ${state.selectedLeadIds.size?'':'disabled'}>Assign / split leads</button></div>`:''}
 ${renderLeadTable(page.rows)}${renderProspectPager(page)}</article>`;
}

function renderLeadTable(rows) {
 if(!rows.length)return emptyState('No prospects match this view','Try another operator, city, prospect type or search.');
 return `<div class="sales-table-wrap"><table class="sales-table"><thead><tr>${isSalesAdmin()?'<th>Select</th>':''}<th>Prospect</th><th>Contact</th><th>Operator</th><th>Stage</th>${state.page==='tasks'?'<th>Follow-up age / first reminder</th>':''}<th>Open</th></tr></thead><tbody>${rows.map(row=>`<tr>
 ${isSalesAdmin()?`<td><input type="checkbox" data-lead-select="${esc(row.id)}" aria-label="Select ${esc(recordTitle(row))}" ${state.selectedLeadIds.has(row.id)?'checked':''}></td>`:''}
 <td><strong>${esc(recordTitle(row))}</strong><small>${esc(row.company_name||prospectTypeLabel(row.prospect_type))}</small><small>${esc([row.sales_city,row.sales_state].filter(Boolean).join(', '))}</small>${row.do_not_contact?'<span class="sales-status-pill lost">Do not contact</span>':''}</td>
 <td>${contactActions(row)}<small>${row.referral_agent_id?'Imported realtor · all contact details inside':''}</small></td>
 <td>${esc(ownerName(row))}${isSalesAdmin()?`<button class="sales-link-action" data-assign-lead="${esc(row.id)}">Assign</button>`:''}</td>
 <td><select class="sales-filter" data-inline-stage="${esc(row.id)}" aria-label="Stage for ${esc(recordTitle(row))}">${stageDefs.map(st=>`<option value="${st.id}" ${stageFor(row)===st.id?'selected':''}>${esc(st.label)}</option>`).join('')}</select></td>
 ${state.page==='tasks'?`<td><strong>${followUpAge(row)===null?'Date unavailable':followUpAge(row)+' days'}</strong><small>Entered: ${esc(formatDateTime(row.follow_up_started_at,{empty:'Unknown'}))}</small><small>First reminder: ${esc(formatDateTime(taskDue(row),{empty:'Not scheduled'}))}</small></td>`:''}
 <td><button class="sales-primary-button" data-work-prospect="${esc(row.id)}">Work prospect</button><button class="sales-link-action" data-open-lead="${esc(row.id)}">Edit details</button></td></tr>`).join('')}</tbody></table></div>`;
}

function renderFocusStageChecklist(row) {
  const focusState = focusStateFor(row);
  return `
    <section class="sales-focus-info-box sales-focus-stage-box">
      <span>Stage Checklist</span>
      <div class="sales-focus-check-grid">
        ${focusStageDefs.map((stage) => `
          <label class="sales-focus-check-card">
            <input type="checkbox" name="focus_stage" value="${esc(stage.id)}" ${focusState.stages[stage.id] ? "checked" : ""} />
            <span class="sales-focus-checkmark">${icon("check")}</span>
            <strong>${esc(stage.label)}</strong>
            <small>${esc(stage.detail)}</small>
          </label>
        `).join("")}
      </div>
      <label class="sales-field sales-follow-up-status ${focusState.stages.follow_up_needed ? "" : "is-hidden"}" data-follow-up-status-wrap>
        Follow-up Status
        <select name="focus_follow_up_status">
          ${focusFollowUpStatuses.map(([value, label]) => `<option value="${esc(value)}" ${focusState.follow_up_status === value ? "selected" : ""}>${esc(label)}</option>`).join("")}
        </select>
      </label>
    </section>
  `;
}

function renderFocusQuestionList(row) {
  const focusState = focusStateFor(row);
  const outcome = focusState.qualification_outcome || "";
  const needsDetail = outcome === "partial" || outcome === "not_qualified";
  const showDecisionMaker = focusState.questions.decision_maker === "yes";
  const showCrewPrice = focusState.questions.cleaning_crew === "yes";
  const showQuoteEmail = focusState.questions.wants_quote === "yes";
  return `
    <section class="sales-focus-info-box sales-focus-question-box">
      <span>Qualification Questions</span>
      <div class="sales-focus-question-list">
        ${focusQuestionDefs.map((question, index) => {
          const selected = focusState.questions[question.id] || "";
          const labelId = `focus-question-${question.id}`;
          return `
            <div class="sales-focus-question" role="group" aria-labelledby="${esc(labelId)}">
              <div class="sales-focus-question-copy">
                <span class="sales-focus-question-number">${number(index + 1)}</span>
                <p id="${esc(labelId)}">${esc(question.label)}</p>
              </div>
              <div class="sales-yesno-group">
                ${["yes", "no"].map((value) => `
                  <label>
                    <input type="radio" name="focus_${esc(question.id)}" value="${esc(value)}" ${selected === value ? "checked" : ""} />
                    <span>${esc(titleCase(value))}</span>
                  </label>
                `).join("")}
              </div>
            </div>
          `;
        }).join("")}
      </div>
      <div class="sales-focus-followup-fields">
        <label class="sales-field sales-focus-conditional ${showDecisionMaker ? "" : "is-hidden"}" data-focus-conditional="decision_maker">
          Decision maker name
          <input name="contact_name" type="text" value="${esc(row.contact_name || "")}" />
        </label>
        <label class="sales-field sales-focus-conditional ${showCrewPrice ? "" : "is-hidden"}" data-focus-conditional="cleaning_crew">
          Current cleaning quote price
          <input name="current_cleaning_quote_price" type="text" value="${esc(focusState.current_cleaning_quote_price || "")}" placeholder="Optional" />
        </label>
        <label class="sales-field sales-focus-conditional ${showQuoteEmail ? "" : "is-hidden"}" data-focus-conditional="wants_quote">
          Email on file
          <input name="contact_email" type="email" value="${esc(row.contact_email || "")}" />
        </label>
      </div>
      <div class="sales-focus-outcome-grid" role="group" aria-label="Qualification outcome">
        <label class="sales-focus-outcome-card met">
          <input type="radio" name="focus_qualification_outcome" value="met" ${outcome === "met" ? "checked" : ""} />
          <strong>All qualifications met</strong>
          <small>Ready for walkthrough</small>
        </label>
        <label class="sales-focus-outcome-card partial">
          <input type="radio" name="focus_qualification_outcome" value="partial" ${outcome === "partial" ? "checked" : ""} />
          <strong>Some qualifications met</strong>
          <small>Prompt for more details</small>
        </label>
        <label class="sales-focus-outcome-card no">
          <input type="radio" name="focus_qualification_outcome" value="not_qualified" ${outcome === "not_qualified" ? "checked" : ""} />
          <strong>Does not qualify</strong>
          <small>Prompt for the reason</small>
        </label>
      </div>
      <label class="sales-field sales-focus-outcome-detail ${needsDetail ? "" : "is-hidden"}" data-focus-outcome-detail-wrap>
        ${outcome === "not_qualified" ? "Reason lead does not qualify" : "More qualification details"}
        <textarea name="focus_qualification_detail" rows="3" placeholder="${outcome === "not_qualified" ? "Why does this lead not meet the qualifications?" : "What still needs to be confirmed?"}">${esc(focusState.qualification_detail || "")}</textarea>
      </label>
    </section>
  `;
}

function addHoursIso(value, hours) {
  const date = dateValue(value) || new Date();
  date.setTime(date.getTime() + hours * 60 * 60 * 1000);
  return date.toISOString();
}

function defaultWalkthroughWindows() {
  const windows = [];
  let dayOffset = 1;
  while (windows.length < 10) {
    const dateInput = easternDateOffset(dayOffset);
    const day = new Date(`${dateInput}T12:00:00Z`).getUTCDay();
    if (day !== 0 && day !== 6) {
      [10, 14].forEach((hour) => {
        if (windows.length >= 10) return;
        const startsAt = easternWallTimeToIso(dateInput, `${String(hour).padStart(2, "0")}:00`);
        const endsAt = addHoursIso(startsAt, 1);
        windows.push({
          id: `default-${startsAt}`,
          starts_at: startsAt,
          ends_at: endsAt,
          label: hour < 12 ? "Morning walkthrough" : "Afternoon walkthrough"
        });
      });
    }
    dayOffset += 1;
  }
  return windows;
}

function walkthroughWindowValue(slot) {
  return `${slot.starts_at || ""}|${slot.ends_at || ""}|${slot.id || ""}`;
}

function parseWalkthroughWindowValue(value) {
  const [startsAt, endsAt, slotId] = String(value || "").split("|");
  if (!dateValue(startsAt)) return null;
  return {
    starts_at: dateValue(startsAt).toISOString(),
    ends_at: dateValue(endsAt)?.toISOString() || addHoursIso(startsAt, 1),
    slot_id: slotId || ""
  };
}

function walkthroughWindowOptions(row) {
  const now = new Date();
  const adminWindows = (state.walkthroughAvailability || [])
    .filter((slot) => normalize(slot.status || "open") === "open")
    .filter((slot) => dateValue(slot.starts_at) && dateValue(slot.starts_at) >= now)
    .map((slot) => ({
      id: slot.id,
      starts_at: slot.starts_at,
      ends_at: slot.ends_at || addHoursIso(slot.starts_at, 1),
      label: slot.label || slot.window_label || "Available walkthrough"
    }));
  const options = adminWindows.length ? adminWindows : defaultWalkthroughWindows();
  const currentStart = walkthroughAt(row);
  if (currentStart && !options.some((slot) => slot.starts_at === currentStart)) {
    options.unshift({
      id: "current",
      starts_at: currentStart,
      ends_at: row?.walkthrough_end_at || addHoursIso(currentStart, 1),
      label: "Currently selected"
    });
  }
  return options.slice(0, 10);
}

function groupWalkthroughWindows(slots) {
  const groups = new Map();
  slots.forEach((slot) => {
    const start = dateValue(slot.starts_at);
    if (!start) return;
    const key = toDateInput(start);
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        date: start,
        slots: [],
        openCount: 0,
        firstStart: start,
        lastEnd: dateValue(slot.ends_at) || start
      });
    }
    const group = groups.get(key);
    const end = dateValue(slot.ends_at) || dateValue(addHoursIso(slot.starts_at, 1)) || start;
    group.slots.push(slot);
    if (normalize(slot.status || "open") === "open" || String(slot.id || "").startsWith("default-")) group.openCount += 1;
    if (start < group.firstStart) group.firstStart = start;
    if (end > group.lastEnd) group.lastEnd = end;
  });
  return Array.from(groups.values()).map((group) => ({
    ...group,
    slots: group.slots.sort((a, b) => dateValue(a.starts_at) - dateValue(b.starts_at))
  })).sort((a, b) => a.date - b.date);
}

function renderFocusWalkthroughWindows(row) {
  const focusState = focusStateFor(row);
  const showSchedule = focusState.questions.wants_quality_walkthrough === "yes";
  const selectedStart = walkthroughAt(row);
  const groups = groupWalkthroughWindows(walkthroughWindowOptions(row));
  const selectedSlot = groups.flatMap((group) => group.slots).find((slot) => selectedStart && slot.starts_at === selectedStart);
  const selectedGroupKey = selectedSlot ? toDateInput(dateValue(selectedSlot.starts_at)) : "";
  const selectedLabel = selectedSlot
    ? `${formatDate(selectedSlot.starts_at, { weekday: "short", month: "short", day: "numeric" })} at ${formatTime(selectedSlot.starts_at)}`
    : "No walkthrough scheduled";
  return `
    <section class="sales-focus-info-box sales-focus-window-box ${showSchedule ? "" : "is-hidden"}" data-focus-walkthrough-section>
      <span>Walkthrough Availability</span>
      <div class="sales-focus-schedule-summary">
        <strong>${esc(selectedLabel)}</strong>
        <button class="sales-primary-button" type="button" data-open-schedule-walkthrough>${icon("calendar")}Schedule Walkthrough</button>
      </div>
      <div class="sales-schedule-popover" data-schedule-walkthrough-popover hidden>
        <div class="sales-schedule-backdrop" data-close-schedule-walkthrough></div>
        <section class="sales-schedule-dialog" role="dialog" aria-modal="true" aria-label="Schedule walkthrough">
          <header>
            <div>
              <span>Available Times</span>
              <strong>Schedule walkthrough</strong>
            </div>
            <button class="sales-icon-button" type="button" data-close-schedule-walkthrough aria-label="Close schedule options">${icon("x")}</button>
          </header>
          <div class="sales-walkthrough-picker-copy">
            <strong>Choose an available day</strong>
            <span>Pick a day first, then select one of the available times for that day. All times are Eastern Time (ET).</span>
          </div>
          <div class="sales-walkthrough-date-grid" data-walkthrough-day-grid>
            ${groups.map((group) => {
              const isActive = group.key === selectedGroupKey;
              return `
                <button class="sales-walkthrough-date-card ${isActive ? "active" : ""}" type="button" data-walkthrough-day="${esc(group.key)}" aria-expanded="${isActive ? "true" : "false"}">
                  <header>
                    <div>
                      <h3>${esc(formatDate(group.date, { weekday: "short", month: "short", day: "numeric", year: "numeric" }))}</h3>
                      <p>${esc(formatTime(group.firstStart))} - ${esc(formatTime(group.lastEnd))}</p>
                    </div>
                    <span class="sales-availability-count">${esc(number(group.openCount))} slot${group.openCount === 1 ? "" : "s"}</span>
                  </header>
                </button>
              `;
            }).join("")}
          </div>
          <div class="sales-walkthrough-time-panels">
            <p class="sales-walkthrough-time-empty ${selectedGroupKey ? "is-hidden" : ""}" data-walkthrough-time-empty>Choose a day above to see available walkthrough times.</p>
            ${groups.map((group) => `
              <section class="sales-walkthrough-times-panel" data-walkthrough-times-panel="${esc(group.key)}" ${group.key === selectedGroupKey ? "" : "hidden"}>
                <header>
                  <div>
                    <span>Available Times</span>
                    <strong>${esc(formatDate(group.date, { weekday: "long", month: "short", day: "numeric" }))}</strong>
                  </div>
                  <small>${esc(number(group.openCount))} slot${group.openCount === 1 ? "" : "s"}</small>
                </header>
                <div class="sales-walkthrough-time-grid">
                  ${group.slots.map((slot) => {
                    const start = dateValue(slot.starts_at);
                    const end = dateValue(slot.ends_at);
                    const checked = selectedStart && slot.starts_at === selectedStart;
                    return `
                      <label class="sales-walkthrough-time-card">
                        <input type="radio" name="walkthrough_window" value="${esc(walkthroughWindowValue(slot))}" ${checked ? "checked" : ""} />
                        <strong>${esc(start && end ? `${formatTime(start)} - ${formatTime(end)}` : "Time TBD")}</strong>
                        <span>${esc(slot.label || "Available walkthrough")}</span>
                      </label>
                    `;
                  }).join("")}
                </div>
              </section>
            `).join("")}
          </div>
        </section>
      </div>
    </section>
  `;
}

function renderFocusNavigation(rows, placement = "") {
  const disabled = rows.length <= 1 ? "disabled" : "";
  const placementClass = placement ? ` sales-focus-nav-${placement}` : "";
  return `
    <nav class="sales-focus-nav${placementClass}" aria-label="Prospect focus navigation">
      <button class="sales-secondary-button" type="button" data-focus-prev ${disabled}>${icon("left")}Back</button>
      <button class="sales-secondary-button" type="button" data-focus-next ${disabled}>Next${icon("chevron")}</button>
      <button class="sales-secondary-button" type="button" data-exit-lead-focus>${icon("left")}Return To List</button>
    </nav>
  `;
}

function renderLeadFocusMode(rows) {
 const row=selectRecord(rows);
 if(!row)return `${emptyState('No callable prospects in this view','Do-not-contact and declined prospects are excluded from the calling queue.')}<button class="sales-secondary-button" data-exit-lead-focus>Back to prospects</button>`;
 return `<div class="crm-welcome"><div><p class="crm-eyebrow">${esc(prospectTypeLabel(row.prospect_type))} · ${rows.findIndex(r=>r.id===row.id)+1} OF ${rows.length}</p><h2>${esc(recordTitle(row))}</h2><p>${esc(row.company_name||'Residential prospect')} · ${esc(ownerName(row))}</p></div>${renderFocusNavigation(rows,'top')}</div>
 <div class="crm-call-layout"><div>${renderContactCard(row)}${renderQuickSend(row)}<article class="sales-panel crm-call-panel"><h2>Conversation notes</h2><p class="crm-note-text">${esc(row.lead_notes||'No notes yet.')}</p>${(row.sales_activity_log||[]).slice(0,15).map(a=>`<div class="crm-history"><small>${esc(formatDateTime(a.at))} · ${esc(a.user)}</small><p>${esc(a.text)}</p></div>`).join('')}</article></div>
 <article class="sales-panel crm-call-panel"><p class="crm-eyebrow">LISTEN → EXPLAIN → AGREE ON A NEXT STEP</p><h2>Work this opportunity</h2><p>Ask about their closing gifts, upcoming clients, service-area fit and preferred next step.</p><a href="crm-scripts.html" target="_blank" rel="noopener" class="sales-secondary-button">Open scripts & objections ↗</a>
 <form data-outreach-form data-record-id="${esc(row.id)}"><div class="sales-form-grid">
 ${selectField('pipeline_stage','Outcome / stage',stageDefs.map(st=>[st.id,st.label]),stageFor(row))}
 ${textAreaField('outreach_note','Add a conversation note','','span-two')}
 <label class="crm-dnc span-two"><input name="do_not_contact" type="checkbox" ${row.do_not_contact?'checked disabled':''}> DO NOT CONTACT — permanently stop outreach and remove from all follow-ups</label>
 </div><p class="crm-help">Follow-up and Not interested automatically enter the follow-up flow. The first reminder is due in 30 days. Only confirmed payments count as sales.</p><footer class="sales-modal-footer"><p class="sales-message" data-modal-message role="status"></p><button type="submit" class="sales-primary-button">Save conversation</button></footer></form></article></div>`;
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
          <p>Capture property fit, decision maker, service needs, estimate acceptance, and timing.</p>
        </div>
        <button class="sales-primary-button" type="submit">${icon("check")}Save Qualification</button>
      </div>
      <div class="sales-qualification-grid">
        <section class="sales-qualification-block">
          <span>Property Fit</span>
          ${selectField("property_class", "Home type", [["", "Not set"], ["House", "House"], ["Condo", "Condo"], ["Townhome", "Townhome"], ["Apartment", "Apartment"], ["Other", "Other"]], row.property_class || "")}
        </section>
        <section class="sales-qualification-block">
          <span>Decision Maker</span>
          ${selectField("decision_maker_status", "Decision Maker Status", [["", "Unknown"], ["confirmed", "Confirmed"], ["in_progress", "In Progress"], ["not_confirmed", "Not Confirmed"]], row.decision_maker_status || "")}
          ${field("current_vendor", "Current Vendor", row.current_vendor || "")}
        </section>
        <section class="sales-qualification-block">
          <span>Service Needs</span>
          <div class="sales-check-row">${checkboxList("service_needs", services, savedServices)}</div>
        </section>
        <section class="sales-qualification-block">
          <span>Pain Points, Timing & Pricing Fit</span>
          <div class="sales-check-row">${checkboxList("sales_pain_points", painPoints, savedPain)}</div>
          ${field("desired_start_date", "Desired Start Date", toDateInput(row.desired_start_date), "date")}
          ${field("budget_range", "Estimate Fit", row.budget_range || "")}
          ${field("opportunity_score", "Opportunity Score", row.opportunity_score || "", "number")}
        </section>
        <section class="sales-qualification-block span-two">
          <span>Notes / Summary</span>
          ${textAreaField("qualification_notes", "Qualification Notes", qualificationNotesText(row) || row.lead_notes || "", "span-two")}
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
 if(!row)return '';
 return `<aside class="sales-detail-panel">${renderContactCard(row)}<div class="crm-call-panel"><p class="crm-note-text">${esc(row.lead_notes||'No notes saved.')}</p><button class="sales-primary-button" data-work-prospect="${esc(row.id)}">Work prospect</button><button class="sales-secondary-button" data-open-lead="${esc(row.id)}">Edit details</button></div></aside>`;
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
      ${metricCard("Pricing Fit", number(rowsByStage("quote_sent").length), "the residential estimate confirmed", "check", "green")}
    </section>
    ${renderWalkthroughAvailabilityAdmin()}
    <section class="sales-workspace">
      <article class="sales-panel">
        ${renderFilters({ placeholder: "Search walkthroughs...", statuses: walkthroughStatuses })}
        ${renderCalendar(rows)}
      </article>
      ${renderWalkthroughDetail(selected)}
    </section>
  `;
}

function availabilityStatusOptions(selected = "open") {
  return ["open", "booked", "held", "closed", "cancelled"]
    .map((status) => `<option value="${esc(status)}" ${normalize(selected) === status ? "selected" : ""}>${esc(titleCase(status))}</option>`)
    .join("");
}

function renderWalkthroughAvailabilityAdmin() {
  if (!isSalesAdmin()) return "";
  const groups = groupWalkthroughWindows((state.walkthroughAvailability || [])
    .slice()
    .sort((a, b) => sortableTime(a.starts_at) - sortableTime(b.starts_at))
    .slice(0, 24));
  const tomorrow = easternDateOffset(1);
  return `
    <section class="sales-panel sales-availability-admin">
      <div class="sales-panel-header">
        <div>
          <h2>Walkthrough Availability</h2>
          <p>Set the days and times that sales reps can choose in focus mode. All times are Eastern Time (ET).</p>
        </div>
      </div>
      <form class="sales-availability-form" data-availability-form>
        ${field("availability_date", "Date", tomorrow, "date", true)}
        ${field("availability_start_time", "Start (ET)", "10:00", "time", true)}
        ${field("availability_end_time", "End (ET)", "11:00", "time", true)}
        ${field("availability_label", "Window Label", "Quality walkthrough", "text")}
        <button class="sales-primary-button" type="submit">${icon("plus")}Add Window</button>
      </form>
      <div class="sales-availability-list">
        ${groups.length ? groups.map((group) => `
          <article class="sales-availability-card">
            <header>
              <div>
                <h3>${esc(formatDate(group.date, { weekday: "short", month: "short", day: "numeric", year: "numeric" }))}</h3>
                <p>${esc(formatTime(group.firstStart))} - ${esc(formatTime(group.lastEnd))}</p>
              </div>
              <span class="sales-availability-count">${esc(number(group.openCount))} open</span>
            </header>
            <div class="sales-availability-slots">
              ${group.slots.map((slot) => {
                const start = dateValue(slot.starts_at);
                const end = dateValue(slot.ends_at);
                return `
                  <article class="sales-availability-slot">
                    <div>
                      <strong>${esc(start && end ? `${formatTime(start)} - ${formatTime(end)}` : "Time TBD")}</strong>
                      <small>${esc(slot.label || "Available walkthrough")}</small>
                    </div>
                    <select class="sales-filter" data-availability-status="${esc(slot.id)}" aria-label="Update availability status">
                      ${availabilityStatusOptions(slot.status || "open")}
                    </select>
                    <button class="sales-danger-button" type="button" data-delete-availability="${esc(slot.id)}">${icon("x")}Remove</button>
                  </article>
                `;
              }).join("")}
            </div>
          </article>
        `).join("") : `<p class="sales-record-subtitle">No admin-set availability windows yet.</p>`}
      </div>
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
        <div class="sales-detail-stat"><span>Operator</span><strong>${esc(ownerName(row))}</strong></div>
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
        <button class="sales-primary-button" type="button" data-open-quote="${esc(row.id)}">${icon("file-text")}Prepare Quote</button>
        <button class="sales-secondary-button" type="button" data-send-quote="${esc(row.id)}">${icon("mail")}Send Quote</button>
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
  if (["no", "not_ok", "not_accepted", "not_acceptable", "not_confirmed", "needs_confirmation", "pending", "unknown", "declined", "too_high", "does_not_work"].includes(fitText) ||
    fitText.includes("not") ||
    fitText.includes("declined") ||
    fitText.includes("too_high")) {
    return false;
  }
  return ["quote_sent", "walkthrough", "contract_out", "active"].includes(stage) ||
    fitText.includes("confirmed") ||
    fitText.includes("accepted") ||
    fitText.includes("works") ||
    fitText === "yes" ||
    fitText === "ok";
}

function pricingFitText(row) {
  if (pricingFitConfirmed(row)) return row?.budget_range || "Confirmed at the residential estimate";
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
  if (!pricingFitConfirmed(row)) return "Confirm the residential estimate";
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

function quoteDateLabel(value = new Date()) {
  const date = dateValue(value) || new Date();
  return date.toLocaleDateString([], { month: "long", day: "numeric", year: "numeric" });
}

function quotePropertyAddress(row) {
  return recordAddress(row).replace(/\s+-\s+/g, ", ");
}

function quoteSafeFileName(row) {
  const title = recordTitle(row).replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "") || "Turnly-Quote";
  return `${title}-Quote-Proposal.pdf`;
}

function quotePdfFieldValues(row, values = {}) {
  return {
    property_name: recordTitle(row),
    contact_property_manager: recordContact(row),
    quote_date: quoteDateLabel(values.quote_sent_at || new Date()),
    property_address: quotePropertyAddress(row)
  };
}

function quoteEmailSubject(row) {
  return `Turnly quote proposal for ${recordTitle(row)}`;
}

function quoteEmailBody(row, values = {}) {
  const firstName = String(recordContact(row) || "").split(/\s+/)[0];
  const greeting = firstName && firstName !== "No" ? `Hi ${firstName},` : "Hi,";
  const amount = Number(values.quote_amount || row?.quote_amount || row?.lead_value || 0);
  return [
    greeting,
    "",
    `Attached is the Turnly quote proposal for ${recordTitle(row)}.`,
    ...(amount ? ["", `Quote amount: ${money(amount, true)}`] : []),
    "",
    "Please reply with any questions, or let us know if you would like us to move forward.",
    "",
    "Thank you,",
    "Turnly Sales",
    quoteSenderEmail()
  ].join("\n");
}

function resetQuotePreview() {
  if (quotePreviewUrl) URL.revokeObjectURL(quotePreviewUrl);
  quotePreviewUrl = "";
  quotePreviewBlob = null;
  quotePreviewFileName = "";
}

function renderQuotePreviewFrame(form, row) {
  const panel = form.querySelector("[data-sales-quote-preview-panel]");
  const iframe = form.querySelector("[data-sales-quote-preview-frame]");
  const download = form.querySelector("[data-sales-quote-download]");
  const details = form.querySelector("[data-sales-quote-preview-details]");
  if (!panel || !iframe || !download) return;
  iframe.src = quotePreviewUrl;
  download.href = quotePreviewUrl;
  download.download = quotePreviewFileName;
  if (details) {
    details.textContent = [
      recordTitle(row),
      recordContact(row),
      quotePropertyAddress(row),
      quoteDateLabel()
    ].filter(Boolean).join(" | ");
  }
  panel.hidden = false;
}

async function generateQuotePreview(form) {
  const values = readForm(form);
  const row = recordById(values.record_id);
  if (!row) throw new Error("Choose a property before generating the quote preview.");
  setInlineFormMessage(form, "Generating quote preview...");
  const generated = await generateTurnlyQuotePdf({
    fieldValues: quotePdfFieldValues(row, values),
    fileName: quoteSafeFileName(row)
  });
  resetQuotePreview();
  quotePreviewBlob = generated.blob;
  quotePreviewFileName = generated.fileName;
  quotePreviewUrl = URL.createObjectURL(quotePreviewBlob);
  renderQuotePreviewFrame(form, row);
  setInlineFormMessage(form, "Quote preview generated.", "success");
  return { row, values, blob: quotePreviewBlob, fileName: quotePreviewFileName };
}

async function emailQuotePreview(form) {
  let values = readForm(form);
  let row = recordById(values.record_id);
  if (!quotePreviewBlob || !quotePreviewUrl || !row) {
    const generated = await generateQuotePreview(form);
    row = generated.row;
    values = generated.values;
  }
  if (!row || !quotePreviewBlob) throw new Error("Generate a quote preview before opening Gmail.");
  await openGmailQuoteDraft({
    toEmail: row.contact_email,
    subject: quoteEmailSubject(row),
    body: quoteEmailBody(row, values),
    pdfBlob: quotePreviewBlob,
    pdfFileName: quotePreviewFileName
  });
  setInlineFormMessage(form, `Gmail opened with the quote email ready. Attach the downloaded PDF before sending from ${quoteSenderEmail()}.`, "success");
}

async function emailQuoteForRow(row) {
  if (!row) throw new Error("Select a quote before sending it.");
  const generated = await generateTurnlyQuotePdf({
    fieldValues: quotePdfFieldValues(row, row),
    fileName: quoteSafeFileName(row)
  });
  await openGmailQuoteDraft({
    toEmail: row.contact_email,
    subject: quoteEmailSubject(row),
    body: quoteEmailBody(row, row),
    pdfBlob: generated.blob,
    pdfFileName: generated.fileName
  });
  return generated;
}

function renderTaskFilters() {
  const ownerOptions = `<option value="all">All operators</option><option value="mine" ${state.ownerFilter === "mine" ? "selected" : ""}>My leads</option><option value="unassigned" ${state.ownerFilter === "unassigned" ? "selected" : ""}>Unassigned</option>${state.reps.map((rep) => `<option value="${rep.id}" ${state.ownerFilter === rep.id ? "selected" : ""}>${esc(rep.full_name || rep.email || "Sales user")}</option>`).join("")}`;
  const stageOptions = `<option value="all">All Stages</option>${stageDefs.map((stage) => `<option value="${stage.id}" ${state.stageFilter === stage.id ? "selected" : ""}>${esc(stage.label)}</option>`).join("")}`;
  const statusOptions = `<option value="all">All Task Statuses</option>${taskStatuses.map((status) => `<option value="${status}" ${state.statusFilter === status ? "selected" : ""}>${esc(titleCase(status))}</option>`).join("")}`;
  return `
    <div class="sales-task-toolbar">
      <label class="sales-search">
        ${icon("search")}
        <input id="salesPageSearch" aria-label="Search records" type="search" value="${esc(state.search)}" placeholder="Search follow-ups, contacts, or properties..." />
      </label>
      <select class="sales-filter" aria-label="Filter by owner" data-filter-owner>${ownerOptions}</select>
      <select class="sales-filter" aria-label="Filter by stage" data-filter-stage>${stageOptions}</select>
      <select class="sales-filter" data-filter-status>${statusOptions}</select>
      <button class="sales-primary-button" type="button" data-open-task="${esc(state.selectedId || "")}">${icon("plus")}New Follow-up</button>
    </div>
  `;
}

function renderTaskFlowStrip() {
  const steps = [
    { label: "Identify", detail: "Find residential cleaning prospects.", count: rowsByStage("new_leads").length, iconName: "users" },
    { label: "Confirm Price", detail: "Make sure the residential estimate works.", count: rowsByStage("quote_sent").length, iconName: "check" },
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
      detail: "Prospects that still need estimate confirmation.",
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

function followUpAge(row,now=Date.now()) {const start=Date.parse(row.follow_up_started_at);return Number.isFinite(start)?Math.max(0,Math.floor((now-start)/86400000)):null;}
function followUpBank(row) {const age=followUpAge(row);return age===null?'unknown':age<=30?'30':age<=60?'60':age<=90?'90':'long';}
function renderTasksPage() {
 const rows=baseFilteredRows().filter(r=>!r.do_not_contact&&['lost','follow_up'].includes(stageFor(r)));
 const banks=[['30','30-day','0–30 days'],['60','60-day','31–60 days'],['90','90-day','61–90 days'],['long','Long term','91+ days']];
 if(rows.some(r=>followUpBank(r)==='unknown'))banks.push(['unknown','Date unavailable','Legacy records']);
 const selected=state.followUpBank||'30',page=pagedProspects(rows.filter(r=>followUpBank(r)===selected).sort((a,b)=>Date.parse(a.follow_up_started_at)-Date.parse(b.follow_up_started_at)));
 return `<article class="sales-panel"><h2>Follow-up pipeline</h2><p>Age starts when a lead enters Follow-up or Not interested. Editing notes or switching between these outcomes does not reset its age. Do-not-contact leads are permanently excluded.</p>${renderFilters({placeholder:'Search follow-ups...'})}<div class="crm-linear-pipeline">${banks.map(([id,title,range])=>`<button class="crm-stage-step ${selected===id?'selected':''}" data-followup-bank="${id}"><small>${title} · ${range}</small><strong>${rows.filter(r=>followUpBank(r)===id).length}</strong><span>View leads →</span></button>`).join('')}</div><h3>${banks.find(b=>b[0]===selected)?.[1]||'Follow-ups'}</h3>${renderLeadTable(page.rows)}${renderProspectPager(page)}</article>`;
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
  if (!row) return `<aside class="sales-detail-card sales-task-detail-card">${emptyState("Select a task", "Task details will appear here.")}</aside>`;
  const phoneHref = contactPhoneHref(row);
  const emailHref = contactEmailHref(row);
  return `
    <aside class="sales-detail-card sales-task-detail-card">
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
        <div class="sales-detail-stat"><span>Operator</span><strong>${esc(ownerName(row))}</strong></div>
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
        ${pricingFitConfirmed(row) ? "" : `<button class="sales-secondary-button" type="button" data-update-stage="${esc(row.id)}" data-stage="quote_sent">${icon("check")}Confirm Estimate</button>`}
        <button class="sales-secondary-button" type="button" data-open-walkthrough="${esc(row.id)}">${icon("calendar")}Schedule Walkthrough</button>
        <button class="sales-secondary-button" type="button" data-open-task="${esc(row.id)}">${icon("clipboard-check")}Reschedule / Edit</button>
        <button class="sales-secondary-button" type="button" data-open-lead="${esc(row.id)}">${icon("users")}Open Prospect</button>
      </div>
    </aside>
  `;
}

function renderModal() {
  if (!state.modal) return "";
  if(state.modal.type==='sendLink')return renderSendModal();
  if(state.modal.type==='removeLeads')return renderRemoveModal();
  if (state.modal.type.startsWith("team")) return renderTeamModal();
  if (state.modal.type === "assignment") return renderAssignmentModal();
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
          ${field("property_name", "Prospect name", row ? recordTitle(row) : "", "text", true)}
          ${selectField("prospect_type","Prospect type",prospectTypeOptions(),row?.prospect_type||"realtor")}
          ${field("company_name","Brokerage / company",row?.company_name||"")}
          ${field("sales_city","City",row?.sales_city||"")}
          ${field("sales_state","State",row?.sales_state||"")}
          ${field("sales_website","Website",row?.sales_website||"")}
          ${field("contact_phone", "Phone Number", row?.contact_phone || "")}
          ${field("contact_name", "Contact name", row?.contact_name || "")}
          ${field("contact_email", "Email", row?.contact_email || "", "email")}
          ${field("address", "Address", row?.address || "", "text", false, "span-two")}
          ${selectField("pipeline_stage", "Stage", stageDefs.map((stage) => [stage.id, stage.label]), stageFor(row))}
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
          ${field("walkthrough_at_time", "Start Time (ET)", toTimeInput(walkthroughAt(row)) || "10:00", "time")}
          ${field("walkthrough_end_time", "End Time (ET)", toTimeInput(row?.walkthrough_end_at) || "11:00", "time")}
          ${selectField("walkthrough_status", "Status", walkthroughStatuses.map((status) => [status, titleCase(status)]), row?.walkthrough_status || "scheduled")}
          ${field("walkthrough_type", "Walkthrough Type", row?.walkthrough_type || "Property Walkthrough")}
          ${selectField("walkthrough_assigned_to_id", "Assigned operator", repOptions(), row?.sales_owner_id || "")}
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
  const selectedRow = row || recordById(selectedId);
  const body = `
    <form data-quote-form data-record-id="${esc(selectedId)}">
      <div class="sales-modal-body">
        <input type="hidden" name="record_id" value="${esc(selectedId)}" />
        <section class="sales-quote-builder">
          <div class="sales-quote-builder-head">
            <div>
              <span>Quote PDF</span>
              <strong>${esc(selectedRow ? recordTitle(selectedRow) : "Select a lead before sending a quote")}</strong>
            </div>
            <div class="sales-row-actions">
              <button class="sales-secondary-button" type="button" data-generate-quote-pdf>${icon("file-text")}Generate Preview</button>
              <button class="sales-primary-button" type="button" data-email-quote-pdf>${icon("mail")}Send Quote</button>
            </div>
          </div>
          <p>Generate Preview fills the Turnly quote form. Send Quote opens Gmail with the email ready and downloads the PDF so it can be attached before sending from ${esc(quoteSenderEmail())}.</p>
          <div class="sales-quote-preview" data-sales-quote-preview-panel hidden>
            <div class="sales-quote-preview-bar">
              <small data-sales-quote-preview-details></small>
              <a class="sales-secondary-button" href="#" data-sales-quote-download>${icon("file-text")}Download PDF</a>
            </div>
            <iframe title="Turnly quote preview" data-sales-quote-preview-frame></iframe>
          </div>
        </section>
      </div>
    </form>
  `;
  return renderModalShell("Send Quote", "Quotes", body, "", false);
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
  if (!id && !isSalesAdmin()) return setInlineFormMessage(form, "Only admins can create new sales leads.", "error");

  const payload = {
    property_name: propertyName,
    prospect_type:values.prospect_type||'residential',company_name:(values.company_name||'').trim(),
    sales_city:(values.sales_city||'').trim(),sales_state:(values.sales_state||'').trim(),sales_website:(values.sales_website||'').trim(),
    name: propertyName,
    contact_phone: values.contact_phone?.trim() || "",
    contact_name: values.contact_name?.trim() || "",
    contact_email: values.contact_email?.trim() || "",
    address: values.address?.trim() || "",
    pipeline_stage: values.pipeline_stage || "new_leads",
    lead_notes: values.lead_notes?.trim() || "",
    default_scope: values.lead_notes?.trim() || ""
  };
  if (!id) Object.assign(payload, ownerPayload(""));

  await persistForm(form, id, payload, id ? "Prospect updated." : "Prospect created.");
}

async function handleLeadFocusForm(form) {
  await autosaveFocusLead({ includeNote: true });
}

function setFocusSaveStatus(text, tone = "") {
  const status = document.querySelector("[data-autosave-status]");
  if (!status) return;
  status.textContent = text;
  status.className = `sales-autosave-status ${tone}`.trim();
}

function updateFocusRowLocally(id, payload) {
  const row = recordById(id);
  if (row) Object.assign(row, payload);
  const lead = state.leads.find((item) => item.id === id);
  if (lead) Object.assign(lead, payload);
}

async function autosaveFocusLead(options = {}) {
  const form = document.querySelector("[data-focus-lead-form]");
  if (!form) return true;
  if (focusSavePromise) {
    focusSaveQueuedOptions = {
      includeNote: Boolean(focusSaveQueuedOptions?.includeNote || options.includeNote)
    };
    return focusSavePromise;
  }

  focusSavePromise = (async () => {
    const formData = new FormData(form);
    const values = Object.fromEntries(formData.entries());
    const id = form.dataset.recordId || "";
    const row = recordById(id);
    const noteField = form.querySelector('textarea[name="focus_note"]');
    const note = options.includeNote ? values.focus_note?.trim() : "";
    if (!id) return false;

    const previousFocusState = focusStateFor(row);
    const stageSet = new Set(formData.getAll("focus_stage"));
    const windowChoice = parseWalkthroughWindowValue(values.walkthrough_window);
    const questions = Object.fromEntries(
      focusQuestionDefs.map((question) => [question.id, values[`focus_${question.id}`] || ""])
    );
    const qualificationOutcome = values.focus_qualification_outcome || "";
    const qualificationDetail = ["partial", "not_qualified"].includes(qualificationOutcome) ? values.focus_qualification_detail?.trim() || "" : "";
    if (questions.price_acceptable === "yes") stageSet.add("pricing_confirmed");
    if (windowChoice) stageSet.add("walkthrough_set");
    if (stageSet.has("walkthrough_set")) {
      questions.wants_quality_walkthrough = "yes";
      stageSet.delete("not_interested");
      stageSet.delete("handled_by_corporate");
    }

    const isClosedByFocus = stageSet.has("not_interested") || stageSet.has("handled_by_corporate");
    const pipelineStage = isClosedByFocus
      ? "lost"
      : stageSet.has("walkthrough_set")
        ? "walkthrough"
        : stageSet.has("pricing_confirmed")
          ? "quote_sent"
          : stageSet.has("contacted")
            ? "contacted"
            : "new_leads";

    const focusState = {
      version: FOCUS_STATE_VERSION,
      stages: focusStageDefs.reduce((acc, stage) => {
        acc[stage.id] = stageSet.has(stage.id);
        return acc;
      }, {}),
      questions,
      follow_up_status: values.focus_follow_up_status || "open",
      walkthrough_window: values.walkthrough_window || "",
      qualification_outcome: qualificationOutcome,
      qualification_detail: qualificationDetail,
      current_cleaning_quote_price: questions.cleaning_crew === "yes" ? values.current_cleaning_quote_price?.trim() || "" : ""
    };

    const payload = {
      pipeline_stage: pipelineStage,
      qualification_notes: mergeQualificationNotes(qualificationNotesText(row), focusState),
      contact_name: questions.decision_maker === "yes" ? values.contact_name?.trim() || "" : "",
      contact_email: questions.wants_quote === "yes" ? values.contact_email?.trim() || "" : "",
      decision_maker_status: questions.decision_maker === "yes" ? "confirmed" : questions.decision_maker === "no" ? "not_confirmed" : "",
      current_vendor: questions.cleaning_crew === "yes" ? "Yes" : questions.cleaning_crew === "no" ? "No" : ""
    };

    if (stageSet.has("pricing_confirmed") || questions.price_acceptable === "yes") {
      payload.budget_range = "Confirmed at the residential estimate";
    } else if (questions.price_acceptable === "no") {
      payload.budget_range = "Not acceptable at the residential estimate";
    } else {
      payload.budget_range = "";
    }

    if (isClosedByFocus) {
      payload.task_type = row?.task_type || "Sales follow-up";
      payload.task_status = "completed";
      payload.next_step = "";
    } else if (stageSet.has("follow_up_needed") || previousFocusState.stages.follow_up_needed || row?.next_step || row?.task_due_at) {
      payload.task_type = row?.task_type || "Sales follow-up";
      payload.task_status = stageSet.has("follow_up_needed") ? values.focus_follow_up_status || "open" : "completed";
      payload.next_step = stageSet.has("follow_up_needed") ? row?.next_step || "Follow up needed" : "";
    }

    if (windowChoice) {
      payload.walkthrough_at = windowChoice.starts_at;
      payload.walkthrough_end_at = windowChoice.ends_at;
      payload.walkthrough_status = "scheduled";
      payload.walkthrough_type = questions.wants_quality_walkthrough === "yes"
        ? "Quality Control Walkthrough Demo"
        : row?.walkthrough_type || "Property Walkthrough";
      payload.walkthrough_location = row?.walkthrough_location || row?.address || "";
    } else if (row?.walkthrough_at || previousFocusState.walkthrough_window) {
      payload.walkthrough_at = null;
      payload.walkthrough_end_at = null;
      payload.walkthrough_status = "cancelled";
    }

    if (note) {
      const existingNotes = row?.lead_notes || row?.default_scope || "";
      const stampedNote = `${new Date().toLocaleString()}: ${note}`;
      payload.lead_notes = existingNotes ? `${existingNotes}\n\n${stampedNote}` : stampedNote;
      payload.default_scope = payload.lead_notes;
    }

    try {
      setFocusSaveStatus("Saving...");
      await saveRecord(id, payload, "");
      updateFocusRowLocally(id, payload);
      if (noteField && note) noteField.value = "";
      setFocusSaveStatus("Saved.", "success");
      return true;
    } catch (error) {
      setFocusSaveStatus(`Unable to autosave: ${error.message}`, "error");
      return false;
    }
  })();

  try {
    return await focusSavePromise;
  } finally {
    focusSavePromise = null;
    if (focusSaveQueuedOptions) {
      const queuedOptions = focusSaveQueuedOptions;
      focusSaveQueuedOptions = null;
      window.setTimeout(() => {
        autosaveFocusLead(queuedOptions);
      }, 0);
    }
  }
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
  const row = recordById(id);
  const focusState = focusStateFor(row);
  const visibleNotes = values.qualification_notes?.trim() || "";

  const payload = {
    property_class: values.property_class || "",
    decision_maker_status: values.decision_maker_status || "",
    current_vendor: values.current_vendor?.trim() || "",
    desired_start_date: values.desired_start_date || null,
    budget_range: values.budget_range?.trim() || "",
    opportunity_score: cleanInt(values.opportunity_score),
    service_needs: new FormData(form).getAll("service_needs"),
    sales_pain_points: new FormData(form).getAll("sales_pain_points"),
    qualification_notes: mergeQualificationNotes(visibleNotes, focusState),
    lead_notes: visibleNotes || values.lead_notes || ""
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
  return ({interested:"interested",link_sent:"link_sent",purchase_link_sent:"link_sent",follow_up:"follow_up",purchased:"active",booked:"active",not_interested:"lost"})[stage] || ({quote_sent:"interested",walkthrough:"follow_up",contract_out:"follow_up"})[aliases[stage]] || aliases[stage] || "new_leads";
}

function payloadFromUpload(row, rowNumber) {
  const propertyName = valueFrom(row, "property_name") || valueFrom(row, "company_name") || valueFrom(row, "contact_name") || valueFrom(row, "contact_email");
  if (!propertyName) return { error: `Row ${rowNumber}: missing lead name.` };

  const leadNotes = valueFrom(row, "lead_notes");
  if(stageFromUpload(valueFrom(row,"pipeline_stage"))==='active'&&!row.sales_confirmation_ref?.trim()) return {error:`Row ${rowNumber}: a purchased/booked prospect requires sales_confirmation_ref.`};
  return {
    payload: {
      business_segment: "residential",
      prospect_type:prospectTypeOptions().some(([key])=>key===row.prospect_type)?row.prospect_type:'realtor',
      company_name:valueFrom(row,'company_name'),sales_city:valueFrom(row,'sales_city'),sales_state:valueFrom(row,'sales_state'),
      contact_email: valueFrom(row, "contact_email"),
      contact_name: valueFrom(row, "contact_name"),
      property_name: propertyName,
      name: propertyName,
      contact_phone: valueFrom(row, "contact_phone"),
      address: valueFrom(row, "address"),
      lead_source: valueFrom(row, "lead_source") || "Imported",
      pipeline_stage: stageFromUpload(valueFrom(row, "pipeline_stage")),
      sales_confirmation_ref:row.sales_confirmation_ref?.trim()||"",
      next_step: valueFrom(row, "next_step"),
      next_step_due_at: fromDateTimeLocal(valueFrom(row, "next_step_due_at")) || dateOnlyIso(valueFrom(row, "next_step_due_at")),
      lead_notes: leadNotes,
      default_scope: leadNotes,
      sales_owner_id: null,
      sales_owner_name: "",
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
  if (!isSalesAdmin()) {
    setMessage("Only admins can import prospects.", "error");
    return;
  }
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
    if(!stageDefs.some(item=>item.id===stage))throw new Error('Choose a valid stage.');
    if(row?.do_not_contact&&stage!=='lost')throw new Error('This prospect has requested no contact. Review the record before reopening outreach.');
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

async function handleAvailabilityForm(form) {
  const values = readForm(form);
  const start = combineDateTime(values.availability_date, values.availability_start_time, "10:00");
  const end = combineDateTime(values.availability_date, values.availability_end_time, "11:00");
  if (!start || !end) return setMessage("Choose a valid walkthrough date and time.", "error");
  if (dateValue(end) <= dateValue(start)) return setMessage("The end time must be after the start time.", "error");

  try {
    const { error } = await supabase
      .from(SALES_TABLES.availability)
      .insert([{
        created_by: state.user?.id || null,
        starts_at: start,
        ends_at: end,
        label: values.availability_label?.trim() || "Available walkthrough",
        status: "open"
      }]);
    if (error) throw error;
    await refreshData(false);
    setMessage("Walkthrough availability window added.", "success");
  } catch (error) {
    setMessage(`Unable to add availability: ${error.message}`, "error");
  }
}

async function updateAvailabilityStatus(id, status) {
  if (!id) return;
  try {
    const { error } = await supabase
      .from(SALES_TABLES.availability)
      .update({ status: status || "open" })
      .eq("id", id);
    if (error) throw error;
    await refreshData(false);
    setMessage("Availability status updated.", "success");
  } catch (error) {
    setMessage(`Unable to update availability: ${error.message}`, "error");
  }
}

async function deleteAvailabilitySlot(id) {
  if (!id) return;
  const confirmed = window.confirm("Remove this walkthrough availability window?");
  if (!confirmed) return;
  try {
    const { error } = await supabase
      .from(SALES_TABLES.availability)
      .delete()
      .eq("id", id);
    if (error) throw error;
    await refreshData(false);
    setMessage("Walkthrough availability window removed.", "success");
  } catch (error) {
    setMessage(`Unable to remove availability: ${error.message}`, "error");
  }
}

function syncFocusConditionalUi(form, source = null) {
  if (!form) return;
  const walkthroughCheckbox = form.querySelector('input[name="focus_stage"][value="walkthrough_set"]');
  const qualityChoice = form.querySelector('input[name="focus_wants_quality_walkthrough"]:checked');
  const qualityYes = form.querySelector('input[name="focus_wants_quality_walkthrough"][value="yes"]');
  const closedStageValues = ["not_interested", "handled_by_corporate"];

  if (source?.name === "walkthrough_window" && source.checked) {
    if (walkthroughCheckbox) walkthroughCheckbox.checked = true;
    if (qualityYes) qualityYes.checked = true;
    closedStageValues.forEach((value) => {
      const closedCheckbox = form.querySelector(`input[name="focus_stage"][value="${value}"]`);
      if (closedCheckbox) closedCheckbox.checked = false;
    });
    const schedulePopover = form.querySelector("[data-schedule-walkthrough-popover]");
    if (schedulePopover) schedulePopover.hidden = true;
  } else if (source?.name === "walkthrough_window") {
    const hasWindowChoice = Boolean(form.querySelector('input[name="walkthrough_window"]:checked'));
    if (!hasWindowChoice && walkthroughCheckbox) walkthroughCheckbox.checked = false;
  } else if (source?.name === "focus_stage" && source.value === "walkthrough_set" && source.checked) {
    if (qualityYes) qualityYes.checked = true;
    closedStageValues.forEach((value) => {
      const closedCheckbox = form.querySelector(`input[name="focus_stage"][value="${value}"]`);
      if (closedCheckbox) closedCheckbox.checked = false;
    });
    const schedulePopover = form.querySelector("[data-schedule-walkthrough-popover]");
    if (schedulePopover) schedulePopover.hidden = false;
  } else if (source?.name === "focus_stage" && closedStageValues.includes(source.value) && source.checked) {
    if (walkthroughCheckbox) walkthroughCheckbox.checked = false;
    form.querySelectorAll('input[name="walkthrough_window"]').forEach((radio) => {
      radio.checked = false;
    });
  }
  const followUpChecked = Boolean(form.querySelector('input[name="focus_stage"][value="follow_up_needed"]')?.checked);
  const followUpWrap = form.querySelector("[data-follow-up-status-wrap]");
  if (followUpWrap) followUpWrap.classList.toggle("is-hidden", !followUpChecked);
  const decisionMakerYes = form.querySelector('input[name="focus_decision_maker"][value="yes"]')?.checked;
  const cleaningCrewYes = form.querySelector('input[name="focus_cleaning_crew"][value="yes"]')?.checked;
  const wantsQuoteYes = form.querySelector('input[name="focus_wants_quote"][value="yes"]')?.checked;
  const wantsWalkthroughYes = form.querySelector('input[name="focus_wants_quality_walkthrough"][value="yes"]')?.checked;
  toggleFocusConditionalField(form, "decision_maker", decisionMakerYes);
  toggleFocusConditionalField(form, "cleaning_crew", cleaningCrewYes);
  toggleFocusConditionalField(form, "wants_quote", wantsQuoteYes);
  const walkthroughSection = form.querySelector("[data-focus-walkthrough-section]");
  if (walkthroughSection) walkthroughSection.classList.toggle("is-hidden", !wantsWalkthroughYes);
  if (!wantsWalkthroughYes) {
    form.querySelectorAll('input[name="walkthrough_window"]').forEach((radio) => {
      radio.checked = false;
    });
    const walkthroughCheckbox = form.querySelector('input[name="focus_stage"][value="walkthrough_set"]');
    if (walkthroughCheckbox) walkthroughCheckbox.checked = false;
  } else if (source?.name === "focus_wants_quality_walkthrough") {
    const schedulePopover = form.querySelector("[data-schedule-walkthrough-popover]");
    if (schedulePopover) schedulePopover.hidden = false;
  }
  const outcome = form.querySelector('input[name="focus_qualification_outcome"]:checked')?.value || "";
  const outcomeWrap = form.querySelector("[data-focus-outcome-detail-wrap]");
  if (outcomeWrap) {
    outcomeWrap.classList.toggle("is-hidden", !(outcome === "partial" || outcome === "not_qualified"));
    const label = outcomeWrap.firstChild;
    if (label) label.textContent = outcome === "not_qualified" ? "Reason lead does not qualify" : "More qualification details";
    const textarea = outcomeWrap.querySelector("textarea");
    if (textarea) textarea.placeholder = outcome === "not_qualified" ? "Why does this lead not meet the qualifications?" : "What still needs to be confirmed?";
  }
}

function toggleFocusConditionalField(form, key, visible) {
  const wrap = form.querySelector(`[data-focus-conditional="${key}"]`);
  if (!wrap) return;
  wrap.classList.toggle("is-hidden", !visible);
  if (!visible) {
    wrap.querySelectorAll("input, textarea, select").forEach((field) => {
      field.value = "";
    });
  }
}

async function moveLeadFocus(direction) {
  const saved = await autosaveFocusLead({ includeNote: true });
  if (!saved) return;
  const rows = leadFocusRows();
  if (!rows.length) return;
  const currentIndex = rows.findIndex((row) => row.id === state.selectedId);
  const nextIndex = currentIndex >= 0 ? (currentIndex + direction + rows.length) % rows.length : 0;
  state.selectedId = rows[nextIndex].id;
  writeSalesFocusPlace({ leadId: state.selectedId, leadFocusMode: true });
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function deleteSelectedLeads() {
  if (!isSalesAdmin()) {
    setMessage("Only admins can delete sales leads.", "error");
    return;
  }
  const ids = [...state.selectedLeadIds].filter(id => state.leads.some(row => row.id === id && row.business_segment === "residential"));
  if (!ids.length || !supabase) return;
  const confirmed = window.confirm(`Delete ${ids.length} selected lead${ids.length === 1 ? "" : "s"} and attached sales follow-ups?`);
  if (!confirmed) return;

  state.message = `Deleting ${number(ids.length)} selected lead${ids.length === 1 ? "" : "s"}...`;
  state.messageTone = "";
  render();

  try {
    // The database cascades related records atomically, scoped to residential leads.
    const result = await supabase.from(SALES_TABLES.leads).delete().eq('business_segment','residential').in('id',ids);
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
  state.prospectPage=1;
  if (type === "owner") state.ownerFilter = value;
  if (type === "stage") state.stageFilter = value;
  if (type === "status") state.statusFilter = value;
  render();
}

function setLeadSort(key) {
  if (!key) return;
  if (state.leadSort?.key === key) {
    state.leadSort.direction = state.leadSort.direction === "asc" ? "desc" : "asc";
  } else {
    state.leadSort = { key, direction: key === "last_activity" ? "desc" : "asc" };
  }
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
  document.addEventListener('click', async event => {
    const button=event.target.closest?.('[data-training-seek]');
    if(!button)return;
    const video=document.getElementById('salesPortalTrainingVideo');
    const seconds=Number(button.dataset.trainingSeek);
    if(!video||!Number.isFinite(seconds)||seconds<0)return;
    if(video.dataset.trainingComplete==='false'&&seconds>Number(video.dataset.trainingWatched||0)+1)return;
    video.currentTime=seconds;
    video.scrollIntoView({block:'center',behavior:'smooth'});
    video.focus();
    try{await video.play();}catch{ /* Native controls remain available. */ }
  });
  bindSalesOperations();
  document.addEventListener('click',event=>{if(event.target.closest?.('[data-retry-workspace]'))refreshData();});
  document.addEventListener('click',async event=>{
    const button=event.target.closest?.('[data-team-create],[data-team-edit],[data-team-reset],[data-team-deactivate],[data-team-reactivate],[data-team-assign],[data-team-copy]');if(!button)return;
    if(!isSalesAdmin())return;
    if(button.hasAttribute('data-team-copy')){try{await navigator.clipboard.writeText(`Turnly Residential CRM\nhttps://sales.turnlypros.com\nUsername: ${state.modal.username}\nTemporary password: ${state.modal.temporary_password}\nChoose a new password at first sign-in.`);document.querySelector('#crmCredentialMessage').textContent='Copied. Share privately with this member.';}catch{document.querySelector('#crmCredentialMessage').textContent='Select and copy the details above.';}return;}
    if(button.dataset.teamAssign){state.modal={type:'assignment',fromTeam:true,operatorId:button.dataset.teamAssign,ids:state.rows.filter(r=>!r.sales_owner_id&&r.business_segment==='residential'&&!r.do_not_contact&&!['active','lost','follow_up'].includes(stageFor(r))).sort((a,b)=>a.id.localeCompare(b.id)).slice(0,50).map(r=>r.id)};render();updateAssignmentPreview(document.querySelector('[data-assignment-form]'));return;}
    const action=button.hasAttribute('data-team-create')?'create':button.dataset.teamEdit?'edit':button.dataset.teamReset?'reset':button.dataset.teamDeactivate?'deactivate':'reactivate';
    state.modal={type:'teamMember',action,userId:button.dataset.teamEdit||button.dataset.teamReset||button.dataset.teamDeactivate||button.dataset.teamReactivate};render();
  });
  document.addEventListener('input',event=>{if(event.target.id==='crmTeamSearch'){state.teamSearch=event.target.value;render();}const form=event.target.closest?.('[data-assignment-form]');if(form)updateAssignmentPreview(form);});
  document.addEventListener('change',event=>{const form=event.target.closest?.('[data-assignment-form]');if(form)updateAssignmentPreview(form);});
  document.addEventListener('submit',event=>{if(event.target.matches('[data-team-form]')){event.preventDefault();handleTeamForm(event.target);}});

  document.addEventListener("pointerdown", (event) => {
    const resizeHandle = event.target?.closest?.("[data-lead-column-resize]");
    if (resizeHandle) {
      const table = resizeHandle.closest(".sales-leads-table");
      const key = resizeHandle.dataset.leadColumnResize || "";
      if (!table || !key) return;
      event.preventDefault();
      leadColumnResize = {
        key,
        startX: event.clientX,
        startWidth: leadColumnWidth(key),
        table
      };
      document.body.classList.add("sales-column-resizing");
      resizeHandle.setPointerCapture?.(event.pointerId);
      return;
    }
    const option = event.target?.closest?.("[data-focus-lead-form] label");
    if (option?.classList?.contains("sales-walkthrough-time-card")) return;
    const radio = option?.querySelector?.('input[type="radio"]');
    if (radio) radio.dataset.wasChecked = radio.checked ? "true" : "false";
  });

  document.addEventListener("pointermove", (event) => {
    if (!leadColumnResize) return;
    resizeLeadColumn(leadColumnResize.key, leadColumnResize.startWidth + event.clientX - leadColumnResize.startX);
  });

  document.addEventListener("pointerup", () => {
    if (!leadColumnResize) return;
    leadColumnResize = null;
    document.body.classList.remove("sales-column-resizing");
  });

  document.addEventListener("keydown", (event) => {
    const resizeHandle = event.target?.closest?.("[data-lead-column-resize]");
    if (!resizeHandle || !["ArrowLeft", "ArrowRight"].includes(event.key)) return;
    event.preventDefault();
    const key = resizeHandle.dataset.leadColumnResize || "";
    resizeLeadColumn(key, leadColumnWidth(key) + (event.key === "ArrowRight" ? 24 : -24));
  });

  document.addEventListener("click", async (event) => {
    const target = event.target;
    const workButton=target.closest('[data-work-prospect]');if(workButton){state.selectedId=workButton.dataset.workProspect;state.leadFocusMode=true;if(state.page!=='leads'){window.location.href='sales-leads.html#'+encodeURIComponent(state.selectedId);return;}render();return;}
    const pageButton=target.closest('[data-prospect-page]');if(pageButton){state.prospectPage=Number(pageButton.dataset.prospectPage);render();return;}
    if(target.closest('[data-select-batch]')){state.selectedLeadIds=new Set(sortedLeadRows(baseFilteredRows()).slice(0,2000).map(r=>r.id));render();return;}
    if(target.closest('[data-clear-selection]')){state.selectedLeadIds.clear();render();return;}
    const libraryButton=target.closest('[data-library-kind]');if(libraryButton){state.libraryKind=libraryButton.dataset.libraryKind;state.libraryCategory='all';render();return;}
    const copyButton=target.closest('[data-copy-script]');if(copyButton){const item=(copyButton.dataset.copyKind==='objections'?SALES_OBJECTIONS:SALES_SCRIPTS)[Number(copyButton.dataset.copyScript)];if(item){try{await navigator.clipboard.writeText((item.text||item.response)+'\n\nNext step: '+item.next);copyButton.textContent='Copied';}catch{copyButton.textContent='Select and copy the text above';}}return;}
    if(target.closest('[data-focus-next],[data-focus-prev],[data-exit-lead-focus]')&&document.querySelector('[data-outreach-form][data-dirty="yes"]')&&!window.confirm('Leave without saving this conversation?'))return;
    const assignOne = target.closest?.('[data-assign-lead]');
    if (assignOne || target.closest?.('[data-assign-selected]')) {
      if (!isSalesAdmin()) return;
      const ids = assignOne ? [assignOne.dataset.assignLead] : [...state.selectedLeadIds];
      state.modal = {type:'assignment', ids:ids.filter(id=>recordById(id))};
      render(); return;
    }
    const previewField = target.closest?.("[data-sales-preview-field]");
    if (previewField) return;

    const leadSort = target.closest?.("[data-lead-sort]");
    if (leadSort) {
      setLeadSort(leadSort.dataset.leadSort);
      return;
    }

    const previewOpen = target.closest?.("[data-sales-preview-open]");
    if (previewOpen) {
      const context = updateSalesPreviewFromControls();
      window.location.href = adminPreviewTargetUrl(context);
      return;
    }

    const previewClear = target.closest?.("[data-sales-preview-clear]");
    if (previewClear) {
      clearAdminPreviewContext();
      window.location.href = "admin.html";
      return;
    }

    const focusRadioOption = target.closest?.("[data-focus-lead-form] label");
    const focusRadio = focusRadioOption?.classList?.contains("sales-walkthrough-time-card")
      ? null
      : focusRadioOption?.querySelector?.('input[type="radio"]');
    if (focusRadio?.dataset.wasChecked === "true") {
      event.preventDefault();
      focusRadio.checked = false;
      focusRadio.dataset.wasChecked = "false";
      const form = focusRadio.closest("[data-focus-lead-form]");
      syncFocusConditionalUi(form, focusRadio);
      await autosaveFocusLead();
      return;
    }

    if (target.closest("[data-profile-toggle]")) {
      state.profileOpen = !state.profileOpen;
      render();
      return;
    }

    if (!target.closest(".sales-profile")) {
      state.profileOpen = false;
    }

    if (target.closest("[data-sales-logout]")) {
      await autosaveFocusLead({ includeNote: true });
      await supabase?.auth.signOut();
      window.location.href = "sales-login.html";
      return;
    }

    const enterLeadFocus = target.closest("[data-enter-lead-focus]");
    if (enterLeadFocus) {
      const row = selectLeadFocusRecord(enterLeadFocus.dataset.selectRecord || "");
      if (!row) {
        setMessage("No prospects are available for the walkthrough checklist.", "error");
        return;
      }
      state.leadFocusMode = true;
      writeSalesFocusPlace({ leadId: row.id, leadFocusMode: true });
      render();
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    if (target.closest("[data-exit-lead-focus]")) {
      await autosaveFocusLead({ includeNote: true });
      writeSalesFocusPlace({ leadId: state.selectedId, leadFocusMode: false });
      state.leadFocusMode = false;
      render();
      return;
    }

    if (target.closest("[data-focus-prev]")) {
      await moveLeadFocus(-1);
      return;
    }

    if (target.closest("[data-focus-next]")) {
      await moveLeadFocus(1);
      return;
    }

    if (target.closest("[data-open-schedule-walkthrough]")) {
      const form = target.closest("[data-focus-lead-form]");
      const walkthroughYes = form?.querySelector('input[name="focus_wants_quality_walkthrough"][value="yes"]');
      if (walkthroughYes && !walkthroughYes.checked) {
        walkthroughYes.checked = true;
        syncFocusConditionalUi(form, walkthroughYes);
      }
      const popover = form?.querySelector("[data-schedule-walkthrough-popover]");
      if (popover) popover.hidden = false;
      return;
    }

    const walkthroughDay = target.closest("[data-walkthrough-day]");
    if (walkthroughDay) {
      const form = walkthroughDay.closest("[data-focus-lead-form]");
      const key = walkthroughDay.dataset.walkthroughDay || "";
      form?.querySelectorAll("[data-walkthrough-day]").forEach((button) => {
        const active = button.dataset.walkthroughDay === key;
        button.classList.toggle("active", active);
        button.setAttribute("aria-expanded", active ? "true" : "false");
      });
      form?.querySelectorAll("[data-walkthrough-times-panel]").forEach((panel) => {
        panel.hidden = panel.dataset.walkthroughTimesPanel !== key;
      });
      const empty = form?.querySelector("[data-walkthrough-time-empty]");
      if (empty) empty.classList.add("is-hidden");
      return;
    }

    if (target.closest("[data-close-schedule-walkthrough]")) {
      const form = target.closest("[data-focus-lead-form]");
      const popover = form?.querySelector("[data-schedule-walkthrough-popover]");
      if (popover) popover.hidden = true;
      return;
    }

    if (target.closest("[data-delete-selected-leads]")) {
      if (!isSalesAdmin()) {
        setMessage("Only admins can delete sales leads.", "error");
        return;
      }
      await deleteSelectedLeads();
      return;
    }

    const deleteAvailability = target.closest("[data-delete-availability]");
    if (deleteAvailability) {
      await deleteAvailabilitySlot(deleteAvailability.dataset.deleteAvailability);
      return;
    }

    if (target.closest("[data-open-import]")) {
      if (!isSalesAdmin()) {
        setMessage("Only admins can import prospects.", "error");
        return;
      }
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
      await autosaveFocusLead({ includeNote: true });
      if (!openLead.dataset.openLead && !isSalesAdmin()) {
        setMessage("Only admins can create new sales leads.", "error");
        return;
      }
      state.modal = { type: "lead", id: openLead.dataset.openLead || "" };
      render();
      return;
    }

    if(target.closest("[data-crm-close]")){state.selectedId=null;render();return;}
    const select = target.closest("[data-select-record]");
    if (select) {
      await autosaveFocusLead({ includeNote: true });
      state.selectedId = select.dataset.selectRecord;
      render();
      return;
    }

    const openWalkthrough = target.closest("[data-open-walkthrough]");
    if (openWalkthrough) {
      await autosaveFocusLead({ includeNote: true });
      state.modal = { type: "walkthrough", id: openWalkthrough.dataset.openWalkthrough || "" };
      render();
      return;
    }

    const openQuote = target.closest("[data-open-quote]");
    if (openQuote) {
      resetQuotePreview();
      state.modal = { type: "quote", id: openQuote.dataset.openQuote || "" };
      render();
      return;
    }

    const generateQuote = target.closest("[data-generate-quote-pdf]");
    if (generateQuote) {
      const form = generateQuote.closest("[data-quote-form]");
      try {
        await generateQuotePreview(form);
      } catch (error) {
        setInlineFormMessage(form, `Unable to generate quote: ${error.message}`, "error");
      }
      return;
    }

    const emailQuote = target.closest("[data-email-quote-pdf]");
    if (emailQuote) {
      const form = emailQuote.closest("[data-quote-form]");
      try {
        await emailQuotePreview(form);
      } catch (error) {
        setInlineFormMessage(form, `Unable to prepare email draft: ${error.message}`, "error");
      }
      return;
    }

    const sendQuoteButton = target.closest("[data-send-quote]");
    if (sendQuoteButton) {
      const rowId = sendQuoteButton.dataset.sendQuote;
      try {
        setMessage("Preparing Gmail quote draft...");
        const row = recordById(rowId);
        await emailQuoteForRow(row);
        setMessage(`Gmail opened with the quote email ready. Attach the downloaded PDF before sending from ${quoteSenderEmail()}.`, "success");
      } catch (error) {
        setMessage(`Unable to prepare quote email: ${error.message}`, "error");
      }
      return;
    }

    const openTask = target.closest("[data-open-task]");
    if (openTask) {
      await autosaveFocusLead({ includeNote: true });
      state.modal = { type: "task", id: openTask.dataset.openTask || "" };
      render();
      return;
    }

    const close = target.closest("[data-close-modal]");
    if (close) {
      resetQuotePreview();
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
    const outreach=event.target.closest('[data-outreach-form]');if(outreach)outreach.dataset.dirty='yes';
    if(event.target.id==='crmLibrarySearch'){state.librarySearch=event.target.value;window.clearTimeout(bindEvents.searchTimer);bindEvents.searchTimer=window.setTimeout(render,180);return;}
    if (event.target?.id === "salesGlobalSearch" || event.target?.id === "salesPageSearch") {
      state.search = event.target.value;state.prospectPage=1;
      window.clearTimeout(bindEvents.searchTimer);
      bindEvents.searchTimer = window.setTimeout(render, 180);
    }

    if (event.target?.matches('[data-focus-lead-form] textarea[name="focus_note"]')) {
      setFocusSaveStatus(event.target.value.trim() ? "Note will save when you move on." : "Autosaves as you work.");
    }
  });

  document.addEventListener("change", async (event) => {
    if(event.target.matches('[data-library-category]')){state.libraryCategory=event.target.value;render();return;}
    if(event.target.matches('[data-prospect-type]')){state.prospectType=event.target.value;state.prospectPage=1;render();return;}
    if(event.target.matches('[data-prospect-city]')){state.cityFilter=event.target.value;state.prospectPage=1;render();return;}
    if(event.target.matches("[data-crm-stage]")){await updateStage(event.target.dataset.crmStage,event.target.value);return;}
    if (event.target?.matches('[data-focus-lead-form] input[name="walkthrough_window"]')) {
      syncFocusConditionalUi(event.target.closest("[data-focus-lead-form]"), event.target);
      await autosaveFocusLead();
      return;
    }

    if (event.target?.matches("[data-sales-preview-field]")) {
      updateSalesPreviewFromControls();
      render();
      return;
    }

    if (event.target?.matches('[data-focus-lead-form] input[type="checkbox"], [data-focus-lead-form] input[type="radio"], [data-focus-lead-form] select, [data-focus-lead-form] input[type="text"], [data-focus-lead-form] input[type="email"], [data-focus-lead-form] textarea[name="focus_qualification_detail"]')) {
      syncFocusConditionalUi(event.target.closest("[data-focus-lead-form]"), event.target);
      await autosaveFocusLead();
      return;
    }

    if (event.target?.matches("[data-filter-owner]")) setFilter("owner", event.target.value);
    if (event.target?.matches("[data-filter-stage]")) setFilter("stage", event.target.value);
    if (event.target?.matches("[data-filter-status]")) setFilter("status", event.target.value);

    if (event.target?.matches("[data-set-stage-filter]")) setFilter("stage", event.target.dataset.setStageFilter);

    if (event.target?.matches("[data-lead-select]")) {
      if (!isSalesAdmin()) return;
      const id = event.target.dataset.leadSelect;
      if (event.target.checked) state.selectedLeadIds.add(id);
      else state.selectedLeadIds.delete(id);
      render();
      return;
    }

    if (event.target?.matches("[data-lead-select-all]")) {
      if (!isSalesAdmin()) return;
      const visibleIds = pagedProspects(baseFilteredRows()).rows.map((row) => row.id);
      if (event.target.checked) visibleIds.forEach((id) => state.selectedLeadIds.add(id));
      else visibleIds.forEach((id) => state.selectedLeadIds.delete(id));
      render();
      return;
    }

    if (event.target?.matches("[data-inline-stage]")) {
      await updateStage(event.target.dataset.inlineStage, event.target.value);
    }

    if (event.target?.matches("[data-availability-status]")) {
      await updateAvailabilityStatus(event.target.dataset.availabilityStatus, event.target.value);
      return;
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
    if(event.target.matches('[data-outreach-form]')){event.preventDefault();await handleOutreachForm(event.target);return;}
    if (event.target.matches('[data-assignment-form]')) {
      event.preventDefault(); await handleAssignmentForm(event.target); return;
    }
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
    } else if (form.matches("[data-availability-form]")) {
      event.preventDefault();
      await handleAvailabilityForm(form);
    }
  });

  document.addEventListener("focusout", async (event) => {
    if (event.target?.matches('[data-focus-lead-form] textarea[name="focus_note"], [data-focus-lead-form] input[type="text"], [data-focus-lead-form] input[type="email"], [data-focus-lead-form] textarea[name="focus_qualification_detail"]')) {
      await autosaveFocusLead({ includeNote: event.target.name === "focus_note" });
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

async function crmMessageRequest(values){
 const {data}=await supabase.auth.getSession();if(!data?.session)throw Error('Sign in again.');
 const response=await fetch('/api/crm-messages',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+data.session.access_token},body:JSON.stringify(values),signal:AbortSignal.timeout(15000)});
 const result=await response.json();if(!response.ok)throw Error(result.error||'Unable to load messages.');return result;
}
if (await requireSalesAccess()) {
 startMessageBadge(crmMessageRequest);
 installCalling({request:async values=>{
  const {data}=await supabase.auth.getSession();
  if(!data.session)throw new Error('Sign in again to call.');
  const r=await fetch('/api/crm-voice',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+data.session.access_token},body:JSON.stringify(values),signal:AbortSignal.timeout(20000)});
  const result=await r.json();if(!r.ok)throw new Error(result.error||'Calling is unavailable.');return result;
 }});
  const hashId = window.location.hash.replace("#", "");
  if (hashId&&hashId!=='notifications') {
    state.selectedId = hashId;
    if(state.page==="leads")state.leadFocusMode=true;
  } else {
    restoreSalesFocusPlace();
  }
  await refreshData(true,true);
  setInterval(async()=>{if(!await requireSalesAccess()){state.rows=[];state.leads=[];state.reps=[];}else if(!document.hidden){try{const result=await crmSalesRequest('notifications');if(state.salesContext){state.salesContext.notifications=result.notifications;const badge=document.querySelector('.sales-badge');if(badge)badge.textContent=result.notifications.length;}}catch{}}},60000);
}

function renderCrmOverview() {
 const rows=baseFilteredRows(),open=rows.filter(r=>!r.do_not_contact&&!['active','lost','follow_up'].includes(stageFor(r))),due=rows.filter(r=>!r.do_not_contact&&['lost','follow_up'].includes(stageFor(r))&&taskDue(r)&&new Date(taskDue(r))<=new Date()&&taskStatus(r)!=='completed'),purchased=rows.filter(r=>stageFor(r)==='active');
 return `<div class="crm-welcome"><div><p class="crm-eyebrow">TURNLY RESIDENTIAL SALES</p><h2>A useful gift. A real conversation.</h2><p>Help realtors give clients $100 toward a cleaner home.</p></div><a class="sales-primary-button" href="sales-leads.html">Work prospects →</a></div>
 <section class="sales-metric-grid crm-four">${metricCard('Open prospects',number(open.length),'People to move forward','users')}${metricCard('Realtor prospects',number(rows.filter(r=>r.prospect_type==='realtor').length),'In your current operator view','users','blue')}${metricCard('Follow-ups due',number(due.length),'Open follow-ups due now','clipboard-check','yellow')}${metricCard('Completed purchases',number(state.salesContext?.stats?.purchases||0),'Stripe-confirmed gift-card orders','check')}</section>
 ${renderReferralPanel()}${renderCrmNotifications()}<div class="crm-overview-grid"><article class="sales-panel"><div class="sales-panel-header"><h2>Pipeline at a glance</h2><a class="sales-link-action" href="crm-pipeline.html">Open pipeline →</a></div><div class="crm-stage-summary">${stageDefs.map(st=>{const count=rows.filter(r=>stageFor(r)===st.id).length;return `<div class="crm-stage-row"><span>${esc(st.label)}</span><div class="crm-bar"><i style="width:${rows.length?Math.round(count/rows.length*100):0}%"></i></div><strong>${number(count)}</strong></div>`}).join('')}</div></article>
 <article class="sales-panel crm-call-panel"><p class="crm-eyebrow">THE OFFER</p><h2>$100 Turnly gift cards</h2><p>Separate cards. Printable PDF after payment. No expiration. Eligible North Carolina service addresses only.</p><p>Each card is cleaning credit. The recipient pays any difference; one gift card can be used per online booking.</p><a class="sales-primary-button" target="_blank" rel="noopener" href="${GIFT_CARD_URL}">View purchase page ↗</a><a class="sales-secondary-button" href="crm-guide.html">Read the sales playbook</a></article></div>
 <div class="sales-two-column"><article class="sales-panel crm-call-panel"><h2>Next conversations</h2>${due.slice(0,8).map(r=>`<a class="crm-queue-item" href="sales-leads.html#${esc(r.id)}"><strong>${esc(recordTitle(r))}</strong><span>${esc(r.next_step||'Follow up')}</span></a>`).join('')||'<p>No overdue follow-ups in this view. Open Prospects to work your list.</p>'}</article><article class="sales-panel"><div class="sales-panel-header"><h2>Activity feed</h2></div>${renderRecentActivity()}</article></div>`;
}

function renderCrmPipeline() {
 const rows=baseFilteredRows().filter(r=>!r.do_not_contact&&!['lost','follow_up'].includes(stageFor(r))),stages=stageDefs.filter(st=>!['lost','follow_up'].includes(st.id));
 const selected=state.pipelineStage||'new_leads',page=pagedProspects(rows.filter(r=>stageFor(r)===selected));
 return `<article class="sales-panel">${renderFilters({placeholder:'Search prospects...'})}${renderProspectFilters()}<h2>Active pipeline</h2><p>Choose a stage count to work its leads. Follow-up and Not interested leads live in <a href="sales-tasks.html">Follow-ups</a>.</p><div class="crm-linear-pipeline">${stages.map((st,n)=>`<button class="crm-stage-step ${selected===st.id?'selected':''}" data-pipeline-stage="${st.id}"><small>${n+1}. ${esc(st.label)}</small><strong>${number(rows.filter(r=>stageFor(r)===st.id).length)}</strong><span>View leads →</span></button>`).join('')}</div><h3>${esc(stageLabel(selected))}</h3>${renderLeadTable(page.rows)}${renderProspectPager(page)}</article>`;
}

function renderCrmContacts(){
 const rows=baseFilteredRows(),selected=rows.find(r=>r.id===state.selectedId);
 return `<section class="crm-contact-layout"><article class="sales-panel">${renderFilters({placeholder:'Search name, email, phone, or property...'})}<div class="sales-table-wrap"><table class="sales-table"><thead><tr><th>Contact</th><th>Company / property</th><th>Email & phone</th><th>Owner</th><th>Stage</th></tr></thead><tbody>${rows.map(r=>`<tr><td><button class="crm-text-button" data-select-record="${esc(r.id)}">${esc(recordContact(r)||recordTitle(r))}</button></td><td><strong>${esc(recordTitle(r))}</strong><small>${esc(recordCompany(r))}</small></td><td><span>${esc(r.contact_email||'No email saved')}</span><small>${esc(r.contact_phone||'No phone saved')}</small></td><td>${esc(ownerName(r))}</td><td><span class="sales-status-pill ${esc(stageFor(r))}">${esc(stageLabel(stageFor(r)))}</span></td></tr>`).join('')||'<tr><td colspan="5">No contacts match this view.</td></tr>'}</tbody></table></div></article>${selected?renderLeadDetail(selected):''}</section>`;
}
async function crmTeamRequest(action,values={}) {
 const {data}=await supabase.auth.getSession();if(!data?.session)throw new Error('Please sign in again.');
 const response=await crmFetch('/api/crm-team',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+data.session.access_token},body:JSON.stringify({action,...values})});
 const result=await response.json();if(!response.ok)throw new Error(result.error||'Unable to update team access.');return result;
}
function renderCrmTeam(){
 const admin=isSalesAdmin(),search=normalize(state.teamSearch),members=state.reps.filter(p=>!search||normalize(`${p.full_name} ${p.username||''} ${p.status}`).includes(search));
 return `<div class="crm-welcome"><div><p class="crm-eyebrow">YOUR PEOPLE. THEIR PIPELINE.</p><h2>Build your sales team.</h2><p>${admin?'Create usernames, manage access and put leads in the right hands. No email addresses needed.':'Your team account and assigned opportunities.'}</p></div>${admin?'<button class="sales-primary-button" data-team-create>Add team member</button>':''}</div>
 <section class="sales-panel"><div class="sales-panel-header"><div><h2>Team members</h2><p>${state.reps.filter(p=>p.status==='active'&&p.enabled!==false).length} active · ${state.rows.filter(r=>!r.sales_owner_id).length} unassigned prospects</p></div><input id="crmTeamSearch" type="search" aria-label="Search team members" placeholder="Search name or username" value="${esc(state.teamSearch||'')}"></div>
 <div class="crm-team-grid">${members.map(p=>{const own=state.rows.filter(r=>r.sales_owner_id===p.id),open=own.filter(r=>!['active','lost','follow_up'].includes(stageFor(r))),active=p.status==='active'&&p.enabled!==false;return `<article class="crm-member-card"><div class="crm-member-head"><span class="sales-avatar">${esc(initials(p.full_name||'Team member'))}</span><div><h3>${esc(p.full_name||'Team member')}</h3><p>${p.username?'@'+esc(p.username):'Username not set'} · ${p.role==='admin'?'Administrator':'Sales member'}</p></div></div><span class="crm-member-status ${active?'':'inactive'}">${!active?'Inactive':p.must_change_password?'Password setup required':'Active'}</span><div class="crm-member-stats"><span><strong>${open.length}</strong>Open leads</span><span><strong>${own.filter(r=>stageFor(r)==='active').length}</strong>Purchased / booked</span></div><div class="crm-member-actions"><a class="sales-secondary-button" href="sales-leads.html?owner=${encodeURIComponent(p.id)}">View leads</a>${admin?`<button class="sales-secondary-button" data-remove-leads="${esc(p.id)}">Remove leads</button>`:''}${admin&&active?`<button class="sales-primary-button" data-team-assign="${esc(p.id)}">Assign leads</button>`:''}${admin&&(p.role!=='admin'||p.id===state.user?.id)?`<button class="sales-secondary-button" data-team-edit="${esc(p.id)}">${p.username?'Edit member':'Set username'}</button>`:''}${admin&&p.role!=='admin'&&p.username?`${active?`<button class="sales-secondary-button" data-team-reset="${esc(p.id)}">Reset password</button><button class="crm-danger-button" data-team-deactivate="${esc(p.id)}">Deactivate</button>`:`<button class="sales-primary-button" data-team-reactivate="${esc(p.id)}">Reactivate</button><a class="sales-secondary-button" href="sales-leads.html?owner=${encodeURIComponent(p.id)}">Reassign their leads</a>`}`:''}</div></article>`;}).join('')||'<p>No team members match this search.</p>'}</div></section>
 ${admin?'<div class="crm-onboarding"><h2>A simple start for every member</h2><p>1. Add a name and username. 2. Share their temporary password privately. 3. Assign leads. They will choose their own password at first sign-in. Password resets require a new password again; deactivation preserves their notes and lead ownership until you reassign them.</p></div>':''}`;
}
function renderTeamModal(){
 const m=state.modal,p=state.reps.find(p=>p.id===m.userId)||{};
 if(m.type==='teamCredentials')return renderModalShell('Login details ready','Share privately',`<div class="sales-modal-body"><p>Copy these details now. The temporary password is not saved in this page and cannot be viewed again after closing.</p><label>Username<input readonly value="${esc(m.username)}"></label><label>Temporary password<input readonly value="${esc(m.temporary_password)}" autocomplete="off"></label><p>Sign in at <strong>sales.turnlypros.com</strong>. The member must choose a new password before accessing leads.</p><button class="sales-primary-button" data-team-copy>Copy login details</button><p id="crmCredentialMessage" role="status"></p></div>`,'',true);
 const action=m.action||'create',edit=action==='edit',create=action==='create',deactivate=action==='deactivate';
 return renderModalShell(create?'Add team member':edit?'Edit team member':deactivate?'Deactivate member':action==='reactivate'?'Reactivate member':'Reset password','Team access',`<form data-team-form><div class="sales-modal-body">${create||edit?`${field('full_name','Full name',p.full_name||'')}${field('username','Username',p.username||'')}<p>3–32 letters, numbers, dots, underscores or hyphens. Usernames are not case-sensitive.</p>`:`<h3>${esc(p.full_name||p.username)}</h3><p>${deactivate?'This immediately blocks CRM access. Notes and lead ownership stay intact so you can reassign their work.':'Existing sessions will lose access. Share the new temporary password privately; they must replace it at sign-in.'}</p>`}${!edit&&!deactivate?'<label>Temporary password (optional)<input name="temporary_password" type="password" autocomplete="new-password" minlength="12" maxlength="128" placeholder="Leave blank to generate a strong password"></label><p>Use at least 12 characters if you choose your own.</p>':''}</div>${modalFooter(create?'Create member':edit?'Save member':deactivate?'Deactivate member':'Create temporary password')}</form>`,'',true);
}
async function handleTeamForm(form){
 const button=form.querySelector('[type="submit"]');if(button.disabled)return;button.disabled=true;
 try{const m=state.modal,values=Object.fromEntries(new FormData(form));const result=await crmTeamRequest(m.action||'create',{...values,user_id:m.userId});
 state.modal=null;await refreshData(false);
 if(result.temporary_password){state.modal={type:'teamCredentials',username:result.username,temporary_password:result.temporary_password};render();}else setMessage('Team member updated.','success');
 }catch(e){setInlineFormMessage(form,e.message,'error');}finally{button.disabled=false;}
}
function updateAssignmentPreview(form){
 const output=form.querySelector('[data-assignment-preview]');if(!output)return;
 const ids=[...form.querySelectorAll('[name="operator"]:checked')].map(i=>i.value),only=form.querySelector('[name="only_unassigned"]').checked;
 if(state.modal.fromTeam){const region=form.querySelector('[name=region]').value,city=form.querySelector('[name=city]').value;const count=Math.max(1,Math.min(2000,Number(form.querySelector('[name="batch_count"]').value)||1));state.modal.ids=state.rows.filter(r=>r.business_segment==='residential'&&!r.sales_owner_id&&!r.do_not_contact&&stageFor(r)==='new_leads'&&(!region||r.sales_region===region)&&(!city||r.sales_city===city)).sort((a,b)=>a.id.localeCompare(b.id)).slice(0,count).map(r=>r.id);}
 try{const plan=assignmentPlan(state.modal.ids,ids,only);output.innerHTML=`<strong>Assignment preview · ${plan.length} leads</strong>${ids.map(id=>`<p>${esc(state.reps.find(p=>p.id===id)?.full_name||'Member')}: <strong>${plan.filter(r=>r.operatorId===id).length}</strong> leads</p>`).join('')}`;}catch(e){output.textContent=ids.length?e.message:'Choose a sales member to preview the assignment.';}
}

function activeCrmOperators() {
  return state.reps.filter(rep => ['admin','sales','sales_team'].includes(normalize(rep.role)) && normalize(rep.status) === 'active' && rep.enabled !== false);
}
function assignmentPlan(ids, operatorIds, onlyUnassigned) {
  const operators = [...new Set(operatorIds)].filter(id=>activeCrmOperators().some(rep=>rep.id===id));
  if (!operators.length || operators.length !== new Set(operatorIds).size) throw new Error('Choose active sales operators.');
  const rows = [...new Set(ids)].map(recordById);
  if (!rows.length || rows.length > 2000 || rows.some(row=>!row || row.business_segment !== 'residential')) throw new Error('Select 1–2000 residential leads.');
  return rows.filter(row=>!onlyUnassigned || !row.sales_owner_id).sort((a,b)=>a.id.localeCompare(b.id))
    .map((row,index)=>({leadId:row.id,operatorId:operators[index % operators.length]}));
}
function renderAssignmentModal() {
  const rows=(state.modal.ids||[]).map(recordById).filter(Boolean),assigned=rows.filter(row=>row.sales_owner_id).length;
  return renderModalShell('Assign residential leads','Operator allocation',`
    <form data-assignment-form><div class="sales-modal-body">
      ${state.modal.fromTeam?`<label>Region<select name="region"><option value="">All regions</option>${[...new Set(state.rows.map(r=>r.sales_region).filter(Boolean))].sort().map(v=>`<option>${esc(v)}</option>`).join('')}</select></label><label>City<select name="city"><option value="">All cities</option>${[...new Set(state.rows.map(r=>r.sales_city).filter(Boolean))].sort().map(v=>`<option>${esc(v)}</option>`).join('')}</select></label><p>Regions organize contacts; they do not change Turnly’s eligible service areas.</p><label>How many unassigned leads?<input type="number" name="batch_count" min="1" max="2000" value="${rows.length||1}"></label><p>From new, contactable, unassigned residential prospects. Up to 2,000 at a time.</p>`:`<p><strong>${rows.length} selected leads</strong> · ${assigned} already assigned.</p>`}
      <p>Choose one member, or select several to split the leads evenly.</p>
      <fieldset class="crm-operator-options"><legend>Assign to operators</legend>
        ${activeCrmOperators().map(rep=>`<label><input type="checkbox" name="operator" value="${esc(rep.id)}" ${state.modal.operatorId===rep.id?'checked':''}><span><strong>${esc(rep.full_name||rep.email)}</strong><small>${rep.username?'@'+esc(rep.username):'Sales member'} · ${state.rows.filter(row=>row.sales_owner_id===rep.id && !['active','lost'].includes(stageFor(row))).length} open leads</small></span></label>`).join('') || '<p>No active operators. Add a member in the Team tab first.</p>'}
      </fieldset>
      <label class="crm-preserve-owner" ${state.modal.fromTeam?'hidden':''}><input type="checkbox" name="only_unassigned" checked> Only assign unassigned leads</label>
      ${state.modal.fromTeam?'':'<p>Uncheck to reassign existing owners. Changes are recorded in activity history.</p>'}
      <div class="crm-assignment-preview" data-assignment-preview role="status">Choose a sales member to preview the assignment.</div>
    </div>${modalFooter('Apply assignment')}</form>`, '', true);
}
async function handleAssignmentForm(form) {
  if (!isSalesAdmin()) return setInlineFormMessage(form,'Only administrators can assign leads.','error');
  const button=form.querySelector('[type="submit"]');
  if (button?.disabled) return;
  if (button) button.disabled=true;
  try {
    if(state.modal.fromTeam)updateAssignmentPreview(form);
    const ids=state.modal?.ids||[], operators=[...form.querySelectorAll('[name="operator"]:checked')].map(input=>input.value);
    const onlyUnassigned=form.querySelector('[name="only_unassigned"]').checked;
    const plan=assignmentPlan(ids,operators,onlyUnassigned);
    if (!plan.length) throw new Error('No eligible leads. Uncheck “Only assign unassigned leads” to reassign existing owners.');
    const {data,error}=state.modal.fromTeam?await supabase.rpc('crm_allocate_region',{p_operator_ids:operators,p_count:Number(form.querySelector('[name=batch_count]').value),p_region:form.querySelector('[name=region]').value,p_city:form.querySelector('[name=city]').value}):await supabase.rpc('assign_residential_leads',{p_lead_ids:ids,p_operator_ids:operators,p_only_unassigned:onlyUnassigned});
    if (error) throw error;
    state.modal=null; state.selectedLeadIds.clear();
    await refreshData(false);
    setMessage(`${Number(data)||0} residential lead assignments updated.`, 'success');
  } catch(error) { setInlineFormMessage(form,error.message,'error'); }
  finally { if(button) button.disabled=false; }
}

function prospectTypeLabel(type) {
 return ({realtor:'Realtor',brokerage:'Brokerage',homeowner:'Homeowner',relocation:'Relocation',business_gifting:'Business gifting',residential:'Residential client'})[type]||'Residential client';
}

function prospectTypeOptions() {
 return ['realtor','brokerage','homeowner','relocation','business_gifting','residential'].map(key=>[key,prospectTypeLabel(key)]);
}

function pagedProspects(rows) {
 const sorted=state.page==='tasks'?rows:sortedLeadRows(rows),pages=Math.max(1,Math.ceil(sorted.length/50));
 state.prospectPage=Math.max(1,Math.min(state.prospectPage||1,pages));
 return {rows:sorted.slice((state.prospectPage-1)*50,state.prospectPage*50),page:state.prospectPage,pages,total:sorted.length};
}

function renderProspectPager(p) {
 return `<nav class="crm-pager" aria-label="Prospect pages"><span>${p.total?((p.page-1)*50+1):0}–${Math.min(p.page*50,p.total)} of ${number(p.total)}</span><button class="sales-secondary-button" data-prospect-page="${p.page-1}" ${p.page===1?'disabled':''}>Previous page</button><span>Page ${p.page} of ${p.pages}</span><button class="sales-secondary-button" data-prospect-page="${p.page+1}" ${p.page===p.pages?'disabled':''}>Next page</button></nav>`;
}

function renderProspectFilters() {
 const cities=[...new Set(state.rows.map(r=>r.sales_city).filter(Boolean))].sort();
 return `<div class="crm-prospect-filters"><label>Prospect type<select class="sales-filter" data-prospect-type><option value="all">All prospect types</option>${prospectTypeOptions().map(([id,label])=>`<option value="${id}" ${state.prospectType===id?'selected':''}>${esc(label)}</option>`).join('')}</select></label><label>City<select class="sales-filter" data-prospect-city><option value="all">All cities</option>${cities.map(city=>`<option value="${esc(city)}" ${state.cityFilter===city?'selected':''}>${esc(city)}</option>`).join('')}</select></label></div>`;
}

function contactActions(row) {
 if(row.do_not_contact)return '<span class="sales-status-pill lost">Do not contact</span>';
 return `${row.contact_phone?`<button type="button" class="sales-primary-button" data-call-lead="${esc(row.id)}" data-call-label="${esc(row.contact_name||row.company_name||'Lead')}">Call lead · ${esc(row.contact_phone)}</button>`:'<span>No primary phone</span>'}${row.contact_email?`<a class="sales-link-action" href="mailto:${esc(row.contact_email)}">${esc(row.contact_email)}</a>`:'<small>No primary email</small>'}`;
}

function renderContactCard(row) {
 const source=row.source_contact||{},phones=[...new Set([source.phone,source.phone_1,source.phone_2,source.phone_3].filter(Boolean))],emails=[...new Set([source.email,source.email_2,source.email_3].filter(Boolean))];
 let website='';try{const u=new URL(row.sales_website||source.website);if(['http:','https:'].includes(u.protocol))website=u.href;}catch{}
 return `<article class="sales-panel crm-call-panel"><p class="crm-eyebrow">CONTACT DETAILS</p><h2>${esc(row.contact_name||recordTitle(row))}</h2><p>${esc(row.company_name||'')}</p>${contactActions(row)}<p>${esc([row.address,row.sales_city,row.sales_state,source.postal_code].filter(Boolean).join(', '))}</p>${website?`<a class="sales-link-action" href="${esc(website)}" target="_blank" rel="noopener">Website ↗</a>`:''}<button class="sales-primary-button crm-edit-primary" data-open-lead="${esc(row.id)}">Edit primary details</button>
 ${row.referral_agent_id?`<details class="crm-source-contact"><summary>All imported realtor contact information</summary><p>Original record details. Primary details above can be edited for sales outreach.</p><h3>Phone numbers</h3>${phones.map(v=>`<p>${row.do_not_contact?esc(v):`<a href="tel:${esc(v.replace(/[^\d+]/g,''))}">${esc(v)}</a>`}</p>`).join('')||'<p>None recorded</p>'}<h3>Email addresses</h3>${emails.map(v=>`<p>${row.do_not_contact?esc(v):`<a href="mailto:${esc(v)}">${esc(v)}</a>`}</p>`).join('')||'<p>None recorded</p>'}<p>${['email_1_phone','email_2_phone','email_3_phone'].filter(k=>source[k]).map(k=>`${esc(k.replaceAll('_',' '))}: ${esc(source[k])}`).join('<br>')}</p><p class="crm-note-text"><strong>Source notes:</strong> ${esc(source.notes||'None')}</p><small>Source: ${esc(source.source_file||row.lead_source||'Agent records')} · original status: ${esc(source.status||'new')} · text consent recorded: ${source.sms_consent?'yes':'no'}</small></details>`:''}</article>`;
}

async function handleOutreachForm(form) {
 const button=form.querySelector('[type="submit"]');if(button?.disabled)return;
 if(button)button.disabled=true;
 try {
  const values=readForm(form),id=form.dataset.recordId,stop=form.querySelector('[name="do_not_contact"]').checked;
  const stage=stop?'lost':values.pipeline_stage;if(!stageDefs.some(s=>s.id===stage))throw new Error('Choose a valid stage.');
  const payload={pipeline_stage:stage,do_not_contact:stop};
  await saveRecord(id,payload,`${stop?'Do not contact requested.':`Conversation saved · ${stageLabel(stage)}.`}${values.outreach_note?.trim()?' '+values.outreach_note.trim():''}`);
  form.dataset.dirty='';await refreshData(false);setMessage('Conversation saved. Follow-up timing is automatic.','success');
 }catch(error){setInlineFormMessage(form,error.message,'error');}finally{if(button)button.disabled=false;}
}

function knowledgeMatches(item) {
 const text=state.librarySearch.trim().toLowerCase();
 return (!text||JSON.stringify(item).toLowerCase().includes(text))&&(state.libraryCategory==='all'||[item.category,item.audience,item.channel].includes(state.libraryCategory));
}

function renderScriptsPage() {
 const kind=state.libraryKind||'scripts',all=kind==='objections'?SALES_OBJECTIONS:SALES_SCRIPTS,items=all.map((item,index)=>({...item,index})).filter(knowledgeMatches),categories=[...new Set(all.map(item=>item.category||item.audience))];
 return `<div class="crm-welcome"><div><p class="crm-eyebrow">THE CONVERSATION LIBRARY</p><h2>Know what to say. Know when to listen.</h2><p>${SALES_SCRIPTS.length} outreach scripts and ${SALES_OBJECTIONS.length} objection responses. Personalize every message before using it.</p></div><a href="crm-guide.html" class="sales-secondary-button">Team playbook</a></div>
 <div class="crm-library-toolbar"><div class="sales-tabs"><button class="sales-tab-button ${kind==='scripts'?'active':''}" data-library-kind="scripts">Outreach scripts (${SALES_SCRIPTS.length})</button><button class="sales-tab-button ${kind==='objections'?'active':''}" data-library-kind="objections">Objections & rejections (${SALES_OBJECTIONS.length})</button></div><label>Search library<input type="search" id="crmLibrarySearch" placeholder="Try closing gift, refund, budget, email…" value="${esc(state.librarySearch)}"></label><label>Category<select class="sales-filter" data-library-category><option value="all">All categories</option>${categories.map(c=>`<option value="${esc(c)}" ${state.libraryCategory===c?'selected':''}>${esc(c)}</option>`).join('')}</select></label><span role="status">${items.length} results</span></div>
 <div class="crm-script-grid">${items.map(item=>`<details class="sales-panel crm-script-card"><summary><span class="crm-eyebrow">${esc(item.category||item.audience)}${item.channel?' · '+esc(item.channel):''}</span><h3>${esc(item.title)}</h3><span>Read response + next step</span></summary><div class="crm-script-body"><p class="crm-script-text">${esc(item.text||item.response)}</p><div class="crm-next-step"><strong>Next step</strong><p>${esc(item.next)}</p></div><button class="sales-secondary-button" data-copy-script="${item.index}" data-copy-kind="${kind}">Copy ${kind==='scripts'?'script':'response'}</button></div></details>`).join('')||emptyState('No matching scripts','Try a different search or category.')}</div>`;
}

function renderPlaybookPage() {
 return `<div class="crm-welcome"><div><p class="crm-eyebrow">THE RESIDENTIAL SALES PLAYBOOK</p><h2>Sell useful help for the home.</h2><p>A practical process for realtor gift cards and residential services.</p></div><a class="sales-primary-button" href="crm-scripts.html">Open scripts & objections →</a></div>
 <section class="sales-panel"><h2>Your required quick start</h2><p>Complete the short introduction, review, and seller agreement in Onboarding. The full playbook and portal walkthrough below are available whenever you need them.</p><a class="sales-primary-button" href="crm-onboarding.html">Open onboarding</a></section><section class="sales-panel crm-playbook-section" id="sales-introduction" style="box-sizing:border-box;max-width:min(100%,calc(100vw - 32px))" aria-labelledby="salesIntroTitle"><p class="crm-eyebrow">START HERE · 2½ MINUTES</p><h2 id="salesIntroTitle">Turnly sales: realtor gift cards</h2><p>Meet Turnly, understand the realtor gift-card mission, and practice a useful sales conversation.</p><video  controls playsinline preload="metadata" aria-label="Turnly sales introduction training video" style="display:block;width:100%;max-width:1100px;aspect-ratio:16/9;background:#102f40;border-radius:14px;margin:20px auto"><source src="assets/training/sales-quick-start.mp4" type="video/mp4">Your browser does not support video playback.</video><p>Use the player to pause, seek, adjust volume, or watch full screen.</p><details><summary>Lesson recap</summary><ul><li>Turnly provides residential and commercial cleaning. This team's focus is residential cleaning gift cards for realtors.</li><li>Each card is $100 of cleaning credit, with no expiration. Eligible NC addresses and current purchase terms apply.</li><li>Ask about current closing gifts, upcoming closings, client locations, and budget.</li><li>Position cleaning as practical help during a move. Avoid guarantees about future referrals or reviews.</li><li>Recommend a relevant quantity, respect objections and contact preferences, and offer the checkout link with permission.</li></ul></details></section>
 <section class="sales-panel crm-playbook-section" id="sales-portal-training" style="box-sizing:border-box;max-width:min(100%,calc(100vw - 32px))" aria-labelledby="salesPortalTrainingTitle"><p class="crm-eyebrow">PORTAL WALKTHROUGH · 4 MINUTES 52 SECONDS</p><h2 id="salesPortalTrainingTitle">Using your Turnly sales portal</h2><p>Follow the actual portal screens to work leads, make calls, send gift-card links, and manage follow-ups. All contact details and activity shown are fictional training examples.</p><video  id="salesPortalTrainingVideo" controls playsinline preload="metadata" aria-label="Using your Turnly sales portal training video" style="display:block;width:100%;max-width:1100px;aspect-ratio:16/9;background:#102f40;border-radius:14px;margin:20px auto"><source src="assets/training/sales-portal-walkthrough.mp4" type="video/mp4"><track kind="captions" src="assets/training/sales-portal-walkthrough.vtt" srclang="en" label="English"><track kind="chapters" src="assets/training/sales-portal-walkthrough-chapters.vtt" srclang="en" label="Chapters">Your browser does not support video playback.</video><p>Pause, turn on captions, or use full screen to see the controls clearly.</p><details><summary>Jump to a topic</summary><div class="sales-row-actions" style="flex-wrap:wrap;justify-content:flex-start;margin-top:16px"><button type="button" class="sales-secondary-button" data-training-seek="0">0:00 · Start with your overview</button><button type="button" class="sales-secondary-button" data-training-seek="28.055">0:28 · Find your personal checkout link</button><button type="button" class="sales-secondary-button" data-training-seek="53.04">0:53 · Choose a prospect</button><button type="button" class="sales-secondary-button" data-training-seek="78.861">1:18 · Prepare the conversation</button><button type="button" class="sales-secondary-button" data-training-seek="105.79">1:45 · Call without leaving the portal</button><button type="button" class="sales-secondary-button" data-training-seek="138.829">2:18 · Email the gift-card link</button><button type="button" class="sales-secondary-button" data-training-seek="169.598">2:49 · Text the right recipient</button><button type="button" class="sales-secondary-button" data-training-seek="198.978">3:18 · Save notes and honor opt-outs</button><button type="button" class="sales-secondary-button" data-training-seek="228.786">3:48 · Work the follow-up banks</button><button type="button" class="sales-secondary-button" data-training-seek="261.98">4:21 · Finish with a clear pipeline</button></div></details><details><summary>Read the walkthrough transcript</summary><h3>Start with your overview</h3><p>Your Turnly sales portal brings your prospect list, calling, purchase links, and follow-ups together. These are actual portal screens with fictional training records. Start on Overview. Check your open prospects, follow-ups due, and completed purchases. Completed purchases come from confirmed gift-card payments. Changing a lead&#x27;s stage by hand does not create a paid order.</p><h3>Find your personal checkout link</h3><p>Scroll to Your link. Your credited sales. Copy link puts your personal gift-card checkout address on your clipboard. Use your own link so a completed purchase can be attributed to you. Email a contact and Text a contact open the sending form. This example link is for training only. In your account, use the real link shown here.</p><h3>Choose a prospect</h3><p>Open Prospects in the left menu. Use the search box and filters to find the person you need. My leads limits the view to your assignments. Filter by stage when you want to work new prospects first. Review the name and contact details, then choose Work prospect. Start calling opens the lead-working flow; it does not automatically place a telephone call.</p><h3>Prepare the conversation</h3><p>The lead workspace puts contact details on the left and your conversation outcome on the right. Read the saved notes before contacting someone. Use Edit primary details to correct a name, email, or phone number. Open scripts and objections gives you conversation guidance. Ask about upcoming closings, current closing gifts, and whether their clients live within Turnly&#x27;s service area.</p><h3>Call without leaving the portal</h3><p>Click Call lead beside the phone number. The call panel opens at the lower right. Check that it names the correct prospect, then click Start call when you are ready. Allow microphone access in your browser and use a headset. Once connected, the panel provides mute, keypad, and hang-up controls. End the call before navigating away. Recent calls to this lead shows call results. If dialing is blocked by a budget limit, contact your administrator.</p><h3>Email the gift-card link</h3><p>Choose Email link in the lead workspace. Confirm the selected contact and the destination email. The message includes your tracked checkout link and the contact&#x27;s name. Check the consent box only after verifying that the recipient agreed to receive Turnly emails at that address. Then choose Send email. A provider acceptance means the sending service accepted the message; it does not guarantee delivery. No message is being sent in this training.</p><h3>Text the right recipient</h3><p>Text link uses the phone number saved on the lead. If the person asks you to use another number, choose Send to different number. Enter that number, confirm consent for texts to that number, then scroll down to Send text. This override applies only to that message; it does not change the saved contact. Send to different email works the same way for email. Never use an alternate recipient to bypass an opt-out.</p><h3>Save notes and honor opt-outs</h3><p>After the conversation, select the accurate Outcome or Stage, add a useful conversation note, and click Save conversation. Follow-up and Not interested move the lead out of the active pipeline and into the follow-up flow. The first reminder is due in thirty days. If the person says not to contact them again, select the red Do Not Contact checkbox and save. That permanently stops outreach and removes the lead from follow-ups.</p><h3>Work the follow-up banks</h3><p>Open Follow-ups to see the age-based groups. Thirty-day means zero through thirty days. Sixty-day means thirty-one through sixty. Ninety-day means sixty-one through ninety. Long term means ninety-one days or more. Click a group&#x27;s count to see its leads. Age starts when the lead enters Follow-up or Not interested. Editing notes or switching between those two outcomes does not restart the clock. Review prior notes and contact preferences before reaching out.</p><h3>Finish with a clear pipeline</h3><p>Deal pipeline shows the active stages and the number of leads in each one. Click a stage count to work that group. Follow-up and Not interested leads are handled in Follow-ups, and Do Not Contact leads are excluded. Your daily routine is simple: review your assigned prospects, prepare, call, share your personal checkout link with permission, and save the outcome. Return to Team playbook whenever you need the training or sales guidance.</p></details>${isSalesAdmin()?'<p><strong>Admin spending controls:</strong> Open <a href="crm-communications.html">Calling &amp; texting</a> → Shared budget &amp; safety settings to edit the daily/monthly budgets, call length, or pause settings. Click Save budget settings. Individual limits are under Sales member allowances.</p>':''}</section>
 <div class="crm-playbook-layout"><nav class="sales-panel crm-playbook-index" aria-label="Playbook sections"><a href="#sales-introduction">Watch the introduction</a><a href="#sales-portal-training">Learn the sales portal</a>${PLAYBOOK.map((s,i)=>`<a href="#playbook-${i}">${esc(s.title)}</a>`).join('')}<a href="#gift-card-facts">Current product facts</a></nav><div>${PLAYBOOK.map((section,i)=>`<section class="sales-panel crm-playbook-section" id="playbook-${i}"><p class="crm-eyebrow">${String(i+1).padStart(2,'0')}</p><h2>${esc(section.title)}</h2>${(section.paragraphs||[]).map(p=>`<p>${esc(p)}</p>`).join('')}${section.steps?`<ol>${section.steps.map(step=>`<li>${esc(step)}</li>`).join('')}</ol>`:''}</section>`).join('')}
 <section class="sales-panel crm-playbook-section" id="gift-card-facts"><h2>Current product facts</h2><p>Check the live purchase page and terms before quoting a policy. These points describe the current offer.</p><ul>${PRODUCT_FACTS.map(p=>`<li>${esc(p)}</li>`).join('')}</ul><div class="sales-row-actions"><a href="${GIFT_CARD_URL}" target="_blank" rel="noopener" class="sales-primary-button">Gift-card purchase page ↗</a><a href="gift-card-terms.html" target="_blank" rel="noopener" class="sales-secondary-button">Current gift-card terms ↗</a><a href="${RESIDENTIAL_URL}" target="_blank" rel="noopener" class="sales-secondary-button">Residential website ↗</a></div></section></div></div>`;
}
function crmSalesRequest(action,values={}){
 return supabase.auth.getSession().then(async({data})=>{if(!data?.session)throw new Error('Please sign in again.');const response=await crmFetch('/api/crm-sales',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+data.session.access_token},body:JSON.stringify({action,...values})});const result=await response.json();if(!response.ok)throw new Error(result.error||'Unable to load sales data.');return result;});
}
function salesMoney(c){return money((c||0)/100);}
function renderReferralPanel(){
 const c=state.salesContext||{},own=c.own||{};
 if(!c.link)return `<article class="sales-panel"><h2>Complete your quick start</h2><p>Watch the introduction, review the essentials, and sign your seller agreement to unlock calls and your purchase link.</p><a class="sales-primary-button" href="crm-onboarding.html">Open onboarding</a></article>`;
 return `<article class="sales-panel crm-referral-panel"><div><p class="crm-eyebrow">YOUR PERSONAL CHECKOUT</p><h2>Your link. Your credited sales.</h2><p>Share this checkout with prospects. Earn 10% of each buyer’s first completed purchase. Repeat purchases earn no commission; buyers are matched by checkout email.</p></div><label>Your gift-card checkout link<input id="crmReferralLink" readonly value="${esc(c.link?.url||'')}" aria-label="Your referral link"></label><div class="sales-row-actions"><button class="sales-primary-button" data-copy-referral>Copy link</button><button class="sales-secondary-button" data-send-link="" data-channel="email">Email a contact</button><button class="sales-secondary-button" data-send-link="" data-channel="sms">Text a contact</button></div><p>${number(own.purchases||0)} credited purchases · ${salesMoney(own.gross_cents)} gross sales · ${salesMoney(own.commission_cents)} earned commissions · <a href="crm-earnings.html">View payment status</a>${!c.settings?.commission_mode?' · Commission rate not set':own.unrated?' · '+number(own.unrated)+' earlier orders need a rate':''}</p><p class="crm-muted">Email: ${c.sending?.email?'connected':'setup required'} · Text: ${c.sending?.sms?'connected':'setup required'}</p></article>`;
}
function renderCrmNotifications(){
 const notices=state.salesContext?.notifications||[];
 return `<article id="notifications" class="sales-panel"><h2>Notifications <span class="sales-status-pill">${notices.length}</span></h2>${notices.map(n=>`<div class="crm-notification"><a href="${n.lead_id?'sales-leads.html#'+esc(n.lead_id):'crm-team.html'}"><strong>${esc(n.title)}</strong><small>${esc(formatDateTime(n.due_at))}</small></a><button class="sales-secondary-button" data-ack-notice="${esc(n.id)}">Dismiss</button></div>`).join('')||'<p>You’re caught up. Monthly reminders and lead-supply alerts appear here when due.</p>'}</article>`;
}
function renderSalesDashboard(){
 const stats=state.salesContext?.stats||{},clients=stats.clients||[],search=normalize(state.buyerSearch||''),matches=clients.filter(c=>!search||normalize(c.name+' '+c.email).includes(search));
 const page=Math.max(1,Math.min(state.buyerPage||1,Math.ceil(matches.length/50)||1)),shown=matches.slice((page-1)*50,page*50);
 return `<div class="crm-welcome"><div><p class="crm-eyebrow">ACTUAL GIFT-CARD SALES</p><h2>Revenue you can reconcile.</h2><p>All-time Stripe-confirmed orders, recorded in Supabase. Pending checkouts and manually edited stages never count.</p></div><button class="sales-secondary-button" data-retry-workspace>Refresh totals</button></div><section class="sales-metric-grid crm-four">${metricCard('Gross sales',salesMoney(stats.gross_cents),'Before refunds','check')}${metricCard('Cards purchased',number(stats.cards||0),'$100 cards issued','file-text')}${metricCard('Completed purchases',number(stats.purchases||0),'One per paid order','check')}${metricCard('Realtor buyers',number(stats.realtor_buyers||0),'Distinct normalized buyer emails','users')}</section><article class="sales-panel"><h2>Sales reconciliation</h2><p>Refunds: <strong>${salesMoney(stats.refund_cents)}</strong> · After refunds: <strong>${salesMoney((stats.gross_cents||0)-(stats.refund_cents||0))}</strong> · Under review / disputed: <strong>${salesMoney(stats.held_cents)}</strong></p><p>${number(stats.buyers||0)} unique buying clients. Realtor buyers identify themselves at checkout. Repeat purchases by the same email count as one buyer and separate purchases. Commissions: 10% of the buyer’s first completed purchase only, matched by checkout email. Refunds reduce earned commissions; disputed orders are held. Historical purchases remain counted after refunds; refunded dollars are shown separately.</p><p>Conversion rate is measured for attributed realtor leads below; buyers without a matched lead are included in buyer totals.</p>${state.salesContext?.conversion?`<p><strong>${state.salesContext.conversion.buyers}</strong> matched realtor leads purchased / <strong>${state.salesContext.conversion.prospects}</strong> realtor prospects · <strong>${state.salesContext.conversion.prospects?(100*state.salesContext.conversion.buyers/state.salesContext.conversion.prospects).toFixed(1):'0.0'}%</strong> conversion</p>`:''}</article><article class="sales-panel"><h2>Sales by team member</h2><div class="sales-table-wrap"><table class="sales-table"><thead><tr><th>Sales member</th><th>Purchases</th><th>Cards</th><th>Gross sales</th><th>Earned commissions</th></tr></thead><tbody>${(state.salesContext?.memberStats||[]).map(m=>`<tr><td>${esc(state.reps.find(r=>r.id===m.user_id)?.full_name||'Sales member')}</td><td>${m.purchases}</td><td>${m.cards}</td><td>${salesMoney(m.gross_cents)}</td><td>${salesMoney(m.commission_cents)}</td></tr>`).join('')||'<tr><td colspan="5">No attributed completed purchases yet.</td></tr>'}</tbody></table></div></article><article class="sales-panel"><div class="sales-panel-header"><h2>Sales by client</h2><input id="crmBuyerSearch" type="search" value="${esc(state.buyerSearch||'')}" placeholder="Search buyer name or email" aria-label="Search buyers"></div><div class="sales-table-wrap"><table class="sales-table"><thead><tr><th>Buyer</th><th>Type</th><th>Purchases</th><th>Cards</th><th>Gross sales</th><th>Refunds</th></tr></thead><tbody>${shown.map(c=>`<tr><td><strong>${esc(c.name)}</strong><small>${esc(c.email)}</small></td><td>${c.realtor?'Realtor':'Other buyer'}</td><td>${c.purchases}</td><td>${c.cards}</td><td>${salesMoney(c.gross_cents)}</td><td>${salesMoney(c.refund_cents)}</td></tr>`).join('')||'<tr><td colspan="6">No completed purchases match this view.</td></tr>'}</tbody></table></div><div class="crm-pager"><button class="sales-secondary-button" data-buyer-page="${page-1}" ${page===1?'disabled':''}>Previous</button><span>${matches.length} clients · Page ${page}</span><button class="sales-secondary-button" data-buyer-page="${page+1}" ${page*50>=matches.length?'disabled':''}>Next</button></div></article>`;
}
function renderQuickSend(row){
 return `<article class="sales-panel crm-call-panel"><h2>Send your purchase link</h2><p>Recipient details come from this lead. Confirm permission before sending.</p><div class="sales-row-actions" style="flex-wrap:wrap;justify-content:flex-start"><button class="sales-primary-button" data-send-link="${esc(row.id)}" data-channel="email" ${row.do_not_contact||!row.contact_email?'disabled':''}>Email link</button><button class="sales-secondary-button" data-send-link="${esc(row.id)}" data-channel="sms" ${row.do_not_contact||!row.contact_phone?'disabled':''}>Text link</button><button class="sales-secondary-button" data-send-link="${esc(row.id)}" data-channel="email" data-alternate-recipient ${row.do_not_contact?'disabled':''}>Send to different email</button><button class="sales-secondary-button" data-send-link="${esc(row.id)}" data-channel="sms" data-alternate-recipient ${row.do_not_contact?'disabled':''}>Send to different number</button></div></article>`;
}
function recipientOptions(m,channel){return state.rows.filter(r=>!r.do_not_contact&&(r.id===m.leadId||!m.recipientSearch||normalize(recordTitle(r)+' '+r.contact_email+' '+r.contact_phone).includes(normalize(m.recipientSearch)))).sort((a,b)=>(b.id===m.leadId)-(a.id===m.leadId)).slice(0,50).map(r=>`<option value="${esc(r.id)}" ${r.id===m.leadId?'selected':''}>${esc(recordTitle(r))} · ${esc(channel==='email'?r.contact_email||'No email':r.contact_phone||'No phone')}</option>`).join('');}
function renderSendModal(){
 const m=state.modal,row=recordById(m.leadId),channel=m.channel||'email';
 return renderModalShell('Send gift-card checkout','Your credited sales link',`<form data-send-checkout><div class="sales-modal-body"><label>Find a contact<input type="search" id="crmRecipientSearch" placeholder="Search name or email" value="${esc(m.recipientSearch||'')}"></label><label>Contact<select name="lead_id" data-send-recipient required><option value="">Choose a saved lead</option>${recipientOptions(m,channel)}</select></label><p>${m.alternate?'Saved contact (overridden below). ':''}Sending by <strong>${channel==='email'?'email':'text'}</strong> to <strong>${esc(row?(channel==='email'?row.contact_email:row.contact_phone)||'Missing contact information':'Select a contact above')}</strong>.</p>${m.alternate?`<label>Send to a different ${channel==='email'?'email address':'phone number'}<input name="recipient_override" type="${channel==='email'?'email':'tel'}" required maxlength="254" placeholder="${channel==='email'?'name@example.com':'+1 919 555 0123'}"></label><p>This changes only this message’s recipient. The saved lead stays unchanged.</p>`:''}<p>Your message includes the contact’s name, your name, your tracked checkout link, the $100 card amount, service-area restrictions, and opt-out instructions.</p><label class="crm-consent"><input type="checkbox" name="consent" required> I verified that this contact agreed to receive ${channel==='email'?'emails':'text messages'} from Turnly at this address or number.</label><p>${state.salesContext?.sending?.[channel]?'Sending records the consent confirmation and provider receipt in lead activity.':'This channel needs its sending service connected before messages can be sent.'}</p><p>Only an accepted provider response is reported as accepted; it does not guarantee delivery.</p></div>${modalFooter('Send '+(channel==='email'?'email':'text'))}</form>`,'',true);
}
function renderRemoveModal(){
 const p=state.reps.find(p=>p.id===state.modal.userId),rows=state.rows.filter(r=>r.sales_owner_id===p?.id);
 return renderModalShell('Remove assigned leads','Return leads to the shared pool',`<form data-remove-leads-form><div class="sales-modal-body"><h3>${esc(p?.full_name||'Team member')}</h3><p>Notes and pipeline stages stay with each lead. Their owner is cleared, so they can be assigned again.</p><label>Leads to remove<select name="scope">${stageDefs.map(st=>`<option value="${st.id}">${esc(st.label)} (${rows.filter(r=>stageFor(r)===st.id).length})</option>`).join('')}<option value="followups">All follow-up flow (${rows.filter(r=>['lost','follow_up'].includes(stageFor(r))).length})</option><option value="all">All assigned leads (${rows.length})</option></select></label></div>${modalFooter('Remove assignments')}</form>`,'',true);
}
function bindSalesOperations(){
 Object.assign(pageConfig,{sales:{title:'Sales dashboard',subtitle:'Confirmed gift-card purchases, clients, and sales totals.'}});
 document.addEventListener('click',async event=>{
  const b=event.target.closest?.('[data-copy-referral],[data-send-link],[data-followup-bank],[data-pipeline-stage],[data-ack-notice],[data-remove-leads],[data-buyer-page]');if(!b)return;
  try{
   if(b.hasAttribute('data-copy-referral')){await navigator.clipboard.writeText(state.salesContext.link.url);setMessage('Your checkout link was copied.','success');}
   if(b.hasAttribute('data-send-link')){state.modal={type:'sendLink',leadId:b.dataset.sendLink,channel:b.dataset.channel,alternate:b.hasAttribute('data-alternate-recipient'),requestId:crypto.randomUUID()};render();}
   if(b.dataset.followupBank){state.followUpBank=b.dataset.followupBank;state.prospectPage=1;render();}
   if(b.dataset.pipelineStage){state.pipelineStage=b.dataset.pipelineStage;state.prospectPage=1;render();}
   if(b.dataset.ackNotice){await crmSalesRequest('ack',{id:b.dataset.ackNotice});state.salesContext.notifications=state.salesContext.notifications.filter(n=>n.id!==b.dataset.ackNotice);render();}
   if(b.dataset.removeLeads&&isSalesAdmin()){state.modal={type:'removeLeads',userId:b.dataset.removeLeads};render();}
   if(b.dataset.buyerPage){state.buyerPage=Number(b.dataset.buyerPage);render();}
  }catch(e){setMessage(e.message,'error');}
 });
 document.addEventListener('change',event=>{if(event.target.matches('[data-send-recipient]')){state.modal.leadId=event.target.value;state.modal.requestId=crypto.randomUUID();render();}});
 document.addEventListener('input',event=>{if(event.target.name==='recipient_override'){state.modal.requestId=crypto.randomUUID();event.target.form.elements.consent.checked=false;}if(event.target.id==='crmRecipientSearch'){state.modal.recipientSearch=event.target.value;document.querySelector('[data-send-recipient]').innerHTML='<option value="">Choose a saved lead</option>'+recipientOptions(state.modal,state.modal.channel);}if(event.target.id==='crmBuyerSearch'){state.buyerSearch=event.target.value;state.buyerPage=1;render();const field=document.querySelector('#crmBuyerSearch');field?.focus();field?.setSelectionRange(field.value.length,field.value.length);}});
 document.addEventListener('submit',async event=>{
  const f=event.target;if(!f.matches('[data-send-checkout],[data-remove-leads-form]'))return;event.preventDefault();const b=f.querySelector('[type=submit]');if(b.disabled)return;b.disabled=true;
  try{
   if(f.matches('[data-send-checkout]')){const r=await crmSalesRequest('send',{lead_id:f.elements.lead_id.value,consent:f.elements.consent.checked,channel:state.modal.channel,request_id:state.modal.requestId,recipient_override:f.elements.recipient_override?.value});if(r.message.status!=='accepted')throw new Error(r.message.error||'This message is still processing. Do not send it again until its status is confirmed.');state.modal=null;await refreshData(false);setMessage('Message accepted by the sending service.','success');}
   else{const r=await supabase.rpc('crm_remove_operator_leads_by_status',{p_operator:state.modal.userId,p_status:f.elements.scope.value});if(r.error)throw r.error;state.modal=null;await refreshData(false);setMessage(`${r.data} lead assignments removed. Notes were preserved.`,'success');}
  }catch(e){setInlineFormMessage(f,e.message,'error');}finally{b.disabled=false;}
 });
}
