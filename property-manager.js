import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const env = window.__ENV || {};
const supabase = env.SUPABASE_URL && env.SUPABASE_ANON_KEY
  ? createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY)
  : null;

const allowedRoles = new Set(["admin", "property_manager"]);
const roleDashboards = {
  admin: "admin.html",
  contractor: "contractor.html",
  sales: "sales.html",
  sales_team: "sales.html",
  property_manager: "property-manager.html"
};

function normalizePortalRole(role) {
  return String(role || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

function getPortalHome(role) {
  return roleDashboards[normalizePortalRole(role)] || null;
}

function getName(user, profile) {
  return profile?.full_name ||
    user?.user_metadata?.full_name ||
    user?.email?.split("@")[0] ||
    "Property Manager";
}

async function requireManagerAccess() {
  if (!supabase) return;

  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user || null;

  if (!user) {
    window.location.href = "login.html";
    return;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, full_name")
    .eq("id", user.id)
    .maybeSingle();

  const role = normalizePortalRole(profile?.role);

  if (!profile) {
    window.location.href = "login.html";
    return;
  }

  if (!allowedRoles.has(role)) {
    window.location.href = getPortalHome(role) || "login.html";
    return;
  }

  const name = getName(user, profile);
  const nameElement = document.getElementById("managerUserName");
  if (nameElement) nameElement.textContent = name;
}

document.getElementById("managerLogoutBtn")?.addEventListener("click", async () => {
  await supabase?.auth.signOut();
  window.location.href = "login.html";
});

await requireManagerAccess();
