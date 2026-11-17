// Minimal Apple Push Notification service (APNs) client for Workers.
// Uses token-based auth (.p8 key, ES256 JWT) and plain fetch; Cloudflare's
// outbound fetch speaks HTTP/2, which APNs requires.

export type ApnsConfig = {
  keyId: string;
  teamId: string;
  privateKey: string;
  bundleId: string;
};

export type ApnsEnvironment = "sandbox" | "production";

export type ApnsResult = { ok: true } | { ok: false; status: number; reason: string };

type ApnsEnv = {
  APNS_KEY_ID?: string;
  APNS_TEAM_ID?: string;
  APNS_PRIVATE_KEY?: string;
  APNS_BUNDLE_ID?: string;
};

const DEFAULT_BUNDLE_ID = "app.rork.iw2re99cpdqxvktcj9aei";

/** Reads the APNs settings from env. Returns null until all are provided. */
export function apnsConfigFrom(env: ApnsEnv): ApnsConfig | null {
  const keyId = env.APNS_KEY_ID?.trim();
  const teamId = env.APNS_TEAM_ID?.trim();
  const privateKey = env.APNS_PRIVATE_KEY?.trim();
  if (!keyId || !teamId || !privateKey) return null;
  return { keyId, teamId, privateKey, bundleId: env.APNS_BUNDLE_ID?.trim() || DEFAULT_BUNDLE_ID };
}

let cachedToken: { value: string; issuedAt: number; keyId: string } | null = null;
let cachedKey: { pem: string; key: CryptoKey } | null = null;

function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlJson(value: unknown): string {
  return base64url(new TextEncoder().encode(JSON.stringify(value)));
}

async function signingKey(pem: string): Promise<CryptoKey> {
  if (cachedKey && cachedKey.pem === pem) return cachedKey.key;
  const body = pem
    .replace(/\\n/g, "\n")
    .replace(/-----BEGIN [A-Z ]+-----/g, "")
    .replace(/-----END [A-Z ]+-----/g, "")
    .replace(/\s+/g, "");
  const der = Uint8Array.from(atob(body), (char) => char.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", der, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  cachedKey = { pem, key };
  return key;
}

/** Provider token, reused for 45 minutes (Apple allows 20-60). */
async function providerToken(config: ApnsConfig): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.keyId === config.keyId && now - cachedToken.issuedAt < 45 * 60_000) {
    return cachedToken.value;
  }
  const header = base64urlJson({ alg: "ES256", kid: config.keyId });
  const claims = base64urlJson({ iss: config.teamId, iat: Math.floor(now / 1000) });
  const key = await signingKey(config.privateKey);
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(`${header}.${claims}`),
  );
  const value = `${header}.${claims}.${base64url(new Uint8Array(signature))}`;
  cachedToken = { value, issuedAt: now, keyId: config.keyId };
  return value;
}

/** Sends one alert push to one device token. */
export async function sendApns(
  config: ApnsConfig,
  deviceToken: string,
  environment: ApnsEnvironment,
  payload: Record<string, unknown>,
  collapseId?: string,
): Promise<ApnsResult> {
  const host = environment === "sandbox" ? "api.sandbox.push.apple.com" : "api.push.apple.com";
  const headers: Record<string, string> = {
    authorization: `bearer ${await providerToken(config)}`,
    "apns-topic": config.bundleId,
    "apns-push-type": "alert",
    "apns-priority": "10",
    "apns-expiration": String(Math.floor(Date.now() / 1000) + 86_400),
    "content-type": "application/json",
  };
  if (collapseId) headers["apns-collapse-id"] = collapseId.slice(0, 64);

  try {
    const response = await fetch(`https://${host}/3/device/${deviceToken}`, {
      method: "POST",
      signal: AbortSignal.timeout(20000),
      headers,
      body: JSON.stringify(payload),
    });
    if (response.ok) return { ok: true };
    const data = (await response.json().catch(() => ({}))) as { reason?: string };
    return { ok: false, status: response.status, reason: data.reason ?? `HTTP ${response.status}` };
  } catch (error) {
    return { ok: false, status: 0, reason: error instanceof Error ? error.message : "Network error" };
  }
}

