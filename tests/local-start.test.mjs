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
  assert.match(source, /node_modules\/.bin\/wrangler/);
  assert.match(source, /dist\/server\/wrangler\.json/);
  assert.match(source, /\.wrangler\/state/);
  assert.doesNotMatch(source, /spawn\([^\n]+\["start"/);
});
