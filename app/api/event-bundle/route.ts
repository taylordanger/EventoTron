import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { suiteAppletStates, suiteEvents, suiteSettings } from "@/db/schema";
import { withRole } from "../_lib/auth";
import { readLocalAppletState } from "../event-app-state/local-store";
import { readLocalEvents } from "../events/local-store";
import { readLocalSettings } from "../settings/local-store";
import { settingsWithCalendarSources } from "../_lib/calendar-source-store";

const appNames = ["tabletron", "foodotron", "scheduluotron"] as const;

function databaseUnavailable(error: unknown) {
  const detail = error instanceof Error ? error.message : String(error);
  return detail.includes("cloudflare:");
}

function rowToEvent(row: typeof suiteEvents.$inferSelect) {
  return {
    ...(row.payload as Record<string, unknown>),
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
  };
}

function appletPayloads(
  states: Array<{ appName: string; payload: unknown; updatedAt: string }>,
) {
  return Object.fromEntries(
    appNames.map((appName) => [
      appName,
      states.find((state) => state.appName === appName)?.payload ?? null,
    ]),
  );
}

export const GET = withRole("staff", async (request: Request) => {
  const eventId = new URL(request.url).searchParams.get("eventId") ?? "";
  if (!eventId) {
    return Response.json({ error: "An event bundle requires an event ID." }, { status: 400 });
  }

  try {
    const db = await getDb();
    const [event, settings, states] = await Promise.all([
      db.select().from(suiteEvents).where(eq(suiteEvents.id, eventId)).get(),
      db.select().from(suiteSettings).where(eq(suiteSettings.id, "workspace")).get(),
      db
        .select()
        .from(suiteAppletStates)
        .where(eq(suiteAppletStates.eventId, eventId)),
    ]);
    if (!event) {
      return Response.json({ error: "Event not found." }, { status: 404 });
    }

    return Response.json({
      event: rowToEvent(event),
      settings: await settingsWithCalendarSources(db, settings?.payload),
      applets: appletPayloads(states),
      updatedAt: [event.updatedAt, settings?.updatedAt, ...states.map((state) => state.updatedAt)]
        .filter(Boolean)
        .sort()
        .at(-1) ?? event.updatedAt,
      source: "database",
    });
  } catch (error) {
    if (!databaseUnavailable(error)) {
      return Response.json(
        {
          error: "EventoTron could not assemble the event bundle.",
          detail: error instanceof Error ? error.message : String(error),
        },
        { status: 500 },
      );
    }

    const event = readLocalEvents().events.find((item) => item.id === eventId);
    if (!event) {
      return Response.json({ error: "Event not found." }, { status: 404 });
    }
    const settings = readLocalSettings();
    const states = appNames
      .map((appName) => readLocalAppletState(eventId, appName))
      .filter((state) => state !== null);
    return Response.json({
      event,
      settings: settings?.payload ?? null,
      applets: appletPayloads(states),
      updatedAt: [settings?.updatedAt, ...states.map((state) => state.updatedAt)]
        .filter(Boolean)
        .sort()
        .at(-1) ?? null,
      source: "local-dev",
    });
  }
});
