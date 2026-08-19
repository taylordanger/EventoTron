import assert from "node:assert/strict";
import test from "node:test";
import { isLocalRequest, roleSatisfies } from "../app/api/_lib/role.ts";
import { generatePkcePair } from "../app/api/_lib/oauth-state.ts";
import { decryptTokenBundle, encryptTokenBundle } from "../app/api/_lib/oauth-tokens.ts";

test("roleSatisfies ranks admin above staff", () => {
  assert.equal(roleSatisfies("admin", "admin"), true);
  assert.equal(roleSatisfies("admin", "staff"), true);
  assert.equal(roleSatisfies("staff", "staff"), true);
  assert.equal(roleSatisfies("staff", "admin"), false);
});

const LOCAL_ENV = { EVENTOTRON_LOCAL_MODE: "1" };

test("isLocalRequest recognizes local hostnames when the runtime is local", () => {
  assert.equal(isLocalRequest(new Request("http://localhost:3000/api/events"), LOCAL_ENV), true);
  assert.equal(isLocalRequest(new Request("http://127.0.0.1:3000/api/events"), LOCAL_ENV), true);
  assert.equal(isLocalRequest(new Request("http://[::1]:3000/api/events"), LOCAL_ENV), true);
  assert.equal(isLocalRequest(new Request("https://eventotron.example.com/api/events"), LOCAL_ENV), false);
});

test("a spoofed local Host cannot reach local mode on a deployment", () => {
  // The attack this guards: a deployed Worker has no EVENTOTRON_LOCAL_MODE, so
  // a caller who controls the Host header still gets nothing. Local mode used
  // to be inferred from the hostname alone, which handed out implicit admin.
  for (const env of [undefined, {}, { EVENTOTRON_LOCAL_MODE: "" }, { EVENTOTRON_LOCAL_MODE: "0" }, { EVENTOTRON_LOCAL_MODE: "true" }]) {
    for (const url of [
      "http://localhost/api/events",
      "http://localhost:3000/api/events",
      "http://127.0.0.1/api/events",
      "http://[::1]/api/events",
    ]) {
      assert.equal(
        isLocalRequest(new Request(url), env),
        false,
        `local mode leaked for env=${JSON.stringify(env)} url=${url}`,
      );
    }
  }
});

test("local mode still requires a loopback host even when enabled", () => {
  // Defence in depth: the flag alone is not enough, so a local runtime that is
  // accidentally exposed on a public hostname does not hand out admin either.
  assert.equal(isLocalRequest(new Request("https://eventotron.example.com/api/events"), LOCAL_ENV), false);
  assert.equal(isLocalRequest(new Request("https://localhost.evil.example/api/events"), LOCAL_ENV), false);
  assert.equal(isLocalRequest(new Request("https://notlocalhost/api/events"), LOCAL_ENV), false);
});

test("encryptTokenBundle/decryptTokenBundle round-trips and uses a fresh IV each time", async () => {
  const secret = "test-token-encryption-key";
  const tokens = { accessToken: "access-123", refreshToken: "refresh-456" };
  const first = await encryptTokenBundle(tokens, secret);
  const second = await encryptTokenBundle(tokens, secret);

  assert.notEqual(first.iv, second.iv, "each encryption should use a random IV");
  assert.notEqual(first.ciphertext, second.ciphertext, "ciphertext should differ when the IV differs");

  const decrypted = await decryptTokenBundle(first.ciphertext, first.iv, secret);
  assert.deepEqual(decrypted, tokens);

  await assert.rejects(() => decryptTokenBundle(first.ciphertext, first.iv, "wrong-secret"));
});

test("generatePkcePair derives the challenge as base64url(SHA-256(verifier))", async () => {
  const { verifier, challenge } = await generatePkcePair();
  assert.match(verifier, /^[A-Za-z0-9_-]+$/);
  assert.match(challenge, /^[A-Za-z0-9_-]+$/);

  const { createHash } = await import("node:crypto");
  const expected = createHash("sha256").update(verifier).digest("base64url");
  assert.equal(challenge, expected);
});

test("auth failures are written for staff, not for developers", async () => {
  const { readFile } = await import("node:fs/promises");
  const sources = await Promise.all(
    ["access-jwt.ts", "auth.ts", "users.ts"].map((f) =>
      readFile(new URL(`../app/api/_lib/${f}`, import.meta.url), "utf8"),
    ),
  );
  const messages = sources
    .flatMap((s) => [...s.matchAll(/new AuthError\(\s*\d+,\s*"([^"]+)"/g)])
    .map((m) => m[1]);

  assert.ok(messages.length >= 8, `expected to find the auth messages, found ${messages.length}`);
  for (const message of messages) {
    // Staff should never be shown the identity vendor or protocol internals.
    // "access" as an ordinary English word is fine; "Cloudflare Access" is not.
    assert.doesNotMatch(
      message,
      /Cloudflare|\bJWT\b|\btokens?\b|\bclaim\b|\bassertion\b/i,
      `leaks plumbing: "${message}"`,
    );
    // Every failure should tell the person what to do next.
    assert.match(
      message,
      /reload|sign in|ask|contact|refresh|first/i,
      `no next step offered: "${message}"`,
    );
  }
});
