import test from "node:test";
import assert from "node:assert/strict";

import {
  InMemoryAbuseProtection,
  authenticateRequest,
  authorizeRequest,
  safeErrorResponse,
  validateRequest,
  withCors,
  withSecurityHeaders,
} from "../Alex/security/index.js";

test("validates request methods and body size", () => {
  const request = new Request("https://example.test", { method: "POST", headers: { "content-length": "10" } });
  assert.equal(validateRequest(request, { methods: ["POST"], maxBodyBytes: 10 }).valid, true);
  assert.equal(validateRequest(request, { methods: ["GET"] }).valid, false);
});

test("sanitizes errors and adds security and CORS headers", async () => {
  const response = withSecurityHeaders(safeErrorResponse(500, "database password and stack trace"));
  const corsResponse = withCors(response, new Request("https://example.test", { headers: { origin: "https://app.test" } }), ["https://app.test"]);
  const body = await corsResponse.text();

  assert.equal(body.includes("database password"), false);
  assert.equal(corsResponse.headers.get("X-Content-Type-Options"), "nosniff");
  assert.equal(corsResponse.headers.get("Access-Control-Allow-Origin"), "https://app.test");
});

test("authentication and authorization middleware deny safely", async () => {
  const apiKeys = { validate: async (secret) => secret === "valid" ? { scopes: ["read"], productIds: ["product"] } : undefined };
  const unauthorized = await authenticateRequest(new Request("https://example.test"), apiKeys);
  const authenticated = await authenticateRequest(new Request("https://example.test", { headers: { authorization: "Bearer valid" } }), apiKeys);
  const authorization = { isAllowed: (identity, requirements) => identity.scopes.includes(requirements.scope) && identity.productIds.includes(requirements.productId) };

  assert.equal(unauthorized.status, 401);
  assert.equal(await unauthorized.text().then((body) => body.includes("valid")), false);
  assert.equal(authorizeRequest(authenticated.identity, authorization, { scope: "write", productId: "product" }).status, 403);
  assert.equal(authorizeRequest(authenticated.identity, authorization, { scope: "read", productId: "product" }), true);
});

test("basic abuse protection limits requests per key and resets its window", () => {
  const protection = new InMemoryAbuseProtection({ limit: 2, windowMs: 100 });

  assert.equal(protection.allow("client", 0), true);
  assert.equal(protection.allow("client", 1), true);
  assert.equal(protection.allow("client", 2), false);
  assert.equal(protection.allow("client", 101), true);
});