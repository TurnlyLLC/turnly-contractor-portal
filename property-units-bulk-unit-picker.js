import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const env = window.__ENV || {};
const supabase = env.SUPABASE_URL && env.SUPABASE_ANON_KEY
  ? createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY)
  : null;

let units = [];
let selectedUnits = new Set();
let isLoading = false;
let isSaving = false;
let loadToken = 0;

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

function money(value) {
  return safeNumber(value).toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2
  });
}

function field(form, name) {
  return (form?.querySelector?.(`[name="${name}"]`)?.value || "").trim();
}

function selectedPropertyIds() {
  const list = document.getElementById("propertyUnitBulkPropertyList");
  if (list) {
    return Array.from(list.querySelectorAll("input[type='checkbox']:checked"))
      .map((input) => input.value)
      .filter(Boolean);
  }
  const selected = document.getElementById("propertyUnitPropertySelect")?.value || "";
  return selected ? [selected] : [];
}

function propertyName(propertyId) {
  const select = document.getElementById("propertyUnitPropertySelect");
  const option = Array.from(select?.options || []).find((item) => item.value === propertyId);
  return option?.textContent?.trim() || "Selected property";
}

function visiblePageUnitIds() {
  return Array.from(document.querySelectorAll("[data-property-unit-row]"))
    .map((row) => row.dataset.propertyUnitId)
    .filter(Boolean);
}

function unitSearch() {
  return document.getElementById("propertyUnitBulkUnitSearch")?.value || "";
}

function selectedUnitIds() {
  const available = new Set(units.map((unit) => unit.id));
  return Array.from(selectedUnits).filter((id) => available.has(id));
}

function filteredUnits(search = unitSearch()) {
  const query = String(search || "").trim().toLowerCase();
  if (!query) return units;
  return units.filter((unit) => [
    unit.unit_name,
    propertyName(unit.property_id),
    unit.square_feet,
    unit.customer_price,
    unit.contractor_pay
  ].some((value) => String(value ?? "").toLowerCase().includes(query)));
}

function renderUnits(search = unitSearch()) {
  const list = document.getElementById("propertyUnitBulkUnitList");
  const count = document.getElementById("propertyUnitBulkUnitCount");
  if (!list) return;

  if (!selectedPropertyIds().length) {
    list.innerHTML = `<div class="property-unit-bulk-unit-empty">Select one or more properties first.</div>`;
  } else if (isLoading) {
    list.innerHTML = `<div class="property-unit-bulk-unit-empty">Loading units...</div>`;
  } else {
    const rows = filteredUnits(search);
    list.innerHTML = rows.length
      ? rows.map((unit) => `
        <label class="property-unit-bulk-unit-option">
          <input type="checkbox" value="${escapeHtml(unit.id)}" ${selectedUnits.has(unit.id) ? "checked" : ""} />
          <span class="property-unit-bulk-unit-main">${escapeHtml(unit.unit_name || "Unnamed unit")}</span>
          <span class="property-unit-bulk-unit-meta">
            ${escapeHtml(propertyName(unit.property_id))}
            ${unit.square_feet ? ` | ${escapeHtml(unit.square_feet)} sq ft` : ""}
            ${unit.contractor_pay ? ` | Pay ${escapeHtml(money(unit.contractor_pay))}` : ""}
          </span>
        </label>
      `).join("")
      : `<div class="property-unit-bulk-unit-empty">No matching units</div>`;
  }

  const selectedCount = selectedUnitIds().length;
  if (count) {
    count.textContent = `${selectedCount.toLocaleString()} of ${units.length.toLocaleString()} unit${units.length === 1 ? "" : "s"} selected`;
  }
}

async function loadUnits() {
  const propertyIds = selectedPropertyIds();
  selectedUnits = new Set(selectedUnitIds());
  if (!propertyIds.length || !supabase) {
    units = [];
    renderUnits();
    void refreshSummary();
    return;
  }

  const token = ++loadToken;
  isLoading = true;
  renderUnits();
  try {
    const result = await supabase
      .from("property_units")
      .select("id, property_id, unit_name, square_feet, customer_price, contractor_pay")
      .in("property_id", propertyIds)
      .order("unit_name", { ascending: true })
      .limit(10000);

    if (token !== loadToken) return;
    if (result.error) throw result.error;
    units = result.data || [];
    const available = new Set(units.map((unit) => unit.id));
    selectedUnits = new Set(Array.from(selectedUnits).filter((id) => available.has(id)));
  } catch (error) {
    console.warn("[property-units-bulk-units] unable to load units", error);
    setMessage("Unable to load units for bulk edit: " + (error?.message || "Unknown error"), true);
  } finally {
    if (token === loadToken) {
      isLoading = false;
      renderUnits();
      void refreshSummary();
    }
  }
}

function ensureScopeOption() {
  const select = document.querySelector("#propertyUnitBulkForm [name='bulk_scope']");
  if (!select) return;
  if (!select.querySelector("option[value='selected_units']")) {
    select.insertAdjacentHTML("afterbegin", `<option value="selected_units">Only checked units</option>`);
  }
  const allOption = select.querySelector("option[value='all']");
  if (allOption) allOption.textContent = "All units on selected properties";
}

function ensureUnitPicker() {
  const form = document.getElementById("propertyUnitBulkForm");
  if (!form) return;

  ensureScopeOption();
  if (!document.getElementById("propertyUnitBulkUnitPicker")) {
    const html = `
      <section id="propertyUnitBulkUnitPicker" class="property-unit-bulk-unit-picker" aria-label="Bulk edit units">
        <div class="property-unit-bulk-unit-head">
          <label class="suite-field property-unit-bulk-unit-search">
            <span>Units</span>
            <input id="propertyUnitBulkUnitSearch" type="search" placeholder="Search selected property units..." autocomplete="off" />
          </label>
          <div class="property-unit-bulk-unit-actions">
            <button class="secondary-action" type="button" data-property-unit-bulk-select-visible-units>Select Visible</button>
            <button class="secondary-action" type="button" data-property-unit-bulk-select-all-units>Select All</button>
            <button class="secondary-action" type="button" data-property-unit-bulk-clear-units>Clear</button>
          </div>
        </div>
        <div id="propertyUnitBulkUnitList" class="property-unit-bulk-unit-list"></div>
        <span id="propertyUnitBulkUnitCount" class="property-unit-bulk-unit-count">0 units selected</span>
      </section>
    `;
    const propertyPicker = document.getElementById("propertyUnitBulkPropertyPicker");
    if (propertyPicker) propertyPicker.insertAdjacentHTML("afterend", html);
    else form.insertAdjacentHTML("afterbegin", html);
  }
}

function installStyles() {
  if (document.getElementById("propertyUnitBulkUnitPickerStyles")) return;
  const style = document.createElement("style");
  style.id = "propertyUnitBulkUnitPickerStyles";
  style.textContent = `
    .property-unit-bulk-unit-picker {
      border: 1px solid var(--suite-border-soft);
      border-radius: 8px;
      display: grid;
      gap: 10px;
      padding: 10px;
    }
    .property-unit-bulk-unit-head {
      align-items: end;
      display: grid;
      gap: 10px;
      grid-template-columns: minmax(0, 1fr) auto;
    }
    .property-unit-bulk-unit-search { margin: 0; }
    .property-unit-bulk-unit-search input {
      background: rgba(7, 18, 32, 0.8);
      border: 1px solid var(--suite-border-soft);
      border-radius: 6px;
      color: var(--suite-text);
      min-height: 34px;
      padding: 8px 9px;
      width: 100%;
    }
    .property-unit-bulk-unit-actions {
      display: flex;
      gap: 8px;
      justify-content: flex-end;
    }
    .property-unit-bulk-unit-list {
      border: 1px solid rgba(148, 163, 184, 0.16);
      border-radius: 6px;
      display: grid;
      gap: 4px;
      max-height: 230px;
      overflow: auto;
      padding: 6px;
    }
    .property-unit-bulk-unit-option {
      align-items: center;
      border-radius: 5px;
      color: var(--suite-text);
      cursor: pointer;
      display: grid;
      font-size: 12px;
      font-weight: 800;
      gap: 3px 8px;
      grid-template-columns: 16px minmax(0, 1fr);
      padding: 7px;
    }
    .property-unit-bulk-unit-option:hover { background: rgba(0, 214, 163, 0.08); }
    .property-unit-bulk-unit-option input {
      accent-color: var(--suite-green);
      grid-row: 1 / span 2;
      height: 14px;
      margin: 0;
      width: 14px;
    }
    .property-unit-bulk-unit-main,
    .property-unit-bulk-unit-meta {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .property-unit-bulk-unit-meta,
    .property-unit-bulk-unit-empty,
    .property-unit-bulk-unit-count {
      color: var(--suite-soft);
      font-size: 12px;
    }
    @media (max-width: 720px) {
      .property-unit-bulk-unit-head { grid-template-columns: 1fr; }
      .property-unit-bulk-unit-actions { display: grid; }
    }
  `;
  document.head.appendChild(style);
}

async function refreshSummary() {
  const form = document.getElementById("propertyUnitBulkForm");
  const summary = document.getElementById("propertyUnitBulkSummary");
  if (!form || !summary) return;
  const scope = form.elements.bulk_scope?.value || "selected_units";
  if (scope === "selected_units") {
    const count = selectedUnitIds().length;
    summary.textContent = `${count.toLocaleString()} checked unit${count === 1 ? "" : "s"} selected.`;
    return;
  }
  if (scope === "visible") {
    const count = visiblePageUnitIds().length;
    summary.textContent = `${count.toLocaleString()} visible unit${count === 1 ? "" : "s"} selected.`;
    return;
  }
  summary.textContent = `${units.length.toLocaleString()} unit${units.length === 1 ? "" : "s"} selected across ${selectedPropertyIds().length.toLocaleString()} propert${selectedPropertyIds().length === 1 ? "y" : "ies"}.`;
}

function idsForScope(scope) {
  if (scope === "visible") return visiblePageUnitIds();
  if (scope === "all") return units.map((unit) => unit.id);
  return selectedUnitIds();
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
  const scope = form.elements.bulk_scope?.value || "selected_units";
  const ids = idsForScope(scope);
  if (!ids.length) {
    setMessage(scope === "selected_units" ? "Select at least one unit before applying bulk changes." : "No units match that bulk edit scope.", true);
    return;
  }

  try {
    isSaving = true;
    const payload = bulkPayload(form);
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
    console.warn("[property-units-bulk-unit-picker] update failed", error);
    setMessage("Unable to bulk update units: " + (error?.message || "Unknown error"), true);
  } finally {
    isSaving = false;
  }
}

function resetForOpen() {
  ensureUnitPicker();
  const scope = document.querySelector("#propertyUnitBulkForm [name='bulk_scope']");
  if (scope) scope.value = "selected_units";
  const search = document.getElementById("propertyUnitBulkUnitSearch");
  if (search) search.value = "";
  selectedUnits.clear();
  void loadUnits();
}

function bindEvents() {
  window.addEventListener("click", (event) => {
    if (event.target?.closest?.("[data-property-unit-bulk-edit]")) {
      window.setTimeout(resetForOpen, 20);
      return;
    }

    if (event.target?.closest?.("[data-property-unit-bulk-select-visible], [data-property-unit-bulk-clear-properties]")) {
      window.setTimeout(loadUnits, 20);
      return;
    }

    if (event.target?.closest?.("[data-property-unit-bulk-select-visible-units]")) {
      event.preventDefault();
      event.stopPropagation();
      filteredUnits().forEach((unit) => selectedUnits.add(unit.id));
      renderUnits();
      void refreshSummary();
      return;
    }

    if (event.target?.closest?.("[data-property-unit-bulk-select-all-units]")) {
      event.preventDefault();
      event.stopPropagation();
      units.forEach((unit) => selectedUnits.add(unit.id));
      renderUnits();
      void refreshSummary();
      return;
    }

    if (event.target?.closest?.("[data-property-unit-bulk-clear-units]")) {
      event.preventDefault();
      event.stopPropagation();
      selectedUnits.clear();
      renderUnits();
      void refreshSummary();
    }
  }, true);

  window.addEventListener("input", (event) => {
    if (event.target?.id !== "propertyUnitBulkUnitSearch") return;
    renderUnits(event.target.value || "");
  }, true);

  window.addEventListener("change", (event) => {
    const propertyCheckbox = event.target?.closest?.("#propertyUnitBulkPropertyList input[type='checkbox']");
    if (propertyCheckbox) {
      window.setTimeout(loadUnits, 20);
      return;
    }

    const unitCheckbox = event.target?.closest?.("#propertyUnitBulkUnitList input[type='checkbox']");
    if (unitCheckbox) {
      if (unitCheckbox.checked) selectedUnits.add(unitCheckbox.value);
      else selectedUnits.delete(unitCheckbox.value);
      renderUnits();
      void refreshSummary();
      return;
    }

    if (event.target?.closest?.("#propertyUnitBulkForm [name='bulk_scope']")) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
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
  ensureUnitPicker();
  bindEvents();
  new MutationObserver(ensureUnitPicker).observe(document.body, { childList: true, subtree: true });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start, { once: true });
} else {
  start();
}
