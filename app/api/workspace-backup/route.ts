import { getDb } from "@/db";
import { withRole } from "../_lib/auth";
import { validSupportBackupRow } from "../../support-data";
import {
  foodotronMeals,
  mealTransfers,
  suiteAppletStates,
  suiteCalendarEvents,
  suiteCalendarSources,
  suiteEventAudit,
  suiteEvents,
  suiteLayoutItems,
  suiteRecipes,
  suiteRoomLayouts,
  suiteRooms,
  suiteScheduleItems,
  suiteSettings,
  supportTickets,
  suiteShoppingItems,
  tabletronEvents,
} from "@/db/schema";
import { readAllLocalAppletStates, writeLocalAppletState } from "../event-app-state/local-store";
import { projectAppletState } from "../event-app-state/projections";
import { readLocalEvents, writeLocalEvents } from "../events/local-store";
import { readLocalSettings, writeLocalSettings } from "../settings/local-store";

const BACKUP_VERSION = 3 as const;

type BackupData = {
  supportTickets?: Array<typeof supportTickets.$inferSelect>;
  settings?: Array<typeof suiteSettings.$inferSelect>;
  events?: Array<typeof suiteEvents.$inferSelect>;
  eventAudit?: Array<typeof suiteEventAudit.$inferSelect>;
  appletStates?: Array<typeof suiteAppletStates.$inferSelect>;
  rooms?: Array<typeof suiteRooms.$inferSelect>;
  roomLayouts?: Array<typeof suiteRoomLayouts.$inferSelect>;
  layoutItems?: Array<typeof suiteLayoutItems.$inferSelect>;
  foodotronMeals?: Array<typeof foodotronMeals.$inferSelect>;
  recipes?: Array<typeof suiteRecipes.$inferSelect>;
  shoppingItems?: Array<typeof suiteShoppingItems.$inferSelect>;
  tabletronEvents?: Array<typeof tabletronEvents.$inferSelect>;
  scheduleItems?: Array<typeof suiteScheduleItems.$inferSelect>;
  calendarSources?: Array<typeof suiteCalendarSources.$inferSelect>;
  calendarEvents?: Array<typeof suiteCalendarEvents.$inferSelect>;
  mealTransfers?: Array<typeof mealTransfers.$inferSelect>;
};

type WorkspaceBackup = {
  format: "eventotron-workspace-backup";
  version: 1 | 2 | typeof BACKUP_VERSION;
  exportedAt: string;
  source?: string;
  counts?: Record<string, number>;
  data: BackupData;
};

const backupKeys = [
  "supportTickets",
  "settings",
  "events",
  "eventAudit",
  "appletStates",
  "rooms",
  "roomLayouts",
  "layoutItems",
  "foodotronMeals",
  "recipes",
  "shoppingItems",
  "tabletronEvents",
  "scheduleItems",
  "calendarSources",
  "calendarEvents",
  "mealTransfers",
] as const satisfies ReadonlyArray<keyof BackupData>;

function dbUnavailable(error: unknown) {
  const detail = error instanceof Error ? error.message : String(error);
  return detail.includes("cloudflare:");
}

function backupCounts(data: BackupData) {
  return Object.fromEntries(backupKeys.map((key) => [key, data[key]?.length ?? 0]));
}

function backupResponse(data: BackupData, source: string) {
  return Response.json({
    format: "eventotron-workspace-backup",
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    source,
    counts: backupCounts(data),
    data,
  });
}

function backupPreview(backup: WorkspaceBackup) {
  return {
    valid: true,
    format: backup.format,
    version: backup.version,
    exportedAt: backup.exportedAt,
    source: backup.source ?? "unknown",
    counts: backupCounts(backup.data),
  };
}

function validateBackup(value: unknown): WorkspaceBackup | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const backup = value as Partial<WorkspaceBackup>;
  if (
    backup.format !== "eventotron-workspace-backup" ||
    (backup.version !== 1 && backup.version !== 2 && backup.version !== BACKUP_VERSION) ||
    !backup.data ||
    typeof backup.data !== "object" ||
    Array.isArray(backup.data)
  ) return null;

  for (const key of backupKeys) {
    const rows = backup.data[key];
    if (rows === undefined) continue;
    if (!Array.isArray(rows)) return null;
    if (rows.some((row) => !row || typeof row !== "object" || Array.isArray(row) || !("id" in row) || typeof row.id !== "string" || !row.id.trim())) {
      return null;
    }
  }
  if (backup.data.supportTickets?.some(row => !validSupportBackupRow(row))) return null;
  return backup as WorkspaceBackup;
}

export const GET = withRole("admin", async () => {
  try {
    const db = await getDb();
    // One D1 batch reads snapshots and derived records together.
    const [
      settings,
      events,
      eventAudit,
      appletStates,
      rooms,
      roomLayouts,
      layoutItems,
      meals,
      recipes,
      shoppingItems,
      tableEvents,
      scheduleItems,
      calendarSources,
      calendarEvents,
      transfers,
      tickets,
    ] = await db.batch([
      db.select().from(suiteSettings),
      db.select().from(suiteEvents),
      db.select().from(suiteEventAudit),
      db.select().from(suiteAppletStates),
      db.select().from(suiteRooms),
      db.select().from(suiteRoomLayouts),
      db.select().from(suiteLayoutItems),
      db.select().from(foodotronMeals),
      db.select().from(suiteRecipes),
      db.select().from(suiteShoppingItems),
      db.select().from(tabletronEvents),
      db.select().from(suiteScheduleItems),
      db.select().from(suiteCalendarSources),
      db.select().from(suiteCalendarEvents),
      db.select().from(mealTransfers),
      db.select().from(supportTickets),
    ]);
    return backupResponse(
      {
        settings,
        events,
        eventAudit,
        appletStates,
        rooms,
        roomLayouts,
        layoutItems,
        foodotronMeals: meals,
        recipes,
        shoppingItems,
        tabletronEvents: tableEvents,
        scheduleItems,
        calendarSources,
        calendarEvents,
        mealTransfers: transfers,
        supportTickets: tickets,
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
        eventAudit: [],
        appletStates: readAllLocalAppletStates() as Array<typeof suiteAppletStates.$inferSelect>,
        rooms: [],
        roomLayouts: [],
        layoutItems: [],
        foodotronMeals: [],
        recipes: [],
        shoppingItems: [],
        tabletronEvents: [],
        scheduleItems: [],
        calendarSources: [],
        calendarEvents: [],
        mealTransfers: [],
      },
      "local-dev",
    );
  }
});

async function restoreDatabase(backup: WorkspaceBackup) {
  const db = await getDb();
  const upserts: Array<Promise<unknown>> = [];
  for (const row of backup.data.supportTickets ?? []) {
    upserts.push(db.insert(supportTickets).values(row).onConflictDoUpdate({ target: supportTickets.id, set: row }));
  }

  for (const row of backup.data.settings ?? []) {
    upserts.push(db.insert(suiteSettings).values(row).onConflictDoUpdate({ target: suiteSettings.id, set: row }));
  }
  for (const row of backup.data.events ?? []) {
    upserts.push(db.insert(suiteEvents).values(row).onConflictDoUpdate({ target: suiteEvents.id, set: row }));
  }
  for (const row of backup.data.eventAudit ?? []) {
    upserts.push(db.insert(suiteEventAudit).values(row).onConflictDoUpdate({ target: suiteEventAudit.id, set: row }));
  }
  for (const row of backup.data.rooms ?? []) {
    upserts.push(db.insert(suiteRooms).values(row).onConflictDoUpdate({ target: suiteRooms.id, set: row }));
  }
  for (const row of backup.data.roomLayouts ?? []) {
    upserts.push(db.insert(suiteRoomLayouts).values(row).onConflictDoUpdate({ target: suiteRoomLayouts.id, set: row }));
  }
  for (const row of backup.data.layoutItems ?? []) {
    upserts.push(db.insert(suiteLayoutItems).values(row).onConflictDoUpdate({ target: suiteLayoutItems.id, set: row }));
  }
  for (const row of backup.data.foodotronMeals ?? []) {
    upserts.push(db.insert(foodotronMeals).values(row).onConflictDoUpdate({ target: foodotronMeals.id, set: row }));
  }
  for (const row of backup.data.recipes ?? []) {
    upserts.push(db.insert(suiteRecipes).values(row).onConflictDoUpdate({ target: suiteRecipes.id, set: row }));
  }
  for (const row of backup.data.shoppingItems ?? []) {
    upserts.push(db.insert(suiteShoppingItems).values(row).onConflictDoUpdate({ target: suiteShoppingItems.id, set: row }));
  }
  for (const row of backup.data.tabletronEvents ?? []) {
    upserts.push(db.insert(tabletronEvents).values(row).onConflictDoUpdate({ target: tabletronEvents.id, set: row }));
  }
  for (const row of backup.data.scheduleItems ?? []) {
    upserts.push(db.insert(suiteScheduleItems).values(row).onConflictDoUpdate({ target: suiteScheduleItems.id, set: row }));
  }
  for (const row of backup.data.calendarSources ?? []) {
    upserts.push(db.insert(suiteCalendarSources).values(row).onConflictDoUpdate({ target: suiteCalendarSources.id, set: row }));
  }
  for (const row of backup.data.calendarEvents ?? []) {
    upserts.push(db.insert(suiteCalendarEvents).values(row).onConflictDoUpdate({ target: suiteCalendarEvents.id, set: row }));
  }
  for (const row of backup.data.appletStates ?? []) {
    upserts.push(db.insert(suiteAppletStates).values(row).onConflictDoUpdate({ target: suiteAppletStates.id, set: row }));
  }
  for (const row of backup.data.mealTransfers ?? []) {
    upserts.push(db.insert(mealTransfers).values(row).onConflictDoUpdate({ target: mealTransfers.id, set: row }));
  }

  await Promise.all(upserts);
  if (backup.version === 1) {
    for (const state of backup.data.appletStates ?? []) {
      await projectAppletState(db, state.eventId, state.appName, state.payload, state.updatedAt);
    }
  }
}

function restoreLocal(backup: WorkspaceBackup) {
  const settings = backup.data.settings?.[0];
  if (settings) writeLocalSettings(settings.payload);
  const events = backup.data.events?.map((row) => ({
    ...(row.payload && typeof row.payload === "object" ? row.payload : {}),
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
      selectedId: "",
      openIds: [],
      calendarYear: Number(events[0].date.slice(0, 4)) || 2026,
      calendarMonth: Math.max(0, (Number(events[0].date.slice(5, 7)) || 8) - 1),
    });
  }
  for (const state of backup.data.appletStates ?? []) {
    writeLocalAppletState(state.eventId, state.appName, state.payload);
  }
}

export const POST = withRole("admin", async (request: Request) => {
  const backup = validateBackup(await request.json().catch(() => null));
  if (!backup) {
    return Response.json({ error: "Workspace backup file is not recognized." }, { status: 400 });
  }

  if (new URL(request.url).searchParams.get("mode") === "validate") {
    return Response.json(backupPreview(backup), {
      headers: { "Cache-Control": "no-store" },
    });
  }

  try {
    await restoreDatabase(backup);
    return Response.json({
      restored: true,
      source: "database",
      backupVersion: backup.version,
      counts: backupCounts(backup.data),
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
    return Response.json({
      restored: true,
      source: "local-dev",
      backupVersion: backup.version,
      counts: backupCounts(backup.data),
    });
  }
});
