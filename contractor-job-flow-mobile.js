import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const env = window.__ENV || {};
const supabase = env.SUPABASE_URL && env.SUPABASE_ANON_KEY
  ? createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY)
  : null;

const EARTH_RADIUS_MILES = 3958.7613;
const geocodeCache = new Map();

let activeAssignment = null;
let activeUser = null;
let activeSite = null;
let activePosition = null;
let activeChecklistItems = [];

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function toNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function isCoordinate(latitude, longitude) {
  const lat = toNumber(latitude);
  const lng = toNumber(longitude);
  return lat !== null && lng !== null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

function distanceMiles(pointA, pointB) {
  const lat1 = toNumber(pointA?.latitude);
  const lon1 = toNumber(pointA?.longitude);
  const lat2 = toNumber(pointB?.latitude);
  const lon2 = toNumber(pointB?.longitude);
  if (!isCoordinate(lat1, lon1) || !isCoordinate(lat2, lon2)) return null;

  const rad = (degrees) => degrees * Math.PI / 180;
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) *
    Math.sin(dLon / 2) ** 2;

  return EARTH_RADIUS_MILES * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getAssignmentCoordinates(assignment) {
  if (isCoordinate(assignment?.site_latitude, assignment?.site_longitude)) {
    return {
      latitude: Number(assignment.site_latitude),
      longitude: Number(assignment.site_longitude)
    };
  }
  return null;
}

function getMapQuery(assignment) {
  const coordinates = getAssignmentCoordinates(assignment);
  if (coordinates) return `${coordinates.latitude},${coordinates.longitude}`;
  return assignment?.address || assignment?.property_name || assignment?.title || "";
}

function mapUrl(assignment, embed = true) {
  const query = getMapQuery(assignment);
  if (!query) return "";
  const encoded = encodeURIComponent(query);
  return embed
    ? `https://www.google.com/maps?q=${encoded}&output=embed`
    : `https://www.google.com/maps/search/?api=1&query=${encoded}`;
}

function dateLabel(value) {
  if (!value) return "Not scheduled";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function dueLabel(assignment) {
  return dateLabel(
    assignment?.due_date ||
    assignment?.scheduled_date ||
    assignment?.service_date ||
    assignment?.start_window ||
    assignment?.start_time ||
    assignment?.starts_at ||
    assignment?.created_at
  );
}

function checklistTitle(assignment) {
  const service = assignment?.service_type || assignment?.title || "Turnly Standard Commercial";
  return /checklist/i.test(service) ? service : `${service} Checklist`;
}

function description(assignment) {
  return assignment?.scope ||
    assignment?.description ||
    assignment?.special_instructions ||
    assignment?.notes ||
    "Complete the assigned checklist for this property before finishing the job.";
}

function formatDateTime(value) {
  if (!value) return "Not scheduled";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function formatMoney(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return "Not listed";
  return number.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2
  });
}

function formatStatus(value) {
  return String(value || "Not set").replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function metadataValue(assignment, keys) {
  const metadata = assignment?.metadata && typeof assignment.metadata === "object" ? assignment.metadata : {};
  for (const key of keys) {
    const value = assignment?.[key] ?? metadata[key];
    if (Array.isArray(value) && value.length) return value.join(", ");
    if (value !== null && value !== undefined && String(value).trim()) return String(value);
  }
  return "";
}

function detailGrid(rows) {
  return `
    <div class="tj-detail-grid">
      ${rows.map(([label, value]) => `
        <div>
          <span>${escapeHtml(label)}</span>
          <strong>${escapeHtml(value || "Not listed")}</strong>
        </div>
      `).join("")}
    </div>
  `;
}

function detailNote(label, value, fallback = "Not listed") {
  return `
    <div class="tj-detail-note">
      <span>${escapeHtml(label)}</span>
      <p>${escapeHtml(value || fallback)}</p>
    </div>
  `;
}

function detailTags(tags) {
  const cleanTags = tags
    .map((tag) => String(tag || "").trim())
    .filter(Boolean);
  return cleanTags.length
    ? `<div class="tj-tag-list">${cleanTags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div>`
    : detailNote("Tags", "", "No tags have been added to this task.");
}

function startDetailContent(tabKey) {
  const assignment = activeAssignment || {};
  const checklistCount = activeChecklistItems.length;
  const issueText = metadataValue(assignment, [
    "issue_notes",
    "issues",
    "damage_notes",
    "blocked_areas",
    "access_issue",
    "property_issue"
  ]);
  const unit = metadataValue(assignment, ["unit_name", "unit_number", "property_unit_name", "unit"]);
  const customerCharge = metadataValue(assignment, ["customer_charge", "client_charge"]);
  const materialCost = metadataValue(assignment, ["material_cost", "supplies_cost", "expense_amount"]);
  const attachmentCount = getDetailCount(assignment, ["attachments", "files", "photos", "videos"]);
  const commentCount = getDetailCount(assignment, ["comments", "notes_thread", "messages"]);

  if (tabKey === "issues") {
    return `
      ${detailGrid([
        ["Current Status", formatStatus(assignment.status)],
        ["Priority", formatStatus(assignment.priority || "normal")],
        ["Blocked Areas", metadataValue(assignment, ["blocked_areas"]) || "None logged"],
        ["Attachments", String(attachmentCount)]
      ])}
      ${detailNote("Issue Notes", issueText, "No open property issues have been logged for this assignment.")}
      ${assignment.special_instructions ? detailNote("Special Instructions", assignment.special_instructions) : ""}
    `;
  }

  if (tabKey === "property") {
    return `
      ${detailGrid([
        ["Property", assignment.property_name || assignment.title || "Assignment"],
        ["Unit", unit || "No unit selected"],
        ["Address", assignment.address || "Address not set"],
        ["Map", getMapQuery(assignment) || "No map location available"]
      ])}
      ${detailNote("Access Notes", metadataValue(assignment, ["access_notes", "entry_notes", "gate_code"]), "No access notes are listed.")}
    `;
  }

  if (tabKey === "costs") {
    return `
      ${detailGrid([
        ["Contractor Pay", formatMoney(assignment.pay_amount || assignment.contractor_pay)],
        ["Customer Charge", customerCharge ? formatMoney(customerCharge) : "Not listed"],
        ["Material Cost", materialCost ? formatMoney(materialCost) : "Not listed"],
        ["Service Type", assignment.service_type || "Not listed"]
      ])}
      ${detailNote("Cost Notes", metadataValue(assignment, ["cost_notes", "expense_notes"]), "No added cost notes for this job.")}
    `;
  }

  if (tabKey === "supplies") {
    return `
      ${detailGrid([
        ["Service Type", assignment.service_type || "Not listed"],
        ["Checklist Items", `${checklistCount} assigned`],
        ["Required Media", requiredMediaSummary(activeChecklistItems)],
        ["Supply Status", metadataValue(assignment, ["supply_status"]) || "Review notes"]
      ])}
      ${detailNote("Supplies Notes", assignment.supplies_notes || metadataValue(assignment, ["supplies"]), "No supplies notes are listed for this job.")}
    `;
  }

  if (tabKey === "task") {
    return `
      ${detailGrid([
        ["Service", assignment.service_type || "Not listed"],
        ["Schedule", `${formatDateTime(assignment.start_window)} - ${formatDateTime(assignment.end_window)}`],
        ["Checklist", `${checklistCount} item(s)`],
        ["Status", formatStatus(assignment.status)]
      ])}
      ${detailNote("Scope of Work", assignment.scope || assignment.description, "No scope is listed.")}
      ${detailNote("Special Instructions", assignment.special_instructions, "No special instructions are listed.")}
    `;
  }

  if (tabKey === "tags") {
    return detailTags([
      assignment.priority,
      assignment.status,
      assignment.service_type,
      assignment.assignment_type,
      assignment.recurrence_frequency,
      unit,
      ...(Array.isArray(assignment.tags) ? assignment.tags : []),
      ...(Array.isArray(assignment.metadata?.tags) ? assignment.metadata.tags : [])
    ]);
  }

  return `
    ${detailGrid([
      ["Property", assignment.property_name || assignment.title || "Assignment"],
      ["Window", `${formatDateTime(assignment.start_window)} - ${formatDateTime(assignment.end_window)}`],
      ["Pay", formatMoney(assignment.pay_amount || assignment.contractor_pay)],
      ["Checklist", `${checklistCount} item(s)`],
      ["Attachments", String(attachmentCount)],
      ["Comments", String(commentCount)]
    ])}
    ${detailNote("Summary", description(assignment))}
  `;
}

function requiredMediaSummary(items) {
  const counts = items.reduce((summary, item) => {
    const media = item.media_required && item.media_required !== "none" ? item.media_required : "";
    if (media) summary[media] = (summary[media] || 0) + 1;
    return summary;
  }, {});
  const labels = Object.entries(counts).map(([key, count]) => `${count} ${key.replace(/_/g, " ")}`);
  return labels.join(", ") || "None required";
}

function getDetailCount(assignment, keys) {
  const metadata = assignment?.metadata && typeof assignment.metadata === "object" ? assignment.metadata : {};
  for (const key of keys) {
    const value = assignment?.[key] ?? metadata[key];
    if (Array.isArray(value)) return value.length;
    if (value && typeof value === "object") return Object.keys(value).length;
    if (Number.isFinite(Number(value))) return Number(value);
  }
  return 0;
}

function setStartDetailPanel(tabKey = "summary") {
  const panel = document.getElementById("tjDetailPanel");
  if (!panel || !activeAssignment) return;

  document.querySelectorAll("[data-tj-detail]").forEach((button) => {
    const isActive = button.dataset.tjDetail === tabKey;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-expanded", String(isActive));
  });

  const label = {
    issues: "Issues",
    property: "Property Details",
    costs: "Costs",
    supplies: "Supplies",
    task: "Task Details",
    tags: "Task Tags",
    summary: "Summary"
  }[tabKey] || "Summary";

  panel.innerHTML = `
    <div class="tj-detail-panel-inner">
      <div class="tj-detail-panel-head">
        <span>Details</span>
        <strong>${escapeHtml(label)}</strong>
      </div>
      ${startDetailContent(tabKey)}
    </div>
  `;
}

async function geocodeAddress(address) {
  const trimmed = String(address || "").trim();
  if (!trimmed) return null;
  const cacheKey = trimmed.toLowerCase();
  if (geocodeCache.has(cacheKey)) return geocodeCache.get(cacheKey);

  try {
    const params = new URLSearchParams({ format: "json", limit: "1", q: trimmed });
    const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
      headers: { Accept: "application/json" }
    });
    if (!response.ok) return null;

    const results = await response.json();
    const first = Array.isArray(results) ? results[0] : null;
    if (!isCoordinate(first?.lat, first?.lon)) return null;

    const coordinates = { latitude: Number(first.lat), longitude: Number(first.lon) };
    geocodeCache.set(cacheKey, coordinates);
    return coordinates;
  } catch {
    return null;
  }
}

function resolveSite(assignment) {
  activeSite = getAssignmentCoordinates(assignment);
  if (!activeSite) {
    geocodeAddress(assignment?.address).then((site) => {
      if (site) activeSite = site;
    });
  }
}

async function currentUser() {
  const { data } = await supabase.auth.getUser();
  return data?.user || null;
}

async function fetchAssignment(assignmentId) {
  const { data, error } = await supabase
    .from("assignment_blocks")
    .select("*")
    .eq("id", assignmentId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function checklistItems(assignment) {
  if (Array.isArray(assignment?.property_checklist_items) && assignment.property_checklist_items.length) {
    return assignment.property_checklist_items;
  }
  if (!assignment?.property_id) return [];

  const { data } = await supabase
    .from("properties")
    .select("checklist_items")
    .eq("id", assignment.property_id)
    .maybeSingle();

  return Array.isArray(data?.checklist_items) ? data.checklist_items : [];
}

function showPageMessage(text) {
  const target = document.getElementById("claimMessage") || document.getElementById("message");
  if (target) target.textContent = text;
}

function injectStyles() {
  if (document.getElementById("turnlyMobileJobFlowStyles")) return;
  document.head.insertAdjacentHTML("beforeend", `
    <style id="turnlyMobileJobFlowStyles">
      .tj-modal {
        align-items: center;
        background: rgba(2, 8, 15, .78);
        backdrop-filter: blur(12px);
        display: flex;
        inset: 0;
        justify-content: center;
        padding: 18px;
        position: fixed;
        z-index: 300;
      }
      .tj-modal[hidden] { display: none; }
      .tj-panel {
        background: #0b1724;
        border: 1px solid rgba(144, 164, 183, .22);
        border-radius: 12px;
        box-shadow: 0 30px 90px rgba(0, 0, 0, .45);
        color: #eef5fb;
        max-height: calc(100vh - 36px);
        overflow: auto;
        width: min(100%, 940px);
      }
      .tj-map {
        background: rgba(8, 19, 33, .92);
        min-height: 330px;
        overflow: hidden;
        position: relative;
      }
      .tj-map iframe,
      .tj-map-empty {
        border: 0;
        height: 100%;
        inset: 0;
        position: absolute;
        width: 100%;
      }
      .tj-map-empty {
        align-items: center;
        background: linear-gradient(135deg, rgba(31, 226, 138, .12), rgba(11, 23, 36, .98));
        display: flex;
        justify-content: center;
        padding: 24px;
        text-align: center;
      }
      .tj-map-action {
        align-items: center;
        background: rgba(6, 16, 28, .76);
        border: 1px solid rgba(255, 255, 255, .16);
        border-radius: 999px;
        color: #fff;
        display: inline-flex;
        font-size: 24px;
        font-weight: 900;
        height: 54px;
        justify-content: center;
        position: absolute;
        text-decoration: none;
        top: 20px;
        width: 54px;
        z-index: 2;
      }
      .tj-map-action:hover {
        border-color: rgba(31, 226, 138, .58);
        color: var(--admin-green, #1fe28a);
      }
      .tj-back { left: 20px; }
      .tj-directions { right: 20px; }
      .tj-map-label {
        background: linear-gradient(180deg, rgba(7, 16, 27, 0), rgba(7, 16, 27, .94));
        bottom: 0;
        display: grid;
        gap: 8px;
        left: 0;
        padding: 70px 28px 26px;
        position: absolute;
        right: 0;
        z-index: 1;
      }
      .tj-map-label strong {
        font-size: clamp(24px, 4vw, 38px);
        line-height: 1.05;
        text-transform: uppercase;
      }
      .tj-map-label span {
        color: rgba(255, 255, 255, .82);
        font-size: 18px;
      }
      .tj-details,
      .tj-actions {
        background: linear-gradient(180deg, rgba(19, 33, 49, .98), rgba(11, 23, 36, .98));
        display: grid;
        gap: 22px;
        padding: 26px;
      }
      .tj-title {
        align-items: start;
        display: grid;
        gap: 14px;
        grid-template-columns: minmax(0, 1fr) auto;
      }
      .tj-title h2 {
        color: #fff;
        font-size: clamp(28px, 4vw, 46px);
        line-height: 1.08;
        margin: 0;
      }
      .tj-badge {
        background: rgba(31, 226, 138, .14);
        border: 1px solid rgba(31, 226, 138, .42);
        border-radius: 999px;
        color: var(--admin-green, #1fe28a);
        font-size: 12px;
        font-weight: 900;
        padding: 10px 14px;
        text-transform: uppercase;
        white-space: nowrap;
      }
      .tj-block {
        display: grid;
        gap: 8px;
      }
      .tj-block h3,
      .tj-section h3 {
        color: #fff;
        font-size: 18px;
        margin: 0;
      }
      .tj-block p,
      .tj-location {
        color: var(--admin-muted, #9aaabc);
        line-height: 1.65;
        margin: 0;
      }
      .tj-due {
        color: #d8e2ee;
        font-size: 16px;
        font-weight: 800;
      }
      .tj-stats {
        display: grid;
        gap: 12px;
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }
      .tj-stat {
        background: rgba(255, 255, 255, .045);
        border: 1px solid rgba(255, 255, 255, .08);
        border-radius: 8px;
        display: grid;
        gap: 8px;
        justify-items: center;
        min-height: 112px;
        padding: 16px;
        text-align: center;
      }
      .tj-stat strong {
        color: var(--admin-green, #1fe28a);
        font-size: 22px;
      }
      .tj-stat span {
        color: var(--admin-muted, #9aaabc);
        font-weight: 800;
      }
      .tj-section {
        border-top: 1px solid rgba(255, 255, 255, .08);
        display: grid;
        gap: 8px;
        padding-top: 18px;
      }
      .tj-row {
        align-items: center;
        background: transparent;
        border-bottom: 1px solid rgba(255, 255, 255, .08);
        border-left: 0;
        border-right: 0;
        border-top: 0;
        color: #fff;
        cursor: pointer;
        display: grid;
        font: inherit;
        gap: 12px;
        grid-template-columns: minmax(0, 1fr) auto;
        min-height: 60px;
        padding: 0;
        text-align: left;
        width: 100%;
      }
      .tj-row:hover,
      .tj-row.active {
        color: var(--admin-green, #1fe28a);
      }
      .tj-row span {
        color: var(--admin-muted, #9aaabc);
        font-size: 20px;
      }
      .tj-row.active span {
        color: var(--admin-green, #1fe28a);
      }
      .tj-detail-panel {
        border-top: 1px solid rgba(255, 255, 255, .08);
        padding-top: 14px;
      }
      .tj-detail-panel-inner {
        background: rgba(255, 255, 255, .045);
        border: 1px solid rgba(255, 255, 255, .08);
        border-radius: 8px;
        display: grid;
        gap: 12px;
        padding: 14px;
      }
      .tj-detail-panel-head {
        display: flex;
        gap: 10px;
        justify-content: space-between;
      }
      .tj-detail-panel-head span,
      .tj-detail-grid span,
      .tj-detail-note span {
        color: var(--admin-muted, #9aaabc);
        font-size: 12px;
        font-weight: 900;
        text-transform: uppercase;
      }
      .tj-detail-grid {
        display: grid;
        gap: 10px;
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      .tj-detail-grid div,
      .tj-detail-note {
        background: rgba(5, 14, 24, .56);
        border: 1px solid rgba(255, 255, 255, .055);
        border-radius: 8px;
        padding: 12px;
      }
      .tj-detail-grid strong {
        display: block;
        margin-top: 5px;
      }
      .tj-detail-note p {
        color: #d8e2ee;
        line-height: 1.55;
        margin: 6px 0 0;
      }
      .tj-tag-list {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      .tj-tag-list span {
        background: rgba(31, 226, 138, .13);
        border: 1px solid rgba(31, 226, 138, .3);
        border-radius: 999px;
        color: var(--admin-green, #1fe28a);
        font-size: 12px;
        font-weight: 900;
        padding: 7px 10px;
      }
      .tj-actions {
        background: rgba(7, 16, 27, .96);
        border-top: 1px solid rgba(255, 255, 255, .08);
        gap: 12px;
      }
      .tj-note,
      .tc-note {
        color: #d8e2ee;
        display: grid;
        font-weight: 800;
        gap: 8px;
      }
      .tj-action-row,
      .tc-action-row,
      .tj-location-row {
        align-items: center;
        display: flex;
        gap: 12px;
        justify-content: space-between;
      }
      .tc-panel {
        background: linear-gradient(145deg, rgba(30, 45, 64, .98), rgba(13, 25, 40, .98));
        border: 1px solid rgba(144, 164, 183, .22);
        border-radius: 12px;
        box-shadow: 0 30px 90px rgba(0, 0, 0, .45);
        color: #eef5fb;
        display: grid;
        gap: 16px;
        max-height: calc(100vh - 36px);
        overflow: auto;
        padding: 18px;
        width: min(100%, 760px);
      }
      .tc-header,
      .tc-summary {
        align-items: center;
        display: flex;
        gap: 12px;
        justify-content: space-between;
      }
      .tc-kicker {
        color: var(--admin-green, #1fe28a);
        font-size: 12px;
        font-weight: 900;
        letter-spacing: .08em;
        margin: 0;
        text-transform: uppercase;
      }
      .tc-summary {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      .tc-summary div,
      .tc-item,
      .tj-active-panel {
        background: rgba(255, 255, 255, .045);
        border: 1px solid rgba(255, 255, 255, .055);
        border-radius: 8px;
        padding: 13px;
      }
      .tc-summary span {
        color: var(--admin-muted, #9aaabc);
        display: block;
        font-size: 12px;
        font-weight: 800;
        margin-bottom: 5px;
        text-transform: uppercase;
      }
      .tc-form,
      .tc-item,
      .tj-active-panel {
        display: grid;
        gap: 12px;
      }
      .tc-task {
        align-items: start;
        display: grid;
        gap: 12px;
        grid-template-columns: 22px minmax(0, 1fr) auto;
      }
      .tc-task input {
        height: 20px;
        width: 20px;
      }
      .tc-task small {
        color: var(--admin-muted, #9aaabc);
        display: block;
        font-size: 12px;
        margin-top: 4px;
      }
      .tc-media {
        border: 1px solid currentColor;
        border-radius: 999px;
        color: var(--admin-blue, #32aaff);
        font-size: 12px;
        font-weight: 900;
        padding: 8px 10px;
        text-transform: capitalize;
      }
      .tj-active-panel {
        margin: 10px 0 18px;
      }
      .tj-active-panel button {
        justify-self: start;
      }
      @media (max-width: 760px) {
        .tj-modal {
          align-items: stretch;
          padding: 0;
        }
        .tj-panel,
        .tc-panel {
          border: 0;
          border-radius: 0;
          height: 100vh;
          max-height: 100vh;
          width: 100%;
        }
        .tj-map {
          min-height: 42vh;
        }
        .tj-map-action {
          height: 48px;
          top: 16px;
          width: 48px;
        }
        .tj-back { left: 16px; }
        .tj-directions { right: 16px; }
        .tj-map-label {
          padding: 62px 20px 20px;
        }
        .tj-map-label strong {
          font-size: 28px;
        }
        .tj-title,
        .tj-stats,
        .tj-detail-grid,
        .tc-summary,
        .tc-task,
        .tj-action-row,
        .tc-action-row,
        .tj-location-row {
          align-items: stretch;
          display: grid;
          grid-template-columns: 1fr;
        }
        .tj-badge,
        .tc-media {
          justify-self: start;
        }
        .tj-details,
        .tj-actions {
          padding: 22px 18px;
        }
      }
    </style>
  `);
}

function ensureStartModal() {
  injectStyles();
  let modal = document.getElementById("turnlyMobileStartModal");
  if (modal) return modal;

  document.body.insertAdjacentHTML("beforeend", `
    <div id="turnlyMobileStartModal" class="tj-modal" role="dialog" aria-modal="true" hidden>
      <div class="tj-panel">
        <section class="tj-map" aria-label="Job site map">
          <div id="tjMapFrame"></div>
          <button type="button" class="tj-map-action tj-back" data-tj-close aria-label="Back">&larr;</button>
          <a id="tjDirections" class="tj-map-action tj-directions" href="#" target="_blank" rel="noopener" aria-label="Open directions">&#x21B1;</a>
          <div class="tj-map-label">
            <strong id="tjProperty">Assignment</strong>
            <span id="tjAddress">Address not set</span>
          </div>
        </section>

        <section class="tj-details">
          <div class="tj-title">
            <h2 id="tjTitle">Turnly Checklist</h2>
            <span id="tjBadge" class="tj-badge">Ready</span>
          </div>

          <div class="tj-block">
            <h3>Due on</h3>
            <div id="tjDue" class="tj-due">Not scheduled</div>
          </div>

          <div class="tj-block">
            <h3>Description</h3>
            <p id="tjDescription">Complete the assigned checklist for this property before finishing the job.</p>
          </div>

          <div class="tj-stats">
            <div class="tj-stat"><strong id="tjRequirements">0/0</strong><span>Requirements</span></div>
            <div class="tj-stat"><strong id="tjAttachments">0</strong><span>Attachments</span></div>
            <div class="tj-stat"><strong id="tjComments">0</strong><span>Comments</span></div>
          </div>

          <div class="tj-section">
            <h3>Property</h3>
            <button class="tj-row" type="button" data-tj-detail="issues" aria-expanded="false"><strong>Issues</strong><span>&rsaquo;</span></button>
            <button class="tj-row" type="button" data-tj-detail="property" aria-expanded="false"><strong>Property details</strong><span>&rsaquo;</span></button>
          </div>

          <div class="tj-section">
            <h3>Task</h3>
            <button class="tj-row" type="button" data-tj-detail="costs" aria-expanded="false"><strong>Costs</strong><span>&rsaquo;</span></button>
            <button class="tj-row" type="button" data-tj-detail="supplies" aria-expanded="false"><strong>Supplies</strong><span>&rsaquo;</span></button>
            <button class="tj-row" type="button" data-tj-detail="task" aria-expanded="false"><strong>Task details</strong><span>&rsaquo;</span></button>
            <button class="tj-row" type="button" data-tj-detail="tags" aria-expanded="false"><strong>Task tags</strong><span>&rsaquo;</span></button>
            <button class="tj-row" type="button" data-tj-detail="summary" aria-expanded="false"><strong>Summary</strong><span>&rsaquo;</span></button>
          </div>
          <div id="tjDetailPanel" class="tj-detail-panel" aria-live="polite"></div>
        </section>

        <section class="tj-actions">
          <label class="tj-note">
            Start note
            <textarea id="tjStartNotes" rows="3" placeholder="Gate code used, supply issue, site condition, etc."></textarea>
          </label>
          <div class="tj-location-row">
            <button type="button" class="secondary-btn" id="tjUseLocation">Use Current Location</button>
            <p id="tjLocation" class="tj-location">Location is optional. You can start this job now.</p>
          </div>
          <p id="tjMessage" class="status-message" aria-live="polite"></p>
          <div class="tj-action-row">
            <button type="button" class="secondary-btn" data-tj-close>Not Yet</button>
            <button type="button" class="primary-btn" id="tjStart">Start Job</button>
          </div>
        </section>
      </div>
    </div>
  `);

  modal = document.getElementById("turnlyMobileStartModal");
  modal.querySelectorAll("[data-tj-close]").forEach((button) => {
    button.addEventListener("click", closeStartModal);
  });
  document.getElementById("tjUseLocation")?.addEventListener("click", captureLocation);
  document.getElementById("tjStart")?.addEventListener("click", startJob);
  modal.addEventListener("click", (event) => {
    const detailButton = event.target.closest("[data-tj-detail]");
    if (detailButton && modal.contains(detailButton)) {
      setStartDetailPanel(detailButton.dataset.tjDetail);
    }
  });
  return modal;
}

async function captureLocation() {
  const status = document.getElementById("tjLocation");
  const button = document.getElementById("tjUseLocation");

  if (!navigator.geolocation) {
    if (status) status.textContent = "Location is not available on this device.";
    return;
  }

  if (button) button.disabled = true;
  if (status) status.textContent = "Getting current location...";

  try {
    const position = await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 12000
      });
    });
    activePosition = {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy
    };
    if (status) status.textContent = `Location captured (${Math.round(position.coords.accuracy)}m accuracy).`;
  } catch (error) {
    activePosition = null;
    if (status) status.textContent = error?.message || "Location was not shared. You can still start this job.";
  } finally {
    if (button) button.disabled = false;
  }
}

async function openStartModal(assignmentId) {
  activeUser = await currentUser();
  if (!activeUser) return;

  activeAssignment = await fetchAssignment(assignmentId);
  activePosition = null;
  activeSite = null;
  const items = await checklistItems(activeAssignment);
  activeChecklistItems = items;
  const property = activeAssignment.property_name || activeAssignment.title || "Assignment";
  const address = activeAssignment.address || "Address not set";
  const embed = mapUrl(activeAssignment, true);

  const modal = ensureStartModal();
  document.getElementById("tjMapFrame").innerHTML = embed
    ? `<iframe title="Pinned job site map" loading="lazy" referrerpolicy="no-referrer-when-downgrade" src="${escapeHtml(embed)}"></iframe>`
    : `<div class="tj-map-empty"><strong>Property address is needed before a map can be shown.</strong></div>`;
  document.getElementById("tjDirections").href = mapUrl(activeAssignment, false) || "#";
  document.getElementById("tjProperty").textContent = property;
  document.getElementById("tjAddress").textContent = address;
  document.getElementById("tjTitle").textContent = checklistTitle(activeAssignment);
  document.getElementById("tjBadge").textContent = activeAssignment.priority || activeAssignment.service_type || "Ready";
  document.getElementById("tjDue").textContent = dueLabel(activeAssignment);
  document.getElementById("tjDescription").textContent = description(activeAssignment);
  document.getElementById("tjRequirements").textContent = `${items.length}/${items.length}`;
  document.getElementById("tjAttachments").textContent = String(getDetailCount(activeAssignment, ["attachments", "files", "photos", "videos"]));
  document.getElementById("tjComments").textContent = String(getDetailCount(activeAssignment, ["comments", "notes_thread", "messages"]));
  document.getElementById("tjStartNotes").value = "";
  document.getElementById("tjMessage").textContent = "";
  document.getElementById("tjLocation").textContent = "Location is optional. You can start this job now.";
  setStartDetailPanel("summary");
  modal.hidden = false;
  resolveSite(activeAssignment);
}

function closeStartModal() {
  const modal = document.getElementById("turnlyMobileStartModal");
  if (modal) modal.hidden = true;
  activeChecklistItems = [];
}

async function startJob() {
  const button = document.getElementById("tjStart");
  const message = document.getElementById("tjMessage");
  if (!activeAssignment || !activeUser) {
    if (message) message.textContent = "This job could not be loaded. Try opening it again.";
    return;
  }

  if (button) button.disabled = true;
  if (message) message.textContent = "Starting job...";

  const payload = {
    status: "in_progress",
    started_at: new Date().toISOString(),
    started_by: activeUser.id,
    start_notes: document.getElementById("tjStartNotes")?.value.trim() || null
  };

  if (activePosition) {
    payload.start_latitude = activePosition.latitude;
    payload.start_longitude = activePosition.longitude;
    payload.start_location_accuracy = activePosition.accuracy;
  }
  if (activeSite) {
    payload.site_latitude = activeSite.latitude;
    payload.site_longitude = activeSite.longitude;
  }

  const miles = activePosition && activeSite ? distanceMiles(activePosition, activeSite) : null;
  if (miles !== null) payload.start_distance_miles = Number(miles.toFixed(4));

  const { data, error } = await supabase
    .from("assignment_blocks")
    .update(payload)
    .eq("id", activeAssignment.id)
    .eq("claimed_by", activeUser.id)
    .in("status", ["claimed", "scheduled"])
    .select("*")
    .maybeSingle();

  if (button) button.disabled = false;
  if (error) {
    if (message) message.textContent = "Error: " + error.message;
    return;
  }
  if (!data) {
    if (message) message.textContent = "This job could not be started from its current status.";
    return;
  }

  closeStartModal();
  showPageMessage("Job started. Complete the checklist to finish the job.");
  await openChecklistModal(data);
}

function ensureChecklistModal() {
  injectStyles();
  let modal = document.getElementById("turnlyMobileChecklistModal");
  if (modal) return modal;

  document.body.insertAdjacentHTML("beforeend", `
    <div id="turnlyMobileChecklistModal" class="tj-modal" role="dialog" aria-modal="true" hidden>
      <div class="tc-panel">
        <div class="tc-header">
          <div>
            <p class="tc-kicker">Active Job</p>
            <h2>Complete assigned checklist</h2>
          </div>
          <button type="button" class="secondary-btn small-btn" data-tc-close>Close</button>
        </div>
        <div id="tcSummary" class="tc-summary"></div>
        <form id="tcForm" class="tc-form"></form>
        <p id="tcMessage" class="status-message" aria-live="polite"></p>
        <div class="tc-action-row">
          <button type="button" class="secondary-btn" data-tc-close>Back</button>
          <button type="button" class="primary-btn" id="tcComplete">Complete Job</button>
        </div>
      </div>
    </div>
  `);

  modal = document.getElementById("turnlyMobileChecklistModal");
  modal.querySelectorAll("[data-tc-close]").forEach((button) => {
    button.addEventListener("click", () => {
      modal.hidden = true;
    });
  });
  document.getElementById("tcComplete")?.addEventListener("click", completeJob);
  return modal;
}

async function openChecklistModal(assignmentOrId) {
  activeUser = activeUser || await currentUser();
  if (!activeUser) return;

  activeAssignment = typeof assignmentOrId === "string" ? await fetchAssignment(assignmentOrId) : assignmentOrId;
  const items = await checklistItems(activeAssignment);
  const modal = ensureChecklistModal();

  document.getElementById("tcSummary").innerHTML = `
    <div><span>Property</span><strong>${escapeHtml(activeAssignment.property_name || activeAssignment.title || "Assignment")}</strong></div>
    <div><span>Address</span><strong>${escapeHtml(activeAssignment.address || "Address not set")}</strong></div>
    <div><span>Status</span><strong>${escapeHtml(activeAssignment.status || "in progress")}</strong></div>
    <div><span>Checklist</span><strong>${items.length} item(s)</strong></div>
  `;

  const form = document.getElementById("tcForm");
  const completeButton = document.getElementById("tcComplete");
  document.getElementById("tcMessage").textContent = "";

  if (!items.length) {
    form.innerHTML = `
      <div class="tc-item">
        <strong>No checklist assigned</strong>
        <p>This assignment needs a property checklist before it can be completed.</p>
      </div>
    `;
    if (completeButton) completeButton.disabled = true;
  } else {
    form.innerHTML = items.map((item, index) => {
      const media = item.media_required && item.media_required !== "none"
        ? `<span class="tc-media">${escapeHtml(String(item.media_required).replace(/_/g, " "))}</span>`
        : "";
      return `
        <section class="tc-item">
          <label class="tc-task">
            <input type="checkbox" data-tc-check="${index}" />
            <span>
              <strong>${escapeHtml(item.task || "Untitled task")}</strong>
              <small>${escapeHtml(item.category || "General")}${item.required === false ? " - optional" : " - required"}</small>
            </span>
            ${media}
          </label>
          ${item.notes ? `<p>${escapeHtml(item.notes)}</p>` : ""}
          <label class="tc-note">
            Completion note
            <textarea rows="2" data-tc-note="${index}" placeholder="Notes, blocked areas, supply issues, etc."></textarea>
          </label>
        </section>
      `;
    }).join("");
    if (completeButton) completeButton.disabled = false;
  }

  modal.hidden = false;
}

async function completeJob() {
  const button = document.getElementById("tcComplete");
  const message = document.getElementById("tcMessage");
  const items = await checklistItems(activeAssignment);
  const responses = items.map((item, index) => {
    const completed = Boolean(document.querySelector(`[data-tc-check="${index}"]`)?.checked);
    return {
      category: item.category || "General",
      task: item.task || "Untitled task",
      required: item.required !== false,
      media_required: item.media_required || "none",
      completed,
      note: document.querySelector(`[data-tc-note="${index}"]`)?.value.trim() || "",
      completed_at: completed ? new Date().toISOString() : null
    };
  });

  const missing = responses.filter((item) => item.required && !item.completed);
  if (missing.length) {
    if (message) message.textContent = `Complete ${missing.length} required checklist item(s) before finishing the job.`;
    return;
  }

  if (button) button.disabled = true;
  if (message) message.textContent = "Saving checklist and completing job...";

  const completedAt = new Date().toISOString();
  const { error } = await supabase
    .from("assignment_blocks")
    .update({
      status: "completed",
      checklist_responses: responses,
      checklist_completed_at: completedAt,
      completed_at: completedAt,
      completed_by: activeUser.id
    })
    .eq("id", activeAssignment.id)
    .eq("claimed_by", activeUser.id)
    .eq("status", "in_progress");

  if (button) button.disabled = false;
  if (error) {
    if (message) message.textContent = "Error: " + error.message;
    return;
  }

  showPageMessage("Job completed and checklist saved.");
  window.location.reload();
}

async function renderActiveChecklistPanel() {
  if (!supabase || !document.getElementById("myAssignments")) return;
  const user = await currentUser();
  if (!user) return;

  const { data } = await supabase
    .from("assignment_blocks")
    .select("id, title, property_name")
    .eq("claimed_by", user.id)
    .eq("status", "in_progress")
    .order("started_at", { ascending: false });

  if (!data?.length || document.getElementById("turnlyActiveChecklistPanel")) return;

  const panel = document.createElement("div");
  panel.id = "turnlyActiveChecklistPanel";
  panel.className = "tj-active-panel";
  panel.innerHTML = `
    <h3>Active checklist</h3>
    <p>Finish required checklist items before completing your job.</p>
    ${data.map((item) => `
      <button type="button" class="primary-btn" data-tj-open-checklist="${escapeHtml(item.id)}">
        ${escapeHtml(item.property_name || item.title || "Open Checklist")}
      </button>
    `).join("")}
  `;
  document.getElementById("myAssignments").before(panel);
}

document.addEventListener("click", async (event) => {
  const startButton = event.target.closest("[data-start-assignment-id]");
  if (startButton) {
    event.preventDefault();
    event.stopImmediatePropagation();
    await openStartModal(startButton.dataset.startAssignmentId);
    return;
  }

  const checklistButton = event.target.closest("[data-tj-open-checklist]");
  if (checklistButton) {
    event.preventDefault();
    event.stopImmediatePropagation();
    await openChecklistModal(checklistButton.dataset.tjOpenChecklist);
  }
}, true);

if (supabase) {
  renderActiveChecklistPanel();
  setTimeout(renderActiveChecklistPanel, 1200);
}
