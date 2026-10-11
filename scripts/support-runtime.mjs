import { appendFile, mkdir, rename, stat } from "node:fs/promises";
import { dirname } from "node:path";
import { stripVTControlCharacters } from "node:util";

export function safeRuntimeRecord(value) {
  if (!value || typeof value !== "object") return null;
  if (["runtime-start", "runtime-stop", "runtime-restart", "runtime-crash-loop", "backup-failed"].includes(value.code)) {
    return { code: value.code, at: new Date().toISOString(), ...(Number.isInteger(value.exitCode) ? { exitCode: value.exitCode } : {}), ...(Number.isInteger(value.attempt) ? { attempt: value.attempt } : {}) };
  }
  if (!/^LOG-[a-f0-9]{24}$/.test(value.id ?? "")) return null;
  const metadata = value.metadata;
  if (!metadata || !/^[a-z-]{1,40}$/.test(metadata.code ?? "") || !/^\/(?:[\w/:-]*)$/.test(metadata.route ?? "")) return null;
  return { id: value.id, at: new Date().toISOString(), source: value.source === "browser" ? "browser" : "server", severity: value.severity === "warning" ? "warning" : "error", metadata: {
    code: metadata.code, route: metadata.route,
    release: /^[\w.+-]{1,100}$/.test(metadata.release ?? "") ? metadata.release : "unknown",
    app: ["calendar", "tabletron", "foodotron", "scheduluotron", "settings", "master-report", "support", "system"].includes(metadata.app) ? metadata.app : "system",
    ...(["Error", "TypeError", "RangeError", "SyntaxError", "ReferenceError", "DatabaseError", "NetworkError"].includes(metadata.errorType) ? { errorType: metadata.errorType } : {}),
    ...(Array.isArray(metadata.frames) ? { frames: metadata.frames.filter(frame => typeof frame === "string" && frame.length <= 240 && /^(?:\/assets\/[\w.-]+\.js|server\/index\.js|app\/[\w/.-]+\.[jt]sx?|worker\/index\.ts):\d{1,7}:\d{1,7}$/.test(frame)).slice(0, 8) } : {}),
    ...(Number.isInteger(metadata.status) ? { status: metadata.status } : {}),
    ...(Number.isFinite(metadata.durationMs) ? { durationMs: Math.max(0, Math.min(600_000, metadata.durationMs)) } : {}),
  } };
}

export function createRuntimeLog(path, maximumBytes = 5_000_000) {
  let tail = Promise.resolve();
  return {
    write(value) {
      const record = safeRuntimeRecord(value); if (!record) return tail;
      tail = tail.then(async () => {
        await mkdir(dirname(path), { recursive: true, mode: 0o700 });
        const size = await stat(path).then(info => info.size).catch(() => 0);
        if (size >= maximumBytes) {
          for (let i = 2; i >= 0; i--) {
            try { await rename(i ? `${path}.${i}` : path, `${path}.${i + 1}`); }
            catch (error) { if (error.code !== "ENOENT") throw error; }
          }
        }
        await appendFile(path, `${JSON.stringify(record)}\n`, { mode: 0o600 });
      }).catch(() => console.warn("EventoTron support runtime log could not be written."));
      return tail;
    },
    flush() { return tail; },
  };
}

export function captureRuntimeOutput(stream, output, log) {
  let partial = "";
  stream.on("data", chunk => {
    output.write(chunk);
    partial = (partial + chunk.toString()).slice(-65536);
    const lines = partial.split(/\r?\n/); partial = lines.pop() || "";
    for (const raw of lines) {
      const line = stripVTControlCharacters(raw);
      const start = line.indexOf("EVENTOTRON_DIAGNOSTIC ");
      if (start < 0) continue;
      try { void log.write(JSON.parse(line.slice(start + "EVENTOTRON_DIAGNOSTIC ".length))); } catch {}
    }
  });
}
