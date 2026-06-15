import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const env = window.__ENV || {};
const supabase = env.SUPABASE_URL && env.SUPABASE_ANON_KEY
  ? createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY)
  : null;

const loginForm = document.getElementById("loginForm");
const message = document.getElementById("message");

function showMessage(text) {
  if (message) message.textContent = text;
}

function normalizeRole(role) {
  return String(role || "contractor")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

function getPortalHome(role) {
  if (role === "admin") return "admin.html";
  if (role === "sales" || role === "sales_team") return "sales.html";
  if (role === "property_manager") return "property-manager.html";
  return "contractor.html";
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
  const metadataRole = normalizeRole(data.user.user_metadata?.role);
  const role = normalizeRole(profile?.role || metadataRole);

  if (role === "property_manager") {
    await supabase.auth.signOut();
    showMessage("Property manager accounts must use the Property Manager Portal login.");
    return;
  }

  window.location.href = getPortalHome(role);
});
