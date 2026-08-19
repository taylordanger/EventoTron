import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { withRole } from "../_lib/auth";
import {
  foodotronMeals,
  suiteLayoutItems,
  suiteRoomLayouts,
  suiteRooms,
  suiteScheduleItems,
  suiteShoppingItems,
  tabletronEvents,
} from "@/db/schema";

function databaseUnavailable(error: unknown) {
  const detail = error instanceof Error ? error.message : String(error);
  return detail.includes("cloudflare:");
}

export const GET = withRole("staff", async (request: Request) => {
  const eventId = new URL(request.url).searchParams.get("eventId") ?? "";
  if (!eventId) {
    return Response.json({ error: "Event records require an event ID." }, { status: 400 });
  }

  try {
    const db = await getDb();
    const [tabletronEvent, meals, scheduleItems, layoutItems] = await Promise.all([
      db.select().from(tabletronEvents).where(eq(tabletronEvents.id, eventId)).get(),
      db.select().from(foodotronMeals).where(eq(foodotronMeals.tabletronEventId, eventId)),
      db.select().from(suiteScheduleItems).where(eq(suiteScheduleItems.eventId, eventId)),
      db.select().from(suiteLayoutItems).where(eq(suiteLayoutItems.eventId, eventId)),
    ]);
    const mealIds = meals.map((meal) => meal.id);
    const layoutIds = [...new Set(layoutItems.map((item) => item.layoutId))];
    const [shoppingItems, layouts] = await Promise.all([
      mealIds.length
        ? db.select().from(suiteShoppingItems).where(inArray(suiteShoppingItems.mealId, mealIds))
        : [],
      layoutIds.length
        ? db.select().from(suiteRoomLayouts).where(inArray(suiteRoomLayouts.id, layoutIds))
        : [],
    ]);
    const roomIds = [...new Set(layouts.map((layout) => layout.roomId))];
    const rooms = roomIds.length
      ? await db.select().from(suiteRooms).where(inArray(suiteRooms.id, roomIds))
      : [];

    return Response.json({
      eventId,
      tabletronEvent: tabletronEvent ?? null,
      rooms,
      layouts,
      layoutItems,
      meals,
      shoppingItems,
      scheduleItems,
      source: "database",
    });
  } catch (error) {
    if (!databaseUnavailable(error)) {
      return Response.json(
        {
          error: "EventoTron could not read normalized event records.",
          detail: error instanceof Error ? error.message : String(error),
        },
        { status: 500 },
      );
    }
    return Response.json({
      eventId,
      tabletronEvent: null,
      rooms: [],
      layouts: [],
      layoutItems: [],
      meals: [],
      shoppingItems: [],
      scheduleItems: [],
      source: "local-dev",
    });
  }
});
