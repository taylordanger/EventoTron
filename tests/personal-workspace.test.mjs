import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { readFile } from "node:fs/promises";
import { personalOwner, personalTime, validatePersonalDraft } from "../app/personal-data.ts";
import { createPersonal, deletePersonal, exportPersonal, listPersonal, readPersonal, updatePersonal } from "../app/api/_lib/personal-store.ts";

const migration = await readFile(new URL("../drizzle/0009_personal_workspace.sql", import.meta.url), "utf8");
const alice = personalOwner({ source: "access", email: "alice@example.test" });
const bob = personalOwner({ source: "access", email: "bob@example.test" });
const draft = { id: "00000000-0000-4000-8000-000000000001", kind: "event", title: "Dentist", date: "2026-10-10", start: "09:00", end: "10:00", location: "Clinic", details: "Personal details", pinned: false };

function fixture() {
  const sqlite = new DatabaseSync(":memory:"); sqlite.exec(migration);
  const db = { prepare(sql) { const statement = sqlite.prepare(sql); return { bind(...params) { return { async all() { return { results: statement.all(...params) }; } }; } }; } };
  return { sqlite, db };
}

test("personal ownership follows verified identity, not local actor labels or admin role", () => {
  assert.equal(personalOwner({ source: "local", email: "alice@example.test" }), "local:operator");
  assert.equal(personalOwner({ source: "local", email: "bob@example.test" }), "local:operator");
  assert.equal(personalOwner({ source: "access", email: "ALICE@example.test", role: "admin" }), alice);
  assert.notEqual(alice, bob);
});

test("personal dates, times, content lengths and note fields are validated", () => {
  assert.deepEqual(validatePersonalDraft({ ...draft, owner: bob }), draft);
  for (const change of [{ date: "2026-02-30" }, { date: "2026-13-01" }, { start: "24:00" }, { end: "08:00" }, { title: "  " }, { title: "a".repeat(161) }, { details: "a".repeat(12001) }, { pinned: true }, { kind: "anything" }, { id: "../notes" }]) assert.equal(validatePersonalDraft({ ...draft, ...change }), null);
  assert.equal(validatePersonalDraft({ ...draft, kind: "note" }), null);
  assert.ok(validatePersonalDraft({ ...draft, kind: "note", date: "", start: "", end: "", location: "", pinned: true }));
  assert.equal(personalTime(draft), "9:00 AM - 10:00 AM");
  assert.equal(personalTime({ start: "", end: "" }), "All day");
});

test("every private read/export/update/delete is owner-scoped, even with known IDs", async () => {
  const { sqlite, db } = fixture();
  try {
    const saved = (await createPersonal(db, alice, draft)).item;
    assert.equal(await readPersonal(db, bob, draft.id), null);
    assert.deepEqual(await listPersonal(db, bob), []);
    assert.deepEqual(await exportPersonal(db, bob), []);
    assert.equal((await updatePersonal(db, bob, { ...draft, title: "Stolen" }, saved.updatedAt)).status, 404);
    assert.equal((await deletePersonal(db, bob, draft.id, saved.updatedAt)).status, 404);
    assert.equal((await readPersonal(db, alice, draft.id)).title, "Dentist");
    assert.equal((await exportPersonal(db, alice))[0].details, "Personal details");
    assert.ok(!(await listPersonal(db, alice))[0].details);
    assert.ok(!("owner" in (await readPersonal(db, alice, draft.id))));
    assert.equal((await createPersonal(db, bob, { ...draft, title: "Bob's event" })).status, 201);
    assert.equal((await readPersonal(db, alice, draft.id)).title, "Dentist");
  } finally { sqlite.close(); }
});

test("private writes are atomic, revision-checked and safe to retry", async () => {
  const { sqlite, db } = fixture();
  try {
    const first = await createPersonal(db, alice, draft);
    assert.equal(first.status, 201);
    assert.equal((await createPersonal(db, alice, draft)).status, 200);
    assert.equal((await createPersonal(db, alice, { ...draft, details: "Changed retry" })).status, 409);
    const [left, right] = await Promise.all([updatePersonal(db, alice, { ...draft, title: "Left tab" }, first.item.updatedAt), updatePersonal(db, alice, { ...draft, title: "Right tab" }, first.item.updatedAt)]);
    assert.equal(left.status, 200); assert.equal(right.status, 409);
    assert.equal(right.current.title, "Left tab");
    assert.equal((await deletePersonal(db, alice, draft.id, first.item.updatedAt)).status, 409);
    assert.equal((await deletePersonal(db, alice, draft.id, left.item.updatedAt)).status, 204);
    assert.equal(await readPersonal(db, alice, draft.id), null);
    assert.equal((await updatePersonal(db, alice, draft, left.item.updatedAt)).status, 404);
  } finally { sqlite.close(); }
});

test("notes persist with pinning and stay separate from personal events", async () => {
  const { sqlite, db } = fixture();
  try {
    const note = { ...draft, kind: "note", title: "Handoff reminder", date: "", start: "", end: "", location: "", pinned: true };
    await createPersonal(db, alice, draft); const saved = (await createPersonal(db, alice, { ...note, id: crypto.randomUUID() })).item;
    assert.equal((await listPersonal(db, alice))[0].kind, "note");
    assert.equal((await readPersonal(db, alice, saved.id)).pinned, true);
    assert.equal((await updatePersonal(db, alice, { ...draft, id: saved.id }, saved.updatedAt)).status, 409);
  } finally { sqlite.close(); }
});

test("private item limit is enforced per owner without blocking existing edits", async () => {
  const { sqlite, db } = fixture();
  try {
    const insert = sqlite.prepare("INSERT INTO personal_items (owner,id,kind,title,created_at,updated_at) VALUES (?,?,'note','Note','2026-01-01','2026-01-01')");
    for (let i = 0; i < 2000; i++) insert.run(alice, String(i));
    assert.equal((await createPersonal(db, alice, draft)).status, 429);
    assert.equal((await createPersonal(db, bob, draft)).status, 201);
  } finally { sqlite.close(); }
});

test("personal routes have no owner override, shared backup or audit content writes", async () => {
  const route = await readFile(new URL("../app/api/personal/route.ts", import.meta.url), "utf8");
  assert.equal((route.match(/withRole\("staff"/g) || []).length, 4);
  assert.doesNotMatch(route, /role === "admin"|body\.owner|params.get\("owner"\)|x-eventotron-actor/);
  assert.match(route, /private, no-store/);
  const backup = await readFile(new URL("../app/api/workspace-backup/route.ts", import.meta.url), "utf8");
  assert.doesNotMatch(backup, /personal_items|personalItems|exportPersonal/);
});
