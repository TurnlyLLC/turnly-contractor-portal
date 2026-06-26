import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const env = window.__ENV || {};
const supabase = env.SUPABASE_URL && env.SUPABASE_ANON_KEY
  ? createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY)
  : null;

const list = document.getElementById("adminAssignments");
const pageMessage = document.getElementById("assignmentMessage") || document.getElementById("message");
const statuses = ["open", "preferred_pending", "claimed", "scheduled", "in_progress", "completed", "qa_pending", "cancelled"];
let assignments = new Map();
let activeStatusFilter = window.__turnlyAssignmentStatusFilter || "open";

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>']/g, (char) => (
    char === "&" ? "&amp;" : char === "<" ? "&lt;" : char === ">" ? "&gt;" : "&#39;"
  ));
}

function showMessage(text, isError = false) {
  if (!pageMessage) return;
  pageMessage.textContent = text;
  pageMessage.classList.toggle("error", isError);
}

function formatMoney(value) {
  const number = Number(value);
  return Number.isFinite(number) ? "$" + number.toFixed(2) : "$0.00";
}

function formatDateTime(value) {
  if (!value) return "Not set";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Not set" : date.toLocaleString();
}

function toDateTimeInput(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function moneyInputValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? String(number) : "";
}

function shortId(value) {
  return String(value || "").slice(0, 8) || "pending";
}

function metadataValue(item, key) {
  const metadata = item?.metadata && typeof item.metadata === "object" ? item.metadata : {};
  return metadata[key] || metadata.unit?.[key] || "";
}

function extractUnitFromTitle(title) {
  const text = String(title || "").replace(/\s+/g, " ").trim();
  if (!text) return "";

  const unitMatch = text.match(/\bunit\s+(.+?)(?:,\s*[\d,.]+\s*sq\b|,\s*\d|\s+-\s+|\s+[-]\s+)/i)
    || text.match(/\bunit\s+([^,]+)/i);
  if (unitMatch?.[1]) return unitMatch[1].trim();

  const hashMatch = text.match(/#\s*([A-Za-z0-9-]+)/);
  return hashMatch?.[1]?.trim() || "";
}

function unitInputValue(item) {
  return metadataValue(item, "unit_name")
    || metadataValue(item, "unit_number")
    || item.unit_name
    || item.unit_number
    || item.property_unit_name
    || item.property_unit_number
    || item.unit
    || extractUnitFromTitle(item.title);
}

function unitLabel(item) {
  return unitInputValue(item) || item.unit_id || "No unit";
}

function statusKey(status) {
  return String(status || "open").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function statusToken(status) {
  return String(status || "open").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function dateTime(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.getTime() : 0;
}

function isCompletedStatus(item) {
  return ["completed", "cancelled"].includes(statusToken(item.status));
}

function isOverdueAssignment(item) {
  if (isCompletedStatus(item)) return false;
  const due = dateTime(item.end_window) || dateTime(item.start_window);
  return Boolean(due && due < Date.now());
}

function isUpcomingAssignment(item) {
  if (isCompletedStatus(item)) return false;
  const start = dateTime(item.start_window);
  return Boolean(start && start > Date.now());
}

function matchesActiveStatus(item) {
  const filter = statusToken(activeStatusFilter || "open");
  if (filter === "all") return true;
  if (filter === "overdue") return isOverdueAssignment(item);
  if (filter === "upcoming") return isUpcomingAssignment(item);
  return statusToken(item.status) === filter;
}

function filterLabel() {
  return String(activeStatusFilter || "open").replace(/_/g, " ");
}

function statusOptions(current) {
  return statuses.map((status) => `
    <option value="${status}" ${status === current ? "selected" : ""}>${status.replaceAll("_", " ")}</option>
  `).join("");
}

function renderNotice(title, text = "", isError = false) {
  return `
    <div class="assignment-empty-row">
      <div class="empty-state assignment-table-empty ${isError ? "error" : ""}">
        <strong>${escapeHtml(title)}</strong>
        ${text ? `<p>${escapeHtml(text)}</p>` : ""}
        <div class="empty-lines"><span></span><span></span></div>
      </div>
    </div>
  `;
}

function renderAssignment(item) {
  const id = escapeHtml(item.id);
  const currentStatus = String(item.status || "open").toLowerCase();
  const property = item.property_name || "Property not set";
  const start = formatDateTime(item.start_window);
  const end = item.end_window ? formatDateTime(item.end_window) : "End not set";

  return `
    <article class="admin-assignment-row assignment-list-item assignment-thin-list-item ${isOverdueAssignment(item) ? "is-overdue" : ""}" data-admin-assignment-card="${id}" role="button" tabindex="0" aria-label="Edit assignment ${escapeHtml(shortId(item.id))}">
      <div class="assignment-thin-row">
        <div class="assignment-thin-cell assignment-thin-main">
          <small>${escapeHtml(shortId(item.id))}</small>
          <strong>${escapeHtml(property)}</strong>
        </div>
        <div class="assignment-thin-cell">
          <span>Unit</span>
          <strong>${escapeHtml(unitLabel(item))}</strong>
        </div>
        <div class="assignment-thin-cell">
          <span>Start</span>
          <strong>${escapeHtml(start)}</strong>
        </div>
        <div class="assignment-thin-cell">
          <span>End</span>
          <strong>${escapeHtml(end)}</strong>
        </div>
        <div class="assignment-thin-cell assignment-thin-pay">
          <span>Pay</span>
          <strong>${escapeHtml(formatMoney(item.pay_amount))}</strong>
        </div>
        <div class="assignment-thin-cell assignment-admin-status">
          <select class="assignment-status-select status-${statusKey(item.status)}" data-admin-status-id="${id}" aria-label="Assignment status">
            ${statusOptions(currentStatus)}
          </select>
          <small>${escapeHtml(item.priority || "Normal")}</small>
        </div>
        <div class="assignment-thin-actions">
          <div class="assignment-row-actions">
            <button type="button" class="table-action-button" data-admin-save-status="${id}">Update</button>
            <button type="button" class="table-action-button" data-admin-edit-assignment="${id}">Edit</button>
            <button type="button" class="table-action-button danger-btn" data-admin-delete-assignment="${id}">Delete</button>
          </div>
        </div>
      </div>
    </article>
  `;
}

async function requireAdmin() {
  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;
  if (!user) return false;

  const { data, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  return !error && String(data?.role || "").toLowerCase() === "admin";
}

async function loadAssignments() {
  if (!list || !supabase) return;
  ensureHeader();
  list.innerHTML = renderNotice("Loading assignments...");

  const { data, error } = await supabase
    .from("assignment_blocks")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    list.innerHTML = renderNotice("Unable to load assignments.", error.message, true);
    return;
  }

  assignments = new Map((data || []).map((item) => [item.id, item]));
  const visibleAssignments = (data || []).filter(matchesActiveStatus);
  list.innerHTML = visibleAssignments.length
    ? visibleAssignments.map(renderAssignment).join("")
    : renderNotice("No assignments found", "Assignments will appear here.");

  const listCount = document.getElementById("assignmentListCount");
  if (listCount) {
    listCount.textContent = `Showing ${visibleAssignments.length} ${filterLabel()} assignment${visibleAssignments.length === 1 ? "" : "s"}`;
  }
  showMessage(`${visibleAssignments.length} ${filterLabel()} assignment${visibleAssignments.length === 1 ? "" : "s"} synced from Supabase.`);
}

function ensureHeader() {
  const parent = list?.parentElement;
  if (!parent || parent.querySelector(".assignment-thin-list-head")) return;
  const header = document.createElement("div");
  header.className = "assignment-thin-list-head";
  header.innerHTML = `
    <span>Property</span><span>Unit</span><span>Start</span><span>End</span><span>Pay</span><span>Status</span><span>Actions</span>
  `;
  list.insertAdjacentElement("beforebegin", header);
}

function ensureEditModal() {
  let modal = document.getElementById("assignmentEditModal");
  if (modal) return modal;

  document.body.insertAdjacentHTML("beforeend", `
    <div id="assignmentEditModal" class="property-modal assignment-edit-modal" role="dialog" aria-modal="true" hidden>
      <div class="property-modal-backdrop" data-close-assignment-edit></div>
      <form id="assignmentEditForm" class="property-modal-panel assignment-edit-panel">
        <div class="property-modal-header">
          <div><p>Assignment Editor</p><h2>Edit current assignment</h2></div>
          <button type="button" class="property-modal-close" data-close-assignment-edit>Close</button>
        </div>
        <input id="assignmentEditId" type="hidden" />
        <div class="assignment-form-grid">
          <div><label>Assignment Title</label><input id="assignmentEditTitle" required /></div>
          <div><label>Status</label><select id="assignmentEditStatus"></select></div>
          <div><label>Property Name</label><input id="assignmentEditProperty" required /></div>
          <div><label>Unit Number / Name</label><input id="assignmentEditUnit" /></div>
          <div><label>Service Type</label><input id="assignmentEditService" /></div>
          <div class="span-two"><label>Address</label><input id="assignmentEditAddress" /></div>
          <div><label>Pay Amount</label><input id="assignmentEditPay" type="number" step="0.01" /></div>
          <div><label>Start Window</label><input id="assignmentEditStart" type="datetime-local" /></div>
          <div><label>End Window</label><input id="assignmentEditEnd" type="datetime-local" /></div>
          <div class="span-two"><label>Scope of Work</label><textarea id="assignmentEditScope"></textarea></div>
          <div><label>Supplies Notes</label><textarea id="assignmentEditSupplies"></textarea></div>
          <div><label>Special Instructions</label><textarea id="assignmentEditInstructions"></textarea></div>
        </div>
        <label class="admin-clear-claim-row">
          <input id="assignmentEditClearClaim" type="checkbox" />
          Clear contractor claim and return this assignment to the open board
        </label>
        <p id="assignmentEditMessage" class="status-message" aria-live="polite"></p>
        <div class="assignment-edit-actions">
          <button type="button" class="secondary-command-btn" data-close-assignment-edit>Cancel</button>
          <button type="submit" class="new-btn">Save Assignment</button>
        </div>
      </form>
    </div>
  `);

  modal = document.getElementById("assignmentEditModal");
  modal.querySelectorAll("[data-close-assignment-edit]").forEach((button) => button.addEventListener("click", closeEditModal));
  document.getElementById("assignmentEditForm")?.addEventListener("submit", saveAssignmentEdits);
  return modal;
}

function setEditValue(id, value) {
  const input = document.getElementById(id);
  if (input) input.value = value ?? "";
}

function openEditModal(assignmentId) {
  const item = assignments.get(assignmentId);
  if (!item) return;

  const modal = ensureEditModal();
  document.getElementById("assignmentEditStatus").innerHTML = statusOptions(String(item.status || "open").toLowerCase());
  setEditValue("assignmentEditId", item.id);
  setEditValue("assignmentEditTitle", item.title);
  setEditValue("assignmentEditProperty", item.property_name);
  setEditValue("assignmentEditUnit", unitInputValue(item));
  setEditValue("assignmentEditAddress", item.address);
  setEditValue("assignmentEditService", item.service_type);
  setEditValue("assignmentEditPay", moneyInputValue(item.pay_amount));
  setEditValue("assignmentEditStart", toDateTimeInput(item.start_window));
  setEditValue("assignmentEditEnd", toDateTimeInput(item.end_window));
  setEditValue("assignmentEditScope", item.scope);
  setEditValue("assignmentEditSupplies", item.supplies_notes);
  setEditValue("assignmentEditInstructions", item.special_instructions);

  const clearClaim = document.getElementById("assignmentEditClearClaim");
  if (clearClaim) {
    clearClaim.checked = false;
    clearClaim.disabled = !item.claimed_by;
  }

  document.getElementById("assignmentEditMessage").textContent = "";
  modal.hidden = false;
  document.body.classList.add("property-modal-open");
}

function closeEditModal() {
  const modal = document.getElementById("assignmentEditModal");
  if (modal) modal.hidden = true;
  document.body.classList.remove("property-modal-open");
}

function getEditPayload() {
  const id = document.getElementById("assignmentEditId").value;
  const current = assignments.get(id) || {};
  const metadata = current.metadata && typeof current.metadata === "object" ? { ...current.metadata } : {};
  const unitValue = document.getElementById("assignmentEditUnit").value.trim();
  if (unitValue) {
    metadata.unit_name = unitValue;
    metadata.unit_number = unitValue;
  } else {
    delete metadata.unit_name;
    delete metadata.unit_number;
  }

  const payload = {
    title: document.getElementById("assignmentEditTitle").value.trim(),
    property_name: document.getElementById("assignmentEditProperty").value.trim(),
    address: document.getElementById("assignmentEditAddress").value.trim(),
    service_type: document.getElementById("assignmentEditService").value.trim(),
    pay_amount: document.getElementById("assignmentEditPay").value || null,
    start_window: document.getElementById("assignmentEditStart").value || null,
    end_window: document.getElementById("assignmentEditEnd").value || null,
    scope: document.getElementById("assignmentEditScope").value.trim(),
    supplies_notes: document.getElementById("assignmentEditSupplies").value.trim(),
    special_instructions: document.getElementById("assignmentEditInstructions").value.trim(),
    metadata,
    status: document.getElementById("assignmentEditStatus").value
  };

  if (document.getElementById("assignmentEditClearClaim")?.checked) {
    Object.assign(payload, clearClaimPayload());
  }

  return payload;
}

function clearClaimPayload() {
  return {
    status: "open",
    claimed_by: null,
    claimed_by_name: null,
    claimed_by_email: null,
    claimed_at: null,
    started_at: null,
    started_by: null,
    start_latitude: null,
    start_longitude: null,
    start_location_accuracy: null,
    start_notes: null,
    start_distance_miles: null,
    checklist_responses: [],
    checklist_completed_at: null,
    completed_at: null,
    completed_by: null
  };
}

async function saveAssignmentEdits(event) {
  event.preventDefault();
  const id = document.getElementById("assignmentEditId").value;
  const message = document.getElementById("assignmentEditMessage");
  const button = event.submitter;
  if (!id) return;

  if (button) button.disabled = true;
  if (message) message.textContent = "Saving assignment...";

  const { data, error } = await supabase
    .from("assignment_blocks")
    .update(getEditPayload())
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (button) button.disabled = false;
  if (error) {
    if (message) message.textContent = "Error: " + error.message;
    if (message) message.classList.add("error");
    return;
  }

  if (data) assignments.set(id, data);
  closeEditModal();
  showMessage("Assignment updated.");
  await loadAssignments();
}

async function updateAssignmentStatus(assignmentId, row) {
  const select = row.querySelector("[data-admin-status-id]");
  const item = assignments.get(assignmentId);
  if (!select || !item) return;

  const payload = { status: select.value };
  if (select.value === "open" && item.claimed_by && window.confirm("Clear the contractor claim so this assignment is available again?")) {
    Object.assign(payload, clearClaimPayload());
  }

  showMessage("Updating assignment...");
  const { error } = await supabase
    .from("assignment_blocks")
    .update(payload)
    .eq("id", assignmentId);

  if (error) {
    showMessage("Error: " + error.message, true);
    return;
  }

  showMessage("Assignment status updated.");
  await loadAssignments();
}

async function deleteAssignment(assignmentId) {
  const item = assignments.get(assignmentId);
  const label = item?.title || item?.property_name || "this assignment";
  if (!window.confirm(`Delete ${label}? This cannot be undone.`)) return;

  showMessage("Deleting assignment...");
  const { error } = await supabase
    .from("assignment_blocks")
    .delete()
    .eq("id", assignmentId);

  if (error) {
    showMessage("Error: " + error.message, true);
    return;
  }

  showMessage("Assignment deleted.");
  await loadAssignments();
}

function bindActions() {
  list.addEventListener("click", async (event) => {
    const row = event.target.closest("[data-admin-assignment-card]");
    const updateButton = event.target.closest("[data-admin-save-status]");
    const editButton = event.target.closest("[data-admin-edit-assignment]");
    const deleteButton = event.target.closest("[data-admin-delete-assignment]");
    const interactiveTarget = event.target.closest("button, a, input, select, textarea, label, summary, details");
    if (!row) return;

    if (updateButton) {
      updateButton.disabled = true;
      await updateAssignmentStatus(updateButton.dataset.adminSaveStatus, row);
      updateButton.disabled = false;
      return;
    }

    if (editButton) {
      openEditModal(editButton.dataset.adminEditAssignment);
      return;
    }

    if (deleteButton) {
      deleteButton.disabled = true;
      await deleteAssignment(deleteButton.dataset.adminDeleteAssignment);
      deleteButton.disabled = false;
      return;
    }

    if (!interactiveTarget) {
      openEditModal(row.dataset.adminAssignmentCard);
    }
  });

  list.addEventListener("keydown", (event) => {
    const row = event.target.closest("[data-admin-assignment-card]");
    const interactiveTarget = event.target.closest("button, a, input, select, textarea, label, summary, details");
    if (!row || interactiveTarget || !["Enter", " "].includes(event.key)) return;
    event.preventDefault();
    openEditModal(row.dataset.adminAssignmentCard);
  });
}

function bindRowClickStyles() {
  if (document.getElementById("adminAssignmentRowClickStyles")) return;
  document.head.insertAdjacentHTML("beforeend", `
    <style id="adminAssignmentRowClickStyles">
      [data-admin-assignment-card] {
        cursor: pointer;
      }
      [data-admin-assignment-card]:focus-visible {
        border-color: rgba(0, 214, 163, 0.88);
        outline: 2px solid rgba(0, 214, 163, 0.36);
        outline-offset: 2px;
      }
      [data-admin-assignment-card] button,
      [data-admin-assignment-card] select {
        cursor: auto;
      }
    </style>
  `);
}

function bindActionsOnce() {
  if (list.dataset.assignmentRowsBound) return;
  list.dataset.assignmentRowsBound = "true";
  bindActions();
  bindRowClickStyles();
}

function injectStyles() {
  if (document.getElementById("adminAssignmentManagementStyles")) return;
  document.head.insertAdjacentHTML("beforeend", `
    <style id="adminAssignmentManagementStyles">
      #adminAssignments{align-items:start;display:grid;gap:4px;grid-template-columns:1fr;overflow-x:auto}
      .assignment-status-select{background:rgba(7,18,32,.84);border:1px solid rgba(117,143,169,.2);border-radius:6px;color:var(--suite-text,#f7fbff);min-height:26px;min-width:116px;padding:4px 8px;text-transform:capitalize}
      .assignment-admin-status{display:grid;gap:2px}.assignment-admin-status small{color:var(--suite-soft,#9aaabc);font-size:9px;font-weight:900;line-height:1;text-transform:uppercase}
      .danger-btn{border-color:rgba(255,91,102,.45)!important;color:var(--suite-red,#ff5b68)!important}
      .admin-clear-claim-row{align-items:center;background:rgba(255,213,40,.08);border:1px solid rgba(255,213,40,.18);border-radius:8px;color:#d8e2ee;display:flex;gap:10px;padding:12px}
      .admin-clear-claim-row input{width:auto}.assignment-edit-actions{display:flex;gap:12px;justify-content:flex-end}
      .assignment-edit-actions .new-btn,.assignment-edit-actions .secondary-command-btn{border:1px solid rgba(31,226,138,.35);min-width:160px}
      .assignment-table-empty{border:0;min-height:180px}.assignment-table-empty.error strong,.assignment-table-empty.error p{color:var(--suite-red,#ff5b68)}
    </style>
  `);
}

async function init() {
  if (!list || !supabase) return;
  injectStyles();
  ensureHeader();
  bindActionsOnce();
  document.addEventListener("turnly:assignment-status-filter", (event) => {
    activeStatusFilter = event.detail?.status || "open";
    window.__turnlyAssignmentStatusFilter = activeStatusFilter;
    void loadAssignments();
  });
  document.addEventListener("turnly:assignments-updated", () => {
    void loadAssignments();
  });
  list.innerHTML = renderNotice("Loading assignments...");

  if (!await requireAdmin()) {
    list.innerHTML = renderNotice("Admin access required", "Sign in as an admin to manage assignments.", true);
    return;
  }

  await loadAssignments();
  setTimeout(loadAssignments, 700);
}

init();
