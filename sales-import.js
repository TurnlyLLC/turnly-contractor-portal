import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const TABLE = "portal_properties";
const BATCH_SIZE = 100;
const xlsxScriptUrl = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
const allowedRoles = new Set(["admin", "sales", "sales_team"]);
const optionalColumns = [
  "company_name",
  "contact_name",
  "contact_email",
  "contact_phone",
  "lead_value",
  "square_feet",
  "sales_owner_id",
  "sales_owner_name",
  "next_step",
  "next_step_due_at",
  "last_activity_at",
  "lead_source",
  "lead_notes",
  "default_scope",
  "created_by"
];

const fieldAliases = {
  name: ["lead_name", "lead", "name", "property_name", "property", "business_name", "company", "company_name"],
  company_name: ["company_name", "company", "organization", "business", "account"],
  contact_name: ["contact_name", "primary_contact", "contact", "name_of_contact"],
  contact_email: ["contact_email", "primary_contact_email", "email", "email_address"],
  contact_phone: ["contact_phone", "phone", "phone_number", "mobile", "cell"],
  lead_source: ["lead_source", "source", "referral_source", "marketing_source"],
  address: ["address", "street_address", "property_address", "site_address"],
  pipeline_stage: ["pipeline_stage", "stage", "status", "lead_status"],
  lead_value: ["lead_value", "value", "estimated_value", "estimate", "deal_value", "monthly_price", "quote_amount"],
  square_feet: ["square_feet", "sqft", "sq_ft", "building_size", "size"],
  next_step: ["next_step", "next_action", "follow_up", "task", "todo"],
  next_step_due_at: ["next_step_due_at", "next_step_due", "follow_up_date", "due_date"],
  lead_notes: ["notes", "lead_notes", "comments", "description", "scope", "default_scope"]
};

const stageAliases = {
  new: "new_leads",
  new_lead: "new_leads",
  new_leads: "new_leads",
  lead: "new_leads",
  contacted: "contacted",
  contact: "contacted",
  qualified: "qualified",
  qualify: "qualified",
  quote: "quote_sent",
  quote_sent: "quote_sent",
  estimate_sent: "quote_sent",
  proposal: "proposal",
  negotiation: "proposal",
  proposal_negotiation: "proposal",
  won: "won",
  closed_won: "won"
};

const env = window.__ENV || {};
const supabase = env.SUPABASE_URL && env.SUPABASE_ANON_KEY
  ? createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY)
  : null;

const importState = {
  user: null,
  profile: null,
  fileName: "",
  payloads: [],
  errors: []
};

const $ = (id) => document.getElementById(id);

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function number(value) {
  return Number(value || 0).toLocaleString();
}

function cleanText(value) {
  return String(value ?? "").trim();
}

function cleanNumber(value) {
  const text = cleanText(value).replace(/[$,\s]/g, "");
  if (!text) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function cleanInteger(value) {
  const parsed = cleanNumber(value);
  return parsed === null ? null : Math.round(parsed);
}

function normalizeHeader(value) {
  return cleanText(value).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function getValue(row, field) {
  const aliases = fieldAliases[field] || [field];
  for (const alias of aliases) {
    const value = row[normalizeHeader(alias)];
    if (cleanText(value)) return value;
  }
  return "";
}

function normalizeStage(value) {
  const normalized = normalizeHeader(value);
  return stageAliases[normalized] || "new_leads";
}

function parseDate(value) {
  const text = cleanText(value);
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function missingOptionalColumn(error) {
  const message = String(error?.message || "");
  return /column .* does not exist/i.test(message) || /schema cache/i.test(message);
}

function stripOptionalColumns(payload) {
  const copy = { ...payload };
  optionalColumns.forEach((column) => delete copy[column]);
  return copy;
}

function ensureStyles() {
  if ($("salesImportStyles")) return;
  const style = document.createElement("style");
  style.id = "salesImportStyles";
  style.textContent = `
    #salesRunImportBtn:disabled { opacity: .5; cursor: not-allowed; }
    .sales-import-panel { max-width: 720px; }
    .sales-import-body { display: grid; gap: 18px; padding: 0 28px 22px; }
    .sales-import-dropzone {
      display: grid;
      justify-items: center;
      gap: 8px;
      padding: 30px 20px;
      border: 1px dashed rgba(31, 223, 119, .45);
      border-radius: 16px;
      background: rgba(31, 223, 119, .06);
      color: #f7fbff;
      text-align: center;
      cursor: pointer;
    }
    .sales-import-dropzone.is-dragging {
      border-color: #1fdf77;
      background: rgba(31, 223, 119, .13);
    }
    .sales-import-dropzone input { display: none; }
    .sales-import-dropzone span {
      display: grid;
      place-items: center;
      width: 48px;
      height: 48px;
      border-radius: 14px;
      color: #1fdf77;
      background: rgba(31, 223, 119, .14);
      font-size: 1.35rem;
    }
    .sales-import-dropzone strong { font-size: 1rem; }
    .sales-import-dropzone small,
    .sales-import-summary small,
    .sales-import-errors li {
      color: rgba(230, 238, 247, .68);
    }
    .sales-import-summary,
    .sales-import-errors {
      border: 1px solid rgba(255, 255, 255, .08);
      border-radius: 14px;
      background: rgba(255, 255, 255, .04);
      padding: 14px 16px;
    }
    .sales-import-summary {
      display: grid;
      gap: 4px;
    }
    .sales-import-errors p { margin: 0 0 8px; color: #f7fbff; font-weight: 700; }
    .sales-import-errors ul { margin: 0; padding-left: 18px; }
  `;
  document.head.appendChild(style);
}

function ensureModal() {
  if ($("salesImportModal")) return;
  document.body.insertAdjacentHTML("beforeend", `
    <div id="salesImportModal" class="sales-modal" hidden>
      <div class="sales-modal-backdrop" data-close-sales-import-modal></div>
      <section class="sales-modal-panel sales-import-panel" role="dialog" aria-modal="true" aria-labelledby="salesImportModalTitle">
        <header class="sales-modal-header">
          <div>
            <p>Sales Pipeline</p>
            <h2 id="salesImportModalTitle">Import Leads</h2>
          </div>
          <button type="button" data-close-sales-import-modal>Close</button>
        </header>
        <div class="sales-import-body">
          <label id="salesImportDropzone" class="sales-import-dropzone" for="salesImportFileInput">
            <input id="salesImportFileInput" type="file" accept=".csv,.xls,.xlsx,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" />
            <span aria-hidden="true">⇧</span>
            <strong>Drop an Excel or CSV file here</strong>
            <small>Columns like Lead Name, Company, Email, Phone, Source, Stage, Value, Address, Notes, and Next Step are supported.</small>
          </label>
          <div id="salesImportSummary" class="sales-import-summary" hidden></div>
          <div id="salesImportErrors" class="sales-import-errors" hidden></div>
        </div>
        <footer class="sales-modal-actions">
          <p id="salesImportMessage" aria-live="polite"></p>
          <button type="button" data-close-sales-import-modal>Cancel</button>
          <button id="salesRunImportBtn" type="button" disabled>Import Leads</button>
        </footer>
      </section>
    </div>
  `);
}

function showMessage(text) {
  const element = $("salesImportMessage");
  if (element) element.textContent = text;
}

function renderSummary() {
  const summary = $("salesImportSummary");
  const errors = $("salesImportErrors");
  const button = $("salesRunImportBtn");

  if (button) button.disabled = !importState.payloads.length;
  if (summary) {
    summary.hidden = !importState.fileName;
    summary.innerHTML = importState.fileName
      ? `<strong>${escapeHtml(importState.fileName)}</strong>
         <span>${number(importState.payloads.length)} lead${importState.payloads.length === 1 ? "" : "s"} ready to import</span>
         <small>${number(importState.errors.length)} skipped row${importState.errors.length === 1 ? "" : "s"}</small>`
      : "";
  }
  if (errors) {
    errors.hidden = !importState.errors.length;
    errors.innerHTML = importState.errors.length
      ? `<p>Skipped rows</p><ul>${importState.errors.slice(0, 12).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
      : "";
  }
}

function resetImportState(clearFile = true) {
  importState.fileName = "";
  importState.payloads = [];
  importState.errors = [];
  if (clearFile && $("salesImportFileInput")) $("salesImportFileInput").value = "";
  showMessage("");
  renderSummary();
}

async function loadCurrentUser() {
  if (!supabase) throw new Error("Supabase config is missing.");
  if (importState.user) return;

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData?.user) throw new Error("Please sign in before importing leads.");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, user_role, email")
    .eq("id", authData.user.id)
    .maybeSingle();

  const role = profile?.user_role || authData.user.user_metadata?.user_role;
  if (!allowedRoles.has(role)) throw new Error("Only sales team members and admins can import leads.");

  importState.user = authData.user;
  importState.profile = profile || null;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (quoted) {
      if (char === "\"" && next === "\"") {
        value += "\"";
        index += 1;
      } else if (char === "\"") {
        quoted = false;
      } else {
        value += char;
      }
      continue;
    }

    if (char === "\"") {
      quoted = true;
    } else if (char === ",") {
      row.push(value);
      value = "";
    } else if (char === "\n") {
      row.push(value);
      if (row.some((cell) => cleanText(cell))) rows.push(row);
      row = [];
      value = "";
    } else if (char !== "\r") {
      value += char;
    }
  }

  row.push(value);
  if (row.some((cell) => cleanText(cell))) rows.push(row);
  return rows;
}

function rowsToObjects(rows) {
  const nonEmptyRows = rows.filter((row) =>
    Array.isArray(row) && row.some((cell) => cleanText(cell))
  );
  if (!nonEmptyRows.length) return [];

  const headers = nonEmptyRows[0].map(normalizeHeader);
  return nonEmptyRows.slice(1).map((row) => {
    const object = {};
    headers.forEach((header, index) => {
      if (header) object[header] = row[index] ?? "";
    });
    return object;
  });
}

async function loadXlsxParser() {
  if (window.XLSX) return window.XLSX;
  await new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${xlsxScriptUrl}"]`);
    if (existing) {
      existing.addEventListener("load", resolve, { once: true });
      existing.addEventListener("error", reject, { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = xlsxScriptUrl;
    script.async = true;
    script.onload = resolve;
    script.onerror = () => reject(new Error("Unable to load the Excel parser."));
    document.head.appendChild(script);
  });
  return window.XLSX;
}

async function readImportFile(file) {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension === "csv" || file.type === "text/csv") {
    return rowsToObjects(parseCsv(await file.text()));
  }

  if (extension === "xls" || extension === "xlsx") {
    const XLSX = await loadXlsxParser();
    const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) return [];
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
      header: 1,
      raw: false,
      defval: ""
    });
    return rowsToObjects(rows);
  }

  throw new Error("Use a CSV, XLS, or XLSX file.");
}

function buildPayload(row, rowNumber) {
  const leadName = cleanText(getValue(row, "name")) ||
    cleanText(getValue(row, "company_name")) ||
    cleanText(getValue(row, "contact_name")) ||
    cleanText(getValue(row, "contact_email"));

  if (!leadName) return { error: `Row ${rowNumber}: missing Lead Name, Company, Contact Name, or Email.` };

  const notes = cleanText(getValue(row, "lead_notes"));
  const leadValue = cleanNumber(getValue(row, "lead_value"));
  const squareFeet = cleanInteger(getValue(row, "square_feet"));
  const nextStepDueAt = parseDate(getValue(row, "next_step_due_at"));
  const ownerName = importState.profile?.full_name || importState.user?.email || "Sales Team";

  return {
    payload: {
      name: leadName,
      property_name: leadName,
      company_name: cleanText(getValue(row, "company_name")),
      contact_name: cleanText(getValue(row, "contact_name")),
      contact_email: cleanText(getValue(row, "contact_email")),
      contact_phone: cleanText(getValue(row, "contact_phone")),
      lead_source: cleanText(getValue(row, "lead_source")) || "Imported",
      address: cleanText(getValue(row, "address")),
      pipeline_stage: normalizeStage(getValue(row, "pipeline_stage")),
      lead_value: leadValue,
      square_feet: squareFeet,
      next_step: cleanText(getValue(row, "next_step")),
      next_step_due_at: nextStepDueAt,
      default_scope: notes,
      lead_notes: notes,
      sales_owner_id: importState.user?.id || null,
      sales_owner_name: ownerName,
      created_by: importState.user?.id || null,
      last_activity_at: new Date().toISOString()
    }
  };
}

function buildPayloads(rows) {
  const payloads = [];
  const errors = [];

  rows.forEach((row, index) => {
    const result = buildPayload(row, index + 2);
    if (result.error) errors.push(result.error);
    if (result.payload) payloads.push(result.payload);
  });

  return { payloads, errors };
}

async function handleImportFile(file) {
  if (!file) return;
  resetImportState(false);
  importState.fileName = file.name;
  showMessage("Reading file...");
  renderSummary();

  try {
    await loadCurrentUser();
    const rows = await readImportFile(file);
    const result = buildPayloads(rows);
    importState.payloads = result.payloads;
    importState.errors = result.errors;
    showMessage(importState.payloads.length
      ? "Review the parsed leads, then import them."
      : "No valid lead rows were found.");
    renderSummary();
  } catch (error) {
    importState.errors = [error.message];
    showMessage("Unable to read this file.");
    renderSummary();
  }
}

async function insertPayloads(payloads) {
  for (let index = 0; index < payloads.length; index += BATCH_SIZE) {
    const batch = payloads.slice(index, index + BATCH_SIZE);
    let { error } = await supabase.from(TABLE).insert(batch);
    if (error && missingOptionalColumn(error)) {
      ({ error } = await supabase.from(TABLE).insert(batch.map(stripOptionalColumns)));
    }
    if (error) throw error;
  }
}

async function importLeads() {
  if (!importState.payloads.length) return;

  const button = $("salesRunImportBtn");
  if (button) button.disabled = true;
  showMessage(`Importing ${number(importState.payloads.length)} leads...`);

  try {
    await loadCurrentUser();
    await insertPayloads(importState.payloads);
    const importedCount = importState.payloads.length;
    importState.payloads = [];
    renderSummary();
    showMessage(`Imported ${number(importedCount)} leads to Supabase.`);
    window.setTimeout(() => window.location.reload(), 900);
  } catch (error) {
    showMessage(`Error: ${error.message}`);
    renderSummary();
  }
}

function openModal() {
  ensureStyles();
  ensureModal();
  resetImportState();
  $("salesImportModal").hidden = false;
}

function closeModal() {
  const modal = $("salesImportModal");
  if (modal) modal.hidden = true;
}

function bindImportEvents() {
  const importButton = $("salesImportBtn");
  if (!importButton || importButton.dataset.importBound === "true") return;
  importButton.dataset.importBound = "true";
  importButton.addEventListener("click", openModal);

  document.addEventListener("click", (event) => {
    if (event.target.closest("[data-close-sales-import-modal]")) closeModal();
  });

  document.addEventListener("change", (event) => {
    if (event.target?.id === "salesImportFileInput") {
      handleImportFile(event.target.files?.[0]);
    }
  });

  document.addEventListener("click", (event) => {
    if (event.target?.id === "salesRunImportBtn") importLeads();
  });

  document.addEventListener("dragover", (event) => {
    const dropzone = event.target.closest("#salesImportDropzone");
    if (!dropzone) return;
    event.preventDefault();
    dropzone.classList.add("is-dragging");
  });

  document.addEventListener("dragleave", (event) => {
    const dropzone = event.target.closest("#salesImportDropzone");
    if (dropzone) dropzone.classList.remove("is-dragging");
  });

  document.addEventListener("drop", (event) => {
    const dropzone = event.target.closest("#salesImportDropzone");
    if (!dropzone) return;
    event.preventDefault();
    dropzone.classList.remove("is-dragging");
    handleImportFile(event.dataTransfer.files?.[0]);
  });
}

bindImportEvents();
