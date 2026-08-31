const { createClient } = require("@supabase/supabase-js");

const allowedAdminRoles = new Set(["admin", "owner", "super_admin"]);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
      error: new Error(`Message delete route is missing ${missing}. Add it to the production server environment, then redeploy.`)
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
    return { error: "Only admins can delete message threads.", status: 403 };
  }

  return { user };
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function uniqueThreadIds(value) {
  const source = Array.isArray(value) ? value : [];
  const seen = new Set();
  return source
    .map((item) => String(item || "").trim())
    .filter((item) => uuidPattern.test(item))
    .filter((item) => {
      const key = item.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 100);
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

  const threadIds = uniqueThreadIds(body.thread_ids || body.threadIds);
  if (!threadIds.length) {
    return sendJson(res, 400, { error: "Select at least one valid message thread." });
  }

  const { data: existingThreads, error: existingError } = await supabase
    .from("message_threads")
    .select("id")
    .in("id", threadIds);

  if (existingError) return sendJson(res, 500, { error: existingError.message });

  const existingIds = (existingThreads || []).map((thread) => String(thread.id));
  if (!existingIds.length) {
    return sendJson(res, 404, { error: "Selected message threads were not found." });
  }

  const { error: deleteError } = await supabase
    .from("message_threads")
    .delete()
    .in("id", existingIds);

  if (deleteError) return sendJson(res, 500, { error: deleteError.message });

  return sendJson(res, 200, {
    ok: true,
    deleted_ids: existingIds,
    deleted_count: existingIds.length
  });
};
