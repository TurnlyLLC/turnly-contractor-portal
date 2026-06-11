import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const supabase = createClient(
  window.__ENV.SUPABASE_URL,
  window.__ENV.SUPABASE_ANON_KEY
);

let workflowProperties = [];

const propertyForm = document.getElementById("propertyForm");
const propertiesList = document.getElementById("propertiesList");
const propertySelect = document.getElementById("propertySelect");
const assignmentForm = document.getElementById("assignmentForm");
const adminAssignments = document.getElementById("adminAssignments");
const message = document.getElementById("message");
const propertyMessage = document.getElementById("propertyMessage");
const recurringMessage = document.getElementById("recurringMessage");
const checklistPreview = document.getElementById("assignmentChecklistPreview");
const generateRecurringAssignmentsBtn = document.getElementById("generateRecurringAssignmentsBtn");

function showMessage(target, text) {
  if (target) target.textContent = text;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function normalizeChecklistItems(items) {
  return Array.isArray(items) ? items : [];
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function toDateInputValue(value) {
  if (!value) return "";
  const raw = String(value);

  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
    return raw.slice(0, 10);
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function toTimeInputValue(value) {
  if (!value) return "";
  const raw = String(value);

  if (/^\d{2}:\d{2}/.test(raw)) {
    return raw.slice(0, 5);
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function toDateTimeLocalInputValue(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return `${toDateInputValue(date)}T${toTimeInputValue(date)}`;
}

function combineDateAndTime(dateValue, timeValue) {
  if (!dateValue) return null;
  return new Date(`${dateValue}T${timeValue || "09:00"}`);
}

function addFrequency(date, frequency) {
  const next = new Date(date);

  if (frequency === "monthly") {
    next.setMonth(next.getMonth() + 1);
    return next;
  }

  next.setDate(next.getDate() + (frequency === "biweekly" ? 14 : 7));
  return next;
}

function getRecurringStart(property) {
  if (property.recurring_next_due_at) {
    return new Date(property.recurring_next_due_at);
  }

  return combineDateAndTime(property.recurring_start_date, property.recurring_start_time);
}

function getWindowEnd(startDate, endTime) {
  const end = new Date(startDate);
  const [hours = 17, minutes = 0] = String(endTime || "17:00").slice(0, 5).split(":").map(Number);

  end.setHours(hours, minutes, 0, 0);

  if (end <= startDate) {
    end.setDate(end.getDate() + 1);
  }

  return end;
}

function isMissingColumnError(error, columns) {
  const messageText = error?.message || "";
  return columns.some((column) => messageText.includes(column));
}

function getChecklistFromForm() {
  return Array.from(document.querySelectorAll("#checklistBuilder .checklist-item"))
    .map((item) => ({
      category: item.querySelector("[data-checklist-field='category']")?.value.trim() || "",
      task: item.querySelector("[data-checklist-field='task']")?.value.trim() || "",
      required: Boolean(item.querySelector("[data-checklist-field='required']")?.checked),
      media_required: item.querySelector("[data-checklist-field='media_required']")?.value || "none",
      notes: item.querySelector("[data-checklist-field='notes']")?.value.trim() || ""
    }))
    .filter((item) => item.category || item.task || item.notes);
}

async function getCurrentUser() {
  const { data } = await supabase.auth.getUser();
  return data.user;
}

async function loadWorkflowProperties() {
  const { data, error } = await supabase
    .from("properties")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    if (propertiesList) propertiesList.innerHTML = `<p>${escapeHtml(error.message)}</p>`;
    if (propertySelect) propertySelect.innerHTML = `<option value="">Choose a property...</option>`;
    return [];
  }

  workflowProperties = data || [];

  if (propertiesList) renderCurrentProperties();
  if (propertySelect) renderPropertySelect();

  return workflowProperties;
}

function renderCurrentProperties() {
  if (!propertiesList) return;

  propertiesList.innerHTML = workflowProperties.length
    ? workflowProperties.map(renderPropertyCard).join("")
    : "<p>No properties saved yet.</p>";
}

function renderPropertyCard(property) {
  const checklistItems = normalizeChecklistItems(property.checklist_items);
  const checklistPreviewItems = checklistItems.slice(0, 5).map((item) => (
    `<li>${escapeHtml(item.category || "General")}: ${escapeHtml(item.task || "Untitled task")}</li>`
  )).join("");
  const moreItems = checklistItems.length > 5
    ? `<p>${checklistItems.length - 5} more checklist item(s)</p>`
    : "";
  const recurringLabel = property.recurring_enabled
    ? `${property.recurring_frequency || "weekly"}${property.recurring_next_due_at ? " starting " + new Date(property.recurring_next_due_at).toLocaleString() : ""}`
    : "Off";

  return `
    <div class="assignment-card property-card">
      <div class="assignment-card-header">
        <div>
          <h3>${escapeHtml(property.name)}</h3>
          <p>${escapeHtml(property.address)}</p>
        </div>
        <button type="button" class="secondary-btn small-btn" data-edit-property-id="${escapeHtml(property.id)}">Edit</button>
      </div>
      <p><strong>Default Service:</strong> ${escapeHtml(property.default_service_type || "Not set")}</p>
      <p><strong>Access Notes:</strong> ${escapeHtml(property.access_notes || "None")}</p>
      <p><strong>Recurring:</strong> ${escapeHtml(recurringLabel)}</p>
      <div class="checklist-summary">
        <strong>Checklist:</strong>
        ${checklistItems.length ? `<ul>${checklistPreviewItems}</ul>${moreItems}` : "<p>No checklist items yet.</p>"}
      </div>
    </div>
  `;
}

function renderPropertySelect() {
  if (!propertySelect) return;
  const currentValue = propertySelect.value;

  propertySelect.innerHTML = [
    `<option value="">Choose a property...</option>`,
    ...workflowProperties.map((property) => (
      `<option value="${escapeHtml(property.id)}">${escapeHtml(property.name)}</option>`
    ))
  ].join("");

  if (currentValue) propertySelect.value = currentValue;
}

function fillRecurringFields(property) {
  const fieldMap = {
    property_id_input: property.id || "",
    recurring_frequency_input: property.recurring_frequency || "weekly",
    recurring_start_date_input: property.recurring_start_date || toDateInputValue(property.recurring_next_due_at),
    recurring_start_time_input: toTimeInputValue(property.recurring_start_time) || toTimeInputValue(property.recurring_next_due_at),
    recurring_end_time_input: toTimeInputValue(property.recurring_end_time),
    recurring_pay_amount_input: property.recurring_pay_amount || "",
    recurring_assignment_title_input: property.recurring_assignment_title || ""
  };

  Object.entries(fieldMap).forEach(([id, value]) => {
    const input = document.getElementById(id);
    if (input) input.value = value || "";
  });

  const enabledInput = document.getElementById("recurring_enabled_input");
  if (enabledInput) enabledInput.checked = Boolean(property.recurring_enabled);
}

function resetPropertyEditor() {
  document.getElementById("resetPropertyFormBtn")?.click();
  propertyForm?.reset();

  const propertyIdInput = document.getElementById("property_id_input");
  const recurringEnabledInput = document.getElementById("recurring_enabled_input");
  const recurringFrequencyInput = document.getElementById("recurring_frequency_input");

  if (propertyIdInput) propertyIdInput.value = "";
  if (recurringEnabledInput) recurringEnabledInput.checked = false;
  if (recurringFrequencyInput) recurringFrequencyInput.value = "weekly";
}

function renderAssignmentChecklistPreview(property) {
  if (!checklistPreview) return;

  if (!property) {
    checklistPreview.innerHTML = "<p>Select a property to preview its checklist.</p>";
    return;
  }

  const items = normalizeChecklistItems(property.checklist_items);

  if (!items.length) {
    checklistPreview.innerHTML = "<p>No property checklist saved for this property yet.</p>";
    return;
  }

  checklistPreview.innerHTML = `
    <strong>Property Checklist Preview</strong>
    <ul>
      ${items.map((item) => `
        <li>
          ${escapeHtml(item.category || "General")}: ${escapeHtml(item.task || "Untitled task")}
          ${item.media_required && item.media_required !== "none" ? ` (${escapeHtml(item.media_required.replace("_", " "))})` : ""}
        </li>
      `).join("")}
    </ul>
  `;
}

function fillAssignmentFromProperty(propertyId) {
  const property = workflowProperties.find((item) => item.id === propertyId);
  const assignmentPropertyId = document.getElementById("property_id");

  if (!property) {
    if (assignmentPropertyId) assignmentPropertyId.value = "";
    renderAssignmentChecklistPreview();
    return;
  }

  if (assignmentPropertyId) assignmentPropertyId.value = property.id || "";

  const startWindow = getRecurringStart(property);
  const titleInput = document.getElementById("title");
  if (titleInput) titleInput.value = property.recurring_assignment_title || `${property.default_service_type || "Cleaning"} - ${property.name}`;

  document.getElementById("property_name").value = property.name || "";
  document.getElementById("address").value = property.address || "";
  document.getElementById("service_type").value = property.default_service_type || "";
  document.getElementById("scope").value = property.default_scope || "";
  document.getElementById("pay_amount").value = property.recurring_pay_amount || "";
  document.getElementById("supplies_notes").value = property.supplies_notes || "";
  document.getElementById("special_instructions").value = property.special_instructions || "";

  if (startWindow && !Number.isNaN(startWindow.getTime())) {
    document.getElementById("start_window").value = toDateTimeLocalInputValue(startWindow);
    document.getElementById("end_window").value = toDateTimeLocalInputValue(getWindowEnd(startWindow, property.recurring_end_time));
  }

  renderAssignmentChecklistPreview(property);
}

async function saveProperty(event) {
  event.preventDefault();
  event.stopImmediatePropagation();

  const user = await getCurrentUser();
  if (!user) return;

  showMessage(propertyMessage, "Saving property...");

  const recurringEnabled = Boolean(document.getElementById("recurring_enabled_input")?.checked);
  const recurringStartDate = document.getElementById("recurring_start_date_input")?.value || null;
  const recurringStartTime = document.getElementById("recurring_start_time_input")?.value || null;
  const firstDue = recurringEnabled ? combineDateAndTime(recurringStartDate, recurringStartTime) : null;

  if (recurringEnabled && !recurringStartDate) {
    showMessage(propertyMessage, "First assignment date is required for recurring assignments.");
    return;
  }

  const payload = {
    name: document.getElementById("property_name_input").value.trim(),
    address: document.getElementById("property_address_input").value.trim(),
    default_service_type: document.getElementById("property_service_type_input").value.trim(),
    default_scope: document.getElementById("property_scope_input").value.trim(),
    supplies_notes: document.getElementById("property_supplies_input").value.trim(),
    special_instructions: document.getElementById("property_instructions_input").value.trim(),
    access_notes: document.getElementById("property_access_input").value.trim(),
    checklist_items: getChecklistFromForm(),
    recurring_enabled: recurringEnabled,
    recurring_frequency: document.getElementById("recurring_frequency_input")?.value || "weekly",
    recurring_start_date: recurringStartDate,
    recurring_start_time: recurringStartTime,
    recurring_end_time: document.getElementById("recurring_end_time_input")?.value || null,
    recurring_pay_amount: document.getElementById("recurring_pay_amount_input")?.value || null,
    recurring_assignment_title: document.getElementById("recurring_assignment_title_input")?.value.trim() || null,
    recurring_next_due_at: firstDue ? firstDue.toISOString() : null
  };

  if (!payload.name) {
    showMessage(propertyMessage, "Property name is required.");
    return;
  }

  const propertyId = document.getElementById("property_id_input")?.value;
  let result = await writeProperty(propertyId, payload, user.id);

  if (result.error && isMissingColumnError(result.error, [
    "recurring_enabled",
    "recurring_frequency",
    "recurring_start_date",
    "recurring_start_time",
    "recurring_end_time",
    "recurring_pay_amount",
    "recurring_assignment_title",
    "recurring_next_due_at"
  ])) {
    const legacyPayload = { ...payload };
    [
      "recurring_enabled",
      "recurring_frequency",
      "recurring_start_date",
      "recurring_start_time",
      "recurring_end_time",
      "recurring_pay_amount",
      "recurring_assignment_title",
      "recurring_next_due_at"
    ].forEach((column) => delete legacyPayload[column]);

    result = await writeProperty(propertyId, legacyPayload, user.id);

    if (!result.error) {
      showMessage(propertyMessage, "Property saved. Run the latest Supabase migration to enable recurring settings.");
      resetPropertyEditor();
      await loadWorkflowProperties();
      return;
    }
  }

  if (result.error) {
    showMessage(propertyMessage, "Error: " + result.error.message);
    return;
  }

  showMessage(propertyMessage, propertyId ? "Property updated." : "Property saved.");
  resetPropertyEditor();
  await loadWorkflowProperties();
}

function writeProperty(propertyId, payload, userId) {
  if (propertyId) {
    return supabase.from("properties").update(payload).eq("id", propertyId);
  }

  return supabase.from("properties").insert([{ ...payload, created_by: userId }]);
}

async function insertAssignment(assignment) {
  const result = await supabase.from("assignment_blocks").insert([assignment]);

  if (!result.error) return result;

  const propertyColumns = [
    "property_id",
    "property_checklist_items",
    "recurring_property_id",
    "recurring_due_at",
    "assignment_source"
  ];

  if (!isMissingColumnError(result.error, propertyColumns)) {
    return result;
  }

  const legacyAssignment = { ...assignment };
  propertyColumns.forEach((column) => delete legacyAssignment[column]);

  return supabase.from("assignment_blocks").insert([legacyAssignment]);
}

function buildAssignmentFromProperty(property, dueDate, user) {
  const endWindow = getWindowEnd(dueDate, property.recurring_end_time);

  return {
    property_id: property.id,
    recurring_property_id: property.id,
    recurring_due_at: dueDate.toISOString(),
    assignment_source: "recurring",
    title: property.recurring_assignment_title || `${property.default_service_type || "Cleaning"} - ${property.name}`,
    property_name: property.name || "",
    address: property.address || "",
    service_type: property.default_service_type || "",
    scope: property.default_scope || "",
    pay_amount: property.recurring_pay_amount || null,
    start_window: dueDate.toISOString(),
    end_window: endWindow.toISOString(),
    supplies_notes: property.supplies_notes || "",
    special_instructions: property.special_instructions || "",
    property_checklist_items: normalizeChecklistItems(property.checklist_items),
    status: "open",
    created_by: user?.id || null
  };
}

async function createAssignment(event) {
  event.preventDefault();
  event.stopImmediatePropagation();

  const user = await getCurrentUser();
  if (!user) return;

  const selectedProperty = workflowProperties.find((item) => item.id === propertySelect?.value);

  if (!selectedProperty) {
    showMessage(message, "Select a property before posting an assignment.");
    return;
  }

  showMessage(message, "Posting assignment...");

  const assignment = {
    property_id: selectedProperty.id,
    title: document.getElementById("title").value,
    property_name: document.getElementById("property_name").value,
    address: document.getElementById("address").value,
    service_type: document.getElementById("service_type").value,
    scope: document.getElementById("scope").value,
    pay_amount: document.getElementById("pay_amount").value || null,
    start_window: document.getElementById("start_window").value || null,
    end_window: document.getElementById("end_window").value || null,
    supplies_notes: document.getElementById("supplies_notes").value,
    special_instructions: document.getElementById("special_instructions").value,
    property_checklist_items: normalizeChecklistItems(selectedProperty.checklist_items),
    status: "open",
    created_by: user.id
  };

  const { error } = await insertAssignment(assignment);

  if (error) {
    showMessage(message, "Error: " + error.message);
    return;
  }

  showMessage(message, "Assignment posted successfully.");
  assignmentForm.reset();
  renderAssignmentChecklistPreview();
  await renderAdminAssignments();
}

async function recurringAssignmentExists(propertyId, dueDate) {
  const { data, error } = await supabase
    .from("assignment_blocks")
    .select("id")
    .eq("recurring_property_id", propertyId)
    .eq("recurring_due_at", dueDate.toISOString())
    .limit(1);

  return { exists: Boolean(data?.length), error };
}

async function updateRecurringProperty(propertyId, nextDueAt, generatedAssignments) {
  const payload = {
    recurring_next_due_at: nextDueAt.toISOString()
  };

  if (generatedAssignments > 0) {
    payload.recurring_last_generated_at = new Date().toISOString();
  }

  return supabase.from("properties").update(payload).eq("id", propertyId);
}

async function generateDueRecurringAssignments(options = {}) {
  const user = options.user || await getCurrentUser();
  const silent = Boolean(options.silent);

  if (!workflowProperties.length) await loadWorkflowProperties();

  const recurringProperties = workflowProperties.filter((property) => property.recurring_enabled);

  if (!recurringProperties.length) {
    if (!silent) showMessage(recurringMessage, "No recurring properties are enabled yet.");
    return 0;
  }

  const now = new Date();
  let createdCount = 0;
  let skippedCount = 0;

  for (const property of recurringProperties) {
    let dueDate = getRecurringStart(property);

    if (!dueDate || Number.isNaN(dueDate.getTime())) {
      skippedCount += 1;
      continue;
    }

    let generatedForProperty = 0;
    let guard = 0;

    while (dueDate <= now && guard < 24) {
      const duplicate = await recurringAssignmentExists(property.id, dueDate);

      if (duplicate.error) {
        if (!silent) {
          showMessage(recurringMessage, "Run the latest Supabase migration before generating recurring assignments: " + duplicate.error.message);
        }
        return createdCount;
      }

      if (!duplicate.exists) {
        const { error } = await insertAssignment(buildAssignmentFromProperty(property, dueDate, user));

        if (error) {
          if (!silent) showMessage(recurringMessage, "Error: " + error.message);
          return createdCount;
        }

        createdCount += 1;
        generatedForProperty += 1;
      }

      dueDate = addFrequency(dueDate, property.recurring_frequency);
      guard += 1;
    }

    if (guard >= 24) {
      skippedCount += 1;
      continue;
    }

    const { error } = await updateRecurringProperty(property.id, dueDate, generatedForProperty);

    if (error) {
      if (!silent) showMessage(recurringMessage, "Error updating recurring schedule: " + error.message);
      return createdCount;
    }
  }

  if (!silent) {
    if (createdCount > 0) {
      showMessage(recurringMessage, `${createdCount} recurring assignment${createdCount === 1 ? "" : "s"} opened.`);
    } else {
      showMessage(recurringMessage, skippedCount ? "No assignments opened. Check recurring dates for skipped properties." : "No recurring assignments are due right now.");
    }
  }

  await loadWorkflowProperties();
  await renderAdminAssignments();
  return createdCount;
}

function formatDateTime(value) {
  return value ? new Date(value).toLocaleString() : "Not set";
}

function formatMoney(value) {
  return value ? "$" + Number(value).toFixed(2) : "Not listed";
}

function statusClass(status) {
  return "status-" + String(status || "unknown").toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

async function renderAdminAssignments() {
  if (!adminAssignments) return;

  const { data, error } = await supabase
    .from("assignment_blocks")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    adminAssignments.innerHTML = `<p>${escapeHtml(error.message)}</p>`;
    return;
  }

  adminAssignments.innerHTML = data?.length
    ? data.map(renderAssignmentCard).join("")
    : "<p>No assignments have been posted yet.</p>";
}

function renderAssignmentCard(item) {
  const claimedAt = item.claimed_at ? " on " + formatDateTime(item.claimed_at) : "";
  const claimant = item.claimed_by_name || item.claimed_by_email || (item.claimed_by ? "Contractor name not captured yet" : "Not claimed yet");

  return `
    <div class="assignment-card">
      <div class="assignment-card-header">
        <h3>${escapeHtml(item.title)}</h3>
        <span class="status-badge ${statusClass(item.status)}">${escapeHtml(item.status || "unknown")}</span>
      </div>
      <p><strong>Property:</strong> ${escapeHtml(item.property_name)}</p>
      <p><strong>Address:</strong> ${escapeHtml(item.address)}</p>
      <p><strong>Service:</strong> ${escapeHtml(item.service_type)}</p>
      <p><strong>Pay:</strong> ${escapeHtml(formatMoney(item.pay_amount))}</p>
      <p><strong>Window:</strong> ${escapeHtml(formatDateTime(item.start_window))} - ${escapeHtml(formatDateTime(item.end_window))}</p>
      <p><strong>Scope:</strong> ${escapeHtml(item.scope)}</p>
      <p><strong>Supplies:</strong> ${escapeHtml(item.supplies_notes)}</p>
      <p><strong>Instructions:</strong> ${escapeHtml(item.special_instructions)}</p>
      <p><strong>Claimed By:</strong> ${escapeHtml(claimant + claimedAt)}</p>
    </div>
  `;
}

async function initPropertyPage() {
  await loadWorkflowProperties();
  propertyForm?.addEventListener("submit", saveProperty, true);

  propertiesList?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-edit-property-id]");
    if (!button) return;

    const property = workflowProperties.find((item) => item.id === button.dataset.editPropertyId);
    if (property) fillRecurringFields(property);
  }, true);
}

async function initAssignmentPage() {
  const user = await getCurrentUser();

  await loadWorkflowProperties();
  renderAssignmentChecklistPreview();
  await generateDueRecurringAssignments({ user, silent: true });
  await renderAdminAssignments();

  propertySelect?.addEventListener("change", () => {
    fillAssignmentFromProperty(propertySelect.value);
  });

  assignmentForm?.addEventListener("submit", createAssignment, true);
  generateRecurringAssignmentsBtn?.addEventListener("click", async () => {
    await generateDueRecurringAssignments({ user, silent: false });
  });
}

window.addEventListener("load", () => {
  if (propertyForm) initPropertyPage();
  if (assignmentForm) initAssignmentPage();
});
