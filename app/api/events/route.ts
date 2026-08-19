import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { mealTransfers, suiteAppletStates, suiteEventAudit, suiteEvents } from "@/db/schema";
import { withRole } from "../_lib/auth";
import { removeEventProjections } from "../event-app-state/projections";
import { readLocalEvents, writeLocalEvents } from "./local-store";

type SuiteEvent = {
  id: string;
  title: string;
  date: string;
  kind: string;
  eventTime: string;
  rentalTime: string;
  space: string;
  manager: string;
  contact: string;
  phone: string;
  email: string;
  attendees: number;
  description: string;
  planningNotes: string;
  mod: string;
  vacation: string;
  rentalTotal: number;
  cateringTotal: number;
  discountRate: number;
  deposit: number;
  paymentNotes: string;
  quoteEnteredBy: string;
  requestedItems: string;
  operationsTemplateId?: string;
  calendarEventId?: string;
  calendarSourceId?: string;
  calendarSourceName?: string;
  calendarImportedAt?: string;
  revision?: string;
};

type SuiteEventState = {
  events?: SuiteEvent[];
  selectedId?: string;
  openIds?: string[];
  calendarYear?: number;
  calendarMonth?: number;
};

function normalizeEvent(event: Partial<SuiteEvent>): SuiteEvent {
  const optionalText = (value: unknown) => {
    const normalized = String(value ?? "").trim();
    return normalized || undefined;
  };
  return {
    id: String(event.id ?? ""),
    title: String(event.title ?? "Untitled Event"),
    date: String(event.date ?? ""),
    kind: String(event.kind ?? "rental"),
    eventTime: String(event.eventTime ?? ""),
    rentalTime: String(event.rentalTime ?? ""),
    space: String(event.space ?? ""),
    manager: String(event.manager ?? ""),
    contact: String(event.contact ?? ""),
    phone: String(event.phone ?? ""),
    email: String(event.email ?? ""),
    attendees: Number(event.attendees ?? 0),
    description: String(event.description ?? ""),
    planningNotes: String(event.planningNotes ?? ""),
    mod: String(event.mod ?? ""),
    vacation: String(event.vacation ?? ""),
    rentalTotal: Number(event.rentalTotal ?? 0),
    cateringTotal: Number(event.cateringTotal ?? 0),
    discountRate: Number(event.discountRate ?? 0),
    deposit: Number(event.deposit ?? 0),
    paymentNotes: String(event.paymentNotes ?? ""),
    quoteEnteredBy: String(event.quoteEnteredBy ?? ""),
    requestedItems: String(event.requestedItems ?? ""),
    operationsTemplateId: optionalText(event.operationsTemplateId),
    calendarEventId: optionalText(event.calendarEventId),
    calendarSourceId: optionalText(event.calendarSourceId),
    calendarSourceName: optionalText(event.calendarSourceName),
    calendarImportedAt: optionalText(event.calendarImportedAt),
    revision: optionalText(event.revision),
  };
}

function eventPayload(event: SuiteEvent) {
  const payload = { ...event };
  delete payload.revision;
  return payload;
}

function nextRevision(previous?: string | null) {
  const previousTime = previous ? Date.parse(previous) : 0;
  return new Date(Math.max(Date.now(), Number.isFinite(previousTime) ? previousTime + 1 : 0)).toISOString();
}

function eventColumns(event: SuiteEvent) {
  return {
    id: event.id,
    title: event.title,
    date: event.date,
    kind: event.kind,
    eventTime: event.eventTime,
    rentalTime: event.rentalTime,
    space: event.space,
    manager: event.manager,
    contact: event.contact,
    phone: event.phone,
    email: event.email,
    attendees: event.attendees,
    description: event.description,
    planningNotes: event.planningNotes,
    mod: event.mod,
    vacation: event.vacation,
    rentalTotal: event.rentalTotal,
    cateringTotal: event.cateringTotal,
    discountRate: event.discountRate,
    deposit: event.deposit,
    paymentNotes: event.paymentNotes,
    quoteEnteredBy: event.quoteEnteredBy,
    requestedItems: event.requestedItems,
  };
}

function databaseUnavailable(error: unknown) {
  const detail = error instanceof Error ? error.message : String(error);
  return detail.includes("cloudflare:");
}

async function recordEventAudit(
  db: Awaited<ReturnType<typeof getDb>>,
  actorEmail: string,
  action: "created" | "updated" | "deleted",
  event: SuiteEvent,
  revision: string,
) {
  await db.insert(suiteEventAudit).values({
    id: `audit_${crypto.randomUUID()}`,
    eventId: event.id,
    action,
    actor: actorEmail,
    revision,
    payload: { ...event, revision },
    createdAt: new Date().toISOString(),
  });
}

function rowToEvent(row: typeof suiteEvents.$inferSelect): SuiteEvent {
  const payload = row.payload && typeof row.payload === "object"
    ? row.payload as Partial<SuiteEvent>
    : {};
  return normalizeEvent({
    ...payload,
    id: row.id,
    title: row.title,
    date: row.date,
    kind: row.kind,
    eventTime: row.eventTime,
    rentalTime: row.rentalTime,
    space: row.space,
    manager: row.manager,
    contact: row.contact,
    phone: row.phone,
    email: row.email,
    attendees: row.attendees,
    description: row.description,
    planningNotes: row.planningNotes,
    mod: row.mod,
    vacation: row.vacation,
    rentalTotal: row.rentalTotal,
    cateringTotal: row.cateringTotal,
    discountRate: row.discountRate,
    deposit: row.deposit,
    paymentNotes: row.paymentNotes,
    quoteEnteredBy: row.quoteEnteredBy,
    requestedItems: row.requestedItems,
    revision: row.updatedAt,
  });
}

function conflictResponse(current: typeof suiteEvents.$inferSelect) {
  return Response.json(
    {
      error: "This event changed after it was opened.",
      code: "event_revision_conflict",
      current: rowToEvent(current),
    },
    { status: 409 },
  );
}

export const GET = withRole("staff", async () => {
  try {
    const db = await getDb();
    const events = await db
      .select()
      .from(suiteEvents)
      .orderBy(asc(suiteEvents.date), asc(suiteEvents.title));
    return Response.json({
      events: events.map(rowToEvent),
      selectedId: "",
      openIds: [],
      source: "database",
    });
  } catch (error) {
    if (!databaseUnavailable(error)) {
      return Response.json(
        { error: "EventoTron could not read events.", detail: error instanceof Error ? error.message : String(error) },
        { status: 500 },
      );
    }
    return Response.json({ ...readLocalEvents(), source: "local-dev" });
  }
});

export const PUT = withRole("staff", async (request, identity) => {
  const body = (await request.json().catch(() => ({}))) as SuiteEventState;
  const events = Array.isArray(body.events)
    ? body.events.map(normalizeEvent).filter((event) => event.id)
    : [];
  const selectedId = body.selectedId ?? events[0]?.id ?? "";
  const openIds = Array.isArray(body.openIds) ? body.openIds : selectedId ? [selectedId] : [];
  const calendarYear = Number(body.calendarYear ?? 2026);
  const calendarMonth = Number(body.calendarMonth ?? 7);
  if (!events.length) {
    return Response.json({ error: "Saving requires at least one event." }, { status: 400 });
  }

  try {
    const db = await getDb();
    const existingRows = await db
      .select()
      .from(suiteEvents)
      .where(inArray(suiteEvents.id, events.map((event) => event.id)));
    const existingById = new Map(existingRows.map((row) => [row.id, row]));
    const stale = events.find((event) => {
      const existing = existingById.get(event.id);
      return existing && event.revision !== existing.updatedAt;
    });
    if (stale) return conflictResponse(existingById.get(stale.id)!);

    const savedEvents = await Promise.all(events.map(async (event) => {
      const existing = existingById.get(event.id);
      const revision = nextRevision(existing?.updatedAt);
      const payload = eventPayload(event);
      if (!existing) {
        await db.insert(suiteEvents).values({
          ...eventColumns(event),
          payload,
          createdAt: revision,
          updatedAt: revision,
        });
      } else {
        await db.update(suiteEvents).set({
          ...eventColumns(event),
          payload,
          updatedAt: revision,
        }).where(and(eq(suiteEvents.id, event.id), eq(suiteEvents.updatedAt, event.revision!)));
      }
      await recordEventAudit(db, identity.email, existing ? "updated" : "created", event, revision);
      return { ...event, revision };
    }));

    return Response.json({
      events: savedEvents,
      selectedId,
      openIds,
      calendarYear,
      calendarMonth,
      savedAt: savedEvents.map((event) => event.revision).sort().at(-1),
      source: "database",
    });
  } catch (error) {
    if (!databaseUnavailable(error)) {
      return Response.json(
        { error: "EventoTron could not save events.", detail: error instanceof Error ? error.message : String(error) },
        { status: 500 },
      );
    }
    const local = writeLocalEvents({
      events,
      selectedId,
      openIds,
      calendarYear,
      calendarMonth,
    });
    return Response.json({ ...local, source: "local-dev" });
  }
});

export const PATCH = withRole("staff", async (request, identity) => {
  const body = (await request.json().catch(() => ({}))) as {
    event?: Partial<SuiteEvent>;
    expectedUpdatedAt?: string | null;
  };
  const event = normalizeEvent(body.event ?? {});
  if (!event.id) {
    return Response.json({ error: "Updating an event requires an event ID." }, { status: 400 });
  }
  try {
    const db = await getDb();
    const existing = await db.select().from(suiteEvents).where(eq(suiteEvents.id, event.id)).get();
    const expectedUpdatedAt = body.expectedUpdatedAt ?? event.revision ?? null;
    if (existing && expectedUpdatedAt !== existing.updatedAt) {
      return conflictResponse(existing);
    }

    const revision = nextRevision(existing?.updatedAt);
    const payload = eventPayload(event);
    if (!existing) {
      await db.insert(suiteEvents).values({
        ...eventColumns(event),
        payload,
        createdAt: revision,
        updatedAt: revision,
      });
    } else {
      const updated = await db.update(suiteEvents).set({
        ...eventColumns(event),
        payload,
        updatedAt: revision,
      }).where(
        and(
          eq(suiteEvents.id, event.id),
          eq(suiteEvents.updatedAt, expectedUpdatedAt!),
        ),
      ).returning({ id: suiteEvents.id }).get();
      if (!updated) {
        const current = await db.select().from(suiteEvents).where(eq(suiteEvents.id, event.id)).get();
        if (current) return conflictResponse(current);
      }
    }
    const saved = { ...event, revision };
    await recordEventAudit(db, identity.email, existing ? "updated" : "created", saved, revision);
    return Response.json({ event: saved, savedAt: revision, source: "database" });
  } catch (error) {
    if (!databaseUnavailable(error)) {
      return Response.json(
        { error: "EventoTron could not update the event.", detail: error instanceof Error ? error.message : String(error) },
        { status: 500 },
      );
    }
    const local = readLocalEvents();
    const events = local.events.some((item) => item.id === event.id)
      ? local.events.map((item) => (item.id === event.id ? event : item))
      : [...local.events, event];
    writeLocalEvents({
      events,
      selectedId: event.id,
      openIds: [event.id, ...local.openIds.filter((id) => id !== event.id)].slice(0, 8),
      calendarYear: local.calendarYear,
      calendarMonth: local.calendarMonth,
    });
    const revision = nextRevision(event.revision);
    return Response.json({ event: { ...event, revision }, savedAt: revision, source: "local-dev" });
  }
});

export const DELETE = withRole("staff", async (request, identity) => {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) {
    return Response.json({ error: "Deleting an event requires an event ID." }, { status: 400 });
  }

  try {
    const db = await getDb();
    const existing = await db.select().from(suiteEvents).where(eq(suiteEvents.id, id)).get();
    await removeEventProjections(db, id);
    await Promise.all([
      db.delete(suiteAppletStates).where(eq(suiteAppletStates.eventId, id)),
      db.delete(mealTransfers).where(eq(mealTransfers.tabletronEventId, id)),
    ]);
    await db.delete(suiteEvents).where(eq(suiteEvents.id, id));
    if (existing) {
      await recordEventAudit(db, identity.email, "deleted", rowToEvent(existing), existing.updatedAt);
    }
    return Response.json({ id, deleted: true, source: "database" });
  } catch (error) {
    if (!databaseUnavailable(error)) {
      return Response.json(
        { error: "EventoTron could not delete the event.", detail: error instanceof Error ? error.message : String(error) },
        { status: 500 },
      );
    }
    const local = readLocalEvents();
    writeLocalEvents({
      events: local.events.filter((event) => event.id !== id),
      selectedId: local.selectedId === id ? local.events.find((event) => event.id !== id)?.id ?? "" : local.selectedId,
      openIds: local.openIds.filter((eventId) => eventId !== id),
      calendarYear: local.calendarYear,
      calendarMonth: local.calendarMonth,
    });
    return Response.json({ id, deleted: true, source: "local-dev" });
  }
});
