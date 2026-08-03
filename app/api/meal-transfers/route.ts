import { getDb } from "@/db";
import { foodotronMeals, mealTransfers } from "@/db/schema";
import { putLocalTransfer } from "../tabletron-transfers/local-store";

type TransferMeal = {
  id?: string;
  dbId?: string;
  name?: string;
  date?: string;
  guests?: number;
  tabletronEventId?: string;
};
type TransferPacket = {
  mealName?: string;
  date?: string;
  guests?: number;
  total?: number;
};

const alphabet =
  "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

function shortId(prefix: string) {
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  return `${prefix}_${Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("")}`;
}

function dbId(prefix: string, existing?: string) {
  return existing && /^[a-z]+_[A-Za-z0-9_-]{6,}$/.test(existing)
    ? existing
    : shortId(prefix);
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      meal?: TransferMeal;
      packet?: TransferPacket;
    };
    const meal = body.meal;
    const packet = body.packet;
    if (!meal || !packet || !packet.mealName) {
      return Response.json({ error: "Meal transfer requires a meal." }, { status: 400 });
    }

    const now = new Date().toISOString();
    const foodotronMealId = dbId("meal", meal.dbId ?? meal.id);
    const tabletronEventId =
      typeof meal.tabletronEventId === "string" && meal.tabletronEventId
        ? meal.tabletronEventId
        : null;
    const transferId = shortId("xfer");
    const payload = {
      ...packet,
      foodotronMealId,
      tabletronEventId,
    };
    try {
      const db = await getDb();

      await db
        .insert(foodotronMeals)
        .values({
          id: foodotronMealId,
          name: packet.mealName,
          date: packet.date ?? meal.date ?? "",
          guests: Number(packet.guests ?? meal.guests ?? 0),
          total: Number(packet.total ?? 0),
          tabletronEventId,
          payload,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: foodotronMeals.id,
          set: {
            name: packet.mealName,
            date: packet.date ?? meal.date ?? "",
            guests: Number(packet.guests ?? meal.guests ?? 0),
            total: Number(packet.total ?? 0),
            tabletronEventId,
            payload,
            updatedAt: now,
          },
        });

      await db.insert(mealTransfers).values({
        id: transferId,
        foodotronMealId,
        tabletronEventId,
        status: "pending",
        createdAt: now,
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      if (!detail.includes("cloudflare:")) throw error;
      putLocalTransfer({
        id: transferId,
        foodotronMealId,
        tabletronEventId,
        status: "pending",
        meal: payload,
        createdAt: now,
        claimedAt: null,
      });
    }

    const tabletronUrl = new URL(`/tabletron/import/${transferId}`, request.url);

    return Response.json({
      transferId,
      id: transferId,
      foodotronMealId,
      mealId: foodotronMealId,
      tabletronEventId,
      tabletronUrl: tabletronUrl.pathname + tabletronUrl.search,
    });
  } catch (error) {
    return Response.json(
      {
        error: "Foodotron could not create the transfer.",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
