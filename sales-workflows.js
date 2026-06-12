import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const SALES_TABLE = "portal_properties";
const CLIENTS_TABLE = "clients";
const optionalSalesColumns = [
  "lead_source",
  "lead_notes",
  "walkthrough_at",
  "walkthrough_notes",
  "quote_amount",
  "quote_sent_at",
  "quote_notes"
];

const stageMeta = {
  new_leads: {
    label: "New Leads",
    singular: "Lead",
    next: "walkthrough",
    nextLabel: "Move to Walkthrough",
    emptyTitle: "No leads yet",
    emptyText: "Create a lead to start filling this pipeline stage."
  },
  walkthrough: {
    label: "Walkthroughs",
    singular: "Walkthrough",
    next: "quote_sent",
    nextLabel: "Move to Quote Sent",
    emptyTitle: "No walkthroughs scheduled",
    emptyText: "Move qualified leads here or create a walkthrough directly."
  },
  quote_sent: {
    label: "Quotes",
    singular: "Quote",
    next: "contract_out",
    nextLabel: "Move to Contract Out",
    emptyTitle: "No quotes sent",
    emptyText: "Create quotes or move completed walkthroughs into this stage."
  }
};

const stageLabels = {
  new_leads: "New Leads",
  walkthrough: "Walkthrough",
  quote_sent: "Quote Sent",
  contract_out: "Contract Out",
  active: "Active"
};

const pageStage = document.body.dataset.salesStage || "new_leads";
const meta = stageMeta[pageStage] || stageMeta.new_leads;
const env = window.__ENV || {};
const hasSupabaseConfig = Boolean(env.SUPABASE_URL && env.SUPABASE_ANON_KEY);
const supabase = hasSupabaseConfig ? createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY) : null;

let currentUser = null;
let allItems = [];
let clients = [];
let selectedId = null;
let searchTerm = "";

const $ = (id) => document.getElementById(id);

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function setText(id, value) {
  const element = $(id);
  if (element) element.textContent = value;
}

function showSummary(text) {
  setText("salesSummary", text);
}

function showMessage(text) {
  setText("salesMessage", text);
}

function getValue(id) {
  return ($(id)?.value || "").trim();
}

function money(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return "Not listed";
  return amount.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function formatDate(value) {
  if (!value) return "Not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not set";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function formatDateTime(value) {
  if (!value) return "Not scheduled";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not scheduled";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function toDateInput(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function toTimeInput(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function combineDateTime(dateValue, timeValue, fallbackTime = "09:00") {
  if (!dateValue) return null;
  const date = new Date(`${dateValue}T${timeValue || fallbackTime}`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function getClientName(clientId) {
  if (!clientId) return "No client linked";
  const client = clients.find((item) => item.id === clientId);
  return client?.name || client?.email || "Client linked";
}

function getStageItems() {
  const term = searchTerm.toLowerCase();
  return allItems
    .filter((item) => (item.pipeline_stage || "new_leads") === pageStage)
    .filter((item) => {
      if (!term) return true;
      return [
        item.name,
        item.property_name,
        item.address,
        item.default_service_type,
        item.lead_source,
        item.default_scope,
        item.lead_notes,
        getClientName(item.client_id)
      ].some((value) => String(value || "").toLowerCase().includes(term));
    });
}

function countStage(stage) {
  return allItems.filter((item) => (item.pipeline_stage || "new_leads") === stage).length;
}

function updateMetrics() {
  const stageCount = countStage(pageStage);
  const quotedValue = allItems
    .filter((item) => (item.pipeline_stage || "") === "quote_sent")
    .reduce((total, item) => total + (Number(item.quote_amount) || 0), 0);

  setText("stageCount", stageCount);
  setText("stageTrend", `${stageCount} in ${meta.label.toLowerCase()}`);
  setText("pipelineCount", allItems.length);
  setText("leadCount", countStage("new_leads"));
  setText("walkthroughCount", countStage("walkthrough"));
  setText("quoteCount", countStage("quote_sent"));
  setText("contractCount", countStage("contract_out"));
  setText("quotedValue", quotedValue.toLocaleString(undefined, { style: "currency", currency: "USD" }));
}

function renderList() {
  const container = $("salesItems");
  if (!container) return;

  const items = getStageItems();
  if (!items.some((item) => item.id === selectedId)) selectedId = items[0]?.id || null;

  if (!items.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div><strong>${escapeHtml(meta.emptyTitle)}</strong><p>${escapeHtml(meta.emptyText)}</p></div>
      </div>
    `;
    showSummary("No records match this view.");
    renderDetail(null);
    return;
  }

  showSummary(`${items.length} ${items.length === 1 ? meta.singular.toLowerCase() : meta.label.toLowerCase()} showing`);
  container.innerHTML = items.map(renderCard).join("");
  renderDetail(items.find((item) => item.id === selectedId) || items[0]);
}

function renderCard(item) {
  const name = item.name || item.property_name || "Untitled property";
  const stage = item.pipeline_stage || "new_leads";
  const nextButton = meta.next ? `<button type="button" data-move-sales-id="${escapeHtml(item.id)}">${escapeHtml(meta.nextLabel)}</button>` : "";

  return `
    <article class="sales-card ${item.id === selectedId ? "active" : ""}">
      <div class="sales-card-top">
        <div>
          <h3>${escapeHtml(name)}</h3>
          <p>${escapeHtml(item.address || "No address entered")}</p>
        </div>
        <span class="stage-badge ${escapeHtml(stage)}">${escapeHtml(stageLabels[stage] || stage)}</span>
      </div>
      <div class="sales-tags">
        <span class="sales-tag">${escapeHtml(getClientName(item.client_id))}</span>
        <span class="sales-tag">${escapeHtml(item.default_service_type || "Service not set")}</span>
        <span class="sales-tag">Quote ${escapeHtml(money(item.quote_amount))}</span>
      </div>
      <p>${escapeHtml(item.default_scope || item.lead_notes || "No notes yet.")}</p>
      <div class="sales-actions">
        <button type="button" data-view-sales-id="${escapeHtml(item.id)}">View</button>
        <button type="button" data-edit-sales-id="${escapeHtml(item.id)}">Edit</button>
        ${nextButton}
      </div>
    </article>
  `;
}

function renderDetail(item) {
  const panel = $("salesDetailPanel");
  if (!panel) return;

  if (!item) {
    panel.innerHTML = `
      <div class="empty-state">
        <div><strong>Select a record</strong><p>Pipeline details will appear here.</p></div>
      </div>
    `;
    return;
  }

  const name = item.name || item.property_name || "Untitled property";
  const stage = item.pipeline_stage || "new_leads";
  const nextButton = meta.next ? `<button type="button" data-move-sales-id="${escapeHtml(item.id)}">${escapeHtml(meta.nextLabel)}</button>` : "";

  panel.innerHTML = `
    <div class="sales-detail-content">
      <div class="sales-detail-top">
        <div>
          <h2>${escapeHtml(name)}</h2>
          <p>${escapeHtml(item.address || "No address entered")}</p>
        </div>
        <span class="stage-badge ${escapeHtml(stage)}">${escapeHtml(stageLabels[stage] || stage)}</span>
      </div>

      <div class="sales-detail-actions">
        <button type="button" data-edit-sales-id="${escapeHtml(item.id)}">Edit Details</button>
        ${nextButton}
      </div>

      <section class="sales-detail-section">
        <h3>Client</h3>
        <p>${escapeHtml(getClientName(item.client_id))}</p>
      </section>

      <section class="sales-detail-section">
        <h3>Lead Details</h3>
        <p><strong>Source:</strong> ${escapeHtml(item.lead_source || "Not captured")}</p>
        <p><strong>Service:</strong> ${escapeHtml(item.default_service_type || "Not set")}</p>
        <p>${escapeHtml(item.default_scope || item.lead_notes || "No lead notes saved.")}</p>
      </section>

      <section class="sales-detail-section">
        <h3>Walkthrough</h3>
        <p><strong>Scheduled:</strong> ${escapeHtml(formatDateTime(item.walkthrough_at))}</p>
        <p>${escapeHtml(item.walkthrough_notes || "No walkthrough notes saved.")}</p>
      </section>

      <section class="sales-detail-section">
        <h3>Quote</h3>
        <p><strong>Amount:</strong> ${escapeHtml(money(item.quote_amount))}</p>
        <p><strong>Sent:</strong> ${escapeHtml(formatDate(item.quote_sent_at))}</p>
        <p>${escapeHtml(item.quote_notes || "No quote notes saved.")}</p>
      </section>
    </div>
  `;
}

function renderClientOptions(selectedClientId = "") {
  const select = $("sales_client_id_input");
  if (!select) return;

  const options = clients.map((client) => `
    <option value="${escapeHtml(client.id)}" ${client.id === selectedClientId ? "selected" : ""}>
      ${escapeHtml(client.name || client.email || "Unnamed client")}
    </option>
  `);

  select.innerHTML = `<option value="">No client selected</option>${options.join("")}`;
}

function openModal(item = null) {
  const modal = $("salesModal");
  const form = $("salesForm");
  if (!modal || !form) return;

  form.reset();
  showMessage("");
  $("sales_id_input").value = item?.id || "";
  $("salesModalTitle").textContent = item ? `Edit ${meta.singular}` : `New ${meta.singular}`;
  $("sales_pipeline_stage_input").value = item?.pipeline_stage || pageStage;
  $("sales_property_name_input").value = item?.name || item?.property_name || "";
  $("sales_address_input").value = item?.address || "";
  $("sales_client_name_input").value = "";
  $("sales_client_email_input").value = "";
  $("sales_lead_source_input").value = item?.lead_source || "";
  $("sales_service_type_input").value = item?.default_service_type || "";
  $("sales_walkthrough_date_input").value = toDateInput(item?.walkthrough_at);
  $("sales_walkthrough_time_input").value = toTimeInput(item?.walkthrough_at);
  $("sales_quote_amount_input").value = item?.quote_amount || "";
  $("sales_quote_sent_date_input").value = toDateInput(item?.quote_sent_at);
  $("sales_scope_input").value = item?.default_scope || item?.lead_notes || "";
  $("sales_walkthrough_notes_input").value = item?.walkthrough_notes || "";
  $("sales_quote_notes_input").value = item?.quote_notes || "";
  renderClientOptions(item?.client_id || "");

  modal.hidden = false;
  $("sales_property_name_input")?.focus();
}

function closeModal() {
  const modal = $("salesModal");
  if (modal) modal.hidden = true;
}

async function loadClients() {
  if (!supabase) return;

  const { data, error } = await supabase
    .from(CLIENTS_TABLE)
    .select("id,name,email")
    .order("name", { ascending: true });

  if (error) {
    clients = [];
    const select = $("sales_client_id_input");
    if (select) select.innerHTML = `<option value="">Client lookup unavailable</option>`;
    return;
  }

  clients = data || [];
  renderClientOptions();
}

async function loadItems() {
  if (!supabase) {
    showSummary("Supabase config is missing. Add env.js values before saving sales records.");
    renderList();
    return;
  }

  showSummary(`Loading ${meta.label.toLowerCase()}...`);

  const { data, error } = await supabase
    .from(SALES_TABLE)
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    showSummary(`Error: ${error.message}`);
    allItems = [];
  } else {
    allItems = data || [];
  }

  updateMetrics();
  renderList();
}

function isMissingOptionalColumn(error) {
  const message = String(error?.message || "").toLowerCase();
  return optionalSalesColumns.some((column) => message.includes(column.toLowerCase())) || message.includes("schema cache");
}

async function savePortalProperty(payload, id) {
  const run = (nextPayload) => {
    if (id) {
      return supabase.from(SALES_TABLE).update(nextPayload).eq("id", id).select("*").maybeSingle();
    }

    return supabase.from(SALES_TABLE).insert([nextPayload]).select("*").single();
  };

  let result = await run(payload);

  if (result.error && isMissingOptionalColumn(result.error)) {
    const corePayload = { ...payload };
    optionalSalesColumns.forEach((column) => delete corePayload[column]);
    result = await run(corePayload);
  }

  return result;
}

async function createClientIfNeeded() {
  const name = getValue("sales_client_name_input");
  const email = getValue("sales_client_email_input");

  if (!name && !email) return getValue("sales_client_id_input") || null;

  const { data, error } = await supabase
    .from(CLIENTS_TABLE)
    .insert([{ name: name || email, email: email || null, created_by: currentUser?.id || null }])
    .select("id,name,email")
    .single();

  if (error) throw new Error(`Client error: ${error.message}`);

  clients = [data, ...clients.filter((client) => client.id !== data.id)];
  return data.id;
}

async function saveFromForm(event) {
  event.preventDefault();

  if (!supabase) {
    showMessage("Supabase config is missing.");
    return;
  }

  const name = getValue("sales_property_name_input");
  if (!name) {
    showMessage("Property / lead name is required.");
    return;
  }

  showMessage("Saving...");

  try {
    const id = getValue("sales_id_input");
    const clientId = await createClientIfNeeded();
    const walkthroughAt = combineDateTime(
      getValue("sales_walkthrough_date_input"),
      getValue("sales_walkthrough_time_input")
    );
    const quoteSentAt = combineDateTime(getValue("sales_quote_sent_date_input"), "12:00", "12:00");
    const scope = getValue("sales_scope_input");
    const quoteAmount = getValue("sales_quote_amount_input");

    const payload = {
      name,
      property_name: name,
      address: getValue("sales_address_input"),
      client_id: clientId,
      pipeline_stage: getValue("sales_pipeline_stage_input") || pageStage,
      default_service_type: getValue("sales_service_type_input"),
      default_scope: scope,
      lead_source: getValue("sales_lead_source_input"),
      lead_notes: scope,
      walkthrough_at: walkthroughAt,
      walkthrough_notes: getValue("sales_walkthrough_notes_input"),
      quote_amount: quoteAmount ? Number(quoteAmount) : null,
      quote_sent_at: quoteSentAt,
      quote_notes: getValue("sales_quote_notes_input")
    };

    if (!id) payload.created_by = currentUser?.id || null;

    const { data, error } = await savePortalProperty(payload, id);
    if (error) throw error;

    selectedId = data?.id || id || selectedId;
    showMessage("Saved.");
    closeModal();
    await loadClients();
    await loadItems();
  } catch (error) {
    showMessage(`Error: ${error.message}`);
  }
}

async function moveToNextStage(id) {
  const item = allItems.find((record) => record.id === id);
  if (!item || !meta.next || !supabase) return;

  const payload = { pipeline_stage: meta.next };
  if (meta.next === "quote_sent" && !item.quote_sent_at) payload.quote_sent_at = new Date().toISOString();

  const { error } = await savePortalProperty(payload, id);
  if (error) {
    showSummary(`Error: ${error.message}`);
    return;
  }

  selectedId = null;
  await loadItems();
}

async function requireAdmin() {
  if (!supabase) return;

  const { data: userData } = await supabase.auth.getUser();
  currentUser = userData?.user || null;

  if (!currentUser) {
    window.location.href = "login.html";
    return;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", currentUser.id)
    .maybeSingle();

  if (!profile || profile.role !== "admin") {
    window.location.href = "contractor.html";
  }
}

function bindEvents() {
  $("openSalesModalBtn")?.addEventListener("click", () => openModal());
  $("resetSalesFormBtn")?.addEventListener("click", () => openModal());
  $("closeSalesModalBtn")?.addEventListener("click", closeModal);
  $("salesForm")?.addEventListener("submit", saveFromForm);
  $("salesSearchInput")?.addEventListener("input", (event) => {
    searchTerm = event.target.value;
    renderList();
  });
  $("logoutBtn")?.addEventListener("click", async () => {
    if (supabase) await supabase.auth.signOut();
    window.location.href = "login.html";
  });

  document.addEventListener("click", async (event) => {
    if (event.target.closest("[data-close-sales-modal]")) closeModal();

    const viewButton = event.target.closest("[data-view-sales-id]");
    if (viewButton) {
      selectedId = viewButton.dataset.viewSalesId;
      renderList();
    }

    const editButton = event.target.closest("[data-edit-sales-id]");
    if (editButton) {
      const item = allItems.find((record) => record.id === editButton.dataset.editSalesId);
      if (item) openModal(item);
    }

    const moveButton = event.target.closest("[data-move-sales-id]");
    if (moveButton) {
      moveButton.disabled = true;
      await moveToNextStage(moveButton.dataset.moveSalesId);
    }
  });
}

bindEvents();
await requireAdmin();
await loadClients();
await loadItems();
