import { getDb } from "@/db";
import {
  foodotronMeals,
  mealTransfers,
  suiteAppletStates,
  suiteEvents,
  suiteSettings,
  tabletronEvents,
} from "@/db/schema";
import { readAllLocalAppletStates, writeLocalAppletState } from "../event-app-state/local-store";
import { projectAppletState } from "../event-app-state/projections";
import { readLocalEvents, writeLocalEvents } from "../events/local-store";
import { readLocalSettings, writeLocalSettings } from "../settings/local-store";

type WorkspaceBackup = {
  format: "eventotron-workspace-backup";
  version: 1;
  exportedAt: string;
  data: {
    settings: Array<typeof suiteSettings.$inferSelect>;
    events: Array<typeof suiteEvents.$inferSelect>;
    appletStates: Array<typeof suiteAppletStates.$inferSelect>;
    foodotronMeals: Array<typeof foodotronMeals.$inferSelect>;
    tabletronEvents: Array<typeof tabletronEvents.$inferSelect>;
    mealTransfers: Array<typeof mealTransfers.$inferSelect>;
  };
};

function dbUnavailable(error: unknown) {
  const detail = error instanceof Error ? error.message : String(error);
  return detail.includes("cloudflare:");
}

function backupResponse(data: WorkspaceBackup["data"], source: string) {
  return Response.json({
    format: "eventotron-workspace-backup",
    version: 1,
    exportedAt: new Date().toISOString(),
    source,
    data,
  });
}

export async function GET() {
  try {
    const db = await getDb();
    const [
      settings,
      events,
      appletStates,
      meals,
      tableEvents,
      transfers,
    ] = await Promise.all([
      db.select().from(suiteSettings),
      db.select().from(suiteEvents),
      db.select().from(suiteAppletStates),
      db.select().from(foodotronMeals),
      db.select().from(tabletronEvents),
      db.select().from(mealTransfers),
    ]);
    return backupResponse(
      {
        settings,
        events,
        appletStates,
        foodotronMeals: meals,
        tabletronEvents: tableEvents,
        mealTransfers: transfers,
      },
      "database",
    );
  } catch (error) {
    if (!dbUnavailable(error)) {
      return Response.json(
        {
          error: "EventoTron could not export the workspace backup.",
          detail: error instanceof Error ? error.message : String(error),
        },
        { status: 500 },
      );
    }
    const localEvents = readLocalEvents();
    const localSettings = readLocalSettings();
    return backupResponse(
      {
        settings: localSettings ? [localSettings as typeof suiteSettings.$inferSelect] : [],
        events: localEvents.events.map((event) => ({
          ...event,
          payload: event,
          createdAt: localEvents.updatedAt ?? new Date().toISOString(),
          updatedAt: localEvents.updatedAt ?? new Date().toISOString(),
        })),
        appletStates: readAllLocalAppletStates() as Array<typeof suiteAppletStates.$inferSelect>,
        foodotronMeals: [],
        tabletronEvents: [],
        mealTransfers: [],
      },
      "local-dev",
    );
  }
}

async function restoreDatabase(backup: WorkspaceBackup) {
  const db = await getDb();
  const upserts: Array<Promise<unknown>> = [];

  for (const row of backup.data.settings ?? []) {
    upserts.push(
      db.insert(suiteSettings).values(row).onConflictDoUpdate({
        target: suiteSettings.id,
        set: row,
      }),
    );
  }
  for (const row of backup.data.events ?? []) {
    upserts.push(
      db.insert(suiteEvents).values(row).onConflictDoUpdate({
        target: suiteEvents.id,
        set: row,
      }),
    );
  }
  for (const row of backup.data.appletStates ?? []) {
    upserts.push(
      db.insert(suiteAppletStates).values(row).onConflictDoUpdate({
        target: suiteAppletStates.id,
        set: row,
      }),
    );
  }
  for (const row of backup.data.foodotronMeals ?? []) {
    upserts.push(
      db.insert(foodotronMeals).values(row).onConflictDoUpdate({
        target: foodotronMeals.id,
        set: row,
      }),
    );
  }
  for (const row of backup.data.tabletronEvents ?? []) {
    upserts.push(
      db.insert(tabletronEvents).values(row).onConflictDoUpdate({
        target: tabletronEvents.id,
        set: row,
      }),
    );
  }
  for (const row of backup.data.mealTransfers ?? []) {
    upserts.push(
      db.insert(mealTransfers).values(row).onConflictDoUpdate({
        target: mealTransfers.id,
        set: row,
      }),
    );
  }

  await Promise.all(upserts);
  for (const state of backup.data.appletStates ?? []) {
    await projectAppletState(
      db,
      state.eventId,
      state.appName,
      state.payload,
      state.updatedAt,
    );
  }
}

function restoreLocal(backup: WorkspaceBackup) {
  const settings = backup.data.settings?.[0];
  if (settings) writeLocalSettings(settings.payload);
  const events = backup.data.events?.map((row) => ({
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
  })) ?? [];
  if (events.length) {
    writeLocalEvents({
      events,
      selectedId: events[0].id,
      openIds: events.slice(0, 3).map((event) => event.id),
      calendarYear: Number(events[0].date.slice(0, 4)) || 2026,
      calendarMonth: Math.max(0, (Number(events[0].date.slice(5, 7)) || 8) - 1),
    });
  }
  for (const state of backup.data.appletStates ?? []) {
    writeLocalAppletState(state.eventId, state.appName, state.payload);
  }
}

export async function POST(request: Request) {
  const backup = (await request.json().catch(() => null)) as WorkspaceBackup | null;
  if (
    !backup ||
    backup.format !== "eventotron-workspace-backup" ||
    backup.version !== 1 ||
    !backup.data
  ) {
    return Response.json({ error: "Workspace backup file is not recognized." }, { status: 400 });
  }

  try {
    await restoreDatabase(backup);
    return Response.json({
      restored: true,
      source: "database",
      counts: {
        settings: backup.data.settings?.length ?? 0,
        events: backup.data.events?.length ?? 0,
        appletStates: backup.data.appletStates?.length ?? 0,
        foodotronMeals: backup.data.foodotronMeals?.length ?? 0,
        tabletronEvents: backup.data.tabletronEvents?.length ?? 0,
        mealTransfers: backup.data.mealTransfers?.length ?? 0,
      },
    });
  } catch (error) {
    if (!dbUnavailable(error)) {
      return Response.json(
        {
          error: "EventoTron could not restore the workspace backup.",
          detail: error instanceof Error ? error.message : String(error),
        },
        { status: 500 },
      );
    }
    restoreLocal(backup);
    return Response.json({ restored: true, source: "local-dev" });
  }
}
