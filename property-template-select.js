import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const supabase = createClient(
  window.__ENV.SUPABASE_URL,
  window.__ENV.SUPABASE_ANON_KEY
);

const propertyForm = document.getElementById("propertyForm");
const propertiesList = document.getElementById("propertiesList");
const propertyMessage = document.getElementById("propertyMessage");
const templateSelect = document.getElementById("property_checklist_template_input");

let templates = [];
let properties = [];

function showMessage(text) {
  if (propertyMessage) propertyMessage.textContent = text;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function normalizeItems(items) {
  return Array.isArray(items) ? items : [];
}

function normalizeSections(sections) {
  return Array.isArray(sections) ? sections : [];
}

function flattenTemplateSections(sections) {
  return normalizeSections(sections).flatMap((section) => {
    const directItems = normalizeItems(section.items).map((item) => ({
      category: section.title || "General",
      task: item.label || "",
      required: true,
      media_required: item.type === "photo" ? "photo" : "none",
      notes: item.type && item.type !== "checklist" ? `Response type: ${item.type}` : ""
    }));

    const roomItems = normalizeItems(section.rooms).flatMap((room) => (
      normalizeItems(room.items).map((item) => ({
        category: room.title || section.title || "General",
        task: item.label || "",
        required: true,
        media_required: item.type === "photo" ? "photo" : "none",
        notes: item.type && item.type !== "checklist" ? `Response type: ${item.type}` : ""
      }))
    ));

    return [...directItems, ...roomItems];
  }).filter((item) => item.task);
}

function isMissingColumnError(error, columns) {
  const messageText = error?.message || "";
  return columns.some((column) => messageText.includes(column));
}

function combineDateAndTime(dateValue, timeValue) {
  if (!dateValue) return null;
  return new Date(`${dateValue}T${timeValue || "09:00"}`);
}

async function getCurrentUser() {
  const { data } = await supabase.auth.getUser();
  return data.user;
}

async function loadTemplates() {
  if (!templateSelect) return;

  const { data, error } = await supabase
    .from("checklist_templates")
    .select("*")
    .order("updated_at", { ascending: false });

  if (error) {
    templates = [];
    templateSelect.innerHTML = `<option value="">Run checklist template migration first</option>`;
    return;
  }

  templates = data || [];
  templateSelect.innerHTML = [
    `<option value="">No checklist template selected</option>`,
    ...templates.map((template) => (
      `<option value="${escapeHtml(template.id)}">${escapeHtml(template.name)}</option>`
    ))
  ].join("");
}

async function loadProperties() {
  const { data, error } = await supabase
    .from("properties")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    if (propertiesList) propertiesList.innerHTML = `<p>${escapeHtml(error.message)}</p>`;
    return;
  }

  properties = data || [];
  renderProperties();
}

function renderProperties() {
  if (!propertiesList) return;

  propertiesList.innerHTML = properties.length
    ? properties.map(renderPropertyCard).join("")
    : "<p>No properties saved yet.</p>";
}

function renderPropertyCard(property) {
  const template = templates.find((item) => item.id === property.checklist_template_id);
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
      <p><strong>Checklist Template:</strong> ${escapeHtml(template?.name || "None selected")}</p>
      <p><strong>Recurring:</strong> ${escapeHtml(recurringLabel)}</p>
      <p><strong>Access Notes:</strong> ${escapeHtml(property.access_notes || "None")}</p>
    </div>
  `;
}

function fillTemplateOnEdit(property) {
  if (templateSelect) templateSelect.value = property.checklist_template_id || "";
}

function resetPropertyEditor() {
  propertyForm?.reset();

  const propertyIdInput = document.getElementById("property_id_input");
  const recurringEnabledInput = document.getElementById("recurring_enabled_input");
  const recurringFrequencyInput = document.getElementById("recurring_frequency_input");

  if (propertyIdInput) propertyIdInput.value = "";
  if (recurringEnabledInput) recurringEnabledInput.checked = false;
  if (recurringFrequencyInput) recurringFrequencyInput.value = "weekly";
  if (templateSelect) templateSelect.value = "";
}

function writeProperty(propertyId, payload, userId) {
  if (propertyId) {
    return supabase.from("properties").update(payload).eq("id", propertyId);
  }

  return supabase.from("properties").insert([{ ...payload, created_by: userId }]);
}

async function saveProperty(event) {
  if (event.target !== propertyForm) return;

  event.preventDefault();
  event.stopImmediatePropagation();

  const user = await getCurrentUser();
  if (!user) return;

  showMessage("Saving property...");

  const propertyId = document.getElementById("property_id_input")?.value || "";
  const existingProperty = properties.find((property) => property.id === propertyId);
  const selectedTemplate = templates.find((template) => template.id === templateSelect?.value);
  const recurringEnabled = Boolean(document.getElementById("recurring_enabled_input")?.checked);
  const recurringStartDate = document.getElementById("recurring_start_date_input")?.value || null;
  const recurringStartTime = document.getElementById("recurring_start_time_input")?.value || null;
  const firstDue = recurringEnabled ? combineDateAndTime(recurringStartDate, recurringStartTime) : null;

  if (recurringEnabled && !recurringStartDate) {
    showMessage("First assignment date is required for recurring assignments.");
    return;
  }

  const payload = {
    name: document.getElementById("property_name_input").value.trim(),
    address: document.getElementById("property_address_input").value.trim(),
    default_service_type: document.getElementById("property_service_type_input").value.trim(),
    checklist_template_id: selectedTemplate?.id || null,
    checklist_items: selectedTemplate
      ? flattenTemplateSections(selectedTemplate.sections)
      : normalizeItems(existingProperty?.checklist_items),
    default_scope: document.getElementById("property_scope_input").value.trim(),
    supplies_notes: document.getElementById("property_supplies_input").value.trim(),
    special_instructions: document.getElementById("property_instructions_input").value.trim(),
    access_notes: document.getElementById("property_access_input").value.trim(),
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
    showMessage("Property name is required.");
    return;
  }

  let result = await writeProperty(propertyId, payload, user.id);

  if (result.error && isMissingColumnError(result.error, [
    "checklist_template_id",
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
      "checklist_template_id",
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
      showMessage("Property saved. Run the latest Supabase migrations to enable checklist templates and recurring settings.");
      resetPropertyEditor();
      await loadProperties();
      return;
    }
  }

  if (result.error) {
    showMessage("Error: " + result.error.message);
    return;
  }

  showMessage(propertyId ? "Property updated." : "Property saved.");
  resetPropertyEditor();
  await loadProperties();
}

function handlePropertyClick(event) {
  const button = event.target.closest("[data-edit-property-id]");
  if (!button) return;

  const property = properties.find((item) => item.id === button.dataset.editPropertyId);
  if (property) fillTemplateOnEdit(property);
}

async function init() {
  if (!propertyForm) return;

  await loadTemplates();
  await loadProperties();
  propertiesList?.addEventListener("click", handlePropertyClick);
}

document.addEventListener("submit", saveProperty, true);

window.addEventListener("load", () => {
  setTimeout(init, 0);
});
