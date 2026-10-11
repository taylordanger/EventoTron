import { spawn } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { findAvailablePort } from "./start-local.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const directory = await mkdtemp(join(tmpdir(), "eventotron-browser-"));
const port = await findAvailablePort(3023);
const origin = `http://127.0.0.1:${port}`;
const env = { ...process.env, PATH: `${dirname(process.execPath)}${process.platform === "win32" ? ";" : ":"}${process.env.PATH || ""}`, WRANGLER_LOG_PATH: join(directory, "wrangler.log"), EVENTOTRON_QA_ARTIFACT_DIR: directory, EVENTOTRON_ISOLATED_QA: "1", EVENTOTRON_QA_URL: origin };
let serverOutput = "";
let exited = false;
const server = spawn(process.execPath, ["node_modules/wrangler/bin/wrangler.js", "dev", "--config", "dist/server/wrangler.json", "--local", "--ip", "127.0.0.1", "--persist-to", join(directory, "database"), "--var", "EVENTOTRON_LOCAL_MODE:1", "--port", String(port), "--show-interactive-dev-session", "false"], { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] });
server.on("error", error => { serverOutput += error.message; exited = true; });
server.on("exit", () => { exited = true; });
for (const stream of [server.stdout, server.stderr]) stream.on("data", chunk => { serverOutput = (serverOutput + chunk.toString()).slice(-16000); });

async function run(script) {
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script], { cwd: root, env, stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code, signal) => code === 0 ? resolve() : reject(new Error(`${script} failed (${signal || code}).`)));
  });
}

try {
  console.log(`Disposable browser-test database: ${directory}`);
  // Never inherit a caller's daily-use URL or database directory.
  const deadline = Date.now() + 60000;
  let ready = false;
  while (!exited && Date.now() < deadline) {
    try {
      const response = await fetch(`${origin}/api/health`, { signal: AbortSignal.timeout(2000) });
      if (response.ok && (await response.json()).status === "ready") { ready = true; break; }
    } catch { /* The worker may still be starting. */ }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  if (!ready) throw new Error(`Isolated QA server did not become ready.\n${serverOutput}`);
  for (const script of ["scripts/verify-home-calendar.mjs", "scripts/verify-suite-appearance.mjs", "scripts/verify-personal-responsive.mjs"]) await run(script);
} finally {
  if (!exited) {
    await new Promise(resolve => {
      const timer = setTimeout(() => server.kill("SIGKILL"), 5000);
      server.once("exit", () => { clearTimeout(timer); resolve(); });
      server.kill("SIGTERM");
    });
  }
  console.log(`QA logs/database retained at ${directory}; the daily-use database was not used.`);
}
