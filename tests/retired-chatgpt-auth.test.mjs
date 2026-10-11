import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import test from "node:test";

test("unused unsigned ChatGPT-header authentication remains retired", async () => {
  await assert.rejects(access(new URL("../app/chatgpt-auth.ts", import.meta.url)), { code: "ENOENT" });
  async function check(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const file = new URL(entry.name + (entry.isDirectory() ? "/" : ""), directory);
      if (entry.isDirectory()) await check(file);
      else if (/\.tsx?$/.test(entry.name)) assert.doesNotMatch(await readFile(file, "utf8"), /chatgpt-auth|oai-authenticated-/i, file.pathname);
    }
  }
  await check(new URL("../app/", import.meta.url));
  assert.equal(JSON.parse(await readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8")).d1, "DB", "the active hosting binding configuration is retained");
});
