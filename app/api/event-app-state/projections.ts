import { eq } from "drizzle-orm";
import type { getDb } from "@/db";
import {
  foodotronMeals,
  suiteLayoutItems,
  suiteRecipes,
  suiteRoomLayouts,
  suiteRooms,
  suiteScheduleItems,
  suiteShoppingItems,
  tabletronEvents,
} from "@/db/schema";

type Database = Awaited<ReturnType<typeof getDb>>;
type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function records(value: unknown) {
  return Array.isArray(value)
    ? value.map(record).filter((item): item is JsonRecord => item !== null)
    : [];
}

function text(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function number(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function boolean(value: unknown) {
  return value === true;
}

function stableId(...parts: string[]) {
  return parts.map((part) => part.replace(/[^A-Za-z0-9_-]/g, "_")).join(":");
}

async function projectTabletron(db: Database, eventId: string, payload: unknown, now: string) {
  const project = record(payload);
  if (!project) return { tabletronEvents: 0, rooms: 0, layouts: 0, layoutItems: 0 };
  const rooms = records(project.rooms);
  const templates = records(project.templates);
  const events = records(project.events);
  const activeEvent = events.find((event) => text(event.id) === eventId)
    ?? events.find((event) => text(event.id) === text(project.activeEventId));

  await Promise.all(rooms.map((room) =>
    db.insert(suiteRooms).values({
      id: text(room.id),
      name: text(room.name, "Unnamed room"),
      width: number(room.width, 26),
      height: number(room.height, 26),
      payload: room,
      createdAt: now,
      updatedAt: now,
    }).onConflictDoUpdate({
      target: suiteRooms.id,
      set: {
        name: text(room.name, "Unnamed room"),
        width: number(room.width, 26),
        height: number(room.height, 26),
        payload: room,
        updatedAt: now,
      },
    })
  ));

  const layouts = rooms.flatMap((room) =>
    records(room.layouts).map((layout) => ({ room, layout })),
  );
  await Promise.all(layouts.map(({ room, layout }) =>
    db.insert(suiteRoomLayouts).values({
      id: text(layout.id),
      roomId: text(room.id),
      name: text(layout.name, "Unnamed layout"),
      payload: layout,
      createdAt: now,
      updatedAt: now,
    }).onConflictDoUpdate({
      target: suiteRoomLayouts.id,
      set: {
        roomId: text(room.id),
        name: text(layout.name, "Unnamed layout"),
        payload: layout,
        updatedAt: now,
      },
    })
  ));

  await db.delete(suiteLayoutItems).where(eq(suiteLayoutItems.eventId, eventId));
  const assignments = records(activeEvent?.rooms);
  const layoutItems = assignments.flatMap((assignment) => {
    const room = rooms.find((item) => text(item.id) === text(assignment.roomId));
    const layout = records(room?.layouts).find((item) => text(item.id) === text(assignment.layoutId));
    if (!room || !layout) return [];
    const roomId = text(room.id);
    const layoutId = text(layout.id);
    const tableItems = records(layout.tables).map((item) => ({
      id: stableId(eventId, layoutId, "table", text(item.id)),
      layoutId,
      eventId,
      itemType: "table",
      name: "Round table",
      quantity: 1,
      payload: { ...item, roomId },
      createdAt: now,
      updatedAt: now,
    }));
    const furnitureItems = records(layout.objects).map((item) => {
      const template = templates.find((candidate) => text(candidate.id) === text(item.templateId));
      return {
        id: stableId(eventId, layoutId, "furniture", text(item.id)),
        layoutId,
        eventId,
        itemType: "furniture",
        name: text(template?.name, "Furniture"),
        quantity: 1,
        payload: { ...item, roomId, template },
        createdAt: now,
        updatedAt: now,
      };
    });
    const entranceItems = records(room.entrances).map((item) => ({
      id: stableId(eventId, layoutId, "entrance", text(item.id)),
      layoutId,
      eventId,
      itemType: "entrance",
      name: text(item.name, "Entrance"),
      quantity: 1,
      payload: { ...item, roomId },
      createdAt: now,
      updatedAt: now,
    }));
    return [...tableItems, ...furnitureItems, ...entranceItems];
  });
  if (layoutItems.length) await Promise.all(layoutItems.map((item) => db.insert(suiteLayoutItems).values(item)));

  if (activeEvent) {
    await db.insert(tabletronEvents).values({
      id: eventId,
      name: text(activeEvent.name, "Untitled event"),
      date: text(activeEvent.date),
      guestCount: number(activeEvent.guestCount),
      foodotronMealId: text(activeEvent.foodotronMealId) || null,
      payload: activeEvent,
      createdAt: now,
      updatedAt: now,
    }).onConflictDoUpdate({
      target: tabletronEvents.id,
      set: {
        name: text(activeEvent.name, "Untitled event"),
        date: text(activeEvent.date),
        guestCount: number(activeEvent.guestCount),
        foodotronMealId: text(activeEvent.foodotronMealId) || null,
        payload: activeEvent,
        updatedAt: now,
      },
    });
  }

  return {
    tabletronEvents: activeEvent ? 1 : 0,
    rooms: rooms.length,
    layouts: layouts.length,
    layoutItems: layoutItems.length,
  };
}

function shoppingRows(meal: JsonRecord, recipes: JsonRecord[], mealId: string, now: string) {
  return records(meal.recipes).flatMap((entry) => {
    const recipeId = text(entry.recipeId);
    const recipe = recipes.find((item) => text(item.id) === recipeId);
    if (!recipe) return [];
    const multiplier = number(entry.servings) / Math.max(1, number(recipe.baseServings, 1));
    return records(recipe.ingredients).map((ingredient) => {
      const required = number(ingredient.qty) * multiplier;
      const offers = records(ingredient.offers).filter((offer) => number(offer.packageQty) > 0);
      const choices = offers.map((offer) => {
        const packages = Math.max(1, Math.ceil(required / number(offer.packageQty, 1)));
        return { offer, packages, cost: packages * number(offer.price) };
      }).sort((a, b) => a.cost - b.cost);
      const best = choices[0];
      const ingredientId = text(ingredient.id) || text(ingredient.name, "item");
      return {
        id: stableId(mealId, recipeId, ingredientId),
        mealId,
        recipeId: recipeId || null,
        ingredient: text(ingredient.name, "Ingredient"),
        store: text(best?.offer.store),
        quantity: `${Number(required.toFixed(3))} ${text(ingredient.unit, "each")}`,
        estimatedCost: best?.cost ?? 0,
        purchased: false,
        payload: {
          ingredient,
          servings: number(entry.servings),
          required,
          packages: best?.packages ?? 0,
          selectedOffer: best?.offer ?? null,
        },
        createdAt: now,
        updatedAt: now,
      };
    });
  });
}

async function projectFoodotron(db: Database, eventId: string, payload: unknown, now: string) {
  const plan = record(payload);
  if (!plan) return { meals: 0, recipes: 0, shoppingItems: 0 };
  const recipes = records(plan.recipes);
  const meals = records(plan.meals).filter((meal) => text(meal.tabletronEventId) === eventId);

  await Promise.all(recipes.map((recipe) =>
    db.insert(suiteRecipes).values({
      id: text(recipe.id),
      name: text(recipe.name, "Untitled recipe"),
      baseServings: Math.max(1, number(recipe.baseServings, 1)),
      payload: recipe,
      createdAt: now,
      updatedAt: now,
    }).onConflictDoUpdate({
      target: suiteRecipes.id,
      set: {
        name: text(recipe.name, "Untitled recipe"),
        baseServings: Math.max(1, number(recipe.baseServings, 1)),
        payload: recipe,
        updatedAt: now,
      },
    })
  ));

  let shoppingItemCount = 0;
  for (const meal of meals) {
    const localMealId = text(meal.id);
    const mealId = text(meal.dbId) || text(meal.id);
    if (!mealId) continue;
    const rows = shoppingRows(meal, recipes, mealId, now);
    shoppingItemCount += rows.length;
    if (localMealId && localMealId !== mealId) {
      await db.delete(suiteShoppingItems).where(eq(suiteShoppingItems.mealId, localMealId));
      await db.delete(foodotronMeals).where(eq(foodotronMeals.id, localMealId));
    }
    await db.insert(foodotronMeals).values({
      id: mealId,
      name: text(meal.name, "Untitled meal"),
      date: text(meal.date),
      guests: number(meal.guests),
      total: rows.reduce((sum, row) => sum + row.estimatedCost, 0),
      tabletronEventId: text(meal.tabletronEventId) || null,
      payload: meal,
      createdAt: now,
      updatedAt: now,
    }).onConflictDoUpdate({
      target: foodotronMeals.id,
      set: {
        name: text(meal.name, "Untitled meal"),
        date: text(meal.date),
        guests: number(meal.guests),
        total: rows.reduce((sum, row) => sum + row.estimatedCost, 0),
        tabletronEventId: text(meal.tabletronEventId) || null,
        payload: meal,
        updatedAt: now,
      },
    });
    await db.delete(suiteShoppingItems).where(eq(suiteShoppingItems.mealId, mealId));
    if (rows.length) await Promise.all(rows.map((row) => db.insert(suiteShoppingItems).values(row)));
  }

  return { meals: meals.length, recipes: recipes.length, shoppingItems: shoppingItemCount };
}

async function projectScheduluotron(db: Database, eventId: string, payload: unknown, now: string) {
  const plan = record(payload);
  const blocks = records(plan?.blocks);
  await db.delete(suiteScheduleItems).where(eq(suiteScheduleItems.eventId, eventId));
  const rows = blocks.map((block) => ({
    id: stableId(eventId, text(block.id)),
    eventId,
    title: text(block.title, "Untitled schedule item"),
    start: text(block.start),
    end: text(block.end),
    owner: text(block.owner),
    location: text(block.location),
    notes: text(block.notes),
    done: boolean(block.done),
    payload: block,
    createdAt: now,
    updatedAt: now,
  }));
  if (rows.length) await Promise.all(rows.map((row) => db.insert(suiteScheduleItems).values(row)));
  return { scheduleItems: rows.length };
}

export async function projectAppletState(
  db: Database,
  eventId: string,
  appName: string,
  payload: unknown,
  now: string,
) {
  if (appName === "tabletron") return projectTabletron(db, eventId, payload, now);
  if (appName === "foodotron") return projectFoodotron(db, eventId, payload, now);
  return projectScheduluotron(db, eventId, payload, now);
}

export async function removeAppletProjection(db: Database, eventId: string, appName: string) {
  if (appName === "tabletron") {
    await Promise.all([
      db.delete(tabletronEvents).where(eq(tabletronEvents.id, eventId)),
      db.delete(suiteLayoutItems).where(eq(suiteLayoutItems.eventId, eventId)),
    ]);
    return;
  }
  if (appName === "scheduluotron") {
    await db.delete(suiteScheduleItems).where(eq(suiteScheduleItems.eventId, eventId));
    return;
  }
  const meals = await db.select({ id: foodotronMeals.id })
    .from(foodotronMeals)
    .where(eq(foodotronMeals.tabletronEventId, eventId));
  await Promise.all(meals.map((meal) =>
    db.delete(suiteShoppingItems).where(eq(suiteShoppingItems.mealId, meal.id)),
  ));
  await db.delete(foodotronMeals).where(eq(foodotronMeals.tabletronEventId, eventId));
}
