import assert from "node:assert/strict";
import test from "node:test";
import { isLocalRequest, isLocalWriteAllowed } from "../app/api/_lib/role.ts";

const origin = "http://localhost:3000";
const makeRequest = (method, headers = {}) => new Request(`${origin}/api/events`, { method, headers });

test("local write policy rejects foreign origins and browser cross-site metadata on every unsafe method", () => {
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    for (const headers of [
      { origin: "https://evil.example" },
      { origin: "null" },
      { origin: "http://localhost:9999" },
      { origin: "http://127.0.0.1:3000" },
      { origin: "https://localhost:3000" },
      { "sec-fetch-site": "cross-site" },
      { "sec-fetch-site": "same-site" },
      { "sec-fetch-site": "none" },
      { origin, "sec-fetch-site": "cross-site" },
    ]) assert.equal(isLocalWriteAllowed(makeRequest(method, headers)), false, `${method}: ${JSON.stringify(headers)}`);
  }
});

test("local write policy preserves same-origin browser requests, CLI requests and safe methods", () => {
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    for (const headers of [{}, { origin }, { "sec-fetch-site": "same-origin" }, { origin, "sec-fetch-site": "same-origin" }]) {
      assert.equal(isLocalWriteAllowed(makeRequest(method, headers)), true);
    }
  }
  for (const method of ["GET", "HEAD", "OPTIONS"]) {
    assert.equal(isLocalWriteAllowed(makeRequest(method, { origin: "https://evil.example", "sec-fetch-site": "cross-site" })), true);
  }
  assert.equal(isLocalRequest(makeRequest("POST"), {}), false, "hosted identity resolution never opts into the local policy");
});

process.env.EVENTOTRON_LOCAL_MODE = "1";
const { default: worker } = await import(`../dist/server/index.js?local-security=${process.pid}`);
const env = { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } };
const ctx = { waitUntil() {}, passThroughOnException() {} };
const request = (path, init) => worker.fetch(new Request(origin + path, init), env, ctx);

test("real local routes reject simple cross-site POSTs before parsing or executing writes", async () => {
  for (const path of ["/api/import-recipe", "/api/import-product", "/api/meal-transfers", "/api/tabletron-transfers", "/api/tabletron-transfers/missing/complete", "/api/personal", "/api/workspace-backup", "/api/local-runtime"]) {
    const response = await request(path, {
      method: "POST",
      headers: { origin: "https://evil.example", "sec-fetch-site": "cross-site", "content-type": "text/plain" },
      body: path === "/api/local-runtime" ? '{"action":"quit"}' : "not JSON",
    });
    assert.equal(response.status, 403, path);
    assert.match((await response.json()).error, /own window/);
  }
  for (const method of ["PUT", "PATCH", "DELETE"]) {
    const response = await request("/api/events?id=must-not-delete", { method, headers: { origin: "https://evil.example" } });
    assert.equal(response.status, 403, method);
  }
});

test("real local routes retain safe reads and legitimate local POST validation", async () => {
  for (const headers of [{}, { origin, "sec-fetch-site": "same-origin" }]) {
    const response = await request("/api/import-recipe", { method: "POST", headers: { ...headers, "content-type": "application/json" }, body: '{"url":"http://127.0.0.1"}' });
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /public recipe/);
  }
  const response = await request("/api/event-bundle", { headers: { origin: "https://evil.example", "sec-fetch-site": "cross-site" } });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /event ID/);
});
