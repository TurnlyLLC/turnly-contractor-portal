const {
  getSupabaseAdmin,
  readJsonBody,
  requireAdmin,
  sendJson
} = require("./_quickbooks");

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

  const id = String(body.id || body.invoiceId || "").trim();
  if (!id) return sendJson(res, 400, { error: "Missing invoice id." });

  const { data: current, error: loadError } = await supabase
    .from("quickbooks_invoice_links")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (loadError) return sendJson(res, 500, { error: loadError.message });
  if (!current) return sendJson(res, 404, { error: "Invoice was not found." });

  const now = new Date().toISOString();
  const payload = current.payload && typeof current.payload === "object" && !Array.isArray(current.payload)
    ? current.payload
    : {};
  const { data, error } = await supabase
    .from("quickbooks_invoice_links")
    .update({
      payload: {
        ...payload,
        finance_sent_at: now,
        finance_sent_by: admin.user?.id || null,
        finance_sent_to_property_manager: true
      },
      updated_at: now,
      last_error: null
    })
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error) return sendJson(res, 500, { error: error.message });

  await supabase
    .from("assignment_blocks")
    .update({
      quickbooks_invoice_synced_at: now
    })
    .eq("quickbooks_invoice_link_id", id);

  return sendJson(res, 200, { ok: true, invoice: data });
};
