import { closeSync, openSync } from "node:fs";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { findAvailablePort } from "./start-local.mjs";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const logDir = `${process.env.HOME}/Library/Logs/EventoTron`;
const pidFile = `${logDir}/eventotron.pid`;
const defaultPort = Number(process.env.EVENTOTRON_PORT ?? "3001");

function healthUrl(port) {
  return `http://127.0.0.1:${port}/api/health`;
}

function appUrl(port) {
  return `http://127.0.0.1:${port}/`;
}

async function fetchHealth(port) {
  try {
    const response = await fetch(healthUrl(port), { cache: "no-store" });
    if (!response.ok) return null;
    const health = await response.json();
    return health?.service === "eventotron" ? health : null;
  } catch {
    return null;
  }
}

async function waitForHealth(port, attempts = 60) {
  for (let index = 0; index < attempts; index += 1) {
    const health = await fetchHealth(port);
    if (health) return health;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return null;
}

async function existingEventoTronPort() {
  for (let offset = 0; offset < 20; offset += 1) {
    const port = defaultPort + offset;
    if (await fetchHealth(port)) return port;
  }
  return null;
}

async function ensureBuilt() {
  try {
    await Promise.all([
      access(`${projectRoot}dist/server/index.js`),
      access(`${projectRoot}dist/server/wrangler.json`),
    ]);
  } catch {
    const buildLog = openSync(`${logDir}/build.log`, "a");
    const result = spawnSync("npm", ["run", "build"], {
      cwd: projectRoot,
      env: { ...process.env, WRANGLER_LOG_PATH: ".wrangler/wrangler.log" },
      stdio: ["ignore", buildLog, buildLog],
    });
    closeSync(buildLog);
    if (result.status !== 0) {
      throw new Error("EventoTron could not build. See ~/Library/Logs/EventoTron/build.log.");
    }
  }
}

async function launchBrowser(port) {
  spawn("open", [appUrl(port)], { detached: true, stdio: "ignore" }).unref();
}

async function startServer(port) {
  const output = openSync(`${logDir}/eventotron.log`, "a");
  const child = spawn(process.execPath, ["scripts/start-local.mjs", String(port)], {
    cwd: projectRoot,
    detached: true,
    env: { ...process.env, EVENTOTRON_PORT: String(port) },
    stdio: ["ignore", output, output],
  });
  child.unref();
  closeSync(output);
  await writeFile(pidFile, String(child.pid));
  return child.pid;
}

async function main() {
  await mkdir(logDir, { recursive: true });
  console.log(`[${new Date().toISOString()}] EventoTron desktop launcher starting.`);

  const existingPort = await existingEventoTronPort();
  if (existingPort) {
    console.log(`EventoTron is already running on port ${existingPort}; opening it.`);
    await launchBrowser(existingPort);
    return;
  }

  await ensureBuilt();
  const port = await findAvailablePort(defaultPort);
  const pid = await startServer(port);
  console.log(`Started EventoTron backend process ${pid} on port ${port}.`);
  const health = await waitForHealth(port);
  if (!health) {
    const details = await readFile(`${logDir}/eventotron.log`, "utf8").catch(() => "");
    throw new Error(
      `EventoTron started but did not become ready on port ${port}.\n${details.slice(-1200)}`,
    );
  }
  console.log(`EventoTron is ready on ${appUrl(port)}.`);
  await launchBrowser(port);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
