import assert from "node:assert/strict";
import test from "node:test";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { verifyAccessJwt } from "../app/api/_lib/access-jwt.ts";

async function buildJwks() {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const publicJwk = await exportJWK(publicKey);
  publicJwk.kid = "test-key";
  publicJwk.alg = "RS256";
  publicJwk.use = "sig";
  return { privateKey, jwks: createLocalJWKSet({ keys: [publicJwk] }) };
}

function signToken(privateKey, { issuer, audience, email }) {
  return new SignJWT({ email })
    .setProtectedHeader({ alg: "RS256", kid: "test-key" })
    .setIssuer(issuer)
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(privateKey);
}

test("verifyAccessJwt accepts a validly signed token and lowercases the email claim", async () => {
  const { privateKey, jwks } = await buildJwks();
  const env = { CF_ACCESS_TEAM_DOMAIN: "test-team", CF_ACCESS_AUD: "test-aud" };
  const token = await signToken(privateKey, {
    issuer: `https://${env.CF_ACCESS_TEAM_DOMAIN}.cloudflareaccess.com`,
    audience: env.CF_ACCESS_AUD,
    email: "Staff@Example.com",
  });

  const request = new Request("https://eventotron.example.com/api/events", {
    headers: { "cf-access-jwt-assertion": token },
  });
  assert.equal(await verifyAccessJwt(request, env, { jwks }), "staff@example.com");
});

test("verifyAccessJwt rejects a token signed for a different Access application", async () => {
  const { privateKey, jwks } = await buildJwks();
  const env = { CF_ACCESS_TEAM_DOMAIN: "test-team", CF_ACCESS_AUD: "test-aud" };
  const token = await signToken(privateKey, {
    issuer: `https://${env.CF_ACCESS_TEAM_DOMAIN}.cloudflareaccess.com`,
    audience: "some-other-aud",
    email: "staff@example.com",
  });

  const request = new Request("https://eventotron.example.com/api/events", {
    headers: { "cf-access-jwt-assertion": token },
  });
  await assert.rejects(() => verifyAccessJwt(request, env, { jwks }), /sign-in has expired/);
});

test("verifyAccessJwt rejects a request with no Cf-Access-Jwt-Assertion header, even if the plain email header is present", async () => {
  const request = new Request("https://eventotron.example.com/api/events", {
    headers: { "cf-access-authenticated-user-email": "attacker@evil.com" },
  });
  await assert.rejects(
    () => verifyAccessJwt(request, { CF_ACCESS_TEAM_DOMAIN: "test-team", CF_ACCESS_AUD: "test-aud" }),
    /not signed in/,
  );
});

test("verifyAccessJwt refuses to run when Access isn't configured on this deployment", async () => {
  const request = new Request("https://eventotron.example.com/api/events", {
    headers: { "cf-access-jwt-assertion": "irrelevant" },
  });
  await assert.rejects(() => verifyAccessJwt(request, {}), /not set up on this server/);
});
