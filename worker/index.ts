/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { recordDiagnostic } from "../app/api/_lib/diagnostics";
import { diagnosticMetadata, requestDiagnosticCode, safeErrorDetails } from "../app/support-data";
import { RELEASE } from "../app/release";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    try {
      const response = await handler.fetch(request, env, ctx);
      if (response.status < 500 || response.headers.has("x-eventotron-error-ref")) return response;
      const metadata = diagnosticMetadata({ code: requestDiagnosticCode(url.pathname, response.status, request.method), app: "system", route: url.pathname, release: RELEASE, status: response.status, method: request.method })!;
      const logged = await recordDiagnostic(metadata, "system");
      const headers = new Headers(response.headers); if (logged) headers.set("x-eventotron-error-ref", logged.id);
      return new Response(response.body, { status: response.status, headers });
    } catch (error) {
      const metadata = diagnosticMetadata({ code: "server-exception", app: "system", route: url.pathname, release: RELEASE, status: 500, method: request.method, ...safeErrorDetails(error) })!;
      const logged = await recordDiagnostic(metadata, "system").catch(() => null);
      return new Response("EventoTron could not display this page.", { status: 500, headers: { "Cache-Control": "no-store", ...(logged ? { "x-eventotron-error-ref": logged.id } : {}) } });
    }
  },
};

export default worker;
