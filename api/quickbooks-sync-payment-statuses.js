const {
  getSupabaseAdmin,
  loadTurnlyAccountingData,
  readJsonBody,
  refreshInvoiceStatus,
  requireAdmin,
  sendJson,
  syncContractorPaymentStatuses,
  weekRange
} = require("./_quickbooks");

function dateOnly(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (part) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
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

  const range = weekRange(body.weekStart || body.week_start || new Date());
  const lookupEndDate = dateOnly(body.paymentLookupEndDate || body.payment_lookup_end_date || new Date());
  range.paymentLookup = {
    startDate: range.startDate,
    endDate: lookupEndDate && lookupEndDate > range.endDate ? lookupEndDate : range.endDate
  };

  let accounting = null;
  try {
    accounting = await loadTurnlyAccountingData(supabase);
  } catch (error) {
    return sendJson(res, 500, { error: `Unable to load Turnly accounting data: ${error.message}` });
  }

  let refreshedInvoices = 0;
  const invoiceRefreshErrors = [];
  const { data: invoiceLinks, error: invoiceLinksError } = await supabase
    .from("quickbooks_invoice_links")
    .select("*")
    .eq("week_start", range.startDate);

  if (!invoiceLinksError) {
    for (const link of invoiceLinks || []) {
      if (!link.quickbooks_invoice_id) continue;
      try {
        await refreshInvoiceStatus(supabase, req, link);
        refreshedInvoices += 1;
      } catch (error) {
        invoiceRefreshErrors.push({ invoiceId: link.quickbooks_invoice_id, propertyName: link.property_name, error: error.message });
      }
    }
  }

  try {
    const payments = await syncContractorPaymentStatuses(
      supabase,
      req,
      accounting.assignments,
      accounting.properties,
      accounting.units,
      range
    );
    const now = new Date().toISOString();
    await supabase
      .from("quickbooks_connections")
      .update({
        last_sync_at: now,
        last_error: invoiceLinksError?.message || invoiceRefreshErrors[0]?.error || null,
        updated_at: now
      })
      .eq("status", "connected");

    return sendJson(res, invoiceLinksError || invoiceRefreshErrors.length ? 207 : 200, {
      ok: !invoiceLinksError && !invoiceRefreshErrors.length,
      weekStart: range.startDate,
      weekEnd: range.endDate,
      refreshedInvoices,
      invoiceRefreshErrors,
      invoiceLinksError: invoiceLinksError?.message || "",
      ...payments
    });
  } catch (error) {
    return sendJson(res, 500, { error: error.message || "Unable to sync QuickBooks payment statuses." });
  }
};
