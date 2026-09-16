import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const widgetId = "website-inquiries-widget";
const styleId = "website-inquiries-widget-styles";
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
    phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.18 4.18 2 2 0 0 1 4.16 2h3a2 2 0 0 1 2 1.72c.12.9.32 1.78.59 2.63a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.45-1.21a2 2 0 0 1 2.11-.45c.85.27 1.73.47 2.63.59A2 2 0 0 1 22 16.92z"/>',
    sparkle: '<path d="M12 3l1.65 4.35L18 9l-4.35 1.65L12 15l-1.65-4.35L6 9l4.35-1.65L12 3z"/><path d="M19 14l.9 2.1L22 17l-2.1.9L19 20l-.9-2.1L16 17l2.1-.9L19 14z"/>'
  };
  return `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.inbox}</svg>`;
}

function injectStyles() {
  if (document.getElementById(styleId)) return;
  const style = document.createElement("style");
  style.id = styleId;
  style.textContent = `
    .website-inquiries-card{--wi-bg:radial-gradient(circle at 0 0,rgba(56,189,248,.22),transparent 34%),linear-gradient(145deg,rgba(15,23,42,.98),rgba(15,23,42,.92));--wi-card:rgba(15,23,42,.64);--wi-strong:rgba(30,41,59,.9);--wi-border:rgba(148,163,184,.22);--wi-soft:rgba(148,163,184,.15);--wi-text:#f8fafc;--wi-muted:#a7b5c8;--wi-accent:#38bdf8;--wi-green:#22c55e;background:var(--wi-bg)!important;border:1px solid var(--wi-border)!important;box-shadow:0 24px 55px rgba(2,6,23,.28);color:var(--wi-text);overflow:hidden;position:relative}
    body[data-dashboard-theme="light"] .website-inquiries-card{--wi-bg:radial-gradient(circle at 0 0,rgba(37,99,235,.15),transparent 36%),linear-gradient(150deg,#fff,#f6f9ff);--wi-card:rgba(255,255,255,.84);--wi-strong:#fff;--wi-border:rgba(37,99,235,.16);--wi-soft:rgba(15,23,42,.08);--wi-text:#102033;--wi-muted:#607086;--wi-accent:#2563eb;--wi-green:#16a34a;box-shadow:0 22px 45px rgba(30,64,175,.12)}
    .website-inquiries-card:before{background:linear-gradient(90deg,var(--wi-accent),#8b5cf6,var(--wi-green));content:"";height:4px;inset:0 0 auto;position:absolute}.wi-hero{align-items:flex-start;display:flex;gap:18px;justify-content:space-between;padding:22px 22px 12px}.wi-title{align-items:flex-start;display:flex;gap:14px;min-width:0}.wi-bubble{align-items:center;background:linear-gradient(135deg,rgba(56,189,248,.25),rgba(34,197,94,.16));border:1px solid rgba(125,211,252,.26);border-radius:18px;color:var(--wi-accent);display:inline-flex;flex:0 0 auto;height:46px;justify-content:center;width:46px}.wi-eyebrow{color:var(--wi-accent);font-size:11px;font-weight:900;letter-spacing:.12em;margin:0 0 4px;text-transform:uppercase}.wi-heading h2{color:var(--wi-text);font-size:21px;letter-spacing:-.02em;line-height:1.15;margin:0}.wi-heading p{color:var(--wi-muted);font-size:13px;line-height:1.45;margin:6px 0 0;max-width:48ch}.wi-actions{align-items:center;display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end}.website-inquiries-card .wi-refresh,.wi-open{align-items:center;border-radius:999px;display:inline-flex;font-size:12px;font-weight:800;gap:7px;min-height:34px;padding:8px 12px;text-decoration:none;white-space:nowrap}.wi-open{background:rgba(56,189,248,.14);border:1px solid rgba(56,189,248,.22);color:var(--wi-text)}
    .wi-status{color:var(--wi-muted);font-size:13px;min-height:18px;padding:0 22px 8px}.wi-status:empty{display:none}.wi-list{display:grid;gap:12px;padding:0 18px 18px}.wi-summary{align-items:center;background:rgba(255,255,255,.06);border:1px solid var(--wi-soft);border-radius:18px;color:var(--wi-muted);display:flex;font-size:12px;gap:10px;justify-content:space-between;padding:10px 12px}.wi-summary strong{color:var(--wi-text);font-size:13px}.wi-row{background:var(--wi-card);border:1px solid var(--wi-soft);border-radius:20px;box-shadow:inset 0 1px 0 rgba(255,255,255,.06);display:grid;gap:14px;grid-template-columns:auto 1fr auto;padding:15px;transition:border-color .18s ease,transform .18s ease,background .18s ease}.wi-row:hover{background:var(--wi-strong);border-color:rgba(56,189,248,.34);transform:translateY(-1px)}.wi-avatar{align-items:center;background:linear-gradient(135deg,rgba(56,189,248,.95),rgba(34,197,94,.82));border-radius:16px;color:#031827;display:inline-flex;font-size:13px;font-weight:950;height:42px;justify-content:center;letter-spacing:.02em;width:42px}.wi-main{min-width:0}.wi-title-line{align-items:center;display:flex;flex-wrap:wrap;gap:9px}.wi-title-line strong{color:var(--wi-text);font-size:15px}.wi-pill{align-items:center;background:rgba(34,197,94,.13);border:1px solid rgba(34,197,94,.22);border-radius:999px;color:var(--wi-green);display:inline-flex;font-size:11px;font-weight:850;gap:5px;padding:4px 8px}.wi-meta{color:var(--wi-muted);display:flex;flex-wrap:wrap;font-size:12px;gap:8px;margin-top:6px}.wi-dot:before{color:rgba(148,163,184,.7);content:"•";margin-right:8px}.wi-preview{color:var(--wi-text);font-size:13px;line-height:1.55;margin:10px 0 0;opacity:.92}.wi-contact{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}.wi-chip{align-items:center;background:rgba(148,163,184,.1);border:1px solid var(--wi-soft);border-radius:999px;color:var(--wi-muted);display:inline-flex;font-size:12px;gap:6px;max-width:100%;padding:6px 9px;text-decoration:none}.wi-chip span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.wi-arrow{align-items:center;align-self:center;background:rgba(56,189,248,.12);border:1px solid rgba(56,189,248,.22);border-radius:14px;color:var(--wi-accent);display:inline-flex;height:36px;justify-content:center;width:36px}.wi-empty{align-items:center;background:rgba(255,255,255,.06);border:1px dashed rgba(148,163,184,.28);border-radius:22px;color:var(--wi-muted);display:grid;gap:8px;justify-items:center;min-height:170px;padding:28px 18px;text-align:center}.wi-empty-icon{align-items:center;background:rgba(56,189,248,.13);border:1px solid rgba(56,189,248,.22);border-radius:18px;color:var(--wi-accent);display:inline-flex;height:48px;justify-content:center;width:48px}.wi-empty strong{color:var(--wi-text);font-size:15px}.wi-empty p{margin:0;max-width:36ch}.wi-skeleton{display:grid;gap:12px}.wi-skeleton-card{background:var(--wi-card);border:1px solid var(--wi-soft);border-radius:20px;display:grid;gap:10px;padding:16px}.wi-skeleton-card span,.wi-skeleton-card strong,.wi-skeleton-card em{background:linear-gradient(90deg,rgba(148,163,184,.16),rgba(148,163,184,.3),rgba(148,163,184,.16));border-radius:999px;display:block;height:10px}.wi-skeleton-card strong{height:14px;width:70%}.wi-skeleton-card em{width:48%}
    @media(max-width:720px){.wi-hero{align-items:stretch;flex-direction:column;padding:20px 18px 12px}.wi-actions{justify-content:flex-start}.wi-row{grid-template-columns:auto 1fr}.wi-arrow{grid-column:1/-1;width:100%}.wi-status{padding-inline:18px}.wi-list{padding-inline:14px}}
  `;
  document.head.appendChild(style);
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
  return text.length > 160 ? `${text.slice(0, 157)}...` : text;
}

function initials(row) {
  const source = row.contact_name || row.property_name || "WI";
  const parts = String(source).trim().split(/\s+/).filter(Boolean).slice(0, 2);
  return (parts.map((part) => part[0]).join("") || "WI").toUpperCase();
}

function stageLabel(row) {
  return String(row.pipeline_stage || "new_leads").replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function detailLine(row) {
  return [row.sales_city, row.company_name, row.default_service_type].filter(Boolean).join(" • ") || "Apartment turnover inquiry";
}

function loadingMarkup() {
  return `<div class="wi-skeleton" aria-hidden="true"><div class="wi-skeleton-card"><strong></strong><span></span><em></em></div><div class="wi-skeleton-card"><strong></strong><span></span><em></em></div></div>`;
}

function emptyMarkup(title, copy, iconName = "inbox") {
  return `<div class="wi-empty"><span class="wi-empty-icon">${icon(iconName)}</span><strong>${esc(title)}</strong><p>${esc(copy)}</p></div>`;
}

function renderShell(grid) {
  injectStyles();
  const wrapper = document.createElement("section");
  wrapper.id = widgetId;
  wrapper.className = "suite-panel website-inquiries-panel website-inquiries-card";
  wrapper.innerHTML = `
    <div class="wi-hero">
      <div class="wi-title">
        <span class="wi-bubble">${icon("sparkle")}</span>
        <div class="wi-heading">
          <p class="wi-eyebrow">Quote inbox</p>
          <h2>Website Inquiries</h2>
          <p>Fresh apartment turnover quote requests from TurnlyPros.com, ready for sales follow-up.</p>
        </div>
      </div>
      <div class="wi-actions">
        <button type="button" class="secondary-action wi-refresh" data-refresh-website-inquiries>${icon("refresh")}<span>Refresh</span></button>
        <a class="wi-open" href="leads.html">Open Leads ${icon("right")}</a>
      </div>
    </div>
    <div id="websiteInquiriesMessage" class="wi-status" aria-live="polite"></div>
    <div data-website-inquiries-body class="wi-list">${loadingMarkup()}</div>
  `;
  grid.prepend(wrapper);
  return wrapper;
}

function renderRows(container, rows = []) {
  const body = container.querySelector("[data-website-inquiries-body]");
  if (!body) return;

  if (!rows.length) {
    body.innerHTML = emptyMarkup("No website inquiries yet", "New quote form submissions will appear here automatically and flow into Leads.");
    return;
  }

  body.innerHTML = `
    <div class="wi-summary"><span><strong>${rows.length}</strong> latest website quote request${rows.length === 1 ? "" : "s"}</span><span>Synced to Leads</span></div>
    ${rows.map((row) => `
      <article class="wi-row">
        <div class="wi-avatar">${esc(initials(row))}</div>
        <div class="wi-main">
          <div class="wi-title-line"><strong>${esc(row.contact_name || row.property_name || "Website inquiry")}</strong><span class="wi-pill">${icon("sparkle")} ${esc(stageLabel(row))}</span></div>
          <div class="wi-meta"><span>${esc(detailLine(row))}</span><span class="wi-dot">${esc(formatDate(row.created_at))}</span></div>
          <p class="wi-preview">${esc(excerpt(row.lead_notes || row.default_scope))}</p>
          <div class="wi-contact">
            <a class="wi-chip" href="mailto:${esc(row.contact_email || "")}">${icon("mail")}<span>${esc(row.contact_email || "No email")}</span></a>
            <a class="wi-chip" href="tel:${esc(row.contact_phone || "")}">${icon("phone")}<span>${esc(row.contact_phone || "No phone")}</span></a>
          </div>
        </div>
        <a class="wi-arrow" href="leads.html" aria-label="Open Leads">${icon("right")}</a>
      </article>
    `).join("")}
  `;
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
  body.innerHTML = loadingMarkup();

  try {
    const token = await getSessionToken();
    if (!token) {
      if (message) message.textContent = "Sign in with an admin account to view website inquiries.";
      body.innerHTML = emptyMarkup("Admin sign-in required", "Sign in to the admin portal to view captured quote requests.");
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
    body.innerHTML = emptyMarkup("Could not load inquiries", "Use Refresh to try again, or open Leads to review recent records.", "refresh");
  }
}

function mountIntoCommandGrid() {
  injectStyles();
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
