import test from "node:test";
import assert from "node:assert/strict";

import { InMemoryStorageService } from "../Alex/storage/memory.js";
import { R2StorageService } from "../Alex/storage/r2.js";

test("in-memory storage supports upload, download, exists, metadata, and delete", async () => {
  const storage = new InMemoryStorageService();

  await storage.upload("documents/readme.txt", "hello", {
    httpMetadata: { contentType: "text/plain" },
    customMetadata: { source: "test" },
  });
  assert.equal(await storage.exists("documents/readme.txt"), true);
  assert.equal((await storage.download("documents/readme.txt")).body, "hello");
  assert.deepEqual((await storage.metadata("documents/readme.txt")).customMetadata, { source: "test" });
  await storage.delete("documents/readme.txt");
  assert.equal(await storage.exists("documents/readme.txt"), false);
});

test("R2 storage centralizes the documented bucket API", async () => {
  const calls = [];
  const bucket = {
    put: async (...args) => { calls.push(["put", ...args]); return { key: args[0] }; },
    get: async (...args) => { calls.push(["get", ...args]); return { body: "data" }; },
    delete: async (...args) => { calls.push(["delete", ...args]); },
    head: async (...args) => { calls.push(["head", ...args]); return { key: args[0] }; },
  };
  const storage = new R2StorageService(bucket);

  await storage.upload("config/app.json", "{}", { httpMetadata: { contentType: "application/json" } });
  await storage.download("config/app.json");
  assert.equal(await storage.exists("config/app.json"), true);
  await storage.delete("config/app.json");
  assert.deepEqual(calls.map(([method, key]) => [method, key]), [
    ["put", "config/app.json"],
    ["get", "config/app.json"],
    ["head", "config/app.json"],
    ["delete", "config/app.json"],
  ]);
});

test("storage rejects unsafe object keys before calling R2", async () => {
  const bucket = { get: () => { throw new Error("should not call R2"); } };
  const storage = new R2StorageService(bucket);

  assert.throws(() => storage.download("../private.txt"), /safe relative path/);
  assert.throws(() => storage.download("/absolute.txt"), /safe relative path/);
});