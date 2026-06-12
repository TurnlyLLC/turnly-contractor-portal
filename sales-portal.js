import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const TABLE = "portal_properties";
const PAGE_SIZE = 25;
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
  "quote_sent_at"
];

const stages = [
  { id: "new_leads", label: "New Lead" },
  { id: "contacted", label: "Contacted" },
  { id: "qualified", label: "Qualified" },
  { id: "quote_sent", label: "Quote Sent" },
  { id: "proposal", label: "Proposal / Negotiation" },
  { id: "won", label: "Won" }
];

const sourceColors = ["green", "yellow", "blue", "orange", "gray"];
const env = window.__ENV || {};
const supabase = env.SUPABASE_URL && env.SUPABASE_ANON_KEY
  ? createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY)
  : null;

const state = {
  user: null,
  profile: null,
  search: "",
  tab: "all",
  pipelineFilter: "",
  sort: "last_activity_at",
  page: 0,
  selectedIds: new Set(),
  currentRows: []
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

function setText(id, value) {
  const element = $(id);
  if (element) element.textContent = value;
}

function debounce(fn, wait = 250) {
  let timer = null;
  return (...args) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => fn(...args), wait);
  };
}

function money(value) {
  const amount = Number(value) || 0;
  return amount.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  });
}

function number(value) {
  return Number(value || 0).toLocaleString();
}

function compactMoney(value) {
  const amount = Number(value) || 0;
  if (amount >= 1000000) return `$${(amount / 1000000).toFixed(2)}M`;
  if (amount >= 1000) return `$${Math.round(amount / 1000)}K`;
  return money(amount);
}

function formatRelative(value) {
  if (!value) return "No activity";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No activity";
  const diff = Date.now() - date.getTime();
  const minutes = Math.max(1, Math.floor(diff / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function toDateTimeLocal(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (part) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fromDateTimeLocal(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function getDisplayName() {
  return state.profile?.full_name ||
    state.user?.user_metadata?.full_name ||
    state.user?.email?.split("@")[0] ||
    "Sales User";
}

function initials(name) {
  return String(name || "TU")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "TU";
}

function stageLabel(stage) {
  return stages.find((item) => item.id === stage)?.label || stage || "New Lead";
}

function showBoardMessage(text) {
  setText("salesBoardMessage", text);
}

function showModalMessage(text) {
  setText("salesModalMessage", text);
}

function missingOptionalColumn(error) {
  const message = String(error?.message || "").toLowerCase();
  return optionalColumns.some((column) => message.includes(column.toLowerCase())) ||
    message.includes("schema cache");
}

function applySearch(query) {
  const term = state.search.trim();
  if (!term) return query;
  const safe = term.replace(/[%,]/g, "");
  return query.or([
    `name.ilike.%${safe}%`,
    `property_name.ilike.%${safe}%`,
    `address.ilike.%${safe}%`,
    `company_name.ilike.%${safe}%`,
    `contact_name.ilike.%${safe}%`,
    `contact_email.ilike.%${safe}%`,
    `lead_source.ilike.%${safe}%`
  ].join(","));
}

function applyTableFilters(query) {
  query = applySearch(query);

  if (state.tab === "my") {
    query = query.eq("sales_owner_id", state.user.id);
  } else if (state.tab === "unassigned") {
    query = query.is("sales_owner_id", null);
  } else if (state.tab === "due") {
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    query = query.lte("next_step_due_at", end.toISOString());
  } else if (state.tab === "overdue") {
    query = query.lt("next_step_due_at", new Date().toISOString());
  }

  return query;
}

function applyBoardFilter(query) {
  if (state.pipelineFilter === "my") return query.eq("sales_owner_id", state.user.id);
  if (state.pipelineFilter === "unassigned") return query.is("sales_owner_id", null);
  return query;
}

async function requireSalesAccess() {
  if (!supabase) {
    showBoardMessage("Supabase config is missing. Add env.js values before using the Sales Portal.");
    return false;
  }

  const { data: userData } = await supabase.auth.getUser();
  state.user = userData?.user || null;

  if (!state.user) {
    window.location.href = "login.html";
    return false;
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("role, full_name")
    .eq("id", state.user.id)
    .maybeSingle();

  if (error || !profile || !allowedRoles.has(profile.role)) {
    window.location.href = "login.html";
    return false;
  }

  state.profile = profile;
  renderUser();
  return true;
}

function renderUser() {
  const name = getDisplayName();
  const role = state.profile?.role === "admin" ? "Sales Admin" : "Sales Manager";
  setText("salesUserName", name);
  setText("salesTopUserName", name);
  setText("salesUserRole", role);
  setText("salesTopUserRole", role);
  document.querySelectorAll(".sales-avatar").forEach((avatar) => {
    avatar.textContent = initials(name);
  });
}

async function countQuery(query) {
  const { count, error } = await query.select("id", { count: "exact", head: true });
  if (error) throw error;
  return count || 0;
}

async function loadMetrics() {
  const fallback = async () => {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const [total, new30, qualified, quoted, won] = await Promise.all([
      countQuery(supabase.from(TABLE)),
      countQuery(supabase.from(TABLE).gte("created_at", thirtyDaysAgo.toISOString())),
      countQuery(supabase.from(TABLE).eq("pipeline_stage", "qualified")),
      countQuery(supabase.from(TABLE).eq("pipeline_stage", "quote_sent")),
      countQuery(supabase.from(TABLE).eq("pipeline_stage", "won"))
    ]);

    return {
      total_leads: total,
      new_leads_30d: new30,
      qualified,
      quoted,
      won,
      total_pipeline_value: 0
    };
  };

  let summary = null;
  const { data, error } = await supabase
    .from("sales_pipeline_summary")
    .select("*")
    .maybeSingle();

  summary = error ? await fallback() : data;

  setText("salesTotalLeads", number(summary?.total_leads));
  setText("salesNew30", number(summary?.new_leads_30d));
  setText("salesQualified", number(summary?.qualified));
  setText("salesQuoted", number(summary?.quoted));
  setText("salesWon", number(summary?.won));
  setText("salesPipelineValue", money(summary?.total_pipeline_value));
  setText("salesDonutCount", number(summary?.new_leads_30d || 0));
}

async function getStageSummaries() {
  if (state.pipelineFilter) return {};

  const { data, error } = await supabase
    .from("sales_pipeline_stage_summary")
    .select("*");

  if (error) return {};

  return (data || []).reduce((acc, item) => {
    acc[item.pipeline_stage] = item;
    return acc;
  }, {});
}

async function loadBoard() {
  const board = $("salesPipelineBoard");
  if (!board) return;

  showBoardMessage("Loading pipeline...");
  const summaries = await getStageSummaries();

  const columns = await Promise.all(stages.map(async (stage) => {
    const count = summaries[stage.id]?.lead_count ?? await countQuery(
      applyBoardFilter(supabase.from(TABLE).eq("pipeline_stage", stage.id))
    );

    const { data, error } = await applyBoardFilter(
      supabase
        .from(TABLE)
        .select("*")
        .eq("pipeline_stage", stage.id)
    )
      .order(state.sort, { ascending: state.sort === "next_step_due_at", nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(5);

    return {
      stage,
      count,
      value: summaries[stage.id]?.pipeline_value || 0,
      cards: error ? [] : data || []
    };
  }));

  board.innerHTML = columns.map(renderStageColumn).join("");
  showBoardMessage("");
}

function renderStageColumn(column) {
  const more = Math.max(0, column.count - column.cards.length);
  return `
    <article class="sales-stage-column" data-stage="${escapeHtml(column.stage.id)}">
      <header class="sales-stage-header">
        <div><h2>${escapeHtml(column.stage.label)}</h2><span>⋮</span></div>
        <div><strong>${number(column.count)}</strong><small>${compactMoney(column.value)}</small></div>
      </header>
      <div class="sales-card-stack" data-drop-stage="${escapeHtml(column.stage.id)}">
        ${column.cards.map(renderLeadCard).join("")}
        ${more ? `<div class="sales-more-count">+ ${number(more)} more</div>` : ""}
      </div>
    </article>
  `;
}

function renderLeadCard(item) {
  const name = item.name || item.property_name || "Untitled Lead";
  return `
    <article class="sales-lead-card" draggable="true" data-lead-id="${escapeHtml(item.id)}">
      <h3>${escapeHtml(name)}</h3>
      <p>${escapeHtml(item.address || item.company_name || "No company")}</p>
      <p>${number(item.square_feet)} sqft</p>
      <span class="stage-pill ${escapeHtml(item.pipeline_stage || "new_leads")}">${escapeHtml(stageLabel(item.pipeline_stage))}</span>
      <footer><small>${escapeHtml(formatRelative(item.last_activity_at || item.created_at))}</small><button type="button" data-edit-lead-id="${escapeHtml(item.id)}">⋮</button></footer>
    </article>
  `;
}

async function loadTable() {
  const tbody = $("salesLeadRows");
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="10">Loading leads...</td></tr>`;
  const from = state.page * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let query = supabase.from(TABLE).select("*", { count: "exact" });
  query = applyTableFilters(query)
    .order(state.sort, { ascending: state.sort === "next_step_due_at", nullsFirst: false })
    .order("created_at", { ascending: false })
    .range(from, to);

  const { data, count, error } = await query;

  if (error) {
    tbody.innerHTML = `<tr><td colspan="10">Error: ${escapeHtml(error.message)}</td></tr>`;
    setText("salesTableSummary", "Unable to load leads.");
    return;
  }

  state.currentRows = data || [];
  state.selectedIds.clear();
  $("salesSelectAll").checked = false;

  if (!state.currentRows.length) {
    tbody.innerHTML = `<tr><td colspan="10">No leads match this view.</td></tr>`;
  } else {
    tbody.innerHTML = state.currentRows.map(renderTableRow).join("");
  }

  const total = count || 0;
  const showingStart = total ? from + 1 : 0;
  const showingEnd = Math.min(to + 1, total);
  setText("salesTableSummary", `Showing ${number(showingStart)}-${number(showingEnd)} of ${number(total)} leads`);
  setText("salesPageLabel", `Page ${state.page + 1}`);
  $("salesPrevPage").disabled = state.page === 0;
  $("salesNextPage").disabled = to + 1 >= total;
}

function renderTableRow(item) {
  const name = item.name || item.property_name || "Untitled Lead";
  const owner = item.sales_owner_name || (item.sales_owner_id ? "Assigned" : "Unassigned");
  return `
    <tr>
      <td><input type="checkbox" data-select-lead-id="${escapeHtml(item.id)}" aria-label="Select ${escapeHtml(name)}" /></td>
      <td><strong>${escapeHtml(name)}</strong><small>${number(item.square_feet)} sqft</small></td>
      <td>${escapeHtml(item.company_name || "Not captured")}</td>
      <td><strong>${escapeHtml(item.contact_name || "No contact")}</strong><small>${escapeHtml(item.contact_email || "")}</small></td>
      <td>${escapeHtml(item.lead_source || "Unknown")}</td>
      <td><span class="stage-pill ${escapeHtml(item.pipeline_stage || "new_leads")}">${escapeHtml(stageLabel(item.pipeline_stage))}</span></td>
      <td>${escapeHtml(formatRelative(item.last_activity_at || item.created_at))}</td>
      <td>${escapeHtml(owner)}</td>
      <td><strong>${escapeHtml(item.next_step || "None")}</strong><small>${escapeHtml(formatDate(item.next_step_due_at))}</small></td>
      <td><button type="button" data-edit-lead-id="${escapeHtml(item.id)}">⋮</button></td>
    </tr>
  `;
}

async function loadLeadSources() {
  const container = $("salesLeadSources");
  if (!container) return;

  const { data, error } = await supabase
    .from("sales_lead_source_summary")
    .select("*")
    .limit(5);

  if (error || !data?.length) {
    container.innerHTML = `<p>No source data yet.</p>`;
    return;
  }

  const total = data.reduce((sum, item) => sum + Number(item.lead_count || 0), 0) || 1;
  container.innerHTML = data.map((item, index) => {
    const percent = Math.round((Number(item.lead_count || 0) / total) * 100);
    return `
      <div class="sales-source-row">
        <span class="source-dot ${sourceColors[index] || "gray"}"></span>
        <span>${escapeHtml(item.lead_source || "Unknown")}</span>
        <strong>${percent}%</strong>
      </div>
    `;
  }).join("");
}

async function loadTeamPerformance() {
  const container = $("salesTeamPerformance");
  if (!container) return;

  const { data, error } = await supabase
    .from("sales_team_performance")
    .select("*")
    .limit(5);

  if (error || !data?.length) {
    container.innerHTML = `<p>No team data yet.</p>`;
    return;
  }

  container.innerHTML = data.map((item) => `
    <div class="sales-team-row">
      <div class="sales-team-person"><span class="sales-avatar">${escapeHtml(initials(item.owner_name))}</span><span>${escapeHtml(item.owner_name || "Unassigned")}</span></div>
      <span>${number(item.leads)}</span>
      <span>${number(item.won)}</span>
      <span>${compactMoney(item.pipeline_value)}</span>
    </div>
  `).join("");
}

async function loadTasks() {
  const container = $("salesTasksToday");
  if (!container) return;

  const end = new Date();
  end.setHours(23, 59, 59, 999);

  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .not("next_step_due_at", "is", null)
    .lte("next_step_due_at", end.toISOString())
    .order("next_step_due_at", { ascending: true })
    .limit(4);

  if (error || !data?.length) {
    container.innerHTML = `<p>No tasks due today.</p>`;
    return;
  }

  container.innerHTML = data.map((item) => `
    <div class="sales-task-row">
      <span>✓</span>
      <time>${escapeHtml(new Date(item.next_step_due_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }))}</time>
      <p>${escapeHtml(item.next_step || "Follow up")} - ${escapeHtml(item.name || item.property_name || "Lead")}<small>${escapeHtml(item.sales_owner_name || "Unassigned")}</small></p>
    </div>
  `).join("");
}

function openLeadModal(item = null) {
  $("salesLeadForm").reset();
  showModalMessage("");
  $("salesLeadModalTitle").textContent = item ? "Edit Lead" : "Add Lead";
  $("salesLeadIdInput").value = item?.id || "";
  $("salesLeadNameInput").value = item?.name || item?.property_name || "";
  $("salesCompanyInput").value = item?.company_name || "";
  $("salesContactNameInput").value = item?.contact_name || "";
  $("salesContactEmailInput").value = item?.contact_email || "";
  $("salesContactPhoneInput").value = item?.contact_phone || "";
  $("salesLeadSourceInput").value = item?.lead_source || "";
  $("salesAddressInput").value = item?.address || "";
  $("salesStageInput").value = item?.pipeline_stage || "new_leads";
  $("salesLeadValueInput").value = item?.lead_value || "";
  $("salesSquareFeetInput").value = item?.square_feet || "";
  $("salesNextStepInput").value = item?.next_step || "";
  $("salesNextStepDueInput").value = toDateTimeLocal(item?.next_step_due_at);
  $("salesNotesInput").value = item?.default_scope || item?.lead_notes || "";
  $("salesLeadModal").hidden = false;
  $("salesLeadNameInput").focus();
}

function closeLeadModal() {
  $("salesLeadModal").hidden = true;
}

function getLeadPayload() {
  const name = $("salesLeadNameInput").value.trim();
  const leadValue = $("salesLeadValueInput").value;
  const squareFeet = $("salesSquareFeetInput").value;
  const notes = $("salesNotesInput").value.trim();

  return {
    name,
    property_name: name,
    company_name: $("salesCompanyInput").value.trim(),
    contact_name: $("salesContactNameInput").value.trim(),
    contact_email: $("salesContactEmailInput").value.trim(),
    contact_phone: $("salesContactPhoneInput").value.trim(),
    lead_source: $("salesLeadSourceInput").value.trim(),
    address: $("salesAddressInput").value.trim(),
    pipeline_stage: $("salesStageInput").value,
    lead_value: leadValue ? Number(leadValue) : null,
    square_feet: squareFeet ? Number(squareFeet) : null,
    next_step: $("salesNextStepInput").value.trim(),
    next_step_due_at: fromDateTimeLocal($("salesNextStepDueInput").value),
    default_scope: notes,
    lead_notes: notes,
    last_activity_at: new Date().toISOString()
  };
}

async function saveLead(event) {
  event.preventDefault();
  const id = $("salesLeadIdInput").value;
  const payload = getLeadPayload();

  if (!payload.name) {
    showModalMessage("Lead name is required.");
    return;
  }

  showModalMessage("Saving...");

  const run = (nextPayload) => {
    if (id) {
      return supabase.from(TABLE).update(nextPayload).eq("id", id);
    }

    return supabase.from(TABLE).insert([{ ...nextPayload, created_by: state.user.id }]);
  };

  let { error } = await run(payload);

  if (error && missingOptionalColumn(error)) {
    const corePayload = { ...payload };
    optionalColumns.forEach((column) => delete corePayload[column]);
    ({ error } = await run(corePayload));
  }

  if (error) {
    showModalMessage(`Error: ${error.message}`);
    return;
  }

  closeLeadModal();
  await refreshAll();
}

async function updateLeadStage(id, stage) {
  const payload = {
    pipeline_stage: stage,
    last_activity_at: new Date().toISOString()
  };

  if (stage === "quote_sent") payload.quote_sent_at = new Date().toISOString();

  let { error } = await supabase.from(TABLE).update(payload).eq("id", id);

  if (error && missingOptionalColumn(error)) {
    const corePayload = { pipeline_stage: stage };
    if (stage === "quote_sent") corePayload.quote_sent_at = payload.quote_sent_at;
    ({ error } = await supabase.from(TABLE).update(corePayload).eq("id", id));
  }

  if (error) {
    showBoardMessage(`Error: ${error.message}`);
    return;
  }

  await refreshAll();
}

async function editLeadById(id) {
  const local = state.currentRows.find((item) => item.id === id);
  if (local) {
    openLeadModal(local);
    return;
  }

  const { data, error } = await supabase.from(TABLE).select("*").eq("id", id).maybeSingle();
  if (!error && data) openLeadModal(data);
}

async function runBulkAction() {
  const action = $("salesBulkAction").value;
  const ids = Array.from(state.selectedIds);
  if (!action || !ids.length) return;

  const payload = { last_activity_at: new Date().toISOString() };

  if (action === "assign_to_me") {
    payload.sales_owner_id = state.user.id;
    payload.sales_owner_name = getDisplayName();
  } else if (action === "mark_contacted") {
    payload.pipeline_stage = "contacted";
  }

  let { error } = await supabase.from(TABLE).update(payload).in("id", ids);

  if (error && missingOptionalColumn(error) && payload.pipeline_stage) {
    const corePayload = {};
    if (payload.pipeline_stage) corePayload.pipeline_stage = payload.pipeline_stage;
    ({ error } = await supabase.from(TABLE).update(corePayload).in("id", ids));
  }

  if (error) {
    showBoardMessage(`Error: ${error.message}`);
    return;
  }

  $("salesBulkAction").value = "";
  await refreshAll();
}

async function refreshAll() {
  await Promise.all([
    loadMetrics(),
    loadBoard(),
    loadTable(),
    loadLeadSources(),
    loadTeamPerformance(),
    loadTasks()
  ]);
}

function bindEvents() {
  $("salesAddLeadBtn")?.addEventListener("click", () => openLeadModal());
  $("salesLeadForm")?.addEventListener("submit", saveLead);
  $("salesLogoutBtn")?.addEventListener("click", async () => {
    await supabase?.auth.signOut();
    window.location.href = "login.html";
  });

  document.addEventListener("click", async (event) => {
    if (event.target.closest("[data-close-sales-modal]")) closeLeadModal();

    const editButton = event.target.closest("[data-edit-lead-id]");
    if (editButton) {
      await editLeadById(editButton.dataset.editLeadId);
    }
  });

  $("salesSearchInput")?.addEventListener("input", debounce((event) => {
    state.search = event.target.value;
    state.page = 0;
    refreshAll();
  }));

  $("salesPipelineFilter")?.addEventListener("change", (event) => {
    state.pipelineFilter = event.target.value;
    setText("salesFilterCount", state.pipelineFilter ? "1" : "0");
    loadBoard();
  });

  $("salesSortSelect")?.addEventListener("change", (event) => {
    state.sort = event.target.value;
    refreshAll();
  });

  $("salesBulkAction")?.addEventListener("change", runBulkAction);

  document.querySelectorAll("[data-sales-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll("[data-sales-tab]").forEach((tab) => tab.classList.remove("active"));
      button.classList.add("active");
      state.tab = button.dataset.salesTab;
      state.page = 0;
      loadTable();
    });
  });

  $("salesPrevPage")?.addEventListener("click", () => {
    if (state.page > 0) {
      state.page -= 1;
      loadTable();
    }
  });

  $("salesNextPage")?.addEventListener("click", () => {
    state.page += 1;
    loadTable();
  });

  $("salesSelectAll")?.addEventListener("change", (event) => {
    state.selectedIds.clear();
    document.querySelectorAll("[data-select-lead-id]").forEach((checkbox) => {
      checkbox.checked = event.target.checked;
      if (checkbox.checked) state.selectedIds.add(checkbox.dataset.selectLeadId);
    });
  });

  $("salesLeadRows")?.addEventListener("change", (event) => {
    const checkbox = event.target.closest("[data-select-lead-id]");
    if (!checkbox) return;
    if (checkbox.checked) {
      state.selectedIds.add(checkbox.dataset.selectLeadId);
    } else {
      state.selectedIds.delete(checkbox.dataset.selectLeadId);
    }
  });

  document.addEventListener("dragstart", (event) => {
    const card = event.target.closest("[data-lead-id]");
    if (!card) return;
    event.dataTransfer.setData("text/plain", card.dataset.leadId);
  });

  document.addEventListener("dragover", (event) => {
    if (event.target.closest("[data-drop-stage]")) event.preventDefault();
  });

  document.addEventListener("drop", async (event) => {
    const dropzone = event.target.closest("[data-drop-stage]");
    if (!dropzone) return;
    event.preventDefault();
    const id = event.dataTransfer.getData("text/plain");
    await updateLeadStage(id, dropzone.dataset.dropStage);
  });
}

bindEvents();

if (await requireSalesAccess()) {
  await refreshAll();
}
