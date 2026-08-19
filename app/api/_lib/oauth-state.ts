import { base64UrlDecode, base64UrlEncode } from "./base64url.ts";

export async function generatePkcePair(): Promise<{ verifier: string; challenge: string }> {
  const verifier = base64UrlEncode(crypto.getRandomValues(new Uint8Array(32)));
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  return { verifier, challenge: base64UrlEncode(digest) };
}

async function hmacKey(secret: string) {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

/** Signs a JSON payload for a short-lived cookie, so OAuth state/PKCE survive the redirect without a DB table. */
export async function signState(payload: Record<string, unknown>, secret: string): Promise<string> {
  const encodedPayload = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const key = await hmacKey(secret);
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(encodedPayload)));
  return `${encodedPayload}.${base64UrlEncode(signature)}`;
}

export async function verifyState<T>(token: string, secret: string): Promise<T | null> {
  const [encodedPayload, encodedSignature] = token.split(".");
  if (!encodedPayload || !encodedSignature) return null;
  const key = await hmacKey(secret);
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    base64UrlDecode(encodedSignature),
    new TextEncoder().encode(encodedPayload),
  );
  if (!valid) return null;
  try {
    return JSON.parse(new TextDecoder().decode(base64UrlDecode(encodedPayload))) as T;
  } catch {
    return null;
  }
}
