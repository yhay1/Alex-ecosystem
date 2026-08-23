import test from "node:test";
import assert from "node:assert/strict";

import {
  InMemoryAbuseProtection,
  protectEndpoint,
  rateLimitKey,
  verifyTurnstile,
} from "../Alex/security/index.js";

test("verifies Turnstile server-side and sends the secret only to siteverify", async () => {
  let request;
  const valid = await verifyTurnstile("token", "secret", {
    remoteip: "203.0.113.10",
    fetchImpl: async (...args) => {
      request = args;
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    },
  });

  assert.equal(valid, true);
  assert.equal(request[0], "https://challenges.cloudflare.com/turnstile/v0/siteverify");
    assert.match(String(request[1].body), /secret=secret/);
});

test("fails Turnstile verification safely on provider errors or invalid input", async () => {
  assert.equal(await verifyTurnstile("token", "secret", { fetchImpl: async () => new Response("bad", { status: 500 }) }), false);
  assert.equal(await verifyTurnstile("", "secret"), false);
  assert.equal(await verifyTurnstile("token", "secret", { fetchImpl: async () => { throw new Error("internal provider detail"); } }), false);
});

test("protects selected endpoints with a configurable limiter", async () => {
  const limiter = new InMemoryAbuseProtection({ limit: 1, windowMs: 1000 });
  const request = new Request("https://example.test/sensitive", { headers: { "CF-Connecting-IP": "client-1" } });

  assert.equal(rateLimitKey(request), "client-1");
  assert.equal(protectEndpoint(request, limiter), true);
  const blocked = protectEndpoint(request, limiter);
  assert.equal(blocked.status, 429);
  assert.equal(await blocked.text().then((body) => body.includes("stack")), false);
});