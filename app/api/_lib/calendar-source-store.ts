import { getDb } from "@/db";
import { suiteCalendarSources } from "@/db/schema";
import { normalizeSource } from "@/app/calendar-source-state";
import type { CalendarSource } from "@/app/suite-settings";

export async function settingsWithCalendarSources(db: Awaited<ReturnType<typeof getDb>>, payload: unknown) {
  const settings = payload && typeof payload === "object" && !Array.isArray(payload) ? payload as Record<string, unknown> : {};
  const rows = await db.select().from(suiteCalendarSources);
  const sources = rows.map((row) => normalizeSource({
    ...(row.payload as Record<string, unknown>),
    id: row.id, name: row.name, provider: row.provider, url: row.url,
    enabled: row.enabled, color: row.color, syncMinutes: row.syncMinutes,
    lastSynced: row.lastSynced ?? undefined, lastError: row.lastError ?? undefined,
  })).filter((source): source is CalendarSource => source !== null);
  // Old backups may contain settings-only connections; the next save migrates them.
  return { ...settings, calendarSources: rows.length ? sources : Array.isArray(settings.calendarSources) ? settings.calendarSources : [] };
}
