import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { suiteEventAudit } from "@/db/schema";

function databaseUnavailable(error: unknown) {
  const detail = error instanceof Error ? error.message : String(error);
  return detail.includes("cloudflare:");
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const eventId = url.searchParams.get("eventId")?.trim();
  if (!eventId) {
    return Response.json({ error: "Event history requires an event ID." }, { status: 400 });
  }
  const requestedLimit = Number(url.searchParams.get("limit") ?? 50);
  const limit = Number.isFinite(requestedLimit)
    ? Math.max(1, Math.min(200, Math.trunc(requestedLimit)))
    : 50;

  try {
    const db = await getDb();
    const entries = await db
      .select()
      .from(suiteEventAudit)
      .where(eq(suiteEventAudit.eventId, eventId))
      .orderBy(desc(suiteEventAudit.createdAt))
      .limit(limit);
    return Response.json(
      { eventId, entries, source: "database" },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (!databaseUnavailable(error)) {
      return Response.json(
        {
          error: "EventoTron could not read event history.",
          detail: error instanceof Error ? error.message : String(error),
        },
        { status: 500 },
      );
    }
    return Response.json(
      { eventId, entries: [], source: "local-dev" },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
}
