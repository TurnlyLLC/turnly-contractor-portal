import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const env = window.__ENV || {};
const supabase = env.SUPABASE_URL && env.SUPABASE_ANON_KEY
  ? createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY)
  : null;

const state = {
  clients: [],
  units: [],
  selectedClientId: "",
  search: "",
  isLoading: false,
  isRendering: false,
  renderTimer: 0,
  hasStarted: false,
  eventsBound: false,
  observer: null
};

function normalizeRole(role) {
  return String(role || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

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

function titleCase(value) {
  return String(value || "").replace(/[_-]/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function clientService(row) {
  return titleCase(row?.service_model || row?.service_type || row?.default_service_type || row?.client_type || "");
}

function clientStatus(row) {
  return titleCase(row?.status || row?.client_status || "");
}

function money(value) {
  const number = Number(value);
  const safe = Number.isFinite(number) ? number : 0;
  return safe.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

function safeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function formatCount(value) {
  return safeNumber(value).toLocaleString(undefined, { maximumFractionDigits: 1 });
}

function normalizeUnitName(value) {
  return String(value || "").trim().toLowerCase();
}

function workspace() {
  return document.querySelector("[data-property-units-page]");
}

function inWorkspace(node) {
  const root = workspace();
  return Boolean(root && node && root.contains(node));
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element && element.textContent !== String(value)) element.textContent = String(value);
}

function setHtml(id, value) {
  const element = document.getElementById(id);
  if (element && element.innerHTML !== value) element.innerHTML = value;
}

function setMessage(text, isError = false) {
  const message = document.getElementById("propertyUnitMessage");
  if (!message) return;
  message.textContent = text || "";
  message.classList.toggle("error", Boolean(isError));
  message.classList.toggle("is-error", Boolean(isError));
}

function selectedClient() {
  return state.clients.find((client) => client.id === state.selectedClientId) || null;
}

function selectedUnits(applySearch = true) {
  const term = applySearch ? state.search.trim().toLowerCase() : "";
  return state.units
    .filter((unit) => unit.property_id === state.selectedClientId)
    .filter((unit) => !term || [unit.unit_name, unit.bedroom_count, unit.bathroom_count, unit.square_feet, unit.customer_price, unit.contractor_pay, unit.notes]
      .some((value) => String(value || "").toLowerCase().includes(term)))
    .sort((a, b) => String(a.unit_name || "").localeCompare(String(b.unit_name || ""), undefined, { numeric: true, sensitivity: "base" }));
}

function unitTotals(rows) {
  return rows.reduce((totals, row) => ({
    bedrooms: totals.bedrooms + safeNumber(row.bedroom_count),
    bathrooms: totals.bathrooms + safeNumber(row.bathroom_count),
    squareFeet: totals.squareFeet + safeNumber(row.square_feet),
    customer: totals.customer + safeNumber(row.customer_price),
    contractor: totals.contractor + safeNumber(row.contractor_pay)
  }), { bedrooms: 0, bathrooms: 0, squareFeet: 0, customer: 0, contractor: 0 });
}

function optionSignature() {
  return state.clients.map((client) => `${client.id}:${clientTitle(client)}`).join("|");
}

function selectOptionSignature(select) {
  if (!select) return "";
  return Array.from(select.options || [])
    .filter((option) => option.value)
    .map((option) => `${option.value}:${option.textContent || ""}`)
    .join("|");
}

function renderSelect() {
  const select = document.getElementById("propertyUnitPropertySelect");
  if (!select) return;

  const validSelected = state.clients.some((client) => client.id === state.selectedClientId);
  if (!validSelected) state.selectedClientId = "";

  const signature = optionSignature();
  if (select.dataset.clientDirectorySignature !== signature || selectOptionSignature(select) !== signature) {
    select.innerHTML = [
      `<option value="">Choose a client property...</option>`,
      ...state.clients.map((client) => `<option value="${escapeHtml(client.id)}">${escapeHtml(clientTitle(client))}</option>`)
    ].join("");
    select.dataset.clientDirectorySignature = signature;
  }
  if (select.value !== state.selectedClientId) select.value = state.selectedClientId;
}

function ensureNotesField(form) {
  if (!form || form.querySelector("[name='notes']")) return;
  const target = form.querySelector("[name='contractor_pay']")?.closest(".suite-field") || form.lastElementChild;
  target?.insertAdjacentHTML("afterend", `
    <label class="suite-field wide property-unit-notes-field">
      <span>Unit Instructions</span>
      <textarea name="notes" rows="2" placeholder="Access, parking, lockbox, scope notes"></textarea>
    </label>
  `);
}

function renderQuickForm() {
  const form = document.getElementById("propertyUnitQuickForm");
  ensureNotesField(form);
}

function renderMetrics() {
  const rows = selectedUnits(false);
  const totals = unitTotals(rows);
  setText("propertyUnitCount", rows.length.toLocaleString());
  setText("propertyUnitSqft", Math.round(totals.squareFeet).toLocaleString());
  setText("propertyUnitCustomerTotal", money(totals.customer));
  setText("propertyUnitContractorTotal", money(totals.contractor));
}

function unitRow(unit) {
  const margin = safeNumber(unit.customer_price) - safeNumber(unit.contractor_pay);
  return `
    <form class="property-unit-row" data-property-unit-row data-property-unit-id="${escapeHtml(unit.id)}">
      <label class="suite-field"><span>Unit</span><input name="unit_name" value="${escapeHtml(unit.unit_name || "")}" required /></label>
      <label class="suite-field"><span>Bedrooms</span><input name="bedroom_count" type="number" min="0" step="1" value="${escapeHtml(unit.bedroom_count ?? 0)}" /></label>
      <label class="suite-field"><span>Bathrooms</span><input name="bathroom_count" type="number" min="0" step="0.5" value="${escapeHtml(unit.bathroom_count ?? 0)}" /></label>
      <label class="suite-field"><span>Sq Ft</span><input name="square_feet" type="number" min="0" step="1" value="${escapeHtml(unit.square_feet ?? 0)}" /></label>
      <label class="suite-field"><span>Customer Charge</span><input name="customer_price" type="number" min="0" step="0.01" value="${escapeHtml(unit.customer_price ?? 0)}" /></label>
      <label class="suite-field"><span>Contractor Pay</span><input name="contractor_pay" type="number" min="0" step="0.01" value="${escapeHtml(unit.contractor_pay ?? 0)}" /></label>
      <label class="suite-field wide property-unit-notes-field"><span>Unit Instructions</span><textarea name="notes" rows="2" placeholder="Access, parking, lockbox, scope notes">${escapeHtml(unit.notes || "")}</textarea></label>
      <div class="property-unit-margin"><span>Margin</span><strong>${escapeHtml(money(margin))}</strong></div>
      <div class="property-unit-actions">
        <button class="primary-action" type="submit"><span>Save</span></button>
        <button class="secondary-action danger-btn" type="button" data-property-unit-delete="${escapeHtml(unit.id)}"><span>Delete</span></button>
      </div>
    </form>
  `;
}

function renderRows() {
  const rows = selectedUnits(true);
  const list = document.getElementById("propertyUnitRows");
  const client = selectedClient();

  if (!list) return;
  if (!client) {
    list.innerHTML = `<div class="empty-state"><strong>Select a property</strong><p>Choose a client directory property to manage its units.</p></div>`;
  } else if (!rows.length) {
    list.innerHTML = `<div class="empty-state"><strong>No units yet</strong><p>Add units for ${escapeHtml(clientTitle(client))}.</p></div>`;
  } else {
    list.innerHTML = rows.map(unitRow).join("");
  }

  const summary = document.getElementById("propertyUnitListSummary");
  if (summary) {
    summary.textContent = client
      ? `${rows.length.toLocaleString()} unit${rows.length === 1 ? "" : "s"} showing for ${clientTitle(client)}.`
      : "Select a client directory property to manage units.";
  }
}

function detailRow(label, value) {
  if (!value) return "";
  return `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`;
}

function renderSummaries() {
  const client = selectedClient();
  const rows = selectedUnits(false);
  const totals = unitTotals(rows);
  const summaryPanel = document.getElementById("propertyUnitPropertySummary")?.closest(".suite-panel, .panel, aside, section");
  const heading = summaryPanel?.querySelector("h2, h3, h4, .panel-title, .panel-heading");
  if (heading && /selected property/i.test(heading.textContent || "")) heading.textContent = "Property Details";

  if (!client) {
    setHtml("propertyUnitPropertySummary", `<div class="property-unit-client-details"><strong>No property selected</strong><p>Select a client directory property to manage its unit pricing.</p></div>`);
    setHtml("propertyUnitPricingSummary", `<div class="property-unit-summary"><p>No pricing selected.</p></div>`);
    return;
  }

  const details = [
    detailRow("Status", clientStatus(client)),
    detailRow("Service", clientService(client)),
    detailRow("Market", client.region || client.market),
    detailRow("Primary Contact", client.primary_contact || client.contact_name),
    detailRow("Email", client.contact_email || client.email),
    detailRow("Phone", client.contact_phone || client.phone)
  ].filter(Boolean).join("");

  setHtml("propertyUnitPropertySummary", `
    <div class="property-unit-client-details">
      <div>
        <strong>${escapeHtml(clientTitle(client))}</strong>
        <p>${escapeHtml(clientAddress(client) || "No address on file")}</p>
      </div>
      ${details ? `<dl class="property-unit-detail-grid">${details}</dl>` : ""}
    </div>
  `);

  setHtml("propertyUnitPricingSummary", `
    <dl>
      <div><dt>Units</dt><dd>${escapeHtml(rows.length.toLocaleString())}</dd></div>
      <div><dt>Bedrooms</dt><dd>${escapeHtml(formatCount(totals.bedrooms))}</dd></div>
      <div><dt>Bathrooms</dt><dd>${escapeHtml(formatCount(totals.bathrooms))}</dd></div>
      <div><dt>Total Sq Ft</dt><dd>${escapeHtml(Math.round(totals.squareFeet).toLocaleString())}</dd></div>
      <div><dt>Customer Total</dt><dd>${escapeHtml(money(totals.customer))}</dd></div>
      <div><dt>Contractor Total</dt><dd>${escapeHtml(money(totals.contractor))}</dd></div>
      <div><dt>Projected Margin</dt><dd>${escapeHtml(money(totals.customer - totals.contractor))}</dd></div>
    </dl>
  `);
}

function renderAll() {
  if (!workspace() || state.isRendering) return;
  state.isRendering = true;
  renderSelect();
  renderQuickForm();
  renderMetrics();
  renderRows();
  renderSummaries();
  state.isRendering = false;
}

function scheduleRender() {
  if (state.renderTimer) return;
  state.renderTimer = window.setTimeout(() => {
    state.renderTimer = 0;
    renderAll();
  }, 100);
}

async function loadClients() {
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

  if (result.error) throw result.error;
  state.clients = (result.data || [])
    .filter((client) => clientTitle(client))
    .sort((a, b) => clientTitle(a).localeCompare(clientTitle(b)));
}

async function loadUnits() {
  const result = await supabase
    .from("property_units")
    .select("*")
    .order("unit_name", { ascending: true })
    .limit(3000);
  if (result.error) throw result.error;
  state.units = result.data || [];
}

async function verifyAdminSession() {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  const user = userData?.user || null;
  if (!user) {
    return {
      ok: false,
      message: "Sign in as an admin to load client directory properties."
    };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError) throw profileError;
  if (normalizeRole(profile?.role) !== "admin") {
    return {
      ok: false,
      message: "Admin access is required to load client directory properties."
    };
  }

  return { ok: true };
}

async function loadData() {
  if (!supabase || state.isLoading) return;
  state.isLoading = true;
  setMessage("Loading client directory properties...");
  try {
    const session = await verifyAdminSession();
    if (!session.ok) {
      state.clients = [];
      state.units = [];
      state.selectedClientId = "";
      renderAll();
      setMessage(session.message, true);
      return;
    }

    await Promise.all([loadClients(), loadUnits()]);
    if (!state.clients.some((client) => client.id === state.selectedClientId)) state.selectedClientId = "";
    renderAll();
    setMessage(`${state.clients.length.toLocaleString()} client propert${state.clients.length === 1 ? "y" : "ies"} loaded from the client directory.`);
  } catch (error) {
    console.warn("[property-units] Unable to load client-sourced units", error);
    setMessage("Unable to load client directory properties: " + (error?.message || "Unknown error"), true);
  } finally {
    state.isLoading = false;
  }
}

function formValue(form, name) {
  return (form.querySelector(`[name="${name}"]`)?.value || "").trim();
}

function unitPayload(form) {
  const unitName = formValue(form, "unit_name");
  if (!state.selectedClientId) throw new Error("Select a client directory property before saving units.");
  if (!unitName) throw new Error("Unit Number / Name is required.");
  const existingId = form.dataset.propertyUnitId || "";
  const duplicate = state.units.find((unit) => (
    unit.property_id === state.selectedClientId &&
    unit.id !== existingId &&
    normalizeUnitName(unit.unit_name) === normalizeUnitName(unitName)
  ));
  if (duplicate) throw new Error(`Unit ${unitName} already exists for this property.`);

  return {
    property_id: state.selectedClientId,
    unit_name: unitName,
    bedroom_count: safeNumber(formValue(form, "bedroom_count")),
    bathroom_count: safeNumber(formValue(form, "bathroom_count")),
    square_feet: safeNumber(formValue(form, "square_feet")),
    customer_price: safeNumber(formValue(form, "customer_price")),
    contractor_pay: safeNumber(formValue(form, "contractor_pay")),
    notes: formValue(form, "notes"),
    status: "active"
  };
}

async function saveUnit(form) {
  try {
    const id = form.dataset.propertyUnitId || "";
    const payload = unitPayload(form);
    const result = id
      ? await supabase.from("property_units").update(payload).eq("id", id).select("*").single()
      : await supabase.from("property_units").insert(payload).select("*").single();
    if (result.error) throw result.error;

    const saved = result.data;
    const index = state.units.findIndex((unit) => unit.id === saved.id);
    if (index >= 0) state.units[index] = saved;
    else state.units.push(saved);
    if (!id) form.reset();
    renderAll();
    setMessage("Unit saved to Supabase.");
  } catch (error) {
    console.warn("[property-units] Unable to save unit", error);
    setMessage("Unable to save unit: " + (error?.message || "Unknown error"), true);
  }
}

async function deleteUnit(id) {
  if (!id) return;
  const unit = state.units.find((row) => row.id === id);
  const label = unit?.unit_name || "this unit";
  if (!window.confirm(`Delete ${label}?`)) return;
  setMessage("Deleting unit...");
  const result = await supabase.from("property_units").delete().eq("id", id);
  if (result.error) {
    setMessage("Unable to delete unit: " + result.error.message, true);
    return;
  }
  state.units = state.units.filter((row) => row.id !== id);
  renderAll();
  setMessage("Unit deleted from Supabase.");
}

function stopPropertyUnitEvent(event) {
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
}

function bindEvents() {
  if (state.eventsBound) return;
  state.eventsBound = true;

  document.addEventListener("change", (event) => {
    if (event.target?.id !== "propertyUnitPropertySelect" || !inWorkspace(event.target)) return;
    stopPropertyUnitEvent(event);
    state.selectedClientId = event.target.value || "";
    renderAll();
  }, true);

  document.addEventListener("input", (event) => {
    if (event.target?.id !== "propertyUnitSearchInput" || !inWorkspace(event.target)) return;
    stopPropertyUnitEvent(event);
    state.search = event.target.value || "";
    renderMetrics();
    renderRows();
    renderSummaries();
  }, true);

  document.addEventListener("submit", (event) => {
    const form = event.target?.closest?.("#propertyUnitQuickForm, [data-property-unit-row]");
    if (!form || !inWorkspace(form)) return;
    stopPropertyUnitEvent(event);
    void saveUnit(form);
  }, true);

  document.addEventListener("click", (event) => {
    const target = event.target;
    const refresh = target?.closest?.("[data-property-units-refresh]");
    if (refresh && inWorkspace(refresh)) {
      stopPropertyUnitEvent(event);
      void loadData();
      return;
    }

    const add = target?.closest?.("[data-property-unit-add]");
    if (add && inWorkspace(add)) {
      stopPropertyUnitEvent(event);
      document.getElementById("propertyUnitQuickForm")?.scrollIntoView({ behavior: "smooth", block: "center" });
      document.querySelector("#propertyUnitQuickForm [name='unit_name']")?.focus();
      return;
    }

    const deleteButton = target?.closest?.("[data-property-unit-delete]");
    if (deleteButton && inWorkspace(deleteButton)) {
      stopPropertyUnitEvent(event);
      void deleteUnit(deleteButton.dataset.propertyUnitDelete);
    }
  }, true);
}

function installStyles() {
  if (document.getElementById("propertyUnitsClientSourceStyles")) return;
  const style = document.createElement("style");
  style.id = "propertyUnitsClientSourceStyles";
  style.textContent = `
    .property-unit-client-details { display: grid; gap: 10px; }
    .property-unit-detail-grid { display: grid; gap: 8px; }
    .property-unit-detail-grid div { display: grid; gap: 2px; }
    .property-unit-detail-grid dt {
      color: var(--muted, #94a3b8);
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    .property-unit-detail-grid dd { margin: 0; font-size: 13px; }
    .property-unit-notes-field textarea { min-height: 74px; resize: vertical; }
    .property-unit-quick-form .property-unit-notes-field { grid-column: 1 / -2; }
    .property-unit-row .property-unit-notes-field { min-width: min(100%, 320px); }
  `;
  document.head.appendChild(style);
}

function startWhenReady() {
  const root = workspace();
  if (!root) {
    window.setTimeout(startWhenReady, 80);
    return;
  }
  if (state.hasStarted) {
    renderAll();
    return;
  }
  state.hasStarted = true;
  installStyles();
  bindEvents();
  renderAll();
  void loadData();

  state.observer = new MutationObserver(() => {
    if (state.isRendering) return;
    const select = document.getElementById("propertyUnitPropertySelect");
    if (select && selectOptionSignature(select) !== optionSignature()) scheduleRender();
  });
  state.observer.observe(root, { childList: true, subtree: true });
  window.setTimeout(renderAll, 800);
  window.setTimeout(renderAll, 1800);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", startWhenReady, { once: true });
} else {
  startWhenReady();
}
window.addEventListener("load", startWhenReady, { once: true });
