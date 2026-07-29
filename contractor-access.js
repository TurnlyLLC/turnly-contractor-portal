import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const env = window.__ENV || {};
const supabase = env.SUPABASE_URL && env.SUPABASE_ANON_KEY
  ? createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY)
  : null;

const roleDashboards = {
  admin: "admin.html",
  contractor: "contractor.html",
  sales: "sales.html",
  sales_team: "sales.html",
  property_manager: "property-manager.html"
};

function normalizeRole(role) {
  return String(role || "contractor")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

function normalizeToken(value) {
  return String(value || "")
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
  return profile?.contractor_approved === true ||
    ["active", "approved", "enabled"].includes(normalizeStatus(profile?.status));
}

function getPortalHome(role) {
  return roleDashboards[normalizeRole(role)] || "contractor.html";
}

function renderNotice(title, body) {
  const portalRoot = document.getElementById("contractorPortalApp");
  const dashboardGrid = document.querySelector("#contractorDashboard .grid");
  const availableList = document.getElementById("contractorAssignments");
  const myList = document.getElementById("myAssignments");
  const markup = `
    <div class="access-notice">
      <h2>${title}</h2>
      <p>${body}</p>
    </div>
  `;

  [portalRoot, dashboardGrid, availableList, myList].forEach((target) => {
    if (target) target.innerHTML = markup;
  });
}

function metadataFlag(value) {
  return value === true || String(value || "").toLowerCase() === "true";
}

function timeValue(value) {
  const parsed = Date.parse(value || "");
  return Number.isFinite(parsed) ? parsed : 0;
}

function requiresPasswordChange(user) {
  const appMetadata = user?.app_metadata || {};
  const userMetadata = user?.user_metadata || {};
  const resetAt = appMetadata.turnly_password_reset_by_admin_at || userMetadata.turnly_password_reset_by_admin_at || "";
  const changedAt = userMetadata.turnly_password_changed_at || "";
  if (resetAt && changedAt && timeValue(changedAt) >= timeValue(resetAt)) return false;

  return metadataFlag(appMetadata.turnly_force_password_change)
    || metadataFlag(appMetadata.force_password_change)
    || metadataFlag(userMetadata.turnly_force_password_change)
    || metadataFlag(userMetadata.force_password_change);
}

function injectPasswordPromptStyles() {
  if (document.getElementById("forcedPasswordChangeStyles")) return;
  const style = document.createElement("style");
  style.id = "forcedPasswordChangeStyles";
  style.textContent = `
    .contractor-password-change{margin:24px auto;max-width:560px}.forced-password-form{display:grid;gap:14px;margin-top:18px}.forced-password-form label{display:grid;gap:6px;text-align:left}.forced-password-form span{font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}.forced-password-form input{background:#fff;border:1px solid rgba(148,163,184,.4);border-radius:8px;color:#001a33;font:inherit;min-height:44px;padding:0 12px}.forced-password-form button{background:#06d6a0;border:0;border-radius:8px;color:#001a33;cursor:pointer;font-weight:900;min-height:44px;padding:0 16px}.forced-password-form p{font-size:13px;margin:0}.forced-password-form p.error{color:#ff6b84}
  `;
  document.head.appendChild(style);
}

function setForcedPasswordMessage(message, error = false) {
  const el = document.getElementById("forcedPasswordMessage");
  if (!el) return;
  el.textContent = message || "";
  el.classList.toggle("error", error);
}

async function clearForcedPasswordFlag(user, changedAt) {
  await supabase.auth.updateUser({
    data: {
      ...(user?.user_metadata || {}),
      turnly_force_password_change: false,
      turnly_password_changed_at: changedAt
    }
  });

  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token || "";
  if (!token) return;

  await fetch("/api/contractor-password-change-complete", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ changedAt })
  }).catch(() => null);
}

async function renderPasswordChangeRequired(user) {
  injectPasswordPromptStyles();
  const portalRoot = document.getElementById("contractorPortalApp");
  if (portalRoot) {
    portalRoot.innerHTML = `
      <div class="access-notice contractor-password-change">
        <h2>Change your password</h2>
        <p>A Turnly admin reset your password. Choose your own password to continue into the contractor portal.</p>
        <form id="forcedPasswordChangeForm" class="forced-password-form">
          <label><span>New password</span><input id="forcedNewPassword" type="password" autocomplete="new-password" minlength="8" required /></label>
          <label><span>Confirm password</span><input id="forcedConfirmPassword" type="password" autocomplete="new-password" minlength="8" required /></label>
          <p id="forcedPasswordMessage" aria-live="polite"></p>
          <button type="submit">Update Password</button>
        </form>
      </div>
    `;
  }

  const form = document.getElementById("forcedPasswordChangeForm");
  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const password = document.getElementById("forcedNewPassword")?.value || "";
    const confirmPassword = document.getElementById("forcedConfirmPassword")?.value || "";
    const button = form.querySelector("button[type='submit']");

    if (password.length < 8) {
      setForcedPasswordMessage("Password must be at least 8 characters.", true);
      return;
    }
    if (password !== confirmPassword) {
      setForcedPasswordMessage("Passwords do not match.", true);
      return;
    }

    if (button) button.disabled = true;
    setForcedPasswordMessage("Updating password...");

    const changedAt = new Date().toISOString();
    const { error } = await supabase.auth.updateUser({
      password,
      data: {
        ...(user?.user_metadata || {}),
        turnly_force_password_change: false,
        turnly_password_changed_at: changedAt
      }
    });

    if (error) {
      if (button) button.disabled = false;
      setForcedPasswordMessage(error.message || "Unable to update password.", true);
      return;
    }

    await clearForcedPasswordFlag(user, changedAt);
    await supabase.auth.refreshSession().catch(() => null);
    setForcedPasswordMessage("Password updated. Loading your portal...");
    window.location.reload();
  });
}

async function loadContractorPortal() {
  await import("./contractor-portal.js?v=20260729-contractor-new-message");
  await import("./contractor-job-flow-mobile.js?v=20260729-checklist-media-autosave");
}

async function getProfile(userId) {
  const { data, error } = await supabase
    .from("profiles")
    .select("role, status, contractor_approved")
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
    access_setup_error: !fallback.data.status
  };
}

document.getElementById("logoutBtn")?.addEventListener("click", async () => {
  await supabase?.auth.signOut();
  window.location.href = "https://portal.turnlypros.com/";
});

if (!supabase) {
  renderNotice("Configuration needed", "Supabase configuration is missing for this deployment.");
} else {
  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user || null;

  if (!user) {
    window.location.href = "contractor-login.html";
  } else {
    const profile = await getProfile(user.id);
    const metadataRole = normalizeToken(user.user_metadata?.role);
    const role = metadataRole === "property_manager"
      ? "property_manager"
      : normalizeRole(profile?.role || user.user_metadata?.role);

    if (!profile) {
      window.location.href = "contractor-login.html";
    } else if (role === "property_manager") {
      window.location.href = "property-manager.html";
    } else if (role !== "contractor") {
      window.location.href = getPortalHome(role);
    } else if (requiresPasswordChange(user)) {
      await renderPasswordChangeRequired(user);
    } else if (!isActiveProfile(profile)) {
      const setupNote = profile.access_setup_error
        ? " Ask Turnly to finish the account-access setup if this does not appear in the admin requests panel."
        : "";
      renderNotice(
        "Approval pending",
        `Your contractor account is active, but it must be approved by Turnly before assignment data is visible.${setupNote}`
      );
    } else {
      await loadContractorPortal();
    }
  }
}
