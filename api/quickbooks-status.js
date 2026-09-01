const {
  getSupabaseAdmin,
  requireAdmin,
  sendJson
} = require("./_quickbooks");

function connectionSummary(connection = null) {
  if (!connection?.realm_id) return null;
  return {
    companyName: connection.company_name || "",
    environment: connection.environment || "production",
    status: connection.status || "connected",
    realmLabel: `...${String(connection.realm_id).slice(-5)}`,
    updatedAt: connection.updated_at || "",
    lastSyncAt: connection.last_sync_at || "",
    lastError: connection.last_error || "",
    accessTokenExpiresAt: connection.access_token_expires_at || "",
    refreshTokenExpiresAt: connection.refresh_token_expires_at || ""
  };
}

function isMissingQuickBooksSetup(error) {
  const code = String(error?.code || "").toLowerCase();
  const message = String(error?.message || "").toLowerCase();
  return code === "42p01" || message.includes("quickbooks_connections") || message.includes("does not exist");
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return sendJson(res, 405, { error: "Method not allowed." });
  }

  const { client: supabase, error: configError } = getSupabaseAdmin();
  if (configError) return sendJson(res, 500, { error: configError.message });

  const admin = await requireAdmin(supabase, req);
  if (admin.error) return sendJson(res, admin.status || 403, { error: admin.error });

  const { data, error } = await supabase
    .from("quickbooks_connections")
    .select("realm_id,company_name,environment,status,updated_at,last_sync_at,last_error,access_token_expires_at,refresh_token_expires_at")
    .eq("status", "connected")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error && isMissingQuickBooksSetup(error)) {
    return sendJson(res, 200, {
      ok: true,
      connected: false,
      setupRequired: true,
      message: "Apply the QuickBooks Supabase migration before connecting QuickBooks."
    });
  }
  if (error) return sendJson(res, 500, { error: error.message });
  return sendJson(res, 200, {
    ok: true,
    connected: Boolean(data?.realm_id),
    connection: connectionSummary(data)
  });
};
