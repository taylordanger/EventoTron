import { verifyAccessJwt, type AccessEnv } from "./access-jwt.ts";
import { AuthError } from "./errors.ts";
import { isLocalRequest, isLocalWriteAllowed, roleSatisfies, type LocalModeEnv, type SuiteRole } from "./role.ts";
import { loadOrProvisionUser, type ProvisionEnv } from "./users.ts";
import { recordDiagnostic } from "./diagnostics";
import { appFromPath, diagnosticMetadata, requestDiagnosticCode, safeErrorDetails } from "../../support-data";
import { RELEASE } from "../../release";

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
    return { ...env };
  } catch {
    return (globalThis as { process?: { env?: Record<string, unknown> } }).process?.env ?? {};
  }
}

export async function resolveIdentity(request: Request): Promise<Identity> {
  // Read env first: local mode is an explicit runtime opt-in, never inferred
  // from the request alone. See isLocalRequest for why that distinction matters.
  const env = await runtimeEnv();
  if (isLocalRequest(request, env as LocalModeEnv)) {
    if (!isLocalWriteAllowed(request)) {
      throw new AuthError(403, "Reload EventoTron and try again from its own window.");
    }
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
    const startedAt = Date.now();
    let identity: Identity | undefined;
    const url = new URL(request.url);
    const observed = url.pathname !== "/api/diagnostics";
    async function finish(response: Response, thrown?: unknown) {
      const durationMs = Date.now() - startedAt;
      if (request.method === "GET" && response.status === 404 && ["/api/settings", "/api/event-app-state"].includes(url.pathname)) return response;
      if (!observed || (response.status < 400 && durationMs < 1500)) return response;
      const code = requestDiagnosticCode(url.pathname, response.status, request.method, !!thrown && !(thrown instanceof AuthError));
      try {
        const requestedApp = request.headers.get("x-eventotron-app") ?? url.searchParams.get("app") ?? appFromPath(url.pathname);
        const metadata = diagnosticMetadata({ code, app: requestedApp, route: url.pathname, release: RELEASE, method: request.method, status: response.status, durationMs, ...safeErrorDetails(thrown) })!;
        const logged = await recordDiagnostic(metadata, identity?.email ?? "unauthenticated");
        if (logged && response.status >= 400) {
          const headers = new Headers(response.headers); headers.set("x-eventotron-error-ref", logged.id);
          return new Response(response.body, { status: response.status, headers });
        }
      } catch { /* Diagnostics must never turn a successful operation into a failure. */ }
      return response;
    }
    try {
      identity = await requireRole(request, minRole);
      return await finish(await handler(request, identity, ...args));
    } catch (error) {
      if (error instanceof AuthError) {
        return finish(Response.json(
          { error: error.message },
          { status: error.status, headers: { "Cache-Control": "no-store" } },
        ), error);
      }
      return finish(Response.json({ error: "EventoTron could not complete this operation." }, { status: 500, headers: { "Cache-Control": "no-store" } }), error);
    }
  };
}
