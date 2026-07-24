import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const env = window.__ENV || {};
const supabase = env.SUPABASE_URL && env.SUPABASE_ANON_KEY
  ? createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY)
  : null;

const state = {
  people: [],
  search: "",
  team: "all",
  status: "active",
  loading: false,
  saving: false
};

const sources = [
  { table: "profiles", select: "*" },
  { table: "contractors", select: "*" }
];

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function token(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function title(value) {
  return String(value || "")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function roleText(row) {
  return [row?.role, row?.team, row?.department, row?.title, row?.account_type, row?.user_type]
    .map(token)
    .filter(Boolean)
    .join("_");
}

function isSales(row) {
  return roleText(row).includes("sales");
}

function isContractor(row, source) {
  const text = roleText(row);
  return source === "contractors"
    || Boolean(row?.contractor_approved)
    || text.includes("contractor")
    || text.includes("vendor")
    || text.includes("cleaner")
    || text.includes("service_provider");
}

function isInactive(row) {
  return ["inactive", "disabled", "archived", "suspended", "rejected", "declined", "deleted"].includes(token(row?.status || row?.approval_status || row?.account_status));
}

function isApproved(row) {
  return Boolean(row?.contractor_approved)
    || token(row?.approval_status) === "approved"
    || ["approved", "enabled", "onboarded"].includes(token(row?.status));
}

function activeStatus(row) {
  return ["active", "approved", "enabled", "onboarded"].includes(token(row?.status || row?.approval_status || row?.account_status));
}

function teamFor(row, source) {
  if (isSales(row)) return "sales";
  if (isContractor(row, source)) return "contractor";
  return "";
}

function visibleStatus(row, team) {
  if (isInactive(row)) return token(row?.status || row?.approval_status) || "inactive";
  if (team === "contractor" && !isApproved(row)) return "pending_approval";
  if (team === "contractor" && isApproved(row)) return "active";
  if (activeStatus(row)) return "active";
  return token(row?.status) && token(row?.status) !== "pending_approval" ? token(row?.status) : "active";
}

function normalizePerson(row, source) {
  const team = teamFor(row, source);
  if (!team) return null;
  const email = row?.email || row?.contact_email || row?.primary_email || "";
  const name = row?.full_name || row?.name || row?.display_name || row?.contractor_name || row?.sales_name || email.split("@")[0] || "Unnamed";
  const id = row?.profile_id || row?.user_id || row?.auth_user_id || row?.id || email || name;
  const service = team === "sales"
    ? row?.title || row?.department || row?.service_type || "Sales Team"
    : Array.isArray(row?.service_types)
      ? row.service_types.filter(Boolean).join(", ")
      : row?.service_type || row?.services || row?.specialties || "Contractor";
  const status = visibleStatus(row, team);
  return {
    key: `${source}:${id}`,
    id: String(id || ""),
    profileId: String(row?.profile_id || (source === "profiles" ? row?.id || "" : "")),
    source,
    sourceLabel: source === "profiles" ? "Registered Account" : "Directory Invite",
    team,
    teamLabel: team === "sales" ? "Sales Team" : "Contractor",
    name: String(name || "Unnamed"),
    email: String(email || ""),
    phone: String(row?.phone || row?.contact_phone || row?.primary_phone || ""),
    company: String(row?.company_name || row?.business_name || row?.company || ""),
    service: String(service || ""),
    location: String(row?.market || row?.region || row?.location || [row?.city, row?.state].filter(Boolean).join(", ") || ""),
    notes: String(row?.notes || row?.bio || ""),
    status,
    approved: team !== "contractor" || isApproved(row),
    raw: row
  };
}

function workspaceMarkup() {
  return `
    <section class="contractor-directory-workspace" data-contractor-directory-page>
      <section class="metric-strip six">
        ${metric("Directory Total", "directoryTotal", "contractors and sales", "blue", "DT")}
        ${metric("Contractors", "contractorTotal", "service network", "green", "CN")}
        ${metric("Sales Team", "salesTotal", "active sales", "purple", "ST")}
        ${metric("Active", "activeTotal", "ready for work", "green", "A")}
        ${metric("Pending", "pendingTotal", "needs approval", "yellow", "PA")}
        ${metric("Inactive", "inactiveTotal", "not active", "red", "IA")}
      </section>
      <section class="directory-layout">
        <div class="suite-stack span-main">
          <section class="table-card contractor-directory-card">
            <div class="suite-toolbar">
              <div class="toolbar-left">
                <input id="contractorSearch" class="inline-search" type="search" placeholder="Search contractors or sales..." autocomplete="off" />
                <label class="suite-field compact-field"><span>Team</span><select id="contractorTeamFilter"><option value="all">All Teams</option><option value="contractor">Contractors</option><option value="sales">Sales Team</option></select></label>
                <label class="suite-field compact-field"><span>Status</span><select id="contractorStatusFilter"><option value="active">Active</option><option value="pending_approval">Pending Approval</option><option value="inactive">Inactive</option><option value="all">All Statuses</option></select></label>
              </div>
              <div class="toolbar-right">
                <button id="contractorRefresh" class="secondary-action" type="button"><span>Refresh</span></button>
                <button id="contractorAdd" class="primary-action" type="button"><span>Add Contractor</span></button>
              </div>
            </div>
            <p id="contractorMessage" class="request-message" aria-live="polite"></p>
            <div class="table-scroll">
              <table class="suite-table">
                <thead><tr><th>Name</th><th>Team</th><th>Company</th><th>Status</th><th>Service / Role</th><th>Location</th><th>Phone</th><th>Source</th><th>Actions</th></tr></thead>
                <tbody id="contractorRows"></tbody>
              </table>
            </div>
            <div id="contractorEmpty" class="empty-state" hidden><strong>No people found</strong><p>Contractors and sales team members from Supabase will appear here.</p></div>
            <div class="table-foot"><span id="contractorCount">Showing 0 people</span><a class="secondary-action" href="property-managers.html"><span>Property Managers</span></a></div>
          </section>
        </div>
      </section>
      <div id="contractorModal" class="property-modal" hidden>
        <div class="property-modal-backdrop" data-modal-close></div>
        <section class="property-modal-panel">
          <div class="property-modal-header"><div><h2 id="contractorModalTitle">Add Contractor</h2><p>Changes save back to Supabase.</p></div><button class="property-modal-close" type="button" data-modal-close>Close</button></div>
          <div id="contractorModalBody"></div>
        </section>
      </div>
    </section>`;
}

function metric(label, id, meta, tone, initials) {
  return `<article class="metric-card ${tone}"><div class="metric-icon-wrap">${esc(initials)}</div><div class="metric-body"><span>${esc(label)}</span><strong id="${esc(id)}">0</strong><small>${esc(meta)}</small></div></article>`;
}

function injectStyles() {
  if (document.getElementById("contractorDirectorySourceStyles")) return;
  const style = document.createElement("style");
  style.id = "contractorDirectorySourceStyles";
  style.textContent = `
    .contractor-directory-workspace{display:grid;gap:14px}.contractor-directory-card .suite-toolbar{padding:14px 16px 0}.contractor-directory-card .request-message{padding:0 16px 8px}.contractor-directory-card td strong,.contractor-directory-card td small{display:block}.contractor-directory-card td small{color:var(--suite-soft);font-size:11px;margin-top:3px}.contractor-file-name-link{color:var(--suite-text);text-decoration:none}.contractor-file-name-link:hover strong{color:var(--suite-green)}.compact-field{min-width:150px}.compact-field select{min-height:36px}.contractor-actions{align-items:center;display:flex;flex-wrap:wrap;gap:6px}.contractor-actions .secondary-action,.contractor-actions .primary-action{min-height:32px;padding:0 10px;white-space:nowrap}.contractor-form .checkbox-field{align-self:center}.contractor-password-note{background:rgba(6,214,160,.1);border:1px solid rgba(6,214,160,.28);border-radius:8px;color:var(--suite-text);font-size:12px;line-height:1.5;margin:0;padding:12px}.contractor-password-message{font-size:12px;margin:0}.contractor-password-message.error{color:#ff5c7a}.contractor-password-message.success{color:var(--suite-green)}@media(max-width:980px){.contractor-directory-card .suite-toolbar,.contractor-directory-card .toolbar-left,.contractor-directory-card .toolbar-right{align-items:stretch;display:grid;grid-template-columns:1fr}}
  `;
  document.head.appendChild(style);
}

function install() {
  injectStyles();
  const title = document.querySelector(".page-heading h1");
  const subtitle = document.querySelector(".page-heading p");
  if (title) title.textContent = "Contractor Directory";
  if (subtitle) subtitle.textContent = "Approve contractors, manage sales team entries, and invite contractor accounts.";
  const content = document.querySelector(".suite-content");
  if (!content) return null;
  content.innerHTML = workspaceMarkup();
  return content.querySelector("[data-contractor-directory-page]");
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function setMessage(text, error = false) {
  const el = document.getElementById("contractorMessage");
  if (!el) return;
  el.textContent = text || "";
  el.classList.toggle("is-error", error);
  el.classList.toggle("error", error);
}

async function loadSource(source) {
  const result = await supabase.from(source.table).select(source.select).limit(1000);
  if (result.error) {
    console.warn(`[contractor-directory] ${source.table} load failed`, result.error);
    return [];
  }
  return (result.data || []).map((row) => normalizePerson(row, source.table)).filter(Boolean);
}

async function loadPeople() {
  if (!supabase || state.loading) return;
  state.loading = true;
  setMessage("Loading contractor directory...");
  try {
    const rows = (await Promise.all(sources.map(loadSource))).flat();
    const unique = new Map();
    rows.forEach((person) => {
      const key = person.email.toLowerCase() || person.key;
      const existing = unique.get(key);
      if (!existing || person.source === "profiles") unique.set(key, person);
    });
    state.people = Array.from(unique.values()).sort((a, b) => a.name.localeCompare(b.name));
    render();
    setMessage(`${state.people.length} directory ${state.people.length === 1 ? "entry" : "entries"} synced from Supabase.`);
  } catch (error) {
    console.warn("[contractor-directory] load failed", error);
    setMessage("Unable to load contractor directory: " + (error?.message || "Unknown error"), true);
  } finally {
    state.loading = false;
  }
}

function filteredPeople() {
  const term = state.search.trim().toLowerCase();
  return state.people.filter((person) => {
    if (state.team !== "all" && person.team !== state.team) return false;
    if (state.status !== "all" && person.status !== state.status) return false;
    if (!term) return true;
    return [person.name, person.email, person.phone, person.company, person.service, person.location, person.teamLabel]
      .some((value) => String(value || "").toLowerCase().includes(term));
  });
}

function badge(value) {
  return `<span class="status-badge status-${esc(token(value).replace(/_/g, "-"))}">${esc(title(value || "active"))}</span>`;
}

function renderMetrics() {
  setText("directoryTotal", state.people.length.toLocaleString());
  setText("contractorTotal", state.people.filter((p) => p.team === "contractor").length.toLocaleString());
  setText("salesTotal", state.people.filter((p) => p.team === "sales").length.toLocaleString());
  setText("activeTotal", state.people.filter((p) => p.status === "active").length.toLocaleString());
  setText("pendingTotal", state.people.filter((p) => p.status === "pending_approval").length.toLocaleString());
  setText("inactiveTotal", state.people.filter((p) => ["inactive", "disabled", "suspended"].includes(p.status)).length.toLocaleString());
}

function renderRows() {
  const rows = filteredPeople();
  const body = document.getElementById("contractorRows");
  const empty = document.getElementById("contractorEmpty");
  if (!body) return;
  body.innerHTML = rows.map((person) => {
    const approve = person.team === "contractor" && !person.approved
      ? `<button class="primary-action" type="button" data-approve="${esc(person.key)}"><span>Approve</span></button>`
      : "";
    const fileLink = person.team === "contractor"
      ? `<a class="secondary-action" href="${esc(contractorFileUrl(person))}"><span>File</span></a>`
      : "";
    const resetPassword = person.team === "contractor" && (person.profileId || person.email)
      ? `<button class="secondary-action" type="button" data-reset-password="${esc(person.key)}"><span>Reset Password</span></button>`
      : "";
    const nameCell = person.team === "contractor"
      ? `<a class="contractor-file-name-link" href="${esc(contractorFileUrl(person))}"><strong>${esc(person.name)}</strong><small>${esc(person.email || "No email")}</small></a>`
      : `<strong>${esc(person.name)}</strong><small>${esc(person.email || "No email")}</small>`;
    return `<tr>
      <td>${nameCell}</td>
      <td>${badge(person.teamLabel)}</td><td>${esc(person.company || "-")}</td><td>${badge(person.status)}</td>
      <td>${esc(person.service || "-")}</td><td>${esc(person.location || "-")}</td><td>${esc(person.phone || "-")}</td><td>${esc(person.sourceLabel)}</td>
      <td><div class="contractor-actions">${fileLink}${approve}${resetPassword}<button class="secondary-action" type="button" data-edit="${esc(person.key)}"><span>Edit</span></button></div></td>
    </tr>`;
  }).join("");
  if (empty) empty.hidden = Boolean(rows.length);
  setText("contractorCount", `Showing ${rows.length.toLocaleString()} of ${state.people.length.toLocaleString()} people`);
}

function contractorFileUrl(person) {
  const params = new URLSearchParams();
  if (person.profileId) params.set("profileId", person.profileId);
  if (person.id) params.set("id", person.id);
  if (person.source) params.set("source", person.source);
  if (person.email) params.set("email", person.email);
  return `contractor-file.html?${params.toString()}`;
}

function render() {
  renderMetrics();
  renderRows();
}

function field(id, label, type, value = "", extra = "") {
  return `<label class="suite-field"><span>${esc(label)}</span><input id="${esc(id)}" type="${esc(type)}" value="${esc(value)}" ${extra} /></label>`;
}

function selectField(id, label, options, value) {
  return `<label class="suite-field"><span>${esc(label)}</span><select id="${esc(id)}">${options.map(([key, text]) => `<option value="${esc(key)}" ${key === value ? "selected" : ""}>${esc(text)}</option>`).join("")}</select></label>`;
}

function formMarkup(person = null) {
  const team = person?.team || "contractor";
  const status = person?.status || "active";
  const approved = person ? person.approved : team === "contractor";
  return `<form id="contractorForm" class="lead-form contractor-form" data-source="${esc(person?.source || "")}" data-id="${esc(person?.id || "")}" data-profile-id="${esc(person?.profileId || "")}">
    <div class="form-grid">
      ${field("contractorName", "Name", "text", person?.name || "", "required")}
      ${field("contractorEmail", "Email", "email", person?.email || "")}
      ${field("contractorPhone", "Phone", "tel", person?.phone || "")}
      ${selectField("contractorTeam", "Team", [["contractor", "Contractor"], ["sales", "Sales Team"]], team)}
      ${selectField("contractorStatus", "Status", [["active", "Active"], ["pending_approval", "Pending Approval"], ["inactive", "Inactive"], ["suspended", "Suspended"]], status)}
      ${field("contractorCompany", "Company", "text", person?.company || "")}
      ${field("contractorService", team === "sales" ? "Sales Role" : "Service Types", "text", person?.service || "")}
      ${field("contractorLocation", "Location / Market", "text", person?.location || "")}
      <label class="suite-field wide"><span>Notes</span><textarea id="contractorNotes" rows="3">${esc(person?.notes || "")}</textarea></label>
      <label class="checkbox-field wide"><input id="contractorApproved" type="checkbox" ${approved ? "checked" : ""} /> <span>Approved / auto approve on signup</span></label>
    </div>
    <div class="lead-form-actions"><button class="secondary-action" type="button" data-modal-close><span>Cancel</span></button><button id="contractorSave" class="primary-action" type="submit"><span>Save to Supabase</span></button></div>
  </form>`;
}

function passwordFormMarkup(person) {
  const profileId = person?.profileId || (person?.source === "profiles" ? person?.id || "" : "");
  return `<form id="contractorPasswordForm" class="lead-form contractor-form" data-profile-id="${esc(profileId)}" data-email="${esc(person?.email || "")}" data-name="${esc(person?.name || "this contractor")}">
    <div class="form-grid">
      <label class="suite-field wide"><span>Contractor</span><input type="text" value="${esc([person?.name, person?.email].filter(Boolean).join(" - ") || "Contractor")}" disabled /></label>
      ${field("contractorTempPassword", "Temporary Password", "password", "", "autocomplete=\"new-password\" minlength=\"8\" required")}
      ${field("contractorTempPasswordConfirm", "Confirm Temporary Password", "password", "", "autocomplete=\"new-password\" minlength=\"8\" required")}
      <p class="contractor-password-note wide">The contractor can sign in with this temporary password one time. On their next login, Turnly will require them to choose a new password before the portal opens.</p>
      <p id="contractorPasswordMessage" class="contractor-password-message wide" aria-live="polite"></p>
    </div>
    <div class="lead-form-actions"><button class="secondary-action" type="button" data-modal-close><span>Cancel</span></button><button id="contractorPasswordSave" class="primary-action" type="submit"><span>Reset Password</span></button></div>
  </form>`;
}

function openModal(person = null) {
  const modal = document.getElementById("contractorModal");
  const body = document.getElementById("contractorModalBody");
  const heading = document.getElementById("contractorModalTitle");
  if (!modal || !body) return;
  if (heading) heading.textContent = person ? `Edit ${person.name}` : "Add Contractor";
  body.innerHTML = formMarkup(person);
  modal.hidden = false;
  document.getElementById("contractorName")?.focus();
}

function openPasswordModal(person) {
  const modal = document.getElementById("contractorModal");
  const body = document.getElementById("contractorModalBody");
  const heading = document.getElementById("contractorModalTitle");
  if (!modal || !body || !person) return;
  if (heading) heading.textContent = `Reset password for ${person.name}`;
  body.innerHTML = passwordFormMarkup(person);
  modal.hidden = false;
  document.getElementById("contractorTempPassword")?.focus();
}

function closeModal() {
  const modal = document.getElementById("contractorModal");
  if (modal) modal.hidden = true;
}

function value(id) {
  return (document.getElementById(id)?.value || "").trim();
}

function setPasswordFormMessage(text, error = false) {
  const el = document.getElementById("contractorPasswordMessage");
  if (!el) return;
  el.textContent = text || "";
  el.classList.toggle("error", error);
  el.classList.toggle("success", Boolean(text) && !error);
}

function formPayload(table) {
  const team = value("contractorTeam") || "contractor";
  const approved = team === "contractor" && Boolean(document.getElementById("contractorApproved")?.checked);
  const status = approved && value("contractorStatus") === "pending_approval" ? "active" : value("contractorStatus") || "active";
  const services = value("contractorService");
  const base = {
    full_name: value("contractorName"),
    name: value("contractorName"),
    email: value("contractorEmail"),
    phone: value("contractorPhone"),
    role: team === "sales" ? "sales" : "contractor",
    team,
    status,
    contractor_approved: approved,
    approval_status: team === "contractor" ? approved ? "approved" : "pending" : "approved",
    company_name: value("contractorCompany"),
    business_name: value("contractorCompany"),
    service_type: services,
    service_types: services ? services.split(",").map((item) => item.trim()).filter(Boolean) : [],
    title: team === "sales" ? services : "",
    department: team === "sales" ? "Sales" : "",
    market: value("contractorLocation"),
    region: value("contractorLocation"),
    location: value("contractorLocation"),
    notes: value("contractorNotes"),
    invited_by_admin: approved,
    invited_at: approved ? new Date().toISOString() : null,
    contractor_approved_at: approved ? new Date().toISOString() : null
  };
  if (table === "profiles") {
    return {
      full_name: base.full_name,
      email: base.email,
      phone: base.phone,
      role: team === "sales" ? "sales_team" : "contractor",
      team,
      status: base.status,
      contractor_approved: base.contractor_approved,
      approval_status: base.approval_status,
      company_name: base.company_name,
      service_types: base.service_types,
      service_type: base.service_type,
      market: base.market,
      region: base.region,
      location: base.location,
      notes: base.notes,
      department: base.department,
      title: base.title,
      invited_by_admin: base.invited_by_admin,
      invited_at: base.invited_at,
      contractor_approved_at: base.contractor_approved_at
    };
  }
  return base;
}

function missingColumn(error) {
  const msg = String(error?.message || "");
  return msg.match(/Could not find the '([^']+)' column/)?.[1] || msg.match(/column "([^"]+)"/)?.[1] || "";
}

async function writeFallback(table, payload, id = "") {
  const next = { ...payload };
  for (let i = 0; i < 14; i += 1) {
    const query = id ? supabase.from(table).update(next).eq("id", id) : supabase.from(table).insert(next);
    const result = await query.select("*").maybeSingle();
    if (!result.error) return result;
    const missing = missingColumn(result.error);
    if (missing && missing in next && Object.keys(next).length > 2) {
      delete next[missing];
      continue;
    }
    return result;
  }
  return { data: null, error: new Error(`Unable to save ${table}.`) };
}

async function syncInvite(payload, profileId = "") {
  const email = String(payload.email || "").trim().toLowerCase();
  if (!email || payload.team !== "contractor") return { error: null };
  const { data: userData } = await supabase.auth.getUser();
  const invite = {
    email,
    role: "contractor",
    status: profileId ? "accepted" : "pending_signup",
    auto_approve: Boolean(payload.contractor_approved),
    invited_by: userData?.user?.id || null,
    accepted_by: profileId || null,
    accepted_at: profileId ? new Date().toISOString() : null,
    metadata: { full_name: payload.full_name || payload.name || "", phone: payload.phone || "", company_name: payload.company_name || "", service_type: payload.service_type || "", market: payload.market || "" }
  };
  const existing = await supabase.from("contractor_invites").select("id").ilike("email", email).maybeSingle();
  if (existing.error) return existing;
  if (existing.data?.id) return supabase.from("contractor_invites").update(invite).eq("id", existing.data.id).select("*").maybeSingle();
  return supabase.from("contractor_invites").insert(invite).select("*").maybeSingle();
}

async function saveContractor(event) {
  event.preventDefault();
  if (!supabase || state.saving) return;
  state.saving = true;
  const form = event.target;
  const source = form.dataset.source || "";
  const id = form.dataset.id || "";
  const profileId = form.dataset.profileId || "";
  const table = source || "contractors";
  const result = await writeFallback(table, formPayload(table), id);
  if (result.error) {
    state.saving = false;
    setMessage("Unable to save contractor: " + result.error.message, true);
    return;
  }
  const invite = await syncInvite(formPayload("contractors"), table === "profiles" ? id : profileId || result.data?.profile_id || "");
  state.saving = false;
  if (invite.error) setMessage("Contractor saved, but invite sync failed: " + invite.error.message, true);
  closeModal();
  await loadPeople();
}

async function approvePerson(person) {
  if (!person || state.saving) return;
  state.saving = true;
  setMessage(`Approving ${person.name}...`);
  const now = new Date().toISOString();
  const payload = { status: "active", contractor_approved: true, approval_status: "approved", invited_by_admin: true, invited_at: now, contractor_approved_at: now };
  const result = await writeFallback(person.source, payload, person.id);
  if (!result.error && person.profileId && person.source !== "profiles") {
    await writeFallback("profiles", payload, person.profileId);
  }
  if (result.error) {
    state.saving = false;
    setMessage("Unable to approve contractor: " + result.error.message, true);
    return;
  }
  await syncInvite({ ...person.raw, email: person.email, full_name: person.name, name: person.name, phone: person.phone, team: "contractor", contractor_approved: true, company_name: person.company, service_type: person.service, market: person.location }, person.profileId || (person.source === "profiles" ? person.id : ""));
  state.saving = false;
  await loadPeople();
  setMessage(`${person.name} is approved and available for assignments.`);
}

async function resetContractorPassword(event) {
  event.preventDefault();
  if (!supabase || state.saving) return;
  const form = event.target;
  const password = value("contractorTempPassword");
  const confirmPassword = value("contractorTempPasswordConfirm");
  const contractorName = form.dataset.name || "This contractor";

  if (password.length < 8) {
    setPasswordFormMessage("Password must be at least 8 characters.", true);
    return;
  }
  if (password !== confirmPassword) {
    setPasswordFormMessage("Passwords do not match.", true);
    return;
  }

  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData?.session?.access_token || "";
  if (!accessToken) {
    setPasswordFormMessage("Your admin session expired. Log in again, then retry.", true);
    return;
  }

  state.saving = true;
  setPasswordFormMessage(`Resetting ${contractorName}'s password...`);

  try {
    const response = await fetch("/api/admin-reset-contractor-password", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        contractorUserId: form.dataset.profileId || "",
        email: form.dataset.email || "",
        password
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Unable to reset contractor password.");

    closeModal();
    await loadPeople();
    setMessage(`${contractorName}'s password was reset. They will be prompted to change it on their next login.`);
  } catch (error) {
    setPasswordFormMessage(error?.message || "Unable to reset contractor password.", true);
  } finally {
    state.saving = false;
  }
}

function bind(root) {
  root.addEventListener("input", (event) => {
    if (event.target?.id !== "contractorSearch") return;
    state.search = event.target.value || "";
    renderRows();
  });
  root.addEventListener("change", (event) => {
    if (event.target?.id === "contractorTeamFilter") state.team = event.target.value || "all";
    if (event.target?.id === "contractorStatusFilter") state.status = event.target.value || "active";
    if (event.target?.id === "contractorTeam") {
      const label = document.getElementById("contractorService")?.closest(".suite-field")?.querySelector("span");
      if (label) label.textContent = event.target.value === "sales" ? "Sales Role" : "Service Types";
    }
    renderRows();
  });
  root.addEventListener("click", (event) => {
    if (event.target.closest("#contractorAdd")) return openModal();
    if (event.target.closest("#contractorRefresh")) return void loadPeople();
    if (event.target.closest("[data-modal-close]")) return closeModal();
    const edit = event.target.closest("[data-edit]");
    if (edit) return openModal(state.people.find((person) => person.key === edit.dataset.edit));
    const approve = event.target.closest("[data-approve]");
    if (approve) return void approvePerson(state.people.find((person) => person.key === approve.dataset.approve));
    const resetPassword = event.target.closest("[data-reset-password]");
    if (resetPassword) return openPasswordModal(state.people.find((person) => person.key === resetPassword.dataset.resetPassword));
  });
  root.addEventListener("submit", (event) => {
    if (event.target?.id === "contractorForm") void saveContractor(event);
    if (event.target?.id === "contractorPasswordForm") void resetContractorPassword(event);
  });
}

function start() {
  const root = install();
  if (!root) return;
  bind(root);
  if (!supabase) {
    setMessage("Supabase config is missing. Add env.js values before using the directory.", true);
    return;
  }
  void loadPeople();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start, { once: true });
} else {
  start();
}
