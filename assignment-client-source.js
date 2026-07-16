import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const env = window.__ENV || {};
const supabase = env.SUPABASE_URL && env.SUPABASE_ANON_KEY
  ? createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY)
  : null;

let clientProperties = [];
let isLoadingClients = false;
let isPopulatingSelect = false;
let selectedPropertyUnits = [];
let currentUnitPropertyId = "";
let isLoadingUnits = false;
let selectedUnitId = "";
let unitLoadRequestId = 0;
let pendingAssignmentUnitMetadata = null;
let pendingAssignmentUnitMetadataTimer = 0;
const CLIENT_TABLE = "clients";
const CONTRACT_TABLE = "client_contracts";

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function normalizeToken(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function titleCase(value) {
  return String(value || "")
    .replace(/[_-]/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function clientPropertyTitle(row) {
  return row?.property_name || row?.company_name || row?.name || row?.title || "";
}

function propertyMatchKey(row) {
  return String(clientPropertyTitle(row) || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function clientPropertyAddress(row) {
  const billing = row?.billing_address || "";
  if (billing) return billing;
  const street = row?.address || row?.street_address || row?.property_address || row?.site_address || row?.service_address || "";
  const city = row?.city || row?.property_city || row?.service_city || "";
  const state = row?.state || row?.property_state || row?.service_state || "";
  const postal = row?.postal_code || row?.zip || row?.zip_code || row?.property_zip || row?.service_zip || "";
  return [street, city, state, postal].filter(Boolean).join(", ");
}

function clientAccessNotes(row) {
  return row?.contract_access_notes || row?.access_notes || row?.entry_notes || row?.gate_code || "";
}

function mergeContractIntoClient(client, contract) {
  if (!contract) return client;
  return {
    ...contract,
    ...client,
    contract_id: contract.id || client?.contract_id || "",
    contract_property_name: clientPropertyTitle(contract),
    contract_access_notes: contract.access_notes || "",
    contract_unit_notes: contract.unit_notes || "",
    access_notes: contract.access_notes || client?.access_notes || "",
    unit_notes: contract.unit_notes || client?.unit_notes || "",
    notes: contract.notes || client?.notes || "",
    billing_address: contract.billing_address || client?.billing_address || "",
    address: contract.address || client?.address || "",
    city: contract.city || client?.city || "",
    state: contract.state || client?.state || "",
    postal_code: contract.postal_code || client?.postal_code || "",
    property_name: client?.property_name || contract.property_name || contract.company_name || contract.name || ""
  };
}

function mergeClientAndContractProperties(clients = [], contracts = []) {
  const contractById = new Map(contracts.map((contract) => [String(contract.id || ""), contract]).filter(([id]) => id));
  const contractsByName = new Map();
  contracts.forEach((contract) => {
    const key = propertyMatchKey(contract);
    if (key && !contractsByName.has(key)) contractsByName.set(key, contract);
  });

  const usedContractIds = new Set();
  const merged = clients.map((client) => {
    const match = contractById.get(String(client.id || "")) || contractsByName.get(propertyMatchKey(client)) || null;
    if (match?.id) usedContractIds.add(String(match.id));
    return mergeContractIntoClient(client, match);
  });

  contracts.forEach((contract) => {
    if (usedContractIds.has(String(contract.id || ""))) return;
    if (!clientPropertyTitle(contract)) return;
    merged.push({
      ...contract,
      contract_id: contract.id || "",
      contract_access_notes: contract.access_notes || "",
      contract_unit_notes: contract.unit_notes || ""
    });
  });

  return merged
    .filter((client) => clientPropertyTitle(client))
    .sort((a, b) => clientPropertyTitle(a).localeCompare(clientPropertyTitle(b)));
}

function serviceModelLabel(value) {
  const labels = {
    apartment_turnover: "Apartment Turnover",
    monthly_commercial: "Monthly Commercial",
    hybrid: "Hybrid",
    other: "Other"
  };
  const key = normalizeToken(value);
  return labels[key] || (value ? titleCase(value) : "");
}

function clientPropertyService(row) {
  return row?.default_service_type || row?.service_type || row?.property_type || serviceModelLabel(row?.service_model) || row?.client_type || "";
}

function isApartmentProperty(row) {
  const tokens = [
    row?.service_model,
    row?.service_type,
    row?.default_service_type,
    row?.property_type,
    row?.client_type,
    row?.company_name,
    row?.property_name,
    row?.name
  ].map(normalizeToken).join("_");
  return tokens.includes("apartment") || tokens.includes("turnover") || Number(row?.units || row?.unit_count || 0) > 0;
}

function unitLabel(unit) {
  const name = unit?.unit_name || unit?.name || unit?.unit_number || "Unnamed unit";
  const squareFeet = formatSquareFeet(unit?.square_feet);
  return [name, squareFeet].filter(Boolean).join(" - ");
}

function formatSquareFeet(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return "";
  const formatted = Number.isInteger(amount) ? String(amount) : String(amount).replace(/\.0+$/, "");
  return `${formatted} sq ft`;
}

function unitInstructions(unit) {
  return unit?.special_instructions || unit?.instructions || unit?.notes || unit?.unit_notes || "";
}

function setFieldValue(id, value) {
  const field = document.getElementById(id);
  if (field) field.value = value || "";
}

function setDefaultAccessNotes(value) {
  const field = document.getElementById("special_instructions");
  if (!field) return;
  if (!field.value || field.dataset.clientGeneratedAccessNotes === "true") {
    field.value = value || "";
    field.dataset.clientGeneratedAccessNotes = value ? "true" : "";
  }
}

function selectedClient() {
  const select = document.getElementById("propertySelect");
  if (!select?.value) return null;
  return clientProperties.find((client) => client.id === select.value) || null;
}

function selectedUnit() {
  if (!selectedUnitId) return null;
  return selectedPropertyUnits.find((unit) => unit.id === selectedUnitId) || null;
}

function unitSearchValue() {
  return (document.getElementById("assignmentUnitSearch")?.value || "").trim();
}

function findUnitBySearch(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return null;
  return selectedPropertyUnits.find((unit) => (
    unitLabel(unit).toLowerCase() === normalized ||
    String(unit?.unit_name || "").toLowerCase() === normalized
  )) || selectedPropertyUnits.find((unit) => unitLabel(unit).toLowerCase().includes(normalized)) || null;
}

function assignmentUnitMetadata() {
  const field = document.getElementById("assignmentUnitField");
  if (field?.hidden) return null;

  const searchText = unitSearchValue();
  const unit = selectedUnit() || findUnitBySearch(searchText);
  const client = selectedClient();
  const unitName = unit?.unit_name || unit?.name || unit?.unit_number || searchText;
  const unitId = unit?.id || selectedUnitId || "";

  if (!unitName && !unitId) return null;

  return {
    unit_id: unitId || null,
    unit_name: unitName || "",
    unit_number: unitName || "",
    contract_id: client?.contract_id || null,
    access_notes: clientAccessNotes(client),
    unit_square_feet: unit?.square_feet ?? "",
    unit_customer_price: unit?.customer_price ?? "",
    unit_contractor_pay: unit?.contractor_pay ?? "",
    unit_notes: unitInstructions(unit)
  };
}

function captureAssignmentUnitMetadata() {
  window.clearTimeout(pendingAssignmentUnitMetadataTimer);
  pendingAssignmentUnitMetadata = assignmentUnitMetadata();
  if (pendingAssignmentUnitMetadata) {
    pendingAssignmentUnitMetadataTimer = window.setTimeout(() => {
      pendingAssignmentUnitMetadata = null;
    }, 15000);
  }
}

function isBulkUnitAddEnabled() {
  return Boolean(document.getElementById("assignmentBulkUnitMode")?.checked);
}

function mergeAssignmentUnitMetadata(row, metadata) {
  if (!row || typeof row !== "object" || Array.isArray(row)) return row;
  const existing = row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
    ? row.metadata
    : {};
  return {
    ...row,
    metadata: {
      ...existing,
      ...metadata
    }
  };
}

function installAssignmentUnitInsertPatch() {
  if (window.__turnlyAssignmentUnitInsertPatch || !window.fetch) return;
  window.__turnlyAssignmentUnitInsertPatch = true;
  const originalFetch = window.fetch.bind(window);

  window.fetch = (input, init = {}) => {
    const url = typeof input === "string" ? input : input?.url || "";
    const method = String(init?.method || input?.method || "GET").toUpperCase();
    const body = init?.body;

    if (method === "POST" && /\/rest\/v1\/assignment_blocks/i.test(url) && body && pendingAssignmentUnitMetadata) {
      try {
        const parsed = JSON.parse(body);
        const patchedBody = Array.isArray(parsed)
          ? parsed.map((row) => mergeAssignmentUnitMetadata(row, pendingAssignmentUnitMetadata))
          : mergeAssignmentUnitMetadata(parsed, pendingAssignmentUnitMetadata);
        init = { ...init, body: JSON.stringify(patchedBody) };
      } catch (error) {
        console.warn("[assignments] Unable to attach unit metadata to assignment insert", error);
      }
    }

    return originalFetch(input, init);
  };
}

function injectUnitPickerStyles() {
  if (document.getElementById("assignmentUnitPickerStyles")) return;
  const style = document.createElement("style");
  style.id = "assignmentUnitPickerStyles";
  style.textContent = `
    .assignment-unit-field {
      gap: 8px;
    }
    .assignment-unit-picker {
      display: grid;
      grid-template-columns: minmax(160px, 1fr) minmax(160px, 1fr);
      gap: 10px;
    }
    .assignment-unit-field small {
      color: var(--muted, #9ca3af);
      font-size: 12px;
      line-height: 1.35;
      min-height: 16px;
    }
    @media (max-width: 760px) {
      .assignment-unit-picker {
        grid-template-columns: 1fr;
      }
    }
  `;
  document.head.appendChild(style);
}

function ensureUnitPicker() {
  if (document.getElementById("assignmentUnitField")) return;
  const propertySelect = document.getElementById("propertySelect");
  if (!propertySelect) return;

  injectUnitPickerStyles();
  const propertyField = propertySelect.closest(".suite-field") || propertySelect.closest("label") || propertySelect.parentElement;
  if (!propertyField) return;

  propertyField.insertAdjacentHTML("afterend", `
    <label class="suite-field wide assignment-unit-field" id="assignmentUnitField" hidden>
      <span>Unit</span>
      <div class="assignment-unit-picker">
        <input id="assignmentUnitSearch" list="assignmentUnitOptions" type="text" placeholder="Search unit number or name" autocomplete="off" />
        <select id="assignmentUnitSelect">
          <option value="">Choose a unit...</option>
        </select>
      </div>
      <datalist id="assignmentUnitOptions"></datalist>
      <small id="assignmentUnitMeta"></small>
    </label>
  `);
}

function setUnitPickerVisible(isVisible) {
  ensureUnitPicker();
  const field = document.getElementById("assignmentUnitField");
  if (!field) return;
  field.hidden = !isVisible;
}

function clearUnitPicker() {
  unitLoadRequestId += 1;
  isLoadingUnits = false;
  selectedPropertyUnits = [];
  currentUnitPropertyId = "";
  selectedUnitId = "";
  const search = document.getElementById("assignmentUnitSearch");
  const select = document.getElementById("assignmentUnitSelect");
  const options = document.getElementById("assignmentUnitOptions");
  const meta = document.getElementById("assignmentUnitMeta");
  if (search) search.value = "";
  if (select) select.innerHTML = `<option value="">Choose a unit...</option>`;
  if (options) options.innerHTML = "";
  if (meta) meta.textContent = "";
  pendingAssignmentUnitMetadata = null;
}

function renderUnitPicker(message = "", filter = "") {
  ensureUnitPicker();
  const select = document.getElementById("assignmentUnitSelect");
  const options = document.getElementById("assignmentUnitOptions");
  const meta = document.getElementById("assignmentUnitMeta");
  if (!select || !options) return;

  const normalizedFilter = filter.trim().toLowerCase();
  const units = normalizedFilter
    ? selectedPropertyUnits.filter((unit) => unitLabel(unit).toLowerCase().includes(normalizedFilter))
    : selectedPropertyUnits;

  select.innerHTML = [
    `<option value="">Choose a unit...</option>`,
    ...units.map((unit) => `<option value="${escapeHtml(unit.id)}">${escapeHtml(unitLabel(unit))}</option>`)
  ].join("");
  options.innerHTML = units
    .map((unit) => `<option value="${escapeHtml(unitLabel(unit))}"></option>`)
    .join("");

  if (selectedUnitId && selectedPropertyUnits.some((unit) => unit.id === selectedUnitId)) {
    select.value = selectedUnitId;
  }
  if (meta) {
    meta.textContent = message || (selectedPropertyUnits.length ? `${selectedPropertyUnits.length} unit${selectedPropertyUnits.length === 1 ? "" : "s"} available` : "No units found for this property");
  }
}

function unitScopeDetails(unit) {
  return [
    unit?.unit_name ? `Unit: ${unit.unit_name}` : "",
    unit?.square_feet ? `Square Feet: ${formatSquareFeet(unit.square_feet)}` : ""
  ].filter(Boolean).join("\n");
}

function assignmentTitleForUnit(unit, client) {
  const unitName = unit?.unit_name || unit?.name || unit?.unit_number || "Unit";
  const squareFeet = formatSquareFeet(unit?.square_feet);
  const property = client ? clientPropertyTitle(client) : "";
  const unitText = squareFeet ? `${unitName}, ${squareFeet}` : unitName;
  return ["Cleaning unit " + unitText, property].filter(Boolean).join(" - ");
}

function applySelectedUnit(unit) {
  if (!unit) return;
  selectedUnitId = unit.id;
  const search = document.getElementById("assignmentUnitSearch");
  const select = document.getElementById("assignmentUnitSelect");
  if (search) search.value = unitLabel(unit);
  if (select) select.value = unit.id;

  const client = selectedClient();
  const baseScope = client?.default_scope || client?.unit_notes || "";
  const details = unitScopeDetails(unit);
  setFieldValue("scope", [baseScope, details].filter(Boolean).join("\n\n"));
  const accessNotes = unitInstructions(unit) || clientAccessNotes(client);
  setFieldValue("special_instructions", accessNotes);
  document.getElementById("special_instructions")?.setAttribute("data-client-generated-access-notes", accessNotes ? "true" : "");
  if (unit?.contractor_pay !== undefined && unit?.contractor_pay !== null && unit?.contractor_pay !== "") {
    setFieldValue("pay_amount", unit.contractor_pay);
  }

  const titleField = document.getElementById("title");
  if (titleField && (!titleField.value || titleField.dataset.clientGeneratedTitle === "true")) {
    titleField.value = assignmentTitleForUnit(unit, client);
    titleField.dataset.clientGeneratedTitle = "true";
  }
}

async function loadPropertyUnitsForClient(client) {
  if (!supabase || !client?.id) return;
  const requestId = unitLoadRequestId + 1;
  unitLoadRequestId = requestId;
  isLoadingUnits = true;
  currentUnitPropertyId = client.id;
  selectedPropertyUnits = [];
  selectedUnitId = "";
  renderUnitPicker("Loading units...");

  const result = await supabase
    .from("property_units")
    .select("*")
    .eq("property_id", client.id)
    .order("unit_name", { ascending: true })
    .limit(1000);

  if (requestId !== unitLoadRequestId || currentUnitPropertyId !== client.id) return;
  isLoadingUnits = false;
  if (result.error) {
    console.warn("[assignments] Unable to load property units", result.error);
    renderUnitPicker("Unable to load units for this property");
    return;
  }

  selectedPropertyUnits = result.data || [];
  renderUnitPicker();
}

function handleUnitSearch(value) {
  renderUnitPicker("", value);
  const normalized = value.trim();
  if (!normalized) {
    selectedUnitId = "";
    return;
  }
  const match = findUnitBySearch(value);
  if (match) {
    applySelectedUnit(match);
  } else {
    selectedUnitId = "";
  }
}

function fillAssignmentFromClient() {
  const client = selectedClient();
  if (!client) return;

  const title = clientPropertyTitle(client);
  const service = clientPropertyService(client);
  setFieldValue("property_id", client.id);
  setFieldValue("property_name", title);
  setFieldValue("address", clientPropertyAddress(client));
  setFieldValue("service_type", service);
  setFieldValue("scope", client.default_scope || client.unit_notes || "");
  setDefaultAccessNotes(clientAccessNotes(client));

  const titleField = document.getElementById("title");
  if (titleField && (!titleField.value || titleField.dataset.clientGeneratedTitle === "true")) {
    titleField.value = `${service || "Service"} - ${title}`;
    titleField.dataset.clientGeneratedTitle = "true";
  }

  if (isApartmentProperty(client)) {
    setUnitPickerVisible(true);
    if (currentUnitPropertyId !== client.id) {
      void loadPropertyUnitsForClient(client);
    } else {
      renderUnitPicker();
      applySelectedUnit(selectedUnit());
    }
  } else {
    setUnitPickerVisible(false);
    clearUnitPicker();
  }
}

function populateClientPropertySelect() {
  const select = document.getElementById("propertySelect");
  if (!select || !clientProperties.length) return;

  isPopulatingSelect = true;
  const currentValue = select.value;
  select.innerHTML = [
    `<option value="">Choose a client or property...</option>`,
    ...clientProperties.map((client) => (
      `<option value="${escapeHtml(client.id)}">${escapeHtml(clientPropertyTitle(client))}</option>`
    ))
  ].join("");

  if (currentValue && clientProperties.some((client) => client.id === currentValue)) {
    select.value = currentValue;
  }
  fillAssignmentFromClient();
  window.setTimeout(() => {
    isPopulatingSelect = false;
  }, 0);
}

async function loadClientProperties() {
  if (!supabase || isLoadingClients) return;
  isLoadingClients = true;

  let result = await supabase
    .from(CLIENT_TABLE)
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(500);

  if (result.error && String(result.error.message || "").includes("updated_at")) {
    result = await supabase
      .from(CLIENT_TABLE)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
  }

  let contractsResult = await supabase
    .from(CONTRACT_TABLE)
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(500);

  if (contractsResult.error && String(contractsResult.error.message || "").includes("updated_at")) {
    contractsResult = await supabase
      .from(CONTRACT_TABLE)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
  }

  isLoadingClients = false;
  if (result.error) {
    console.warn("[assignments] Unable to load clients for property select", result.error);
    return;
  }
  if (contractsResult.error) {
    console.warn("[assignments] Unable to load contract access notes for property select", contractsResult.error);
  }

  clientProperties = mergeClientAndContractProperties(result.data || [], contractsResult.data || []);
  populateClientPropertySelect();
}

function bindClientPropertySelect() {
  const observer = new MutationObserver(() => {
    if (isPopulatingSelect || !clientProperties.length) return;
    const select = document.getElementById("propertySelect");
    const firstClient = clientProperties[0];
    if (select && firstClient && !select.querySelector(`option[value="${CSS.escape(firstClient.id)}"]`)) {
      populateClientPropertySelect();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  document.addEventListener("change", (event) => {
    if (event.target?.id === "propertySelect") {
      window.setTimeout(fillAssignmentFromClient, 0);
      return;
    }

    if (event.target?.id === "assignmentUnitSelect") {
      applySelectedUnit(selectedPropertyUnits.find((unit) => unit.id === event.target.value));
      return;
    }

    if (event.target?.id === "assignmentUnitSearch") {
      handleUnitSearch(event.target.value || "");
    }
  });

  document.addEventListener("input", (event) => {
    if (event.target?.id === "title") event.target.dataset.clientGeneratedTitle = "false";
    if (event.target?.id === "special_instructions") event.target.dataset.clientGeneratedAccessNotes = "false";
    if (event.target?.id === "assignmentUnitSearch") renderUnitPicker("", event.target.value || "");
  });

  document.addEventListener("submit", (event) => {
    if (event.target?.id === "assignmentForm") {
      fillAssignmentFromClient();
      if (isBulkUnitAddEnabled()) {
        pendingAssignmentUnitMetadata = null;
        return;
      }
      applySelectedUnit(selectedUnit());
      captureAssignmentUnitMetadata();
    }
  }, true);
}

window.addEventListener("load", () => {
  installAssignmentUnitInsertPatch();
  bindClientPropertySelect();
  void loadClientProperties();
  window.setTimeout(loadClientProperties, 700);
  window.setTimeout(populateClientPropertySelect, 1600);
});
