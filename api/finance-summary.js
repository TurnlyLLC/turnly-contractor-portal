const {
  getSupabaseAdmin,
  loadTurnlyAccountingData,
  requireAdmin,
  sendJson
} = require("./_quickbooks");

function normalizeToken(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/'/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function readMetadata(row = {}) {
  if (!row.metadata) return {};
  if (typeof row.metadata === "object" && !Array.isArray(row.metadata)) return row.metadata;
  try {
    const parsed = JSON.parse(row.metadata);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function firstText(...values) {
  return values.map((value) => String(value ?? "").trim()).find(Boolean) || "";
}

function numberValue(...values) {
  for (const value of values) {
    if (value === null || value === undefined || value === "") continue;
    const number = Number(String(value).replace(/[$,]/g, ""));
    if (Number.isFinite(number)) return number;
  }
  return 0;
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function unitName(unit = {}) {
  return firstText(unit.unit_name, unit.unit_number, unit.name, unit.label, unit.number);
}

function assignmentUnitNumber(row = {}) {
  const metadata = readMetadata(row);
  return firstText(row.unit_number, row.unit_name, metadata.unit_number, metadata.unit_name, metadata.property_unit_name);
}

function propertyMatchesAssignment(property = {}, row = {}) {
  const metadata = readMetadata(row);
  const keys = [
    row.portal_property_id,
    row.recurring_portal_property_id,
    row.property_id,
    row.contract_id,
    metadata.portal_property_id,
    metadata.contract_id
  ].filter(Boolean).map(String);
  if (keys.includes(String(property.id || ""))) return true;
  if (keys.includes(String(property.contract_id || ""))) return true;
  if (keys.includes(String(property.client_id || ""))) return true;
  const propertyNames = [
    property.company_name,
    property.property_name,
    property.name,
    property.title,
    property.address
  ].map(normalizeToken).filter(Boolean);
  const rowNames = [
    row.property_name,
    row.title,
    metadata.property_name,
    metadata.client_name,
    row.address
  ].map(normalizeToken).filter(Boolean);
  return propertyNames.some((name) => rowNames.includes(name) || rowNames.some((rowName) => rowName.includes(name) || name.includes(rowName)));
}

function propertyForAssignment(row = {}, properties = []) {
  return properties.find((property) => propertyMatchesAssignment(property, row)) || null;
}

function assignmentPropertyName(row = {}, property = null) {
  const metadata = readMetadata(row);
  return firstText(
    property?.company_name,
    property?.property_name,
    property?.name,
    row.property_name,
    row.title,
    metadata.property_name,
    metadata.client_name
  ) || "Unassigned Property";
}

function unitForAssignment(row = {}, units = [], property = null) {
  const metadata = readMetadata(row);
  const unitId = firstText(row.unit_id, metadata.unit_id);
  if (unitId) {
    const byId = units.find((unit) => String(unit.id || "") === String(unitId));
    if (byId) return byId;
  }
  const unitKey = normalizeToken(String(assignmentUnitNumber(row) || "").replace(/^unit\s+/i, ""));
  if (!unitKey) return null;
  const propertyKeys = new Set([
    property?.id,
    property?.contract_id,
    property?.client_id,
    row.property_id,
    row.portal_property_id,
    row.recurring_portal_property_id,
    metadata.portal_property_id,
    metadata.contract_id
  ].filter(Boolean).map(String));
  return units.find((unit) => {
    const matchesProperty = !propertyKeys.size || propertyKeys.has(String(unit.property_id || unit.portal_property_id || unit.contract_id || ""));
    return matchesProperty && normalizeToken(unitName(unit)) === unitKey;
  }) || null;
}

function assignmentPayment(row = {}) {
  const metadata = readMetadata(row);
  return metadata.payment && typeof metadata.payment === "object" && !Array.isArray(metadata.payment)
    ? metadata.payment
    : {};
}

function assignmentPaymentStatus(row = {}) {
  const payment = assignmentPayment(row);
  return normalizeToken(row.payment_status || row.pay_status || row.payout_status || payment.status || "");
}

function assignmentPaidDate(row = {}) {
  const payment = assignmentPayment(row);
  return row.paid_at
    || row.payout_at
    || row.payout_date
    || row.payout_completed_at
    || row.payment_sent_at
    || row.statement_paid_at
    || row.paid_on
    || payment.paid_at
    || "";
}

function assignmentIsPaid(row = {}) {
  const payment = assignmentPayment(row);
  const status = assignmentPaymentStatus(row);
  return Boolean(
    assignmentPaidDate(row)
    || row.paid === true
    || row.is_paid === true
    || row.paid_out === true
    || payment.paid === true
    || ["paid", "paid_out", "payout_paid", "payout_sent", "settled"].includes(status)
  );
}

function assignmentContractorPay(row = {}, unit = null) {
  const metadata = readMetadata(row);
  const payment = assignmentPayment(row);
  return numberValue(
    row.net_paid_amount,
    row.paid_amount,
    row.payout_amount,
    row.amount_paid,
    row.pay_amount,
    row.contractor_pay,
    row.contractor_pay_amount,
    metadata.unit_contractor_pay,
    metadata.contractor_pay,
    metadata.contractor_pay_amount,
    payment.net_paid_amount,
    payment.paid_amount,
    payment.payout_amount,
    payment.amount_paid,
    payment.contractor_pay,
    payment.contractor_pay_amount,
    unit?.contractor_pay
  );
}

function isOwedContractorPay(row = {}) {
  if (assignmentIsPaid(row)) return false;
  const status = normalizeToken(row.status || "");
  const payStatus = assignmentPaymentStatus(row);
  return ["completed", "complete", "closed", "done", "qa_pending"].includes(status)
    || ["approved_for_pay", "ready_for_payout", "pending_payout", "unpaid"].includes(payStatus);
}

function contractorPayItems(assignments = [], properties = [], units = []) {
  return assignments
    .filter(isOwedContractorPay)
    .map((row) => {
      const property = propertyForAssignment(row, properties);
      const unit = unitForAssignment(row, units, property);
      const amount = assignmentContractorPay(row, unit);
      return {
        assignmentId: row.id,
        propertyName: assignmentPropertyName(row, property),
        unitNumber: assignmentUnitNumber(row),
        title: firstText(row.title, row.service_type, "Completed assignment"),
        contractorName: firstText(row.assigned_to_name, row.claimed_by_name, row.contractor_name, "Unassigned contractor"),
        contractorEmail: firstText(row.assigned_to_email, row.claimed_by_email, row.contractor_email),
        completedAt: firstText(row.completed_at, row.checklist_completed_at, row.end_window, row.start_window),
        status: firstText(row.payment_status, row.pay_status, row.payout_status, "unpaid"),
        amount
      };
    })
    .filter((item) => item.assignmentId && item.amount > 0)
    .sort((a, b) => {
      const bDate = parseDate(b.completedAt)?.getTime() || 0;
      const aDate = parseDate(a.completedAt)?.getTime() || 0;
      return bDate - aDate || a.propertyName.localeCompare(b.propertyName);
    });
}

function invoiceIsOpenUnsent(row = {}) {
  const status = normalizeToken(row.quickbooks_status || "");
  if (row.sent_to_quickbooks_at) return false;
  return !["paid", "void", "voided", "deleted"].includes(status);
}

function summarizeInvoices(rows = []) {
  return rows
    .filter(invoiceIsOpenUnsent)
    .map((row) => ({
      id: row.id,
      propertyName: row.property_name || "Unnamed property",
      propertyKey: row.property_key || "",
      docNumber: row.quickbooks_doc_number || "",
      quickbooksInvoiceId: row.quickbooks_invoice_id || "",
      quickbooksInvoiceUrl: row.quickbooks_invoice_url || "",
      quickbooksStatus: row.quickbooks_status || "drafted",
      weekStart: row.week_start || "",
      weekEnd: row.week_end || "",
      total: Number(row.quickbooks_total_amt || 0),
      balance: Number(row.quickbooks_balance || 0),
      assignmentCount: Array.isArray(row.source_assignment_ids) ? row.source_assignment_ids.length : 0,
      createdAt: row.created_at || "",
      syncedAt: row.synced_at || "",
      lastError: row.last_error || ""
    }))
    .sort((a, b) => String(b.weekStart).localeCompare(String(a.weekStart)) || a.propertyName.localeCompare(b.propertyName));
}

function isMissingFinanceSetup(error) {
  const code = String(error?.code || "").toLowerCase();
  const message = String(error?.message || "").toLowerCase();
  return ["42p01", "42703", "pgrst200", "pgrst204"].includes(code)
    || message.includes("quickbooks_invoice_links")
    || message.includes("does not exist")
    || message.includes("schema cache");
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

  const invoiceResult = await supabase
    .from("quickbooks_invoice_links")
    .select("*")
    .is("sent_to_quickbooks_at", null)
    .order("week_start", { ascending: false })
    .limit(250);

  if (invoiceResult.error && !isMissingFinanceSetup(invoiceResult.error)) {
    return sendJson(res, 500, { error: invoiceResult.error.message });
  }

  let accounting = null;
  try {
    accounting = await loadTurnlyAccountingData(supabase);
  } catch (error) {
    return sendJson(res, 500, { error: `Unable to load contractor pay data: ${error.message}` });
  }

  const invoices = invoiceResult.error ? [] : summarizeInvoices(invoiceResult.data || []);
  const payItems = contractorPayItems(accounting.assignments, accounting.properties, accounting.units);
  const invoiceTotal = invoices.reduce((sum, item) => sum + Number(item.total || 0), 0);
  const contractorPayTotal = payItems.reduce((sum, item) => sum + Number(item.amount || 0), 0);

  return sendJson(res, 200, {
    ok: true,
    invoices,
    contractorPay: payItems,
    totals: {
      unsentInvoiceCount: invoices.length,
      unsentInvoiceAmount: invoiceTotal,
      contractorPayCount: payItems.length,
      contractorPayOwed: contractorPayTotal
    },
    relayUrl: process.env.RELAY_PAYMENTS_URL || process.env.RELAY_URL || "https://app.relayfi.com/",
    setupRequired: Boolean(invoiceResult.error)
  });
};
