import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const env = window.__ENV || {};
const supabase = env.SUPABASE_URL && env.SUPABASE_ANON_KEY
  ? createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY)
  : null;

let contractors = [];
let contractorsLoaded = false;
let currentAssignment = null;
let observedAssignmentId = "";

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => (
    char === "&" ? "&amp;" : char === "<" ? "&lt;" : char === ">" ? "&gt;" : char === '"' ? "&quot;" : "&#39;"
  ));
}

function normalizeToken(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function uniqueValues(values) {
  return Array.from(new Set(values.filter(Boolean).map(String)));
}

function message(text, isError = false) {
  const node = document.getElementById("assignmentEditMessage") || document.getElementById("assignmentMessage");
  if (!node) return;
  node.textContent = text;
  node.classList.toggle("error", isError);
}

function activeContractorProfile(row) {
  const tokens = [
    row?.role,
    row?.team,
    row?.account_type,
    row?.profile_type,
    row?.user_type,
    row?.department,
    row?.title
  ].map(normalizeToken).join("-");
  const status = normalizeToken(row?.status || row?.contractor_status || row?.account_status || row?.approval_status);
  const approval = normalizeToken(row?.approval_status);
  const inactive = ["inactive", "disabled", "archived", "suspended", "rejected", "declined", "deleted"].includes(status);
  const sales = tokens.includes("sales") || tokens.includes("account-executive") || tokens.includes("business-development");
  const manager = tokens.includes("property-manager") || tokens.includes("property-management") || tokens.includes("client-manager");
  const contractor = Boolean(row?.contractor_approved)
    || row?.__sourceTable !== "profiles"
    || tokens.includes("contractor")
    || tokens.includes("vendor")
    || tokens.includes("cleaner")
    || tokens.includes("service-provider");
  const active = Boolean(row?.contractor_approved)
    || ["active", "approved", "available", "enabled", "onboarded"].includes(status)
    || approval === "approved";
  const registered = row?.__sourceTable === "profiles" || row?.profile_id || row?.user_id || row?.auth_user_id;
  return contractor && active && registered && !inactive && !sales && !manager;
}

function normalizeContractor(row) {
  const email = String(row?.email || "");
  const id = String(row?.profile_id || row?.user_id || row?.auth_user_id || row?.id || "");
  const services = Array.isArray(row?.service_types)
    ? row.service_types.filter(Boolean).join(", ")
    : row?.service_type || row?.department || row?.title || "";
  return {
    id,
    name: row?.full_name || row?.name || row?.display_name || row?.contractor_name || email.split("@")[0] || "Contractor",
    email,
    services,
    status: row?.status || (row?.contractor_approved ? "approved" : ""),
    sourceTable: row?.__sourceTable || "profiles"
  };
}

async function fetchContractorRows(table) {
  const { data, error } = await supabase.from(table).select("*").limit(1000);
  if (error) {
    console.warn(`[assignment-contractor-assignment] Unable to load ${table}`, error);
    return [];
  }
  return (data || []).map((row) => ({ ...row, __sourceTable: table }));
}

async function loadContractors() {
  if (!supabase || contractorsLoaded) return contractors;
  const rows = (await Promise.all(["contractors", "profiles", "contractor_profiles"].map(fetchContractorRows))).flat();
  const unique = new Map();
  rows
    .filter(activeContractorProfile)
    .map(normalizeContractor)
    .filter((contractor) => contractor.id && contractor.name)
    .forEach((contractor) => {
      const existing = unique.get(contractor.id);
      if (!existing || contractor.sourceTable === "profiles") unique.set(contractor.id, contractor);
    });
  contractors = Array.from(unique.values()).sort((a, b) => a.name.localeCompare(b.name));
  contractorsLoaded = true;
  return contractors;
}

function assignmentContractorIds(row) {
  const metadata = row?.metadata && typeof row.metadata === "object" ? row.metadata : {};
  const metadataIds = Array.isArray(metadata.assigned_contractor_ids) ? metadata.assigned_contractor_ids : [];
  const preferredIds = Array.isArray(row?.preferred_contractor_ids) ? row.preferred_contractor_ids : [];
  return uniqueValues([...metadataIds, ...preferredIds, row?.assigned_to, row?.claimed_by]);
}

function selectedContractors() {
  return Array.from(document.querySelectorAll("[data-assignment-edit-contractor]:checked"))
    .map((input) => ({
      id: input.value,
      name: input.dataset.contractorName || "",
      email: input.dataset.contractorEmail || ""
    }))
    .filter((contractor) => contractor.id);
}

function syncSummary() {
  const summary = document.getElementById("assignmentEditContractorSummary");
  if (!summary) return;
  const selected = selectedContractors();
  summary.textContent = selected.length
    ? `${selected.length} assigned: ${selected.map((contractor) => contractor.name || contractor.email || contractor.id).join(", ")}`
    : "No contractors selected";
}

function renderContractorList(row) {
  const list = document.getElementById("assignmentEditContractors");
  if (!list) return;
  const selectedIds = new Set(assignmentContractorIds(row));
  if (!contractorsLoaded) {
    list.innerHTML = `<div class="assignment-edit-contractor-empty">Loading active contractors...</div>`;
    return;
  }
  if (!contractors.length) {
    list.innerHTML = `<div class="assignment-edit-contractor-empty">No active registered contractors found.</div>`;
    syncSummary();
    return;
  }
  list.innerHTML = contractors.map((contractor) => {
    const checked = selectedIds.has(contractor.id) ? "checked" : "";
    const meta = [contractor.email, contractor.services, contractor.status ? contractor.status.replaceAll("_", " ") : ""].filter(Boolean).join(" - ");
    return `
      <label class="assignment-edit-contractor-option">
        <input type="checkbox" data-assignment-edit-contractor value="${escapeHtml(contractor.id)}" data-contractor-name="${escapeHtml(contractor.name)}" data-contractor-email="${escapeHtml(contractor.email)}" ${checked} />
        <span><strong>${escapeHtml(contractor.name)}</strong>${meta ? `<small>${escapeHtml(meta)}</small>` : ""}</span>
      </label>
    `;
  }).join("");
  syncSummary();
}

function ensureContractorField(form) {
  if (document.getElementById("assignmentEditContractorField")) return;
  const anchor = document.getElementById("assignmentEditUnit")?.closest("div")
    || document.getElementById("assignmentEditProperty")?.closest("div");
  if (!anchor) return;
  anchor.insertAdjacentHTML("afterend", `
    <div id="assignmentEditContractorField" class="span-two assignment-edit-contractor-field">
      <label>Assign Contractors</label>
      <div id="assignmentEditContractors" class="assignment-edit-contractor-list"></div>
      <small id="assignmentEditContractorSummary" class="assignment-edit-contractor-summary">No contractors selected</small>
    </div>
  `);
  document.getElementById("assignmentEditContractors")?.addEventListener("change", syncSummary);
  bindSubmitOverride(form);
}

async function fetchCurrentAssignment(id) {
  if (!supabase || !id) return null;
  const { data, error } = await supabase
    .from("assignment_blocks")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    console.warn("[assignment-contractor-assignment] Unable to load assignment", error);
    return null;
  }
  currentAssignment = data || null;
  return currentAssignment;
}

async function enhanceModal() {
  const modal = document.getElementById("assignmentEditModal");
  const form = document.getElementById("assignmentEditForm");
  const id = document.getElementById("assignmentEditId")?.value || "";
  if (!modal || modal.hidden || !form || !id) return;
  ensureContractorField(form);
  renderContractorList(currentAssignment && observedAssignmentId === id ? currentAssignment : null);
  if (observedAssignmentId !== id) {
    observedAssignmentId = id;
    const row = await fetchCurrentAssignment(id);
    renderContractorList(row);
  }
  await loadContractors();
  if (document.getElementById("assignmentEditId")?.value === id) renderContractorList(currentAssignment);
}

function clearClaimPayload() {
  return {
    status: "open",
    claimed_by: null,
    claimed_by_name: null,
    claimed_by_email: null,
    claimed_at: null,
    started_at: null,
    started_by: null,
    start_latitude: null,
    start_longitude: null,
    start_location_accuracy: null,
    start_notes: null,
    start_distance_miles: null,
    checklist_responses: [],
    checklist_completed_at: null,
    completed_at: null,
    completed_by: null
  };
}

function formValue(id) {
  return (document.getElementById(id)?.value || "").trim();
}

function editPayload() {
  const metadata = currentAssignment?.metadata && typeof currentAssignment.metadata === "object"
    ? { ...currentAssignment.metadata }
    : {};
  const unitValue = formValue("assignmentEditUnit");
  const selected = selectedContractors();
  const selectedIds = uniqueValues(selected.map((contractor) => contractor.id));
  const selectedNames = uniqueValues(selected.map((contractor) => contractor.name || contractor.email));
  const primary = selected[0] || null;

  if (unitValue) {
    metadata.unit_name = unitValue;
    metadata.unit_number = unitValue;
  } else {
    delete metadata.unit_name;
    delete metadata.unit_number;
  }

  if (selected.length) {
    metadata.assigned_contractor_ids = selectedIds;
    metadata.assigned_contractors = selected;
  } else {
    delete metadata.assigned_contractor_ids;
    delete metadata.assigned_contractors;
  }

  const payload = {
    title: formValue("assignmentEditTitle"),
    property_name: formValue("assignmentEditProperty"),
    address: formValue("assignmentEditAddress"),
    service_type: formValue("assignmentEditService"),
    pay_amount: document.getElementById("assignmentEditPay")?.value || null,
    start_window: document.getElementById("assignmentEditStart")?.value || null,
    end_window: document.getElementById("assignmentEditEnd")?.value || null,
    scope: formValue("assignmentEditScope"),
    supplies_notes: formValue("assignmentEditSupplies"),
    special_instructions: formValue("assignmentEditInstructions"),
    status: document.getElementById("assignmentEditStatus")?.value || "open",
    metadata,
    assigned_to: primary?.id || null,
    assigned_to_name: primary?.name || null,
    assigned_to_email: primary?.email || null,
    preferred_contractor_ids: selectedIds,
    preferred_contractor_names: selectedNames,
    visibility: selectedIds.length ? "preferred" : "open"
  };

  if (document.getElementById("assignmentEditClearClaim")?.checked) {
    Object.assign(payload, clearClaimPayload());
  }
  return payload;
}

function closeModal() {
  const modal = document.getElementById("assignmentEditModal");
  if (modal) modal.hidden = true;
  document.body.classList.remove("property-modal-open");
}

function bindSubmitOverride(form) {
  if (form.dataset.assignmentContractorOverrideBound) return;
  form.dataset.assignmentContractorOverrideBound = "true";
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    const id = document.getElementById("assignmentEditId")?.value || "";
    const button = event.submitter;
    if (!supabase || !id) return;
    if (button) button.disabled = true;
    message("Saving assignment...");
    if (!currentAssignment || currentAssignment.id !== id) {
      await fetchCurrentAssignment(id);
    }
    const { data, error } = await supabase
      .from("assignment_blocks")
      .update(editPayload())
      .eq("id", id)
      .select("*")
      .maybeSingle();
    if (button) button.disabled = false;
    if (error) {
      message("Error: " + error.message, true);
      return;
    }
    currentAssignment = data || currentAssignment;
    closeModal();
    const pageMessage = document.getElementById("assignmentMessage");
    if (pageMessage) pageMessage.textContent = "Assignment updated.";
    document.dispatchEvent(new CustomEvent("turnly:assignments-updated"));
  }, true);
}

function init() {
  if (!supabase) return;
  void loadContractors();
  const observer = new MutationObserver(() => {
    void enhanceModal();
  });
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden"] });
  document.addEventListener("click", () => {
    window.setTimeout(() => void enhanceModal(), 0);
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
