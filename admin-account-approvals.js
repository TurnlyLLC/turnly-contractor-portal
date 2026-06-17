import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const env = window.__ENV || {};
const supabase = env.SUPABASE_URL && env.SUPABASE_ANON_KEY
  ? createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY)
  : null;

const PROPERTIES_TABLE = "portal_properties";
const list = document.getElementById("accountApprovalsList");
const message = document.getElementById("accountApprovalsMessage");
const count = document.querySelector("[data-account-request-count]");
const refreshButton = document.getElementById("refreshAccountRequestsBtn");

const portalByRole = {
  admin: "admin.html",
  contractor: "contractor.html",
  property_manager: "property-manager.html",
  sales: "sales.html",
  sales_team: "sales.html"
};

let pendingProfiles = [];
let properties = [];
let isStatusFallbackSchema = false;

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function showMessage(text) {
  if (message) message.textContent = text;
}

function normalizeRole(role) {
  return String(role || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

function normalizeStatus(status) {
  return String(status || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

function isApprovedStatus(status) {
  return ["active", "approved", "enabled"].includes(normalizeStatus(status));
}

function isPendingStatus(status) {
  return normalizeStatus(status) === "pending";
}

function getPortalHome(role) {
  return portalByRole[normalizeRole(role)] || "contractor.html";
}

function formatRoleLabel(role) {
  const label = String(role || "account").replace(/_/g, " ");
  return label.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getProfileName(profile) {
  return profile.full_name ||
    [profile.first_name, profile.last_name].filter(Boolean).join(" ").trim() ||
    profile.email ||
    "New account";
}

function getInitials(name) {
  const parts = String(name || "New Account").trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1
    ? `${parts[0][0]}${parts[parts.length - 1][0]}`
    : parts[0]?.slice(0, 2);
  return String(letters || "NA").toUpperCase();
}

function isMissingColumnError(error) {
  const text = String(error?.message || "").toLowerCase();
  return [
    "contractor_approved",
    "property_manager_property_id",
    "first_name",
    "last_name",
    "schema cache",
    "could not find"
  ].some((part) => text.includes(part));
}

async function getCurrentUser() {
  const { data } = await supabase.auth.getUser();
  return data?.user || null;
}

async function getProfile(userId) {
  const { data, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) return null;
  return { ...data, role: normalizeRole(data.role) };
}

async function requireAdmin() {
  if (!supabase) {
    showMessage("Supabase config is missing.");
    return false;
  }

  const user = await getCurrentUser();
  if (!user) {
    window.location.href = "login.html";
    return false;
  }

  const profile = await getProfile(user.id);
  if (!profile || profile.role !== "admin") {
    window.location.href = getPortalHome(profile?.role);
    return false;
  }

  return true;
}

function isPending(profile) {
  if (profile.role === "contractor") {
    return !isApprovedStatus(profile.status);
  }

  if (profile.role === "property_manager") {
    if (profile.uses_status_fallback) {
      return !isApprovedStatus(profile.status);
    }

    return !profile.property_manager_property_id;
  }

  return false;
}

function getPendingReason(profile) {
  if (profile.role === "contractor") {
    return isPendingStatus(profile.status)
      ? "Status is pending. Approve to mark this contractor active."
      : "Status is not active yet. Approve to activate this contractor.";
  }

  if (profile.uses_status_fallback) {
    return "Waiting for admin approval. Property linking still needs the account-access migration.";
  }

  return "Waiting for a linked property.";
}

function getPropertyOptions(selectedPropertyId = "") {
  if (!properties.length) {
    return `<option value="">Add a property first</option>`;
  }

  return [
    `<option value="">Choose property...</option>`,
    ...properties.map((property) => (
      `<option value="${escapeHtml(property.id)}" ${property.id === selectedPropertyId ? "selected" : ""}>
        ${escapeHtml(property.name || "Untitled Property")}
      </option>`
    ))
  ].join("");
}

function renderRequest(profile) {
  const name = getProfileName(profile);
  const isPropertyManager = profile.role === "property_manager";
  const usesStatusFallback = Boolean(profile.uses_status_fallback);
  const propertyControl = usesStatusFallback
    ? `<span class="account-request-meta">Approving will mark this profile active.${isPropertyManager ? " Run the property-link migration to assign a specific property." : ""}</span>`
    : isPropertyManager
    ? `<select data-account-property-select="${escapeHtml(profile.id)}" aria-label="Property for ${escapeHtml(name)}" ${properties.length ? "" : "disabled"}>
        ${getPropertyOptions(profile.property_manager_property_id)}
      </select>`
    : `<span class="account-request-meta">Approving will change status from pending to active.</span>`;

  return `
    <article class="account-request-row">
      <div class="account-request-person">
        <span class="account-request-avatar">${escapeHtml(getInitials(name))}</span>
        <p>
          <strong>${escapeHtml(name)}</strong>
          <small>${escapeHtml(profile.email || "No email captured")}</small>
        </p>
        <span class="account-request-role">${escapeHtml(formatRoleLabel(profile.role))}</span>
      </div>
      <div class="account-request-meta">
        <span>${escapeHtml(getPendingReason(profile))}</span>
        ${profile.status ? `<span>Status: ${escapeHtml(profile.status)}</span>` : ""}
        ${profile.phone ? `<span>${escapeHtml(profile.phone)}</span>` : ""}
      </div>
      <div class="account-request-actions">
        ${propertyControl}
        <button class="approve-account-btn" type="button" data-approve-account-id="${escapeHtml(profile.id)}">
          ${isPropertyManager && !usesStatusFallback ? "Link & Approve" : "Approve"}
        </button>
      </div>
    </article>
  `;
}

function renderRequests() {
  if (!list) return;

  if (count) count.textContent = `${pendingProfiles.length} Pending`;

  list.innerHTML = pendingProfiles.length
    ? pendingProfiles.map(renderRequest).join("")
    : `<div class="account-request-empty">No account requests are waiting right now.</div>`;
}

function normalizeProfile(profile) {
  return {
    ...profile,
    role: normalizeRole(profile.role),
    uses_status_fallback: isStatusFallbackSchema
  };
}

function isAccountRequestRole(profile) {
  return ["contractor", "property_manager"].includes(profile.role);
}

async function loadRequests() {
  if (!list) return;

  showMessage("Loading account requests...");

  isStatusFallbackSchema = false;

  const [{ data: propertyData, error: propertyError }, profileResult] = await Promise.all([
    supabase
      .from(PROPERTIES_TABLE)
      .select("id, name, address")
      .order("name", { ascending: true }),
    supabase
      .from("profiles")
      .select("id, full_name, email, phone, role, status, contractor_approved, property_manager_property_id")
      .order("role", { ascending: true })
      .order("email", { ascending: true })
  ]);

  let profileData = profileResult.data || [];
  let profileError = profileResult.error;

  if (profileError && isMissingColumnError(profileError)) {
    isStatusFallbackSchema = true;
    const fallback = await supabase
      .from("profiles")
      .select("id, email, role, full_name, phone, status")
      .order("role", { ascending: true })
      .order("email", { ascending: true });

    profileData = fallback.data || [];
    profileError = fallback.error;
  }

  if (profileError) {
    pendingProfiles = [];
    renderRequests();
    showMessage("Error loading account requests: " + profileError.message);
    return;
  }

  properties = propertyError ? [] : (propertyData || []);
  pendingProfiles = (profileData || [])
    .map(normalizeProfile)
    .filter(isAccountRequestRole)
    .filter(isPending)
    .sort((a, b) => getProfileName(a).localeCompare(getProfileName(b)));

  renderRequests();

  if (propertyError) {
    showMessage("Account requests loaded, but properties could not load: " + propertyError.message);
    return;
  }

  showMessage(
    isStatusFallbackSchema
      ? pendingProfiles.length
        ? "Approve pending contractor profiles by changing profile status to active. Run the account-access migration when you need property-manager property linking."
        : "No pending status-based account requests were found. If a contractor is still blocked, the admin profile may need the account-access RLS policy migration."
      : pendingProfiles.length
      ? "Approve pending contractors directly, or link property managers to a property."
      : "All account requests are handled."
  );
}

async function approveRequest(profileId) {
  const profile = pendingProfiles.find((item) => item.id === profileId);
  if (!profile || !list) return;

  const button = list.querySelector(`[data-approve-account-id="${profileId}"]`);
  if (button) button.disabled = true;

  const payload = profile.uses_status_fallback
    ? { status: "active" }
    : profile.role === "property_manager"
    ? {
        property_manager_property_id: list.querySelector(`[data-account-property-select="${profileId}"]`)?.value || null,
        contractor_approved: true,
        status: "active"
      }
    : {
        contractor_approved: true,
        status: "active"
      };

  if (!profile.uses_status_fallback && profile.role === "property_manager" && !payload.property_manager_property_id) {
    showMessage("Choose a property before approving this property manager.");
    if (button) button.disabled = false;
    return;
  }

  showMessage(`Approving ${getProfileName(profile)}...`);

  let { error } = await supabase
    .from("profiles")
    .update(payload)
    .eq("id", profileId);

  if (error && isMissingColumnError(error)) {
    const retry = await supabase
      .from("profiles")
      .update({ status: "active" })
      .eq("id", profileId);
    error = retry.error;
  }

  if (error) {
    showMessage("Error approving account: " + error.message);
    if (button) button.disabled = false;
    return;
  }

  showMessage(`${getProfileName(profile)} approved.`);
  await loadRequests();
}

if (list && await requireAdmin()) {
  await loadRequests();
  refreshButton?.addEventListener("click", loadRequests);
  list.addEventListener("click", async (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const button = target?.closest("[data-approve-account-id]");

    if (button) {
      await approveRequest(button.dataset.approveAccountId);
    }
  });
}
