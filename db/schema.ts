import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const foodotronMeals = sqliteTable("foodotron_meals", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  date: text("date").notNull(),
  guests: integer("guests").notNull(),
  total: real("total").notNull().default(0),
  tabletronEventId: text("tabletron_event_id"),
  payload: text("payload", { mode: "json" }).notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const tabletronEvents = sqliteTable("tabletron_events", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  date: text("date").notNull(),
  guestCount: integer("guest_count").notNull(),
  foodotronMealId: text("foodotron_meal_id"),
  payload: text("payload", { mode: "json" }).notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

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
  ],
);
