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
      error: new Error(`Server contractor route is missing ${missing}. Add it to the production server environment, then redeploy.`)
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
    return { error: "Only admins can create contractor accounts.", status: 403 };
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

function uniqueList(values = []) {
  const seen = new Set();
  return values
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .filter((value) => {
      const key = value.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function listFrom(value) {
  if (Array.isArray(value)) return uniqueList(value);
  if (value && typeof value === "object") return uniqueList(Object.values(value));
  const text = String(value || "").trim();
  if (!text) return [];
  if ((text.startsWith("[") && text.endsWith("]")) || (text.startsWith("{") && text.endsWith("}"))) {
    try {
      return listFrom(JSON.parse(text));
    } catch {
      // Fall through to comma parsing.
    }
  }
  return uniqueList(text.split(","));
}

function contractorAccessPayload(body = {}) {
  return {
    allowed_regions: listFrom(body.allowed_regions || body.allowedRegions),
    allowed_property_ids: listFrom(body.allowed_property_ids || body.allowedPropertyIds),
    allowed_property_names: listFrom(body.allowed_property_names || body.allowedPropertyNames)
  };
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
    .select("id,email")
    .ilike("email", email)
    .maybeSingle();
  if (error) throw error;
  return data || null;
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

async function createOrUpdateAuthUser(supabase, body, adminUserId) {
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  const fullName = String(body.full_name || body.name || "").trim();
  const now = new Date().toISOString();
  const access = contractorAccessPayload(body);
  const baseAppMetadata = {
    role: "contractor",
    turnly_force_password_change: true,
    turnly_temp_password_created_at: now,
    turnly_temp_password_created_by: adminUserId
  };
  const baseUserMetadata = {
    full_name: fullName,
    phone: String(body.phone || "").trim(),
    company_name: String(body.company_name || "").trim(),
    service_type: String(body.service_type || "").trim(),
    market: String(body.market || "").trim(),
    role: "contractor",
    allowed_regions: access.allowed_regions,
    allowed_property_ids: access.allowed_property_ids,
    allowed_property_names: access.allowed_property_names,
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

  const profile = await findProfileByEmail(supabase, email);
  let targetUser = null;
  if (profile?.id) {
    const { data, error } = await supabase.auth.admin.getUserById(profile.id);
    if (error) throw error;
    targetUser = data?.user || null;
  }
  if (!targetUser) targetUser = await findAuthUserByEmail(supabase, email);
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
  const approved = body.contractor_approved !== false;
  const status = approved ? "active" : normalizeToken(body.status) || "pending_approval";
  const now = new Date().toISOString();
  const access = contractorAccessPayload(body);
  const services = Array.isArray(body.service_types)
    ? body.service_types
    : String(body.service_type || "").split(",").map((item) => item.trim()).filter(Boolean);
  const profilePayload = {
    id: user.id,
    email: user.email || String(body.email || "").trim().toLowerCase(),
    full_name: String(body.full_name || body.name || user.user_metadata?.full_name || "").trim(),
    phone: String(body.phone || "").trim(),
    role: "contractor",
    team: "contractor",
    status,
    contractor_approved: approved,
    approval_status: approved ? "approved" : "pending",
    company_name: String(body.company_name || "").trim(),
    business_name: String(body.company_name || "").trim(),
    service_type: String(body.service_type || "").trim(),
    service_types: services,
    market: String(body.market || "").trim(),
    region: String(body.market || body.region || "").trim(),
    location: String(body.market || body.location || "").trim(),
    notes: String(body.notes || "").trim(),
    allowed_regions: access.allowed_regions,
    allowed_property_ids: access.allowed_property_ids,
    allowed_property_names: access.allowed_property_names,
    invited_by_admin: true,
    invited_by: adminUserId,
    invited_at: now,
    contractor_approved_at: approved ? now : null
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

async function syncContractorInvite(supabase, user, body, adminUserId) {
  const email = String(body.email || user.email || "").trim().toLowerCase();
  if (!email) return;
  const now = new Date().toISOString();
  const access = contractorAccessPayload(body);
  const invite = {
    email,
    role: "contractor",
    status: "accepted",
    auto_approve: true,
    invited_by: adminUserId,
    accepted_by: user.id,
    accepted_at: now,
    allowed_regions: access.allowed_regions,
    allowed_property_ids: access.allowed_property_ids,
    allowed_property_names: access.allowed_property_names,
    metadata: {
      full_name: String(body.full_name || body.name || "").trim(),
      phone: String(body.phone || "").trim(),
      company_name: String(body.company_name || "").trim(),
      service_type: String(body.service_type || "").trim(),
      market: String(body.market || "").trim(),
      allowed_regions: access.allowed_regions,
      allowed_property_ids: access.allowed_property_ids,
      allowed_property_names: access.allowed_property_names
    }
  };

  const existing = await supabase.from("contractor_invites").select("id").ilike("email", email).maybeSingle();
  if (existing.error) return;
  if (existing.data?.id) {
    await writeFallback(supabase, "contractor_invites", invite, { id: existing.data.id });
    return;
  }
  await writeFallback(supabase, "contractor_invites", invite);
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
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return sendJson(res, 400, { error: "A valid contractor email is required." });
  }
  if (!password || password.length < 8) {
    return sendJson(res, 400, { error: "Temporary password must be at least 8 characters." });
  }

  try {
    const user = await createOrUpdateAuthUser(supabase, body, admin.user.id);
    const profile = await upsertProfile(supabase, user, body, admin.user.id);
    await syncContractorInvite(supabase, user, body, admin.user.id);

    return sendJson(res, 200, {
      ok: true,
      contractor: {
        id: user.id,
        email: user.email || email,
        name: profile?.full_name || body.full_name || body.name || "",
        status: profile?.status || "active",
        contractor_approved: profile?.contractor_approved !== false
      }
    });
  } catch (error) {
    return sendJson(res, 500, { error: error.message || "Unable to create contractor account." });
  }
};
