import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

/**
 * The operations ticker polls from every open tab, on every page. It only ever
 * displays what is live, today, or next, but it used to fetch the entire
 * calendar table to do it — measured at ~1.05 MB and ~2,430 rows read per poll,
 * every 60 seconds, per tab. That was the single largest running cost in the
 * app, and it accrued whether or not anyone was using it.
 *
 * These tests hold the shape of the fix in place. They are structural rather
 * than behavioural: the route needs a real D1 binding, which the Node test
 * harness does not have.
 */

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("the calendar route can return a bounded window instead of the whole table", async () => {
  const route = await read("app/api/calendar-sources/route.ts");
  // Bounded reads must filter, order, and limit in SQL — not in JavaScript
  // after reading everything, which would still bill for every row.
  assert.match(route, /gte\(suiteCalendarEvents\.date/, "bounded read does not filter by date in SQL");
  assert.match(route, /orderBy\(asc\(suiteCalendarEvents\.date\)\)/, "bounded read is not ordered");
  assert.match(route, /\.limit\(limit\)/, "bounded read is not limited");
  assert.match(route, /MAX_UPCOMING_EVENTS/, "no ceiling on the requested limit");
  assert.match(
    route,
    /Math\.min\(requestedLimit, MAX_UPCOMING_EVENTS\)/,
    "a caller could request an unbounded limit",
  );
});

test("an unbounded request still returns the full calendar", async () => {
  // The month view legitimately needs every event; bounding is opt-in so that
  // page keeps working.
  const route = await read("app/api/calendar-sources/route.ts");
  assert.match(
    route,
    /:\s*db\.select\(\)\.from\(suiteCalendarEvents\)/,
    "the unbounded branch is gone, which would break the calendar month view",
  );
});

test("counts derived from the full table are omitted from a bounded read", async () => {
  // eventCount and importHistory cannot be computed from a partial set. They
  // are omitted rather than reported wrong.
  const route = await read("app/api/calendar-sources/route.ts");
  assert.match(route, /eventCount:\s*bounded\s*\n?\s*\?\s*undefined/, "eventCount is wrong when bounded");
  assert.match(route, /importHistory:\s*bounded\s*\n?\s*\?\s*\[\]/, "importHistory is wrong when bounded");
});

test("the ticker asks for a bounded window", async () => {
  const ticker = await read("app/OperationsTicker.tsx");
  assert.match(
    ticker,
    /\/api\/calendar-sources\?from=\$\{tickerWindowStart\(\)\}&limit=\$\{TICKER_EVENT_LIMIT\}/,
    "the ticker is fetching the whole calendar again",
  );
  assert.doesNotMatch(
    ticker,
    /fetch\("\/api\/calendar-sources"/,
    "the ticker still has an unbounded calendar fetch",
  );
});

test("the ticker stops polling while its tab is hidden", async () => {
  const ticker = await read("app/OperationsTicker.tsx");
  assert.match(ticker, /document\.hidden/, "hidden tabs still poll");
  assert.match(ticker, /visibilitychange/, "returning to the tab does not refresh");
  assert.match(
    ticker,
    /removeEventListener\("visibilitychange"/,
    "the visibility listener is never cleaned up",
  );
});

test("the ticker's first load is never skipped, even in a hidden tab", async () => {
  // Regression guard: gating the initial fetch on visibility makes a tab opened
  // in the background render "no active or upcoming events" — stating as fact
  // that the schedule is empty when it is not.
  const ticker = await read("app/OperationsTicker.tsx");
  const initial = ticker.indexOf("void refresh();\n    const timer = window.setInterval");
  assert.notEqual(
    initial,
    -1,
    "the initial load must call refresh() directly, not the visibility-gated wrapper",
  );
  assert.match(
    ticker,
    /const timer = window\.setInterval\(refreshIfVisible, 60_000\)/,
    "the repeating poll should be the gated one",
  );
});
