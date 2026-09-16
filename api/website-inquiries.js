const { createClient } = require("@supabase/supabase-js");

const defaultSupabaseUrl = "https://nwnzdoveskthebfyndcs.supabase.co";
const allowedOrigins = new Set([
  "https://turnlypros.com",
  "https://www.turnlypros.com",
  "http://localhost:3000",
  "http://127.0.0.1:3000"
]);

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
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
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

module.exports = async function handler(req, res) {
  setCors(req, res);

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed." });
    return;
  }

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

  const { client, error: clientError } = getSupabaseAdmin();
  if (clientError) {
    sendJson(res, 500, { error: clientError.message });
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
};
