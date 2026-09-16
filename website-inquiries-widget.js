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
  if (!value) return "New inquiry";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "New inquiry";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function iconMarkup() {
  return '<span class="panel-title-icon"><svg class="suite-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"></path></svg></span>';
}

function skeletonRows(count = 3) {
  return `<div class="skeleton-list">${Array.from({ length: count }, () => "<div><span></span><strong></strong><em></em></div>").join("")}</div>`;
}

function emptyState(message) {
  return `
    <div class="empty-state">
      <h3>${esc(message)}</h3>
    </div>
  `;
}

function statusBadge(status = "new") {
  const label = String(status || "new").replace(/[_-]+/g, " ");
  return `<span class="status-badge">${esc(label)}</span>`;
}

function inquiryRow(row) {
  const title = row.name || row.email || "Website inquiry";
  const details = [row.city, row.facility_type, row.service_interest].filter(Boolean).join(" - ");
  const contact = [row.email, row.phone].filter(Boolean).join(" - ");
  return `
    <article class="dashboard-item-row">
      <div class="dashboard-item-main">
        <div class="dashboard-item-title"><strong>${esc(title)}</strong></div>
        ${details ? `<p>${esc(details)}</p>` : ""}
        ${row.message ? `<p>${esc(row.message).slice(0, 180)}</p>` : ""}
        <div class="dashboard-item-meta">
          <span>${esc(contact || formatDate(row.created_at))}</span>
          ${statusBadge(row.status)}
        </div>
      </div>
      <a class="dashboard-item-action" href="leads.html" aria-label="Open sales leads">›</a>
    </article>
  `;
}

function renderShell(grid) {
  if (document.getElementById(widgetId)) return document.getElementById(widgetId);
  const section = document.createElement("section");
  section.className = "suite-panel";
  section.id = widgetId;
  section.innerHTML = `
    <div class="panel-head">
      <div class="panel-title-row">
        ${iconMarkup()}
        <div class="panel-title-copy">
          <h2>Website Inquiries</h2>
        </div>
      </div>
      <div class="panel-actions">
        <button class="secondary-action" type="button" data-website-inquiries-refresh><span>Refresh</span></button>
      </div>
    </div>
    <div id="websiteInquiriesMessage" class="request-message" aria-live="polite">Syncing...</div>
    <div id="websiteInquiriesList" class="dashboard-list">${skeletonRows(3)}</div>
    <a class="panel-bottom-link" href="leads.html">Open Sales Leads</a>
  `;
  grid.prepend(section);
  section.querySelector("[data-website-inquiries-refresh]")?.addEventListener("click", loadInquiries);
  return section;
}

async function loadInquiries() {
  const message = document.getElementById("websiteInquiriesMessage");
  const list = document.getElementById("websiteInquiriesList");
  if (!message || !list) return;

  if (!supabase) {
    message.textContent = "Supabase config is missing.";
    list.innerHTML = emptyState("Website inquiries unavailable");
    return;
  }

  message.textContent = "Syncing...";
  list.innerHTML = skeletonRows(3);

  const { data, error } = await supabase
    .from("website_inquiries")
    .select("id,name,email,phone,city,facility_type,service_interest,message,status,created_at")
    .order("created_at", { ascending: false })
    .limit(6);

  if (error) {
    console.warn("[website-inquiries-widget] load failed", error);
    message.textContent = "Website inquiries are ready once the Supabase migration is applied.";
    list.innerHTML = emptyState("No website inquiries");
    return;
  }

  const rows = data || [];
  message.textContent = rows.length
    ? `${rows.length} recent website ${rows.length === 1 ? "inquiry" : "inquiries"}`
    : "Synced with Supabase. No website inquiries yet.";
  list.innerHTML = rows.length ? rows.map(inquiryRow).join("") : emptyState("No website inquiries");
}

function mountWhenReady() {
  const grid = document.querySelector("[data-command-grid]");
  if (!grid) {
    window.setTimeout(mountWhenReady, 150);
    return;
  }
  renderShell(grid);
  void loadInquiries();
}

mountWhenReady();