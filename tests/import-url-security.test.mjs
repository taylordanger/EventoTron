import assert from "node:assert/strict";
import test from "node:test";
import { isPublicImportUrl } from "../app/api/_lib/import-url.ts";

const blocked = [
  "http://localhost", "http://localhost.", "http://a.localhost", "http://printer.local",
  "http://0.0.0.0", "http://0.1.2.3", "http://127.1", "http://10.255.255.255",
  "http://172.16.0.1", "http://172.31.255.255", "http://192.168.1.1", "http://169.254.1.1",
  "http://100.64.0.1", "http://100.127.255.255", "http://224.0.0.1", "http://255.255.255.255",
  "http://2130706433", "http://0177.0.0.1", "http://0x7f000001", "http://0x0a000001", "http://3232235777",
  "http://[::]", "http://[::1]", "http://[fc00::1]", "http://[fdff:ffff::1]",
  "http://[fe80::1]", "http://[febf:ffff::1]", "http://[fec0::1]", "http://[ff02::1]",
  "http://[::ffff:127.0.0.1]", "http://[::ffff:10.0.0.1]", "http://[0:0:0:0:0:ffff:c0a8:101]",
  "http://[::ffff:8.8.8.8]", "file:///etc/passwd", "ftp://example.com/file",
];

test("shared import guard rejects non-public literal addresses and canonical numeric IP forms", () => {
  for (const value of blocked) assert.equal(isPublicImportUrl(new URL(value)), false, value);
});

test("shared import guard permits public addresses and legitimate HTTP(S) names", () => {
  for (const value of ["https://example.com/recipe", "http://store.example.com", "https://8.8.8.8", "http://172.15.255.255", "http://172.32.0.1", "http://100.63.255.255", "http://100.128.0.1", "http://[2001:4860:4860::8888]", "http://[2606:4700:4700::1111]"]) {
    assert.equal(isPublicImportUrl(new URL(value)), true, value);
  }
});

process.env.EVENTOTRON_LOCAL_MODE = "1";
const { default: worker } = await import(`../dist/server/index.js?import-security=${process.pid}`);
const env = { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } };
const ctx = { waitUntil() {}, passThroughOnException() {} };
const request = (path, url) => worker.fetch(new Request(`http://localhost${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url }) }), env, ctx);

test("both real import routes block unsafe initial URLs before outbound fetch", async t => {
  const fetch = t.mock.method(globalThis, "fetch", async () => { throw new Error("Unexpected outbound request"); });
  for (const path of ["/api/import-recipe", "/api/import-product"]) {
    for (const url of blocked) assert.equal((await request(path, url)).status, 400, `${path}: ${url}`);
  }
  assert.equal(fetch.mock.callCount(), 0);
});

test("both real import routes recheck every redirect hop and preserve successful parsing", async t => {
  for (const path of ["/api/import-recipe", "/api/import-product"]) {
    for (const destination of ["http://[fc00::1]", "http://[fe80::1]", "http://[::ffff:127.0.0.1]", "http://0x7f000001", "file:///etc/passwd"]) {
      const calls = [];
      const fetch = t.mock.method(globalThis, "fetch", async (url, options) => {
        calls.push(String(url)); assert.equal(options.redirect, "manual");
        return new Response(null, { status: 302, headers: { location: calls.length === 1 ? "/second" : destination } });
      });
      const response = await request(path, "https://example.com/start");
      assert.equal(response.status, 400);
      assert.match((await response.json()).error, /redirected/);
      assert.deepEqual(calls, ["https://example.com/start", "https://example.com/second"]);
      fetch.mock.restore();
    }
    const value = path.endsWith("recipe") ? { "@type": "Recipe", name: "Test recipe", recipeIngredient: ["1 cup rice"], recipeYield: "4" } : { "@type": "Product", name: "Rice 2 lb", offers: { price: 5 } };
    const fetch = t.mock.method(globalThis, "fetch", async () => new Response(`<script type="application/ld+json">${JSON.stringify(value)}</script>`));
    const response = await request(path, "https://example.com/public");
    assert.equal(response.status, 200);
    assert.equal((await response.json()).name, value.name);
    assert.equal(fetch.mock.callCount(), 1);
    fetch.mock.restore();
  }
});
