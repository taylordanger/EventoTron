export const SUPPORT_APPS = ["calendar", "tabletron", "foodotron", "scheduluotron", "settings", "master-report", "support", "system"] as const;
export const TICKET_STATUSES = ["new", "investigating", "needs-information", "fixed", "verified"] as const;
export const TICKET_IMPACTS = ["cosmetic", "blocked", "possible-lost-work"] as const;
export const DIAGNOSTIC_CODES = ["browser-crash", "promise-rejection", "request-failed", "network-failed", "save-conflict", "save-failed", "calendar-sync-failed", "restore-failed", "transfer-failed", "slow-request", "server-exception", "runtime-start", "runtime-stop", "runtime-restart", "backup-failed"] as const;
export type SupportApp = typeof SUPPORT_APPS[number];
export type TicketStatus = typeof TICKET_STATUSES[number];
export type TicketImpact = typeof TICKET_IMPACTS[number];
export type DiagnosticCode = typeof DIAGNOSTIC_CODES[number];
export type DiagnosticInput = { code: DiagnosticCode; app: SupportApp; route: string; release: string; method?: string; status?: number; durationMs?: number; errorType?: string; frames?: string[]; browser?: string };
export type TicketDraft = { id: string; title: string; description: string; expected: string; steps: string; impact: TicketImpact; app: SupportApp; release: string; browser: string; references: string[]; screenshot?: string };
export type TicketUpdate = { id: string; actor: string; message: string; status: TicketStatus; createdAt: string };
export type TicketPayload = Omit<TicketDraft, "id" | "title" | "impact" | "app"> & { updates: TicketUpdate[] };
export type SupportTicket = { id: string; number: number; title: string; app: SupportApp; impact: TicketImpact; status: TicketStatus; reporter: string; assignee: string; payload: TicketPayload; createdAt: string; updatedAt: string };
export type DiagnosticRecord = { id: string; code: DiagnosticCode; app: SupportApp; severity: string; source: string; release: string; count: number; metadata: DiagnosticInput; firstSeenAt: string; lastSeenAt: string };

export function appFromPath(path: string): SupportApp {
  const name = path.split("/")[1];
  return SUPPORT_APPS.includes(name as SupportApp) ? name as SupportApp : path === "/" ? "calendar" : "system";
}

export function safeRoute(path: string) {
  const clean = path.split(/[?#]/)[0];
  if (clean === "/") return "/";
  if (/^\/(tabletron|foodotron|scheduluotron|settings|master-report|support)$/.test(clean)) return clean;
  if (/^\/tabletron\/import\/[^/]+$/.test(clean)) return "/tabletron/import/:id";
  if (/^\/api\/(events|settings|health|event-app-state|event-bundle|event-records|event-history|calendar-sources|workspace-backup|meal-transfers|tabletron-transfers|import-product|import-recipe|session|users|local-runtime|support-tickets|diagnostics)$/.test(clean)) return clean;
  if (/^\/api\/tabletron-transfers\/[^/]+(?:\/complete)?$/.test(clean)) return clean.endsWith("/complete") ? "/api/tabletron-transfers/:id/complete" : "/api/tabletron-transfers/:id";
  if (/^\/api\/calendar-oauth\/(google|microsoft)\/(start|callback)$/.test(clean)) return clean;
  if (/^\/api\/calendar-oauth\/accounts(?:\/[^/]+)?$/.test(clean)) return clean === "/api/calendar-oauth/accounts" ? clean : "/api/calendar-oauth/accounts/:id";
  return "/other";
}

export function browserLabel(agent: string) {
  const match = agent.match(/(Firefox|Edg|Chrome|Version)\/(\d+)/);
  return match ? `${match[1] === "Version" ? "Safari" : match[1]} ${match[2]}` : "Other browser";
}

export function diagnosticMetadata(value: unknown): DiagnosticInput | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Partial<DiagnosticInput>;
  if (!DIAGNOSTIC_CODES.includes(input.code as DiagnosticCode)) return null;
  const result: DiagnosticInput = { code: input.code!, app: SUPPORT_APPS.includes(input.app as SupportApp) ? input.app! : "system", route: safeRoute(typeof input.route === "string" ? input.route : "/other"), release: typeof input.release === "string" && /^[\w.+-]{1,100}$/.test(input.release) ? input.release : "unknown" };
  if (["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"].includes(input.method ?? "")) result.method = input.method;
  if (Number.isInteger(input.status) && input.status! >= 100 && input.status! <= 599) result.status = input.status;
  if (typeof input.durationMs === "number" && Number.isFinite(input.durationMs)) result.durationMs = Math.max(0, Math.min(600_000, Math.round(input.durationMs)));
  if (["Error", "TypeError", "RangeError", "SyntaxError", "ReferenceError", "DatabaseError", "NetworkError"].includes(input.errorType ?? "")) result.errorType = input.errorType;
  if (typeof input.browser === "string" && /^(Firefox|Edg|Chrome|Safari) \d{1,4}$|^Other browser$/.test(input.browser)) result.browser = input.browser;
  if (Array.isArray(input.frames)) result.frames = [...new Set(input.frames.filter(frame => typeof frame === "string" && frame.length <= 240 && /^(?:\/assets\/[\w.-]+\.js|server\/index\.js|app\/[\w/.-]+\.[jt]sx?|worker\/index\.ts):\d{1,7}:\d{1,7}$/.test(frame)))].slice(0, 8);
  return result;
}

export function safeErrorDetails(error: unknown) {
  const name = error instanceof Error ? error.name : "Error";
  const frames: string[] = [];
  if (error instanceof Error && error.stack) {
    for (const line of error.stack.split("\n").slice(1)) {
      const match = line.match(/(\/assets\/[\w.-]+\.js|app\/[\w/.-]+\.[jt]sx?|worker\/index\.ts|(?:server\/)?index\.js):(\d{1,7}):(\d{1,7})/);
      if (match) frames.push(`${match[1] === "index.js" ? "server/index.js" : match[1]}:${match[2]}:${match[3]}`);
    }
  }
  return { errorType: ["Error", "TypeError", "RangeError", "SyntaxError", "ReferenceError"].includes(name) ? name : "Error", ...(frames.length ? { frames: frames.slice(0, 8) } : {}) };
}

export function requestDiagnosticCode(path: string, status: number, method: string, thrown = false): DiagnosticCode {
  if ([409, 428].includes(status)) return "save-conflict";
  if (status >= 500) {
    if (path === "/api/calendar-sources" && method === "POST") return "calendar-sync-failed";
    if (path === "/api/workspace-backup") return method === "GET" ? "backup-failed" : "restore-failed";
    if (path.startsWith("/api/tabletron-transfers") || path === "/api/meal-transfers") return "transfer-failed";
    if (["/api/events", "/api/event-app-state", "/api/settings"].includes(path) && ["PUT", "PATCH", "POST", "DELETE"].includes(method)) return "save-failed";
    if (thrown) return "server-exception";
  }
  return status >= 400 ? "request-failed" : "slow-request";
}

export function validScreenshot(value: unknown) {
  if (value === undefined || value === "") return true;
  if (typeof value !== "string" || value.length > 550_000) return false;
  const match = value.match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/);
  if (!match) return false;
  try {
    const bytes = atob(match[2]);
    return match[1] === "png" ? bytes.startsWith("\x89PNG\r\n\x1a\n") : match[1] === "jpeg" ? bytes.startsWith("\xff\xd8\xff") : bytes.startsWith("RIFF") && bytes.slice(8, 12) === "WEBP";
  } catch { return false; }
}

export function validateTicket(value: unknown): TicketDraft | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Partial<TicketDraft>;
  if (!/^[a-f0-9-]{36}$/.test(input.id ?? "") || !TICKET_IMPACTS.includes(input.impact as TicketImpact) || !SUPPORT_APPS.includes(input.app as SupportApp)) return null;
  if (typeof input.title !== "string" || !input.title.trim() || input.title.length > 160 || typeof input.description !== "string" || !input.description.trim() || input.description.length > 4000) return null;
  if (typeof input.expected !== "string" || input.expected.length > 2000 || typeof input.steps !== "string" || input.steps.length > 4000 || !validScreenshot(input.screenshot)) return null;
  const metadata = diagnosticMetadata({ code: "request-failed", app: input.app, route: "/support", release: input.release, browser: input.browser })!;
  return { id: input.id!, title: input.title.trim(), description: input.description.trim(), expected: input.expected.trim(), steps: input.steps.trim(), impact: input.impact!, app: input.app!, release: metadata.release, browser: metadata.browser ?? "Other browser", references: Array.isArray(input.references) ? [...new Set(input.references.filter(ref => typeof ref === "string" && /^LOG-[a-f0-9]{24}$/.test(ref)))].slice(0, 10) : [], ...(input.screenshot ? { screenshot: input.screenshot } : {}) };
}

export function canReadTicket(role: string, reporter: string, actor: string) { return role === "admin" || reporter === actor; }
export function ticketContentMatches(ticket: { title: string; app: string; impact: string; payload: TicketPayload }, draft: TicketDraft) {
  return ticket.title === draft.title && ticket.app === draft.app && ticket.impact === draft.impact && ticket.payload.description === draft.description && ticket.payload.expected === draft.expected && ticket.payload.steps === draft.steps && (ticket.payload.screenshot ?? "") === (draft.screenshot ?? "");
}
export function canUpdateTicket(role: string, currentStatus: string, requestedStatus: unknown, assignee: unknown) {
  return role === "admin" || (assignee === undefined && (requestedStatus === undefined || (requestedStatus === "verified" && currentStatus === "fixed")));
}
export function validSupportBackupRow(value: unknown) {
  if (!value || typeof value !== "object") return false;
  const row = value as SupportTicket;
  if (!row.payload || !validateTicket({ ...row.payload, id: row.id, title: row.title, app: row.app, impact: row.impact })) return false;
  return Number.isSafeInteger(row.number) && row.number > 0 && typeof row.reporter === "string" && row.reporter.length > 0 && row.reporter.length <= 254 && typeof row.assignee === "string" && row.assignee.length <= 120 && TICKET_STATUSES.includes(row.status) && Number.isFinite(Date.parse(row.createdAt)) && Number.isFinite(Date.parse(row.updatedAt)) && Array.isArray(row.payload.updates) && row.payload.updates.length <= 100 && row.payload.updates.every(entry => entry && typeof entry.id === "string" && typeof entry.actor === "string" && entry.actor.length <= 254 && typeof entry.message === "string" && entry.message.length <= 2000 && TICKET_STATUSES.includes(entry.status) && Number.isFinite(Date.parse(entry.createdAt)));
}
export function ticketNumber(number: number) { return `EVT-${String(number).padStart(4, "0")}`; }
