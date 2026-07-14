import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const env = window.__ENV || {};
const supabase = env.SUPABASE_URL && env.SUPABASE_ANON_KEY
  ? createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY)
  : null;

const START_RADIUS_MILES = 5;
const EARTH_RADIUS_MILES = 3958.7613;
const geocodeCache = new Map();

let activeAssignment = null;
let activeUser = null;
let activeSite = null;
let activePosition = null;
let activeDistance = null;

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

function formatMiles(value) {
  const miles = toNumber(value);
  if (miles === null) return "Unknown";
  return miles < 0.1 ? "Under 0.1 mi" : `${miles.toFixed(1)} mi`;
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

function getMapEmbedUrl(assignment) {
  const query = getMapQuery(assignment);
  return query ? `https://www.google.com/maps?q=${encodeURIComponent(query)}&output=embed&t=k` : "";
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

    const coordinates = {
      latitude: Number(first.lat),
      longitude: Number(first.lon)
    };
    geocodeCache.set(cacheKey, coordinates);
    return coordinates;
  } catch {
    return null;
  }
}

async function resolveSite(assignment) {
  const saved = getAssignmentCoordinates(assignment);
  if (saved) return saved;
  return geocodeAddress(assignment?.address);
}

async function getUser() {
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

async function getChecklistItems(assignment) {
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

function showMessage(text) {
  const target = document.getElementById("claimMessage") || document.getElementById("message");
  if (target) target.textContent = text;
}

function injectStyles() {
  if (document.getElementById("turnlyJobFlowStyles")) return;
  document.head.insertAdjacentHTML("beforeend", `
    <style id="turnlyJobFlowStyles">
      .turnly-flow-modal {
        align-items: center;
        background: rgba(3, 9, 17, 0.76);
        backdrop-filter: blur(12px);
        display: flex;
        inset: 0;
        justify-content: center;
        padding: 18px;
        position: fixed;
        z-index: 200;
      }
      .turnly-flow-modal[hidden] { display: none; }
      .turnly-flow-panel {
        background: linear-gradient(145deg, rgba(30, 45, 64, 0.98), rgba(13, 25, 40, 0.98));
        border: 1px solid rgba(144, 164, 183, 0.22);
        border-radius: 12px;
        box-shadow: 0 30px 90px rgba(0, 0, 0, 0.45);
        display: grid;
        gap: 16px;
        max-height: calc(100vh - 36px);
        overflow: auto;
        padding: 18px;
        width: min(100%, 760px);
      }
      .turnly-flow-header,
      .turnly-flow-actions,
      .turnly-flow-location-row {
        align-items: center;
        display: flex;
        gap: 12px;
        justify-content: space-between;
      }
      .turnly-flow-header h2 { margin: 4px 0 0; }
      .turnly-flow-kicker {
        color: var(--admin-green, #1fe28a);
        font-size: 12px;
        font-weight: 900;
        letter-spacing: .08em;
        margin: 0;
        text-transform: uppercase;
      }
      .turnly-flow-map {
        aspect-ratio: 16 / 9;
        background: rgba(8, 19, 33, 0.82);
        border: 1px solid rgba(144, 164, 183, 0.18);
        border-radius: 8px;
        overflow: hidden;
      }
      .turnly-flow-map iframe {
        border: 0;
        display: block;
        height: 100%;
        width: 100%;
      }
      .turnly-flow-summary {
        display: grid;
        gap: 10px;
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      .turnly-flow-summary div,
      .turnly-flow-gate,
      .turnly-checklist-item,
      .turnly-active-panel {
        background: rgba(255, 255, 255, 0.045);
        border: 1px solid rgba(255, 255, 255, 0.055);
        border-radius: 8px;
        padding: 13px;
      }
      .turnly-flow-summary span {
        color: var(--admin-muted, #9aaabc);
        display: block;
        font-size: 12px;
        font-weight: 800;
        margin-bottom: 5px;
        text-transform: uppercase;
      }
      .turnly-flow-summary strong { display: block; overflow-wrap: anywhere; }
      .turnly-flow-gate {
        align-items: center;
        display: grid;
        gap: 14px;
        grid-template-columns: minmax(0, 1fr) auto;
      }
      .turnly-flow-gate h3 { margin: 4px 0 6px; }
      .turnly-flow-gate p { margin: 0; }
      .turnly-flow-gate.locked { border-color: rgba(255, 91, 102, 0.36); }
      .turnly-flow-gate.locked h3,
      .turnly-flow-gate.locked .turnly-distance-pill { color: var(--admin-red, #ff5b66); }
      .turnly-flow-gate.unlocked {
        background: rgba(31, 226, 138, 0.08);
        border-color: rgba(31, 226, 138, 0.4);
      }
      .turnly-flow-gate.unlocked h3,
      .turnly-flow-gate.unlocked .turnly-distance-pill { color: var(--admin-green, #1fe28a); }
      .turnly-distance-pill,
      .turnly-media-pill {
        border: 1px solid currentColor;
        border-radius: 999px;
        display: inline-flex;
        font-size: 12px;
        font-weight: 900;
        line-height: 1;
        padding: 8px 10px;
        text-transform: capitalize;
        white-space: nowrap;
      }
      .turnly-flow-note,
      .turnly-checklist-note {
        color: #d8e2ee;
        display: grid;
        font-weight: 800;
        gap: 8px;
      }
      .turnly-checklist-form {
        display: grid;
        gap: 12px;
      }
      .turnly-checklist-task {
        align-items: start;
        color: #d8e2ee;
        display: grid;
        gap: 12px;
        grid-template-columns: 22px minmax(0, 1fr) auto;
      }
      .turnly-checklist-task input {
        height: 20px;
        min-height: 20px;
        width: 20px;
      }
      .turnly-checklist-task strong,
      .turnly-checklist-task small { display: block; }
      .turnly-checklist-task small {
        color: var(--admin-muted, #9aaabc);
        font-size: 12px;
        margin-top: 4px;
      }
      .turnly-checklist-item p { margin: 0; }
      .turnly-media-pill {
        color: var(--admin-blue, #32aaff);
        justify-self: end;
      }
      .turnly-active-panel {
        display: grid;
        gap: 12px;
        margin: 10px 0 18px;
      }
      .turnly-active-panel h3 { margin-bottom: 0; }
      .turnly-active-panel button { justify-self: start; }
      @media (max-width: 760px) {
        .turnly-flow-modal {
          align-items: flex-end;
          padding: 0;
        }
        .turnly-flow-panel {
          border-radius: 14px 14px 0 0;
          max-height: 92vh;
          width: 100%;
        }
        .turnly-flow-header,
        .turnly-flow-actions,
        .turnly-flow-location-row,
        .turnly-flow-gate,
        .turnly-checklist-task,
        .turnly-flow-summary {
          align-items: stretch;
          display: grid;
          grid-template-columns: 1fr;
        }
        .turnly-distance-pill,
        .turnly-media-pill { justify-self: start; }
      }
    </style>
  `);
}

function ensureStartModal() {
  injectStyles();
  let modal = document.getElementById("turnlyStartModal");
  if (modal) return modal;

  document.body.insertAdjacentHTML("beforeend", `
    <div id="turnlyStartModal" class="turnly-flow-modal" role="dialog" aria-modal="true" hidden>
      <div class="turnly-flow-panel">
        <div class="turnly-flow-header">
          <div>
            <p class="turnly-flow-kicker">Start Job</p>
            <h2>Arrive at the job site</h2>
          </div>
          <button type="button" class="secondary-btn small-btn" data-turnly-close-start>Cancel</button>
        </div>
        <div id="turnlyStartMap" class="turnly-flow-map"></div>
        <div id="turnlyStartSummary" class="turnly-flow-summary"></div>
        <div id="turnlyGate" class="turnly-flow-gate locked">
          <div>
            <p class="turnly-flow-kicker">Location Check</p>
            <h3 id="turnlyGateTitle">Checking job-site pin</h3>
            <p id="turnlyGateCopy">You must be within 5 miles of the pinned property before starting.</p>
          </div>
          <span id="turnlyGateDistance" class="turnly-distance-pill">Waiting</span>
        </div>
        <label class="turnly-flow-note">
          Start note
          <textarea id="turnlyStartNotes" rows="3" placeholder="Gate code used, supply issue, site condition, etc."></textarea>
        </label>
        <div class="turnly-flow-location-row">
          <button type="button" class="secondary-btn" id="turnlyRefreshLocation">Refresh Location</button>
          <p id="turnlyLocationStatus">Allow location access to unlock Start Job.</p>
        </div>
        <p id="turnlyStartMessage" class="status-message" aria-live="polite"></p>
        <div class="turnly-flow-actions">
          <button type="button" class="secondary-btn" data-turnly-close-start>Not Yet</button>
          <button type="button" class="primary-btn" id="turnlyConfirmStart" disabled>Start Job</button>
        </div>
      </div>
    </div>
  `);

  modal = document.getElementById("turnlyStartModal");
  modal.querySelectorAll("[data-turnly-close-start]").forEach((button) => {
    button.addEventListener("click", closeStartModal);
  });
  document.getElementById("turnlyRefreshLocation")?.addEventListener("click", captureLocation);
  document.getElementById("turnlyConfirmStart")?.addEventListener("click", confirmStart);
  return modal;
}

function updateGate() {
  const gate = document.getElementById("turnlyGate");
  const title = document.getElementById("turnlyGateTitle");
  const copy = document.getElementById("turnlyGateCopy");
  const distance = document.getElementById("turnlyGateDistance");
  const button = document.getElementById("turnlyConfirmStart");
  if (!gate || !title || !copy || !distance || !button) return;

  gate.classList.remove("locked", "unlocked");
  button.disabled = true;

  if (!activeSite) {
    gate.classList.add("locked");
    title.textContent = "Property location unavailable";
    copy.textContent = "The property address could not be pinned. Ask an admin to correct the address.";
    distance.textContent = "No pin";
    return;
  }

  if (!activePosition) {
    gate.classList.add("locked");
    title.textContent = "Share location to start";
    copy.textContent = `Turnly will unlock Start Job once you are within ${START_RADIUS_MILES} miles.`;
    distance.textContent = `${START_RADIUS_MILES} mi required`;
    return;
  }

  activeDistance = distanceMiles(activePosition, activeSite);
  if (activeDistance === null || activeDistance > START_RADIUS_MILES) {
    gate.classList.add("locked");
    title.textContent = "Too far from the job site";
    copy.textContent = `You are ${formatMiles(activeDistance)} away. You must be within ${START_RADIUS_MILES} miles.`;
    distance.textContent = formatMiles(activeDistance);
    return;
  }

  gate.classList.add("unlocked");
  title.textContent = "You are within range";
  copy.textContent = "Start Job is unlocked. Starting will open the assigned checklist.";
  distance.textContent = formatMiles(activeDistance);
  button.disabled = false;
}

async function captureLocation() {
  const status = document.getElementById("turnlyLocationStatus");
  const button = document.getElementById("turnlyRefreshLocation");

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
    if (status) status.textContent = error?.message || "Location was not shared.";
  } finally {
    if (button) button.disabled = false;
    updateGate();
  }
}

async function openStartModal(assignmentId) {
  const user = await getUser();
  if (!user) return;

  activeUser = user;
  activeAssignment = await fetchAssignment(assignmentId);
  activeSite = null;
  activePosition = null;
  activeDistance = null;

  const modal = ensureStartModal();
  const mapUrl = getMapEmbedUrl(activeAssignment);
  document.getElementById("turnlyStartMap").innerHTML = mapUrl
    ? `<iframe title="Pinned job site map" loading="lazy" referrerpolicy="no-referrer-when-downgrade" src="${mapUrl}"></iframe>`
    : `<div class="turnly-flow-summary"><div><strong>Property address is needed before a map can be shown.</strong></div></div>`;

  const checklistItems = await getChecklistItems(activeAssignment);
  document.getElementById("turnlyStartSummary").innerHTML = `
    <div><span>Property</span><strong>${escapeHtml(activeAssignment.property_name || activeAssignment.title || "Assignment")}</strong></div>
    <div><span>Address</span><strong>${escapeHtml(activeAssignment.address || "Address not set")}</strong></div>
    <div><span>Service</span><strong>${escapeHtml(activeAssignment.service_type || "Service not set")}</strong></div>
    <div><span>Checklist</span><strong>${checklistItems.length} item(s) assigned</strong></div>
  `;
  document.getElementById("turnlyStartNotes").value = "";
  document.getElementById("turnlyStartMessage").textContent = "";
  modal.hidden = false;

  activeSite = await resolveSite(activeAssignment);
  updateGate();
  if (activeSite) await captureLocation();
}

function closeStartModal() {
  const modal = document.getElementById("turnlyStartModal");
  if (modal) modal.hidden = true;
}

async function confirmStart() {
  const message = document.getElementById("turnlyStartMessage");
  const button = document.getElementById("turnlyConfirmStart");
  if (!activeAssignment || !activeUser || !activeSite || !activePosition || activeDistance > START_RADIUS_MILES) {
    if (message) message.textContent = "You must be within 5 miles of the job site to start this job.";
    return;
  }

  if (button) button.disabled = true;
  if (message) message.textContent = "Starting job...";

  const now = new Date().toISOString();
  const payload = {
    status: "in_progress",
    started_at: now,
    started_by: activeUser.id,
    start_latitude: activePosition.latitude,
    start_longitude: activePosition.longitude,
    start_location_accuracy: activePosition.accuracy,
    start_notes: document.getElementById("turnlyStartNotes")?.value.trim() || null,
    site_latitude: activeSite.latitude,
    site_longitude: activeSite.longitude,
    start_distance_miles: Number(activeDistance.toFixed(4))
  };

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
  showMessage("Job started. Complete the checklist to finish the job.");
  await openChecklistModal(data);
}

function ensureChecklistModal() {
  injectStyles();
  let modal = document.getElementById("turnlyChecklistModal");
  if (modal) return modal;

  document.body.insertAdjacentHTML("beforeend", `
    <div id="turnlyChecklistModal" class="turnly-flow-modal" role="dialog" aria-modal="true" hidden>
      <div class="turnly-flow-panel">
        <div class="turnly-flow-header">
          <div>
            <p class="turnly-flow-kicker">Active Job</p>
            <h2>Complete assigned checklist</h2>
          </div>
          <button type="button" class="secondary-btn small-btn" data-turnly-close-checklist>Close</button>
        </div>
        <div id="turnlyChecklistSummary" class="turnly-flow-summary"></div>
        <form id="turnlyChecklistForm" class="turnly-checklist-form"></form>
        <p id="turnlyChecklistMessage" class="status-message" aria-live="polite"></p>
        <div class="turnly-flow-actions">
          <button type="button" class="secondary-btn" data-turnly-close-checklist>Back</button>
          <button type="button" class="primary-btn" id="turnlyCompleteJob">Complete Job</button>
        </div>
      </div>
    </div>
  `);

  modal = document.getElementById("turnlyChecklistModal");
  modal.querySelectorAll("[data-turnly-close-checklist]").forEach((button) => {
    button.addEventListener("click", () => {
      modal.hidden = true;
    });
  });
  document.getElementById("turnlyCompleteJob")?.addEventListener("click", completeChecklist);
  return modal;
}

async function openChecklistModal(assignmentOrId) {
  const user = activeUser || await getUser();
  if (!user) return;

  activeUser = user;
  activeAssignment = typeof assignmentOrId === "string" ? await fetchAssignment(assignmentOrId) : assignmentOrId;
  const checklistItems = await getChecklistItems(activeAssignment);
  const modal = ensureChecklistModal();

  document.getElementById("turnlyChecklistSummary").innerHTML = `
    <div><span>Property</span><strong>${escapeHtml(activeAssignment.property_name || activeAssignment.title || "Assignment")}</strong></div>
    <div><span>Address</span><strong>${escapeHtml(activeAssignment.address || "Address not set")}</strong></div>
    <div><span>Status</span><strong>${escapeHtml(activeAssignment.status || "in progress")}</strong></div>
    <div><span>Checklist</span><strong>${checklistItems.length} item(s)</strong></div>
  `;

  const form = document.getElementById("turnlyChecklistForm");
  const completeButton = document.getElementById("turnlyCompleteJob");
  document.getElementById("turnlyChecklistMessage").textContent = "";

  if (!checklistItems.length) {
    form.innerHTML = `
      <div class="turnly-checklist-item">
        <strong>No checklist assigned</strong>
        <p>This assignment needs a property checklist before it can be completed.</p>
      </div>
    `;
    if (completeButton) completeButton.disabled = true;
  } else {
    form.innerHTML = checklistItems.map((item, index) => {
      const media = item.media_required && item.media_required !== "none"
        ? `<span class="turnly-media-pill">${escapeHtml(String(item.media_required).replace(/_/g, " "))}</span>`
        : "";
      return `
        <section class="turnly-checklist-item">
          <label class="turnly-checklist-task">
            <input type="checkbox" data-turnly-check="${index}" />
            <span>
              <strong>${escapeHtml(item.task || "Untitled task")}</strong>
              <small>${escapeHtml(item.category || "General")}${item.required === false ? " - optional" : " - required"}</small>
            </span>
            ${media}
          </label>
          ${item.notes ? `<p>${escapeHtml(item.notes)}</p>` : ""}
          <label class="turnly-checklist-note">
            Completion note
            <textarea rows="2" data-turnly-note="${index}" placeholder="Notes, blocked areas, supply issues, etc."></textarea>
          </label>
        </section>
      `;
    }).join("");
    if (completeButton) completeButton.disabled = false;
  }

  modal.hidden = false;
}

async function completeChecklist() {
  const message = document.getElementById("turnlyChecklistMessage");
  const button = document.getElementById("turnlyCompleteJob");
  const checklistItems = await getChecklistItems(activeAssignment);

  const responses = checklistItems.map((item, index) => {
    const completed = Boolean(document.querySelector(`[data-turnly-check="${index}"]`)?.checked);
    return {
      category: item.category || "General",
      task: item.task || "Untitled task",
      required: item.required !== false,
      media_required: item.media_required || "none",
      completed,
      note: document.querySelector(`[data-turnly-note="${index}"]`)?.value.trim() || "",
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

  showMessage("Job completed and checklist saved.");
  window.location.reload();
}

async function renderActiveChecklistPanel() {
  if (!supabase || !document.getElementById("myAssignments")) return;
  const user = await getUser();
  if (!user) return;

  const { data } = await supabase
    .from("assignment_blocks")
    .select("id, title, property_name, address")
    .eq("claimed_by", user.id)
    .eq("status", "in_progress")
    .order("started_at", { ascending: false });

  if (!data?.length || document.getElementById("turnlyActiveChecklistPanel")) return;

  const panel = document.createElement("div");
  panel.id = "turnlyActiveChecklistPanel";
  panel.className = "turnly-active-panel";
  panel.innerHTML = `
    <h3>Active checklist</h3>
    <p>Finish required checklist items before completing your job.</p>
    ${data.map((item) => `
      <button type="button" class="primary-btn" data-turnly-open-checklist="${escapeHtml(item.id)}">
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

  const checklistButton = event.target.closest("[data-turnly-open-checklist]");
  if (checklistButton) {
    event.preventDefault();
    event.stopImmediatePropagation();
    await openChecklistModal(checklistButton.dataset.turnlyOpenChecklist);
  }
}, true);

if (supabase) {
  renderActiveChecklistPanel();
  setTimeout(renderActiveChecklistPanel, 1200);
}
