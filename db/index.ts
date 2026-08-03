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
        "CREATE TABLE IF NOT EXISTS suite_schema_migrations (id text PRIMARY KEY NOT NULL, applied_at text NOT NULL)",
      ),
      db.prepare(
        "CREATE TABLE IF NOT EXISTS suite_events (id text PRIMARY KEY NOT NULL, title text NOT NULL, date text NOT NULL, kind text NOT NULL, event_time text DEFAULT '' NOT NULL, rental_time text DEFAULT '' NOT NULL, space text DEFAULT '' NOT NULL, manager text DEFAULT '' NOT NULL, contact text DEFAULT '' NOT NULL, phone text DEFAULT '' NOT NULL, email text DEFAULT '' NOT NULL, attendees integer DEFAULT 0 NOT NULL, description text DEFAULT '' NOT NULL, planning_notes text DEFAULT '' NOT NULL, mod text DEFAULT '' NOT NULL, vacation text DEFAULT '' NOT NULL, rental_total real DEFAULT 0 NOT NULL, catering_total real DEFAULT 0 NOT NULL, discount_rate real DEFAULT 0 NOT NULL, deposit real DEFAULT 0 NOT NULL, payment_notes text DEFAULT '' NOT NULL, quote_entered_by text DEFAULT '' NOT NULL, requested_items text DEFAULT '' NOT NULL, payload text NOT NULL, created_at text NOT NULL, updated_at text NOT NULL)",
      ),
      db.prepare(
        "CREATE INDEX IF NOT EXISTS idx_suite_events_date ON suite_events (date)",
      ),
      db.prepare(
        "CREATE INDEX IF NOT EXISTS idx_suite_events_kind ON suite_events (kind)",
      ),
      db.prepare(
        "CREATE INDEX IF NOT EXISTS idx_suite_events_updated_at ON suite_events (updated_at)",
      ),
      db.prepare(
        "CREATE TABLE IF NOT EXISTS suite_rooms (id text PRIMARY KEY NOT NULL, name text NOT NULL, width real DEFAULT 26 NOT NULL, height real DEFAULT 26 NOT NULL, payload text NOT NULL, created_at text NOT NULL, updated_at text NOT NULL)",
      ),
      db.prepare(
        "CREATE TABLE IF NOT EXISTS suite_room_layouts (id text PRIMARY KEY NOT NULL, room_id text NOT NULL, name text NOT NULL, payload text NOT NULL, created_at text NOT NULL, updated_at text NOT NULL)",
      ),
      db.prepare(
        "CREATE INDEX IF NOT EXISTS idx_suite_room_layouts_room_id ON suite_room_layouts (room_id)",
      ),
      db.prepare(
        "CREATE TABLE IF NOT EXISTS suite_layout_items (id text PRIMARY KEY NOT NULL, layout_id text NOT NULL, event_id text, item_type text NOT NULL, name text NOT NULL, quantity integer DEFAULT 1 NOT NULL, payload text NOT NULL, created_at text NOT NULL, updated_at text NOT NULL)",
      ),
      db.prepare(
        "CREATE INDEX IF NOT EXISTS idx_suite_layout_items_layout_id ON suite_layout_items (layout_id)",
      ),
      db.prepare(
        "CREATE INDEX IF NOT EXISTS idx_suite_layout_items_event_id ON suite_layout_items (event_id)",
      ),
      db.prepare(
        "CREATE TABLE IF NOT EXISTS foodotron_meals (id text PRIMARY KEY NOT NULL, name text NOT NULL, date text NOT NULL, guests integer NOT NULL, total real DEFAULT 0 NOT NULL, tabletron_event_id text, payload text NOT NULL, created_at text NOT NULL, updated_at text NOT NULL)",
      ),
      db.prepare(
        "CREATE INDEX IF NOT EXISTS idx_foodotron_meals_tabletron_event_id ON foodotron_meals (tabletron_event_id)",
      ),
      db.prepare(
        "CREATE INDEX IF NOT EXISTS idx_foodotron_meals_updated_at ON foodotron_meals (updated_at)",
      ),
      db.prepare(
        "CREATE TABLE IF NOT EXISTS suite_recipes (id text PRIMARY KEY NOT NULL, name text NOT NULL, base_servings integer DEFAULT 1 NOT NULL, payload text NOT NULL, created_at text NOT NULL, updated_at text NOT NULL)",
      ),
      db.prepare(
        "CREATE TABLE IF NOT EXISTS suite_shopping_items (id text PRIMARY KEY NOT NULL, meal_id text NOT NULL, recipe_id text, ingredient text NOT NULL, store text DEFAULT '' NOT NULL, quantity text DEFAULT '' NOT NULL, estimated_cost real DEFAULT 0 NOT NULL, purchased integer DEFAULT false NOT NULL, payload text NOT NULL, created_at text NOT NULL, updated_at text NOT NULL)",
      ),
      db.prepare(
        "CREATE INDEX IF NOT EXISTS idx_suite_shopping_items_meal_id ON suite_shopping_items (meal_id)",
      ),
      db.prepare(
        "CREATE INDEX IF NOT EXISTS idx_suite_shopping_items_recipe_id ON suite_shopping_items (recipe_id)",
      ),
      db.prepare(
        "CREATE TABLE IF NOT EXISTS tabletron_events (id text PRIMARY KEY NOT NULL, name text NOT NULL, date text NOT NULL, guest_count integer NOT NULL, foodotron_meal_id text, payload text NOT NULL, created_at text NOT NULL, updated_at text NOT NULL)",
      ),
      db.prepare(
        "CREATE INDEX IF NOT EXISTS idx_tabletron_events_foodotron_meal_id ON tabletron_events (foodotron_meal_id)",
      ),
      db.prepare(
        "CREATE INDEX IF NOT EXISTS idx_tabletron_events_updated_at ON tabletron_events (updated_at)",
      ),
      db.prepare(
        "CREATE TABLE IF NOT EXISTS suite_schedule_items (id text PRIMARY KEY NOT NULL, event_id text NOT NULL, title text NOT NULL, start text DEFAULT '' NOT NULL, end text DEFAULT '' NOT NULL, owner text DEFAULT '' NOT NULL, location text DEFAULT '' NOT NULL, notes text DEFAULT '' NOT NULL, done integer DEFAULT false NOT NULL, payload text NOT NULL, created_at text NOT NULL, updated_at text NOT NULL)",
      ),
      db.prepare(
        "CREATE INDEX IF NOT EXISTS idx_suite_schedule_items_event_id ON suite_schedule_items (event_id)",
      ),
      db.prepare(
        "CREATE INDEX IF NOT EXISTS idx_suite_schedule_items_event_start ON suite_schedule_items (event_id, start)",
      ),
      db.prepare(
        "CREATE TABLE IF NOT EXISTS suite_calendar_sources (id text PRIMARY KEY NOT NULL, name text NOT NULL, provider text NOT NULL, url text DEFAULT '' NOT NULL, enabled integer DEFAULT true NOT NULL, color text DEFAULT '#75ff47' NOT NULL, sync_minutes integer DEFAULT 15 NOT NULL, last_synced text, last_error text, payload text NOT NULL, created_at text NOT NULL, updated_at text NOT NULL)",
      ),
      db.prepare(
        "CREATE TABLE IF NOT EXISTS suite_settings (id text PRIMARY KEY NOT NULL, payload text NOT NULL, created_at text NOT NULL, updated_at text NOT NULL)",
      ),
      db.prepare(
        "CREATE TABLE IF NOT EXISTS suite_applet_states (id text PRIMARY KEY NOT NULL, event_id text NOT NULL, app_name text NOT NULL, payload text NOT NULL, created_at text NOT NULL, updated_at text NOT NULL)",
      ),
      db.prepare(
        "CREATE INDEX IF NOT EXISTS idx_suite_applet_states_event_id ON suite_applet_states (event_id)",
      ),
      db.prepare(
        "CREATE INDEX IF NOT EXISTS idx_suite_applet_states_app_name ON suite_applet_states (app_name)",
      ),
      db.prepare(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_suite_applet_states_event_app ON suite_applet_states (event_id, app_name)",
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
      db.prepare(
        "CREATE INDEX IF NOT EXISTS idx_meal_transfers_status_created_at ON meal_transfers (status, created_at)",
      ),
      db.prepare(
        "INSERT OR IGNORE INTO suite_schema_migrations (id, applied_at) VALUES ('0000_suite_meal_transfers', datetime('now')), ('0001_suite_production_tables', datetime('now')), ('0002_suite_applet_states', datetime('now')), ('0003_suite_integrity_indexes', datetime('now'))",
      ),
    ]).then(() => undefined),
  );
  return schemaReady;
}

export async function getDb() {
  await ensureSuiteSchema();
  return drizzle(await getD1(), { schema });
}
