const {
  getSupabaseAdmin,
  readJsonBody,
  requireAdmin,
  sendJson
} = require("./_quickbooks");

function numberValue(value) {
  if (value === null || value === undefined || value === "") return 0;
  const number = Number(String(value).replace(/[$,]/g, ""));
  return Number.isFinite(number) ? number : 0;
}

function textValue(value) {
  return String(value ?? "").trim();
}

function normalizeToken(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function parseDueDay(value) {
  const number = Number(String(value || "").match(/\d+/)?.[0] || "");
  return Number.isFinite(number) && number >= 1 && number <= 31 ? Math.round(number) : null;
}

function dueDayFromDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.getDate();
}

function normalizeExpense(row = {}, index = 0, adminUserId = null) {
  const vendor = textValue(row.vendorName || row.vendor_name || row.vendor || row.name || row.expense || row.payee || row.company);
  const amount = numberValue(row.amount || row.monthlyAmount || row.monthly_amount || row.cost || row.price || row.payment);
  if (!vendor || amount <= 0) return null;
  const recurrence = normalizeToken(row.recurrence || row.frequency || row.type || "monthly") || "monthly";
  return {
    vendor_name: vendor,
    category: textValue(row.category || row.group || row.expenseType || row.expense_type || "General") || "General",
    description: textValue(row.description || row.memo || row.details || ""),
    amount,
    due_day: parseDueDay(row.dueDay || row.due_day || row.due || row.day),
    due_date: textValue(row.dueDate || row.due_date || row.date || "") || null,
    recurrence: recurrence === "annual" ? "yearly" : recurrence,
    status: normalizeToken(row.status || "active") || "active",
    payment_method: textValue(row.paymentMethod || row.payment_method || row.method || ""),
    notes: textValue(row.notes || row.note || ""),
    source_label: textValue(row.sourceLabel || row.source_label || "Finance import"),
    source_row_number: Number(row.sourceRowNumber || row.source_row_number || index + 1) || index + 1,
    created_by: adminUserId,
    updated_at: new Date().toISOString()
  };
}

function normalizeWorkbookExpenseRows(row = {}, index = 0, adminUserId = null) {
  const vendor = textValue(row.vendorName || row.vendor_name || row.vendor || row.name || row.expense || row.payee || row.company);
  const description = textValue(row.description || row.memo || row.details || row.costBreakdown || row.cost_breakdown || "");
  const category = textValue(row.category || row.group || row.expenseType || row.expense_type || "General") || "General";
  if (!vendor) return [];

  const rows = [];
  const monthlyAmount = numberValue(row.monthlyAmount || row.monthly_amount || row.monthly);
  if (monthlyAmount > 0) {
    const dueDate = textValue(row.nextPaymentMonthly || row.next_payment_monthly || row.monthlyDueDate || row.monthly_due_date || row.dueDate || row.due_date || "") || null;
    rows.push({
      vendor_name: vendor,
      category,
      description,
      amount: monthlyAmount,
      due_day: parseDueDay(row.dueDay || row.due_day) || dueDayFromDate(dueDate),
      due_date: dueDate,
      recurrence: "monthly",
      status: normalizeToken(row.status || "active") || "active",
      payment_method: textValue(row.paymentMethod || row.payment_method || row.method || ""),
      notes: textValue(row.notes || row.note || ""),
      source_label: textValue(row.sourceLabel || row.source_label || "Turnly expenses workbook"),
      source_row_number: Number(row.sourceRowNumber || row.source_row_number || index + 1) || index + 1,
      created_by: adminUserId,
      updated_at: new Date().toISOString()
    });
  }

  const yearlyAmount = numberValue(row.yearlyAmount || row.yearly_amount || row.yearly || row.annualAmount || row.annual_amount);
  const yearlyDueDate = textValue(row.nextPaymentYearly || row.next_payment_yearly || row.yearlyDueDate || row.yearly_due_date || "") || null;
  const separateYearlyAmount = monthlyAmount > 0
    ? (yearlyDueDate ? Math.max(0, yearlyAmount - monthlyAmount * 12) : 0)
    : yearlyAmount;
  if (separateYearlyAmount > 0) {
    rows.push({
      vendor_name: vendor,
      category,
      description,
      amount: separateYearlyAmount,
      due_day: dueDayFromDate(yearlyDueDate),
      due_date: yearlyDueDate,
      recurrence: "yearly",
      status: normalizeToken(row.status || "active") || "active",
      payment_method: textValue(row.paymentMethod || row.payment_method || row.method || ""),
      notes: textValue(row.notes || row.note || ""),
      source_label: textValue(row.sourceLabel || row.source_label || "Turnly expenses workbook"),
      source_row_number: Number(row.sourceRowNumber || row.source_row_number || index + 1) || index + 1,
      created_by: adminUserId,
      updated_at: new Date().toISOString()
    });
  }

  return rows.length ? rows : [normalizeExpense(row, index, adminUserId)].filter(Boolean);
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

  const rows = Array.isArray(body.rows) ? body.rows : [];
  const payloads = rows
    .flatMap((row, index) => normalizeWorkbookExpenseRows(row, index, admin.user?.id || null))
    .filter(Boolean);

  if (!payloads.length) {
    return sendJson(res, 400, { error: "No valid expenses were found. Include at least vendor/name and amount columns." });
  }

  const { data, error } = await supabase
    .from("finance_expenses")
    .insert(payloads)
    .select("*");

  if (error) return sendJson(res, 500, { error: error.message });
  return sendJson(res, 200, { ok: true, imported: data?.length || payloads.length, expenses: data || [] });
};
