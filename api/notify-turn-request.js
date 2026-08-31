const { createClient } = require("@supabase/supabase-js");

const allowedRoles = new Set(["admin", "owner", "super_admin", "property_manager"]);
const defaultAdminUrl = "https://portal.turnlypros.com/admin.html";

function normalizeToken(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

function sendJson(res, statusCode, body) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

function getSupabaseAdmin(req = {}) {
  const url = process.env.SUPABASE_URL
    || process.env.NEXT_PUBLIC_SUPABASE_URL
    || process.env.VITE_SUPABASE_URL
    || "https://nwnzdoveskthebfyndcs.supabase.co";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    || process.env.SUPABASE_SERVICE_KEY
    || process.env.SUPABASE_SERVICE_ROLE
    || process.env.SUPABASE_SECRET_KEY;
  const anonKey = process.env.SUPABASE_ANON_KEY
    || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    || process.env.VITE_SUPABASE_ANON_KEY;
  const key = serviceKey || anonKey;

  if (!url || !key) {
    const missing = [
      !url ? "SUPABASE_URL" : "",
      !key ? "SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY" : ""
    ].filter(Boolean).join(" and ");
    return {
      error: new Error(`Turn request SMS route is missing ${missing}. Add it to the production server environment, then redeploy.`)
    };
  }

  const headers = !serviceKey && bearerToken(req)
    ? { Authorization: `Bearer ${bearerToken(req)}` }
    : {};

  return {
    client: createClient(url, key, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      },
      global: { headers }
    })
  };
}

function bearerToken(req) {
  const header = req.headers.authorization || req.headers.Authorization || "";
  const match = String(header).match(/^Bearer\s+(.+)$/i);
  return match?.[1] || "";
}

function readMetadata(row = {}) {
  if (!row.metadata) return {};
  if (typeof row.metadata === "object") return row.metadata || {};
  try {
    return JSON.parse(row.metadata);
  } catch {
    return {};
  }
}

function missingColumn(error) {
  const msg = String(error?.message || "");
  return msg.match(/Could not find the '([^']+)' column/)?.[1]
    || msg.match(/column "([^"]+)"/)?.[1]
    || "";
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

async function requirePortalUser(supabase, req) {
  const token = bearerToken(req);
  if (!token) return { error: "Missing portal session.", status: 401 };

  const { data: userResult, error: userError } = await supabase.auth.getUser(token);
  const user = userResult?.user || null;
  if (userError || !user) return { error: "Portal session is invalid.", status: 401 };

  const metadataRole = normalizeToken(user.app_metadata?.role || user.user_metadata?.role);
  if (allowedRoles.has(metadataRole) && metadataRole !== "property_manager") {
    return { user, role: metadataRole, profile: null, propertyIds: new Set() };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id,role,status,property_manager_property_id")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) return { error: profileError.message, status: 500 };

  const role = normalizeToken(profile?.role || metadataRole);
  if (!allowedRoles.has(role)) {
    return { error: "Only admins and property managers can send turn request SMS notifications.", status: 403 };
  }

  const propertyIds = new Set(
    [profile?.property_manager_property_id, user.user_metadata?.property_manager_property_id]
      .filter(Boolean)
      .map(String)
  );

  if (role === "property_manager") {
    const { data: links, error: linksError } = await supabase
      .from("property_manager_property_links")
      .select("portal_property_id,status")
      .eq("profile_id", user.id);
    if (!linksError) {
      (links || []).forEach((link) => {
        if (!link.status || normalizeToken(link.status) === "active") {
          if (link.portal_property_id) propertyIds.add(String(link.portal_property_id));
        }
      });
    }
  }

  return { user, role, profile, propertyIds };
}

async function loadAssignment(supabase, assignmentId) {
  const fields = [
    "id",
    "title",
    "property_name",
    "unit_number",
    "unit_name",
    "service_type",
    "status",
    "priority",
    "start_window",
    "end_window",
    "portal_property_id",
    "recurring_portal_property_id",
    "metadata"
  ];

  const selected = [...fields];
  for (let index = 0; index < fields.length; index += 1) {
    const { data, error } = await supabase
      .from("assignment_blocks")
      .select(selected.join(","))
      .eq("id", assignmentId)
      .maybeSingle();

    if (!error) return { data, error: null };

    const missing = missingColumn(error);
    const missingIndex = selected.indexOf(missing);
    if (missingIndex !== -1 && selected.length > 3) {
      selected.splice(missingIndex, 1);
      continue;
    }

    return { data: null, error };
  }

  return { data: null, error: new Error("Unable to load assignment.") };
}

function isPropertyManagerTurnRequest(row = {}) {
  const metadata = readMetadata(row);
  const source = normalizeToken(row.source || metadata.source || metadata.request_source);
  const approvalStatus = normalizeToken(row.admin_approval_status || metadata.admin_approval_status);
  const status = normalizeToken(row.status);

  if (metadata.admin_preview_source) return false;
  if (source === "property_manager_turn_request") return true;
  return approvalStatus === "pending" && ["pending", "pending_approval", "preferred_pending"].includes(status);
}

function assignmentPropertyId(row = {}) {
  const metadata = readMetadata(row);
  return String(row.portal_property_id || row.recurring_portal_property_id || metadata.portal_property_id || "");
}

function wasAlreadySent(row = {}) {
  const metadata = readMetadata(row);
  return Boolean(
    metadata.twilio_turn_request_sms_sent_at
    || metadata.turnly_sms_notification?.turn_request_sent_at
    || metadata.sms_notifications?.turn_request_sent_at
  );
}

function compact(values = []) {
  return values.map((value) => String(value || "").trim()).filter(Boolean);
}

function truncate(value, maxLength) {
  const text = String(value || "").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 3)).trim()}...`;
}

function formatMoveIn(row = {}, fallback = {}) {
  const metadata = readMetadata(row);
  const dateValue = metadata.move_in_date || fallback.move_in_date || row.start_window || "";
  const timeValue = metadata.move_in_time || fallback.move_in_time || "";
  if (!dateValue) return timeValue || "date pending";

  const raw = String(dateValue);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(raw)
    ? new Date(`${raw}T12:00:00`)
    : new Date(raw);

  if (Number.isNaN(date.getTime())) return compact([raw, timeValue]).join(" at ") || "date pending";

  const formattedDate = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "America/New_York"
  }).format(date);
  return timeValue ? `${formattedDate} at ${timeValue}` : formattedDate;
}

function smsBody(row = {}, fallback = {}) {
  const metadata = readMetadata(row);
  const property = truncate(row.property_name || metadata.property_name || fallback.property_name || "property", 52);
  const unit = truncate(row.unit_number || row.unit_name || metadata.unit_number || metadata.unit_name || fallback.unit_number || "", 18);
  const service = truncate(row.service_type || metadata.service_type || fallback.service_type || "turn request", 28);
  const moveIn = formatMoveIn(row, fallback);
  const reviewUrl = process.env.TURNLY_ADMIN_URL || defaultAdminUrl;

  return compact([
    `Turnly: New ${service} for ${property}${unit ? `, Unit ${unit}` : ""}.`,
    `Move-in ${moveIn}.`,
    `Review: ${reviewUrl}`
  ]).join(" ");
}

function twilioConfig() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID || "";
  const authUser = process.env.TWILIO_API_KEY_SID || accountSid;
  const authSecret = process.env.TWILIO_API_KEY_SECRET || process.env.TWILIO_AUTH_TOKEN || "";
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID || "";
  const from = process.env.TWILIO_FROM_NUMBER || "";
  const to = process.env.TURNLY_ADMIN_SMS_TO || "";

  const missing = [
    !accountSid ? "TWILIO_ACCOUNT_SID" : "",
    !authSecret ? "TWILIO_AUTH_TOKEN or TWILIO_API_KEY_SECRET" : "",
    !messagingServiceSid && !from ? "TWILIO_MESSAGING_SERVICE_SID or TWILIO_FROM_NUMBER" : "",
    !to ? "TURNLY_ADMIN_SMS_TO" : ""
  ].filter(Boolean);

  if (missing.length) return { error: new Error(`Twilio SMS route is missing ${missing.join(", ")}.`) };
  return { accountSid, authUser, authSecret, messagingServiceSid, from, to };
}

async function sendTwilioMessage(message) {
  const config = twilioConfig();
  if (config.error) return { error: config.error };

  const params = new URLSearchParams();
  params.set("To", config.to);
  params.set("Body", message);
  if (config.messagingServiceSid) params.set("MessagingServiceSid", config.messagingServiceSid);
  else params.set("From", config.from);

  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(config.accountSid)}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${config.authUser}:${config.authSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: params.toString()
  });

  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { message: text };
  }

  if (!response.ok) {
    return {
      error: new Error(body?.message || `Twilio returned ${response.status}.`),
      status: response.status
    };
  }

  return { data: body };
}

async function markSmsSent(supabase, row, twilioResult) {
  const metadata = {
    ...readMetadata(row),
    twilio_turn_request_sms_sent_at: new Date().toISOString(),
    twilio_turn_request_sms_sid: twilioResult?.sid || "",
    turnly_sms_notification: {
      ...(readMetadata(row).turnly_sms_notification || {}),
      turn_request_sent_at: new Date().toISOString(),
      message_sid: twilioResult?.sid || ""
    }
  };

  await supabase
    .from("assignment_blocks")
    .update({ metadata })
    .eq("id", row.id);
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, { error: "Method not allowed." });
  }

  const { client: supabase, error: configError } = getSupabaseAdmin(req);
  if (configError) return sendJson(res, 500, { error: configError.message });

  const portalUser = await requirePortalUser(supabase, req);
  if (portalUser.error) return sendJson(res, portalUser.status || 403, { error: portalUser.error });

  let body = {};
  try {
    body = await readJsonBody(req);
  } catch {
    return sendJson(res, 400, { error: "Invalid JSON body." });
  }

  const assignmentId = String(body.assignment_id || body.assignmentId || "").trim();
  if (!assignmentId) return sendJson(res, 400, { error: "Assignment id is required." });

  const assignment = await loadAssignment(supabase, assignmentId);
  if (assignment.error) return sendJson(res, 500, { error: assignment.error.message });
  if (!assignment.data?.id) return sendJson(res, 404, { error: "Turn request assignment was not found." });

  const row = assignment.data;
  if (!isPropertyManagerTurnRequest(row)) {
    return sendJson(res, 200, { ok: true, skipped: "not_property_manager_turn_request" });
  }

  if (portalUser.role === "property_manager") {
    const propertyId = assignmentPropertyId(row);
    if (!propertyId || !portalUser.propertyIds.has(propertyId)) {
      return sendJson(res, 403, { error: "This turn request is not linked to your property access." });
    }
  }

  if (wasAlreadySent(row)) {
    return sendJson(res, 200, { ok: true, skipped: "already_sent" });
  }

  const result = await sendTwilioMessage(smsBody(row, body));
  if (result.error) return sendJson(res, result.status || 502, { error: result.error.message });

  await markSmsSent(supabase, row, result.data);
  return sendJson(res, 200, { ok: true, sid: result.data?.sid || "" });
};
