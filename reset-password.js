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
const requestForm = document.getElementById("resetRequestForm");
const passwordForm = document.getElementById("resetPasswordForm");
const resetPortal = document.getElementById("resetPortal");
const resetEmail = document.getElementById("resetEmail");
const recoveryType = normalizeToken(searchParams.get("type") || hashParams.get("type"));
const hasRecoveryParams = recoveryType === "recovery" ||
  Boolean(searchParams.get("code")) ||
  Boolean(searchParams.get("token_hash") || hashParams.get("token_hash")) ||
  Boolean(hashParams.get("access_token") && hashParams.get("refresh_token"));

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

if (resetPortal) {
  resetPortal.value = preferredPortal === "property_manager" ? "property_manager" : "contractor";
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

function passwordResetUrl(role = preferredPortal) {
  const url = new URL("reset-password.html", window.location.origin);
  url.searchParams.set("portal", normalizeRole(role));
  return url.toString();
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

function showRequestForm(title = "Send yourself a reset link", message = "Enter the email address connected to your Turnly account.", tone = "") {
  if (requestForm) requestForm.hidden = false;
  if (passwordForm) passwordForm.hidden = true;
  showStatus(title, message, tone);
}

function showPasswordForm() {
  if (requestForm) requestForm.hidden = true;
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

  if (!hasRecoveryParams) {
    showRequestForm();
    return;
  }

  showStatus("Checking your reset link", "Hold tight while we confirm this reset link.");

  let session = await resolveSession();
  if (!session?.user && recoveryEventSession?.user) {
    session = recoveryEventSession;
  }

  if (!session?.user) {
    throw new Error("This reset link could not be completed. Please request a new password reset link.");
  }

  showPasswordForm();
}

requestForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!supabase) {
    showStatus("Password reset unavailable", "Supabase config is missing.", "error");
    return;
  }

  const email = resetEmail?.value.trim().toLowerCase() || "";
  const role = normalizeRole(resetPortal?.value || preferredPortal);

  if (!email) {
    showStatus("Send yourself a reset link", "Enter the email address for your Turnly account.", "error");
    return;
  }

  const button = requestForm.querySelector("button[type='submit']");
  if (button) {
    button.disabled = true;
    button.textContent = "Sending Reset Link...";
  }

  showStatus("Sending reset link", "Supabase is sending the password reset email...");
  window.localStorage?.setItem("turnly_reset_portal", role);

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: passwordResetUrl(role)
  });

  if (button) {
    button.disabled = false;
    button.textContent = "Send Reset Link";
  }

  if (error) {
    showStatus("Reset link failed", error.message, "error");
    return;
  }

  showStatus(
    "Check your email",
    "If that email has a Turnly account, a password reset link has been sent. Check spam or promotions if it is not in the inbox.",
    "success"
  );
});

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
  showRequestForm(
    "Reset link needs another try",
    error?.message || "This reset link could not be completed. Enter your email to request a new link.",
    "error"
  );
});
