import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));

test("local environment variants are ignored while the safe example stays trackable", () => {
  for (const path of [".dev.vars", ".dev.vars.local", ".dev.vars.staging", ".env.local"]) {
    assert.equal(execFileSync("git", ["check-ignore", "--no-index", path], { cwd: root, encoding: "utf8" }).trim(), path);
  }
  assert.throws(() => execFileSync("git", ["check-ignore", "--no-index", ".dev.vars.example"], { cwd: root, stdio: "pipe" }));
});

test("tracked files must not contain runtime secrets or recognizable credential material", async () => {
  const files = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" }).split("\0").filter(Boolean);
  const secretFiles = files.filter(path => /(^|\/)\.env(?:\.|$)|(^|\/)\.dev\.vars(?:\.|$)|\.(?:pem|p12|pfx|key)$/i.test(path) && !/\.(?:example|sample)$/.test(path));
  assert.deepEqual(secretFiles, [], "Runtime secrets belong outside Git");
  // Deliberately limited signatures: this is a guardrail, not proof that every secret is absent.
  const signatures = [new RegExp(["-----BEGIN", "(?:RSA |EC |OPENSSH )?PRIVATE KEY-----"].join(" ")), /\bgh[pousr]_[A-Za-z0-9]{36,}\b/, /\bAKIA[0-9A-Z]{16}\b/, /\bsk-proj-[A-Za-z0-9_-]{40,}\b/];
  const findings = [];
  for (const path of files.filter(path => /\.(?:tsx?|m?js|json|ya?ml|md|toml|example)$/.test(path))) {
    const contents = await readFile(new URL(path, new URL("../", import.meta.url)), "utf8");
    if (signatures.some(pattern => pattern.test(contents))) findings.push(path);
  }
  assert.deepEqual(findings, [], "Possible credential material detected; values are deliberately not printed");
});
