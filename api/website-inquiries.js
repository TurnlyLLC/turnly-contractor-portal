const { createClient } = require("@supabase/supabase-js");

const defaultSupabaseUrl = "https://nwnzdoveskthebfyndcs.supabase.co";
const allowedOrigins = new Set([
  "https://turnlypros.com",
  "https://www.turnlypros.com",
  "https://portal.turnlypros.com",
  "http://localhost:3000",
  "http://127.0.0.1:3000"
]);
const inquirySelect = "id,property_name,contact_name,contact_email,contact_phone,sales_city,company_name,default_service_type,default_scope,lead_source,lead_notes,pipeline_stage,created_at";
const allowedPortalRoles = new Set(["admin", "sales", "sales_team"]);

function sendJson(res, statusCode, body) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

function setCors(req, res) {
  const origin = String(req.headers.origin || "");
  if (allowedOrigins.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function text(value, maxLength = 500) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function bool(value) {
  return value === true || value === "true" || value === "on" || value === "1";
}

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL
    || process.env.NEXT_PUBLIC_SUPABASE_URL
    || process.env.VITE_SUPABASE_URL
    || defaultSupabaseUrl;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    || process.env.SUPABASE_SERVICE_KEY
    || process.env.SUPABASE_SERVICE_ROLE
    || process.env.SUPABASE_SECRET_KEY;

  if (!url || !serviceKey) {
    return {
      error: new Error("Website inquiry route is missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.")
    };
  }

  return {
    client: createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })
  };
}

function bearerToken(req) {
  const header = req.headers.authorization || req.headers.Authorization || "";
  const match = String(header).match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

async function requirePortalUser(req, client) {
  const token = bearerToken(req);
  if (!token) return { error: "Sign in to view website inquiries.", status: 401 };

  const { data: userResult, error: userError } = await client.auth.getUser(token);
  const user = userResult?.user;
  if (userError || !user?.id) return { error: "Your session expired. Sign in again to view website inquiries.", status: 401 };

  const { data: profile, error: profileError } = await client
    .from("profiles")
    .select("role,status,contractor_approved")
    .eq("id", user.id)
    .maybeSingle();

  const role = String(profile?.role || user.app_metadata?.role || user.user_metadata?.role || "").toLowerCase();
  if (profileError || !allowedPortalRoles.has(role)) {
    return { error: "Admin or sales access is required to view website inquiries.", status: 403 };
  }

  return { user, profile };
}

function buildLeadNotes(body, req) {
  const lines = [
    "Website quote request from TurnlyPros.com",
    "",
    `Contact: ${text(body.name, 160)}`,
    `Email: ${text(body.email, 254)}`,
    `Phone: ${text(body.phone, 80)}`,
    `City: ${text(body.city, 160) || "Not provided"}`,
    `Property Type: ${text(body.facility_type, 160) || "Not provided"}`,
    `Service Interest: ${text(body.service_interest, 160) || "Apartment Turnover Cleaning"}`,
    `SMS Consent: ${bool(body.sms_consent) ? "Yes" : "No"}`,
    `Source URL: ${text(body.source_url || req.headers.referer, 500) || "Not provided"}`,
    "",
    "Message:",
    text(body.message, 5000) || "No message provided."
  ];
  return lines.join("\n").slice(0, 5000);
}

async function listInquiries(req, res, client) {
  const access = await requirePortalUser(req, client);
  if (access.error) {
    sendJson(res, access.status || 403, { error: access.error });
    return;
  }

  const requestedLimit = Number(new URL(req.url, "https://portal.turnlypros.com").searchParams.get("limit") || 6);
  const limit = Math.min(20, Math.max(1, Number.isFinite(requestedLimit) ? requestedLimit : 6));
  const { data, error } = await client
    .from("sales_leads")
    .select(inquirySelect)
    .or("lead_source.eq.website_contact_form,lead_notes.ilike.%Website quote request%,lead_notes.ilike.%TurnlyPros.com%")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[website-inquiries] sales lead list failed", error);
    sendJson(res, 500, { error: "Unable to load inquiries." });
    return;
  }

  sendJson(res, 200, { ok: true, inquiries: data || [] });
}

async function createInquiry(req, res, client) {
  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    sendJson(res, 400, { error: "Invalid JSON body." });
    return;
  }

  if (text(body._gotcha)) {
    sendJson(res, 200, { ok: true });
    return;
  }

  const name = text(body.name, 160);
  const email = text(body.email, 254);
  const phone = text(body.phone, 80);
  const city = text(body.city, 160);
  const facilityType = text(body.facility_type, 160);
  const serviceInterest = text(body.service_interest, 160) || "Apartment Turnover Cleaning";
  const message = text(body.message, 5000);

  if (!name || !email || !phone) {
    sendJson(res, 400, { error: "Name, email, and phone are required." });
    return;
  }

  if (!bool(body.sms_consent)) {
    sendJson(res, 400, { error: "SMS consent is required." });
    return;
  }

  const propertyName = [facilityType || "Apartment Turnover Inquiry", city].filter(Boolean).join(" - ");
  const leadNotes = buildLeadNotes(body, req);
  const payload = {
    property_name: propertyName,
    name: propertyName,
    company_name: facilityType,
    contact_name: name,
    contact_email: email,
    contact_phone: phone,
    sales_city: city,
    default_service_type: serviceInterest,
    default_scope: message || leadNotes,
    lead_source: "website_contact_form",
    lead_notes: leadNotes,
    service_needs: [serviceInterest],
    pipeline_stage: "new_leads",
    next_step: "Follow up on website quote request",
    task_priority: "high",
    task_status: "open",
    last_activity_at: new Date().toISOString()
  };

  const { data, error } = await client
    .from("sales_leads")
    .insert(payload)
    .select("id,created_at")
    .single();

  if (error) {
    console.error("[website-inquiries] sales lead insert failed", error);
    sendJson(res, 500, { error: "Unable to save inquiry." });
    return;
  }

  sendJson(res, 200, { ok: true, inquiry: data });
}

module.exports = async function handler(req, res) {
  setCors(req, res);

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  const { client, error: clientError } = getSupabaseAdmin();
  if (clientError) {
    sendJson(res, 500, { error: clientError.message });
    return;
  }

  if (req.method === "GET") {
    await listInquiries(req, res, client);
    return;
  }

  if (req.method === "POST") {
    await createInquiry(req, res, client);
    return;
  }

  sendJson(res, 405, { error: "Method not allowed." });
};
