const {
  getSupabaseAdmin,
  readJsonBody,
  requireAdmin,
  sendJson
} = require("./_quickbooks");

function numberValue(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(String(value).replace(/[$,]/g, ""));
  return Number.isFinite(number) ? number : null;
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
  if (value === null || value === undefined || value === "") return null;
  const number = Number(String(value).match(/\d+/)?.[0] || "");
  return Number.isFinite(number) && number >= 1 && number <= 31 ? Math.round(number) : null;
}

function dateOrNull(value) {
  const text = textValue(value);
  if (!text) return null;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return null;
  const pad = (part) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function normalizeRecurrence(value) {
  const recurrence = normalizeToken(value || "monthly") || "monthly";
  if (recurrence === "annual") return "yearly";
  if (["monthly", "yearly", "one_time", "once", "recurring"].includes(recurrence)) return recurrence === "once" ? "one_time" : recurrence;
  return "monthly";
}

function expensePatch(body = {}) {
  const vendor = textValue(body.vendorName || body.vendor_name);
  const amount = numberValue(body.amount);
  if (!vendor) throw new Error("Expense name is required.");
  if (amount === null || amount < 0) throw new Error("Expense amount must be zero or higher.");
  const dueDate = dateOrNull(body.dueDate || body.due_date);
  return {
    vendor_name: vendor,
    category: textValue(body.category || "General") || "General",
    description: textValue(body.description || ""),
    amount,
    due_day: parseDueDay(body.dueDay || body.due_day) || (dueDate ? new Date(dueDate).getDate() : null),
    due_date: dueDate,
    recurrence: normalizeRecurrence(body.recurrence),
    status: normalizeToken(body.status || "active") || "active",
    payment_method: textValue(body.paymentMethod || body.payment_method || ""),
    notes: textValue(body.notes || ""),
    updated_at: new Date().toISOString()
  };
}

module.exports = async function handler(req, res) {
  if (!["PATCH", "DELETE"].includes(req.method)) {
    res.setHeader("Allow", "PATCH, DELETE");
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

  const id = textValue(body.id || body.expenseId);
  if (!id) return sendJson(res, 400, { error: "Missing expense id." });

  if (req.method === "DELETE") {
    const { data, error } = await supabase
      .from("finance_expenses")
      .update({
        status: "deleted",
        updated_at: new Date().toISOString()
      })
      .eq("id", id)
      .select("*")
      .maybeSingle();
    if (error) return sendJson(res, 500, { error: error.message });
    if (!data) return sendJson(res, 404, { error: "Expense was not found." });
    return sendJson(res, 200, { ok: true, expense: data });
  }

  let patch = {};
  try {
    patch = expensePatch(body);
  } catch (error) {
    return sendJson(res, 400, { error: error.message });
  }

  const { data, error } = await supabase
    .from("finance_expenses")
    .update(patch)
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error) return sendJson(res, 500, { error: error.message });
  if (!data) return sendJson(res, 404, { error: "Expense was not found." });
  return sendJson(res, 200, { ok: true, expense: data });
};
