import { withRole } from "../../../_lib/auth";
import { storeOAuthAccount } from "../../../_lib/calendar-oauth-accounts";
import { exchangeGoogleCode, fetchGoogleProfileEmail } from "../../../_lib/google-oauth";
import { verifyState } from "../../../_lib/oauth-state";

type StatePayload = {
  state: string;
  verifier: string;
  adminEmail: string;
  createdAt: number;
  provider: string;
};

const STATE_MAX_AGE_MS = 10 * 60 * 1000;

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie") ?? "";
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() === name) return part.slice(separator + 1).trim();
  }
  return null;
}

const clearStateCookie = "eventotron_oauth_state=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0";

function redirectToSettings(base: string, query: Record<string, string>): Response {
  const target = new URL("/settings", base);
  for (const [key, value] of Object.entries(query)) target.searchParams.set(key, value);
  const headers = new Headers({ Location: target.toString() });
  headers.append("Set-Cookie", clearStateCookie);
  return new Response(null, { status: 302, headers });
}

export const GET = withRole("admin", async (request: Request, identity) => {
  const { env } = await import("cloudflare:workers");
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const stateParam = url.searchParams.get("state");
  const cookieValue = readCookie(request, "eventotron_oauth_state");

  if (!code || !stateParam || !cookieValue || !env.OAUTH_STATE_SECRET) {
    return redirectToSettings(request.url, { oauthError: "google" });
  }

  const payload = await verifyState<StatePayload>(cookieValue, env.OAUTH_STATE_SECRET);
  const fresh = payload ? Date.now() - payload.createdAt < STATE_MAX_AGE_MS : false;
  if (!payload || !fresh || payload.state !== stateParam || payload.adminEmail !== identity.email || payload.provider !== "google") {
    return redirectToSettings(request.url, { oauthError: "google" });
  }

  try {
    const redirectUri = new URL("/api/calendar-oauth/google/callback", request.url).toString();
    const tokens = await exchangeGoogleCode(env, code, redirectUri, payload.verifier);
    if (!tokens.refreshToken) {
      return redirectToSettings(request.url, { oauthError: "google_no_refresh" });
    }
    const accountEmail = await fetchGoogleProfileEmail(tokens.accessToken);
    const accountId = await storeOAuthAccount({
      provider: "google",
      accountEmail,
      connectedByEmail: identity.email,
      tokens: { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken },
      scope: tokens.scope,
      expiresAt: tokens.expiresAt,
    }, env);
    return redirectToSettings(request.url, { oauthConnected: "google", accountId });
  } catch (error) {
    return redirectToSettings(request.url, {
      oauthError: "google",
      detail: error instanceof Error ? error.message : "unknown",
    });
  }
});
