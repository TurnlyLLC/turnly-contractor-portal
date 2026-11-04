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

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, { error: "Method not allowed." });
  }

  const { client: supabase, error: configError } = getSupabaseAdmin();
  if (configError) return sendJson(res, 500, { error: configError.message });

  const token = bearerToken(req);
  if (!token) return sendJson(res, 401, { error: "Missing contractor session." });

  const { data: userResult, error: userError } = await supabase.auth.getUser(token);
  const user = userResult?.user || null;
  if (userError || !user) return sendJson(res, 401, { error: "Contractor session is invalid." });

  const { data: targetResult, error: targetError } = await supabase.auth.admin.getUserById(user.id);
  const targetUser = targetResult?.user || null;
  if (targetError || !targetUser) {
    return sendJson(res, 404, { error: targetError?.message || "Auth account was not found." });
  }

  if (targetUser.app_metadata?.applicant_id) {
    if (!targetUser.app_metadata.turnly_force_password_change)
      return sendJson(res, 409, {error:'Password setup is already complete. Sign in with your new password.'});
    if (typeof req.body?.password !== 'string' || req.body.password.length < 8 || req.body.password.length > 128)
      return sendJson(res, 400, {error:'Choose a password between 8 and 128 characters.'});
    const email = req.body?.email;
    if (typeof email !== 'string' || !email.trim()) return sendJson(res, 400, {error:'Enter your personal email to finish setup.'});
    const synced = await supabase.rpc('finish_hire_login_email', {p_user:user.id,p_email:email});
    if (synced.error) return sendJson(res, 409, {error:'Confirm your personal email before finishing setup.'});
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
    ...(targetUser.app_metadata?.applicant_id ? {password:req.body.password} : {}),
    app_metadata: appMetadata,
    user_metadata: userMetadata
  });

  if (updateError) return sendJson(res, 500, { error: updateError.message });

  return sendJson(res, 200, { ok: true });
};
