import test from "node:test";
import assert from "node:assert/strict";

import { CloudflareKVService } from "../Alex/kv/cloudflare.js";
import { InMemoryKVService } from "../Alex/kv/memory.js";

test("in-memory KV supports get, put, delete, and list", async () => {
  const kv = new InMemoryKVService();

  await kv.put("config:one", { enabled: true });
  await kv.put("cache:one", "value");
  assert.deepEqual(await kv.get("config:one"), { enabled: true });
  assert.deepEqual(await kv.list({ prefix: "config:" }), { keys: [{ name: "config:one" }] });
  await kv.delete("config:one");
  assert.equal(await kv.get("config:one"), undefined);
});

test("Cloudflare KV service centralizes the binding API", async () => {
  const calls = [];
  const namespace = {
    get: async (...args) => { calls.push(["get", ...args]); return { enabled: true }; },
    put: async (...args) => { calls.push(["put", ...args]); },
    delete: async (...args) => { calls.push(["delete", ...args]); },
    list: async (...args) => { calls.push(["list", ...args]); return { keys: [] }; },
  };
  const kv = new CloudflareKVService(namespace);

  assert.deepEqual(await kv.get("config"), { enabled: true });
  await kv.put("config", { enabled: false }, { expirationTtl: 60 });
  await kv.delete("config");
  await kv.list({ prefix: "config:" });

  assert.deepEqual(calls, [
    ["get", "config", "json"],
    ["put", "config", '{"enabled":false}', { expirationTtl: 60 }],
    ["delete", "config"],
    ["list", { prefix: "config:" }],
  ]);
});