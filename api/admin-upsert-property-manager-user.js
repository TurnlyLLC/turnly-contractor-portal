const { createClient } = require("@supabase/supabase-js");

const allowedAdminRoles = new Set(["admin", "owner", "super_admin"]);

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
      error: new Error(`Server property manager route is missing ${missing}. Add it to the production server environment, then redeploy.`)
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
    return { error: "Only admins can create property manager accounts.", status: 403 };
  }

  return { user };
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function missingColumn(error) {
  const msg = String(error?.message || "");
  return msg.match(/Could not find the '([^']+)' column/)?.[1] || msg.match(/column "([^"]+)"/)?.[1] || "";
}

async function writeFallback(supabase, table, payload, match = {}) {
  const next = { ...payload };
  for (let i = 0; i < 18; i += 1) {
    let query = supabase.from(table);
    const hasMatch = Object.keys(match).length > 0;
    query = hasMatch ? query.update(next) : query.insert(next);
    Object.entries(match).forEach(([key, value]) => {
      query = query.eq(key, value);
    });
    const result = await query.select("*").maybeSingle();
    if (!result.error) return result;
    const missing = missingColumn(result.error);
    if (missing && missing in next && Object.keys(next).length > 2) {
      delete next[missing];
      continue;
    }
    return result;
  }
  return { data: null, error: new Error(`Unable to save ${table}.`) };
}

async function findProfileByEmail(supabase, email) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id,email,full_name,role,status,property_manager_property_id,requested_property_name,contractor_approved")
    .ilike("email", email)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

function isPropertyManagerProfile(profile = {}) {
  return normalizeToken(profile.role) === "property_manager" ||
    Boolean(profile.property_manager_property_id) ||
    Boolean(profile.requested_property_name);
}

async function findAuthUserByEmail(supabase, email) {
  const normalized = String(email || "").trim().toLowerCase();
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const user = (data?.users || []).find((item) => String(item.email || "").toLowerCase() === normalized);
    if (user) return user;
    if (!data?.users?.length || data.users.length < 1000) break;
  }
  return null;
}

function fullNameFromBody(body = {}) {
  return String(body.full_name || `${body.first_name || ""} ${body.last_name || ""}`).trim();
}

function propertyMetadata(body = {}) {
  return {
    address: String(body.property_address || "").trim(),
    source_label: String(body.property_source_label || "").trim(),
    assigned_from: "admin_create_property_manager"
  };
}

async function createOrUpdateAuthUser(supabase, body, adminUserId) {
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  const fullName = fullNameFromBody(body);
  const firstName = String(body.first_name || "").trim();
  const lastName = String(body.last_name || "").trim();
  const now = new Date().toISOString();
  const baseAppMetadata = {
    role: "property_manager",
    turnly_force_password_change: true,
    turnly_temp_password_created_at: now,
    turnly_temp_password_created_by: adminUserId
  };
  const baseUserMetadata = {
    full_name: fullName,
    first_name: firstName,
    last_name: lastName,
    role: "property_manager",
    property_manager_property_id: String(body.portal_property_id || "").trim(),
    requested_property_name: String(body.property_name || body.requested_property_name || "").trim(),
    turnly_force_password_change: true,
    turnly_temp_password_created_at: now
  };

  const createResult = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: baseAppMetadata,
    user_metadata: baseUserMetadata
  });

  if (!createResult.error && createResult.data?.user) return createResult.data.user;

  const message = String(createResult.error?.message || "").toLowerCase();
  const alreadyExists = message.includes("already") || message.includes("registered") || message.includes("exists");
  if (!alreadyExists) throw createResult.error;

  let targetUser = await findAuthUserByEmail(supabase, email);
  if (!targetUser?.id) throw new Error("Auth user already exists, but the account could not be loaded for activation.");

  const appMetadata = {
    ...(targetUser.app_metadata || {}),
    ...baseAppMetadata
  };
  const userMetadata = {
    ...(targetUser.user_metadata || {}),
    ...baseUserMetadata
  };
  const { data, error } = await supabase.auth.admin.updateUserById(targetUser.id, {
    password,
    email_confirm: true,
    app_metadata: appMetadata,
    user_metadata: userMetadata
  });
  if (error) throw error;
  return data?.user || targetUser;
}

async function upsertProfile(supabase, user, body, adminUserId) {
  const now = new Date().toISOString();
  const portalPropertyId = String(body.portal_property_id || "").trim() || null;
  const propertyName = String(body.property_name || body.requested_property_name || "").trim();
  const profilePayload = {
    id: user.id,
    email: user.email || String(body.email || "").trim().toLowerCase(),
    full_name: fullNameFromBody(body),
    first_name: String(body.first_name || "").trim(),
    last_name: String(body.last_name || "").trim(),
    role: "property_manager",
    team: "property_manager",
    status: "active",
    contractor_approved: true,
    approval_status: "approved",
    property_manager_property_id: portalPropertyId,
    requested_property_name: propertyName,
    invited_by_admin: true,
    invited_by: adminUserId,
    invited_at: now
  };

  const { data, error } = await supabase
    .from("profiles")
    .upsert(profilePayload, { onConflict: "id" })
    .select("*")
    .maybeSingle();
  if (!error) return data;

  const fallback = await writeFallback(supabase, "profiles", profilePayload, { id: user.id });
  if (!fallback.error && fallback.data) return fallback.data;

  const insertFallback = await writeFallback(supabase, "profiles", profilePayload);
  if (insertFallback.error) throw insertFallback.error;
  return insertFallback.data;
}

async function existingPropertyLink(supabase, profileId, body = {}) {
  const portalPropertyId = String(body.portal_property_id || "").trim();
  const contractId = String(body.contract_id || "").trim();
  const propertyName = String(body.property_name || "").trim();
  let query = supabase.from("property_manager_property_links").select("id").eq("profile_id", profileId);
  if (portalPropertyId) query = query.eq("portal_property_id", portalPropertyId);
  else if (contractId) query = query.eq("contract_id", contractId);
  else if (propertyName) query = query.eq("property_name", propertyName);
  else return null;
  const { data, error } = await query.maybeSingle();
  if (error) return null;
  return data || null;
}

async function syncPropertyAccess(supabase, profileId, body = {}) {
  const portalPropertyId = String(body.portal_property_id || "").trim() || null;
  const contractId = String(body.contract_id || "").trim() || null;
  const propertyName = String(body.property_name || "").trim();
  if (!portalPropertyId && !contractId && !propertyName) return;

  const payload = {
    profile_id: profileId,
    portal_property_id: portalPropertyId,
    contract_id: contractId,
    property_name: propertyName,
    access_level: "manager",
    status: "active",
    metadata: propertyMetadata(body)
  };
  const existing = await existingPropertyLink(supabase, profileId, body);
  const result = existing?.id
    ? await writeFallback(supabase, "property_manager_property_links", payload, { id: existing.id })
    : await writeFallback(supabase, "property_manager_property_links", payload);
  if (result.error) throw result.error;
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

  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  const firstName = String(body.first_name || "").trim();
  const lastName = String(body.last_name || "").trim();
  if (!firstName || !lastName) return sendJson(res, 400, { error: "First and last name are required." });
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return sendJson(res, 400, { error: "A valid property manager email is required." });
  }
  if (!password || password.length < 8) {
    return sendJson(res, 400, { error: "Temporary password must be at least 8 characters." });
  }

  try {
    const existingProfile = await findProfileByEmail(supabase, email);
    if (existingProfile?.id && !isPropertyManagerProfile(existingProfile)) {
      return sendJson(res, 409, {
        error: `That email already belongs to a ${existingProfile.role || "non-property-manager"} account. Use a different email or update that account intentionally.`
      });
    }
    if (existingProfile?.id && !body.portal_property_id && existingProfile.property_manager_property_id) {
      body.portal_property_id = existingProfile.property_manager_property_id;
      body.property_name = body.property_name || existingProfile.requested_property_name || "";
    }

    const user = await createOrUpdateAuthUser(supabase, body, admin.user.id);
    const profile = await upsertProfile(supabase, user, body, admin.user.id);
    await syncPropertyAccess(supabase, user.id, body);

    return sendJson(res, 200, {
      ok: true,
      property_manager: {
        id: user.id,
        email: user.email || email,
        name: profile?.full_name || fullNameFromBody(body),
        status: profile?.status || "active",
        property_manager_property_id: profile?.property_manager_property_id || body.portal_property_id || null,
        requested_property_name: profile?.requested_property_name || body.property_name || ""
      }
    });
  } catch (error) {
    return sendJson(res, 500, { error: error.message || "Unable to create property manager account." });
  }
};
