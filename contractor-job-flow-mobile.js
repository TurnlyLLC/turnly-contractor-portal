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
        border-bottom: 1px solid rgba(255, 255, 255, .08);
        display: grid;
        gap: 14px;
        grid-template-columns: 34px minmax(0, 1fr) auto;
        min-height: 60px;
      }
      .tj-row span {
        color: var(--admin-muted, #9aaabc);
        font-size: 22px;
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
            <div class="tj-stat"><strong>0</strong><span>Attachments</span></div>
            <div class="tj-stat"><strong>0</strong><span>Comments</span></div>
          </div>

          <div class="tj-section">
            <h3>Property</h3>
            <div class="tj-row"><span>!</span><strong>Issues</strong><span>&rsaquo;</span></div>
            <div class="tj-row"><span>H</span><strong>Property details</strong><span>&rsaquo;</span></div>
          </div>

          <div class="tj-section">
            <h3>Task</h3>
            <div class="tj-row"><span>$</span><strong>Costs</strong><span>&rsaquo;</span></div>
            <div class="tj-row"><span>□</span><strong>Supplies</strong><span>&rsaquo;</span></div>
            <div class="tj-row"><span>i</span><strong>Task details</strong><span>&rsaquo;</span></div>
            <div class="tj-row"><span>#</span><strong>Task tags</strong><span>&rsaquo;</span></div>
            <div class="tj-row"><span>=</span><strong>Summary</strong><span>&rsaquo;</span></div>
          </div>
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
  document.getElementById("tjStartNotes").value = "";
  document.getElementById("tjMessage").textContent = "";
  document.getElementById("tjLocation").textContent = "Location is optional. You can start this job now.";
  modal.hidden = false;
  resolveSite(activeAssignment);
}

function closeStartModal() {
  const modal = document.getElementById("turnlyMobileStartModal");
  if (modal) modal.hidden = true;
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
