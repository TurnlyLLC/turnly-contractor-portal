import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const env = window.__ENV || {};
const supabase = env.SUPABASE_URL && env.SUPABASE_ANON_KEY
  ? createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY)
  : null;

const parserUrl = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm";
const aliases = {
  unit_name: ["unit", "unit name", "unit number", "unit no", "unit #", "number", "name", "unit id", "unit number / name"],
  square_feet: ["square feet", "square foot", "square footage", "sq ft", "sqft", "sf", "sq feet"],
  customer_price: ["customer charge", "customer price", "charged price", "charge", "price", "client price", "customer amount", "bill rate", "billing"],
  contractor_pay: ["contractor pay", "contractor price", "pay to contractor", "vendor pay", "vendor price", "contractor amount", "payout", "pay"],
  notes: ["notes", "instructions", "unit instructions", "special instructions", "access notes", "unit notes", "scope"]
};

let parserPromise = null;
let isImporting = false;

function workspace() {
  return document.querySelector("[data-property-units-page]");
}

function normalizeKey(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function normalizeUnitName(value) {
  return String(value || "").trim().toLowerCase();
}

function selectedPropertyId() {
  return document.getElementById("propertyUnitPropertySelect")?.value || "";
}

function setMessage(text, isError = false) {
  const message = document.getElementById("propertyUnitMessage");
  if (!message) return;
  message.textContent = text || "";
  message.classList.toggle("error", Boolean(isError));
  message.classList.toggle("is-error", Boolean(isError));
}

function parseNumber(value) {
  const text = String(value ?? "").replace(/[$,\s]/g, "").replace(/^\((.*)\)$/, "-$1");
  const number = Number(text);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function rowHasValues(row) {
  return Object.values(row || {}).some((value) => String(value ?? "").trim());
}

function pickValue(row, fieldAliases) {
  const normalizedAliases = fieldAliases.map(normalizeKey);
  const entry = Object.entries(row || {}).find(([key, value]) => (
    normalizedAliases.includes(normalizeKey(key)) &&
    String(value ?? "").trim() !== ""
  ));
  return entry ? entry[1] : "";
}

async function loadParser() {
  if (!parserPromise) parserPromise = import(parserUrl);
  return parserPromise;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => String(value || "").trim())) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  row.push(cell);
  if (row.some((value) => String(value || "").trim())) rows.push(row);
  return rows;
}

function csvToObjects(rows) {
  if (!rows.length) return [];
  const headers = rows[0].map((header) => String(header || "").trim());
  return rows.slice(1).map((row) => headers.reduce((record, header, index) => {
    if (header) record[header] = row[index] ?? "";
    return record;
  }, {}));
}

async function readRows(file) {
  const extension = String(file?.name || "").split(".").pop().toLowerCase();
  if (extension === "csv") return csvToObjects(parseCsv(await file.text()));

  const spreadsheet = await loadParser();
  const read = spreadsheet.read || spreadsheet.default?.read;
  const utils = spreadsheet.utils || spreadsheet.default?.utils;
  if (!read || !utils?.sheet_to_json) throw new Error("Unable to load the spreadsheet parser.");

  const workbook = read(await file.arrayBuffer(), { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return sheet ? utils.sheet_to_json(sheet, { defval: "", raw: false }) : [];
}

function normalizeRows(rows, propertyId) {
  const payloadsByUnit = new Map();
  const errors = [];

  rows.forEach((row, index) => {
    if (!rowHasValues(row)) return;
    const unitName = String(pickValue(row, aliases.unit_name) || "").trim();
    if (!unitName) {
      errors.push(`Row ${index + 2} is missing a unit name.`);
      return;
    }

    payloadsByUnit.set(normalizeUnitName(unitName), {
      property_id: propertyId,
      unit_name: unitName,
      square_feet: parseNumber(pickValue(row, aliases.square_feet)),
      customer_price: parseNumber(pickValue(row, aliases.customer_price)),
      contractor_pay: parseNumber(pickValue(row, aliases.contractor_pay)),
      notes: String(pickValue(row, aliases.notes) || "").trim(),
      status: "active"
    });
  });

  return { payloads: Array.from(payloadsByUnit.values()), errors };
}

async function loadExistingUnits(propertyId) {
  const result = await supabase
    .from("property_units")
    .select("*")
    .eq("property_id", propertyId)
    .limit(3000);
  if (result.error) throw result.error;
  return result.data || [];
}

async function saveRows(payloads, existingUnits) {
  for (const payload of payloads) {
    const existing = existingUnits.find((unit) => normalizeUnitName(unit.unit_name) === normalizeUnitName(payload.unit_name));
    const result = existing
      ? await supabase.from("property_units").update(payload).eq("id", existing.id).select("*").single()
      : await supabase.from("property_units").insert(payload).select("*").single();
    if (result.error) throw result.error;
  }
}

function setImporting(nextValue) {
  isImporting = nextValue;
  const input = document.getElementById("propertyUnitImportInput");
  const button = document.querySelector(".property-unit-import-button");
  if (input) input.disabled = nextValue;
  button?.classList.toggle("is-disabled", nextValue);
  const label = button?.querySelector("span");
  if (label) label.textContent = nextValue ? "Importing..." : "Upload File";
}

async function importFile(file) {
  if (!file || isImporting) return;
  if (!supabase) {
    setMessage("Supabase config is missing. Add env.js values before importing units.", true);
    return;
  }

  const propertyId = selectedPropertyId();
  if (!propertyId) {
    setMessage("Select a client directory property before importing units.", true);
    return;
  }

  setImporting(true);
  setMessage(`Importing ${file.name}...`);
  try {
    const rows = await readRows(file);
    const { payloads, errors } = normalizeRows(rows, propertyId);
    if (errors.length) throw new Error(errors.slice(0, 3).join(" "));
    if (!payloads.length) throw new Error("No unit rows were found in that file.");
    await saveRows(payloads, await loadExistingUnits(propertyId));
    setMessage(`${payloads.length.toLocaleString()} unit${payloads.length === 1 ? "" : "s"} imported to Supabase.`);
    document.querySelector("[data-property-units-refresh]")?.click();
  } catch (error) {
    console.warn("[property-units] Unable to import units", error);
    setMessage("Unable to import units: " + (error?.message || "Unknown error"), true);
  } finally {
    setImporting(false);
    const input = document.getElementById("propertyUnitImportInput");
    if (input) input.value = "";
  }
}

function installImportPanel() {
  const root = workspace();
  const panel = root?.querySelector(".property-unit-selector-panel");
  if (!panel || document.getElementById("propertyUnitImportPanel")) return;
  const target = document.getElementById("propertyUnitMessage") || panel.lastElementChild;
  target?.insertAdjacentHTML("beforebegin", `
    <div id="propertyUnitImportPanel" class="property-unit-import-panel">
      <div class="property-unit-import-copy">
        <strong>Bulk Unit Import</strong>
        <span>Excel or CSV</span>
      </div>
      <label class="secondary-action property-unit-import-button" for="propertyUnitImportInput">
        <span>Upload File</span>
        <input id="propertyUnitImportInput" type="file" accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv" />
      </label>
    </div>
  `);
}

function installStyles() {
  if (document.getElementById("propertyUnitImportStyles")) return;
  const style = document.createElement("style");
  style.id = "propertyUnitImportStyles";
  style.textContent = `
    .property-unit-import-panel {
      align-items: center;
      border-top: 1px solid rgba(148, 163, 184, 0.18);
      display: flex;
      gap: 12px;
      justify-content: space-between;
      margin-top: 10px;
      padding-top: 12px;
    }
    .property-unit-import-copy { display: grid; gap: 2px; min-width: 0; }
    .property-unit-import-copy strong { font-size: 13px; }
    .property-unit-import-copy span { color: var(--muted, #94a3b8); font-size: 12px; }
    .property-unit-import-button { cursor: pointer; overflow: hidden; position: relative; white-space: nowrap; }
    .property-unit-import-button input { cursor: pointer; inset: 0; opacity: 0; position: absolute; }
    .property-unit-import-button.is-disabled { opacity: 0.55; pointer-events: none; }
    @media (max-width: 720px) {
      .property-unit-import-panel { align-items: stretch; flex-direction: column; }
      .property-unit-import-button { justify-content: center; width: 100%; }
    }
  `;
  document.head.appendChild(style);
}

function bindEvents() {
  document.addEventListener("change", (event) => {
    if (event.target?.id !== "propertyUnitImportInput") return;
    event.stopPropagation();
    event.stopImmediatePropagation();
    void importFile(event.target.files?.[0]);
  }, true);
}

function start() {
  installStyles();
  const timer = window.setInterval(() => {
    installImportPanel();
    if (document.getElementById("propertyUnitImportPanel")) window.clearInterval(timer);
  }, 100);
  bindEvents();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start, { once: true });
} else {
  start();
}
