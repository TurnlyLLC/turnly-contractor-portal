const {
  buildInvoiceGroups,
  createQuickBooksInvoice,
  ensureQuickBooksCustomer,
  getSupabaseAdmin,
  invoiceLinkForGroup,
  loadTurnlyAccountingData,
  readJsonBody,
  refreshInvoiceStatus,
  requireAdmin,
  saveInvoiceLink,
  sendJson,
  weekRange
} = require("./_quickbooks");

function groupErrorPayload(range, group, message) {
  return {
    week_start: range.startDate,
    week_end: range.endDate,
    portal_property_id: group.portalPropertyId || null,
    property_key: group.propertyKey,
    property_name: group.propertyName,
    source_assignment_ids: group.rows.map((row) => row.id).filter(Boolean),
    quickbooks_status: "error",
    quickbooks_total_amt: group.total,
    synced_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    last_error: message
  };
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
  let accounting = null;
  try {
    accounting = await loadTurnlyAccountingData(supabase);
  } catch (error) {
    return sendJson(res, 500, { error: `Unable to load Turnly accounting data: ${error.message}` });
  }

  const groups = buildInvoiceGroups(accounting.assignments, accounting.properties, accounting.units, range);
  const results = [];
  let created = 0;
  let refreshed = 0;
  let failed = 0;

  for (const group of groups) {
    try {
      const existing = await invoiceLinkForGroup(supabase, range, group);
      if (existing?.quickbooks_invoice_id) {
        const link = await refreshInvoiceStatus(supabase, req, existing);
        refreshed += 1;
        results.push({
          action: "refreshed",
          propertyName: group.propertyName,
          invoiceId: link?.quickbooks_invoice_id || existing.quickbooks_invoice_id,
          docNumber: link?.quickbooks_doc_number || existing.quickbooks_doc_number || "",
          status: link?.quickbooks_status || existing.quickbooks_status || "",
          total: Number(link?.quickbooks_total_amt || group.total || 0)
        });
        continue;
      }

      const customer = await ensureQuickBooksCustomer(supabase, req, group);
      const { invoice, payload } = await createQuickBooksInvoice(supabase, req, range, group, customer);
      const link = await saveInvoiceLink(supabase, range, group, customer, invoice || {}, payload);
      created += 1;
      results.push({
        action: "created",
        propertyName: group.propertyName,
        invoiceId: link.quickbooks_invoice_id || "",
        docNumber: link.quickbooks_doc_number || "",
        status: link.quickbooks_status || "",
        total: Number(link.quickbooks_total_amt || group.total || 0)
      });
    } catch (error) {
      failed += 1;
      const message = error.message || "Unable to sync invoice.";
      results.push({ action: "failed", propertyName: group.propertyName, error: message });
      await supabase
        .from("quickbooks_invoice_links")
        .upsert(groupErrorPayload(range, group, message), { onConflict: "week_start,property_key" });
    }
  }

  const now = new Date().toISOString();
  await supabase
    .from("quickbooks_connections")
    .update({
      last_sync_at: now,
      last_error: failed ? `${failed} invoice group${failed === 1 ? "" : "s"} failed during the last invoice sync.` : null,
      updated_at: now
    })
    .eq("status", "connected");

  return sendJson(res, failed ? 207 : 200, {
    ok: failed === 0,
    weekStart: range.startDate,
    weekEnd: range.endDate,
    groups: groups.length,
    created,
    refreshed,
    failed,
    results
  });
};
