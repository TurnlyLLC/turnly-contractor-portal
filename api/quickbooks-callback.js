const {
  getSupabaseAdmin,
  publicBaseUrl,
  quickbooksRequest,
  requireQuickBooksConfig,
  saveConnection,
  tokenRequest
} = require("./_quickbooks");

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function sendHtml(res, statusCode, title, message, extra = "") {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.end(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(title)}</title>
  <style>
    :root{color-scheme:dark;background:#071420;color:#f5f8fb;font-family:Inter,Arial,sans-serif}
    body{align-items:center;display:grid;margin:0;min-height:100vh;padding:24px}
    main{background:#102034;border:1px solid #25425f;border-radius:8px;box-shadow:0 24px 80px rgba(0,0,0,.25);margin:auto;max-width:520px;padding:28px}
    .logo{align-items:center;display:flex;gap:12px;font-weight:900;letter-spacing:.18em;margin-bottom:22px}
    .mark{align-items:center;background:#00d6a3;border-radius:8px;color:#041d15;display:inline-flex;font-weight:900;height:36px;justify-content:center;letter-spacing:0;width:36px}
    h1{font-size:28px;line-height:1.1;margin:0 0 12px}
    p{color:#bfd1e3;line-height:1.55;margin:0 0 18px}
    a{align-items:center;background:#00d6a3;border-radius:7px;color:#041d15;display:inline-flex;font-weight:900;min-height:42px;padding:0 16px;text-decoration:none}
    small{color:#8296ac;display:block;margin-top:16px}
  </style>
</head>
<body>
  <main>
    <div class="logo"><span class="mark">T</span><span>TURNLY</span></div>
    <h1>${esc(title)}</h1>
    <p>${esc(message)}</p>
    ${extra}
    <a href="/invoices.html?quickbooks=connected">Return to invoices</a>
  </main>
</body>
</html>`);
}

function requestUrl(req) {
  return new URL(req.url || "/api/quickbooks-callback", publicBaseUrl(req));
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return sendHtml(res, 405, "QuickBooks Connection Failed", "This QuickBooks callback only accepts secure redirect requests.");
  }

  const { client: supabase, error: configError } = getSupabaseAdmin();
  if (configError) return sendHtml(res, 500, "QuickBooks Connection Failed", configError.message);

  const url = requestUrl(req);
  const errorMessage = url.searchParams.get("error_description") || url.searchParams.get("error") || "";
  if (errorMessage) {
    return sendHtml(res, 400, "QuickBooks Connection Canceled", `QuickBooks returned: ${errorMessage}`);
  }

  const code = String(url.searchParams.get("code") || "").trim();
  const realmId = String(url.searchParams.get("realmId") || "").trim();
  const state = String(url.searchParams.get("state") || "").trim();
  if (!code || !realmId || !state) {
    return sendHtml(res, 400, "QuickBooks Connection Failed", "QuickBooks did not send the required authorization details.");
  }

  const { data: storedState, error: stateError } = await supabase
    .from("quickbooks_oauth_states")
    .select("*")
    .eq("state", state)
    .maybeSingle();

  if (stateError) return sendHtml(res, 500, "QuickBooks Connection Failed", stateError.message);
  if (!storedState?.state) return sendHtml(res, 400, "QuickBooks Connection Failed", "This QuickBooks connection request was not recognized.");
  if (storedState.used_at) return sendHtml(res, 400, "QuickBooks Connection Failed", "This QuickBooks connection link was already used.");
  if (new Date(storedState.expires_at).getTime() < Date.now()) {
    return sendHtml(res, 400, "QuickBooks Connection Expired", "Start a fresh QuickBooks connection from the admin invoice page.");
  }

  let config = null;
  try {
    config = requireQuickBooksConfig(req);
    const tokenBody = await tokenRequest(config, {
      grant_type: "authorization_code",
      code,
      redirect_uri: config.redirectUri
    });
    await saveConnection(supabase, config, tokenBody, realmId, storedState.admin_user_id);
    await supabase
      .from("quickbooks_oauth_states")
      .update({ used_at: new Date().toISOString() })
      .eq("state", state);

    try {
      const companyBody = await quickbooksRequest(supabase, req, `/companyinfo/${encodeURIComponent(realmId)}`, { method: "GET" });
      const companyName = companyBody.CompanyInfo?.CompanyName || companyBody.CompanyInfo?.LegalName || "";
      if (companyName) {
        await supabase
          .from("quickbooks_connections")
          .update({ company_name: companyName, updated_at: new Date().toISOString() })
          .eq("realm_id", realmId);
      }
    } catch {
      // Company info is helpful but not required for invoice sync.
    }

    return sendHtml(res, 200, "QuickBooks Connected", "Turnly can now send weekly invoices to QuickBooks and pull payment status back into the portal.");
  } catch (error) {
    return sendHtml(res, 500, "QuickBooks Connection Failed", error.message || "Unable to complete the QuickBooks connection.");
  }
};
