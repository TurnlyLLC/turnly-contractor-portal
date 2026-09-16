import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const widgetId = "website-inquiries-widget";
const env = window.__ENV || {};
const supabase = env.SUPABASE_URL && env.SUPABASE_ANON_KEY
  ? createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY)
  : null;

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function icon(name = "inbox") {
  const paths = {
    inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
    refresh: '<path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M3 21v-5h5"/><path d="M3 12a9 9 0 0 1 15.74-6.26L21 8"/><path d="M21 3v5h-5"/>',
    right: '<path d="m9 18 6-6-6-6"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
    phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.18 4.18 2 2 0 0 1 4.16 2h3a2 2 0 0 1 2 1.72c.12.9.32 1.78.59 2.63a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.45-1.21a2 2 0 0 1 2.11-.45c.85.27 1.73.47 2.63.59A2 2 0 0 1 22 16.92z"/>'
  };
  return `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.inbox}</svg>`;
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function excerpt(value, fallback = "No message captured") {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return fallback;
  return text.length > 150 ? `${text.slice(0, 147)}...` : text;
}

function detailLine(row) {
  return [row.sales_city, row.company_name, row.default_service_type].filter(Boolean).join(" • ") || "Apartment turnover inquiry";
}

function renderShell(grid) {
  const wrapper = document.createElement("section");
  wrapper.id = widgetId;
  wrapper.className = "suite-panel website-inquiries-panel";
  wrapper.innerHTML = `
    <div class="panel-head">
      <div class="panel-title-row">
        <span class="panel-title-icon">${icon("inbox")}</span>
        <div class="panel-title-copy">
          <h2>Website Inquiries</h2>
          <p>Recent quote requests submitted from TurnlyPros.com.</p>
        </div>
      </div>
      <div class="panel-actions">
        <button type="button" class="secondary-action" data-refresh-website-inquiries>${icon("refresh")}<span>Refresh</span></button>
      </div>
    </div>
    <div id="websiteInquiriesMessage" class="request-message" aria-live="polite"></div>
    <div data-website-inquiries-body class="dashboard-list">
      <div class="skeleton-list"><div><span></span><strong></strong><em></em></div><div><span></span><strong></strong><em></em></div></div>
    </div>
    <a class="panel-bottom-link" href="leads.html">Open Leads ${icon("right")}</a>
  `;
  grid.prepend(wrapper);
  return wrapper;
}

function renderRows(container, rows = []) {
  const body = container.querySelector("[data-website-inquiries-body]");
  if (!body) return;

  if (!rows.length) {
    body.innerHTML = `
      <div class="empty-state small-empty-state">
        <strong>No website inquiries yet</strong>
        <p>New quote form submissions will appear here and on Leads.</p>
      </div>
    `;
    return;
  }

  body.innerHTML = rows.map((row) => `
    <article class="dashboard-item-row">
      <div class="dashboard-item-main">
        <div class="dashboard-item-title"><strong>${esc(row.contact_name || row.property_name || "Website inquiry")}</strong></div>
        <div class="dashboard-item-meta">
          <span>${esc(detailLine(row))}</span>
          <span>${esc(formatDate(row.created_at))}</span>
        </div>
        <p>${esc(excerpt(row.lead_notes || row.default_scope))}</p>
        <div class="dashboard-item-meta">
          <span>${icon("mail")} ${esc(row.contact_email || "No email")}</span>
          <span>${icon("phone")} ${esc(row.contact_phone || "No phone")}</span>
        </div>
      </div>
      <a class="dashboard-item-action" href="leads.html" aria-label="Open Leads">${icon("right")}</a>
    </article>
  `).join("");
}

async function getSessionToken() {
  if (!supabase) return "";
  const { data } = await supabase.auth.getSession();
  return data?.session?.access_token || "";
}

async function loadInquiries(container) {
  const body = container.querySelector("[data-website-inquiries-body]");
  const message = container.querySelector("#websiteInquiriesMessage");
  if (!body) return;

  if (!supabase) {
    if (message) message.textContent = "Supabase environment is not loaded.";
    body.innerHTML = "";
    return;
  }

  if (message) message.textContent = "Loading website inquiries...";

  try {
    const token = await getSessionToken();
    if (!token) {
      if (message) message.textContent = "Sign in with an admin account to view website inquiries.";
      body.innerHTML = "";
      return;
    }

    const response = await fetch("/api/website-inquiries?limit=6", {
      headers: { Authorization: `Bearer ${token}` }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.error) throw new Error(payload.error || "Unable to load inquiries.");

    if (message) message.textContent = "";
    renderRows(container, payload.inquiries || []);
  } catch (error) {
    console.error("Unable to load website inquiries", error);
    if (message) message.textContent = `Unable to load website inquiries: ${error.message || "Unknown error"}`;
    body.innerHTML = "";
  }
}

function mountIntoCommandGrid() {
  const grid = document.querySelector("[data-command-grid]");
  if (!grid) return false;

  const existing = document.getElementById(widgetId);
  if (existing) {
    if (existing.parentElement !== grid) grid.prepend(existing);
    return true;
  }

  const container = renderShell(grid);
  container.addEventListener("click", (event) => {
    if (event.target.closest("[data-refresh-website-inquiries]")) loadInquiries(container);
  });
  loadInquiries(container);
  return true;
}

function startMountObserver() {
  if (mountIntoCommandGrid()) return;

  const observer = new MutationObserver(() => {
    if (mountIntoCommandGrid()) observer.disconnect();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  window.setTimeout(() => {
    mountIntoCommandGrid();
  }, 1500);
}

startMountObserver();
window.addEventListener("hashchange", startMountObserver);
window.addEventListener("focus", () => {
  const container = document.getElementById(widgetId);
  if (container) loadInquiries(container);
});
