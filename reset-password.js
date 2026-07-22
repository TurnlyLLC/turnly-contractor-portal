import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const env = window.__ENV || {};
const supabase = env.SUPABASE_URL && env.SUPABASE_ANON_KEY
  ? createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY)
  : null;

const searchParams = new URLSearchParams(window.location.search);
const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
const preferredPortal = normalizeRole(
  searchParams.get("portal") ||
  hashParams.get("portal") ||
  window.localStorage?.getItem("turnly_reset_portal") ||
  "contractor"
);

const titleEl = document.getElementById("resetTitle");
const messageEl = document.getElementById("resetMessage");
const actionEl = document.getElementById("resetAction");
const passwordForm = document.getElementById("resetPasswordForm");

let recoveryEventSession = null;
let recoveryEventResolved = false;
let resolveRecoveryEvent = null;
const recoveryEventPromise = new Promise((resolve) => {
  resolveRecoveryEvent = resolve;
  window.setTimeout(() => {
    recoveryEventResolved = true;
    resolve(null);
  }, 650);
});

if (supabase) {
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
      recoveryEventSession = session || null;
      if (!recoveryEventResolved && resolveRecoveryEvent) {
        recoveryEventResolved = true;
        resolveRecoveryEvent(recoveryEventSession);
      }
    }
  });
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

function loginFallback() {
  return preferredPortal === "property_manager"
    ? "property-manager-login.html"
    : "contractor-login.html";
}

function getAuthError() {
  const error = searchParams.get("error") || hashParams.get("error");
  if (!error) return "";
  return searchParams.get("error_description") || hashParams.get("error_description") || error;
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

function showPasswordForm() {
  if (passwordForm) passwordForm.hidden = false;
  showStatus("Set a new password", "Enter and confirm your new Turnly password.", "success");
}

function setPasswordFormLoading(isLoading) {
  const button = passwordForm?.querySelector("button[type='submit']");
  if (!button) return;
  button.disabled = isLoading;
  button.textContent = isLoading ? "Updating Password..." : "Update Password";
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
    const type = searchParams.get("type") || hashParams.get("type") || "recovery";
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

  const eventSession = await recoveryEventPromise;
  if (eventSession?.user) return eventSession;

  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (data?.session) return data.session;

  await new Promise((resolve) => setTimeout(resolve, 300));
  const retry = await supabase.auth.getSession();
  if (retry.error) throw retry.error;
  return retry.data?.session || null;
}

async function initializeReset() {
  if (!supabase) {
    throw new Error("Supabase config is missing.");
  }

  let session = await resolveSession();
  if (!session?.user && recoveryEventSession?.user) {
    session = recoveryEventSession;
  }

  if (!session?.user) {
    throw new Error("This reset link could not be completed. Please request a new password reset link.");
  }

  showPasswordForm();
}

passwordForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!supabase) {
    showStatus("Password reset unavailable", "Supabase config is missing.", "error", loginFallback(), "Return To Log In");
    return;
  }

  const password = document.getElementById("newPassword")?.value || "";
  const verifyPassword = document.getElementById("verifyPassword")?.value || "";

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
  window.localStorage?.removeItem("turnly_reset_portal");
  await supabase.auth.signOut();
  showStatus("Password updated", "Your password was updated. You can log in with the new password now.", "success", loginFallback(), "Return To Log In");
});

initializeReset().catch((error) => {
  if (passwordForm) passwordForm.hidden = true;
  showStatus(
    "Reset link needs another try",
    error?.message || "This reset link could not be completed.",
    "error",
    loginFallback(),
    "Request New Reset Link"
  );
});
