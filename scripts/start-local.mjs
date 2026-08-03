import { access } from "node:fs/promises";
import net from "node:net";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

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

  const executable = fileURLToPath(new URL("../node_modules/.bin/wrangler", import.meta.url));
  const child = spawn(executable, [
    "dev",
    "--config",
    fileURLToPath(workerConfig),
    "--local",
    "--persist-to",
    ".wrangler/state",
    "--port",
    String(port),
    "--show-interactive-dev-session",
    "false",
  ], {
    cwd: projectRoot,
    env: { ...process.env, WRANGLER_LOG_PATH: ".wrangler/wrangler.log" },
    stdio: "inherit",
  });
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => child.kill(signal));
  }
  child.once("exit", (code, signal) => {
    process.exitCode = code ?? (signal ? 1 : 0);
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  start().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
