import { asc, eq, gte } from "drizzle-orm";
import { getDb } from "@/db";
import { suiteCalendarEvents, suiteCalendarSources, suiteSettings } from "@/db/schema";
import { extractGoogleCalendarIds, googleCalendarFeedUrl } from "@/app/suite-settings";
import { withRole } from "../_lib/auth";
import { getValidAccessToken, type TokenEnv } from "../_lib/calendar-oauth-accounts";
import { fetchGoogleCalendarEvents } from "../_lib/google-oauth";
import { fetchMicrosoftCalendarEvents } from "../_lib/microsoft-oauth";
import { normalizeSource, calendarConfiguration } from "@/app/calendar-source-state";
import type { CalendarSource as CalendarSourceInput } from "@/app/suite-settings";

type CalendarProvider = "google" | "outlook" | "ical" | "work";


export type ParsedCalendarEvent = {
  externalId: string;
  title: string;
  date: string;
  eventTime: string;
  description: string;
  location: string;
};

type CalendarImportSummary = {
  sourceId: string;
  sourceName: string;
  provider: CalendarProvider;
  enabled: boolean;
  color: string;
  lastSynced: string | null;
  lastError: string | null;
  eventCount: number;
  firstEventDate: string | null;
  lastEventDate: string | null;
  newestImportedAt: string | null;
  recentEvents: Array<{
    id: string;
    title: string;
    date: string;
    eventTime: string;
    location: string;
    importedAt: string;
  }>;
};

const maxRecurringOccurrences = 730;
const defaultRecurringHorizonDays = 730;

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}


function validateFeedUrl(value: string) {
  if (!/^https?:\/\//i.test(value)) {
    throw new Error("Calendar feed URL must begin with http:// or https://");
  }
  const googleIds = extractGoogleCalendarIds(value);
  if (googleIds.length) return googleCalendarFeedUrl(googleIds[0]);
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

function formatDateParts(date: Date) {
  return {
    year: date.getFullYear(),
    month: date.getMonth(),
    day: date.getDate(),
    hour: date.getHours(),
    minute: date.getMinutes(),
  };
}

function calendarDateKey(parts: { year: number; month: number; day: number }) {
  return `${parts.year}-${String(parts.month + 1).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function parseCalendarDate(value: string) {
  const clean = value.trim();
  if (/^\d{8}$/.test(clean)) {
    const parts = {
      year: Number(clean.slice(0, 4)),
      month: Number(clean.slice(4, 6)) - 1,
      day: Number(clean.slice(6, 8)),
      hour: 0,
      minute: 0,
    };
    return { date: calendarDateKey(parts), time: "All day", parts, allDay: true };
  }
  const digits = clean.replace(/\D/g, "");
  if (digits.length < 8) return { date: "", time: "", parts: null, allDay: false };
  const year = Number(digits.slice(0, 4));
  const month = Number(digits.slice(4, 6)) - 1;
  const day = Number(digits.slice(6, 8));
  const hour = Number(digits.slice(8, 10) || "0");
  const minute = Number(digits.slice(10, 12) || "0");
  const parsed = clean.endsWith("Z")
    ? new Date(Date.UTC(year, month, day, hour, minute))
    : new Date(year, month, day, hour, minute);
  if (Number.isNaN(parsed.getTime())) return { date: "", time: "", parts: null, allDay: false };
  const parts = formatDateParts(parsed);
  return {
    date: calendarDateKey(parts),
    time: parsed.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
    parts,
    allDay: false,
  };
}

function parseRrule(value: string) {
  return Object.fromEntries(value.split(";").flatMap((part) => {
    const [key, raw] = part.split("=");
    return key && raw ? [[key.toUpperCase(), raw]] : [];
  }));
}

function addRecurrenceStep(date: Date, frequency: string, interval: number) {
  const next = new Date(date);
  if (frequency === "DAILY") next.setDate(next.getDate() + interval);
  else if (frequency === "WEEKLY") next.setDate(next.getDate() + interval * 7);
  else if (frequency === "MONTHLY") next.setMonth(next.getMonth() + interval);
  else if (frequency === "YEARLY") next.setFullYear(next.getFullYear() + interval);
  else return null;
  return next;
}

const weekDayIndexes: Record<string, number> = {
  SU: 0,
  MO: 1,
  TU: 2,
  WE: 3,
  TH: 4,
  FR: 5,
  SA: 6,
};

function weekNumberSince(start: Date, current: Date) {
  const startWeek = new Date(start);
  startWeek.setDate(startWeek.getDate() - startWeek.getDay());
  startWeek.setHours(0, 0, 0, 0);
  const currentWeek = new Date(current);
  currentWeek.setDate(currentWeek.getDate() - currentWeek.getDay());
  currentWeek.setHours(0, 0, 0, 0);
  return Math.floor((currentWeek.getTime() - startWeek.getTime()) / (7 * 24 * 60 * 60 * 1000));
}

function recurringEventForDate(base: ParsedCalendarEvent, date: Date, index: number) {
  const parts = formatDateParts(date);
  const dateKey = calendarDateKey(parts);
  return {
    ...base,
    externalId: `${base.externalId}#${dateKey}-${index}`,
    date: dateKey,
  };
}

function expandRecurringEvent(
  base: ParsedCalendarEvent,
  start: ReturnType<typeof parseCalendarDate>,
  rruleValue: string,
) {
  if (!start.parts) return [base];
  const rule = parseRrule(rruleValue);
  const frequency = String(rule.FREQ ?? "").toUpperCase();
  const interval = Math.max(1, Number(rule.INTERVAL) || 1);
  const count = Math.min(maxRecurringOccurrences, Math.max(1, Number(rule.COUNT) || maxRecurringOccurrences));
  const until = rule.UNTIL ? parseCalendarDate(rule.UNTIL) : null;
  const horizon = new Date(start.parts.year, start.parts.month, start.parts.day);
  horizon.setDate(horizon.getDate() + defaultRecurringHorizonDays);
  const untilDate = until?.parts
    ? new Date(until.parts.year, until.parts.month, until.parts.day, until.parts.hour, until.parts.minute)
    : horizon;
  const occurrences: ParsedCalendarEvent[] = [];
  const startDate = new Date(start.parts.year, start.parts.month, start.parts.day, start.parts.hour, start.parts.minute);
  if (frequency === "WEEKLY" && rule.BYDAY) {
    const includedDays = new Set(String(rule.BYDAY).split(",").map((day) => weekDayIndexes[day]).filter((day) => day !== undefined));
    const cursor = new Date(startDate);
    for (let guard = 0; occurrences.length < count && cursor <= untilDate && guard < maxRecurringOccurrences * 7; guard += 1) {
      const weeksSinceStart = weekNumberSince(startDate, cursor);
      if (cursor >= startDate && weeksSinceStart % interval === 0 && includedDays.has(cursor.getDay())) {
        occurrences.push(recurringEventForDate(base, cursor, occurrences.length));
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    return occurrences.length ? occurrences : [base];
  }
  let cursor: Date | null = startDate;
  for (let index = 0; cursor && index < count && cursor <= untilDate && index < maxRecurringOccurrences; index += 1) {
    occurrences.push(recurringEventForDate(base, cursor, index));
    cursor = addRecurrenceStep(cursor, frequency, interval);
  }
  return occurrences.length ? occurrences : [base];
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
        const base = {
          externalId: getField(current, "UID") || `feed-${events.length}-${start.date}-${title}`,
          title,
          date: start.date,
          eventTime: start.time,
          description: getField(current, "DESCRIPTION"),
          location: getField(current, "LOCATION"),
        };
        const rrule = getField(current, "RRULE");
        events.push(...(rrule ? expandRecurringEvent(base, start, rrule) : [base]));
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

async function upsertSource(source: CalendarSourceInput, now: string, syncResult = false) {
  const db = await getDb();
  const config = calendarConfiguration(source);
  await db.insert(suiteCalendarSources).values({
    id: source.id,
    name: source.name,
    provider: source.provider,
    url: source.url,
    enabled: source.enabled,
    color: source.color,
    syncMinutes: source.syncMinutes,
    lastSynced: syncResult ? source.lastSynced ?? null : null,
    lastError: syncResult ? source.lastError ?? null : null,
    payload: config,
    createdAt: now,
    updatedAt: now,
  }).onConflictDoUpdate({
    target: suiteCalendarSources.id,
    set: syncResult ? {
      lastSynced: source.lastSynced ?? null, lastError: source.lastError ?? null, updatedAt: now,
    } : { ...config, payload: config, updatedAt: now },
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

function importSummaryForSource(
  source: CalendarSourceInput,
  events: Array<typeof suiteCalendarEvents.$inferSelect>,
): CalendarImportSummary {
  const sourceEvents = events
    .filter((event) => event.sourceId === source.id)
    .sort((a, b) => {
      const dateCompare = b.date.localeCompare(a.date);
      return dateCompare || b.updatedAt.localeCompare(a.updatedAt);
    });
  const dates = sourceEvents.map((event) => event.date).filter(Boolean).sort();
  const updatedDates = sourceEvents.map((event) => event.updatedAt).filter(Boolean).sort();
  return {
    sourceId: source.id,
    sourceName: source.name,
    provider: source.provider,
    enabled: source.enabled,
    color: source.color,
    lastSynced: source.lastSynced ?? null,
    lastError: source.lastError ?? null,
    eventCount: sourceEvents.length,
    firstEventDate: dates[0] ?? null,
    lastEventDate: dates.at(-1) ?? null,
    newestImportedAt: updatedDates.at(-1) ?? null,
    recentEvents: sourceEvents.slice(0, 5).map((event) => ({
      id: event.id,
      title: event.title,
      date: event.date,
      eventTime: event.eventTime,
      location: event.location,
      importedAt: event.updatedAt,
    })),
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
  const db = await getDb();
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
  await upsertSource(syncedSource, now, true);
  return {
    source: syncedSource,
    events: rows.map((event) => eventForClient(event, syncedSource)),
  };
}

/** Hard ceiling on a bounded read, so one request can never scan the table. */
const MAX_UPCOMING_EVENTS = 200;

export const GET = withRole("staff", async (request: Request) => {
  try {
    const db = await getDb();

    // The operations ticker only ever shows what is live, today, or next, but
    // it polls on a timer from every open tab. Reading the whole calendar for
    // that dominates database cost, so callers can ask for just the next N
    // events from a date instead. Uses idx_suite_calendar_events_date, so the
    // scan is bounded by `limit` rather than by table size.
    const params = new URL(request.url).searchParams;
    const from = params.get("from")?.trim();
    const requestedLimit = Number.parseInt(params.get("limit") ?? "", 10);
    const bounded = Boolean(from) && Number.isFinite(requestedLimit) && requestedLimit > 0;
    const limit = Math.min(requestedLimit, MAX_UPCOMING_EVENTS);

    const [sourceRows, eventRows] = await Promise.all([
      db.select().from(suiteCalendarSources),
      bounded
        ? db
            .select()
            .from(suiteCalendarEvents)
            .where(gte(suiteCalendarEvents.date, from!))
            .orderBy(asc(suiteCalendarEvents.date))
            .limit(limit)
        : db.select().from(suiteCalendarEvents),
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
      eventCount: bounded
        ? undefined
        : eventRows.filter((event) => event.sourceId === row.id).length,
    })).filter((source): source is CalendarSourceInput => source !== null);
    const sourceById = new Map(sources.map((source) => [source.id, source]));
    return Response.json({
      sources,
      // A bounded read cannot describe import history, so it is omitted rather
      // than computed from a partial set.
      importHistory: bounded
        ? []
        : sources.map((source) => importSummaryForSource(source, eventRows)),
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
});

export const PUT = withRole("admin", async (request: Request) => {
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
});

async function syncOAuthSource(source: CalendarSourceInput, env: TokenEnv) {
  try {
    const accessToken = await getValidAccessToken(source.oauthAccountId!, env);
    const events = source.provider === "outlook"
      ? await fetchMicrosoftCalendarEvents(accessToken)
      : await fetchGoogleCalendarEvents(accessToken, source.url || "primary");
    const persisted = await persistSync(source, events);
    return Response.json({ ...persisted, persisted: true });
  } catch (error) {
    const failedSource = { ...source, lastError: error instanceof Error ? error.message : "Calendar sync failed" };
    await upsertSource(failedSource, new Date().toISOString(), true).catch(() => undefined);
    return Response.json(
      { error: error instanceof Error ? error.message : "Calendar sync failed" },
      { status: 502 },
    );
  }
}

export const POST = withRole("admin", async (request: Request) => {
  const body = record(await request.json().catch(() => null));
  let source = normalizeSource(body?.source);
  if (source) {
    const db = await getDb();
    const row = await db.select().from(suiteCalendarSources).where(eq(suiteCalendarSources.id, source.id)).get();
    if (row) source = normalizeSource({ ...record(row.payload), id: row.id, name: row.name, provider: row.provider, url: row.url, enabled: row.enabled, color: row.color, syncMinutes: row.syncMinutes, lastSynced: row.lastSynced ?? undefined, lastError: row.lastError ?? undefined });
  }
  if (source?.oauthAccountId) {
    const { env } = await import("cloudflare:workers");
    return syncOAuthSource(source, env as TokenEnv);
  }
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
    if (!response.ok) throw new Error(`Calendar feed returned ${response.status}`);
    const text = await response.text();
    if (text.length > 5_000_000) return Response.json({ error: "Calendar feed is too large to import." }, { status: 413 });
    if (!text.includes("BEGIN:VCALENDAR")) throw new Error("The feed did not return an iCalendar document");
    const events = parseIcs(text);
    if (!source) return Response.json({ events });
    const persisted = await persistSync({ ...source, url }, events);
    return Response.json({ ...persisted, persisted: true });
  } catch (error) {
    if (source) {
      const failedSource = { ...source, lastError: error instanceof Error ? error.message : "Calendar feed could not be read" };
      await upsertSource(failedSource, new Date().toISOString(), true).catch(() => undefined);
    }
    return Response.json({ error: error instanceof Error ? error.message : "Calendar feed could not be read" }, { status: 500 });
  }
});

export const DELETE = withRole("admin", async (request: Request) => {
  const sourceId = new URL(request.url).searchParams.get("sourceId")?.trim() ?? "";
  if (!sourceId) return Response.json({ error: "Calendar source ID is required." }, { status: 400 });
  try {
    const db = await getDb();
    await db.delete(suiteCalendarEvents).where(eq(suiteCalendarEvents.sourceId, sourceId));
    await db.delete(suiteCalendarSources).where(eq(suiteCalendarSources.id, sourceId));
    const settings = await db.select().from(suiteSettings).where(eq(suiteSettings.id, "workspace")).get();
    const payload = record(settings?.payload);
    if (settings && Array.isArray(payload?.calendarSources)) {
      const { calendarSources: _legacy, ...canonicalSettings } = payload;
      void _legacy;
      await db.update(suiteSettings).set({ payload: canonicalSettings, updatedAt: new Date().toISOString() }).where(eq(suiteSettings.id, "workspace"));
    }
    return Response.json({ deleted: true, sourceId });
  } catch (error) {
    return Response.json({
      error: "Calendar connection could not be removed.",
      detail: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
});
