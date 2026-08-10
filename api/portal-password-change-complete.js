const { createClient } = require("@supabase/supabase-js");

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
      error: new Error(`Server password route is missing ${missing}. Add it to the production server environment, then redeploy.`)
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

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, { error: "Method not allowed." });
  }

  const { client: supabase, error: configError } = getSupabaseAdmin();
  if (configError) return sendJson(res, 500, { error: configError.message });

  const token = bearerToken(req);
  if (!token) return sendJson(res, 401, { error: "Missing portal session." });

  const { data: userResult, error: userError } = await supabase.auth.getUser(token);
  const user = userResult?.user || null;
  if (userError || !user) return sendJson(res, 401, { error: "Portal session is invalid." });

  const { data: targetResult, error: targetError } = await supabase.auth.admin.getUserById(user.id);
  const targetUser = targetResult?.user || null;
  if (targetError || !targetUser) {
    return sendJson(res, 404, { error: targetError?.message || "Auth account was not found." });
  }

  const now = new Date().toISOString();
  const appMetadata = {
    ...(targetUser.app_metadata || {}),
    turnly_force_password_change: false,
    turnly_password_changed_at: now
  };
  const userMetadata = {
    ...(targetUser.user_metadata || {}),
    turnly_force_password_change: false,
    turnly_password_changed_at: now
  };

  const { error: updateError } = await supabase.auth.admin.updateUserById(user.id, {
    app_metadata: appMetadata,
    user_metadata: userMetadata
  });

  if (updateError) return sendJson(res, 500, { error: updateError.message });

  return sendJson(res, 200, { ok: true });
};
