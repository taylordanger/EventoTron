import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { foodotronMeals, mealTransfers, tabletronEvents } from "@/db/schema";
import { completeLocalTransfer } from "../../local-store";

type EventPayload = {
  id?: string;
  name?: string;
  date?: string;
  guestCount?: number;
};

function cors(request: Request) {
  const origin = request.headers.get("origin") ?? "";
  return origin.startsWith("http://localhost:")
    ? {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "POST,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      }
    : {};
}

export function OPTIONS(request: Request) {
  return new Response(null, { headers: cors(request) });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    event?: EventPayload;
  };
  const event = body.event;
  if (!event?.id) {
    return Response.json(
      { error: "Completing a transfer requires an event ID." },
      { status: 400, headers: cors(request) },
    );
  }
  try {
    const db = await getDb();
    const transfer = await db
      .select()
      .from(mealTransfers)
      .where(eq(mealTransfers.id, id))
      .get();
    if (!transfer) {
      return Response.json(
        { error: "Meal transfer was not found." },
        { status: 404, headers: cors(request) },
      );
    }

    const now = new Date().toISOString();
    const payload = { ...event, foodotronMealId: transfer.foodotronMealId };
    await db
      .insert(tabletronEvents)
      .values({
        id: event.id,
        name: event.name ?? "Tabletron Event",
        date: event.date ?? "",
        guestCount: Number(event.guestCount ?? 0),
        foodotronMealId: transfer.foodotronMealId,
        payload,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: tabletronEvents.id,
        set: {
          name: event.name ?? "Tabletron Event",
          date: event.date ?? "",
          guestCount: Number(event.guestCount ?? 0),
          foodotronMealId: transfer.foodotronMealId,
          payload,
          updatedAt: now,
        },
      });

    await db
      .update(mealTransfers)
      .set({ tabletronEventId: event.id, status: "imported", claimedAt: now })
      .where(eq(mealTransfers.id, id));

    await db
      .update(foodotronMeals)
      .set({ tabletronEventId: event.id, updatedAt: now })
      .where(eq(foodotronMeals.id, transfer.foodotronMealId));

    return Response.json(
      {
        transferId: id,
        id,
        foodotronMealId: transfer.foodotronMealId,
        mealId: transfer.foodotronMealId,
        tabletronEventId: event.id,
        eventId: event.id,
      },
      { headers: cors(request) },
    );
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    const local = detail.includes("cloudflare:")
      ? completeLocalTransfer(id, event.id)
      : null;
    if (local) {
      return Response.json(
        {
          transferId: local.id,
          id: local.id,
          foodotronMealId: local.foodotronMealId,
          mealId: local.foodotronMealId,
          tabletronEventId: local.tabletronEventId,
          eventId: local.tabletronEventId,
        },
        { headers: cors(request) },
      );
    }
    return Response.json(
      { error: "Foodotron could not complete the transfer.", detail },
      { status: 500, headers: cors(request) },
    );
  }
}
