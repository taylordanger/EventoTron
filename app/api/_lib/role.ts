export type SuiteRole = "admin" | "staff";

const roleRank: Record<SuiteRole, number> = { staff: 1, admin: 2 };

export function roleSatisfies(role: SuiteRole, minRole: SuiteRole): boolean {
  return roleRank[role] >= roleRank[minRole];
}

export type LocalModeEnv = {
  /** Set to "1" only by a runtime that is genuinely local. Never set on a deployment. */
  EVENTOTRON_LOCAL_MODE?: string;
};

/**
 * True for the local desktop app / plain `npm run dev`, where Access never sits
 * in front and the single operator is implicitly an admin.
 *
 * This deliberately requires an explicit opt-in from the runtime **and** a
 * loopback hostname. The hostname alone is not trustworthy: it is derived from
 * the `Host` header, which the caller controls, so gating on it by itself would
 * let anyone reaching a deployed Worker claim admin by sending `Host: localhost`.
 * A deployment never sets EVENTOTRON_LOCAL_MODE, so local mode cannot be
 * reached there at all, whatever the header says.
 */
export function isLocalRequest(request: Request, env: LocalModeEnv | undefined): boolean {
  if (env?.EVENTOTRON_LOCAL_MODE !== "1") return false;
  const hostname = new URL(request.url).hostname.toLowerCase();
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]";
}

/** Browser writes must come from this exact origin; headerless local CLIs remain supported. */
export function isLocalWriteAllowed(request: Request): boolean {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method.toUpperCase())) return true;
  const origin = request.headers.get("origin");
  if (origin !== null && origin !== new URL(request.url).origin) return false;
  const site = request.headers.get("sec-fetch-site");
  return site === null || site === "same-origin";
}
