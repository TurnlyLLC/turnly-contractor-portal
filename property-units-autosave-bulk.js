import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const env = window.__ENV || {};
const supabase = env.SUPABASE_URL && env.SUPABASE_ANON_KEY
  ? createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY)
  : null;

const timers = new Map();
let isBulkSaving = false;

function workspace() {
  return document.querySelector("[data-property-units-page]");
}

function selectedPropertyId() {
  return document.getElementById("propertyUnitPropertySelect")?.value || "";
}

function selectedPropertyName() {
  const select = document.getElementById("propertyUnitPropertySelect");
  return select?.selectedOptions?.[0]?.textContent?.trim() || "selected property";
}

function setMessage(text, isError = false) {
  const message = document.getElementById("propertyUnitMessage");
  if (!message) return;
  message.textContent = text || "";
  message.classList.toggle("error", Boolean(isError));
  message.classList.toggle("is-error", Boolean(isError));
}

function safeNumber(value) {
  const number = Number(String(value ?? "").replace(/[$,\s]/g, ""));
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function field(form, name) {
  return (form?.querySelector?.(`[name="${name}"]`)?.value || "").trim();
}

function payloadFromForm(form) {
  return {
    property_id: selectedPropertyId(),
    unit_name: field(form, "unit_name"),
    square_feet: safeNumber(field(form, "square_feet")),
    customer_price: safeNumber(field(form, "customer_price")),
    contractor_pay: safeNumber(field(form, "contractor_pay")),
    notes: field(form, "notes"),
    status: "active"
  };
}

function signature(payload) {
  return JSON.stringify({
    property_id: payload.property_id || "",
    unit_name: payload.unit_name || "",
    square_feet: safeNumber(payload.square_feet),
    customer_price: safeNumber(payload.customer_price),
    contractor_pay: safeNumber(payload.contractor_pay),
    notes: payload.notes || "",
    status: payload.status || "active"
  });
}

function money(value) {
  return safeNumber(value).toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2
  });
}

function updateMargin(form) {
  const target = form.querySelector(".property-unit-margin strong");
  if (!target) return;
  target.textContent = money(safeNumber(field(form, "customer_price")) - safeNumber(field(form, "contractor_pay")));
}

function setRowState(form, text, tone = "") {
  let state = form.querySelector("[data-property-unit-save-state]");
  if (!state) {
    const actions = form.querySelector(".property-unit-actions");
    actions?.insertAdjacentHTML("afterbegin", `<span class="property-unit-save-state is-saved" data-property-unit-save-state>Saved</span>`);
    state = form.querySelector("[data-property-unit-save-state]");
  }
  if (!state) return;
  state.textContent = text;
  state.className = `property-unit-save-state ${tone ? `is-${tone}` : ""}`.trim();
}

function prepareRows() {
  document.querySelectorAll("[data-property-unit-row]").forEach((form) => {
    if (!form.dataset.savedSignature) form.dataset.savedSignature = signature(payloadFromForm(form));
    setRowState(form, form.dataset.saveState || "Saved", form.dataset.saveTone || "saved");
  });
}

function clearTimer(form) {
  const id = form?.dataset?.propertyUnitId || "";
  const timer = timers.get(id);
  if (timer) window.clearTimeout(timer);
  timers.delete(id);
}

async function autoSave(form) {
  if (!supabase) {
    setMessage("Supabase config is missing. Unable to auto-save units.", true);
    return;
  }

  const id = form.dataset.propertyUnitId || "";
  const payload = payloadFromForm(form);
  if (!id || !payload.property_id || !payload.unit_name) return;

  const nextSignature = signature(payload);
  if (nextSignature === form.dataset.savedSignature) {
    setRowState(form, "Saved", "saved");
    return;
  }

  setRowState(form, "Saving...", "saving");
  try {
    const result = await supabase
      .from("property_units")
      .update(payload)
      .eq("id", id)
      .select("id")
      .single();

    if (result.error) throw result.error;
    form.dataset.savedSignature = nextSignature;
    form.dataset.saveState = "Saved";
    form.dataset.saveTone = "saved";
    setRowState(form, "Saved", "saved");
    setMessage("Unit auto-saved to Supabase.");
  } catch (error) {
    console.warn("[property-units-autosave] save failed", error);
    form.dataset.saveState = "Save failed";
    form.dataset.saveTone = "error";
    setRowState(form, "Save failed", "error");
    setMessage("Unable to auto-save unit: " + (error?.message || "Unknown error"), true);
  }
}

function scheduleAutoSave(form, delay = 850) {
  const id = form?.dataset?.propertyUnitId || "";
  if (!id) return;
  updateMargin(form);
  clearTimer(form);
  form.dataset.saveState = "Unsaved";
  form.dataset.saveTone = "pending";
  setRowState(form, "Unsaved", "pending");
  timers.set(id, window.setTimeout(() => {
    timers.delete(id);
    void autoSave(form);
  }, delay));
}

function injectBulkButton() {
  const header = document.querySelector(".property-unit-list-head");
  const addButton = header?.querySelector("[data-property-unit-add]");
  if (!header || !addButton || document.getElementById("propertyUnitBulkEditBtn")) return;
  addButton.insertAdjacentHTML("beforebegin", `
    <button id="propertyUnitBulkEditBtn" class="secondary-action" type="button" data-property-unit-bulk-edit>
      <span>Bulk Edit Units</span>
    </button>
  `);
}

function bulkField(name, label, type = "number", attrs = "") {
  return `
    <label class="property-unit-bulk-field">
      <span><input type="checkbox" name="apply_${name}" /> ${label}</span>
      <input name="${name}" type="${type}" ${attrs} />
    </label>
  `;
}

function ensureBulkModal() {
  const root = workspace();
  if (!root || document.getElementById("propertyUnitBulkModal")) return;
  root.insertAdjacentHTML("beforeend", `
    <div id="propertyUnitBulkModal" class="property-unit-bulk-modal" role="dialog" aria-modal="true" aria-labelledby="propertyUnitBulkTitle" hidden>
      <button class="property-unit-bulk-backdrop" type="button" data-property-unit-bulk-close aria-label="Close bulk edit"></button>
      <section class="property-unit-bulk-dialog">
        <header class="property-unit-bulk-head">
          <div>
            <p>Bulk Edit</p>
            <h2 id="propertyUnitBulkTitle">Update Units</h2>
            <span id="propertyUnitBulkSummary">Select a property to edit units.</span>
          </div>
          <button class="secondary-action" type="button" data-property-unit-bulk-close>Close</button>
        </header>
        <form id="propertyUnitBulkForm" class="property-unit-bulk-form">
          <label class="suite-field wide">
            <span>Apply To</span>
            <select name="bulk_scope">
              <option value="all">All units on selected property</option>
              <option value="visible">Only currently visible units</option>
            </select>
          </label>
          <div class="property-unit-bulk-grid">
            ${bulkField("square_feet", "Square Feet", "number", 'min="0" step="1"')}
            ${bulkField("customer_price", "Customer Charge", "number", 'min="0" step="0.01"')}
            ${bulkField("contractor_pay", "Contractor Pay", "number", 'min="0" step="0.01"')}
            <label class="property-unit-bulk-field">
              <span><input type="checkbox" name="apply_status" /> Status</span>
              <select name="status">
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="paused">Paused</option>
              </select>
            </label>
            <label class="property-unit-bulk-field wide">
              <span><input type="checkbox" name="apply_notes" /> Unit Instructions</span>
              <textarea name="notes" rows="3" placeholder="Replace unit instructions for selected units"></textarea>
            </label>
          </div>
          <p class="property-unit-bulk-note">Only checked fields will be changed.</p>
          <div class="property-unit-bulk-actions">
            <button class="secondary-action" type="button" data-property-unit-bulk-close>Cancel</button>
            <button class="primary-action" type="submit">Apply Bulk Changes</button>
          </div>
        </form>
      </section>
    </div>
  `);
}

function visibleUnitIds() {
  return Array.from(document.querySelectorAll("[data-property-unit-row]"))
    .map((row) => row.dataset.propertyUnitId)
    .filter(Boolean);
}

async function allUnitIds() {
  const propertyId = selectedPropertyId();
  if (!propertyId) return [];
  const result = await supabase
    .from("property_units")
    .select("id")
    .eq("property_id", propertyId)
    .limit(5000);
  if (result.error) throw result.error;
  return (result.data || []).map((row) => row.id);
}

async function idsForScope(scope) {
  return scope === "visible" ? visibleUnitIds() : allUnitIds();
}

function collectBulkPayload(form) {
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
  if (!supabase || isBulkSaving) return;
  if (!selectedPropertyId()) {
    setMessage("Select a property before bulk editing units.", true);
    return;
  }

  try {
    isBulkSaving = true;
    const payload = collectBulkPayload(form);
    const ids = await idsForScope(form.elements.bulk_scope?.value || "all");
    if (!ids.length) throw new Error("No units match that bulk edit scope.");

    setMessage(`Updating ${ids.length.toLocaleString()} unit${ids.length === 1 ? "" : "s"}...`);
    for (let index = 0; index < ids.length; index += 100) {
      const result = await supabase
        .from("property_units")
        .update(payload)
        .in("id", ids.slice(index, index + 100));
      if (result.error) throw result.error;
    }

    closeBulkModal();
    setMessage(`${ids.length.toLocaleString()} unit${ids.length === 1 ? "" : "s"} updated in Supabase.`);
    document.querySelector("[data-property-units-refresh]")?.click();
  } catch (error) {
    console.warn("[property-units-bulk] update failed", error);
    setMessage("Unable to bulk update units: " + (error?.message || "Unknown error"), true);
  } finally {
    isBulkSaving = false;
  }
}

async function refreshBulkSummary() {
  const form = document.getElementById("propertyUnitBulkForm");
  const summary = document.getElementById("propertyUnitBulkSummary");
  if (!form || !summary) return;
  const scope = form.elements.bulk_scope?.value || "all";
  const count = scope === "visible" ? visibleUnitIds().length : (await allUnitIds()).length;
  summary.textContent = `${count.toLocaleString()} unit${count === 1 ? "" : "s"} selected for ${selectedPropertyName()}.`;
}

function openBulkModal() {
  if (!selectedPropertyId()) {
    setMessage("Select a property before bulk editing units.", true);
    document.getElementById("propertyUnitPropertySelect")?.focus();
    return;
  }
  ensureBulkModal();
  const modal = document.getElementById("propertyUnitBulkModal");
  const form = document.getElementById("propertyUnitBulkForm");
  if (!modal || !form) return;
  form.reset();
  modal.hidden = false;
  document.body.classList.add("property-unit-bulk-open");
  void refreshBulkSummary();
}

function closeBulkModal() {
  const modal = document.getElementById("propertyUnitBulkModal");
  if (modal) modal.hidden = true;
  document.body.classList.remove("property-unit-bulk-open");
}

function installStyles() {
  if (document.getElementById("propertyUnitAutosaveBulkStyles")) return;
  const style = document.createElement("style");
  style.id = "propertyUnitAutosaveBulkStyles";
  style.textContent = `
    .property-unit-list-head { align-items: center; }
    .property-unit-list-head > button { margin-left: 8px; }
    .property-unit-save-state {
      color: var(--muted, #94a3b8);
      font-size: 10px;
      font-weight: 900;
      justify-self: start;
      min-height: 16px;
      text-transform: uppercase;
    }
    .property-unit-save-state.is-saved { color: var(--suite-green, #00d6a3); }
    .property-unit-save-state.is-saving,
    .property-unit-save-state.is-pending { color: var(--suite-yellow, #ffd43d); }
    .property-unit-save-state.is-error { color: var(--suite-red, #ff5b68); }
    body.property-unit-bulk-open { overflow: hidden; }
    .property-unit-bulk-modal[hidden] { display: none; }
    .property-unit-bulk-modal { bottom: 0; left: 0; position: fixed; right: 0; top: 0; z-index: 85; }
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
      max-height: min(88vh, 720px);
      max-width: 840px;
      overflow: auto;
      padding: 18px;
      position: absolute;
      top: 50%;
      transform: translate(-50%, -50%);
      width: min(92vw, 840px);
    }
    .property-unit-bulk-head {
      align-items: start;
      border-bottom: 1px solid var(--suite-border-soft);
      display: flex;
      gap: 16px;
      justify-content: space-between;
      padding-bottom: 12px;
    }
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
    .property-unit-bulk-head span {
      color: var(--suite-soft);
      display: block;
      font-size: 12px;
      margin-top: 5px;
    }
    .property-unit-bulk-form { display: grid; gap: 12px; }
    .property-unit-bulk-grid { display: grid; gap: 12px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .property-unit-bulk-field {
      color: #d9e8f6;
      display: grid;
      font-size: 11px;
      font-weight: 900;
      gap: 6px;
    }
    .property-unit-bulk-field.wide { grid-column: 1 / -1; }
    .property-unit-bulk-field > span { align-items: center; display: flex; gap: 7px; }
    .property-unit-bulk-field input[type="checkbox"] {
      accent-color: var(--suite-green);
      min-height: 14px;
      width: 14px;
    }
    .property-unit-bulk-field input:not([type="checkbox"]),
    .property-unit-bulk-field select,
    .property-unit-bulk-field textarea {
      background: rgba(7, 18, 32, 0.8);
      border: 1px solid var(--suite-border-soft);
      border-radius: 6px;
      color: var(--suite-text);
      min-height: 34px;
      padding: 8px 9px;
      resize: vertical;
      width: 100%;
    }
    .property-unit-bulk-note { color: var(--suite-soft); font-size: 12px; margin: 0; }
    .property-unit-bulk-actions { align-items: center; display: flex; gap: 10px; justify-content: flex-end; }
    @media (max-width: 720px) {
      .property-unit-bulk-head,
      .property-unit-bulk-actions { display: grid; }
      .property-unit-bulk-grid { grid-template-columns: 1fr; }
      .property-unit-bulk-actions button { width: 100%; }
    }
  `;
  document.head.appendChild(style);
}

function bindEvents() {
  document.addEventListener("input", (event) => {
    const form = event.target?.closest?.("[data-property-unit-row]");
    if (form) scheduleAutoSave(form);
  }, true);

  document.addEventListener("change", (event) => {
    const form = event.target?.closest?.("[data-property-unit-row]");
    if (form) scheduleAutoSave(form, 300);

    if (event.target?.closest?.("#propertyUnitBulkForm [name='bulk_scope']")) {
      void refreshBulkSummary();
    }
  }, true);

  document.addEventListener("click", (event) => {
    const bulk = event.target?.closest?.("[data-property-unit-bulk-edit]");
    if (bulk) {
      event.preventDefault();
      openBulkModal();
      return;
    }

    const close = event.target?.closest?.("[data-property-unit-bulk-close]");
    if (close) {
      event.preventDefault();
      closeBulkModal();
    }
  }, true);

  document.addEventListener("submit", (event) => {
    if (event.target?.id !== "propertyUnitBulkForm") return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    void applyBulkEdit(event.target);
  }, true);
}

function start() {
  installStyles();
  ensureBulkModal();
  bindEvents();
  const observer = new MutationObserver(() => {
    injectBulkButton();
    prepareRows();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  injectBulkButton();
  prepareRows();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start, { once: true });
} else {
  start();
}
