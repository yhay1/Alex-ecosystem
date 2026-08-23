import test from "node:test";
import assert from "node:assert/strict";

import { readFile } from "node:fs/promises";

import { databaseSchema } from "../Alex/database/schema.js";
import { InMemoryDatabaseService } from "../Alex/database/memory.js";
import { DataStore } from "../Alex/database/store.js";

test("database schema contains only the shared generic table", async () => {
  assert.deepEqual(databaseSchema, { version: 1, tables: ["ecosystem_records"] });

  const migration = await readFile(new URL("../Alex/database/migrations/0001_initial.sql", import.meta.url), "utf8");
  assert.match(migration, /CREATE TABLE ecosystem_records/);
  assert.match(migration, /PRIMARY KEY \(collection, id\)/);
  assert.doesNotMatch(migration, /DROP TABLE|ALTER TABLE|product/i);
});

test("data store provides generic access through the database service", async () => {
  const database = new InMemoryDatabaseService();
  const store = new DataStore(database, "records");
  const record = { value: "one" };

  assert.equal(await store.save("first", record), record);
  assert.deepEqual(await store.get("first"), record);
  assert.deepEqual(await store.list(), [record]);
  assert.equal(await store.delete("first"), true);
  assert.equal(await store.get("first"), undefined);
});

test("collections stay isolated in the shared service", async () => {
  const database = new InMemoryDatabaseService();
  const firstStore = new DataStore(database, "first");
  const secondStore = new DataStore(database, "second");

  await firstStore.save("id", { collection: "first" });

  assert.deepEqual(await secondStore.list(), []);
});