import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const supabase = createClient(
  window.__ENV.SUPABASE_URL,
  window.__ENV.SUPABASE_ANON_KEY
);

const loginForm = document.getElementById("loginForm");
const logoutBtn = document.getElementById("logoutBtn");
const message = document.getElementById("message");
const claimMessage = document.getElementById("claimMessage");
const isAdminSuiteAssignmentsPage = document.body?.dataset?.adminPage === "assignments";
const assignmentForm = isAdminSuiteAssignmentsPage ? null : document.getElementById("assignmentForm");
const adminAssignments = isAdminSuiteAssignmentsPage ? null : document.getElementById("adminAssignments");
const claimedAdminAssignments = document.getElementById("claimedAdminAssignments");
const contractorDashboard = document.getElementById("contractorDashboard");
const contractorAssignments = document.getElementById("contractorAssignments");
const myAssignments = document.getElementById("myAssignments");
const propertyForm = document.getElementById("propertyForm");
const propertyMessage = document.getElementById("propertyMessage");
const propertyIdInput = document.getElementById("property_id_input");
const resetPropertyFormBtn = document.getElementById("resetPropertyFormBtn");
const addChecklistItemBtn = document.getElementById("addChecklistItemBtn");
const checklistBuilder = document.getElementById("checklistBuilder");
const propertiesList = document.getElementById("propertiesList");
const propertySelect = document.getElementById("propertySelect");

let checklistDraft = [];
let savedProperties = [];
let currentMyAssignmentById = new Map();
let pendingStartAssignment = null;
let pendingStartUser = null;
let pendingStartPosition = null;

function showMessage(text, target = message) {
  if (target) target.textContent = text;
}

function getAssignmentMessageTarget() {
  return claimMessage || message;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatDateTime(value) {
  return value ? new Date(value).toLocaleString() : "Not set";
}

function formatTimeOnly(value) {
  return value
    ? new Date(value).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : "Not set";
}

function formatRelativeStart(value) {
  if (!value) return "Start time not recorded";

  const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 1) return "Started just now";
  if (minutes < 60) return `Started ${minutes} min ago`;

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `Started ${hours} hr${hours === 1 ? "" : "s"}${remainingMinutes ? ` ${remainingMinutes} min` : ""} ago`;
}

function formatMoney(value) {
  return value ? "$" + Number(value).toFixed(2) : "Not listed";
}

function shortId(value) {
  return value ? value.slice(0, 8) + "..." : "";
}

function formatClaimant(item) {
  if (item.claimed_by_name) {
    return escapeHtml(item.claimed_by_name);
  }

  if (item.claimed_by_email) {
    return escapeHtml(item.claimed_by_email);
  }

  return item.claimed_by ? "Contractor name not captured yet" : "Not claimed yet";
}

function statusClass(status) {
  return "status-" + String(status || "unknown").toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function isMissingStartColumnError(error) {
  const text = String(error?.message || "").toLowerCase();
  return [
    "started_at",
    "started_by",
    "start_latitude",
    "start_longitude",
    "start_location_accuracy",
    "start_notes",
    "schema cache",
    "could not find"
  ].some((part) => text.includes(part));
}

function getMapsUrl(address) {
  return address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
    : "";
}

async function getCurrentUser() {
  const { data } = await supabase.auth.getUser();
  return data.user;
}

async function requireLogin() {
  const user = await getCurrentUser();

  if (!user) {
    window.location.href = "login.html";
    return null;
  }

  return user;
}

async function getProfile(userId) {
  const { data, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();

  if (error) return null;
  return data;
}

async function getContractorName(user) {
  const metadata = user.user_metadata || {};
  const metadataName = metadata.full_name || metadata.name || metadata.display_name;

  const { data } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle();

  return (
    data?.full_name ||
    metadataName ||
    user.email?.split("@")[0] ||
    "Contractor"
  );
}

function getEmptyChecklistItem() {
  return {
    category: "",
    task: "",
    required: true,
    media_required: "none",
    notes: ""
  };
}

function normalizeChecklistItems(items) {
  return Array.isArray(items) ? items : [];
}

function showPropertyMessage(text) {
  showMessage(text, propertyMessage);
}

if (loginForm) {
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    showMessage("Signing in...");

    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      showMessage(error.message);
      return;
    }

    const profile = await getProfile(data.user.id);

    if (!profile) {
      showMessage("Login successful, but no profile role found.");
      return;
    }

    if (profile.role === "admin") {
      window.location.href = "admin.html";
    } else {
      window.location.href = "contractor.html";
    }
  });
}

if (logoutBtn) {
  logoutBtn.addEventListener("click", async () => {
    await supabase.auth.signOut();
    window.location.href = "login.html";
  });
}

if (assignmentForm) {
  const user = await requireLogin();

  if (user) {
    const profile = await getProfile(user.id);

    if (!profile || profile.role !== "admin") {
      window.location.href = "contractor.html";
    } else {
      loadPropertyOptions();
      loadAdminAssignments();

      if (propertySelect) {
        propertySelect.addEventListener("change", () => {
          fillAssignmentFromProperty(propertySelect.value);
        });
      }

      assignmentForm.addEventListener("submit", async (e) => {
        e.preventDefault();

        showMessage("Posting assignment...");

        const assignment = {
          title: document.getElementById("title").value,
          property_name: document.getElementById("property_name").value,
          address: document.getElementById("address").value,
          service_type: document.getElementById("service_type").value,
          scope: document.getElementById("scope").value,
          pay_amount: document.getElementById("pay_amount").value || null,
          start_window: document.getElementById("start_window").value || null,
          end_window: document.getElementById("end_window").value || null,
          supplies_notes: document.getElementById("supplies_notes").value,
          special_instructions: document.getElementById("special_instructions").value,
          status: "open",
          created_by: user.id
        };

        const { error } = await supabase
          .from("assignment_blocks")
          .insert([assignment]);

        if (error) {
          showMessage("Error: " + error.message);
          return;
        }

        showMessage("Assignment posted successfully.");
        assignmentForm.reset();
        loadAdminAssignments();
      });
    }
  }
}

if (propertyForm) {
  const user = await requireLogin();

  if (user) {
    const profile = await getProfile(user.id);

    if (!profile || profile.role !== "admin") {
      window.location.href = "contractor.html";
    } else {
      resetPropertyForm();
      loadProperties();

      addChecklistItemBtn?.addEventListener("click", () => {
        checklistDraft.push(getEmptyChecklistItem());
        renderChecklistBuilder();
      });

      resetPropertyFormBtn?.addEventListener("click", () => {
        resetPropertyForm();
      });

      checklistBuilder?.addEventListener("input", updateChecklistDraftFromForm);
      checklistBuilder?.addEventListener("change", updateChecklistDraftFromForm);
      checklistBuilder?.addEventListener("click", (e) => {
        const button = e.target.closest("[data-remove-checklist-index]");
        if (!button) return;

        updateChecklistDraftFromForm();
        checklistDraft.splice(Number(button.dataset.removeChecklistIndex), 1);
        renderChecklistBuilder();
      });

      propertiesList?.addEventListener("click", (e) => {
        const button = e.target.closest("[data-edit-property-id]");
        if (!button) return;

        const property = savedProperties.find((item) => item.id === button.dataset.editPropertyId);
        if (property) populatePropertyForm(property);
      });

      propertyForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        await saveProperty(user);
      });
    }
  }
}

function renderChecklistBuilder() {
  if (!checklistBuilder) return;

  if (!checklistDraft.length) {
    checklistDraft = [getEmptyChecklistItem()];
  }

  checklistBuilder.innerHTML = checklistDraft.map((item, index) => `
    <div class="checklist-item">
      <div class="checklist-item-grid">
        <div>
          <label>Area / Category</label>
          <input data-checklist-index="${index}" data-checklist-field="category" value="${escapeHtml(item.category)}" placeholder="Kitchen, Bathroom, Floors" />
        </div>
        <div>
          <label>Checklist Task</label>
          <input data-checklist-index="${index}" data-checklist-field="task" value="${escapeHtml(item.task)}" placeholder="Wipe counters and appliance fronts" />
        </div>
      </div>

      <div class="checklist-item-grid">
        <div>
          <label>Media Requirement</label>
          <select data-checklist-index="${index}" data-checklist-field="media_required">
            <option value="none" ${item.media_required === "none" ? "selected" : ""}>No media required</option>
            <option value="photo" ${item.media_required === "photo" ? "selected" : ""}>Photo required</option>
            <option value="video" ${item.media_required === "video" ? "selected" : ""}>Video required</option>
            <option value="before_after" ${item.media_required === "before_after" ? "selected" : ""}>Before and after media</option>
          </select>
        </div>
        <div>
          <label>Task Notes</label>
          <input data-checklist-index="${index}" data-checklist-field="notes" value="${escapeHtml(item.notes)}" placeholder="Use stainless cleaner, check under sink, etc." />
        </div>
      </div>

      <div class="checklist-flags">
        <label>
          <input type="checkbox" data-checklist-index="${index}" data-checklist-field="required" ${item.required ? "checked" : ""} />
          Required task
        </label>
      </div>

      <button type="button" class="secondary-btn small-btn remove-checklist-item" data-remove-checklist-index="${index}">Remove</button>
    </div>
  `).join("");
}

function updateChecklistDraftFromForm() {
  if (!checklistBuilder) return;

  const nextItems = checklistDraft.map((item) => ({ ...item }));

  checklistBuilder.querySelectorAll("[data-checklist-index]").forEach((input) => {
    const index = Number(input.dataset.checklistIndex);
    const field = input.dataset.checklistField;

    if (!nextItems[index]) {
      nextItems[index] = getEmptyChecklistItem();
    }

    nextItems[index][field] = input.type === "checkbox" ? input.checked : input.value;
  });

  checklistDraft = nextItems;
}

function getChecklistForSave() {
  updateChecklistDraftFromForm();

  return checklistDraft
    .map((item) => ({
      category: item.category.trim(),
      task: item.task.trim(),
      required: Boolean(item.required),
      media_required: item.media_required || "none",
      notes: item.notes.trim()
    }))
    .filter((item) => item.category || item.task || item.notes);
}

async function saveProperty(user) {
  showPropertyMessage("Saving property...");

  const payload = {
    name: document.getElementById("property_name_input").value.trim(),
    address: document.getElementById("property_address_input").value.trim(),
    default_service_type: document.getElementById("property_service_type_input").value.trim(),
    default_scope: document.getElementById("property_scope_input").value.trim(),
    supplies_notes: document.getElementById("property_supplies_input").value.trim(),
    special_instructions: document.getElementById("property_instructions_input").value.trim(),
    access_notes: document.getElementById("property_access_input").value.trim(),
    checklist_items: getChecklistForSave()
  };

  if (!payload.name) {
    showPropertyMessage("Property name is required.");
    return;
  }

  const propertyId = propertyIdInput?.value;
  const query = propertyId
    ? supabase.from("properties").update(payload).eq("id", propertyId)
    : supabase.from("properties").insert([{ ...payload, created_by: user.id }]);

  const { error } = await query;

  if (error) {
    showPropertyMessage("Error: " + error.message);
    return;
  }

  showPropertyMessage(propertyId ? "Property updated." : "Property saved.");
  resetPropertyForm();
  await loadProperties();
}

async function loadProperties() {
  if (!propertiesList && !propertySelect) return;

  const { data, error } = await supabase
    .from("properties")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    if (propertiesList) propertiesList.innerHTML = `<p>${escapeHtml(error.message)}</p>`;
    if (propertySelect) propertySelect.innerHTML = `<option value="">Choose a property...</option>`;
    return;
  }

  savedProperties = data || [];

  if (propertiesList) {
    propertiesList.innerHTML = savedProperties.length
      ? savedProperties.map(renderPropertyCard).join("")
      : "<p>No properties saved yet.</p>";
  }

  if (propertySelect) {
    renderPropertyOptions();
  }
}

async function loadPropertyOptions() {
  await loadProperties();
}

function renderPropertyOptions() {
  if (!propertySelect) return;

  propertySelect.innerHTML = [
    `<option value="">Choose a property...</option>`,
    ...savedProperties.map((property) => (
      `<option value="${escapeHtml(property.id)}">${escapeHtml(property.name)}</option>`
    ))
  ].join("");
}

function fillAssignmentFromProperty(propertyId) {
  const property = savedProperties.find((item) => item.id === propertyId);
  if (!property) return;

  document.getElementById("property_name").value = property.name || "";
  document.getElementById("address").value = property.address || "";
  document.getElementById("service_type").value = property.default_service_type || "";
  document.getElementById("scope").value = property.default_scope || "";
  document.getElementById("supplies_notes").value = property.supplies_notes || "";
  document.getElementById("special_instructions").value = property.special_instructions || "";
}

function renderPropertyCard(property) {
  const checklistItems = normalizeChecklistItems(property.checklist_items);
  const checklistPreview = checklistItems.slice(0, 5).map((item) => (
    `<li>${escapeHtml(item.category || "General")}: ${escapeHtml(item.task || "Untitled task")}</li>`
  )).join("");
  const extraCount = checklistItems.length > 5
    ? `<p>${checklistItems.length - 5} more checklist item(s)</p>`
    : "";

  return `
    <div class="assignment-card property-card">
      <div class="assignment-card-header">
        <div>
          <h3>${escapeHtml(property.name)}</h3>
          <p>${escapeHtml(property.address)}</p>
        </div>
        <button type="button" class="secondary-btn small-btn" data-edit-property-id="${escapeHtml(property.id)}">Edit</button>
      </div>
      <p><strong>Default Service:</strong> ${escapeHtml(property.default_service_type || "Not set")}</p>
      <p><strong>Access Notes:</strong> ${escapeHtml(property.access_notes || "None")}</p>
      <div class="checklist-summary">
        <strong>Checklist:</strong>
        ${checklistItems.length ? `<ul>${checklistPreview}</ul>${extraCount}` : "<p>No checklist items yet.</p>"}
      </div>
    </div>
  `;
}

function populatePropertyForm(property) {
  propertyIdInput.value = property.id || "";
  document.getElementById("property_name_input").value = property.name || "";
  document.getElementById("property_address_input").value = property.address || "";
  document.getElementById("property_service_type_input").value = property.default_service_type || "";
  document.getElementById("property_scope_input").value = property.default_scope || "";
  document.getElementById("property_supplies_input").value = property.supplies_notes || "";
  document.getElementById("property_instructions_input").value = property.special_instructions || "";
  document.getElementById("property_access_input").value = property.access_notes || "";
  checklistDraft = normalizeChecklistItems(property.checklist_items).map((item) => ({
    ...getEmptyChecklistItem(),
    ...item
  }));
  renderChecklistBuilder();
  showPropertyMessage("Editing " + property.name + ".");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function resetPropertyForm() {
  propertyForm?.reset();
  if (propertyIdInput) propertyIdInput.value = "";
  checklistDraft = [getEmptyChecklistItem()];
  renderChecklistBuilder();
}

function ensureStartJobModal() {
  let modal = document.getElementById("startJobModal");
  if (modal) return modal;

  document.body.insertAdjacentHTML("beforeend", `
    <div id="startJobModal" class="start-job-modal" role="dialog" aria-modal="true" aria-labelledby="startJobTitle" hidden>
      <div class="start-job-panel">
        <div class="start-job-header">
          <div>
            <p class="wip-kicker">Start Job</p>
            <h2 id="startJobTitle">Confirm job start</h2>
          </div>
          <button type="button" class="secondary-btn small-btn" data-close-start-job>Cancel</button>
        </div>

        <div id="startJobSummary" class="start-job-summary"></div>

        <div class="start-job-checklist">
          <label class="start-job-confirm">
            <input id="startJobOnsite" type="checkbox" />
            I am on site and ready to begin this job.
          </label>

          <label>
            Start note
            <textarea id="startJobNotes" rows="3" placeholder="Gate code used, supply issue, site condition, etc."></textarea>
          </label>

          <div class="start-location-row">
            <button type="button" class="secondary-btn" id="startJobLocationBtn">Use Current Location</button>
            <p id="startJobLocationStatus">Location is optional.</p>
          </div>
        </div>

        <p id="startJobModalMessage" class="status-message" aria-live="polite"></p>

        <div class="start-job-actions">
          <button type="button" class="secondary-btn" data-close-start-job>Not Yet</button>
          <button type="button" class="primary-btn" id="confirmStartJobBtn">Start Job</button>
        </div>
      </div>
    </div>
  `);

  modal = document.getElementById("startJobModal");
  modal.querySelectorAll("[data-close-start-job]").forEach((button) => {
    button.addEventListener("click", closeStartJobModal);
  });
  modal.addEventListener("click", (event) => {
    if (event.target === modal) closeStartJobModal();
  });
  document.getElementById("startJobLocationBtn")?.addEventListener("click", captureStartLocation);
  document.getElementById("confirmStartJobBtn")?.addEventListener("click", confirmStartJobFromModal);

  return modal;
}

function openStartJobModal(assignmentId, user) {
  const assignment = currentMyAssignmentById.get(assignmentId);
  if (!assignment) {
    showMessage("Unable to find that claimed job. Refreshing assignments...", getAssignmentMessageTarget());
    loadMyAssignments(user);
    return;
  }

  pendingStartAssignment = assignment;
  pendingStartUser = user;
  pendingStartPosition = null;

  const modal = ensureStartJobModal();
  const summary = document.getElementById("startJobSummary");
  const locationStatus = document.getElementById("startJobLocationStatus");
  const modalMessage = document.getElementById("startJobModalMessage");
  const onsiteCheckbox = document.getElementById("startJobOnsite");
  const notesInput = document.getElementById("startJobNotes");
  const mapUrl = getMapsUrl(assignment.address);

  if (summary) {
    summary.innerHTML = `
      <div>
        <span>Property</span>
        <strong>${escapeHtml(assignment.property_name || assignment.title || "Assignment")}</strong>
      </div>
      <div>
        <span>Address</span>
        <strong>${escapeHtml(assignment.address || "Address not set")}</strong>
      </div>
      <div>
        <span>Window</span>
        <strong>${escapeHtml(formatTimeOnly(assignment.start_window))} - ${escapeHtml(formatTimeOnly(assignment.end_window))}</strong>
      </div>
      <div>
        <span>Service</span>
        <strong>${escapeHtml(assignment.service_type || "Service not set")}</strong>
      </div>
      ${assignment.special_instructions ? `
        <div class="span-two">
          <span>Instructions</span>
          <strong>${escapeHtml(assignment.special_instructions)}</strong>
        </div>
      ` : ""}
      ${mapUrl ? `<a class="secondary-btn small-btn span-two" href="${mapUrl}" target="_blank" rel="noopener">Open Map</a>` : ""}
    `;
  }

  if (locationStatus) locationStatus.textContent = "Location is optional.";
  if (modalMessage) modalMessage.textContent = "";
  if (onsiteCheckbox) onsiteCheckbox.checked = false;
  if (notesInput) notesInput.value = "";

  modal.hidden = false;
  document.body.classList.add("modal-open");
  onsiteCheckbox?.focus();
}

function closeStartJobModal() {
  const modal = document.getElementById("startJobModal");
  if (modal) modal.hidden = true;
  document.body.classList.remove("modal-open");
  pendingStartAssignment = null;
  pendingStartUser = null;
  pendingStartPosition = null;
}

async function captureStartLocation() {
  const locationButton = document.getElementById("startJobLocationBtn");
  const locationStatus = document.getElementById("startJobLocationStatus");

  if (!navigator.geolocation) {
    if (locationStatus) locationStatus.textContent = "Location is not available on this device.";
    return;
  }

  if (locationButton) locationButton.disabled = true;
  if (locationStatus) locationStatus.textContent = "Getting current location...";

  try {
    const position = await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 12000
      });
    });

    pendingStartPosition = {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy
    };

    if (locationStatus) {
      locationStatus.textContent = `Location captured (${Math.round(position.coords.accuracy)}m accuracy).`;
    }
  } catch (error) {
    pendingStartPosition = null;
    if (locationStatus) {
      locationStatus.textContent = error?.message || "Location was not shared.";
    }
  } finally {
    if (locationButton) locationButton.disabled = false;
  }
}

async function confirmStartJobFromModal() {
  const modalMessage = document.getElementById("startJobModalMessage");
  const onsiteCheckbox = document.getElementById("startJobOnsite");
  const confirmButton = document.getElementById("confirmStartJobBtn");
  const notes = document.getElementById("startJobNotes")?.value.trim() || "";

  if (!pendingStartAssignment || !pendingStartUser) {
    showMessage("Unable to start this job. Refresh the assignment list and try again.", modalMessage);
    return;
  }

  if (!onsiteCheckbox?.checked) {
    showMessage("Confirm that you are on site before starting the job.", modalMessage);
    return;
  }

  if (confirmButton) confirmButton.disabled = true;
  const didStart = await startAssignment(pendingStartAssignment.id, pendingStartUser, {
    notes,
    position: pendingStartPosition
  });
  if (confirmButton) confirmButton.disabled = false;

  if (didStart) closeStartJobModal();
}

if (claimedAdminAssignments) {
  const user = await requireLogin();

  if (user) {
    const profile = await getProfile(user.id);

    if (!profile || profile.role !== "admin") {
      window.location.href = "contractor.html";
    } else {
      loadClaimedAdminAssignments();
    }
  }
}

async function loadAdminAssignments() {
  if (!adminAssignments) return;

  const { data, error } = await supabase
    .from("assignment_blocks")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    adminAssignments.innerHTML = `<p>${escapeHtml(error.message)}</p>`;
    return;
  }

  if (!data.length) {
    adminAssignments.innerHTML = "<p>No assignments have been posted yet.</p>";
    return;
  }

  adminAssignments.innerHTML = data
    .map((item) => renderAssignmentCard(item, { mode: "admin" }))
    .join("");
}

async function loadClaimedAdminAssignments() {
  if (!claimedAdminAssignments) return;

  const { data, error } = await supabase
    .from("assignment_blocks")
    .select("*")
    .not("claimed_by", "is", null)
    .order("claimed_at", { ascending: false });

  if (error) {
    claimedAdminAssignments.innerHTML = `<p>${escapeHtml(error.message)}</p>`;
    return;
  }

  if (!data.length) {
    claimedAdminAssignments.innerHTML = "<p>No assignments have been claimed yet.</p>";
    return;
  }

  claimedAdminAssignments.innerHTML = data
    .map((item) => renderAssignmentCard(item, { mode: "admin" }))
    .join("");
}

if (contractorDashboard || contractorAssignments || myAssignments) {
  const user = await requireLogin();

  if (user) {
    const profile = await getProfile(user.id);

    if (!profile) {
      window.location.href = "login.html";
    } else if (profile.role === "admin") {
      window.location.href = "admin.html";
    } else {
      await loadContractorDashboard(user);

      if (contractorAssignments) {
        contractorAssignments.addEventListener("click", async (e) => {
          const button = e.target.closest("[data-claim-assignment-id]");
          if (!button) return;

          button.disabled = true;
          await claimAssignment(button.dataset.claimAssignmentId, user);
        });
      }

      if (myAssignments) {
        myAssignments.addEventListener("click", async (e) => {
          const button = e.target.closest("[data-start-assignment-id]");
          if (!button) return;

          openStartJobModal(button.dataset.startAssignmentId, user);
        });
      }
    }
  }
}

async function loadContractorDashboard(user) {
  await Promise.all([
    loadContractorAssignments(),
    loadMyAssignments(user)
  ]);
}

async function loadContractorAssignments() {
  if (!contractorAssignments) return;

  const { data, error } = await supabase
    .from("assignment_blocks")
    .select("*")
    .eq("status", "open")
    .is("claimed_by", null)
    .order("start_window", { ascending: true });

  if (error) {
    contractorAssignments.innerHTML = `<p>${escapeHtml(error.message)}</p>`;
    return;
  }

  if (!data.length) {
    contractorAssignments.innerHTML = "<p>No open assignments available right now.</p>";
    return;
  }

  contractorAssignments.innerHTML = data
    .map((item) => renderAssignmentCard(item, { mode: "contractor-open" }))
    .join("");
}

async function loadMyAssignments(user) {
  if (!myAssignments) return;

  const { data, error } = await supabase
    .from("assignment_blocks")
    .select("*")
    .eq("claimed_by", user.id)
    .order("start_window", { ascending: true });

  if (error) {
    myAssignments.innerHTML = `<p>${escapeHtml(error.message)}</p>`;
    return;
  }

  currentMyAssignmentById = new Map((data || []).map((item) => [item.id, item]));

  if (!data.length) {
    myAssignments.innerHTML = "<p>You have not claimed any assignments yet.</p>";
    return;
  }

  myAssignments.innerHTML = data
    .map((item) => renderAssignmentCard(item, { mode: "contractor-claimed" }))
    .join("");
}

async function claimAssignment(assignmentId, user) {
  const target = getAssignmentMessageTarget();
  showMessage("Claiming assignment...", target);

  const contractorName = await getContractorName(user);
  const claimPayload = {
    status: "claimed",
    claimed_by: user.id,
    claimed_by_name: contractorName,
    claimed_by_email: user.email || null,
    claimed_at: new Date().toISOString()
  };

  let { data, error } = await claimOpenAssignment(assignmentId, claimPayload);

  if (
    error &&
    (error.message.includes("claimed_by_name") || error.message.includes("claimed_by_email"))
  ) {
    ({ data, error } = await claimOpenAssignment(assignmentId, {
      status: claimPayload.status,
      claimed_by: claimPayload.claimed_by,
      claimed_at: claimPayload.claimed_at
    }));
  }

  if (error) {
    showMessage("Error: " + error.message, target);
    await loadContractorDashboard(user);
    return;
  }

  if (!data) {
    showMessage("That assignment was already claimed by another contractor.", target);
    await loadContractorDashboard(user);
    return;
  }

  showMessage("Assignment claimed. It is now listed under My Assignments.", target);
  await loadContractorDashboard(user);
}

async function claimOpenAssignment(assignmentId, payload) {
  return supabase
    .from("assignment_blocks")
    .update(payload)
    .eq("id", assignmentId)
    .eq("status", "open")
    .is("claimed_by", null)
    .select("*")
    .maybeSingle();
}

async function startAssignment(assignmentId, user, details = {}) {
  const target = getAssignmentMessageTarget();
  showMessage("Starting job...", target);

  const startPayload = {
    status: "in_progress",
    started_at: new Date().toISOString(),
    started_by: user.id
  };

  if (details.notes) {
    startPayload.start_notes = details.notes;
  }

  if (details.position) {
    startPayload.start_latitude = details.position.latitude;
    startPayload.start_longitude = details.position.longitude;
    startPayload.start_location_accuracy = details.position.accuracy;
  }

  let { data, error } = await startClaimedAssignment(assignmentId, user, startPayload);
  let usedLegacyStart = false;

  if (error && isMissingStartColumnError(error)) {
    usedLegacyStart = true;
    ({ data, error } = await startClaimedAssignment(assignmentId, user, { status: "in_progress" }));
  }

  if (error) {
    showMessage("Error: " + error.message, target);
    await loadMyAssignments(user);
    return false;
  }

  if (!data) {
    showMessage("This job could not be started from its current status.", target);
    await loadMyAssignments(user);
    return false;
  }

  showMessage(
    usedLegacyStart
      ? "Job started. Run the start-job migration to record start time and location."
      : "Job started. The active job details are now open in My Assignments.",
    target
  );
  await loadMyAssignments(user);
  return true;
}

async function startClaimedAssignment(assignmentId, user, payload) {
  return supabase
    .from("assignment_blocks")
    .update(payload)
    .eq("id", assignmentId)
    .eq("claimed_by", user.id)
    .in("status", ["claimed", "scheduled"])
    .select("*")
    .maybeSingle();
}

function renderAssignmentCard(item, options = {}) {
  const mode = options.mode || "read";
  const start = formatDateTime(item.start_window);
  const end = formatDateTime(item.end_window);
  const normalizedStatus = String(item.status || "unknown").toLowerCase();
  const status = escapeHtml(item.status || "unknown").replace(/_/g, " ");
  const claimedAt = item.claimed_at ? formatDateTime(item.claimed_at) : "";
  const claimant = `${formatClaimant(item)}${claimedAt ? " on " + escapeHtml(claimedAt) : ""}`;
  const startedAt = item.started_at ? formatDateTime(item.started_at) : "";
  const mapUrl = getMapsUrl(item.address);
  const claimButton = mode === "contractor-open" && item.id
    ? `<button type="button" class="claim-btn" data-claim-assignment-id="${escapeHtml(item.id)}">Claim Job</button>`
    : "";
  const startButton = mode === "contractor-claimed" && item.id && ["claimed", "scheduled"].includes(normalizedStatus)
    ? `<button type="button" class="claim-btn start-job-btn" data-start-assignment-id="${escapeHtml(item.id)}">Start Job</button>`
    : "";
  const mapLink = mapUrl && (mode === "contractor-open" || mode === "contractor-claimed")
    ? `<a class="secondary-btn small-btn assignment-map-link" href="${mapUrl}" target="_blank" rel="noopener">Open Map</a>`
    : "";
  const actions = [startButton, claimButton, mapLink].filter(Boolean).join("");
  const claimedInfo = mode === "admin" || mode === "contractor-claimed"
    ? `<p><strong>Claimed By:</strong> ${claimant}</p>`
    : "";
  const startLocationLink = item.start_latitude && item.start_longitude
    ? `<a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${item.start_latitude},${item.start_longitude}`)}" target="_blank" rel="noopener">View captured point</a>`
    : "";
  const startedInfo = startedAt
    ? `
      <p><strong>Started:</strong> ${escapeHtml(startedAt)}</p>
      ${item.start_notes ? `<p><strong>Start Note:</strong> ${escapeHtml(item.start_notes)}</p>` : ""}
      ${startLocationLink ? `<p><strong>Start Location:</strong> ${startLocationLink}${item.start_location_accuracy ? ` (${Math.round(Number(item.start_location_accuracy))}m accuracy)` : ""}</p>` : ""}
    `
    : "";
  const activeJobPanel = mode === "contractor-claimed" && normalizedStatus === "in_progress"
    ? `
      <div class="active-job-panel">
        <div class="active-job-status">
          <span>Active Job</span>
          <strong>${escapeHtml(formatRelativeStart(item.started_at))}</strong>
        </div>
        <ol>
          <li>Capture the site condition before work begins.</li>
          <li>Complete the listed scope and property instructions.</li>
          <li>Keep notes for blocked areas, damages, or missing supplies.</li>
        </ol>
      </div>
    `
    : "";

  return `
    <div class="assignment-card">
      <div class="assignment-card-header">
        <h3>${escapeHtml(item.title)}</h3>
        <span class="status-badge ${statusClass(item.status)}">${status}</span>
      </div>
      <p><strong>Property:</strong> ${escapeHtml(item.property_name)}</p>
      <p><strong>Address:</strong> ${escapeHtml(item.address)}</p>
      <p><strong>Service:</strong> ${escapeHtml(item.service_type)}</p>
      <p><strong>Pay:</strong> ${escapeHtml(formatMoney(item.pay_amount))}</p>
      <p><strong>Window:</strong> ${escapeHtml(start)} - ${escapeHtml(end)}</p>
      <p><strong>Scope:</strong> ${escapeHtml(item.scope)}</p>
      <p><strong>Supplies:</strong> ${escapeHtml(item.supplies_notes)}</p>
      <p><strong>Instructions:</strong> ${escapeHtml(item.special_instructions)}</p>
      ${claimedInfo}
      ${startedInfo}
      ${activeJobPanel}
      ${actions ? `<div class="assignment-actions">${actions}</div>` : ""}
    </div>
  `;
}
