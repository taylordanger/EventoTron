import { getSuiteD1 } from "@/db";
import { diagnosticMetadata, type DiagnosticInput } from "../../support-data";
import { RELEASE } from "../../release";

async function digest(value: string) {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
}
export function diagnosticActor(actor: string) { return digest(actor.toLowerCase()); }
const echoed = new Set<string>();

export async function recordDiagnostic(input: DiagnosticInput, actor: string, source: "browser" | "server" = "server") {
  const metadata = diagnosticMetadata({ ...input, release: input.release || RELEASE });
  if (!metadata) return null;
  const now = new Date().toISOString();
  const bucket = now.slice(0, 16);
  const actorKey = await diagnosticActor(actor);
  const id = `LOG-${(await digest(JSON.stringify([actorKey, source, bucket, metadata.code, metadata.app, metadata.route, metadata.release, metadata.method, metadata.status, metadata.errorType, metadata.frames]))).slice(0, 24)}`;
  const severity = ["save-conflict", "slow-request"].includes(metadata.code) || (metadata.status && metadata.status < 500) ? "warning" : "error";
  // Only allowlisted metadata reaches the separate console/runtime fallback.
  if (!echoed.has(id)) {
    if (echoed.size > 1000) echoed.clear();
    echoed.add(id);
    console.warn(`EVENTOTRON_DIAGNOSTIC ${JSON.stringify({ id, source, severity, metadata, at: now })}`);
  }
  try {
    const db = await getSuiteD1();
    const cutoff = new Date(Date.now() - 30 * 86400_000).toISOString();
    const result = await db.batch([
      db.prepare("DELETE FROM support_diagnostics WHERE last_seen_at < ?").bind(cutoff),
      db.prepare("INSERT INTO support_diagnostics (id, actor_key, bucket, code, app, severity, source, release, metadata, first_seen_at, last_seen_at) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE (SELECT coalesce(sum(count), 0) FROM support_diagnostics WHERE actor_key = ? AND bucket = ? AND source = ?) < ? ON CONFLICT(id) DO UPDATE SET count = count + 1, last_seen_at = excluded.last_seen_at RETURNING id")
        .bind(id, actorKey, bucket, metadata.code, metadata.app, severity, source, metadata.release, JSON.stringify(metadata), now, now, actorKey, bucket, source, source === "browser" ? 60 : 300),
      db.prepare("DELETE FROM support_diagnostics WHERE id IN (SELECT id FROM support_diagnostics ORDER BY last_seen_at DESC, id DESC LIMIT -1 OFFSET 10000)"),
    ]);
    return result[1].results.length ? { id, stored: true } : null;
  } catch {
    return { id, stored: false };
  }
}
