const {
  crypto,
  getSupabaseAdmin,
  requireAdmin,
  requireQuickBooksConfig,
  sendJson
} = require("./_quickbooks");

module.exports = async function handler(req, res) {
  if (!["GET", "POST"].includes(req.method)) {
    res.setHeader("Allow", "GET, POST");
    return sendJson(res, 405, { error: "Method not allowed." });
  }

  const { client: supabase, error: configError } = getSupabaseAdmin();
  if (configError) return sendJson(res, 500, { error: configError.message });

  const admin = await requireAdmin(supabase, req);
  if (admin.error) return sendJson(res, admin.status || 403, { error: admin.error });

  let config = null;
  try {
    config = requireQuickBooksConfig(req);
  } catch (error) {
    return sendJson(res, 500, { error: error.message });
  }

  const state = crypto.randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const { error } = await supabase
    .from("quickbooks_oauth_states")
    .insert({
      state,
      admin_user_id: admin.user.id,
      expires_at: expiresAt
    });

  if (error) return sendJson(res, 500, { error: `Unable to start QuickBooks connection: ${error.message}` });

  const authorizationUrl = new URL(config.authUrl);
  authorizationUrl.searchParams.set("client_id", config.clientId);
  authorizationUrl.searchParams.set("response_type", "code");
  authorizationUrl.searchParams.set("scope", config.scope);
  authorizationUrl.searchParams.set("redirect_uri", config.redirectUri);
  authorizationUrl.searchParams.set("state", state);

  return sendJson(res, 200, {
    ok: true,
    authorizationUrl: authorizationUrl.toString(),
    redirectUri: config.redirectUri,
    environment: config.environment,
    expiresAt
  });
};
