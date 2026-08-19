import { verifyAccessJwt, type AccessEnv } from "./access-jwt.ts";
import { AuthError } from "./errors.ts";
import { isLocalRequest, roleSatisfies, type LocalModeEnv, type SuiteRole } from "./role.ts";
import { loadOrProvisionUser, type ProvisionEnv } from "./users.ts";

export type { SuiteRole } from "./role.ts";
export { isLocalRequest, roleSatisfies } from "./role.ts";
export { runtimeEnv };
export type { LocalModeEnv } from "./role.ts";
export { AuthError } from "./errors.ts";

export type Identity = {
  email: string;
  role: SuiteRole;
  source: "access" | "local";
};

function localActor(request: Request): string {
  const localIdentity = request.headers.get("x-eventotron-actor")?.trim();
  return localIdentity ? localIdentity.slice(0, 254) : "local-operator";
}

/**
 * The current runtime's configuration. Under Workers this is the Worker's own
 * bindings; the fallback covers running the built bundle outside workerd (the
 * test harness), where `cloudflare:workers` does not exist. It cannot loosen
 * anything on a deployment: there the import always succeeds, so the fallback
 * is never reached.
 */
async function runtimeEnv(): Promise<Record<string, unknown>> {
  try {
    const { env } = await import("cloudflare:workers");
    return env as Record<string, unknown>;
  } catch {
    return (globalThis as { process?: { env?: Record<string, unknown> } }).process?.env ?? {};
  }
}

export async function resolveIdentity(request: Request): Promise<Identity> {
  // Read env first: local mode is an explicit runtime opt-in, never inferred
  // from the request alone. See isLocalRequest for why that distinction matters.
  const env = await runtimeEnv();
  if (isLocalRequest(request, env as LocalModeEnv)) {
    return { email: localActor(request), role: "admin", source: "local" };
  }

  const email = await verifyAccessJwt(request, env as AccessEnv);
  const user = await loadOrProvisionUser(email, env as ProvisionEnv);
  if (user.status === "revoked") {
    throw new AuthError(403, "Your EventoTron access has been turned off. Ask an admin to restore it.");
  }
  return { email, role: user.role, source: "access" };
}

export async function requireRole(request: Request, minRole: SuiteRole): Promise<Identity> {
  const identity = await resolveIdentity(request);
  if (!roleSatisfies(identity.role, minRole)) {
    throw new AuthError(403, "You do not have permission for that. Ask an admin if you need access.");
  }
  return identity;
}

/**
 * Wraps a route handler so it only runs for a caller whose resolved role
 * satisfies `minRole`. `Args` carries through whatever extra context Next's
 * router passes a handler (e.g. `{ params }` on dynamic routes).
 */
export function withRole<Args extends unknown[]>(
  minRole: SuiteRole,
  handler: (request: Request, identity: Identity, ...args: Args) => Promise<Response>,
) {
  return async (request: Request, ...args: Args): Promise<Response> => {
    try {
      const identity = await requireRole(request, minRole);
      return await handler(request, identity, ...args);
    } catch (error) {
      if (error instanceof AuthError) {
        return Response.json(
          { error: error.message },
          { status: error.status, headers: { "Cache-Control": "no-store" } },
        );
      }
      throw error;
    }
  };
}
