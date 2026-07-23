import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";
import {
  buildPreviewEffectiveUser,
  resolvePreviewProfile,
  resolvePreviewProperty,
  verifyAdminPreviewSession
} from "./admin-preview-context.js?v=20260723-admin-preview-roles";

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
    const previewSession = await verifyAdminPreviewSession(supabase, user);
    if (previewSession?.preview?.portal === "contractor") {
      const previewProfile = await resolvePreviewProfile(supabase, previewSession.preview, "contractor");
      const previewUser = buildPreviewEffectiveUser(previewProfile, user, "contractor");
      if (!previewProfile || !previewUser) {
        renderNotice("Preview unavailable", "Turnly could not find the selected contractor profile for admin preview.");
      } else {
        window.turnlyAdminPreviewContext = {
          ...previewSession,
          effectiveRole: "contractor",
          effectiveProfile: previewProfile,
          effectiveUser: previewUser,
          property: await resolvePreviewProperty(supabase, previewSession.preview)
        };
        await import("./contractor-portal.js?v=20260723-admin-preview-roles");
        await import("./contractor-job-flow-mobile.js?v=20260715-contract-access-notes");
      }
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
    } else if (!isActiveProfile(profile)) {
      const setupNote = profile.access_setup_error
        ? " Ask Turnly to finish the account-access setup if this does not appear in the admin requests panel."
        : "";
      renderNotice(
        "Approval pending",
        `Your contractor account is active, but it must be approved by Turnly before assignment data is visible.${setupNote}`
      );
    } else {
      await import("./contractor-portal.js?v=20260720-portal-theme-toggle");
      await import("./contractor-job-flow-mobile.js?v=20260715-contract-access-notes");
    }
    }
  }
}
