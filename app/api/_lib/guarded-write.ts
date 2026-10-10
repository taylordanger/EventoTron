import { getSuiteD1 } from "@/db";

export function validExpectedRevision(body: { expectedUpdatedAt?: unknown }) {
  return body.expectedUpdatedAt === null || typeof body.expectedUpdatedAt === "string";
}

/** The guard and every derived write run in one D1 transaction. A failed
 * precondition rolls the entire batch back, including calendar configuration. */
export async function guardedWrite(
  table: "suite_settings" | "suite_applet_states" | "suite_calendar_sources",
  id: string,
  expected: string | null,
  statements: Array<{ toSQL(): { sql: string; params: unknown[] } }>,
  expectedPayload?: string,
  requireEventId?: string,
) {
  const db = await getSuiteD1();
  const token = crypto.randomUUID();
  const guard = db.prepare(`INSERT INTO suite_write_guards (token, accepted)
    SELECT ?, CASE WHEN COALESCE((SELECT updated_at FROM ${table} WHERE id = ?), '') = COALESCE(?, '')
      AND (? IS NULL OR (SELECT payload FROM ${table} WHERE id = ?) = ?)
      AND (? IS NULL OR EXISTS (SELECT 1 FROM suite_events WHERE id = ?)) THEN 1 ELSE 0 END`)
    .bind(token, id, expected, expectedPayload ?? null, id, expectedPayload ?? null, requireEventId ?? null, requireEventId ?? null);
  const writes = statements.map((statement) => {
    const query = statement.toSQL();
    return db.prepare(query.sql).bind(...query.params);
  });
  await db.batch([guard, ...writes, db.prepare("DELETE FROM suite_write_guards WHERE token = ?").bind(token)]);
}

export function revisionConflict(error: unknown) {
  return String(error).includes("CHECK constraint failed: accepted = 1");
}

export function nextRevision(previous?: string | null) {
  return new Date(Math.max(Date.now(), (Date.parse(previous ?? "") || 0) + 1)).toISOString();
}

export const noStore = { "Cache-Control": "no-store" };
