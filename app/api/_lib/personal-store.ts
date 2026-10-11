import { type PersonalDraft, type PersonalItem, type PersonalSummary } from "../../personal-data.ts";

type Statement = { bind(...values: unknown[]): Statement; all<T>(): Promise<{ results: T[] }> };
export type PersonalDb = { prepare(sql: string): Statement };
const columns = "id, kind, title, date, start, end, location, details, pinned, created_at AS createdAt, updated_at AS updatedAt";
type Row = Omit<PersonalItem, "pinned"> & { pinned: number };
function item(row: Row): PersonalItem { return { ...row, pinned: Boolean(row.pinned) }; }
const revision = (previous = "") => new Date(Math.max(Date.now(), (Date.parse(previous) || 0) + 1)).toISOString();

export async function listPersonal(db: PersonalDb, owner: string): Promise<PersonalSummary[]> {
  const result = await db.prepare(`SELECT id, kind, title, date, start, end, location, pinned, created_at AS createdAt, updated_at AS updatedAt FROM personal_items WHERE owner = ? ORDER BY pinned DESC, date ASC, start ASC, updated_at DESC LIMIT 2000`).bind(owner).all<Omit<Row, "details">>();
  return result.results.map(row => ({ ...row, pinned: Boolean(row.pinned) }));
}

export async function readPersonal(db: PersonalDb, owner: string, id: string) {
  const result = await db.prepare(`SELECT ${columns} FROM personal_items WHERE owner = ? AND id = ?`).bind(owner, id).all<Row>();
  return result.results[0] ? item(result.results[0]) : null;
}

export async function exportPersonal(db: PersonalDb, owner: string) {
  const result = await db.prepare(`SELECT ${columns} FROM personal_items WHERE owner = ? ORDER BY created_at LIMIT 2000`).bind(owner).all<Row>();
  return result.results.map(item);
}

export async function createPersonal(db: PersonalDb, owner: string, draft: PersonalDraft) {
  const now = revision();
  const result = await db.prepare(`INSERT INTO personal_items (owner, id, kind, title, date, start, end, location, details, pinned, created_at, updated_at) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE (SELECT count(*) FROM personal_items WHERE owner = ?) < 2000 ON CONFLICT(owner, id) DO NOTHING RETURNING ${columns}`)
    .bind(owner, draft.id, draft.kind, draft.title, draft.date, draft.start, draft.end, draft.location, draft.details, Number(draft.pinned), now, now, owner).all<Row>();
  if (result.results[0]) return { item: item(result.results[0]), status: 201 };
  const current = await readPersonal(db, owner, draft.id);
  if (!current) return { error: "Your workspace has reached 2,000 items. Export and remove older items before adding more.", status: 429 };
  const matches = (Object.keys(draft) as Array<keyof PersonalDraft>).every(key => draft[key] === current[key]);
  return matches ? { item: current, status: 200 } : { error: "This item was already saved with different content. Your draft is unchanged.", current, status: 409 };
}

export async function updatePersonal(db: PersonalDb, owner: string, draft: PersonalDraft, expected: string) {
  const now = revision(expected);
  const result = await db.prepare(`UPDATE personal_items SET title = ?, date = ?, start = ?, end = ?, location = ?, details = ?, pinned = ?, updated_at = ? WHERE owner = ? AND id = ? AND kind = ? AND updated_at = ? RETURNING ${columns}`)
    .bind(draft.title, draft.date, draft.start, draft.end, draft.location, draft.details, Number(draft.pinned), now, owner, draft.id, draft.kind, expected).all<Row>();
  if (result.results[0]) return { item: item(result.results[0]), status: 200 };
  const current = await readPersonal(db, owner, draft.id);
  return current ? { error: "This item changed in another tab. Keep your draft or reload the saved version.", current, status: 409 } : { error: "Item not found.", status: 404 };
}

export async function deletePersonal(db: PersonalDb, owner: string, id: string, expected: string) {
  const result = await db.prepare("DELETE FROM personal_items WHERE owner = ? AND id = ? AND updated_at = ? RETURNING id").bind(owner, id, expected).all<{ id: string }>();
  if (result.results[0]) return { status: 204 };
  const current = await readPersonal(db, owner, id);
  return current ? { error: "This item changed in another tab. Reload it before deleting.", current, status: 409 } : { error: "Item not found.", status: 404 };
}
