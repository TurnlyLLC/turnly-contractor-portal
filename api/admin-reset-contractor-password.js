const { createClient } = require("@supabase/supabase-js");

const allowedAdminRoles = new Set(["admin", "owner", "super_admin"]);
const contractorRoles = new Set(["contractor", "vendor", "cleaner", "service_provider"]);

function normalizeToken(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

function sendJson(res, statusCode, body) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL
    || process.env.NEXT_PUBLIC_SUPABASE_URL
    || process.env.VITE_SUPABASE_URL
    || "https://nwnzdoveskthebfyndcs.supabase.co";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    || process.env.SUPABASE_SERVICE_KEY
    || process.env.SUPABASE_SERVICE_ROLE
    || process.env.SUPABASE_SECRET_KEY;

  if (!url || !serviceKey) {
    const missing = [
      !url ? "SUPABASE_URL" : "",
      !serviceKey ? "SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY" : ""
    ].filter(Boolean).join(" and ");
    return {
      error: new Error(`Server reset route is missing ${missing}. Add it to the production server environment, then redeploy.`)
    };
  }

  return {
    client: createClient(url, serviceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })
  };
}

function bearerToken(req) {
  const header = req.headers.authorization || req.headers.Authorization || "";
  const match = String(header).match(/^Bearer\s+(.+)$/i);
  return match?.[1] || "";
}

async function requireAdmin(supabase, req) {
  const token = bearerToken(req);
  if (!token) return { error: "Missing admin session.", status: 401 };

  const { data: userResult, error: userError } = await supabase.auth.getUser(token);
  const user = userResult?.user || null;
  if (userError || !user) return { error: "Admin session is invalid.", status: 401 };

  const metadataRole = normalizeToken(user.app_metadata?.role || user.user_metadata?.role);
  if (allowedAdminRoles.has(metadataRole)) return { user };

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id,role,status")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) return { error: profileError.message, status: 500 };
  if (!allowedAdminRoles.has(normalizeToken(profile?.role))) {
    return { error: "Only admins can reset contractor passwords.", status: 403 };
  }

  return { user };
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

async function findContractorProfile(supabase, contractorUserId, email) {
  let query = supabase
    .from("profiles")
    .select("id,email,full_name,role,status,contractor_approved")
    .limit(1);

  if (contractorUserId) {
    query = query.eq("id", contractorUserId);
  } else if (email) {
    query = query.ilike("email", email);
  } else {
    return null;
  }

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data || null;
}

function isContractorProfile(profile) {
  const role = normalizeToken(profile?.role);
  if (role === "property_manager" || role === "propertymanagement" || role === "property_management") return false;
  return contractorRoles.has(role) || profile?.contractor_approved === true;
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, { error: "Method not allowed." });
  }

  const { client: supabase, error: configError } = getSupabaseAdmin();
  if (configError) return sendJson(res, 500, { error: configError.message });

  const admin = await requireAdmin(supabase, req);
  if (admin.error) return sendJson(res, admin.status || 403, { error: admin.error });

  let body = {};
  try {
    body = await readJsonBody(req);
  } catch {
    return sendJson(res, 400, { error: "Invalid JSON body." });
  }

  const contractorUserId = String(body.contractorUserId || "").trim();
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");

  if (!password || password.length < 8) {
    return sendJson(res, 400, { error: "Password must be at least 8 characters." });
  }

  let profile = null;
  try {
    profile = await findContractorProfile(supabase, contractorUserId, email);
  } catch (error) {
    return sendJson(res, 500, { error: error.message || "Unable to verify contractor profile." });
  }

  if (!profile?.id) return sendJson(res, 404, { error: "Registered contractor profile was not found." });
  if (!isContractorProfile(profile)) {
    return sendJson(res, 400, { error: "Selected user is not a contractor account." });
  }

  const { data: targetResult, error: targetError } = await supabase.auth.admin.getUserById(profile.id);
  const targetUser = targetResult?.user || null;
  if (targetError || !targetUser) {
    return sendJson(res, 404, { error: targetError?.message || "Contractor auth account was not found." });
  }

  const now = new Date().toISOString();
  const appMetadata = {
    ...(targetUser.app_metadata || {}),
    turnly_force_password_change: true,
    turnly_password_reset_by_admin_at: now,
    turnly_password_reset_by_admin_id: admin.user.id
  };
  const userMetadata = {
    ...(targetUser.user_metadata || {}),
    turnly_force_password_change: true,
    turnly_password_reset_by_admin_at: now
  };

  const { error: updateError } = await supabase.auth.admin.updateUserById(profile.id, {
    password,
    app_metadata: appMetadata,
    user_metadata: userMetadata
  });

  if (updateError) return sendJson(res, 500, { error: updateError.message });

  return sendJson(res, 200, {
    ok: true,
    contractor: {
      id: profile.id,
      name: profile.full_name || "",
      email: profile.email || email
    }
  });
};
