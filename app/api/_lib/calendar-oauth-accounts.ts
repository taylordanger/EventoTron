import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { suiteCalendarOAuthAccounts } from "@/db/schema";
import { decryptTokenBundle, encryptTokenBundle, type TokenBundle } from "./oauth-tokens";
import type { GoogleEnv } from "./google-oauth";
import type { MicrosoftEnv } from "./microsoft-oauth";

export type OAuthProvider = "google" | "microsoft";

export type OAuthAccountSummary = {
  id: string;
  provider: OAuthProvider;
  accountEmail: string;
  connectedByEmail: string;
  createdAt: string;
};

export type TokenEnv = { TOKEN_ENCRYPTION_KEY?: string } & GoogleEnv & MicrosoftEnv;

function requireEncryptionKey(env: TokenEnv) {
  if (!env.TOKEN_ENCRYPTION_KEY) throw new Error("Token encryption is not configured on this deployment.");
  return env.TOKEN_ENCRYPTION_KEY;
}

function toSummary(row: typeof suiteCalendarOAuthAccounts.$inferSelect): OAuthAccountSummary {
  return {
    id: row.id,
    provider: row.provider === "microsoft" ? "microsoft" : "google",
    accountEmail: row.accountEmail,
    connectedByEmail: row.connectedByEmail,
    createdAt: row.createdAt,
  };
}

export async function storeOAuthAccount(
  params: {
    provider: OAuthProvider;
    accountEmail: string;
    connectedByEmail: string;
    tokens: TokenBundle;
    scope: string;
    expiresAt: string;
  },
  env: TokenEnv,
): Promise<string> {
  const key = requireEncryptionKey(env);
  const { ciphertext, iv } = await encryptTokenBundle(params.tokens, key);
  const db = await getDb();
  const now = new Date().toISOString();
  const id = `oauth_${crypto.randomUUID()}`;
  await db.insert(suiteCalendarOAuthAccounts).values({
    id,
    provider: params.provider,
    connectedByEmail: params.connectedByEmail,
    accountEmail: params.accountEmail,
    accessTokenCiphertext: ciphertext,
    refreshTokenCiphertext: "",
    tokenIv: iv,
    scope: params.scope,
    expiresAt: params.expiresAt,
    payload: {},
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

export async function listOAuthAccounts(): Promise<OAuthAccountSummary[]> {
  const db = await getDb();
  const rows = await db.select().from(suiteCalendarOAuthAccounts);
  return rows.map(toSummary);
}

export async function deleteOAuthAccount(id: string): Promise<void> {
  const db = await getDb();
  await db.delete(suiteCalendarOAuthAccounts).where(eq(suiteCalendarOAuthAccounts.id, id));
}

/**
 * Returns a live access token for a connected account, refreshing and
 * re-persisting it first if it's expired (or expiring within a minute).
 */
export async function getValidAccessToken(id: string, env: TokenEnv): Promise<string> {
  const key = requireEncryptionKey(env);
  const db = await getDb();
  const row = await db.select().from(suiteCalendarOAuthAccounts).where(eq(suiteCalendarOAuthAccounts.id, id)).get();
  if (!row) throw new Error("Connected calendar account was not found. Reconnect this calendar.");

  const tokens = await decryptTokenBundle(row.accessTokenCiphertext, row.tokenIv, key);
  const expiresAt = row.expiresAt ? Date.parse(row.expiresAt) : NaN;
  if (Number.isFinite(expiresAt) && expiresAt - Date.now() > 60_000) {
    return tokens.accessToken;
  }
  if (!tokens.refreshToken) throw new Error("This calendar connection has expired. Reconnect it.");

  const refreshed = row.provider === "microsoft"
    ? await (await import("./microsoft-oauth")).refreshMicrosoftToken(env, tokens.refreshToken)
    : await (await import("./google-oauth")).refreshGoogleToken(env, tokens.refreshToken);

  const nextTokens: TokenBundle = {
    accessToken: refreshed.accessToken,
    refreshToken: refreshed.refreshToken ?? tokens.refreshToken,
  };
  const encrypted = await encryptTokenBundle(nextTokens, key);
  await db.update(suiteCalendarOAuthAccounts).set({
    accessTokenCiphertext: encrypted.ciphertext,
    tokenIv: encrypted.iv,
    expiresAt: refreshed.expiresAt,
    updatedAt: new Date().toISOString(),
  }).where(eq(suiteCalendarOAuthAccounts.id, id));
  return nextTokens.accessToken;
}
