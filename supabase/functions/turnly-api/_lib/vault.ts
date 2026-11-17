// AES-256-GCM sealing for sensitive onboarding data: SSN/EIN, bank numbers,
// date of birth, license numbers, and every file stored by the onboarding hub.
//
// Text is stored as "v1.<keyId>.<iv>.<ciphertext>" (base64url); file chunks as
// iv (12 bytes) + ciphertext. keyId says which key sealed it: "env" is the
// ONBOARDING_DATA_KEY secret, "local" a key kept in the hub's own storage
// (used only until the secret is set; everything is re-sealed once it is).

export type KeyId = "env" | "local";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** Any secret string becomes a 256-bit AES key (SHA-256 of the secret). */
export async function importKey(secret: string): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(secret));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string) {
  const padded = text.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (text.length % 4)) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

/** The key that sealed a value, or null when the value is plain text. */
export function sealedKeyId(value: unknown): KeyId | null {
  if (typeof value !== "string") return null;
  const match = /^v1\.(env|local)\./.exec(value);
  return match ? (match[1] as KeyId) : null;
}

export async function sealText(key: CryptoKey, keyId: KeyId, plain: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoder.encode(plain)));
  return `v1.${keyId}.${toBase64Url(iv)}.${toBase64Url(sealed)}`;
}

export async function openText(key: CryptoKey, value: string): Promise<string> {
  const [, , iv, sealed] = value.split(".");
  if (!iv || !sealed) throw new Error("Sealed value is malformed.");
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64Url(iv) }, key, fromBase64Url(sealed));
  return decoder.decode(plain);
}

export async function sealBytes(key: CryptoKey, bytes: Uint8Array) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new Uint8Array(bytes)));
  const out = new Uint8Array(iv.length + sealed.length);
  out.set(iv, 0);
  out.set(sealed, iv.length);
  return out;
}

export async function openBytes(key: CryptoKey, blob: Uint8Array) {
  const iv = new Uint8Array(blob.subarray(0, 12));
  const sealed = new Uint8Array(blob.subarray(12));
  return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, sealed));
}

