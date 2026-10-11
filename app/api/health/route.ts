import { asc, count } from "drizzle-orm";
import { EXPECTED_SCHEMA_MIGRATION, getDb } from "@/db";
import { RELEASE } from "../../release";
import { recordDiagnostic } from "../_lib/diagnostics";
import {
  foodotronMeals,
  mealTransfers,
  suiteAppletStates,
  suiteCalendarEvents,
  suiteEventAudit,
  suiteEvents,
  suiteScheduleItems,
  suiteSchemaMigrations,
  suiteSettings,
  suiteCalendarSources,
  suiteUsers,
  suiteCalendarOAuthAccounts,
  tabletronEvents,
} from "@/db/schema";

export async function GET() {
  const startedAt = Date.now();
  try {
    const db = await getDb();
    const [
      migrations,
      eventRows,
      eventAuditRows,
      appletRows,
      mealRows,
      tabletronRows,
      scheduleRows,
      transferRows,
      calendarRows,
      settingsRows,
      sourceRows,
      userRows,
      oauthRows,
      appletCoverage,
    ] = await Promise.all([
      db.select().from(suiteSchemaMigrations).orderBy(asc(suiteSchemaMigrations.id)),
      db.select({ value: count() }).from(suiteEvents),
      db.select({ value: count() }).from(suiteEventAudit),
      db.select({ value: count() }).from(suiteAppletStates),
      db.select({ value: count() }).from(foodotronMeals),
      db.select({ value: count() }).from(tabletronEvents),
      db.select({ value: count() }).from(suiteScheduleItems),
      db.select({ value: count() }).from(mealTransfers),
      db.select({ value: count() }).from(suiteCalendarEvents),
      db.select({ value: count() }).from(suiteSettings),
      db.select({ value: count() }).from(suiteCalendarSources),
      db.select({ value: count() }).from(suiteUsers),
      db.select({ value: count() }).from(suiteCalendarOAuthAccounts),
      db.select({ appName: suiteAppletStates.appName, value: count() }).from(suiteAppletStates).groupBy(suiteAppletStates.appName),
    ]);
    const applied = migrations.map((migration) => migration.id);
    const schemaReady = applied.includes(EXPECTED_SCHEMA_MIGRATION);
    const payload = {
      status: schemaReady ? "ready" : "migration-required",
      service: "eventotron",
      scope: "backend",
      version: RELEASE,
      checkedAt: new Date().toISOString(),
      latencyMs: Date.now() - startedAt,
      database: "connected",
      applets: Object.fromEntries(appletCoverage.map((row) => [row.appName, row.value])),
      schema: {
        expected: EXPECTED_SCHEMA_MIGRATION,
        current: applied.at(-1) ?? null,
        applied,
      },
      records: {
        events: eventRows[0]?.value ?? 0,
        eventAudit: eventAuditRows[0]?.value ?? 0,
        appletStates: appletRows[0]?.value ?? 0,
        foodotronMeals: mealRows[0]?.value ?? 0,
        tabletronEvents: tabletronRows[0]?.value ?? 0,
        scheduleItems: scheduleRows[0]?.value ?? 0,
        transfers: transferRows[0]?.value ?? 0,
        calendarEvents: calendarRows[0]?.value ?? 0,
        settings: settingsRows[0]?.value ?? 0,
        calendarSources: sourceRows[0]?.value ?? 0,
        users: userRows[0]?.value ?? 0,
        oauthAccounts: oauthRows[0]?.value ?? 0,
      },
    };
    return Response.json(payload, {
      status: schemaReady ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    const logged = await recordDiagnostic({ code: "request-failed", app: "system", route: "/api/health", release: RELEASE, status: 503, durationMs: Date.now() - startedAt }, "system").catch(() => null);
    return Response.json(
      {
        status: "unavailable",
        service: "eventotron",
        version: RELEASE,
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
      { status: 503, headers: { "Cache-Control": "no-store", ...(logged ? { "x-eventotron-error-ref": logged.id } : {}) } },
    );
  }
}
