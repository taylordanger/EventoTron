import { createServer } from "node:http";
import { readFile } from "node:fs/promises";

const logDir = `${process.env.HOME}/Library/Logs/EventoTron`;
const pidFile = `${logDir}/eventotron.pid`;
const controlPort = Number(process.env.EVENTOTRON_CONTROL_PORT ?? "3101");
const backendPort = Number(process.env.EVENTOTRON_PORT ?? process.argv[2] ?? "3001");

async function readBackendPid() {
  const value = await readFile(pidFile, "utf8").catch(() => "");
  const pid = Number(value.trim());
  return Number.isInteger(pid) && pid > 0 ? pid : null;
}

async function stopBackend() {
  const pid = await readBackendPid();
  if (!pid) return { stopped: false, reason: "No backend pid file was found." };
  try {
    process.kill(pid, "SIGTERM");
    return { stopped: true, pid };
  } catch (error) {
    return {
      stopped: false,
      pid,
      reason: error instanceof Error ? error.message : "Could not stop backend.",
    };
  }
}

function writeJson(response, status, payload) {
  response.writeHead(status, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "no-store",
    "Content-Type": "application/json",
  });
  response.end(JSON.stringify(payload));
}

const server = createServer(async (request, response) => {
  if (request.method === "OPTIONS") {
    writeJson(response, 204, {});
    return;
  }

  if (request.url === "/status" && request.method === "GET") {
    writeJson(response, 200, {
      service: "eventotron-desktop-control",
      backendPort,
      controlPort,
      pid: await readBackendPid(),
    });
    return;
  }

  if (request.url === "/quit" && request.method === "POST") {
    const result = await stopBackend();
    writeJson(response, result.stopped ? 200 : 500, {
      service: "eventotron-desktop-control",
      quitting: result.stopped,
      message: result.stopped ? "EventoTron is quitting. Double-click the app to restart." : result.reason,
      ...result,
    });
    if (result.stopped) {
      setTimeout(() => {
        server.close();
        process.exit(0);
      }, 2000);
    }
    return;
  }

  writeJson(response, 404, { error: "Unknown EventoTron desktop control route." });
});

server.listen(controlPort, "127.0.0.1", () => {
  console.log(`[${new Date().toISOString()}] EventoTron desktop control listening on http://127.0.0.1:${controlPort}.`);
});

server.on("error", (error) => {
  console.error(`EventoTron desktop control could not start: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
