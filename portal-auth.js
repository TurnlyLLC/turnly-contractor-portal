import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const env = window.__ENV || {};
const supabase = env.SUPABASE_URL && env.SUPABASE_ANON_KEY
  ? createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY)
  : null;

const pageRole = document.body.dataset.authRole || "contractor";
const pageHome = document.body.dataset.authHome || "contractor.html";
const pageLabel = document.body.dataset.authLabel || "Portal";
const isPropertyManagerPortal = pageRole === "property_manager";
const loginForm = document.getElementById("loginForm");
const signupForm = document.getElementById("signupForm");
const authMessage = document.getElementById("authMessage");

const portalByRole = {
  admin: "admin.html",
  contractor: "contractor.html",
  property_manager: "property-manager.html",
  sales: "sales.html",
  sales_team: "sales.html"
};

function normalizeRole(role) {
  return String(role || "contractor")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

function value(id) {
  return document.getElementById(id)?.value.trim() || "";
}

function showMessage(text, tone = "") {
  if (!authMessage) return;
  authMessage.textContent = text;
  if (tone) {
    authMessage.dataset.tone = tone;
  } else {
    delete authMessage.dataset.tone;
  }
}

function setFormLoading(form, isLoading, loadingText, readyText) {
  const button = form?.querySelector("button[type='submit']");
  if (!button) return;
  button.disabled = isLoading;
  button.textContent = isLoading ? loadingText : readyText;
}

function showMode(mode) {
  document.querySelectorAll("[data-auth-mode]").forEach((button) => {
    button.classList.toggle("active", button.dataset.authMode === mode);
  });

  document.querySelectorAll("[data-auth-panel]").forEach((panel) => {
    const isActive = panel.dataset.authPanel === mode;
    panel.classList.toggle("active", isActive);
    panel.setAttribute("aria-hidden", String(!isActive));
  });

  showMessage("");
}

async function getProfile(userId) {
  const { data, error } = await supabase
    .from("profiles")
    .select("role, contractor_approved, property_manager_property_id")
    .eq("id", userId)
    .maybeSingle();

  if (!error) {
    return data ? { ...data, role: normalizeRole(data.role) } : null;
  }

  const fallback = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  if (fallback.error || !fallback.data) return null;

  return {
    ...fallback.data,
    role: normalizeRole(fallback.data.role),
    contractor_approved: false,
    property_manager_property_id: null,
    access_setup_error: true
  };
}

async function waitForProfile(userId) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const profile = await getProfile(userId);
    if (profile?.role) return profile;
    await new Promise((resolve) => setTimeout(resolve, 350));
  }

  return null;
}

document.querySelectorAll("[data-auth-mode]").forEach((button) => {
  button.addEventListener("click", () => showMode(button.dataset.authMode));
});

showMode("login");

async function routeAuthenticatedUser(user, fallbackRole = pageRole) {
  const profile = await getProfile(user.id);
  const role = normalizeRole(profile?.role || user.user_metadata?.role || fallbackRole);

  if (isPropertyManagerPortal && role !== "property_manager") {
    const target = portalByRole[role] || "contractor.html";
    showMessage("Taking you to the correct portal...");
    window.location.href = target;
    return true;
  }

  if (!isPropertyManagerPortal && role === "property_manager") {
    showMessage("Taking you to the Property Manager Portal...");
    window.location.href = portalByRole.property_manager;
    return true;
  }

  window.location.href = portalByRole[role] || pageHome;
  return true;
}

loginForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!supabase) {
    showMessage("Supabase config is missing.", "error");
    return;
  }

  setFormLoading(loginForm, true, "Logging In...", "Log In");
  showMessage("Logging in...");

  const { data, error } = await supabase.auth.signInWithPassword({
    email: value("loginEmail").toLowerCase(),
    password: document.getElementById("loginPassword")?.value || ""
  });

  if (error) {
    showMessage(error.message, "error");
    setFormLoading(loginForm, false, "Logging In...", "Log In");
    return;
  }

  try {
    const didRoute = await routeAuthenticatedUser(data.user);
    if (!didRoute) {
      setFormLoading(loginForm, false, "Logging In...", "Log In");
    }
  } catch (routeError) {
    showMessage(routeError?.message || "Unable to finish login. Please try again.", "error");
    setFormLoading(loginForm, false, "Logging In...", "Log In");
  }
});

signupForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!supabase) {
    showMessage("Supabase config is missing.", "error");
    return;
  }

  const firstName = value("firstName");
  const lastName = value("lastName");
  const email = value("signupEmail").toLowerCase();
  const phone = value("phone");
  const password = document.getElementById("signupPassword")?.value || "";
  const verifyPassword = document.getElementById("verifyPassword")?.value || "";
  const fullName = `${firstName} ${lastName}`.trim();

  if (!firstName || !lastName || !email || !phone || !password || !verifyPassword) {
    showMessage("Fill out every field to create the account.", "error");
    return;
  }

  if (password.length < 6) {
    showMessage("Password must be at least 6 characters.", "error");
    return;
  }

  if (password !== verifyPassword) {
    showMessage("Passwords do not match.", "error");
    return;
  }

  setFormLoading(signupForm, true, "Creating Account...", `Create ${pageLabel} Account`);
  showMessage("Creating account...");

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${window.location.origin}/${pageHome}`,
      data: {
        first_name: firstName,
        last_name: lastName,
        full_name: fullName,
        phone,
        role: pageRole,
        contractor_approved: pageRole !== "contractor"
      }
    }
  });

  if (error) {
    showMessage(error.message, "error");
    setFormLoading(signupForm, false, "Creating Account...", `Create ${pageLabel} Account`);
    return;
  }

  if (data?.session && data?.user) {
    await waitForProfile(data.user.id);
    const didRoute = await routeAuthenticatedUser(data.user, pageRole);
    if (!didRoute) {
      setFormLoading(signupForm, false, "Creating Account...", `Create ${pageLabel} Account`);
    }
    return;
  }

  const accessNote = pageRole === "contractor"
    ? "A Turnly admin must approve the contractor account before dashboard data is visible."
    : "A Turnly admin must link this account to a property before dashboard data is visible.";
  showMessage(`Account created. Check your email to confirm it, then log in. ${accessNote}`, "success");
  setFormLoading(signupForm, false, "Creating Account...", `Create ${pageLabel} Account`);
});
