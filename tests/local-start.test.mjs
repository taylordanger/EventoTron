import assert from "node:assert/strict";
import test from "node:test";
import { findAvailablePort } from "../scripts/start-local.mjs";
import { readFile } from "node:fs/promises";

test("local production launcher skips occupied ports", async () => {
  const checked = [];
  const selected = await findAvailablePort(3000, 10, async (port) => {
    checked.push(port);
    return port === 3002;
  });
  assert.equal(selected, 3002);
  assert.deepEqual(checked, [3000, 3001, 3002]);
});

test("local production launcher rejects invalid ports", async () => {
  await assert.rejects(() => findAvailablePort(0), /valid local port/);
  await assert.rejects(() => findAvailablePort("not-a-port"), /valid local port/);
});

test("local production launcher uses the Workers runtime for D1", async () => {
  const source = await readFile(new URL("../scripts/start-local.mjs", import.meta.url), "utf8");
  assert.match(source, /node_modules\/wrangler\/bin\/wrangler\.js/);
  assert.match(source, /spawn\(process\.execPath/);
  assert.match(source, /dist\/server\/wrangler\.json/);
  assert.match(source, /\.wrangler\/state/);
  assert.doesNotMatch(source, /spawn\([^\n]+\["start"/);
});

test("desktop launcher reuses the local backend and route tree", async () => {
  const [launcher, control, builder, packageJson, readme] = await Promise.all([
    readFile(new URL("../scripts/desktop-launcher.mjs", import.meta.url), "utf8"),
    readFile(new URL("../scripts/desktop-control.mjs", import.meta.url), "utf8"),
    readFile(new URL("../scripts/build-macos-app.mjs", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../README.md", import.meta.url), "utf8"),
  ]);

  assert.match(launcher, /scripts\/start-local\.mjs/);
  assert.match(launcher, /\/api\/health/);
  assert.match(launcher, /http:\/\/127\.0\.0\.1:\$\{port\}\//);
  assert.match(launcher, /Library\/Logs\/EventoTron/);
  assert.match(launcher, /openSync/);
  assert.match(launcher, /scripts\/desktop-control\.mjs/);
  assert.match(control, /createServer/);
  assert.match(control, /eventotron-desktop-control/);
  assert.match(control, /\/quit/);
  assert.match(control, /process\.kill\(pid, "SIGTERM"\)/);
  assert.match(builder, /appName = "EventoTron Local"/);
  assert.match(builder, /\$\{appName\}\.app/);
  assert.match(builder, /osacompile/);
  assert.match(builder, /"-l", "JavaScript"/);
  assert.match(builder, /Application\.currentApplication/);
  assert.match(builder, /nohup/);
  assert.match(builder, /desktop-launcher\.mjs/);
  assert.match(packageJson, /"desktop:mac": "node scripts\/build-macos-app\.mjs"/);
  assert.match(readme, /npm run desktop:mac/);
  assert.match(readme, /same local Workers backend/);
});

test("the local backend restarts itself instead of dying on a transient crash", async () => {
  // Wrangler watches the built output and hot-reloads. Rebuilding while the app
  // is running makes it reload against a half-written bundle and exit, which
  // previously left staff with a dead browser tab and nothing to act on.
  const source = await readFile(new URL("../scripts/start-local.mjs", import.meta.url), "utf8");
  assert.match(source, /function launchWrangler\(/, "there is no supervisor around the backend");
  assert.match(source, /setTimeout\(launchWrangler, RESTART_DELAY_MS\)/, "a crash is never retried");
  assert.match(source, /stopping/, "a deliberate stop is not distinguished from a crash");
});

test("a deliberate quit does not trigger a restart", async () => {
  // Settings > Quit App signals this process; restarting there would make the
  // app impossible to close.
  const source = await readFile(new URL("../scripts/start-local.mjs", import.meta.url), "utf8");
  assert.match(
    source,
    /process\.on\(signal, \(\) => \{\s*stopping = true;/,
    "SIGINT/SIGTERM do not mark the shutdown as deliberate",
  );
  assert.match(
    source,
    /if \(stopping\) \{[\s\S]{0,160}?return;/,
    "the exit handler restarts even after a deliberate stop",
  );
});

test("a crash loop gives up rather than restarting forever", async () => {
  const { MAX_RESTARTS, RESTART_WINDOW_MS, RESTART_DELAY_MS } = await import(
    new URL("../scripts/start-local.mjs", import.meta.url).href
  );
  assert.ok(Number.isInteger(MAX_RESTARTS) && MAX_RESTARTS > 0 && MAX_RESTARTS <= 20, "implausible restart cap");
  assert.ok(RESTART_WINDOW_MS >= 10_000, "the restart window is too short to detect a loop");
  assert.ok(RESTART_DELAY_MS >= 250, "restarting this fast would spin the CPU");

  const source = await readFile(new URL("../scripts/start-local.mjs", import.meta.url), "utf8");
  assert.match(source, /restarts\.length > MAX_RESTARTS/, "the cap is never enforced");
  assert.match(source, /will not restart again/, "giving up is not explained to the operator");
});
