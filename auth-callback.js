import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const env = window.__ENV || {};
const supabase = env.SUPABASE_URL && env.SUPABASE_ANON_KEY
  ? createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY)
  : null;

const portalByRole = {
  admin: "admin.html",
  contractor: "contractor.html",
  property_manager: "property-manager.html",
  sales: "sales.html",
  sales_team: "sales.html"
};

const titleEl = document.getElementById("callbackTitle");
const messageEl = document.getElementById("callbackMessage");
const actionEl = document.getElementById("callbackAction");
const passwordForm = document.getElementById("callbackPasswordForm");
const searchParams = new URLSearchParams(window.location.search);
const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
const preferredPortal = normalizeRole(searchParams.get("portal") || hashParams.get("portal") || "contractor");
const callbackIntent = normalizeToken(searchParams.get("intent") || hashParams.get("intent"));
const callbackType = normalizeToken(searchParams.get("type") || hashParams.get("type"));
const isPasswordRecovery = callbackIntent === "password_reset" || callbackType === "recovery";

function normalizeToken(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

function normalizeRole(role) {
  return normalizeToken(role) || "contractor";
}

function loginFallback() {
  return preferredPortal === "property_manager"
    ? "property-manager-login.html"
    : "contractor-login.html";
}

function showStatus(title, message, tone = "", actionHref = "", actionText = "") {
  if (titleEl) titleEl.textContent = title;
  if (messageEl) {
    messageEl.textContent = message;
    if (tone) {
      messageEl.dataset.tone = tone;
    } else {
      delete messageEl.dataset.tone;
    }
  }
  if (actionEl) {
    actionEl.hidden = !actionHref;
    if (actionHref) actionEl.href = actionHref;
    if (actionText) actionEl.textContent = actionText;
  }
}

function getAuthError() {
  const error = searchParams.get("error") || hashParams.get("error");
  if (!error) return "";
  return searchParams.get("error_description") || hashParams.get("error_description") || error;
}

async function getProfile(userId) {
  const { data, error } = await supabase
    .from("profiles")
    .select("role, status, contractor_approved, property_manager_property_id")
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

  return fallback.data ? { ...fallback.data, role: normalizeRole(fallback.data.role) } : null;
}

async function waitForProfile(userId) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const profile = await getProfile(userId);
    if (profile?.role) return profile;
    await new Promise((resolve) => setTimeout(resolve, 350));
  }

  return null;
}

async function resolveSession() {
  const authError = getAuthError();
  if (authError) throw new Error(authError);

  const code = searchParams.get("code");
  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) throw error;
    return data?.session || null;
  }

  const tokenHash = searchParams.get("token_hash") || hashParams.get("token_hash");
  if (tokenHash) {
    const type = searchParams.get("type") || hashParams.get("type") || "email";
    const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (error) throw error;
    return data?.session || null;
  }

  const accessToken = hashParams.get("access_token");
  const refreshToken = hashParams.get("refresh_token");
  if (accessToken && refreshToken) {
    const { data, error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken
    });
    if (error) throw error;
    return data?.session || null;
  }

  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (data?.session) return data.session;

  await new Promise((resolve) => setTimeout(resolve, 300));
  const retry = await supabase.auth.getSession();
  if (retry.error) throw retry.error;
  return retry.data?.session || null;
}

async function routeUser() {
  if (!supabase) {
    throw new Error("Supabase config is missing.");
  }

  const session = await resolveSession();
  let user = session?.user || null;

  if (!user) {
    const { data, error } = await supabase.auth.getUser();
    if (error) throw error;
    user = data?.user || null;
  }

  if (!user) {
    throw new Error("We could not finish signing you in. Please return to the portal and log in.");
  }

  if (isPasswordRecovery) {
    showPasswordResetForm();
    return;
  }

  showStatus("Email verified", "Your account is verified. Taking you to the right dashboard...", "success");

  const profile = await waitForProfile(user.id);
  const metadataRole = normalizeToken(user.user_metadata?.role);
  const role = metadataRole === "property_manager"
    ? "property_manager"
    : normalizeRole(profile?.role || metadataRole || preferredPortal);
  const destination = portalByRole[role] || portalByRole[preferredPortal] || "contractor.html";

  window.setTimeout(() => {
    window.location.replace(destination);
  }, 700);
}

function showPasswordResetForm() {
  if (passwordForm) passwordForm.hidden = false;
  showStatus(
    "Set a new password",
    "Enter a new password for your Turnly account.",
    "success",
    "",
    ""
  );
}

function setPasswordFormLoading(isLoading) {
  const button = passwordForm?.querySelector("button[type='submit']");
  if (!button) return;
  button.disabled = isLoading;
  button.textContent = isLoading ? "Updating Password..." : "Update Password";
}

passwordForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!supabase) {
    showStatus("Password reset unavailable", "Supabase config is missing.", "error", loginFallback(), "Return To Log In");
    return;
  }

  const password = document.getElementById("callbackNewPassword")?.value || "";
  const verifyPassword = document.getElementById("callbackVerifyPassword")?.value || "";

  if (password.length < 6) {
    showStatus("Set a new password", "Password must be at least 6 characters.", "error");
    return;
  }

  if (password !== verifyPassword) {
    showStatus("Set a new password", "Passwords do not match.", "error");
    return;
  }

  setPasswordFormLoading(true);
  showStatus("Updating password", "Saving your new password...");

  const { error } = await supabase.auth.updateUser({ password });
  setPasswordFormLoading(false);

  if (error) {
    showStatus("Password reset failed", error.message, "error");
    return;
  }

  passwordForm.hidden = true;
  await supabase.auth.signOut();
  showStatus("Password updated", "Your password was updated. You can log in with the new password now.", "success", loginFallback(), "Return To Log In");
});

routeUser().catch((error) => {
  showStatus(
    "Verification needs another try",
    error?.message || "This verification link could not be completed.",
    "error",
    loginFallback(),
    "Return To Log In"
  );
});
