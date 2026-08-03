import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

let schemaReady: Promise<void> | null = null;

async function getD1() {
  const { env } = await import("cloudflare:workers");
  if (!env.DB) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Set the `d1` field in .openai/hosting.json to `DB` or let your control plane inject the real binding values before using the database."
    );
  }
  return env.DB;
}

export async function ensureSuiteSchema() {
  schemaReady ??= getD1().then((db) =>
    db.batch([
      db.prepare(
        "CREATE TABLE IF NOT EXISTS foodotron_meals (id text PRIMARY KEY NOT NULL, name text NOT NULL, date text NOT NULL, guests integer NOT NULL, total real DEFAULT 0 NOT NULL, tabletron_event_id text, payload text NOT NULL, created_at text NOT NULL, updated_at text NOT NULL)",
      ),
      db.prepare(
        "CREATE TABLE IF NOT EXISTS tabletron_events (id text PRIMARY KEY NOT NULL, name text NOT NULL, date text NOT NULL, guest_count integer NOT NULL, foodotron_meal_id text, payload text NOT NULL, created_at text NOT NULL, updated_at text NOT NULL)",
      ),
      db.prepare(
        "CREATE TABLE IF NOT EXISTS meal_transfers (id text PRIMARY KEY NOT NULL, foodotron_meal_id text NOT NULL, tabletron_event_id text, status text DEFAULT 'pending' NOT NULL, created_at text NOT NULL, claimed_at text)",
      ),
      db.prepare(
        "CREATE INDEX IF NOT EXISTS idx_meal_transfers_foodotron_meal_id ON meal_transfers (foodotron_meal_id)",
      ),
      db.prepare(
        "CREATE INDEX IF NOT EXISTS idx_meal_transfers_tabletron_event_id ON meal_transfers (tabletron_event_id)",
      ),
    ]).then(() => undefined),
  );
  return schemaReady;
}

export async function getDb() {
  await ensureSuiteSchema();
  return drizzle(await getD1(), { schema });
}
