import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

process.env.EVENTOTRON_LOCAL_MODE = "1";
const { default: worker } = await import(`../dist/server/index.js?transfer-origin=${process.pid}`);
const env = { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } };
const ctx = { waitUntil() {}, passThroughOnException() {} };

test("transfer preflights never grant access to other localhost origins", async () => {
  for (const path of ["/api/tabletron-transfers/missing", "/api/tabletron-transfers/missing/complete"]) {
    for (const origin of ["http://localhost:9999", "http://127.0.0.1:3000", "https://evil.example"]) {
      const response = await worker.fetch(new Request(`http://localhost${path}`, { method: "OPTIONS", headers: { origin, "access-control-request-method": "POST" } }), env, ctx);
      assert.equal(response.status, 204);
      assert.equal(response.headers.get("access-control-allow-origin"), null);
      assert.equal(response.headers.get("access-control-allow-methods"), null);
    }
  }
});

test("transfer completion preserves same-origin validation without CORS reflection", async () => {
  const response = await worker.fetch(new Request("http://localhost/api/tabletron-transfers/missing/complete", { method: "POST", headers: { origin: "http://localhost", "content-type": "application/json" }, body: "{}" }), env, ctx);
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /event ID/);
  assert.equal(response.headers.get("access-control-allow-origin"), null);
});

test("Tabletron transfer reads and completion no longer use the legacy source parameter", async () => {
  const source = await readFile(new URL("../app/tabletron/page.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /transferApiBase|params\.get\("source"\)/);
  assert.match(source, /fetch\(`\/api\/tabletron-transfers\//);
});
