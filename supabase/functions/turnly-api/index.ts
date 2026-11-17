// Turnly Pro backend on Supabase (moved from the Rork Cloudflare Worker, same routes).
//
// Base URL: https://nwnzdoveskthebfyndcs.supabase.co/functions/v1/turnly-api
//
// - POST /push/register | /push/unregister | /push/test | /push/webhook, GET /push/health
// - POST /push/tick                 sends due job reminders (pg_cron, every minute; idempotent)
// - GET  /jobs/public, POST /jobs/sync
// - /onboarding/*                   contractor onboarding + admin API (see onboarding-hub.ts)
// - /internal/counts|verify-files    read-only audit, authenticated with the private cron secret
//
// The two "hubs" used to be Durable Objects; they are now plain classes over the
// turnly_backend Postgres schema, reached through the same internal Request shape.

import { PushHub } from "./push-hub.ts";
import { OnboardingHub } from "./onboarding-hub.ts";
import { ADMIN_PAGE } from "./admin-page.ts";
import { accessRole } from "./_lib/access.ts";
import { db } from "./db.ts";
import { importKey, openBytes } from "./_lib/vault.ts";
import { sha256Hex } from "./_lib/signing.ts";

const get = (name: string) => Deno.env.get(name) || undefined;

const env = {
  PUSH_WEBHOOK_SECRET: get("PUSH_WEBHOOK_SECRET"),
  PORTAL_WEBHOOK_SECRET: get("PORTAL_WEBHOOK_SECRET"),
  SUPABASE_URL: get("SUPABASE_URL"),
  SUPABASE_PUBLISHABLE_KEY: undefined as string | undefined,
  CHECKR_API_KEY: get("CHECKR_API_KEY"),
  ONBOARDING_DATA_KEY: get("ONBOARDING_DATA_KEY"),
  APNS_KEY_ID: get("APNS_KEY_ID"),
  APNS_TEAM_ID: get("APNS_TEAM_ID"),
  APNS_PRIVATE_KEY: get("APNS_PRIVATE_KEY"),
  APNS_BUNDLE_ID: get("APNS_BUNDLE_ID"),
  FCM_SERVICE_ACCOUNT: get("FCM_SERVICE_ACCOUNT"),
};
type Env = typeof env;

// Client-safe values (the same ones the portal and app already publish).
const DEFAULT_SUPABASE_URL = "https://nwnzdoveskthebfyndcs.supabase.co";
const DEFAULT_SUPABASE_KEY = "sb_publishable_0fESHyuQyVSySksGWO-HDA_FX4_r5fP";
/** Public base of this function; file links and the admin page are built on it. */
const PUBLIC_BASE = `${DEFAULT_SUPABASE_URL}/functions/v1/turnly-api`;

const pushHub = new PushHub(env);
const onboardingHub = new OnboardingHub(env);

/** Stand-in for the Durable Object namespace: dispatches internal Requests to the hub classes. */
const DO = {
  fetch(request: Request): Promise<Response> {
    return request.headers.get("X-Rork-DO-Class") === "OnboardingHub" ? onboardingHub.fetch(request) : pushHub.fetch(request);
  },
};

async function hmacHex(key: string, body: ArrayBuffer): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey("raw", new TextEncoder().encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, body));
  return Array.from(signature, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Checkr webhook: verifies the signature (HMAC-SHA256 of the body with the API
 * key), finds the candidate's email, and hands a small event to the onboarding hub.
 */
async function checkrWebhook(request: Request, env: Env): Promise<Response> {
  const apiKey = env.CHECKR_API_KEY?.trim();
  if (!apiKey) return Response.json({ ok: false, error: "CHECKR_API_KEY is not set" }, { status: 503 });
  const raw = await request.arrayBuffer();
  const provided = (request.headers.get("X-Checkr-Signature") ?? "").trim().toLowerCase();
  if (!provided || !safeEqual(provided, await hmacHex(apiKey, raw))) return Response.json({ ok: false, error: "Forbidden" }, { status: 403 });
  let event: { type?: unknown; data?: { object?: Record<string, unknown> } };
  try {
    event = JSON.parse(new TextDecoder().decode(raw));
  } catch {
    return Response.json({ ok: false, error: "Invalid payload" }, { status: 400 });
  }
  const type = typeof event.type === "string" ? event.type : "";
  const object = event.data?.object ?? {};
  const str = (value: unknown) => (typeof value === "string" && value ? value : null);
  const isReport = type.startsWith("report.");
  const candidateId = str(object.candidate_id);
  let email = str(object.email) ?? str((object.candidate as Record<string, unknown> | undefined)?.email);
  if (!email && candidateId) {
    const response = await fetch(`https://api.checkr.com/v1/candidates/${encodeURIComponent(candidateId)}`, {
      headers: { Authorization: `Basic ${btoa(`${apiKey}:`)}` },
    });
    if (response.ok) email = str(((await response.json().catch(() => ({}))) as { email?: unknown }).email);
    else console.log("Checkr candidate lookup failed", response.status);
  }
  const payload = {
    type,
    email,
    candidateId,
    reportId: isReport ? str(object.id) : str(object.report_id),
    invitationId: type.startsWith("invitation.") ? str(object.id) : null,
    status: str(object.status),
    result: str(object.result),
    adjudication: str(object.adjudication),
  };
  return DO.fetch(
    new Request("https://internal/internal/checkr-event", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Checkr-Verified": "1", "X-Rork-DO-Class": "OnboardingHub" },
      body: JSON.stringify(payload),
    }),
  );
}

function hub(path: string, body?: unknown): Promise<Response> {
  return DO.fetch(
    new Request(`https://internal${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { "Content-Type": "application/json", "X-Rork-DO-Class": "PushHub" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
}

type SupabaseUser = { id?: string; app_metadata?: { role?: string }; user_metadata?: { role?: string } };

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

type ProfileRow = {
  role?: string;
  full_name?: string;
  email?: string;
  status?: string | null;
  is_active?: boolean | null;
  active?: boolean | null;
  disabled?: boolean | null;
  deleted_at?: string | null;
  contractor_approved?: boolean | null;
  created_at?: string | null;
};

type Caller = {
  userId: string;
  email: string | null;
  name: string | null;
  role: "contractor" | "admin";
  /** profiles.contractor_approved as Supabase returned it (null when unset or unreadable). */
  approved: boolean | null;
  createdAt: string | null;
};

/**
 * Verifies the session and database-owned additive roles. Pending contractors
 * may open onboarding; admin routes still require central admin access.
 */
async function onboardingCaller(token: string | null, env: Env, allowApplicant = true, preferContractor = false): Promise<Caller | null> {
  if (!token) return null;
  const base = env.SUPABASE_URL || DEFAULT_SUPABASE_URL;
  const headers = { Authorization: `Bearer ${token}`, apikey: env.SUPABASE_PUBLISHABLE_KEY || DEFAULT_SUPABASE_KEY };
  const response = await fetch(`${base}/auth/v1/user`, { headers });
  if (!response.ok) return null;
  const user = (await response.json().catch(() => ({}))) as SupabaseUser & { email?: string };
  if (!user.id) return null;
  const profileResponse = await fetch(`${base}/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=*&limit=1`, { headers });
  const profiles = profileResponse.ok ? ((await profileResponse.json().catch(() => [])) as ProfileRow[]) : [];
  const profile = profiles[0];
  const accessResponse = await fetch(`${base}/rest/v1/rpc/my_app_access`, {
    method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: "{}",
  });
  if (!accessResponse.ok) return null;
  const role = accessRole(profile, await accessResponse.json().catch(() => null), allowApplicant, preferContractor);
  const email = user.email ?? profile?.email ?? null;
  const name = profile?.full_name ?? null;
  const approved = typeof profile?.contractor_approved === "boolean" ? profile.contractor_approved : null;
  const createdAt = profile?.created_at ?? null;
  return role ? { userId: user.id, email, name, role, approved, createdAt } : null;
}

const PORTAL_ORIGINS = new Set(["https://portal.turnlypros.com", "https://turnlypros.com", "https://www.turnlypros.com"]);

function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("Origin") ?? "";
  if (!PORTAL_ORIGINS.has(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Supabase-Auth, X-File-Name, X-Expiration-Date, X-Require-Resign, apikey, x-client-info",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function withCors(request: Request, response: Response): Response {
  const extra = corsHeaders(request);
  if (Object.keys(extra).length === 0) return response;
  const out = new Response(response.body, response);
  for (const [name, value] of Object.entries(extra)) out.headers.set(name, value);
  return out;
}

function webhookAllowed(request: Request, env: Env, url: URL): boolean {
  const provided = request.headers.get("x-turnly-secret") ?? url.searchParams.get("secret") ?? "";
  return [env.PORTAL_WEBHOOK_SECRET, env.PUSH_WEBHOOK_SECRET].some((secret) => Boolean(secret) && safeEqual(provided, secret as string));
}

/** Hands a verified contractor_documents webhook to the onboarding hub. */
function portalEvent(event: unknown): Promise<Response> {
  return DO.fetch(
    new Request("https://internal/internal/portal-event", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Portal-Verified": "1", "X-Rork-DO-Class": "OnboardingHub" },
      body: JSON.stringify(event),
    }),
  );
}

// Onboarding stays closed until the Worker's data has been copied in, so the hub
// never seeds a fresh checklist on top of the real one.
let importDone = false;
async function onboardingReady(): Promise<boolean> {
  if (importDone) return true;
  const rows = (await db().exec("SELECT 1 FROM meta WHERE key = 'worker_import_done'")).toArray();
  importDone = rows.length > 0;
  return importDone;
}

async function onboarding(request: Request, env: Env, url: URL, path: string): Promise<Response> {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request) });
  if (!(await onboardingReady())) {
    return withCors(request, Response.json({ ok: false, error: "Onboarding is being moved. Try again in a few minutes." }, { status: 503 }));
  }
  return withCors(request, await onboardingRoute(request, env, url, path));
}

// Private portal adapter: full-access integration + service credential, no browser JWT.
async function integrationOnboardingCaller(request: Request, sub: string) {
  const keyId=request.headers.get("X-Turnly-Integration-Id");
  if(!keyId) return null;
  const secret=request.headers.get("X-Supabase-Auth");
  if(!secret || !/^[0-9a-f-]{36}$/i.test(keyId)) return null;
  // No deletion, sensitive-answer reveal, signatures, or arbitrary backend routes.
  const allowed=/^\/admin\/contractors\/[0-9a-f-]{36}(?:\/items\/[\w-]+\/(mark|reset|progress))?$/.test(sub)
    || /^\/admin\/submissions\/[\w-]+\/(link|review)$/.test(sub);
  if(!allowed || !["GET","POST"].includes(request.method)) return null;
  // PostgREST authenticates either legacy or rotated server keys. This RPC grants
  // EXECUTE only to service_role; a browser/admin JWT or guessed key ID cannot call it.
  const response=await fetch(`${env.SUPABASE_URL||DEFAULT_SUPABASE_URL}/rest/v1/rpc/integration_onboarding_actor`,{method:'POST',headers:{apikey:secret,Authorization:'Bearer '+secret,'Content-Type':'application/json'},body:JSON.stringify({p_key:keyId}),signal:AbortSignal.timeout(10000)});
  if(!response.ok)return null;
  const row=await response.json();
  return row?{userId:row.id,role:"admin" as const,email:row.email,name:row.full_name,approved:null,createdAt:null}:null;
}

async function onboardingRoute(request: Request, env: Env, url: URL, path: string): Promise<Response> {
  const sub = path.slice("/onboarding".length) || "/";
  if (sub === "/portal-webhook" && request.method === "POST") {
    if (!env.PORTAL_WEBHOOK_SECRET && !env.PUSH_WEBHOOK_SECRET) return Response.json({ ok: false, error: "Webhook secret is not set" }, { status: 503 });
    if (!webhookAllowed(request, env, url)) return Response.json({ ok: false, error: "Forbidden" }, { status: 403 });
    const event = await request.json().catch(() => null);
    if (!event || typeof event !== "object") return Response.json({ ok: false, error: "Invalid payload" }, { status: 400 });
    return portalEvent(event);
  }
  if (sub === "/checkr-webhook" && request.method === "POST") return checkrWebhook(request, env);
  const forward = (target: string, headers: Record<string, string>, body?: ArrayBuffer) =>
    DO.fetch(
      new Request(`https://internal${target}${url.search}`, {
        method: request.method,
        headers: { ...headers, "X-Rork-DO-Class": "OnboardingHub" },
        body: body && body.byteLength > 0 ? body : undefined,
      }),
    );

  if (sub.startsWith("/f/") && request.method === "GET") return forward(`/file/${sub.slice(3)}`, {});
  if (sub === "/health" && request.method === "GET") return forward("/health", {});
  if ((sub === "/admin" || sub === "/admin/") && request.method === "GET") {
    return new Response(ADMIN_PAGE, {
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Frame-Options": "DENY" },
    });
  }

  const token =
    request.headers.get("X-Supabase-Auth")?.trim() ||
    request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "").trim() ||
    null;
  const caller = request.headers.has("X-Turnly-Integration-Id")
    ? await integrationOnboardingCaller(request,sub)
    : await onboardingCaller(token, env, true, !sub.startsWith("/admin/"));
  if (!caller) return Response.json({ ok: false, error: "Sign in with your Turnly account to continue." }, { status: 401 });
  if (sub.startsWith("/admin/") !== (caller.role === "admin")) {
    return Response.json({ ok: false, error: "This account can't open that page." }, { status: 403 });
  }
  const ascii = (value: string | null) => (value ?? "").replace(/[^\x20-\x7E]/g, "").slice(0, 200);
  const headers: Record<string, string> = {
    "X-User-Id": caller.userId,
    "X-User-Role": caller.role,
    "X-User-Email": ascii(caller.email),
    "X-User-Name": ascii(caller.name),
    "X-Origin": PUBLIC_BASE,
    "X-Client-IP": (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim(),
    "X-Client-UA": ascii(request.headers.get("User-Agent")),
    "X-Supabase-Auth": token ?? "",
  };
  if (caller.role === "contractor" && sub === "/status" && request.method === "GET") {
    // Evidence for the grandfathered background exception, read server-side (never from the app).
    if (caller.approved !== null) headers["X-Profile-Approved"] = caller.approved ? "1" : "0";
    if (caller.createdAt) headers["X-Profile-Created"] = ascii(caller.createdAt);
    if (caller.approved === true && token) {
      const waived = await portalWaivedItemIds(token);
      if (waived.length > 0) headers["X-Portal-Waived"] = waived.join(",").slice(0, 4000);
    }
  }
  for (const name of ["Content-Type", "X-File-Name", "X-Expiration-Date", "X-Require-Resign"]) {
    const value = request.headers.get(name);
    if (value) headers[name] = value;
  }
  const body = request.method === "GET" ? undefined : await request.arrayBuffer();
  return forward(sub, headers, body);
}

/** Checklist item ids Turnly waived for this contractor in the admin portal (best effort, empty on any failure). */
async function portalWaivedItemIds(token: string): Promise<string[]> {
  try {
    const response = await fetch("https://portal.turnlypros.com/api/contractor-onboarding", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action: "status" }),
      signal: AbortSignal.timeout(4000),
    });
    if (!response.ok) return [];
    const data = (await response.json().catch(() => ({}))) as { items?: { id?: unknown; kind?: unknown; waived?: unknown }[] };
    return (Array.isArray(data.items) ? data.items : [])
      .filter((item) => item?.waived === true && item.kind !== "academy" && typeof item.id === "string" && /^[\w-]{1,80}$/.test(item.id))
      .map((item) => item.id as string);
  } catch {
    return [];
  }
}

/**
 * Refreshes the public Job Board from Supabase using the caller's own session
 * (row-level security decides what they can read). An admin sees every job,
 * so their read replaces the whole board; a contractor's read only adds/updates.
 */
async function syncPublicJobs(request: Request, env: Env): Promise<Response> {
  const token =
    request.headers.get("X-Supabase-Auth")?.trim() ||
    request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "").trim() ||
    null;
  const caller = await onboardingCaller(token, env);
  if (!caller) return Response.json({ ok: false, error: "Sign in to refresh jobs." }, { status: 401 });
  const base = env.SUPABASE_URL || DEFAULT_SUPABASE_URL;
  const response = await fetch(
    `${base}/rest/v1/assignment_blocks?select=*&status=in.(open,preferred_pending)&claimed_by=is.null&order=start_window.asc&limit=1000`,
    { headers: { Authorization: `Bearer ${token}`, apikey: env.SUPABASE_PUBLISHABLE_KEY || DEFAULT_SUPABASE_KEY } },
  );
  if (!response.ok) return Response.json({ ok: false, error: "Couldn't read jobs." }, { status: 502 });
  const rows = (await response.json().catch(() => [])) as unknown[];
  return hub("/public-sync", { rows: Array.isArray(rows) ? rows : [], full: caller.role === "admin" });
}

const unauthorized = () =>
  Response.json({ ok: false, error: "Sign in with your Turnly account to turn on notifications." }, { status: 401 });

/**
 * Push callers: contractor-only accounts or active portal admins (checked by
 * `onboardingCaller`). The role comes from the server, never from the app.
 */
async function pushCaller(request: Request, env: Env): Promise<{ userId: string; role: "contractor" | "admin" } | null> {
  const token =
    request.headers.get("X-Supabase-Auth")?.trim() ||
    null;
  const caller = await onboardingCaller(token, env, false);
  return caller ? { userId: caller.userId, role: caller.role } : null;
}

// MARK: One-time import from the Worker

const IMPORT_TABLES: Record<string, readonly string[]> = {
  push: ["devices", "thread_members", "sent", "reminders", "public_jobs"],
  onboarding: [
    "items", "item_versions", "files", "file_chunks", "submissions", "contractors", "meta",
    "onboarding_profiles", "reveals", "background_progress", "background_grandfather",
  ],
};

async function cronAllowed(request: Request): Promise<boolean> {
  const provided = request.headers.get('x-turnly-cron') || '';
  if (provided.length < 32 || provided.length > 200) return false;
  const rows = (await db().exec<{value:string}>("SELECT value FROM runtime_secrets WHERE key = 'cron'")).toArray();
  return Boolean(rows[0]?.value) && safeEqual(provided, rows[0].value);
}

async function tableCounts(): Promise<Record<string, number>> {
  const sql = db();
  const out: Record<string, number> = {};
  for (const table of [...IMPORT_TABLES.push, ...IMPORT_TABLES.onboarding]) {
    out[table] = (await sql.exec<{ n: number }>(`SELECT COUNT(*)::int AS n FROM ${table}`)).one().n;
  }
  return out;
}

/** Opens every stored file with ONBOARDING_DATA_KEY and compares its SHA-256 (no contents leave the server). */
async function verifyFiles(url: URL): Promise<Response> {
  const sql = db();
  const offset = Math.max(0, Math.floor(Number(url.searchParams.get('offset')) || 0));
  const total = (await sql.exec<{n:number}>("SELECT COUNT(*)::integer AS n FROM files")).one().n;
  const key = env.ONBOARDING_DATA_KEY ? await importKey(env.ONBOARDING_DATA_KEY.trim()) : null;
  const files = (await sql.exec<{ id: string; sha: string; sealed: string | null; size: number }>("SELECT id, sha, sealed, size FROM files ORDER BY id LIMIT 1 OFFSET ?", offset)).toArray();
  let ok = 0;
  const bad: string[] = [];
  for (const file of files) {
    try {
      const chunks = (await sql.exec<{ data: ArrayBuffer }>("SELECT data FROM file_chunks WHERE file_id = ? ORDER BY idx", file.id)).toArray();
      const out = new Uint8Array(file.size);
      let offset = 0;
      for (const chunk of chunks) {
        const part = file.sealed === "env" && key ? await openBytes(key, new Uint8Array(chunk.data)) : new Uint8Array(chunk.data);
        out.set(part, offset);
        offset += part.length;
      }
      if (offset === file.size && (await sha256Hex(out)) === file.sha) ok += 1;
      else bad.push(file.id);
    } catch {
      bad.push(file.id);
    }
  }
  return Response.json({ ok: bad.length === 0, total, offset, nextOffset: offset + files.length < total ? offset + files.length : null, files: files.length, verified: ok, failed: bad });
}

// MARK: Router

/** `/functions/v1/turnly-api/push/register` (or `/turnly-api/push/register`) → `/push/register`. */
function routePath(pathname: string): string {
  const stripped = pathname.replace(/^\/functions\/v1/, "").replace(/^\/turnly-api(?=\/|$)/, "");
  return stripped || "/";
}

async function route(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const pathname = routePath(url.pathname);

  if (pathname === "/ping" || pathname === "/") return Response.json({ ok: true, now: new Date().toISOString() });

  if (pathname === "/onboarding" || pathname.startsWith("/onboarding/")) return onboarding(request, env, url, pathname);

  // Public Job Board: anyone can browse open jobs (no street address) without an account.
  if (pathname === "/jobs/public" && request.method === "GET") {
    const result = await hub("/public-jobs");
    return new Response(result.body, {
      status: result.status,
      headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=60", "Access-Control-Allow-Origin": "*" },
    });
  }
  if (pathname === "/jobs/sync" && request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }
  if (pathname === "/jobs/sync" && request.method === "POST") return withCors(request, await syncPublicJobs(request, env));

  if (pathname === "/push/health" && request.method === "GET") {
    const status = (await (await hub("/health")).json()) as Record<string, unknown>;
    return Response.json({ ...status, webhookSecretConfigured: Boolean(env.PUSH_WEBHOOK_SECRET) });
  }

  if (pathname.startsWith("/internal/")) {
    if (!(await cronAllowed(request))) return Response.json({ ok: false, error: "Forbidden" }, { status: 403 });
    // Import is retired after the verified migration. Never overwrite active data
    // from a stale legacy snapshot; any recovery is an explicit offline operation.
    if (pathname === "/internal/import" || pathname === "/internal/finish-import") return Response.json({ok:false,error:'Import retired.'},{status:410});
    if (pathname === "/internal/counts" && request.method === "GET") return Response.json({ ok: true, counts: await tableCounts() });
    if (pathname === "/internal/verify-files" && request.method === "GET") return verifyFiles(url);
    return new Response("not found", { status: 404 });
  }

  if (request.method !== "POST") return new Response("not found", { status: 404 });

  switch (pathname) {
    case "/push/tick":
      if (!(await cronAllowed(request))) return Response.json({ok:false,error:'Forbidden'},{status:403});
      return hub("/tick", {});
    case "/push/register": {
      const caller = await pushCaller(request, env);
      if (!caller) return unauthorized();
      const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
      const sql=db();
      const profile=(await sql.exec<Record<string,unknown>>('SELECT allowed_regions, allowed_property_ids, allowed_property_names FROM public.profiles WHERE id = ?::uuid',caller.userId)).toArray()[0];
      if(!profile)return unauthorized();
      const members=(await sql.exec<{thread_id:string}>('SELECT thread_id FROM public.message_thread_participants WHERE user_id = ?::uuid',caller.userId)).toArray();
      return hub("/register", { ...body, userId: caller.userId, role: caller.role,
        threadIds:members.map(m=>m.thread_id),
        access:{regions:profile.allowed_regions||[],propertyIds:profile.allowed_property_ids||[],propertyNames:profile.allowed_property_names||[]}
      });
    }
    case "/push/unregister": {
      const body = (await request.json().catch(() => ({}))) as { token?: string };
      const token=request.headers.get('X-Supabase-Auth')?.trim()||request.headers.get('Authorization')?.replace(/^Bearer\s+/i,'').trim();
      if(token){
        const auth=await fetch(`${env.SUPABASE_URL||DEFAULT_SUPABASE_URL}/auth/v1/user`,{headers:{Authorization:`Bearer ${token}`,apikey:env.SUPABASE_PUBLISHABLE_KEY||DEFAULT_SUPABASE_KEY}});
        const user=auth.ok?await auth.json():null;
        if(!user?.id)return unauthorized();
        return hub('/unregister',{token:String(body.token??'').trim(),userId:user.id});
      }
      // Temporary compatibility for installed pre-update clients. Controlled by
      // private database configuration; remove after those versions retire.
      const legacy=(await db().exec("SELECT value FROM meta WHERE key = 'legacy_unsubscribe_enabled'")).toArray()[0]?.value==='true';
      if(!legacy)return unauthorized();
      return hub('/unregister',{token:String(body.token??'').trim(),legacy:true});
    }
    case "/push/test": {
      const caller = await pushCaller(request, env);
      if (!caller) return unauthorized();
      return hub("/test", { userId: caller.userId });
    }
    case "/push/webhook": {
      const expected = env.PUSH_WEBHOOK_SECRET ?? "";
      if (!expected) return Response.json({ ok: false, error: "PUSH_WEBHOOK_SECRET is not set" }, { status: 503 });
      const provided = request.headers.get("x-turnly-secret") ?? url.searchParams.get("secret") ?? "";
      if (!safeEqual(provided, expected)) return Response.json({ ok: false, error: "Forbidden" }, { status: 403 });
      const event = await request.json().catch(() => null);
      if (!event || typeof event !== "object") return Response.json({ ok: false, error: "Invalid payload" }, { status: 400 });
      // The same webhook can carry contractor_documents changes (portal approvals).
      if ((event as { table?: unknown }).table === "contractor_documents") {
        if (!(await onboardingReady())) return Response.json({ ok: false, error: "Onboarding is being moved." }, { status: 503 });
        return portalEvent(event);
      }
      return hub("/event", event);
    }
    default:
      return new Response("not found", { status: 404 });
  }
}

Deno.serve(async (request) => {
  try {
    return await route(request);
  } catch (error) {
    console.error("turnly-api error", error instanceof Error ? error.message : error);
    return Response.json({ ok: false, error: "Something went wrong. Try again." }, { status: 500 });
  }
});

