const CONTROL_PORT = 3101;
const CONTROL_BASE = `http://127.0.0.1:${CONTROL_PORT}`;

function isLocalRequest(request: Request) {
  const hostname = new URL(request.url).hostname.toLowerCase();
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

async function readControlStatus() {
  try {
    const response = await fetch(`${CONTROL_BASE}/status`, { cache: "no-store" });
    if (!response.ok) return null;
    return await response.json() as {
      service?: string;
      backendPort?: number;
      controlPort?: number;
      pid?: number | null;
    };
  } catch {
    return null;
  }
}

async function runtimeCapabilities(request: Request) {
  const local = isLocalRequest(request);
  const control = local ? await readControlStatus() : null;
  return {
    local,
    desktop: control?.service === "eventotron-desktop-control",
    canQuit: Boolean(control),
    controlPort: control?.controlPort ?? CONTROL_PORT,
    backendPort: control?.backendPort ?? null,
    pid: control?.pid ?? null,
  };
}

export async function GET(request: Request) {
  return Response.json(await runtimeCapabilities(request), {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request) {
  if (!isLocalRequest(request)) {
    return Response.json(
      { error: "EventoTron can only be quit from a local desktop session." },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }

  const body = (await request.json().catch(() => ({}))) as { action?: string };
  if (body.action !== "quit") {
    return Response.json(
      { error: "Local runtime action must be `quit`." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const capabilities = await runtimeCapabilities(request);
  if (!capabilities.canQuit) {
    return Response.json(
      { error: "The EventoTron desktop control process is not running.", ...capabilities },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const response = await fetch(`${CONTROL_BASE}/quit`, { method: "POST" });
  const result = await response.json().catch(() => ({})) as { message?: string };
  return Response.json(
    { quitting: response.ok, message: result.message ?? "EventoTron quit request sent.", ...capabilities },
    { status: response.ok ? 200 : 500, headers: { "Cache-Control": "no-store" } },
  );
}
