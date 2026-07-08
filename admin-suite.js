import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const suiteEnv = window.__ENV || {};
const suiteSupabase = suiteEnv.SUPABASE_URL && suiteEnv.SUPABASE_ANON_KEY
  ? createClient(suiteEnv.SUPABASE_URL, suiteEnv.SUPABASE_ANON_KEY)
  : null;

const navSections = [
  {
    title: "",
    links: [
      { key: "dashboard", label: "Dashboard", href: "dashboard.html", icon: "home" },
      { key: "command-center", label: "Command Center", href: "admin.html", icon: "layout-grid" }
    ]
  },
  {
    title: "Sales",
    links: [
      { key: "leads", label: "Leads", href: "leads.html", icon: "triangle" },
      { key: "walkthroughs", label: "Walkthroughs", href: "walkthroughs.html", icon: "calendar-days" },
      { key: "quotes", label: "Quotes", href: "quotes.html", icon: "badge-dollar" },
      { key: "contracts-pending", label: "Contracts Pending", href: "contracts-pending.html", icon: "file-signature" }
    ]
  },
  {
    title: "Operations",
    links: [
      { key: "contracts", label: "Contracts", href: "contracts.html", icon: "briefcase" },
      { key: "schedule", label: "Schedule", href: "schedule.html", icon: "calendar" },
      { key: "coverage-center", label: "Coverage Center", href: "coverage-center.html", icon: "shield" },
      { key: "assignments", label: "Assignments", href: "assignments.html", icon: "clipboard-list" },
      { key: "property-units", label: "Property Units", href: "property-units.html", icon: "building" }
    ]
  },
  {
    title: "Contractors",
    links: [
      { key: "directory", label: "Directory", href: "directory.html", icon: "users" },
      { key: "onboarding", label: "Onboarding", href: "onboarding.html", icon: "user-plus" },
      { key: "documents-compliance", label: "Documents & Compliance", href: "documents-compliance.html", icon: "file-check" },
      { key: "availability", label: "Availability", href: "availability.html", icon: "clock" },
      { key: "performance", label: "Performance", href: "performance.html", icon: "activity" }
    ]
  },
  {
    title: "Quality",
    links: [
      { key: "qa-queue", label: "QA Queue", href: "qa-queue.html", icon: "message-square" },
      { key: "checklists", label: "Checklists", href: "checklists.html", icon: "file-check" },
      { key: "qa-analytics", label: "QA Analytics", href: "qa-analytics.html", icon: "bar-chart" },
      { key: "videos", label: "Video Library", href: "videos.html", icon: "video" }
    ]
  },
  {
    title: "Clients",
    links: [
      { key: "client-directory", label: "Client Directory", href: "client-directory.html", icon: "building" },
      { key: "contacts", label: "Contacts", href: "contacts.html", icon: "contact" }
    ]
  },
  {
    title: "Reports",
    links: [
      { key: "reports-sales", label: "Sales", href: "reports-sales.html", icon: "wallet" },
      { key: "reports-operations", label: "Operations", href: "reports-operations.html", icon: "settings" },
      { key: "contractor-performance", label: "Contractor Performance", href: "contractor-performance.html", icon: "trophy" },
      { key: "growth", label: "Growth", href: "growth.html", icon: "trending-up" }
    ]
  }
];

const stageLabels = [
  ["new_leads", "New Lead", "green"],
  ["contacted", "Contacted", "blue"],
  ["walkthrough", "Walkthrough Scheduled", "purple"],
  ["quote_sent", "Quote Sent", "yellow"],
  ["contract_out", "Contract Out", "indigo"],
  ["active", "Won", "green"],
  ["lost", "Lost", "red"]
];

const pipelineStages = [
  ["new_leads", "New Leads", "green"],
  ["walkthrough", "Walkthrough", "blue"],
  ["quote_sent", "Quote Sent", "yellow"],
  ["contract_out", "Contract Out", "purple"],
  ["active", "Active", "green"]
];

const commandCenterDefaultWidgetIds = ["action-items", "coverage-requests", "qa-alerts", "schedule"];
const commandCenterStorageKey = "turnlyAdminCommandCenterWidgets";
const commandCenterWidgetCatalog = [
  { id: "action-items", title: "Action Items", icon: "clipboard-list", href: "assignments.html" },
  { id: "coverage-requests", title: "Coverage Requests", icon: "shield", href: "coverage-center.html" },
  { id: "qa-alerts", title: "QA Alerts", icon: "alert", href: "qa-queue.html" },
  { id: "schedule", title: "Today's Schedule", icon: "calendar", href: "schedule.html" }
];
const commandCenterState = {
  widgetIds: null,
  preferencesLoaded: false,
  filters: {
    "action-items": "all",
    "coverage-requests": "all",
    "qa-alerts": "all"
  },
  scheduleView: "day",
  actionItems: [],
  coverageRequests: [],
  qaAlerts: [],
  scheduleItems: []
};
const leadTable = "portal_properties";
const leadOptionalColumns = [
  "company_name",
  "contact_name",
  "contact_phone",
  "contact_email",
  "property_type",
  "city",
  "state",
  "postal_code",
  "lead_source",
  "lead_notes",
  "expected_close_date",
  "lead_value",
  "sales_owner_id",
  "sales_owner_name",
  "next_step",
  "next_step_due_at",
  "last_activity_at"
];
const leadSourceOptions = ["", "Website", "Referral", "Outbound", "Property Manager", "Google", "Existing Client", "Other"];
const leadPropertyTypeOptions = ["", "Office", "Retail", "Medical", "Multifamily", "Industrial", "Mixed Use", "Other"];
const leadState = {
  rows: [],
  user: null,
  profile: null,
  selectedId: null,
  view: "pipeline",
  search: "",
  ownerFilter: "all",
  stageFilter: "all",
  sourceFilter: "all",
  isSaving: false
};
const walkthroughOptionalColumns = [
  "company_name",
  "contact_name",
  "contact_email",
  "sales_owner_id",
  "sales_owner_name",
  "walkthrough_type",
  "walkthrough_location",
  "walkthrough_at",
  "walkthrough_end_at",
  "walkthrough_assigned_to",
  "walkthrough_status",
  "walkthrough_notes",
  "last_activity_at"
];
const walkthroughTypeOptions = [
  "",
  "Initial Walkthrough",
  "Follow-up Walkthrough",
  "Scope Review",
  "Quality Review",
  "Virtual Walkthrough"
];
const walkthroughStatusOptions = [
  ["scheduled", "Scheduled"],
  ["confirmed", "Confirmed"],
  ["completed", "Completed"],
  ["cancelled", "Cancelled"]
];
const walkthroughState = {
  rows: [],
  user: null,
  profile: null,
  selectedId: null,
  view: "calendar",
  calendarMode: "week",
  dateCursor: new Date(),
  search: "",
  statusFilter: "all",
  assigneeFilter: "all",
  isSaving: false
};
const clientTable = "clients";
const clientOptionalColumns = [
  "company_name",
  "property_name",
  "address",
  "city",
  "state",
  "postal_code",
  "access_notes",
  "primary_contact_name",
  "primary_contact_email",
  "primary_contact_phone",
  "status",
  "client_type",
  "region",
  "market",
  "property_count",
  "service_model",
  "unit_count",
  "unit_notes",
  "monthly_recurring_revenue",
  "prospect_projected_revenue",
  "projected_annual_turnovers",
  "projected_monthly_turnovers",
  "projected_turnover_revenue",
  "annual_revenue",
  "contract_start_date",
  "renewal_date",
  "account_manager_id",
  "account_manager_name",
  "account_manager_ids",
  "account_manager_names",
  "tags",
  "notes",
  "created_by"
];
const clientStatusOptions = [
  ["active", "Active"],
  ["prospect", "Prospect"],
  ["onboarding", "Onboarding"],
  ["paused", "Paused"],
  ["inactive", "Inactive"]
];
const clientTypeOptions = ["", "Commercial", "Residential", "Property Manager", "HOA", "Retail", "Medical", "Industrial", "Other"];
const clientServiceModelOptions = [
  ["apartment_turnover", "Apartment Turnover"],
  ["monthly_commercial", "Monthly Commercial"],
  ["hybrid", "Hybrid"],
  ["other", "Other"]
];
const clientTurnoverMonthOptions = [
  ["jan", "Jan"],
  ["feb", "Feb"],
  ["mar", "Mar"],
  ["apr", "Apr"],
  ["may", "May"],
  ["jun", "Jun"],
  ["jul", "Jul"],
  ["aug", "Aug"],
  ["sep", "Sep"],
  ["oct", "Oct"],
  ["nov", "Nov"],
  ["dec", "Dec"]
];
const clientState = {
  rows: [],
  user: null,
  profile: null,
  managers: [],
  selectedId: null,
  search: "",
  statusFilter: "all",
  typeFilter: "all",
  managerFilter: "all",
  isSaving: false,
  isDeleting: false,
  autoSaveTimer: null,
  autoSaveQueued: false,
  autoSaveLastSignature: ""
};
const assignmentTable = "assignment_blocks";
const assignmentOptionalColumns = [
  "property_id",
  "address",
  "service_type",
  "pay_amount",
  "scope",
  "supplies_notes",
  "special_instructions",
  "priority",
  "assignment_type",
  "recurrence_frequency",
  "recurrence_interval",
  "recurrence_end_date",
  "auto_renewal",
  "recurring_group_id",
  "source_assignment_id",
  "preferred_first",
  "preferred_contractor_ids",
  "preferred_contractor_names",
  "preferred_until",
  "visibility",
  "declined_contractor_ids",
  "created_by",
  "accepted_at",
  "claimed_at",
  "started_by",
  "started_at",
  "completed_at",
  "completed_by",
  "checklist_completed_at",
  "checklist_responses",
  "metadata",
  "completion_notes"
];
const assignmentFrequencyOptions = [
  ["one_time", "One Time"],
  ["daily", "Daily"],
  ["weekly", "Weekly"],
  ["monthly", "Monthly"]
];
const assignmentWeekdayOptions = [
  [0, "Sun"],
  [1, "Mon"],
  [2, "Tue"],
  [3, "Wed"],
  [4, "Thu"],
  [5, "Fri"],
  [6, "Sat"]
];
const assignmentStatusOptions = [
  ["open", "Open"],
  ["preferred_pending", "Preferred Pending"],
  ["claimed", "Claimed"],
  ["in_progress", "In Progress"],
  ["completed", "Completed"],
  ["qa_pending", "QA Pending"],
  ["cancelled", "Cancelled"],
  ["declined", "Declined"],
  ["draft", "Draft"]
];
const assignmentPriorityOptions = [
  ["normal", "Normal"],
  ["high", "High"],
  ["urgent", "Urgent"]
];
const assignmentPageSizeOptions = [30, 50, 100];
const assignmentState = {
  rows: [],
  properties: [],
  contractors: [],
  user: null,
  profile: null,
  search: "",
  statusFilter: "open",
  frequencyFilter: "all",
  contractorFilter: "all",
  pageSize: 30,
  currentPage: 1,
  selectedIds: new Set(),
  editingId: null,
  isSaving: false,
  isGenerating: false,
  isBulkSaving: false
};
const propertyUnitsTable = "property_units";
const checklistTemplatesTable = "checklist_templates";
const checklistModulesTable = "checklist_modules";
const propertyUnitState = {
  properties: [],
  units: [],
  selectedPropertyId: "",
  search: "",
  user: null,
  isSaving: false,
  isDeleting: false
};
const checklistState = {
  templates: [],
  savedModules: [],
  properties: [],
  units: [],
  selectedTemplateId: "",
  selectedModuleId: "",
  selectedPropertyId: "",
  selectedUnitIds: new Set(),
  defaultModuleCounts: {},
  unitModuleCounts: {},
  builder: null,
  user: null,
  isSaving: false,
  isSavingModule: false,
  isApplying: false
};
const topbarState = {
  user: null,
  profile: null,
  loaded: false,
  loading: false
};

const pages = {
  "dashboard": {
    title: "Dashboard",
    subtitle: "Your operational overview and actionable items",
    render: renderCommandCenter
  },
  "command-center": {
    title: "Command Center",
    subtitle: "Your operational overview and actionable items",
    render: renderCommandCenter
  },
  "leads": {
    title: "Leads",
    subtitle: "Track and manage new business opportunities",
    action: { label: "Add Lead", icon: "plus" },
    render: renderLeads
  },
  "walkthroughs": {
    title: "Walkthroughs",
    subtitle: "Schedule and manage property walkthroughs",
    action: { label: "Schedule Walkthrough", icon: "plus" },
    render: renderWalkthroughs
  },
  "quotes": {
    title: "Quotes",
    subtitle: "Create, send, and manage quotes for potential clients",
    action: { label: "New Quote", icon: "plus" },
    render: renderQuotes
  },
  "contracts-pending": {
    title: "Contracts Pending",
    subtitle: "Track contracts that have been sent and are awaiting signature",
    action: { label: "Export", icon: "download", tone: "secondary" },
    render: renderContractsPending
  },
  "contracts": {
    title: "Contracts",
    subtitle: "Manage and oversee all active client contracts",
    action: { label: "Export", icon: "download", tone: "secondary" },
    render: renderContracts
  },
  "schedule": {
    title: "Schedule",
    subtitle: "View and manage all scheduled cleanings",
    render: renderSchedule
  },
  "coverage-center": {
    title: "Coverage Center",
    subtitle: "Manage coverage requests and contractor availability",
    action: { label: "New Request", icon: "plus" },
    render: renderCoverageCenter
  },
  "assignments": {
    title: "Assignments",
    subtitle: "Manage and track cleaning assignments across your portfolio",
    action: { label: "New Assignment", icon: "plus" },
    render: renderAssignments
  },
  "property-units": {
    title: "Property Units",
    subtitle: "Select a property and manage unit pricing in one place",
    action: { label: "Add Unit", icon: "plus" },
    render: renderPropertyUnits
  },
  "checklists": {
    title: "Checklists",
    subtitle: "Build reusable QA checklists and assign them to properties or units",
    action: { label: "New Checklist", icon: "plus" },
    render: renderChecklists
  },
  "directory": {
    title: "Directory",
    subtitle: "View and manage your contractor network",
    action: { label: "Export", icon: "download", tone: "secondary" },
    render: renderDirectory
  },
  "onboarding": {
    title: "Onboarding",
    subtitle: "Track and manage contractor onboarding progress",
    render: renderOnboarding
  },
  "documents-compliance": {
    title: "Documents & Compliance",
    subtitle: "Manage contractor documents and monitor compliance requirements",
    action: { label: "Upload Document", icon: "upload" },
    render: renderDocumentsCompliance
  },
  "availability": {
    title: "Availability",
    subtitle: "Manage contractor availability and set preferences",
    render: renderAvailability
  },
  "performance": {
    title: "Performance",
    subtitle: "Track contractor performance and key metrics",
    render: renderPerformance
  },
  "qa-queue": {
    title: "Quality",
    subtitle: "Ensure work meets your standards with comprehensive quality assurance",
    render: () => renderQuality("qa-queue")
  },
  "qa-reviews": {
    title: "Quality",
    subtitle: "Ensure work meets your standards with comprehensive quality assurance",
    render: () => renderQuality("qa-reviews")
  },
  "qa-analytics": {
    title: "Quality",
    subtitle: "Ensure work meets your standards with comprehensive quality assurance",
    render: () => renderQuality("qa-analytics")
  },
  "videos": {
    title: "Quality",
    subtitle: "Ensure work meets your standards with comprehensive quality assurance",
    action: { label: "Upload Video", icon: "upload", tone: "secondary" },
    render: () => renderQuality("videos")
  },
  "client-directory": {
    title: "Clients",
    subtitle: "Manage and monitor your clients in one place.",
    action: { label: "Add Client", icon: "plus" },
    render: () => renderClients("client-directory")
  },
  "contacts": {
    title: "Clients",
    subtitle: "Manage and view all clients and their account details.",
    action: { label: "Add Contact", icon: "plus" },
    render: () => renderClients("contacts")
  },
  "reports-sales": {
    title: "Sales",
    subtitle: "Track pipeline performance and deal activity.",
    actions: [
      { label: "Export", icon: "download", tone: "secondary" },
      { label: "Add Deal", icon: "plus" }
    ],
    render: renderSalesReport
  },
  "reports-operations": {
    title: "Operations",
    subtitle: "Monitor operational performance and team productivity.",
    actions: [
      { label: "Export", icon: "download", tone: "secondary" },
      { label: "Date Range", icon: "calendar", tone: "secondary" }
    ],
    render: renderOperationsReport
  },
  "contractor-performance": {
    title: "Contractor Performance",
    subtitle: "Track and evaluate contractor performance and reliability.",
    actions: [
      { label: "Export", icon: "download", tone: "secondary" },
      { label: "Date Range", icon: "calendar", tone: "secondary" }
    ],
    render: renderContractorPerformanceReport
  },
  "growth": {
    title: "Growth",
    subtitle: "Analyze business growth, trends, and key performance indicators over time.",
    actions: [
      { label: "Export", icon: "download", tone: "secondary" },
      { label: "Date Range", icon: "calendar", tone: "secondary" }
    ],
    render: renderGrowthReport
  }
};

const iconPaths = {
  activity: '<path d="M22 12h-4l-3 7-6-14-3 7H2"/>',
  alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  "badge-dollar": '<circle cx="12" cy="12" r="9"/><path d="M12 7v10"/><path d="M15 9.5c-.8-.7-1.8-1-3-1-1.7 0-3 .8-3 2s1.3 1.8 3 2 3 .8 3 2-1.3 2-3 2c-1.2 0-2.3-.4-3.2-1.2"/>',
  "bar-chart": '<path d="M3 3v18h18"/><path d="M8 17V9"/><path d="M13 17V5"/><path d="M18 17v-6"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
  briefcase: '<path d="M10 6V5a2 2 0 0 1 2-2h0a2 2 0 0 1 2 2v1"/><path d="M3 7h18v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"/><path d="M3 13h18"/>',
  building: '<path d="M3 21h18"/><path d="M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16"/><path d="M9 8h1"/><path d="M14 8h1"/><path d="M9 12h1"/><path d="M14 12h1"/><path d="M9 16h1"/><path d="M14 16h1"/>',
  calendar: '<path d="M8 2v4"/><path d="M16 2v4"/><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M3 10h18"/>',
  "calendar-days": '<path d="M8 2v4"/><path d="M16 2v4"/><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M3 10h18"/><path d="M8 14h.01"/><path d="M12 14h.01"/><path d="M16 14h.01"/><path d="M8 18h.01"/><path d="M12 18h.01"/><path d="M16 18h.01"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  "chevron-down": '<path d="m6 9 6 6 6-6"/>',
  "chevron-right": '<path d="m9 18 6-6-6-6"/>',
  "clipboard-list": '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M8 11h8"/><path d="M8 16h8"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  contact: '<path d="M16 2v4"/><path d="M8 2v4"/><rect x="3" y="4" width="18" height="18" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M6 20c1.5-3 10.5-3 12 0"/>',
  document: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><path d="M8 13h8"/><path d="M8 17h5"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/>',
  "file-check": '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><path d="m9 15 2 2 4-5"/>',
  "file-signature": '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><path d="M8 18c2-4 4-4 6 0"/><path d="M8 14h6"/>',
  filter: '<path d="M22 3H2l8 9v7l4 2v-9Z"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>',
  home: '<path d="m3 11 9-8 9 8"/><path d="M5 10v11h14V10"/><path d="M9 21v-7h6v7"/>',
  "layout-grid": '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>',
  "line-chart": '<path d="M3 3v18h18"/><path d="m7 16 4-4 3 3 5-7"/>',
  list: '<path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/>',
  map: '<path d="M9 18 3 21V6l6-3 6 3 6-3v15l-6 3Z"/><path d="M9 3v15"/><path d="M15 6v15"/>',
  "message-square": '<path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z"/>',
  more: '<circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/>',
  minus: '<path d="M5 12h14"/>',
  plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
  refresh: '<path d="M21 12a9 9 0 0 1-15.4 6.4L3 16"/><path d="M3 21v-5h5"/><path d="M3 12a9 9 0 0 1 15.4-6.4L21 8"/><path d="M21 3v5h-5"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  settings: '<path d="M12 15.5A3.5 3.5 0 1 0 12 8a3.5 3.5 0 0 0 0 7.5Z"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.6V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/>',
  star: '<path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8-6.2-3.3L5.8 21 7 14.2l-5-4.9 6.9-1Z"/>',
  target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  "trending-up": '<path d="m3 17 6-6 4 4 8-8"/><path d="M14 7h7v7"/>',
  triangle: '<path d="m12 3 9 18H3Z"/>',
  trophy: '<path d="M8 21h8"/><path d="M12 17v4"/><path d="M7 4h10v5a5 5 0 0 1-10 0Z"/><path d="M17 5h3a2 2 0 0 1-2 4h-1"/><path d="M7 5H4a2 2 0 0 0 2 4h1"/>',
  trash: '<path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="m19 6-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8 12 3 7 8"/><path d="M12 3v12"/>',
  user: '<path d="M20 21a8 8 0 0 0-16 0"/><circle cx="12" cy="7" r="4"/>',
  "user-plus": '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6"/><path d="M22 11h-6"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9"/><path d="M16 3.1a4 4 0 0 1 0 7.8"/>',
  video: '<path d="m22 8-6 4 6 4V8Z"/><rect x="2" y="6" width="14" height="12" rx="2"/>',
  wallet: '<path d="M21 12V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5Z"/><path d="M16 12h5"/><path d="M17 12v4"/>',
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

function icon(name, className = "") {
  const path = iconPaths[name] || iconPaths.grid;
  return `<span class="suite-icon ${className}" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${path}</svg></span>`;
}

function setText(id, value) {
  const node = document.getElementById(id);
  if (node) node.textContent = value ?? "";
}

function getPageKey() {
  const explicit = document.body.dataset.adminPage;
  if (explicit) return explicit;
  const file = location.pathname.split("/").pop() || "admin.html";
  const map = { "admin.html": "command-center" };
  return map[file] || file.replace(/\.html$/, "");
}

const navCollapseStorageKey = "turnlyAdminCollapsedNavSections";

function navSectionKey(title) {
  return String(title || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function readStoredCollapsedNavSections() {
  try {
    return new Set(JSON.parse(localStorage.getItem(navCollapseStorageKey) || "[]"));
  } catch {
    return new Set();
  }
}

function readCollapsedNavSections(activeKey) {
  const collapsedSections = readStoredCollapsedNavSections();
  const activeSection = navSections.find((section) => section.links.some((link) => link.key === activeKey));
  if (activeSection?.title) {
    collapsedSections.delete(navSectionKey(activeSection.title));
  }
  return collapsedSections;
}

function saveCollapsedNavSections(collapsedSections) {
  try {
    localStorage.setItem(navCollapseStorageKey, JSON.stringify(Array.from(collapsedSections)));
  } catch {
    // Collapse state is helpful, not required.
  }
}

function metric(label, value = "0", meta = "from last 7 days", iconName = "activity", tone = "green", attrs = "") {
  return `
    <article class="metric-card ${tone}">
      <div class="metric-icon-wrap">${icon(iconName)}</div>
      <div class="metric-body">
        <span>${esc(label)}</span>
        <strong ${attrs}>${esc(value)}</strong>
        <small>${esc(meta)}</small>
      </div>
    </article>
  `;
}

function panel(title, body, options = {}) {
  const subtitle = options.subtitle ? `<p>${options.rawSubtitle ? options.subtitle : esc(options.subtitle)}</p>` : "";
  const action = options.action ? actionLink(options.action.label, options.action.icon, options.action.href, options.action.tone) : "";
  const panelKey = options.key || title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const menu = options.menu ? `
    <div class="widget-menu-wrap">
      <button class="ghost-icon-btn" type="button" aria-label="${esc(title)} options" aria-expanded="false" data-widget-menu-toggle="${esc(panelKey)}">${icon("more")}</button>
      <div class="widget-menu-panel" data-widget-menu="${esc(panelKey)}" hidden>
        <button type="button" data-widget-menu-action="refresh" data-widget-id="${esc(panelKey)}">${icon("refresh")}<span>Refresh</span></button>
        <button type="button" data-widget-menu-action="hide" data-widget-id="${esc(panelKey)}">${icon("minus")}<span>Hide Widget</span></button>
        ${options.href ? `<a href="${esc(options.href)}">${icon("chevron-right")}<span>Open Page</span></a>` : ""}
      </div>
    </div>
  ` : "";
  return `
    <section class="suite-panel ${options.className || ""}">
      <div class="panel-head">
        <div>
          <h2>${esc(title)}</h2>
          ${subtitle}
        </div>
        <div class="panel-actions">${action}${menu}</div>
      </div>
      ${body}
    </section>
  `;
}

function actionLink(label, iconName = "", href = "#", tone = "") {
  return `<a class="${tone === "secondary" ? "secondary-action" : "primary-action"}" href="${href || "#"}">${iconName ? icon(iconName) : ""}<span>${esc(label)}</span></a>`;
}

function actionButton(label, iconName = "", id = "", tone = "") {
  return `<button ${id ? `id="${esc(id)}"` : ""} class="${tone === "secondary" ? "secondary-action" : "primary-action"}" type="button">${iconName ? icon(iconName) : ""}<span>${esc(label)}</span></button>`;
}

function tabs(items, active) {
  return `<div class="suite-tabs">${items.map(([key, label, href]) => `<a class="suite-tab ${key === active ? "active" : ""}" href="${href || "#"}">${esc(label)}</a>`).join("")}</div>`;
}

function commandTabs(widgetId, items, active) {
  return `
    <div class="suite-tabs" role="tablist">
      ${items.map(([key, label]) => `
        <button class="suite-tab command-filter-tab ${key === active ? "active" : ""}" type="button" data-command-filter="${esc(widgetId)}" data-command-filter-value="${esc(key)}">${esc(label)}</button>
      `).join("")}
    </div>
  `;
}

function toolbar(left = "", right = "") {
  return `<div class="suite-toolbar"><div class="toolbar-left">${left}</div><div class="toolbar-right">${right}</div></div>`;
}

function chip(label, active = false, iconName = "") {
  return `<button class="view-chip ${active ? "active" : ""}" type="button">${iconName ? icon(iconName) : ""}<span>${esc(label)}</span></button>`;
}

function scheduleModeButton(key, label, iconName, active = false) {
  return `<button class="view-chip schedule-view-toggle ${active ? "active" : ""}" type="button" data-schedule-view="${esc(key)}">${icon(iconName)}<span>${esc(label)}</span></button>`;
}

function selectControl(label, options = ["All"], value = "") {
  return `
    <label class="suite-field">
      <span>${esc(label)}</span>
      <select>
        ${options.map((option) => `<option ${option === value ? "selected" : ""}>${esc(option)}</option>`).join("")}
      </select>
    </label>
  `;
}

function inputControl(label, placeholder = "", type = "text") {
  return `
    <label class="suite-field">
      <span>${esc(label)}</span>
      <input type="${esc(type)}" placeholder="${esc(placeholder)}" />
    </label>
  `;
}

function filters(title = "Filters", fields = [], options = {}) {
  return `
    <aside class="filter-card">
      <div class="filter-head"><h2>${esc(title)}</h2><button type="button">Clear All</button></div>
      <div class="filter-grid">${fields.join("")}</div>
      <div class="filter-actions">
        <button class="secondary-action" type="button"><span>Clear Filters</span></button>
        <button class="primary-action" type="button"><span>Apply Filters</span></button>
      </div>
      ${options.extra || ""}
    </aside>
  `;
}

function emptyState(iconName, title, text = "", button = "") {
  return `
    <div class="empty-state">
      <div class="empty-icon">${icon(iconName)}</div>
      <strong>${esc(title)}</strong>
      ${text ? `<p>${esc(text)}</p>` : ""}
      <div class="empty-lines"><span></span><span></span></div>
      ${button}
    </div>
  `;
}

function tableFrame(headers, empty, options = {}) {
  const rows = options.rows || "";
  const pagination = options.pagination === false ? "" : `<div class="table-foot"><span>Showing 0 of 0 ${esc(options.itemName || "results")}</span>${pager()}</div>`;
  const bodyId = options.bodyId ? ` id="${esc(options.bodyId)}"` : "";
  return `
    <div class="table-card ${options.className || ""}">
      ${options.toolbar || ""}
      <div class="table-scroll">
        <table class="suite-table">
          <thead><tr>${headers.map((header, index) => `<th>${index === 0 && options.checkbox ? '<input type="checkbox" />' : esc(header)}</th>`).join("")}</tr></thead>
          <tbody${bodyId}>${rows}</tbody>
        </table>
      </div>
      ${empty || ""}
      ${pagination}
    </div>
  `;
}

function pager() {
  return `<div class="pager"><button type="button">${icon("chevron-right", "flip")}</button><span>1</span><button type="button">${icon("chevron-right")}</button></div>`;
}

function uploadDrop(text = "Drag and drop files here", subtext = "or click to upload") {
  return `<div class="upload-drop">${icon("document")}<strong>${esc(text)}</strong><p>${esc(subtext)}</p></div>`;
}

function skeletonRows(count = 4) {
  return `<div class="skeleton-list">${Array.from({ length: count }, () => `<div><span></span><strong></strong><em></em></div>`).join("")}</div>`;
}

function donut(value = "0", label = "Total Score") {
  return `<div class="donut"><span>${esc(value)}<small>${esc(label)}</small></span></div>`;
}

function miniCalendar() {
  const days = ["S", "M", "T", "W", "T", "F", "S"];
  const nums = ["27", "28", "29", "30", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15", "16", "17", "18", "19", "20", "21", "22", "23", "24", "25", "26", "27", "28", "29", "30", "31", "1", "2", "3", "4", "5", "6", "7"];
  return `
    <div class="mini-calendar-wrap">
      <div class="mini-cal-head"><button type="button">${icon("chevron-right", "flip")}</button><strong>May 2025</strong><button type="button">${icon("chevron-right")}</button></div>
      <div class="mini-calendar">
        ${days.map((day) => `<b>${day}</b>`).join("")}
        ${nums.map((day) => `<span class="${day === "19" ? "active" : ""}">${day}</span>`).join("")}
      </div>
    </div>
  `;
}

function chart(type = "line") {
  const centerIcon = type === "funnel" || type === "donut" ? "" : icon(type === "bar" ? "bar-chart" : "line-chart");
  return `<div class="chart chart-${type}"><span class="chart-center">${centerIcon}</span></div>`;
}

function statLegend(items) {
  return `<div class="stat-legend">${items.map(([label, value, tone]) => `<div><span class="${tone || "green"}"></span><strong>${esc(label)}</strong><em>${esc(value)}</em></div>`).join("")}</div>`;
}

function renderCommandCenter() {
  const widgetIds = readCommandWidgetIds();
  return `
    <section class="command-center-workspace" data-command-center>
      <div class="command-customize-bar">
        <button class="secondary-action" type="button" data-command-add-toggle>${icon("plus")}<span>Add Widget</span></button>
      </div>
      ${renderCommandWidgetCatalog(widgetIds)}
      <section class="command-grid" data-command-grid>
        ${widgetIds.length ? widgetIds.map(renderCommandWidget).join("") : renderEmptyCommandGrid()}
      </section>
    </section>
  `;
}

function getCommandWidget(widgetId) {
  return commandCenterWidgetCatalog.find((widget) => widget.id === widgetId) || null;
}

function normalizeCommandWidgetIds(ids, fallback = commandCenterDefaultWidgetIds) {
  const validIds = new Set(commandCenterWidgetCatalog.map((widget) => widget.id));
  const seen = new Set();
  const normalized = (Array.isArray(ids) ? ids : []).filter((id) => {
    if (!validIds.has(id) || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  return normalized.length || !fallback ? normalized : [...fallback];
}

function readCommandWidgetIds() {
  if (Array.isArray(commandCenterState.widgetIds)) return commandCenterState.widgetIds;
  try {
    commandCenterState.widgetIds = normalizeCommandWidgetIds(JSON.parse(localStorage.getItem(commandCenterStorageKey) || "null"));
  } catch {
    commandCenterState.widgetIds = [...commandCenterDefaultWidgetIds];
  }
  return commandCenterState.widgetIds;
}

function writeCommandWidgetIds(ids) {
  commandCenterState.widgetIds = normalizeCommandWidgetIds(ids, null);
  try {
    localStorage.setItem(commandCenterStorageKey, JSON.stringify(commandCenterState.widgetIds));
  } catch {
    // Dashboard preferences still work for the current session.
  }
}

function renderCommandWidgetCatalog(activeIds) {
  const activeSet = new Set(activeIds);
  return `
    <div class="command-widget-catalog" data-command-widget-catalog hidden>
      ${commandCenterWidgetCatalog.map((widget) => {
        const isActive = activeSet.has(widget.id);
        return `
          <button class="widget-catalog-item ${isActive ? "is-active" : ""}" type="button" data-command-add-widget="${esc(widget.id)}" ${isActive ? "disabled" : ""} aria-pressed="${isActive ? "true" : "false"}">
            ${icon(widget.icon)}
            <strong>${esc(widget.title)}</strong>
            <small>${isActive ? "Added" : "Add"}</small>
          </button>
        `;
      }).join("")}
    </div>
  `;
}

function renderCommandWidget(widgetId) {
  if (widgetId === "action-items") return renderActionItemsWidget();
  if (widgetId === "coverage-requests") return renderCoverageRequestsWidget();
  if (widgetId === "qa-alerts") return renderQaAlertsWidget();
  if (widgetId === "schedule") return renderScheduleWidget();
  return "";
}

function renderEmptyCommandGrid() {
  return panel("Command Center", emptyState("layout-grid", "No widgets selected", "", `
    <button class="secondary-action" type="button" data-command-add-toggle>${icon("plus")}<span>Add Widget</span></button>
  `), { className: "command-empty-panel" });
}

function renderActionItemsWidget() {
  return panel("Action Items", `
    ${commandTabs("action-items", [["all", "All"], ["priority", "High Priority"], ["due", "Due Today"], ["week", "This Week"]], commandCenterState.filters["action-items"])}
    <div id="commandActionItemsMessage" class="request-message" aria-live="polite"></div>
    <div id="commandActionItemsList" class="dashboard-list">${skeletonRows(3)}</div>
    <a class="panel-bottom-link" href="assignments.html">View All Action Items ${icon("chevron-right")}</a>
  `, { menu: true, key: "action-items", href: "assignments.html" });
}

function renderCoverageRequestsWidget() {
  return panel("Coverage Requests", `
    ${commandTabs("coverage-requests", [["all", "All"], ["pending", "Pending Approval"], ["upcoming", "Upcoming"], ["needs", "Needs Coverage"]], commandCenterState.filters["coverage-requests"])}
    <div id="commandCoverageRequestsMessage" class="request-message" aria-live="polite"></div>
    <div id="commandCoverageRequestsList" class="dashboard-list">${skeletonRows(3)}</div>
    <a class="panel-bottom-link purple" href="coverage-center.html">View All Coverage Requests ${icon("chevron-right")}</a>
  `, { menu: true, key: "coverage-requests", href: "coverage-center.html" });
}

function renderQaAlertsWidget() {
  return panel("QA Alerts", `
    ${commandTabs("qa-alerts", [["all", "All"], ["failures", "QA Failures"], ["reclean", "Recleans Requested"], ["pending", "Pending Review"]], commandCenterState.filters["qa-alerts"])}
    <div id="commandQaAlertsMessage" class="request-message" aria-live="polite"></div>
    <div id="commandQaAlertsList" class="dashboard-list">${skeletonRows(3)}</div>
    <a class="panel-bottom-link red" href="qa-queue.html">View All QA Alerts ${icon("chevron-right")}</a>
  `, { menu: true, key: "qa-alerts", href: "qa-queue.html" });
}

function renderScheduleWidget() {
  return panel("Today's Schedule", `
    <div class="schedule-tabs command-schedule-tabs">
      ${["day", "week", "month"].map((view) => `
        <button class="view-chip ${commandCenterState.scheduleView === view ? "active" : ""}" type="button" data-command-schedule-view="${esc(view)}"><span>${esc(titleCase(view))}</span></button>
      `).join("")}
    </div>
    <div id="commandScheduleMessage" class="request-message" aria-live="polite"></div>
    <div id="commandScheduleList" class="dashboard-list">${skeletonRows(3)}</div>
    <div class="schedule-legend">${["Scheduled", "In Progress", "Completed", "Needs Coverage", "QA Pending"].map((item, i) => `<span class="legend-${i}">${esc(item)}</span>`).join("")}</div>
  `, { action: { label: "View Full Schedule", href: "schedule.html", tone: "secondary" }, menu: true, key: "schedule", href: "schedule.html" });
}

function initCommandCenter(options = {}) {
  const root = document.querySelector("[data-command-center]");
  if (!root) return;
  root.addEventListener("click", handleCommandCenterClick);
  renderCommandCenterLists();
  if (!options.skipRemotePreferences) {
    void hydrateCommandWidgetPreferences();
  }
  if (!options.skipLoad) {
    void loadCommandCenterData();
  }
}

function handleCommandCenterClick(event) {
  const filterButton = event.target.closest("[data-command-filter]");
  if (filterButton) {
    commandCenterState.filters[filterButton.dataset.commandFilter] = filterButton.dataset.commandFilterValue || "all";
    updateCommandFilterButtons(filterButton.dataset.commandFilter);
    renderCommandCenterLists();
    return;
  }

  const scheduleButton = event.target.closest("[data-command-schedule-view]");
  if (scheduleButton) {
    commandCenterState.scheduleView = scheduleButton.dataset.commandScheduleView || "day";
    updateCommandScheduleButtons();
    renderCommandSchedule();
    return;
  }

  const addToggle = event.target.closest("[data-command-add-toggle]");
  if (addToggle) {
    const catalog = document.querySelector("[data-command-widget-catalog]");
    if (catalog) catalog.hidden = !catalog.hidden;
    return;
  }

  const addWidget = event.target.closest("[data-command-add-widget]");
  if (addWidget && !addWidget.disabled) {
    addCommandWidget(addWidget.dataset.commandAddWidget);
    return;
  }

  const menuToggle = event.target.closest("[data-widget-menu-toggle]");
  if (menuToggle) {
    const widgetId = menuToggle.dataset.widgetMenuToggle;
    const menu = document.querySelector(`[data-widget-menu="${widgetId}"]`);
    const shouldOpen = menu?.hidden;
    closeCommandWidgetMenus();
    if (menu) {
      menu.hidden = !shouldOpen;
      menuToggle.setAttribute("aria-expanded", shouldOpen ? "true" : "false");
    }
    return;
  }

  const menuAction = event.target.closest("[data-widget-menu-action]");
  if (menuAction) {
    const widgetId = menuAction.dataset.widgetId;
    closeCommandWidgetMenus();
    if (menuAction.dataset.widgetMenuAction === "hide") {
      hideCommandWidget(widgetId);
    } else if (menuAction.dataset.widgetMenuAction === "refresh") {
      void refreshCommandWidget(widgetId);
    }
  }
}

function closeCommandWidgetMenus() {
  document.querySelectorAll("[data-widget-menu]").forEach((menu) => {
    menu.hidden = true;
  });
  document.querySelectorAll("[data-widget-menu-toggle]").forEach((button) => {
    button.setAttribute("aria-expanded", "false");
  });
}

function addCommandWidget(widgetId) {
  if (!getCommandWidget(widgetId)) return;
  const widgetIds = readCommandWidgetIds();
  if (widgetIds.includes(widgetId)) return;
  writeCommandWidgetIds([...widgetIds, widgetId]);
  void persistCommandWidgetPreferences();
  rerenderCommandCenter({ skipLoad: true, skipRemotePreferences: true });
}

function hideCommandWidget(widgetId) {
  writeCommandWidgetIds(readCommandWidgetIds().filter((id) => id !== widgetId));
  void persistCommandWidgetPreferences();
  rerenderCommandCenter({ skipLoad: true, skipRemotePreferences: true });
}

function rerenderCommandCenter(options = {}) {
  const root = document.querySelector("[data-command-center]");
  if (!root) return;
  root.outerHTML = renderCommandCenter();
  initCommandCenter(options);
}

async function hydrateCommandWidgetPreferences() {
  if (commandCenterState.preferencesLoaded || !suiteSupabase) return;
  commandCenterState.preferencesLoaded = true;
  const user = await getCommandCenterUser();
  if (!user) return;

  const { data, error } = await suiteSupabase
    .from("command_center_widget_preferences")
    .select("widget_key,is_visible,sort_order")
    .eq("user_id", user.id)
    .order("sort_order", { ascending: true });

  if (error || !data?.length) return;

  const remoteWidgetIds = normalizeCommandWidgetIds(
    data.filter((item) => item.is_visible).map((item) => item.widget_key),
    null
  );
  if (remoteWidgetIds.join("|") !== readCommandWidgetIds().join("|")) {
    writeCommandWidgetIds(remoteWidgetIds);
    rerenderCommandCenter({ skipLoad: true, skipRemotePreferences: true });
  }
}

async function persistCommandWidgetPreferences() {
  if (!suiteSupabase) return;
  const user = await getCommandCenterUser();
  if (!user) return;

  const visibleIds = readCommandWidgetIds();
  const visibleSet = new Set(visibleIds);
  const rows = commandCenterWidgetCatalog.map((widget, index) => ({
    user_id: user.id,
    widget_key: widget.id,
    is_visible: visibleSet.has(widget.id),
    sort_order: visibleIds.includes(widget.id) ? visibleIds.indexOf(widget.id) : commandCenterWidgetCatalog.length + index,
    settings: {},
    updated_at: new Date().toISOString()
  }));
  const { error } = await suiteSupabase
    .from("command_center_widget_preferences")
    .upsert(rows, { onConflict: "user_id,widget_key" });
  if (error) console.warn("[admin-suite] Unable to save command center preferences", error);
}

async function getCommandCenterUser() {
  if (!suiteSupabase) return null;
  const { data } = await suiteSupabase.auth.getUser();
  return data?.user || null;
}

async function loadCommandCenterData() {
  await Promise.all([
    loadCommandActionItems(),
    loadCommandCoverageRequests(),
    loadCommandQaAlerts(),
    loadCommandSchedule()
  ]);
}

async function refreshCommandWidget(widgetId) {
  setCommandWidgetLoading(widgetId);
  if (widgetId === "action-items") await loadCommandActionItems();
  if (widgetId === "coverage-requests") await loadCommandCoverageRequests();
  if (widgetId === "qa-alerts") await loadCommandQaAlerts();
  if (widgetId === "schedule") await loadCommandSchedule();
}

function setCommandWidgetLoading(widgetId) {
  const listIds = {
    "action-items": "commandActionItemsList",
    "coverage-requests": "commandCoverageRequestsList",
    "qa-alerts": "commandQaAlertsList",
    schedule: "commandScheduleList"
  };
  const list = document.getElementById(listIds[widgetId]);
  if (list) list.innerHTML = skeletonRows(3);
  setCommandMessage(widgetId, "Syncing...");
}

async function fetchCommandRows(table, select = "*", options = {}) {
  if (!suiteSupabase) {
    return { data: [], error: new Error("Supabase is not configured.") };
  }
  let query = suiteSupabase.from(table).select(select);
  if (options.order) {
    query = query.order(options.order, { ascending: options.ascending !== false });
  }
  if (options.limit) {
    query = query.limit(options.limit);
  }
  const { data, error } = await query;
  if (error) console.warn(`[admin-suite] ${table} load failed`, error);
  return { data: data || [], error };
}

async function loadCommandActionItems() {
  setCommandMessage("action-items", "Syncing...");
  const [customResult, profileResult] = await Promise.all([
    fetchCommandRows("command_center_action_items", "*", { order: "due_at", ascending: true, limit: 40 }),
    fetchCommandRows("profiles", "id,full_name,email,phone,role,status,contractor_approved,property_manager_property_id", { limit: 60 })
  ]);

  const customItems = customResult.error ? [] : customResult.data
    .filter((item) => isOpenStatus(item.status))
    .map(mapActionItem);
  const profileItems = profileResult.error ? [] : profileResult.data
    .filter(isPendingProfileAction)
    .map(mapProfileActionItem);

  commandCenterState.actionItems = [...profileItems, ...customItems]
    .sort((a, b) => priorityWeight(b.priority) - priorityWeight(a.priority) || dateValue(a.dueAt) - dateValue(b.dueAt));

  const hasSchemaError = customResult.error && !profileItems.length;
  setCommandMessage("action-items", hasSchemaError
    ? "Action items are ready once the Supabase migration is applied."
    : commandCenterState.actionItems.length
      ? `${commandCenterState.actionItems.length} open action item${commandCenterState.actionItems.length === 1 ? "" : "s"}`
      : "Synced with Supabase. No open action items.");
  renderCommandActionItems();
}

async function loadCommandCoverageRequests() {
  setCommandMessage("coverage-requests", "Syncing...");
  const result = await fetchCommandRows("coverage_requests", "*", { order: "requested_start_at", ascending: true, limit: 40 });
  commandCenterState.coverageRequests = result.error ? [] : result.data.map(mapCoverageRequest);
  setCommandMessage("coverage-requests", result.error
    ? "Coverage requests are ready once the Supabase migration is applied."
    : commandCenterState.coverageRequests.length
      ? `${commandCenterState.coverageRequests.length} coverage request${commandCenterState.coverageRequests.length === 1 ? "" : "s"}`
      : "Synced with Supabase. No coverage requests yet.");
  renderCommandCoverageRequests();
}

async function loadCommandQaAlerts() {
  setCommandMessage("qa-alerts", "Syncing...");
  const [qaResult, assignmentResult] = await Promise.all([
    fetchCommandRows("qa_alerts", "*", { order: "created_at", ascending: false, limit: 40 }),
    fetchCommandRows("assignment_blocks", "id,title,property_name,address,service_type,status,start_window,end_window,claimed_by_name,claimed_by_email,assigned_to_name,assigned_to_email,created_at", { order: "created_at", ascending: false, limit: 60 })
  ]);

  const qaRows = qaResult.error ? [] : qaResult.data.filter((item) => isOpenStatus(item.status)).map(mapQaAlert);
  const qaAssignments = assignmentResult.error ? [] : assignmentResult.data
    .filter((item) => normalizeToken(item.status) === "qa-pending")
    .map(mapQaAssignmentAlert);

  commandCenterState.qaAlerts = [...qaRows, ...qaAssignments]
    .sort((a, b) => priorityWeight(b.priority) - priorityWeight(a.priority) || dateValue(b.dueAt, 0) - dateValue(a.dueAt, 0));

  setCommandMessage("qa-alerts", qaResult.error && !qaAssignments.length
    ? "QA alerts are ready once the Supabase migration is applied."
    : commandCenterState.qaAlerts.length
      ? `${commandCenterState.qaAlerts.length} open QA alert${commandCenterState.qaAlerts.length === 1 ? "" : "s"}`
      : "Synced with Supabase. No QA alerts.");
  renderCommandQaAlerts();
}

async function loadCommandSchedule() {
  setCommandMessage("schedule", "Syncing...");
  const result = await fetchCommandRows("assignment_blocks", "id,title,property_name,address,service_type,status,start_window,end_window,claimed_by_name,claimed_by_email,assigned_to_name,assigned_to_email,created_at", { order: "start_window", ascending: true, limit: 120 });
  commandCenterState.scheduleItems = result.error ? [] : result.data;
  setCommandMessage("schedule", result.error ? "Unable to load assignments from Supabase." : "Synced with Supabase.");
  renderCommandSchedule();
}

function renderCommandCenterLists() {
  renderCommandActionItems();
  renderCommandCoverageRequests();
  renderCommandQaAlerts();
  renderCommandSchedule();
}

function updateCommandFilterButtons(widgetId) {
  document.querySelectorAll(`[data-command-filter="${widgetId}"]`).forEach((button) => {
    button.classList.toggle("active", button.dataset.commandFilterValue === commandCenterState.filters[widgetId]);
  });
}

function updateCommandScheduleButtons() {
  document.querySelectorAll("[data-command-schedule-view]").forEach((button) => {
    button.classList.toggle("active", button.dataset.commandScheduleView === commandCenterState.scheduleView);
  });
}

function renderCommandActionItems() {
  const list = document.getElementById("commandActionItemsList");
  if (!list) return;
  const rows = filterActionItems(commandCenterState.actionItems).slice(0, 6);
  list.innerHTML = rows.length
    ? rows.map(renderDashboardItem).join("")
    : emptyState("clipboard-list", "No action items");
}

function renderCommandCoverageRequests() {
  const list = document.getElementById("commandCoverageRequestsList");
  if (!list) return;
  const rows = filterCoverageRequests(commandCenterState.coverageRequests).slice(0, 6);
  list.innerHTML = rows.length
    ? rows.map(renderDashboardItem).join("")
    : emptyState("calendar", "No coverage requests");
}

function renderCommandQaAlerts() {
  const list = document.getElementById("commandQaAlertsList");
  if (!list) return;
  const rows = filterQaAlerts(commandCenterState.qaAlerts).slice(0, 6);
  list.innerHTML = rows.length
    ? rows.map(renderDashboardItem).join("")
    : emptyState("alert", "No QA alerts");
}

function renderCommandSchedule() {
  const list = document.getElementById("commandScheduleList");
  if (!list) return;
  const rows = filterScheduleItems(commandCenterState.scheduleItems).slice(0, commandCenterState.scheduleView === "month" ? 8 : 6);
  list.innerHTML = rows.length
    ? rows.map(renderScheduleDashboardItem).join("")
    : emptyState("calendar", "No scheduled assignments");
}

function setCommandMessage(widgetId, text, isError = false) {
  const messageIds = {
    "action-items": "commandActionItemsMessage",
    "coverage-requests": "commandCoverageRequestsMessage",
    "qa-alerts": "commandQaAlertsMessage",
    schedule: "commandScheduleMessage"
  };
  const message = document.getElementById(messageIds[widgetId]);
  if (!message) return;
  message.textContent = text || "";
  message.classList.toggle("error", Boolean(isError));
}

function mapActionItem(item) {
  return {
    id: `action-${item.id}`,
    title: item.title || "Action item",
    body: item.body || item.description || item.notes || "",
    status: item.status || "open",
    priority: item.priority || "normal",
    dueAt: item.due_at || item.created_at || null,
    meta: item.item_type ? titleCase(item.item_type.replace(/_/g, " ")) : "Action item",
    href: item.href || "assignments.html",
    icon: "clipboard-list"
  };
}

function mapProfileActionItem(profile) {
  const role = normalizeToken(profile.role);
  const label = role === "property-manager" ? "Link property manager" : "Approve contractor";
  const name = profile.full_name || profile.email || "New account";
  return {
    id: `profile-${profile.id}`,
    title: label,
    body: `${name}${profile.phone ? ` - ${profile.phone}` : ""}`,
    status: "pending",
    priority: "high",
    dueAt: new Date().toISOString(),
    meta: role === "property-manager" ? "Property manager access" : "Contractor access",
    href: "onboarding.html",
    icon: "user-plus"
  };
}

function mapCoverageRequest(item) {
  const title = item.title || item.service_type || "Coverage request";
  const property = [item.property_name, item.address].filter(Boolean).join(" - ");
  return {
    id: `coverage-${item.id}`,
    title,
    body: property || item.notes || "Coverage request",
    status: item.status || "open",
    priority: item.priority || "normal",
    dueAt: item.requested_start_at || item.created_at || null,
    meta: formatDateWindow(item.requested_start_at, item.requested_end_at),
    href: "coverage-center.html",
    icon: "shield"
  };
}

function mapQaAlert(item) {
  return {
    id: `qa-${item.id}`,
    title: item.title || item.message || "QA alert",
    body: [item.property_name, item.contractor_name, item.service_type].filter(Boolean).join(" - ") || item.notes || "",
    status: item.status || "open",
    priority: item.priority || "normal",
    dueAt: item.due_at || item.created_at || null,
    meta: item.alert_type ? titleCase(item.alert_type.replace(/_/g, " ")) : "QA alert",
    href: "qa-queue.html",
    icon: "alert"
  };
}

function mapQaAssignmentAlert(item) {
  return {
    id: `qa-assignment-${item.id}`,
    title: item.title || "QA pending assignment",
    body: [item.property_name, item.service_type].filter(Boolean).join(" - ") || "Assignment requires QA review",
    status: "qa_pending",
    priority: "high",
    dueAt: item.start_window || item.created_at || null,
    meta: formatDateWindow(item.start_window, item.end_window),
    href: "assignments.html",
    icon: "alert"
  };
}

function renderDashboardItem(item) {
  return `
    <article class="dashboard-item-row" data-dashboard-item="${esc(item.id)}">
      <div class="dashboard-item-main">
        <div class="dashboard-item-title">${icon(item.icon || "clipboard-list")}<strong>${esc(item.title)}</strong></div>
        ${item.body ? `<p>${esc(item.body)}</p>` : ""}
        <div class="dashboard-item-meta">
          <span>${esc(item.meta || formatDashboardDate(item.dueAt))}</span>
          ${priorityBadge(item.priority)}
          ${statusBadge(item.status)}
        </div>
      </div>
      <a class="dashboard-item-action" href="${esc(item.href || "#")}" aria-label="Open ${esc(item.title)}">${icon("chevron-right")}</a>
    </article>
  `;
}

function renderScheduleDashboardItem(item) {
  const contractor = item.assigned_to_name || item.assigned_to_email || item.claimed_by_name || item.claimed_by_email || "Unassigned";
  return renderDashboardItem({
    id: `schedule-${item.id}`,
    title: item.property_name || item.title || "Scheduled assignment",
    body: [item.service_type, contractor].filter(Boolean).join(" - "),
    status: item.status || "scheduled",
    priority: item.status === "qa_pending" ? "high" : "normal",
    dueAt: item.start_window,
    meta: formatDateWindow(item.start_window, item.end_window),
    href: "schedule.html",
    icon: "calendar"
  });
}

function filterActionItems(items) {
  const filter = commandCenterState.filters["action-items"];
  if (filter === "priority") return items.filter((item) => priorityWeight(item.priority) >= 3);
  if (filter === "due") return items.filter((item) => isToday(item.dueAt));
  if (filter === "week") return items.filter((item) => isWithinNextDays(item.dueAt, 7));
  return items;
}

function filterCoverageRequests(items) {
  const filter = commandCenterState.filters["coverage-requests"];
  if (filter === "pending") return items.filter((item) => ["pending", "pending-approval"].includes(normalizeToken(item.status)));
  if (filter === "upcoming") return items.filter((item) => {
    const dueAt = parseDate(item.dueAt);
    return dueAt && dueAt >= startOfToday();
  });
  if (filter === "needs") return items.filter((item) => ["open", "needs-coverage", "needs"].includes(normalizeToken(item.status)));
  return items;
}

function filterQaAlerts(items) {
  const filter = commandCenterState.filters["qa-alerts"];
  if (filter === "failures") return items.filter((item) => ["failed", "failure", "qa-failure"].includes(normalizeToken(item.status)) || normalizeToken(item.meta).includes("failure"));
  if (filter === "reclean") return items.filter((item) => normalizeToken(item.meta).includes("reclean"));
  if (filter === "pending") return items.filter((item) => ["pending", "pending-review", "qa-pending", "open"].includes(normalizeToken(item.status)));
  return items;
}

function filterScheduleItems(items) {
  const now = new Date();
  const today = startOfToday();
  const weekEnd = addDays(today, 7);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return items.filter((item) => {
    const start = parseDate(item.start_window);
    if (!start) return false;
    if (commandCenterState.scheduleView === "day") return isSameDay(start, now);
    if (commandCenterState.scheduleView === "week") return start >= today && start < weekEnd;
    return start >= monthStart && start < monthEnd;
  });
}

function isPendingProfileAction(profile) {
  const role = normalizeToken(profile.role);
  const status = normalizeToken(profile.status);
  if (role === "contractor") {
    return !profile.contractor_approved && !isApprovedStatus(status);
  }
  if (role === "property-manager") {
    return !profile.property_manager_property_id;
  }
  return false;
}

function isApprovedStatus(status) {
  return ["approved", "active", "enabled"].includes(normalizeToken(status));
}

function isOpenStatus(status) {
  return !["completed", "closed", "cancelled", "canceled", "resolved", "done"].includes(normalizeToken(status));
}

function priorityWeight(priority) {
  const token = normalizeToken(priority);
  if (["critical", "urgent"].includes(token)) return 4;
  if (token === "high") return 3;
  if (token === "medium" || token === "normal") return 2;
  if (token === "low") return 1;
  return 0;
}

function priorityBadge(priority) {
  const token = normalizeToken(priority || "normal");
  const tone = priorityWeight(token) >= 3 ? "red" : token === "low" ? "blue" : "yellow";
  return `<span class="status-badge status-${tone}">${esc(titleCase(token || "normal"))}</span>`;
}

function statusBadge(status) {
  const token = normalizeToken(status || "open");
  return `<span class="status-badge status-${token}">${esc(titleCase(token || "open"))}</span>`;
}

function normalizeToken(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function titleCase(value) {
  return String(value || "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateValue(value, fallback = Number.MAX_SAFE_INTEGER) {
  return parseDate(value)?.getTime() || fallback;
}

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function addDays(value, days) {
  const date = new Date(value);
  date.setDate(date.getDate() + days);
  return date;
}

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

function isToday(value) {
  const date = parseDate(value);
  return date ? isSameDay(date, new Date()) : false;
}

function isWithinNextDays(value, days) {
  const date = parseDate(value);
  if (!date) return false;
  const today = startOfToday();
  return date >= today && date < addDays(today, days);
}

function formatDashboardDate(value, fallback = "No date") {
  const date = parseDate(value);
  if (!date) return fallback;
  return date.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function formatDateWindow(start, end) {
  const startDate = parseDate(start);
  const endDate = parseDate(end);
  if (!startDate) return "No start time";
  if (!endDate) return formatDashboardDate(startDate);
  const sameDay = isSameDay(startDate, endDate);
  const startText = startDate.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  const endText = endDate.toLocaleString([], sameDay ? { hour: "numeric", minute: "2-digit" } : { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  return `${startText} - ${endText}`;
}

function renderPipelineColumns() {
  return stageLabels.map(([id, label, tone]) => `
    <article class="lead-stage ${tone}" data-pipeline-stage="${id}">
      <header><span>${esc(label)}</span><strong data-stage-count="${id}">0</strong></header>
      <div class="lead-stage-list" data-lead-stage-list="${id}">
        ${emptyState("clipboard-list", "No leads")}
      </div>
      <button class="lead-drop" type="button" data-lead-stage-add="${id}">
        ${icon("plus")}
        <small>Add Lead</small>
      </button>
    </article>
  `).join("");
}

function renderLeads() {
  return `
    <section class="leads-workspace" data-leads-page>
      ${toolbar(
        `<button class="view-chip active" type="button" data-lead-view-toggle="pipeline">${icon("filter")}<span>Pipeline</span></button><button class="view-chip" type="button" data-lead-view-toggle="list">${icon("list")}<span>List View</span></button>`,
        `<label class="inline-search lead-search">${icon("search")}<input id="leadSearchInput" type="search" placeholder="Search leads..." /></label><select id="leadOwnerFilter" class="select-button lead-owner-filter" aria-label="Filter owner"><option value="all">All Owners</option></select><button class="secondary-action" type="button" data-lead-filter-toggle>${icon("filter")}<span>Filters</span></button><button id="leadAddBtn" class="primary-action" type="button">${icon("plus")}<span>Add Lead</span></button>`
      )}
      <section id="leadFilterPanel" class="lead-filter-panel" hidden>
        <label class="suite-field"><span>Stage</span><select id="leadStageFilter"><option value="all">All Stages</option>${stageLabels.map(([id, label]) => `<option value="${esc(id)}">${esc(label)}</option>`).join("")}</select></label>
        <label class="suite-field"><span>Lead Source</span><select id="leadSourceFilter"><option value="all">All Sources</option>${leadSourceOptions.filter(Boolean).map((source) => `<option value="${esc(source)}">${esc(source)}</option>`).join("")}</select></label>
        <button class="secondary-action" type="button" data-lead-clear-filters><span>Clear Filters</span></button>
      </section>
      <p id="leadMessage" class="status-message" aria-live="polite"></p>
      <section id="leadBoard" class="lead-board">${renderPipelineColumns()}</section>
      <section id="leadListPanel" class="lead-list-panel" hidden>
        <div id="leadList" class="lead-list">${skeletonRows(4)}</div>
      </section>
      <section class="content-rail lead-detail-rail">
        ${panel("Lead Details", leadForm(), { className: "span-main" })}
      <div class="suite-stack">
        ${panel("Activity Log", `<div id="leadActivityLog" class="lead-activity-list">${emptyState("calendar", "No activity yet")}</div>`)}
        ${panel("Lead Navigation", leadNavigationPanel())}
      </div>
      </section>
    </section>
  `;
}

function leadInputField(id, label, type = "text", options = {}) {
  const attrs = [
    options.required ? "required" : "",
    options.placeholder ? `placeholder="${esc(options.placeholder)}"` : "",
    options.step ? `step="${esc(options.step)}"` : "",
    options.min ? `min="${esc(options.min)}"` : ""
  ].filter(Boolean).join(" ");
  return `<label class="suite-field ${options.className || ""}"><span>${esc(label)}</span><input id="${esc(id)}" type="${esc(type)}" ${attrs} /></label>`;
}

function leadSelectField(id, label, options = [], config = {}) {
  return `
    <label class="suite-field ${config.className || ""}">
      <span>${esc(label)}</span>
      <select id="${esc(id)}" ${config.required ? "required" : ""}>
        ${options.map((option) => {
          const value = Array.isArray(option) ? option[0] : option;
          const labelText = Array.isArray(option) ? option[1] : option || config.emptyLabel || "Select...";
          return `<option value="${esc(value)}">${esc(labelText)}</option>`;
        }).join("")}
      </select>
    </label>
  `;
}

function leadTextareaField(id, label, className = "") {
  return `<label class="suite-field ${className}"><span>${esc(label)}</span><textarea id="${esc(id)}"></textarea></label>`;
}

function leadForm() {
  return `
    <form id="leadForm" class="lead-form">
      <input id="leadId" type="hidden" />
      ${formGrid([
        leadSelectField("leadPipelineStage", "Pipeline Stage", stageLabels.map(([id, label]) => [id, label]), { required: true }),
        leadInputField("leadCompanyName", "Company Name", "text", { required: true }),
        leadInputField("leadContactName", "Contact Name"),
        leadInputField("leadPhone", "Phone", "tel"),
        leadInputField("leadEmail", "Email", "email"),
        leadSelectField("leadPropertyType", "Property Type", leadPropertyTypeOptions, { emptyLabel: "Select type" }),
        leadInputField("leadPropertyName", "Property Name", "text", { required: true }),
        leadInputField("leadAddress", "Address"),
        leadInputField("leadCity", "City"),
        leadInputField("leadState", "State"),
        leadInputField("leadZip", "ZIP Code"),
        leadSelectField("leadSource", "Lead Source", leadSourceOptions, { emptyLabel: "Select source" }),
        leadInputField("leadOwner", "Lead Owner"),
        leadInputField("leadEstimatedValue", "Estimated Value", "number", { min: "0", step: "0.01" }),
        leadInputField("leadCloseDate", "Close Date", "date"),
        leadInputField("leadNextStep", "Next Step", "text", { className: "wide" }),
        leadInputField("leadNextStepDue", "Next Step Due", "date"),
        leadTextareaField("leadNotes", "Notes", "wide")
      ])}
      <div class="lead-form-actions">
        <button id="leadNewBtn" class="secondary-action" type="button">${icon("plus")}<span>New Lead</span></button>
        <button id="leadMoveNextBtn" class="secondary-action" type="button">${icon("chevron-right")}<span>Move Next</span></button>
        <button id="leadSaveBtn" class="primary-action" type="submit">${icon("check")}<span>Save Lead</span></button>
      </div>
    </form>
  `;
}

function leadNavigationPanel() {
  return `
    <div class="lead-navigation-panel">
      <p id="leadNavigationSummary">Select a lead to jump between workflow pages or move it through the pipeline.</p>
      <div class="quick-nav-list">
        <button type="button" data-lead-move-stage="contacted">${icon("contact")}<span>Mark Contacted</span></button>
        <button type="button" data-lead-move-stage="walkthrough">${icon("calendar-days")}<span>Move to Walkthrough</span></button>
        <button type="button" data-lead-move-stage="quote_sent">${icon("badge-dollar")}<span>Move to Quote Sent</span></button>
        <button type="button" data-lead-move-stage="contract_out">${icon("file-signature")}<span>Move to Contract Out</span></button>
        <a href="walkthroughs.html">${icon("calendar-days")}<span>Open Walkthroughs</span></a>
        <a href="quotes.html">${icon("badge-dollar")}<span>Open Quotes</span></a>
        <a href="contracts-pending.html">${icon("file-signature")}<span>Open Contracts Pending</span></a>
      </div>
    </div>
  `;
}

function initLeads() {
  const root = document.querySelector("[data-leads-page]");
  if (!root) return;

  root.addEventListener("click", handleLeadClick);
  root.querySelector("#leadForm")?.addEventListener("submit", saveLeadForm);
  root.querySelector("#leadSearchInput")?.addEventListener("input", (event) => {
    leadState.search = event.target.value || "";
    renderLeadData();
  });
  root.querySelector("#leadOwnerFilter")?.addEventListener("change", (event) => {
    leadState.ownerFilter = event.target.value || "all";
    renderLeadData();
  });
  root.querySelector("#leadStageFilter")?.addEventListener("change", (event) => {
    leadState.stageFilter = event.target.value || "all";
    renderLeadData();
  });
  root.querySelector("#leadSourceFilter")?.addEventListener("change", (event) => {
    leadState.sourceFilter = event.target.value || "all";
    renderLeadData();
  });

  clearLeadForm();
  void loadLeads();
}

function handleLeadClick(event) {
  const addStage = event.target.closest("[data-lead-stage-add]");
  if (addStage) {
    clearLeadForm(addStage.dataset.leadStageAdd || "new_leads");
    document.getElementById("leadCompanyName")?.focus();
    return;
  }

  const addButton = event.target.closest("#leadAddBtn, #leadNewBtn");
  if (addButton) {
    clearLeadForm("new_leads");
    document.getElementById("leadCompanyName")?.focus();
    return;
  }

  const viewToggle = event.target.closest("[data-lead-view-toggle]");
  if (viewToggle) {
    leadState.view = viewToggle.dataset.leadViewToggle || "pipeline";
    renderLeadData();
    return;
  }

  const filterToggle = event.target.closest("[data-lead-filter-toggle]");
  if (filterToggle) {
    const panel = document.getElementById("leadFilterPanel");
    if (panel) panel.hidden = !panel.hidden;
    return;
  }

  const clearFilters = event.target.closest("[data-lead-clear-filters]");
  if (clearFilters) {
    leadState.stageFilter = "all";
    leadState.sourceFilter = "all";
    leadState.ownerFilter = "all";
    leadState.search = "";
    renderLeadFilterControls();
    renderLeadData();
    return;
  }

  const moveStage = event.target.closest("[data-lead-move-stage]");
  if (moveStage) {
    void moveSelectedLeadToStage(moveStage.dataset.leadMoveStage);
    return;
  }

  const moveLead = event.target.closest("[data-lead-move]");
  if (moveLead) {
    void moveLeadToStage(moveLead.dataset.leadMove, moveLead.dataset.leadMoveStage);
    return;
  }

  const moveNext = event.target.closest("#leadMoveNextBtn");
  if (moveNext) {
    void moveSelectedLeadToStage(nextLeadStage(document.getElementById("leadPipelineStage")?.value));
    return;
  }

  const select = event.target.closest("[data-lead-select]");
  if (select) {
    selectLead(select.dataset.leadSelect);
  }
}

async function loadPortalPropertyRows(limit = 300) {
  const orderColumns = ["last_activity_at", "updated_at", "created_at", ""];
  let lastError = null;
  for (const orderColumn of orderColumns) {
    let query = suiteSupabase
      .from(leadTable)
      .select("*")
      .limit(limit);
    if (orderColumn) {
      query = query.order(orderColumn, { ascending: false });
    }
    const result = await query;
    if (!result.error) {
      return {
        data: result.data || [],
        error: null,
        usedFallback: orderColumn !== orderColumns[0]
      };
    }
    lastError = result.error;
    if (!shouldRetryPortalPropertyLoad(result.error)) break;
  }
  return { data: [], error: lastError, usedFallback: false };
}

function shouldRetryPortalPropertyLoad(error) {
  const message = String(error?.message || "").toLowerCase();
  return message.includes("schema cache")
    || message.includes("could not find")
    || message.includes("column")
    || message.includes("last_activity_at")
    || message.includes("updated_at")
    || message.includes("created_at");
}

async function loadLeads() {
  if (!suiteSupabase) {
    showLeadMessage("Supabase config is missing. Add env.js values before using leads.", true);
    return;
  }

  showLeadMessage("Loading leads...");
  document.getElementById("leadList").innerHTML = skeletonRows(4);
  const { data: userData } = await suiteSupabase.auth.getUser();
  leadState.user = userData?.user || null;
  if (leadState.user) {
    const { data: profile } = await suiteSupabase
      .from("profiles")
      .select("role,full_name")
      .eq("id", leadState.user.id)
      .maybeSingle();
    leadState.profile = profile || null;
  }

  const { data, error, usedFallback } = await loadPortalPropertyRows(250);

  if (error) {
    showLeadMessage("Unable to load leads: " + error.message, true);
    renderLeadData();
    return;
  }

  leadState.rows = data || [];
  if (!leadState.selectedId && leadState.rows.length) {
    leadState.selectedId = leadState.rows[0].id;
    fillLeadForm(leadState.rows[0]);
  }
  populateLeadOwnerFilter();
  renderLeadData();
  showLeadMessage(leadState.rows.length
    ? `${leadState.rows.length} lead${leadState.rows.length === 1 ? "" : "s"} synced from Supabase${usedFallback ? " with compatible sorting" : ""}.`
    : "Synced with Supabase. No leads yet.");
}

function renderLeadData() {
  renderLeadViewToggles();
  renderLeadFilterControls();
  renderLeadBoard();
  renderLeadList();
  renderLeadActivity(getSelectedLead());
  renderLeadNavigation(getSelectedLead());

  const board = document.getElementById("leadBoard");
  const list = document.getElementById("leadListPanel");
  if (board) board.hidden = leadState.view !== "pipeline";
  if (list) list.hidden = leadState.view !== "list";
}

function renderLeadViewToggles() {
  document.querySelectorAll("[data-lead-view-toggle]").forEach((button) => {
    button.classList.toggle("active", button.dataset.leadViewToggle === leadState.view);
  });
}

function renderLeadFilterControls() {
  const search = document.getElementById("leadSearchInput");
  if (search && search.value !== leadState.search) search.value = leadState.search;
  const owner = document.getElementById("leadOwnerFilter");
  if (owner && owner.value !== leadState.ownerFilter) owner.value = leadState.ownerFilter;
  const stage = document.getElementById("leadStageFilter");
  if (stage && stage.value !== leadState.stageFilter) stage.value = leadState.stageFilter;
  const source = document.getElementById("leadSourceFilter");
  if (source && source.value !== leadState.sourceFilter) source.value = leadState.sourceFilter;
}

function populateLeadOwnerFilter() {
  const filter = document.getElementById("leadOwnerFilter");
  if (!filter) return;
  const owners = Array.from(new Set([
    leadDisplayName(),
    ...leadState.rows.map((row) => row.sales_owner_name).filter(Boolean)
  ])).filter(Boolean).sort();
  filter.innerHTML = `<option value="all">All Owners</option><option value="unassigned">Unassigned</option>${owners.map((owner) => `<option value="${esc(owner)}">${esc(owner)}</option>`).join("")}`;
  filter.value = leadState.ownerFilter;
}

function renderLeadBoard() {
  const filtered = getFilteredLeads();
  stageLabels.forEach(([stage]) => {
    const rows = filtered.filter((row) => normalizeLeadStage(row.pipeline_stage) === stage);
    const count = document.querySelector(`[data-stage-count="${stage}"]`);
    const list = document.querySelector(`[data-lead-stage-list="${stage}"]`);
    if (count) count.textContent = rows.length;
    if (list) {
      list.innerHTML = rows.length
        ? rows.map(renderLeadCard).join("")
        : `<div class="lead-empty"><span>No leads</span></div>`;
    }
  });
}

function renderLeadList() {
  const list = document.getElementById("leadList");
  if (!list) return;
  const rows = getFilteredLeads();
  list.innerHTML = rows.length
    ? rows.map(renderLeadListRow).join("")
    : emptyState("clipboard-list", "No leads found", "Adjust the filters or add a new lead.");
}

function renderLeadCard(row) {
  const id = esc(row.id);
  const stage = normalizeLeadStage(row.pipeline_stage);
  const nextStage = nextLeadStage(stage);
  return `
    <article class="lead-card ${row.id === leadState.selectedId ? "active" : ""}" data-lead-select="${id}" tabindex="0">
      <div class="lead-card-head">
        <strong>${esc(leadTitle(row))}</strong>
        <span class="status-badge ${statusClassName(stage)}">${esc(leadStageLabel(stage))}</span>
      </div>
      <p>${esc(leadSubtitle(row))}</p>
      <div class="lead-card-meta">
        <span>${esc(row.sales_owner_name || "Unassigned")}</span>
        <span>${esc(leadMoney(row.lead_value))}</span>
      </div>
      <div class="lead-card-actions">
        <button type="button" data-lead-select="${id}">Edit</button>
        ${nextStage ? `<button type="button" data-lead-move="${id}" data-lead-move-stage="${esc(nextStage)}">Move Next</button>` : ""}
      </div>
    </article>
  `;
}

function renderLeadListRow(row) {
  const id = esc(row.id);
  const stage = normalizeLeadStage(row.pipeline_stage);
  const nextStage = nextLeadStage(stage);
  return `
    <article class="lead-list-row ${row.id === leadState.selectedId ? "active" : ""}" data-lead-select="${id}">
      <div>
        <strong>${esc(leadTitle(row))}</strong>
        <p>${esc(leadSubtitle(row))}</p>
      </div>
      <span>${esc(row.contact_name || "No contact")}</span>
      <span>${esc(row.sales_owner_name || "Unassigned")}</span>
      <span>${esc(leadMoney(row.lead_value))}</span>
      <span class="status-badge ${statusClassName(stage)}">${esc(leadStageLabel(stage))}</span>
      <div class="lead-list-actions">
        <button type="button" data-lead-select="${id}">Edit</button>
        ${nextStage ? `<button type="button" data-lead-move="${id}" data-lead-move-stage="${esc(nextStage)}">Move Next</button>` : ""}
      </div>
    </article>
  `;
}

function getFilteredLeads() {
  const term = leadState.search.trim().toLowerCase();
  return leadState.rows.filter((row) => {
    const stage = normalizeLeadStage(row.pipeline_stage);
    if (leadState.stageFilter !== "all" && stage !== leadState.stageFilter) return false;
    if (leadState.sourceFilter !== "all" && String(row.lead_source || "") !== leadState.sourceFilter) return false;
    if (leadState.ownerFilter === "unassigned" && row.sales_owner_name) return false;
    if (leadState.ownerFilter !== "all" && leadState.ownerFilter !== "unassigned" && row.sales_owner_name !== leadState.ownerFilter) return false;
    if (!term) return true;
    return [
      row.company_name,
      row.contact_name,
      row.contact_email,
      row.contact_phone,
      row.name,
      row.property_name,
      row.address,
      row.city,
      row.state,
      row.postal_code,
      row.lead_source,
      row.sales_owner_name,
      row.lead_notes,
      row.next_step
    ].some((value) => String(value || "").toLowerCase().includes(term));
  });
}

function selectLead(id) {
  const row = leadState.rows.find((item) => item.id === id);
  if (!row) return;
  leadState.selectedId = id;
  fillLeadForm(row);
  renderLeadData();
}

function clearLeadForm(stage = "new_leads") {
  leadState.selectedId = null;
  setLeadFormValues({
    id: "",
    pipeline_stage: stage,
    company_name: "",
    contact_name: "",
    contact_phone: "",
    contact_email: "",
    property_type: "",
    property_name: "",
    address: "",
    city: "",
    state: "",
    postal_code: "",
    lead_source: "",
    sales_owner_name: leadDisplayName(),
    lead_value: "",
    expected_close_date: "",
    next_step: "",
    next_step_due_at: "",
    lead_notes: ""
  });
  renderLeadActivity(null);
  renderLeadNavigation(null);
  renderLeadData();
}

function fillLeadForm(row) {
  setLeadFormValues({
    id: row.id || "",
    pipeline_stage: normalizeLeadStage(row.pipeline_stage),
    company_name: row.company_name || "",
    contact_name: row.contact_name || "",
    contact_phone: row.contact_phone || "",
    contact_email: row.contact_email || "",
    property_type: row.property_type || "",
    property_name: row.property_name || row.name || "",
    address: row.address || "",
    city: row.city || "",
    state: row.state || "",
    postal_code: row.postal_code || "",
    lead_source: row.lead_source || "",
    sales_owner_name: row.sales_owner_name || "",
    lead_value: row.lead_value ?? "",
    expected_close_date: row.expected_close_date || "",
    next_step: row.next_step || "",
    next_step_due_at: toDateInput(row.next_step_due_at),
    lead_notes: row.lead_notes || ""
  });
}

function setLeadFormValues(values) {
  const map = {
    leadId: values.id,
    leadPipelineStage: values.pipeline_stage,
    leadCompanyName: values.company_name,
    leadContactName: values.contact_name,
    leadPhone: values.contact_phone,
    leadEmail: values.contact_email,
    leadPropertyType: values.property_type,
    leadPropertyName: values.property_name,
    leadAddress: values.address,
    leadCity: values.city,
    leadState: values.state,
    leadZip: values.postal_code,
    leadSource: values.lead_source,
    leadOwner: values.sales_owner_name,
    leadEstimatedValue: values.lead_value,
    leadCloseDate: values.expected_close_date,
    leadNextStep: values.next_step,
    leadNextStepDue: values.next_step_due_at,
    leadNotes: values.lead_notes
  };
  Object.entries(map).forEach(([id, value]) => {
    const field = document.getElementById(id);
    if (field) field.value = value ?? "";
  });
}

function leadValue(id) {
  return (document.getElementById(id)?.value || "").trim();
}

function collectLeadPayload() {
  const existing = getSelectedLead();
  const ownerName = leadValue("leadOwner");
  const propertyName = leadValue("leadPropertyName") || leadValue("leadCompanyName") || "Untitled Lead";
  const value = Number(leadValue("leadEstimatedValue"));
  const dueDate = leadValue("leadNextStepDue");
  const payload = {
    pipeline_stage: leadValue("leadPipelineStage") || "new_leads",
    company_name: leadValue("leadCompanyName"),
    contact_name: leadValue("leadContactName"),
    contact_phone: leadValue("leadPhone"),
    contact_email: leadValue("leadEmail"),
    property_type: leadValue("leadPropertyType"),
    property_name: propertyName,
    name: propertyName,
    address: leadValue("leadAddress"),
    city: leadValue("leadCity"),
    state: leadValue("leadState"),
    postal_code: leadValue("leadZip"),
    lead_source: leadValue("leadSource"),
    sales_owner_name: ownerName,
    sales_owner_id: ownerName === leadDisplayName() ? leadState.user?.id || null : existing?.sales_owner_name === ownerName ? existing?.sales_owner_id || null : null,
    lead_value: Number.isFinite(value) && value > 0 ? value : null,
    expected_close_date: leadValue("leadCloseDate") || null,
    next_step: leadValue("leadNextStep"),
    next_step_due_at: dueDate ? new Date(`${dueDate}T12:00:00`).toISOString() : null,
    lead_notes: leadValue("leadNotes"),
    last_activity_at: new Date().toISOString()
  };
  if (!leadValue("leadId")) {
    payload.created_by = leadState.user?.id || null;
  }
  return payload;
}

async function saveLeadForm(event) {
  event?.preventDefault();
  if (!suiteSupabase || leadState.isSaving) return;
  leadState.isSaving = true;
  setLeadSaving(true);
  showLeadMessage("Saving lead to Supabase...");

  const id = leadValue("leadId");
  const payload = collectLeadPayload();
  let result = id
    ? await suiteSupabase.from(leadTable).update(payload).eq("id", id).select("*").maybeSingle()
    : await suiteSupabase.from(leadTable).insert(payload).select("*").maybeSingle();

  if (result.error && isMissingLeadOptionalColumn(result.error)) {
    const fallbackPayload = { ...payload };
    leadOptionalColumns.forEach((column) => delete fallbackPayload[column]);
    result = id
      ? await suiteSupabase.from(leadTable).update(fallbackPayload).eq("id", id).select("*").maybeSingle()
      : await suiteSupabase.from(leadTable).insert(fallbackPayload).select("*").maybeSingle();
  }

  leadState.isSaving = false;
  setLeadSaving(false);

  if (result.error) {
    showLeadMessage("Unable to save lead: " + result.error.message, true);
    return;
  }

  const saved = result.data;
  const index = leadState.rows.findIndex((row) => row.id === saved.id);
  if (index >= 0) {
    leadState.rows[index] = saved;
  } else {
    leadState.rows.unshift(saved);
  }
  leadState.selectedId = saved.id;
  populateLeadOwnerFilter();
  fillLeadForm(saved);
  renderLeadData();
  showLeadMessage("Lead saved to Supabase.");
}

async function moveSelectedLeadToStage(stage) {
  const id = leadValue("leadId") || leadState.selectedId;
  if (!id) {
    showLeadMessage("Select or save a lead before moving it.", true);
    return;
  }
  await moveLeadToStage(id, stage);
}

async function moveLeadToStage(id, stage) {
  if (!suiteSupabase || !id || !stage) return;
  showLeadMessage(`Moving lead to ${leadStageLabel(stage)}...`);
  const payload = { pipeline_stage: stage, last_activity_at: new Date().toISOString() };
  let result = await suiteSupabase
    .from(leadTable)
    .update(payload)
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (result.error && isMissingLeadOptionalColumn(result.error)) {
    result = await suiteSupabase
      .from(leadTable)
      .update({ pipeline_stage: stage })
      .eq("id", id)
      .select("*")
      .maybeSingle();
  }

  if (result.error) {
    showLeadMessage("Unable to move lead: " + result.error.message, true);
    return;
  }

  const index = leadState.rows.findIndex((row) => row.id === id);
  if (index >= 0) leadState.rows[index] = result.data;
  leadState.selectedId = id;
  fillLeadForm(result.data);
  renderLeadData();
  showLeadMessage(`Lead moved to ${leadStageLabel(stage)}.`);
}

function setLeadSaving(isSaving) {
  const button = document.getElementById("leadSaveBtn");
  if (button) {
    button.disabled = isSaving;
    const labels = button.querySelectorAll("span");
    const label = labels[labels.length - 1];
    if (label) label.textContent = isSaving ? "Saving..." : "Save Lead";
  }
}

function renderLeadActivity(row) {
  const log = document.getElementById("leadActivityLog");
  if (!log) return;
  if (!row) {
    log.innerHTML = emptyState("calendar", "No activity yet");
    return;
  }
  const events = [
    ["Last Activity", formatDashboardDate(row.last_activity_at || row.updated_at || row.created_at), "activity"],
    ["Created", formatDashboardDate(row.created_at), "calendar"],
    ["Stage", leadStageLabel(row.pipeline_stage), "filter"],
    ["Next Step", row.next_step || "No next step", "chevron-right"],
    ["Close Date", row.expected_close_date || "Not set", "clock"]
  ];
  log.innerHTML = events.map(([label, value, iconName]) => `
    <div class="lead-activity-item">
      ${icon(iconName)}
      <div><strong>${esc(label)}</strong><span>${esc(value)}</span></div>
    </div>
  `).join("");
}

function renderLeadNavigation(row) {
  const summary = document.getElementById("leadNavigationSummary");
  if (!summary) return;
  summary.textContent = row
    ? `${leadTitle(row)} is in ${leadStageLabel(row.pipeline_stage)}.`
    : "Select a lead to jump between workflow pages or move it through the pipeline.";
}

function showLeadMessage(text, isError = false) {
  const message = document.getElementById("leadMessage");
  if (!message) return;
  message.textContent = text || "";
  message.classList.toggle("error", Boolean(isError));
}

function getSelectedLead() {
  return leadState.rows.find((row) => row.id === leadState.selectedId) || null;
}

function leadTitle(row) {
  return row?.company_name || row?.property_name || row?.name || "Untitled Lead";
}

function leadSubtitle(row) {
  return [row?.contact_name, row?.address, row?.city, row?.state].filter(Boolean).join(" - ") || row?.contact_email || "No contact details";
}

function normalizeLeadStage(stage) {
  const token = String(stage || "new_leads").replace(/-/g, "_");
  return stageLabels.some(([id]) => id === token) ? token : "new_leads";
}

function leadStageLabel(stage) {
  const normalized = normalizeLeadStage(stage);
  return stageLabels.find(([id]) => id === normalized)?.[1] || titleCase(normalized);
}

function nextLeadStage(stage) {
  const normalized = normalizeLeadStage(stage);
  const index = stageLabels.findIndex(([id]) => id === normalized);
  return index >= 0 && index < stageLabels.length - 1 ? stageLabels[index + 1][0] : "";
}

function leadDisplayName() {
  return leadState.profile?.full_name || leadState.user?.user_metadata?.full_name || leadState.user?.email?.split("@")[0] || "";
}

function leadMoney(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return "Value not set";
  return number.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function toDateInput(value) {
  const date = parseDate(value);
  if (!date) return "";
  const pad = (part) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function statusClassName(value) {
  return `status-${normalizeToken(value || "open")}`;
}

function isMissingLeadOptionalColumn(error) {
  const message = String(error?.message || "").toLowerCase();
  return leadOptionalColumns.some((column) => message.includes(column.toLowerCase())) || message.includes("schema cache");
}

function renderWalkthroughs() {
  return `
    <section class="walkthrough-workspace" data-walkthrough-page>
      ${toolbar(
        `<button class="view-chip active" type="button" data-walkthrough-view-toggle="calendar">${icon("calendar")}<span>Calendar</span></button><button class="view-chip" type="button" data-walkthrough-view-toggle="list">${icon("list")}<span>List</span></button>`,
        `<label class="inline-search walkthrough-search">${icon("search")}<input id="walkthroughSearchInput" type="search" placeholder="Search walkthroughs..." /></label><select id="walkthroughAssigneeFilter" class="select-button" aria-label="Filter assigned to"><option value="all">All Assignees</option></select><button class="secondary-action" type="button" data-walkthrough-filter-toggle>${icon("filter")}<span>Filters</span></button><button id="walkthroughAddBtn" class="primary-action" type="button">${icon("plus")}<span>Schedule</span></button>`
      )}
      <section id="walkthroughFilterPanel" class="lead-filter-panel" hidden>
        <label class="suite-field"><span>Status</span><select id="walkthroughStatusFilter"><option value="all">All Statuses</option>${walkthroughStatusOptions.map(([id, label]) => `<option value="${esc(id)}">${esc(label)}</option>`).join("")}</select></label>
        <button class="secondary-action" type="button" data-walkthrough-clear-filters><span>Clear Filters</span></button>
      </section>
      <p id="walkthroughMessage" class="status-message" aria-live="polite"></p>
      <section class="metric-strip four walkthrough-metrics">
        ${metric("Scheduled", "0", "active walkthroughs", "calendar-days", "blue", 'id="walkthroughScheduledCount"')}
        ${metric("Confirmed", "0", "ready for visit", "check", "green", 'id="walkthroughConfirmedCount"')}
        ${metric("Today", "0", "on today's calendar", "clock", "yellow", 'id="walkthroughTodayCount"')}
        ${metric("Completed", "0", "ready for quote", "badge-dollar", "purple", 'id="walkthroughCompletedCount"')}
      </section>
      ${panel("Walkthrough Calendar", `
        <div class="calendar-controls walkthrough-calendar-controls">
          <button type="button" data-walkthrough-date-nav="prev" aria-label="Previous range">${icon("chevron-right", "flip")}</button>
          <button type="button" data-walkthrough-date-nav="today">Today</button>
          <button type="button" data-walkthrough-date-nav="next" aria-label="Next range">${icon("chevron-right")}</button>
          <strong id="walkthroughDateRange">Loading...</strong>
          <div>
            <button class="view-chip active" type="button" data-walkthrough-mode="week"><span>Week</span></button>
            <button class="view-chip" type="button" data-walkthrough-mode="month"><span>Month</span></button>
            <button class="view-chip" type="button" data-walkthrough-mode="day"><span>Day</span></button>
          </div>
        </div>
        <div id="walkthroughCalendar" class="walkthrough-calendar-shell">${skeletonRows(4)}</div>
      `, { className: "no-head walkthrough-calendar-panel" })}
      <section id="walkthroughListPanel" class="lead-list-panel" hidden>
        <div id="walkthroughList" class="walkthrough-list">${skeletonRows(4)}</div>
      </section>
      <section class="content-rail lead-detail-rail walkthrough-detail-rail">
        ${panel("Walkthrough Details", walkthroughForm(), { className: "span-main" })}
        <div class="suite-stack">
          ${panel("Activity Log", `<div id="walkthroughActivityLog" class="lead-activity-list">${emptyState("calendar", "No activity yet")}</div>`)}
          ${panel("Linked Workflow", walkthroughNavigationPanel())}
        </div>
      </section>
    </section>
  `;
}

function walkthroughForm() {
  return `
    <form id="walkthroughForm" class="lead-form walkthrough-form">
      <input id="walkthroughId" type="hidden" />
      ${formGrid([
        leadSelectField("walkthroughRecordSelect", "Property / Lead", [["", "New walkthrough"]]),
        leadInputField("walkthroughCompanyName", "Company Name", "text", { required: true }),
        leadInputField("walkthroughPropertyName", "Property Name", "text", { required: true }),
        leadInputField("walkthroughContactName", "Contact Name"),
        leadInputField("walkthroughContactEmail", "Contact Email", "email"),
        leadSelectField("walkthroughType", "Type", walkthroughTypeOptions, { emptyLabel: "Select type" }),
        leadSelectField("walkthroughStatus", "Status", walkthroughStatusOptions, { required: true }),
        leadInputField("walkthroughDate", "Date", "date", { required: true }),
        leadInputField("walkthroughStartTime", "Start Time", "time"),
        leadInputField("walkthroughEndTime", "End Time", "time"),
        leadInputField("walkthroughLocation", "Location / Meeting Link", "text", { className: "wide" }),
        leadInputField("walkthroughAssignedTo", "Assigned To"),
        leadTextareaField("walkthroughNotes", "Notes", "wide")
      ])}
      <div class="lead-form-actions">
        <button id="walkthroughNewBtn" class="secondary-action" type="button">${icon("plus")}<span>New</span></button>
        <button id="walkthroughQuoteBtn" class="secondary-action" type="button">${icon("badge-dollar")}<span>Move to Quote</span></button>
        <button id="walkthroughSaveBtn" class="primary-action" type="submit">${icon("check")}<span>Save Walkthrough</span></button>
      </div>
    </form>
  `;
}

function walkthroughNavigationPanel() {
  return `
    <div class="lead-navigation-panel">
      <p id="walkthroughNavigationSummary">Select a walkthrough to open the connected sales workflow.</p>
      <div class="quick-nav-list">
        <a href="leads.html">${icon("triangle")}<span>Open Leads</span></a>
        <a href="quotes.html">${icon("badge-dollar")}<span>Open Quotes</span></a>
        <a href="contracts-pending.html">${icon("file-signature")}<span>Open Contracts Pending</span></a>
        <button type="button" data-walkthrough-move-stage="quote_sent">${icon("badge-dollar")}<span>Move Selected to Quote</span></button>
      </div>
    </div>
  `;
}

function initWalkthroughs() {
  const root = document.querySelector("[data-walkthrough-page]");
  if (!root) return;

  root.addEventListener("click", handleWalkthroughClick);
  root.querySelector("#walkthroughForm")?.addEventListener("submit", saveWalkthroughForm);
  root.querySelector("#walkthroughSearchInput")?.addEventListener("input", (event) => {
    walkthroughState.search = event.target.value || "";
    renderWalkthroughData();
  });
  root.querySelector("#walkthroughAssigneeFilter")?.addEventListener("change", (event) => {
    walkthroughState.assigneeFilter = event.target.value || "all";
    renderWalkthroughData();
  });
  root.querySelector("#walkthroughStatusFilter")?.addEventListener("change", (event) => {
    walkthroughState.statusFilter = event.target.value || "all";
    renderWalkthroughData();
  });
  root.querySelector("#walkthroughRecordSelect")?.addEventListener("change", (event) => {
    const id = event.target.value;
    if (id) {
      selectWalkthroughRecord(id);
    } else {
      clearWalkthroughForm();
    }
  });

  clearWalkthroughForm();
  void loadWalkthroughs();
}

function handleWalkthroughClick(event) {
  const addButton = event.target.closest("#walkthroughAddBtn, #walkthroughNewBtn");
  if (addButton) {
    clearWalkthroughForm();
    document.getElementById("walkthroughCompanyName")?.focus();
    return;
  }

  const viewToggle = event.target.closest("[data-walkthrough-view-toggle]");
  if (viewToggle) {
    walkthroughState.view = viewToggle.dataset.walkthroughViewToggle || "calendar";
    renderWalkthroughData();
    return;
  }

  const modeToggle = event.target.closest("[data-walkthrough-mode]");
  if (modeToggle) {
    walkthroughState.calendarMode = modeToggle.dataset.walkthroughMode || "week";
    renderWalkthroughData();
    return;
  }

  const dateNav = event.target.closest("[data-walkthrough-date-nav]");
  if (dateNav) {
    moveWalkthroughDateCursor(dateNav.dataset.walkthroughDateNav);
    renderWalkthroughData();
    return;
  }

  const filterToggle = event.target.closest("[data-walkthrough-filter-toggle]");
  if (filterToggle) {
    const panel = document.getElementById("walkthroughFilterPanel");
    if (panel) panel.hidden = !panel.hidden;
    return;
  }

  const clearFilters = event.target.closest("[data-walkthrough-clear-filters]");
  if (clearFilters) {
    walkthroughState.search = "";
    walkthroughState.statusFilter = "all";
    walkthroughState.assigneeFilter = "all";
    renderWalkthroughFilterControls();
    renderWalkthroughData();
    return;
  }

  const moveStage = event.target.closest("#walkthroughQuoteBtn, [data-walkthrough-move-stage]");
  if (moveStage) {
    const rowId = moveStage.dataset.walkthroughSelect || event.target.closest("[data-walkthrough-select]")?.dataset.walkthroughSelect || "";
    void moveSelectedWalkthroughToQuote(rowId);
    return;
  }

  const select = event.target.closest("[data-walkthrough-select]");
  if (select) {
    selectWalkthroughRecord(select.dataset.walkthroughSelect);
  }
}

async function loadWalkthroughs() {
  if (!suiteSupabase) {
    showWalkthroughMessage("Supabase config is missing. Add env.js values before using walkthroughs.", true);
    return;
  }

  showWalkthroughMessage("Loading walkthroughs...");
  const calendar = document.getElementById("walkthroughCalendar");
  if (calendar) calendar.innerHTML = skeletonRows(4);

  const { data: userData } = await suiteSupabase.auth.getUser();
  walkthroughState.user = userData?.user || null;
  if (walkthroughState.user) {
    const { data: profile } = await suiteSupabase
      .from("profiles")
      .select("role,full_name,email,avatar_url")
      .eq("id", walkthroughState.user.id)
      .maybeSingle();
    walkthroughState.profile = profile || null;
  }

  const { data, error, usedFallback } = await loadPortalPropertyRows(300);

  if (error) {
    showWalkthroughMessage("Unable to load walkthroughs: " + error.message, true);
    renderWalkthroughData();
    return;
  }

  walkthroughState.rows = data || [];
  const first = getWalkthroughRows()[0] || walkthroughState.rows.find((row) => normalizeLeadStage(row.pipeline_stage) === "walkthrough") || null;
  if (!walkthroughState.selectedId && first) {
    walkthroughState.selectedId = first.id;
    fillWalkthroughForm(first);
  }
  populateWalkthroughRecordSelect();
  populateWalkthroughAssigneeFilter();
  renderWalkthroughData();
  const walkthroughCount = getWalkthroughRows().length;
  showWalkthroughMessage(walkthroughCount
    ? `${walkthroughCount} walkthrough${walkthroughCount === 1 ? "" : "s"} synced from Supabase${usedFallback ? " with compatible sorting" : ""}.`
    : "Synced with Supabase. No walkthroughs scheduled yet.");
}

function renderWalkthroughData() {
  renderWalkthroughViewToggles();
  renderWalkthroughModeToggles();
  renderWalkthroughFilterControls();
  renderWalkthroughMetrics();
  renderWalkthroughCalendar();
  renderWalkthroughList();
  renderWalkthroughActivity(getSelectedWalkthrough());
  renderWalkthroughNavigation(getSelectedWalkthrough());

  const calendarPanel = document.querySelector(".walkthrough-calendar-panel");
  const listPanel = document.getElementById("walkthroughListPanel");
  if (calendarPanel) calendarPanel.hidden = walkthroughState.view !== "calendar";
  if (listPanel) listPanel.hidden = walkthroughState.view !== "list";
}

function renderWalkthroughViewToggles() {
  document.querySelectorAll("[data-walkthrough-view-toggle]").forEach((button) => {
    button.classList.toggle("active", button.dataset.walkthroughViewToggle === walkthroughState.view);
  });
}

function renderWalkthroughModeToggles() {
  document.querySelectorAll("[data-walkthrough-mode]").forEach((button) => {
    button.classList.toggle("active", button.dataset.walkthroughMode === walkthroughState.calendarMode);
  });
}

function renderWalkthroughFilterControls() {
  const search = document.getElementById("walkthroughSearchInput");
  if (search && search.value !== walkthroughState.search) search.value = walkthroughState.search;
  const assignee = document.getElementById("walkthroughAssigneeFilter");
  if (assignee && assignee.value !== walkthroughState.assigneeFilter) assignee.value = walkthroughState.assigneeFilter;
  const status = document.getElementById("walkthroughStatusFilter");
  if (status && status.value !== walkthroughState.statusFilter) status.value = walkthroughState.statusFilter;
}

function populateWalkthroughRecordSelect() {
  const select = document.getElementById("walkthroughRecordSelect");
  if (!select) return;
  const rows = [...walkthroughState.rows].sort((a, b) => leadTitle(a).localeCompare(leadTitle(b)));
  select.innerHTML = `<option value="">New walkthrough</option>${rows.map((row) => `<option value="${esc(row.id)}">${esc(leadTitle(row))}</option>`).join("")}`;
  select.value = walkthroughState.selectedId || "";
}

function populateWalkthroughAssigneeFilter() {
  const filter = document.getElementById("walkthroughAssigneeFilter");
  if (!filter) return;
  const assignees = Array.from(new Set([
    walkthroughDisplayName(),
    ...walkthroughState.rows.map((row) => row.walkthrough_assigned_to || row.sales_owner_name).filter(Boolean)
  ])).filter(Boolean).sort();
  filter.innerHTML = `<option value="all">All Assignees</option><option value="unassigned">Unassigned</option>${assignees.map((name) => `<option value="${esc(name)}">${esc(name)}</option>`).join("")}`;
  filter.value = walkthroughState.assigneeFilter;
}

function renderWalkthroughMetrics() {
  const rows = getWalkthroughRows();
  const byStatus = (status) => rows.filter((row) => walkthroughStatus(row) === status).length;
  const setText = (id, value) => {
    const target = document.getElementById(id);
    if (target) target.textContent = value;
  };
  setText("walkthroughScheduledCount", byStatus("scheduled"));
  setText("walkthroughConfirmedCount", byStatus("confirmed"));
  setText("walkthroughTodayCount", rows.filter((row) => isToday(row.walkthrough_at)).length);
  setText("walkthroughCompletedCount", byStatus("completed"));
}

function renderWalkthroughCalendar() {
  const shell = document.getElementById("walkthroughCalendar");
  const rangeLabel = document.getElementById("walkthroughDateRange");
  if (!shell) return;

  const { start, end } = walkthroughCalendarRange();
  if (rangeLabel) rangeLabel.textContent = walkthroughRangeLabel(start, end);
  const rows = getFilteredWalkthroughs().filter((row) => {
    const date = parseDate(row.walkthrough_at);
    return date && date >= start && date < end;
  });

  if (walkthroughState.calendarMode === "day") {
    shell.innerHTML = renderWalkthroughDay(start, rows);
    return;
  }
  if (walkthroughState.calendarMode === "month") {
    shell.innerHTML = renderWalkthroughMonth(start, rows);
    return;
  }
  shell.innerHTML = renderWalkthroughWeek(start, rows);
}

function renderWalkthroughWeek(start, rows) {
  const days = Array.from({ length: 7 }, (_, index) => addDays(start, index));
  return `
    <div class="walkthrough-week-grid">
      ${days.map((day) => {
        const dayRows = rows.filter((row) => {
          const date = parseDate(row.walkthrough_at);
          return date && isSameDay(date, day);
        });
        return `
          <article class="walkthrough-day-column ${isSameDay(day, new Date()) ? "today" : ""}">
            <header><strong>${esc(day.toLocaleDateString([], { weekday: "short" }))}</strong><span>${esc(day.toLocaleDateString([], { month: "short", day: "numeric" }))}</span></header>
            <div>${dayRows.length ? dayRows.map((row) => renderWalkthroughEventCard(row)).join("") : `<p>No walkthroughs</p>`}</div>
          </article>
        `;
      }).join("")}
    </div>
  `;
}

function renderWalkthroughDay(day, rows) {
  return `
    <div class="walkthrough-day-agenda">
      ${rows.length ? rows.map((row) => renderWalkthroughEventCard(row)).join("") : emptyState("calendar", "No walkthroughs scheduled", "Use Schedule to add one for this date.")}
    </div>
  `;
}

function renderWalkthroughMonth(start, rows) {
  const monthStart = new Date(start.getFullYear(), start.getMonth(), 1);
  const gridStart = startOfWeek(monthStart);
  const days = Array.from({ length: 42 }, (_, index) => addDays(gridStart, index));
  return `
    <div class="walkthrough-month-grid">
      ${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => `<b>${day}</b>`).join("")}
      ${days.map((day) => {
        const dayRows = rows.filter((row) => {
          const date = parseDate(row.walkthrough_at);
          return date && isSameDay(date, day);
        });
        return `
          <article class="${day.getMonth() !== monthStart.getMonth() ? "muted" : ""} ${isSameDay(day, new Date()) ? "today" : ""}">
            <time>${day.getDate()}</time>
            ${dayRows.slice(0, 3).map((row) => renderWalkthroughEventCard(row, true)).join("")}
            ${dayRows.length > 3 ? `<small>+${dayRows.length - 3} more</small>` : ""}
          </article>
        `;
      }).join("")}
    </div>
  `;
}

function renderWalkthroughEventCard(row, compact = false) {
  const status = walkthroughStatus(row);
  return `
    <button class="walkthrough-event-card ${compact ? "compact" : ""} ${statusClassName(status)} ${row.id === walkthroughState.selectedId ? "active" : ""}" type="button" data-walkthrough-select="${esc(row.id)}">
      <strong>${esc(walkthroughTitle(row))}</strong>
      <span>${esc(walkthroughTimeText(row))}</span>
      ${compact ? "" : `<small>${esc(walkthroughAssignee(row))} - ${esc(titleCase(status))}</small>`}
    </button>
  `;
}

function renderWalkthroughList() {
  const list = document.getElementById("walkthroughList");
  if (!list) return;
  const rows = getFilteredWalkthroughs();
  list.innerHTML = rows.length
    ? rows.map((row) => `
      <article class="lead-list-row walkthrough-list-row ${row.id === walkthroughState.selectedId ? "active" : ""}" data-walkthrough-select="${esc(row.id)}">
        <div><strong>${esc(walkthroughTitle(row))}</strong><p>${esc(walkthroughSubtitle(row))}</p></div>
        <span>${esc(walkthroughTimeText(row))}</span>
        <span>${esc(walkthroughAssignee(row))}</span>
        <span class="status-badge ${statusClassName(walkthroughStatus(row))}">${esc(titleCase(walkthroughStatus(row)))}</span>
        <div class="lead-list-actions">
          <button type="button" data-walkthrough-select="${esc(row.id)}">Edit</button>
          <button type="button" data-walkthrough-select="${esc(row.id)}" data-walkthrough-move-stage="quote_sent">Move to Quote</button>
        </div>
      </article>
    `).join("")
    : emptyState("calendar", "No walkthroughs found", "Adjust the filters or schedule one.");
}

function getFilteredWalkthroughs() {
  const term = walkthroughState.search.trim().toLowerCase();
  return getWalkthroughRows().filter((row) => {
    const status = walkthroughStatus(row);
    const assignee = row.walkthrough_assigned_to || row.sales_owner_name || "";
    if (walkthroughState.statusFilter !== "all" && status !== walkthroughState.statusFilter) return false;
    if (walkthroughState.assigneeFilter === "unassigned" && assignee) return false;
    if (walkthroughState.assigneeFilter !== "all" && walkthroughState.assigneeFilter !== "unassigned" && assignee !== walkthroughState.assigneeFilter) return false;
    if (!term) return true;
    return [
      row.company_name,
      row.property_name,
      row.name,
      row.contact_name,
      row.contact_email,
      row.address,
      row.city,
      row.state,
      row.walkthrough_type,
      row.walkthrough_location,
      row.walkthrough_assigned_to,
      row.walkthrough_notes,
      row.sales_owner_name
    ].some((value) => String(value || "").toLowerCase().includes(term));
  }).sort((a, b) => dateValue(a.walkthrough_at) - dateValue(b.walkthrough_at));
}

function getWalkthroughRows() {
  return walkthroughState.rows.filter((row) => {
    const stage = normalizeLeadStage(row.pipeline_stage);
    return stage === "walkthrough" || Boolean(row.walkthrough_at || row.walkthrough_notes);
  });
}

function selectWalkthroughRecord(id) {
  const row = walkthroughState.rows.find((item) => item.id === id);
  if (!row) return;
  walkthroughState.selectedId = id;
  fillWalkthroughForm(row);
  renderWalkthroughData();
  document.getElementById("walkthroughForm")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function clearWalkthroughForm() {
  walkthroughState.selectedId = null;
  const now = new Date();
  now.setMinutes(Math.ceil(now.getMinutes() / 15) * 15, 0, 0);
  const end = new Date(now);
  end.setHours(end.getHours() + 1);
  setWalkthroughFormValues({
    id: "",
    company_name: "",
    property_name: "",
    contact_name: "",
    contact_email: "",
    walkthrough_type: "",
    walkthrough_status: "scheduled",
    walkthrough_at: now.toISOString(),
    walkthrough_end_at: end.toISOString(),
    walkthrough_location: "",
    walkthrough_assigned_to: walkthroughDisplayName(),
    walkthrough_notes: ""
  });
  renderWalkthroughActivity(null);
  renderWalkthroughNavigation(null);
  renderWalkthroughData();
}

function fillWalkthroughForm(row) {
  setWalkthroughFormValues({
    id: row.id || "",
    company_name: row.company_name || "",
    property_name: row.property_name || row.name || "",
    contact_name: row.contact_name || "",
    contact_email: row.contact_email || "",
    walkthrough_type: row.walkthrough_type || "",
    walkthrough_status: walkthroughStatus(row),
    walkthrough_at: row.walkthrough_at || "",
    walkthrough_end_at: row.walkthrough_end_at || "",
    walkthrough_location: row.walkthrough_location || row.address || "",
    walkthrough_assigned_to: row.walkthrough_assigned_to || row.sales_owner_name || walkthroughDisplayName(),
    walkthrough_notes: row.walkthrough_notes || ""
  });
}

function setWalkthroughFormValues(values) {
  const map = {
    walkthroughId: values.id,
    walkthroughRecordSelect: values.id,
    walkthroughCompanyName: values.company_name,
    walkthroughPropertyName: values.property_name,
    walkthroughContactName: values.contact_name,
    walkthroughContactEmail: values.contact_email,
    walkthroughType: values.walkthrough_type,
    walkthroughStatus: values.walkthrough_status,
    walkthroughDate: toDateInput(values.walkthrough_at),
    walkthroughStartTime: toTimeInput(values.walkthrough_at),
    walkthroughEndTime: toTimeInput(values.walkthrough_end_at),
    walkthroughLocation: values.walkthrough_location,
    walkthroughAssignedTo: values.walkthrough_assigned_to,
    walkthroughNotes: values.walkthrough_notes
  };
  Object.entries(map).forEach(([id, value]) => {
    const field = document.getElementById(id);
    if (field) field.value = value ?? "";
  });
}

function walkthroughValue(id) {
  return (document.getElementById(id)?.value || "").trim();
}

function collectWalkthroughPayload() {
  const existing = getSelectedWalkthrough() || walkthroughState.rows.find((row) => row.id === walkthroughValue("walkthroughId"));
  const propertyName = walkthroughValue("walkthroughPropertyName") || walkthroughValue("walkthroughCompanyName") || "Untitled Walkthrough";
  const startAt = combineWalkthroughDateTime("walkthroughDate", "walkthroughStartTime");
  const endAt = combineWalkthroughDateTime("walkthroughDate", "walkthroughEndTime");
  const payload = {
    pipeline_stage: "walkthrough",
    company_name: walkthroughValue("walkthroughCompanyName"),
    property_name: propertyName,
    name: propertyName,
    contact_name: walkthroughValue("walkthroughContactName"),
    contact_email: walkthroughValue("walkthroughContactEmail"),
    walkthrough_type: walkthroughValue("walkthroughType"),
    walkthrough_status: walkthroughValue("walkthroughStatus") || "scheduled",
    walkthrough_at: startAt,
    walkthrough_end_at: endAt,
    walkthrough_location: walkthroughValue("walkthroughLocation"),
    walkthrough_assigned_to: walkthroughValue("walkthroughAssignedTo"),
    walkthrough_notes: walkthroughValue("walkthroughNotes"),
    sales_owner_name: existing?.sales_owner_name || walkthroughValue("walkthroughAssignedTo"),
    sales_owner_id: existing?.sales_owner_id || null,
    last_activity_at: new Date().toISOString()
  };
  if (!walkthroughValue("walkthroughId")) {
    payload.created_by = walkthroughState.user?.id || null;
  }
  return payload;
}

async function saveWalkthroughForm(event) {
  event?.preventDefault();
  if (!suiteSupabase || walkthroughState.isSaving) return;
  walkthroughState.isSaving = true;
  setWalkthroughSaving(true);
  showWalkthroughMessage("Saving walkthrough to Supabase...");

  const id = walkthroughValue("walkthroughId");
  const payload = collectWalkthroughPayload();
  let result = id
    ? await suiteSupabase.from(leadTable).update(payload).eq("id", id).select("*").maybeSingle()
    : await suiteSupabase.from(leadTable).insert(payload).select("*").maybeSingle();

  if (result.error && isMissingWalkthroughOptionalColumn(result.error)) {
    const fallbackPayload = { ...payload };
    walkthroughOptionalColumns.forEach((column) => delete fallbackPayload[column]);
    result = id
      ? await suiteSupabase.from(leadTable).update(fallbackPayload).eq("id", id).select("*").maybeSingle()
      : await suiteSupabase.from(leadTable).insert(fallbackPayload).select("*").maybeSingle();
  }

  walkthroughState.isSaving = false;
  setWalkthroughSaving(false);

  if (result.error) {
    showWalkthroughMessage("Unable to save walkthrough: " + result.error.message, true);
    return;
  }

  const saved = result.data;
  const index = walkthroughState.rows.findIndex((row) => row.id === saved.id);
  if (index >= 0) {
    walkthroughState.rows[index] = saved;
  } else {
    walkthroughState.rows.unshift(saved);
  }
  walkthroughState.selectedId = saved.id;
  populateWalkthroughRecordSelect();
  populateWalkthroughAssigneeFilter();
  fillWalkthroughForm(saved);
  renderWalkthroughData();
  showWalkthroughMessage("Walkthrough saved to Supabase.");
}

async function moveSelectedWalkthroughToQuote(idOverride = "") {
  const id = idOverride || walkthroughValue("walkthroughId") || walkthroughState.selectedId;
  if (!id || !suiteSupabase) {
    showWalkthroughMessage("Select or save a walkthrough before moving it to quote.", true);
    return;
  }
  showWalkthroughMessage("Moving walkthrough to quote...");
  const payload = { pipeline_stage: "quote_sent", walkthrough_status: "completed", last_activity_at: new Date().toISOString() };
  let result = await suiteSupabase.from(leadTable).update(payload).eq("id", id).select("*").maybeSingle();
  if (result.error && isMissingWalkthroughOptionalColumn(result.error)) {
    result = await suiteSupabase.from(leadTable).update({ pipeline_stage: "quote_sent" }).eq("id", id).select("*").maybeSingle();
  }
  if (result.error) {
    showWalkthroughMessage("Unable to move walkthrough: " + result.error.message, true);
    return;
  }
  const index = walkthroughState.rows.findIndex((row) => row.id === id);
  if (index >= 0) walkthroughState.rows[index] = result.data;
  walkthroughState.selectedId = id;
  fillWalkthroughForm(result.data);
  renderWalkthroughData();
  showWalkthroughMessage("Walkthrough moved to Quote Sent.");
}

function setWalkthroughSaving(isSaving) {
  const button = document.getElementById("walkthroughSaveBtn");
  if (button) {
    button.disabled = isSaving;
    const labels = button.querySelectorAll("span");
    const label = labels[labels.length - 1];
    if (label) label.textContent = isSaving ? "Saving..." : "Save Walkthrough";
  }
}

function renderWalkthroughActivity(row) {
  const log = document.getElementById("walkthroughActivityLog");
  if (!log) return;
  if (!row) {
    log.innerHTML = emptyState("calendar", "No activity yet");
    return;
  }
  const events = [
    ["Scheduled", walkthroughTimeText(row), "calendar-days"],
    ["Status", titleCase(walkthroughStatus(row)), "filter"],
    ["Assigned To", walkthroughAssignee(row), "user"],
    ["Last Activity", formatDashboardDate(row.last_activity_at || row.updated_at || row.created_at), "activity"],
    ["Notes", row.walkthrough_notes || "No notes yet", "message-square"]
  ];
  log.innerHTML = events.map(([label, value, iconName]) => `
    <div class="lead-activity-item">
      ${icon(iconName)}
      <div><strong>${esc(label)}</strong><span>${esc(value)}</span></div>
    </div>
  `).join("");
}

function renderWalkthroughNavigation(row) {
  const summary = document.getElementById("walkthroughNavigationSummary");
  if (!summary) return;
  summary.textContent = row
    ? `${walkthroughTitle(row)} is ${titleCase(walkthroughStatus(row))}.`
    : "Select a walkthrough to open the connected sales workflow.";
}

function showWalkthroughMessage(text, isError = false) {
  const message = document.getElementById("walkthroughMessage");
  if (!message) return;
  message.textContent = text || "";
  message.classList.toggle("error", Boolean(isError));
}

function getSelectedWalkthrough() {
  return walkthroughState.rows.find((row) => row.id === walkthroughState.selectedId) || null;
}

function walkthroughTitle(row) {
  return row?.property_name || row?.company_name || row?.name || "Untitled Walkthrough";
}

function walkthroughSubtitle(row) {
  return [row?.company_name, row?.contact_name, row?.walkthrough_location || row?.address].filter(Boolean).join(" - ") || "No details yet";
}

function walkthroughStatus(row) {
  return normalizeToken(row?.walkthrough_status || "scheduled") || "scheduled";
}

function walkthroughAssignee(row) {
  return row?.walkthrough_assigned_to || row?.sales_owner_name || "Unassigned";
}

function walkthroughDisplayName() {
  return walkthroughState.profile?.full_name || walkthroughState.user?.user_metadata?.full_name || walkthroughState.user?.email?.split("@")[0] || "";
}

function walkthroughTimeText(row) {
  return formatDateWindow(row?.walkthrough_at, row?.walkthrough_end_at);
}

function walkthroughCalendarRange() {
  const cursor = new Date(walkthroughState.dateCursor);
  if (walkthroughState.calendarMode === "day") {
    const start = new Date(cursor);
    start.setHours(0, 0, 0, 0);
    return { start, end: addDays(start, 1) };
  }
  if (walkthroughState.calendarMode === "month") {
    const start = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    return { start, end: new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1) };
  }
  const start = startOfWeek(cursor);
  return { start, end: addDays(start, 7) };
}

function walkthroughRangeLabel(start, end) {
  if (walkthroughState.calendarMode === "day") {
    return start.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  }
  if (walkthroughState.calendarMode === "month") {
    return start.toLocaleDateString([], { month: "long", year: "numeric" });
  }
  const finish = addDays(end, -1);
  return `${start.toLocaleDateString([], { month: "short", day: "numeric" })} - ${finish.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}`;
}

function moveWalkthroughDateCursor(direction) {
  if (direction === "today") {
    walkthroughState.dateCursor = new Date();
    return;
  }
  const amount = direction === "prev" ? -1 : 1;
  const cursor = new Date(walkthroughState.dateCursor);
  if (walkthroughState.calendarMode === "month") {
    cursor.setMonth(cursor.getMonth() + amount);
  } else if (walkthroughState.calendarMode === "day") {
    cursor.setDate(cursor.getDate() + amount);
  } else {
    cursor.setDate(cursor.getDate() + amount * 7);
  }
  walkthroughState.dateCursor = cursor;
}

function startOfWeek(value) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - date.getDay());
  return date;
}

function toTimeInput(value) {
  const date = parseDate(value);
  if (!date) return "";
  const pad = (part) => String(part).padStart(2, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function combineWalkthroughDateTime(dateId, timeId) {
  const date = walkthroughValue(dateId);
  if (!date) return null;
  const time = walkthroughValue(timeId) || "09:00";
  const value = new Date(`${date}T${time}`);
  return Number.isNaN(value.getTime()) ? null : value.toISOString();
}

function isMissingWalkthroughOptionalColumn(error) {
  const message = String(error?.message || "").toLowerCase();
  return walkthroughOptionalColumns.some((column) => message.includes(column.toLowerCase())) || message.includes("schema cache");
}

function renderQuotes() {
  return `
    ${toolbar(
      `${chip("All Quotes", true, "briefcase")}${chip("List View", false, "list")}`,
      `${actionButton("Filters", "filter", "", "secondary")}${actionButton("New Quote", "plus")}`
    )}
    <section class="metric-strip six">
      ${metric("Draft", "0", "", "document", "blue")}
      ${metric("Sent", "0", "", "document", "purple")}
      ${metric("Follow Up", "0", "", "clock", "yellow")}
      ${metric("Accepted", "0", "", "check", "green")}
      ${metric("Rejected", "0", "", "alert", "red")}
      ${metric("Expired", "0", "", "clock", "slate")}
    </section>
    ${tableFrame(["", "Quote #", "Property / Lead", "Client", "Service Type", "Quote Value", "Status", "Sent Date", "Expiration Date", "Owner", "Actions"], emptyState("document", "No quotes found"), { checkbox: true, className: "tall-table" })}
    <section class="three-panels">
      ${panel("Quote Details", formGrid([
        selectControl("Property / Lead", [""]),
        selectControl("Client", [""]),
        inputControl("Service Type"),
        inputControl("Quote Value", "$"),
        selectControl("Recurring", [""]),
        selectControl("One-Time", [""]),
        inputControl("Expiration Date", "", "date"),
        selectControl("Owner", [""]),
        selectControl("Status", [""]),
        textareaControl("Notes", "wide")
      ]))}
      ${panel("Activity Log", emptyState("calendar", "No activity yet"), { action: { label: "View All", tone: "secondary" } })}
      ${panel("Files & Documents", uploadDrop())}
    </section>
  `;
}

function renderContractsPending() {
  return `
    ${toolbar(`${chip("All Contracts", true, "calendar")}${chip("Calendar View", false, "calendar-days")}`, `${actionButton("Filters", "filter", "", "secondary")}${actionButton("Export", "download", "", "secondary")}`)}
    <section class="metric-strip six">
      ${metric("Sent", "0", "", "file-signature", "purple")}
      ${metric("Viewed", "0", "", "activity", "blue")}
      ${metric("Pending Signature", "0", "", "line-chart", "yellow")}
      ${metric("Expiring Soon", "0", "", "alert", "orange")}
      ${metric("Signed", "0", "", "check", "green")}
      ${metric("Declined", "0", "", "alert", "red")}
    </section>
    ${tableFrame(["", "Contract / Property", "Client", "Contract Value", "Sent Date", "Status", "Expires On", "Last Activity", "Sent To", "Actions"], emptyState("document", "No contracts pending"), { checkbox: true, className: "tall-table" })}
    <section class="three-panels">
      ${panel("Contract Details", formGrid([
        selectControl("Client", [""]),
        selectControl("Property / Location", [""]),
        inputControl("Contract Value", "$"),
        selectControl("Frequency", [""]),
        inputControl("Start Date", "", "date"),
        inputControl("Expires On", "", "date"),
        textareaControl("Notes", "wide")
      ]))}
      ${panel("Activity Log", emptyState("calendar", "No activity yet"), { action: { label: "View All", tone: "secondary" } })}
      ${panel("Files & Documents", uploadDrop())}
    </section>
  `;
}

function renderContracts() {
  return `
    <section class="split-contracts">
      <div>
        ${toolbar(`${searchBox("Search contracts...")}${actionButton("Filters", "filter", "", "secondary")}`, actionButton("Export", "download", "", "secondary"))}
        ${tableFrame(["", "Contract / Property", "Client", "Status", "Frequency", "Start Date", "End Date", "Monthly Value", "Actions"], emptyState("document", "No contracts found"), {
          checkbox: true,
          toolbar: tabs([["all", "All Contracts"], ["archived", "Archived"]], "all"),
          className: "contract-list-card"
        })}
      </div>
      ${panel("Contract Details", `
        ${tabs([["overview", "Overview"], ["scope", "Scope of Work"], ["schedule", "Schedule"], ["docs", "Documents"], ["activity", "Activity"]], "overview")}
        <h3>Contract Information</h3>
        ${formGrid([
          inputControl("Contract / Property"),
          inputControl("Client"),
          selectControl("Status", [""]),
          selectControl("Contract Type", [""]),
          selectControl("Frequency", [""]),
          inputControl("Start Date", "", "date"),
          inputControl("End Date", "", "date"),
          inputControl("Monthly Value", "$")
        ])}
        <h3>Key Contacts</h3>
        ${formGrid([inputControl("Primary Contact"), inputControl("Email"), inputControl("Phone"), inputControl("Secondary Contact")])}
        <h3>Service Details</h3>
        ${formGrid([selectControl("Assigned Contractor", [""]), selectControl("Backup Contractor", [""]), inputControl("Service Days"), inputControl("Service Time"), inputControl("Property Address", "", "text")])}
        ${textareaControl("Contract Notes", "wide")}
      `, { className: "contract-details-panel" })}
    </section>
  `;
}

function renderSchedule() {
  const rightFilters = filters("Filter Schedule", [
    selectControl("Property / Location", ["Select property..."]),
    selectControl("Contractor", ["Select contractor..."]),
    selectControl("Service Type", ["Select service type..."]),
    selectControl("Status", ["Select status..."])
  ]);
  return `
    ${toolbar(`${scheduleModeButton("today", "Today", "calendar", true)}${scheduleModeButton("week", "Week", "calendar-days")}${scheduleModeButton("month", "Month", "calendar")}`, actionButton("Filters", "filter", "", "secondary"))}
    <section class="schedule-layout" data-schedule-layout>
      <div class="schedule-main-views">
        <div class="schedule-view is-active" data-schedule-panel="today">
          ${panel("", `
            <div class="calendar-controls"><button>${icon("chevron-right", "flip")}</button><button>${icon("chevron-right")}</button><button>Today</button><strong>May 19, 2025 ${icon("calendar")} ${icon("chevron-down")}</strong></div>
            ${dayCalendar("No schedule items", "There are no scheduled cleanings for this day.")}
          `, { className: "no-head schedule-mode-panel" })}
        </div>
        <div class="schedule-view" data-schedule-panel="week" hidden>
          ${panel("", `
            <div class="calendar-controls"><button>${icon("chevron-right", "flip")}</button><button>${icon("chevron-right")}</button><button>This Week</button><strong>May 18 - May 24, 2025 ${icon("chevron-down")}</strong></div>
            ${scheduleWeekCalendar("No schedule items", "There are no scheduled cleanings for this week.")}
          `, { className: "no-head schedule-mode-panel" })}
        </div>
        <div class="schedule-view" data-schedule-panel="month" hidden>
          ${panel("", monthCalendarGrid(), { className: "no-head schedule-mode-panel schedule-month-panel" })}
        </div>
      </div>
      <aside class="suite-stack">
        ${panel("", miniCalendar(), { className: "no-head" })}
        ${rightFilters}
      </aside>
    </section>
  `;
}

function renderCoverageCenter() {
  return `
    <section class="coverage-layout">
      <div class="suite-stack">
        <section class="metric-strip five">
          ${metric("Open Requests", "0", "from last 7 days", "calendar", "green")}
          ${metric("Filled Requests", "0", "from last 7 days", "check", "green")}
          ${metric("Pending Response", "0", "from last 7 days", "clock", "blue")}
          ${metric("Available Contractors", "0", "online now", "users", "green")}
          ${metric("Coverage Rating", "-", "based on last 30 days", "star", "blue")}
        </section>
        ${tableFrame(["", "Request ID", "Service Type", "Property / Location", "Date & Time", "Duration", "Status", "Requested By", "Actions"], emptyState("calendar", "No coverage requests", "Coverage requests will appear here."), {
          checkbox: true,
          toolbar: toolbar(tabs([["all", "All Requests"], ["mine", "My Requests"], ["open", "Open"], ["filled", "Filled"], ["cancelled", "Cancelled"], ["past", "Past"]], "all"), `${actionButton("Filters", "filter", "", "secondary")}${searchBox("Search requests...")}`)
        })}
        <section class="two-panels">
          ${panel("Contractor Availability", emptyState("user", "No contractors available", "Available contractors will appear here."), { action: { label: "View All", tone: "secondary" } })}
          ${panel("Recent Activity", skeletonRows(4), { action: { label: "View All", tone: "secondary" } })}
        </section>
      </div>
      <aside class="suite-stack">
        ${panel("Coverage Requests", emptyState("document", "No active requests", "Create a new coverage request or view all requests.", actionButton("Create New Request", "plus")), { action: { label: "New Request", icon: "plus" } })}
        ${panel("Calendar Overview", miniCalendar())}
        ${filters("Quick Filters", [selectControl("Service Type", ["Select service type..."]), selectControl("Property / Location", ["Select property..."]), inputControl("Date Range", "Select date range...", "date")])}
      </aside>
    </section>
  `;
}

function renderAssignments() {
  const assignmentToolbar = toolbar(
    `<div class="suite-tabs" role="tablist">
      ${[
        ["open", "Job Board"],
        ["preferred_pending", "Preferred"],
        ["claimed", "Claimed"],
        ["in_progress", "In Progress"],
        ["upcoming", "Upcoming"],
        ["overdue", "Overdue"],
        ["completed", "Completed"],
        ["all", "All"]
      ].map(([key, label]) => `<button class="suite-tab assignment-status-tab ${key === "open" ? "active" : ""}" type="button" data-assignment-status-tab="${esc(key)}">${esc(label)}</button>`).join("")}
    </div>`,
    `<label class="inline-search"><span class="sr-only">Search assignments</span>${icon("search")}<input id="assignmentSearchInput" type="search" placeholder="Search assignments..." /></label><button class="secondary-action" type="button" data-assignment-clear-filters>${icon("x")}<span>Clear</span></button>`
  );
  return `
    <section class="assignments-layout" data-assignments-page>
      <div class="suite-stack">
        <section class="metric-strip five">
          ${metric("Job Board", "0", "not completed", "calendar", "green", 'id="assignmentTotalCount"')}
          ${metric("Today's Assignments", "0", "due today", "calendar", "purple", 'id="assignmentTodayCount"')}
          ${metric("In Progress", "0", "right now", "clock", "orange", 'id="assignmentProgressCount"')}
          ${metric("Completed (7 Days)", "0", "from last 7 days", "check", "green", 'id="assignmentCompletedCount"')}
          ${metric("Overdue", "0", "past due", "alert", "red", 'id="assignmentOverdueCount"')}
        </section>
        <section class="suite-panel assignment-list-panel">
          <div class="panel-head assignment-list-head">
            <div>
              <h2>Assignment Job Board</h2>
              <p>Synced from Supabase</p>
            </div>
            ${assignmentNewButton("New Assignment", "assignmentPanelNewBtn")}
          </div>
          ${assignmentToolbar}
          <div id="assignmentBulkControls" class="assignment-bulk-controls"></div>
          <p id="assignmentMessage" class="status-message table-status-message" aria-live="polite"></p>
          <div id="assignmentPaginationControls" class="assignment-pagination-controls"></div>
          <div id="adminAssignments" class="assignment-open-list">
            ${emptyState("calendar", "No active assignments", "Assignments from Supabase will appear here.", assignmentNewButton("New Assignment", "assignmentEmptyNewBtn"))}
          </div>
          <div class="table-foot"><span id="assignmentListCount">Showing 0 board assignments</span></div>
        </section>
      </div>
      <aside class="suite-stack">
        ${assignmentFilterPanel()}
        ${assignmentToolsPanel()}
        ${panel("Calendar Overview", miniCalendar())}
      </aside>
      <div id="assignmentModal" class="client-modal assignment-modal" role="dialog" aria-modal="true" aria-labelledby="assignmentModalTitle" hidden>
        <button class="client-modal-backdrop" type="button" aria-label="Close assignment form" data-assignment-modal-close></button>
        <section class="client-modal-panel assignment-modal-panel">
          <div class="client-modal-header">
            <div>
              <p>Assignments</p>
              <h2 id="assignmentModalTitle">New Assignment</h2>
            </div>
            <button class="client-modal-close" type="button" aria-label="Close assignment form" data-assignment-modal-close>${icon("x")}</button>
          </div>
          <div id="assignmentModalBody">${assignmentForm()}</div>
        </section>
      </div>
      <div id="assignmentBulkModal" class="client-modal assignment-bulk-modal" role="dialog" aria-modal="true" aria-labelledby="assignmentBulkModalTitle" hidden>
        <button class="client-modal-backdrop" type="button" aria-label="Close bulk edit" data-assignment-bulk-close></button>
        <section class="client-modal-panel assignment-bulk-panel">
          <div class="client-modal-header">
            <div>
              <p>Assignments</p>
              <h2 id="assignmentBulkModalTitle">Bulk Edit Assignments</h2>
            </div>
            <button class="client-modal-close" type="button" aria-label="Close bulk edit" data-assignment-bulk-close>${icon("x")}</button>
          </div>
          <div id="assignmentBulkModalBody">${assignmentBulkForm()}</div>
        </section>
      </div>
    </section>
  `;
}

function assignmentNewButton(label = "New Assignment", id = "") {
  return `<button ${id ? `id="${esc(id)}"` : ""} class="primary-action" type="button" data-assignment-new>${icon("plus")}<span>${esc(label)}</span></button>`;
}

function assignmentToolsPanel() {
  return panel("Assignment Tools", `
    <button id="generateRecurringAssignmentsBtn" type="button" class="secondary-action full-width">${icon("refresh")}<span>Generate Due Assignments</span></button>
    <p id="recurringMessage" class="status-message"></p>
  `, { className: "assignment-tools-panel" });
}

function renderPropertyUnits() {
  return `
    <section class="property-units-workspace" data-property-units-page>
      <section class="suite-panel property-unit-selector-panel">
        <div class="panel-head">
          <div>
            <h2>Property Unit Pricing</h2>
            <p>Select a property, then add or update its units.</p>
          </div>
          <button class="secondary-action" type="button" data-property-units-refresh>${icon("refresh")}<span>Refresh</span></button>
        </div>
        <div class="property-unit-selector-grid">
          <label class="suite-field">
            <span>Property</span>
            <select id="propertyUnitPropertySelect"><option value="">Loading properties...</option></select>
          </label>
          <label class="inline-search property-unit-search"><span class="sr-only">Search units</span>${icon("search")}<input id="propertyUnitSearchInput" type="search" placeholder="Search units..." /></label>
        </div>
        <p id="propertyUnitMessage" class="status-message" aria-live="polite"></p>
      </section>
      <section class="metric-strip four">
        ${metric("Units", "0", "on selected property", "building", "green", 'id="propertyUnitCount"')}
        ${metric("Total Sq Ft", "0", "tracked unit area", "layout-grid", "blue", 'id="propertyUnitSqft"')}
        ${metric("Customer Charges", "$0", "total unit pricing", "wallet", "purple", 'id="propertyUnitCustomerTotal"')}
        ${metric("Contractor Pay", "$0", "total contractor cost", "badge-dollar", "orange", 'id="propertyUnitContractorTotal"')}
      </section>
      <section class="property-units-layout">
        <section class="suite-panel property-unit-list-panel">
          <div class="panel-head property-unit-list-head">
            <div>
              <h2>Units</h2>
              <p id="propertyUnitListSummary">Select a property to manage units.</p>
            </div>
            <button class="primary-action" type="button" data-property-unit-add>${icon("plus")}<span>Add Unit</span></button>
          </div>
          <form id="propertyUnitQuickForm" class="property-unit-quick-form">
            ${propertyUnitInput("unit_name", "Unit Number / Name", "text", { required: true, placeholder: "Unit 204" })}
            ${propertyUnitInput("square_feet", "Square Feet", "number", { min: "0", step: "1" })}
            ${propertyUnitInput("customer_price", "Customer Charge", "number", { min: "0", step: "0.01" })}
            ${propertyUnitInput("contractor_pay", "Contractor Pay", "number", { min: "0", step: "0.01" })}
            <button id="propertyUnitQuickAddBtn" class="primary-action" type="submit">${icon("plus")}<span>Add Unit</span></button>
          </form>
          <div class="property-unit-table-head">
            <span>Unit</span>
            <span>Sq Ft</span>
            <span>Customer Charge</span>
            <span>Contractor Pay</span>
            <span>Margin</span>
            <span>Actions</span>
          </div>
          <div id="propertyUnitRows" class="property-unit-list">${skeletonRows(4)}</div>
        </section>
        <aside class="suite-stack">
          ${panel("Selected Property", `<div id="propertyUnitPropertySummary" class="property-unit-summary">${emptyState("building", "No property selected")}</div>`)}
          ${panel("Pricing Snapshot", `<div id="propertyUnitPricingSummary" class="property-unit-summary">${skeletonRows(3)}</div>`)}
        </aside>
      </section>
    </section>
  `;
}

function propertyUnitInput(name, label, type = "text", options = {}) {
  const attrs = [
    options.required ? "required" : "",
    options.placeholder ? `placeholder="${esc(options.placeholder)}"` : "",
    options.min ? `min="${esc(options.min)}"` : "",
    options.step ? `step="${esc(options.step)}"` : ""
  ].filter(Boolean).join(" ");
  return `<label class="suite-field"><span>${esc(label)}</span><input name="${esc(name)}" type="${esc(type)}" ${attrs} /></label>`;
}

function initPropertyUnits() {
  const root = document.querySelector("[data-property-units-page]");
  if (!root) return;

  root.addEventListener("click", handlePropertyUnitClick);
  root.addEventListener("submit", handlePropertyUnitSubmit);
  root.querySelector("#propertyUnitPropertySelect")?.addEventListener("change", (event) => {
    propertyUnitState.selectedPropertyId = event.target.value || "";
    renderPropertyUnitData();
  });
  root.querySelector("#propertyUnitSearchInput")?.addEventListener("input", (event) => {
    propertyUnitState.search = event.target.value || "";
    renderPropertyUnitList();
  });

  const topbarAdd = Array.from(document.querySelectorAll(".suite-topbar .primary-action"))
    .find((link) => link.textContent?.trim() === "Add Unit");
  topbarAdd?.addEventListener("click", (event) => {
    event.preventDefault();
    focusPropertyUnitQuickAdd();
  });

  void loadPropertyUnits();
}

function handlePropertyUnitClick(event) {
  const refresh = event.target.closest("[data-property-units-refresh]");
  if (refresh) {
    void loadPropertyUnits();
    return;
  }

  const add = event.target.closest("[data-property-unit-add]");
  if (add) {
    focusPropertyUnitQuickAdd();
    return;
  }

  const deleteButton = event.target.closest("[data-property-unit-delete]");
  if (deleteButton) {
    void deletePropertyUnit(deleteButton.dataset.propertyUnitDelete);
  }
}

function handlePropertyUnitSubmit(event) {
  const form = event.target.closest("#propertyUnitQuickForm, [data-property-unit-row]");
  if (!form) return;
  event.preventDefault();
  void savePropertyUnitForm(form);
}

async function loadPropertyUnits() {
  if (!suiteSupabase) {
    showPropertyUnitMessage("Supabase config is missing. Add env.js values before using property units.", true);
    return;
  }

  showPropertyUnitMessage("Loading property units...");
  const { data: userData } = await suiteSupabase.auth.getUser();
  propertyUnitState.user = userData?.user || null;

  const [propertiesResult, unitsResult] = await Promise.all([
    suiteSupabase.from(leadTable).select("*").limit(1000),
    suiteSupabase.from(propertyUnitsTable).select("*").order("unit_name", { ascending: true }).limit(2000)
  ]);

  if (propertiesResult.error) {
    showPropertyUnitMessage("Unable to load properties: " + propertiesResult.error.message, true);
    return;
  }

  propertyUnitState.properties = (propertiesResult.data || [])
    .filter((row) => propertyUnitPropertyTitle(row))
    .sort((a, b) => propertyUnitPropertyTitle(a).localeCompare(propertyUnitPropertyTitle(b)));
  propertyUnitState.units = unitsResult.error ? [] : (unitsResult.data || []);

  if (!propertyUnitState.selectedPropertyId && propertyUnitState.properties[0]) {
    propertyUnitState.selectedPropertyId = propertyUnitState.properties[0].id;
  }

  renderPropertyUnitData();
  showPropertyUnitMessage(unitsResult.error
    ? "Property unit table is ready once the Supabase migration is applied."
    : `${getSelectedPropertyUnits(false).length} unit${getSelectedPropertyUnits(false).length === 1 ? "" : "s"} synced from Supabase.`);
}

function renderPropertyUnitData() {
  populatePropertyUnitPropertySelect();
  renderPropertyUnitMetrics();
  renderPropertyUnitList();
  renderPropertyUnitSummaries();
}

function populatePropertyUnitPropertySelect() {
  const select = document.getElementById("propertyUnitPropertySelect");
  if (!select) return;
  select.innerHTML = propertyUnitState.properties.length
    ? propertyUnitState.properties.map((row) => `<option value="${esc(row.id)}">${esc(propertyUnitPropertyTitle(row))}</option>`).join("")
    : `<option value="">No properties found</option>`;
  select.value = propertyUnitState.selectedPropertyId || "";
}

function renderPropertyUnitMetrics() {
  const rows = getSelectedPropertyUnits(false);
  const totals = propertyUnitTotals(rows);
  setText("propertyUnitCount", rows.length.toLocaleString());
  setText("propertyUnitSqft", Math.round(totals.squareFeet).toLocaleString());
  setText("propertyUnitCustomerTotal", propertyUnitMoney(totals.customer));
  setText("propertyUnitContractorTotal", propertyUnitMoney(totals.contractor));
}

function renderPropertyUnitList() {
  const list = document.getElementById("propertyUnitRows");
  const summary = document.getElementById("propertyUnitListSummary");
  if (!list) return;
  const selected = getSelectedProperty();
  const rows = getSelectedPropertyUnits(true);
  if (summary) {
    summary.textContent = selected
      ? `${rows.length.toLocaleString()} unit${rows.length === 1 ? "" : "s"} showing for ${propertyUnitPropertyTitle(selected)}.`
      : "Select a property to manage units.";
  }
  list.innerHTML = selected
    ? rows.length
      ? rows.map(renderPropertyUnitRow).join("")
      : emptyState("building", "No units on this property", "Use Add Unit to create the first unit.")
    : emptyState("building", "No property selected", "Choose a property to manage units.");
}

function renderPropertyUnitRow(row) {
  const margin = propertyUnitNumber(row.customer_price) - propertyUnitNumber(row.contractor_pay);
  return `
    <form class="property-unit-row" data-property-unit-row data-property-unit-id="${esc(row.id)}">
      <label class="suite-field"><span>Unit</span><input name="unit_name" value="${esc(row.unit_name || "")}" required /></label>
      <label class="suite-field"><span>Sq Ft</span><input name="square_feet" type="number" min="0" step="1" value="${esc(row.square_feet ?? 0)}" /></label>
      <label class="suite-field"><span>Customer Charge</span><input name="customer_price" type="number" min="0" step="0.01" value="${esc(row.customer_price ?? 0)}" /></label>
      <label class="suite-field"><span>Contractor Pay</span><input name="contractor_pay" type="number" min="0" step="0.01" value="${esc(row.contractor_pay ?? 0)}" /></label>
      <div class="property-unit-margin"><span>Margin</span><strong>${esc(propertyUnitMoney(margin))}</strong></div>
      <div class="property-unit-actions">
        <button class="primary-action" type="submit">${icon("check")}<span>Save</span></button>
        <button class="secondary-action danger-btn" type="button" data-property-unit-delete="${esc(row.id)}">${icon("trash")}<span>Delete</span></button>
      </div>
    </form>
  `;
}

function renderPropertyUnitSummaries() {
  const property = getSelectedProperty();
  const propertySummary = document.getElementById("propertyUnitPropertySummary");
  const pricingSummary = document.getElementById("propertyUnitPricingSummary");
  const rows = getSelectedPropertyUnits(false);
  const totals = propertyUnitTotals(rows);
  if (propertySummary) {
    propertySummary.innerHTML = property
      ? `
        <strong>${esc(propertyUnitPropertyTitle(property))}</strong>
        <p>${esc(propertyUnitPropertyAddress(property) || "No address on file")}</p>
        <dl>
          <div><dt>Type</dt><dd>${esc(property.property_type || property.service_type || "Not set")}</dd></div>
          <div><dt>Units</dt><dd>${rows.length.toLocaleString()}</dd></div>
        </dl>
      `
      : emptyState("building", "No property selected");
  }
  if (pricingSummary) {
    pricingSummary.innerHTML = `
      <dl>
        <div><dt>Customer Total</dt><dd>${esc(propertyUnitMoney(totals.customer))}</dd></div>
        <div><dt>Contractor Total</dt><dd>${esc(propertyUnitMoney(totals.contractor))}</dd></div>
        <div><dt>Projected Margin</dt><dd>${esc(propertyUnitMoney(totals.customer - totals.contractor))}</dd></div>
        <div><dt>Average Sq Ft</dt><dd>${rows.length ? Math.round(totals.squareFeet / rows.length).toLocaleString() : "0"}</dd></div>
      </dl>
    `;
  }
}

async function savePropertyUnitForm(form) {
  if (!suiteSupabase || propertyUnitState.isSaving) return;
  const propertyId = propertyUnitState.selectedPropertyId;
  if (!propertyId) {
    showPropertyUnitMessage("Select a property before adding units.", true);
    return;
  }

  let payload;
  try {
    payload = collectPropertyUnitPayload(form, propertyId);
  } catch (error) {
    showPropertyUnitMessage(error.message, true);
    return;
  }

  propertyUnitState.isSaving = true;
  setPropertyUnitFormSaving(form, true);
  showPropertyUnitMessage(payload.id ? "Saving unit..." : "Adding unit...");

  const id = payload.id;
  delete payload.id;
  const result = id
    ? await suiteSupabase.from(propertyUnitsTable).update(payload).eq("id", id).select("*").single()
    : await suiteSupabase.from(propertyUnitsTable).insert({ ...payload, created_by: propertyUnitState.user?.id || null }).select("*").single();

  propertyUnitState.isSaving = false;
  setPropertyUnitFormSaving(form, false);
  if (result.error) {
    showPropertyUnitMessage("Unable to save unit: " + result.error.message, true);
    return;
  }

  const saved = result.data;
  const index = propertyUnitState.units.findIndex((unit) => unit.id === saved.id);
  if (index >= 0) {
    propertyUnitState.units[index] = saved;
  } else {
    propertyUnitState.units.push(saved);
    form.reset();
    form.querySelector("[name='unit_name']")?.focus();
  }
  propertyUnitState.units.sort(propertyUnitSort);
  renderPropertyUnitData();
  showPropertyUnitMessage("Unit saved to Supabase.");
}

async function deletePropertyUnit(id) {
  if (!suiteSupabase || !id || propertyUnitState.isDeleting) return;
  if (!window.confirm("Delete this unit?")) return;
  propertyUnitState.isDeleting = true;
  showPropertyUnitMessage("Deleting unit...");
  const result = await suiteSupabase.from(propertyUnitsTable).delete().eq("id", id);
  propertyUnitState.isDeleting = false;
  if (result.error) {
    showPropertyUnitMessage("Unable to delete unit: " + result.error.message, true);
    return;
  }
  propertyUnitState.units = propertyUnitState.units.filter((unit) => unit.id !== id);
  renderPropertyUnitData();
  showPropertyUnitMessage("Unit deleted from Supabase.");
}

function collectPropertyUnitPayload(form, propertyId) {
  const value = (name) => (form.querySelector(`[name="${name}"]`)?.value || "").trim();
  const unitName = value("unit_name");
  if (!unitName) throw new Error("Unit Number / Name is required.");
  return {
    id: form.dataset.propertyUnitId || "",
    property_id: propertyId,
    unit_name: unitName,
    square_feet: propertyUnitNumber(value("square_feet")),
    customer_price: propertyUnitNumber(value("customer_price")),
    contractor_pay: propertyUnitNumber(value("contractor_pay")),
    status: "active"
  };
}

function getSelectedProperty() {
  return propertyUnitState.properties.find((row) => row.id === propertyUnitState.selectedPropertyId) || null;
}

function getSelectedPropertyUnits(applySearch = true) {
  const term = applySearch ? propertyUnitState.search.trim().toLowerCase() : "";
  return propertyUnitState.units
    .filter((row) => row.property_id === propertyUnitState.selectedPropertyId)
    .filter((row) => !term || [row.unit_name, row.square_feet, row.customer_price, row.contractor_pay].some((value) => String(value || "").toLowerCase().includes(term)))
    .sort(propertyUnitSort);
}

function propertyUnitSort(a, b) {
  return String(a.unit_name || "").localeCompare(String(b.unit_name || ""), undefined, { numeric: true, sensitivity: "base" });
}

function propertyUnitTotals(rows) {
  return rows.reduce((totals, row) => ({
    squareFeet: totals.squareFeet + propertyUnitNumber(row.square_feet),
    customer: totals.customer + propertyUnitNumber(row.customer_price),
    contractor: totals.contractor + propertyUnitNumber(row.contractor_pay)
  }), { squareFeet: 0, customer: 0, contractor: 0 });
}

function propertyUnitNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function propertyUnitMoney(value) {
  const number = Number(value);
  const safe = Number.isFinite(number) ? number : 0;
  return safe.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

function propertyUnitPropertyTitle(row) {
  return row?.property_name || row?.name || row?.company_name || row?.title || "";
}

function propertyUnitPropertyAddress(row) {
  return [row?.address, row?.city, row?.state, row?.postal_code].filter(Boolean).join(", ");
}

function focusPropertyUnitQuickAdd() {
  if (!propertyUnitState.selectedPropertyId) {
    showPropertyUnitMessage("Select a property before adding units.", true);
    document.getElementById("propertyUnitPropertySelect")?.focus();
    return;
  }
  document.getElementById("propertyUnitQuickForm")?.scrollIntoView({ behavior: "smooth", block: "center" });
  document.querySelector("#propertyUnitQuickForm [name='unit_name']")?.focus();
}

function setPropertyUnitFormSaving(form, isSaving) {
  const button = form.querySelector("button[type='submit']");
  if (!button) return;
  button.disabled = isSaving;
  const label = button.querySelector("span");
  if (label) label.textContent = isSaving ? "Saving..." : form.id === "propertyUnitQuickForm" ? "Add Unit" : "Save";
}

function showPropertyUnitMessage(text, isError = false) {
  const message = document.getElementById("propertyUnitMessage");
  if (!message) return;
  message.textContent = text || "";
  message.classList.toggle("error", Boolean(isError));
}

function renderChecklists() {
  checklistState.builder = checklistState.builder || createBlankChecklistTemplate();
  return `
    <section class="checklist-builder-workspace" data-checklists-page>
      <section class="suite-panel checklist-builder-library-panel">
        <div class="panel-head">
          <div>
            <h2>Checklist Builder</h2>
            <p>Create reusable modules like Bedroom or Kitchen, then assign module counts by property unit.</p>
          </div>
          <div class="panel-actions">
            <button class="secondary-action" type="button" data-checklist-refresh>${icon("refresh")}<span>Refresh</span></button>
            <button class="primary-action" type="button" data-checklist-new>${icon("plus")}<span>New Checklist</span></button>
          </div>
        </div>
        <div class="checklist-builder-toolbar">
          <label class="suite-field">
            <span>Checklist Library</span>
            <select id="checklistTemplateSelect">${checklistTemplateOptions()}</select>
          </label>
          <label class="inline-search checklist-template-search"><span class="sr-only">Search checklists</span>${icon("search")}<input id="checklistTemplateSearch" type="search" placeholder="Search checklists..." /></label>
        </div>
        <p id="checklistMessage" class="status-message" aria-live="polite"></p>
      </section>
      <section class="metric-strip four">
        ${metric("Checklists", "0", "saved in Supabase", "file-check", "green", 'id="checklistTemplateCount"')}
        ${metric("Modules", "0 / 0", "current / saved", "layout-grid", "blue", 'id="checklistSectionCount"')}
        ${metric("Checklist Items", "0", "contractor requirements", "clipboard-list", "purple", 'id="checklistItemCount"')}
        ${metric("Assigned", "0", "properties and units", "check", "orange", 'id="checklistAssignedCount"')}
      </section>
      <section class="checklist-builder-layout">
        <section class="suite-panel checklist-editor-panel">
          <div class="panel-head">
            <div>
              <h2>Checklist Details</h2>
              <p>Build modules contractors will complete during a job.</p>
            </div>
            <button class="primary-action" type="submit" form="checklistTemplateForm">${icon("check")}<span>Save Checklist</span></button>
          </div>
          <form id="checklistTemplateForm" class="checklist-template-form">
            <input id="checklist_template_id" type="hidden" value="${esc(checklistState.builder.id || "")}" />
            <label class="suite-field wide"><span>Checklist Name</span><input id="checklist_template_name" value="${esc(checklistState.builder.name || "")}" required placeholder="Apartment turnover QA checklist" /></label>
            <label class="suite-field"><span>Department</span><input id="checklist_template_department" value="${esc(checklistState.builder.department || "")}" placeholder="Cleaning" /></label>
            <label class="suite-field"><span>Subdepartment</span><input id="checklist_template_subdepartment" value="${esc(checklistState.builder.subdepartment || "")}" placeholder="Move-out, common area, office" /></label>
            <label class="suite-field"><span>Priority</span><select id="checklist_template_priority">${checklistPriorityOptions(checklistState.builder.priority)}</select></label>
            <label class="suite-field wide"><span>Description</span><textarea id="checklist_template_description" rows="3" placeholder="What this checklist should be used for">${esc(checklistState.builder.description || "")}</textarea></label>
          </form>
          <div class="checklist-module-tools">
            <div class="checklist-section-composer">
              <label class="suite-field"><span>Add Module</span><input id="newChecklistSectionTitle" placeholder="Bedroom, kitchen, bathroom, final QA" /></label>
              <button class="secondary-action" type="button" data-checklist-add-section>${icon("plus")}<span>Add Module</span></button>
            </div>
            ${checklistModuleImporterHtml()}
          </div>
          <div id="checklistSections" class="checklist-section-list">${renderChecklistSectionsMarkup()}</div>
        </section>
        <aside class="suite-stack">
          ${panel("Assign Checklist", `<div id="checklistAssignmentPanel">${checklistAssignmentPanelHtml()}</div>`, { className: "checklist-assignment-panel" })}
          ${panel("Checklist Preview", `<div id="checklistPreview" class="checklist-preview-list">${checklistPreviewHtml()}</div>`)}
          ${panel("Selected Property", `<div id="checklistPropertySummary" class="property-unit-summary">${checklistPropertySummaryHtml()}</div>`)}
        </aside>
      </section>
    </section>
  `;
}

function checklistUid(prefix = "checklist") {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createChecklistItem(label = "", type = "check", required = true) {
  return {
    id: checklistUid("item"),
    type,
    required,
    label
  };
}

function createChecklistRoom(title = "Room / Area") {
  return {
    id: checklistUid("room"),
    title,
    items: [createChecklistItem()]
  };
}

function createChecklistSection(title = "General Service") {
  return {
    id: checklistUid("section"),
    title,
    saved_module_id: "",
    items: [createChecklistItem()],
    rooms: []
  };
}

function createBlankChecklistTemplate() {
  return {
    id: "",
    name: "New Checklist",
    department: "Cleaning",
    subdepartment: "",
    priority: "medium",
    description: "",
    sections: [
      createChecklistSection("Bedroom"),
      createChecklistSection("Kitchen")
    ]
  };
}

function checklistArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function normalizeChecklistItem(item = {}) {
  const type = checklistItemType(item.type || item.item_type || item.media_required || "check");
  const required = Object.prototype.hasOwnProperty.call(item, "required")
    ? item.required !== false
    : type !== "optional";
  return {
    id: item.id || checklistUid("item"),
    type,
    required,
    label: item.label || item.task || item.title || ""
  };
}

function normalizeChecklistRoom(room = {}, index = 0) {
  return {
    id: room.id || checklistUid("room"),
    title: room.title || room.name || `Room ${index + 1}`,
    items: checklistArray(room.items).map(normalizeChecklistItem)
  };
}

function normalizeChecklistSection(section = {}, index = 0) {
  return {
    id: section.id || checklistUid("section"),
    title: section.title || section.name || `Module ${index + 1}`,
    saved_module_id: section.saved_module_id || section.module_template_id || "",
    items: checklistArray(section.items).map(normalizeChecklistItem),
    rooms: checklistArray(section.rooms).map(normalizeChecklistRoom)
  };
}

function normalizeChecklistTemplate(row = {}) {
  const sections = checklistArray(row.sections).map(normalizeChecklistSection);
  return {
    id: row.id || "",
    name: row.name || "Untitled Checklist",
    department: row.department || "Cleaning",
    subdepartment: row.subdepartment || "",
    priority: row.priority || "medium",
    description: row.description || "",
    sections: sections.length ? sections : [createChecklistSection()]
  };
}

function cleanChecklistTemplateForSave(template) {
  const normalized = normalizeChecklistTemplate(template);
  const sections = normalized.sections
    .map((section) => {
      const items = section.items.filter((item) => item.label.trim());
      const rooms = section.rooms
        .map((room) => ({
          ...room,
          items: room.items.filter((item) => item.label.trim())
        }))
        .filter((room) => room.title.trim() || room.items.length);
      return {
        ...section,
        title: section.title.trim() || "Untitled Module",
        items,
        rooms
      };
    })
    .filter((section) => section.title.trim() || section.items.length || section.rooms.length);
  return {
    ...normalized,
    name: normalized.name.trim(),
    department: normalized.department.trim(),
    subdepartment: normalized.subdepartment.trim(),
    priority: normalized.priority || "medium",
    description: normalized.description.trim(),
    sections: sections.length ? sections : [createChecklistSection()]
  };
}

function checklistPriorityOptions(value = "medium") {
  return ["low", "medium", "high", "urgent"]
    .map((priority) => `<option value="${esc(priority)}" ${priority === value ? "selected" : ""}>${esc(titleCase(priority))}</option>`)
    .join("");
}

function checklistItemTypeOptions(value = "check") {
  return [
    ["check", "Check"],
    ["photo", "Photo"],
    ["video", "Video"],
    ["note", "Note"],
    ["optional", "Optional"]
  ].map(([id, label]) => `<option value="${esc(id)}" ${id === value ? "selected" : ""}>${esc(label)}</option>`).join("");
}

function checklistItemType(value = "check") {
  const raw = String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (raw.includes("video")) return "video";
  if (raw.includes("photo") || raw.includes("image")) return "photo";
  if (raw.includes("note")) return "note";
  if (raw.includes("optional")) return "optional";
  return "check";
}

function checklistItemMediaKind(value = {}) {
  const candidates = typeof value === "string"
    ? [value]
    : [value.media_required, value.type, value.item_type];
  const raw = candidates.find((candidate) => {
    const normalized = String(candidate || "").trim().toLowerCase();
    return normalized && normalized !== "none" && normalized !== "false" && normalized !== "no";
  }) || "";
  const type = checklistItemType(raw);
  return type === "photo" || type === "video" ? type : "";
}

function checklistMediaNoticeHtml(value = {}) {
  const kind = checklistItemMediaKind(value);
  if (!kind) {
    return `
      <div class="checklist-media-option is-empty" data-checklist-media-notice>
        <span>Upload</span>
        <strong>No file required</strong>
        <small>Choose Photo or Video to require proof from the contractor phone.</small>
      </div>
    `;
  }
  const label = kind === "video" ? "Video" : "Photo";
  const required = value.required !== false;
  return `
    <div class="checklist-media-option is-active" data-checklist-media-notice>
      <span>${icon("upload")}Upload</span>
      <strong>${esc(label)} ${required ? "required" : "optional"}</strong>
      <small>Contractor will see a ${esc(kind)} upload field before completion.</small>
    </div>
  `;
}

function checklistRequiredControlHtml(item = {}) {
  const required = item.required !== false;
  return `
    <label class="checklist-required-toggle">
      <input type="checkbox" data-checklist-item-required ${required ? "checked" : ""} />
      <span>
        <strong>${required ? "Required" : "Optional"}</strong>
        <small>${required ? "Must be completed before job closeout" : "Can be skipped if it does not apply"}</small>
      </span>
    </label>
  `;
}

function updateChecklistMediaNotice(row, value = {}) {
  const notice = row?.querySelector("[data-checklist-media-notice]");
  if (notice) notice.outerHTML = checklistMediaNoticeHtml(value);
}

function updateChecklistRequiredControl(row) {
  const input = row?.querySelector("[data-checklist-item-required]");
  const label = row?.querySelector(".checklist-required-toggle strong");
  const hint = row?.querySelector(".checklist-required-toggle small");
  if (label && input) label.textContent = input.checked ? "Required" : "Optional";
  if (hint && input) hint.textContent = input.checked ? "Must be completed before job closeout" : "Can be skipped if it does not apply";
}

function checklistModules(template = checklistState.builder || createBlankChecklistTemplate()) {
  return normalizeChecklistTemplate(template).sections;
}

function checklistModuleCountValue(value, fallback = 1) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.min(50, Math.floor(number)));
}

function checklistJsonObject(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

function normalizeChecklistModuleCounts(counts = {}, template = checklistState.builder || createBlankChecklistTemplate(), fallback = null) {
  const source = checklistJsonObject(counts);
  const fallbackSource = fallback ? checklistJsonObject(fallback) : {};
  return checklistModules(template).reduce((normalized, module) => {
    const titleKey = normalizeToken(module.title);
    const raw = source[module.id] ?? source[titleKey] ?? source[module.title] ?? fallbackSource[module.id] ?? fallbackSource[titleKey] ?? fallbackSource[module.title] ?? 1;
    normalized[module.id] = checklistModuleCountValue(raw, 1);
    return normalized;
  }, {});
}

function ensureChecklistDefaultModuleCounts(template = checklistState.builder || createBlankChecklistTemplate()) {
  checklistState.defaultModuleCounts = normalizeChecklistModuleCounts(checklistState.defaultModuleCounts, template);
  return checklistState.defaultModuleCounts;
}

function checklistCountsMatchTemplate(row = {}) {
  return Boolean(row?.checklist_template_id && checklistState.builder?.id && row.checklist_template_id === checklistState.builder.id);
}

function getChecklistUnitModuleCounts(unit = {}, options = {}) {
  const current = checklistState.unitModuleCounts[unit.id] || {};
  const stored = checklistCountsMatchTemplate(unit) ? unit.checklist_module_counts : {};
  const fallback = Object.keys(current).length ? current : Object.keys(checklistJsonObject(stored)).length ? stored : ensureChecklistDefaultModuleCounts();
  const counts = normalizeChecklistModuleCounts(fallback);
  if (unit.id && options.persist !== false) checklistState.unitModuleCounts[unit.id] = counts;
  return counts;
}

function setChecklistDefaultModuleCount(moduleId, value) {
  checklistState.defaultModuleCounts = ensureChecklistDefaultModuleCounts();
  checklistState.defaultModuleCounts[moduleId] = checklistModuleCountValue(value, 1);
}

function setChecklistUnitModuleCount(unitId, moduleId, value) {
  const unit = checklistState.units.find((row) => row.id === unitId) || { id: unitId };
  const counts = getChecklistUnitModuleCounts(unit);
  counts[moduleId] = checklistModuleCountValue(value, 1);
  checklistState.unitModuleCounts[unitId] = counts;
}

function checklistTemplateOptions() {
  const term = (document.getElementById("checklistTemplateSearch")?.value || "").trim().toLowerCase();
  const templates = checklistState.templates
    .filter((template) => !term || [template.name, template.department, template.subdepartment].some((value) => String(value || "").toLowerCase().includes(term)));
  if (!templates.length) {
    return `<option value="">${checklistState.templates.length ? "No matching checklists" : "No saved checklists yet"}</option>`;
  }
  return [
    `<option value="">New unsaved checklist</option>`,
    ...templates.map((template) => `<option value="${esc(template.id)}" ${template.id === checklistState.selectedTemplateId ? "selected" : ""}>${esc(template.name)}</option>`)
  ].join("");
}

function normalizeSavedChecklistModule(row = {}) {
  const section = normalizeChecklistSection(row.section || row.module || {}, 0);
  return {
    id: row.id || "",
    name: row.name || section.title || "Untitled Module",
    department: row.department || "",
    subdepartment: row.subdepartment || "",
    description: row.description || "",
    section: {
      ...section,
      saved_module_id: row.id || section.saved_module_id || "",
      title: section.title || row.name || "Untitled Module"
    },
    created_by: row.created_by || null,
    updated_at: row.updated_at || row.created_at || null
  };
}

function checklistSavedModuleOptions() {
  if (!checklistState.savedModules.length) return `<option value="">No saved modules yet</option>`;
  return [
    `<option value="">Select saved module...</option>`,
    ...checklistState.savedModules.map((module) => {
      const detail = [module.department, module.subdepartment].filter(Boolean).join(" / ");
      const label = detail ? `${module.name} - ${detail}` : module.name;
      return `<option value="${esc(module.id)}" ${module.id === checklistState.selectedModuleId ? "selected" : ""}>${esc(label)}</option>`;
    })
  ].join("");
}

function checklistModuleImporterHtml() {
  return `
    <div class="checklist-module-importer">
      <label class="suite-field">
        <span>Import Saved Module</span>
        <select id="checklistModuleImportSelect">${checklistSavedModuleOptions()}</select>
      </label>
      <button class="secondary-action" type="button" data-checklist-import-module ${checklistState.savedModules.length ? "" : "disabled"}>${icon("download")}<span>Import Module</span></button>
    </div>
  `;
}

function renderChecklistSectionsMarkup() {
  const template = checklistState.builder || createBlankChecklistTemplate();
  return template.sections.map(renderChecklistSectionCard).join("");
}

function renderChecklistSectionCard(section, index) {
  return `
    <article class="checklist-section-card" data-checklist-section-id="${esc(section.id)}" data-checklist-saved-module-id="${esc(section.saved_module_id || "")}">
      <div class="checklist-section-head">
        <label class="suite-field"><span>Module ${index + 1}</span><input value="${esc(section.title || "")}" data-checklist-section-title placeholder="Bedroom, kitchen, bathroom" /></label>
        <button class="secondary-action" type="button" data-checklist-save-section="${esc(section.id)}">${icon("check")}<span>Save Module</span></button>
        <button class="ghost-icon-btn danger-btn" type="button" data-checklist-remove-section="${esc(section.id)}" aria-label="Remove module">${icon("trash")}</button>
      </div>
      <div class="checklist-item-list" data-checklist-section-items>
        ${section.items.map((item) => renderChecklistItemRow(item, "section")).join("")}
      </div>
      <div class="checklist-row-actions">
        <button class="secondary-action" type="button" data-checklist-add-item="${esc(section.id)}">${icon("plus")}<span>Add Checklist Item</span></button>
        <button class="secondary-action" type="button" data-checklist-add-room="${esc(section.id)}">${icon("plus")}<span>Add Sub-Area</span></button>
      </div>
      <div class="checklist-room-list">
        ${section.rooms.map((room) => renderChecklistRoomCard(section.id, room)).join("")}
      </div>
    </article>
  `;
}

function renderChecklistRoomCard(sectionId, room) {
  return `
    <div class="checklist-room-card" data-checklist-room-id="${esc(room.id)}">
      <div class="checklist-room-head">
        <label class="suite-field"><span>Sub-Area</span><input value="${esc(room.title || "")}" data-checklist-room-title placeholder="Closet, shower, appliance area" /></label>
        <button class="ghost-icon-btn danger-btn" type="button" data-checklist-remove-room="${esc(sectionId)}:${esc(room.id)}" aria-label="Remove sub-area">${icon("trash")}</button>
      </div>
      <div class="checklist-item-list">
        ${room.items.map((item) => renderChecklistItemRow(item, "room")).join("")}
      </div>
      <button class="secondary-action" type="button" data-checklist-add-room-item="${esc(sectionId)}:${esc(room.id)}">${icon("plus")}<span>Add Sub-Area Item</span></button>
    </div>
  `;
}

function renderChecklistItemRow(item, scope) {
  const attr = scope === "room" ? "data-checklist-room-item" : "data-checklist-section-item";
  return `
    <div class="checklist-item-row" ${attr} data-checklist-item-id="${esc(item.id)}">
      <label class="suite-field"><span>Type</span><select data-checklist-item-type>${checklistItemTypeOptions(item.type)}</select></label>
      <label class="suite-field"><span>Checklist Item</span><input value="${esc(item.label || "")}" data-checklist-item-label placeholder="Make bed, wipe counters, upload final photo" /></label>
      ${checklistRequiredControlHtml(item)}
      ${checklistMediaNoticeHtml(item)}
      <button class="ghost-icon-btn danger-btn" type="button" data-checklist-remove-item="${esc(item.id)}" aria-label="Remove item">${icon("trash")}</button>
    </div>
  `;
}

function initChecklists() {
  const root = document.querySelector("[data-checklists-page]");
  if (!root) return;

  root.addEventListener("click", handleChecklistClick);
  root.addEventListener("submit", handleChecklistSubmit);
  root.addEventListener("input", handleChecklistInput);
  root.addEventListener("change", handleChecklistChange);

  const topbarNew = Array.from(document.querySelectorAll(".suite-topbar .primary-action"))
    .find((link) => link.textContent?.trim() === "New Checklist");
  topbarNew?.addEventListener("click", (event) => {
    event.preventDefault();
    startNewChecklistTemplate();
  });

  void loadChecklistData();
  renderChecklistMetrics();
}

function handleChecklistClick(event) {
  const refresh = event.target.closest("[data-checklist-refresh]");
  if (refresh) {
    void loadChecklistData();
    return;
  }

  if (event.target.closest("[data-checklist-new]")) {
    startNewChecklistTemplate();
    return;
  }

  if (event.target.closest("[data-checklist-add-section]")) {
    addChecklistSection();
    return;
  }

  if (event.target.closest("[data-checklist-import-module]")) {
    importSavedChecklistModule();
    return;
  }

  const saveSection = event.target.closest("[data-checklist-save-section]");
  if (saveSection) {
    void saveChecklistModule(saveSection.dataset.checklistSaveSection);
    return;
  }

  const addItem = event.target.closest("[data-checklist-add-item]");
  if (addItem) {
    addChecklistItem(addItem.dataset.checklistAddItem);
    return;
  }

  const addRoom = event.target.closest("[data-checklist-add-room]");
  if (addRoom) {
    addChecklistRoom(addRoom.dataset.checklistAddRoom);
    return;
  }

  const addRoomItem = event.target.closest("[data-checklist-add-room-item]");
  if (addRoomItem) {
    addChecklistRoomItem(addRoomItem.dataset.checklistAddRoomItem);
    return;
  }

  const removeSection = event.target.closest("[data-checklist-remove-section]");
  if (removeSection) {
    removeChecklistSection(removeSection.dataset.checklistRemoveSection);
    return;
  }

  const removeRoom = event.target.closest("[data-checklist-remove-room]");
  if (removeRoom) {
    removeChecklistRoom(removeRoom.dataset.checklistRemoveRoom);
    return;
  }

  const removeItem = event.target.closest("[data-checklist-remove-item]");
  if (removeItem) {
    removeChecklistItem(removeItem.dataset.checklistRemoveItem);
    return;
  }

  if (event.target.closest("[data-checklist-select-all-units]")) {
    toggleChecklistUnitSelection();
    return;
  }

  if (event.target.closest("[data-checklist-apply-property]")) {
    void applyChecklistToProperty();
    return;
  }

  if (event.target.closest("[data-checklist-apply-units]")) {
    void applyChecklistToUnits();
  }
}

function handleChecklistSubmit(event) {
  const form = event.target.closest("#checklistTemplateForm");
  if (!form) return;
  event.preventDefault();
  void saveChecklistTemplate();
}

function handleChecklistInput(event) {
  if (event.target?.id === "checklistTemplateSearch") {
    populateChecklistTemplateSelect();
    return;
  }
  if (event.target?.matches("[data-checklist-default-module-count]")) {
    setChecklistDefaultModuleCount(event.target.dataset.moduleId, event.target.value);
    renderChecklistMetrics();
    renderChecklistPreview();
    return;
  }
  if (event.target?.matches("[data-checklist-unit-module-count]")) {
    setChecklistUnitModuleCount(event.target.dataset.unitId, event.target.dataset.moduleId, event.target.value);
    return;
  }
  if (event.target.closest("#checklistTemplateForm, #checklistSections")) {
    syncChecklistBuilderFromDom();
    ensureChecklistDefaultModuleCounts();
    renderChecklistAssignmentPanel();
    renderChecklistMetrics();
    renderChecklistPreview();
  }
}

function handleChecklistChange(event) {
  const target = event.target;
  if (target?.id === "checklistTemplateSelect") {
    selectChecklistTemplate(target.value || "");
    return;
  }
  if (target?.id === "checklistAssignmentPropertySelect") {
    checklistState.selectedPropertyId = target.value || "";
    checklistState.selectedUnitIds = new Set();
    checklistState.unitModuleCounts = {};
    renderChecklistAssignmentPanel();
    renderChecklistPropertySummary();
    renderChecklistMetrics();
    return;
  }
  if (target?.id === "checklistModuleImportSelect") {
    checklistState.selectedModuleId = target.value || "";
    return;
  }
  if (target?.matches("[data-checklist-unit-option]")) {
    if (target.checked) {
      checklistState.selectedUnitIds.add(target.value);
      const unit = checklistState.units.find((row) => row.id === target.value);
      if (unit) getChecklistUnitModuleCounts(unit);
    } else {
      checklistState.selectedUnitIds.delete(target.value);
    }
    renderChecklistAssignmentPanel();
    return;
  }
  if (target?.matches("[data-checklist-item-type], [data-checklist-item-required]")) {
    const row = target.closest("[data-checklist-item-id]");
    updateChecklistRequiredControl(row);
    updateChecklistMediaNotice(row, readChecklistItemNode(row));
  }
  if (target.closest("#checklistTemplateForm, #checklistSections")) {
    syncChecklistBuilderFromDom();
    ensureChecklistDefaultModuleCounts();
    renderChecklistAssignmentPanel();
    renderChecklistMetrics();
    renderChecklistPreview();
  }
}

async function loadChecklistData() {
  if (!suiteSupabase) {
    showChecklistMessage("Supabase config is missing. Add env.js values before using checklists.", true);
    return;
  }

  showChecklistMessage("Loading checklists...");
  const { data: userData } = await suiteSupabase.auth.getUser();
  checklistState.user = userData?.user || null;

  const [templatesResult, modulesResult, propertiesResult, unitsResult] = await Promise.all([
    suiteSupabase.from(checklistTemplatesTable).select("*").order("updated_at", { ascending: false }),
    suiteSupabase.from(checklistModulesTable).select("*").order("updated_at", { ascending: false }),
    suiteSupabase.from(leadTable).select("*").limit(1000),
    suiteSupabase.from(propertyUnitsTable).select("*").order("unit_name", { ascending: true }).limit(3000)
  ]);

  if (templatesResult.error) {
    showChecklistMessage("Unable to load checklist templates: " + templatesResult.error.message, true);
    return;
  }
  if (propertiesResult.error) {
    showChecklistMessage("Unable to load properties: " + propertiesResult.error.message, true);
    return;
  }

  checklistState.templates = (templatesResult.data || []).map(normalizeChecklistTemplate);
  checklistState.savedModules = modulesResult.error ? [] : (modulesResult.data || []).map(normalizeSavedChecklistModule);
  checklistState.properties = (propertiesResult.data || [])
    .filter((row) => propertyUnitPropertyTitle(row))
    .sort((a, b) => propertyUnitPropertyTitle(a).localeCompare(propertyUnitPropertyTitle(b)));
  checklistState.units = unitsResult.error ? [] : (unitsResult.data || []);

  if (checklistState.selectedTemplateId) {
    const selected = checklistState.templates.find((template) => template.id === checklistState.selectedTemplateId);
    if (selected) checklistState.builder = normalizeChecklistTemplate(selected);
  } else if (checklistState.templates[0] && !checklistState.builder?.id) {
    checklistState.selectedTemplateId = checklistState.templates[0].id;
    checklistState.builder = normalizeChecklistTemplate(checklistState.templates[0]);
  }
  if (!checklistState.selectedPropertyId && checklistState.properties[0]) {
    checklistState.selectedPropertyId = checklistState.properties[0].id;
  }

  renderChecklistData();
  const loadNotes = [];
  if (unitsResult.error) loadNotes.push("Unit assignments will be available after the property unit migration is applied.");
  if (modulesResult.error) loadNotes.push("Saved modules will be available after the checklist module migration is applied.");
  showChecklistMessage(loadNotes.length
    ? `Checklists loaded. ${loadNotes.join(" ")}`
    : `${checklistState.templates.length.toLocaleString()} checklist${checklistState.templates.length === 1 ? "" : "s"} and ${checklistState.savedModules.length.toLocaleString()} saved module${checklistState.savedModules.length === 1 ? "" : "s"} loaded.`);
}

function renderChecklistData() {
  ensureChecklistDefaultModuleCounts();
  populateChecklistTemplateSelect();
  renderChecklistForm();
  renderChecklistModuleImporter();
  renderChecklistAssignmentPanel();
  renderChecklistPropertySummary();
  renderChecklistMetrics();
  renderChecklistPreview();
}

function populateChecklistTemplateSelect() {
  const select = document.getElementById("checklistTemplateSelect");
  if (!select) return;
  select.innerHTML = checklistTemplateOptions();
  select.value = checklistState.selectedTemplateId || "";
}

function renderChecklistForm() {
  const template = checklistState.builder || createBlankChecklistTemplate();
  const setValue = (id, value) => {
    const field = document.getElementById(id);
    if (field) field.value = value ?? "";
  };
  setValue("checklist_template_id", template.id || "");
  setValue("checklist_template_name", template.name || "");
  setValue("checklist_template_department", template.department || "");
  setValue("checklist_template_subdepartment", template.subdepartment || "");
  setValue("checklist_template_priority", template.priority || "medium");
  setValue("checklist_template_description", template.description || "");
  const sections = document.getElementById("checklistSections");
  if (sections) sections.innerHTML = renderChecklistSectionsMarkup();
}

function renderChecklistModuleImporter() {
  const select = document.getElementById("checklistModuleImportSelect");
  if (select) {
    select.innerHTML = checklistSavedModuleOptions();
    select.value = checklistState.selectedModuleId || "";
  }
  const button = document.querySelector("[data-checklist-import-module]");
  if (button) button.disabled = !checklistState.savedModules.length;
}

function syncChecklistBuilderFromDom() {
  const current = checklistState.builder || createBlankChecklistTemplate();
  const formValue = (id) => (document.getElementById(id)?.value || "").trim();
  const sections = Array.from(document.querySelectorAll("[data-checklist-section-id]")).map((sectionNode, sectionIndex) => {
    const sectionItems = Array.from(sectionNode.querySelectorAll("[data-checklist-section-item]")).map(readChecklistItemNode);
    const rooms = Array.from(sectionNode.querySelectorAll("[data-checklist-room-id]")).map((roomNode, roomIndex) => ({
      id: roomNode.dataset.checklistRoomId || checklistUid("room"),
      title: roomNode.querySelector("[data-checklist-room-title]")?.value.trim() || `Room ${roomIndex + 1}`,
      items: Array.from(roomNode.querySelectorAll("[data-checklist-room-item]")).map(readChecklistItemNode)
    }));
    return {
      id: sectionNode.dataset.checklistSectionId || checklistUid("section"),
      saved_module_id: sectionNode.dataset.checklistSavedModuleId || "",
      title: sectionNode.querySelector("[data-checklist-section-title]")?.value.trim() || `Section ${sectionIndex + 1}`,
      items: sectionItems,
      rooms
    };
  });

  checklistState.builder = normalizeChecklistTemplate({
    ...current,
    name: formValue("checklist_template_name") || current.name,
    department: formValue("checklist_template_department"),
    subdepartment: formValue("checklist_template_subdepartment"),
    priority: formValue("checklist_template_priority") || "medium",
    description: formValue("checklist_template_description"),
    sections
  });
  return checklistState.builder;
}

function readChecklistItemNode(node) {
  const type = checklistItemType(node.querySelector("[data-checklist-item-type]")?.value || "check");
  return {
    id: node.dataset.checklistItemId || checklistUid("item"),
    type,
    required: Boolean(node.querySelector("[data-checklist-item-required]")?.checked),
    label: node.querySelector("[data-checklist-item-label]")?.value.trim() || ""
  };
}

function selectChecklistTemplate(id) {
  syncChecklistBuilderFromDom();
  checklistState.selectedTemplateId = id || "";
  const selected = checklistState.templates.find((template) => template.id === id);
  checklistState.builder = selected ? normalizeChecklistTemplate(selected) : createBlankChecklistTemplate();
  checklistState.defaultModuleCounts = {};
  checklistState.unitModuleCounts = {};
  renderChecklistData();
  showChecklistMessage(selected ? `Editing ${selected.name}.` : "Started a new unsaved checklist.");
}

function startNewChecklistTemplate() {
  checklistState.selectedTemplateId = "";
  checklistState.builder = createBlankChecklistTemplate();
  checklistState.defaultModuleCounts = {};
  checklistState.unitModuleCounts = {};
  renderChecklistData();
  document.getElementById("checklist_template_name")?.focus();
  showChecklistMessage("Started a new checklist.");
}

function addChecklistSection() {
  syncChecklistBuilderFromDom();
  const title = (document.getElementById("newChecklistSectionTitle")?.value || "").trim() || "New Module";
  checklistState.builder.sections.push(createChecklistSection(title));
  ensureChecklistDefaultModuleCounts();
  const field = document.getElementById("newChecklistSectionTitle");
  if (field) field.value = "";
  renderChecklistForm();
  renderChecklistAssignmentPanel();
  renderChecklistMetrics();
  renderChecklistPreview();
}

function cloneChecklistItem(item = {}) {
  const normalized = normalizeChecklistItem(item);
  return {
    ...normalized,
    id: checklistUid("item")
  };
}

function cloneChecklistRoom(room = {}) {
  const normalized = normalizeChecklistRoom(room);
  return {
    ...normalized,
    id: checklistUid("room"),
    items: normalized.items.map(cloneChecklistItem)
  };
}

function cloneChecklistSection(section = {}) {
  const normalized = normalizeChecklistSection(section);
  return {
    ...normalized,
    id: checklistUid("section"),
    saved_module_id: normalized.saved_module_id || "",
    items: normalized.items.map(cloneChecklistItem),
    rooms: normalized.rooms.map(cloneChecklistRoom)
  };
}

function cleanChecklistSectionForSave(section = {}) {
  const normalized = normalizeChecklistSection(section);
  const items = normalized.items
    .map((item) => ({
      ...item,
      label: String(item.label || "").trim()
    }))
    .filter((item) => item.label);
  const rooms = normalized.rooms
    .map((room) => {
      const title = String(room.title || "").trim();
      const items = room.items
        .map((item) => ({
          ...item,
          label: String(item.label || "").trim()
        }))
        .filter((item) => item.label);
      return {
        ...room,
        title,
        items
      };
    })
    .filter((room) => String(room.title || "").trim() || room.items.length)
    .map((room) => ({
      ...room,
      title: room.title || "Room / Area"
    }));
  return {
    ...normalized,
    title: String(normalized.title || "").trim() || "Untitled Module",
    items,
    rooms
  };
}

function importSavedChecklistModule() {
  syncChecklistBuilderFromDom();
  const id = document.getElementById("checklistModuleImportSelect")?.value || checklistState.selectedModuleId || "";
  const savedModule = checklistState.savedModules.find((module) => module.id === id);
  if (!savedModule) {
    showChecklistMessage("Select a saved module before importing.", true);
    return;
  }
  const imported = cloneChecklistSection({
    ...savedModule.section,
    saved_module_id: savedModule.id,
    title: savedModule.section.title || savedModule.name
  });
  checklistState.builder.sections.push(imported);
  checklistState.selectedModuleId = savedModule.id;
  ensureChecklistDefaultModuleCounts();
  renderChecklistForm();
  renderChecklistAssignmentPanel();
  renderChecklistMetrics();
  renderChecklistPreview();
  showChecklistMessage(`${savedModule.name} imported into this checklist.`);
}

function findChecklistSection(sectionId) {
  return checklistState.builder?.sections.find((section) => section.id === sectionId) || null;
}

function addChecklistItem(sectionId) {
  syncChecklistBuilderFromDom();
  const section = findChecklistSection(sectionId);
  if (section) section.items.push(createChecklistItem());
  renderChecklistForm();
  renderChecklistAssignmentPanel();
  renderChecklistMetrics();
  renderChecklistPreview();
}

function addChecklistRoom(sectionId) {
  syncChecklistBuilderFromDom();
  const section = findChecklistSection(sectionId);
  if (section) section.rooms.push(createChecklistRoom());
  renderChecklistForm();
  renderChecklistMetrics();
  renderChecklistPreview();
}

function addChecklistRoomItem(value) {
  syncChecklistBuilderFromDom();
  const [sectionId, roomId] = String(value || "").split(":");
  const room = findChecklistSection(sectionId)?.rooms.find((candidate) => candidate.id === roomId);
  if (room) room.items.push(createChecklistItem());
  renderChecklistForm();
  renderChecklistMetrics();
  renderChecklistPreview();
}

function removeChecklistSection(sectionId) {
  syncChecklistBuilderFromDom();
  checklistState.builder.sections = checklistState.builder.sections.filter((section) => section.id !== sectionId);
  if (!checklistState.builder.sections.length) checklistState.builder.sections.push(createChecklistSection());
  delete checklistState.defaultModuleCounts[sectionId];
  Object.values(checklistState.unitModuleCounts).forEach((counts) => delete counts[sectionId]);
  renderChecklistForm();
  renderChecklistAssignmentPanel();
  renderChecklistMetrics();
  renderChecklistPreview();
}

function removeChecklistRoom(value) {
  syncChecklistBuilderFromDom();
  const [sectionId, roomId] = String(value || "").split(":");
  const section = findChecklistSection(sectionId);
  if (section) section.rooms = section.rooms.filter((room) => room.id !== roomId);
  renderChecklistForm();
  renderChecklistMetrics();
  renderChecklistPreview();
}

function removeChecklistItem(itemId) {
  syncChecklistBuilderFromDom();
  checklistState.builder.sections.forEach((section) => {
    section.items = section.items.filter((item) => item.id !== itemId);
    section.rooms.forEach((room) => {
      room.items = room.items.filter((item) => item.id !== itemId);
    });
  });
  renderChecklistForm();
  renderChecklistMetrics();
  renderChecklistPreview();
}

async function saveChecklistModule(sectionId) {
  if (!suiteSupabase || checklistState.isSavingModule) return;
  syncChecklistBuilderFromDom();
  const section = findChecklistSection(sectionId);
  if (!section) {
    showChecklistMessage("Unable to find that module to save.", true);
    return;
  }

  const cleanSection = cleanChecklistSectionForSave(section);
  if (!cleanSection.items.length && !cleanSection.rooms.some((room) => room.items.length)) {
    showChecklistMessage("Add at least one checklist item before saving this module.", true);
    return;
  }

  const builder = checklistState.builder || createBlankChecklistTemplate();
  const payload = {
    name: cleanSection.title,
    department: builder.department || "",
    subdepartment: builder.subdepartment || "",
    description: builder.name ? `Saved from ${builder.name}` : "",
    section: cleanSection
  };

  checklistState.isSavingModule = true;
  setChecklistModuleSaving(sectionId, true);
  showChecklistMessage(cleanSection.saved_module_id ? "Saving module..." : "Creating saved module...");

  const result = cleanSection.saved_module_id
    ? await suiteSupabase.from(checklistModulesTable).update(payload).eq("id", cleanSection.saved_module_id).select("*").single()
    : await suiteSupabase.from(checklistModulesTable).insert({ ...payload, created_by: checklistState.user?.id || null }).select("*").single();

  checklistState.isSavingModule = false;
  setChecklistModuleSaving(sectionId, false);

  if (result.error) {
    showChecklistMessage("Unable to save module: " + result.error.message, true);
    return;
  }

  const saved = normalizeSavedChecklistModule(result.data);
  const index = checklistState.savedModules.findIndex((module) => module.id === saved.id);
  if (index >= 0) {
    checklistState.savedModules[index] = saved;
  } else {
    checklistState.savedModules.unshift(saved);
  }
  checklistState.selectedModuleId = saved.id;
  const currentSection = findChecklistSection(sectionId);
  if (currentSection) currentSection.saved_module_id = saved.id;
  renderChecklistForm();
  renderChecklistModuleImporter();
  renderChecklistMetrics();
  showChecklistMessage(`${saved.name} saved as a reusable module.`);
}

async function saveChecklistTemplate(options = {}) {
  if (!suiteSupabase || checklistState.isSaving) return null;
  const template = cleanChecklistTemplateForSave(syncChecklistBuilderFromDom());
  if (!template.name) {
    showChecklistMessage("Checklist name is required.", true);
    return null;
  }

  checklistState.isSaving = true;
  setChecklistSaving(true);
  if (!options.silent) showChecklistMessage(template.id ? "Saving checklist..." : "Creating checklist...");

  const payload = {
    name: template.name,
    department: template.department,
    subdepartment: template.subdepartment,
    priority: template.priority,
    description: template.description,
    sections: template.sections
  };
  const result = template.id
    ? await suiteSupabase.from(checklistTemplatesTable).update(payload).eq("id", template.id).select("*").single()
    : await suiteSupabase.from(checklistTemplatesTable).insert({ ...payload, created_by: checklistState.user?.id || null }).select("*").single();

  checklistState.isSaving = false;
  setChecklistSaving(false);

  if (result.error) {
    showChecklistMessage("Unable to save checklist: " + result.error.message, true);
    return null;
  }

  const saved = normalizeChecklistTemplate(result.data);
  const index = checklistState.templates.findIndex((item) => item.id === saved.id);
  if (index >= 0) {
    checklistState.templates[index] = saved;
  } else {
    checklistState.templates.unshift(saved);
  }
  checklistState.selectedTemplateId = saved.id;
  checklistState.builder = saved;
  renderChecklistData();
  if (!options.silent) showChecklistMessage("Checklist saved.");
  return saved;
}

function setChecklistModuleSaving(sectionId, isSaving) {
  const button = document.querySelector(`[data-checklist-save-section="${selectorValue(sectionId)}"]`);
  if (!button) return;
  button.disabled = isSaving;
  const label = button.querySelector("span");
  if (label) label.textContent = isSaving ? "Saving..." : "Save Module";
}

function setChecklistSaving(isSaving) {
  document.querySelectorAll('[form="checklistTemplateForm"], #checklistTemplateForm button[type="submit"]').forEach((button) => {
    button.disabled = isSaving;
    const label = button.querySelector("span");
    if (label) label.textContent = isSaving ? "Saving..." : "Save Checklist";
  });
}

async function ensureSavedChecklistTemplate() {
  showChecklistMessage("Saving checklist before assigning...");
  return saveChecklistTemplate({ silent: true });
}

async function applyChecklistToProperty() {
  if (!suiteSupabase || checklistState.isApplying) return;
  if (!checklistState.selectedPropertyId) {
    showChecklistMessage("Select a property before assigning the checklist.", true);
    return;
  }

  const template = await ensureSavedChecklistTemplate();
  if (!template) return;

  checklistState.isApplying = true;
  showChecklistMessage("Assigning checklist to property...");
  const moduleCounts = ensureChecklistDefaultModuleCounts(template);
  const payload = {
    checklist_template_id: template.id,
    checklist_items: flattenChecklistTemplate(template, moduleCounts),
    checklist_module_counts: moduleCounts
  };
  const result = await suiteSupabase
    .from(leadTable)
    .update(payload)
    .eq("id", checklistState.selectedPropertyId)
    .select("*")
    .single();
  checklistState.isApplying = false;

  if (result.error) {
    showChecklistMessage("Unable to assign checklist to property: " + result.error.message, true);
    return;
  }

  const index = checklistState.properties.findIndex((property) => property.id === result.data.id);
  if (index >= 0) checklistState.properties[index] = result.data;
  renderChecklistData();
  showChecklistMessage("Checklist assigned to property.");
}

async function applyChecklistToUnits() {
  if (!suiteSupabase || checklistState.isApplying) return;
  const ids = Array.from(checklistState.selectedUnitIds);
  if (!ids.length) {
    showChecklistMessage("Select at least one unit before assigning the checklist.", true);
    return;
  }

  const template = await ensureSavedChecklistTemplate();
  if (!template) return;

  checklistState.isApplying = true;
  showChecklistMessage(`Assigning checklist to ${ids.length} unit${ids.length === 1 ? "" : "s"}...`);
  const updates = await Promise.all(ids.map(async (id) => {
    const unit = checklistState.units.find((row) => row.id === id) || { id };
    const moduleCounts = getChecklistUnitModuleCounts(unit);
    const payload = {
      checklist_template_id: template.id,
      checklist_items: flattenChecklistTemplate(template, moduleCounts),
      checklist_module_counts: moduleCounts
    };
    return suiteSupabase
      .from(propertyUnitsTable)
      .update(payload)
      .eq("id", id)
      .select("*")
      .single();
  }));
  checklistState.isApplying = false;

  const failed = updates.find((result) => result.error);
  if (failed) {
    showChecklistMessage("Unable to assign checklist to units: " + failed.error.message, true);
    return;
  }

  const updated = updates.map((result) => result.data).filter(Boolean);
  updated.forEach((unit) => {
    const index = checklistState.units.findIndex((row) => row.id === unit.id);
    if (index >= 0) checklistState.units[index] = unit;
  });
  renderChecklistData();
  showChecklistMessage(`Checklist assigned to ${updated.length || ids.length} unit${(updated.length || ids.length) === 1 ? "" : "s"}.`);
}

function flattenChecklistTemplate(template, moduleCounts = null) {
  const items = [];
  const counts = moduleCounts ? normalizeChecklistModuleCounts(moduleCounts, template) : normalizeChecklistModuleCounts({}, template);
  normalizeChecklistTemplate(template).sections.forEach((section) => {
    const count = counts[section.id] ?? 1;
    for (let instance = 1; instance <= count; instance += 1) {
      const moduleLabel = count > 1 ? `${section.title} ${instance}` : section.title;
      section.items.forEach((item) => {
        const normalized = flattenChecklistItem(item, moduleLabel, section, instance);
        if (normalized) items.push(normalized);
      });
      section.rooms.forEach((room) => {
        room.items.forEach((item) => {
          const normalized = flattenChecklistItem(item, `${moduleLabel} / ${room.title}`, section, instance);
          if (normalized) items.push(normalized);
        });
      });
    }
  });
  return items;
}

function flattenChecklistItem(item, category, module = {}, moduleInstance = 1) {
  const label = String(item.label || item.task || "").trim();
  if (!label) return null;
  const type = checklistItemType(item.type || item.media_required || "check");
  const mediaKind = checklistItemMediaKind(type);
  const required = item.required !== false;
  return {
    id: `${item.id || checklistUid("item")}-${moduleInstance}`,
    category: category || "General",
    task: label,
    label,
    type,
    module_id: module.id || "",
    module_name: module.title || "",
    module_instance: moduleInstance,
    source_item_id: item.id || "",
    required,
    media_required: mediaKind || "none",
    notes: type === "note" ? "Contractor should leave a completion note." : ""
  };
}

function checklistAssignmentPanelHtml() {
  const property = getChecklistSelectedProperty();
  const units = getChecklistSelectedPropertyUnits();
  const selectedCount = units.filter((unit) => checklistState.selectedUnitIds.has(unit.id)).length;
  const allSelected = Boolean(units.length && selectedCount === units.length);
  return `
    <div class="checklist-assignment-stack">
      <label class="suite-field">
        <span>Property</span>
        <select id="checklistAssignmentPropertySelect">
          ${checklistState.properties.length
            ? checklistState.properties.map((row) => `<option value="${esc(row.id)}" ${row.id === checklistState.selectedPropertyId ? "selected" : ""}>${esc(propertyUnitPropertyTitle(row))}</option>`).join("")
            : `<option value="">No properties found</option>`}
        </select>
      </label>
      ${checklistModuleDefaultsHtml()}
      <button class="primary-action full-width" type="button" data-checklist-apply-property ${property ? "" : "disabled"}>${icon("check")}<span>Apply to Property</span></button>
      <div class="checklist-unit-toolbar">
        <strong>Property Units</strong>
        <button type="button" data-checklist-select-all-units ${units.length ? "" : "disabled"}>${allSelected ? "Clear" : "Select All"}</button>
      </div>
      <div class="checklist-unit-list">
        ${units.length ? units.map(renderChecklistUnitOption).join("") : emptyState("building", "No units found", property ? "Add units on the Property Units page first." : "Select a property.")}
      </div>
      <button class="secondary-action full-width" type="button" data-checklist-apply-units ${selectedCount ? "" : "disabled"}>${icon("check")}<span>Apply to ${selectedCount || 0} Selected Unit${selectedCount === 1 ? "" : "s"}</span></button>
    </div>
  `;
}

function checklistModuleDefaultsHtml() {
  const modules = checklistModules();
  const counts = ensureChecklistDefaultModuleCounts();
  if (!modules.length) return "";
  return `
    <div class="checklist-module-defaults">
      <div>
        <strong>Default Module Counts</strong>
        <small>Use 0 to skip a module. Units can override these counts below.</small>
      </div>
      <div class="checklist-module-count-grid">
        ${modules.map((module) => checklistModuleCountInput(module, counts[module.id], {
          attr: "data-checklist-default-module-count",
          moduleId: module.id
        })).join("")}
      </div>
    </div>
  `;
}

function renderChecklistUnitOption(unit) {
  const templateName = checklistTemplateName(unit.checklist_template_id);
  const selected = checklistState.selectedUnitIds.has(unit.id);
  const counts = getChecklistUnitModuleCounts(unit, { persist: selected });
  return `
    <div class="checklist-unit-option ${selected ? "is-selected" : ""}">
      <label class="checklist-unit-select">
        <input type="checkbox" value="${esc(unit.id)}" data-checklist-unit-option ${selected ? "checked" : ""} />
        <span>
          <strong>${esc(unit.unit_name || "Unnamed unit")}</strong>
          <small>${esc([unit.square_feet ? `${Number(unit.square_feet).toLocaleString()} sq ft` : "", templateName ? `Checklist: ${templateName}` : "No checklist assigned"].filter(Boolean).join(" - "))}</small>
        </span>
      </label>
      <div class="checklist-unit-module-counts" ${selected ? "" : "hidden"}>
        ${checklistModules().map((module) => checklistModuleCountInput(module, counts[module.id], {
          attr: "data-checklist-unit-module-count",
          moduleId: module.id,
          unitId: unit.id
        })).join("")}
      </div>
    </div>
  `;
}

function checklistModuleCountInput(module, value, options = {}) {
  const attrs = [
    options.attr || "",
    options.moduleId ? `data-module-id="${esc(options.moduleId)}"` : "",
    options.unitId ? `data-unit-id="${esc(options.unitId)}"` : ""
  ].filter(Boolean).join(" ");
  return `
    <label class="checklist-module-count-field">
      <span>${esc(module.title || "Module")}</span>
      <input type="number" min="0" max="50" step="1" value="${esc(checklistModuleCountValue(value, 1))}" ${attrs} />
    </label>
  `;
}

function renderChecklistAssignmentPanel() {
  const panelNode = document.getElementById("checklistAssignmentPanel");
  if (panelNode) panelNode.innerHTML = checklistAssignmentPanelHtml();
}

function checklistPropertySummaryHtml() {
  const property = getChecklistSelectedProperty();
  const units = getChecklistSelectedPropertyUnits();
  if (!property) return emptyState("building", "No property selected");
  const templateName = checklistTemplateName(property.checklist_template_id);
  const unitAssignments = units.filter((unit) => unit.checklist_template_id).length;
  return `
    <strong>${esc(propertyUnitPropertyTitle(property))}</strong>
    <p>${esc(propertyUnitPropertyAddress(property) || "No address on file")}</p>
    <dl>
      <div><dt>Property Checklist</dt><dd>${esc(templateName || "None")}</dd></div>
      <div><dt>Units</dt><dd>${units.length.toLocaleString()}</dd></div>
      <div><dt>Units Assigned</dt><dd>${unitAssignments.toLocaleString()}</dd></div>
    </dl>
  `;
}

function renderChecklistPropertySummary() {
  const summary = document.getElementById("checklistPropertySummary");
  if (summary) summary.innerHTML = checklistPropertySummaryHtml();
}

function checklistPreviewHtml() {
  const template = checklistState.builder || createBlankChecklistTemplate();
  const items = flattenChecklistTemplate(template, ensureChecklistDefaultModuleCounts(template));
  if (!items.length) return emptyState("clipboard-list", "No requirements yet", "Add module counts and checklist items to preview what contractors will see.");
  return items.slice(0, 12).map((item) => `
    <div class="checklist-preview-item">
      <span>${esc(item.category)}</span>
      <strong>${esc(item.task)}</strong>
      <small>${esc(item.media_required !== "none" ? `${titleCase(item.media_required)} ${item.required ? "required" : "optional"}` : item.required ? "Required" : "Optional")}</small>
    </div>
  `).join("") + (items.length > 12 ? `<p class="checklist-preview-more">+${items.length - 12} more items</p>` : "");
}

function renderChecklistPreview() {
  const preview = document.getElementById("checklistPreview");
  if (preview) preview.innerHTML = checklistPreviewHtml();
}

function renderChecklistMetrics() {
  const template = checklistState.builder || createBlankChecklistTemplate();
  const sections = normalizeChecklistTemplate(template).sections;
  const items = flattenChecklistTemplate(template, ensureChecklistDefaultModuleCounts(template));
  const assignedProperties = checklistState.properties.filter((property) => property.checklist_template_id).length;
  const assignedUnits = checklistState.units.filter((unit) => unit.checklist_template_id).length;
  setText("checklistTemplateCount", checklistState.templates.length.toLocaleString());
  setText("checklistSectionCount", `${sections.length.toLocaleString()} / ${checklistState.savedModules.length.toLocaleString()}`);
  setText("checklistItemCount", items.length.toLocaleString());
  setText("checklistAssignedCount", (assignedProperties + assignedUnits).toLocaleString());
}

function getChecklistSelectedProperty() {
  return checklistState.properties.find((row) => row.id === checklistState.selectedPropertyId) || null;
}

function getChecklistSelectedPropertyUnitKeys() {
  const property = getChecklistSelectedProperty();
  return [checklistState.selectedPropertyId, property?.client_id].filter(Boolean).map(String);
}

function getChecklistSelectedPropertyUnits() {
  const keys = getChecklistSelectedPropertyUnitKeys();
  if (!keys.length) return [];
  return checklistState.units
    .filter((row) => keys.includes(String(row.property_id || "")))
    .sort(propertyUnitSort);
}

function toggleChecklistUnitSelection() {
  const units = getChecklistSelectedPropertyUnits();
  const allSelected = units.length && units.every((unit) => checklistState.selectedUnitIds.has(unit.id));
  checklistState.selectedUnitIds = allSelected
    ? new Set()
    : new Set(units.map((unit) => unit.id));
  renderChecklistAssignmentPanel();
}

function checklistTemplateName(id) {
  if (!id) return "";
  return checklistState.templates.find((template) => template.id === id)?.name || "Assigned checklist";
}

function showChecklistMessage(text, isError = false) {
  const message = document.getElementById("checklistMessage");
  if (!message) return;
  message.textContent = text || "";
  message.classList.toggle("error", Boolean(isError));
}

function assignmentFilterPanel() {
  return `
    <aside class="filter-card assignment-filter-card">
      <div class="filter-head"><h2>Filters</h2><button type="button" data-assignment-clear-filters>Clear All</button></div>
      <div class="filter-grid">
        <label class="suite-field"><span>Status</span><select id="assignmentStatusFilter"><option value="all">All Statuses</option>${assignmentStatusOptions.map(([value, label]) => `<option value="${esc(value)}">${esc(label)}</option>`).join("")}<option value="overdue">Overdue</option></select></label>
        <label class="suite-field"><span>Block Type</span><select id="assignmentFrequencyFilter"><option value="all">All Blocks</option>${assignmentFrequencyOptions.map(([value, label]) => `<option value="${esc(value)}">${esc(label)}</option>`).join("")}</select></label>
        <label class="suite-field"><span>Contractor</span><select id="assignmentContractorFilter"><option value="all">All Contractors</option></select></label>
      </div>
      <div class="filter-actions">
        <button class="secondary-action" type="button" data-assignment-clear-filters><span>Clear Filters</span></button>
      </div>
    </aside>
  `;
}

function renderDirectory() {
  return `
    <section class="directory-layout">
      <div class="suite-stack">
        <section class="metric-strip five">
          ${metric("Total Contractors", "0", "total in network", "users", "blue")}
          ${metric("Active", "0", "currently active", "check", "green")}
          ${metric("Onboarding", "0", "in onboarding", "clock", "yellow")}
          ${metric("Inactive", "0", "not active", "alert", "red")}
          ${metric("Suspended", "0", "suspended", "user", "red")}
        </section>
        ${tableFrame(["", "Contractor", "Company", "Status", "Service Types", "Location", "Rating", "Jobs Completed", "Last Active", "Actions"], emptyState("users", "No contractors found", "No contractors match your current filters.", actionButton("Clear Filters", "", "", "secondary")), {
          checkbox: true,
          toolbar: toolbar(`${searchBox("Search contractors...")}${actionButton("Filters", "filter", "", "secondary")}`, actionButton("Export", "download", "", "secondary")),
          className: "directory-table"
        })}
      </div>
      ${filters("Filters", [
        selectControl("Status", ["Select status..."]),
        selectControl("Service Type", ["Select service type..."]),
        selectControl("Location", ["Select location..."]),
        inputControl("Company", "Search company..."),
        selectControl("Rating", ["Select rating..."]),
        inputControl("Jobs Completed", "Min"),
        inputControl("Last Active", "Select date range...", "date")
      ])}
    </section>
  `;
}

function renderOnboarding() {
  return `
    ${tabs([["overview", "Overview"], ["docs", "Docs"], ["training", "Completed Training Checklist"]], "overview")}
    <section class="metric-strip five">
      ${metric("Invited", "0", "waiting to register", "document", "blue")}
      ${metric("In Progress", "0", "onboarding in progress", "clock", "blue")}
      ${metric("Docs Pending", "0", "documents outstanding", "document", "blue")}
      ${metric("Training Pending", "0", "training outstanding", "user-plus", "purple")}
      ${metric("Completed", "0", "fully onboarded", "check", "green")}
    </section>
    <section class="onboarding-layout">
      ${panel("Onboarding Pipeline", `
        ${toolbar("", `${actionButton("Filters", "filter", "", "secondary")}${searchBox("Search contractors...")}`)}
        <div class="pipeline-board onboarding-board">
          ${["Invited", "In Progress", "Docs Pending", "Training Pending", "Completed"].map((label, i) => `
            <article class="pipeline-column ${["purple", "blue", "yellow", "purple", "green"][i]}">
              <header><span>${esc(label)}</span><strong>0</strong></header>
              <div class="pipeline-dropzone">${emptyState("plus", "No contractors.", "Contractors will appear here.")}</div>
            </article>
          `).join("")}
        </div>
      `)}
      <aside class="suite-stack">
        ${panel("Onboarding Progress", `${donut("0%", "Complete")}${statLegend([["Docs Completed", "0", "blue"], ["Training Completed", "0", "green"], ["In Progress", "0", "yellow"], ["Not Started", "0", "slate"], ["Total Contractors", "0", "none"]])}`)}
      </aside>
    </section>
    <section class="two-panels">
      ${panel("Upcoming Onboarding Tasks", emptyState("calendar", "No upcoming tasks", "Upcoming onboarding tasks and deadlines will appear here."))}
      ${panel("Recent Activity", skeletonRows(3))}
    </section>
  `;
}

function renderDocumentsCompliance() {
  return `
    ${tabs([["documents", "Documents"], ["compliance", "Compliance"]], "documents")}
    <section class="metric-strip five">
      ${metric("Total Documents", "0", "all time", "document", "blue")}
      ${metric("Expiring Soon", "0", "within 30 days", "clock", "yellow")}
      ${metric("Expired", "0", "require immediate attention", "alert", "red")}
      ${metric("Compliant", "0", "up to date", "check", "green")}
      ${metric("Pending Review", "0", "awaiting review", "clock", "blue")}
    </section>
    <section class="content-rail compliance-layout">
      ${tableFrame(["", "Document Name", "Document Type", "Contractor", "Status", "Issue Date", "Expiration Date", "Actions"], emptyState("document", "No documents found", "Upload documents to get started.", actionButton("Upload Document", "upload")), {
        checkbox: true,
        toolbar: toolbar(`${searchBox("Search documents...")}${selectButton("All Document Types")}${selectButton("All Statuses")}`, `${actionButton("Filters", "filter", "", "secondary")}${actionButton("Upload Document", "upload")}`),
        className: "span-main"
      })}
      <aside class="suite-stack">
        ${panel("Compliance Overview", `${donut("0%", "Compliant")}${statLegend([["Compliant", "0 (0%)", "green"], ["Expiring Soon", "0 (0%)", "yellow"], ["Expired", "0 (0%)", "red"], ["Pending Review", "0 (0%)", "blue"], ["Total Documents", "0", "none"]])}`)}
        ${panel("Document Types", statLegend([["Insurance", "0"], ["Licenses & Certifications", "0"], ["Background Checks", "0"], ["Safety Documents", "0"], ["Tax Documents", "0"], ["Other", "0"], ["Total", "0"]]))}
      </aside>
    </section>
  `;
}

function renderAvailability() {
  return `
    ${tabs([["overview", "Overview"], ["calendar", "Availability Calendar"], ["timeoff", "Time Off"], ["prefs", "Preferences"], ["blackout", "Blackout Dates"]], "overview")}
    <section class="metric-strip five">
      ${metric("Available Today", "0", "contractors", "calendar", "green")}
      ${metric("Available This Week", "0", "contractors", "calendar", "blue")}
      ${metric("Unavailable This Week", "0", "contractors", "calendar", "red")}
      ${metric("On Time Off", "0", "contractors", "activity", "purple")}
      ${metric("With Restrictions", "0", "contractors", "alert", "yellow")}
    </section>
    <section class="content-rail availability-layout">
      ${tableFrame(["", "Contractor", "Status", "Availability This Week", "Next Available", "Restrictions", "Actions"], emptyState("calendar", "No contractors found", "Try adjusting your filters or add contractors.", actionButton("Clear Filters", "", "", "secondary")), {
        checkbox: true,
        toolbar: toolbar(`${searchBox("Search contractors...")}${selectButton("All Statuses")}${selectButton("All Service Types")}${actionButton("Filters", "filter", "", "secondary")}`, selectButton("Bulk Actions")),
        className: "span-main"
      })}
      <aside class="suite-stack">
        ${panel("Availability Overview", `${miniRange("May 19 - May 25, 2025")}${statLegend([["Fully Available", "0 (0%)", "green"], ["Partially Available", "0 (0%)", "blue"], ["Limited Availability", "0 (0%)", "yellow"], ["Unavailable", "0 (0%)", "red"], ["Total Contractors", "0", "none"]])}`)}
        ${panel("Quick Actions", `<div class="quick-actions">${["Add Time Off", "Set Availability Preference", "Add Blackout Date", "Export Availability"].map((item, i) => `<button type="button">${icon(["plus", "clock", "calendar", "download"][i])}<span>${esc(item)}</span><small>${esc(["Request time off for yourself", "Update your general availability", "Block dates you are unavailable", "Export availability report"][i])}</small></button>`).join("")}</div>`)}
        ${panel("Upcoming Time Off", emptyState("calendar", "No upcoming time off", "You have no time off scheduled.", actionButton("View Calendar", "calendar", "", "secondary")))}
      </aside>
    </section>
  `;
}

function renderPerformance() {
  return `
    ${tabs([["overview", "Overview"], ["scorecard", "Scorecard"], ["reviews", "Reviews"], ["insights", "Insights"], ["goals", "Goals & Improvement"]], "overview")}
    <section class="metric-strip five">
      ${metric("Overall Score", "0", "vs last 90 days", "activity", "purple")}
      ${metric("Jobs Completed", "0", "vs last 90 days", "calendar", "blue")}
      ${metric("On-Time Rate", "0%", "vs last 90 days", "clock", "green")}
      ${metric("Quality Score", "0", "vs last 90 days", "star", "yellow")}
      ${metric("Client Satisfaction", "0.0", "vs last 90 days", "check", "red")}
    </section>
    <section class="performance-layout">
      ${panel("Performance Trend", `${toolbar(selectButton("Overall Score"), selectButton("Feb 24 - May 25, 2025"))}${axisChart("No performance data yet", "Performance trends will appear here once data is available.")}`, { className: "span-wide" })}
      ${panel("Performance Breakdown", `${donut("0", "Total Score")}${statLegend([["Quality", "0 (0%)", "green"], ["Timeliness", "0 (0%)", "yellow"], ["Communication", "0 (0%)", "purple"], ["Professionalism", "0 (0%)", "blue"], ["Safety & Compliance", "0 (0%)", "red"]])}`)}
      ${filters("Filters", [inputControl("Date Range", "Feb 24 - May 25, 2025", "date"), selectControl("Contractor", ["Select contractor..."]), selectControl("Service Type", ["Select service type..."]), selectControl("Location", ["Select location..."]), selectControl("Status", ["Select status..."])])}
      ${panel("Recent Performance Reviews", emptyState("star", "No reviews yet", "Performance reviews and feedback will appear here.", actionButton("Create Review", "plus")), { action: { label: "View All Reviews", tone: "secondary" } })}
      ${panel("Top Strengths", emptyState("star", "No strengths identified", "Top strengths will appear here once performance data is available."))}
      ${panel("Areas for Improvement", emptyState("target", "No improvement areas identified", "Areas for improvement will appear here once performance data is available."))}
      ${panel("Quick Actions", `<div class="quick-actions">${["Create Review", "View Scorecard", "Export Report"].map((item, i) => `<button type="button">${icon(["star", "calendar", "download"][i])}<span>${esc(item)}</span><small>${esc(["Provide feedback for a contractor", "Detailed performance scorecard", "Download performance report"][i])}</small></button>`).join("")}</div>`)}
    </section>
  `;
}

function renderQuality(active) {
  if (active === "videos") return renderVideoLibrary();
  if (active === "qa-analytics") return renderQaAnalytics();
  if (active === "qa-reviews") return renderQaReviews();
  return renderQaQueue();
}

function qualityTabs(active) {
  return tabs([
    ["qa-queue", "QA Queue", "qa-queue.html"],
    ["qa-reviews", "QA Reviews", "qa-reviews.html"],
    ["qa-analytics", "QA Analytics", "qa-analytics.html"],
    ["videos", "Video Library", "videos.html"]
  ], active);
}

function renderQaQueue() {
  return `
    ${qualityTabs("qa-queue")}
    <section class="metric-strip five">
      ${metric("Total in Queue", "0", "all time", "briefcase", "blue")}
      ${metric("Due Today", "0", "reviews", "clock", "yellow")}
      ${metric("Due This Week", "0", "reviews", "calendar", "purple")}
      ${metric("Overdue", "0", "reviews", "alert", "red")}
      ${metric("Avg. Age in Queue", "0", "days", "activity", "blue")}
    </section>
    <section class="content-rail">
      ${tableFrame(["", "Review ID", "Property / Project", "Contractor", "Service Type", "Location", "Due Date", "Priority", "Status", "Actions"], emptyState("briefcase", "No reviews in queue", "QA reviews assigned to you or your team will appear here.", actionButton("View All Reviews", "line-chart")), {
        checkbox: true,
        toolbar: toolbar(`${searchBox("Search properties, contractors...")}${selectButton("All Statuses")}${selectButton("All Service Types")}${selectButton("All Reviewers")}${actionButton("Filters", "filter", "", "secondary")}`, selectButton("Bulk Actions")),
        className: "span-main"
      })}
      ${filters("Filters", [inputControl("Date Range", "May 19 - May 25, 2025", "date"), selectControl("Status", ["Select status..."]), selectControl("Service Type", ["Select service type..."]), selectControl("Location", ["Select location..."]), inputControl("Contractor", "Search contractor..."), selectControl("Priority", ["Select priority..."]), selectControl("Reviewer", ["Select reviewer..."])])}
    </section>
  `;
}

function renderQaReviews() {
  return `
    ${qualityTabs("qa-reviews")}
    <section class="metric-strip six">
      ${metric("Total Reviews", "0", "all time", "calendar", "blue")}
      ${metric("Pending Review", "0", "awaiting review", "clock", "yellow")}
      ${metric("Approved", "0", "(0%)", "check", "green")}
      ${metric("Needs Improvement", "0", "(0%)", "alert", "red")}
      ${metric("Average Score", "0%", "overall average", "star", "purple")}
      ${metric("Re-Reviews", "0", "required", "activity", "blue")}
    </section>
    <section class="content-rail">
      ${tableFrame(["", "Review ID", "Contractor", "Property / Project", "Service Type", "Location", "Reviewer", "Score", "Status", "Review Date", "Actions"], emptyState("document", "No reviews found", "Reviews will appear here once work is completed and submitted for quality assurance.", actionButton("View QA Queue", "message-square")), {
        checkbox: true,
        toolbar: toolbar(`${searchBox("Search reviews...")}${selectButton("All Statuses")}${selectButton("All Service Types")}${selectButton("All Locations")}`, actionButton("Export", "download", "", "secondary")),
        className: "span-main"
      })}
      ${filters("Filters", [inputControl("Date Range", "May 19 - May 25, 2025", "date"), selectControl("Status", ["Select status..."]), selectControl("Service Type", ["Select service type..."]), selectControl("Location", ["Select location..."]), inputControl("Contractor", "Search contractor..."), inputControl("Score", "Min"), inputControl("Reviewer", "Search reviewer...")])}
    </section>
    <section class="four-panels">
      ${panel("Score Distribution", statLegend([["5 Stars", "0 (0%)", "green"], ["4 Stars", "0 (0%)", "green"], ["3 Stars", "0 (0%)", "yellow"], ["2 Stars", "0 (0%)", "orange"], ["1 Star", "0 (0%)", "red"]]))}
      ${panel("Top Service Types", emptyState("settings", "No data available", "Service type data will appear here once reviews are available."))}
      ${panel("Top Contractors", emptyState("users", "No data available", "Contractor performance will appear here once reviews are available."))}
      ${panel("Recent Activity", emptyState("clock", "No recent activity", "QA review activity will appear here."))}
    </section>
  `;
}

function renderQaAnalytics() {
  return `
    ${qualityTabs("qa-analytics")}
    <section class="metric-strip six">
      ${metric("Total Reviews", "-", "No data yet", "calendar", "purple")}
      ${metric("Average Score", "-", "No data yet", "star", "yellow")}
      ${metric("Pass Rate (>= 80%)", "-", "No data yet", "check", "green")}
      ${metric("Needs Improvement", "-", "No data yet", "alert", "red")}
      ${metric("Re-Review Rate", "-", "No data yet", "activity", "blue")}
      ${metric("Avg. Time to Review", "-", "No data yet", "clock", "yellow")}
    </section>
    <section class="analytics-layout">
      ${panel("QA Score Over Time", axisChart("No data to display", "Review scores over time will appear here once data is available."))}
      ${panel("Score Distribution", `${donut("No data", "")}${statLegend([["", "-", "blue"], ["", "-", "green"], ["", "-", "yellow"], ["", "-", "orange"], ["", "-", "red"]])}`)}
      ${filters("Filters", [inputControl("Date Range", "Select date range", "date"), selectControl("Service Type", ["All Service Types"]), selectControl("Location", ["All Locations"]), inputControl("Contractor", "Search contractors..."), selectControl("Reviewer", ["All Reviewers"]), inputControl("Score Range", "Min"), selectControl("Review Status", ["All Statuses"])])}
      ${panel("Scores by Service Type", emptyState("grid", "No data yet", "Scores by service type will appear here once data is available."), { action: { label: "View all service types", tone: "secondary" } })}
      ${panel("Top Strengths", emptyState("star", "No data yet", "Top strengths will appear here once data is available."), { action: { label: "View all categories", tone: "secondary" } })}
      ${panel("Top Opportunities", emptyState("target", "No data yet", "Top opportunities will appear here once data is available."), { action: { label: "View all categories", tone: "secondary" } })}
      ${tableFrame(["Contractor", "Total Reviews", "Average Score", "Pass Rate (>= 80%)", "Needs Improvement", "Re-Review Rate", "Trend (90 Days)", "Actions"], emptyState("user", "No data yet", "Contractor performance data will appear here once data is available."), { className: "span-wide" })}
      ${panel("Insights", emptyState("activity", "No insights yet", "Insights and recommendations will appear here once data is available."))}
    </section>
  `;
}

function renderVideoLibrary() {
  return `
    ${qualityTabs("videos")}
    ${panel("Video Library", `<p>Access and review training, best practices, and quality standard videos.</p>`, { action: { label: "Upload Video", icon: "upload", tone: "secondary" } })}
    ${panel("Filters", formGrid([
      selectControl("Property / Project", ["Select property..."]),
      selectControl("Service Type", ["All Service Types"]),
      selectControl("Video Category", ["Select category..."]),
      selectControl("Topic", ["Select topic..."]),
      selectControl("Location", ["All Locations"]),
      selectControl("Uploaded By", ["Select user..."]),
      selectControl("Duration", ["Select duration..."]),
      inputControl("Date Uploaded", "Select date range", "date"),
      selectControl("Visibility", ["All Visibility"]),
      selectControl("Audience", ["All Audiences"]),
      selectControl("Language", ["All Languages"]),
      checkboxControl("Favorites Only")
    ], "video-filter-grid"), { className: "compact-panel" })}
    ${tableFrame([""], emptyState("video", "No videos found", "No videos match your current filters. Try adjusting your filters or upload a new video.", actionButton("Upload First Video", "upload")), {
      toolbar: toolbar(searchBox("Search videos by title, description, or tags..."), `${selectButton("Newest First")}${chip("", true, "grid")}${chip("", false, "list")}`),
      pagination: true,
      itemName: "videos",
      className: "video-library-card"
    })}
  `;
}

function renderClients(active) {
  const clientTabs = tabs([
    ["client-directory", "Client Directory", "client-directory.html"],
    ["contacts", "Contacts", "contacts.html"],
    ["activity", "Activity Log"],
    ["performance", "Client Performance"]
  ], active);
  return active === "contacts" ? renderContacts(clientTabs) : renderClientDirectory(clientTabs);
}

function renderClientDirectory(clientTabs) {
  return `
    <section class="client-directory-workspace" data-client-directory-page>
      ${clientTabs}
      <section class="metric-strip six">
        ${metric("Total Clients", "0", "synced from Supabase", "building", "blue", 'id="clientTotalCount"')}
        ${metric("Active Clients", "0", "currently active", "check", "green", 'id="clientActiveCount"')}
        ${metric("Prospects", "0", "pipeline clients", "clock", "yellow", 'id="clientProspectCount"')}
        ${metric("Renewals", "0", "next 60 days", "calendar", "purple", 'id="clientRenewalCount"')}
        ${metric("Units", "0", "tracked service units", "building", "slate", 'id="clientUnitTotal"')}
        ${metric("Active MRR", "$0", "monthly recurring", "refresh", "green", 'id="clientActiveMrrTotal"')}
        ${metric("Prospect Income", "$0", "monthly pipeline", "badge-dollar", "yellow", 'id="clientProspectIncomeTotal"')}
        ${metric("Projected Turnovers", "0", "this year", "building", "purple", 'id="clientProjectedTurnovers"')}
        ${metric("Turnover Income", "$0", "monthly projection", "badge-dollar", "blue", 'id="clientTurnoverRevenueTotal"')}
        ${metric("Total Revenue", "$0", "MRR + turnover monthly", "wallet", "green", 'id="clientTotalMonthlyRevenue"')}
        ${metric("Annual Revenue", "$0", "annualized monthly", "line-chart", "purple", 'id="clientAnnualRevenueTotal"')}
      </section>
      ${toolbar(
        `<label class="inline-search client-search">${icon("search")}<input id="clientSearchInput" type="search" placeholder="Search clients..." /></label>`,
        `<select id="clientManagerFilter" class="select-button" aria-label="Filter account manager"><option value="all">All Managers</option></select><button class="secondary-action" type="button" data-client-filter-toggle>${icon("filter")}<span>Filters</span></button><button id="clientAddBtn" class="primary-action" type="button">${icon("plus")}<span>Add Client</span></button>`
      )}
      <section id="clientFilterPanel" class="lead-filter-panel client-filter-panel" hidden>
        <label class="suite-field"><span>Status</span><select id="clientStatusFilter"><option value="all">All Statuses</option>${clientStatusOptions.map(([id, label]) => `<option value="${esc(id)}">${esc(label)}</option>`).join("")}</select></label>
        <label class="suite-field"><span>Client Type</span><select id="clientTypeFilter"><option value="all">All Types</option>${clientTypeOptions.filter(Boolean).map((type) => `<option value="${esc(type)}">${esc(type)}</option>`).join("")}</select></label>
        <button class="secondary-action" type="button" data-client-clear-filters><span>Clear Filters</span></button>
      </section>
      <p id="clientMessage" class="status-message" aria-live="polite"></p>
      <section class="client-directory-rail">
        <div class="table-card span-main clients-table-card">
          <div class="table-scroll">
            <table class="suite-table">
              <thead>
                <tr>
                  <th>Client Name</th>
                  <th>Company</th>
                  <th>Primary Contact</th>
                  <th>Account Managers</th>
                  <th>Status</th>
                  <th>Renewal Date</th>
                  <th>Properties</th>
                  <th>Units</th>
                  <th>Revenue</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody id="clientTableBody"></tbody>
            </table>
          </div>
          <div id="clientEmptyState" hidden>${emptyState("building", "No clients found", "Add your first client to start tracking accounts.", actionButton("Add Client", "plus", "clientEmptyAddBtn"))}</div>
          <div class="table-foot"><span id="clientTableCount">Showing 0 clients</span>${pager()}</div>
        </div>
      </section>
      <div id="clientModal" class="client-modal" role="dialog" aria-modal="true" aria-labelledby="clientModalTitle" hidden>
        <button class="client-modal-backdrop" type="button" aria-label="Close client form" data-client-modal-close></button>
        <section class="client-modal-panel">
          <div class="client-modal-header">
            <div>
              <p>Client Directory</p>
              <h2 id="clientModalTitle">Add Client</h2>
            </div>
            <button class="client-modal-close" type="button" aria-label="Close client form" data-client-modal-close>${icon("x")}</button>
          </div>
          <div id="clientModalBody"></div>
        </section>
      </div>
      <section class="four-panels client-insight-grid">
        ${panel("Top Clients by Revenue", `<div id="clientTopRevenue" class="client-insight-list">${emptyState("badge-dollar", "No revenue yet")}</div>`)}
        ${panel("Clients by Status", `<div id="clientStatusBreakdown" class="client-insight-list">${skeletonRows(3)}</div>`)}
        ${panel("New Clients (30 Days)", `<div id="clientNewClients" class="client-insight-list">${emptyState("user-plus", "No new clients")}</div>`)}
        ${panel("Upcoming Renewals", `<div id="clientUpcomingRenewals" class="client-insight-list">${emptyState("calendar", "No upcoming renewals")}</div>`)}
      </section>
    </section>
  `;
}

function clientFormSection(title, className = "", section = "") {
  const sectionAttr = section ? `data-client-section="${esc(section)}"` : "";
  return `<div class="client-form-section wide ${className}" ${sectionAttr}><span>${esc(title)}</span></div>`;
}

function clientManagerDropdownField(row = null) {
  const options = getClientManagerOptions(row);
  const selectedKeys = clientSelectedManagerKeys(row);
  const selectedLabels = options.filter((option) => selectedKeys.has(clientManagerOptionKey(option))).map((option) => option.name);
  const label = selectedLabels.length ? selectedLabels.join(", ") : "Select account managers";
  const items = options.length
    ? options.map((option) => {
      const key = clientManagerOptionKey(option);
      const checked = selectedKeys.has(key) ? "checked" : "";
      const meta = [option.email, option.role ? titleCase(option.role) : ""].filter(Boolean).join(" - ");
      return `
        <label class="client-manager-option">
          <input type="checkbox" data-client-manager-option data-manager-id="${esc(option.id)}" data-manager-name="${esc(option.name)}" data-manager-email="${esc(option.email)}" ${checked} />
          <span><strong>${esc(option.name)}</strong>${meta ? `<small>${esc(meta)}</small>` : ""}</span>
        </label>
      `;
    }).join("")
    : `<div class="client-manager-empty">No property manager accounts found</div>`;
  return `
    <div class="suite-field client-manager-field wide">
      <span>Account Managers</span>
      <div class="client-manager-select" data-client-manager-dropdown>
        <button class="client-manager-toggle" type="button" aria-expanded="false" data-client-manager-toggle>${icon("users")}<span class="client-manager-toggle-label">${esc(label)}</span>${icon("chevron-down")}</button>
        <div class="client-manager-menu" data-client-manager-menu hidden>
          ${items}
        </div>
      </div>
    </div>
  `;
}

function clientMonthlyTurnoversField() {
  return `
    <div class="client-monthly-turnovers wide" data-client-monthly-turnovers>
      <div class="client-monthly-turnovers-head">
        <span>Projected Turnover Units by Month</span>
        <small id="clientMonthlyTurnoversTotal">0 projected this year</small>
      </div>
      <div class="client-month-grid">
        ${clientTurnoverMonthOptions.map(([key, label]) => `
          <label class="suite-field">
            <span>${esc(label)}</span>
            <input id="clientTurnoverMonth_${esc(key)}" data-client-turnover-month="${esc(key)}" type="number" min="0" step="1" />
          </label>
        `).join("")}
      </div>
    </div>
  `;
}

function clientForm(mode = "edit", row = null) {
  const isAdd = mode === "add";
  return `
    <form id="clientForm" class="lead-form client-form" data-client-form-mode="${esc(mode)}">
      <input id="clientId" type="hidden" />
      ${formGrid([
        leadInputField("clientName", "Client Name", "text", { required: true }),
        leadInputField("clientCompany", "Company"),
        leadInputField("clientPrimaryContact", "Primary Contact"),
        leadInputField("clientContactEmail", "Contact Email", "email"),
        leadInputField("clientContactPhone", "Contact Phone", "tel"),
        leadSelectField("clientStatus", "Status", clientStatusOptions, { required: true }),
        clientManagerDropdownField(row),
        leadSelectField("clientType", "Client Type", clientTypeOptions, { emptyLabel: "Select type" }),
        leadInputField("clientRegion", "Region / Market"),
        leadInputField("clientProperties", "Properties", "number", { min: "0", step: "1" }),
        clientFormSection("Property Details"),
        leadInputField("clientPropertyName", "Property Name"),
        leadInputField("clientAddress", "Address", "text", { className: "wide" }),
        leadInputField("clientCity", "City"),
        leadInputField("clientState", "State"),
        leadInputField("clientPostalCode", "Postal Code"),
        leadTextareaField("clientAccessNotes", "Access Notes", "wide"),
        leadSelectField("clientServiceModel", "Service Model", clientServiceModelOptions, { required: true }),
        leadInputField("clientUnitCount", "Units", "number", { min: "0", step: "1", className: "client-unit-field" }),
        clientMonthlyTurnoversField(),
        clientFormSection("Revenue", "", "revenue"),
        leadInputField("clientMonthlyRecurringRevenue", "Monthly Recurring Income", "number", { min: "0", step: "0.01", className: "client-revenue-field" }),
        leadInputField("clientProspectProjectedRevenue", "Monthly Prospect Income", "number", { min: "0", step: "0.01", className: "client-revenue-field" }),
        leadInputField("clientProjectedTurnoverRevenue", "Monthly Turnover Revenue", "number", { min: "0", step: "0.01", className: "client-revenue-field" }),
        leadInputField("clientContractStart", "Contract Start", "date"),
        leadInputField("clientRenewalDate", "Renewal Date", "date"),
        leadInputField("clientTags", "Tags", "text", { className: "wide", placeholder: "Separate tags with commas" }),
        leadTextareaField("clientUnitNotes", "Unit Notes", "wide"),
        leadTextareaField("clientNotes", "Notes", "wide")
      ])}
      <div class="lead-form-actions">
        ${isAdd ? "" : `<button id="clientDeleteBtn" class="secondary-action danger-action client-delete-action" type="button" data-client-delete-current>${icon("trash")}<span>Delete Client</span></button>`}
        <button id="clientCancelBtn" class="secondary-action" type="button" ${isAdd ? "data-client-modal-close" : "data-client-cancel"}>${icon("x")}<span>Cancel</span></button>
        <button id="clientSaveBtn" class="primary-action" type="submit">${icon("check")}<span>${isAdd ? "Add Client" : "Save Client"}</span></button>
      </div>
    </form>
  `;
}

function initClientDirectory() {
  const root = document.querySelector("[data-client-directory-page]");
  if (!root) return;

  root.addEventListener("click", handleClientClick);
  root.addEventListener("change", handleClientChange);
  root.addEventListener("input", handleClientInput);
  root.addEventListener("submit", saveClientForm);
  root.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeClientAddModal();
  });
  root.querySelector("#clientSearchInput")?.addEventListener("input", (event) => {
    clientState.search = event.target.value || "";
    renderClientData();
  });
  root.querySelector("#clientStatusFilter")?.addEventListener("change", (event) => {
    clientState.statusFilter = event.target.value || "all";
    renderClientData();
  });
  root.querySelector("#clientTypeFilter")?.addEventListener("change", (event) => {
    clientState.typeFilter = event.target.value || "all";
    renderClientData();
  });
  root.querySelector("#clientManagerFilter")?.addEventListener("change", (event) => {
    clientState.managerFilter = event.target.value || "all";
    renderClientData();
  });

  const topbarAdd = Array.from(document.querySelectorAll(".suite-topbar .primary-action"))
    .find((link) => link.textContent?.trim() === "Add Client");
  topbarAdd?.addEventListener("click", (event) => {
    event.preventDefault();
    void openClientAddModal();
  });

  clientState.selectedId = null;
  void loadClients();
}

function handleClientClick(event) {
  const managerToggle = event.target.closest("[data-client-manager-toggle]");
  if (managerToggle) {
    const dropdown = managerToggle.closest("[data-client-manager-dropdown]");
    const menu = dropdown?.querySelector("[data-client-manager-menu]");
    if (menu) {
      const isOpening = menu.hidden;
      closeClientManagerDropdowns();
      menu.hidden = !isOpening;
      managerToggle.setAttribute("aria-expanded", isOpening ? "true" : "false");
    }
    return;
  }

  if (!event.target.closest("[data-client-manager-dropdown]")) {
    closeClientManagerDropdowns();
  }

  const closeModal = event.target.closest("[data-client-modal-close]");
  if (closeModal) {
    closeClientAddModal();
    return;
  }

  const cancelEdit = event.target.closest("[data-client-cancel]");
  if (cancelEdit) {
    void closeClientEditAfterAutosave();
    return;
  }

  const deleteButton = event.target.closest("[data-client-delete-current]");
  if (deleteButton) {
    void deleteSelectedClient();
    return;
  }

  const addButton = event.target.closest("#clientAddBtn, #clientEmptyAddBtn");
  if (addButton) {
    void openClientAddModal();
    return;
  }

  const filterToggle = event.target.closest("[data-client-filter-toggle]");
  if (filterToggle) {
    const panel = document.getElementById("clientFilterPanel");
    if (panel) panel.hidden = !panel.hidden;
    return;
  }

  const clearFilters = event.target.closest("[data-client-clear-filters]");
  if (clearFilters) {
    clientState.search = "";
    clientState.statusFilter = "all";
    clientState.typeFilter = "all";
    clientState.managerFilter = "all";
    renderClientFilterControls();
    renderClientData();
    return;
  }

  const select = event.target.closest("[data-client-select]");
  if (select) {
    void selectClient(select.dataset.clientSelect);
  }
}

function handleClientChange(event) {
  if (event.target.closest("[data-client-manager-option]")) {
    updateClientManagerDropdownLabel(event.target.closest("#clientForm"));
  }
  if (event.target.matches("#clientServiceModel, #clientStatus")) {
    updateClientRevenueFieldVisibility(event.target.closest("#clientForm"), { clearHidden: true });
  }
  if (event.target.closest("[data-client-turnover-month]")) {
    updateClientMonthlyTurnoversTotal(event.target.closest("#clientForm"));
  }
  scheduleClientAutosave(event.target.closest("#clientForm"));
}

function handleClientInput(event) {
  if (event.target.closest("[data-client-turnover-month]")) {
    updateClientMonthlyTurnoversTotal(event.target.closest("#clientForm"));
  }
  scheduleClientAutosave(event.target.closest("#clientForm"));
}

async function loadClients() {
  if (!suiteSupabase) {
    showClientMessage("Supabase config is missing. Add env.js values before using clients.", true);
    return;
  }

  showClientMessage("Loading clients...");
  const { data: userData } = await suiteSupabase.auth.getUser();
  clientState.user = userData?.user || null;
  if (clientState.user) {
    const { data: profile } = await suiteSupabase
      .from("profiles")
      .select("role,full_name,email")
      .eq("id", clientState.user.id)
      .maybeSingle();
    clientState.profile = profile ? { ...profile, id: clientState.user.id } : null;
  }

  await loadClientManagerAccounts();

  const { data, error } = await suiteSupabase
    .from(clientTable)
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(500);

  if (error) {
    showClientMessage("Unable to load clients: " + error.message, true);
    renderClientData();
    return;
  }

  clientState.rows = data || [];
  if (clientState.selectedId && !clientState.rows.some((row) => row.id === clientState.selectedId)) {
    clientState.selectedId = null;
  }
  populateClientManagerFilter();
  renderClientData();
  showClientMessage(clientState.rows.length ? `${clientState.rows.length} client${clientState.rows.length === 1 ? "" : "s"} synced from Supabase.` : "Synced with Supabase. No clients yet.");
}

async function loadClientManagerAccounts() {
  const fallback = clientDefaultManagerOption();
  clientState.managers = fallback ? [fallback] : [];

  const { data, error } = await suiteSupabase
    .from("profiles")
    .select("id,full_name,email,role,status")
    .limit(500);

  if (error) {
    console.warn("[admin-suite] Unable to load client manager accounts", error);
    return;
  }

  const propertyManagers = (data || [])
    .filter(isClientManagerProfile)
    .map(normalizeClientManagerOption)
    .filter((manager) => manager.name);

  clientState.managers = mergeClientManagerOptions([fallback, ...propertyManagers].filter(Boolean));
}

function renderClientData() {
  renderClientFilterControls();
  renderClientMetrics();
  renderClientTable();
  renderClientInsights();
}

function renderClientFilterControls() {
  const search = document.getElementById("clientSearchInput");
  if (search && search.value !== clientState.search) search.value = clientState.search;
  const status = document.getElementById("clientStatusFilter");
  if (status && status.value !== clientState.statusFilter) status.value = clientState.statusFilter;
  const type = document.getElementById("clientTypeFilter");
  if (type && type.value !== clientState.typeFilter) type.value = clientState.typeFilter;
  const manager = document.getElementById("clientManagerFilter");
  if (manager && manager.value !== clientState.managerFilter) manager.value = clientState.managerFilter;
}

function populateClientManagerFilter() {
  const filter = document.getElementById("clientManagerFilter");
  if (!filter) return;
  const registeredManagers = getClientManagerOptions();
  const registeredNames = new Set(registeredManagers.map((manager) => clientManagerNameKey(manager.name)));
  const legacyManagers = Array.from(new Set(clientState.rows.flatMap(clientManagerNames)))
    .filter((name) => name && !registeredNames.has(clientManagerNameKey(name)))
    .map((name) => ({ id: "", name, email: "", role: "legacy" }));
  const managers = mergeClientManagerOptions([...registeredManagers, ...legacyManagers]);
  filter.innerHTML = `<option value="all">All Managers</option><option value="unassigned">Unassigned</option>${managers.map((manager) => `<option value="${esc(clientManagerOptionKey(manager))}">${esc(manager.name)}</option>`).join("")}`;
  const validValues = new Set(["all", "unassigned", ...managers.map(clientManagerOptionKey)]);
  if (!validValues.has(clientState.managerFilter)) clientState.managerFilter = "all";
  filter.value = clientState.managerFilter;
}

function isClientManagerProfile(profile) {
  const role = normalizeToken(profile?.role);
  return role === "property-manager" || role === "propertymanager" || role === "property-management";
}

function normalizeClientManagerOption(profile) {
  const email = profile?.email || "";
  const name = profile?.full_name || email.split("@")[0] || "Property Manager";
  return {
    id: profile?.id || "",
    name,
    email,
    role: profile?.role || "property-manager",
    isDefault: Boolean(profile?.id && profile.id === clientState.user?.id)
  };
}

function clientDefaultManagerOption() {
  const name = clientDisplayName() || "Turnly Admin";
  const email = clientState.profile?.email || clientState.user?.email || "";
  return {
    id: clientState.user?.id || "",
    name,
    email,
    role: clientState.profile?.role || "admin",
    isDefault: true
  };
}

function mergeClientManagerOptions(options) {
  const seen = new Set();
  const seenNames = new Set();
  return options
    .filter((option) => option?.name)
    .filter((option) => {
      const key = clientManagerOptionKey(option);
      const nameKey = clientManagerNameKey(option.name);
      if (seen.has(key) || seenNames.has(nameKey)) return false;
      seen.add(key);
      seenNames.add(nameKey);
      return true;
    })
    .sort((a, b) => Number(Boolean(b.isDefault)) - Number(Boolean(a.isDefault)) || a.name.localeCompare(b.name));
}

function getClientManagerOptions(row = null) {
  const base = clientState.managers.length ? clientState.managers : [clientDefaultManagerOption()];
  const rowManagers = clientManagerNames(row).map((name) => ({ id: "", name, email: "", role: "legacy" }));
  return mergeClientManagerOptions([...base, ...rowManagers]);
}

function clientManagerOptionKey(option) {
  return option?.id ? `id:${option.id}` : clientManagerNameKey(option?.name);
}

function clientManagerNameKey(name) {
  return `name:${String(name || "").trim().toLowerCase()}`;
}

function clientSelectedManagerKeys(row = null) {
  const ids = clientManagerIds(row);
  const names = clientManagerNames(row);
  if (!row || (!ids.length && !names.length)) {
    const fallback = clientDefaultManagerOption();
    return new Set(fallback?.name ? [clientManagerOptionKey(fallback)] : []);
  }
  return new Set([...ids.map((id) => `id:${id}`), ...names.map(clientManagerNameKey)]);
}

function renderClientMetrics() {
  const rows = clientState.rows;
  const units = rows.filter((row) => isClientTurnoverService(row.service_model)).reduce((sum, row) => sum + clientUnitCount(row), 0);
  const activeMrr = rows.reduce((sum, row) => sum + clientMonthlyRecurringRevenue(row), 0);
  const prospectIncome = rows.filter((row) => clientStatus(row) === "prospect").reduce((sum, row) => sum + clientProspectIncome(row), 0);
  const projectedTurnovers = rows.filter((row) => isClientTurnoverService(row.service_model)).reduce((sum, row) => sum + clientProjectedTurnovers(row), 0);
  const turnoverRevenue = rows.reduce((sum, row) => sum + clientTurnoverRevenue(row), 0);
  const totalMonthlyRevenue = activeMrr + turnoverRevenue;
  const totalAnnualRevenue = totalMonthlyRevenue * 12;
  const setText = (id, value) => {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
  };
  setText("clientTotalCount", rows.length);
  setText("clientActiveCount", rows.filter((row) => clientStatus(row) === "active").length);
  setText("clientProspectCount", rows.filter((row) => clientStatus(row) === "prospect").length);
  setText("clientRenewalCount", rows.filter((row) => isWithinNextDays(row.renewal_date, 60)).length);
  setText("clientUnitTotal", units.toLocaleString());
  setText("clientActiveMrrTotal", clientMoney(activeMrr));
  setText("clientProspectIncomeTotal", clientMoney(prospectIncome));
  setText("clientProjectedTurnovers", projectedTurnovers.toLocaleString());
  setText("clientTurnoverRevenueTotal", clientMoney(turnoverRevenue));
  setText("clientTotalMonthlyRevenue", clientMoney(totalMonthlyRevenue));
  setText("clientAnnualRevenueTotal", clientMoney(totalAnnualRevenue));
}

function renderClientTable() {
  const body = document.getElementById("clientTableBody");
  const empty = document.getElementById("clientEmptyState");
  const count = document.getElementById("clientTableCount");
  if (!body) return;
  const rows = getFilteredClients();
  body.innerHTML = rows.length ? rows.map(renderClientRow).join("") : "";
  const selectedRow = rows.find((row) => row.id === clientState.selectedId);
  if (selectedRow) fillClientForm(selectedRow);
  if (empty) empty.hidden = rows.length > 0;
  if (count) count.textContent = `Showing ${rows.length} of ${clientState.rows.length} clients`;
}

function renderClientRow(row) {
  const id = esc(row.id);
  const isOpen = row.id === clientState.selectedId;
  return `
    <tr class="${isOpen ? "active-row" : ""}" data-client-select="${id}">
      <td><strong>${esc(clientTitle(row))}</strong><small>${esc(clientRegionText(row))}</small></td>
      <td>${esc(row.company_name || "-")}</td>
      <td><strong>${esc(row.primary_contact_name || "-")}</strong><small>${esc(row.primary_contact_email || row.primary_contact_phone || "")}</small></td>
      <td><strong>${esc(clientManagersText(row))}</strong><small>${esc(clientManagerCountText(row))}</small></td>
      <td><span class="status-badge ${statusClassName(clientStatus(row))}">${esc(clientStatusLabel(row.status))}</span></td>
      <td>${esc(formatDateOnly(row.renewal_date, "-"))}</td>
      <td>${esc(row.property_count ?? 0)}</td>
      <td class="client-units-cell"><strong>${esc(clientServiceModelLabel(row.service_model))}</strong><small>${esc(clientUnitText(row))}</small></td>
      <td><strong>${esc(clientMoney(clientPrimaryMonthlyRevenue(row)))}</strong><small>${esc(clientRevenueMeta(row))}</small></td>
      <td><button class="table-action-button" type="button" data-client-select="${id}">${isOpen ? icon("chevron-down") : ""}<span>${isOpen ? "Close" : "Edit"}</span></button></td>
    </tr>
    ${isOpen ? `
      <tr class="client-edit-row">
        <td colspan="10">
          <div class="client-inline-edit">
            <div class="client-inline-edit-head">
              <div>
                <span>Client Details</span>
                <strong>${esc(clientTitle(row))}</strong>
              </div>
            </div>
            ${clientForm("edit", row)}
          </div>
        </td>
      </tr>
    ` : ""}
  `;
}

function renderClientInsights() {
  const filtered = getFilteredClients();
  const topRevenue = document.getElementById("clientTopRevenue");
  const statusBreakdown = document.getElementById("clientStatusBreakdown");
  const newClients = document.getElementById("clientNewClients");
  const renewals = document.getElementById("clientUpcomingRenewals");

  if (topRevenue) {
    const rows = [...clientState.rows].sort((a, b) => clientProjectedAnnualRevenue(b) - clientProjectedAnnualRevenue(a)).slice(0, 5);
    topRevenue.innerHTML = rows.length ? rows.map((row) => clientInsightItem(clientTitle(row), clientMoney(clientProjectedAnnualRevenue(row)), "badge-dollar")).join("") : emptyState("badge-dollar", "No revenue yet");
  }
  if (statusBreakdown) {
    statusBreakdown.innerHTML = clientStatusOptions.map(([status, label]) => clientInsightItem(label, String(clientState.rows.filter((row) => clientStatus(row) === status).length), "filter")).join("");
  }
  if (newClients) {
    const rows = clientState.rows.filter((row) => isWithinPastDays(row.created_at, 30)).slice(0, 5);
    newClients.innerHTML = rows.length ? rows.map((row) => clientInsightItem(clientTitle(row), formatDateOnly(row.created_at), "user-plus")).join("") : emptyState("user-plus", "No new clients");
  }
  if (renewals) {
    const rows = filtered.filter((row) => isWithinNextDays(row.renewal_date, 60)).sort((a, b) => dateValue(a.renewal_date) - dateValue(b.renewal_date)).slice(0, 5);
    renewals.innerHTML = rows.length ? rows.map((row) => clientInsightItem(clientTitle(row), formatDateOnly(row.renewal_date), "calendar")).join("") : emptyState("calendar", "No upcoming renewals");
  }
}

function clientInsightItem(label, value, iconName) {
  return `
    <div class="client-insight-item">
      ${icon(iconName)}
      <span><strong>${esc(label)}</strong><small>${esc(value)}</small></span>
    </div>
  `;
}

function getFilteredClients() {
  const term = clientState.search.trim().toLowerCase();
  return clientState.rows.filter((row) => {
    const managerIds = clientManagerIds(row);
    const managerNames = clientManagerNames(row);
    if (clientState.statusFilter !== "all" && clientStatus(row) !== clientState.statusFilter) return false;
    if (clientState.typeFilter !== "all" && row.client_type !== clientState.typeFilter) return false;
    if (clientState.managerFilter === "unassigned" && (managerIds.length || managerNames.length)) return false;
    if (clientState.managerFilter !== "all" && clientState.managerFilter !== "unassigned" && !clientMatchesManagerFilter(row, clientState.managerFilter)) return false;
    if (!term) return true;
    return [
      row.name,
      row.company_name,
      row.primary_contact_name,
      row.primary_contact_email,
      row.primary_contact_phone,
      row.status,
      row.client_type,
      row.region,
      row.market,
      row.property_name,
      row.address,
      row.city,
      row.state,
      row.postal_code,
      row.access_notes,
      clientServiceModelLabel(row.service_model),
      row.unit_count,
      row.unit_notes,
      row.monthly_recurring_revenue,
      row.prospect_projected_revenue,
      row.projected_annual_turnovers,
      JSON.stringify(row.projected_monthly_turnovers || {}),
      row.projected_turnover_revenue,
      ...managerNames,
      ...(Array.isArray(row.tags) ? row.tags : []),
      row.notes
    ].some((value) => String(value || "").toLowerCase().includes(term));
  });
}

async function selectClient(id) {
  const row = clientState.rows.find((item) => item.id === id);
  if (!row) return;
  await flushClientAutosave();
  closeClientAddModal();
  if (clientState.selectedId === id) {
    clientState.selectedId = null;
    clearClientAutosaveState();
    renderClientData();
    return;
  }
  clientState.selectedId = id;
  clearClientAutosaveState();
  renderClientData();
  markClientAutosaveBaseline();
  document.getElementById("clientName")?.focus();
}

async function openClientAddModal() {
  await flushClientAutosave();
  const modal = document.getElementById("clientModal");
  const body = document.getElementById("clientModalBody");
  if (!modal || !body) return;
  clientState.selectedId = null;
  clearClientAutosaveState();
  renderClientData();
  body.innerHTML = clientForm("add");
  clearClientForm({ render: false });
  modal.hidden = false;
  requestAnimationFrame(() => document.getElementById("clientName")?.focus());
}

function closeClientAddModal() {
  const modal = document.getElementById("clientModal");
  const body = document.getElementById("clientModalBody");
  if (modal) modal.hidden = true;
  if (body) body.innerHTML = "";
}

async function closeClientEditAfterAutosave() {
  await flushClientAutosave();
  clientState.selectedId = null;
  clearClientAutosaveState();
  renderClientData();
}

function clearClientForm(options = {}) {
  const { render = true } = options;
  clientState.selectedId = null;
  setClientFormValues({
    id: "",
    name: "",
    company_name: "",
    primary_contact_name: "",
    primary_contact_email: "",
    primary_contact_phone: "",
    status: "active",
    client_type: "",
    region: "",
    property_count: 0,
    property_name: "",
    address: "",
    city: "",
    state: "",
    postal_code: "",
    access_notes: "",
    service_model: "apartment_turnover",
    unit_count: 0,
    unit_notes: "",
    monthly_recurring_revenue: "",
    prospect_projected_revenue: "",
    projected_annual_turnovers: 0,
    projected_monthly_turnovers: emptyClientMonthlyTurnovers(),
    projected_turnover_revenue: "",
    annual_revenue: "",
    contract_start_date: "",
    renewal_date: "",
    account_manager_ids: clientDefaultManagerOption()?.id ? [clientDefaultManagerOption().id] : [],
    account_manager_names: [clientDisplayName()].filter(Boolean),
    tags: [],
    notes: ""
  });
  if (render) renderClientData();
}

function fillClientForm(row) {
  setClientFormValues({
    id: row.id || "",
    name: row.name || "",
    company_name: row.company_name || "",
    primary_contact_name: row.primary_contact_name || "",
    primary_contact_email: row.primary_contact_email || "",
    primary_contact_phone: row.primary_contact_phone || "",
    status: clientStatus(row),
    client_type: row.client_type || "",
    region: row.region || row.market || "",
    property_count: row.property_count ?? 0,
    property_name: row.property_name || "",
    address: row.address || "",
    city: row.city || "",
    state: row.state || "",
    postal_code: row.postal_code || "",
    access_notes: row.access_notes || "",
    service_model: row.service_model || "apartment_turnover",
    unit_count: row.unit_count ?? 0,
    unit_notes: row.unit_notes || "",
    monthly_recurring_revenue: row.monthly_recurring_revenue ?? clientMonthlyRecurringRevenue(row),
    prospect_projected_revenue: row.prospect_projected_revenue ?? clientProspectIncome(row),
    projected_annual_turnovers: row.projected_annual_turnovers ?? clientProjectedTurnovers(row),
    projected_monthly_turnovers: row.projected_monthly_turnovers ?? clientMonthlyTurnovers(row),
    projected_turnover_revenue: row.projected_turnover_revenue ?? clientTurnoverRevenue(row),
    annual_revenue: row.annual_revenue ?? "",
    contract_start_date: row.contract_start_date || "",
    renewal_date: row.renewal_date || "",
    account_manager_ids: clientManagerIds(row),
    account_manager_names: clientManagerNames(row),
    tags: Array.isArray(row.tags) ? row.tags : [],
    notes: row.notes || ""
  });
}

function setClientFormValues(values) {
  const map = {
    clientId: values.id,
    clientName: values.name,
    clientCompany: values.company_name,
    clientPrimaryContact: values.primary_contact_name,
    clientContactEmail: values.primary_contact_email,
    clientContactPhone: values.primary_contact_phone,
    clientStatus: values.status,
    clientType: values.client_type,
    clientRegion: values.region,
    clientProperties: values.property_count,
    clientPropertyName: values.property_name,
    clientAddress: values.address,
    clientCity: values.city,
    clientState: values.state,
    clientPostalCode: values.postal_code,
    clientAccessNotes: values.access_notes,
    clientServiceModel: values.service_model,
    clientUnitCount: values.unit_count,
    clientUnitNotes: values.unit_notes,
    clientMonthlyRecurringRevenue: values.monthly_recurring_revenue,
    clientProspectProjectedRevenue: values.prospect_projected_revenue,
    clientProjectedTurnovers: values.projected_annual_turnovers,
    clientProjectedTurnoverRevenue: values.projected_turnover_revenue,
    clientContractStart: toDateInput(values.contract_start_date),
    clientRenewalDate: toDateInput(values.renewal_date),
    clientTags: Array.isArray(values.tags) ? values.tags.join(", ") : values.tags,
    clientNotes: values.notes
  };
  Object.entries(map).forEach(([id, value]) => {
    const field = document.getElementById(id);
    if (field) field.value = value ?? "";
  });
  setClientManagerSelections(values.account_manager_ids || [], values.account_manager_names || []);
  setClientMonthlyTurnoverInputs(values.projected_monthly_turnovers, values.projected_annual_turnovers);
  updateClientRevenueFieldVisibility(document.getElementById("clientForm"));
}

function clientValue(id) {
  return (document.getElementById(id)?.value || "").trim();
}

function clientServiceModelKey(value) {
  return normalizeToken(value || "apartment_turnover").replace(/-/g, "_");
}

function clientStatusKey(value) {
  return normalizeToken(value || "active").replace(/-/g, "_");
}

function isClientTurnoverService(value) {
  return ["apartment_turnover", "hybrid"].includes(clientServiceModelKey(value));
}

function isClientRecurringService(value) {
  return ["monthly_commercial", "hybrid"].includes(clientServiceModelKey(value));
}

function isClientActiveRevenueStatus(value) {
  return clientStatusKey(value) === "active";
}

function updateClientRevenueFieldVisibility(form = document.getElementById("clientForm"), options = {}) {
  if (!form) return;
  const { clearHidden = false } = options;
  const serviceModel = form.querySelector("#clientServiceModel")?.value || "apartment_turnover";
  const status = form.querySelector("#clientStatus")?.value || "active";
  const isActive = isClientActiveRevenueStatus(status);
  const isProspect = clientStatusKey(status) === "prospect";
  const showUnits = isClientTurnoverService(serviceModel);
  const showMonthlyRecurring = isActive && isClientRecurringService(serviceModel);
  const showProspectIncome = isProspect;
  const showTurnoverRevenue = isActive && isClientTurnoverService(serviceModel);
  const setFieldVisible = (id, isVisible) => {
    const field = form.querySelector(`#${id}`);
    const wrapper = field?.closest(".suite-field");
    if (wrapper) wrapper.hidden = !isVisible;
    if (clearHidden && !isVisible && field) field.value = "";
  };

  setFieldVisible("clientUnitCount", showUnits);
  setFieldVisible("clientUnitNotes", showUnits);
  setFieldVisible("clientMonthlyRecurringRevenue", showMonthlyRecurring);
  setFieldVisible("clientProspectProjectedRevenue", showProspectIncome);
  setFieldVisible("clientProjectedTurnoverRevenue", showTurnoverRevenue);

  const monthlyTurnovers = form.querySelector("[data-client-monthly-turnovers]");
  if (monthlyTurnovers) monthlyTurnovers.hidden = !showUnits;
  if (clearHidden && !showUnits) {
    setClientMonthlyTurnoverInputs(emptyClientMonthlyTurnovers(), 0, form);
  }

  const revenueSection = form.querySelector('[data-client-section="revenue"]');
  if (revenueSection) {
    revenueSection.hidden = !(showMonthlyRecurring || showProspectIncome || showTurnoverRevenue);
  }
}

function emptyClientMonthlyTurnovers() {
  return Object.fromEntries(clientTurnoverMonthOptions.map(([key]) => [key, 0]));
}

function normalizeClientMonthlyTurnovers(value, fallbackAnnual = 0) {
  let source = value || {};
  if (typeof source === "string") {
    try {
      source = JSON.parse(source);
    } catch {
      source = {};
    }
  }
  if (Array.isArray(source)) {
    source = Object.fromEntries(clientTurnoverMonthOptions.map(([key], index) => [key, source[index]]));
  }

  const normalized = emptyClientMonthlyTurnovers();
  clientTurnoverMonthOptions.forEach(([key]) => {
    const count = Number(source?.[key]);
    normalized[key] = Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
  });

  const fallback = Number(fallbackAnnual);
  if (!clientMonthlyTurnoversTotal(normalized) && Number.isFinite(fallback) && fallback > 0) {
    normalized.jan = Math.floor(fallback);
  }
  return normalized;
}

function clientMonthlyTurnoversTotal(turnovers) {
  return Object.values(turnovers || {}).reduce((sum, value) => {
    const count = Number(value);
    return sum + (Number.isFinite(count) && count > 0 ? Math.floor(count) : 0);
  }, 0);
}

function setClientMonthlyTurnoverInputs(value, fallbackAnnual = 0, form = document.getElementById("clientForm")) {
  if (!form) return;
  const turnovers = normalizeClientMonthlyTurnovers(value, fallbackAnnual);
  clientTurnoverMonthOptions.forEach(([key]) => {
    const field = form.querySelector(`[data-client-turnover-month="${key}"]`);
    if (field) field.value = turnovers[key] || "";
  });
  updateClientMonthlyTurnoversTotal(form);
}

function readClientMonthlyTurnovers(form = document.getElementById("clientForm")) {
  const turnovers = emptyClientMonthlyTurnovers();
  form?.querySelectorAll("[data-client-turnover-month]").forEach((field) => {
    const key = field.dataset.clientTurnoverMonth;
    const count = Number(field.value);
    if (key && Object.prototype.hasOwnProperty.call(turnovers, key)) {
      turnovers[key] = Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
    }
  });
  return turnovers;
}

function updateClientMonthlyTurnoversTotal(form = document.getElementById("clientForm")) {
  const total = clientMonthlyTurnoversTotal(readClientMonthlyTurnovers(form));
  const label = form?.querySelector("#clientMonthlyTurnoversTotal");
  if (label) label.textContent = `${total.toLocaleString()} projected this year`;
}

function closeClientManagerDropdowns() {
  document.querySelectorAll("[data-client-manager-menu]").forEach((menu) => {
    menu.hidden = true;
  });
  document.querySelectorAll("[data-client-manager-toggle]").forEach((button) => {
    button.setAttribute("aria-expanded", "false");
  });
}

function setClientManagerSelections(ids = [], names = []) {
  const form = document.getElementById("clientForm");
  if (!form) return;
  const idSet = new Set((ids || []).filter(Boolean));
  const nameSet = new Set((names || []).filter(Boolean).map(clientManagerNameKey));
  let checkedCount = 0;

  form.querySelectorAll("[data-client-manager-option]").forEach((input) => {
    const id = input.dataset.managerId || "";
    const nameKey = clientManagerNameKey(input.dataset.managerName);
    input.checked = (id && idSet.has(id)) || nameSet.has(nameKey);
    if (input.checked) checkedCount += 1;
  });

  if (!checkedCount) {
    const fallback = clientDefaultManagerOption();
    const fallbackKey = clientManagerOptionKey(fallback);
    const fallbackInput = Array.from(form.querySelectorAll("[data-client-manager-option]"))
      .find((input) => (input.dataset.managerId && `id:${input.dataset.managerId}` === fallbackKey) || clientManagerNameKey(input.dataset.managerName) === fallbackKey);
    if (fallbackInput) fallbackInput.checked = true;
  }

  updateClientManagerDropdownLabel(form);
}

function readSelectedClientManagers(form = document.getElementById("clientForm")) {
  const checked = Array.from(form?.querySelectorAll("[data-client-manager-option]:checked") || [])
    .map((input) => ({
      id: input.dataset.managerId || "",
      name: input.dataset.managerName || "",
      email: input.dataset.managerEmail || ""
    }))
    .filter((manager) => manager.name);
  const selected = checked.length ? checked : [clientDefaultManagerOption()].filter(Boolean);
  return mergeClientManagerOptions(selected);
}

function updateClientManagerDropdownLabel(form = document.getElementById("clientForm")) {
  const label = form?.querySelector(".client-manager-toggle-label");
  if (!label) return;
  const managers = readSelectedClientManagers(form);
  label.textContent = managers.length ? managers.map((manager) => manager.name).join(", ") : "Select account managers";
}

function collectClientPayload() {
  const propertyCount = Number(clientValue("clientProperties"));
  const unitCount = Number(clientValue("clientUnitCount"));
  const monthlyRecurringRevenue = Number(clientValue("clientMonthlyRecurringRevenue"));
  const prospectProjectedRevenue = Number(clientValue("clientProspectProjectedRevenue"));
  const projectedTurnoverRevenue = Number(clientValue("clientProjectedTurnoverRevenue"));
  const status = clientValue("clientStatus") || "active";
  const serviceModel = clientValue("clientServiceModel") || "apartment_turnover";
  const isActiveRevenue = isClientActiveRevenueStatus(status);
  const isProspect = clientStatusKey(status) === "prospect";
  const isTurnoverService = isClientTurnoverService(serviceModel);
  const isRecurringService = isClientRecurringService(serviceModel);
  const managers = readSelectedClientManagers();
  const managerIds = managers.map((manager) => manager.id).filter(Boolean);
  const managerNames = managers.map((manager) => manager.name).filter(Boolean);
  const cleanUnitCount = isTurnoverService && Number.isFinite(unitCount) && unitCount >= 0 ? Math.floor(unitCount) : 0;
  const cleanMonthlyTurnovers = isTurnoverService ? readClientMonthlyTurnovers() : emptyClientMonthlyTurnovers();
  const cleanMonthlyRecurringRevenue = isActiveRevenue && isRecurringService && Number.isFinite(monthlyRecurringRevenue) && monthlyRecurringRevenue >= 0 ? monthlyRecurringRevenue : 0;
  const cleanProspectProjectedRevenue = isProspect && Number.isFinite(prospectProjectedRevenue) && prospectProjectedRevenue >= 0 ? prospectProjectedRevenue : 0;
  const cleanProjectedAnnualTurnovers = isTurnoverService ? clientMonthlyTurnoversTotal(cleanMonthlyTurnovers) : 0;
  const cleanProjectedTurnoverRevenue = isActiveRevenue && isTurnoverService && Number.isFinite(projectedTurnoverRevenue) && projectedTurnoverRevenue >= 0 ? projectedTurnoverRevenue : 0;
  const cleanAnnualRevenue = (cleanMonthlyRecurringRevenue + cleanProjectedTurnoverRevenue) * 12;
  const payload = {
    name: clientValue("clientName"),
    company_name: clientValue("clientCompany"),
    primary_contact_name: clientValue("clientPrimaryContact"),
    primary_contact_email: clientValue("clientContactEmail"),
    primary_contact_phone: clientValue("clientContactPhone"),
    status,
    client_type: clientValue("clientType"),
    region: clientValue("clientRegion"),
    market: clientValue("clientRegion"),
    property_count: Number.isFinite(propertyCount) && propertyCount >= 0 ? Math.floor(propertyCount) : 0,
    property_name: clientValue("clientPropertyName"),
    address: clientValue("clientAddress"),
    city: clientValue("clientCity"),
    state: clientValue("clientState"),
    postal_code: clientValue("clientPostalCode"),
    access_notes: clientValue("clientAccessNotes"),
    service_model: serviceModel,
    unit_count: cleanUnitCount,
    unit_notes: clientValue("clientUnitNotes"),
    monthly_recurring_revenue: cleanMonthlyRecurringRevenue,
    prospect_projected_revenue: cleanProspectProjectedRevenue,
    projected_annual_turnovers: cleanProjectedAnnualTurnovers,
    projected_monthly_turnovers: cleanMonthlyTurnovers,
    projected_turnover_revenue: cleanProjectedTurnoverRevenue,
    annual_revenue: cleanAnnualRevenue,
    contract_start_date: clientValue("clientContractStart") || null,
    renewal_date: clientValue("clientRenewalDate") || null,
    account_manager_id: managerIds[0] || null,
    account_manager_name: managerNames.join(", "),
    account_manager_ids: managerIds,
    account_manager_names: managerNames,
    tags: clientValue("clientTags").split(",").map((tag) => tag.trim()).filter(Boolean),
    notes: clientValue("clientNotes")
  };
  if (!clientValue("clientId")) {
    payload.created_by = clientState.user?.id || null;
  }
  return payload;
}

async function saveClientForm(event) {
  event?.preventDefault();
  if (!suiteSupabase || clientState.isSaving) return;
  clearClientAutosaveTimer();
  const formMode = event?.target?.dataset?.clientFormMode || document.getElementById("clientForm")?.dataset?.clientFormMode || "edit";
  clientState.isSaving = true;
  setClientSaving(true);
  showClientMessage("Saving client to Supabase...");

  const id = clientValue("clientId");
  const payload = collectClientPayload();
  const result = await saveClientPayloadWithSchemaFallback(id, payload);

  clientState.isSaving = false;
  setClientSaving(false);

  if (result.error) {
    showClientMessage("Unable to save client: " + result.error.message, true);
    return;
  }

  const saved = result.data;
  closeClientAddModal();
  const index = clientState.rows.findIndex((row) => row.id === saved.id);
  if (index >= 0) {
    clientState.rows[index] = saved;
  } else {
    clientState.rows.unshift(saved);
  }
  clientState.selectedId = saved.id;
  clientState.autoSaveLastSignature = clientPayloadSignature(payload);
  populateClientManagerFilter();
  renderClientData();
  showClientMessage(formMode === "add" ? "Client added to Supabase." : "Client saved to Supabase.");
}

function scheduleClientAutosave(form = document.getElementById("clientForm")) {
  if (!clientShouldAutosave(form)) return;
  clearClientAutosaveTimer();
  showClientMessage("Changes pending...");
  clientState.autoSaveTimer = window.setTimeout(() => {
    clientState.autoSaveTimer = null;
    void autosaveClientForm(form);
  }, 1200);
}

async function flushClientAutosave() {
  const form = document.getElementById("clientForm");
  if (!clientShouldAutosave(form)) {
    clearClientAutosaveTimer();
    return;
  }
  clearClientAutosaveTimer();
  await autosaveClientForm(form, { immediate: true });
}

async function autosaveClientForm(form = document.getElementById("clientForm"), options = {}) {
  if (!clientShouldAutosave(form) || !suiteSupabase || clientState.isDeleting) return;
  if (!form.checkValidity()) {
    showClientMessage("Autosave paused until required fields are filled.", true);
    return;
  }
  if (clientState.isSaving) {
    clientState.autoSaveQueued = true;
    return;
  }

  const id = form.querySelector("#clientId")?.value || "";
  const payload = collectClientPayload();
  const signature = clientPayloadSignature(payload);
  if (signature === clientState.autoSaveLastSignature) return;

  clientState.isSaving = true;
  setClientSaving(true, "Autosaving...");
  showClientMessage("Autosaving client...");
  const result = await saveClientPayloadWithSchemaFallback(id, payload);
  clientState.isSaving = false;
  setClientSaving(false);

  if (result.error) {
    showClientMessage("Unable to autosave client: " + result.error.message, true);
    return;
  }

  const saved = result.data;
  const index = clientState.rows.findIndex((row) => row.id === saved.id);
  if (index >= 0) {
    clientState.rows[index] = saved;
  } else {
    clientState.rows.unshift(saved);
  }
  clientState.selectedId = saved.id;
  clientState.autoSaveLastSignature = signature;
  populateClientManagerFilter();
  renderClientMetrics();
  renderClientInsights();
  showClientMessage(`Client autosaved at ${new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.`);

  if (clientState.autoSaveQueued) {
    clientState.autoSaveQueued = false;
    scheduleClientAutosave(form);
  }
}

function clientShouldAutosave(form = document.getElementById("clientForm")) {
  if (!form || form.id !== "clientForm") return false;
  if (form.dataset.clientFormMode === "add") return false;
  return Boolean(form.querySelector("#clientId")?.value);
}

function clearClientAutosaveTimer() {
  if (clientState.autoSaveTimer) {
    window.clearTimeout(clientState.autoSaveTimer);
    clientState.autoSaveTimer = null;
  }
}

function clearClientAutosaveState() {
  clearClientAutosaveTimer();
  clientState.autoSaveQueued = false;
  clientState.autoSaveLastSignature = "";
}

function clientPayloadSignature(payload) {
  return JSON.stringify(payload || {});
}

function markClientAutosaveBaseline() {
  const form = document.getElementById("clientForm");
  if (!clientShouldAutosave(form)) return;
  clientState.autoSaveLastSignature = clientPayloadSignature(collectClientPayload());
}

async function saveClientPayloadWithSchemaFallback(id, payload) {
  const fallbackPayload = { ...payload };
  const maxAttempts = clientOptionalColumns.length + 2;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const result = id
      ? await suiteSupabase.from(clientTable).update(fallbackPayload).eq("id", id).select("*").maybeSingle()
      : await suiteSupabase.from(clientTable).insert(fallbackPayload).select("*").maybeSingle();

    if (!result.error) return result;

    const missingColumn = missingClientColumnName(result.error);
    if (missingColumn && Object.prototype.hasOwnProperty.call(fallbackPayload, missingColumn)) {
      delete fallbackPayload[missingColumn];
      continue;
    }

    if (isMissingClientOptionalColumn(result.error)) {
      const remainingOptionalColumn = clientOptionalColumns.find((column) => Object.prototype.hasOwnProperty.call(fallbackPayload, column));
      if (remainingOptionalColumn) {
        delete fallbackPayload[remainingOptionalColumn];
        continue;
      }
    }

    return result;
  }

  return {
    data: null,
    error: new Error("Unable to save client because the clients table schema is missing required columns.")
  };
}

async function deleteSelectedClient() {
  const id = clientValue("clientId") || clientState.selectedId;
  if (!suiteSupabase || !id || clientState.isSaving || clientState.isDeleting) return;
  const row = clientState.rows.find((item) => item.id === id);
  const label = clientTitle(row);
  if (!window.confirm(`Delete ${label}? This removes the client from Supabase.`)) return;

  clientState.isDeleting = true;
  showClientMessage("Deleting client from Supabase...");
  const { error } = await suiteSupabase
    .from(clientTable)
    .delete()
    .eq("id", id);

  clientState.isDeleting = false;
  if (error) {
    showClientMessage("Unable to delete client: " + error.message, true);
    return;
  }

  clientState.rows = clientState.rows.filter((item) => item.id !== id);
  clientState.selectedId = null;
  closeClientAddModal();
  populateClientManagerFilter();
  renderClientData();
  showClientMessage(`${label} deleted from Supabase.`);
}

function setClientSaving(isSaving, savingLabel = "Saving...") {
  const button = document.getElementById("clientSaveBtn");
  if (button) {
    const defaultLabel = button.closest("form")?.dataset?.clientFormMode === "add" ? "Add Client" : "Save Client";
    button.disabled = isSaving;
    const labels = button.querySelectorAll("span");
    const label = labels[labels.length - 1];
    if (label) label.textContent = isSaving ? savingLabel : defaultLabel;
  }
}

function showClientMessage(text, isError = false) {
  const message = document.getElementById("clientMessage");
  if (!message) return;
  message.textContent = text || "";
  message.classList.toggle("error", Boolean(isError));
}

function clientManagerIds(row) {
  if (Array.isArray(row?.account_manager_ids)) return row.account_manager_ids.filter(Boolean);
  return row?.account_manager_id ? [row.account_manager_id] : [];
}

function clientManagerNames(row) {
  const names = Array.isArray(row?.account_manager_names) && row.account_manager_names.length
    ? row.account_manager_names.map((name) => String(name || "").trim()).filter(Boolean)
    : String(row?.account_manager_name || "")
      .split(",")
      .map((name) => name.trim())
      .filter(Boolean);
  const seen = new Set();
  return names.filter((name) => {
    const key = clientManagerNameKey(name);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function clientLegacyAnnualRevenue(row) {
  const revenue = Number(row?.annual_revenue);
  return Number.isFinite(revenue) && revenue > 0 ? revenue : 0;
}

function clientMonthlyRecurringRevenue(row) {
  if (!isClientRecurringService(row?.service_model) || !isClientActiveRevenueStatus(clientStatus(row))) return 0;
  const revenue = Number(row?.monthly_recurring_revenue);
  if (Number.isFinite(revenue) && revenue > 0) return revenue;
  return clientLegacyAnnualRevenue(row) / 12;
}

function clientProspectIncome(row) {
  if (clientStatus(row) !== "prospect") return 0;
  const revenue = Number(row?.prospect_projected_revenue);
  if (Number.isFinite(revenue) && revenue > 0) return revenue;
  return clientLegacyAnnualRevenue(row) / 12;
}

function clientMonthlyTurnovers(row) {
  return normalizeClientMonthlyTurnovers(row?.projected_monthly_turnovers, row?.projected_annual_turnovers);
}

function clientProjectedTurnovers(row) {
  if (!isClientTurnoverService(row?.service_model)) return 0;
  const monthlyTotal = clientMonthlyTurnoversTotal(clientMonthlyTurnovers(row));
  if (monthlyTotal > 0) return monthlyTotal;
  const turnovers = Number(row?.projected_annual_turnovers);
  return Number.isFinite(turnovers) && turnovers > 0 ? Math.floor(turnovers) : 0;
}

function clientTurnoverRevenue(row) {
  if (!isClientTurnoverService(row?.service_model) || !isClientActiveRevenueStatus(clientStatus(row))) return 0;
  const revenue = Number(row?.projected_turnover_revenue);
  if (Number.isFinite(revenue) && revenue > 0) return revenue;
  return clientLegacyAnnualRevenue(row) / 12;
}

function clientMonthlyRevenueTotal(row) {
  return clientMonthlyRecurringRevenue(row) + clientTurnoverRevenue(row);
}

function clientPrimaryMonthlyRevenue(row) {
  if (clientStatus(row) === "prospect") return clientProspectIncome(row);
  return clientMonthlyRevenueTotal(row);
}

function clientProjectedAnnualRevenue(row) {
  return clientPrimaryMonthlyRevenue(row) * 12;
}

function clientRevenueMeta(row) {
  const parts = [];
  const monthlyRecurring = clientMonthlyRecurringRevenue(row);
  const turnoverRevenue = clientTurnoverRevenue(row);
  const prospectIncome = clientProspectIncome(row);
  if (monthlyRecurring) parts.push(`${clientMoney(monthlyRecurring)} MRR/mo`);
  if (turnoverRevenue) parts.push(`${clientMoney(turnoverRevenue)} turnover/mo`);
  if (prospectIncome) parts.push(`${clientMoney(prospectIncome)} prospect/mo`);
  return parts.join(" - ") || "No projection";
}

function clientManagersText(row) {
  const names = clientManagerNames(row);
  if (!names.length) return "Unassigned";
  if (names.length <= 2) return names.join(", ");
  return `${names.slice(0, 2).join(", ")} +${names.length - 2}`;
}

function clientManagerCountText(row) {
  const count = clientManagerNames(row).length;
  if (!count) return "No manager assigned";
  return `${count} account manager${count === 1 ? "" : "s"}`;
}

function clientMatchesManagerFilter(row, filterValue) {
  if (filterValue.startsWith("id:")) {
    return clientManagerIds(row).includes(filterValue.slice(3));
  }
  if (filterValue.startsWith("name:")) {
    const key = filterValue.toLowerCase();
    return clientManagerNames(row).some((name) => clientManagerNameKey(name) === key);
  }
  return false;
}

function clientUnitCount(row) {
  const count = Number(row?.unit_count);
  return Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
}

function clientUnitText(row) {
  const count = clientUnitCount(row);
  if (!count) return "No units set";
  return `${count.toLocaleString()} unit${count === 1 ? "" : "s"}`;
}

function clientServiceModelLabel(value) {
  const normalized = normalizeToken(value || "apartment_turnover").replace(/-/g, "_");
  return clientServiceModelOptions.find(([id]) => id === normalized)?.[1] || titleCase(value || "Apartment Turnover");
}

function clientTitle(row) {
  return row?.property_name || row?.name || row?.company_name || "Untitled Client";
}

function clientStatus(row) {
  return normalizeToken(row?.status || "active") || "active";
}

function clientStatusLabel(status) {
  const normalized = normalizeToken(status || "active");
  return clientStatusOptions.find(([id]) => id === normalized)?.[1] || titleCase(normalized);
}

function clientRegionText(row) {
  const address = [row?.address, row?.city, row?.state, row?.postal_code].filter(Boolean).join(", ");
  return address || [row?.client_type, row?.region || row?.market].filter(Boolean).join(" - ") || "No address, type, or market";
}

function clientMoney(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return "$0";
  return number.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function clientDisplayName() {
  return clientState.profile?.full_name || clientState.user?.user_metadata?.full_name || clientState.user?.email?.split("@")[0] || "";
}

function isMissingClientOptionalColumn(error) {
  const message = String(error?.message || "").toLowerCase();
  return clientOptionalColumns.some((column) => message.includes(column.toLowerCase())) || message.includes("schema cache");
}

function missingClientColumnName(error) {
  const message = String(error?.message || "");
  const match = message.match(/['"]([^'"]+)['"]\s+column/i) || message.match(/column\s+['"]?([a-z0-9_]+)['"]?/i);
  const column = match?.[1]?.toLowerCase();
  return clientOptionalColumns.includes(column) ? column : "";
}

function formatDateOnly(value, fallback = "No date") {
  const date = parseDate(value);
  if (!date) return fallback;
  return date.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

function isWithinPastDays(value, days) {
  const date = parseDate(value);
  if (!date) return false;
  const today = startOfToday();
  return date >= addDays(today, -days) && date <= addDays(today, 1);
}

function renderContacts(clientTabs) {
  return `
    ${clientTabs}
    ${panel("Filters", formGrid([
      inputControl("Search Contacts", "Search by name, email, or phone..."),
      selectControl("Client", ["All Clients"]),
      selectControl("Account Manager", ["All Account Managers"]),
      selectControl("Contact Type", ["All Contact Types"]),
      selectControl("Role / Title", ["All Roles"]),
      selectControl("Department", ["All Departments"]),
      selectControl("Status", ["All Statuses"]),
      selectControl("Primary Contact", ["All"]),
      inputControl("Phone", "Search phone number..."),
      inputControl("Email", "Search email..."),
      selectControl("Location", ["All Locations"]),
      selectControl("Tags", ["All Tags"]),
      inputControl("Date Added", "Select date range", "date"),
      inputControl("Last Contacted", "Select date range", "date"),
      selectControl("Notes", ["All"])
    ], "contacts-filter-grid"), { className: "compact-panel", action: { label: "Save View", icon: "document", tone: "secondary" } })}
    ${tableFrame(["", "Contact Name", "Client", "Role / Title", "Email", "Phone", "Contact Type", "Status", "Last Contacted", "Actions"], emptyState("contact", "No contacts found", "No contacts match your current filters. Try adjusting your filters or add a new contact.", actionButton("Add Contact", "plus")), {
      checkbox: true,
      toolbar: toolbar("", `${actionButton("Export", "download", "", "secondary")}${actionButton("Columns", "grid", "", "secondary")}${actionButton("Add Contact", "plus")}`),
      className: "contacts-table",
      itemName: "contacts"
    })}
  `;
}

function renderSalesReport() {
  return reportLayout("sales", [
    ["Total Pipeline Value", "-", "badge-dollar", "green"],
    ["Open Deals", "-", "briefcase", "blue"],
    ["Won Deals (Value)", "-", "target", "green"],
    ["Lost Deals (Value)", "-", "alert", "red"],
    ["Win Rate", "-", "activity", "purple"],
    ["Avg. Deal Size", "-", "line-chart", "yellow"]
  ], [
    panel("Pipeline Value by Stage", chart("funnel")),
    panel("Pipeline Value Over Time", chart("line")),
    panel("Deals by Source", `${chart("donut")}${statLegend([["", "", "slate"], ["", "", "slate"], ["", "", "slate"]])}`),
    panel("Deals by Sales Owner", chart("bar")),
    tableFrame(["", "Deal Name", "Account", "Pipeline", "Stage", "Deal Value", "Close Date", "Sales Owner", "Status", "Last Activity", "Actions"], skeletonRows(4), { className: "span-all", itemName: "deals" })
  ], ["Overview", "Pipeline", "Leads", "Deals", "Forecast", "Activity"]);
}

function renderOperationsReport() {
  return reportLayout("operations", [
    ["Tasks Completed", "-", "check", "green"],
    ["Tasks Created", "-", "plus", "blue"],
    ["On-Time Completion", "-%", "clock", "purple"],
    ["Avg. Response Time", "-", "activity", "orange"],
    ["Backlog", "-", "briefcase", "yellow"],
    ["Escalations", "-", "alert", "red"]
  ], [
    panel("Tasks by Status", chart("donut")),
    panel("Tasks Over Time", axisChart("No data to display", "Data will appear here once available.")),
    panel("Workload by Team", chart("bar")),
    panel("Tasks by Priority", chart("donut")),
    tableFrame(["Alert", "Severity", "Category", "Source", "Date", "Actions"], emptyState("bell", "No alerts", "You're all caught up. No active alerts at the moment."), { className: "span-half", pagination: false }),
    tableFrame(["Activity", "User", "Team", "Date", "Details"], emptyState("list", "No recent activity", "Activity logs will appear here once available."), { className: "span-half", pagination: false })
  ], ["Overview", "Team Performance", "Activity Log", "Utilization", "Service Level", "Capacity Planning"]);
}

function renderContractorPerformanceReport() {
  return reportLayout("contractor-performance", [
    ["Overall Avg. Score", "-", "star", "slate"],
    ["Total Contractors", "-", "users", "blue"],
    ["Top Performers", "-", "trophy", "green"],
    ["At Risk", "-", "alert", "orange"],
    ["Improvement Rate", "-", "trending-up", "purple"],
    ["Completed Jobs", "-", "calendar", "blue"]
  ], [
    panel("Performance Score Over Time", axisChart("No data to display", "Data will appear here once available.")),
    panel("Score Distribution", chart("donut")),
    panel("Performance by Service Type", emptyState("chart", "No data to display", "Data will appear here once available.")),
    panel("Performance by Region", emptyState("bar-chart", "No data to display", "Data will appear here once available.")),
    tableFrame(["", "Contractor", "Region", "Market", "Jobs Completed", "On-Time", "Quality Score", "Customer Score", "Overall Score", "Trend", "Tier", "Actions"], skeletonRows(3), { checkbox: true, className: "span-all", itemName: "contractors" })
  ], ["Overview", "Contractors", "Scorecards", "Metrics", "Leaderboard"]);
}

function renderGrowthReport() {
  return reportLayout("growth", [
    ["Total Revenue", "-", "badge-dollar", "green"],
    ["Revenue Growth", "-", "trending-up", "blue"],
    ["Units Leased", "-", "building", "blue"],
    ["Pipeline Value", "-", "line-chart", "purple"],
    ["New Clients", "-", "user-plus", "blue"],
    ["Retention Rate", "-", "activity", "green"]
  ], [
    panel("Revenue Over Time", chart("line")),
    panel("Revenue by Region", chart("donut")),
    panel("Revenue by Market", chart("bar")),
    panel("Units Leased Over Time", chart("line")),
    panel("Pipeline Value Over Time", chart("line")),
    tableFrame(["Driver", "Impact", "Trend"], skeletonRows(4), { className: "growth-drivers", pagination: false }),
    panel("Growth Insights", emptyState("activity", "No insights available", "Insights and recommendations will appear here as data becomes available."), { className: "span-all" })
  ], ["Overview", "Revenue", "Units & Pipeline", "Market Insights", "Retention", "Forecast"]);
}

function reportLayout(active, metrics, panels, tabLabels) {
  const tabMarkup = tabs(tabLabels.map((label, index) => [index === 0 ? active : `${active}-${index}`, label]), active);
  return `
    ${tabMarkup}
    ${panel("Filters", formGrid([
      inputControl("Date Range", "Select date range", "date"),
      selectControl(active === "growth" ? "Metric Category" : active === "contractor-performance" ? "Contractor" : active === "sales" ? "Pipeline" : "Team", [active === "contractor-performance" ? "Select contractor" : "All"]),
      selectControl(active === "sales" ? "Sales Owner" : active === "operations" ? "Department" : "Service Type", ["All"]),
      selectControl(active === "growth" ? "Region" : active === "contractor-performance" ? "Region" : "Location", ["All"]),
      selectControl(active === "growth" ? "Market" : "Status", ["All"]),
      selectControl(active === "growth" ? "Property Type" : "Tags", ["All"]),
      selectControl("Source", ["All Sources"]),
      selectControl("Team", ["All Teams"])
    ], "report-filter-grid"), { className: "compact-panel", action: { label: "Clear Filters", tone: "secondary" } })}
    <section class="metric-strip six">${metrics.map(([label, value, iconName, tone]) => metric(label, value, "vs previous period", iconName, tone)).join("")}</section>
    <section class="report-grid">${panels.join("")}</section>
  `;
}

function formGrid(fields, className = "") {
  return `<div class="form-grid ${className}">${fields.join("")}</div>`;
}

function textareaControl(label, className = "") {
  return `
    <label class="suite-field ${className}">
      <span>${esc(label)}</span>
      <textarea></textarea>
    </label>
  `;
}

function checkboxControl(label) {
  return `<label class="checkbox-field"><input type="checkbox" /> <span>${esc(label)}</span></label>`;
}

function searchBox(placeholder) {
  return `<label class="inline-search">${icon("search")}<input type="search" placeholder="${esc(placeholder)}" /></label>`;
}

function selectButton(label) {
  return `<button class="select-button" type="button"><span>${esc(label)}</span>${icon("chevron-down")}</button>`;
}

function assignmentForm() {
  return `
    <form id="assignmentForm" class="lead-form assignment-form assignment-modal-form">
      <input id="property_id" type="hidden" />
      ${assignmentFormSection("Assignment Details", [
        `<label class="suite-field wide"><span>Select Property</span><select id="propertySelect" required><option value="">Choose a property...</option></select></label>`,
        leadInputField("title", "Assignment Title", "text", { required: true, placeholder: "Apartment Turnover - Unit 204" }),
        leadInputField("property_name", "Property Name", "text", { required: true }),
        leadInputField("address", "Address", "text", { className: "wide" }),
        leadInputField("service_type", "Service Type"),
        leadInputField("pay_amount", "Pay Amount", "number", { min: "0", step: "0.01" }),
        leadSelectField("assignment_status", "Status", assignmentStatusOptions, { required: true })
      ])}
      ${assignmentFormSection("Timing & Routing", [
        leadSelectField("assignment_frequency", "Block Type", assignmentFrequencyOptions, { required: true }),
        leadSelectField("priority", "Priority", assignmentPriorityOptions, { required: true }),
        assignmentWeekdayPickerField(),
        leadInputField("start_window", "Start Window", "datetime-local", { required: true }),
        leadInputField("end_window", "End Window", "datetime-local", { required: true }),
        `<label class="suite-field" data-assignment-recurrence-field><span>Renew Until</span><input id="recurrence_end_date" type="date" /></label>`,
        `<label class="suite-field"><span>Preferred Response Deadline</span><input id="preferred_until" type="datetime-local" /></label>`,
        `<label class="checkbox-field assignment-toggle wide" data-assignment-recurrence-field><input id="auto_renewal" type="checkbox" /> <span>Auto renew this assignment block</span></label>`,
        `<label class="checkbox-field assignment-toggle wide"><input id="preferred_first" type="checkbox" checked /> <span>Offer to preferred contractors first</span></label>`,
        preferredContractorDropdownField()
      ])}
      ${assignmentFormSection("Work Details", [
        leadTextareaField("scope", "Scope of Work", "wide"),
        leadTextareaField("supplies_notes", "Supplies Notes"),
        leadTextareaField("special_instructions", "Special Instructions")
      ], "assignment-notes-grid")}
      <div id="assignmentChecklistPreview" class="checklist-summary assignment-checklist-preview"></div>
      <p id="assignmentFormMessage" class="status-message"></p>
      <div class="form-actions"><button id="assignmentSaveBtn" type="submit" class="primary-action assignment-save-action">${icon("check")}<span data-assignment-save-label>Post Assignment</span></button></div>
    </form>
  `;
}

function assignmentBulkForm() {
  return `
    <form id="assignmentBulkForm" class="lead-form assignment-form assignment-bulk-form">
      <p id="assignmentBulkSummary" class="assignment-bulk-summary">Select assignments from the board to edit them together.</p>
      ${assignmentFormSection("Bulk Changes", [
        assignmentBulkField("bulk_status_enabled", "Status", leadSelectField("bulk_assignment_status", "Status", assignmentStatusOptions)),
        assignmentBulkField("bulk_priority_enabled", "Priority", leadSelectField("bulk_assignment_priority", "Priority", assignmentPriorityOptions)),
        assignmentBulkField("bulk_pay_enabled", "Contractor Pay", leadInputField("bulk_pay_amount", "Contractor Pay", "number", { min: "0", step: "0.01" })),
        assignmentBulkField("bulk_service_enabled", "Service Type", leadInputField("bulk_service_type", "Service Type")),
        assignmentBulkField("bulk_start_enabled", "Start Window", leadInputField("bulk_start_window", "Start Window", "datetime-local")),
        assignmentBulkField("bulk_end_enabled", "End Window", leadInputField("bulk_end_window", "End Window", "datetime-local")),
        assignmentBulkField("bulk_scope_enabled", "Scope of Work", leadTextareaField("bulk_scope", "Scope of Work")),
        assignmentBulkField("bulk_supplies_enabled", "Supplies Notes", leadTextareaField("bulk_supplies_notes", "Supplies Notes")),
        assignmentBulkField("bulk_special_enabled", "Special Instructions", leadTextareaField("bulk_special_instructions", "Special Instructions"))
      ], "assignment-bulk-grid")}
      <p id="assignmentBulkMessage" class="status-message"></p>
      <div class="form-actions assignment-bulk-actions">
        <button type="button" class="secondary-action" data-assignment-bulk-close>Cancel</button>
        <button id="assignmentBulkSaveBtn" type="submit" class="primary-action">${icon("check")}<span>Apply Changes</span></button>
      </div>
    </form>
  `;
}

function assignmentBulkField(toggleId, label, control) {
  return `
    <div class="assignment-bulk-field">
      <label class="checkbox-field assignment-bulk-toggle"><input id="${esc(toggleId)}" type="checkbox" data-assignment-bulk-toggle /> <span>Update ${esc(label)}</span></label>
      ${control}
    </div>
  `;
}

function assignmentFormSection(title, fields, className = "") {
  return `
    <section class="assignment-form-section">
      <h3>${esc(title)}</h3>
      ${formGrid(fields, `assignment-form-grid ${className}`)}
    </section>
  `;
}

function assignmentWeekdayPickerField() {
  return `
    <fieldset class="suite-field assignment-weekday-field wide" data-assignment-weekday-field hidden>
      <span>Service Days</span>
      <div class="assignment-weekday-options">
        ${assignmentWeekdayOptions.map(([value, label]) => `
          <label class="assignment-weekday-option">
            <input type="checkbox" value="${value}" data-assignment-weekday />
            <span>${esc(label)}</span>
          </label>
        `).join("")}
      </div>
    </fieldset>
  `;
}

function preferredContractorDropdownField() {
  const options = getAssignmentContractorOptions();
  const items = options.length
    ? options.map((option) => {
      const meta = [option.email, option.status ? titleCase(option.status) : ""].filter(Boolean).join(" - ");
      return `
        <label class="client-manager-option assignment-contractor-option">
          <input type="checkbox" data-assignment-contractor-option data-contractor-id="${esc(option.id)}" data-contractor-name="${esc(option.name)}" data-contractor-email="${esc(option.email)}" />
          <span><strong>${esc(option.name)}</strong>${meta ? `<small>${esc(meta)}</small>` : ""}</span>
        </label>
      `;
    }).join("")
    : `<div class="client-manager-empty">Registered contractor accounts will appear here</div>`;
  return `
    <div class="suite-field client-manager-field assignment-contractor-field wide">
      <span>Preferred Contractors</span>
      <div class="client-manager-select" data-assignment-contractor-dropdown>
        <button class="client-manager-toggle" type="button" aria-expanded="false" data-assignment-contractor-toggle>${icon("users")}<span class="client-manager-toggle-label" data-assignment-contractor-label>Select preferred contractors</span>${icon("chevron-down")}</button>
        <div class="client-manager-menu" data-assignment-contractor-menu hidden>
          ${items}
        </div>
      </div>
    </div>
  `;
}

function initAssignments() {
  const root = document.querySelector("[data-assignments-page]");
  if (!root) return;

  window.turnlyGetAssignmentStatusContext = (id) => ({
    row: assignmentState.rows.find((item) => String(item.id || "") === String(id || "")) || {},
    userId: assignmentState.user?.id || ""
  });
  root.addEventListener("click", handleAssignmentClick);
  root.addEventListener("keydown", handleAssignmentKeydown);
  root.addEventListener("change", handleAssignmentChange);
  root.addEventListener("submit", saveAssignmentForm);
  root.querySelector("#assignmentSearchInput")?.addEventListener("input", (event) => {
    assignmentState.search = event.target.value || "";
    assignmentState.currentPage = 1;
    renderAssignmentData();
  });
  root.querySelector("#assignmentStatusFilter")?.addEventListener("change", (event) => {
    assignmentState.statusFilter = event.target.value || "all";
    assignmentState.currentPage = 1;
    renderAssignmentData();
  });
  root.querySelector("#assignmentFrequencyFilter")?.addEventListener("change", (event) => {
    assignmentState.frequencyFilter = event.target.value || "all";
    assignmentState.currentPage = 1;
    renderAssignmentData();
  });
  root.querySelector("#assignmentContractorFilter")?.addEventListener("change", (event) => {
    assignmentState.contractorFilter = event.target.value || "all";
    assignmentState.currentPage = 1;
    renderAssignmentData();
  });

  const topbarAdd = Array.from(document.querySelectorAll(".suite-topbar .primary-action"))
    .find((link) => link.textContent?.trim() === "New Assignment");
  topbarAdd?.addEventListener("click", (event) => {
    event.preventDefault();
    openAssignmentModal();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeAssignmentModal();
      closeAssignmentBulkModal();
    }
  });
  document.addEventListener("turnly:assignments-updated", () => {
    assignmentState.editingId = null;
    updateAssignmentModalMode();
    void loadAssignments();
  });

  clearAssignmentForm({ keepMessage: true });
  void loadAssignments();
}

function openAssignmentModal(row = null) {
  const modal = document.getElementById("assignmentModal");
  if (!modal) return;
  clearAssignmentForm({ keepMessage: true });
  assignmentState.editingId = row?.id || null;
  populateAssignmentPropertySelect();
  populateAssignmentContractorMenu();
  if (row) {
    populateAssignmentFormForEdit(row);
  }
  updateAssignmentModalMode();
  updateAssignmentRecurrenceVisibility();
  updateAssignmentContractorControls();
  modal.hidden = false;
  document.getElementById("title")?.focus();
}

function closeAssignmentModal() {
  const modal = document.getElementById("assignmentModal");
  if (modal) modal.hidden = true;
  assignmentState.editingId = null;
  updateAssignmentModalMode();
  closeAssignmentContractorDropdowns();
}

function openAssignmentBulkModal() {
  const rows = selectedAssignmentRows();
  if (!rows.length) {
    showAssignmentMessage("Select one or more assignments first.", true);
    return;
  }
  const modal = document.getElementById("assignmentBulkModal");
  const form = document.getElementById("assignmentBulkForm");
  if (!modal || !form) return;
  form.reset();
  document.querySelectorAll("[data-assignment-bulk-toggle]").forEach((toggle) => {
    toggle.checked = false;
  });
  updateAssignmentBulkSummary();
  showAssignmentBulkMessage("");
  updateAssignmentBulkFieldState();
  modal.hidden = false;
}

function closeAssignmentBulkModal() {
  const modal = document.getElementById("assignmentBulkModal");
  if (modal) modal.hidden = true;
  showAssignmentBulkMessage("");
}

function updateAssignmentBulkSummary() {
  const summary = document.getElementById("assignmentBulkSummary");
  if (!summary) return;
  const rows = selectedAssignmentRows();
  const names = rows.slice(0, 3).map((row) => row.title || row.property_name || assignmentShortId(row)).filter(Boolean);
  const extra = rows.length > names.length ? ` and ${rows.length - names.length} more` : "";
  summary.textContent = rows.length
    ? `${rows.length} selected: ${names.join(", ")}${extra}`
    : "Select assignments from the board to edit them together.";
}

function updateAssignmentBulkFieldState() {
  document.querySelectorAll(".assignment-bulk-field").forEach((field) => {
    const toggle = field.querySelector("[data-assignment-bulk-toggle]");
    const enabled = Boolean(toggle?.checked);
    field.classList.toggle("is-enabled", enabled);
    field.querySelectorAll("input:not([data-assignment-bulk-toggle]), select, textarea").forEach((control) => {
      control.disabled = !enabled;
    });
  });
}

function updateAssignmentModalMode() {
  const isEditing = Boolean(assignmentState.editingId);
  const title = document.getElementById("assignmentModalTitle");
  const form = document.getElementById("assignmentForm");
  const propertySelect = document.getElementById("propertySelect");
  const button = document.getElementById("assignmentSaveBtn");
  const buttonLabel = assignmentSaveButtonLabel(button);
  if (title) title.textContent = isEditing ? "Edit Assignment" : "New Assignment";
  if (propertySelect) propertySelect.required = !isEditing;
  if (form) {
    if (isEditing) {
      form.dataset.assignmentEditingId = assignmentState.editingId;
    } else {
      delete form.dataset.assignmentEditingId;
    }
  }
  if (buttonLabel) buttonLabel.textContent = isEditing ? "Save Changes" : "Post Assignment";
}

function populateAssignmentFormForEdit(row) {
  const setValue = (id, value) => {
    const field = document.getElementById(id);
    if (field) field.value = value ?? "";
  };
  const metadata = assignmentMetadata(row);
  const frequency = assignmentFrequencyKey(row.recurrence_frequency || row.assignment_type || "one_time");
  const propertyId = row.property_id || "";
  const hasPropertyOption = Boolean(propertyId && assignmentHasPropertyOption(propertyId));
  setValue("property_id", hasPropertyOption ? propertyId : "");
  setValue("propertySelect", hasPropertyOption ? propertyId : "");
  setValue("title", row.title || "");
  setValue("property_name", row.property_name || "");
  setValue("address", row.address || "");
  setValue("service_type", row.service_type || "");
  setValue("pay_amount", row.pay_amount ?? "");
  populateAssignmentStatusSelect(row);
  setValue("assignment_status", assignmentStatusFormValue(row.status));
  setValue("assignment_frequency", frequency || "one_time");
  setValue("priority", row.priority || "normal");
  setAssignmentWeekdays(Array.isArray(metadata.recurrence_weekdays) ? metadata.recurrence_weekdays : []);
  setValue("start_window", toDatetimeInput(row.start_window));
  setValue("end_window", toDatetimeInput(row.end_window));
  setValue("recurrence_end_date", row.recurrence_end_date || "");
  setValue("preferred_until", toDatetimeInput(row.preferred_until));
  setValue("scope", row.scope || "");
  setValue("supplies_notes", row.supplies_notes || "");
  setValue("special_instructions", row.special_instructions || metadata.unit_notes || "");

  const autoRenewal = document.getElementById("auto_renewal");
  if (autoRenewal) autoRenewal.checked = Boolean(row.auto_renewal);
  const preferredFirst = document.getElementById("preferred_first");
  if (preferredFirst) preferredFirst.checked = Boolean(row.preferred_first || assignmentPreferredIds(row).length || row.visibility === "preferred");

  const selectedIds = new Set(assignmentPreferredIds(row));
  const selectedNames = new Set(assignmentPreferredNames(row).map((name) => normalizeToken(name)));
  document.querySelectorAll("[data-assignment-contractor-option]").forEach((input) => {
    input.checked = selectedIds.has(input.dataset.contractorId) || selectedNames.has(normalizeToken(input.dataset.contractorName));
  });
  updateAssignmentContractorDropdownLabel();

  const unitField = document.getElementById("assignmentUnitField");
  const unitLabel = row.unit_number || row.unit_name || metadata.unit_number || metadata.unit_name || "";
  if (unitField && unitLabel) unitField.hidden = false;
  setValue("assignmentUnitSearch", unitLabel);
  setValue("assignmentUnitSelect", row.unit_id || metadata.unit_id || "");
  refreshAssignmentDateTimeControls();
}

function handleAssignmentClick(event) {
  const newAssignment = event.target.closest("[data-assignment-new]");
  if (newAssignment) {
    openAssignmentModal();
    return;
  }

  const closeBulkModal = event.target.closest("[data-assignment-bulk-close]");
  if (closeBulkModal) {
    closeAssignmentBulkModal();
    return;
  }

  const closeModal = event.target.closest("[data-assignment-modal-close]");
  if (closeModal) {
    closeAssignmentModal();
    return;
  }

  const bulkEdit = event.target.closest("[data-assignment-bulk-edit]");
  if (bulkEdit) {
    openAssignmentBulkModal();
    return;
  }

  const bulkDelete = event.target.closest("[data-assignment-bulk-delete]");
  if (bulkDelete) {
    void deleteSelectedAssignments();
    return;
  }

  const contractorToggle = event.target.closest("[data-assignment-contractor-toggle]");
  if (contractorToggle) {
    const dropdown = contractorToggle.closest("[data-assignment-contractor-dropdown]");
    const menu = dropdown?.querySelector("[data-assignment-contractor-menu]");
    if (menu) {
      const isOpening = menu.hidden;
      closeAssignmentContractorDropdowns();
      menu.hidden = !isOpening;
      contractorToggle.setAttribute("aria-expanded", isOpening ? "true" : "false");
    }
    return;
  }

  if (!event.target.closest("[data-assignment-contractor-dropdown]")) {
    closeAssignmentContractorDropdowns();
  }

  const statusTab = event.target.closest("[data-assignment-status-tab]");
  if (statusTab) {
    assignmentState.statusFilter = statusTab.dataset.assignmentStatusTab || "all";
    assignmentState.currentPage = 1;
    clearAssignmentSelection();
    renderAssignmentData();
    return;
  }

  const clearFilters = event.target.closest("[data-assignment-clear-filters]");
  if (clearFilters) {
    assignmentState.search = "";
    assignmentState.statusFilter = "open";
    assignmentState.frequencyFilter = "all";
    assignmentState.contractorFilter = "all";
    assignmentState.currentPage = 1;
    clearAssignmentSelection();
    renderAssignmentData();
    return;
  }

  const pageButton = event.target.closest("[data-assignment-page]");
  if (pageButton) {
    assignmentState.currentPage = Number(pageButton.dataset.assignmentPage) || 1;
    renderAssignmentData();
    return;
  }

  const generate = event.target.closest("#generateRecurringAssignmentsBtn");
  if (generate) {
    void generateDueRecurringAssignments();
    return;
  }

  const action = event.target.closest("[data-assignment-action]");
  if (action) {
    void updateAssignmentStatus(action.dataset.assignmentId, action.dataset.assignmentAction);
    return;
  }

  if (event.target.closest("[data-assignment-status-select], [data-assignment-select], .assignment-select-cell")) {
    return;
  }

  const row = event.target.closest("[data-assignment-row-id]");
  if (row) {
    const assignment = assignmentState.rows.find((item) => String(item.id || "") === row.dataset.assignmentRowId);
    if (assignment) openAssignmentModal(assignment);
  }
}

function handleAssignmentKeydown(event) {
  if (!["Enter", " "].includes(event.key)) return;
  if (event.target.closest("button, a, input, select, textarea")) return;
  const row = event.target.closest("[data-assignment-row-id]");
  if (!row) return;
  event.preventDefault();
  const assignment = assignmentState.rows.find((item) => String(item.id || "") === row.dataset.assignmentRowId);
  if (assignment) openAssignmentModal(assignment);
}

function handleAssignmentChange(event) {
  const rowSelect = event.target.closest("[data-assignment-select]");
  if (rowSelect) {
    const id = String(rowSelect.dataset.assignmentSelect || "");
    if (id && rowSelect.checked) assignmentState.selectedIds.add(id);
    if (id && !rowSelect.checked) assignmentState.selectedIds.delete(id);
    renderAssignmentData();
    return;
  }

  const selectAll = event.target.closest("[data-assignment-select-all]");
  if (selectAll) {
    const visibleIds = getCurrentAssignmentPageRows().map((row) => String(row.id || "")).filter(Boolean);
    visibleIds.forEach((id) => {
      if (selectAll.checked) assignmentState.selectedIds.add(id);
      else assignmentState.selectedIds.delete(id);
    });
    renderAssignmentData();
    return;
  }

  if (event.target.closest("[data-assignment-bulk-toggle]")) {
    updateAssignmentBulkFieldState();
    return;
  }

  const statusSelect = event.target.closest("[data-assignment-status-select]");
  if (statusSelect) {
    void updateAssignmentStatusValue(statusSelect.dataset.assignmentStatusSelect, statusSelect.value);
    return;
  }
  if (event.target.matches("#assignmentPageSizeSelect")) {
    assignmentState.pageSize = Number(event.target.value) || assignmentPageSizeOptions[0];
    assignmentState.currentPage = 1;
    renderAssignmentData();
    return;
  }
  if (event.target.matches("#propertySelect")) {
    fillAssignmentFromProperty(event.target.value);
  }
  if (event.target.matches("#assignment_frequency")) {
    updateAssignmentRecurrenceVisibility();
  }
  if (event.target.closest("[data-assignment-contractor-option]")) {
    updateAssignmentContractorDropdownLabel();
  }
  if (event.target.matches("#preferred_first")) {
    updateAssignmentContractorControls();
  }
}

async function loadAssignments() {
  if (!suiteSupabase) {
    showAssignmentMessage("Supabase config is missing. Add env.js values before using assignments.", true);
    return;
  }

  showAssignmentMessage("Loading assignments...");
  const { data: userData } = await suiteSupabase.auth.getUser();
  assignmentState.user = userData?.user || null;
  if (assignmentState.user) {
    const { data: profile } = await suiteSupabase
      .from("profiles")
      .select("role,full_name,email")
      .eq("id", assignmentState.user.id)
      .maybeSingle();
    assignmentState.profile = profile ? { ...profile, id: assignmentState.user.id } : null;
  }

  const [propertiesResult, contractorsResult, assignmentsResult] = await Promise.all([
    loadAssignmentProperties(),
    loadAssignmentContractors(),
    loadAssignmentRows()
  ]);

  assignmentState.properties = propertiesResult;
  assignmentState.contractors = contractorsResult;
  assignmentState.rows = assignmentsResult.rows;
  renderAssignmentData();
  const boardCount = assignmentState.rows.filter(isAssignmentOpen).length;
  showAssignmentMessage(assignmentsResult.error
    ? "Assignments are ready once the Supabase migration is applied."
    : boardCount
      ? `${boardCount} board assignment${boardCount === 1 ? "" : "s"} synced from Supabase.`
      : "Synced with Supabase. No active assignments yet.");
}

async function loadAssignmentProperties() {
  const { data, error } = await suiteSupabase
    .from(leadTable)
    .select("*")
    .limit(500);
  if (error) {
    console.warn("[admin-suite] Unable to load assignment properties", error);
    return [];
  }
  return (data || [])
    .filter((row) => assignmentPropertyTitle(row))
    .sort((a, b) => assignmentPropertyTitle(a).localeCompare(assignmentPropertyTitle(b)));
}

async function loadAssignmentContractors() {
  const { data, error } = await suiteSupabase
    .from("profiles")
    .select("id,full_name,email,role,status,contractor_approved")
    .limit(500);
  if (error) {
    console.warn("[admin-suite] Unable to load assignment contractors", error);
    return [];
  }
  return (data || [])
    .filter(isAssignmentContractorProfile)
    .map(normalizeAssignmentContractorOption)
    .filter((contractor) => contractor.name)
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function loadAssignmentRows() {
  const { data, error } = await suiteSupabase
    .from(assignmentTable)
    .select("*")
    .order("start_window", { ascending: true })
    .limit(1000);
  if (error) {
    console.warn("[admin-suite] Unable to load assignments", error);
    return { rows: [], error };
  }
  return { rows: data || [], error: null };
}

function renderAssignmentData() {
  pruneAssignmentSelection();
  populateAssignmentPropertySelect();
  populateAssignmentContractorMenu();
  populateAssignmentContractorFilter();
  renderAssignmentFilterControls();
  updateAssignmentRecurrenceVisibility();
  updateAssignmentContractorControls();
  renderAssignmentMetrics();
  renderAssignmentTable();
}

function renderAssignmentFilterControls() {
  const search = document.getElementById("assignmentSearchInput");
  if (search && search.value !== assignmentState.search) search.value = assignmentState.search;
  const status = document.getElementById("assignmentStatusFilter");
  if (status && status.value !== assignmentState.statusFilter) status.value = assignmentState.statusFilter;
  const frequency = document.getElementById("assignmentFrequencyFilter");
  if (frequency && frequency.value !== assignmentState.frequencyFilter) frequency.value = assignmentState.frequencyFilter;
  const contractor = document.getElementById("assignmentContractorFilter");
  if (contractor && contractor.value !== assignmentState.contractorFilter) contractor.value = assignmentState.contractorFilter;
  const pageSize = document.getElementById("assignmentPageSizeSelect");
  if (pageSize && Number(pageSize.value) !== assignmentState.pageSize) pageSize.value = String(assignmentState.pageSize);
  document.querySelectorAll("[data-assignment-status-tab]").forEach((button) => {
    button.classList.toggle("active", button.dataset.assignmentStatusTab === assignmentState.statusFilter);
  });
}

function populateAssignmentPropertySelect() {
  const select = document.getElementById("propertySelect");
  if (!select) return;
  const selected = select.value;
  select.innerHTML = `<option value="">Choose a property...</option>${assignmentState.properties.map((row) => `<option value="${esc(row.id)}">${esc(assignmentPropertyTitle(row))}</option>`).join("")}`;
  if (selected && assignmentState.properties.some((row) => row.id === selected)) {
    select.value = selected;
  }
}

function populateAssignmentContractorMenu() {
  const menu = document.querySelector("[data-assignment-contractor-menu]");
  if (!menu) return;
  const selectedIds = new Set(readSelectedAssignmentContractors().map((contractor) => contractor.id).filter(Boolean));
  const options = getAssignmentContractorOptions();
  menu.innerHTML = options.length
    ? options.map((option) => {
      const checked = selectedIds.has(option.id) ? "checked" : "";
      const meta = [option.email, option.status ? titleCase(option.status) : ""].filter(Boolean).join(" - ");
      return `
        <label class="client-manager-option assignment-contractor-option">
          <input type="checkbox" data-assignment-contractor-option data-contractor-id="${esc(option.id)}" data-contractor-name="${esc(option.name)}" data-contractor-email="${esc(option.email)}" ${checked} />
          <span><strong>${esc(option.name)}</strong>${meta ? `<small>${esc(meta)}</small>` : ""}</span>
        </label>
      `;
    }).join("")
    : `<div class="client-manager-empty">Registered contractor accounts will appear here</div>`;
  updateAssignmentContractorDropdownLabel();
}

function populateAssignmentContractorFilter() {
  const filter = document.getElementById("assignmentContractorFilter");
  if (!filter) return;
  const selected = assignmentState.contractorFilter;
  filter.innerHTML = `<option value="all">All Contractors</option><option value="unassigned">Unassigned</option>${getAssignmentContractorOptions().map((contractor) => `<option value="${esc(contractor.id)}">${esc(contractor.name)}</option>`).join("")}`;
  const valid = new Set(["all", "unassigned", ...getAssignmentContractorOptions().map((contractor) => contractor.id)]);
  if (!valid.has(selected)) assignmentState.contractorFilter = "all";
  filter.value = assignmentState.contractorFilter;
}

function renderAssignmentMetrics() {
  const rows = assignmentState.rows;
  const setText = (id, value) => {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
  };
  setText("assignmentTotalCount", rows.filter(isAssignmentOpen).length.toLocaleString());
  setText("assignmentTodayCount", rows.filter((row) => isToday(row.start_window)).length.toLocaleString());
  setText("assignmentProgressCount", rows.filter((row) => assignmentStatusKey(row.status) === "in-progress").length.toLocaleString());
  setText("assignmentCompletedCount", rows.filter((row) => assignmentStatusKey(row.status) === "completed" && isWithinPastDays(row.completed_at || row.updated_at || row.end_window, 7)).length.toLocaleString());
  setText("assignmentOverdueCount", rows.filter(isAssignmentOverdue).length.toLocaleString());
}

function renderAssignmentTable() {
  const body = document.getElementById("adminAssignments");
  if (!body) return;
  const rows = getFilteredAssignments();
  const pagination = getAssignmentPagination(rows);
  renderAssignmentBulkControls(pagination.rows);
  const controls = document.getElementById("assignmentPaginationControls");
  if (controls) controls.innerHTML = renderAssignmentPaginationControls(rows.length, pagination);
  const count = document.getElementById("assignmentListCount");
  if (count) {
    const label = assignmentState.statusFilter === "open" ? "board assignments" : "assignments";
    count.textContent = rows.length
      ? `Showing ${(pagination.startIndex + 1).toLocaleString()}-${pagination.endIndex.toLocaleString()} of ${rows.length.toLocaleString()} ${label}`
      : `Showing 0 ${label}`;
  }
  body.innerHTML = pagination.rows.length
    ? pagination.rows.map(renderAssignmentRow).join("")
    : emptyState("calendar", assignmentState.statusFilter === "open" ? "No active assignments" : "No assignments found", "Assignments from Supabase will appear here.", assignmentNewButton("New Assignment", "assignmentEmptyNewBtn"));
}

function getCurrentAssignmentPageRows() {
  const rows = getFilteredAssignments();
  return getAssignmentPagination(rows).rows;
}

function clearAssignmentSelection() {
  assignmentState.selectedIds.clear();
}

function pruneAssignmentSelection() {
  const ids = new Set(assignmentState.rows.map((row) => String(row.id || "")).filter(Boolean));
  Array.from(assignmentState.selectedIds).forEach((id) => {
    if (!ids.has(String(id))) assignmentState.selectedIds.delete(id);
  });
}

function selectedAssignmentRows() {
  return assignmentState.rows.filter((row) => assignmentState.selectedIds.has(String(row.id || "")));
}

function renderAssignmentBulkControls(pageRows = []) {
  const target = document.getElementById("assignmentBulkControls");
  if (!target) return;
  const visibleIds = pageRows.map((row) => String(row.id || "")).filter(Boolean);
  const selectedRows = selectedAssignmentRows();
  const selectedVisibleCount = visibleIds.filter((id) => assignmentState.selectedIds.has(id)).length;
  const allVisibleSelected = Boolean(visibleIds.length && selectedVisibleCount === visibleIds.length);
  target.innerHTML = `
    <div class="assignment-bulk-bar">
      <label class="assignment-bulk-select">
        <input type="checkbox" data-assignment-select-all ${allVisibleSelected ? "checked" : ""} ${visibleIds.length ? "" : "disabled"} />
        <span>Select all on page</span>
      </label>
      <div class="assignment-bulk-status">
        <strong>${selectedRows.length.toLocaleString()}</strong>
        <span>selected</span>
      </div>
      <div class="assignment-bulk-button-row">
        <button class="secondary-action" type="button" data-assignment-bulk-edit ${selectedRows.length && !assignmentState.isBulkSaving ? "" : "disabled"}>${icon("settings")}<span>Bulk Edit</span></button>
        <button class="secondary-action danger-action" type="button" data-assignment-bulk-delete ${selectedRows.length && !assignmentState.isBulkSaving ? "" : "disabled"}>${icon("trash")}<span>Bulk Delete</span></button>
      </div>
    </div>
  `;
  const selectAll = target.querySelector("[data-assignment-select-all]");
  if (selectAll) selectAll.indeterminate = selectedVisibleCount > 0 && selectedVisibleCount < visibleIds.length;
  updateAssignmentBulkSummary();
}

function getAssignmentPagination(rows) {
  const pageSize = assignmentPageSizeOptions.includes(Number(assignmentState.pageSize))
    ? Number(assignmentState.pageSize)
    : assignmentPageSizeOptions[0];
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const currentPage = Math.min(Math.max(1, Number(assignmentState.currentPage) || 1), totalPages);
  const startIndex = rows.length ? (currentPage - 1) * pageSize : 0;
  const endIndex = Math.min(startIndex + pageSize, rows.length);
  assignmentState.pageSize = pageSize;
  assignmentState.currentPage = currentPage;
  return {
    pageSize,
    totalPages,
    currentPage,
    startIndex,
    endIndex,
    rows: rows.slice(startIndex, endIndex)
  };
}

function renderAssignmentPaginationControls(totalRows, pagination) {
  const firstVisible = totalRows ? pagination.startIndex + 1 : 0;
  const lastVisible = totalRows ? pagination.endIndex : 0;
  const previousPage = Math.max(1, pagination.currentPage - 1);
  const nextPage = Math.min(pagination.totalPages, pagination.currentPage + 1);
  return `
    <div class="assignment-page-size">
      <label for="assignmentPageSizeSelect">Show</label>
      <select id="assignmentPageSizeSelect" aria-label="Assignments per page">
        ${assignmentPageSizeOptions.map((size) => `<option value="${size}" ${size === pagination.pageSize ? "selected" : ""}>${size}</option>`).join("")}
      </select>
      <span>per page</span>
    </div>
    <span class="assignment-page-status">${firstVisible.toLocaleString()}-${lastVisible.toLocaleString()} of ${totalRows.toLocaleString()}</span>
    <div class="assignment-page-actions">
      <button class="secondary-action icon-only" type="button" data-assignment-page="${previousPage}" ${pagination.currentPage <= 1 ? "disabled" : ""} aria-label="Previous assignment page">${icon("chevron-right", "flip")}</button>
      <span>Page ${pagination.currentPage.toLocaleString()} of ${pagination.totalPages.toLocaleString()}</span>
      <button class="secondary-action icon-only" type="button" data-assignment-page="${nextPage}" ${pagination.currentPage >= pagination.totalPages ? "disabled" : ""} aria-label="Next assignment page">${icon("chevron-right")}</button>
    </div>
  `;
}

function renderAssignmentRow(row) {
  const id = esc(row.id || "");
  const status = assignmentStatusKey(row.status);
  const overdue = isAssignmentOverdue(row);
  const selected = assignmentState.selectedIds.has(String(row.id || ""));
  const detailItems = [
    ["Property Name", row.property_name || "No property", row.address || "No address", "building"],
    ["Unit Number", assignmentUnitNumber(row), assignmentUnitMeta(row), "home"],
    ["Schedule", formatDateWindow(row.start_window, row.end_window), assignmentFrequencyLabel(row), "calendar"],
    ["Contractor Routing", assignmentContractorText(row), assignmentRoutingMeta(row), "users"],
    ["Contractor Pay", assignmentMoney(row.pay_amount), row.service_type || "No service type", "badge-dollar"],
    ["Special Notes", assignmentSpecialNotes(row), assignmentSpecialNotesMeta(row), "document"]
  ];
  return `
    <article class="assignment-list-item ${overdue ? "is-overdue" : ""}" data-assignment-row-id="${id}" role="button" tabindex="0" aria-label="Edit ${esc(row.title || row.property_name || "assignment")}">
      <label class="assignment-select-cell" aria-label="Select ${esc(row.title || row.property_name || "assignment")}">
        <input type="checkbox" data-assignment-select="${id}" ${selected ? "checked" : ""} />
      </label>
      <header class="assignment-list-item-header">
        <div class="assignment-title-block">
          <span class="assignment-short-id">${esc(assignmentShortId(row))}</span>
          <h3>${esc(row.title || "Untitled Assignment")}</h3>
          <div class="assignment-badge-row">
            ${statusBadge(overdue ? "overdue" : row.status || "open")}
            <span class="status-badge ${statusClassName(row.priority || "normal")}">${esc(titleCase(row.priority || "Normal"))}</span>
            ${row.auto_renewal ? `<span class="status-badge status-open">Auto Renewal</span>` : ""}
          </div>
        </div>
        <div class="assignment-row-actions">${assignmentRowActions(row, status, id)}</div>
      </header>
      <div class="assignment-detail-grid">
        ${detailItems.map(([label, value, meta, iconName]) => `
          <div class="assignment-detail-cell">
            <span>${icon(iconName)}${esc(label)}</span>
            <strong>${esc(value)}</strong>
            <small>${esc(meta)}</small>
          </div>
        `).join("")}
      </div>
      ${assignmentNotesPreview(row)}
    </article>
  `;
}

function assignmentNotesPreview(row) {
  const notes = [
    ["Scope", row.scope],
    ["Supplies", row.supplies_notes],
    ["Instructions", row.special_instructions]
  ].filter(([, value]) => value);
  if (!notes.length) return "";
  return `
    <div class="assignment-notes-preview">
      ${notes.map(([label, value]) => `<p><span>${esc(label)}</span>${esc(value)}</p>`).join("")}
    </div>
  `;
}

function assignmentRowActions(row, status, id) {
  const actions = [];
  if (status === "preferred-pending") {
    actions.push(["open", "Release"]);
  }
  if (["open", "preferred-pending", "claimed", "in-progress", "draft"].includes(status)) {
    actions.push(["cancel", "Cancel"]);
  }
  if (status === "claimed") {
    actions.push(["start", "Start"]);
  }
  if (status === "in-progress") {
    actions.push(["complete", "Complete"]);
  }
  if (["cancelled", "declined"].includes(status)) {
    actions.push(["reopen", "Reopen"]);
  }
  const actionButtons = actions.length
    ? actions.map(([action, label]) => `<button class="table-action-button" type="button" data-assignment-id="${id}" data-assignment-action="${esc(action)}">${esc(label)}</button>`).join("")
    : `<span class="assignment-action-muted">Done</span>`;
  return `${assignmentStatusInlineSelect(row, id)}${actionButtons}`;
}

function assignmentStatusInlineSelect(row, id) {
  const current = assignmentStatusFormValue(row?.status);
  return `
    <select class="assignment-status-inline status-${esc(assignmentStatusKey(current))}" data-assignment-status-select="${id}" aria-label="Change assignment status">
      ${assignmentStatusOptionsForRow(row).map(([value, label]) => `<option value="${esc(value)}" ${value === current ? "selected" : ""}>${esc(label)}</option>`).join("")}
    </select>
  `;
}

function getFilteredAssignments() {
  const term = assignmentState.search.trim().toLowerCase();
  const statusFilter = normalizeToken(assignmentState.statusFilter);
  const frequencyFilter = assignmentFrequencyKey(assignmentState.frequencyFilter);
  const rows = assignmentState.rows.filter((row) => {
    if (statusFilter && statusFilter !== "all") {
      if (statusFilter === "open") {
        if (!isAssignmentOpen(row)) return false;
      } else if (statusFilter === "upcoming") {
        if (!isAssignmentUpcoming(row)) return false;
      } else if (statusFilter === "overdue") {
        if (!isAssignmentOverdue(row)) return false;
      } else if (assignmentStatusKey(row.status) !== statusFilter) {
        return false;
      }
    }
    if (frequencyFilter !== "all" && assignmentFrequencyKey(row.recurrence_frequency || row.assignment_type) !== frequencyFilter) return false;
    if (assignmentState.contractorFilter === "unassigned" && assignmentHasContractor(row)) return false;
    if (assignmentState.contractorFilter !== "all" && assignmentState.contractorFilter !== "unassigned" && !assignmentMatchesContractor(row, assignmentState.contractorFilter)) return false;
    if (!term) return true;
    return [
      row.title,
      row.property_name,
      row.address,
      row.service_type,
      row.status,
      row.priority,
      assignmentUnitNumber(row),
      assignmentSpecialNotes(row),
      assignmentContractorText(row),
      assignmentFrequencyLabel(row)
    ].some((value) => String(value || "").toLowerCase().includes(term));
  });
  return sortAssignmentsByDate(rows);
}

function sortAssignmentsByDate(rows) {
  return [...rows].sort((a, b) => {
    const startDiff = dateValue(a?.start_window) - dateValue(b?.start_window);
    if (startDiff) return startDiff;
    const endDiff = dateValue(a?.end_window) - dateValue(b?.end_window);
    if (endDiff) return endDiff;
    return String(a?.property_name || a?.title || "").localeCompare(String(b?.property_name || b?.title || ""), undefined, { sensitivity: "base" });
  });
}

function clearAssignmentForm(options = {}) {
  const form = document.getElementById("assignmentForm");
  if (!form) return;
  form.reset();
  populateAssignmentStatusSelect();
  document.getElementById("property_id").value = "";
  const start = new Date();
  start.setHours(9, 0, 0, 0);
  const end = new Date(start);
  end.setHours(17, 0, 0, 0);
  const preferredUntil = new Date(start);
  preferredUntil.setHours(8, 0, 0, 0);
  const setValue = (id, value) => {
    const field = document.getElementById(id);
    if (field) field.value = value;
  };
  setValue("assignment_frequency", "one_time");
  setValue("priority", "normal");
  setValue("assignment_status", "open");
  setValue("start_window", toDatetimeInput(start));
  setValue("end_window", toDatetimeInput(end));
  setValue("preferred_until", toDatetimeInput(preferredUntil));
  setValue("recurrence_end_date", "");
  document.querySelectorAll("[data-assignment-contractor-option]").forEach((input) => {
    input.checked = false;
  });
  updateAssignmentContractorDropdownLabel();
  updateAssignmentRecurrenceVisibility();
  updateAssignmentContractorControls();
  refreshAssignmentDateTimeControls();
  const formMessage = document.getElementById("assignmentFormMessage");
  if (formMessage) {
    formMessage.textContent = "";
    formMessage.classList.remove("error");
  }
  if (!options.keepMessage) {
    showAssignmentMessage("");
    showRecurringMessage("");
  }
}

function fillAssignmentFromProperty(propertyId) {
  const row = assignmentState.properties.find((item) => item.id === propertyId);
  const propertyIdField = document.getElementById("property_id");
  if (propertyIdField) propertyIdField.value = row?.id || "";
  if (!row) return;
  const setIfEmpty = (id, value) => {
    const field = document.getElementById(id);
    if (field && (!field.value || id === "property_name" || id === "address")) field.value = value || "";
  };
  setIfEmpty("property_name", assignmentPropertyTitle(row));
  setIfEmpty("address", assignmentPropertyAddress(row));
  setIfEmpty("service_type", row.service_type || row.property_type || "");
  const title = document.getElementById("title");
  if (title && !title.value) title.value = `${assignmentPropertyTitle(row)} Service`;
}

function collectAssignmentPayloads() {
  const frequency = assignmentFrequencyKey(assignmentValue("assignment_frequency") || "one_time");
  const start = parseDate(assignmentValue("start_window"));
  const end = parseDate(assignmentValue("end_window"));
  if (!start || !end) throw new Error("Start Window and End Window are required.");
  if (end <= start) throw new Error("End Window must be after Start Window.");
  const recurrenceEnd = parseAssignmentRecurrenceEnd(assignmentValue("recurrence_end_date"), frequency, start);
  const weekdays = selectedAssignmentWeekdays(start);
  const windows = buildAssignmentWindows(start, end, frequency, recurrenceEnd, weekdays);
  if (!windows.length) throw new Error("Renew Until must be on or after the Start Window date.");
  const selectedContractors = readSelectedAssignmentContractors();
  const preferredFirst = document.getElementById("preferred_first")?.checked && selectedContractors.length > 0;
  const payAmount = Number(assignmentValue("pay_amount"));
  const groupId = frequency === "one_time" ? null : randomAssignmentGroupId();
  const status = preferredFirst ? "preferred_pending" : "open";
  const payload = {
    title: assignmentValue("title"),
    property_id: assignmentValue("property_id") || null,
    property_name: assignmentValue("property_name"),
    address: assignmentValue("address"),
    service_type: assignmentValue("service_type"),
    pay_amount: Number.isFinite(payAmount) && payAmount >= 0 ? payAmount : 0,
    scope: assignmentValue("scope"),
    supplies_notes: assignmentValue("supplies_notes"),
    special_instructions: assignmentValue("special_instructions"),
    priority: assignmentValue("priority") || "normal",
    status,
    assignment_type: frequency,
    recurrence_frequency: frequency,
    recurrence_interval: 1,
    recurrence_end_date: frequency === "one_time" ? null : toDateInput(recurrenceEnd),
    auto_renewal: frequency !== "one_time" && Boolean(document.getElementById("auto_renewal")?.checked),
    recurring_group_id: groupId,
    preferred_first: preferredFirst,
    preferred_contractor_ids: selectedContractors.map((contractor) => contractor.id).filter(Boolean),
    preferred_contractor_names: selectedContractors.map((contractor) => contractor.name).filter(Boolean),
    preferred_until: assignmentValue("preferred_until") ? parseDate(assignmentValue("preferred_until")).toISOString() : null,
    visibility: preferredFirst ? "preferred" : "open",
    declined_contractor_ids: [],
    metadata: assignmentFormMetadata(frequency, weekdays),
    created_by: assignmentState.user?.id || null
  };
  return windows.map((window) => ({
    ...payload,
    start_window: window.start.toISOString(),
    end_window: window.end.toISOString()
  }));
}

function collectAssignmentUpdatePayload(currentRow = {}) {
  const frequency = assignmentFrequencyKey(assignmentValue("assignment_frequency") || currentRow.recurrence_frequency || currentRow.assignment_type || "one_time");
  const start = parseDate(assignmentValue("start_window"));
  const end = parseDate(assignmentValue("end_window"));
  if (!start || !end) throw new Error("Start Window and End Window are required.");
  if (end <= start) throw new Error("End Window must be after Start Window.");
  const selectedContractors = readSelectedAssignmentContractors();
  const preferredFirst = document.getElementById("preferred_first")?.checked && selectedContractors.length > 0;
  const payAmount = Number(assignmentValue("pay_amount"));
  const weekdays = selectedAssignmentWeekdays(start);
  const selectedStatus = assignmentValue("assignment_status");
  const statusRow = assignmentRowWithSelectedClaim(currentRow, selectedContractors);
  const statusError = assignmentStatusChangeError(selectedStatus, statusRow);
  if (statusError) throw new Error(statusError);
  const payload = {
    title: assignmentValue("title"),
    property_name: assignmentValue("property_name"),
    address: assignmentValue("address"),
    service_type: assignmentValue("service_type"),
    pay_amount: Number.isFinite(payAmount) && payAmount >= 0 ? payAmount : 0,
    scope: assignmentValue("scope"),
    supplies_notes: assignmentValue("supplies_notes"),
    special_instructions: assignmentValue("special_instructions"),
    priority: assignmentValue("priority") || "normal",
    ...assignmentStatusPayload(selectedStatus, statusRow),
    assignment_type: frequency,
    recurrence_frequency: frequency,
    recurrence_interval: currentRow.recurrence_interval || 1,
    recurrence_end_date: frequency === "one_time" ? null : assignmentValue("recurrence_end_date") || currentRow.recurrence_end_date || null,
    auto_renewal: frequency !== "one_time" && Boolean(document.getElementById("auto_renewal")?.checked),
    preferred_first: preferredFirst,
    preferred_contractor_ids: selectedContractors.map((contractor) => contractor.id).filter(Boolean),
    preferred_contractor_names: selectedContractors.map((contractor) => contractor.name).filter(Boolean),
    preferred_until: assignmentValue("preferred_until") ? parseDate(assignmentValue("preferred_until")).toISOString() : null,
    metadata: assignmentFormMetadata(frequency, weekdays, currentRow),
    start_window: start.toISOString(),
    end_window: end.toISOString()
  };
  const selectedPropertyId = assignmentValue("propertySelect");
  if (selectedPropertyId && assignmentHasPropertyOption(selectedPropertyId)) {
    payload.property_id = selectedPropertyId;
  }
  return payload;
}

function assignmentBulkControlValue(id) {
  return String(document.getElementById(id)?.value || "");
}

function assignmentBulkEnabled(id) {
  return Boolean(document.getElementById(id)?.checked);
}

function collectAssignmentBulkPatch(row = {}) {
  const payload = {};
  if (assignmentBulkEnabled("bulk_status_enabled")) {
    const status = assignmentBulkControlValue("bulk_assignment_status");
    const statusError = assignmentStatusChangeError(status, row);
    if (statusError) throw new Error(`${assignmentShortId(row)}: ${statusError}`);
    Object.assign(payload, assignmentStatusPayload(status, row));
  }
  if (assignmentBulkEnabled("bulk_priority_enabled")) {
    payload.priority = assignmentBulkControlValue("bulk_assignment_priority") || "normal";
  }
  if (assignmentBulkEnabled("bulk_pay_enabled")) {
    const payAmount = Number(assignmentBulkControlValue("bulk_pay_amount"));
    if (!Number.isFinite(payAmount) || payAmount < 0) throw new Error("Contractor Pay must be a valid amount.");
    payload.pay_amount = payAmount;
  }
  if (assignmentBulkEnabled("bulk_service_enabled")) payload.service_type = assignmentBulkControlValue("bulk_service_type");
  if (assignmentBulkEnabled("bulk_scope_enabled")) payload.scope = assignmentBulkControlValue("bulk_scope");
  if (assignmentBulkEnabled("bulk_supplies_enabled")) payload.supplies_notes = assignmentBulkControlValue("bulk_supplies_notes");
  if (assignmentBulkEnabled("bulk_special_enabled")) payload.special_instructions = assignmentBulkControlValue("bulk_special_instructions");

  const startEnabled = assignmentBulkEnabled("bulk_start_enabled");
  const endEnabled = assignmentBulkEnabled("bulk_end_enabled");
  if (startEnabled || endEnabled) {
    const start = startEnabled ? parseDate(assignmentBulkControlValue("bulk_start_window")) : parseDate(row.start_window);
    const end = endEnabled ? parseDate(assignmentBulkControlValue("bulk_end_window")) : parseDate(row.end_window);
    if (startEnabled && !start) throw new Error("Start Window must be a valid date and time.");
    if (endEnabled && !end) throw new Error("End Window must be a valid date and time.");
    if (start && end && end <= start) throw new Error("End Window must be after Start Window.");
    if (startEnabled) payload.start_window = start.toISOString();
    if (endEnabled) payload.end_window = end.toISOString();
  }

  if (!Object.keys(payload).length) throw new Error("Choose at least one bulk field to update.");
  return payload;
}

async function saveAssignmentBulkForm(event) {
  event?.preventDefault();
  if (!suiteSupabase || assignmentState.isBulkSaving) return;
  const rows = selectedAssignmentRows();
  if (!rows.length) {
    showAssignmentBulkMessage("Select one or more assignments first.", true);
    return;
  }

  let patches = [];
  try {
    patches = rows.map((row) => ({ row, payload: collectAssignmentBulkPatch(row) }));
  } catch (error) {
    showAssignmentBulkMessage(error.message, true);
    return;
  }

  assignmentState.isBulkSaving = true;
  setAssignmentBulkSaving(true);
  showAssignmentBulkMessage(`Updating ${rows.length} assignment${rows.length === 1 ? "" : "s"}...`);
  const failures = [];
  for (const item of patches) {
    const result = await saveAssignmentPatchWithSchemaFallback(item.row.id, item.payload);
    if (result.error) {
      failures.push(`${assignmentShortId(item.row)}: ${result.error.message}`);
      continue;
    }
    const index = assignmentState.rows.findIndex((row) => String(row.id || "") === String(item.row.id || ""));
    if (index >= 0 && result.data) assignmentState.rows[index] = result.data;
  }

  assignmentState.isBulkSaving = false;
  setAssignmentBulkSaving(false);
  if (failures.length) {
    renderAssignmentData();
    showAssignmentBulkMessage(`Updated ${rows.length - failures.length}; ${failures.length} failed. ${failures[0]}`, true);
    showAssignmentMessage("Some bulk updates could not be saved.", true);
    return;
  }

  clearAssignmentSelection();
  renderAssignmentData();
  closeAssignmentBulkModal();
  showAssignmentMessage(`${rows.length} assignment${rows.length === 1 ? "" : "s"} updated in Supabase.`);
}

async function deleteSelectedAssignments() {
  if (!suiteSupabase || assignmentState.isBulkSaving) return;
  const rows = selectedAssignmentRows();
  const ids = rows.map((row) => row.id).filter(Boolean);
  if (!ids.length) {
    showAssignmentMessage("Select one or more assignments first.", true);
    return;
  }
  const label = ids.length === 1
    ? (rows[0].title || rows[0].property_name || assignmentShortId(rows[0]))
    : `${ids.length} selected assignments`;
  if (!window.confirm(`Delete ${label}? This cannot be undone.`)) return;

  assignmentState.isBulkSaving = true;
  renderAssignmentBulkControls(getCurrentAssignmentPageRows());
  showAssignmentMessage(`Deleting ${ids.length} assignment${ids.length === 1 ? "" : "s"}...`);
  const { error } = await suiteSupabase
    .from(assignmentTable)
    .delete()
    .in("id", ids);
  assignmentState.isBulkSaving = false;

  if (error) {
    renderAssignmentBulkControls(getCurrentAssignmentPageRows());
    showAssignmentMessage("Unable to delete assignments: " + error.message, true);
    return;
  }

  const deletedIds = new Set(ids.map((id) => String(id)));
  assignmentState.rows = assignmentState.rows.filter((row) => !deletedIds.has(String(row.id || "")));
  clearAssignmentSelection();
  renderAssignmentData();
  showAssignmentMessage(`${ids.length} assignment${ids.length === 1 ? "" : "s"} deleted from Supabase.`);
}

async function saveAssignmentForm(event) {
  event?.preventDefault();
  if (event?.target?.id === "assignmentBulkForm") {
    await saveAssignmentBulkForm(event);
    return;
  }
  if (event?.target?.id && event.target.id !== "assignmentForm") return;
  if (!suiteSupabase || assignmentState.isSaving) return;
  assignmentState.isSaving = true;
  setAssignmentSaving(true);
  const editingId = assignmentState.editingId;
  showAssignmentMessage(editingId ? "Saving assignment changes to Supabase..." : "Saving assignment blocks to Supabase...");

  if (editingId) {
    const currentRow = assignmentState.rows.find((row) => String(row.id || "") === String(editingId)) || {};
    let payload = {};
    try {
      payload = collectAssignmentUpdatePayload(currentRow);
    } catch (error) {
      assignmentState.isSaving = false;
      setAssignmentSaving(false);
      showAssignmentMessage(error.message, true);
      return;
    }
    const result = await saveAssignmentPatchWithSchemaFallback(editingId, payload);
    assignmentState.isSaving = false;
    setAssignmentSaving(false);
    if (result.error) {
      showAssignmentMessage("Unable to update assignment: " + result.error.message, true);
      return;
    }
    const index = assignmentState.rows.findIndex((row) => String(row.id || "") === String(editingId));
    if (index >= 0) assignmentState.rows[index] = result.data;
    renderAssignmentData();
    closeAssignmentModal();
    clearAssignmentForm({ keepMessage: true });
    showAssignmentMessage("Assignment updated in Supabase.");
    return;
  }

  let payloads = [];
  try {
    payloads = collectAssignmentPayloads();
  } catch (error) {
    assignmentState.isSaving = false;
    setAssignmentSaving(false);
    showAssignmentMessage(error.message, true);
    return;
  }

  const result = await insertAssignmentPayloadsWithSchemaFallback(payloads);
  assignmentState.isSaving = false;
  setAssignmentSaving(false);
  if (result.error) {
    showAssignmentMessage("Unable to save assignment: " + result.error.message, true);
    return;
  }

  assignmentState.rows = [...(result.data || []), ...assignmentState.rows]
    .sort((a, b) => dateValue(a.start_window) - dateValue(b.start_window));
  renderAssignmentData();
  closeAssignmentModal();
  clearAssignmentForm({ keepMessage: true });
  showAssignmentMessage(`${result.data?.length || payloads.length} assignment block${(result.data?.length || payloads.length) === 1 ? "" : "s"} posted to Supabase.`);
}

async function insertAssignmentPayloadsWithSchemaFallback(payloads) {
  let fallbackPayloads = payloads.map((payload) => ({ ...payload }));
  const maxAttempts = assignmentOptionalColumns.length + 2;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const result = await suiteSupabase
      .from(assignmentTable)
      .insert(fallbackPayloads)
      .select("*");
    if (!result.error) return result;
    if (isAssignmentPropertyReferenceError(result.error) && fallbackPayloads.some((payload) => Object.prototype.hasOwnProperty.call(payload, "property_id"))) {
      fallbackPayloads = fallbackPayloads.map((payload) => {
        const next = { ...payload };
        delete next.property_id;
        return next;
      });
      continue;
    }
    const missingColumn = missingAssignmentColumnName(result.error);
    if (missingColumn && fallbackPayloads.some((payload) => Object.prototype.hasOwnProperty.call(payload, missingColumn))) {
      fallbackPayloads = fallbackPayloads.map((payload) => {
        const next = { ...payload };
        delete next[missingColumn];
        return next;
      });
      continue;
    }
    if (isMissingAssignmentOptionalColumn(result.error)) {
      const remainingOptionalColumn = assignmentOptionalColumns.find((column) => fallbackPayloads.some((payload) => Object.prototype.hasOwnProperty.call(payload, column)));
      if (remainingOptionalColumn) {
        fallbackPayloads = fallbackPayloads.map((payload) => {
          const next = { ...payload };
          delete next[remainingOptionalColumn];
          return next;
        });
        continue;
      }
    }
    return result;
  }
  return { data: null, error: new Error("Unable to save assignment because the assignment_blocks table schema is missing required columns.") };
}

async function saveAssignmentPatchWithSchemaFallback(id, payload) {
  const fallbackPayload = { ...payload };
  const maxAttempts = assignmentOptionalColumns.length + 2;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const result = await suiteSupabase
      .from(assignmentTable)
      .update(fallbackPayload)
      .eq("id", id)
      .select("*")
      .maybeSingle();
    if (!result.error) return result;
    if (isAssignmentPropertyReferenceError(result.error) && Object.prototype.hasOwnProperty.call(fallbackPayload, "property_id")) {
      delete fallbackPayload.property_id;
      continue;
    }
    const missingColumn = missingAssignmentColumnName(result.error);
    if (missingColumn && Object.prototype.hasOwnProperty.call(fallbackPayload, missingColumn)) {
      delete fallbackPayload[missingColumn];
      continue;
    }
    if (isMissingAssignmentOptionalColumn(result.error)) {
      const remainingOptionalColumn = assignmentOptionalColumns.find((column) => Object.prototype.hasOwnProperty.call(fallbackPayload, column));
      if (remainingOptionalColumn) {
        delete fallbackPayload[remainingOptionalColumn];
        continue;
      }
    }
    return result;
  }
  return { data: null, error: new Error("Unable to update assignment because the assignment_blocks table schema is missing required columns.") };
}

async function updateAssignmentStatus(id, action) {
  if (!suiteSupabase || !id) return;
  const currentRow = assignmentState.rows.find((row) => row.id === id) || {};
  const patches = {
    open: assignmentStatusPayload("open", currentRow),
    cancel: assignmentStatusPayload("cancelled", currentRow),
    start: assignmentStatusPayload("in_progress", currentRow),
    complete: assignmentStatusPayload("completed", currentRow),
    reopen: assignmentStatusPayload("open", { ...currentRow, claimed_by: currentRow.claimed_by || true })
  };
  const payload = patches[action];
  if (!payload) return;
  await updateAssignmentStatusValue(id, payload.status, payload);
}

async function updateAssignmentStatusValue(id, status, presetPayload = null) {
  if (!suiteSupabase || !id) return;
  const currentRow = assignmentState.rows.find((row) => row.id === id) || {};
  const statusError = assignmentStatusChangeError(status, currentRow);
  if (statusError) {
    renderAssignmentData();
    showAssignmentMessage(statusError, true);
    return;
  }
  const payload = presetPayload || assignmentStatusPayload(status, currentRow);
  showAssignmentMessage("Updating assignment...");
  const result = await saveAssignmentPatchWithSchemaFallback(id, payload);
  if (result.error) {
    showAssignmentMessage("Unable to update assignment: " + result.error.message, true);
    return;
  }
  const index = assignmentState.rows.findIndex((row) => row.id === id);
  if (index >= 0) assignmentState.rows[index] = result.data;
  renderAssignmentData();
  showAssignmentMessage("Assignment updated in Supabase.");
}

async function generateDueRecurringAssignments() {
  if (!suiteSupabase || assignmentState.isGenerating) return;
  assignmentState.isGenerating = true;
  setRecurringButtonSaving(true);
  showRecurringMessage("Checking recurring assignments...");
  const payloads = buildDueRecurringAssignmentPayloads();
  if (!payloads.length) {
    assignmentState.isGenerating = false;
    setRecurringButtonSaving(false);
    showRecurringMessage("No recurring assignments are due.");
    return;
  }
  const result = await insertAssignmentPayloadsWithSchemaFallback(payloads);
  assignmentState.isGenerating = false;
  setRecurringButtonSaving(false);
  if (result.error) {
    showRecurringMessage("Unable to generate recurring assignments: " + result.error.message, true);
    return;
  }
  assignmentState.rows = [...assignmentState.rows, ...(result.data || [])]
    .sort((a, b) => dateValue(a.start_window) - dateValue(b.start_window));
  renderAssignmentData();
  showRecurringMessage(`${result.data?.length || payloads.length} recurring assignment${(result.data?.length || payloads.length) === 1 ? "" : "s"} generated.`);
}

function buildDueRecurringAssignmentPayloads() {
  const groups = new Map();
  assignmentState.rows
    .filter((row) => row.auto_renewal && assignmentFrequencyKey(row.recurrence_frequency || row.assignment_type) !== "one_time")
    .forEach((row) => {
      const key = recurringAssignmentRenewalKey(row);
      const current = groups.get(key);
      if (!current || dateValue(row.start_window, 0) > dateValue(current.start_window, 0)) groups.set(key, row);
    });
  const existingStarts = new Set(assignmentState.rows.map((row) => `${recurringAssignmentRenewalKey(row)}|${row.start_window}`));
  const horizon = addDays(new Date(), 14);
  return Array.from(groups.values()).map((row) => {
    const next = nextAssignmentWindow(row);
    if (!next || next.start > horizon) return null;
    const recurrenceEnd = parseDate(row.recurrence_end_date);
    if (recurrenceEnd && next.start > endOfDate(recurrenceEnd)) return null;
    const groupKey = recurringAssignmentRenewalKey(row);
    if (existingStarts.has(`${groupKey}|${next.start.toISOString()}`)) return null;
    return renewedAssignmentPayload(row, next);
  }).filter(Boolean);
}

function recurringAssignmentRenewalKey(row) {
  const groupId = row.recurring_group_id || row.id;
  const frequency = assignmentFrequencyKey(row.recurrence_frequency || row.assignment_type);
  const metadata = assignmentMetadata(row);
  const weekdayCount = Array.isArray(metadata.recurrence_weekdays) ? metadata.recurrence_weekdays.length : 0;
  if (frequency === "weekly" && weekdayCount > 1) {
    const start = parseDate(row.start_window);
    return `${groupId}:${start ? start.getDay() : "weekly"}`;
  }
  return groupId;
}

function renewedAssignmentPayload(row, window) {
  const preferredFirst = Boolean(row.preferred_first && assignmentPreferredIds(row).length);
  return {
    title: row.title,
    property_id: row.property_id || null,
    property_name: row.property_name,
    address: row.address,
    service_type: row.service_type,
    pay_amount: row.pay_amount || 0,
    scope: row.scope || "",
    supplies_notes: row.supplies_notes || "",
    special_instructions: row.special_instructions || "",
    priority: row.priority || "normal",
    status: preferredFirst ? "preferred_pending" : "open",
    assignment_type: assignmentFrequencyKey(row.assignment_type || row.recurrence_frequency),
    recurrence_frequency: assignmentFrequencyKey(row.recurrence_frequency || row.assignment_type),
    recurrence_interval: row.recurrence_interval || 1,
    recurrence_end_date: row.recurrence_end_date || null,
    auto_renewal: true,
    recurring_group_id: row.recurring_group_id || row.id,
    source_assignment_id: row.id,
    preferred_first: preferredFirst,
    preferred_contractor_ids: assignmentPreferredIds(row),
    preferred_contractor_names: assignmentPreferredNames(row),
    preferred_until: null,
    visibility: preferredFirst ? "preferred" : "open",
    declined_contractor_ids: [],
    metadata: assignmentMetadata(row),
    created_by: assignmentState.user?.id || row.created_by || null,
    start_window: window.start.toISOString(),
    end_window: window.end.toISOString()
  };
}

function buildAssignmentWindows(start, end, frequency, recurrenceEnd, weekdays = []) {
  if (frequency === "weekly" && weekdays.length) {
    return buildWeeklyAssignmentWindows(start, end, recurrenceEnd, weekdays);
  }
  const windows = [];
  let cursorStart = new Date(start);
  let cursorEnd = new Date(end);
  const limit = frequency === "daily" ? 366 : frequency === "weekly" ? 104 : frequency === "monthly" ? 36 : 1;
  const cutoff = frequency === "one_time" ? end : endOfDate(recurrenceEnd || start);
  while (windows.length < limit && cursorStart <= cutoff) {
    windows.push({ start: new Date(cursorStart), end: new Date(cursorEnd) });
    if (frequency === "one_time") break;
    const next = advanceAssignmentWindow(cursorStart, cursorEnd, frequency);
    cursorStart = next.start;
    cursorEnd = next.end;
  }
  return windows;
}

function buildWeeklyAssignmentWindows(start, end, recurrenceEnd, weekdays) {
  const windows = [];
  const selectedDays = new Set(weekdays.map(Number).filter((day) => day >= 0 && day <= 6));
  if (!selectedDays.size) return windows;
  const durationMs = end.getTime() - start.getTime();
  const cutoff = endOfDate(recurrenceEnd || start);
  const cursor = new Date(start);
  cursor.setHours(0, 0, 0, 0);
  while (windows.length < 366 && cursor <= cutoff) {
    if (selectedDays.has(cursor.getDay())) {
      const windowStart = new Date(cursor);
      windowStart.setHours(start.getHours(), start.getMinutes(), start.getSeconds(), start.getMilliseconds());
      if (windowStart >= start && windowStart <= cutoff) {
        windows.push({ start: windowStart, end: new Date(windowStart.getTime() + durationMs) });
      }
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return windows.sort((a, b) => a.start - b.start);
}

function advanceAssignmentWindow(start, end, frequency) {
  const nextStart = new Date(start);
  const nextEnd = new Date(end);
  if (frequency === "daily") {
    nextStart.setDate(nextStart.getDate() + 1);
    nextEnd.setDate(nextEnd.getDate() + 1);
  } else if (frequency === "weekly") {
    nextStart.setDate(nextStart.getDate() + 7);
    nextEnd.setDate(nextEnd.getDate() + 7);
  } else if (frequency === "monthly") {
    nextStart.setMonth(nextStart.getMonth() + 1);
    nextEnd.setMonth(nextEnd.getMonth() + 1);
  }
  return { start: nextStart, end: nextEnd };
}

function nextAssignmentWindow(row) {
  const start = parseDate(row.start_window);
  const end = parseDate(row.end_window);
  const frequency = assignmentFrequencyKey(row.recurrence_frequency || row.assignment_type);
  if (!start || !end || frequency === "one_time") return null;
  return advanceAssignmentWindow(start, end, frequency);
}

function parseAssignmentRecurrenceEnd(value, frequency, start) {
  if (frequency === "one_time") return start;
  if (value) return parseDate(`${value}T23:59:59`);
  const date = new Date(start);
  if (frequency === "daily") date.setDate(date.getDate() + 6);
  if (frequency === "weekly") date.setDate(date.getDate() + 28);
  if (frequency === "monthly") date.setMonth(date.getMonth() + 5);
  return date;
}

function endOfDate(value) {
  const date = parseDate(value);
  if (!date) return new Date();
  date.setHours(23, 59, 59, 999);
  return date;
}

function updateAssignmentRecurrenceVisibility() {
  const frequency = assignmentFrequencyKey(assignmentValue("assignment_frequency") || "one_time");
  const isRecurring = frequency !== "one_time";
  document.querySelectorAll("[data-assignment-recurrence-field]").forEach((field) => {
    field.hidden = !isRecurring;
  });
  const weekdayField = document.querySelector("[data-assignment-weekday-field]");
  if (weekdayField) weekdayField.hidden = frequency !== "weekly";
  if (frequency === "weekly") ensureDefaultAssignmentWeekday();
  const endDate = document.getElementById("recurrence_end_date");
  if (endDate) {
    endDate.required = isRecurring;
    if (isRecurring && !endDate.value) {
      endDate.value = toDateInput(parseAssignmentRecurrenceEnd("", frequency, parseDate(assignmentValue("start_window")) || new Date()));
    }
    if (!isRecurring) endDate.value = "";
  }
}

function selectedAssignmentWeekdays(startDate = null) {
  const selected = Array.from(document.querySelectorAll("[data-assignment-weekday]:checked"))
    .map((input) => Number(input.value))
    .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6);
  if (selected.length) return [...new Set(selected)].sort((a, b) => a - b);
  const fallback = startDate instanceof Date && !Number.isNaN(startDate.getTime())
    ? startDate.getDay()
    : (parseDate(assignmentValue("start_window")) || new Date()).getDay();
  return [fallback];
}

function ensureDefaultAssignmentWeekday() {
  const checkboxes = Array.from(document.querySelectorAll("[data-assignment-weekday]"));
  if (!checkboxes.length || checkboxes.some((input) => input.checked)) return;
  const start = parseDate(assignmentValue("start_window")) || new Date();
  const defaultDay = start.getDay();
  checkboxes.forEach((input) => {
    input.checked = Number(input.value) === defaultDay;
  });
}

function setAssignmentWeekdays(days = []) {
  const selected = new Set((Array.isArray(days) ? days : []).map(Number));
  document.querySelectorAll("[data-assignment-weekday]").forEach((input) => {
    input.checked = selected.has(Number(input.value));
  });
}

function assignmentFormMetadata(frequency, weekdays, currentRow = null) {
  const metadata = currentRow ? { ...assignmentMetadata(currentRow) } : {};
  if (frequency === "weekly") {
    metadata.recurrence_weekdays = weekdays;
  } else {
    delete metadata.recurrence_weekdays;
  }
  return metadata;
}

function updateAssignmentContractorControls() {
  const enabled = Boolean(document.getElementById("preferred_first")?.checked);
  const field = document.querySelector(".assignment-contractor-field");
  const deadline = document.getElementById("preferred_until")?.closest(".suite-field");
  if (field) field.classList.toggle("muted-field", !enabled);
  if (deadline) deadline.classList.toggle("muted-field", !enabled);
}

function closeAssignmentContractorDropdowns() {
  document.querySelectorAll("[data-assignment-contractor-menu]").forEach((menu) => {
    menu.hidden = true;
  });
  document.querySelectorAll("[data-assignment-contractor-toggle]").forEach((button) => {
    button.setAttribute("aria-expanded", "false");
  });
}

function readSelectedAssignmentContractors(form = document.getElementById("assignmentForm")) {
  return Array.from(form?.querySelectorAll("[data-assignment-contractor-option]:checked") || [])
    .map((input) => ({
      id: input.dataset.contractorId || "",
      name: input.dataset.contractorName || "",
      email: input.dataset.contractorEmail || ""
    }))
    .filter((contractor) => contractor.id || contractor.name);
}

function assignmentSaveButtonLabel(button = document.getElementById("assignmentSaveBtn")) {
  if (!button) return null;
  return button.querySelector("[data-assignment-save-label]")
    || Array.from(button.querySelectorAll("span")).find((span) => !span.classList.contains("suite-icon"))
    || button;
}

function updateAssignmentContractorDropdownLabel(form = document.getElementById("assignmentForm")) {
  const label = form?.querySelector("[data-assignment-contractor-label]");
  if (!label) return;
  const contractors = readSelectedAssignmentContractors(form);
  label.textContent = contractors.length ? contractors.map((contractor) => contractor.name).join(", ") : "Select preferred contractors";
}

function assignmentValue(id) {
  return (document.getElementById(id)?.value || "").trim();
}

function assignmentHasPropertyOption(propertyId) {
  return Boolean(propertyId && assignmentState.properties.some((row) => String(row.id || "") === String(propertyId)));
}

function refreshAssignmentDateTimeControls() {
  if (typeof window.turnlySyncAssignmentDateTimeControls === "function") {
    window.turnlySyncAssignmentDateTimeControls();
    return;
  }
  document.dispatchEvent(new CustomEvent("turnly:assignment-date-time-refresh"));
}

function getAssignmentContractorOptions() {
  return assignmentState.contractors || [];
}

function isAssignmentContractorProfile(profile) {
  return normalizeToken(profile?.role) === "contractor";
}

function normalizeAssignmentContractorOption(profile) {
  const email = profile?.email || "";
  return {
    id: profile?.id || "",
    name: profile?.full_name || email.split("@")[0] || "Contractor",
    email,
    role: profile?.role || "contractor",
    status: profile?.status || (profile?.contractor_approved ? "approved" : "")
  };
}

function assignmentPropertyTitle(row) {
  return row?.property_name || row?.name || row?.company_name || row?.title || "";
}

function assignmentPropertyAddress(row) {
  return [row?.address, row?.city, row?.state, row?.postal_code].filter(Boolean).join(", ");
}

function assignmentStatusKey(value) {
  return normalizeToken(value || "open");
}

function assignmentStatusFormValue(value) {
  const key = normalizeToken(value || "open").replace(/-/g, "_");
  return assignmentStatusOptions.some(([id]) => id === key) ? key : "open";
}

function assignmentStatusOptionsForRow(row = null) {
  if (!row) return assignmentStatusOptions;
  const current = assignmentStatusFormValue(row.status);
  const options = assignmentStatusOptions.filter(([value]) => assignmentStatusCanShow(value, row));
  if (!options.some(([value]) => value === current)) {
    const currentOption = assignmentStatusOptions.find(([value]) => value === current);
    if (currentOption) options.unshift(currentOption);
  }
  return options;
}

function populateAssignmentStatusSelect(row = null) {
  const field = document.getElementById("assignment_status");
  if (!field) return;
  const current = row ? assignmentStatusFormValue(row.status) : assignmentStatusFormValue(field.value || "open");
  field.innerHTML = assignmentStatusOptionsForRow(row)
    .map(([value, label]) => `<option value="${esc(value)}" ${value === current ? "selected" : ""}>${esc(label)}</option>`)
    .join("");
  field.value = current;
}

function assignmentStatusCanShow(value, row = {}) {
  const status = assignmentStatusFormValue(value);
  if (["claimed", "in_progress"].includes(status)) return Boolean(assignmentClaimUser(row).id);
  return true;
}

function assignmentWorkerId(row = {}) {
  return row.claimed_by || row.assigned_to || "";
}

function assignmentClaimUser(row = {}) {
  const workerId = assignmentWorkerId(row);
  if (workerId) {
    return {
      id: workerId,
      name: row.claimed_by_name || row.assigned_to_name || null,
      email: row.claimed_by_email || row.assigned_to_email || null
    };
  }
  return {
    id: assignmentState.user?.id || "",
    name: assignmentState.profile?.full_name || assignmentState.user?.user_metadata?.full_name || assignmentState.user?.email?.split("@")[0] || "Admin",
    email: assignmentState.profile?.email || assignmentState.user?.email || null
  };
}

function assignmentRowWithSelectedClaim(row = {}, contractors = []) {
  if (assignmentWorkerId(row)) return row;
  const contractor = contractors.find((option) => option.id);
  if (!contractor) return row;
  return {
    ...row,
    assigned_to: contractor.id,
    assigned_to_name: contractor.name || null,
    assigned_to_email: contractor.email || null
  };
}

function assignmentCompletionUserId(row = {}) {
  return row.completed_by || assignmentState.user?.id || row.claimed_by || row.assigned_to || row.started_by || "";
}

function assignmentHasChecklistResponses(row = {}) {
  return Array.isArray(row.checklist_responses) && row.checklist_responses.length > 0;
}

function assignmentAdminCompletionResponses(row = {}, now = new Date().toISOString()) {
  if (assignmentHasChecklistResponses(row)) return row.checklist_responses;
  return [{
    type: "admin_status_update",
    label: "Completed from admin assignment board",
    completed_at: now
  }];
}

function assignmentStatusChangeError(value, row = {}) {
  const status = assignmentStatusFormValue(value);
  if (["claimed", "in_progress"].includes(status) && !assignmentClaimUser(row).id) {
    return `${titleCase(status)} requires a signed-in admin or contractor record.`;
  }
  if (status === "completed" && !assignmentCompletionUserId(row)) {
    return "Completed requires a signed-in admin or contractor record.";
  }
  return "";
}

function assignmentStatusPayload(value, currentRow = {}) {
  const status = assignmentStatusFormValue(value);
  const previousStatus = assignmentStatusKey(currentRow.status);
  const now = new Date().toISOString();
  const payload = { status };

  if (status === "open") {
    payload.visibility = "open";
    if (currentRow.claimed_by || currentRow.assigned_to || previousStatus !== "open") {
      Object.assign(payload, {
        claimed_by: null,
        claimed_by_name: null,
        claimed_by_email: null,
        assigned_to: null,
        assigned_to_name: null,
        assigned_to_email: null,
        accepted_at: null,
        claimed_at: null
      });
    }
    if (previousStatus === "completed") {
      payload.completed_at = null;
    }
    return payload;
  }

  if (status === "preferred_pending") {
    payload.visibility = "preferred";
    return payload;
  }

  if (status === "claimed") {
    const claimUser = assignmentClaimUser(currentRow);
    payload.visibility = "claimed";
    payload.claimed_by = currentRow.claimed_by || claimUser.id || null;
    payload.claimed_by_name = currentRow.claimed_by_name || claimUser.name || null;
    payload.claimed_by_email = currentRow.claimed_by_email || claimUser.email || null;
    payload.claimed_at = currentRow.claimed_at || now;
    payload.accepted_at = currentRow.accepted_at || now;
    return payload;
  }

  if (status === "in_progress") {
    const claimUser = assignmentClaimUser(currentRow);
    payload.visibility = currentRow.visibility && currentRow.visibility !== "open" ? currentRow.visibility : "claimed";
    payload.claimed_by = currentRow.claimed_by || claimUser.id || null;
    payload.claimed_by_name = currentRow.claimed_by_name || claimUser.name || null;
    payload.claimed_by_email = currentRow.claimed_by_email || claimUser.email || null;
    payload.claimed_at = currentRow.claimed_at || now;
    payload.accepted_at = currentRow.accepted_at || now;
    payload.started_at = currentRow.started_at || now;
    payload.started_by = currentRow.started_by || currentRow.claimed_by || claimUser.id || null;
    return payload;
  }

  if (status === "completed") {
    payload.visibility = "closed";
    payload.completed_at = currentRow.completed_at || now;
    payload.completed_by = assignmentCompletionUserId(currentRow) || null;
    payload.checklist_completed_at = currentRow.checklist_completed_at || now;
    payload.checklist_responses = assignmentAdminCompletionResponses(currentRow, now);
    return payload;
  }

  if (status === "cancelled" || status === "declined") {
    payload.visibility = "closed";
    return payload;
  }

  if (status === "qa_pending") {
    payload.visibility = "closed";
  }

  return payload;
}

function assignmentFrequencyKey(value) {
  return normalizeToken(value || "one_time").replace(/-/g, "_");
}

function assignmentFrequencyLabel(rowOrValue) {
  const value = typeof rowOrValue === "string" ? rowOrValue : rowOrValue?.recurrence_frequency || rowOrValue?.assignment_type || "one_time";
  const key = assignmentFrequencyKey(value);
  return assignmentFrequencyOptions.find(([id]) => id === key)?.[1] || titleCase(key);
}

function assignmentMoney(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return "$0";
  return number.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function assignmentMetadata(row) {
  const metadata = row?.metadata;
  if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) return metadata;
  if (typeof metadata === "string" && metadata.trim()) {
    try {
      const parsed = JSON.parse(metadata);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

function assignmentUnitNumber(row) {
  const metadata = assignmentMetadata(row);
  return row?.unit_number
    || row?.unit_name
    || metadata.unit_number
    || metadata.unit_name
    || metadata.unit_id
    || "No unit";
}

function assignmentUnitMeta(row) {
  const metadata = assignmentMetadata(row);
  const squareFeet = row?.unit_square_feet || metadata.unit_square_feet;
  const squareFeetNumber = Number(squareFeet);
  return Number.isFinite(squareFeetNumber) && squareFeetNumber > 0
    ? `${squareFeetNumber.toLocaleString()} sq ft`
    : "Unit not selected";
}

function assignmentSpecialNotes(row) {
  const metadata = assignmentMetadata(row);
  return row?.special_instructions
    || metadata.unit_notes
    || row?.supplies_notes
    || row?.scope
    || "No notes";
}

function assignmentSpecialNotesMeta(row) {
  if (row?.special_instructions) return "Special instructions";
  if (assignmentMetadata(row).unit_notes) return "Unit notes";
  if (row?.supplies_notes) return "Supply notes";
  if (row?.scope) return "Scope";
  return "Click to edit";
}

function assignmentShortId(row) {
  return row?.id ? `A-${String(row.id).slice(0, 8).toUpperCase()}` : "New";
}

function assignmentPreferredIds(row) {
  return Array.isArray(row?.preferred_contractor_ids) ? row.preferred_contractor_ids.filter(Boolean) : [];
}

function assignmentPreferredNames(row) {
  return Array.isArray(row?.preferred_contractor_names) ? row.preferred_contractor_names.filter(Boolean) : [];
}

function assignmentContractorText(row) {
  return row?.assigned_to_name
    || row?.assigned_to_email
    || row?.claimed_by_name
    || row?.claimed_by_email
    || assignmentPreferredNames(row).join(", ")
    || "Unassigned";
}

function assignmentRoutingMeta(row) {
  if (assignmentStatusKey(row?.status) === "preferred-pending") return "Preferred contractor window";
  if (row?.visibility === "preferred") return "Preferred only";
  if (assignmentPreferredNames(row).length) return `${assignmentPreferredNames(row).length} preferred contractor${assignmentPreferredNames(row).length === 1 ? "" : "s"}`;
  return "Open to contractors";
}

function assignmentHasContractor(row) {
  return Boolean(row?.assigned_to || row?.claimed_by || assignmentPreferredIds(row).length || row?.assigned_to_name || row?.claimed_by_name);
}

function assignmentMatchesContractor(row, contractorId) {
  return row?.assigned_to === contractorId
    || row?.claimed_by === contractorId
    || assignmentPreferredIds(row).includes(contractorId);
}

function isAssignmentClosed(row) {
  return assignmentStatusKey(row?.status) === "completed";
}

function isAssignmentOpen(row) {
  return !isAssignmentClosed(row);
}

function isAssignmentOverdue(row) {
  const status = assignmentStatusKey(row?.status);
  if (status === "overdue") return true;
  const end = parseDate(row?.end_window);
  return Boolean(end && end < new Date() && !isAssignmentClosed(row));
}

function isAssignmentUpcoming(row) {
  const start = parseDate(row?.start_window);
  return Boolean(start && start >= startOfToday() && !isAssignmentClosed(row));
}

function setAssignmentSaving(isSaving) {
  const button = document.getElementById("assignmentSaveBtn");
  if (!button) return;
  button.disabled = isSaving;
  const label = assignmentSaveButtonLabel(button);
  const isEditing = Boolean(assignmentState.editingId);
  if (label) label.textContent = isSaving
    ? (isEditing ? "Saving..." : "Posting...")
    : (isEditing ? "Save Changes" : "Post Assignment");
}

function setAssignmentBulkSaving(isSaving) {
  const button = document.getElementById("assignmentBulkSaveBtn");
  if (!button) return;
  button.disabled = isSaving;
  const label = button.querySelector("span");
  if (label) label.textContent = isSaving ? "Applying..." : "Apply Changes";
  document.querySelectorAll("[data-assignment-bulk-close]").forEach((control) => {
    control.disabled = isSaving;
  });
}

function setRecurringButtonSaving(isSaving) {
  const button = document.getElementById("generateRecurringAssignmentsBtn");
  if (!button) return;
  button.disabled = isSaving;
  const label = button.querySelector("span");
  if (label) label.textContent = isSaving ? "Generating..." : "Generate Due Assignments";
}

function showAssignmentMessage(text, isError = false) {
  const modal = document.getElementById("assignmentModal");
  const formMessage = modal && !modal.hidden ? document.getElementById("assignmentFormMessage") : null;
  const message = formMessage || document.getElementById("assignmentMessage") || document.getElementById("recurringMessage");
  if (!message) return;
  message.textContent = text || "";
  message.classList.toggle("error", Boolean(isError));
}

function showAssignmentBulkMessage(text, isError = false) {
  const message = document.getElementById("assignmentBulkMessage");
  if (!message) return;
  message.textContent = text || "";
  message.classList.toggle("error", Boolean(isError));
}

function showRecurringMessage(text, isError = false) {
  const message = document.getElementById("recurringMessage");
  if (!message) return;
  message.textContent = text || "";
  message.classList.toggle("error", Boolean(isError));
}

function isMissingAssignmentOptionalColumn(error) {
  const message = String(error?.message || "").toLowerCase();
  return assignmentOptionalColumns.some((column) => message.includes(column.toLowerCase())) || message.includes("schema cache");
}

function isAssignmentPropertyReferenceError(error) {
  const message = String(error?.message || "").toLowerCase();
  return message.includes("assignment_blocks_property_id_fkey")
    || (message.includes("foreign key") && message.includes("property_id"));
}

function missingAssignmentColumnName(error) {
  const message = String(error?.message || "");
  const quoted = message.match(/'([a-zA-Z0-9_]+)'\s+column/);
  if (quoted) return quoted[1];
  const schemaCache = message.match(/Could not find the '([a-zA-Z0-9_]+)' column/i);
  if (schemaCache) return schemaCache[1];
  const columnRef = message.match(/column\s+"?([a-zA-Z0-9_]+)"?\s+of relation/i);
  return columnRef?.[1] || "";
}

function randomAssignmentGroupId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `assignment-${Date.now()}-${Math.round(Math.random() * 100000)}`;
}

function toDatetimeInput(value) {
  const date = parseDate(value);
  if (!date) return "";
  const pad = (part) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function miniRange(label) {
  return `<div class="mini-range"><button type="button">${icon("chevron-right", "flip")}</button><strong>${esc(label)}</strong><button type="button">${icon("chevron-right")}</button></div>`;
}

function dayCalendar(title, text) {
  const hours = ["All Day", "6 AM", "7 AM", "8 AM", "9 AM", "10 AM", "11 AM", "12 PM", "1 PM", "2 PM", "4 PM", "5 PM", "6 PM", "7 PM", "8 PM", "9 PM"];
  return `<div class="day-calendar">${hours.map((hour) => `<div><time>${esc(hour)}</time></div>`).join("")}<div class="calendar-empty">${emptyState("calendar", title, text)}</div></div>`;
}

function weekCalendar(title) {
  const days = ["Sun 5/19", "Mon 5/20", "Tue 5/21", "Wed 5/22", "Thu 5/23", "Fri 5/24", "Sat 5/25"];
  return `<div class="week-calendar">${days.map((day) => `<div><strong>${esc(day)}</strong></div>`).join("")}<div class="calendar-empty">${emptyState("calendar", title)}</div></div>`;
}

function scheduleWeekCalendar(title, text) {
  const days = ["Sun 5/18", "Mon 5/19", "Tue 5/20", "Wed 5/21", "Thu 5/22", "Fri 5/23", "Sat 5/24"];
  const hours = ["All Day", "6 AM", "7 AM", "8 AM", "9 AM", "10 AM", "11 AM", "12 PM", "1 PM", "2 PM", "3 PM", "5 PM", "6 PM", "7 PM", "8 PM", "9 PM"];
  return `
    <div class="schedule-week-grid">
      <div class="schedule-week-corner"></div>
      ${days.map((day) => `<strong class="schedule-week-head">${esc(day)}</strong>`).join("")}
      ${hours.map((hour) => `
        <time>${esc(hour)}</time>
        ${days.map(() => "<span></span>").join("")}
      `).join("")}
      <div class="calendar-empty">${emptyState("calendar", title, text)}</div>
    </div>
  `;
}

function monthCalendarGrid() {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const cells = [
    ["27", true], ["28", true], ["29", true], ["30", true], ["1", false], ["2", false], ["3", false],
    ["4", false], ["5", false], ["6", false], ["7", false], ["8", false], ["9", false], ["10", false],
    ["11", false], ["12", false], ["13", false], ["14", false], ["15", false], ["16", false], ["17", false],
    ["18", false, true], ["19", false], ["20", false], ["21", false], ["22", false], ["23", false], ["24", false],
    ["25", false], ["26", false], ["27", false], ["28", false], ["29", false], ["30", false], ["31", false],
    ["1", true], ["2", true], ["3", true], ["4", true], ["5", true], ["6", true], ["7", true]
  ];
  return `
    <div class="schedule-month-calendar">
      <div class="schedule-month-head">
        <button type="button">${icon("chevron-right", "flip")}</button>
        <strong>May 2025 ${icon("calendar")}</strong>
        <button type="button">${icon("chevron-right")}</button>
      </div>
      <div class="schedule-month-grid">
        ${days.map((day) => `<b>${esc(day)}</b>`).join("")}
        ${cells.map(([day, muted, today]) => `<span class="${muted ? "muted" : ""} ${today ? "today" : ""}">${esc(day)}</span>`).join("")}
      </div>
    </div>
  `;
}

function axisChart(title, text) {
  return `<div class="axis-chart">${Array.from({ length: 6 }, () => "<span></span>").join("")}<div>${icon("line-chart")}<strong>${esc(title)}</strong><p>${esc(text)}</p></div></div>`;
}

function renderSidebar(activeKey) {
  const collapsedSections = readCollapsedNavSections(activeKey);
  return `
    <aside class="suite-sidebar">
      <a class="suite-brand" href="admin.html" aria-label="Turnly admin">
        <span class="brand-mark">T</span>
        <strong>TURNLY</strong>
      </a>
      <nav class="suite-nav" aria-label="Admin navigation">
        ${navSections.map((section) => {
          const key = navSectionKey(section.title);
          const sectionId = key ? `nav-section-${key}` : "";
          const isCollapsed = key && collapsedSections.has(key);
          return `
            <div class="nav-section-group ${isCollapsed ? "collapsed" : ""}">
              ${section.title ? `
                <button class="nav-section-title" type="button" data-nav-section-toggle="${esc(key)}" aria-expanded="${isCollapsed ? "false" : "true"}" aria-controls="${esc(sectionId)}">
                  <span>${esc(section.title)}</span>
                  ${icon("chevron-right", "nav-section-arrow")}
                </button>
              ` : ""}
              <div class="nav-section-links" ${sectionId ? `id="${esc(sectionId)}" data-nav-section="${esc(key)}"` : ""} ${isCollapsed ? "hidden" : ""}>
                ${section.links.map((link) => `
                  <a class="suite-nav-link ${activeKey === link.key ? "active" : ""}" href="${link.href || "#"}">
                    ${icon(link.icon)}
                    <span>${esc(link.label)}</span>
                  </a>
                `).join("")}
              </div>
            </div>
          `;
        }).join("")}
      </nav>
    </aside>
  `;
}

function renderTopbar(page) {
  const actions = page.actions || (page.action ? [page.action] : []);
  const actionMarkup = actions.map((action) => actionLink(action.label, action.icon, action.href, action.tone)).join("");
  const profile = getTopbarProfileDefaults();
  return `
    <header class="suite-topbar">
      <div class="page-heading">
        <h1>${esc(page.title)}</h1>
        <p>${esc(page.subtitle || "")}</p>
      </div>
      <div class="topbar-tools">
        <div class="global-search topbar-search-wrap" role="search">
          ${icon("search")}
          <input id="globalSearchInput" type="search" placeholder="Search anything..." autocomplete="off" />
          <kbd>K</kbd>
          <div id="globalSearchResults" class="topbar-dropdown topbar-search-results" hidden></div>
        </div>
        ${actionMarkup}
        <div class="topbar-popover-wrap">
          <button id="topNotificationsBtn" class="top-icon" type="button" aria-label="Notifications" aria-expanded="false">${icon("bell")}<span id="topNotificationsBadge">3</span></button>
          <div id="topNotificationsMenu" class="topbar-dropdown topbar-notifications" hidden>
            <div class="topbar-dropdown-head"><strong>Notifications</strong><small>Open active work queues</small></div>
            <a href="assignments.html">${icon("clipboard-list")}<span><strong>Action Items</strong><small>Assignments and follow-ups</small></span></a>
            <a href="coverage-center.html">${icon("shield")}<span><strong>Coverage Requests</strong><small>Open coverage center</small></span></a>
            <a href="qa-queue.html">${icon("alert")}<span><strong>QA Alerts</strong><small>Review quality queue</small></span></a>
          </div>
        </div>
        <div class="topbar-profile-wrap">
          <button id="topProfileBtn" class="top-user" type="button" aria-label="Profile menu" aria-expanded="false">
            <span id="topUserAvatar" class="user-photo">${esc(profile.initials)}</span>
            <span><strong id="topUserName">${esc(profile.name)}</strong><small id="topUserRole">${esc(profile.role)}</small></span>
            ${icon("chevron-down")}
          </button>
          <div id="topProfileMenu" class="topbar-dropdown topbar-profile-menu" hidden>
            <div class="topbar-profile-card">
              <span id="topProfileAvatarLarge" class="user-photo large">${esc(profile.initials)}</span>
              <span><strong id="topProfileName">${esc(profile.name)}</strong><small id="topProfileEmail">${esc(profile.email || profile.role)}</small></span>
            </div>
            <p id="topProfileMessage" class="topbar-profile-message" aria-live="polite"></p>
            <input id="topAvatarInput" type="file" accept="image/*" hidden />
            <button id="topAvatarUploadBtn" type="button">${icon("upload")}<span>Upload Picture</span></button>
            <a href="dashboard.html">${icon("home")}<span>Open Dashboard</span></a>
            <button id="topSignOutBtn" type="button">${icon("chevron-right")}<span>Sign Out</span></button>
          </div>
        </div>
      </div>
    </header>
  `;
}

function initTopbar() {
  const search = document.getElementById("globalSearchInput");
  const notificationsButton = document.getElementById("topNotificationsBtn");
  const profileButton = document.getElementById("topProfileBtn");
  const avatarButton = document.getElementById("topAvatarUploadBtn");
  const avatarInput = document.getElementById("topAvatarInput");
  const signOutButton = document.getElementById("topSignOutBtn");

  search?.addEventListener("input", () => renderTopbarSearchResults(search.value));
  search?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      const first = getTopbarSearchMatches(search.value)[0];
      if (first?.href) window.location.href = first.href;
    }
    if (event.key === "Escape") closeTopbarMenus();
  });

  notificationsButton?.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleTopbarMenu("notifications");
  });
  profileButton?.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleTopbarMenu("profile");
  });
  avatarButton?.addEventListener("click", () => avatarInput?.click());
  avatarInput?.addEventListener("change", () => {
    const file = avatarInput.files?.[0];
    if (file) void uploadTopbarAvatar(file);
  });
  signOutButton?.addEventListener("click", () => void signOutTopbarUser());

  if (!window.__turnlyTopbarKeybind) {
    window.__turnlyTopbarKeybind = true;
    document.addEventListener("keydown", (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        document.getElementById("globalSearchInput")?.focus();
      }
    });
    document.addEventListener("click", (event) => {
      if (!event.target.closest(".topbar-tools")) closeTopbarMenus();
    });
  }

  void loadTopbarProfile();
}

function getTopbarProfileDefaults() {
  const user = topbarState.user;
  const profile = topbarState.profile;
  const email = profile?.email || user?.email || "";
  const name = profile?.full_name || user?.user_metadata?.full_name || email?.split("@")[0] || "Turnly Admin";
  const role = titleCase(profile?.role || user?.app_metadata?.role || "Administrator");
  return { name, role, email, initials: initialsFromName(name || email || "TA"), avatarUrl: profile?.avatar_url || user?.user_metadata?.avatar_url || "" };
}

async function loadTopbarProfile() {
  if (!suiteSupabase || topbarState.loading) {
    applyTopbarProfile();
    return;
  }
  topbarState.loading = true;
  const { data: userData } = await suiteSupabase.auth.getUser();
  topbarState.user = userData?.user || null;

  if (topbarState.user) {
    let result = await suiteSupabase
      .from("profiles")
      .select("role,full_name,email,avatar_url,avatar_path")
      .eq("id", topbarState.user.id)
      .maybeSingle();
    if (result.error && isMissingTopbarAvatarColumn(result.error)) {
      result = await suiteSupabase
        .from("profiles")
        .select("role,full_name,email")
        .eq("id", topbarState.user.id)
        .maybeSingle();
    }
    topbarState.profile = result.data || null;
  }

  topbarState.loaded = true;
  topbarState.loading = false;
  applyTopbarProfile();
}

function applyTopbarProfile() {
  const profile = getTopbarProfileDefaults();
  const setText = (id, value) => {
    const element = document.getElementById(id);
    if (element) element.textContent = value || "";
  };
  setText("topUserName", profile.name);
  setText("topUserRole", profile.role);
  setText("topProfileName", profile.name);
  setText("topProfileEmail", profile.email || profile.role);
  paintTopbarAvatar("topUserAvatar", profile);
  paintTopbarAvatar("topProfileAvatarLarge", profile);
}

function paintTopbarAvatar(id, profile) {
  const avatar = document.getElementById(id);
  if (!avatar) return;
  if (profile.avatarUrl) {
    avatar.innerHTML = `<img src="${esc(profile.avatarUrl)}" alt="" />`;
  } else {
    avatar.textContent = profile.initials;
  }
}

function getTopbarSearchItems() {
  return navSections.flatMap((section) => section.links.map((link) => ({
    label: link.label,
    section: section.title || "Home",
    href: link.href,
    icon: link.icon
  })));
}

function getTopbarSearchMatches(value) {
  const term = String(value || "").trim().toLowerCase();
  if (!term) return [];
  return getTopbarSearchItems()
    .filter((item) => `${item.label} ${item.section}`.toLowerCase().includes(term))
    .slice(0, 7);
}

function renderTopbarSearchResults(value) {
  const panel = document.getElementById("globalSearchResults");
  if (!panel) return;
  const matches = getTopbarSearchMatches(value);
  panel.hidden = !matches.length;
  panel.innerHTML = matches.map((item) => `
    <a href="${esc(item.href)}" data-topbar-search-result>
      ${icon(item.icon)}
      <span><strong>${esc(item.label)}</strong><small>${esc(item.section)}</small></span>
    </a>
  `).join("");
}

function toggleTopbarMenu(menu) {
  const notifications = document.getElementById("topNotificationsMenu");
  const profile = document.getElementById("topProfileMenu");
  const notificationsButton = document.getElementById("topNotificationsBtn");
  const profileButton = document.getElementById("topProfileBtn");
  const target = menu === "notifications" ? notifications : profile;
  const isOpening = Boolean(target?.hidden);
  closeTopbarMenus();
  if (target && isOpening) target.hidden = false;
  notificationsButton?.setAttribute("aria-expanded", menu === "notifications" && isOpening ? "true" : "false");
  profileButton?.setAttribute("aria-expanded", menu === "profile" && isOpening ? "true" : "false");
}

function closeTopbarMenus() {
  const searchResults = document.getElementById("globalSearchResults");
  const notifications = document.getElementById("topNotificationsMenu");
  const profile = document.getElementById("topProfileMenu");
  const notificationsButton = document.getElementById("topNotificationsBtn");
  const profileButton = document.getElementById("topProfileBtn");
  if (searchResults) searchResults.hidden = true;
  if (notifications) notifications.hidden = true;
  if (profile) profile.hidden = true;
  notificationsButton?.setAttribute("aria-expanded", "false");
  profileButton?.setAttribute("aria-expanded", "false");
}

async function uploadTopbarAvatar(file) {
  if (!suiteSupabase) {
    setTopbarProfileMessage("Supabase config is missing.", true);
    return;
  }
  if (!file.type.startsWith("image/")) {
    setTopbarProfileMessage("Choose an image file.", true);
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    setTopbarProfileMessage("Use an image smaller than 5 MB.", true);
    return;
  }
  if (!topbarState.user) await loadTopbarProfile();
  const user = topbarState.user;
  if (!user) {
    setTopbarProfileMessage("Sign in before uploading a profile picture.", true);
    return;
  }

  setTopbarProfileMessage("Uploading picture...");
  const path = `${user.id}/${Date.now()}-${safeStorageFileName(file.name)}`;
  const { error: uploadError } = await suiteSupabase.storage
    .from("profile-avatars")
    .upload(path, file, { cacheControl: "3600", contentType: file.type, upsert: true });
  if (uploadError) {
    setTopbarProfileMessage("Unable to upload picture: " + uploadError.message, true);
    return;
  }

  const { data: publicData } = suiteSupabase.storage.from("profile-avatars").getPublicUrl(path);
  const avatarUrl = publicData?.publicUrl || "";
  let result = await suiteSupabase
    .from("profiles")
    .update({ avatar_url: avatarUrl, avatar_path: path })
    .eq("id", user.id)
    .select("role,full_name,email,avatar_url,avatar_path")
    .maybeSingle();

  if (result.error && isMissingTopbarAvatarColumn(result.error)) {
    await suiteSupabase.auth.updateUser({ data: { avatar_url: avatarUrl } });
    result = { data: { ...topbarState.profile, avatar_url: avatarUrl }, error: null };
  }

  if (result.error) {
    setTopbarProfileMessage("Uploaded, but profile update failed: " + result.error.message, true);
    return;
  }

  topbarState.profile = result.data || { ...topbarState.profile, avatar_url: avatarUrl };
  applyTopbarProfile();
  setTopbarProfileMessage("Profile picture updated.");
}

async function signOutTopbarUser() {
  if (suiteSupabase) {
    await suiteSupabase.auth.signOut();
  }
  window.location.href = "login.html";
}

function setTopbarProfileMessage(text, isError = false) {
  const message = document.getElementById("topProfileMessage");
  if (!message) return;
  message.textContent = text || "";
  message.classList.toggle("error", Boolean(isError));
}

function safeStorageFileName(name) {
  return String(name || "avatar.png").toLowerCase().replace(/[^a-z0-9.]+/g, "-").replace(/^-|-$/g, "") || "avatar.png";
}

function initialsFromName(value) {
  const parts = String(value || "")
    .split(/[\s@._-]+/)
    .filter(Boolean);
  if (!parts.length) return "TA";
  return parts.slice(0, 2).map((part) => part[0].toUpperCase()).join("");
}

function isMissingTopbarAvatarColumn(error) {
  const message = String(error?.message || "").toLowerCase();
  return message.includes("avatar_url") || message.includes("avatar_path") || message.includes("schema cache");
}

function initScheduleViews() {
  const buttons = Array.from(document.querySelectorAll("[data-schedule-view]"));
  const panels = Array.from(document.querySelectorAll("[data-schedule-panel]"));
  const layout = document.querySelector("[data-schedule-layout]");
  if (!buttons.length || !panels.length || !layout) return;

  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      const view = button.dataset.scheduleView;
      buttons.forEach((item) => item.classList.toggle("active", item === button));
      panels.forEach((panel) => {
        const isActive = panel.dataset.schedulePanel === view;
        panel.hidden = !isActive;
        panel.classList.toggle("is-active", isActive);
      });
      layout.classList.toggle("is-month", view === "month");
    });
  });
}

function initNavSectionToggles() {
  const toggles = Array.from(document.querySelectorAll("[data-nav-section-toggle]"));
  if (!toggles.length) return;

  toggles.forEach((toggle) => {
    toggle.addEventListener("click", () => {
      const key = toggle.dataset.navSectionToggle;
      const links = document.querySelector(`[data-nav-section="${key}"]`);
      const isExpanded = toggle.getAttribute("aria-expanded") === "true";
      const collapsedSections = readStoredCollapsedNavSections();

      toggle.setAttribute("aria-expanded", isExpanded ? "false" : "true");
      toggle.closest(".nav-section-group")?.classList.toggle("collapsed", isExpanded);
      if (links) {
        links.hidden = isExpanded;
      }

      if (isExpanded) {
        collapsedSections.add(key);
      } else {
        collapsedSections.delete(key);
      }
      saveCollapsedNavSections(collapsedSections);
    });
  });
}

function renderApp() {
  const activeKey = getPageKey();
  const page = pages[activeKey] || pages["command-center"];
  document.title = `${page.title} | Turnly Admin`;

  const app = document.getElementById("adminSuiteApp");
  if (!app) return;

  app.innerHTML = `
    <div class="admin-suite-shell">
      ${renderSidebar(activeKey)}
      <main class="suite-main">
        ${renderTopbar(page)}
        <div class="suite-content">${page.render()}</div>
      </main>
    </div>
  `;

  initNavSectionToggles();
  initTopbar();

  if (activeKey === "schedule") {
    initScheduleViews();
  }
  if (activeKey === "dashboard" || activeKey === "command-center") {
    initCommandCenter();
  }
  if (activeKey === "assignments") {
    initAssignments();
  }
  if (activeKey === "property-units") {
    initPropertyUnits();
  }
  if (activeKey === "checklists") {
    initChecklists();
  }
  if (activeKey === "leads") {
    initLeads();
  }
  if (activeKey === "walkthroughs") {
    initWalkthroughs();
  }
  if (activeKey === "client-directory") {
    initClientDirectory();
  }
}

renderApp();
