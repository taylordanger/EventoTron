import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { suiteSettings } from "@/db/schema";
import { readLocalSettings, writeLocalSettings } from "./local-store";

function dbUnavailable(error: unknown) {
  const detail = error instanceof Error ? error.message : String(error);
  return detail.includes("cloudflare:");
}

export async function GET() {
  try {
    const db = await getDb();
    const settings = await db
      .select()
      .from(suiteSettings)
      .where(eq(suiteSettings.id, "workspace"))
      .get();
    if (!settings) {
      return Response.json({ error: "No saved settings." }, { status: 404 });
    }
    return Response.json({ ...settings, source: "database" });
  } catch (error) {
    if (!dbUnavailable(error)) {
      return Response.json(
        {
          error: "EventoTron could not read settings.",
          detail: error instanceof Error ? error.message : String(error),
        },
        { status: 500 },
      );
    }
    const local = readLocalSettings();
    if (!local) {
      return Response.json({ error: "No saved settings." }, { status: 404 });
    }
    return Response.json({ ...local, source: "local-dev" });
  }
}

export async function PUT(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { payload?: unknown };
  if (body.payload === undefined) {
    return Response.json({ error: "Saving settings requires a payload." }, { status: 400 });
  }
  const now = new Date().toISOString();
  try {
    const db = await getDb();
    await db
      .insert(suiteSettings)
      .values({
        id: "workspace",
        payload: body.payload,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: suiteSettings.id,
        set: { payload: body.payload, updatedAt: now },
      });
    return Response.json({ id: "workspace", savedAt: now, source: "database" });
  } catch (error) {
    if (!dbUnavailable(error)) {
      return Response.json(
        {
          error: "EventoTron could not save settings.",
          detail: error instanceof Error ? error.message : String(error),
        },
        { status: 500 },
      );
    }
    const local = writeLocalSettings(body.payload);
    return Response.json({ ...local, savedAt: local.updatedAt, source: "local-dev" });
  }
}
