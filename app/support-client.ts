import { appFromPath, browserLabel, diagnosticMetadata, safeErrorDetails, type DiagnosticInput } from "./support-data";
import { RELEASE } from "./release";

type ContextEntry = { reference?: string; metadata: DiagnosticInput };
let recent: ContextEntry[] = [];
export function supportContext() { return recent.slice(-10); }
export function installDiagnostics() {
  const original = window.fetch;
  const send = original.bind(window);
  let active = true; let emitted = 0; let resetAt = Date.now();
  const seen = new Set<string>();
  try {
    const saved = JSON.parse(sessionStorage.getItem("eventotron-support-context") ?? "[]");
    recent = Array.isArray(saved) ? saved.flatMap(entry => {
      const metadata = diagnosticMetadata(entry?.metadata);
      return metadata ? [{ metadata, ...(typeof entry.reference === "string" && /^LOG-[a-f0-9]{24}$/.test(entry.reference) ? { reference: entry.reference } : {}) }] : [];
    }).slice(-10) : [];
  } catch {}
  function remember(metadata: DiagnosticInput, reference?: string) {
    recent = [...recent, { metadata, ...(reference && /^LOG-[a-f0-9]{24}$/.test(reference) ? { reference } : {}) }].slice(-10);
    try { sessionStorage.setItem("eventotron-support-context", JSON.stringify(recent)); } catch {}
  }
  async function capture(input: Partial<DiagnosticInput> & { code: DiagnosticInput["code"] }, reference?: string) {
    if (!active) return;
    const metadata = diagnosticMetadata({ app: appFromPath(location.pathname), route: location.pathname, release: RELEASE, browser: browserLabel(navigator.userAgent), ...input });
    if (!metadata) return;
    if (reference) { remember(metadata, reference); return; }
    if (Date.now() - resetAt > 60_000) { emitted = 0; seen.clear(); resetAt = Date.now(); }
    const key = JSON.stringify([metadata.code, metadata.route, metadata.method, metadata.status, metadata.errorType]);
    if (seen.has(key) || emitted >= 20) return;
    emitted++; seen.add(key); remember(metadata);
    try {
      const response = await send("/api/diagnostics", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(metadata), redirect: "error", signal: AbortSignal.timeout(5000) });
      if (response.ok) { const result = await response.json() as { id?: string }; if (result.id) remember(metadata, result.id); }
    } catch { /* The report download retains bounded diagnostics during an outage. */ }
  }
  function frames(error: unknown, filename?: string, line?: number, column?: number) {
    const result: string[] = [];
    if (filename) { try { const url = new URL(filename); if (url.origin === location.origin) result.push(`${url.pathname}:${line}:${column}`); } catch {} }
    if (error instanceof Error && error.stack) {
      for (const match of error.stack.split("\n").slice(1).join("\n").matchAll(/(https?:\/\/[^\s)]+):(\d+):(\d+)/g)) {
        try { const url = new URL(match[1]); if (url.origin === location.origin) result.push(`${url.pathname}:${match[2]}:${match[3]}`); } catch {}
      }
    }
    return diagnosticMetadata({ code: "browser-crash", frames: result })?.frames ?? [];
  }
  const onError = (event: ErrorEvent) => void capture({ code: "browser-crash", ...safeErrorDetails(event.error), frames: frames(event.error, event.filename, event.lineno, event.colno) });
  const onRejection = (event: PromiseRejectionEvent) => void capture({ code: "promise-rejection", ...safeErrorDetails(event.reason), frames: frames(event.reason) });
  window.addEventListener("error", onError); window.addEventListener("unhandledrejection", onRejection);
  const wrapped: typeof fetch = async (input, init) => {
    let url: URL;
    try { url = new URL(input instanceof Request ? input.url : String(input), location.href); } catch { return send(input, init); }
    if (url.origin !== location.origin || !url.pathname.startsWith("/api/") || url.pathname === "/api/diagnostics") return send(input, init);
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    headers.set("x-eventotron-app", appFromPath(location.pathname));
    const start = performance.now();
    try {
      const response = await send(input, { ...init, headers });
      const durationMs = performance.now() - start;
      if (method === "GET" && response.status === 404 && ["/api/settings", "/api/event-app-state"].includes(url.pathname)) return response;
      if (!response.ok || durationMs > 1500) void capture({ code: [409, 428].includes(response.status) ? "save-conflict" : !response.ok ? "request-failed" : "slow-request", route: url.pathname, method, status: response.status, durationMs }, response.headers.get("x-eventotron-error-ref") ?? undefined);
      return response;
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) void capture({ code: "network-failed", route: url.pathname, method, errorType: "NetworkError" });
      throw error;
    }
  };
  window.fetch = wrapped;
  return () => { active = false; if (window.fetch === wrapped) window.fetch = original; window.removeEventListener("error", onError); window.removeEventListener("unhandledrejection", onRejection); };
}
