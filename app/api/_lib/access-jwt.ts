import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import { AuthError } from "./errors.ts";

export type AccessEnv = {
  CF_ACCESS_TEAM_DOMAIN?: string;
  CF_ACCESS_AUD?: string;
};

let cachedJwks: { teamDomain: string; keySet: JWTVerifyGetKey } | null = null;

function jwksForTeam(teamDomain: string): JWTVerifyGetKey {
  if (cachedJwks?.teamDomain !== teamDomain) {
    cachedJwks = {
      teamDomain,
      keySet: createRemoteJWKSet(
        new URL(`https://${teamDomain}.cloudflareaccess.com/cdn-cgi/access/certs`),
      ),
    };
  }
  return cachedJwks.keySet;
}

/**
 * Verifies the signed `Cf-Access-Jwt-Assertion` header Cloudflare Access forwards
 * once a request has passed its identity check. Deliberately does NOT trust the
 * plain `cf-access-authenticated-user-email` header, which carries no signature
 * and can be spoofed by anyone who can reach the Worker directly.
 */
export async function verifyAccessJwt(
  request: Request,
  env: AccessEnv,
  opts?: { jwks?: JWTVerifyGetKey },
): Promise<string> {
  const token = request.headers.get("cf-access-jwt-assertion");
  if (!token) {
    throw new AuthError(401, "You are not signed in. Reload the page to sign in with your work account.");
  }
  if (!env.CF_ACCESS_TEAM_DOMAIN || !env.CF_ACCESS_AUD) {
    throw new AuthError(500, "EventoTron sign-in is not set up on this server yet. Contact whoever administers EventoTron.");
  }

  const keySet = opts?.jwks ?? jwksForTeam(env.CF_ACCESS_TEAM_DOMAIN);
  let payload: Record<string, unknown>;
  try {
    ({ payload } = await jwtVerify(token, keySet, {
      audience: env.CF_ACCESS_AUD,
      issuer: `https://${env.CF_ACCESS_TEAM_DOMAIN}.cloudflareaccess.com`,
    }));
  } catch {
    throw new AuthError(401, "Your sign-in has expired. Reload the page to sign in again.");
  }

  const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
  if (!email) {
    throw new AuthError(401, "Your sign-in did not include an email address, so EventoTron cannot identify you. Reload the page, or contact an admin if it keeps happening.");
  }
  return email;
}
