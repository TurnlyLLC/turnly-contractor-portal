import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const env = window.__ENV || {};
const supabase = env.SUPABASE_URL && env.SUPABASE_ANON_KEY
  ? createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY)
  : null;

const optionalColumns = [
  "property_id", "address", "service_type", "pay_amount", "scope",
  "supplies_notes", "special_instructions", "priority", "assignment_type",
  "recurrence_frequency", "recurrence_interval", "recurrence_end_date",
  "auto_renewal", "recurring_group_id", "preferred_first",
  "preferred_contractor_ids", "preferred_contractor_names", "preferred_until",
  "visibility", "declined_contractor_ids", "created_by"
];

const editorModalId = "scheduleAssignmentEditorModal";
const editorTitleId = "scheduleAssignmentEditorTitle";
const state = { properties: [], user: null, saving: false, editingId: "", editingRow: null };
const $ = (id) => document.getElementById(id);

function init() {
  if (document.body?.dataset.adminPage !== "schedule") return;
  const root = document.querySelector("[data-schedule-live]");
  if (root) {
    mount(root);
    return;
  }
  const observer = new MutationObserver(() => {
    const nextRoot = document.querySelector("[data-schedule-live]");
    if (!nextRoot) return;
    observer.disconnect();
    mount(nextRoot);
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

function mount(root) {
  if (root.dataset.scheduleAddAssignmentMounted) return;
  root.dataset.scheduleAddAssignmentMounted = "true";
  const toolbar = root.querySelector(".toolbar-right");
  if (toolbar && !toolbar.querySelector("[data-schedule-new-assignment]")) {
    toolbar.insertAdjacentHTML("afterbegin", `<button class="primary-action" type="button" data-schedule-new-assignment><span>New Assignment</span></button>`);
  }
  if (!$(editorModalId)) root.insertAdjacentHTML("beforeend", modalHtml());
  root.addEventListener("click", (event) => {
    if (event.target.closest("[data-schedule-new-assignment]")) {
      openModal();
      return;
    }
    const editButton = event.target.closest("[data-schedule-assignment-edit]");
    if (editButton) {
      openEdit(editButton.dataset.scheduleAssignmentEdit || "");
      return;
    }
    if (event.target.closest("[data-schedule-assignment-close]")) closeModal();
  });
  root.addEventListener("change", (event) => {
    if (event.target?.id === "scheduleAssignmentProperty") fillProperty(event.target.value);
  });
  root.addEventListener("input", (event) => {
    if (event.target?.id === "scheduleAssignmentInstructions") {
      event.target.dataset.generatedAccessNotes = "false";
    }
  });
  root.addEventListener("submit", (event) => {
    if (event.target?.id === "scheduleAssignmentForm") saveAssignment(event, root);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeModal();
  });
  window.turnlyScheduleAssignmentEditor = {
    openNew: () => openModal(),
    openEdit: (rowOrId) => openEdit(rowOrId)
  };
  window.addEventListener("turnly:schedule-edit-assignment", (event) => {
    openEdit(event.detail?.row || event.detail?.id || "");
  });
  loadUser();
  loadProperties();
}

function modalHtml() {
  return `
    <div id="${editorModalId}" class="client-modal assignment-modal" role="dialog" aria-modal="true" aria-labelledby="${editorTitleId}" hidden>
      <button class="client-modal-backdrop" type="button" aria-label="Close assignment form" data-schedule-assignment-close></button>
      <section class="client-modal-panel assignment-modal-panel">
        <div class="client-modal-header">
          <div><p>Schedule</p><h2 id="${editorTitleId}">New Assignment</h2></div>
          <button class="client-modal-close" type="button" aria-label="Close assignment form" data-schedule-assignment-close>&times;</button>
        </div>
        <form id="scheduleAssignmentForm" class="lead-form assignment-form assignment-modal-form">
          <section class="assignment-form-section"><h3>Assignment Details</h3><div class="form-grid assignment-form-grid">
            <label class="suite-field wide"><span>Select Property</span><select id="scheduleAssignmentProperty" required><option value="">Loading client properties...</option></select></label>
            <label class="suite-field wide"><span>Assignment Title</span><input id="scheduleAssignmentTitle" type="text" required placeholder="Cleaning - Property Name" /></label>
            <label class="suite-field"><span>Property Name</span><input id="scheduleAssignmentPropertyName" type="text" required /></label>
            <label class="suite-field"><span>Service Type</span><input id="scheduleAssignmentService" type="text" /></label>
            <label class="suite-field wide"><span>Address</span><input id="scheduleAssignmentAddress" type="text" /></label>
            <label class="suite-field"><span>Contractor Pay</span><input id="scheduleAssignmentPay" type="number" min="0" step="0.01" /></label>
          </div></section>
          <section class="assignment-form-section"><h3>Timing</h3><div class="form-grid assignment-form-grid">
            <label class="suite-field"><span>Start</span><input id="scheduleAssignmentStart" type="datetime-local" required /></label>
            <label class="suite-field"><span>End</span><input id="scheduleAssignmentEnd" type="datetime-local" required /></label>
            <label class="suite-field"><span>Status</span><select id="scheduleAssignmentStatus"><option value="open">Open</option><option value="preferred_pending">Preferred Pending</option><option value="claimed">Claimed</option><option value="in_progress">In Progress</option><option value="completed">Completed</option><option value="qa_pending">QA Pending</option><option value="cancelled">Cancelled</option></select></label>
            <label class="suite-field"><span>Priority</span><select id="scheduleAssignmentPriority"><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select></label>
          </div></section>
          <section class="assignment-form-section"><h3>Work Details</h3><div class="form-grid assignment-form-grid assignment-notes-grid">
            <label class="suite-field wide"><span>Scope of Work</span><textarea id="scheduleAssignmentScope"></textarea></label>
            <label class="suite-field wide"><span>Special Instructions</span><textarea id="scheduleAssignmentInstructions"></textarea></label>
          </div></section>
          <p id="scheduleAssignmentMessage" class="status-message"></p>
          <div class="form-actions"><button id="scheduleAssignmentSave" type="submit" class="primary-action"><span data-schedule-assignment-save-label>Post Assignment</span></button></div>
        </form>
      </section>
    </div>
  `;
}

async function loadUser() {
  if (!supabase) return;
  const { data } = await supabase.auth.getUser();
  state.user = data?.user || null;
}

async function loadProperties() {
  if (!supabase) {
    populateProperties();
    return;
  }
  const { data, error } = await supabase.from("clients").select("*").limit(1000);
  if (error) {
    console.warn("[schedule-add-assignment] Unable to load clients", error);
    populateProperties();
    return;
  }
  state.properties = (data || []).filter((row) => propertyTitle(row)).sort((a, b) => propertyTitle(a).localeCompare(propertyTitle(b)));
  populateProperties();
}

function populateProperties() {
  const select = $("scheduleAssignmentProperty");
  if (!select) return;
  const selected = select.value;
  const placeholder = state.properties.length ? "Choose a client property..." : "No client properties found";
  select.innerHTML = `<option value="">${escapeHtml(placeholder)}</option>${state.properties.map((row) => `<option value="${escapeHtml(row.id)}">${escapeHtml(propertyTitle(row))}</option>`).join("")}`;
  if (selected && state.properties.some((row) => row.id === selected)) select.value = selected;
}

async function openModal() {
  state.editingId = "";
  state.editingRow = null;
  clearForm();
  if (!state.properties.length) await loadProperties();
  populateProperties();
  updateEditorMode();
  $(editorModalId).hidden = false;
  $("scheduleAssignmentProperty")?.focus();
}

async function openEdit(rowOrId) {
  const row = await resolveAssignmentRow(rowOrId);
  if (!row) return;
  state.editingId = String(row.id || "");
  state.editingRow = row;
  clearForm();
  if (!state.properties.length) await loadProperties();
  populateProperties();
  fillAssignment(row);
  updateEditorMode();
  $(editorModalId).hidden = false;
  $("scheduleAssignmentTitle")?.focus();
}

async function resolveAssignmentRow(rowOrId) {
  if (rowOrId && typeof rowOrId === "object") return rowOrId;
  const id = String(rowOrId || "");
  if (!id || !supabase) {
    setScheduleMessage("Unable to open assignment editor. Assignment data is missing.", true);
    return null;
  }
  const { data, error } = await supabase
    .from("assignment_blocks")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    setScheduleMessage("Unable to load assignment for editing: " + error.message, true);
    return null;
  }
  if (!data) setScheduleMessage("Assignment not found. Refresh the schedule and try again.", true);
  return data || null;
}

function closeModal() {
  const modal = $(editorModalId);
  if (modal) modal.hidden = true;
  state.editingId = "";
  state.editingRow = null;
  setSaving(false);
  updateEditorMode();
}

function clearForm() {
  const form = $("scheduleAssignmentForm");
  if (!form) return;
  form.reset();
  const start = defaultStart();
  const end = new Date(start);
  end.setHours(end.getHours() + 2);
  setValue("scheduleAssignmentStart", datetimeInput(start));
  setValue("scheduleAssignmentEnd", datetimeInput(end));
  setValue("scheduleAssignmentStatus", "open");
  setValue("scheduleAssignmentPriority", "normal");
  message("");
}

function fillProperty(id) {
  const property = state.properties.find((row) => row.id === id);
  if (!property) return;
  const title = propertyTitle(property);
  setValue("scheduleAssignmentPropertyName", title);
  setValue("scheduleAssignmentAddress", propertyAddress(property));
  setValue("scheduleAssignmentService", propertyService(property));
  if (!$("scheduleAssignmentTitle")?.value) setValue("scheduleAssignmentTitle", `Cleaning - ${title}`);
  if (!$("scheduleAssignmentScope")?.value) setValue("scheduleAssignmentScope", property.default_scope || property.unit_notes || "");
  setDefaultInstructions(propertyAccessNotes(property));
}

function fillAssignment(row) {
  const propertyId = assignmentPropertyId(row);
  setValue("scheduleAssignmentProperty", propertyId);
  setValue("scheduleAssignmentTitle", row?.title || "");
  setValue("scheduleAssignmentPropertyName", row?.property_name || propertyTitle(state.properties.find((property) => property.id === propertyId)));
  setValue("scheduleAssignmentService", row?.service_type || "");
  setValue("scheduleAssignmentAddress", row?.address || "");
  setValue("scheduleAssignmentPay", row?.pay_amount ?? "");
  setValue("scheduleAssignmentStart", datetimeInput(row?.start_window));
  setValue("scheduleAssignmentEnd", datetimeInput(row?.end_window));
  setValue("scheduleAssignmentStatus", normalizeStatusValue(row?.status || "open"));
  setValue("scheduleAssignmentPriority", row?.priority || "normal");
  setValue("scheduleAssignmentScope", row?.scope || "");
  setValue("scheduleAssignmentInstructions", row?.special_instructions || "");
  message("");
}

async function saveAssignment(event, root) {
  event.preventDefault();
  if (!supabase || state.saving) return;
  let payload;
  const isEditing = Boolean(state.editingId);
  try {
    payload = payloadFromForm({ includeDefaults: !isEditing });
  } catch (error) {
    message(error.message, true);
    return;
  }
  state.saving = true;
  setSaving(true);
  message(isEditing ? "Saving assignment changes..." : "Posting assignment to Supabase...");
  const result = isEditing
    ? await updateWithFallback(state.editingId, payload)
    : await insertWithFallback(payload);
  state.saving = false;
  setSaving(false);
  if (result.error) {
    message("Unable to save assignment: " + result.error.message, true);
    return;
  }
  closeModal();
  const scheduleMessage = $("scheduleLiveMessage");
  if (scheduleMessage) scheduleMessage.textContent = isEditing ? "Assignment updated in Supabase." : "Assignment posted to Supabase.";
  root.querySelector("[data-schedule-refresh]")?.click();
}

function payloadFromForm(options = {}) {
  const start = parseDate(value("scheduleAssignmentStart"));
  const end = parseDate(value("scheduleAssignmentEnd"));
  if (!start || !end) throw new Error("Start and End are required.");
  if (end <= start) throw new Error("End must be after Start.");
  const propertyId = value("scheduleAssignmentProperty");
  const property = state.properties.find((row) => row.id === propertyId);
  const existingPropertyId = state.editingId ? state.editingRow?.property_id || null : null;
  const pay = Number(value("scheduleAssignmentPay"));
  const status = value("scheduleAssignmentStatus") || "open";
  const specialInstructions = value("scheduleAssignmentInstructions") || propertyAccessNotes(property);
  const payload = {
    title: value("scheduleAssignmentTitle") || `Cleaning - ${value("scheduleAssignmentPropertyName") || propertyTitle(property) || "Scheduled Assignment"}`,
    property_id: propertyId || existingPropertyId || null,
    property_name: value("scheduleAssignmentPropertyName") || propertyTitle(property),
    address: value("scheduleAssignmentAddress") || propertyAddress(property),
    service_type: value("scheduleAssignmentService") || propertyService(property),
    pay_amount: Number.isFinite(pay) && pay >= 0 ? pay : 0,
    scope: value("scheduleAssignmentScope"),
    special_instructions: specialInstructions,
    priority: value("scheduleAssignmentPriority") || "normal",
    status,
    start_window: start.toISOString(),
    end_window: end.toISOString()
  };
  if (options.includeDefaults) {
    Object.assign(payload, {
      supplies_notes: "",
      assignment_type: "one_time",
      recurrence_frequency: "one_time",
      recurrence_interval: 1,
      recurrence_end_date: null,
      auto_renewal: false,
      recurring_group_id: null,
      preferred_first: status === "preferred_pending",
      preferred_contractor_ids: [],
      preferred_contractor_names: [],
      preferred_until: null,
      visibility: status === "preferred_pending" ? "preferred" : "open",
      declined_contractor_ids: [],
      created_by: state.user?.id || null
    });
  }
  return payload;
}

async function insertWithFallback(payload) {
  let nextPayload = { ...payload };
  for (let attempt = 0; attempt < optionalColumns.length + 2; attempt += 1) {
    const result = await supabase.from("assignment_blocks").insert(nextPayload).select("*").maybeSingle();
    if (!result.error) return result;
    const missing = missingColumn(result.error);
    if (missing && Object.prototype.hasOwnProperty.call(nextPayload, missing)) {
      delete nextPayload[missing];
      continue;
    }
    const optional = optionalColumns.find((column) => Object.prototype.hasOwnProperty.call(nextPayload, column) && isMissingColumn(result.error, column));
    if (optional) {
      delete nextPayload[optional];
      continue;
    }
    return result;
  }
  return { data: null, error: new Error("Unable to save assignment because the assignment_blocks table schema is missing required columns.") };
}

async function updateWithFallback(id, payload) {
  let nextPayload = { ...payload };
  for (let attempt = 0; attempt < optionalColumns.length + 2; attempt += 1) {
    const result = await supabase
      .from("assignment_blocks")
      .update(nextPayload)
      .eq("id", id)
      .select("*")
      .maybeSingle();
    if (!result.error) return result;
    const missing = missingColumn(result.error);
    if (missing && Object.prototype.hasOwnProperty.call(nextPayload, missing)) {
      delete nextPayload[missing];
      continue;
    }
    const optional = optionalColumns.find((column) => Object.prototype.hasOwnProperty.call(nextPayload, column) && isMissingColumn(result.error, column));
    if (optional) {
      delete nextPayload[optional];
      continue;
    }
    return result;
  }
  return { data: null, error: new Error("Unable to update assignment because the assignment_blocks table schema is missing required columns.") };
}

function isMissingColumn(error, column) {
  const text = String(error?.message || "").toLowerCase();
  return text.includes(column.toLowerCase()) || text.includes("schema cache");
}

function missingColumn(error) {
  const text = String(error?.message || "");
  return text.match(/'([a-zA-Z0-9_]+)'\s+column/)?.[1]
    || text.match(/Could not find the '([a-zA-Z0-9_]+)' column/i)?.[1]
    || text.match(/column\s+"?([a-zA-Z0-9_]+)"?\s+of relation/i)?.[1]
    || "";
}

function defaultStart() {
  const date = new Date();
  date.setMinutes(date.getMinutes() < 30 ? 30 : 60, 0, 0);
  if (date.getHours() < 8) date.setHours(9, 0, 0, 0);
  return date;
}

function value(id) {
  return $(id)?.value?.trim() || "";
}

function setValue(id, text) {
  const field = $(id);
  if (field) field.value = text ?? "";
}

function setDefaultInstructions(value) {
  const field = $("scheduleAssignmentInstructions");
  if (!field) return;
  if (!field.value || field.dataset.generatedAccessNotes === "true") {
    field.value = value || "";
    field.dataset.generatedAccessNotes = value ? "true" : "";
  }
}

function setSaving(isSaving) {
  const button = $("scheduleAssignmentSave");
  if (!button) return;
  const label = button.querySelector("[data-schedule-assignment-save-label]") || button.querySelector("span");
  const isEditing = Boolean(state.editingId);
  button.disabled = isSaving;
  if (label) label.textContent = isSaving
    ? (isEditing ? "Saving..." : "Posting...")
    : (isEditing ? "Save Changes" : "Post Assignment");
}

function message(text, isError = false) {
  const field = $("scheduleAssignmentMessage");
  if (!field) return;
  field.textContent = text || "";
  field.classList.toggle("error", isError);
}

function setScheduleMessage(text, isError = false) {
  const field = $("scheduleLiveMessage");
  if (!field) return;
  field.textContent = text || "";
  field.classList.toggle("error", isError);
}

function updateEditorMode() {
  const isEditing = Boolean(state.editingId);
  const title = $(editorTitleId);
  if (title) title.textContent = isEditing ? "Edit Assignment" : "New Assignment";
  setSaving(state.saving);
}

function assignmentPropertyId(row) {
  const direct = String(row?.property_id || "");
  if (direct && state.properties.some((property) => String(property.id || "") === direct)) return direct;
  const propertyName = token(row?.property_name || "");
  const address = token(row?.address || "");
  const match = state.properties.find((property) => {
    const titleMatch = propertyName && token(propertyTitle(property)) === propertyName;
    const addressMatch = address && token(propertyAddress(property)) === address;
    return titleMatch || addressMatch;
  });
  return match?.id || "";
}

function normalizeStatusValue(value) {
  const key = String(value || "open").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  const allowed = new Set(["open", "preferred_pending", "claimed", "in_progress", "completed", "qa_pending", "cancelled"]);
  return allowed.has(key) ? key : "open";
}

function propertyTitle(row) {
  return row?.property_name || row?.company_name || row?.name || row?.title || "";
}

function propertyAddress(row) {
  return row?.billing_address || [row?.address, row?.city, row?.state, row?.postal_code].filter(Boolean).join(", ") || row?.region || row?.market || "";
}

function propertyService(row) {
  return row?.default_service_type || row?.service_type || row?.property_type || serviceModel(row?.service_model) || row?.client_type || "";
}

function propertyAccessNotes(row) {
  return row?.access_notes || row?.entry_notes || row?.gate_code || "";
}

function serviceModel(value) {
  const key = String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return { apartment_turnover: "Apartment Turnover", monthly_commercial: "Monthly Commercial", hybrid: "Hybrid", other: "Other" }[key] || (value ? titleCase(value) : "");
}

function titleCase(value) {
  return String(value || "").replace(/[-_]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function token(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function parseDate(text) {
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

function datetimeInput(input) {
  const date = parseDate(input);
  if (!date) return "";
  const pad = (part) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[char]));
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
