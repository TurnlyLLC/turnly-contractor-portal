import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const env = window.__ENV || {};
const supabase = env.SUPABASE_URL && env.SUPABASE_ANON_KEY
  ? createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY)
  : null;

const notesByUnitId = new Map();
const unitRecordsById = new Map();
let clientProperties = [];
let activeClientId = "";
let isLoadingNotes = false;
let isLoadingClients = false;
let isHydrating = false;
let isPopulatingClientSelect = false;
let hydrateTimer = 0;

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function clientTitle(row) {
  return row?.property_name || row?.company_name || row?.name || row?.title || "Unnamed property";
}

function clientAddress(row) {
  return [row?.address, row?.city, row?.state, row?.postal_code].filter(Boolean).join(", ") || row?.region || row?.market || "";
}

function clientService(row) {
  const raw = row?.service_model || row?.service_type || row?.default_service_type || row?.client_type || "";
  return String(raw || "").replace(/[_-]/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function clientStatus(row) {
  return String(row?.status || row?.client_status || "").replace(/[_-]/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function hasClientId(id) {
  return Boolean(id && clientProperties.some((client) => client.id === id));
}

function showPropertyUnitMessage(text, isError = false) {
  const message = document.getElementById("propertyUnitMessage");
  if (!message) return;
  message.textContent = text;
  message.classList.toggle("error", Boolean(isError));
  message.classList.toggle("is-error", Boolean(isError));
}

function setHtmlIfChanged(element, html) {
  if (!element || element.innerHTML === html) return;
  element.innerHTML = html;
}

function setTextIfChanged(element, text) {
  if (!element || element.textContent === text) return;
  element.textContent = text;
}

function injectStyles() {
  if (document.getElementById("propertyUnitNotesStyles")) return;
  const style = document.createElement("style");
  style.id = "propertyUnitNotesStyles";
  style.textContent = `
    .property-unit-client-details {
      display: grid;
      gap: 10px;
    }
    .property-unit-detail-grid {
      display: grid;
      gap: 8px;
    }
    .property-unit-detail-grid div {
      display: grid;
      gap: 2px;
    }
    .property-unit-detail-grid dt {
      color: var(--muted, #94a3b8);
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    .property-unit-detail-grid dd {
      margin: 0;
      font-size: 13px;
    }
    .property-unit-notes-field textarea {
      min-height: 74px;
      resize: vertical;
    }
    .property-unit-quick-form .property-unit-notes-field {
      grid-column: 1 / -2;
    }
  `;
  document.head.appendChild(style);
}

function selectedClientProperty() {
  const select = document.getElementById("propertyUnitPropertySelect");
  const selectedId = select?.value || activeClientId;
  if (!selectedId) return null;
  return clientProperties.find((client) => client.id === selectedId) || null;
}

function detailRow(label, value) {
  if (!value) return "";
  return `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`;
}

function setPropertyDetailsTitle() {
  const summary = document.getElementById("propertyUnitPropertySummary");
  const panel = summary?.closest(".suite-panel, .panel, section, aside");
  const heading = panel?.querySelector("h2, h3, h4, .panel-title, .panel-heading");
  if (heading && /selected property/i.test(heading.textContent || "")) {
    heading.textContent = "Property Details";
  }
}

function updateClientPropertySummary() {
  const client = selectedClientProperty();
  setPropertyDetailsTitle();
  const summary = document.getElementById("propertyUnitPropertySummary");
  if (summary && client) {
    const detailRows = [
      detailRow("Status", clientStatus(client)),
      detailRow("Service", clientService(client)),
      detailRow("Market", client?.region || client?.market),
      detailRow("Primary Contact", client?.primary_contact || client?.contact_name),
      detailRow("Email", client?.contact_email || client?.email),
      detailRow("Phone", client?.contact_phone || client?.phone),
      detailRow("Properties", client?.properties || client?.property_count)
    ].filter(Boolean).join("");
    setHtmlIfChanged(summary, `
      <div class="property-unit-client-details">
        <div>
          <strong>${escapeHtml(clientTitle(client))}</strong>
          <p>${escapeHtml(clientAddress(client) || "No address on file")}</p>
        </div>
        ${detailRows ? `<dl class="property-unit-detail-grid">${detailRows}</dl>` : ""}
      </div>
    `);
  } else if (summary) {
    setHtmlIfChanged(summary, `
      <div class="property-unit-client-details">
        <strong>Select a property</strong>
        <p>Choose a client directory property to manage its units.</p>
      </div>
    `);
  }
  const listSummary = document.getElementById("propertyUnitListSummary");
  const rows = document.querySelectorAll("[data-property-unit-row]").length;
  if (listSummary && client) {
    setTextIfChanged(listSummary, `${rows.toLocaleString()} unit${rows === 1 ? "" : "s"} showing for ${clientTitle(client)}.`);
  } else if (listSummary) {
    setTextIfChanged(listSummary, "Select a client directory property to manage units.");
  }
}

function nextClientSelection(currentValue = "") {
  if (hasClientId(currentValue)) return currentValue;
  if (hasClientId(activeClientId)) return activeClientId;
  return "";
}

function clientOptionSignature() {
  return clientProperties.map((client) => `${client.id}:${clientTitle(client)}`).join("|");
}

function populateClientPropertySelect() {
  const select = document.getElementById("propertyUnitPropertySelect");
  if (!select || !clientProperties.length || isPopulatingClientSelect) return;

  isPopulatingClientSelect = true;
  const currentValue = select.value;
  const nextValue = nextClientSelection(currentValue);
  const signature = clientOptionSignature();
  if (select.dataset.clientDirectorySignature !== signature) {
    select.innerHTML = [
      `<option value="">Choose a client property...</option>`,
      ...clientProperties.map((client) => `<option value="${escapeHtml(client.id)}">${escapeHtml(clientTitle(client))}</option>`)
    ].join("");
    select.dataset.clientDirectorySignature = signature;
  }
  if (select.value !== nextValue) select.value = nextValue;
  if (nextValue) activeClientId = nextValue;
  isPopulatingClientSelect = false;
  updateClientPropertySummary();
}

async function loadClientProperties() {
  if (!supabase || isLoadingClients) return;
  isLoadingClients = true;
  let result = await supabase
    .from("clients")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(500);

  if (result.error && String(result.error.message || "").includes("updated_at")) {
    result = await supabase
      .from("clients")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
  }

  isLoadingClients = false;
  if (result.error) {
    console.warn("[property-units] Unable to load clients for property select", result.error);
    return;
  }

  clientProperties = (result.data || [])
    .filter((client) => clientTitle(client))
    .sort((a, b) => clientTitle(a).localeCompare(clientTitle(b)));
  populateClientPropertySelect();
}

function rememberUnitRecord(unit) {
  if (!unit?.id) return;
  unitRecordsById.set(unit.id, unit);
  notesByUnitId.set(unit.id, unit.notes || "");
}

function normalizeUnitName(value) {
  return String(value || "").trim().toLowerCase();
}

function duplicateUnitExists(propertyId, unitName, ignoreUnitId = "") {
  const normalized = normalizeUnitName(unitName);
  if (!propertyId || !normalized) return false;
  return Array.from(unitRecordsById.values()).some((unit) => (
    unit.id !== ignoreUnitId &&
    unit.property_id === propertyId &&
    normalizeUnitName(unit.unit_name) === normalized
  ));
}

function noteFieldHtml(value = "") {
  return `
    <label class="suite-field wide property-unit-notes-field">
      <span>Unit Instructions</span>
      <textarea name="notes" rows="2" placeholder="Access, parking, lockbox, scope notes">${escapeHtml(value)}</textarea>
    </label>
  `;
}

function findInsertTarget(form) {
  return form.querySelector("[name='contractor_pay']")?.closest(".suite-field")
    || form.querySelector("[name='customer_price']")?.closest(".suite-field")
    || form.lastElementChild;
}

function hydrateForm(form) {
  if (!form || form.querySelector("[name='notes']")) return;
  const unitId = form.dataset.propertyUnitId || "";
  const value = unitId ? notesByUnitId.get(unitId) || "" : "";
  const target = findInsertTarget(form);
  if (target) target.insertAdjacentHTML("afterend", noteFieldHtml(value));
}

function hydrateForms() {
  if (isHydrating) return;
  isHydrating = true;
  injectStyles();
  populateClientPropertySelect();
  document.querySelectorAll("#propertyUnitQuickForm, [data-property-unit-row]").forEach(hydrateForm);
  updateClientPropertySummary();
  isHydrating = false;
}

function scheduleHydrate() {
  if (hydrateTimer) return;
  hydrateTimer = window.setTimeout(() => {
    hydrateTimer = 0;
    hydrateForms();
  }, 80);
}

async function loadUnitNotes() {
  if (!supabase || isLoadingNotes) return;
  isLoadingNotes = true;
  const result = await supabase
    .from("property_units")
    .select("id,property_id,unit_name,notes")
    .limit(3000);
  isLoadingNotes = false;

  if (result.error) {
    console.warn("[property-units] Unable to load unit instructions", result.error);
    hydrateForms();
    return;
  }

  notesByUnitId.clear();
  unitRecordsById.clear();
  (result.data || []).forEach(rememberUnitRecord);
  hydrateForms();
}

function propertyUnitValue(form, name) {
  return form.querySelector(`[name='${name}']`)?.value?.trim() || "";
}

async function updateUnitNotes(unitId, notes) {
  if (!supabase || !unitId) return;
  notesByUnitId.set(unitId, notes);
  const existing = unitRecordsById.get(unitId);
  if (existing) unitRecordsById.set(unitId, { ...existing, notes });
  const result = await supabase
    .from("property_units")
    .update({ notes })
    .eq("id", unitId);
  if (result.error) console.warn("[property-units] Unable to save unit instructions", result.error);
}

async function findRecentlySavedUnit(propertyId, unitName) {
  if (!supabase || !propertyId || !unitName) return null;
  let result = await supabase
    .from("property_units")
    .select("id,unit_name,notes,created_at")
    .eq("property_id", propertyId)
    .eq("unit_name", unitName)
    .order("created_at", { ascending: false })
    .limit(1);

  if (result.error && String(result.error.message || "").includes("created_at")) {
    result = await supabase
      .from("property_units")
      .select("id,unit_name,notes")
      .eq("property_id", propertyId)
      .eq("unit_name", unitName)
      .limit(1);
  }

  if (result.error) {
    console.warn("[property-units] Unable to locate saved unit for instructions", result.error);
    return null;
  }
  return result.data?.[0] || null;
}

async function syncQuickUnitNotes({ propertyId, unitName, notes }) {
  if (!notes) return;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const unit = await findRecentlySavedUnit(propertyId, unitName);
    if (unit?.id) {
      rememberUnitRecord(unit);
      await updateUnitNotes(unit.id, notes);
      hydrateForms();
      return;
    }
    await new Promise((resolve) => window.setTimeout(resolve, 500));
  }
}

function bindSaves() {
  document.addEventListener("change", (event) => {
    if (event.target?.id !== "propertyUnitPropertySelect" || isPopulatingClientSelect) return;
    if (hasClientId(event.target.value)) activeClientId = event.target.value;
    window.setTimeout(() => {
      populateClientPropertySelect();
      updateClientPropertySummary();
      hydrateForms();
    }, 0);
  }, true);

  document.addEventListener("submit", (event) => {
    const form = event.target?.closest?.("#propertyUnitQuickForm, [data-property-unit-row]");
    if (!form) return;
    populateClientPropertySelect();
    const select = document.getElementById("propertyUnitPropertySelect");
    const propertyId = nextClientSelection(select?.value || activeClientId);
    if (!propertyId || !hasClientId(propertyId)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      showPropertyUnitMessage("Select a client directory property before saving units.", true);
      return;
    }
    activeClientId = propertyId;
    if (select && select.value !== propertyId) {
      select.value = propertyId;
    }

    const notes = propertyUnitValue(form, "notes");
    const unitId = form.dataset.propertyUnitId || "";
    const unitName = propertyUnitValue(form, "unit_name");
    if (!unitId && duplicateUnitExists(propertyId, unitName)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      showPropertyUnitMessage(`Unit ${unitName} already exists for ${clientTitle(selectedClientProperty())}.`, true);
      return;
    }
    if (unitId) {
      window.setTimeout(() => {
        void updateUnitNotes(unitId, notes);
        void loadUnitNotes();
      }, 500);
      return;
    }

    window.setTimeout(() => {
      void syncQuickUnitNotes({ propertyId, unitName, notes });
      void loadUnitNotes();
    }, 900);
  }, true);

  document.addEventListener("input", (event) => {
    if (event.target?.name !== "notes") return;
    const form = event.target.closest("[data-property-unit-row]");
    if (form?.dataset.propertyUnitId) notesByUnitId.set(form.dataset.propertyUnitId, event.target.value || "");
  });
}

window.addEventListener("load", () => {
  bindSaves();
  hydrateForms();
  void loadClientProperties();
  void loadUnitNotes();
  const observer = new MutationObserver(() => {
    scheduleHydrate();
  });
  observer.observe(document.body, { childList: true, subtree: true });
  window.setTimeout(loadClientProperties, 800);
  window.setTimeout(loadUnitNotes, 1200);
});