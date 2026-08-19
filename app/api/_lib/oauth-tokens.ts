import { base64UrlDecode, base64UrlEncode } from "./base64url.ts";

export type TokenBundle = { accessToken: string; refreshToken: string };

async function aesKey(secret: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

/** Encrypts both tokens together as one blob, so the schema only needs one IV column per row. */
export async function encryptTokenBundle(
  tokens: TokenBundle,
  secret: string,
): Promise<{ ciphertext: string; iv: string }> {
  const key = await aesKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(tokens));
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext));
  return { ciphertext: base64UrlEncode(encrypted), iv: base64UrlEncode(iv) };
}

export async function decryptTokenBundle(ciphertext: string, iv: string, secret: string): Promise<TokenBundle> {
  const key = await aesKey(secret);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64UrlDecode(iv) },
    key,
    base64UrlDecode(ciphertext),
  );
  return JSON.parse(new TextDecoder().decode(decrypted)) as TokenBundle;
}
