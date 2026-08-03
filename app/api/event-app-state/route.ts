import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { suiteAppletStates } from "@/db/schema";
import { deleteLocalAppletState, readLocalAppletState, writeLocalAppletState } from "./local-store";
import { projectAppletState, removeAppletProjection } from "./projections";

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

export async function GET(request: Request) {
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
    return Response.json({ ...row, source: "database" });
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
    return Response.json({ ...local, source: "local-dev" });
  }
}

export async function PUT(request: Request) {
  const { eventId, appName } = getParams(request);
  const error = validate(eventId, appName);
  if (error) return Response.json({ error }, { status: 400 });
  const body = (await request.json().catch(() => ({}))) as { payload?: unknown };
  if (body.payload === undefined) {
    return Response.json({ error: "Saving applet state requires a payload." }, { status: 400 });
  }

  const now = new Date().toISOString();
  const id = `${appName}_${eventId}`;
  try {
    const db = await getDb();
    await db
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
    const normalized = await projectAppletState(db, eventId, appName, body.payload, now);
    return Response.json({ id, eventId, appName, savedAt: now, normalized, source: "database" });
  } catch (caught) {
    if (!dbUnavailable(caught)) {
      return Response.json(
        {
          error: "EventoTron could not save applet state.",
          detail: caught instanceof Error ? caught.message : String(caught),
        },
        { status: 500 },
      );
    }
    const local = writeLocalAppletState(eventId, appName, body.payload);
    return Response.json({ ...local, savedAt: local.updatedAt, source: "local-dev" });
  }
}

export async function DELETE(request: Request) {
  const { eventId, appName } = getParams(request);
  const error = validate(eventId, appName);
  if (error) return Response.json({ error }, { status: 400 });

  try {
    const db = await getDb();
    await db
      .delete(suiteAppletStates)
      .where(
        and(
          eq(suiteAppletStates.eventId, eventId),
          eq(suiteAppletStates.appName, appName),
        ),
      );
    await removeAppletProjection(db, eventId, appName);
    return Response.json({ eventId, appName, deleted: true, source: "database" });
  } catch (caught) {
    if (!dbUnavailable(caught)) {
      return Response.json(
        {
          error: "EventoTron could not delete applet state.",
          detail: caught instanceof Error ? caught.message : String(caught),
        },
        { status: 500 },
      );
    }
    deleteLocalAppletState(eventId, appName);
    return Response.json({ eventId, appName, deleted: true, source: "local-dev" });
  }
}
