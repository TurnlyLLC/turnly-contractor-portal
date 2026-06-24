import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const env = window.__ENV || {};
const supabase = env.SUPABASE_URL && env.SUPABASE_ANON_KEY
  ? createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY)
  : null;

const notesByUnitId = new Map();
let clientProperties = [];
let isLoadingNotes = false;
let isLoadingClients = false;
let isHydrating = false;
let isPopulatingClientSelect = false;

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

function injectStyles() {
  if (document.getElementById("propertyUnitNotesStyles")) return;
  const style = document.createElement("style");
  style.id = "propertyUnitNotesStyles";
  style.textContent = `
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
  if (!select?.value) return null;
  return clientProperties.find((client) => client.id === select.value) || null;
}

function updateClientPropertySummary() {
  const client = selectedClientProperty();
  const summary = document.getElementById("propertyUnitPropertySummary");
  if (summary && client) {
    summary.innerHTML = `
      <strong>${escapeHtml(clientTitle(client))}</strong>
      <p>${escapeHtml(clientAddress(client) || "No address on file")}</p>
    `;
  }
  const listSummary = document.getElementById("propertyUnitListSummary");
  const rows = document.querySelectorAll("[data-property-unit-row]").length;
  if (listSummary && client) {
    listSummary.textContent = `${rows.toLocaleString()} unit${rows === 1 ? "" : "s"} showing for ${clientTitle(client)}.`;
  }
}

function populateClientPropertySelect() {
  const select = document.getElementById("propertyUnitPropertySelect");
  if (!select || !clientProperties.length || isPopulatingClientSelect) return;

  isPopulatingClientSelect = true;
  const currentValue = select.value;
  const nextValue = clientProperties.some((client) => client.id === currentValue)
    ? currentValue
    : clientProperties[0]?.id || "";
  select.innerHTML = clientProperties
    .map((client) => `<option value="${escapeHtml(client.id)}">${escapeHtml(clientTitle(client))}</option>`)
    .join("");
  select.value = nextValue;
  isPopulatingClientSelect = false;

  if (nextValue && currentValue !== nextValue) {
    select.dispatchEvent(new Event("change", { bubbles: true }));
  }
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

async function loadUnitNotes() {
  if (!supabase || isLoadingNotes) return;
  isLoadingNotes = true;
  const result = await supabase
    .from("property_units")
    .select("id,notes")
    .limit(3000);
  isLoadingNotes = false;

  if (result.error) {
    console.warn("[property-units] Unable to load unit instructions", result.error);
    hydrateForms();
    return;
  }

  notesByUnitId.clear();
  (result.data || []).forEach((unit) => notesByUnitId.set(unit.id, unit.notes || ""));
  hydrateForms();
}

function propertyUnitValue(form, name) {
  return form.querySelector(`[name='${name}']`)?.value?.trim() || "";
}

async function updateUnitNotes(unitId, notes) {
  if (!supabase || !unitId) return;
  notesByUnitId.set(unitId, notes);
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
    window.setTimeout(() => {
      populateClientPropertySelect();
      updateClientPropertySummary();
      hydrateForms();
    }, 0);
  });

  document.addEventListener("submit", (event) => {
    const form = event.target?.closest?.("#propertyUnitQuickForm, [data-property-unit-row]");
    if (!form) return;
    const notes = propertyUnitValue(form, "notes");
    const unitId = form.dataset.propertyUnitId || "";
    if (unitId) {
      window.setTimeout(() => updateUnitNotes(unitId, notes), 500);
      return;
    }

    const propertyId = document.getElementById("propertyUnitPropertySelect")?.value || "";
    const unitName = propertyUnitValue(form, "unit_name");
    window.setTimeout(() => syncQuickUnitNotes({ propertyId, unitName, notes }), 900);
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
    hydrateForms();
  });
  observer.observe(document.body, { childList: true, subtree: true });
  window.setTimeout(loadClientProperties, 800);
  window.setTimeout(loadUnitNotes, 1200);
});