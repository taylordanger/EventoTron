import { and, desc, eq, gt, lt } from "drizzle-orm";
import { getDb } from "@/db";
import { supportDiagnostics } from "@/db/schema";
import { withRole } from "../_lib/auth";
import { supportBody } from "../_lib/support-body";
import { recordDiagnostic } from "../_lib/diagnostics";
import { diagnosticMetadata } from "../../support-data";

export const POST = withRole("staff", async (request, identity) => {
  let input;
  try { input = diagnosticMetadata(await supportBody(request, 6000)); }
  catch { return Response.json({ error: "Diagnostic input is invalid or too large." }, { status: 400 }); }
  if (!input || !["browser-crash", "promise-rejection", "request-failed", "network-failed", "save-conflict", "slow-request"].includes(input.code)) return Response.json({ error: "Unknown browser diagnostic." }, { status: 400 });
  const result = await recordDiagnostic(input, identity.email, "browser");
  if (!result) return Response.json({ error: "Diagnostic intake limit reached." }, { status: 429 });
  return Response.json(result, { status: result.stored ? 201 : 503, headers: { "Cache-Control": "no-store" } });
});

export const GET = withRole("admin", async (request) => {
  const db = await getDb();
  const cutoff = new Date(Date.now() - 30 * 86400_000).toISOString();
  await db.delete(supportDiagnostics).where(lt(supportDiagnostics.lastSeenAt, cutoff));
  const params = new URL(request.url).searchParams;
  const app = params.get("app"); const severity = params.get("severity");
  const reference = (params.get("reference") ?? "").trim().slice(0, 40);
  const offset = Math.max(0, Math.min(10000, Number(params.get("offset")) || 0));
  const entries = await db.select({ id: supportDiagnostics.id, code: supportDiagnostics.code, app: supportDiagnostics.app, severity: supportDiagnostics.severity, source: supportDiagnostics.source, release: supportDiagnostics.release, count: supportDiagnostics.count, metadata: supportDiagnostics.metadata, firstSeenAt: supportDiagnostics.firstSeenAt, lastSeenAt: supportDiagnostics.lastSeenAt }).from(supportDiagnostics)
    .where(and(gt(supportDiagnostics.lastSeenAt, cutoff), app ? eq(supportDiagnostics.app, app) : undefined, severity ? eq(supportDiagnostics.severity, severity) : undefined, reference ? eq(supportDiagnostics.id, reference) : undefined))
    .orderBy(desc(supportDiagnostics.lastSeenAt), desc(supportDiagnostics.id)).limit(51).offset(offset);
  return Response.json({ entries: entries.slice(0, 50), hasMore: entries.length > 50, retentionDays: 30 }, { headers: { "Cache-Control": "no-store" } });
});
