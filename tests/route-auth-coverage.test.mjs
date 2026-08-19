import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const apiDir = fileURLToPath(new URL("../app/api", import.meta.url));

// Routes intentionally left ungated. Every other exported handler in app/api/**/route.ts
// must run through withRole()/requireRole() from app/api/_lib/auth.ts — this test exists so a
// new or edited route can't silently ship without a role check.
const PUBLIC_ROUTES = new Set([
  "local-runtime/route.ts", // self-gates via its own isLocalRequest() + desktop-control handshake
  "health/route.ts", // defense-in-depth only; Cloudflare Access is expected to gate the whole hostname
  "session/route.ts", // returns the caller's own identity so the UI can render a login state
]);

async function findRouteFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name.startsWith("_")) continue; // shared lib code, not a route
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await findRouteFiles(full));
    } else if (entry.name === "route.ts") {
      files.push(full);
    }
  }
  return files;
}

test("every API route handler is gated by withRole (or explicitly allowlisted as public)", async () => {
  const routeFiles = await findRouteFiles(apiDir);
  assert.ok(routeFiles.length > 10, "sanity check: should find the known route files");

  const unguarded = [];
  for (const file of routeFiles) {
    const relative = path.relative(apiDir, file);
    const source = await readFile(file, "utf8");
    const hasHandler = /export (const|async function) (GET|POST|PUT|PATCH|DELETE)\b/.test(source);
    if (!hasHandler) continue;
    if (PUBLIC_ROUTES.has(relative)) continue;
    if (!source.includes("withRole(")) unguarded.push(relative);
  }

  assert.deepEqual(unguarded, [], `these routes export a handler without withRole(): ${unguarded.join(", ")}`);
});

test("the public-route allowlist only contains routes that actually exist", async () => {
  const routeFiles = (await findRouteFiles(apiDir)).map((file) => path.relative(apiDir, file));
  for (const allowed of PUBLIC_ROUTES) {
    assert.ok(routeFiles.includes(allowed), `${allowed} is allowlisted but no longer exists`);
  }
});

test("the deployable Worker config never enables local mode", async () => {
  // Local mode grants an implicit admin with no sign-in, so it must exist only
  // on a developer machine. vite.config.ts injects EVENTOTRON_LOCAL_MODE while
  // serving; this asserts the built artifact — the thing that actually gets
  // deployed — did not inherit it.
  const configPath = fileURLToPath(new URL("../dist/server/wrangler.json", import.meta.url));
  const raw = await readFile(configPath, "utf8").catch(() => null);
  assert.ok(raw, "run `npm run build` before this test; dist/server/wrangler.json is missing");
  const config = JSON.parse(raw);
  assert.equal(
    config.vars?.EVENTOTRON_LOCAL_MODE,
    undefined,
    "the deployable config enables local mode, which would grant admin without sign-in",
  );
});

test("local mode is opted into explicitly by each local runtime", async () => {
  const [viteConfig, startLocal] = await Promise.all([
    readFile(new URL("../vite.config.ts", import.meta.url), "utf8"),
    readFile(new URL("../scripts/start-local.mjs", import.meta.url), "utf8"),
  ]);
  // Dev server: only while serving, never in the build that gets deployed.
  assert.match(viteConfig, /command === "serve"/);
  assert.match(viteConfig, /EVENTOTRON_LOCAL_MODE/);
  // Local production runtime passes it as an explicit Wrangler var.
  assert.match(startLocal, /"EVENTOTRON_LOCAL_MODE:1"/);
});

test("deploy preflight blocks the dangerous mistakes", async () => {
  const { preflightProblems, PLACEHOLDER_DATABASE_ID } = await import(
    new URL("../scripts/preflight-deploy.mjs", import.meta.url).href
  );
  // Shipping against the placeholder means the app quietly is not your data.
  assert.equal(preflightProblems({}).length, 1);
  assert.match(preflightProblems({}).join(), /EVENTOTRON_D1_DATABASE_ID is not set/);
  assert.match(
    preflightProblems({ EVENTOTRON_D1_DATABASE_ID: PLACEHOLDER_DATABASE_ID }).join(),
    /still the placeholder/,
  );
  // Shipping with local mode on would grant admin to anyone.
  assert.match(
    preflightProblems({ EVENTOTRON_D1_DATABASE_ID: "real-id", EVENTOTRON_LOCAL_MODE: "1" }).join(),
    /grants admin with no sign-in/,
  );
  assert.deepEqual(preflightProblems({ EVENTOTRON_D1_DATABASE_ID: "real-id" }), []);
});
