import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const env = window.__ENV || {};
const supabase = env.SUPABASE_URL && env.SUPABASE_ANON_KEY
  ? createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY)
  : null;

let selectedProperties = new Set();
let isSaving = false;

function setMessage(text, isError = false) {
  const message = document.getElementById("propertyUnitMessage");
  if (!message) return;
  message.textContent = text || "";
  message.classList.toggle("error", Boolean(isError));
  message.classList.toggle("is-error", Boolean(isError));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function safeNumber(value) {
  const number = Number(String(value ?? "").replace(/[$,\s]/g, ""));
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function field(form, name) {
  return (form?.querySelector?.(`[name="${name}"]`)?.value || "").trim();
}

function propertyOptions() {
  const select = document.getElementById("propertyUnitPropertySelect");
  return Array.from(select?.options || [])
    .map((option) => ({ id: option.value || "", name: option.textContent?.trim() || "" }))
    .filter((option) => option.id && option.name);
}

function selectedPropertyId() {
  return document.getElementById("propertyUnitPropertySelect")?.value || "";
}

function selectedPropertyIds() {
  const available = new Set(propertyOptions().map((option) => option.id));
  return Array.from(selectedProperties).filter((id) => available.has(id));
}

function visibleUnitIds() {
  return Array.from(document.querySelectorAll("[data-property-unit-row]"))
    .map((row) => row.dataset.propertyUnitId)
    .filter(Boolean);
}

function pickerSearch() {
  return document.getElementById("propertyUnitBulkPropertySearch")?.value || "";
}

function renderProperties(search = pickerSearch()) {
  const list = document.getElementById("propertyUnitBulkPropertyList");
  const count = document.getElementById("propertyUnitBulkPropertyCount");
  if (!list) return;

  const query = String(search || "").trim().toLowerCase();
  const filtered = propertyOptions().filter((option) => option.name.toLowerCase().includes(query));
  list.innerHTML = filtered.length
    ? filtered.map((option) => `
      <label class="property-unit-bulk-property-option">
        <input type="checkbox" value="${escapeHtml(option.id)}" ${selectedProperties.has(option.id) ? "checked" : ""} />
        <span>${escapeHtml(option.name)}</span>
      </label>
    `).join("")
    : `<div class="property-unit-bulk-property-empty">No matching properties</div>`;

  const selectedCount = selectedPropertyIds().length;
  if (count) count.textContent = `${selectedCount.toLocaleString()} propert${selectedCount === 1 ? "y" : "ies"} selected`;
}

function ensurePicker() {
  const form = document.getElementById("propertyUnitBulkForm");
  if (!form || document.getElementById("propertyUnitBulkPropertyPicker")) return;

  form.insertAdjacentHTML("afterbegin", `
    <section id="propertyUnitBulkPropertyPicker" class="property-unit-bulk-property-picker" aria-label="Bulk edit properties">
      <div class="property-unit-bulk-picker-head">
        <label class="suite-field property-unit-bulk-search">
          <span>Properties</span>
          <input id="propertyUnitBulkPropertySearch" type="search" placeholder="Search properties..." autocomplete="off" />
        </label>
        <div class="property-unit-bulk-picker-actions">
          <button class="secondary-action" type="button" data-property-unit-bulk-select-visible>Select Visible</button>
          <button class="secondary-action" type="button" data-property-unit-bulk-clear-properties>Clear</button>
        </div>
      </div>
      <div id="propertyUnitBulkPropertyList" class="property-unit-bulk-property-list"></div>
      <span id="propertyUnitBulkPropertyCount" class="property-unit-bulk-property-count">0 properties selected</span>
    </section>
  `);

  const scope = form.elements.bulk_scope;
  const allOption = scope?.querySelector?.("option[value='all']");
  if (allOption) allOption.textContent = "All units on selected properties";
  renderProperties();
}

function installStyles() {
  if (document.getElementById("propertyUnitBulkPropertyPickerStyles")) return;
  const style = document.createElement("style");
  style.id = "propertyUnitBulkPropertyPickerStyles";
  style.textContent = `
    .property-unit-bulk-property-picker {
      border: 1px solid var(--suite-border-soft);
      border-radius: 8px;
      display: grid;
      gap: 10px;
      padding: 10px;
    }
    .property-unit-bulk-picker-head {
      align-items: end;
      display: grid;
      gap: 10px;
      grid-template-columns: minmax(0, 1fr) auto;
    }
    .property-unit-bulk-search { margin: 0; }
    .property-unit-bulk-search input {
      background: rgba(7, 18, 32, 0.8);
      border: 1px solid var(--suite-border-soft);
      border-radius: 6px;
      color: var(--suite-text);
      min-height: 34px;
      padding: 8px 9px;
      width: 100%;
    }
    .property-unit-bulk-picker-actions {
      display: flex;
      gap: 8px;
      justify-content: flex-end;
    }
    .property-unit-bulk-property-list {
      border: 1px solid rgba(148, 163, 184, 0.16);
      border-radius: 6px;
      display: grid;
      gap: 4px;
      max-height: 190px;
      overflow: auto;
      padding: 6px;
    }
    .property-unit-bulk-property-option {
      align-items: center;
      border-radius: 5px;
      color: var(--suite-text);
      cursor: pointer;
      display: grid;
      font-size: 12px;
      font-weight: 800;
      gap: 8px;
      grid-template-columns: 16px minmax(0, 1fr);
      min-height: 30px;
      padding: 6px 7px;
    }
    .property-unit-bulk-property-option:hover { background: rgba(0, 214, 163, 0.08); }
    .property-unit-bulk-property-option input { accent-color: var(--suite-green); height: 14px; margin: 0; width: 14px; }
    .property-unit-bulk-property-option span {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .property-unit-bulk-property-empty,
    .property-unit-bulk-property-count {
      color: var(--suite-soft);
      font-size: 12px;
    }
    @media (max-width: 720px) {
      .property-unit-bulk-picker-head { grid-template-columns: 1fr; }
      .property-unit-bulk-picker-actions { display: grid; }
    }
  `;
  document.head.appendChild(style);
}

function resetSelection() {
  selectedProperties = new Set(selectedPropertyId() ? [selectedPropertyId()] : []);
  const search = document.getElementById("propertyUnitBulkPropertySearch");
  if (search) search.value = "";
  renderProperties("");
  void refreshSummary();
}

async function allUnitIds() {
  const propertyIds = selectedPropertyIds();
  if (!propertyIds.length) return [];
  const result = await supabase
    .from("property_units")
    .select("id")
    .in("property_id", propertyIds)
    .limit(10000);
  if (result.error) throw result.error;
  return (result.data || []).map((row) => row.id);
}

async function idsForScope(scope) {
  return scope === "visible" ? visibleUnitIds() : allUnitIds();
}

async function refreshSummary() {
  const form = document.getElementById("propertyUnitBulkForm");
  const summary = document.getElementById("propertyUnitBulkSummary");
  if (!form || !summary) return;
  const scope = form.elements.bulk_scope?.value || "all";
  const propertyCount = selectedPropertyIds().length;
  const count = scope === "visible" ? visibleUnitIds().length : (await allUnitIds()).length;
  summary.textContent = scope === "visible"
    ? `${count.toLocaleString()} visible unit${count === 1 ? "" : "s"} selected.`
    : `${count.toLocaleString()} unit${count === 1 ? "" : "s"} selected across ${propertyCount.toLocaleString()} propert${propertyCount === 1 ? "y" : "ies"}.`;
}

function bulkPayload(form) {
  const payload = {};
  if (form.elements.apply_square_feet?.checked) payload.square_feet = safeNumber(field(form, "square_feet"));
  if (form.elements.apply_customer_price?.checked) payload.customer_price = safeNumber(field(form, "customer_price"));
  if (form.elements.apply_contractor_pay?.checked) payload.contractor_pay = safeNumber(field(form, "contractor_pay"));
  if (form.elements.apply_notes?.checked) payload.notes = field(form, "notes");
  if (form.elements.apply_status?.checked) payload.status = field(form, "status") || "active";
  if (!Object.keys(payload).length) throw new Error("Choose at least one field to change.");
  return payload;
}

async function applyBulkEdit(form) {
  if (!supabase || isSaving) return;
  const scope = form.elements.bulk_scope?.value || "all";
  if (scope !== "visible" && !selectedPropertyIds().length) {
    setMessage("Select at least one property before bulk editing units.", true);
    return;
  }

  try {
    isSaving = true;
    const payload = bulkPayload(form);
    const ids = await idsForScope(scope);
    if (!ids.length) throw new Error("No units match that bulk edit scope.");

    setMessage(`Updating ${ids.length.toLocaleString()} unit${ids.length === 1 ? "" : "s"}...`);
    for (let index = 0; index < ids.length; index += 100) {
      const result = await supabase
        .from("property_units")
        .update(payload)
        .in("id", ids.slice(index, index + 100));
      if (result.error) throw result.error;
    }

    document.getElementById("propertyUnitBulkModal").hidden = true;
    document.body.classList.remove("property-unit-bulk-open");
    setMessage(`${ids.length.toLocaleString()} unit${ids.length === 1 ? "" : "s"} updated in Supabase.`);
    document.querySelector("[data-property-units-refresh]")?.click();
  } catch (error) {
    console.warn("[property-units-bulk-properties] update failed", error);
    setMessage("Unable to bulk update units: " + (error?.message || "Unknown error"), true);
  } finally {
    isSaving = false;
  }
}

function bindEvents() {
  document.addEventListener("click", (event) => {
    if (event.target?.closest?.("[data-property-unit-bulk-edit]")) {
      window.setTimeout(() => {
        ensurePicker();
        resetSelection();
      }, 0);
      return;
    }

    if (event.target?.closest?.("[data-property-unit-bulk-select-visible]")) {
      event.preventDefault();
      event.stopPropagation();
      const query = pickerSearch().trim().toLowerCase();
      propertyOptions()
        .filter((option) => option.name.toLowerCase().includes(query))
        .forEach((option) => selectedProperties.add(option.id));
      renderProperties();
      void refreshSummary();
      return;
    }

    if (event.target?.closest?.("[data-property-unit-bulk-clear-properties]")) {
      event.preventDefault();
      event.stopPropagation();
      selectedProperties.clear();
      renderProperties();
      void refreshSummary();
    }
  }, true);

  window.addEventListener("input", (event) => {
    if (event.target?.id !== "propertyUnitBulkPropertySearch") return;
    renderProperties(event.target.value || "");
  }, true);

  window.addEventListener("change", (event) => {
    const checkbox = event.target?.closest?.("#propertyUnitBulkPropertyList input[type='checkbox']");
    if (checkbox) {
      if (checkbox.checked) selectedProperties.add(checkbox.value);
      else selectedProperties.delete(checkbox.value);
      renderProperties();
      void refreshSummary();
      return;
    }

    if (event.target?.closest?.("#propertyUnitBulkForm [name='bulk_scope']")) {
      event.stopPropagation();
      void refreshSummary();
    }
  }, true);

  window.addEventListener("submit", (event) => {
    if (event.target?.id !== "propertyUnitBulkForm") return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    void applyBulkEdit(event.target);
  }, true);
}

function start() {
  installStyles();
  ensurePicker();
  bindEvents();
  new MutationObserver(ensurePicker).observe(document.body, { childList: true, subtree: true });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start, { once: true });
} else {
  start();
}
