import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const env = window.__ENV || {};
const supabase = env.SUPABASE_URL && env.SUPABASE_ANON_KEY
  ? createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY)
  : null;

const contractorSources = [
  { table: "profiles", select: "*" },
  { table: "contractors", select: "*" },
  { table: "contractor_profiles", select: "*" }
];

const selectedContractorIds = new Set();
let contractors = [];
let isLoading = false;
let renderTimer = 0;

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
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function statusToken(row) {
  return normalizeToken(row?.status || row?.contractor_status || row?.approval_status || row?.account_status || "");
}

function isInactiveStatus(row) {
  return ["inactive", "disabled", "archived", "suspended", "rejected", "declined", "deleted"].includes(statusToken(row));
}

function isApprovedStatus(row) {
  return Boolean(row?.contractor_approved)
    || ["approved", "available", "enabled", "onboarded"].includes(statusToken(row))
    || normalizeToken(row?.approval_status) === "approved";
}

function hasContractorSignal(row, sourceTable) {
  if (sourceTable !== "profiles") return true;
  const text = [
    row?.role,
    row?.account_type,
    row?.user_type,
    row?.profile_type,
    row?.type
  ].map(normalizeToken).join("_");
  return Boolean(row?.contractor_approved)
    || text.includes("contractor")
    || text.includes("vendor")
    || text.includes("cleaner")
    || text.includes("service_provider");
}

function shouldUseContractor(row, sourceTable) {
  if (!row || isInactiveStatus(row) || !hasContractorSignal(row, sourceTable)) return false;
  if (sourceTable !== "profiles" && !(row?.profile_id || row?.user_id || row?.auth_user_id)) return false;
  return isApprovedStatus(row);
}

function normalizeContractor(row) {
  const email = row?.email || row?.contact_email || row?.primary_email || "";
  const id = row?.profile_id || row?.user_id || row?.auth_user_id || row?.id || email;
  const name = row?.full_name
    || row?.name
    || row?.display_name
    || row?.contractor_name
    || row?.company_name
    || row?.business_name
    || email.split("@")[0]
    || "Contractor";

  return {
    id: String(id || ""),
    name: String(name || "Contractor"),
    email: String(email || ""),
    status: statusToken(row) || (row?.contractor_approved ? "approved" : "")
  };
}

async function loadContractorSource(source) {
  const result = await supabase
    .from(source.table)
    .select(source.select)
    .limit(1000);

  if (result.error) {
    console.warn(`[assignments] Unable to load ${source.table} contractor source`, result.error);
    return [];
  }

  return (result.data || [])
    .filter((row) => shouldUseContractor(row, source.table))
    .map(normalizeContractor)
    .filter((contractor) => contractor.id && contractor.name);
}

async function loadContractors() {
  if (!supabase || isLoading) return;
  isLoading = true;

  const rows = (await Promise.all(contractorSources.map(loadContractorSource))).flat();
  const unique = new Map();
  rows.forEach((contractor) => {
    const key = contractor.email.toLowerCase() || contractor.id;
    if (!unique.has(key)) unique.set(key, contractor);
  });

  contractors = Array.from(unique.values()).sort((a, b) => a.name.localeCompare(b.name));
  isLoading = false;
  renderContractorControls();
}

function optionMarkup(contractor, checked) {
  const meta = [contractor.email, contractor.status ? titleCase(contractor.status) : ""].filter(Boolean).join(" - ");
  return `
    <label class="client-manager-option assignment-contractor-option">
      <input type="checkbox" data-assignment-contractor-option data-contractor-id="${escapeHtml(contractor.id)}" data-contractor-name="${escapeHtml(contractor.name)}" data-contractor-email="${escapeHtml(contractor.email)}" ${checked ? "checked" : ""} />
      <span><strong>${escapeHtml(contractor.name)}</strong>${meta ? `<small>${escapeHtml(meta)}</small>` : ""}</span>
    </label>
  `;
}

function collectSelectedIds() {
  document.querySelectorAll("[data-assignment-contractor-option]:checked").forEach((input) => {
    const id = input.dataset.contractorId || "";
    if (id) selectedContractorIds.add(id);
  });
  return selectedContractorIds;
}

function updateDropdownLabels() {
  document.querySelectorAll("[data-assignment-contractor-dropdown]").forEach((dropdown) => {
    const label = dropdown.querySelector("[data-assignment-contractor-label]");
    if (!label) return;
    const names = Array.from(dropdown.querySelectorAll("[data-assignment-contractor-option]:checked"))
      .map((input) => input.dataset.contractorName || "")
      .filter(Boolean);
    label.textContent = names.length ? names.join(", ") : "Select preferred contractors";
  });
}

function renderContractorMenus() {
  const signature = contractors.map((contractor) => `${contractor.id}:${contractor.name}:${contractor.status}`).join("|");
  const selectedIds = collectSelectedIds();

  document.querySelectorAll("[data-assignment-contractor-menu]").forEach((menu) => {
    if (menu.dataset.assignmentContractorSource === "true" && menu.dataset.assignmentContractorSignature === signature) return;
    menu.dataset.assignmentContractorSource = "true";
    menu.dataset.assignmentContractorSignature = signature;
    menu.innerHTML = contractors.length
      ? contractors.map((contractor) => optionMarkup(contractor, selectedIds.has(contractor.id))).join("")
      : `<div class="client-manager-empty">${isLoading ? "Loading active contractors..." : "No active contractor accounts found"}</div>`;
  });

  updateDropdownLabels();
}

function renderContractorFilter() {
  const filter = document.getElementById("assignmentContractorFilter");
  if (!filter || !contractors.length) return;
  const selected = filter.value || "all";
  filter.innerHTML = `<option value="all">All Contractors</option><option value="unassigned">Unassigned</option>${contractors.map((contractor) => `<option value="${escapeHtml(contractor.id)}">${escapeHtml(contractor.name)}</option>`).join("")}`;
  filter.value = contractors.some((contractor) => contractor.id === selected) || ["all", "unassigned"].includes(selected) ? selected : "all";
}

function renderContractorControls() {
  renderContractorMenus();
  renderContractorFilter();
}

function scheduleRender() {
  if (renderTimer) return;
  renderTimer = window.setTimeout(() => {
    renderTimer = 0;
    renderContractorControls();
  }, 80);
}

function bindEvents() {
  document.addEventListener("change", (event) => {
    const option = event.target?.closest?.("[data-assignment-contractor-option]");
    if (!option) return;
    const id = option.dataset.contractorId || "";
    if (option.checked && id) selectedContractorIds.add(id);
    if (!option.checked && id) selectedContractorIds.delete(id);
    updateDropdownLabels();
  });

  const observer = new MutationObserver(scheduleRender);
  observer.observe(document.body, { childList: true, subtree: true });
}

function start() {
  bindEvents();
  renderContractorControls();
  void loadContractors();
  window.setTimeout(loadContractors, 1200);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start, { once: true });
} else {
  start();
}
