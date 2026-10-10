import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { suiteAppletStates, suiteEvents } from "@/db/schema";
import { withRole } from "../_lib/auth";
import { deleteLocalAppletState, readLocalAppletState, writeLocalAppletState } from "./local-store";
import { prepareAppletProjection, prepareAppletRemoval } from "./projections";
import { guardedWrite, validExpectedRevision, revisionConflict, nextRevision, noStore } from "../_lib/guarded-write";

const allowedApps = new Set(["tabletron", "foodotron", "scheduluotron"]);

function dbUnavailable(error: unknown) {
  const detail = error instanceof Error ? error.message : String(error);
  return detail.includes("cloudflare:");
}

function getParams(request: Request) {
  const params = new URL(request.url).searchParams;
  const eventId = params.get("eventId") ?? "";
  const appName = params.get("app") ?? "";
  return { eventId, appName };
}

function validate(eventId: string, appName: string) {
  if (!eventId) return "Event app state requires an event ID.";
  if (!allowedApps.has(appName)) return "Event app state requires a known app name.";
  return "";
}

export const GET = withRole("staff", async (request) => {
  const { eventId, appName } = getParams(request);
  const error = validate(eventId, appName);
  if (error) return Response.json({ error }, { status: 400 });

  try {
    const db = await getDb();
    const row = await db
      .select()
      .from(suiteAppletStates)
      .where(
        and(
          eq(suiteAppletStates.eventId, eventId),
          eq(suiteAppletStates.appName, appName),
        ),
      )
      .get();
    if (!row) {
      return Response.json({ error: "No saved applet state." }, { status: 404 });
    }
    return Response.json({ ...row, source: "database" }, { headers: noStore });
  } catch (caught) {
    if (!dbUnavailable(caught)) {
      return Response.json(
        {
          error: "EventoTron could not read applet state.",
          detail: caught instanceof Error ? caught.message : String(caught),
        },
        { status: 500 },
      );
    }
    const local = readLocalAppletState(eventId, appName);
    if (!local) {
      return Response.json({ error: "No saved applet state." }, { status: 404 });
    }
    return Response.json({ ...local, source: "local-dev" }, { headers: noStore });
  }
});

export const PUT = withRole("staff", async (request) => {
  const { eventId, appName } = getParams(request);
  const error = validate(eventId, appName);
  if (error) return Response.json({ error }, { status: 400 });
  const body = (await request.json().catch(() => ({}))) as { payload?: unknown; expectedUpdatedAt?: string | null };
  if (body.payload === undefined) {
    return Response.json({ error: "Saving applet state requires a payload." }, { status: 400 });
  }
  if (!validExpectedRevision(body)) return Response.json({ error: "Reload the applet before saving. A revision is required." }, { status: 428 });

  const now = nextRevision(body.expectedUpdatedAt);
  const id = `${appName}_${eventId}`;
  try {
    const db = await getDb();
    const event = await db
      .select({ id: suiteEvents.id })
      .from(suiteEvents)
      .where(eq(suiteEvents.id, eventId))
      .get();
    if (!event) {
      return Response.json({ error: "Applet state requires an existing event." }, { status: 404 });
    }
    const stateWrite = db
      .insert(suiteAppletStates)
      .values({
        id,
        eventId,
        appName,
        payload: body.payload,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: suiteAppletStates.id,
        set: {
          eventId,
          appName,
          payload: body.payload,
          updatedAt: now,
        },
      });
    const { writes, normalized } = prepareAppletProjection(db, eventId, appName, body.payload, now);
    await guardedWrite("suite_applet_states", id, body.expectedUpdatedAt!, [stateWrite, ...writes], undefined, eventId);
    return Response.json({ id, eventId, appName, savedAt: now, updatedAt: now, normalized, source: "database" });
  } catch (caught) {
    if (revisionConflict(caught)) return Response.json({ error: "Another staff member saved changes. Your draft has not replaced theirs." }, { status: 409 });
    if (!dbUnavailable(caught)) {
      return Response.json(
        {
          error: "EventoTron could not save applet state.",
          detail: caught instanceof Error ? caught.message : String(caught),
        },
        { status: 500 },
      );
    }
    const existing = readLocalAppletState(eventId, appName);
    if ((existing?.updatedAt ?? null) !== body.expectedUpdatedAt) return Response.json({ error: "Another staff member saved changes." }, { status: 409 });
    const local = writeLocalAppletState(eventId, appName, body.payload, now);
    return Response.json({ ...local, savedAt: local.updatedAt, source: "local-dev" });
  }
});

export const DELETE = withRole("staff", async (request) => {
  const { eventId, appName } = getParams(request);
  const error = validate(eventId, appName);
  if (error) return Response.json({ error }, { status: 400 });
  const body = await request.json().catch(() => ({})) as { expectedUpdatedAt?: string | null };
  if (!validExpectedRevision(body)) return Response.json({ error: "A revision is required before deleting applet data." }, { status: 428 });

  try {
    const db = await getDb();
    const stateWrite = db
      .delete(suiteAppletStates)
      .where(
        and(
          eq(suiteAppletStates.eventId, eventId),
          eq(suiteAppletStates.appName, appName),
        ),
      );
    await guardedWrite("suite_applet_states", `${appName}_${eventId}`, body.expectedUpdatedAt!, [stateWrite, ...await prepareAppletRemoval(db, eventId, appName)]);
    return Response.json({ eventId, appName, deleted: true, source: "database" });
  } catch (caught) {
    if (revisionConflict(caught)) return Response.json({ error: "The applet changed before deletion." }, { status: 409 });
    if (!dbUnavailable(caught)) {
      return Response.json(
        {
          error: "EventoTron could not delete applet state.",
          detail: caught instanceof Error ? caught.message : String(caught),
        },
        { status: 500 },
      );
    }
    if ((readLocalAppletState(eventId, appName)?.updatedAt ?? null) !== body.expectedUpdatedAt) return Response.json({ error: "The applet changed before deletion." }, { status: 409 });
    deleteLocalAppletState(eventId, appName);
    return Response.json({ eventId, appName, deleted: true, source: "local-dev" });
  }
});
