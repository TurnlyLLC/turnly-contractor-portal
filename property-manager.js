import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const env = window.__ENV || {};
const supabase = env.SUPABASE_URL && env.SUPABASE_ANON_KEY
  ? createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY)
  : null;

const managerMain = document.querySelector(".command-main");

const roleDashboards = {
  admin: "admin.html",
  contractor: "contractor.html",
  sales: "sales.html",
  sales_team: "sales.html",
  property_manager: "property-manager.html"
};

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

function isActiveProfile(profile) {
  return ["active", "approved", "enabled"].includes(normalizeStatus(profile?.status));
}

function getPortalHome(role) {
  return roleDashboards[normalizeRole(role)] || "contractor.html";
}

function getName(user, profile) {
  return profile?.full_name ||
    user?.user_metadata?.full_name ||
    user?.email?.split("@")[0] ||
    "Property Manager";
}

function renderLockedState(title, body) {
  if (!managerMain) return;
  managerMain.innerHTML = `
    <header class="command-header">
      <div>
        <h1>${title}</h1>
        <p>${body}</p>
      </div>
    </header>
    <section class="panel-card wip-panel">
      <p class="wip-kicker">Account Access</p>
      <h2>${title}</h2>
      <p>${body}</p>
    </section>
  `;
}

async function requireManagerAccess() {
  if (!supabase) {
    renderLockedState("Configuration needed", "Supabase configuration is missing for this deployment.");
    return;
  }

  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user || null;

  if (!user) {
    window.location.href = "property-manager-login.html";
    return;
  }

  let { data: profile, error } = await supabase
    .from("profiles")
    .select("role, full_name, status, property_manager_property_id")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    const fallback = await supabase
      .from("profiles")
      .select("role, full_name, status")
      .eq("id", user.id)
      .maybeSingle();
    profile = fallback.data ? { ...fallback.data, property_manager_property_id: null, access_setup_error: true } : null;
  }

  const role = normalizeRole(profile?.role);

  if (!profile) {
    window.location.href = "property-manager-login.html";
    return;
  }

  if (role !== "property_manager") {
    window.location.href = getPortalHome(role);
    return;
  }

  const name = getName(user, profile);
  const nameElement = document.getElementById("managerUserName");
  if (nameElement) nameElement.textContent = name;

  if (!isActiveProfile(profile)) {
    renderLockedState("Approval pending", "A Turnly admin must approve this property manager account before property data is visible.");
    return;
  }

  if (!profile.property_manager_property_id) {
    const setupText = profile.access_setup_error
      ? "This account is approved, but the account-access migration is still needed before a property can be linked."
      : "A Turnly admin must link this property manager account to a specific property before any property data is visible.";
    renderLockedState("Property link required", setupText);
    return;
  }

  const { data: property, error: propertyError } = await supabase
    .from("portal_properties")
    .select("id, name")
    .eq("id", profile.property_manager_property_id)
    .maybeSingle();

  if (propertyError || !property) {
    renderLockedState("Property access unavailable", "This account has a property link, but the linked property could not be loaded.");
    return;
  }

  const panel = document.querySelector(".wip-panel");
  if (panel) {
    panel.innerHTML = `
      <p class="wip-kicker">Linked Property</p>
      <h2>${property.name || "Property account linked"}</h2>
      <p>Your property manager account is linked and ready for property-specific workflows.</p>
    `;
  }
}

document.getElementById("managerLogoutBtn")?.addEventListener("click", async () => {
  await supabase?.auth.signOut();
  window.location.href = "property-manager-login.html";
});

await requireManagerAccess();
