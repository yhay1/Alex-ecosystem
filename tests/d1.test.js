import test from "node:test";
import assert from "node:assert/strict";

import { D1DatabaseService } from "../Alex/database/d1.js";

test("D1 service health checks the documented database query API", async () => {
  const calls = [];
  const database = {
    prepare(query) {
      calls.push(query);
      return { first: async () => ({ ok: 1 }) };
    },
  };

  assert.equal(await new D1DatabaseService(database).health(), true);
  assert.deepEqual(calls, ["SELECT 1 AS ok"]);
});

test("D1 service keeps generic store operations behind the service interface", async () => {
  const database = {
    prepare(query) {
      assert.match(query, /^SELECT value FROM ecosystem_records/);
      return {
        bind: () => ({ first: async () => ({ value: '{"value":"stored"}' }) }),
      };
    },
  };

  assert.deepEqual(await new D1DatabaseService(database).get("records", "id"), { value: "stored" });
});