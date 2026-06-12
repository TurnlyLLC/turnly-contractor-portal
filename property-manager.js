import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const env = window.__ENV || {};
const supabase = env.SUPABASE_URL && env.SUPABASE_ANON_KEY
  ? createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY)
  : null;

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

  if (!profile || !["admin", "property_manager"].includes(profile.role)) {
    window.location.href = "login.html";
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
