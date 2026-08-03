import { asc, count } from "drizzle-orm";
import { EXPECTED_SCHEMA_MIGRATION, getDb } from "@/db";
import {
  foodotronMeals,
  mealTransfers,
  suiteAppletStates,
  suiteCalendarEvents,
  suiteEvents,
  suiteScheduleItems,
  suiteSchemaMigrations,
  suiteSettings,
  tabletronEvents,
} from "@/db/schema";

export async function GET() {
  const startedAt = Date.now();
  try {
    const db = await getDb();
    const [
      migrations,
      eventRows,
      appletRows,
      mealRows,
      tabletronRows,
      scheduleRows,
      transferRows,
      calendarRows,
      settingsRows,
    ] = await Promise.all([
      db.select().from(suiteSchemaMigrations).orderBy(asc(suiteSchemaMigrations.id)),
      db.select({ value: count() }).from(suiteEvents),
      db.select({ value: count() }).from(suiteAppletStates),
      db.select({ value: count() }).from(foodotronMeals),
      db.select({ value: count() }).from(tabletronEvents),
      db.select({ value: count() }).from(suiteScheduleItems),
      db.select({ value: count() }).from(mealTransfers),
      db.select({ value: count() }).from(suiteCalendarEvents),
      db.select({ value: count() }).from(suiteSettings),
    ]);
    const applied = migrations.map((migration) => migration.id);
    const schemaReady = applied.includes(EXPECTED_SCHEMA_MIGRATION);
    const payload = {
      status: schemaReady ? "ready" : "migration-required",
      service: "eventotron",
      version: "0.1.0",
      checkedAt: new Date().toISOString(),
      latencyMs: Date.now() - startedAt,
      database: "connected",
      schema: {
        expected: EXPECTED_SCHEMA_MIGRATION,
        current: applied.at(-1) ?? null,
        applied,
      },
      records: {
        events: eventRows[0]?.value ?? 0,
        appletStates: appletRows[0]?.value ?? 0,
        foodotronMeals: mealRows[0]?.value ?? 0,
        tabletronEvents: tabletronRows[0]?.value ?? 0,
        scheduleItems: scheduleRows[0]?.value ?? 0,
        transfers: transferRows[0]?.value ?? 0,
        calendarEvents: calendarRows[0]?.value ?? 0,
        settings: settingsRows[0]?.value ?? 0,
      },
    };
    return Response.json(payload, {
      status: schemaReady ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json(
      {
        status: "unavailable",
        service: "eventotron",
        version: "0.1.0",
        checkedAt: new Date().toISOString(),
        latencyMs: Date.now() - startedAt,
        database: "unavailable",
        schema: {
          expected: EXPECTED_SCHEMA_MIGRATION,
          current: null,
          applied: [],
        },
        records: null,
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
