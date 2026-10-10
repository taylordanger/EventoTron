import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { suiteSettings, suiteCalendarSources } from "@/db/schema";
import { normalizeSource, calendarConfiguration } from "@/app/calendar-source-state";
import { settingsWithCalendarSources } from "../_lib/calendar-source-store";
import { withRole } from "../_lib/auth";
import { readLocalSettings, writeLocalSettings } from "./local-store";

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
  const body = (await request.json().catch(() => ({}))) as { payload?: unknown };
  if (!body.payload || typeof body.payload !== "object" || Array.isArray(body.payload)) {
    return Response.json({ error: "Saving settings requires a payload." }, { status: 400 });
  }
  const now = new Date().toISOString();
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
    await db.batch([settingsWrite, ...sourceWrites]);
    return Response.json({ id: "workspace", savedAt: now, source: "database" });
  } catch (error) {
    if (!dbUnavailable(error)) {
      return Response.json(
        {
          error: "EventoTron could not save settings.",
          detail: error instanceof Error ? error.message : String(error),
        },
        { status: 500 },
      );
    }
    const local = writeLocalSettings(body.payload);
    return Response.json({ ...local, savedAt: local.updatedAt, source: "local-dev" });
  }
});
