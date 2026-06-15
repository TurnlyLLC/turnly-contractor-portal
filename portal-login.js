import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const env = window.__ENV || {};
const supabase = env.SUPABASE_URL && env.SUPABASE_ANON_KEY
  ? createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY)
  : null;

const loginForm = document.getElementById("loginForm");
const message = document.getElementById("message");

const roleDashboards = {
  admin: "admin.html",
  contractor: "contractor.html",
  sales: "sales.html",
  sales_team: "sales.html",
  property_manager: "property-manager.html"
};

function showMessage(text) {
  if (message) message.textContent = text;
}

function normalizePortalRole(role) {
  return String(role || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

function getPortalHome(role) {
  return roleDashboards[normalizePortalRole(role)] || null;
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

loginForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!supabase) {
    showMessage("Supabase config is missing.");
    return;
  }

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

  const portalHome = getPortalHome(profile.role);

  if (!portalHome) {
    showMessage("Login successful, but this account role is not configured.");
    await supabase.auth.signOut();
    return;
  }

  window.location.href = portalHome;
});
