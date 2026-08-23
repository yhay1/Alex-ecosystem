import test from "node:test";
import assert from "node:assert/strict";

import { ApiKeyService, AuthorizationService } from "../Alex/auth/index.js";
import { InMemoryDatabaseService } from "../Alex/database/memory.js";

test("creates and validates API keys without persisting the raw secret", async () => {
  const database = new InMemoryDatabaseService();
  const apiKeys = new ApiKeyService(database);
  const created = await apiKeys.create({
    name: "automation",
    scopes: ["records:read"],
    productIds: ["example-product"],
  });

  assert.match(created.secret, /^ak_[^.]+\./);
  assert.deepEqual(await apiKeys.validate(created.secret), {
    id: created.id,
    name: "automation",
    scopes: ["records:read"],
    productIds: ["example-product"],
    createdAt: created.createdAt,
    expiresAt: null,
    revokedAt: null,
  });
  assert.equal((await database.list("auth_api_keys"))[0].secretHash.includes(created.secret), false);
});

test("enforces API key expiration and revocation", async () => {
  const apiKeys = new ApiKeyService(new InMemoryDatabaseService());
  const expired = await apiKeys.create({ name: "expired", scopes: ["read"], productIds: ["product"], expiresAt: "2000-01-01T00:00:00.000Z" });
  const active = await apiKeys.create({ name: "active", scopes: ["read"], productIds: ["product"] });

  assert.equal(await apiKeys.validate(expired.secret), undefined);
  assert.equal(await apiKeys.revoke(active.id), true);
  assert.equal(await apiKeys.validate(active.secret), undefined);
});

test("checks both scope and product access through the shared authorization service", async () => {
  const authorization = new AuthorizationService();
  const apiKey = { scopes: ["records:read"], productIds: ["product-a"] };

  assert.equal(authorization.isAllowed(apiKey, { scope: "records:read", productId: "product-a" }), true);
  assert.equal(authorization.isAllowed(apiKey, { scope: "records:write", productId: "product-a" }), false);
  assert.equal(authorization.isAllowed(apiKey, { scope: "records:read", productId: "product-b" }), false);
});

test("rejects malformed API key options and secrets", async () => {
  const apiKeys = new ApiKeyService(new InMemoryDatabaseService());

  await assert.rejects(() => apiKeys.create({ name: "key", scopes: [], productIds: [] }), /scopes/);
  assert.equal(await apiKeys.validate("raw-secret"), undefined);
});