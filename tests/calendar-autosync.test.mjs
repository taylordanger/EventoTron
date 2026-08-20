import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

/**
 * The calendar UI has always offered "SYNC every 5/15/30/60 MIN", and nothing
 * ever acted on it — there is no scheduler, no interval, and no cron trigger.
 * Feeds refreshed only when somebody pressed SYNC NOW.
 *
 * The workspace this was found in had both feeds set to 15 minutes and last
 * synced 15 days earlier, with no error recorded. Running the sync pulled in
 * 216 calendar entries the app had been missing, while the ticker and month
 * view presented the stale set as current.
 */

const page = () => readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

test("the sync interval offered in the UI is actually honoured", async () => {
  const source = await page();
  assert.match(source, /const runDueSyncs/, "nothing ever runs a due sync");
  assert.match(source, /source\.syncMinutes/, "the per-source interval is not consulted");
  assert.match(source, /source\.lastSynced/, "staleness is never measured");
  assert.match(source, /window\.setInterval\(\(\) => void runDueSyncs\(\), 60_000\)/, "due syncs never repeat");
});

test("a source is only synced once it is actually due", async () => {
  const source = await page();
  // Re-fetching a feed that was refreshed a minute ago costs an external call
  // and buys nothing.
  assert.match(source, /Date\.now\(\) - last >= everyMs/, "due-ness is not computed from the interval");
  assert.match(source, /if \(!last\) return true;/, "a never-synced feed is not treated as due");
  assert.match(source, /if \(syncing\[source\.id\] \|\| !isDue\(source\)\)/, "a sync already in flight could be repeated");
});

test("opening the app refreshes stale feeds even in a background tab", async () => {
  // Gating the opening pass on visibility means a tab that starts hidden never
  // syncs at all — which is the behaviour this replaced.
  const source = await page();
  assert.match(source, /void runDueSyncs\(false\)/, "the opening pass is gated on visibility");
  assert.match(source, /skipWhenHidden && document\.hidden/, "the repeating pass does not skip hidden tabs");
});

test("the sync effect re-runs once the calendar sources have loaded", async () => {
  // Settings load after mount. An effect that ran only on mount would find no
  // sources and then skip every later pass in a hidden tab, syncing nothing.
  const source = await page();
  assert.match(source, /const calendarSourceKey = useMemo\(/, "there is no stable key for the feed set");
  assert.match(source, /\}, \[calendarSourceKey\]\);/, "the sync effect is not keyed to the sources it needs");
});

test("feeds are refreshed one at a time", async () => {
  const source = await page();
  assert.match(source, /await sync\(source\);/, "sources are synced concurrently");
});

test("the interval survives the two stores disagreeing", async () => {
  // Calendar sources are persisted twice — in the settings payload and in the
  // calendar-sources table — and a sync advances the table while the settings
  // copy keeps its old timestamp. Measuring only against the settings copy
  // would make every feed look permanently overdue and re-sync forever.
  const source = await page();
  assert.match(source, /lastSyncAttemptRef/, "this session's own syncs are not remembered");
  assert.match(source, /Math\.max\(Number\.isFinite\(stored\) \? stored : 0, attempted\)/, "the more recent record is not used");
  assert.match(
    source,
    /lastSyncAttemptRef\.current\[source\.id\] = Date\.now\(\);\s*\n\s*\/\/ Sequential/,
    "the attempt is not recorded before the call, so a failing feed retries every pass",
  );
});
