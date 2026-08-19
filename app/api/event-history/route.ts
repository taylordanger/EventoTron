import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { suiteEventAudit } from "@/db/schema";
import { withRole } from "../_lib/auth";

function databaseUnavailable(error: unknown) {
  const detail = error instanceof Error ? error.message : String(error);
  return detail.includes("cloudflare:");
}

export const GET = withRole("staff", async (request: Request) => {
  const url = new URL(request.url);
  const eventId = url.searchParams.get("eventId")?.trim();
  const requestedLimit = Number(url.searchParams.get("limit") ?? 50);
  const limit = Number.isFinite(requestedLimit)
    ? Math.max(1, Math.min(200, Math.trunc(requestedLimit)))
    : 50;

  try {
    const db = await getDb();
    const entries = eventId
      ? await db
        .select()
        .from(suiteEventAudit)
        .where(eq(suiteEventAudit.eventId, eventId))
        .orderBy(desc(suiteEventAudit.createdAt))
        .limit(limit)
      : await db
        .select()
        .from(suiteEventAudit)
        .orderBy(desc(suiteEventAudit.createdAt))
        .limit(limit);
    return Response.json(
      { eventId: eventId || null, entries, source: "database" },
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
      { eventId: eventId || null, entries: [], source: "local-dev" },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
});
