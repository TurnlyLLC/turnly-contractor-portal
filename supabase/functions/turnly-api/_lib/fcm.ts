// Minimal Firebase Cloud Messaging (HTTP v1) client for Workers.
// Authenticates with a Google service account (RS256 JWT -> OAuth token) and
// sends high-priority data messages so Android wakes the app instantly, even
// when it's closed. The app builds and posts the notification itself.

export type FcmConfig = { projectId: string; clientEmail: string; privateKey: string };

export type FcmResult = { ok: true } | { ok: false; status: number; reason: string; unregistered: boolean };

type FcmEnv = { FCM_SERVICE_ACCOUNT?: string };

type ServiceAccount = { project_id?: string; client_email?: string; private_key?: string };

let cachedConfig: { raw: string; config: FcmConfig | null } | null = null;
let cachedToken: { value: string; expiresAt: number; email: string } | null = null;
let cachedKey: { pem: string; key: CryptoKey } | null = null;

/** Reads the service account JSON (raw or base64). Returns null until it's set and valid. */
export function fcmConfigFrom(env: FcmEnv): FcmConfig | null {
  const raw = env.FCM_SERVICE_ACCOUNT?.trim();
  if (!raw) return null;
  if (cachedConfig?.raw === raw) return cachedConfig.config;
  let config: FcmConfig | null = null;
  try {
    const json = raw.startsWith("{") ? raw : atob(raw);
    const account = JSON.parse(json) as ServiceAccount;
    if (account.project_id && account.client_email && account.private_key) {
      config = { projectId: account.project_id, clientEmail: account.client_email, privateKey: account.private_key };
    }
  } catch {
    config = null;
  }
  if (!config) console.warn("FCM_SERVICE_ACCOUNT is not a valid Firebase service account JSON");
  cachedConfig = { raw, config };
  return config;
}

function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const encodeJson = (value: unknown) => base64url(new TextEncoder().encode(JSON.stringify(value)));

async function signingKey(pem: string): Promise<CryptoKey> {
  if (cachedKey && cachedKey.pem === pem) return cachedKey.key;
  const body = pem
    .replace(/\\n/g, "\n")
    .replace(/-----BEGIN [A-Z ]+-----/g, "")
    .replace(/-----END [A-Z ]+-----/g, "")
    .replace(/\s+/g, "");
  const der = Uint8Array.from(atob(body), (char) => char.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  cachedKey = { pem, key };
  return key;
}

async function accessToken(config: FcmConfig): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.email === config.clientEmail && cachedToken.expiresAt - 5 * 60_000 > now) {
    return cachedToken.value;
  }
  const iat = Math.floor(now / 1000);
  const unsigned = `${encodeJson({ alg: "RS256", typ: "JWT" })}.${encodeJson({
    iss: config.clientEmail,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat,
    exp: iat + 3600,
  })}`;
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", await signingKey(config.privateKey), new TextEncoder().encode(unsigned));
  const assertion = `${unsigned}.${base64url(new Uint8Array(signature))}`;
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
      signal: AbortSignal.timeout(20000),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=${encodeURIComponent("urn:ietf:params:oauth:grant-type:jwt-bearer")}&assertion=${assertion}`,
  });
  const data = (await response.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string };
  if (!response.ok || !data.access_token) throw new Error(`Google OAuth failed: ${data.error ?? response.status}`);
  cachedToken = { value: data.access_token, expiresAt: now + (data.expires_in ?? 3600) * 1000, email: config.clientEmail };
  return data.access_token;
}

/** Sends one high-priority data message to one Android registration token. */
export async function sendFcm(
  config: FcmConfig,
  token: string,
  data: Record<string, string>,
  collapseKey?: string,
): Promise<FcmResult> {
  try {
    const response = await fetch(`https://fcm.googleapis.com/v1/projects/${config.projectId}/messages:send`, {
      method: "POST",
      signal: AbortSignal.timeout(20000),
      headers: { Authorization: `Bearer ${await accessToken(config)}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: {
          token,
          data,
          android: { priority: "HIGH", ttl: "86400s", ...(collapseKey ? { collapse_key: collapseKey.slice(0, 64) } : {}) },
        },
      }),
    });
    if (response.ok) return { ok: true };
    const body = (await response.json().catch(() => ({}))) as {
      error?: { status?: string; message?: string; details?: { errorCode?: string }[] };
    };
    const code = body.error?.details?.find((detail) => detail.errorCode)?.errorCode ?? body.error?.status ?? `HTTP ${response.status}`;
    const unregistered = response.status === 404 || code === "UNREGISTERED" || code === "SENDER_ID_MISMATCH";
    return { ok: false, status: response.status, reason: code, unregistered };
  } catch (error) {
    return { ok: false, status: 0, reason: error instanceof Error ? error.message : "Network error", unregistered: false };
  }
}

