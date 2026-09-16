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

function clientIp(req = {}) {
  return String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "")
    .split(",")[0]
    .trim();
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

  const payload = {
    name,
    email,
    phone,
    city: text(body.city, 160),
    facility_type: text(body.facility_type, 160),
    service_interest: text(body.service_interest, 160) || "Apartment Turnover Cleaning",
    message: text(body.message, 5000),
    sms_consent: true,
    source: text(body.source, 120) || "website_contact_form",
    source_url: text(body.source_url || req.headers.referer, 500),
    user_agent: text(req.headers["user-agent"], 500),
    ip_address: clientIp(req),
    status: "new",
    metadata: {
      origin: req.headers.origin || "",
      form: "turnlypros_contact"
    }
  };

  const { data, error } = await client
    .from("website_inquiries")
    .insert(payload)
    .select("id,created_at")
    .single();

  if (error) {
    console.error("[website-inquiries] insert failed", error);
    sendJson(res, 500, { error: "Unable to save inquiry." });
    return;
  }

  sendJson(res, 200, { ok: true, inquiry: data });
};