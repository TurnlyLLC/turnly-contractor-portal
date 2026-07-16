import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const env = window.__ENV || {};
const supabase = env.SUPABASE_URL && env.SUPABASE_ANON_KEY
  ? createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY)
  : null;

const params = new URLSearchParams(window.location.search);
const DOCUMENT_BUCKET = "contractor-documents";
const PERFORMANCE_BUCKET = "contractor-performance";

const state = {
  profile: null,
  contractor: null,
  invite: null,
  assignments: [],
  documents: [],
  media: [],
  performanceRows: [],
  optionalErrors: [],
  activeTab: "overview",
  editingProfile: false,
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
  return number.toLocaleString(undefined, { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 2 });
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

function inputDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
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

function positiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function firstMoneyValue(values, allowZero = false) {
  const found = values.find((value) => {
    if (value === null || value === undefined || value === "") return false;
    const number = Number(value);
    return Number.isFinite(number) && (allowZero ? number >= 0 : number > 0);
  });
  return found === undefined ? 0 : Number(found);
}

function paymentPaidAmount(row = {}) {
  const payment = assignmentPayment(row);
  const stored = firstMoneyValue([
    row.paid_amount,
    row.payout_amount,
    row.amount_paid,
    payment.paid_amount,
    payment.payout_amount,
    payment.amount_paid
  ]);
  return stored || (isPaid(row) ? paymentNetAmount(row) : 0);
}

function paymentAddedFeeAmount(row = {}) {
  const payment = assignmentPayment(row);
  return firstMoneyValue([
    row.added_fee_amount,
    row.fees_added,
    row.income_fee_amount,
    row.heavy_soil_fee_amount,
    payment.added_fee_amount,
    payment.fees_added,
    payment.income_fee_amount,
    payment.heavy_soil_fee_amount
  ], true);
}

function paymentFeeAmount(row = {}) {
  const payment = assignmentPayment(row);
  return firstMoneyValue([
    row.cleaner_fee_amount,
    row.fees_taken,
    row.fee_amount,
    payment.cleaner_fee_amount,
    payment.fees_taken,
    payment.fee_amount
  ], true);
}

function paymentNetAmount(row = {}) {
  return Math.max(0, positiveNumber(row.pay_amount) + paymentAddedFeeAmount(row) - paymentFeeAmount(row));
}

function paymentNotes(row = {}) {
  const payment = assignmentPayment(row);
  return String(row.payment_notes || row.paid_notes || row.fee_notes || payment.notes || payment.payment_notes || payment.fee_notes || "").trim();
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

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ""));
}

function contractorKey() {
  return String(
    state.profile?.id ||
    state.contractor?.profile_id ||
    state.contractor?.user_id ||
    state.contractor?.auth_user_id ||
    state.contractor?.id ||
    params.get("profileId") ||
    params.get("id") ||
    contractorEmail() ||
    contractorName()
  );
}

function profileId() {
  const id = state.profile?.id || params.get("profileId") || "";
  return isUuid(id) ? id : null;
}

function contractorUuid() {
  const ids = [
    state.contractor?.user_id,
    state.contractor?.auth_user_id,
    state.contractor?.profile_id,
    state.contractor?.id,
    state.profile?.id,
    params.get("id")
  ];
  return ids.find(isUuid) || null;
}

function formText(form, name) {
  return String(form.elements[name]?.value || "").trim();
}

function formNumber(form, name) {
  const value = Number(form.elements[name]?.value);
  return Number.isFinite(value) ? value : null;
}

function cleanPayload(payload) {
  return Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined));
}

function safeFileName(name) {
  const cleaned = String(name || "upload")
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned || "upload";
}

function backgroundDocument() {
  return state.documents.find((row) => {
    const label = `${row.document_type || ""} ${row.title || ""} ${row.name || ""} ${row.document_name || ""}`.toLowerCase();
    return label.includes("background");
  }) || null;
}

function backgroundStatus() {
  return state.profile?.background_check_status ||
    state.contractor?.background_check_status ||
    backgroundDocument()?.status ||
    backgroundDocument()?.approval_status ||
    "not_started";
}

function backgroundNotes() {
  return state.profile?.background_check_notes || state.contractor?.background_check_notes || backgroundDocument()?.notes || "";
}

function backgroundCompleteDate() {
  return state.profile?.background_check_completed_at ||
    state.contractor?.background_check_completed_at ||
    backgroundDocument()?.uploaded_at ||
    backgroundDocument()?.created_at ||
    "";
}

function backgroundCheckComplete() {
  const status = token(backgroundStatus());
  const doc = backgroundDocument();
  const docStatus = token(doc?.status || doc?.approval_status || "");
  return ["approved", "complete", "completed", "clear", "cleared", "passed", "uploaded"].includes(status) ||
    Boolean(doc && !["rejected", "failed", "expired"].includes(docStatus));
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

function storageButton(row, label = "Open") {
  const path = row.storage_path || row.file_path || row.path || "";
  const bucket = row.storage_bucket || row.bucket || "";
  if (!path || !bucket) return "-";
  return `<button class="secondary-action contractor-file-inline-action" type="button" data-open-storage-bucket="${esc(bucket)}" data-open-storage-path="${esc(path)}"><span>${esc(label)}</span></button>`;
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

function totalPaidOut(rows) {
  return rows.reduce((sum, row) => sum + paymentPaidAmount(row), 0);
}

function totalAddedFees(rows) {
  return rows.reduce((sum, row) => sum + paymentAddedFeeAmount(row), 0);
}

function totalFees(rows) {
  return rows.reduce((sum, row) => sum + paymentFeeAmount(row), 0);
}

function totalNetPaid(rows) {
  return rows.reduce((sum, row) => sum + paymentNetAmount(row), 0);
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
      ${metric("Paid Out", money(totalPaidOut(paid)), `${paid.length} paid job(s)`, "green")}
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

function profileForm() {
  const row = state.contractor || state.profile || {};
  const services = contractorService() === "Contractor" ? "" : contractorService();
  const status = contractorStatus();
  return `
    <form class="contractor-file-form" data-profile-form>
      <div class="contractor-file-form-grid">
        <label><span>Name</span><input name="fullName" value="${esc(contractorName() === "Contractor" ? "" : contractorName())}" placeholder="Contractor name" /></label>
        <label><span>Email</span><input name="email" type="email" value="${esc(contractorEmail())}" placeholder="email@example.com" /></label>
        <label><span>Phone</span><input name="phone" value="${esc(contractorPhone())}" placeholder="Phone number" /></label>
        <label><span>Company</span><input name="company" value="${esc(contractorCompany())}" placeholder="Company name" /></label>
        <label><span>Service Types</span><input name="service" value="${esc(services)}" placeholder="Cleaning, inspections, turns" /></label>
        <label><span>Market</span><input name="market" value="${esc(contractorLocation())}" placeholder="Preferred market" /></label>
        <label><span>Status</span><select name="status">
          ${["pending", "active", "inactive", "suspended"].map((option) => `<option value="${esc(option)}" ${token(status) === option ? "selected" : ""}>${esc(title(option))}</option>`).join("")}
        </select></label>
        <label><span>Internal Notes</span><input name="notes" value="${esc(row.notes || state.profile?.notes || "")}" placeholder="Admin notes" /></label>
      </div>
      <div class="contractor-file-form-actions">
        <button class="primary-action" type="submit" ${state.savingId === "profile" ? "disabled" : ""}><span>${state.savingId === "profile" ? "Saving..." : "Save Profile"}</span></button>
      </div>
    </form>
  `;
}

function availabilityForm() {
  const row = state.contractor || state.profile || {};
  const availability = token(row.availability_status || state.profile?.availability_status || "available") || "available";
  return `
    <form class="contractor-file-form" data-availability-form>
      <div class="contractor-file-form-grid">
        <label><span>Availability Status</span><select name="availabilityStatus">
          ${["available", "limited", "unavailable", "paused"].map((option) => `<option value="${esc(option)}" ${availability === option ? "selected" : ""}>${esc(title(option))}</option>`).join("")}
        </select></label>
        <label><span>Preferred Days</span><input name="preferredDays" value="${esc(row.preferred_days || state.profile?.preferred_days || "")}" placeholder="Monday, Wednesday, Saturday" /></label>
        <label><span>Preferred Market</span><input name="market" value="${esc(contractorLocation())}" placeholder="Market or region" /></label>
        <label><span>Capacity</span><input name="capacity" value="${esc(row.weekly_capacity || state.profile?.weekly_capacity || "")}" placeholder="Jobs per week" /></label>
        <label class="contractor-file-field-full"><span>Availability Notes</span><textarea name="availabilityNotes" placeholder="Schedule limits, preferred times, service areas">${esc(row.availability_notes || state.profile?.availability_notes || row.notes || "")}</textarea></label>
      </div>
      <div class="contractor-file-form-actions">
        <button class="primary-action" type="submit" ${state.savingId === "availability" ? "disabled" : ""}><span>${state.savingId === "availability" ? "Saving..." : "Save Availability"}</span></button>
      </div>
    </form>
  `;
}

function documentUploadForm() {
  return `
    <form class="contractor-file-form" data-document-upload-form>
      <div class="contractor-file-form-grid">
        <label><span>Document Type</span><select name="documentType">
          <option value="agreement">Agreement</option>
          <option value="background_check">Background Check</option>
          <option value="insurance">Insurance</option>
          <option value="license">License</option>
          <option value="tax_document">Tax Document</option>
          <option value="other">Other</option>
        </select></label>
        <label><span>Status</span><select name="status">
          <option value="uploaded">Uploaded</option>
          <option value="approved">Approved</option>
          <option value="pending_review">Pending Review</option>
          <option value="expired">Expired</option>
          <option value="rejected">Rejected</option>
        </select></label>
        <label><span>Title</span><input name="title" placeholder="Document title" /></label>
        <label><span>Expiration Date</span><input name="expirationDate" type="date" /></label>
        <label class="contractor-file-field-full"><span>Upload File</span><input name="documentFile" type="file" required /></label>
        <label class="contractor-file-field-full"><span>Notes</span><textarea name="notes" placeholder="Document notes"></textarea></label>
      </div>
      <div class="contractor-file-form-actions">
        <button class="primary-action" type="submit" ${state.savingId === "document" ? "disabled" : ""}><span>${state.savingId === "document" ? "Uploading..." : "Upload Document"}</span></button>
      </div>
    </form>
  `;
}

function performanceMetricForm() {
  return `
    <form class="contractor-file-form" data-performance-form>
      <div class="contractor-file-form-grid">
        <label><span>Metric</span><input name="metricLabel" placeholder="Quality score, response time, admin note" required /></label>
        <label><span>Type</span><select name="metricType">
          <option value="scorecard">Scorecard</option>
          <option value="quality">Quality</option>
          <option value="timeliness">Timeliness</option>
          <option value="attendance">Attendance</option>
          <option value="admin_note">Admin Note</option>
        </select></label>
        <label><span>Value</span><input name="metricValue" type="number" step="0.01" placeholder="Optional value" /></label>
        <label><span>Unit</span><input name="metricUnit" placeholder="%, hrs, jobs, points" /></label>
        <label><span>Date</span><input name="metricDate" type="date" value="${esc(inputDate(new Date()))}" /></label>
        <label><span>Screenshot</span><input name="screenshotFile" type="file" accept="image/*" /></label>
        <label class="contractor-file-field-full"><span>Notes</span><textarea name="notes" placeholder="Performance details or screenshot context"></textarea></label>
      </div>
      <div class="contractor-file-form-actions">
        <button class="primary-action" type="submit" ${state.savingId === "performance" ? "disabled" : ""}><span>${state.savingId === "performance" ? "Saving..." : "Save Metric"}</span></button>
      </div>
    </form>
  `;
}

function backgroundCheckForm() {
  const status = token(backgroundStatus()) || "not-started";
  return `
    <form class="contractor-file-form contractor-file-nested-form" data-background-check-form>
      <div class="contractor-file-form-grid">
        <label><span>Background Check Status</span><select name="backgroundStatus">
          ${["not_started", "pending", "approved", "passed", "failed", "expired"].map((option) => `<option value="${esc(option)}" ${token(option) === status ? "selected" : ""}>${esc(title(option))}</option>`).join("")}
        </select></label>
        <label><span>Completed Date</span><input name="completedDate" type="date" value="${esc(inputDate(backgroundCompleteDate()))}" /></label>
        <label class="contractor-file-field-full"><span>Notes</span><textarea name="notes" placeholder="Background check notes">${esc(backgroundNotes())}</textarea></label>
      </div>
      <div class="contractor-file-form-actions">
        <button class="primary-action" type="submit" ${state.savingId === "background" ? "disabled" : ""}><span>${state.savingId === "background" ? "Saving..." : "Save Background Check"}</span></button>
      </div>
    </form>
  `;
}

function renderOverview() {
  const profileDetails = detailGrid([
    ["Name", contractorName()],
    ["Email", contractorEmail()],
    ["Phone", contractorPhone()],
    ["Company", contractorCompany()],
    ["Service Types", contractorService()],
    ["Market", contractorLocation()],
    ["Source", state.profile ? "Registered account" : "Directory record"],
    ["Status", title(contractorStatus())]
  ]);
  const profileAction = `
    <button class="secondary-action contractor-file-inline-action" type="button" data-profile-edit-toggle ${state.savingId === "profile" ? "disabled" : ""}>
      <span>${state.editingProfile ? "Cancel" : "Edit Profile"}</span>
    </button>
  `;
  return `
    <section class="contractor-file-grid">
      ${panel("Profile", state.editingProfile ? profileForm() : profileDetails, profileAction)}
      ${panel("Current Work", assignmentList(activeJobs().slice(0, 6), "No active jobs assigned."))}
      ${panel("Recent Completed Jobs", assignmentList(completedJobs().slice(0, 6), "No completed jobs yet."))}
      ${panel("Pay Snapshot", renderPaySummary())}
    </section>
  `;
}

function renderOnboarding() {
  const approved = contractorStatus() === "active";
  const backgroundComplete = backgroundCheckComplete();
  const steps = [
    ["Profile created", Boolean(state.profile || state.contractor), state.profile?.created_at || state.contractor?.created_at],
    ["Invite accepted", Boolean(state.profile || state.invite?.status === "accepted"), state.invite?.accepted_at],
    ["Background check", backgroundComplete, backgroundCompleteDate()],
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
      ["Background Check", title(backgroundStatus())],
      ["Approved", approved ? "Yes" : "No"],
      ["Profile Role", state.profile?.role || state.contractor?.role || "contractor"]
    ])}
    ${backgroundCheckForm()}
  `);
}

function renderDocuments() {
  const documentTable = tableRows(state.documents, [
    ["Document", (row) => `<strong>${esc(row.title || row.name || row.document_name || row.file_name || row.type || "Document")}</strong><small>${esc(row.notes || row.description || row.document_type || "")}</small>`],
    ["Status", (row) => esc(title(row.status || row.approval_status || row.compliance_status || "recorded"))],
    ["Expires", (row) => esc(formatDate(row.expiration_date || row.expires_at || row.expires_on, "No expiration"))],
    ["Uploaded", (row) => esc(formatDate(row.uploaded_at || row.created_at || row.updated_at))],
    ["File", (row) => storageButton(row)],
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
      ${panel("Upload Document", documentUploadForm())}
      ${panel("Documents & Compliance", documentTable)}
      ${panel("Photo & Video Uploads", mediaTable)}
    </section>
  `;
}

function renderAvailability() {
  return `
    <section class="contractor-file-grid">
      ${panel("Edit Availability", availabilityForm())}
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
  const manualMetrics = state.performanceRows
    .slice()
    .sort((a, b) => dateValue(b.metric_date || b.created_at) - dateValue(a.metric_date || a.created_at));
  const metricTable = tableRows(manualMetrics, [
    ["Metric", (row) => `<strong>${esc(row.metric_label || row.title || "Performance Metric")}</strong><small>${esc(title(row.metric_type || "scorecard"))}</small>`],
    ["Value", (row) => esc([row.metric_value, row.metric_unit].filter((value) => value !== null && value !== undefined && value !== "").join(" ") || "-")],
    ["Date", (row) => esc(formatDate(row.metric_date || row.created_at))],
    ["Screenshot", (row) => row.storage_path ? `${esc(row.file_name || "Screenshot attached")}<small>${storageButton(row, "Open Screenshot")}</small>` : "No screenshot"],
    ["Notes", (row) => esc(row.notes || "")]
  ], "No admin performance metrics saved yet.");
  return `
    <section class="metric-strip four">
      ${metric("Completion Rate", `${completionRate}%`, "completed vs total", "green")}
      ${metric("Active Jobs", active.length.toLocaleString(), "current workload", "blue")}
      ${metric("Completed Pay", money(totalPay(completed)), "completed work", "green")}
      ${metric("QA Uploads", state.media.length.toLocaleString(), "photos and videos", "purple")}
    </section>
    <section class="contractor-file-grid">
      ${panel("Add Performance Metric", performanceMetricForm())}
      ${panel("Admin Metrics & Screenshots", metricTable)}
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
  const rows = payRows();
  const paid = rows.filter(isPaid);
  const owed = completedJobs().filter((row) => Number(row.pay_amount) > 0 && !isPaid(row));
  return `
    <section class="metric-strip four">
      ${metric("Accepted Pay", money(totalPay(activeJobs())), `${activeJobs().length} active job(s)`, "blue")}
      ${metric("Completed Owed", money(totalNetPaid(owed)), "not paid yet", "yellow")}
      ${metric("Fees Added", money(totalAddedFees(rows)), "cleaner income adds", "green")}
      ${metric("Fees Taken", money(totalFees(rows)), "cleaner deductions", "purple")}
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
    ["Completed Owed", money(totalNetPaid(owed))],
    ["Fees Added", money(totalAddedFees(rows))],
    ["Fees Taken", money(totalFees(rows))],
    ["Net Paid To Cleaners", money(totalNetPaid(paid))],
    ["Paid Jobs", paid.length.toLocaleString()]
  ]);
}

function assignmentTitle(row) {
  return row.property_name || row.title || "Assignment";
}

function firstTextValue(values) {
  const found = values.find((value) => String(value ?? "").trim());
  return String(found ?? "").trim();
}

function assignmentUnitLabel(row = {}) {
  const meta = metadata(row);
  const unit = firstTextValue([
    row.unit_number,
    row.property_unit_number,
    row.assignment_unit_number,
    row.unit_name,
    row.property_unit_name,
    row.unit_label,
    row.unit,
    meta.unit_number,
    meta.property_unit_number,
    meta.assignment_unit_number,
    meta.unit_name,
    meta.property_unit_name,
    meta.unit_label,
    meta.unit
  ]);
  const scope = firstTextValue([row.scope_of_work, row.scope, row.work_scope, meta.scope_of_work, meta.scope]);
  const scopedUnit = scope.match(/\bunit:\s*([^\n,]+)/i)?.[1]?.trim() || "";
  const label = unit || scopedUnit;
  const sqft = firstTextValue([
    row.square_feet,
    row.sq_ft,
    row.unit_square_feet,
    row.square_footage,
    meta.square_feet,
    meta.sq_ft,
    meta.unit_square_feet,
    meta.square_footage
  ]);
  return [label ? `Unit: ${label}` : "Unit: Not selected", sqft ? `${sqft} sq ft` : ""].filter(Boolean).join(" - ");
}

function assignmentSubtitle(row) {
  return `<small>${esc(formatWindow(row))}</small><small>${esc(assignmentUnitLabel(row))}</small>`;
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
    ["Assignment", (row) => `<strong>${esc(assignmentTitle(row))}</strong><small>${esc([row.address, row.service_type].filter(Boolean).join(" - "))}</small><small>${esc(assignmentUnitLabel(row))}</small>`],
    ["Schedule", (row) => esc(formatWindow(row))],
    ["Status", (row) => esc(title(row.status || "open"))],
    ["Pay", (row) => esc(money(row.pay_amount))],
    ["Payment", (row) => esc(isPaid(row) ? `Paid ${formatDate(assignmentPaidDate(row), "")}` : "Unpaid")]
  ], emptyText);
}

function payTable() {
  const rows = payRows();
  const body = tableRows(rows, [
    ["", (row) => isPaid(row) ? "" : `<input class="contractor-file-pay-check" type="checkbox" data-pay-select="${esc(row.id)}" aria-label="Select ${esc(assignmentTitle(row))} for bulk paid">`],
    ["Assignment", (row) => `<strong>${esc(assignmentTitle(row))}</strong>${assignmentSubtitle(row)}`],
    ["Status", (row) => esc(title(row.status || "open"))],
    ["Job Pay", (row) => esc(money(row.pay_amount))],
    ["Fees Added", (row) => `<input class="contractor-file-pay-input" type="number" min="0" step="0.01" inputmode="decimal" data-pay-field="addedFeeAmount" data-pay-row="${esc(row.id)}" value="${esc(paymentAddedFeeAmount(row) || "")}" aria-label="Fees added for ${esc(assignmentTitle(row))}">`],
    ["Fees Taken", (row) => `<input class="contractor-file-pay-input" type="number" min="0" step="0.01" inputmode="decimal" data-pay-field="feeAmount" data-pay-row="${esc(row.id)}" value="${esc(paymentFeeAmount(row) || "")}" aria-label="Fees taken from cleaner for ${esc(assignmentTitle(row))}">`],
    ["Net", (row) => `<strong data-pay-net="${esc(row.id)}">${esc(money(paymentNetAmount(row)))}</strong><small>job pay + added - taken</small>`],
    ["Notes", (row) => `<textarea class="contractor-file-pay-notes" rows="2" data-pay-field="notes" data-pay-row="${esc(row.id)}" aria-label="Payment notes for ${esc(assignmentTitle(row))}">${esc(paymentNotes(row))}</textarea>`],
    ["Payment", (row) => esc(isPaid(row) ? `Paid ${formatDate(assignmentPaidDate(row), "")}` : "Unpaid")],
    ["Action", (row) => {
      const saving = state.savingId === "bulk-pay" || state.savingId === row.id || state.savingId === `pay:${row.id}`;
      return `<div class="contractor-file-pay-actions"><button class="secondary-action" type="button" data-pay-save="${esc(row.id)}" ${saving ? "disabled" : ""}><span>Save Pay</span></button><button class="${isPaid(row) ? "secondary-action" : "primary-action"}" type="button" data-pay-toggle="${esc(row.id)}" ${saving ? "disabled" : ""}><span>${esc(isPaid(row) ? "Mark Unpaid" : "Mark Paid")}</span></button></div>`;
    }]
  ], "No payable assignments found for this contractor.");
  if (!rows.length) return body;
  const unpaidCount = rows.filter((row) => !isPaid(row)).length;
  return `
    <div class="contractor-file-pay-bulk">
      <label><input type="checkbox" data-pay-select-all ${state.savingId === "bulk-pay" || !unpaidCount ? "disabled" : ""}> <span>Select all unpaid</span></label>
      <button class="primary-action" type="button" data-pay-bulk-paid disabled><span>${state.savingId === "bulk-pay" ? "Marking Paid..." : "Mark Selected Paid"}</span></button>
      <small data-pay-selected-count>0 selected</small>
    </div>
    ${body}
  `;
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
  state.optionalErrors = [];
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
  const performanceRows = await fetchAll("contractor_performance_metrics", "*", "metric_date");
  state.performanceRows = performanceRows.filter(personMatches);
  message(state.optionalErrors.length ? "Loaded contractor file. Some optional tables are not available yet." : "Contractor file synced from Supabase.");
  render();
}

function missingColumn(error) {
  const msg = String(error?.message || "");
  return msg.match(/Could not find the '([^']+)' column/)?.[1] || msg.match(/column "([^"]+)"/)?.[1] || "";
}

async function updateRowWithFallback(table, id, payload) {
  const next = cleanPayload({ ...payload });
  if (!id || !Object.keys(next).length) return { data: null, error: new Error(`No ${table} row to update.`) };
  for (let index = 0; index < 18; index += 1) {
    const { data, error } = await supabase
      .from(table)
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
  return { data: null, error: new Error(`Unable to update ${table}.`) };
}

async function insertRowWithFallback(table, payload) {
  const next = cleanPayload({ ...payload });
  for (let index = 0; index < 18; index += 1) {
    const { data, error } = await supabase
      .from(table)
      .insert(next)
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
  return { data: null, error: new Error(`Unable to insert ${table}.`) };
}

function linkedContractorPayload(userId) {
  return {
    profile_id: profileId(),
    contractor_id: contractorUuid(),
    contractor_key: contractorKey(),
    contractor_email: contractorEmail(),
    contractor_name: contractorName() === "Contractor" ? "" : contractorName(),
    created_by: userId || null,
    uploaded_by: userId || null,
    metadata: {
      source: "admin_contractor_file",
      profile_id: profileId(),
      contractor_key: contractorKey()
    }
  };
}

async function uploadContractorFile(bucket, file) {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  const userId = userData?.user?.id;
  if (userError || !userId) throw new Error("Unable to identify the current admin user for the upload.");
  const folder = `${userId}/contractors/${token(contractorKey()) || "contractor"}`;
  const path = `${folder}/${Date.now()}-${safeFileName(file.name)}`;
  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, file, {
      cacheControl: "3600",
      contentType: file.type || "application/octet-stream",
      upsert: false
    });
  if (error) throw error;
  return { path, userId };
}

async function saveProfile(form) {
  if (state.savingId) return;
  state.savingId = "profile";
  render();
  const fullName = formText(form, "fullName");
  const email = formText(form, "email");
  const phone = formText(form, "phone");
  const company = formText(form, "company");
  const service = formText(form, "service");
  const market = formText(form, "market");
  const status = formText(form, "status") || "pending";
  const notes = formText(form, "notes");
  const payload = {
    full_name: fullName,
    name: fullName,
    contractor_name: fullName,
    email,
    phone,
    contact_phone: phone,
    company_name: company,
    business_name: company,
    service_type: service,
    services: service,
    market,
    region: market,
    location: market,
    status,
    approval_status: status,
    contractor_approved: status === "active",
    notes
  };
  const results = [];
  if (state.profile?.id) results.push(["profiles", await updateRowWithFallback("profiles", state.profile.id, payload)]);
  if (state.contractor?.id) results.push(["contractors", await updateRowWithFallback("contractors", state.contractor.id, payload)]);
  state.savingId = "";
  const successful = results.filter(([, result]) => !result.error);
  if (!successful.length) {
    const firstError = results[0]?.[1]?.error?.message || "No editable contractor record was found.";
    message(`Unable to save profile: ${firstError}`, true);
    render();
    return;
  }
  for (const [table, result] of successful) {
    if (table === "profiles") state.profile = { ...state.profile, ...(result.data || payload) };
    if (table === "contractors") state.contractor = { ...state.contractor, ...(result.data || payload) };
  }
  state.editingProfile = false;
  message("Contractor profile updated.");
  render();
}

async function saveAvailability(form) {
  if (state.savingId) return;
  state.savingId = "availability";
  render();
  const status = formText(form, "availabilityStatus") || "available";
  const preferredDays = formText(form, "preferredDays");
  const market = formText(form, "market");
  const capacity = formText(form, "capacity");
  const notes = formText(form, "availabilityNotes");
  const payload = {
    availability_status: status,
    preferred_days: preferredDays,
    weekly_capacity: capacity,
    market,
    region: market,
    location: market,
    availability_notes: notes
  };
  const results = [];
  if (state.profile?.id) results.push(["profiles", await updateRowWithFallback("profiles", state.profile.id, payload)]);
  if (state.contractor?.id) results.push(["contractors", await updateRowWithFallback("contractors", state.contractor.id, payload)]);
  state.savingId = "";
  const successful = results.filter(([, result]) => !result.error);
  if (!successful.length) {
    const firstError = results[0]?.[1]?.error?.message || "No editable contractor record was found.";
    message(`Unable to save availability: ${firstError}`, true);
    render();
    return;
  }
  for (const [table, result] of successful) {
    if (table === "profiles") state.profile = { ...state.profile, ...(result.data || payload) };
    if (table === "contractors") state.contractor = { ...state.contractor, ...(result.data || payload) };
  }
  message("Availability updated.");
  render();
}

async function saveBackgroundCheck(form) {
  if (state.savingId) return;
  state.savingId = "background";
  render();
  const status = formText(form, "backgroundStatus") || "pending";
  const completedDate = formText(form, "completedDate");
  const completeStatuses = new Set(["approved", "passed", "complete", "completed", "cleared"]);
  const payload = {
    background_check_status: status,
    background_check_completed_at: completeStatuses.has(token(status)) ? (completedDate ? new Date(`${completedDate}T12:00:00`).toISOString() : new Date().toISOString()) : null,
    background_check_notes: formText(form, "notes")
  };
  const results = [];
  if (state.profile?.id) results.push(["profiles", await updateRowWithFallback("profiles", state.profile.id, payload)]);
  if (state.contractor?.id) results.push(["contractors", await updateRowWithFallback("contractors", state.contractor.id, payload)]);
  state.savingId = "";
  const successful = results.filter(([, result]) => !result.error);
  if (!successful.length) {
    const firstError = results[0]?.[1]?.error?.message || "No editable contractor record was found.";
    message(`Unable to save background check: ${firstError}`, true);
    render();
    return;
  }
  for (const [table, result] of successful) {
    if (table === "profiles") state.profile = { ...state.profile, ...(result.data || payload) };
    if (table === "contractors") state.contractor = { ...state.contractor, ...(result.data || payload) };
  }
  message("Background check step updated.");
  render();
}

async function saveDocumentUpload(form) {
  if (state.savingId) return;
  const file = form.elements.documentFile?.files?.[0];
  if (!file) {
    message("Choose a document file before uploading.", true);
    return;
  }
  state.savingId = "document";
  render();
  try {
    const upload = await uploadContractorFile(DOCUMENT_BUCKET, file);
    const payload = {
      ...linkedContractorPayload(upload.userId),
      document_type: formText(form, "documentType") || "document",
      title: formText(form, "title") || file.name,
      status: formText(form, "status") || "uploaded",
      expiration_date: formText(form, "expirationDate") || null,
      storage_bucket: DOCUMENT_BUCKET,
      storage_path: upload.path,
      file_name: file.name,
      mime_type: file.type || "",
      file_size: file.size || 0,
      notes: formText(form, "notes"),
      uploaded_at: new Date().toISOString()
    };
    const result = await insertRowWithFallback("contractor_documents", payload);
    state.savingId = "";
    if (result.error) {
      message(`Document uploaded, but the document record did not save: ${result.error.message}`, true);
      render();
      return;
    }
    state.documents = [{ ...(result.data || payload), __sourceTable: "contractor_documents" }, ...state.documents];
    message("Contractor document uploaded.");
    render();
  } catch (error) {
    state.savingId = "";
    message(`Unable to upload document: ${error.message}`, true);
    render();
  }
}

async function savePerformanceMetric(form) {
  if (state.savingId) return;
  state.savingId = "performance";
  render();
  try {
    const file = form.elements.screenshotFile?.files?.[0] || null;
    let upload = { path: "", userId: "" };
    const { data: userData } = await supabase.auth.getUser();
    upload.userId = userData?.user?.id || null;
    if (file) upload = await uploadContractorFile(PERFORMANCE_BUCKET, file);
    const payload = {
      ...linkedContractorPayload(upload.userId),
      metric_type: formText(form, "metricType") || "scorecard",
      metric_label: formText(form, "metricLabel") || "Performance Metric",
      metric_value: formNumber(form, "metricValue"),
      metric_unit: formText(form, "metricUnit"),
      metric_date: formText(form, "metricDate") || inputDate(new Date()),
      notes: formText(form, "notes"),
      storage_bucket: file ? PERFORMANCE_BUCKET : "",
      storage_path: file ? upload.path : "",
      file_name: file?.name || "",
      mime_type: file?.type || "",
      file_size: file?.size || 0
    };
    const result = await insertRowWithFallback("contractor_performance_metrics", payload);
    state.savingId = "";
    if (result.error) {
      message(`Unable to save performance metric: ${result.error.message}`, true);
      render();
      return;
    }
    state.performanceRows = [{ ...(result.data || payload), __sourceTable: "contractor_performance_metrics" }, ...state.performanceRows];
    message("Performance metric saved.");
    render();
  } catch (error) {
    state.savingId = "";
    message(`Unable to save performance metric: ${error.message}`, true);
    render();
  }
}

async function updateAssignmentWithFallback(id, payload) {
  const next = { ...payload };
  for (let index = 0; index < 30; index += 1) {
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

function payField(id, field) {
  return Array.from(document.querySelectorAll(`[data-pay-field="${field}"]`))
    .find((node) => String(node.dataset.payRow || "") === String(id)) || null;
}

function readPayNumber(id, field, fallback = 0) {
  const node = payField(id, field);
  if (!node) return fallback;
  const number = Number(node.value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function readPayText(id, field, fallback = "") {
  const node = payField(id, field);
  return node ? String(node.value || "").trim() : fallback;
}

function paymentUpdatePayload(row, options) {
  const paid = Boolean(options.paid);
  const addedFeeAmount = positiveNumber(options.addedFeeAmount);
  const feeAmount = positiveNumber(options.feeAmount);
  const projectedNet = Math.max(0, positiveNumber(row.pay_amount) + addedFeeAmount - feeAmount);
  const paidAmount = paid ? projectedNet : 0;
  const now = options.now || new Date().toISOString();
  const paidAt = paid ? (assignmentPaidDate(row) || now) : null;
  const notes = String(options.notes || "").trim();
  const userId = options.userId || null;
  const currentMetadata = metadata(row);
  const payment = {
    ...assignmentPayment(row),
    status: paid ? "paid" : "unpaid",
    paid,
    paid_at: paidAt,
    paid_by: paid ? userId : null,
    paid_amount: paidAmount,
    payout_amount: paidAmount,
    amount_paid: paidAmount,
    fees_added: addedFeeAmount,
    added_fee_amount: addedFeeAmount,
    income_fee_amount: addedFeeAmount,
    fees_taken: feeAmount,
    cleaner_fee_amount: feeAmount,
    fee_amount: feeAmount,
    projected_net_amount: projectedNet,
    net_paid_amount: paid ? paidAmount : null,
    notes,
    payment_notes: notes,
    fee_notes: notes,
    updated_at: now,
    updated_by: userId
  };
  return {
    metadata: { ...currentMetadata, payment },
    payment_status: paid ? "paid" : "unpaid",
    pay_status: paid ? "paid" : "unpaid",
    payout_status: paid ? "paid" : "unpaid",
    paid_at: paidAt,
    paid_by: paid ? userId : null,
    paid_amount: paid ? paidAmount : null,
    payout_amount: paid ? paidAmount : null,
    amount_paid: paid ? paidAmount : null,
    added_fee_amount: addedFeeAmount,
    fees_added: addedFeeAmount,
    income_fee_amount: addedFeeAmount,
    cleaner_fee_amount: feeAmount,
    fees_taken: feeAmount,
    fee_amount: feeAmount,
    projected_net_amount: projectedNet,
    net_paid_amount: paid ? paidAmount : null,
    paid_out: paid,
    paid_notes: notes || (paid ? "Payment details saved from admin contractor file." : "Marked unpaid from admin contractor file."),
    payment_notes: notes,
    fee_notes: notes
  };
}

function updatePayNetPreview(id) {
  const node = Array.from(document.querySelectorAll("[data-pay-net]"))
    .find((item) => String(item.dataset.payNet || "") === String(id));
  if (!node) return;
  const row = state.assignments.find((item) => String(item.id) === String(id)) || {};
  const addedFeeAmount = readPayNumber(id, "addedFeeAmount", paymentAddedFeeAmount(row));
  const feeAmount = readPayNumber(id, "feeAmount", 0);
  node.textContent = money(Math.max(0, positiveNumber(row.pay_amount) + addedFeeAmount - feeAmount));
}

async function savePayDetails(id) {
  const row = state.assignments.find((item) => String(item.id) === String(id));
  if (!row || state.savingId) return;
  const addedFeeAmount = readPayNumber(id, "addedFeeAmount", paymentAddedFeeAmount(row));
  const feeAmount = readPayNumber(id, "feeAmount", paymentFeeAmount(row));
  const notes = readPayText(id, "notes", paymentNotes(row));
  state.savingId = `pay:${id}`;
  render();
  try {
    const { data: userData } = await supabase.auth.getUser();
    const payload = paymentUpdatePayload(row, {
      paid: isPaid(row),
      addedFeeAmount,
      feeAmount,
      notes,
      userId: userData?.user?.id || null,
      now: new Date().toISOString()
    });
    const result = await updateAssignmentWithFallback(id, payload);
    state.savingId = "";
    if (result.error) {
      message(`Unable to save payment details: ${result.error.message}`, true);
      render();
      return;
    }
    state.assignments = state.assignments.map((item) => String(item.id) === String(id) ? { ...item, ...(result.data || payload) } : item);
    message("Payment details saved.");
    render();
  } catch (error) {
    state.savingId = "";
    message(`Unable to save payment details: ${error.message}`, true);
    render();
  }
}

function selectedPayIds() {
  return Array.from(document.querySelectorAll("[data-pay-select]:checked"))
    .map((node) => String(node.dataset.paySelect || ""))
    .filter(Boolean);
}

function updatePayBulkState() {
  const boxes = Array.from(document.querySelectorAll("[data-pay-select]"));
  const selected = selectedPayIds();
  const selectAll = document.querySelector("[data-pay-select-all]");
  if (selectAll) {
    selectAll.checked = Boolean(boxes.length && selected.length === boxes.length);
    selectAll.indeterminate = Boolean(selected.length && selected.length < boxes.length);
  }
  const count = document.querySelector("[data-pay-selected-count]");
  if (count) count.textContent = `${selected.length} selected`;
  const button = document.querySelector("[data-pay-bulk-paid]");
  if (button) button.disabled = state.savingId === "bulk-pay" || !selected.length;
}

async function bulkMarkSelectedPaid() {
  if (state.savingId) return;
  const entries = selectedPayIds()
    .map((id) => {
      const row = state.assignments.find((item) => String(item.id) === String(id));
      return row ? {
        id,
        row,
        addedFeeAmount: readPayNumber(id, "addedFeeAmount", paymentAddedFeeAmount(row)),
        feeAmount: readPayNumber(id, "feeAmount", paymentFeeAmount(row)),
        notes: readPayText(id, "notes", paymentNotes(row))
      } : null;
    })
    .filter(Boolean);
  if (!entries.length) {
    message("Select at least one unpaid assignment to mark paid.", true);
    return;
  }
  if (!window.confirm(`Mark ${entries.length} selected assignment(s) paid?`)) return;
  state.savingId = "bulk-pay";
  render();
  try {
    const { data: userData } = await supabase.auth.getUser();
    const updates = [];
    const failures = [];
    for (const entry of entries) {
      const payload = paymentUpdatePayload(entry.row, {
        paid: true,
        addedFeeAmount: entry.addedFeeAmount,
        feeAmount: entry.feeAmount,
        notes: entry.notes,
        userId: userData?.user?.id || null,
        now: new Date().toISOString()
      });
      payload.paid_notes = entry.notes || "Bulk marked paid from admin contractor file.";
      const result = await updateAssignmentWithFallback(entry.id, payload);
      if (result.error) {
        failures.push(`${assignmentTitle(entry.row)}: ${result.error.message}`);
      } else {
        updates.push({ id: entry.id, data: result.data || payload });
      }
    }
    const updateMap = new Map(updates.map((item) => [String(item.id), item.data]));
    state.assignments = state.assignments.map((item) => updateMap.has(String(item.id)) ? { ...item, ...updateMap.get(String(item.id)) } : item);
    state.savingId = "";
    if (failures.length) {
      message(`${updates.length} assignment(s) marked paid. ${failures.length} failed: ${failures[0]}`, true);
    } else {
      message(`${updates.length} assignment(s) marked paid.`);
    }
    render();
  } catch (error) {
    state.savingId = "";
    message(`Unable to bulk mark assignments paid: ${error.message}`, true);
    render();
  }
}

async function togglePaid(id) {
  const row = state.assignments.find((item) => String(item.id) === String(id));
  if (!row || state.savingId) return;
  const nextPaid = !isPaid(row);
  const label = nextPaid ? "mark this assignment paid" : "mark this assignment unpaid";
  if (!window.confirm(`Are you sure you want to ${label}?`)) return;
  const addedFeeAmount = nextPaid ? readPayNumber(id, "addedFeeAmount", paymentAddedFeeAmount(row)) : paymentAddedFeeAmount(row);
  const feeAmount = nextPaid ? readPayNumber(id, "feeAmount", paymentFeeAmount(row)) : 0;
  const notes = nextPaid ? readPayText(id, "notes", paymentNotes(row)) : "";
  state.savingId = id;
  render();
  const { data: userData } = await supabase.auth.getUser();
  const payload = paymentUpdatePayload(row, {
    paid: nextPaid,
    addedFeeAmount,
    feeAmount,
    notes,
    userId: userData?.user?.id || null,
    now: new Date().toISOString()
  });
  payload.paid_notes = notes || (nextPaid ? "Marked paid from admin contractor file." : "Marked unpaid from admin contractor file.");
  const result = await updateAssignmentWithFallback(id, payload);
  state.savingId = "";
  if (result.error) {
    message(`Unable to update payment: ${result.error.message}`, true);
    render();
    return;
  }
  state.assignments = state.assignments.map((item) => String(item.id) === String(id) ? { ...item, ...(result.data || payload) } : item);
  message(nextPaid ? "Assignment marked paid." : "Assignment marked unpaid.");
  render();
}

async function openStorageFile(bucket, path) {
  if (!bucket || !path) return;
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 120);
  if (error || !data?.signedUrl) {
    message(`Unable to open file: ${error?.message || "Signed URL was not created."}`, true);
    return;
  }
  window.open(data.signedUrl, "_blank", "noopener");
}

function injectStyles() {
  if (document.getElementById("contractorFileStyles")) return;
  const style = document.createElement("style");
  style.id = "contractorFileStyles";
  style.textContent = `
    .contractor-file-workspace{display:grid;gap:14px}.contractor-file-hero{align-items:end;background:rgba(17,32,50,.92);border:1px solid var(--suite-border);border-radius:8px;display:flex;gap:16px;justify-content:space-between;padding:18px}.contractor-file-hero h1{font-size:26px;margin:12px 0 6px}.contractor-file-hero p{color:var(--suite-soft);margin:0}.contractor-file-badges{display:flex;flex-wrap:wrap;gap:7px;margin-top:10px}.contractor-file-back{display:inline-flex;width:auto}.contractor-file-quick{background:rgba(0,214,166,.1);border:1px solid rgba(0,214,166,.3);border-radius:8px;padding:14px 18px;text-align:right}.contractor-file-quick strong{color:var(--suite-green);display:block;font-size:24px}.contractor-file-quick small{color:var(--suite-soft);font-weight:800;text-transform:uppercase}.contractor-file-tabs{margin-top:2px}.contractor-file-grid{display:grid;gap:14px;grid-template-columns:repeat(2,minmax(0,1fr))}.contractor-file-panel .panel-head{padding-bottom:10px}.contractor-file-detail-grid{display:grid;gap:10px;grid-template-columns:repeat(2,minmax(0,1fr))}.contractor-file-detail-grid div{background:rgba(7,18,32,.55);border:1px solid var(--suite-border-soft);border-radius:8px;padding:10px}.contractor-file-detail-grid span{color:var(--suite-soft);display:block;font-size:11px;font-weight:900;text-transform:uppercase}.contractor-file-detail-grid strong{display:block;margin-top:4px}.contractor-file-list{display:grid;gap:8px}.contractor-file-list article{align-items:center;background:rgba(7,18,32,.55);border:1px solid var(--suite-border-soft);border-radius:8px;display:flex;justify-content:space-between;padding:10px}.contractor-file-list small,.contractor-file-table small{color:var(--suite-soft);display:block;font-size:11px;margin-top:3px}.contractor-file-empty{border:1px dashed var(--suite-border-soft);border-radius:8px;color:var(--suite-soft);padding:18px;text-align:center}.contractor-file-step-list{display:grid;gap:10px;margin-bottom:14px}.contractor-file-step{align-items:center;background:rgba(7,18,32,.55);border:1px solid var(--suite-border-soft);border-radius:8px;display:flex;gap:10px;padding:10px}.contractor-file-step>span{align-items:center;border:1px solid var(--suite-border);border-radius:999px;display:inline-flex;height:28px;justify-content:center;width:28px}.contractor-file-step.is-complete>span{background:var(--suite-green);border-color:var(--suite-green);color:#041d15}.contractor-file-step small{color:var(--suite-soft);display:block}.contractor-file-table-wrap{max-height:520px}.contractor-file-tab-body{display:grid;gap:14px}.contractor-file-form{display:grid;gap:12px}.contractor-file-form-grid{display:grid;gap:12px;grid-template-columns:repeat(2,minmax(0,1fr))}.contractor-file-form label{display:grid;gap:6px}.contractor-file-form label span{color:var(--suite-soft);font-size:11px;font-weight:900;text-transform:uppercase}.contractor-file-form input,.contractor-file-form select,.contractor-file-form textarea{background:rgba(7,18,32,.8);border:1px solid var(--suite-border-soft);border-radius:7px;color:var(--suite-text);font:inherit;min-height:38px;padding:9px 10px;width:100%}.contractor-file-form input[type=file]{padding:8px}.contractor-file-form textarea{min-height:88px;resize:vertical}.contractor-file-field-full{grid-column:1/-1}.contractor-file-form-actions{display:flex;gap:10px;justify-content:flex-end}.contractor-file-nested-form{border-top:1px solid var(--suite-border-soft);margin-top:14px;padding-top:14px}@media(max-width:1050px){.contractor-file-grid{grid-template-columns:1fr}.contractor-file-hero{align-items:start;display:grid}.contractor-file-quick{text-align:left}.contractor-file-detail-grid,.contractor-file-form-grid{grid-template-columns:1fr}.contractor-file-form-actions{justify-content:stretch}.contractor-file-form-actions .primary-action{width:100%}}
  `;
  style.textContent += `
    .contractor-file-table input,.contractor-file-table textarea{background:rgba(7,18,32,.82);border:1px solid var(--suite-border-soft);border-radius:7px;color:var(--suite-text);font:inherit;min-height:36px;padding:8px 9px;width:100%}.contractor-file-table textarea{min-height:54px;min-width:180px;resize:vertical}.contractor-file-pay-input{min-width:105px}.contractor-file-pay-check,.contractor-file-pay-bulk input{accent-color:var(--suite-green);min-height:auto!important;width:auto!important}.contractor-file-pay-bulk{align-items:center;background:rgba(7,18,32,.55);border:1px solid var(--suite-border-soft);border-radius:8px;display:flex;flex-wrap:wrap;gap:10px;justify-content:flex-start;margin-bottom:12px;padding:10px}.contractor-file-pay-bulk label{align-items:center;color:var(--suite-text);display:inline-flex;font-weight:900;gap:8px}.contractor-file-pay-bulk small{color:var(--suite-soft);font-weight:800}.contractor-file-pay-actions{display:flex;flex-wrap:wrap;gap:6px;min-width:190px}.contractor-file-pay-actions .primary-action,.contractor-file-pay-actions .secondary-action{min-height:34px;padding:8px 10px}.contractor-file-table [data-pay-net]{color:var(--suite-green);display:block;min-width:82px}
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
      return;
    }
    const paySave = event.target.closest("[data-pay-save]");
    if (paySave) {
      void savePayDetails(paySave.dataset.paySave);
      return;
    }
    const payBulk = event.target.closest("[data-pay-bulk-paid]");
    if (payBulk) {
      void bulkMarkSelectedPaid();
      return;
    }
    const storage = event.target.closest("[data-open-storage-path]");
    if (storage) {
      void openStorageFile(storage.dataset.openStorageBucket, storage.dataset.openStoragePath);
      return;
    }
    const profileToggle = event.target.closest("[data-profile-edit-toggle]");
    if (profileToggle) {
      state.editingProfile = !state.editingProfile;
      render();
    }
  });
  document.addEventListener("input", (event) => {
    const payInput = event.target.closest("[data-pay-field]");
    if (!payInput) return;
    updatePayNetPreview(payInput.dataset.payRow);
  });
  document.addEventListener("change", (event) => {
    const selectAll = event.target.closest("[data-pay-select-all]");
    if (selectAll) {
      document.querySelectorAll("[data-pay-select]").forEach((box) => {
        box.checked = Boolean(selectAll.checked);
      });
      updatePayBulkState();
      return;
    }
    if (event.target.closest("[data-pay-select]")) updatePayBulkState();
  });
  document.addEventListener("submit", (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    if (form.matches("[data-profile-form]")) {
      event.preventDefault();
      void saveProfile(form);
      return;
    }
    if (form.matches("[data-availability-form]")) {
      event.preventDefault();
      void saveAvailability(form);
      return;
    }
    if (form.matches("[data-background-check-form]")) {
      event.preventDefault();
      void saveBackgroundCheck(form);
      return;
    }
    if (form.matches("[data-document-upload-form]")) {
      event.preventDefault();
      void saveDocumentUpload(form);
      return;
    }
    if (form.matches("[data-performance-form]")) {
      event.preventDefault();
      void savePerformanceMetric(form);
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
