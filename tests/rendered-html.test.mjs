import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workerUrl = new URL("../dist/server/index.js", import.meta.url);
workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
const { default: worker } = await import(workerUrl.href);

const environment = {
  ASSETS: {
    fetch: async () => new Response("Not found", { status: 404 }),
  },
};

const executionContext = {
  waitUntil() {},
  passThroughOnException() {},
};

function request(path, init) {
  return worker.fetch(
    new Request(`http://localhost${path}`, init),
    environment,
    executionContext,
  );
}

async function jsonRequest(path, method, body) {
  return request(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("server-renders the EventoTron calendar and permanent suite navigation", async () => {
  const response = await request("/");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>EventoTron — Operations Suite<\/title>/);
  assert.match(html, /EVENTOTRON MAIN CALENDAR/);
  assert.match(html, /OPEN EVENT FILES/);
  assert.match(html, /Calendar/);
  assert.match(html, /Tabletron/);
  assert.match(html, /Foodotron/);
  assert.match(html, /Scheduluotron/);
  assert.match(html, /Settings/);
  assert.match(html, /MASTER REPORT/);
  assert.match(html, /OPS FEED/);
  assert.doesNotMatch(html, /Your site is taking shape|Starter Project/);
});

test("server-renders every applet beneath the shared suite origin", async () => {
  const routes = [
    ["/tabletron?event=rotary-aug-5", /TABLETRON/],
    ["/foodotron?event=rotary-aug-5", /FOODOTRON/],
    ["/scheduluotron?event=rotary-aug-5", /SCHEDULUOTRON/],
    ["/settings?event=rotary-aug-5", /SETTINGS/],
    ["/master-report?event=rotary-aug-5", /Preparing master report/],
  ];

  for (const [path, expected] of routes) {
    const response = await request(path);
    assert.equal(response.status, 200, `${path} should render`);
    assert.match(await response.text(), expected);
  }
});

test("API routes reject incomplete writes before touching storage", async () => {
  const checks = [
    ["/api/events", "PUT", {}, 400, /at least one event/i],
    ["/api/settings", "PUT", {}, 400, /requires a payload/i],
    ["/api/event-app-state", "PUT", { payload: {} }, 400, /requires an event ID/i],
    ["/api/event-app-state?eventId=test&app=unknown", "PUT", { payload: {} }, 400, /known app name/i],
    ["/api/event-bundle", "GET", undefined, 400, /requires an event ID/i],
    ["/api/event-records", "GET", undefined, 400, /require an event ID/i],
    ["/api/meal-transfers", "POST", {}, 400, /requires a meal/i],
    ["/api/workspace-backup", "POST", {}, 400, /not recognized/i],
    ["/api/workspace-backup", "POST", { format: "eventotron-workspace-backup", version: 2, exportedAt: new Date().toISOString(), data: { events: [{ title: "Missing ID" }] } }, 400, /not recognized/i],
    ["/api/calendar-sources", "POST", { url: "calendar.example.test" }, 400, /must begin with http/i],
    ["/api/calendar-sources", "PUT", { source: { name: "Missing ID" } }, 400, /connection is incomplete/i],
  ];

  for (const [path, method, body, status, message] of checks) {
    const response = body === undefined
      ? await request(path, { method })
      : await jsonRequest(path, method, body);
    assert.equal(response.status, status, `${method} ${path}`);
    const payload = await response.json();
    assert.match(String(payload.error), message);
  }
});

test("workspace backups can be reviewed before restore without writing data", async () => {
  const response = await jsonRequest("/api/workspace-backup?mode=validate", "POST", {
    format: "eventotron-workspace-backup",
    version: 2,
    exportedAt: "2026-08-04T12:00:00.000Z",
    source: "database",
    data: { events: [], eventAudit: [], calendarEvents: [] },
  });
  assert.equal(response.status, 200);
  const preview = await response.json();
  assert.equal(preview.valid, true);
  assert.equal(preview.counts.events, 0);
  assert.equal(preview.counts.eventAudit, 0);
  assert.equal(preview.counts.calendarEvents, 0);
});

test("production data contracts keep IDs, migrations, event ownership, and complete backups explicit", async () => {
  const [schema, transfers, chrome, projections, records, eventsRoute, eventHistoryRoute, eventConcurrency, liveTicker, operationsTicker, migration, calendarMigration, auditMigration, calendarRoute, backupRoute, database, homePage, masterReport, foodotron, tabletron, scheduluotron, styles, printMode, suiteSettings, settingsPage, roadmap, privateAlphaRunbook, readme] = await Promise.all([
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/meal-transfers/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/SuiteChrome.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/event-app-state/projections.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/event-records/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/events/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/event-history/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/event-concurrency.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/live-event-ticker.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/OperationsTicker.tsx", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0003_suite_integrity_indexes.sql", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0004_calendar_sync_records.sql", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0005_event_audit_history.sql", import.meta.url), "utf8"),
    readFile(new URL("../app/api/calendar-sources/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/workspace-backup/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/master-report/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/foodotron/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/tabletron/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/scheduluotron/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/print-mode.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/suite-settings.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/settings/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../docs/PRODUCTION_ROADMAP.md", import.meta.url), "utf8"),
    readFile(new URL("../docs/PRIVATE_ALPHA_RUNBOOK.md", import.meta.url), "utf8"),
    readFile(new URL("../README.md", import.meta.url), "utf8"),
  ]);

  assert.match(schema, /foodotronMeals[\s\S]*id: text\("id"\)\.primaryKey/);
  assert.match(schema, /tabletronEvents[\s\S]*id: text\("id"\)\.primaryKey/);
  assert.match(schema, /mealTransfers[\s\S]*foodotronMealId/);
  assert.match(transfers, /shortId\("xfer"\)/);
  assert.match(transfers, /\/tabletron\/import\/\$\{transferId\}/);
  assert.doesNotMatch(transfers, /encodeURIComponent\(JSON\.stringify/);
  assert.match(chrome, /eventTabHref\(tab\.href, eventId\)/);
  assert.match(projections, /projectTabletron/);
  assert.match(projections, /projectFoodotron/);
  assert.match(projections, /projectScheduluotron/);
  assert.match(records, /suiteShoppingItems/);
  assert.match(records, /suiteScheduleItems/);
  assert.match(records, /suiteLayoutItems/);
  assert.match(schema, /suiteSchemaMigrations/);
  assert.match(schema, /suiteCalendarEvents/);
  assert.match(schema, /suiteEventAudit/);
  assert.match(schema, /uniqueIndex\("idx_suite_applet_states_event_app"\)/);
  assert.match(projections, /removeEventProjections/);
  assert.match(eventsRoute, /removeEventProjections\(db, id\)/);
  assert.match(migration, /CREATE TABLE `suite_schema_migrations`/);
  assert.match(migration, /CREATE UNIQUE INDEX `idx_suite_applet_states_event_app`/);
  assert.match(migration, /'0003_suite_integrity_indexes'/);
  assert.match(calendarMigration, /CREATE TABLE `suite_calendar_events`/);
  assert.match(calendarMigration, /CREATE UNIQUE INDEX `idx_suite_calendar_events_source_external`/);
  assert.match(auditMigration, /CREATE TABLE `suite_event_audit`/);
  assert.match(auditMigration, /idx_suite_event_audit_event_created/);
  assert.match(calendarRoute, /permanentCalendarEventId/);
  assert.match(calendarRoute, /expandRecurringEvent/);
  assert.match(calendarRoute, /maxRecurringOccurrences/);
  assert.match(calendarRoute, /#\$\{dateKey\}-\$\{index\}/);
  assert.match(calendarRoute, /export async function GET/);
  assert.match(calendarRoute, /export async function PUT/);
  assert.match(calendarRoute, /export async function DELETE/);
  assert.match(calendarRoute, /extractGoogleCalendarIds/);
  assert.match(calendarRoute, /googleCalendarFeedUrl/);
  assert.match(calendarRoute, /function importSummaryForSource/);
  assert.match(calendarRoute, /importHistory/);
  assert.match(database, /EXPECTED_SCHEMA_MIGRATION = "0005_event_audit_history"/);
  for (const table of ["eventAudit", "rooms", "roomLayouts", "layoutItems", "recipes", "shoppingItems", "scheduleItems", "calendarSources", "calendarEvents"]) {
    assert.match(backupRoute, new RegExp(`\\b${table}\\b`), `backup should include ${table}`);
  }
  assert.match(backupRoute, /BACKUP_VERSION = 2/);
  assert.match(backupRoute, /validateBackup/);
  assert.match(backupRoute, /searchParams\.get\("mode"\) === "validate"/);
  assert.match(backupRoute, /function backupPreview/);
  for (const reportSource of [masterReport, foodotron, tabletron, scheduluotron]) {
    assert.match(reportSource, /SHEPPARD SEMICONDUCTOR SYSTEMS/);
  }
  assert.match(foodotron, /onClick=\{printMeal\}>PRINT SHOPPING PLAN/);
  assert.doesNotMatch(foodotron, /PRINT SHOPPING PLAN<\/button>[\s\S]{0,80}window\.print/);
  assert.match(styles, /Final printable report system/);
  assert.match(styles, /suite-frame:has\(\.meal-report\)/);
  assert.match(styles, /suite-frame:has\(\.operations-report\)/);
  assert.match(styles, /suite-frame:has\(\.sched-print-report\)/);
  assert.match(styles, /eventotron-printing/);
  assert.match(printMode, /classList\.add\("eventotron-printing"\)/);
  assert.match(printMode, /window\.print\(\)/);
  assert.match(printMode, /export function saveReportPdf/);
  assert.match(suiteSettings, /operationsTemplates/);
  assert.match(suiteSettings, /extractGoogleCalendarIds/);
  assert.match(suiteSettings, /googleCalendarFeedUrl/);
  assert.match(suiteSettings, /template_rotary_luncheon/);
  assert.match(suiteSettings, /template_concert_hospitality/);
  assert.match(suiteSettings, /template_market_mod/);
  assert.match(suiteSettings, /template_maintenance_ticker/);
  assert.match(suiteSettings, /room_auditorium_stage/);
  assert.match(suiteSettings, /96 at tables \/ 160 theatre \/ 200 standing/);
  assert.match(suiteSettings, /Setup and teardown \$175; cleaning \$175/);
  assert.match(suiteSettings, /Margaret's Meeting Room/);
  assert.match(suiteSettings, /Elizabethan Room/);
  assert.match(suiteSettings, /Dance Studio/);
  assert.match(suiteSettings, /Compostable products only; no Styrofoam/);
  assert.match(suiteSettings, /features: room\.features \?\? fallback\.features/);
  assert.match(suiteSettings, /5 FT ROUND TABLE - 12 available/);
  assert.match(suiteSettings, /Facility rental rates and policies/);
  assert.match(suiteSettings, /Event insurance is required/);
  assert.match(suiteSettings, /preset/);
  assert.match(suiteSettings, /scheduleBlocks/);
  assert.match(suiteSettings, /11:30 AM-1:00 PM/);
  assert.match(suiteSettings, /template\.preset \?\? fallback\.preset/);
  assert.match(homePage, /template\.preset\?\.event/);
  assert.match(homePage, /selectedTemplate/);
  assert.match(homePage, /OPERATIONS PRESET ACTIVE/);
  assert.match(styles, /sheet-template-summary/);
  assert.match(scheduluotron, /templateScheduleBlocks/);
  assert.match(scheduluotron, /context\.operationsTemplateId/);
  assert.match(masterReport, /findRoomReference/);
  assert.match(masterReport, /Facility Reference/);
  assert.match(masterReport, /RENTAL NOTES/);
  assert.match(masterReport, /Operations Playbook/);
  assert.match(masterReport, /report\.operationsTemplate/);
  assert.match(masterReport, /Preset Schedule Blocks/);
  assert.match(styles, /report-room-reference/);
  assert.match(styles, /report-playbook-hero/);
  assert.match(tabletron, /parseFurnitureDimensions/);
  assert.match(tabletron, /upper\.includes\("ROUND"\)/);
  assert.match(tabletron, /inchMatch/);
  assert.match(tabletron, /normalizedTabletronRoomName/);
  assert.match(tabletron, /operationsTemplate\?\.preset\?\.event/);
  assert.match(tabletron, /timeRangeParts/);
  assert.match(tabletron, /seedLayoutObjects/);
  assert.match(tabletron, /shouldAutoPlaceTemplate/);
  assert.match(settingsPage, /Operations Library/);
  assert.match(settingsPage, /Reusable binder material/);
  assert.match(settingsPage, /updateOperationsTemplate/);
  assert.match(settingsPage, /updateTemplatePresetEvent/);
  assert.match(settingsPage, /formatTemplateScheduleBlocks/);
  assert.match(settingsPage, /Schedule preset blocks/);
  assert.match(styles, /template-preset-editor/);
  assert.match(settingsPage, /Launch Readiness/);
  assert.match(settingsPage, /Private Alpha/);
  assert.match(settingsPage, /runAlphaCheck/);
  assert.match(settingsPage, /EXPORT CHECKPOINT/);
  assert.match(settingsPage, /Local event suite/);
  assert.match(settingsPage, /importGoogleCalendarLink/);
  assert.match(settingsPage, /Paste Google Calendar link/);
  assert.match(settingsPage, /CalendarImportSummary/);
  assert.match(settingsPage, /Recent imported events/);
  assert.match(styles, /calendar-import-history/);
  assert.match(homePage, /operationsTemplateId/);
  assert.match(homePage, /applyOperationsTemplate/);
  assert.match(homePage, /operationsTemplatePatch/);
  assert.match(homePage, /importGoogleCalendarLink/);
  assert.match(homePage, /Paste Google Calendar link/);
  assert.match(homePage, /START FROM/);
  assert.match(homePage, /Operations Template/);
  assert.match(homePage, /convertCalendarEvent/);
  assert.match(homePage, /calendarEventId/);
  assert.match(homePage, /\+ EVENT FILE/);
  assert.match(eventsRoute, /calendarSourceName/);
  assert.match(eventsRoute, /eventColumns/);
  assert.match(eventsRoute, /event_revision_conflict/);
  assert.match(eventsRoute, /expectedUpdatedAt/);
  assert.match(eventsRoute, /recordEventAudit/);
  assert.match(eventsRoute, /cf-access-authenticated-user-email/);
  assert.match(eventsRoute, /existing \? "updated" : "created"/);
  assert.match(eventsRoute, /"deleted"/);
  assert.match(eventHistoryRoute, /suiteEventAudit/);
  assert.match(eventHistoryRoute, /eventId: eventId \|\| null/);
  assert.match(eventHistoryRoute, /Cache-Control/);
  assert.match(eventConcurrency, /mergeConcurrentEvent/);
  assert.match(eventConcurrency, /conflictFields/);
  assert.match(liveTicker, /selectLiveTickerItems/);
  assert.match(liveTicker, /wallClockMinute/);
  assert.match(operationsTicker, /selectLiveTickerItems/);
  assert.match(operationsTicker, /live-operations-ticker/);
  assert.match(homePage, /DELETE EVENT/);
  assert.match(homePage, /method: "DELETE"/);
  assert.match(homePage, /PLANNING EVENT FILE/);
  assert.match(scheduluotron, /PLANNING EVENT/);
  assert.match(tabletron, /PLANNING PROJECT/);
  assert.match(settingsPage, /Event Activity/);
  assert.match(settingsPage, /\/api\/event-history\?limit=30/);
  assert.match(settingsPage, /AUDIT ENTRIES/);
  assert.match(settingsPage, /Review Workspace Backup/);
  assert.match(settingsPage, /workspace-backup\?mode=validate/);
  assert.match(settingsPage, /RESTORE REVIEWED BACKUP/);
  assert.match(settingsPage, /BACKUP_CHECKPOINT_KEY/);
  assert.match(settingsPage, /Backup And Recovery/);
  assert.match(settingsPage, /RECOVERY READINESS/);
  assert.match(settingsPage, /REVIEW RESTORE FILE/);
  assert.match(operationsTicker, /LIVE NOW/);
  assert.match(operationsTicker, /\/api\/events/);
  assert.match(operationsTicker, /\/api\/calendar-sources/);
  for (const suitePage of [homePage, foodotron, tabletron, scheduluotron, settingsPage]) {
    assert.match(suitePage, /OperationsTicker/);
  }
  assert.match(styles, /live-ticker-roll/);
  assert.match(styles, /prefers-reduced-motion/);
  assert.match(homePage, /persistEvent/);
  assert.match(homePage, /CONFLICT -/);
  assert.match(backupRoute, /selectedId: ""/);
  assert.match(backupRoute, /openIds: \[\]/);
  assert.match(styles, /operations-template-list/);
  assert.match(styles, /launch-readiness-list/);
  assert.match(styles, /settings-alpha-card/);
  assert.match(styles, /alpha-readiness-grid/);
  assert.match(styles, /new-event-template/);
  assert.match(styles, /calendar-import-box/);
  assert.match(styles, /backup-review-panel/);
  assert.match(styles, /backup-status-banner/);
  assert.match(styles, /backup-checkpoint-grid/);
  assert.match(roadmap, /Phase 1: Local Pilot/);
  assert.match(roadmap, /Settings > Private Alpha/);
  assert.match(roadmap, /Phase 4: Desktop App/);
  assert.match(roadmap, /80 percent ready for a local pilot/);
  assert.match(privateAlphaRunbook, /one operator using EventoTron locally with real events/);
  assert.match(privateAlphaRunbook, /Export Checkpoint/);
  assert.match(privateAlphaRunbook, /Recovery Drill/);
  assert.match(readme, /Private Alpha/);
  assert.match(readme, /PRIVATE_ALPHA_RUNBOOK\.md/);
  assert.match(readme, /PRODUCTION_ROADMAP\.md/);
  assert.match(masterReport, /printReport\(`?\$\{event\.title\} Master Report/);
  assert.match(foodotron, /printReport\(`\$\{meal\.name\} Foodotron Shopping Report/);
  assert.match(tabletron, /printing-report/);
  assert.match(scheduluotron, /printReport\(`\$\{plan\.eventName\} Scheduluotron Day Sheet/);
  for (const reportSource of [masterReport, foodotron, tabletron, scheduluotron]) {
    assert.match(reportSource, /saveReportPdf/);
    assert.match(reportSource, /SAVE PDF/);
  }
});

test("print report contracts keep report previews and print mode aligned", async () => {
  const [styles, printMode, masterReport, foodotron, tabletron, scheduluotron] = await Promise.all([
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/print-mode.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/master-report/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/foodotron/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/tabletron/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/scheduluotron/page.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(printMode, /eventotron-printing/);
  assert.match(printMode, /afterReportPaint/);
  assert.match(printMode, /requestAnimationFrame/);
  assert.match(printMode, /window\.setTimeout\(callback, 120\)/);
  assert.match(printMode, /classList\.remove\("eventotron-printing"\)/);
  assert.match(printMode, /reportDocumentTitle/);
  assert.match(printMode, /document\.title = reportDocumentTitle\(title\)/);
  assert.match(printMode, /document\.title = originalTitle/);
  assert.match(printMode, /saveReportPdf\(title\?: string\) \{\n  printReport\(title\);/);

  for (const source of [masterReport, foodotron, tabletron, scheduluotron]) {
    assert.match(source, /printReport/);
    assert.match(source, /saveReportPdf/);
    assert.match(source, /SHEPPARD SEMICONDUCTOR SYSTEMS/);
  }

  assert.match(styles, /width: min\(1050px, calc\(100vw - 52px\)\) !important/);
  assert.match(styles, /html\.eventotron-printing \.suite-frame > \.suite-chrome/);
  assert.match(styles, /html\.eventotron-printing \.foodotron-applet\.app-shell > \.workspace/);
  assert.match(styles, /html\.eventotron-printing \.tabletron-applet\.printing-report\.app-shell > \.workspace/);
  assert.match(styles, /html\.eventotron-printing \.scheduluotron-app > \.sched-workspace/);
  assert.match(styles, /break-inside: avoid/);
  assert.match(foodotron, /disabled=\{!meal\} onClick=\{printMeal\}/);
  assert.match(foodotron, /meal\.name\} Foodotron Shopping Report/);
  assert.match(masterReport, /event\.title\} Master Report/);
  assert.match(tabletron, /event\.name\} Tabletron Operations Report/);
  assert.match(scheduluotron, /plan\.eventName\} Scheduluotron Day Sheet/);
  assert.match(tabletron, /EXPORT SETUP SHEET/);
  assert.match(tabletron, /window\.print\(\)/);
});
