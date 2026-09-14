const {
  getSupabaseAdmin,
  requireAdmin,
  sendJson,
  weekRange
} = require("./_quickbooks");

function normalizeToken(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function linkSummary(row = {}) {
  const payload = row.payload && typeof row.payload === "object" && !Array.isArray(row.payload) ? row.payload : {};
  return {
    id: row.id,
    weekStart: row.week_start || "",
    weekEnd: row.week_end || "",
    propertyKey: row.property_key || "",
    propertyName: row.property_name || "",
    quickbooksCustomerId: row.quickbooks_customer_id || "",
    quickbooksInvoiceId: row.quickbooks_invoice_id || "",
    docNumber: row.quickbooks_doc_number || "",
    status: row.quickbooks_status || "drafted",
    statusKey: normalizeToken(row.quickbooks_status || "drafted"),
    balance: Number(row.quickbooks_balance || 0),
    total: Number(row.quickbooks_total_amt || 0),
    invoiceUrl: row.quickbooks_invoice_url || "",
    assignmentIds: Array.isArray(row.source_assignment_ids) ? row.source_assignment_ids : [],
    sentAt: row.sent_to_quickbooks_at || "",
    paidAt: row.paid_at || "",
    syncedAt: row.synced_at || "",
    financeSentAt: payload.finance_sent_at || "",
    lastError: row.last_error || ""
  };
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

  const url = new URL(req.url || "/api/quickbooks-invoice-statuses", "https://portal.turnlypros.com");
  const range = weekRange(url.searchParams.get("weekStart") || url.searchParams.get("week_start") || new Date());

  const { data, error } = await supabase
    .from("quickbooks_invoice_links")
    .select("*")
    .eq("week_start", range.startDate)
    .order("property_name", { ascending: true });

  if (error) {
    const message = String(error.message || "").toLowerCase();
    const code = String(error.code || "").toLowerCase();
    if (code === "42p01" || message.includes("quickbooks_invoice_links") || message.includes("does not exist")) {
      return sendJson(res, 200, {
        ok: true,
        setupRequired: true,
        weekStart: range.startDate,
        weekEnd: range.endDate,
        invoices: []
      });
    }
    return sendJson(res, 500, { error: error.message });
  }

  return sendJson(res, 200, {
    ok: true,
    weekStart: range.startDate,
    weekEnd: range.endDate,
    invoices: (data || []).map(linkSummary)
  });
};
