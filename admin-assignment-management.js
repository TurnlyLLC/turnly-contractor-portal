import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const env = window.__ENV || {};
const supabase = env.SUPABASE_URL && env.SUPABASE_ANON_KEY
  ? createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY)
  : null;

const list = document.getElementById("adminAssignments");
const pageMessage = document.getElementById("message");
const statusOptions = ["open", "claimed", "scheduled", "in_progress", "completed", "qa_pending", "cancelled"];
const assignmentTableColumns = 10;
let assignmentsById = new Map();

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function showMessage(text, isError = false) {
  if (!pageMessage) return;
  pageMessage.textContent = text;
  pageMessage.classList.toggle("error", isError);
}

function statusClass(status) {
  return "status-" + String(status || "unknown").toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function formatDateTime(value) {
  return value ? new Date(value).toLocaleString() : "Not set";
}

function formatMoney(value) {
  return value ? "$" + Number(value).toFixed(2) : "Not listed";
}

function shortId(value) {
  return String(value || "").slice(0, 8) || "pending";
}

function toDateTimeInput(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function moneyInputValue(value) {
  if (value === null || value === undefined || value === "") return "";
  const number = Number(value);
  return Number.isFinite(number) ? String(number) : "";
}

function renderStatusOptions(currentStatus) {
  return statusOptions.map((status) => `
    <option value="${status}" ${status === currentStatus ? "selected" : ""}>${status.replace(/_/g, " ")}</option>
  `).join("");
}

async function requireAdmin() {
  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user || null;
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
  list.innerHTML = renderTableNotice("Loading assignments...");

  const { data, error } = await supabase
    .from("assignment_blocks")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    list.innerHTML = renderTableNotice("Unable to load assignments.", error.message, true);
    return;
  }

  assignmentsById = new Map((data || []).map((item) => [item.id, item]));

  if (!data?.length) {
    list.innerHTML = renderTableNotice("No assignments found", "Assignments will appear here.");
    return;
  }

  list.innerHTML = data.map(renderAssignmentRow).join("");
}

function renderTableNotice(title, text = "", isError = false) {
  return `
    <tr class="assignment-empty-row">
      <td colspan="${assignmentTableColumns}">
        <div class="empty-state assignment-table-empty ${isError ? "error" : ""}">
          <strong>${escapeHtml(title)}</strong>
          ${text ? `<p>${escapeHtml(text)}</p>` : ""}
          <div class="empty-lines"><span></span><span></span></div>
        </div>
      </td>
    </tr>
  `;
}

function renderAssignmentRow(item) {
  const id = escapeHtml(item.id);
  const normalizedStatus = String(item.status || "unknown").toLowerCase();
  const claimedName = item.claimed_by_name || item.claimed_by_email || (item.claimed_by ? "Contractor assigned" : "Not claimed");
  const assignedName = item.assigned_to_name || item.assigned_to_email || "Unassigned";
  const priority = item.priority || "Medium";

  return `
    <tr class="admin-assignment-row" data-admin-assignment-card="${id}">
      <td><input type="checkbox" aria-label="Select assignment" /></td>
      <td>
        <strong>${escapeHtml(shortId(item.id))}</strong>
        <small>${escapeHtml(item.title || "Untitled assignment")}</small>
      </td>
      <td>
        <strong>${escapeHtml(item.property_name || "Property not set")}</strong>
        <small>${escapeHtml(item.address || "Address not set")}</small>
      </td>
      <td>${escapeHtml(item.service_type || "Service not set")}</td>
      <td>${escapeHtml(claimedName)}</td>
      <td>${escapeHtml(assignedName)}</td>
      <td>
        <strong>${escapeHtml(formatDateTime(item.start_window))}</strong>
        <small>${escapeHtml(item.end_window ? "Ends " + formatDateTime(item.end_window) : "End not set")}</small>
      </td>
      <td>
        <select class="assignment-status-select ${statusClass(item.status)}" data-admin-status-id="${id}" aria-label="Assignment status">
          ${renderStatusOptions(normalizedStatus)}
        </select>
      </td>
      <td><span class="status-badge status-yellow">${escapeHtml(priority)}</span></td>
      <td>
        <div class="assignment-inline-actions">
          <button type="button" class="secondary-btn small-btn" data-admin-save-status="${id}">Update</button>
          <button type="button" class="secondary-btn small-btn" data-admin-edit-assignment="${id}">Edit</button>
          <button type="button" class="secondary-btn small-btn danger-btn" data-admin-delete-assignment="${id}">Delete</button>
        </div>
      </td>
    </tr>
  `;
}

function ensureEditModal() {
  let modal = document.getElementById("assignmentEditModal");
  if (modal) return modal;

  document.body.insertAdjacentHTML("beforeend", `
    <div id="assignmentEditModal" class="property-modal assignment-edit-modal" role="dialog" aria-modal="true" hidden>
      <div class="property-modal-backdrop" data-close-assignment-edit></div>
      <form id="assignmentEditForm" class="property-modal-panel assignment-edit-panel">
        <div class="property-modal-header">
          <div>
            <p>Assignment Editor</p>
            <h2>Edit current assignment</h2>
          </div>
          <button type="button" class="property-modal-close" data-close-assignment-edit>Close</button>
        </div>

        <input id="assignmentEditId" type="hidden" />

        <div class="assignment-form-grid">
          <div>
            <label>Assignment Title</label>
            <input id="assignmentEditTitle" required />
          </div>
          <div>
            <label>Status</label>
            <select id="assignmentEditStatus"></select>
          </div>
          <div>
            <label>Property Name</label>
            <input id="assignmentEditProperty" required />
          </div>
          <div>
            <label>Service Type</label>
            <input id="assignmentEditService" />
          </div>
          <div class="span-two">
            <label>Address</label>
            <input id="assignmentEditAddress" />
          </div>
          <div>
            <label>Pay Amount</label>
            <input id="assignmentEditPay" type="number" step="0.01" />
          </div>
          <div>
            <label>Start Window</label>
            <input id="assignmentEditStart" type="datetime-local" />
          </div>
          <div>
            <label>End Window</label>
            <input id="assignmentEditEnd" type="datetime-local" />
          </div>
          <div class="span-two">
            <label>Scope of Work</label>
            <textarea id="assignmentEditScope"></textarea>
          </div>
          <div>
            <label>Supplies Notes</label>
            <textarea id="assignmentEditSupplies"></textarea>
          </div>
          <div>
            <label>Special Instructions</label>
            <textarea id="assignmentEditInstructions"></textarea>
          </div>
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
  modal.querySelectorAll("[data-close-assignment-edit]").forEach((button) => {
    button.addEventListener("click", closeEditModal);
  });
  document.getElementById("assignmentEditForm")?.addEventListener("submit", saveAssignmentEdits);
  return modal;
}

function setEditValue(id, value) {
  const input = document.getElementById(id);
  if (input) input.value = value ?? "";
}

function openEditModal(assignmentId) {
  const item = assignmentsById.get(assignmentId);
  if (!item) return;

  const modal = ensureEditModal();
  document.getElementById("assignmentEditStatus").innerHTML = renderStatusOptions(String(item.status || "open").toLowerCase());
  setEditValue("assignmentEditId", item.id);
  setEditValue("assignmentEditTitle", item.title);
  setEditValue("assignmentEditProperty", item.property_name);
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
    status: document.getElementById("assignmentEditStatus").value
  };

  if (document.getElementById("assignmentEditClearClaim")?.checked) {
    Object.assign(payload, {
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
    });
  }

  return payload;
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

  if (!data) {
    if (message) message.textContent = "Assignment was not found.";
    return;
  }

  assignmentsById.set(id, data);
  closeEditModal();
  showMessage("Assignment updated.");
  await loadAssignments();
}

async function updateAssignmentStatus(assignmentId) {
  const select = document.querySelector(`[data-admin-status-id="${CSS.escape(assignmentId)}"]`);
  const item = assignmentsById.get(assignmentId);
  if (!select || !item) return;

  const payload = { status: select.value };
  if (select.value === "open" && item.claimed_by) {
    const shouldClear = window.confirm("This assignment is claimed. Clear the contractor claim so it appears as available?");
    if (shouldClear) {
      Object.assign(payload, {
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
      });
    }
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
  const item = assignmentsById.get(assignmentId);
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

function bindListActions() {
  list.addEventListener("click", async (event) => {
    const statusButton = event.target.closest("[data-admin-save-status]");
    const editButton = event.target.closest("[data-admin-edit-assignment]");
    const deleteButton = event.target.closest("[data-admin-delete-assignment]");

    if (statusButton) {
      statusButton.disabled = true;
      await updateAssignmentStatus(statusButton.dataset.adminSaveStatus);
      statusButton.disabled = false;
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
    }
  });
}

function injectStyles() {
  if (document.getElementById("adminAssignmentManagementStyles")) return;
  document.head.insertAdjacentHTML("beforeend", `
    <style id="adminAssignmentManagementStyles">
      .admin-assignment-actions {
        align-items: end;
        display: grid;
        gap: 8px;
        grid-template-columns: minmax(130px, 1fr) repeat(3, auto);
        margin-top: 14px;
      }
      .admin-assignment-actions label {
        color: #d8e2ee;
        display: grid;
        font-size: 12px;
        font-weight: 800;
        gap: 6px;
      }
      .admin-assignment-actions select {
        min-height: 38px;
      }
      .admin-assignment-row td {
        vertical-align: middle;
      }
      .admin-assignment-row strong,
      .admin-assignment-row small {
        display: block;
      }
      .admin-assignment-row small {
        color: var(--suite-soft, #9aaabc);
        font-size: 11px;
        font-weight: 700;
        margin-top: 4px;
        max-width: 220px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .assignment-status-select {
        background: rgba(7, 18, 32, 0.84);
        border: 1px solid rgba(117, 143, 169, 0.2);
        border-radius: 6px;
        color: var(--suite-text, #f7fbff);
        min-height: 34px;
        min-width: 128px;
        padding: 7px 8px;
        text-transform: capitalize;
      }
      .assignment-inline-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        justify-content: flex-end;
      }
      .assignment-inline-actions .small-btn {
        min-height: 30px;
        padding: 0 10px;
      }
      .assignment-empty-row td {
        padding: 0;
      }
      .assignment-table-empty {
        border: 0;
        min-height: 270px;
      }
      .assignment-table-empty.error strong,
      .assignment-table-empty.error p {
        color: var(--suite-red, #ff5b68);
      }
      .danger-btn {
        border-color: rgba(255, 91, 102, 0.45);
        color: var(--suite-red, #ff5b68);
      }
      .assignment-command .status-scheduled {
        background: rgba(155, 108, 255, 0.13);
        color: var(--admin-violet);
      }
      .assignment-command .status-completed {
        background: rgba(31, 226, 138, 0.13);
        color: var(--admin-green);
      }
      .assignment-command .status-qa-pending {
        background: rgba(255, 213, 40, 0.14);
        color: var(--admin-yellow);
      }
      .assignment-command .status-cancelled {
        background: rgba(255, 91, 102, 0.13);
        color: var(--admin-red);
      }
      .admin-clear-claim-row {
        align-items: center;
        background: rgba(255, 213, 40, 0.08);
        border: 1px solid rgba(255, 213, 40, 0.18);
        border-radius: 8px;
        color: #d8e2ee;
        display: flex;
        gap: 10px;
        padding: 12px;
      }
      .admin-clear-claim-row input {
        width: auto;
      }
      .assignment-edit-actions {
        display: flex;
        gap: 12px;
        justify-content: flex-end;
      }
      .assignment-edit-actions .new-btn,
      .assignment-edit-actions .secondary-command-btn {
        border: 1px solid rgba(31, 226, 138, 0.35);
        min-width: 160px;
      }
      @media (max-width: 760px) {
        .admin-assignment-actions,
        .assignment-edit-actions {
          align-items: stretch;
          grid-template-columns: 1fr;
        }
        .admin-assignment-actions {
          display: grid;
        }
        .assignment-edit-actions {
          display: grid;
        }
        .assignment-inline-actions {
          justify-content: flex-start;
        }
      }
    </style>
  `);
}

async function init() {
  if (!list || !supabase) return;
  injectStyles();
  bindListActions();

  if (!await requireAdmin()) return;
  setTimeout(loadAssignments, 150);
  setTimeout(loadAssignments, 1200);
}

init();
