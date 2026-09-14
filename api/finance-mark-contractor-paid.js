const {
  getSupabaseAdmin,
  readJsonBody,
  requireAdmin,
  sendJson
} = require("./_quickbooks");

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

function numberValue(...values) {
  for (const value of values) {
    if (value === null || value === undefined || value === "") continue;
    const number = Number(String(value).replace(/[$,]/g, ""));
    if (Number.isFinite(number)) return number;
  }
  return 0;
}

function paymentAmount(row = {}, providedAmount = 0) {
  const metadata = readMetadata(row);
  const payment = metadata.payment && typeof metadata.payment === "object" ? metadata.payment : {};
  return numberValue(
    providedAmount,
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
    payment.contractor_pay_amount
  );
}

function missingColumnName(error) {
  const message = String(error?.message || "");
  return message.match(/'([^']+)'\s+column/i)?.[1]
    || message.match(/column\s+"?([a-zA-Z0-9_]+)"?\s+.*does not exist/i)?.[1]
    || "";
}

async function updateAssignmentWithFallback(supabase, id, payload) {
  const patch = { ...payload };
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const result = await supabase
      .from("assignment_blocks")
      .update(patch)
      .eq("id", id)
      .select("*")
      .maybeSingle();
    if (!result.error) return result;
    const missing = missingColumnName(result.error);
    if (missing && Object.prototype.hasOwnProperty.call(patch, missing)) {
      delete patch[missing];
      continue;
    }
    return result;
  }
  return { data: null, error: new Error("Unable to update assignment payment status.") };
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

  const id = String(body.assignmentId || body.id || "").trim();
  if (!id) return sendJson(res, 400, { error: "Missing assignment id." });

  const { data: row, error: loadError } = await supabase
    .from("assignment_blocks")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (loadError) return sendJson(res, 500, { error: loadError.message });
  if (!row) return sendJson(res, 404, { error: "Assignment was not found." });

  const now = new Date().toISOString();
  const amount = paymentAmount(row, body.amount);
  const metadata = readMetadata(row);
  const payment = {
    ...(metadata.payment && typeof metadata.payment === "object" ? metadata.payment : {}),
    status: "paid",
    paid: true,
    paid_at: now,
    paid_amount: amount,
    payout_amount: amount,
    amount_paid: amount,
    source: "turnly_finance",
    marked_paid_by: admin.user?.id || null,
    marked_paid_at: now
  };

  const result = await updateAssignmentWithFallback(supabase, id, {
    metadata: { ...metadata, payment },
    payment_status: "paid",
    pay_status: "paid",
    payout_status: "paid",
    paid_out: true,
    paid_at: now,
    paid_by: admin.user?.id || null,
    paid_amount: amount,
    paid_notes: body.notes || "Marked paid from the Turnly admin finance page.",
    payment_status_source: "turnly",
    payment_status_override: true,
    payment_status_override_at: now,
    payment_status_override_by: admin.user?.id || null
  });

  if (result.error) return sendJson(res, 500, { error: result.error.message });
  return sendJson(res, 200, { ok: true, assignment: result.data });
};
