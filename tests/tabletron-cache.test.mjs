import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { legacyProjectIsStandalone, tabletronCacheKey } from "../app/tabletron/project-cache.ts";

test("event caches cannot overwrite or reopen the standalone project", () => {
  assert.notEqual(tabletronCacheKey("pat-dunne"), tabletronCacheKey());
  assert.notEqual(tabletronCacheKey("pat-dunne"), tabletronCacheKey("another-event"));
  assert.equal(tabletronCacheKey(null), tabletronCacheKey(""));
});

test("legacy linked events are not restored as standalone work; unrelated local plans remain usable", () => {
  assert.equal(legacyProjectIsStandalone({ events: [{ id: "pat-dunne" }] }, ["pat-dunne"]), false);
  assert.equal(legacyProjectIsStandalone({ events: [{ id: "local-project" }] }, ["pat-dunne"]), true);
  assert.equal(legacyProjectIsStandalone({ events: [] }, ["pat-dunne"]), true);
  assert.equal(legacyProjectIsStandalone(null, []), false);
});

test("explicit Tabletron event stays in the URL and changes remount the editor", async () => {
  const source = await readFile(new URL("../app/tabletron/page.tsx", import.meta.url), "utf8");
  assert.match(source, /<TabletronEditor key=\{eventId \|\| "standalone"\}/);
  const branch = source.slice(source.indexOf("} else if (\n          linkedEventId"), source.indexOf("if (linkedContext)"));
  assert.doesNotMatch(branch, /history\.replaceState/);
});

test("Scheduluotron isolates its standalone plan and remounts on event changes", async () => {
  const source = await readFile(new URL("../app/scheduluotron/page.tsx", import.meta.url), "utf8");
  assert.match(source, /<ScheduleEditor key=\{eventId \|\| "standalone"\}/);
  assert.match(source, /localStorage\.getItem\(storageKey\)/);
  assert.match(source, /localStorage\.setItem\(storageKey, JSON\.stringify\(plan\)\)/);
  assert.doesNotMatch(source, /localStorage\.(getItem|setItem)\("eventotron-scheduluotron-v1"/);
});
