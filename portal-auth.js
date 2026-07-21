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

let pendingVerificationEmail = "";
let pendingVerificationRole = pageRole;
let pendingVerificationAccessNote = "";

const portalByRole = {
  admin: "admin.html",
  contractor: "contractor.html",
  property_manager: "property-manager.html",
  sales: "sales.html",
  sales_team: "sales.html"
};

function authCallbackUrl(role = pageRole) {
  const url = new URL("auth-callback.html", window.location.origin);
  url.searchParams.set("portal", normalizeRole(role));
  return url.toString();
}

function normalizeToken(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

function normalizeRole(role) {
  return normalizeToken(role) || "contractor";
}

function value(id) {
  return document.getElementById(id)?.value.trim() || "";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getInitialStatus(role = pageRole) {
  const normalizedRole = normalizeRole(role);
  return normalizedRole === "contractor" ? "pending" : "active";
}

function hasPropertyManagerSignal(user, profile) {
  return normalizeToken(user?.user_metadata?.role) === "property_manager" ||
    normalizeToken(profile?.role) === "property_manager" ||
    Boolean(profile?.property_manager_property_id) ||
    Boolean(profile?.requested_property_name) ||
    Boolean(user?.user_metadata?.requested_property_name);
}

async function repairPropertyManagerProfile(user, profile = {}) {
  if (!user?.id || !supabase) return { ...profile, role: "property_manager" };
  const requestedPropertyName = profile?.requested_property_name ||
    user.user_metadata?.requested_property_name ||
    user.user_metadata?.associated_property ||
    user.user_metadata?.property_name ||
    "";
  const payload = {
    id: user.id,
    email: profile?.email || user.email || "",
    role: "property_manager",
    status: "active",
    contractor_approved: true
  };

  if (requestedPropertyName) {
    payload.requested_property_name = requestedPropertyName;
  }

  const { error } = await supabase
    .from("profiles")
    .upsert(payload, { onConflict: "id" });

  if (error) {
    console.warn("Property manager profile repair skipped:", error.message);
  }

  return { ...profile, ...payload };
}

function setMessageTone(tone = "") {
  if (!authMessage) return;
  if (tone) {
    authMessage.dataset.tone = tone;
  } else {
    delete authMessage.dataset.tone;
  }
}

function clearPendingVerification() {
  pendingVerificationEmail = "";
  pendingVerificationRole = pageRole;
  pendingVerificationAccessNote = "";
}

function showMessage(text, tone = "") {
  if (!authMessage) return;
  authMessage.textContent = text;
  setMessageTone(tone);
}

function showVerificationPrompt(email, accessNote, prefix = "Account created. We sent a verification email to") {
  pendingVerificationEmail = email;
  pendingVerificationRole = pageRole;
  pendingVerificationAccessNote = accessNote;

  if (!authMessage) return;

  authMessage.innerHTML = `
    ${escapeHtml(prefix)} <strong>${escapeHtml(email)}</strong>.
    Check spam or promotions if it is not in the inbox.
    <button class="auth-inline-action" type="button" data-resend-verification>Resend verification email</button>
    <span class="auth-resend-note">${escapeHtml(accessNote)}</span>
  `;
  setMessageTone("success");
}

function propertyManagerAccessNote(requestedPropertyName = "") {
  return `A Turnly admin must link this account to ${requestedPropertyName || "the requested property"} before dashboard data is visible.`;
}

function setFormLoading(form, isLoading, loadingText, readyText) {
  const button = form?.querySelector("button[type='submit']");
  if (!button) return;
  button.disabled = isLoading;
  button.textContent = isLoading ? loadingText : readyText;
}

function showMode(mode) {
  clearPendingVerification();

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
    .select("role, status, contractor_approved, property_manager_property_id, requested_property_name")
    .eq("id", userId)
    .maybeSingle();

  if (!error) {
    return data ? { ...data, role: normalizeRole(data.role) } : null;
  }

  const fallback = await supabase
    .from("profiles")
    .select("role, status")
    .eq("id", userId)
    .maybeSingle();

  if (fallback.error || !fallback.data) return null;

  return {
    ...fallback.data,
    role: normalizeRole(fallback.data.role),
    contractor_approved: false,
    property_manager_property_id: null,
    access_setup_error: !fallback.data.status
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

async function syncSignupProfile(user, details) {
  if (!user?.id || !supabase) return;

  const role = normalizeRole(details.role);
  const status = getInitialStatus(role);
  const payload = {
    id: user.id,
    email: details.email,
    full_name: details.fullName,
    phone: details.phone,
    role,
    status,
    contractor_approved: status === "active"
  };

  if (role === "property_manager") {
    payload.requested_property_name = details.requestedPropertyName || "";
  }

  const { error } = await supabase
    .from("profiles")
    .upsert(payload, { onConflict: "id" });

  if (error) {
    console.warn("Profile sync after signup skipped:", error.message);
  }
}

document.querySelectorAll("[data-auth-mode]").forEach((button) => {
  button.addEventListener("click", () => showMode(button.dataset.authMode));
});

authMessage?.addEventListener("click", async (event) => {
  const button = event.target?.closest("[data-resend-verification]");
  if (!button) return;

  if (!supabase || !pendingVerificationEmail) {
    showMessage("Unable to resend verification right now. Please try signing up again.", "error");
    return;
  }

  button.disabled = true;
  button.textContent = "Sending...";

  const { error } = await supabase.auth.resend({
    type: "signup",
    email: pendingVerificationEmail,
    options: {
      emailRedirectTo: authCallbackUrl(pendingVerificationRole)
    }
  });

  if (error) {
    showMessage(`Unable to resend verification email: ${error.message}`, "error");
    return;
  }

  showVerificationPrompt(
    pendingVerificationEmail,
    pendingVerificationAccessNote,
    "We sent another verification email to"
  );
});

showMode("login");

async function routeAuthenticatedUser(user, fallbackRole = pageRole) {
  let profile = await getProfile(user.id);
  const propertyManagerLogin = isPropertyManagerPortal && hasPropertyManagerSignal(user, profile);
  if (propertyManagerLogin) {
    profile = await repairPropertyManagerProfile(user, profile);
  }
  const role = propertyManagerLogin
    ? "property_manager"
    : normalizeRole(profile?.role || user.user_metadata?.role || fallbackRole);

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

  const email = value("loginEmail").toLowerCase();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password: document.getElementById("loginPassword")?.value || ""
  });

  if (error) {
    setFormLoading(loginForm, false, "Logging In...", "Log In");

    if (/email not confirmed/i.test(error.message)) {
      if (isPropertyManagerPortal) {
        showMessage("This property manager account is still finishing setup. Please try logging in again shortly.", "error");
        return;
      }

      const accessNote = pageRole === "contractor"
        ? "After verifying, a Turnly admin must approve the contractor account before dashboard data is visible."
        : "After verifying, a Turnly admin must link this account to a property before dashboard data is visible.";
      showVerificationPrompt(
        email,
        accessNote,
        "This account still needs email verification. Send another verification email to"
      );
      return;
    }

    showMessage(error.message, "error");
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
  const requestedPropertyName = isPropertyManagerPortal ? value("requestedPropertyName") : "";
  const password = document.getElementById("signupPassword")?.value || "";
  const verifyPassword = document.getElementById("verifyPassword")?.value || "";
  const fullName = `${firstName} ${lastName}`.trim();
  const normalizedSignupRole = normalizeRole(pageRole);
  const initialStatus = getInitialStatus(normalizedSignupRole);

  if (!firstName || !lastName || !email || !phone || !password || !verifyPassword) {
    showMessage("Fill out every field to create the account.", "error");
    return;
  }

  if (isPropertyManagerPortal && !requestedPropertyName) {
    showMessage("Enter the property or portfolio this account should be associated with.", "error");
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
      emailRedirectTo: authCallbackUrl(normalizedSignupRole),
      data: {
        first_name: firstName,
        last_name: lastName,
        full_name: fullName,
        phone,
        requested_property_name: requestedPropertyName,
        role: normalizedSignupRole,
        status: initialStatus,
        contractor_approved: initialStatus === "active"
      }
    }
  });

  if (error) {
    showMessage(error.message, "error");
    setFormLoading(signupForm, false, "Creating Account...", `Create ${pageLabel} Account`);
    return;
  }

  if (data?.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
    showMessage(
      isPropertyManagerPortal
        ? "That email already has a Turnly account. Use Log In instead."
        : "That email already has a Turnly account. Use Log In instead. If the email was never verified, logging in will let you resend the verification email.",
      "error"
    );
    setFormLoading(signupForm, false, "Creating Account...", `Create ${pageLabel} Account`);
    return;
  }

  if (data?.session && data?.user) {
    await syncSignupProfile(data.user, {
      email,
      fullName,
      phone,
      role: normalizedSignupRole,
      requestedPropertyName
    });
    await waitForProfile(data.user.id);
    const didRoute = await routeAuthenticatedUser(data.user, normalizedSignupRole);
    if (!didRoute) {
      setFormLoading(signupForm, false, "Creating Account...", `Create ${pageLabel} Account`);
    }
    return;
  }

  if (isPropertyManagerPortal && data?.user) {
    await syncSignupProfile(data.user, {
      email,
      fullName,
      phone,
      role: normalizedSignupRole,
      requestedPropertyName
    });
    await waitForProfile(data.user.id);

    const signInResult = await supabase.auth.signInWithPassword({ email, password });

    if (!signInResult.error && signInResult.data?.user) {
      const didRoute = await routeAuthenticatedUser(signInResult.data.user, normalizedSignupRole);
      if (!didRoute) {
        setFormLoading(signupForm, false, "Creating Account...", `Create ${pageLabel} Account`);
      }
      return;
    }

    if (signInResult.error && !/email not confirmed/i.test(signInResult.error.message)) {
      showMessage(signInResult.error.message, "error");
      setFormLoading(signupForm, false, "Creating Account...", `Create ${pageLabel} Account`);
      return;
    }

    showMode("login");
    const loginEmailInput = document.getElementById("loginEmail");
    if (loginEmailInput) loginEmailInput.value = email;
    showMessage(
      `Account created. ${propertyManagerAccessNote(requestedPropertyName)} You can log in without email verification once setup finishes.`,
      "success"
    );
    setFormLoading(signupForm, false, "Creating Account...", `Create ${pageLabel} Account`);
    return;
  }

  const accessNote = pageRole === "contractor"
    ? "A Turnly admin must approve the contractor account before dashboard data is visible."
    : propertyManagerAccessNote(requestedPropertyName);
  showVerificationPrompt(email, accessNote);
  setFormLoading(signupForm, false, "Creating Account...", `Create ${pageLabel} Account`);
});
