import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const BACKUP_KEYS = ["settings", "events", "eventAudit", "appletStates", "rooms", "roomLayouts", "layoutItems", "foodotronMeals", "recipes", "shoppingItems", "tabletronEvents", "scheduleItems", "calendarSources", "calendarEvents", "mealTransfers"];

export function validateLocalBackup(backup) {
  if (backup?.format !== "eventotron-workspace-backup" || backup.version !== 2 || backup.source !== "database" || !Number.isFinite(Date.parse(backup.exportedAt))) {
    throw new Error("Expected a version 2 database backup; no backup was accepted.");
  }
  const counts = {};
  for (const key of BACKUP_KEYS) {
    const rows = backup.data?.[key];
    if (!Array.isArray(rows) || rows.some((row) => !row || typeof row.id !== "string" || !row.id.trim()) || new Set(rows.map((row) => row.id)).size !== rows.length) {
      throw new Error(`Invalid or duplicate records in ${key}.`);
    }
    counts[key] = rows.length;
    if (backup.counts?.[key] !== rows.length) throw new Error(`Backup count mismatch in ${key}.`);
  }
  return counts;
}

export function localBackupUrl(value) {
  const url = new URL(value);
  if (url.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("Local backup requires an HTTP loopback origin, without credentials or a path.");
  }
  return url.origin;
}

export async function createLocalBackup({ directory, baseUrl = "http://127.0.0.1:3001", request = fetch }) {
  if (!directory || !isAbsolute(directory)) throw new Error("Choose an absolute backup directory with --dir or EVENTOTRON_BACKUP_DIR.");
  const origin = localBackupUrl(baseUrl);
  async function get(path) {
    const response = await request(`${origin}${path}`, { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(60_000) });
    if (!response.ok) throw new Error(`Backup request failed (${response.status}); previous backups were not changed.`);
    return response.json();
  }
  const health = await get("/api/health");
  if (health.status !== "ready" || health.database !== "connected") throw new Error("Database is not ready; refusing a potentially incomplete backup.");
  const backup = await get("/api/workspace-backup");
  const counts = validateLocalBackup(backup);
  const bytes = Buffer.from(`${JSON.stringify(backup, null, 2)}\n`);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const name = `eventotron-${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID()}.json`;
  const path = join(directory, name);
  const temporary = `${path}.partial`;
  try {
    await writeFile(temporary, bytes, { flag: "wx", mode: 0o600 });
    const stored = await readFile(temporary);
    validateLocalBackup(JSON.parse(stored.toString("utf8")));
    if (createHash("sha256").update(stored).digest("hex") !== sha256) throw new Error("Backup read-back checksum failed.");
    await rename(temporary, path);
    await writeFile(`${path}.sha256`, `${sha256}  ${name}\n`, { flag: "wx", mode: 0o600 });
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
  return { path, checksumPath: `${path}.sha256`, sha256, counts, exportedAt: backup.exportedAt };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help")) {
    console.log("npm run backup:local -- --dir /absolute/backup/folder [--url http://127.0.0.1:3001]\nCreates a verified backup and SHA-256 sidecar. Does not restore, prune, schedule, or prove off-device replication.");
    return;
  }
  const options = { directory: process.env.EVENTOTRON_BACKUP_DIR, baseUrl: process.env.EVENTOTRON_BACKUP_URL };
  for (let i = 0; i < args.length; i += 2) {
    if (!["--dir", "--url"].includes(args[i]) || !args[i + 1]) throw new Error("Use --dir /absolute/folder and optional --url http://127.0.0.1:3001.");
    options[args[i] === "--dir" ? "directory" : "baseUrl"] = args[i + 1];
  }
  console.log(JSON.stringify(await createLocalBackup(options), null, 2));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
