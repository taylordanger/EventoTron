import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { suiteCalendarEvents, suiteCalendarSources } from "@/db/schema";

type CalendarProvider = "google" | "outlook" | "ical" | "work";

type CalendarSourceInput = {
  id: string;
  name: string;
  provider: CalendarProvider;
  url: string;
  enabled: boolean;
  color: string;
  syncMinutes: number;
  lastSynced?: string;
  lastError?: string;
  eventCount?: number;
};

type ParsedCalendarEvent = {
  externalId: string;
  title: string;
  date: string;
  eventTime: string;
  description: string;
  location: string;
};

const providers = new Set<CalendarProvider>(["google", "outlook", "ical", "work"]);

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function normalizeSource(value: unknown): CalendarSourceInput | null {
  const source = record(value);
  if (!source) return null;
  const id = String(source.id ?? "").trim();
  const name = String(source.name ?? "").trim();
  const provider = String(source.provider ?? "ical") as CalendarProvider;
  const url = String(source.url ?? "").trim();
  const color = String(source.color ?? "#75ff47").trim();
  const syncMinutes = Math.max(5, Math.min(1440, Number(source.syncMinutes) || 15));
  if (!id || id.length > 180 || !name || name.length > 240 || !providers.has(provider)) return null;
  if (!/^#[0-9a-f]{6}$/i.test(color)) return null;
  return {
    id,
    name,
    provider,
    url,
    enabled: source.enabled !== false,
    color,
    syncMinutes,
    lastSynced: typeof source.lastSynced === "string" ? source.lastSynced : undefined,
    lastError: typeof source.lastError === "string" ? source.lastError : undefined,
    eventCount: Number.isFinite(Number(source.eventCount)) ? Number(source.eventCount) : undefined,
  };
}

function validateFeedUrl(value: string) {
  if (!/^https?:\/\//i.test(value)) {
    throw new Error("Calendar feed URL must begin with http:// or https://");
  }
  return new URL(value).toString();
}

function unfoldCalendar(value: string) {
  return value.replace(/\r?\n[ \t]/g, "").split(/\r?\n/).filter(Boolean);
}

function unescapeCalendar(value: string) {
  return value.replace(/\\n/gi, "\n").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\");
}

function getField(lines: string[], name: string) {
  const line = lines.find((item) => item.startsWith(`${name}:`) || item.startsWith(`${name};`));
  if (!line) return "";
  return unescapeCalendar(line.slice(line.indexOf(":") + 1));
}

function parseCalendarDate(value: string) {
  const clean = value.trim();
  if (/^\d{8}$/.test(clean)) {
    return { date: `${clean.slice(0, 4)}-${clean.slice(4, 6)}-${clean.slice(6, 8)}`, time: "All day" };
  }
  const digits = clean.replace(/\D/g, "");
  if (digits.length < 8) return { date: "", time: "" };
  const year = Number(digits.slice(0, 4));
  const month = Number(digits.slice(4, 6)) - 1;
  const day = Number(digits.slice(6, 8));
  const hour = Number(digits.slice(8, 10) || "0");
  const minute = Number(digits.slice(10, 12) || "0");
  const parsed = clean.endsWith("Z")
    ? new Date(Date.UTC(year, month, day, hour, minute))
    : new Date(year, month, day, hour, minute);
  if (Number.isNaN(parsed.getTime())) return { date: "", time: "" };
  return {
    date: parsed.toISOString().slice(0, 10),
    time: parsed.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
  };
}

function parseIcs(value: string): ParsedCalendarEvent[] {
  const lines = unfoldCalendar(value);
  const events: ParsedCalendarEvent[] = [];
  let current: string[] | null = null;
  for (const line of lines) {
    if (line === "BEGIN:VEVENT") current = [];
    else if (line === "END:VEVENT" && current) {
      const start = parseCalendarDate(getField(current, "DTSTART"));
      const title = getField(current, "SUMMARY");
      if (start.date && title) {
        events.push({
          externalId: getField(current, "UID") || `feed-${events.length}-${start.date}-${title}`,
          title,
          date: start.date,
          eventTime: start.time,
          description: getField(current, "DESCRIPTION"),
          location: getField(current, "LOCATION"),
        });
      }
      current = null;
    } else if (current) current.push(line);
  }
  return events;
}

async function permanentCalendarEventId(sourceId: string, externalId: string) {
  const input = new TextEncoder().encode(`${sourceId}\u0000${externalId}`);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", input));
  return `calevt_${Array.from(digest.slice(0, 12), (value) => value.toString(16).padStart(2, "0")).join("")}`;
}

async function upsertSource(source: CalendarSourceInput, now: string) {
  const db = await getDb();
  await db.insert(suiteCalendarSources).values({
    id: source.id,
    name: source.name,
    provider: source.provider,
    url: source.url,
    enabled: source.enabled,
    color: source.color,
    syncMinutes: source.syncMinutes,
    lastSynced: source.lastSynced ?? null,
    lastError: source.lastError ?? null,
    payload: source,
    createdAt: now,
    updatedAt: now,
  }).onConflictDoUpdate({
    target: suiteCalendarSources.id,
    set: {
      name: source.name,
      provider: source.provider,
      url: source.url,
      enabled: source.enabled,
      color: source.color,
      syncMinutes: source.syncMinutes,
      lastSynced: source.lastSynced ?? null,
      lastError: source.lastError ?? null,
      payload: source,
      updatedAt: now,
    },
  });
  return db;
}

function eventForClient(
  event: typeof suiteCalendarEvents.$inferSelect,
  source: CalendarSourceInput,
) {
  return {
    id: event.id,
    externalId: event.externalId,
    title: event.title,
    date: event.date,
    eventTime: event.eventTime,
    description: event.description,
    location: event.location,
    sourceId: source.id,
    sourceName: source.name,
    color: source.color,
  };
}

async function persistSync(source: CalendarSourceInput, events: ParsedCalendarEvent[]) {
  const now = new Date().toISOString();
  const syncedSource: CalendarSourceInput = {
    ...source,
    lastSynced: now,
    lastError: "",
    eventCount: events.length,
  };
  const db = await upsertSource(syncedSource, now);
  const existing = await db.select({ id: suiteCalendarEvents.id })
    .from(suiteCalendarEvents)
    .where(eq(suiteCalendarEvents.sourceId, source.id));
  const rows = await Promise.all(events.map(async (event) => ({
    id: await permanentCalendarEventId(source.id, event.externalId),
    sourceId: source.id,
    externalId: event.externalId,
    title: event.title,
    date: event.date,
    eventTime: event.eventTime,
    description: event.description,
    location: event.location,
    payload: event,
    createdAt: now,
    updatedAt: now,
  })));
  await Promise.all(rows.map((row) => db.insert(suiteCalendarEvents).values(row).onConflictDoUpdate({
    target: suiteCalendarEvents.id,
    set: {
      sourceId: row.sourceId,
      externalId: row.externalId,
      title: row.title,
      date: row.date,
      eventTime: row.eventTime,
      description: row.description,
      location: row.location,
      payload: row.payload,
      updatedAt: now,
    },
  })));
  const retained = new Set(rows.map((row) => row.id));
  await Promise.all(existing.filter((row) => !retained.has(row.id)).map((row) =>
    db.delete(suiteCalendarEvents).where(eq(suiteCalendarEvents.id, row.id)),
  ));
  return {
    source: syncedSource,
    events: rows.map((event) => eventForClient(event, syncedSource)),
  };
}

export async function GET() {
  try {
    const db = await getDb();
    const [sourceRows, eventRows] = await Promise.all([
      db.select().from(suiteCalendarSources),
      db.select().from(suiteCalendarEvents),
    ]);
    const sources = sourceRows.map((row) => normalizeSource({
      ...(record(row.payload) ?? {}),
      id: row.id,
      name: row.name,
      provider: row.provider,
      url: row.url,
      enabled: row.enabled,
      color: row.color,
      syncMinutes: row.syncMinutes,
      lastSynced: row.lastSynced ?? undefined,
      lastError: row.lastError ?? undefined,
      eventCount: eventRows.filter((event) => event.sourceId === row.id).length,
    })).filter((source): source is CalendarSourceInput => source !== null);
    const sourceById = new Map(sources.map((source) => [source.id, source]));
    return Response.json({
      sources,
      events: eventRows.flatMap((event) => {
        const source = sourceById.get(event.sourceId);
        return source ? [eventForClient(event, source)] : [];
      }),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({
      error: "Calendar connections could not be loaded.",
      detail: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const body = record(await request.json().catch(() => null));
  const source = normalizeSource(body?.source ?? body);
  if (!source) return Response.json({ error: "Calendar connection is incomplete." }, { status: 400 });
  try {
    await upsertSource(source, new Date().toISOString());
    return Response.json({ source });
  } catch (error) {
    return Response.json({
      error: "Calendar connection could not be saved.",
      detail: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const body = record(await request.json().catch(() => null));
  const source = normalizeSource(body?.source);
  const rawUrl = String(body?.url ?? source?.url ?? "").trim();
  let url: string;
  try {
    url = validateFeedUrl(rawUrl);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Calendar feed URL is invalid." }, { status: 400 });
  }

  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers: { Accept: "text/calendar, text/plain;q=0.9, */*;q=0.1" },
    });
    if (!response.ok) return Response.json({ error: `Calendar feed returned ${response.status}` }, { status: 502 });
    const text = await response.text();
    if (text.length > 5_000_000) return Response.json({ error: "Calendar feed is too large to import." }, { status: 413 });
    const events = parseIcs(text);
    if (!source) return Response.json({ events });
    const persisted = await persistSync({ ...source, url }, events);
    return Response.json({ ...persisted, persisted: true });
  } catch (error) {
    if (source) {
      const failedSource = { ...source, lastError: error instanceof Error ? error.message : "Calendar feed could not be read" };
      await upsertSource(failedSource, new Date().toISOString()).catch(() => undefined);
    }
    return Response.json({ error: error instanceof Error ? error.message : "Calendar feed could not be read" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const sourceId = new URL(request.url).searchParams.get("sourceId")?.trim() ?? "";
  if (!sourceId) return Response.json({ error: "Calendar source ID is required." }, { status: 400 });
  try {
    const db = await getDb();
    await db.delete(suiteCalendarEvents).where(eq(suiteCalendarEvents.sourceId, sourceId));
    await db.delete(suiteCalendarSources).where(eq(suiteCalendarSources.id, sourceId));
    return Response.json({ deleted: true, sourceId });
  } catch (error) {
    return Response.json({
      error: "Calendar connection could not be removed.",
      detail: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}
