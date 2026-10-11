import { and, desc, eq, gt, inArray, like } from "drizzle-orm";
import { getDb, getSuiteD1 } from "@/db";
import { supportDiagnostics, supportTickets } from "@/db/schema";
import { withRole } from "../_lib/auth";
import { supportBody } from "../_lib/support-body";
import { diagnosticActor } from "../_lib/diagnostics";
import { nextRevision } from "../_lib/guarded-write";
import { canReadTicket, canUpdateTicket, ticketContentMatches, SUPPORT_APPS, TICKET_STATUSES, validateTicket, type SupportApp, type TicketStatus, type TicketDraft } from "../../support-data";

const headers = { "Cache-Control": "no-store" };
function retryReceipt(ticket: typeof supportTickets.$inferSelect, draft: TicketDraft, actor: string) {
  if (ticket.reporter !== actor) return Response.json({ error: "Use a new report ID." }, { status: 409, headers });
  if (!ticketContentMatches(ticket, draft)) return Response.json({ error: "This report was already received. Keep your changed draft and add an update to the received report.", existing: { id: ticket.id, number: ticket.number } }, { status: 409, headers });
  return Response.json({ id: ticket.id, number: ticket.number }, { headers });
}
export const GET = withRole("staff", async (request, identity) => {
  const db = await getDb(); const params = new URL(request.url).searchParams;
  const id = params.get("id");
  if (id) {
    const ticket = await db.select().from(supportTickets).where(eq(supportTickets.id, id)).get();
    if (!ticket || !canReadTicket(identity.role, ticket.reporter, identity.email)) return Response.json({ error: "Report not found." }, { status: 404, headers });
    const references = ticket.payload.references;
    const diagnostics = identity.role === "admin" && references.length
      ? await db.select({ id: supportDiagnostics.id, code: supportDiagnostics.code, app: supportDiagnostics.app, severity: supportDiagnostics.severity, source: supportDiagnostics.source, release: supportDiagnostics.release, count: supportDiagnostics.count, metadata: supportDiagnostics.metadata, firstSeenAt: supportDiagnostics.firstSeenAt, lastSeenAt: supportDiagnostics.lastSeenAt }).from(supportDiagnostics).where(and(inArray(supportDiagnostics.id, references), gt(supportDiagnostics.lastSeenAt, new Date(Date.now() - 30 * 86400_000).toISOString()))) : [];
    return Response.json({ ticket, diagnostics }, { headers });
  }
  const status = params.get("status") as TicketStatus | null; const app = params.get("app") as SupportApp | null; const search = (params.get("q") ?? "").slice(0, 160);
  if ((status && !TICKET_STATUSES.includes(status)) || (app && !SUPPORT_APPS.includes(app))) return Response.json({ error: "Unknown report filter." }, { status: 400, headers });
  const offset = Math.max(0, Math.min(10000, Number(params.get("offset")) || 0));
  const tickets = await db.select({ id: supportTickets.id, number: supportTickets.number, title: supportTickets.title, app: supportTickets.app, impact: supportTickets.impact, status: supportTickets.status, reporter: supportTickets.reporter, assignee: supportTickets.assignee, createdAt: supportTickets.createdAt, updatedAt: supportTickets.updatedAt }).from(supportTickets)
    .where(and(identity.role !== "admin" ? eq(supportTickets.reporter, identity.email) : undefined, status ? eq(supportTickets.status, status) : undefined, app ? eq(supportTickets.app, app) : undefined, search ? like(supportTickets.title, `%${search}%`) : undefined))
    .orderBy(desc(supportTickets.updatedAt), desc(supportTickets.number)).limit(51).offset(offset);
  return Response.json({ tickets: tickets.slice(0, 50), hasMore: tickets.length > 50 }, { headers });
});

export const POST = withRole("staff", async (request, identity) => {
  let draft;
  try { draft = validateTicket(await supportBody(request)); } catch { draft = null; }
  if (!draft) return Response.json({ error: "Add a title and description, and check the report's field and screenshot limits." }, { status: 400, headers });
  const db = await getDb();
  const existing = await db.select().from(supportTickets).where(eq(supportTickets.id, draft.id)).get();
  if (existing) return retryReceipt(existing, draft, identity.email);
  const actorKey = await diagnosticActor(identity.email);
  const references = draft.references.length ? (await db.select({ id: supportDiagnostics.id }).from(supportDiagnostics).where(and(inArray(supportDiagnostics.id, draft.references), identity.role === "admin" ? undefined : eq(supportDiagnostics.actorKey, actorKey)))).map(entry => entry.id) : [];
  const payload = { description: draft.description, expected: draft.expected, steps: draft.steps, release: draft.release, browser: draft.browser, references, screenshot: draft.screenshot, updates: [] };
  const now = new Date().toISOString(); const cutoff = new Date(Date.now() - 86400_000).toISOString();
  const d1 = await getSuiteD1();
  const inserted = await d1.prepare("INSERT INTO support_tickets (id, title, app, impact, reporter, payload, created_at, updated_at) SELECT ?, ?, ?, ?, ?, ?, ?, ? WHERE (SELECT count(*) FROM support_tickets WHERE reporter = ? AND created_at > ?) < 30 ON CONFLICT(id) DO NOTHING RETURNING id, number")
    .bind(draft.id, draft.title, draft.app, draft.impact, identity.email, JSON.stringify(payload), now, now, identity.email, cutoff).all<{ id: string; number: number }>();
  if (inserted.results[0]) return Response.json(inserted.results[0], { status: 201, headers });
  const repeated = await db.select().from(supportTickets).where(eq(supportTickets.id, draft.id)).get();
  return repeated ? retryReceipt(repeated, draft, identity.email) : Response.json({ error: "Daily report limit reached. Keep your draft and contact the maintainer." }, { status: 429, headers });
});

export const PATCH = withRole("staff", async (request, identity) => {
  let body;
  try { body = await supportBody(request, 8000) as { id?: string; expectedUpdatedAt?: string; status?: TicketStatus; assignee?: string; message?: string }; }
  catch { return Response.json({ error: "Invalid report update." }, { status: 400, headers }); }
  if (!body || typeof body.id !== "string" || typeof body.expectedUpdatedAt !== "string" || (body.status !== undefined && !TICKET_STATUSES.includes(body.status)) || (body.assignee !== undefined && (typeof body.assignee !== "string" || body.assignee.length > 120)) || (body.message !== undefined && (typeof body.message !== "string" || body.message.length > 2000))) return Response.json({ error: "Invalid report update." }, { status: 400, headers });
  const db = await getDb(); const ticket = await db.select().from(supportTickets).where(eq(supportTickets.id, body.id)).get();
  if (!ticket || !canReadTicket(identity.role, ticket.reporter, identity.email)) return Response.json({ error: "Report not found." }, { status: 404, headers });
  if (!canUpdateTicket(identity.role, ticket.status, body.status, body.assignee)) return Response.json({ error: "Only admins can triage reports; reporters can verify a fixed report." }, { status: 403, headers });
  const message = body.message?.trim() ?? "";
  if (!message && (body.status ?? ticket.status) === ticket.status && (body.assignee?.trim() ?? ticket.assignee) === ticket.assignee) return Response.json({ error: "Add an update or change the status or assignment." }, { status: 400, headers });
  if (ticket.payload.updates.length >= 100) return Response.json({ error: "This report has reached its update limit." }, { status: 409, headers });
  const now = nextRevision(ticket.updatedAt); const status = body.status ?? ticket.status;
  const payload = { ...ticket.payload, updates: [...ticket.payload.updates, { id: crypto.randomUUID(), actor: identity.email, message, status, createdAt: now }] };
  const changed = await db.update(supportTickets).set({ payload, status, assignee: body.assignee?.trim() ?? ticket.assignee, updatedAt: now }).where(and(eq(supportTickets.id, ticket.id), eq(supportTickets.updatedAt, body.expectedUpdatedAt))).returning();
  return changed[0] ? Response.json({ ticket: changed[0] }, { headers }) : Response.json({ error: "Another person updated this report. Reload it before retrying; your comment remains in the editor." }, { status: 409, headers });
});
