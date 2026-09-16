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
  return [
    row.sales_city,
    row.company_name,
    row.default_service_type
  ].filter(Boolean).join(" • ") || "Apartment turnover inquiry";
}

function renderShell(target) {
  const wrapper = document.createElement("section");
  wrapper.id = widgetId;
  wrapper.className = "suite-panel";
  wrapper.innerHTML = `
    <div class="suite-panel-heading">
      <div>
        <p class="suite-eyebrow">Website</p>
        <h2>Website Inquiries</h2>
        <p>Recent quote requests submitted from TurnlyPros.com.</p>
      </div>
      <button type="button" class="suite-ghost-button" data-refresh-website-inquiries>Refresh</button>
    </div>
    <div data-website-inquiries-body class="suite-list">
      <p class="suite-muted">Loading website inquiries...</p>
    </div>
  `;
  target.prepend(wrapper);
  return wrapper;
}

function renderRows(container, rows = []) {
  const body = container.querySelector("[data-website-inquiries-body]");
  if (!body) return;

  if (!rows.length) {
    body.innerHTML = `
      <div class="suite-empty-state">
        <strong>No website inquiries yet</strong>
        <span>New quote form submissions will appear here and in Sales Leads.</span>
      </div>
    `;
    return;
  }

  body.innerHTML = rows.map((row) => `
    <article class="suite-list-row">
      <div>
        <strong>${esc(row.contact_name || row.property_name || "Website inquiry")}</strong>
        <small>${esc(detailLine(row))}</small>
        <p>${esc(excerpt(row.lead_notes || row.default_scope))}</p>
      </div>
      <div class="suite-row-meta">
        <span>${esc(formatDate(row.created_at))}</span>
        <a href="sales-leads.html" class="suite-link">Open Sales Leads</a>
      </div>
      <div class="suite-row-meta">
        <span>${esc(row.contact_email || "No email")}</span>
        <span>${esc(row.contact_phone || "No phone")}</span>
      </div>
    </article>
  `).join("");
}

async function loadInquiries(container) {
  const body = container.querySelector("[data-website-inquiries-body]");
  if (!body) return;

  if (!supabase) {
    body.innerHTML = `<p class="suite-muted">Supabase environment is not loaded.</p>`;
    return;
  }

  body.innerHTML = `<p class="suite-muted">Loading website inquiries...</p>`;

  const { data, error } = await supabase
    .from("sales_leads")
    .select("id,property_name,contact_name,contact_email,contact_phone,sales_city,company_name,default_service_type,default_scope,lead_notes,pipeline_stage,created_at")
    .eq("lead_source", "website_contact_form")
    .order("created_at", { ascending: false })
    .limit(6);

  if (error) {
    console.error("Unable to load website inquiries", error);
    body.innerHTML = `<p class="suite-muted">Unable to load website inquiries: ${esc(error.message || "Unknown error")}</p>`;
    return;
  }

  renderRows(container, data || []);
}

function mount() {
  if (document.getElementById(widgetId)) return true;
  const target = document.querySelector("[data-command-grid]") || document.querySelector("main") || document.body;
  if (!target) return false;

  const container = renderShell(target);
  container.addEventListener("click", (event) => {
    if (event.target.closest("[data-refresh-website-inquiries]")) loadInquiries(container);
  });
  loadInquiries(container);
  return true;
}

if (!mount()) {
  document.addEventListener("DOMContentLoaded", mount, { once: true });
  window.addEventListener("load", mount, { once: true });
}
