import { access } from "node:fs/promises";
import net from "node:net";
import { spawn } from "node:child_process";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

/** Restart policy for the local backend. See launchWrangler below. */
export const RESTART_DELAY_MS = 1500;
export const RESTART_WINDOW_MS = 60_000;
export const MAX_RESTARTS = 5;

export function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.once("error", () => resolve(false));
    server.listen({ host: "127.0.0.1", port }, () => {
      server.close(() => resolve(true));
    });
  });
}

export async function findAvailablePort(startPort, attempts = 20, checkPort = isPortAvailable) {
  const firstPort = Number(startPort);
  if (!Number.isInteger(firstPort) || firstPort < 1 || firstPort > 65535) {
    throw new Error("EventoTron requires a valid local port.");
  }
  for (let offset = 0; offset < attempts && firstPort + offset <= 65535; offset += 1) {
    const port = firstPort + offset;
    if (await checkPort(port)) return port;
  }
  throw new Error(`No available local port found from ${firstPort} to ${firstPort + attempts - 1}.`);
}

async function start() {
  const projectRoot = fileURLToPath(new URL("../", import.meta.url));
  const productionWorker = new URL("../dist/server/index.js", import.meta.url);
  const workerConfig = new URL("../dist/server/wrangler.json", import.meta.url);
  try {
    await Promise.all([access(productionWorker), access(workerConfig)]);
  } catch {
    console.error("EventoTron has not been built. Run `npm run build` first.");
    process.exitCode = 1;
    return;
  }

  const requestedPort = process.env.EVENTOTRON_PORT ?? process.env.PORT ?? process.argv[2] ?? "3000";
  const port = await findAvailablePort(requestedPort);
  if (port !== Number(requestedPort)) {
    console.log(`Port ${requestedPort} is in use. EventoTron selected port ${port}.`);
  }
  console.log(`EventoTron is starting at http://localhost:${port}`);
  console.log(`System status: http://localhost:${port}/api/health`);

  const wranglerScript = fileURLToPath(new URL("../node_modules/wrangler/bin/wrangler.js", import.meta.url));
  const pathWithNode = [
    dirname(process.execPath),
    process.env.PATH,
  ].filter(Boolean).join(":");
  const wranglerArgs = [
    wranglerScript,
    "dev",
    "--config",
    fileURLToPath(workerConfig),
    "--local",
    "--persist-to",
    ".wrangler/state",
    // This runtime is genuinely local, so it opts into the implicit admin
    // operator. A deployed Worker is never started this way and never gets it.
    "--var",
    "EVENTOTRON_LOCAL_MODE:1",
    "--port",
    String(port),
    "--show-interactive-dev-session",
    "false",
  ];

  // Wrangler watches the built output and hot-reloads. Rebuilding while the app
  // is running makes it reload against a half-written bundle
  // ("No such module __vite_rsc_assets_manifest.js"), and it exits. Staff would
  // see a dead browser tab with nothing to act on, so bring it back rather than
  // leaving the venue without its run sheets mid-event.
  let child = null;
  let stopping = false;
  const restarts = [];

  function launchWrangler() {
    child = spawn(process.execPath, wranglerArgs, {
      cwd: projectRoot,
      env: { ...process.env, PATH: pathWithNode, WRANGLER_LOG_PATH: ".wrangler/wrangler.log" },
      stdio: "inherit",
    });

    child.once("exit", (code, signal) => {
      if (stopping) {
        process.exitCode = code ?? (signal ? 1 : 0);
        return;
      }

      const now = Date.now();
      restarts.push(now);
      while (restarts.length && now - restarts[0] > RESTART_WINDOW_MS) restarts.shift();

      // A crash loop means something is actually broken; restarting forever
      // would only bury the reason.
      if (restarts.length > MAX_RESTARTS) {
        console.error(
          `EventoTron stopped ${restarts.length} times in under ${Math.round(RESTART_WINDOW_MS / 1000)}s and will not restart again.`,
        );
        console.error("Check the output above, then start EventoTron again.");
        process.exitCode = code ?? 1;
        return;
      }

      console.log(
        `EventoTron stopped unexpectedly (${signal ?? `exit ${code}`}). Restarting in ${RESTART_DELAY_MS}ms — attempt ${restarts.length} of ${MAX_RESTARTS}.`,
      );
      setTimeout(launchWrangler, RESTART_DELAY_MS);
    });
  }

  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => {
      stopping = true;
      child?.kill(signal);
    });
  }

  launchWrangler();
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  start().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
