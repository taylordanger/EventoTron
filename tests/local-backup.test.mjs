import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BACKUP_KEYS, createLocalBackup, localBackupUrl, validateLocalBackup } from "../scripts/backup-local.mjs";

function fixture() {
  return { format: "eventotron-workspace-backup", version: 2, source: "database", exportedAt: new Date().toISOString(), data: Object.fromEntries(BACKUP_KEYS.map((key) => [key, []])), counts: Object.fromEntries(BACKUP_KEYS.map((key) => [key, 0])) };
}

test("backup validation rejects incomplete, fallback, mismatched and duplicate exports", () => {
  assert.equal(validateLocalBackup(fixture()).events, 0);
  const missing = fixture(); delete missing.data.rooms;
  assert.throws(() => validateLocalBackup(missing));
  assert.throws(() => validateLocalBackup({ ...fixture(), source: "local" }));
  const mismatch = fixture(); mismatch.counts.events = 1;
  assert.throws(() => validateLocalBackup(mismatch));
  const duplicate = fixture(); duplicate.data.events = [{ id: "same" }, { id: "same" }]; duplicate.counts.events = 2;
  assert.throws(() => validateLocalBackup(duplicate));
});

test("backup origins cannot send private data requests to remote servers or redirects", () => {
  assert.equal(localBackupUrl("http://127.0.0.1:3022"), "http://127.0.0.1:3022");
  for (const value of ["https://example.com", "http://127.0.0.1.evil.test", "http://user:pass@localhost", "http://localhost/api", "http://localhost/?token=x"]) assert.throws(() => localBackupUrl(value));
});

test("database export keeps all table reads inside one D1 batch", async () => {
  const source = await readFile(new URL("../app/api/workspace-backup/route.ts", import.meta.url), "utf8");
  const exportRoute = source.slice(source.indexOf("export const GET"), source.indexOf("async function restoreDatabase"));
  assert.match(exportRoute, /await db\.batch\(\[/);
  assert.doesNotMatch(exportRoute, /Promise\.all/);
});

test("backup writes independently verified files without replacing previous backups", async () => {
  const directory = await mkdtemp(join(tmpdir(), "eventotron-backup-test-"));
  const backup = fixture();
  const request = async (url, options) => {
    assert.equal(options.redirect, "error");
    return Response.json(url.endsWith("/api/health") ? { status: "ready", database: "connected" } : backup);
  };
  try {
    const first = await createLocalBackup({ directory, request });
    const second = await createLocalBackup({ directory, request });
    assert.notEqual(first.path, second.path);
    assert.deepEqual(JSON.parse(await readFile(first.path, "utf8")), backup);
    assert.match(await readFile(first.checksumPath, "utf8"), new RegExp(`^${first.sha256}  eventotron-`));
    assert.equal((await readdir(directory)).length, 4);
    await assert.rejects(createLocalBackup({ directory, request: async () => Response.json({}, { status: 503 }) }));
    await assert.rejects(createLocalBackup({ directory, request: async () => Response.json({ status: "degraded", database: "connected" }) }));
    await assert.rejects(createLocalBackup({ directory: "relative", request }));
    assert.equal((await readdir(directory)).length, 4);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
