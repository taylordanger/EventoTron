import assert from "node:assert/strict";
import test from "node:test";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

/**
 * EventoTron describes its tables in three places:
 *
 *   1. db/schema.ts       — the Drizzle model the app queries through
 *   2. db/index.ts        — `CREATE TABLE IF NOT EXISTS` run at boot
 *   3. drizzle/*.sql      — the generated migration history
 *
 * They agree today. Nothing enforces that, so a table added to one and
 * forgotten in another would work locally and fail on a fresh deployment —
 * exactly the kind of drift that only shows up in production. These tests fail
 * the moment the three disagree.
 */

const root = new URL("../", import.meta.url);

function tablesFromSchema(source) {
  return new Set([...source.matchAll(/sqliteTable\(\s*"([a-z_]+)"/g)].map((m) => m[1]));
}

function tablesFromRuntime(source) {
  return new Set(
    [...source.matchAll(/CREATE TABLE IF NOT EXISTS\s+([a-z_]+)/g)].map((m) => m[1]),
  );
}

function tablesFromMigrations(source) {
  return new Set(
    [...source.matchAll(/CREATE TABLE(?:\s+IF NOT EXISTS)?\s+`?([a-z_]+)`?/gi)].map((m) => m[1]),
  );
}

async function readSources() {
  const migrationDir = fileURLToPath(new URL("drizzle/", root));
  const files = (await readdir(migrationDir)).filter((f) => f.endsWith(".sql")).sort();
  const [schema, runtime, ...migrations] = await Promise.all([
    readFile(new URL("db/schema.ts", root), "utf8"),
    readFile(new URL("db/index.ts", root), "utf8"),
    ...files.map((f) => readFile(new URL(`drizzle/${f}`, root), "utf8")),
  ]);
  return { schema, runtime, migrations: migrations.join("\n"), files };
}

function describeDiff(label, a, b) {
  const missing = [...a].filter((t) => !b.has(t)).sort();
  return missing.length ? `${label}: ${missing.join(", ")}` : "";
}

test("every table in the Drizzle model is created at boot", async () => {
  const { schema, runtime } = await readSources();
  const model = tablesFromSchema(schema);
  const created = tablesFromRuntime(runtime);
  assert.ok(model.size > 0, "no tables parsed from db/schema.ts");
  assert.equal(
    describeDiff("declared in db/schema.ts but never created in db/index.ts", model, created),
    "",
  );
});

test("every table created at boot exists in the migration history", async () => {
  const { runtime, migrations } = await readSources();
  const created = tablesFromRuntime(runtime);
  const migrated = tablesFromMigrations(migrations);
  assert.equal(
    describeDiff("created in db/index.ts but missing from drizzle/*.sql", created, migrated),
    "",
  );
});

test("the migration history contains no table the app does not know about", async () => {
  const { schema, migrations } = await readSources();
  const model = tablesFromSchema(schema);
  const migrated = tablesFromMigrations(migrations);
  assert.equal(
    describeDiff("migrated but absent from db/schema.ts", migrated, model),
    "",
  );
});

test("the expected migration marker matches the newest migration file", async () => {
  const { runtime, files } = await readSources();
  const expected = runtime.match(/EXPECTED_SCHEMA_MIGRATION\s*=\s*"([^"]+)"/)?.[1];
  assert.ok(expected, "EXPECTED_SCHEMA_MIGRATION is not declared in db/index.ts");
  const newest = files[files.length - 1].replace(/\.sql$/, "");
  assert.equal(
    expected,
    newest,
    "EXPECTED_SCHEMA_MIGRATION is stale, so /api/health would report the wrong schema version",
  );
});

test("the boot marker backfills every migration in the history", async () => {
  // db/index.ts seeds suite_schema_migrations so a fresh database reports the
  // same applied list as one built by migrations. A migration missing here
  // makes a new deployment look permanently out of date.
  const { runtime, files } = await readSources();
  const expected = runtime.match(/EXPECTED_SCHEMA_MIGRATION\s*=\s*"([^"]+)"/)?.[1];

  // Tags appear either as SQL literals or interpolated as the newest one.
  const seeded = new Set([...runtime.matchAll(/'([0-9]{4}_[a-z_]+)'/g)].map((m) => m[1]));
  if (runtime.includes("${EXPECTED_SCHEMA_MIGRATION}") && expected) seeded.add(expected);

  const unseeded = files
    .map((file) => file.replace(/\.sql$/, ""))
    .filter((tag) => !seeded.has(tag));

  assert.deepEqual(
    unseeded,
    [],
    `migrations never marked applied on a fresh database: ${unseeded.join(", ")}`,
  );
});
