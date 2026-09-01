const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");

const allowedAdminRoles = new Set(["admin", "owner", "super_admin"]);
const qboMinorVersion = "75";

function normalizeToken(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function sendJson(res, statusCode, body) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function bearerToken(req) {
  const header = req.headers.authorization || req.headers.Authorization || "";
  const match = String(header).match(/^Bearer\s+(.+)$/i);
  return match?.[1] || "";
}

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL
    || process.env.NEXT_PUBLIC_SUPABASE_URL
    || process.env.VITE_SUPABASE_URL
    || "https://nwnzdoveskthebfyndcs.supabase.co";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    || process.env.SUPABASE_SERVICE_KEY
    || process.env.SUPABASE_SERVICE_ROLE
    || process.env.SUPABASE_SECRET_KEY;

  if (!url || !serviceKey) {
    return {
      error: new Error("QuickBooks sync is missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in the production environment.")
    };
  }

  return {
    client: createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })
  };
}

async function requireAdmin(supabase, req) {
  const token = bearerToken(req);
  if (!token) return { error: "Missing admin session.", status: 401 };

  const { data: userResult, error: userError } = await supabase.auth.getUser(token);
  const user = userResult?.user || null;
  if (userError || !user) return { error: "Admin session is invalid.", status: 401 };

  const metadataRole = normalizeToken(user.app_metadata?.role || user.user_metadata?.role);
  if (allowedAdminRoles.has(metadataRole)) return { user };

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id,role,status")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) return { error: profileError.message, status: 500 };
  if (!allowedAdminRoles.has(normalizeToken(profile?.role))) {
    return { error: "Only admins can manage QuickBooks sync.", status: 403 };
  }

  return { user, profile };
}

function publicBaseUrl(req = {}) {
  const configured = process.env.PUBLIC_SITE_URL
    || process.env.SITE_URL
    || process.env.VERCEL_PROJECT_PRODUCTION_URL
    || process.env.URL;
  if (configured) {
    const trimmed = String(configured).trim().replace(/\/+$/, "");
    return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  }
  const headers = req.headers || {};
  const proto = String(headers["x-forwarded-proto"] || "https").split(",")[0].trim() || "https";
  const host = String(headers["x-forwarded-host"] || headers.host || "portal.turnlypros.com").split(",")[0].trim();
  return `${proto}://${host}`.replace(/\/+$/, "");
}

function quickbooksConfig(req = {}) {
  const clientId = process.env.QUICKBOOKS_CLIENT_ID || process.env.QBO_CLIENT_ID;
  const clientSecret = process.env.QUICKBOOKS_CLIENT_SECRET || process.env.QBO_CLIENT_SECRET;
  const environment = normalizeToken(process.env.QUICKBOOKS_ENVIRONMENT || process.env.QBO_ENVIRONMENT || "production") === "sandbox"
    ? "sandbox"
    : "production";
  const redirectUri = process.env.QUICKBOOKS_REDIRECT_URI
    || process.env.QBO_REDIRECT_URI
    || `${publicBaseUrl(req)}/api/quickbooks-callback`;
  const serviceItemId = process.env.QUICKBOOKS_SERVICE_ITEM_ID || process.env.QBO_SERVICE_ITEM_ID || "";
  const serviceItemName = process.env.QUICKBOOKS_SERVICE_ITEM_NAME || process.env.QBO_SERVICE_ITEM_NAME || "Turnly Professional Cleaning";
  const scope = process.env.QUICKBOOKS_SCOPE || "com.intuit.quickbooks.accounting";

  const missing = [
    !clientId ? "QUICKBOOKS_CLIENT_ID" : "",
    !clientSecret ? "QUICKBOOKS_CLIENT_SECRET" : ""
  ].filter(Boolean);

  return {
    clientId,
    clientSecret,
    environment,
    redirectUri,
    serviceItemId,
    serviceItemName,
    scope,
    missing,
    authUrl: "https://appcenter.intuit.com/connect/oauth2",
    tokenUrl: "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer",
    apiBaseUrl: environment === "sandbox"
      ? "https://sandbox-quickbooks.api.intuit.com/v3/company"
      : "https://quickbooks.api.intuit.com/v3/company"
  };
}

function requireQuickBooksConfig(req) {
  const config = quickbooksConfig(req);
  if (config.missing.length) {
    throw new Error(`QuickBooks sync is missing ${config.missing.join(" and ")} in the production environment.`);
  }
  return config;
}

function basicAuth(config) {
  return Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64");
}

async function tokenRequest(config, params) {
  const response = await fetch(config.tokenUrl, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth(config)}`,
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams(params)
  });
  const text = await response.text();
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }
  if (!response.ok) {
    throw new Error(body.error_description || body.error || `QuickBooks token request failed with HTTP ${response.status}.`);
  }
  return body;
}

function tokenExpiry(seconds, fallbackSeconds) {
  return new Date(Date.now() + (Number(seconds) || fallbackSeconds) * 1000).toISOString();
}

async function saveConnection(supabase, config, tokenBody, realmId, adminUserId) {
  const payload = {
    realm_id: String(realmId || ""),
    environment: config.environment,
    status: "connected",
    token_type: tokenBody.token_type || "bearer",
    access_token: tokenBody.access_token,
    refresh_token: tokenBody.refresh_token,
    access_token_expires_at: tokenExpiry(tokenBody.expires_in, 3600),
    refresh_token_expires_at: tokenExpiry(tokenBody.x_refresh_token_expires_in, 8726400),
    scopes: String(tokenBody.scope || config.scope || "").split(/\s+/).filter(Boolean),
    connected_by: adminUserId || null,
    updated_at: new Date().toISOString(),
    last_error: null
  };

  const { data, error } = await supabase
    .from("quickbooks_connections")
    .upsert(payload, { onConflict: "realm_id" })
    .select("*")
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function loadConnection(supabase) {
  const { data, error } = await supabase
    .from("quickbooks_connections")
    .select("*")
    .eq("status", "connected")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data?.realm_id || !data?.refresh_token) {
    throw new Error("QuickBooks is not connected yet. Connect QuickBooks from the admin invoice page first.");
  }
  return data;
}

async function refreshConnectionIfNeeded(supabase, req, connection) {
  const config = requireQuickBooksConfig(req);
  const expiresAt = connection.access_token_expires_at ? new Date(connection.access_token_expires_at).getTime() : 0;
  if (connection.access_token && expiresAt > Date.now() + 120000) {
    return { connection, config };
  }

  const tokenBody = await tokenRequest(config, {
    grant_type: "refresh_token",
    refresh_token: connection.refresh_token
  });

  const refreshed = await saveConnection(supabase, config, tokenBody, connection.realm_id, connection.connected_by);
  return { connection: refreshed, config };
}

async function quickbooksRequest(supabase, req, path, options = {}, attempt = 0) {
  const initial = await loadConnection(supabase);
  const { connection, config } = await refreshConnectionIfNeeded(supabase, req, initial);
  const delimiter = path.includes("?") ? "&" : "?";
  const url = `${config.apiBaseUrl}/${encodeURIComponent(connection.realm_id)}${path}${delimiter}minorversion=${qboMinorVersion}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(options.headers || {}),
      Authorization: `Bearer ${connection.access_token}`
    }
  });

  if (response.status === 401 && attempt < 1) {
    await refreshConnectionIfNeeded(supabase, req, { ...connection, access_token_expires_at: null });
    return quickbooksRequest(supabase, req, path, options, attempt + 1);
  }

  const text = await response.text();
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }

  if (!response.ok) {
    const fault = body.Fault?.Error?.[0];
    throw new Error(fault?.Message || fault?.Detail || body.error || `QuickBooks request failed with HTTP ${response.status}.`);
  }

  return body;
}

function qboEscape(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

async function quickbooksQuery(supabase, req, query) {
  return quickbooksRequest(supabase, req, `/query?query=${encodeURIComponent(query)}`, { method: "GET" });
}

async function loadRows(supabase, table, select = "*") {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .range(from, from + 999);
    if (error) return { rows, error };
    rows.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return { rows, error: null };
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

function dateOnly(value) {
  const date = value instanceof Date ? value : parseDate(value);
  if (!date) return "";
  const pad = (part) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function addDays(value, count) {
  const date = new Date(value);
  date.setDate(date.getDate() + count);
  return date;
}

function weekRange(reference = new Date()) {
  const source = typeof reference === "string" && /^\d{4}-\d{2}-\d{2}$/.test(reference)
    ? new Date(`${reference}T12:00:00`)
    : new Date(reference);
  const start = Number.isNaN(source.getTime()) ? new Date() : source;
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - start.getDay());
  return { start, end: addDays(start, 7), startDate: dateOnly(start), endDate: dateOnly(addDays(start, 6)) };
}

function normalizeUnit(value) {
  return normalizeToken(String(value || "").replace(/^unit\s+/i, ""));
}

function assignmentUnitNumber(row = {}) {
  const metadata = readMetadata(row);
  return firstText(row.unit_number, row.unit_name, metadata.unit_number, metadata.unit_name, metadata.property_unit_name);
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

function assignmentPropertyAddress(row = {}, property = null) {
  const metadata = readMetadata(row);
  return firstText(
    property?.address,
    property?.property_address,
    property?.billing_address,
    row.address,
    metadata.property_address,
    metadata.address
  );
}

function propertyKeyFor(row = {}, property = null) {
  const metadata = readMetadata(row);
  return String(property?.id || property?.contract_id || property?.client_id || row.portal_property_id || row.recurring_portal_property_id || row.property_id || metadata.portal_property_id || metadata.contract_id || assignmentPropertyName(row, property)).trim();
}

function propertyIdFor(row = {}, property = null) {
  const metadata = readMetadata(row);
  return property?.id || row.portal_property_id || row.recurring_portal_property_id || row.property_id || metadata.portal_property_id || null;
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

function unitName(unit = {}) {
  return firstText(unit.unit_name, unit.unit_number, unit.name, unit.label, unit.number);
}

function unitForAssignment(row = {}, units = [], property = null) {
  const metadata = readMetadata(row);
  const unitId = firstText(row.unit_id, metadata.unit_id);
  if (unitId) {
    const byId = units.find((unit) => String(unit.id || "") === String(unitId));
    if (byId) return byId;
  }
  const unitKey = normalizeUnit(assignmentUnitNumber(row));
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
    return matchesProperty && normalizeUnit(unitName(unit)) === unitKey;
  }) || null;
}

function assignmentCustomerCharge(row = {}, unit = null) {
  const metadata = readMetadata(row);
  const payment = metadata.payment && typeof metadata.payment === "object" ? metadata.payment : {};
  return numberValue(
    row.customer_charge,
    row.customer_price,
    row.revenue_amount,
    row.invoice_amount,
    row.amount,
    metadata.unit_customer_price,
    metadata.customer_charge,
    metadata.customer_price,
    metadata.invoice_amount,
    payment.customer_charge,
    payment.customer_price,
    payment.revenue_amount,
    unit?.customer_price
  );
}

function assignmentContractorPay(row = {}, unit = null) {
  const metadata = readMetadata(row);
  const payment = metadata.payment && typeof metadata.payment === "object" ? metadata.payment : {};
  return numberValue(
    row.pay_amount,
    row.contractor_pay,
    row.contractor_pay_amount,
    metadata.unit_contractor_pay,
    metadata.contractor_pay,
    payment.contractor_pay,
    payment.contractor_pay_amount,
    payment.payout_amount,
    unit?.contractor_pay
  );
}

function assignmentFallsInWeek(row = {}, range = weekRange()) {
  const start = parseDate(row.start_window);
  const end = parseDate(row.end_window) || start;
  return Boolean(start && end && start < range.end && end >= range.start);
}

function assignmentStatus(row = {}) {
  return normalizeToken(row.status || "");
}

function assignmentIsBillable(row = {}) {
  return !["cancelled", "canceled", "declined", "draft", "pending", "preferred_pending"].includes(assignmentStatus(row));
}

function buildInvoiceGroups(assignments = [], properties = [], units = [], range = weekRange()) {
  const groups = new Map();
  assignments
    .filter((row) => assignmentFallsInWeek(row, range))
    .filter(assignmentIsBillable)
    .forEach((row) => {
      const property = propertyForAssignment(row, properties);
      const unit = unitForAssignment(row, units, property);
      const amount = assignmentCustomerCharge(row, unit);
      if (!amount) return;
      const propertyKey = propertyKeyFor(row, property);
      if (!groups.has(propertyKey)) {
        groups.set(propertyKey, {
          propertyKey,
          portalPropertyId: propertyIdFor(row, property),
          propertyName: assignmentPropertyName(row, property),
          address: assignmentPropertyAddress(row, property),
          rows: [],
          lines: [],
          total: 0
        });
      }
      const group = groups.get(propertyKey);
      const unitNumber = assignmentUnitNumber(row);
      const line = {
        assignmentId: row.id,
        amount,
        description: `Professional cleaning of unit: ${unitNumber || "Unspecified"}`,
        unitNumber,
        startWindow: row.start_window,
        endWindow: row.end_window
      };
      group.rows.push(row);
      group.lines.push(line);
      group.total += amount;
    });
  return Array.from(groups.values()).sort((a, b) => a.propertyName.localeCompare(b.propertyName, undefined, { sensitivity: "base" }));
}

function buildContractorPayAssignments(assignments = [], properties = [], units = [], range = weekRange()) {
  return assignments
    .filter((row) => assignmentFallsInWeek(row, range))
    .filter((row) => ["completed", "complete", "done", "closed", "qa_pending"].includes(assignmentStatus(row)))
    .map((row) => {
      const property = propertyForAssignment(row, properties);
      const unit = unitForAssignment(row, units, property);
      return {
        row,
        property,
        unit,
        amount: assignmentContractorPay(row, unit),
        contractorId: row.assigned_to || row.claimed_by || row.completed_by || null,
        contractorName: firstText(row.assigned_to_name, row.claimed_by_name, row.contractor_name),
        contractorEmail: firstText(row.assigned_to_email, row.claimed_by_email, row.contractor_email)
      };
    })
    .filter((item) => item.row?.id && item.amount > 0);
}

async function loadTurnlyAccountingData(supabase) {
  const [assignmentsResult, unitsResult, portalPropertiesResult, contractsResult, clientsResult] = await Promise.all([
    loadRows(supabase, "assignment_blocks"),
    loadRows(supabase, "property_units"),
    loadRows(supabase, "portal_properties"),
    loadRows(supabase, "client_contracts"),
    loadRows(supabase, "clients")
  ]);
  if (assignmentsResult.error) throw assignmentsResult.error;
  return {
    assignments: assignmentsResult.rows,
    units: unitsResult.rows,
    properties: [
      ...portalPropertiesResult.rows,
      ...contractsResult.rows,
      ...clientsResult.rows
    ]
  };
}

async function findStoredCustomerLink(supabase, propertyKey) {
  const { data, error } = await supabase
    .from("quickbooks_property_customer_links")
    .select("*")
    .eq("property_key", propertyKey)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function ensureQuickBooksCustomer(supabase, req, group) {
  const existing = await findStoredCustomerLink(supabase, group.propertyKey);
  if (existing?.quickbooks_customer_id) return existing;

  const displayName = group.propertyName || "Turnly Property";
  const query = `select * from Customer where DisplayName = '${qboEscape(displayName)}'`;
  const queryBody = await quickbooksQuery(supabase, req, query);
  const found = queryBody.QueryResponse?.Customer?.[0];
  let customer = found;

  if (!customer?.Id) {
    const body = await quickbooksRequest(supabase, req, "/customer", {
      method: "POST",
      body: JSON.stringify({
        DisplayName: displayName,
        CompanyName: displayName,
        Notes: group.address ? `Turnly property address: ${group.address}` : "Created from Turnly portal invoice sync."
      })
    });
    customer = body.Customer;
  }

  if (!customer?.Id) throw new Error(`QuickBooks did not return a customer id for ${displayName}.`);

  const payload = {
    portal_property_id: group.portalPropertyId || null,
    property_key: group.propertyKey,
    property_name: displayName,
    quickbooks_customer_id: customer.Id,
    quickbooks_customer_display_name: customer.DisplayName || displayName,
    last_synced_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    last_error: null
  };

  const { data, error } = await supabase
    .from("quickbooks_property_customer_links")
    .upsert(payload, { onConflict: "property_key" })
    .select("*")
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function findIncomeAccount(supabase, req) {
  const response = await quickbooksQuery(supabase, req, "select * from Account where AccountType = 'Income'");
  const accounts = response.QueryResponse?.Account || [];
  return accounts.find((account) => normalizeToken(account.Name).includes("service")) || accounts[0] || null;
}

async function ensureServiceItem(supabase, req) {
  const config = requireQuickBooksConfig(req);
  if (config.serviceItemId) return config.serviceItemId;

  const name = config.serviceItemName;
  const existingBody = await quickbooksQuery(supabase, req, `select * from Item where Name = '${qboEscape(name)}'`);
  const existing = existingBody.QueryResponse?.Item?.[0];
  if (existing?.Id) return existing.Id;

  const account = await findIncomeAccount(supabase, req);
  if (!account?.Id) {
    throw new Error("QuickBooks needs an income account before Turnly can create the cleaning service item.");
  }

  const createdBody = await quickbooksRequest(supabase, req, "/item", {
    method: "POST",
    body: JSON.stringify({
      Name: name,
      Type: "Service",
      IncomeAccountRef: { value: account.Id, name: account.Name || "Income" }
    })
  });
  if (!createdBody.Item?.Id) throw new Error("QuickBooks did not return a service item id.");
  return createdBody.Item.Id;
}

async function invoiceLinkForGroup(supabase, range, group) {
  const { data, error } = await supabase
    .from("quickbooks_invoice_links")
    .select("*")
    .eq("week_start", range.startDate)
    .eq("property_key", group.propertyKey)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

function invoiceStatusFromQuickBooks(invoice = {}) {
  const balance = numberValue(invoice.Balance);
  const total = numberValue(invoice.TotalAmt);
  if (invoice.Id && balance <= 0 && total > 0) return "paid";
  if (invoice.Id) return "open";
  return "drafted";
}

async function saveInvoiceLink(supabase, range, group, customer, invoice, payload = {}) {
  const status = invoiceStatusFromQuickBooks(invoice);
  const now = new Date().toISOString();
  const sourceAssignmentIds = group.rows.map((row) => row.id).filter(Boolean);
  const row = {
    week_start: range.startDate,
    week_end: range.endDate,
    portal_property_id: group.portalPropertyId || null,
    property_key: group.propertyKey,
    property_name: group.propertyName,
    quickbooks_customer_id: customer.quickbooks_customer_id || customer.Id || null,
    quickbooks_invoice_id: invoice.Id || null,
    quickbooks_doc_number: invoice.DocNumber || null,
    quickbooks_sync_token: invoice.SyncToken || null,
    quickbooks_status: status,
    quickbooks_balance: numberValue(invoice.Balance),
    quickbooks_total_amt: numberValue(invoice.TotalAmt, group.total),
    source_assignment_ids: sourceAssignmentIds,
    payload,
    sent_to_quickbooks_at: now,
    paid_at: status === "paid" ? now : null,
    synced_at: now,
    updated_at: now,
    last_error: null
  };

  const { data, error } = await supabase
    .from("quickbooks_invoice_links")
    .upsert(row, { onConflict: "week_start,property_key" })
    .select("*")
    .maybeSingle();
  if (error) throw error;

  if (sourceAssignmentIds.length) {
    await supabase
      .from("assignment_blocks")
      .update({
        quickbooks_invoice_link_id: data.id,
        quickbooks_invoice_id: invoice.Id || null,
        quickbooks_invoice_status: status,
        quickbooks_invoice_synced_at: now
      })
      .in("id", sourceAssignmentIds);
  }

  return data;
}

async function createQuickBooksInvoice(supabase, req, range, group, customer) {
  const itemId = await ensureServiceItem(supabase, req);
  const body = {
    CustomerRef: {
      value: customer.quickbooks_customer_id || customer.Id,
      name: customer.quickbooks_customer_display_name || customer.DisplayName || group.propertyName
    },
    TxnDate: range.startDate,
    DueDate: range.endDate,
    PrivateNote: `Turnly weekly invoice ${range.startDate} through ${range.endDate} for ${group.propertyName}`,
    Line: group.lines.map((line) => ({
      DetailType: "SalesItemLineDetail",
      Amount: Number(line.amount.toFixed(2)),
      Description: line.description,
      SalesItemLineDetail: {
        ItemRef: { value: itemId },
        Qty: 1,
        UnitPrice: Number(line.amount.toFixed(2))
      }
    }))
  };
  const response = await quickbooksRequest(supabase, req, "/invoice", {
    method: "POST",
    body: JSON.stringify(body)
  });
  return { invoice: response.Invoice, payload: body };
}

async function refreshInvoiceStatus(supabase, req, link) {
  if (!link.quickbooks_invoice_id) return null;
  const response = await quickbooksRequest(supabase, req, `/invoice/${encodeURIComponent(link.quickbooks_invoice_id)}`, { method: "GET" });
  const invoice = response.Invoice || {};
  const status = invoiceStatusFromQuickBooks(invoice);
  const now = new Date().toISOString();
  const update = {
    quickbooks_status: status,
    quickbooks_balance: numberValue(invoice.Balance),
    quickbooks_total_amt: numberValue(invoice.TotalAmt),
    quickbooks_sync_token: invoice.SyncToken || link.quickbooks_sync_token || null,
    paid_at: status === "paid" ? now : null,
    synced_at: now,
    updated_at: now,
    last_error: null
  };
  const { data, error } = await supabase
    .from("quickbooks_invoice_links")
    .update(update)
    .eq("id", link.id)
    .select("*")
    .maybeSingle();
  if (error) throw error;

  if (Array.isArray(link.source_assignment_ids) && link.source_assignment_ids.length) {
    await supabase
      .from("assignment_blocks")
      .update({
        quickbooks_invoice_status: status,
        quickbooks_invoice_synced_at: now
      })
      .in("id", link.source_assignment_ids);
  }

  return data;
}

function candidatePayeeName(candidate = {}) {
  const entity = candidate.EntityRef || candidate.PayeeRef || candidate.VendorRef || {};
  return firstText(entity.name, entity.value, candidate.Name, candidate.PrintOnCheckName);
}

function candidateAmount(candidate = {}) {
  return numberValue(candidate.TotalAmt, candidate.Amount, candidate.Credit);
}

function candidateDate(candidate = {}) {
  return firstText(candidate.TxnDate, candidate.MetaData?.CreateTime);
}

function candidateText(candidate = {}) {
  return [
    candidate.Id,
    candidate.DocNumber,
    candidate.PrivateNote,
    candidate.Memo,
    candidatePayeeName(candidate)
  ].map(normalizeToken).join(" ");
}

function contractorPaymentMatch(item, candidate, type) {
  const amount = candidateAmount(candidate);
  if (!amount || Math.abs(amount - item.amount) > 0.01) return null;

  const text = candidateText(candidate);
  const names = [
    item.contractorName,
    item.contractorEmail,
    item.contractorId,
    item.row.id,
    assignmentUnitNumber(item.row)
  ].map(normalizeToken).filter(Boolean);
  const matchedIdentity = names.some((name) => name.length >= 3 && text.includes(name));

  if (!matchedIdentity) return null;
  return {
    type,
    candidate,
    confidence: 0.95
  };
}

async function queryPaymentCandidates(supabase, req, entity, range) {
  try {
    const query = `select * from ${entity} where TxnDate >= '${range.startDate}' and TxnDate <= '${range.endDate}'`;
    const body = await quickbooksQuery(supabase, req, query);
    return body.QueryResponse?.[entity] || [];
  } catch {
    return [];
  }
}

function paymentLookupRange(range = {}) {
  if (range.paymentLookup?.startDate && range.paymentLookup?.endDate) return range.paymentLookup;
  const today = dateOnly(new Date());
  const endDate = String(today || "") > String(range.endDate || "") ? today : range.endDate;
  return { startDate: range.startDate, endDate: endDate || range.endDate };
}

async function syncContractorPaymentStatuses(supabase, req, assignments, properties, units, range) {
  const payItems = buildContractorPayAssignments(assignments, properties, units, range);
  const candidateRange = paymentLookupRange(range);
  const [purchases, checks, billPayments] = await Promise.all([
    queryPaymentCandidates(supabase, req, "Purchase", candidateRange),
    queryPaymentCandidates(supabase, req, "Check", candidateRange),
    queryPaymentCandidates(supabase, req, "BillPayment", candidateRange)
  ]);
  const candidates = [
    ...purchases.map((candidate) => ({ type: "Purchase", candidate })),
    ...checks.map((candidate) => ({ type: "Check", candidate })),
    ...billPayments.map((candidate) => ({ type: "BillPayment", candidate }))
  ];

  const used = new Set();
  const now = new Date().toISOString();
  const matched = [];
  const skippedOverrides = [];

  for (const item of payItems) {
    if (item.row.payment_status_override === true) {
      skippedOverrides.push(item.row.id);
      continue;
    }
    const match = candidates
      .map((entry, index) => ({ index, ...entry, match: contractorPaymentMatch(item, entry.candidate, entry.type) }))
      .filter((entry) => entry.match && !used.has(`${entry.type}:${entry.candidate.Id}`))
      .sort((a, b) => b.match.confidence - a.match.confidence)[0];

    if (!match?.candidate?.Id) continue;
    used.add(`${match.type}:${match.candidate.Id}`);

    const txnDate = candidateDate(match.candidate);
    const amount = candidateAmount(match.candidate);
    const linkPayload = {
      assignment_id: item.row.id,
      contractor_id: item.contractorId || null,
      contractor_name: item.contractorName || null,
      contractor_email: item.contractorEmail || null,
      quickbooks_entity_type: match.type,
      quickbooks_entity_id: match.candidate.Id,
      quickbooks_doc_number: match.candidate.DocNumber || null,
      quickbooks_txn_date: txnDate || null,
      quickbooks_total_amt: amount,
      quickbooks_status: "paid",
      match_confidence: match.match.confidence,
      payload: match.candidate,
      synced_at: now,
      updated_at: now,
      last_error: null
    };
    await supabase
      .from("quickbooks_contractor_payment_links")
      .upsert(linkPayload, { onConflict: "assignment_id,quickbooks_entity_type,quickbooks_entity_id" });

    const payment = {
      ...(readMetadata(item.row).payment || {}),
      status: "paid",
      paid: true,
      paid_at: txnDate || now,
      paid_amount: amount,
      payout_amount: amount,
      amount_paid: amount,
      source: "quickbooks",
      quickbooks_entity_type: match.type,
      quickbooks_entity_id: match.candidate.Id,
      quickbooks_synced_at: now
    };
    await supabase
      .from("assignment_blocks")
      .update({
        metadata: { ...readMetadata(item.row), payment },
        payment_status: "paid",
        pay_status: "paid",
        payout_status: "paid",
        paid_out: true,
        paid_at: txnDate || now,
        paid_amount: amount,
        paid_notes: `Synced paid status from QuickBooks ${match.type} ${match.candidate.DocNumber || match.candidate.Id}.`,
        quickbooks_payment_status: "paid",
        quickbooks_payment_txn_id: match.candidate.Id,
        quickbooks_payment_txn_type: match.type,
        quickbooks_payment_synced_at: now,
        payment_status_source: "quickbooks"
      })
      .eq("id", item.row.id)
      .eq("payment_status_override", false);
    matched.push({ assignmentId: item.row.id, type: match.type, quickbooksId: match.candidate.Id, amount });
  }

  return {
    considered: payItems.length,
    matched,
    skippedOverrides,
    candidateCount: candidates.length,
    paymentLookupRange: candidateRange
  };
}

module.exports = {
  assignmentFallsInWeek,
  buildInvoiceGroups,
  createQuickBooksInvoice,
  ensureQuickBooksCustomer,
  invoiceLinkForGroup,
  loadConnection,
  loadTurnlyAccountingData,
  publicBaseUrl,
  quickbooksConfig,
  quickbooksRequest,
  readJsonBody,
  refreshConnectionIfNeeded,
  refreshInvoiceStatus,
  requireAdmin,
  requireQuickBooksConfig,
  saveConnection,
  saveInvoiceLink,
  sendJson,
  syncContractorPaymentStatuses,
  tokenRequest,
  weekRange,
  getSupabaseAdmin,
  crypto
};
