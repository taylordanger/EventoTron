import { eq, notInArray } from "drizzle-orm";
import { getDb } from "@/db";
import { suiteSettings, suiteCalendarSources, suiteCalendarEvents } from "@/db/schema";
import { normalizeSource, calendarConfiguration } from "@/app/calendar-source-state";
import { settingsWithCalendarSources } from "../_lib/calendar-source-store";
import { withRole } from "../_lib/auth";
import { readLocalSettings, writeLocalSettings } from "./local-store";
import { guardedWrite, validExpectedRevision, revisionConflict, nextRevision } from "../_lib/guarded-write";

function dbUnavailable(error: unknown) {
  const detail = error instanceof Error ? error.message : String(error);
  return detail.includes("cloudflare:");
}

export const GET = withRole("staff", async () => {
  try {
    const db = await getDb();
    const settings = await db
      .select()
      .from(suiteSettings)
      .where(eq(suiteSettings.id, "workspace"))
      .get();
    if (!settings) {
      return Response.json({ error: "No saved settings." }, { status: 404 });
    }
    return Response.json({ ...settings, payload: await settingsWithCalendarSources(db, settings.payload), source: "database" }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (!dbUnavailable(error)) {
      return Response.json(
        {
          error: "EventoTron could not read settings.",
          detail: error instanceof Error ? error.message : String(error),
        },
        { status: 500 },
      );
    }
    const local = readLocalSettings();
    if (!local) {
      return Response.json({ error: "No saved settings." }, { status: 404 });
    }
    return Response.json({ ...local, source: "local-dev" });
  }
});

export const PUT = withRole("admin", async (request: Request) => {
  const body = (await request.json().catch(() => ({}))) as { payload?: unknown; expectedUpdatedAt?: string | null };
  if (!body.payload || typeof body.payload !== "object" || Array.isArray(body.payload)) {
    return Response.json({ error: "Saving settings requires a payload." }, { status: 400 });
  }
  if (!validExpectedRevision(body)) return Response.json({ error: "Reload settings before saving. A revision is required." }, { status: 428 });
  const now = nextRevision(body.expectedUpdatedAt);
  const payload = body.payload as Record<string, unknown>;
  const sources = Array.isArray(payload.calendarSources) ? payload.calendarSources.map(normalizeSource) : [];
  if (sources.some((source) => source === null)) return Response.json({ error: "Calendar connection is incomplete." }, { status: 400 });
  const { calendarSources: _sources, ...settingsPayload } = payload;
  void _sources;
  try {
    const db = await getDb();
    const settingsWrite = db
      .insert(suiteSettings)
      .values({
        id: "workspace",
        payload: settingsPayload,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: suiteSettings.id,
        set: { payload: settingsPayload, updatedAt: now },
      });
    const sourceWrites = sources.filter((source) => source !== null).map((source) => {
      const config = calendarConfiguration(source);
      return db.insert(suiteCalendarSources).values({
        ...config, payload: config, createdAt: now, updatedAt: now,
      }).onConflictDoUpdate({ target: suiteCalendarSources.id, set: { ...config, payload: config, updatedAt: now } });
    });
    const ids = sources.filter((source) => source !== null).map((source) => source.id);
    const removals = Array.isArray(payload.calendarSources) ? [
      db.delete(suiteCalendarEvents).where(ids.length ? notInArray(suiteCalendarEvents.sourceId, ids) : undefined),
      db.delete(suiteCalendarSources).where(ids.length ? notInArray(suiteCalendarSources.id, ids) : undefined),
    ] : [];
    await guardedWrite("suite_settings", "workspace", body.expectedUpdatedAt!, [settingsWrite, ...sourceWrites, ...removals]);
    return Response.json({ id: "workspace", savedAt: now, updatedAt: now, source: "database" });
  } catch (error) {
    if (revisionConflict(error)) return Response.json({ error: "Another administrator saved settings. Your draft has not replaced theirs." }, { status: 409 });
    if (!dbUnavailable(error)) {
      return Response.json(
        {
          error: "EventoTron could not save settings.",
          detail: error instanceof Error ? error.message : String(error),
        },
        { status: 500 },
      );
    }
    if ((readLocalSettings()?.updatedAt ?? null) !== body.expectedUpdatedAt) return Response.json({ error: "Another administrator saved settings." }, { status: 409 });
    const local = writeLocalSettings(body.payload, now);
    return Response.json({ ...local, savedAt: local.updatedAt, source: "local-dev" });
  }
});
