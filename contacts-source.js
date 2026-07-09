import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const env = window.__ENV || {};
const supabase = env.SUPABASE_URL && env.SUPABASE_ANON_KEY
  ? createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY)
  : null;

const contractorSources = ["profiles", "contractors", "contractor_profiles"];
const state = {
  activeView: "property",
  search: "",
  propertyContacts: [],
  contractorContacts: [],
  loading: false
};

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

function digits(value) {
  return String(value || "").replace(/\D+/g, "");
}

function firstValue(row, keys) {
  for (const key of keys) {
    const value = row?.[key];
    if (Array.isArray(value) && value.length) return value.filter(Boolean).join(", ");
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
  }
  return "";
}

function splitList(value) {
  if (Array.isArray(value)) return value.map((item) => String(item || "").trim()).filter(Boolean);
  return String(value || "")
    .replace(/[{}\"]/g, "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function contactKey(contact) {
  return contact.email.toLowerCase()
    || digits(contact.phone)
    || `${normalizeToken(contact.name)}:${normalizeToken(contact.role)}:${normalizeToken(contact.client || contact.company)}`;
}

function addContact(map, contact) {
  if (!contact?.name && !contact?.email && !contact?.phone) return;
  const key = contactKey(contact);
  const existing = map.get(key);
  if (!existing) {
    map.set(key, {
      ...contact,
      clients: contact.client ? [contact.client] : [],
      companies: contact.company ? [contact.company] : []
    });
    return;
  }
  existing.email = existing.email || contact.email || "";
  existing.phone = existing.phone || contact.phone || "";
  existing.role = existing.role || contact.role || "";
  existing.status = existing.status === "active" ? existing.status : contact.status || existing.status;
  if (contact.client && !existing.clients.includes(contact.client)) existing.clients.push(contact.client);
  if (contact.company && !existing.companies.includes(contact.company)) existing.companies.push(contact.company);
}

function summaryList(values, empty = "-") {
  const list = [...new Set((values || []).filter(Boolean))];
  if (!list.length) return empty;
  if (list.length <= 2) return list.join(", ");
  return `${list.slice(0, 2).join(", ")} +${list.length - 2}`;
}

function clientName(row) {
  return firstValue(row, ["company_name", "property_name", "name", "client_name"]) || "Client";
}

function profileName(row) {
  return firstValue(row, ["full_name", "name", "display_name", "email"]);
}

function profileEmail(row) {
  return firstValue(row, ["email", "contact_email", "primary_email"]);
}

function profilePhone(row) {
  return firstValue(row, ["phone", "contact_phone", "primary_phone", "mobile_phone"]);
}

async function fetchRows(table) {
  if (!supabase) return [];
  const { data, error } = await supabase.from(table).select("*").limit(1000);
  if (error) {
    console.warn(`[contacts] Unable to load ${table}`, error);
    return [];
  }
  return data || [];
}

function indexProfiles(profiles) {
  const byId = new Map();
  const byName = new Map();
  profiles.forEach((profile) => {
    const id = String(profile?.id || profile?.profile_id || profile?.user_id || "");
    const name = profileName(profile);
    if (id) byId.set(id, profile);
    if (name) byName.set(normalizeToken(name), profile);
  });
  return { byId, byName };
}

async function loadPropertyContacts() {
  const [clients, profiles] = await Promise.all([
    fetchRows("clients"),
    fetchRows("profiles")
  ]);
  const profileIndex = indexProfiles(profiles);
  const contacts = new Map();

  clients.forEach((client) => {
    const clientLabel = clientName(client);
    const primaryName = firstValue(client, ["primary_contact_name", "contact_name", "property_manager_name"]);
    const primaryEmail = firstValue(client, ["primary_contact_email", "contact_email", "email"]);
    const primaryPhone = firstValue(client, ["primary_contact_phone", "contact_phone", "phone"]);
    if (primaryName || primaryEmail || primaryPhone) {
      addContact(contacts, {
        source: "client-primary",
        name: primaryName || primaryEmail || primaryPhone,
        email: primaryEmail,
        phone: primaryPhone,
        role: firstValue(client, ["client_type", "service_model"]) || "Property Manager",
        type: "Property Manager",
        client: clientLabel,
        company: clientLabel,
        status: normalizeToken(client.status) || "active"
      });
    }

    const managerIds = splitList(client.account_manager_ids || client.account_manager_id);
    const managerNames = splitList(client.account_manager_names || client.account_manager_name);
    const managerCount = Math.max(managerIds.length, managerNames.length);
    for (let index = 0; index < managerCount; index += 1) {
      const id = managerIds[index] || "";
      const savedName = managerNames[index] || managerNames[0] || "";
      const profile = profileIndex.byId.get(id) || profileIndex.byName.get(normalizeToken(savedName)) || null;
      const name = profileName(profile) || savedName;
      if (!name) continue;
      addContact(contacts, {
        source: "client-account-manager",
        name,
        email: profileEmail(profile),
        phone: profilePhone(profile),
        role: "Account Manager",
        type: "Property Manager",
        client: clientLabel,
        company: firstValue(profile, ["company_name", "business_name", "company"]) || clientLabel,
        status: normalizeToken(profile?.status || client.status) || "active"
      });
    }
  });

  return Array.from(contacts.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function statusToken(row) {
  return normalizeToken(row?.status || row?.contractor_status || row?.approval_status || row?.account_status || "");
}

function roleToken(row) {
  return normalizeToken(row?.role || row?.team || row?.account_type || row?.user_type || row?.profile_type || row?.type || "");
}

function isInactive(row) {
  return ["inactive", "disabled", "archived", "suspended", "rejected", "declined", "deleted"].includes(statusToken(row));
}

function isActive(row) {
  const status = statusToken(row);
  return Boolean(row?.contractor_approved)
    || ["active", "approved", "available", "enabled", "onboarded"].includes(status);
}

function isApprovedContractor(row) {
  return Boolean(row?.contractor_approved)
    || normalizeToken(row?.approval_status) === "approved"
    || ["approved", "enabled", "onboarded"].includes(statusToken(row));
}

function teamKey(row, sourceTable) {
  const tokens = [
    roleToken(row),
    normalizeToken(row?.department),
    normalizeToken(row?.team_name),
    normalizeToken(row?.title)
  ].join("_");
  if (tokens.includes("sales") || tokens.includes("account_executive") || tokens.includes("business_development")) return "sales";
  if (sourceTable !== "profiles") return "contractor";
  if (row?.contractor_approved || tokens.includes("contractor") || tokens.includes("vendor") || tokens.includes("cleaner") || tokens.includes("service_provider")) return "contractor";
  return "";
}

function contractorStatus(row, sourceTable) {
  if (isInactive(row)) return statusToken(row) || "inactive";
  if (teamKey(row, sourceTable) === "contractor" && !isApprovedContractor(row)) return "pending_approval";
  return isActive(row) ? "active" : statusToken(row) || "onboarding";
}

function contractorService(row) {
  const value = row?.service_types || row?.services || row?.service_type || row?.specialties || row?.trade || row?.role || "";
  if (Array.isArray(value)) return value.filter(Boolean).join(", ");
  return String(value || "Contractor");
}

function normalizeContractor(row, sourceTable) {
  const email = profileEmail(row);
  const name = firstValue(row, ["full_name", "name", "display_name", "contractor_name", "company_contact"]) || email.split("@")[0] || "Unnamed Contractor";
  return {
    source: sourceTable,
    name,
    email,
    phone: profilePhone(row),
    role: contractorService(row),
    type: "Contractor",
    company: firstValue(row, ["company_name", "business_name", "company"]) || "-",
    client: "",
    status: contractorStatus(row, sourceTable)
  };
}

async function loadContractorContacts() {
  const rows = (await Promise.all(contractorSources.map(async (table) => {
    const sourceRows = await fetchRows(table);
    return sourceRows
      .filter((row) => teamKey(row, table) === "contractor")
      .filter((row) => !isInactive(row))
      .filter((row) => isActive(row) || isApprovedContractor(row))
      .map((row) => normalizeContractor(row, table));
  }))).flat();

  const contacts = new Map();
  rows.forEach((contact) => addContact(contacts, contact));
  return Array.from(contacts.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function metricCard(label, value, meta, tone = "blue") {
  return `
    <article class="metric-card ${escapeHtml(tone)}">
      <div class="metric-icon-wrap">${escapeHtml(label.slice(0, 2).toUpperCase())}</div>
      <div class="metric-body">
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(value)}</strong>
        <small>${escapeHtml(meta)}</small>
      </div>
    </article>
  `;
}

function workspaceMarkup() {
  return `
    <section class="contacts-live-workspace" data-contacts-live>
      <section class="metric-strip four">
        ${metricCard("Managers", String(state.propertyContacts.length), "from client directory", "green")}
        ${metricCard("Contractors", String(state.contractorContacts.length), "active and approved", "blue")}
        ${metricCard("Emails", String(allContacts().filter((item) => item.email).length), "available", "purple")}
        ${metricCard("Phones", String(allContacts().filter((item) => item.phone).length), "available", "yellow")}
      </section>
      <section class="table-card contacts-live-card">
        <div class="suite-toolbar">
          <div class="toolbar-left">
            <div class="suite-tabs contact-view-tabs" role="tablist">
              <button class="suite-tab ${state.activeView === "property" ? "active" : ""}" type="button" data-contact-view="property">Property Manager Contacts</button>
              <button class="suite-tab ${state.activeView === "contractor" ? "active" : ""}" type="button" data-contact-view="contractor">Contractor Contacts</button>
            </div>
          </div>
          <div class="toolbar-right">
            <label class="inline-search contacts-live-search">
              <input id="contactsLiveSearch" type="search" placeholder="Search name, email, phone..." value="${escapeHtml(state.search)}" autocomplete="off" />
            </label>
            <button id="contactsRefreshBtn" class="secondary-action" type="button"><span>Refresh</span></button>
          </div>
        </div>
        <p id="contactsLiveMessage" class="request-message" aria-live="polite"></p>
        <div class="table-scroll">
          <table class="suite-table contacts-live-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Client / Company</th>
                <th>Role</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Type</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody id="contactsLiveRows"></tbody>
          </table>
        </div>
        <div id="contactsLiveEmpty" class="empty-state" hidden>
          <div class="empty-icon">CT</div>
          <strong>No contacts found</strong>
          <p>Contacts from Supabase will appear here once they match this view.</p>
          <div class="empty-lines"><span></span><span></span></div>
        </div>
        <div class="table-foot"><span id="contactsLiveCount">Showing 0 contacts</span></div>
      </section>
    </section>
  `;
}

function allContacts() {
  return [...state.propertyContacts, ...state.contractorContacts];
}

function activeContacts() {
  const rows = state.activeView === "contractor" ? state.contractorContacts : state.propertyContacts;
  const term = state.search.trim().toLowerCase();
  if (!term) return rows;
  return rows.filter((contact) => [
    contact.name,
    contact.email,
    contact.phone,
    contact.role,
    contact.type,
    summaryList(contact.clients),
    summaryList(contact.companies)
  ].some((value) => String(value || "").toLowerCase().includes(term)));
}

function linkOrDash(value, hrefPrefix) {
  const text = String(value || "").trim();
  if (!text) return "-";
  return `<a class="contact-link" href="${hrefPrefix}${encodeURIComponent(text)}">${escapeHtml(text)}</a>`;
}

function statusBadge(status) {
  const token = normalizeToken(status || "active").replace(/_/g, "-");
  return `<span class="status-badge status-${escapeHtml(token)}">${escapeHtml(titleCase(status || "active"))}</span>`;
}

function renderRows() {
  const body = document.getElementById("contactsLiveRows");
  const empty = document.getElementById("contactsLiveEmpty");
  if (!body) return;
  const rows = activeContacts();
  body.innerHTML = rows.map((contact) => {
    const clientSummary = contact.clients?.length ? summaryList(contact.clients) : summaryList(contact.companies);
    const actions = [
      contact.email ? `<a class="secondary-action" href="mailto:${escapeHtml(contact.email)}"><span>Email</span></a>` : "",
      contact.phone ? `<a class="secondary-action" href="tel:${escapeHtml(digits(contact.phone) || contact.phone)}"><span>Call</span></a>` : ""
    ].filter(Boolean).join("");
    return `
      <tr>
        <td><strong>${escapeHtml(contact.name || "-")}</strong><small>${escapeHtml(contact.email || contact.phone || "")}</small></td>
        <td>${escapeHtml(clientSummary)}</td>
        <td>${escapeHtml(contact.role || "-")}</td>
        <td>${linkOrDash(contact.email, "mailto:")}</td>
        <td>${linkOrDash(contact.phone, "tel:")}</td>
        <td>${escapeHtml(contact.type || "-")}</td>
        <td>${statusBadge(contact.status)}</td>
        <td><div class="contact-quick-actions">${actions || "<span>-</span>"}</div></td>
      </tr>
    `;
  }).join("");
  if (empty) empty.hidden = Boolean(rows.length);
  const count = document.getElementById("contactsLiveCount");
  if (count) count.textContent = `Showing ${rows.length.toLocaleString()} ${state.activeView === "contractor" ? "contractor" : "property manager"} contacts`;
}

function setMessage(text, isError = false) {
  const message = document.getElementById("contactsLiveMessage");
  if (!message) return;
  message.textContent = text || "";
  message.classList.toggle("error", Boolean(isError));
  message.classList.toggle("is-error", Boolean(isError));
}

function renderWorkspace() {
  const host = document.querySelector("[data-contacts-page]") || document.querySelector(".suite-content");
  if (!host) return false;
  host.innerHTML = workspaceMarkup();
  renderRows();
  bindEvents();
  return true;
}

function bindEvents() {
  const root = document.querySelector("[data-contacts-live]");
  if (!root || root.dataset.contactsBound === "true") return;
  root.dataset.contactsBound = "true";
  root.addEventListener("click", (event) => {
    const viewButton = event.target.closest("[data-contact-view]");
    if (viewButton) {
      state.activeView = viewButton.dataset.contactView || "property";
      renderWorkspace();
      return;
    }
    if (event.target.closest("#contactsRefreshBtn")) {
      void loadContacts();
    }
  });
  root.addEventListener("input", (event) => {
    if (event.target?.id !== "contactsLiveSearch") return;
    state.search = event.target.value || "";
    renderRows();
  });
}

function injectStyles() {
  if (document.getElementById("contactsSourceStyles")) return;
  const style = document.createElement("style");
  style.id = "contactsSourceStyles";
  style.textContent = `
    .contacts-live-workspace {
      display: grid;
      gap: 14px;
    }
    .contacts-live-card .suite-toolbar {
      padding: 14px 16px 0;
    }
    .contacts-live-card .request-message {
      padding: 0 16px 8px;
    }
    .contacts-live-search input {
      min-width: 260px;
    }
    .contacts-live-table td strong,
    .contacts-live-table td small {
      display: block;
    }
    .contacts-live-table td small {
      color: var(--suite-soft);
      font-size: 11px;
      margin-top: 3px;
    }
    .contact-link {
      color: var(--suite-text);
      text-decoration: none;
    }
    .contact-link:hover {
      color: var(--suite-mint);
    }
    .contact-quick-actions {
      align-items: center;
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .contact-quick-actions .secondary-action {
      min-height: 30px;
      padding: 0 10px;
    }
    @media (max-width: 920px) {
      .contacts-live-card .suite-toolbar,
      .contacts-live-card .toolbar-left,
      .contacts-live-card .toolbar-right {
        align-items: stretch;
        display: grid;
        grid-template-columns: 1fr;
      }
      .contacts-live-search input {
        min-width: 0;
        width: 100%;
      }
    }
  `;
  document.head.appendChild(style);
}

function preparePage() {
  const title = document.querySelector(".page-heading h1");
  const subtitle = document.querySelector(".page-heading p");
  if (title) title.textContent = "Contacts";
  if (subtitle) subtitle.textContent = "Quick contact info for property managers and active contractors.";
  Array.from(document.querySelectorAll(".suite-topbar .primary-action"))
    .filter((button) => /add contact/i.test(button.textContent || ""))
    .forEach((button) => {
      button.hidden = true;
    });
}

async function loadContacts() {
  if (!supabase || state.loading) {
    if (!supabase) setMessage("Supabase config is missing.", true);
    return;
  }
  state.loading = true;
  setMessage("Loading contacts from Supabase...");
  try {
    const [propertyContacts, contractorContacts] = await Promise.all([
      loadPropertyContacts(),
      loadContractorContacts()
    ]);
    state.propertyContacts = propertyContacts;
    state.contractorContacts = contractorContacts;
    renderWorkspace();
    setMessage(`${allContacts().length.toLocaleString()} contacts synced from Supabase.`);
  } catch (error) {
    console.warn("[contacts] Load failed", error);
    setMessage("Unable to load contacts: " + (error?.message || "Unknown error"), true);
  } finally {
    state.loading = false;
  }
}

function start() {
  if (document.body?.dataset?.adminPage !== "contacts") return;
  injectStyles();
  preparePage();
  renderWorkspace();
  void loadContacts();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start, { once: true });
} else {
  start();
}
