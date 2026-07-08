import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const env = window.__ENV || {};
const supabase = env.SUPABASE_URL && env.SUPABASE_ANON_KEY
  ? createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY)
  : null;

const params = new URLSearchParams(window.location.search);
const state = {
  profile: null,
  contractor: null,
  invite: null,
  assignments: [],
  documents: [],
  media: [],
  optionalErrors: [],
  activeTab: "overview",
  message: "",
  messageError: false,
  savingId: ""
};

const tabs = [
  ["overview", "Overview"],
  ["onboarding", "Onboarding"],
  ["documents", "Documents"],
  ["availability", "Availability"],
  ["performance", "Performance"],
  ["jobs", "Jobs"],
  ["schedule", "Schedule"],
  ["pay", "Pay"]
];

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function token(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function title(value) {
  return String(value || "")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function money(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return "$0";
  return number.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function dateValue(value, fallback = 0) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date.getTime();
}

function formatDate(value, fallback = "Not recorded") {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return date.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

function formatTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function formatWindow(row) {
  const day = formatDate(row?.start_window, "Not scheduled");
  const start = formatTime(row?.start_window);
  const end = formatTime(row?.end_window);
  return `${day}${start ? `, ${start}` : ""}${end ? ` - ${end}` : ""}`;
}

function metadata(row = {}) {
  if (row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)) return row.metadata;
  if (typeof row.metadata === "string" && row.metadata.trim()) {
    try {
      const parsed = JSON.parse(row.metadata);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

function assignmentPayment(row = {}) {
  const meta = metadata(row);
  return meta.payment && typeof meta.payment === "object" ? meta.payment : {};
}

function assignmentPaidDate(row = {}) {
  const payment = assignmentPayment(row);
  return row.paid_at ||
    row.payout_at ||
    row.payout_date ||
    row.payout_completed_at ||
    row.payment_sent_at ||
    row.statement_paid_at ||
    row.paid_on ||
    payment.paid_at ||
    "";
}

function assignmentPaymentStatus(row = {}) {
  const payment = assignmentPayment(row);
  return token(row.payment_status || row.pay_status || row.payout_status || row.invoice_status || payment.status || "");
}

function isPaid(row = {}) {
  const status = assignmentPaymentStatus(row);
  return Boolean(
    assignmentPaidDate(row) ||
    row.paid === true ||
    row.is_paid === true ||
    row.paid_out === true ||
    assignmentPayment(row).paid === true ||
    ["paid", "paid-out", "payout-paid", "payout-sent", "settled"].includes(status)
  );
}

function isCompleted(row = {}) {
  return ["completed", "complete", "done"].includes(token(row.status)) || Boolean(row.completed_at || row.completed_by || row.checklist_completed_at);
}

function isClosed(row = {}) {
  return isCompleted(row) || ["cancelled", "canceled", "declined", "closed"].includes(token(row.status));
}

function contractorName() {
  return state.profile?.full_name ||
    state.contractor?.full_name ||
    state.contractor?.name ||
    state.contractor?.contractor_name ||
    state.profile?.email ||
    state.contractor?.email ||
    "Contractor";
}

function contractorEmail() {
  return String(state.profile?.email || state.contractor?.email || params.get("email") || "");
}

function contractorIdSet() {
  return new Set([
    params.get("profileId"),
    params.get("id"),
    state.profile?.id,
    state.contractor?.profile_id,
    state.contractor?.user_id,
    state.contractor?.auth_user_id,
    state.contractor?.id
  ].filter(Boolean).map(String));
}

function contractorStatus() {
  if (state.profile?.contractor_approved || state.contractor?.contractor_approved) return "active";
  const status = token(state.profile?.status || state.contractor?.status || state.contractor?.approval_status || state.invite?.status || "");
  if (["active", "approved", "enabled", "onboarded"].includes(status)) return "active";
  if (status) return status;
  return "pending";
}

function contractorService() {
  const row = state.contractor || state.profile || {};
  return Array.isArray(row.service_types)
    ? row.service_types.filter(Boolean).join(", ")
    : row.service_type || row.services || row.specialties || row.department || row.title || "Contractor";
}

function contractorCompany() {
  return state.contractor?.company_name || state.contractor?.business_name || state.contractor?.company || state.profile?.company_name || "";
}

function contractorLocation() {
  return state.contractor?.market || state.contractor?.region || state.contractor?.location || state.profile?.market || state.profile?.region || "";
}

function contractorPhone() {
  return state.profile?.phone || state.contractor?.phone || state.contractor?.contact_phone || "";
}

function message(text, isError = false) {
  state.message = text || "";
  state.messageError = Boolean(isError);
  const node = document.getElementById("contractorFileMessage");
  if (node) {
    node.textContent = state.message;
    node.classList.toggle("error", state.messageError);
  }
}

function setTitle() {
  const titleNode = document.querySelector(".page-heading h1");
  const subtitleNode = document.querySelector(".page-heading p");
  if (titleNode) titleNode.textContent = contractorName();
  if (subtitleNode) subtitleNode.textContent = [contractorEmail(), contractorService()].filter(Boolean).join(" - ") || "Contractor file";
  document.title = `${contractorName()} | Contractor File`;
}

function tableRows(rows, columns, emptyText) {
  if (!rows.length) return `<div class="contractor-file-empty">${esc(emptyText)}</div>`;
  return `
    <div class="table-scroll contractor-file-table-wrap">
      <table class="suite-table contractor-file-table">
        <thead><tr>${columns.map((column) => `<th>${esc(column[0])}</th>`).join("")}</tr></thead>
        <tbody>
          ${rows.map((row) => `<tr>${columns.map(([, render]) => `<td>${render(row)}</td>`).join("")}</tr>`).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function metric(label, value, meta, tone = "blue") {
  return `
    <article class="metric-card ${esc(tone)}">
      <div class="metric-icon-wrap">${esc(label.split(/\s+/).map((word) => word[0]).join("").slice(0, 2).toUpperCase())}</div>
      <div class="metric-body"><span>${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(meta)}</small></div>
    </article>
  `;
}

function panel(titleText, body, action = "") {
  return `
    <section class="suite-panel contractor-file-panel">
      <div class="panel-head">
        <div><h2>${esc(titleText)}</h2></div>
        ${action}
      </div>
      ${body}
    </section>
  `;
}

function activeJobs() {
  return state.assignments
    .filter((row) => !isClosed(row))
    .sort((a, b) => dateValue(a.start_window, Number.MAX_SAFE_INTEGER) - dateValue(b.start_window, Number.MAX_SAFE_INTEGER));
}

function completedJobs() {
  return state.assignments
    .filter(isCompleted)
    .sort((a, b) => dateValue(b.completed_at || b.end_window || b.updated_at) - dateValue(a.completed_at || a.end_window || a.updated_at));
}

function scheduleJobs() {
  return activeJobs().filter((row) => dateValue(row.start_window) >= Date.now() - 24 * 60 * 60 * 1000);
}

function payRows() {
  return state.assignments
    .filter((row) => Number(row.pay_amount) > 0)
    .sort((a, b) => dateValue(b.completed_at || b.end_window || b.start_window || b.updated_at) - dateValue(a.completed_at || a.end_window || a.start_window || a.updated_at));
}

function totalPay(rows) {
  return rows.reduce((sum, row) => sum + (Number(row.pay_amount) || 0), 0);
}

function render() {
  const root = document.querySelector("[data-contractor-file-page]");
  if (!root) return;
  setTitle();
  const active = activeJobs();
  const completed = completedJobs();
  const paid = payRows().filter(isPaid);
  const owed = completed.filter((row) => Number(row.pay_amount) > 0 && !isPaid(row));
  root.innerHTML = `
    <div class="contractor-file-hero">
      <div>
        <a class="secondary-action contractor-file-back" href="directory.html"><span>Back to Directory</span></a>
        <h1>${esc(contractorName())}</h1>
        <p>${esc([contractorEmail(), contractorPhone(), contractorCompany()].filter(Boolean).join(" - ") || "Contractor profile")}</p>
        <div class="contractor-file-badges">
          <span class="status-badge status-${esc(token(contractorStatus()))}">${esc(title(contractorStatus()))}</span>
          <span class="status-badge status-blue">${esc(contractorService())}</span>
          ${contractorLocation() ? `<span class="status-badge status-purple">${esc(contractorLocation())}</span>` : ""}
        </div>
      </div>
      <div class="contractor-file-quick">
        <strong>${esc(money(totalPay(owed)))}</strong>
        <small>completed owed</small>
      </div>
    </div>
    <p id="contractorFileMessage" class="status-message ${state.messageError ? "error" : ""}">${esc(state.message)}</p>
    <section class="metric-strip six contractor-file-metrics">
      ${metric("Active Jobs", active.length.toLocaleString(), "accepted or scheduled", "blue")}
      ${metric("Completed", completed.length.toLocaleString(), "all time", "green")}
      ${metric("Completed Owed", money(totalPay(owed)), `${owed.length} unpaid job(s)`, "yellow")}
      ${metric("Paid Out", money(totalPay(paid)), `${paid.length} paid job(s)`, "green")}
      ${metric("Documents", state.documents.length.toLocaleString(), "records found", "purple")}
      ${metric("Media", state.media.length.toLocaleString(), "photos and videos", "blue")}
    </section>
    <div class="suite-tabs contractor-file-tabs" role="tablist">
      ${tabs.map(([key, label]) => `<button class="suite-tab ${state.activeTab === key ? "active" : ""}" type="button" data-contractor-file-tab="${esc(key)}">${esc(label)}</button>`).join("")}
    </div>
    <div class="contractor-file-tab-body">${renderActiveTab()}</div>
  `;
}

function renderActiveTab() {
  if (state.activeTab === "onboarding") return renderOnboarding();
  if (state.activeTab === "documents") return renderDocuments();
  if (state.activeTab === "availability") return renderAvailability();
  if (state.activeTab === "performance") return renderPerformance();
  if (state.activeTab === "jobs") return renderJobs();
  if (state.activeTab === "schedule") return renderSchedule();
  if (state.activeTab === "pay") return renderPay();
  return renderOverview();
}

function detailGrid(items) {
  return `<div class="contractor-file-detail-grid">${items.map(([label, value]) => `<div><span>${esc(label)}</span><strong>${esc(value || "-")}</strong></div>`).join("")}</div>`;
}

function renderOverview() {
  return `
    <section class="contractor-file-grid">
      ${panel("Profile", detailGrid([
        ["Name", contractorName()],
        ["Email", contractorEmail()],
        ["Phone", contractorPhone()],
        ["Company", contractorCompany()],
        ["Service Types", contractorService()],
        ["Market", contractorLocation()],
        ["Source", state.profile ? "Registered account" : "Directory record"],
        ["Status", title(contractorStatus())]
      ]))}
      ${panel("Current Work", assignmentList(activeJobs().slice(0, 6), "No active jobs assigned."))}
      ${panel("Recent Completed Jobs", assignmentList(completedJobs().slice(0, 6), "No completed jobs yet."))}
      ${panel("Pay Snapshot", renderPaySummary())}
    </section>
  `;
}

function renderOnboarding() {
  const approved = contractorStatus() === "active";
  const steps = [
    ["Profile created", Boolean(state.profile || state.contractor), state.profile?.created_at || state.contractor?.created_at],
    ["Invite accepted", Boolean(state.profile || state.invite?.status === "accepted"), state.invite?.accepted_at],
    ["Contractor approved", approved, state.profile?.contractor_approved_at || state.contractor?.contractor_approved_at],
    ["Ready for assignments", approved, ""]
  ];
  return panel("Onboarding Process", `
    <div class="contractor-file-step-list">
      ${steps.map(([label, complete, date]) => `
        <div class="contractor-file-step ${complete ? "is-complete" : ""}">
          <span>${complete ? "OK" : ""}</span>
          <div><strong>${esc(label)}</strong><small>${esc(date ? formatDate(date) : complete ? "Complete" : "Pending")}</small></div>
        </div>
      `).join("")}
    </div>
    ${detailGrid([
      ["Invite Status", state.invite?.status ? title(state.invite.status) : "No invite record"],
      ["Auto Approved", state.invite?.auto_approve ? "Yes" : "No"],
      ["Approved", approved ? "Yes" : "No"],
      ["Profile Role", state.profile?.role || state.contractor?.role || "contractor"]
    ])}
  `);
}

function renderDocuments() {
  const documentTable = tableRows(state.documents, [
    ["Document", (row) => `<strong>${esc(row.title || row.name || row.document_name || row.file_name || row.type || "Document")}</strong><small>${esc(row.notes || row.description || row.document_type || "")}</small>`],
    ["Status", (row) => esc(title(row.status || row.approval_status || row.compliance_status || "recorded"))],
    ["Expires", (row) => esc(formatDate(row.expiration_date || row.expires_at || row.expires_on, "No expiration"))],
    ["Uploaded", (row) => esc(formatDate(row.uploaded_at || row.created_at || row.updated_at))],
    ["Source", (row) => esc(row.__sourceTable || "Supabase")]
  ], "No contractor document records found yet.");
  const mediaTable = tableRows(state.media, [
    ["Media", (row) => `<strong>${esc(row.title || row.label || row.file_name || row.video_phase || row.photo_type || "Upload")}</strong><small>${esc(row.notes || row.property_name || "")}</small>`],
    ["Type", (row) => esc(row.__sourceTable === "qa_videos" ? "Video" : "Photo")],
    ["Assignment", (row) => esc(row.assignment_id || "-")],
    ["Recorded", (row) => esc(formatDate(row.recorded_at || row.created_at || row.updated_at))],
    ["Source", (row) => esc(row.__sourceTable)]
  ], "No QA photo or video uploads found for this contractor.");
  return `
    <section class="contractor-file-grid">
      ${panel("Documents & Compliance", documentTable)}
      ${panel("Photo & Video Uploads", mediaTable)}
    </section>
  `;
}

function renderAvailability() {
  return `
    <section class="contractor-file-grid">
      ${panel("Availability", detailGrid([
        ["Availability Status", state.contractor?.availability_status || state.profile?.availability_status || "Not set"],
        ["Preferred Days", state.contractor?.preferred_days || state.profile?.preferred_days || "Not set"],
        ["Preferred Market", contractorLocation() || "Not set"],
        ["Notes", state.contractor?.availability_notes || state.profile?.availability_notes || state.contractor?.notes || "No availability notes"]
      ]))}
      ${panel("Upcoming Schedule", assignmentTable(scheduleJobs(), "No upcoming assignments found."))}
    </section>
  `;
}

function renderPerformance() {
  const completed = completedJobs();
  const active = activeJobs();
  const completionRate = state.assignments.length ? Math.round((completed.length / state.assignments.length) * 100) : 0;
  return `
    <section class="metric-strip four">
      ${metric("Completion Rate", `${completionRate}%`, "completed vs total", "green")}
      ${metric("Active Jobs", active.length.toLocaleString(), "current workload", "blue")}
      ${metric("Completed Pay", money(totalPay(completed)), "completed work", "green")}
      ${metric("QA Uploads", state.media.length.toLocaleString(), "photos and videos", "purple")}
    </section>
    ${panel("Performance History", assignmentTable(completed, "No completed assignment history yet."))}
  `;
}

function renderJobs() {
  return `
    <section class="contractor-file-grid">
      ${panel("Accepted Jobs", assignmentTable(activeJobs(), "No accepted or active jobs."))}
      ${panel("Completed Jobs", assignmentTable(completedJobs(), "No completed jobs."))}
    </section>
  `;
}

function renderSchedule() {
  return panel("Contractor Schedule", assignmentTable(scheduleJobs(), "No upcoming assignments on this contractor schedule."));
}

function renderPay() {
  return `
    <section class="metric-strip four">
      ${metric("Accepted Pay", money(totalPay(activeJobs())), `${activeJobs().length} active job(s)`, "blue")}
      ${metric("Completed Owed", money(totalPay(completedJobs().filter((row) => !isPaid(row)))), "not paid yet", "yellow")}
      ${metric("Paid Out", money(totalPay(payRows().filter(isPaid))), "marked paid", "green")}
      ${metric("YTD Completed", money(totalPay(completedJobs().filter((row) => new Date(row.completed_at || row.updated_at).getFullYear() === new Date().getFullYear()))), "this year", "purple")}
    </section>
    ${panel("Admin Pay Controls", payTable())}
  `;
}

function renderPaySummary() {
  const rows = payRows();
  const paid = rows.filter(isPaid);
  const owed = completedJobs().filter((row) => Number(row.pay_amount) > 0 && !isPaid(row));
  return detailGrid([
    ["Accepted Job Pay", money(totalPay(activeJobs()))],
    ["Completed Owed", money(totalPay(owed))],
    ["Paid Out", money(totalPay(paid))],
    ["Paid Jobs", paid.length.toLocaleString()]
  ]);
}

function assignmentTitle(row) {
  return row.property_name || row.title || "Assignment";
}

function assignmentList(rows, emptyText) {
  if (!rows.length) return `<div class="contractor-file-empty">${esc(emptyText)}</div>`;
  return `
    <div class="contractor-file-list">
      ${rows.map((row) => `
        <article>
          <div><strong>${esc(assignmentTitle(row))}</strong><small>${esc(formatWindow(row))}</small></div>
          <span>${esc(money(row.pay_amount))}</span>
        </article>
      `).join("")}
    </div>
  `;
}

function assignmentTable(rows, emptyText) {
  return tableRows(rows, [
    ["Assignment", (row) => `<strong>${esc(assignmentTitle(row))}</strong><small>${esc([row.address, row.service_type].filter(Boolean).join(" - "))}</small>`],
    ["Schedule", (row) => esc(formatWindow(row))],
    ["Status", (row) => esc(title(row.status || "open"))],
    ["Pay", (row) => esc(money(row.pay_amount))],
    ["Payment", (row) => esc(isPaid(row) ? `Paid ${formatDate(assignmentPaidDate(row), "")}` : "Unpaid")]
  ], emptyText);
}

function payTable() {
  const rows = payRows();
  return tableRows(rows, [
    ["Assignment", (row) => `<strong>${esc(assignmentTitle(row))}</strong><small>${esc(formatWindow(row))}</small>`],
    ["Status", (row) => esc(title(row.status || "open"))],
    ["Amount", (row) => esc(money(row.pay_amount))],
    ["Payment", (row) => esc(isPaid(row) ? `Paid ${formatDate(assignmentPaidDate(row), "")}` : "Unpaid")],
    ["Action", (row) => `<button class="${isPaid(row) ? "secondary-action" : "primary-action"}" type="button" data-pay-toggle="${esc(row.id)}" ${state.savingId === row.id ? "disabled" : ""}><span>${esc(isPaid(row) ? "Mark Unpaid" : "Mark Paid")}</span></button>`]
  ], "No payable assignments found for this contractor.");
}

function assignmentMatchesContractor(row) {
  const ids = contractorIdSet();
  const email = contractorEmail().toLowerCase();
  const name = contractorName().toLowerCase();
  const meta = metadata(row);
  const metadataIds = Array.isArray(meta.assigned_contractor_ids) ? meta.assigned_contractor_ids : [];
  const preferredIds = Array.isArray(row.preferred_contractor_ids) ? row.preferred_contractor_ids : [];
  const idValues = [
    row.claimed_by,
    row.assigned_to,
    row.completed_by,
    row.started_by,
    ...metadataIds,
    ...preferredIds
  ].filter(Boolean).map(String);
  if (idValues.some((id) => ids.has(id))) return true;
  const emailValues = [row.claimed_by_email, row.assigned_to_email].filter(Boolean).map((value) => String(value).toLowerCase());
  if (email && emailValues.includes(email)) return true;
  const nameValues = [row.claimed_by_name, row.assigned_to_name, ...(Array.isArray(row.preferred_contractor_names) ? row.preferred_contractor_names : [])]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase());
  return Boolean(name && nameValues.includes(name));
}

function personMatches(row) {
  const ids = contractorIdSet();
  const email = contractorEmail().toLowerCase();
  return ids.has(String(row.id || "")) ||
    ids.has(String(row.profile_id || "")) ||
    ids.has(String(row.user_id || "")) ||
    ids.has(String(row.auth_user_id || "")) ||
    ids.has(String(row.contractor_id || "")) ||
    ids.has(String(row.uploaded_by || "")) ||
    ids.has(String(row.assigned_contractor_id || "")) ||
    (email && String(row.email || row.contractor_email || row.contact_email || "").toLowerCase() === email);
}

async function fetchAll(table, select = "*", order = null) {
  if (!supabase) return [];
  let query = supabase.from(table).select(select).limit(1000);
  if (order) query = query.order(order, { ascending: false });
  const { data, error } = await query;
  if (error) {
    state.optionalErrors.push(`${table}: ${error.message}`);
    return [];
  }
  return (data || []).map((row) => ({ ...row, __sourceTable: table }));
}

async function fetchProfile() {
  const profileId = params.get("profileId") || (params.get("source") === "profiles" ? params.get("id") : "");
  const email = params.get("email");
  if (profileId) {
    const { data, error } = await supabase.from("profiles").select("*").eq("id", profileId).maybeSingle();
    if (!error && data) return data;
  }
  if (email) {
    const { data, error } = await supabase.from("profiles").select("*").ilike("email", email).maybeSingle();
    if (!error && data) return data;
  }
  return null;
}

async function fetchInvite() {
  const email = contractorEmail() || params.get("email");
  if (!email) return null;
  const { data, error } = await supabase.from("contractor_invites").select("*").ilike("email", email).maybeSingle();
  return error ? null : data;
}

async function loadData() {
  if (!supabase) {
    message("Supabase config is missing. Add env.js values before using contractor files.", true);
    return;
  }
  message("Loading contractor file...");
  state.profile = await fetchProfile();
  const contractorRows = await fetchAll("contractors");
  state.contractor = contractorRows.find(personMatches) || null;
  state.invite = await fetchInvite();
  const assignments = await fetchAll("assignment_blocks", "*", "start_window");
  state.assignments = assignments.filter(assignmentMatchesContractor);
  const docRows = (await Promise.all([
    fetchAll("contractor_documents"),
    fetchAll("compliance_documents"),
    fetchAll("documents"),
    fetchAll("contractor_files")
  ])).flat();
  state.documents = docRows.filter(personMatches);
  const mediaRows = (await Promise.all([
    fetchAll("qa_videos", "*", "created_at"),
    fetchAll("qa_photos", "*", "created_at")
  ])).flat();
  state.media = mediaRows.filter((row) => {
    if (personMatches(row)) return true;
    const assignmentIds = new Set(state.assignments.map((assignment) => String(assignment.id)));
    return assignmentIds.has(String(row.assignment_id || ""));
  });
  message(state.optionalErrors.length ? "Loaded contractor file. Some optional tables are not available yet." : "Contractor file synced from Supabase.");
  render();
}

function missingColumn(error) {
  const msg = String(error?.message || "");
  return msg.match(/Could not find the '([^']+)' column/)?.[1] || msg.match(/column "([^"]+)"/)?.[1] || "";
}

async function updateAssignmentWithFallback(id, payload) {
  const next = { ...payload };
  for (let index = 0; index < 14; index += 1) {
    const { data, error } = await supabase
      .from("assignment_blocks")
      .update(next)
      .eq("id", id)
      .select("*")
      .maybeSingle();
    if (!error) return { data, error: null };
    const missing = missingColumn(error);
    if (missing && missing in next && Object.keys(next).length > 1) {
      delete next[missing];
      continue;
    }
    return { data: null, error };
  }
  return { data: null, error: new Error("Unable to update assignment payment fields.") };
}

async function togglePaid(id) {
  const row = state.assignments.find((item) => String(item.id) === String(id));
  if (!row || state.savingId) return;
  const nextPaid = !isPaid(row);
  const label = nextPaid ? "mark this assignment paid" : "mark this assignment unpaid";
  if (!window.confirm(`Are you sure you want to ${label}?`)) return;
  state.savingId = id;
  render();
  const { data: userData } = await supabase.auth.getUser();
  const now = new Date().toISOString();
  const currentMetadata = metadata(row);
  const payment = nextPaid
    ? {
      status: "paid",
      paid: true,
      paid_at: now,
      paid_by: userData?.user?.id || null,
      paid_amount: Number(row.pay_amount) || 0
    }
    : {
      status: "unpaid",
      paid: false,
      paid_at: null,
      paid_by: null,
      paid_amount: 0
    };
  const payload = {
    metadata: { ...currentMetadata, payment },
    payment_status: nextPaid ? "paid" : "unpaid",
    pay_status: nextPaid ? "paid" : "unpaid",
    payout_status: nextPaid ? "paid" : "unpaid",
    paid_at: nextPaid ? now : null,
    paid_by: nextPaid ? userData?.user?.id || null : null,
    paid_amount: nextPaid ? Number(row.pay_amount) || 0 : null,
    paid_out: nextPaid,
    paid_notes: nextPaid ? "Marked paid from admin contractor file." : "Marked unpaid from admin contractor file."
  };
  const result = await updateAssignmentWithFallback(id, payload);
  state.savingId = "";
  if (result.error) {
    message(`Unable to update payment: ${result.error.message}`, true);
    render();
    return;
  }
  state.assignments = state.assignments.map((item) => item.id === id ? { ...item, ...(result.data || payload) } : item);
  message(nextPaid ? "Assignment marked paid." : "Assignment marked unpaid.");
  render();
}

function injectStyles() {
  if (document.getElementById("contractorFileStyles")) return;
  const style = document.createElement("style");
  style.id = "contractorFileStyles";
  style.textContent = `
    .contractor-file-workspace{display:grid;gap:14px}.contractor-file-hero{align-items:end;background:rgba(17,32,50,.92);border:1px solid var(--suite-border);border-radius:8px;display:flex;gap:16px;justify-content:space-between;padding:18px}.contractor-file-hero h1{font-size:26px;margin:12px 0 6px}.contractor-file-hero p{color:var(--suite-soft);margin:0}.contractor-file-badges{display:flex;flex-wrap:wrap;gap:7px;margin-top:10px}.contractor-file-back{display:inline-flex;width:auto}.contractor-file-quick{background:rgba(0,214,166,.1);border:1px solid rgba(0,214,166,.3);border-radius:8px;padding:14px 18px;text-align:right}.contractor-file-quick strong{color:var(--suite-green);display:block;font-size:24px}.contractor-file-quick small{color:var(--suite-soft);font-weight:800;text-transform:uppercase}.contractor-file-tabs{margin-top:2px}.contractor-file-grid{display:grid;gap:14px;grid-template-columns:repeat(2,minmax(0,1fr))}.contractor-file-panel .panel-head{padding-bottom:10px}.contractor-file-detail-grid{display:grid;gap:10px;grid-template-columns:repeat(2,minmax(0,1fr))}.contractor-file-detail-grid div{background:rgba(7,18,32,.55);border:1px solid var(--suite-border-soft);border-radius:8px;padding:10px}.contractor-file-detail-grid span{color:var(--suite-soft);display:block;font-size:11px;font-weight:900;text-transform:uppercase}.contractor-file-detail-grid strong{display:block;margin-top:4px}.contractor-file-list{display:grid;gap:8px}.contractor-file-list article{align-items:center;background:rgba(7,18,32,.55);border:1px solid var(--suite-border-soft);border-radius:8px;display:flex;justify-content:space-between;padding:10px}.contractor-file-list small,.contractor-file-table small{color:var(--suite-soft);display:block;font-size:11px;margin-top:3px}.contractor-file-empty{border:1px dashed var(--suite-border-soft);border-radius:8px;color:var(--suite-soft);padding:18px;text-align:center}.contractor-file-step-list{display:grid;gap:10px;margin-bottom:14px}.contractor-file-step{align-items:center;background:rgba(7,18,32,.55);border:1px solid var(--suite-border-soft);border-radius:8px;display:flex;gap:10px;padding:10px}.contractor-file-step>span{align-items:center;border:1px solid var(--suite-border);border-radius:999px;display:inline-flex;height:28px;justify-content:center;width:28px}.contractor-file-step.is-complete>span{background:var(--suite-green);border-color:var(--suite-green);color:#041d15}.contractor-file-step small{color:var(--suite-soft);display:block}.contractor-file-table-wrap{max-height:520px}.contractor-file-tab-body{display:grid;gap:14px}@media(max-width:1050px){.contractor-file-grid{grid-template-columns:1fr}.contractor-file-hero{align-items:start;display:grid}.contractor-file-quick{text-align:left}.contractor-file-detail-grid{grid-template-columns:1fr}}
  `;
  document.head.appendChild(style);
}

function bind() {
  document.addEventListener("click", (event) => {
    const tab = event.target.closest("[data-contractor-file-tab]");
    if (tab) {
      state.activeTab = tab.dataset.contractorFileTab || "overview";
      render();
      return;
    }
    const pay = event.target.closest("[data-pay-toggle]");
    if (pay) {
      void togglePaid(pay.dataset.payToggle);
    }
  });
}

function start() {
  injectStyles();
  bind();
  void loadData();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start, { once: true });
} else {
  start();
}
