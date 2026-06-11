import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const supabase = createClient(
  window.__ENV.SUPABASE_URL,
  window.__ENV.SUPABASE_ANON_KEY
);

const loginForm = document.getElementById("loginForm");
const logoutBtn = document.getElementById("logoutBtn");
const message = document.getElementById("message");
const claimMessage = document.getElementById("claimMessage");
const assignmentForm = document.getElementById("assignmentForm");
const adminAssignments = document.getElementById("adminAssignments");
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

function showMessage(text, target = message) {
  if (target) target.textContent = text;
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

  if (!data.length) {
    myAssignments.innerHTML = "<p>You have not claimed any assignments yet.</p>";
    return;
  }

  myAssignments.innerHTML = data
    .map((item) => renderAssignmentCard(item, { mode: "contractor-claimed" }))
    .join("");
}

async function claimAssignment(assignmentId, user) {
  showMessage("Claiming assignment...", claimMessage);

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
    showMessage("Error: " + error.message, claimMessage);
    await loadContractorDashboard(user);
    return;
  }

  if (!data) {
    showMessage("That assignment was already claimed by another contractor.", claimMessage);
    await loadContractorDashboard(user);
    return;
  }

  showMessage("Assignment claimed. It is now listed under My Assignments.", claimMessage);
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

function renderAssignmentCard(item, options = {}) {
  const mode = options.mode || "read";
  const start = formatDateTime(item.start_window);
  const end = formatDateTime(item.end_window);
  const status = escapeHtml(item.status || "unknown");
  const claimedAt = item.claimed_at ? formatDateTime(item.claimed_at) : "";
  const claimant = `${formatClaimant(item)}${claimedAt ? " on " + escapeHtml(claimedAt) : ""}`;
  const claimButton = mode === "contractor-open" && item.id
    ? `<button type="button" class="claim-btn" data-claim-assignment-id="${escapeHtml(item.id)}">Claim Assignment</button>`
    : "";
  const claimedInfo = mode === "admin" || mode === "contractor-claimed"
    ? `<p><strong>Claimed By:</strong> ${claimant}</p>`
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
      ${claimButton ? `<div class="assignment-actions">${claimButton}</div>` : ""}
    </div>
  `;
}
