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
    ["/api/calendar-sources", "POST", { url: "calendar.example.test" }, 400, /must begin with http/i],
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

test("production data contracts keep IDs, migrations, and event ownership explicit", async () => {
  const [schema, transfers, chrome, projections, records, eventsRoute, migration] = await Promise.all([
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/meal-transfers/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/SuiteChrome.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/event-app-state/projections.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/event-records/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/events/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0003_suite_integrity_indexes.sql", import.meta.url), "utf8"),
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
  assert.match(schema, /uniqueIndex\("idx_suite_applet_states_event_app"\)/);
  assert.match(projections, /removeEventProjections/);
  assert.match(eventsRoute, /removeEventProjections\(db, id\)/);
  assert.match(migration, /CREATE TABLE `suite_schema_migrations`/);
  assert.match(migration, /CREATE UNIQUE INDEX `idx_suite_applet_states_event_app`/);
  assert.match(migration, /'0003_suite_integrity_indexes'/);
});
