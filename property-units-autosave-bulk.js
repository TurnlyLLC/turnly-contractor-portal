import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const env = window.__ENV || {};
const supabase = env.SUPABASE_URL && env.SUPABASE_ANON_KEY
  ? createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY)
  : null;

const bulkState = {
  started: false,
  properties: [],
  units: [],
  selectedPropertyIds: new Set(),
  selectedUnitIds: new Set(),
  autoSelectPropertyIds: new Set(),
  propertySearch: "",
  isLoadingUnits: false,
  isSaving: false,
  observer: null
};

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function workspace() {
  return document.querySelector("[data-property-units-page]");
}

function clientTitle(row) {
  return row?.property_name || row?.company_name || row?.name || row?.title || "Unnamed property";
}

function money(value) {
  const number = Number(value);
  const safe = Number.isFinite(number) ? number : 0;
  return safe.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

function setMessage(text, isError = false) {
  const message = document.getElementById("propertyUnitMessage");
  if (!message) return;
  message.textContent = text || "";
  message.classList.toggle("error", Boolean(isError));
  message.classList.toggle("is-error", Boolean(isError));
}

function setFeedback(text, isError = false) {
  const feedback = document.getElementById("propertyUnitBulkFeedback");
  if (!feedback) return;
  feedback.textContent = text || "";
  feedback.classList.toggle("is-error", Boolean(isError));
}

function selectedPagePropertyId() {
  return document.getElementById("propertyUnitPropertySelect")?.value || "";
}

function propertiesFromPageSelect() {
  const select = document.getElementById("propertyUnitPropertySelect");
  return Array.from(select?.options || [])
    .filter((option) => option.value)
    .map((option) => ({ id: option.value, title: option.textContent?.trim() || "Unnamed property" }));
}

function propertyTitle(propertyId) {
  return bulkState.properties.find((property) => property.id === propertyId)?.title || "Selected property";
}

function plural(count, singular, pluralLabel = `${singular}s`) {
  return `${count.toLocaleString()} ${count === 1 ? singular : pluralLabel}`;
}

async function loadProperties() {
  const options = propertiesFromPageSelect();
  if (options.length) {
    bulkState.properties = options.sort((a, b) => a.title.localeCompare(b.title));
    return;
  }

  if (!supabase) {
    bulkState.properties = [];
    return;
  }

  let result = await supabase
    .from("clients")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(1000);

  if (result.error && String(result.error.message || "").includes("updated_at")) {
    result = await supabase
      .from("clients")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1000);
  }

  if (result.error) throw result.error;

  bulkState.properties = (result.data || [])
    .filter((row) => clientTitle(row))
    .map((row) => ({ id: row.id, title: clientTitle(row) }))
    .sort((a, b) => a.title.localeCompare(b.title));
}

function ensureBulkButton() {
  const header = document.querySelector(".property-unit-list-head");
  const addButton = header?.querySelector("[data-property-unit-add]");
  if (!header || !addButton || document.getElementById("propertyUnitBulkEditBtn")) return;

  addButton.insertAdjacentHTML("beforebegin", `
    <button id="propertyUnitBulkEditBtn" class="secondary-action" type="button" data-property-unit-bulk-open>
      <span>Bulk Edit Units</span>
    </button>
  `);
}

function ensureBulkModal() {
  const root = workspace();
  if (!root) return null;

  let modal = document.getElementById("propertyUnitBulkModal");
  if (modal) return modal;

  root.insertAdjacentHTML("beforeend", `
    <div id="propertyUnitBulkModal" class="property-unit-bulk-modal" role="dialog" aria-modal="true" aria-labelledby="propertyUnitBulkTitle" hidden>
      <button class="property-unit-bulk-backdrop" type="button" data-property-unit-bulk-close aria-label="Close bulk edit"></button>
      <section class="property-unit-bulk-dialog">
        <header class="property-unit-bulk-head">
          <div>
            <p>Bulk Edit</p>
            <h2 id="propertyUnitBulkTitle">Update Property Units</h2>
            <span id="propertyUnitBulkSummary">Choose properties and units.</span>
          </div>
          <button class="secondary-action" type="button" data-property-unit-bulk-close>Close</button>
        </header>

        <form id="propertyUnitBulkForm" class="property-unit-bulk-form">
          <section class="property-unit-bulk-section">
            <div class="property-unit-bulk-section-head">
              <strong>Properties</strong>
              <span id="propertyUnitBulkPropertyCount">0 selected</span>
            </div>
            <label class="property-unit-bulk-search">
              <span class="sr-only">Search properties</span>
              <input id="propertyUnitBulkPropertySearch" type="search" placeholder="Search properties..." />
            </label>
            <div id="propertyUnitBulkProperties" class="property-unit-bulk-choice-list"></div>
          </section>

          <section class="property-unit-bulk-section">
            <div class="property-unit-bulk-section-head">
              <strong>Units</strong>
              <span id="propertyUnitBulkUnitCount">0 selected</span>
            </div>
            <div class="property-unit-bulk-mini-actions">
              <button class="secondary-action" type="button" data-property-unit-select-visible>Select visible</button>
              <button class="secondary-action" type="button" data-property-unit-clear-visible>Clear visible</button>
            </div>
            <div id="propertyUnitBulkUnits" class="property-unit-bulk-unit-list"></div>
          </section>

          <section class="property-unit-bulk-section">
            <div class="property-unit-bulk-section-head">
              <strong>Fields To Update</strong>
              <span>Only checked fields will change</span>
            </div>
            <div class="property-unit-bulk-field-grid">
              <label class="property-unit-bulk-field">
                <span><input type="checkbox" name="apply_square_feet" /> Sq Ft</span>
                <input name="square_feet" type="number" min="0" step="1" inputmode="decimal" />
              </label>
              <label class="property-unit-bulk-field">
                <span><input type="checkbox" name="apply_customer_price" /> Customer Charge</span>
                <input name="customer_price" type="number" min="0" step="0.01" inputmode="decimal" />
              </label>
              <label class="property-unit-bulk-field">
                <span><input type="checkbox" name="apply_contract_pay" /> Contractor Pay</span>
                <input name="contractor_pay" type="number" min="0" step="0.01" inputmode="decimal" />
              </label>
            </div>
          </section>

          <p id="propertyUnitBulkFeedback" class="property-unit-bulk-feedback"></p>
          <div class="property-unit-bulk-actions">
            <button class="secondary-action" type="button" data-property-unit-bulk-close>Cancel</button>
            <button id="propertyUnitBulkApplyBtn" class="primary-action" type="submit">Apply Bulk Edit</button>
          </div>
        </form>
      </section>
    </div>
  `);

  return document.getElementById("propertyUnitBulkModal");
}

function renderPropertyChoices() {
  const list = document.getElementById("propertyUnitBulkProperties");
  if (!list) return;

  const term = bulkState.propertySearch.trim().toLowerCase();
  const properties = bulkState.properties.filter((property) => !term || property.title.toLowerCase().includes(term));

  list.innerHTML = properties.length
    ? properties.map((property) => `
      <label class="property-unit-bulk-choice">
        <input type="checkbox" data-bulk-property-id="${escapeHtml(property.id)}" ${bulkState.selectedPropertyIds.has(property.id) ? "checked" : ""} />
        <span>${escapeHtml(property.title)}</span>
      </label>
    `).join("")
    : `<div class="property-unit-bulk-empty">No matching properties.</div>`;

  updateBulkSummary();
}

function renderUnitChoices() {
  const list = document.getElementById("propertyUnitBulkUnits");
  if (!list) return;

  const propertyIds = Array.from(bulkState.selectedPropertyIds);
  if (bulkState.isLoadingUnits) {
    list.innerHTML = `<div class="property-unit-bulk-empty">Loading units...</div>`;
    updateBulkSummary();
    return;
  }

  if (!propertyIds.length) {
    list.innerHTML = `<div class="property-unit-bulk-empty">Select one or more properties to see available units.</div>`;
    updateBulkSummary();
    return;
  }

  const html = propertyIds.map((propertyId) => {
    const units = bulkState.units
      .filter((unit) => unit.property_id === propertyId)
      .sort((a, b) => String(a.unit_name || "").localeCompare(String(b.unit_name || ""), undefined, { numeric: true, sensitivity: "base" }));

    return `
      <section class="property-unit-bulk-unit-group">
        <div class="property-unit-bulk-unit-group-head">
          <strong>${escapeHtml(propertyTitle(propertyId))}</strong>
          <span>${plural(units.length, "unit")}</span>
          <div>
            <button class="secondary-action" type="button" data-bulk-property-select-units="${escapeHtml(propertyId)}">All</button>
            <button class="secondary-action" type="button" data-bulk-property-clear-units="${escapeHtml(propertyId)}">None</button>
          </div>
        </div>
        ${units.length ? units.map((unit) => `
          <label class="property-unit-bulk-unit">
            <input type="checkbox" data-bulk-unit-id="${escapeHtml(unit.id)}" ${bulkState.selectedUnitIds.has(unit.id) ? "checked" : ""} />
            <span>
              <strong>${escapeHtml(unit.unit_name || "Unnamed unit")}</strong>
              <small>${escapeHtml(Number(unit.square_feet || 0).toLocaleString())} sq ft | ${escapeHtml(money(unit.customer_price))} customer | ${escapeHtml(money(unit.contractor_pay))} contractor</small>
            </span>
          </label>
        `).join("") : `<div class="property-unit-bulk-empty">No units found for this property.</div>`}
      </section>
    `;
  }).join("");

  list.innerHTML = html;
  updateBulkSummary();
}

function updateBulkSummary() {
  const propertyCount = bulkState.selectedPropertyIds.size;
  const unitCount = bulkState.selectedUnitIds.size;
  const summary = document.getElementById("propertyUnitBulkSummary");
  const propertyCountLabel = document.getElementById("propertyUnitBulkPropertyCount");
  const unitCountLabel = document.getElementById("propertyUnitBulkUnitCount");
  const applyButton = document.getElementById("propertyUnitBulkApplyBtn");

  if (summary) summary.textContent = `${plural(propertyCount, "property", "properties")} and ${plural(unitCount, "unit")} selected.`;
  if (propertyCountLabel) propertyCountLabel.textContent = `${propertyCount.toLocaleString()} selected`;
  if (unitCountLabel) unitCountLabel.textContent = `${unitCount.toLocaleString()} selected`;
  if (applyButton) {
    applyButton.disabled = bulkState.isSaving || !unitCount;
    applyButton.textContent = bulkState.isSaving ? "Applying..." : "Apply Bulk Edit";
  }
}

async function loadUnitsForSelection(selectAll = false) {
  if (!supabase) return;

  const propertyIds = Array.from(bulkState.selectedPropertyIds);
  if (!propertyIds.length) {
    bulkState.units = [];
    bulkState.selectedUnitIds.clear();
    renderUnitChoices();
    return;
  }

  bulkState.isLoadingUnits = true;
  renderUnitChoices();

  const result = await supabase
    .from("property_units")
    .select("*")
    .in("property_id", propertyIds)
    .order("unit_name", { ascending: true })
    .limit(5000);

  bulkState.isLoadingUnits = false;
  if (result.error) {
    bulkState.units = [];
    setFeedback("Unable to load units: " + result.error.message, true);
    renderUnitChoices();
    return;
  }

  bulkState.units = result.data || [];
  const availableUnitIds = new Set(bulkState.units.map((unit) => unit.id));
  Array.from(bulkState.selectedUnitIds).forEach((id) => {
    if (!availableUnitIds.has(id)) bulkState.selectedUnitIds.delete(id);
  });

  if (selectAll || bulkState.autoSelectPropertyIds.size) {
    bulkState.units.forEach((unit) => {
      if (selectAll || bulkState.autoSelectPropertyIds.has(unit.property_id)) {
        bulkState.selectedUnitIds.add(unit.id);
      }
    });
    bulkState.autoSelectPropertyIds.clear();
  }

  renderUnitChoices();
}

async function openBulkModal() {
  if (!supabase) {
    setMessage("Supabase config is missing. Add env.js values before bulk editing units.", true);
    return;
  }

  const modal = ensureBulkModal();
  if (!modal) return;

  bulkState.selectedPropertyIds.clear();
  bulkState.selectedUnitIds.clear();
  bulkState.autoSelectPropertyIds.clear();
  bulkState.propertySearch = "";

  modal.hidden = false;
  document.body.classList.add("property-unit-bulk-open");
  setFeedback("Loading properties...");

  try {
    await loadProperties();
    const selectedPropertyId = selectedPagePropertyId();
    if (selectedPropertyId && bulkState.properties.some((property) => property.id === selectedPropertyId)) {
      bulkState.selectedPropertyIds.add(selectedPropertyId);
      bulkState.autoSelectPropertyIds.add(selectedPropertyId);
    }
    const search = document.getElementById("propertyUnitBulkPropertySearch");
    if (search) search.value = "";
    renderPropertyChoices();
    setFeedback(selectedPropertyId ? "" : "Choose one or more properties to begin.");
    await loadUnitsForSelection();
  } catch (error) {
    setFeedback("Unable to load properties: " + (error?.message || "Unknown error"), true);
  }
}

function closeBulkModal() {
  const modal = document.getElementById("propertyUnitBulkModal");
  if (modal) modal.hidden = true;
  document.body.classList.remove("property-unit-bulk-open");
}

function parseBulkNumber(form, name, label) {
  const raw = String(form.elements[name]?.value || "").trim();
  if (!raw) throw new Error(`${label} needs a value.`);
  const number = Number(raw.replace(/[$,\s]/g, ""));
  if (!Number.isFinite(number) || number < 0) throw new Error(`${label} must be zero or higher.`);
  return name === "square_feet" ? Math.round(number) : number;
}

function collectBulkPayload(form) {
  const payload = {};
  if (form.elements.apply_square_feet?.checked) {
    payload.square_feet = parseBulkNumber(form, "square_feet", "Sq Ft");
  }
  if (form.elements.apply_customer_price?.checked) {
    payload.customer_price = parseBulkNumber(form, "customer_price", "Customer Charge");
  }
  if (form.elements.apply_contract_pay?.checked) {
    payload.contractor_pay = parseBulkNumber(form, "contractor_pay", "Contractor Pay");
  }
  if (!Object.keys(payload).length) throw new Error("Check at least one field to update.");
  return payload;
}

async function applyBulkEdit(form) {
  if (!supabase || bulkState.isSaving) return;

  const ids = Array.from(bulkState.selectedUnitIds);
  if (!ids.length) {
    setFeedback("Select at least one unit to update.", true);
    return;
  }

  let payload;
  try {
    payload = collectBulkPayload(form);
  } catch (error) {
    setFeedback(error.message, true);
    return;
  }

  bulkState.isSaving = true;
  updateBulkSummary();
  setFeedback(`Updating ${plural(ids.length, "unit")}...`);

  try {
    for (let index = 0; index < ids.length; index += 100) {
      const result = await supabase
        .from("property_units")
        .update(payload)
        .in("id", ids.slice(index, index + 100));
      if (result.error) throw result.error;
    }

    setFeedback(`${plural(ids.length, "unit")} updated.`);
    setMessage(`${plural(ids.length, "unit")} updated in Supabase.`);
    await loadUnitsForSelection();
    document.querySelector("[data-property-units-refresh]")?.click();
  } catch (error) {
    setFeedback("Unable to bulk update units: " + (error?.message || "Unknown error"), true);
  } finally {
    bulkState.isSaving = false;
    updateBulkSummary();
  }
}

function selectedVisibleUnitIds() {
  return Array.from(document.querySelectorAll("#propertyUnitBulkUnits [data-bulk-unit-id]"))
    .map((input) => input.dataset.bulkUnitId)
    .filter(Boolean);
}

function setPropertyUnitsSelected(propertyId, selected) {
  bulkState.units
    .filter((unit) => unit.property_id === propertyId)
    .forEach((unit) => {
      if (selected) bulkState.selectedUnitIds.add(unit.id);
      else bulkState.selectedUnitIds.delete(unit.id);
    });
  renderUnitChoices();
}

function bindBulkEvents() {
  if (bulkState.started) return;
  bulkState.started = true;

  document.addEventListener("click", (event) => {
    if (event.target?.closest?.("[data-property-unit-bulk-open]")) {
      event.preventDefault();
      void openBulkModal();
      return;
    }

    if (event.target?.closest?.("[data-property-unit-bulk-close]")) {
      event.preventDefault();
      closeBulkModal();
      return;
    }

    if (event.target?.closest?.("[data-property-unit-select-visible]")) {
      selectedVisibleUnitIds().forEach((id) => bulkState.selectedUnitIds.add(id));
      renderUnitChoices();
      return;
    }

    if (event.target?.closest?.("[data-property-unit-clear-visible]")) {
      selectedVisibleUnitIds().forEach((id) => bulkState.selectedUnitIds.delete(id));
      renderUnitChoices();
      return;
    }

    const selectPropertyUnits = event.target?.closest?.("[data-bulk-property-select-units]");
    if (selectPropertyUnits) {
      setPropertyUnitsSelected(selectPropertyUnits.dataset.bulkPropertySelectUnits, true);
      return;
    }

    const clearPropertyUnits = event.target?.closest?.("[data-bulk-property-clear-units]");
    if (clearPropertyUnits) {
      setPropertyUnitsSelected(clearPropertyUnits.dataset.bulkPropertyClearUnits, false);
    }
  }, true);

  document.addEventListener("change", (event) => {
    const propertyInput = event.target?.closest?.("[data-bulk-property-id]");
    if (propertyInput) {
      const propertyId = propertyInput.dataset.bulkPropertyId;
      if (propertyInput.checked) {
        bulkState.selectedPropertyIds.add(propertyId);
        bulkState.autoSelectPropertyIds.add(propertyId);
      } else {
        bulkState.selectedPropertyIds.delete(propertyId);
        bulkState.units
          .filter((unit) => unit.property_id === propertyId)
          .forEach((unit) => bulkState.selectedUnitIds.delete(unit.id));
      }
      renderPropertyChoices();
      void loadUnitsForSelection();
      return;
    }

    const unitInput = event.target?.closest?.("[data-bulk-unit-id]");
    if (unitInput) {
      if (unitInput.checked) bulkState.selectedUnitIds.add(unitInput.dataset.bulkUnitId);
      else bulkState.selectedUnitIds.delete(unitInput.dataset.bulkUnitId);
      updateBulkSummary();
    }
  }, true);

  document.addEventListener("input", (event) => {
    if (event.target?.id === "propertyUnitBulkPropertySearch") {
      bulkState.propertySearch = event.target.value || "";
      renderPropertyChoices();
      return;
    }

    const field = event.target?.closest?.("#propertyUnitBulkForm input[name='square_feet'], #propertyUnitBulkForm input[name='customer_price'], #propertyUnitBulkForm input[name='contractor_pay']");
    if (field) {
      const form = document.getElementById("propertyUnitBulkForm");
      const checkboxName = field.name === "contractor_pay" ? "apply_contract_pay" : `apply_${field.name}`;
      if (form?.elements[checkboxName] && field.value !== "") form.elements[checkboxName].checked = true;
    }
  }, true);

  document.addEventListener("submit", (event) => {
    if (event.target?.id !== "propertyUnitBulkForm") return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    void applyBulkEdit(event.target);
  }, true);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !document.getElementById("propertyUnitBulkModal")?.hidden) {
      closeBulkModal();
    }
  });
}

function installBulkStyles() {
  if (document.getElementById("propertyUnitsBulkStyles")) return;
  const style = document.createElement("style");
  style.id = "propertyUnitsBulkStyles";
  style.textContent = `
    body.property-unit-bulk-open { overflow: hidden; }
    .property-unit-bulk-modal[hidden] { display: none; }
    .property-unit-bulk-modal { bottom: 0; left: 0; position: fixed; right: 0; top: 0; z-index: 90; }
    .property-unit-bulk-backdrop {
      background: rgba(0, 0, 0, 0.62);
      border: 0;
      bottom: 0;
      left: 0;
      padding: 0;
      position: absolute;
      right: 0;
      top: 0;
      width: 100%;
    }
    .property-unit-bulk-dialog {
      background: linear-gradient(145deg, rgba(18, 33, 52, 0.98), rgba(10, 24, 40, 0.98));
      border: 1px solid var(--suite-border);
      border-radius: 10px;
      box-shadow: 0 24px 80px rgba(0, 0, 0, 0.42);
      display: grid;
      gap: 14px;
      left: 50%;
      max-height: min(90vh, 820px);
      max-width: 1040px;
      overflow: auto;
      padding: 18px;
      position: absolute;
      top: 50%;
      transform: translate(-50%, -50%);
      width: min(94vw, 1040px);
    }
    .property-unit-bulk-head,
    .property-unit-bulk-section-head,
    .property-unit-bulk-actions,
    .property-unit-bulk-mini-actions,
    .property-unit-bulk-unit-group-head {
      align-items: center;
      display: flex;
      gap: 10px;
      justify-content: space-between;
    }
    .property-unit-bulk-head { border-bottom: 1px solid var(--suite-border-soft); padding-bottom: 12px; }
    .property-unit-bulk-head p,
    .property-unit-bulk-head h2,
    .property-unit-bulk-head span { margin: 0; }
    .property-unit-bulk-head p {
      color: var(--suite-green);
      font-size: 11px;
      font-weight: 900;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }
    .property-unit-bulk-head h2 { font-size: 20px; line-height: 1.15; margin-top: 4px; }
    .property-unit-bulk-head span,
    .property-unit-bulk-section-head span,
    .property-unit-bulk-unit small,
    .property-unit-bulk-empty,
    .property-unit-bulk-feedback {
      color: var(--suite-soft);
      font-size: 12px;
    }
    .property-unit-bulk-form { display: grid; gap: 14px; }
    .property-unit-bulk-section {
      border: 1px solid var(--suite-border-soft);
      border-radius: 8px;
      display: grid;
      gap: 10px;
      padding: 12px;
    }
    .property-unit-bulk-choice-list,
    .property-unit-bulk-unit-list {
      display: grid;
      gap: 8px;
      max-height: 230px;
      overflow: auto;
      padding-right: 4px;
    }
    .property-unit-bulk-choice,
    .property-unit-bulk-unit {
      align-items: start;
      background: rgba(7, 18, 32, 0.56);
      border: 1px solid rgba(148, 163, 184, 0.16);
      border-radius: 7px;
      display: flex;
      gap: 9px;
      padding: 9px;
    }
    .property-unit-bulk-choice input,
    .property-unit-bulk-unit input,
    .property-unit-bulk-field input[type='checkbox'] {
      accent-color: var(--suite-green);
      margin-top: 2px;
    }
    .property-unit-bulk-search input,
    .property-unit-bulk-field input:not([type='checkbox']) {
      background: rgba(7, 18, 32, 0.8);
      border: 1px solid var(--suite-border-soft);
      border-radius: 6px;
      color: var(--suite-text);
      min-height: 36px;
      padding: 8px 10px;
      width: 100%;
    }
    .property-unit-bulk-unit-group {
      border: 1px solid rgba(148, 163, 184, 0.14);
      border-radius: 8px;
      display: grid;
      gap: 8px;
      padding: 10px;
    }
    .property-unit-bulk-unit-group-head > div { display: flex; gap: 6px; }
    .property-unit-bulk-unit span { display: grid; gap: 2px; min-width: 0; }
    .property-unit-bulk-field-grid { display: grid; gap: 10px; grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .property-unit-bulk-field { color: var(--suite-text); display: grid; font-size: 12px; font-weight: 800; gap: 7px; }
    .property-unit-bulk-field > span { align-items: center; display: flex; gap: 7px; }
    .property-unit-bulk-feedback { margin: 0; min-height: 18px; }
    .property-unit-bulk-feedback.is-error { color: var(--suite-red, #ff5b68); }
    #propertyUnitBulkApplyBtn:disabled { cursor: not-allowed; opacity: 0.55; }
    @media (max-width: 760px) {
      .property-unit-bulk-dialog { padding: 14px; width: min(95vw, 1040px); }
      .property-unit-bulk-head,
      .property-unit-bulk-section-head,
      .property-unit-bulk-actions,
      .property-unit-bulk-mini-actions,
      .property-unit-bulk-unit-group-head {
        align-items: stretch;
        display: grid;
      }
      .property-unit-bulk-field-grid { grid-template-columns: 1fr; }
      .property-unit-bulk-actions button,
      .property-unit-bulk-mini-actions button,
      .property-unit-bulk-unit-group-head button { width: 100%; }
    }
  `;
  document.head.appendChild(style);
}

function startWhenReady() {
  const root = workspace();
  if (!root || !document.querySelector(".property-unit-list-head")) {
    window.setTimeout(startWhenReady, 80);
    return;
  }

  installBulkStyles();
  ensureBulkButton();
  bindBulkEvents();

  if (!bulkState.observer) {
    bulkState.observer = new MutationObserver(() => ensureBulkButton());
    bulkState.observer.observe(root, { childList: true, subtree: true });
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", startWhenReady, { once: true });
} else {
  startWhenReady();
}
window.addEventListener("load", startWhenReady, { once: true });
