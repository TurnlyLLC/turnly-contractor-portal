import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const env = window.__ENV || {};
const supabase = env.SUPABASE_URL && env.SUPABASE_ANON_KEY
  ? createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY)
  : null;

const propertyForm = document.getElementById("propertyForm");
const propertiesList = document.getElementById("propertiesList");
const propertyMessage = document.getElementById("propertyMessage");
const templateSelect = document.getElementById("property_checklist_template_input");
const clientSelect = document.getElementById("property_client_id_input");
const clientNameInput = document.getElementById("property_client_name_input");
const clientEmailInput = document.getElementById("property_client_email_input");
const logoutBtn = document.getElementById("logoutBtn");

const PROPERTIES_TABLE = "portal_properties";

let currentUser = null;
let templates = [];
let clients = [];
let properties = [];

function showMessage(text, options = {}) {
  if (!propertyMessage) return;
  propertyMessage.textContent = text;
  propertyMessage.classList.toggle("error", Boolean(options.error));
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

function cleanPayload(payload) {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined && value !== "")
  );
}

async function getCurrentUser() {
  if (!supabase) return null;

  const { data } = await supabase.auth.getUser();
  return data.user;
}

async function requireAdmin() {
  const user = await getCurrentUser();

  if (!user) {
    window.location.href = "login.html";
    return null;
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (error || data?.role !== "admin") {
    window.location.href = data?.role === "contractor" ? "contractor.html" : "login.html";
    return null;
  }

  return user;
}

function getClientDisplayName(client) {
  return (
    client?.name ||
    client?.company_name ||
    client?.client_name ||
    client?.full_name ||
    client?.email ||
    client?.id ||
    "Unnamed Client"
  );
}

function getClientNameById(clientId) {
  const client = clients.find((item) => item.id === clientId);
  return client ? getClientDisplayName(client) : "Admin account";
}

function getPropertyDisplayName(property) {
  return property?.name || property?.property_name || "Untitled Property";
}

async function loadClients() {
  if (!clientSelect) return;

  const { data, error } = await supabase
    .from("clients")
    .select("*");

  if (error) {
    clients = [];
    clientSelect.innerHTML = `<option value="">Client list unavailable - save under admin</option>`;
    return;
  }

  clients = (data || []).sort((a, b) => (
    getClientDisplayName(a).localeCompare(getClientDisplayName(b))
  ));
  renderClientOptions();
}

function renderClientOptions(selectedClientId = clientSelect?.value) {
  if (!clientSelect) return;

  clientSelect.innerHTML = [
    `<option value="">Save under admin or add new client</option>`,
    ...clients.map((client) => (
      `<option value="${escapeHtml(client.id)}">${escapeHtml(getClientDisplayName(client))}</option>`
    ))
  ].join("");

  if (selectedClientId) clientSelect.value = selectedClientId;
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
  renderTemplateOptions();
}

function renderTemplateOptions(selectedTemplateId = templateSelect?.value) {
  if (!templateSelect) return;

  templateSelect.innerHTML = [
    `<option value="">No checklist template selected</option>`,
    ...templates.map((template) => (
      `<option value="${escapeHtml(template.id)}">${escapeHtml(template.name)}</option>`
    ))
  ].join("");

  if (selectedTemplateId) templateSelect.value = selectedTemplateId;
}

async function loadProperties() {
  const { data, error } = await supabase
    .from(PROPERTIES_TABLE)
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
  const propertyName = getPropertyDisplayName(property);

  return `
    <div class="assignment-card property-card">
      <div class="assignment-card-header">
        <div>
          <h3>${escapeHtml(propertyName)}</h3>
          <p>${escapeHtml(property.address || "Address not set")}</p>
          <span class="client-pill">${escapeHtml(getClientNameById(property.client_id))}</span>
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

function getInputValue(id) {
  return document.getElementById(id)?.value?.trim() || "";
}

function setInputValue(id, value) {
  const input = document.getElementById(id);
  if (input) input.value = value || "";
}

function fillPropertyOnEdit(property) {
  setInputValue("property_id_input", property.id);
  setInputValue("property_name_input", getPropertyDisplayName(property));
  setInputValue("property_address_input", property.address);
  setInputValue("property_service_type_input", property.default_service_type);
  setInputValue("property_scope_input", property.default_scope);
  setInputValue("property_supplies_input", property.supplies_notes);
  setInputValue("property_instructions_input", property.special_instructions);
  setInputValue("property_access_input", property.access_notes);
  setInputValue("recurring_frequency_input", property.recurring_frequency || "weekly");
  setInputValue("recurring_start_date_input", property.recurring_start_date);
  setInputValue("recurring_start_time_input", String(property.recurring_start_time || "").slice(0, 5));
  setInputValue("recurring_end_time_input", String(property.recurring_end_time || "").slice(0, 5));
  setInputValue("recurring_pay_amount_input", property.recurring_pay_amount);
  setInputValue("recurring_assignment_title_input", property.recurring_assignment_title);

  if (clientSelect) clientSelect.value = property.client_id || "";
  if (templateSelect) templateSelect.value = property.checklist_template_id || "";
  if (clientNameInput) clientNameInput.value = "";
  if (clientEmailInput) clientEmailInput.value = "";

  const recurringEnabledInput = document.getElementById("recurring_enabled_input");
  if (recurringEnabledInput) recurringEnabledInput.checked = Boolean(property.recurring_enabled);

  showMessage("Editing " + getPropertyDisplayName(property) + ".");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function resetPropertyEditor() {
  propertyForm?.reset();
  setInputValue("property_id_input", "");
  setInputValue("recurring_frequency_input", "weekly");
  if (clientSelect) clientSelect.value = "";
  if (templateSelect) templateSelect.value = "";
  showMessage("");
}

async function createClientRecord(name, email) {
  const candidatePayloads = [
    { name, email, created_by: currentUser?.id },
    { name, email },
    { name, created_by: currentUser?.id },
    { name },
    { company_name: name, email, created_by: currentUser?.id },
    { company_name: name, email },
    { company_name: name },
    { client_name: name, email, created_by: currentUser?.id },
    { client_name: name, email },
    { client_name: name }
  ].map(cleanPayload);

  let lastError = null;

  for (const payload of candidatePayloads) {
    const { data, error } = await supabase
      .from("clients")
      .insert([payload])
      .select("*")
      .single();

    if (!error) {
      clients = [...clients, data].sort((a, b) => (
        getClientDisplayName(a).localeCompare(getClientDisplayName(b))
      ));
      renderClientOptions(data.id);
      return { client: data, error: null };
    }

    lastError = error;

    if (!isMissingColumnError(error, ["created_by", "email", "name", "company_name", "client_name"])) {
      break;
    }
  }

  return { client: null, error: lastError };
}

async function resolveClientId(existingProperty) {
  const selectedClientId = clientSelect?.value || "";
  const newClientName = clientNameInput?.value.trim() || "";
  const newClientEmail = clientEmailInput?.value.trim() || "";

  if (selectedClientId) return selectedClientId;
  if (existingProperty?.client_id && !newClientName) return existingProperty.client_id;

  if (newClientName) {
    const { client, error } = await createClientRecord(newClientName, newClientEmail);

    if (client?.id) return client.id;

    showMessage("Could not create client: " + (error?.message || "unknown Supabase error"), { error: true });
    return null;
  }

  return currentUser?.id || null;
}

function writeProperty(propertyId, payload, userId) {
  if (propertyId) {
    return supabase.from(PROPERTIES_TABLE).update(payload).eq("id", propertyId);
  }

  return supabase.from(PROPERTIES_TABLE).insert([{ ...payload, created_by: userId }]);
}

async function saveProperty(event) {
  event.preventDefault();

  if (!currentUser) return;

  showMessage("Saving property...");

  const propertyId = getInputValue("property_id_input");
  const existingProperty = properties.find((property) => property.id === propertyId);
  const selectedTemplate = templates.find((template) => template.id === templateSelect?.value);
  const recurringEnabled = Boolean(document.getElementById("recurring_enabled_input")?.checked);
  const recurringStartDate = getInputValue("recurring_start_date_input") || null;
  const recurringStartTime = getInputValue("recurring_start_time_input") || null;
  const firstDue = recurringEnabled ? combineDateAndTime(recurringStartDate, recurringStartTime) : null;
  const clientId = await resolveClientId(existingProperty);
  const propertyName = getInputValue("property_name_input");

  if (!clientId) return;

  if (recurringEnabled && !recurringStartDate) {
    showMessage("First assignment date is required for recurring assignments.", { error: true });
    return;
  }

  const payload = {
    client_id: clientId,
    property_name: propertyName,
    name: propertyName,
    address: getInputValue("property_address_input"),
    pipeline_stage: existingProperty?.pipeline_stage || "new_leads",
    default_service_type: getInputValue("property_service_type_input"),
    checklist_template_id: selectedTemplate?.id || null,
    checklist_items: selectedTemplate
      ? flattenTemplateSections(selectedTemplate.sections)
      : normalizeItems(existingProperty?.checklist_items),
    default_scope: getInputValue("property_scope_input"),
    supplies_notes: getInputValue("property_supplies_input"),
    special_instructions: getInputValue("property_instructions_input"),
    access_notes: getInputValue("property_access_input"),
    recurring_enabled: recurringEnabled,
    recurring_frequency: getInputValue("recurring_frequency_input") || "weekly",
    recurring_start_date: recurringStartDate,
    recurring_start_time: recurringStartTime,
    recurring_end_time: getInputValue("recurring_end_time_input") || null,
    recurring_pay_amount: getInputValue("recurring_pay_amount_input") || null,
    recurring_assignment_title: getInputValue("recurring_assignment_title_input") || null,
    recurring_next_due_at: firstDue ? firstDue.toISOString() : null
  };

  if (!propertyName) {
    showMessage("Property name is required.", { error: true });
    return;
  }

  let result = await writeProperty(propertyId, payload, currentUser.id);

  if (result.error && isMissingColumnError(result.error, [
    "client_id",
    "pipeline_stage",
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
      "client_id",
      "pipeline_stage",
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

    result = await writeProperty(propertyId, legacyPayload, currentUser.id);
  }

  if (result.error) {
    const clientHint = result.error.message.includes("client_id")
      ? " Select an existing client or enter a new client name, then try again."
      : "";
    showMessage("Error: " + result.error.message + clientHint, { error: true });
    return;
  }

  showMessage(propertyId ? "Property updated." : "Property saved.");
  resetPropertyEditor();
  await Promise.all([loadClients(), loadProperties()]);
}

function handlePropertyClick(event) {
  const button = event.target.closest("[data-edit-property-id]");
  if (!button) return;

  const property = properties.find((item) => item.id === button.dataset.editPropertyId);
  if (property) fillPropertyOnEdit(property);
}

async function init() {
  if (!propertyForm) return;

  if (!supabase) {
    showMessage("Supabase configuration is missing. Check env.js before saving properties.", { error: true });
    return;
  }

  currentUser = await requireAdmin();
  if (!currentUser) return;

  await Promise.all([loadClients(), loadTemplates()]);
  await loadProperties();

  propertyForm.addEventListener("submit", saveProperty);
  propertiesList?.addEventListener("click", handlePropertyClick);
  document.getElementById("resetPropertyFormBtn")?.addEventListener("click", resetPropertyEditor);
  logoutBtn?.addEventListener("click", async () => {
    await supabase.auth.signOut();
    window.location.href = "login.html";
  });
}

init();
