import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const env = window.__ENV || {};
const supabase = env.SUPABASE_URL && env.SUPABASE_ANON_KEY
  ? createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY)
  : null;

const signupForm = document.getElementById("signupForm");
const signupMessage = document.getElementById("signupMessage");

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

function authCallbackUrl(role) {
  const url = new URL("auth-callback.html", window.location.origin);
  url.searchParams.set("portal", normalizeRole(role));
  return url.toString();
}

function getInputValue(id) {
  return document.getElementById(id)?.value.trim() || "";
}

function showMessage(text, tone = "") {
  if (!signupMessage) return;
  signupMessage.textContent = text;
  if (tone) {
    signupMessage.dataset.tone = tone;
  } else {
    delete signupMessage.dataset.tone;
  }
}

function setSubmitting(isSubmitting) {
  const button = signupForm?.querySelector("button[type='submit']");
  if (!button) return;
  button.disabled = isSubmitting;
  button.textContent = isSubmitting ? "Creating Account..." : "Create Account";
}

async function waitForProfile(userId) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { data } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .maybeSingle();

    if (data?.role) return data;
    await new Promise((resolve) => setTimeout(resolve, 350));
  }

  return null;
}

signupForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!supabase) {
    showMessage("Supabase config is missing. Check SUPABASE_URL and SUPABASE_ANON_KEY.", "error");
    return;
  }

  const firstName = getInputValue("firstName");
  const lastName = getInputValue("lastName");
  const email = getInputValue("email").toLowerCase();
  const password = document.getElementById("password")?.value || "";
  const confirmPassword = document.getElementById("confirmPassword")?.value || "";
  const role = getInputValue("accountType");
  const normalizedRole = normalizeRole(role);
  const fullName = `${firstName} ${lastName}`.trim();

  if (!firstName || !lastName || !email || !password || !role) {
    showMessage("Fill out every required field to create the account.", "error");
    return;
  }

  if (password.length < 6) {
    showMessage("Password must be at least 6 characters.", "error");
    return;
  }

  if (password !== confirmPassword) {
    showMessage("Passwords do not match.", "error");
    return;
  }

  setSubmitting(true);
  showMessage("Creating account...");

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: authCallbackUrl(normalizedRole),
      data: {
        first_name: firstName,
        last_name: lastName,
        full_name: fullName,
        role: normalizedRole
      }
    }
  });

  if (error) {
    showMessage(error.message, "error");
    setSubmitting(false);
    return;
  }

  if (data?.session && data?.user) {
    const profile = await waitForProfile(data.user.id);
    const nextRole = normalizeRole(profile?.role || data.user.user_metadata?.role || normalizedRole);
    window.location.href = portalByRole[nextRole] || "contractor.html";
    return;
  }

  showMessage("Account created. Check your email to verify it. The verification link will sign you in automatically.", "success");
  setSubmitting(false);
});
