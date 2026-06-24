import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const env = window.__ENV || {};
const supabase = env.SUPABASE_URL && env.SUPABASE_ANON_KEY
  ? createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY)
  : null;

let clientProperties = [];
let isLoadingClients = false;
let isPopulatingSelect = false;

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

function clientPropertyAddress(row) {
  return [row?.address, row?.city, row?.state, row?.postal_code].filter(Boolean).join(", ") || row?.region || row?.market || "";
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

function setFieldValue(id, value) {
  const field = document.getElementById(id);
  if (field) field.value = value || "";
}

function selectedClient() {
  const select = document.getElementById("propertySelect");
  if (!select?.value) return null;
  return clientProperties.find((client) => client.id === select.value) || null;
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
  setFieldValue("special_instructions", client.special_instructions || client.notes || "");

  const titleField = document.getElementById("title");
  if (titleField && (!titleField.value || titleField.dataset.clientGeneratedTitle === "true")) {
    titleField.value = `${service || "Service"} - ${title}`;
    titleField.dataset.clientGeneratedTitle = "true";
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

  isLoadingClients = false;
  if (result.error) {
    console.warn("[assignments] Unable to load clients for property select", result.error);
    return;
  }

  clientProperties = (result.data || [])
    .filter((client) => clientPropertyTitle(client))
    .sort((a, b) => clientPropertyTitle(a).localeCompare(clientPropertyTitle(b)));
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
    if (event.target?.id !== "propertySelect") return;
    window.setTimeout(fillAssignmentFromClient, 0);
  });

  document.addEventListener("input", (event) => {
    if (event.target?.id === "title") event.target.dataset.clientGeneratedTitle = "false";
  });

  document.addEventListener("submit", (event) => {
    if (event.target?.id === "assignmentForm") fillAssignmentFromClient();
  }, true);
}

window.addEventListener("load", () => {
  bindClientPropertySelect();
  void loadClientProperties();
  window.setTimeout(loadClientProperties, 700);
  window.setTimeout(populateClientPropertySelect, 1600);
});
