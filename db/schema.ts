import { check, index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const suiteWriteGuards = sqliteTable("suite_write_guards", {
  token: text("token").primaryKey(),
  accepted: integer("accepted").notNull(),
}, (table) => [check("accepted_guard", sql`${table.accepted} = 1`)]);

export const suiteSchemaMigrations = sqliteTable("suite_schema_migrations", {
  id: text("id").primaryKey(),
  appliedAt: text("applied_at").notNull(),
});

export const suiteEvents = sqliteTable(
  "suite_events",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    date: text("date").notNull(),
    kind: text("kind").notNull(),
    eventTime: text("event_time").notNull().default(""),
    rentalTime: text("rental_time").notNull().default(""),
    space: text("space").notNull().default(""),
    manager: text("manager").notNull().default(""),
    contact: text("contact").notNull().default(""),
    phone: text("phone").notNull().default(""),
    email: text("email").notNull().default(""),
    attendees: integer("attendees").notNull().default(0),
    description: text("description").notNull().default(""),
    planningNotes: text("planning_notes").notNull().default(""),
    mod: text("mod").notNull().default(""),
    vacation: text("vacation").notNull().default(""),
    rentalTotal: real("rental_total").notNull().default(0),
    cateringTotal: real("catering_total").notNull().default(0),
    discountRate: real("discount_rate").notNull().default(0),
    deposit: real("deposit").notNull().default(0),
    paymentNotes: text("payment_notes").notNull().default(""),
    quoteEnteredBy: text("quote_entered_by").notNull().default(""),
    requestedItems: text("requested_items").notNull().default(""),
    payload: text("payload", { mode: "json" }).notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("idx_suite_events_date").on(table.date),
    index("idx_suite_events_kind").on(table.kind),
    index("idx_suite_events_updated_at").on(table.updatedAt),
  ],
);

export const suiteEventAudit = sqliteTable(
  "suite_event_audit",
  {
    id: text("id").primaryKey(),
    eventId: text("event_id").notNull(),
    action: text("action").notNull(),
    actor: text("actor").notNull(),
    revision: text("revision"),
    payload: text("payload", { mode: "json" }).notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("idx_suite_event_audit_event_created").on(table.eventId, table.createdAt),
    index("idx_suite_event_audit_created_at").on(table.createdAt),
  ],
);

export const suiteRooms = sqliteTable("suite_rooms", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  width: real("width").notNull().default(26),
  height: real("height").notNull().default(26),
  payload: text("payload", { mode: "json" }).notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const suiteRoomLayouts = sqliteTable(
  "suite_room_layouts",
  {
    id: text("id").primaryKey(),
    roomId: text("room_id").notNull(),
    name: text("name").notNull(),
    payload: text("payload", { mode: "json" }).notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [index("idx_suite_room_layouts_room_id").on(table.roomId)],
);

export const suiteLayoutItems = sqliteTable(
  "suite_layout_items",
  {
    id: text("id").primaryKey(),
    layoutId: text("layout_id").notNull(),
    eventId: text("event_id"),
    itemType: text("item_type").notNull(),
    name: text("name").notNull(),
    quantity: integer("quantity").notNull().default(1),
    payload: text("payload", { mode: "json" }).notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("idx_suite_layout_items_layout_id").on(table.layoutId),
    index("idx_suite_layout_items_event_id").on(table.eventId),
  ],
);

export const foodotronMeals = sqliteTable(
  "foodotron_meals",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    date: text("date").notNull(),
    guests: integer("guests").notNull(),
    total: real("total").notNull().default(0),
    tabletronEventId: text("tabletron_event_id"),
    payload: text("payload", { mode: "json" }).notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("idx_foodotron_meals_tabletron_event_id").on(table.tabletronEventId),
    index("idx_foodotron_meals_updated_at").on(table.updatedAt),
  ],
);

export const suiteRecipes = sqliteTable("suite_recipes", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  baseServings: integer("base_servings").notNull().default(1),
  payload: text("payload", { mode: "json" }).notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const suiteShoppingItems = sqliteTable(
  "suite_shopping_items",
  {
    id: text("id").primaryKey(),
    mealId: text("meal_id").notNull(),
    recipeId: text("recipe_id"),
    ingredient: text("ingredient").notNull(),
    store: text("store").notNull().default(""),
    quantity: text("quantity").notNull().default(""),
    estimatedCost: real("estimated_cost").notNull().default(0),
    purchased: integer("purchased", { mode: "boolean" }).notNull().default(false),
    payload: text("payload", { mode: "json" }).notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("idx_suite_shopping_items_meal_id").on(table.mealId),
    index("idx_suite_shopping_items_recipe_id").on(table.recipeId),
  ],
);

export const tabletronEvents = sqliteTable(
  "tabletron_events",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    date: text("date").notNull(),
    guestCount: integer("guest_count").notNull(),
    foodotronMealId: text("foodotron_meal_id"),
    payload: text("payload", { mode: "json" }).notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("idx_tabletron_events_foodotron_meal_id").on(table.foodotronMealId),
    index("idx_tabletron_events_updated_at").on(table.updatedAt),
  ],
);

export const suiteScheduleItems = sqliteTable(
  "suite_schedule_items",
  {
    id: text("id").primaryKey(),
    eventId: text("event_id").notNull(),
    title: text("title").notNull(),
    start: text("start").notNull().default(""),
    end: text("end").notNull().default(""),
    owner: text("owner").notNull().default(""),
    location: text("location").notNull().default(""),
    notes: text("notes").notNull().default(""),
    done: integer("done", { mode: "boolean" }).notNull().default(false),
    payload: text("payload", { mode: "json" }).notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("idx_suite_schedule_items_event_id").on(table.eventId),
    index("idx_suite_schedule_items_event_start").on(table.eventId, table.start),
  ],
);

export const suiteCalendarSources = sqliteTable("suite_calendar_sources", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  provider: text("provider").notNull(),
  url: text("url").notNull().default(""),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  color: text("color").notNull().default("#75ff47"),
  syncMinutes: integer("sync_minutes").notNull().default(15),
  lastSynced: text("last_synced"),
  lastError: text("last_error"),
  payload: text("payload", { mode: "json" }).notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const suiteCalendarEvents = sqliteTable(
  "suite_calendar_events",
  {
    id: text("id").primaryKey(),
    sourceId: text("source_id").notNull(),
    externalId: text("external_id").notNull(),
    title: text("title").notNull(),
    date: text("date").notNull(),
    eventTime: text("event_time").notNull().default(""),
    description: text("description").notNull().default(""),
    location: text("location").notNull().default(""),
    payload: text("payload", { mode: "json" }).notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("idx_suite_calendar_events_source_id").on(table.sourceId),
    index("idx_suite_calendar_events_date").on(table.date),
    uniqueIndex("idx_suite_calendar_events_source_external").on(table.sourceId, table.externalId),
  ],
);

export const suiteSettings = sqliteTable("suite_settings", {
  id: text("id").primaryKey(),
  payload: text("payload", { mode: "json" }).notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const suiteAppletStates = sqliteTable(
  "suite_applet_states",
  {
    id: text("id").primaryKey(),
    eventId: text("event_id").notNull(),
    appName: text("app_name").notNull(),
    payload: text("payload", { mode: "json" }).notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("idx_suite_applet_states_event_id").on(table.eventId),
    index("idx_suite_applet_states_app_name").on(table.appName),
    uniqueIndex("idx_suite_applet_states_event_app").on(table.eventId, table.appName),
  ],
);

export const suiteUsers = sqliteTable(
  "suite_users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    role: text("role").notNull().default("staff"),
    status: text("status").notNull().default("active"),
    lastSeenAt: text("last_seen_at"),
    payload: text("payload", { mode: "json" }).notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("idx_suite_users_email").on(table.email),
    index("idx_suite_users_role").on(table.role),
  ],
);

export const suiteCalendarOAuthAccounts = sqliteTable(
  "suite_calendar_oauth_accounts",
  {
    id: text("id").primaryKey(),
    provider: text("provider").notNull(),
    connectedByEmail: text("connected_by_email").notNull(),
    accountEmail: text("account_email").notNull().default(""),
    accessTokenCiphertext: text("access_token_ciphertext").notNull().default(""),
    refreshTokenCiphertext: text("refresh_token_ciphertext").notNull().default(""),
    tokenIv: text("token_iv").notNull().default(""),
    scope: text("scope").notNull().default(""),
    expiresAt: text("expires_at"),
    payload: text("payload", { mode: "json" }).notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("idx_suite_calendar_oauth_accounts_provider").on(table.provider),
  ],
);

export const mealTransfers = sqliteTable(
  "meal_transfers",
  {
    id: text("id").primaryKey(),
    foodotronMealId: text("foodotron_meal_id").notNull(),
    tabletronEventId: text("tabletron_event_id"),
    status: text("status").notNull().default("pending"),
    createdAt: text("created_at").notNull(),
    claimedAt: text("claimed_at"),
  },
  (table) => [
    index("idx_meal_transfers_foodotron_meal_id").on(table.foodotronMealId),
    index("idx_meal_transfers_tabletron_event_id").on(table.tabletronEventId),
    index("idx_meal_transfers_status_created_at").on(table.status, table.createdAt),
  ],
);
