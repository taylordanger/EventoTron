import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { foodotronMeals, mealTransfers } from "@/db/schema";
import { withRole } from "../../_lib/auth";
import { getLocalTransfer } from "../local-store";

function cors(request: Request): Record<string, string> {
  const origin = request.headers.get("origin") ?? "";
  return origin.startsWith("http://localhost:")
    ? {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "GET,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      }
    : {};
}

export function OPTIONS(request: Request) {
  return new Response(null, { headers: cors(request) });
}

export const GET = withRole("staff", async (
  request: Request,
  _identity,
  { params }: { params: Promise<{ id: string }> },
) => {
  const { id } = await params;
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
    const meal = await db
      .select()
      .from(foodotronMeals)
      .where(eq(foodotronMeals.id, transfer.foodotronMealId))
      .get();
    if (!meal) {
      return Response.json(
        { error: "Foodotron meal was not found." },
        { status: 404, headers: cors(request) },
      );
    }
    return Response.json(
      {
        transferId: transfer.id,
        id: transfer.id,
        foodotronMealId: transfer.foodotronMealId,
        mealId: transfer.foodotronMealId,
        tabletronEventId: transfer.tabletronEventId,
        eventId: transfer.tabletronEventId,
        status: transfer.status,
        meal: meal.payload,
        payload: meal.payload,
      },
      { headers: cors(request) },
    );
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    const local = detail.includes("cloudflare:") ? getLocalTransfer(id) : null;
    if (local) {
      return Response.json(
        {
          transferId: local.id,
          id: local.id,
          foodotronMealId: local.foodotronMealId,
          mealId: local.foodotronMealId,
          tabletronEventId: local.tabletronEventId,
          eventId: local.tabletronEventId,
          status: local.status,
          meal: local.meal,
          payload: local.meal,
        },
        { headers: cors(request) },
      );
    }
    return Response.json(
      { error: "Foodotron could not read the transfer.", detail },
      { status: 500, headers: cors(request) },
    );
  }
});
